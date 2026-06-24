import { Injectable, OnDestroy } from '@angular/core';
import { Subject, takeUntil, filter, combineLatest } from 'rxjs';
import { WebSocketService }  from './websocket.service';
import { PortfolioService }  from './portfolio.service';
import {
  tickCache, activeAlerts, addNotification, wsConnected
} from '../signals/market.store';
import type { PriceAlert } from '../models/crypto.model';
import type { Tick } from '../models/stock.model';

@Injectable({ providedIn: 'root' })
export class AlertService implements OnDestroy {
  private destroy$ = new Subject<void>();
  private triggeredIds = new Set<string>();

  constructor(
    private ws: WebSocketService,
    private ps: PortfolioService,
  ) {
    this.init();
  }

  private init() {
    // Load alerts on startup
    this.ps.getAlerts().pipe(takeUntil(this.destroy$)).subscribe();

    // Monitor ticks against active alerts
    this.ws.tick$.pipe(
      takeUntil(this.destroy$),
    ).subscribe(tick => this.checkAlerts(tick as Tick));
  }

  private checkAlerts(tick: Tick) {
    const alerts = activeAlerts().filter(a =>
      a.isActive && !a.isTriggered &&
      a.symbol.toUpperCase() === tick.symbol.toUpperCase() &&
      !this.triggeredIds.has(a.id)
    );

    for (const alert of alerts) {
      if (this.evaluateCondition(alert, tick.price)) {
        this.triggerAlert(alert, tick.price);
      }
    }
  }

  private evaluateCondition(alert: PriceAlert, currentPrice: number): boolean {
    const target = alert.targetPrice;

    switch (alert.condition) {
      case 'ABOVE':      return currentPrice >= target;
      case 'BELOW':      return currentPrice <= target;
      case 'CROSSES_UP':
        return (alert.currentPrice ?? 0) < target && currentPrice >= target;
      case 'CROSSES_DOWN':
        return (alert.currentPrice ?? 0) > target && currentPrice <= target;
      case 'PERCENT_UP': {
        const prevClose = alert.currentPrice ?? currentPrice;
        return prevClose > 0 && ((currentPrice - prevClose) / prevClose * 100) >= target;
      }
      case 'PERCENT_DOWN': {
        const prevClose = alert.currentPrice ?? currentPrice;
        return prevClose > 0 && ((prevClose - currentPrice) / prevClose * 100) >= target;
      }
      default: return false;
    }
  }

  private triggerAlert(alert: PriceAlert, price: number) {
    this.triggeredIds.add(alert.id);

    const conditionText = this.getConditionText(alert);
    const message = alert.message
      ?? `! ${alert.symbol} ${conditionText} $${price.toFixed(4)}`;

    addNotification('alert', message);

    // Play sound if supported
    this.playAlertSound();

    // Browser notification if permitted
    this.sendBrowserNotification(alert.symbol, message);

    console.log(`[AlertService] Alert triggered: ${message}`);
  }

  private getConditionText(alert: PriceAlert): string {
    switch (alert.condition) {
      case 'ABOVE':        return `exceeded $${alert.targetPrice}`;
      case 'BELOW':        return `fell below $${alert.targetPrice}`;
      case 'CROSSES_UP':   return `crossed up through $${alert.targetPrice}`;
      case 'CROSSES_DOWN': return `crossed down through $${alert.targetPrice}`;
      case 'PERCENT_UP':   return `rose ${alert.targetPrice}%`;
      case 'PERCENT_DOWN': return `fell ${alert.targetPrice}%`;
      default:             return `hit target $${alert.targetPrice}`;
    }
  }

  private playAlertSound() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch {}
  }

  private async sendBrowserNotification(symbol: string, message: string) {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    if (Notification.permission === 'granted') {
      const n = new Notification(`Bloomberg Alert: ${symbol}`, {
        body:  message,
        icon:  '/favicon.ico',
        badge: '/favicon.ico',
        tag:   `alert-${symbol}`,
        requireInteraction: false,
        silent: false,
      });
      setTimeout(() => n.close(), 8000);
    }
  }

  async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
