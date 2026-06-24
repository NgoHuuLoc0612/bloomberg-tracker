import WebSocket from 'ws';
import { env } from '../config/env.js';
import { redisPublisher, REDIS_CHANNELS } from '../config/redis.js';
import type { WsManager } from './ws.manager.js';

interface BinanceTrade {
  e: string;  // Event type: 'aggTrade' | 'trade'
  E: number;  // Event time
  s: string;  // Symbol
  p: string;  // Price
  q: string;  // Quantity
  T: number;  // Trade time
  m: boolean; // Is buyer market maker
}

interface BinanceMiniTicker {
  e: string;  // Event type: '24hrMiniTicker'
  E: number;  // Event time
  s: string;  // Symbol
  c: string;  // Close price
  o: string;  // Open price
  h: string;  // High price
  l: string;  // Low price
  v: string;  // Total traded base asset volume
  q: string;  // Total traded quote asset volume
}

// Default crypto symbols (Binance USDT pairs)
const DEFAULT_CRYPTO_STREAMS = [
  'btcusdt', 'ethusdt', 'bnbusdt', 'xrpusdt', 'adausdt',
  'solusdt', 'dotusdt', 'avaxusdt', 'maticusdt', 'linkusdt',
  'uniusdt', 'ltcusdt', 'atomusdt', 'nearusdt', 'algosudt',
  'xlmusdt', 'vetusdt', 'sandusdt', 'manausdt', 'axsusdt',
  'dogeusdt', 'shibusdt', 'aptusdt', 'suiusdt', 'pepeusdt',
];

export class BinanceWsClient {
  private ws: WebSocket | null = null;
  private subscribedStreams = new Set<string>(DEFAULT_CRYPTO_STREAMS);
  private reconnectDelay = 1000;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private lastPrices    = new Map<string, number>();
  private open24h       = new Map<string, number>();

  // Batching
  private pendingTicks  = new Map<string, object>();
  private batchTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly wsManager: WsManager) {
    wsManager.onCryptoSubscribe   = (symbols) => this.addStreams(symbols);
    wsManager.onCryptoUnsubscribe = (symbols) => this.removeStreams(symbols);
  }

  async connect(): Promise<void> {
    // Use combined stream for efficiency
    const streams = Array.from(this.subscribedStreams).map(s => `${s.toLowerCase()}@miniTicker`);
    const url     = `${env.BINANCE_WSS}/stream?streams=${streams.join('/')}`;

    console.log(`[BinanceWS] Connecting to ${this.subscribedStreams.size} streams...`);
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.reconnectDelay = 1000;
      console.log('[BinanceWS] ✅ Connected');
      this.startBatchTimer();
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const envelope: { data?: BinanceMiniTicker } = JSON.parse(raw.toString());
        const data = envelope?.data;
        if (!data || data.e !== '24hrMiniTicker') return;
        this.processMiniTicker(data);
      } catch (e) {
        console.error('[BinanceWS] Parse error:', e);
      }
    });

    this.ws.on('close', (code) => {
      clearTimeout(this.batchTimer);
      this.ws = null;
      console.log(`[BinanceWS] Disconnected (${code}). Reconnecting in ${this.reconnectDelay}ms...`);
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[BinanceWS] Error:', err.message);
    });
  }

  private processMiniTicker(data: BinanceMiniTicker) {
    const symbol  = data.s.toUpperCase();            // e.g. BTCUSDT
    const current = parseFloat(data.c);
    const open    = parseFloat(data.o);
    const high    = parseFloat(data.h);
    const low     = parseFloat(data.l);
    const volume  = parseFloat(data.v);
    const change  = current - open;
    const pct     = open > 0 ? (change / open) * 100 : 0;

    this.lastPrices.set(symbol, current);
    this.open24h.set(symbol, open);

    // Batch ticks to avoid flooding WebSocket clients
    this.pendingTicks.set(symbol, {
      type:      'tick',
      assetType: 'CRYPTO',
      symbol,
      price:     current,
      change:    parseFloat(change.toFixed(8)),
      changePct: parseFloat(pct.toFixed(4)),
      high24h:   high,
      low24h:    low,
      volume,
      timestamp: data.E,
    });
  }

  private startBatchTimer() {
    this.batchTimer = setInterval(() => {
      if (this.pendingTicks.size === 0) return;

      for (const [symbol, tick] of this.pendingTicks) {
        redisPublisher.publish(REDIS_CHANNELS.CRYPTO_TICK, JSON.stringify(tick));
        this.wsManager.broadcastTick(tick as any);
      }

      this.pendingTicks.clear();
    }, 500); // Flush every 500ms
  }

  addStreams(symbols: string[]) {
    const newStreams: string[] = [];
    for (const sym of symbols) {
      const stream = sym.toLowerCase().replace('/', '') + 'usdt';
      if (!this.subscribedStreams.has(stream)) {
        this.subscribedStreams.add(stream);
        newStreams.push(stream);
      }
    }
    if (newStreams.length > 0) {
      // Subscribe via WebSocket API (Binance supports live subscribe)
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          method: 'SUBSCRIBE',
          params: newStreams.map(s => `${s}@miniTicker`),
          id:     Date.now(),
        }));
      } else {
        this.reconnect();
      }
    }
  }

  removeStreams(symbols: string[]) {
    const removedStreams: string[] = [];
    for (const sym of symbols) {
      const stream = sym.toLowerCase().replace('/', '') + 'usdt';
      if (this.subscribedStreams.has(stream)) {
        this.subscribedStreams.delete(stream);
        removedStreams.push(stream);
      }
    }
    if (removedStreams.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        method: 'UNSUBSCRIBE',
        params: removedStreams.map(s => `${s}@miniTicker`),
        id:     Date.now(),
      }));
    }
  }

  private reconnect() {
    this.ws?.close();
    this.ws = null;
    this.connect();
  }

  private scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
      this.connect();
    }, this.reconnectDelay);
  }

  getOrderBook(symbol: string): Promise<{
    bids: Array<[number, number]>;
    asks: Array<[number, number]>;
    lastUpdateId: number;
  }> {
    return fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol.toUpperCase()}&limit=20`)
      .then(r => r.json() as Promise<any>)
      .then((data: any) => ({
        bids:         (data.bids as string[][]).map(([p, q]) => [parseFloat(p), parseFloat(q)]),
        asks:         (data.asks as string[][]).map(([p, q]) => [parseFloat(p), parseFloat(q)]),
        lastUpdateId: data.lastUpdateId as number,
      }));
  }

  getStatus() {
    return {
      connected:   this.ws?.readyState === WebSocket.OPEN,
      streams:     Array.from(this.subscribedStreams),
      streamCount: this.subscribedStreams.size,
    };
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.batchTimer);
    this.ws?.close();
    this.ws = null;
  }
}
