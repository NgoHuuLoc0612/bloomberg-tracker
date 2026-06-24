import { CronJob } from 'cron';
import { prisma }       from '../db/prisma.client.js';
import { redisClient, redisPublisher, cacheKey, REDIS_CHANNELS } from '../config/redis.js';
import { finnhubService } from './finnhub.service.js';

export class AlertCheckerService {
  private job: CronJob;

  constructor() {
    // Check every 30 seconds during market hours
    this.job = new CronJob('*/30 * * * * *', () => this.runCheck(), null, false, 'America/New_York');
  }

  start() {
    this.job.start();
    console.log('[AlertChecker] Started — checking every 30s');
  }

  stop() {
    this.job.stop();
  }

  private async runCheck() {
    try {
      const alerts = await prisma.priceAlert.findMany({
        where: { isActive: true, isTriggered: false },
        include: { user: { select: { id: true } } },
      });

      if (!alerts.length) return;

      // Group by symbol to minimize API calls
      const symbolGroups = new Map<string, typeof alerts>();
      for (const alert of alerts) {
        const sym = alert.symbol.toUpperCase();
        if (!symbolGroups.has(sym)) symbolGroups.set(sym, []);
        symbolGroups.get(sym)!.push(alert);
      }

      // Check each symbol
      for (const [symbol, symbolAlerts] of symbolGroups) {
        try {
          // Try cache first
          const cached = await redisClient.get(cacheKey.quote(symbol));
          let currentPrice: number | null = null;

          if (cached) {
            const parsed = JSON.parse(cached);
            currentPrice = parsed?.price ?? null;
          } else if (symbolAlerts[0].assetType === 'STOCK') {
            const quote = await finnhubService.getQuote(symbol);
            currentPrice = quote?.price ?? null;
          }

          if (currentPrice === null) continue;

          // Evaluate each alert for this symbol
          for (const alert of symbolAlerts) {
            const triggered = this.evaluate(alert, currentPrice);
            if (triggered) {
              await this.triggerAlert(alert, currentPrice);
            }
          }
        } catch (err: any) {
          console.error(`[AlertChecker] Error checking ${symbol}:`, err.message);
        }
      }
    } catch (err: any) {
      console.error('[AlertChecker] Check error:', err.message);
    }
  }

  private evaluate(alert: any, price: number): boolean {
    const target = Number(alert.targetPrice);
    const prev   = Number(alert.currentPrice ?? price);

    switch (alert.condition) {
      case 'ABOVE':        return price >= target;
      case 'BELOW':        return price <= target;
      case 'CROSSES_UP':   return prev < target && price >= target;
      case 'CROSSES_DOWN': return prev > target && price <= target;
      case 'PERCENT_UP':   return prev > 0 && ((price - prev) / prev * 100) >= target;
      case 'PERCENT_DOWN': return prev > 0 && ((prev - price) / prev * 100) >= target;
      default:             return false;
    }
  }

  private async triggerAlert(alert: any, price: number) {
    // Mark as triggered
    await prisma.priceAlert.update({
      where: { id: alert.id },
      data:  {
        isTriggered:  true,
        triggeredAt:  new Date(),
        currentPrice: price,
      },
    });

    // Publish to Redis for WebSocket distribution
    const payload = {
      type:      'alert',
      alertId:   alert.id,
      userId:    alert.userId,
      symbol:    alert.symbol,
      condition: alert.condition,
      target:    Number(alert.targetPrice),
      price,
      message:   alert.message ?? `${alert.symbol} hit $${price.toFixed(4)} (condition: ${alert.condition} $${alert.targetPrice})`,
      timestamp: Date.now(),
    };

    await redisPublisher.publish(REDIS_CHANNELS.ALERT_TRIGGERED, JSON.stringify(payload));
    console.log(`[AlertChecker] ✅ Alert triggered: ${alert.symbol} ${alert.condition} $${alert.targetPrice} @ $${price}`);
  }
}

export const alertChecker = new AlertCheckerService();
