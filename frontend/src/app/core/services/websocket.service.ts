import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { Subject, BehaviorSubject, Observable, timer, EMPTY } from 'rxjs';
import { filter, share, tap, switchMap, catchError, retryWhen, delay } from 'rxjs/operators';
import type { WsMessage, Tick } from '../models/crypto.model';
import {
  wsConnected, wsLatency, applyTick, addNotification,
  marketStatus
} from '../signals/market.store';

const WS_URL        = 'ws://localhost:3000/ws';
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {
  private socket: WebSocket | null = null;
  private messages$   = new Subject<WsMessage>();
  private connected$  = new BehaviorSubject<boolean>(false);
  private reconnectCount = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private pingTimer?:  ReturnType<typeof setInterval>;
  private pingStartTs: number = 0;
  private subscriptions = new Map<string, Set<string>>(); // type → symbols

  readonly message$    = this.messages$.asObservable().pipe(share());
  readonly tick$: Observable<Tick> = this.message$.pipe(
    filter((m): m is Extract<WsMessage, { type: 'tick' }> => m.type === 'tick'),
    tap(tick => applyTick(tick as Tick)),
    share(),
  );
  readonly isConnected$ = this.connected$.asObservable();

  constructor(private zone: NgZone) {
    this.connect();
  }

  connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return;

    this.socket = new WebSocket(WS_URL);

    this.socket.onopen = () => {
      this.zone.run(() => {
        this.reconnectCount = 0;
        this.connected$.next(true);
        wsConnected.set(true);
        console.log('[WS] Connected to Bloomberg Tracker');

        // Re-subscribe to all previously subscribed symbols
        for (const [type, symbols] of this.subscriptions) {
          if (symbols.size > 0) {
            this.send({ action: 'subscribe', type: type as any, symbols: Array.from(symbols) });
          }
        }

        // Start ping/pong latency tracking
        this.pingTimer = setInterval(() => {
          this.pingStartTs = Date.now();
          this.send({ type: 'pong', timestamp: this.pingStartTs } as any);
        }, 30000);
      });
    };

    this.socket.onmessage = (ev) => {
      this.zone.run(() => {
        try {
          const msg: WsMessage = JSON.parse(ev.data);
          this.handleMessage(msg);
        } catch (e) {
          console.warn('[WS] Failed to parse message:', ev.data);
        }
      });
    };

    this.socket.onclose = (ev) => {
      this.zone.run(() => {
        this.connected$.next(false);
        wsConnected.set(false);
        clearInterval(this.pingTimer);
        console.log(`[WS] Disconnected (${ev.code}). Scheduling reconnect...`);
        this.scheduleReconnect();
      });
    };

    this.socket.onerror = () => {
      console.error('[WS] Connection error');
      this.socket?.close();
    };
  }

  private handleMessage(msg: WsMessage) {
    this.messages$.next(msg);

    switch (msg.type) {
      case 'ping':
        // Respond to server ping
        this.send({ type: 'pong', timestamp: Date.now() } as any);
        break;
      case 'pong':
        if (this.pingStartTs) {
          wsLatency.set(Date.now() - this.pingStartTs);
          this.pingStartTs = 0;
        }
        break;
      case 'alert':
        addNotification('alert', `! Alert: ${(msg as any).symbol} hit $${(msg as any).price}`);
        break;
      case 'news':
        addNotification('news', `N ${(msg as any).headline}`);
        break;
    }
  }

  subscribe(type: 'stock' | 'crypto' | 'orderbook' | 'portfolio', symbols: string[]) {
    if (!this.subscriptions.has(type)) {
      this.subscriptions.set(type, new Set());
    }
    const set = this.subscriptions.get(type)!;
    const newSyms = symbols.filter(s => !set.has(s));
    if (newSyms.length === 0) return;
    newSyms.forEach(s => set.add(s));
    this.send({ action: 'subscribe', type, symbols: newSyms });
  }

  unsubscribe(type: 'stock' | 'crypto' | 'orderbook' | 'portfolio', symbols: string[]) {
    const set = this.subscriptions.get(type);
    if (set) symbols.forEach(s => set.delete(s));
    this.send({ action: 'unsubscribe', type, symbols });
  }

  subscribeStock(symbols: string[])  { this.subscribe('stock',  symbols.map(s => s.toUpperCase())); }
  subscribeCrypto(symbols: string[]) { this.subscribe('crypto', symbols.map(s => s.toUpperCase())); }

  watchSymbol(symbol: string, assetType: 'STOCK' | 'CRYPTO'): Observable<Tick> {
    const sym = symbol.toUpperCase();
    if (assetType === 'STOCK')  this.subscribeStock([sym]);
    else this.subscribeCrypto([sym]);

    return this.tick$.pipe(
      filter(t => t.symbol === sym && t.assetType === assetType),
    );
  }

  private send(data: object) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  private scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const delayMs = RECONNECT_DELAYS[Math.min(this.reconnectCount, RECONNECT_DELAYS.length - 1)];
    this.reconnectCount++;
    console.log(`[WS] Reconnecting in ${delayMs}ms (attempt ${this.reconnectCount})...`);
    this.reconnectTimer = setTimeout(() => this.connect(), delayMs);
  }

  getMessages<T extends WsMessage['type']>(type: T): Observable<Extract<WsMessage, { type: T }>> {
    return this.message$.pipe(
      filter((m): m is Extract<WsMessage, { type: T }> => m.type === type),
    ) as Observable<Extract<WsMessage, { type: T }>>;
  }

  ngOnDestroy() {
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    this.socket?.close();
    this.messages$.complete();
  }
}
