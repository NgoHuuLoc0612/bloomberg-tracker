import type { WebSocket } from 'ws';
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FastifyRequest } from 'fastify';
import type Redis from 'ioredis';
import { REDIS_CHANNELS, redisSubscriber } from '../config/redis.js';
import { WsSubscribeSchema, type WsTick } from '../schemas/zod.schemas.js';

interface ClientState {
  socket:          WebSocket;
  id:              string;
  stockSymbols:    Set<string>;
  cryptoSymbols:   Set<string>;
  portfolioIds:    Set<string>;
  orderbookSymbols:Set<string>;
  connectedAt:     Date;
  pingInterval?:   ReturnType<typeof setTimeout>;
}

interface SymbolSubscribers {
  clients: Set<string>;
}

export class WsManager {
  private clients     = new Map<string, ClientState>();
  private stockSubs   = new Map<string, SymbolSubscribers>();
  private cryptoSubs  = new Map<string, SymbolSubscribers>();
  private clientCount = 0;

  // Callbacks for external WS clients to subscribe/unsubscribe from data feeds
  public onStockSubscribe?:   (symbols: string[]) => void;
  public onStockUnsubscribe?: (symbols: string[]) => void;
  public onCryptoSubscribe?:  (symbols: string[]) => void;
  public onCryptoUnsubscribe?:(symbols: string[]) => void;

  constructor(private readonly redis: import('ioredis').Redis) {
    this.setupRedisSub();
  }

  private setupRedisSub() {
    redisSubscriber.subscribe(
      REDIS_CHANNELS.STOCK_TICK,
      REDIS_CHANNELS.CRYPTO_TICK,
      REDIS_CHANNELS.PORTFOLIO_UPDATE,
      REDIS_CHANNELS.ALERT_TRIGGERED,
      REDIS_CHANNELS.NEWS,
    );

    redisSubscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        switch (channel) {
          case REDIS_CHANNELS.STOCK_TICK:
            this.broadcastToStockSubscribers(data.symbol, { type: 'tick', assetType: 'STOCK', ...data });
            break;
          case REDIS_CHANNELS.CRYPTO_TICK:
            this.broadcastToCryptoSubscribers(data.symbol, { type: 'tick', assetType: 'CRYPTO', ...data });
            break;
          case REDIS_CHANNELS.PORTFOLIO_UPDATE:
            this.broadcastToPortfolio(data.portfolioId, { type: 'portfolio', ...data });
            break;
          case REDIS_CHANNELS.ALERT_TRIGGERED:
            this.broadcastToUser(data.userId, { type: 'alert', ...data });
            break;
          case REDIS_CHANNELS.NEWS:
            this.broadcastAll({ type: 'news', ...data });
            break;
        }
      } catch (e) {
        console.error('[WsManager] Redis message parse error:', e);
      }
    });
  }

  addClient(socket: WebSocket, req: FastifyRequest): string {
    const id = `client_${++this.clientCount}_${Date.now()}`;
    const state: ClientState = {
      socket,
      id,
      stockSymbols:     new Set(),
      cryptoSymbols:    new Set(),
      portfolioIds:     new Set(),
      orderbookSymbols: new Set(),
      connectedAt:      new Date(),
    };

    // Ping/pong heartbeat
    state.pingInterval = setInterval(() => {
      if (socket.readyState === socket.OPEN) {
        socket.ping();
        socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, 25_000);

    socket.on('message', (raw) => this.handleMessage(id, raw.toString()));
    socket.on('close', () => this.removeClient(id));
    socket.on('error', (err) => {
      console.error(`[WsManager] Client ${id} error:`, err.message);
      this.removeClient(id);
    });

    this.clients.set(id, state);

    // Send welcome + market status
    this.send(id, {
      type:      'connected',
      clientId:  id,
      timestamp: Date.now(),
      message:   'Bloomberg Tracker WebSocket connected',
    });

    console.log(`[WsManager] Client ${id} connected. Total: ${this.clients.size}`);
    return id;
  }

  private handleMessage(clientId: string, raw: string) {
    try {
      const msg = JSON.parse(raw);

      // Handle pong
      if (msg.type === 'pong') return;

      // Handle subscriptions
      const parsed = WsSubscribeSchema.safeParse(msg);
      if (!parsed.success) {
        this.send(clientId, { type: 'error', message: 'Invalid message format', errors: parsed.error.flatten() });
        return;
      }

      const { action, type, symbols } = parsed.data;
      const normalizedSymbols = symbols.map(s => s.toUpperCase());

      if (action === 'subscribe') {
        this.subscribe(clientId, type, normalizedSymbols);
      } else {
        this.unsubscribe(clientId, type, normalizedSymbols);
      }
    } catch {
      this.send(clientId, { type: 'error', message: 'Invalid JSON' });
    }
  }

  private subscribe(clientId: string, type: string, symbols: string[]) {
    const state = this.clients.get(clientId);
    if (!state) return;

    const newSymbols: string[] = [];

    for (const sym of symbols) {
      if (type === 'stock') {
        state.stockSymbols.add(sym);
        if (!this.stockSubs.has(sym)) {
          this.stockSubs.set(sym, { clients: new Set() });
          newSymbols.push(sym);
        }
        this.stockSubs.get(sym)!.clients.add(clientId);
      } else if (type === 'crypto') {
        state.cryptoSymbols.add(sym);
        if (!this.cryptoSubs.has(sym)) {
          this.cryptoSubs.set(sym, { clients: new Set() });
          newSymbols.push(sym);
        }
        this.cryptoSubs.get(sym)!.clients.add(clientId);
      } else if (type === 'portfolio') {
        state.portfolioIds.add(sym);
      }
    }

    // Notify external feeds
    if (type === 'stock' && newSymbols.length > 0) {
      this.onStockSubscribe?.(newSymbols);
    } else if (type === 'crypto' && newSymbols.length > 0) {
      this.onCryptoSubscribe?.(newSymbols);
    }

    this.send(clientId, { type: 'subscribed', assetType: type, symbols, timestamp: Date.now() });
  }

  private unsubscribe(clientId: string, type: string, symbols: string[]) {
    const state = this.clients.get(clientId);
    if (!state) return;

    const orphanedSymbols: string[] = [];

    for (const sym of symbols) {
      if (type === 'stock') {
        state.stockSymbols.delete(sym);
        const sub = this.stockSubs.get(sym);
        if (sub) {
          sub.clients.delete(clientId);
          if (sub.clients.size === 0) {
            this.stockSubs.delete(sym);
            orphanedSymbols.push(sym);
          }
        }
      } else if (type === 'crypto') {
        state.cryptoSymbols.delete(sym);
        const sub = this.cryptoSubs.get(sym);
        if (sub) {
          sub.clients.delete(clientId);
          if (sub.clients.size === 0) {
            this.cryptoSubs.delete(sym);
            orphanedSymbols.push(sym);
          }
        }
      }
    }

    if (type === 'stock' && orphanedSymbols.length > 0) {
      this.onStockUnsubscribe?.(orphanedSymbols);
    } else if (type === 'crypto' && orphanedSymbols.length > 0) {
      this.onCryptoUnsubscribe?.(orphanedSymbols);
    }
  }

  removeClient(clientId: string) {
    const state = this.clients.get(clientId);
    if (!state) return;

    clearInterval(state.pingInterval);

    // Clean up stock subscriptions
    for (const sym of state.stockSymbols) {
      const sub = this.stockSubs.get(sym);
      if (sub) {
        sub.clients.delete(clientId);
        if (sub.clients.size === 0) {
          this.stockSubs.delete(sym);
          this.onStockUnsubscribe?.([sym]);
        }
      }
    }

    // Clean up crypto subscriptions
    for (const sym of state.cryptoSymbols) {
      const sub = this.cryptoSubs.get(sym);
      if (sub) {
        sub.clients.delete(clientId);
        if (sub.clients.size === 0) {
          this.cryptoSubs.delete(sym);
          this.onCryptoUnsubscribe?.([sym]);
        }
      }
    }

    this.clients.delete(clientId);
    console.log(`[WsManager] Client ${clientId} disconnected. Total: ${this.clients.size}`);
  }

  // ─── Broadcast helpers ────────────────────────────────────────────────────
  broadcastToStockSubscribers(symbol: string, data: object) {
    const sub = this.stockSubs.get(symbol.toUpperCase());
    if (!sub) return;
    const msg = JSON.stringify(data);
    for (const clientId of sub.clients) {
      const state = this.clients.get(clientId);
      if (state && state.socket.readyState === state.socket.OPEN) {
        state.socket.send(msg);
      }
    }
  }

  broadcastToCryptoSubscribers(symbol: string, data: object) {
    const sub = this.cryptoSubs.get(symbol.toUpperCase());
    if (!sub) return;
    const msg = JSON.stringify(data);
    for (const clientId of sub.clients) {
      const state = this.clients.get(clientId);
      if (state && state.socket.readyState === state.socket.OPEN) {
        state.socket.send(msg);
      }
    }
  }

  broadcastToPortfolio(portfolioId: string, data: object) {
    const msg = JSON.stringify(data);
    for (const [, state] of this.clients) {
      if (state.portfolioIds.has(portfolioId) && state.socket.readyState === state.socket.OPEN) {
        state.socket.send(msg);
      }
    }
  }

  broadcastToUser(userId: string, data: object) {
    const msg = JSON.stringify(data);
    // Broadcast to all clients (in production, filter by user session)
    for (const [, state] of this.clients) {
      if (state.socket.readyState === state.socket.OPEN) {
        state.socket.send(msg);
      }
    }
  }

  broadcastAll(data: object) {
    const msg = JSON.stringify(data);
    for (const [, state] of this.clients) {
      if (state.socket.readyState === state.socket.OPEN) {
        state.socket.send(msg);
      }
    }
  }

  // Direct broadcast of a tick (used internally, not via Redis)
  broadcastTick(tick: WsTick) {
    if (tick.assetType === 'STOCK') {
      this.broadcastToStockSubscribers(tick.symbol, tick);
    } else if (tick.assetType === 'CRYPTO') {
      this.broadcastToCryptoSubscribers(tick.symbol, tick);
    }
  }

  private send(clientId: string, data: object) {
    const state = this.clients.get(clientId);
    if (state && state.socket.readyState === state.socket.OPEN) {
      state.socket.send(JSON.stringify(data));
    }
  }

  getStats() {
    return {
      connectedClients: this.clients.size,
      stockSymbols:     this.stockSubs.size,
      cryptoSymbols:    this.cryptoSubs.size,
      subscribedStocks: Array.from(this.stockSubs.keys()),
      subscribedCrypto: Array.from(this.cryptoSubs.keys()),
    };
  }
}
