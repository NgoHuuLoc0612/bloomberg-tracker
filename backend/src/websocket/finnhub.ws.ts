import WebSocket from 'ws';
import { env } from '../config/env.js';
import { redisPublisher, REDIS_CHANNELS } from '../config/redis.js';
import type { WsManager } from './ws.manager.js';

interface FinnhubTrade {
  p: number;  // Price
  s: string;  // Symbol
  t: number;  // Timestamp (ms)
  v: number;  // Volume
}

interface FinnhubWsMessage {
  data: FinnhubTrade[];
  type: 'trade' | 'ping' | 'subscribe';
}

// Track last prices to compute change
const lastPrices = new Map<string, number>();
const previousClose = new Map<string, number>();

// Default stock symbols to track immediately on connect
const DEFAULT_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
  'NFLX', 'AMD', 'INTC', 'JPM', 'BAC', 'GS', 'MS', 'WMT',
  'DIS', 'V', 'MA', 'PYPL', 'CRM', 'ORCL', 'IBM', 'UBER',
  'COIN', 'PLTR', 'SOFI', 'RBLX', 'HOOD', 'SPY', 'QQQ',
];

export class FinnhubWsClient {
  private ws: WebSocket | null = null;
  private subscribedSymbols = new Set<string>(DEFAULT_SYMBOLS);
  private pendingSubscriptions: string[] = [];
  private reconnectDelay = 1000;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private isConnecting = false;
  private pingTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly apiKey: string,
    private readonly wsManager: WsManager,
  ) {
    // Register handlers on WsManager
    wsManager.onStockSubscribe   = (symbols) => this.subscribeSymbols(symbols);
    wsManager.onStockUnsubscribe = (symbols) => this.unsubscribeSymbols(symbols);
  }

  async connect(): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) return;
    this.isConnecting = true;

    const url = `${env.FINNHUB_WSS}?token=${this.apiKey}`;
    console.log('[FinnhubWS] Connecting...');

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.isConnecting = false;
      this.reconnectDelay = 1000;
      console.log(`[FinnhubWS] ✅ Connected`);

      // Subscribe to all tracked symbols
      for (const sym of this.subscribedSymbols) {
        this.sendSubscribe(sym);
      }

      // Process any pending subscriptions
      for (const sym of this.pendingSubscriptions) {
        this.sendSubscribe(sym);
      }
      this.pendingSubscriptions = [];

      // Keep-alive ping
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }, 20_000);
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg: FinnhubWsMessage = JSON.parse(raw.toString());
        if (msg.type === 'trade' && msg.data?.length) {
          this.processTrades(msg.data);
        }
      } catch (e) {
        console.error('[FinnhubWS] Parse error:', e);
      }
    });

    this.ws.on('close', (code, reason) => {
      clearInterval(this.pingTimer);
      this.ws = null;
      this.isConnecting = false;
      console.log(`[FinnhubWS] Disconnected (${code}: ${reason?.toString()}). Reconnecting in ${this.reconnectDelay}ms...`);
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[FinnhubWS] Error:', err.message);
    });
  }

  private processTrades(trades: FinnhubTrade[]) {
    // Aggregate multiple trades for the same symbol
    const aggregated = new Map<string, { price: number; volume: number; timestamp: number }>();

    for (const trade of trades) {
      const sym = trade.s.toUpperCase();
      const existing = aggregated.get(sym);
      if (!existing || trade.t > existing.timestamp) {
        aggregated.set(sym, { price: trade.p, volume: trade.v, timestamp: trade.t });
      }
    }

    for (const [symbol, data] of aggregated) {
      const prevPrice  = lastPrices.get(symbol);
      const prevClose  = previousClose.get(symbol);
      const change     = prevClose ? data.price - prevClose : (prevPrice ? data.price - prevPrice : 0);
      const changePct  = prevClose ? (change / prevClose) * 100 : 0;

      lastPrices.set(symbol, data.price);

      const tick = {
        type:       'tick',
        assetType:  'STOCK',
        symbol,
        price:      data.price,
        change:     parseFloat(change.toFixed(4)),
        changePct:  parseFloat(changePct.toFixed(4)),
        volume:     data.volume,
        timestamp:  data.timestamp,
      };

      // Publish to Redis (for horizontal scaling) AND broadcast directly
      redisPublisher.publish(REDIS_CHANNELS.STOCK_TICK, JSON.stringify(tick));
      this.wsManager.broadcastTick(tick as any);
    }
  }

  subscribeSymbols(symbols: string[]) {
    for (const sym of symbols) {
      const upper = sym.toUpperCase();
      this.subscribedSymbols.add(upper);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendSubscribe(upper);
      } else {
        this.pendingSubscriptions.push(upper);
      }
    }
  }

  unsubscribeSymbols(symbols: string[]) {
    for (const sym of symbols) {
      const upper = sym.toUpperCase();
      this.subscribedSymbols.delete(upper);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol: upper }));
      }
    }
  }

  setPreviousClose(symbol: string, price: number) {
    previousClose.set(symbol.toUpperCase(), price);
  }

  private sendSubscribe(symbol: string) {
    this.ws?.send(JSON.stringify({ type: 'subscribe', symbol }));
  }

  private scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
      this.connect();
    }, this.reconnectDelay);
  }

  getStatus() {
    return {
      connected:  this.ws?.readyState === WebSocket.OPEN,
      symbols:    Array.from(this.subscribedSymbols),
      symbolCount:this.subscribedSymbols.size,
    };
  }

  disconnect() {
    clearInterval(this.pingTimer);
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
