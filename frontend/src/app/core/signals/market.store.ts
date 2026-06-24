import { signal, computed, effect } from '@angular/core';
import type { StockQuote, Tick, MarketStatus } from '../models/stock.model';
import type { CryptoMarket, CryptoGlobalStats, PortfolioValue, WsMessage } from '../models/crypto.model';

// ─── Tick Cache (Symbol → live price data) ────────────────────────────────────
export const tickCache    = signal<Map<string, Tick>>(new Map());
export const stockQuotes  = signal<Map<string, StockQuote>>(new Map());
export const cryptoMarkets= signal<CryptoMarket[]>([]);
export const cryptoGlobal = signal<CryptoGlobalStats | null>(null);

// ─── Active Symbol ────────────────────────────────────────────────────────────
export const activeSymbol  = signal<string>('AAPL');
export const assetType     = signal<'STOCK' | 'CRYPTO'>('STOCK');
export const activeInterval= signal<string>('D');

// ─── Portfolio ────────────────────────────────────────────────────────────────
export const portfolioValue= signal<PortfolioValue | null>(null);
export const portfolioList = signal<any[]>([]);
export const activePortfolioId = signal<string | null>(null);

// ─── Market Status ────────────────────────────────────────────────────────────
export const marketStatus  = signal<MarketStatus>({ isOpen: false, session: 'closed', timezone: 'America/New_York' });
export const serverTime    = signal<Date>(new Date());

// ─── UI State ─────────────────────────────────────────────────────────────────
export const sidebarOpen   = signal<boolean>(true);
export const wsConnected   = signal<boolean>(false);
export const wsLatency     = signal<number>(0);
export const searchQuery   = signal<string>('');
export const searchResults = signal<any[]>([]);
export const notifications = signal<Array<{ id: string; type: string; message: string; timestamp: number }>>([]);

// ─── Indices Tape ─────────────────────────────────────────────────────────────
export const indicesTape   = signal<StockQuote[]>([]);
export const tickerSymbols = signal<string[]>([
  'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA',
  'SPY','QQQ','DIA','VIX',
  'BTCUSDT','ETHUSDT','SOLUSDT',
]);

// ─── Watchlist ────────────────────────────────────────────────────────────────
export const watchlists    = signal<any[]>([]);
export const activeWatchlist = signal<string | null>(null);

// ─── Alerts ───────────────────────────────────────────────────────────────────
export const activeAlerts  = signal<any[]>([]);

// ─── Computed Values ──────────────────────────────────────────────────────────
export const activeTick = computed(() => {
  const sym = activeSymbol();
  return tickCache().get(sym) ?? null;
});

export const marketCapTotal = computed(() =>
  cryptoMarkets().reduce((sum, c) => sum + c.marketCap, 0)
);

export const portfolioDayPnL = computed(() => {
  const pv = portfolioValue();
  return pv ? { amount: pv.dayChange, pct: pv.dayChangePct } : null;
});

export const topGainers = computed(() =>
  [...cryptoMarkets()]
    .sort((a, b) => b.priceChangePct24h - a.priceChangePct24h)
    .slice(0, 5)
);

export const topLosers = computed(() =>
  [...cryptoMarkets()]
    .sort((a, b) => a.priceChangePct24h - b.priceChangePct24h)
    .slice(0, 5)
);

export const unreadNotifications = computed(() =>
  notifications().length
);

// ─── Tick Updater ─────────────────────────────────────────────────────────────
export function applyTick(tick: Tick) {
  const current = tickCache();
  const next    = new Map(current);
  next.set(tick.symbol, tick);
  tickCache.set(next);

  // If it's a stock tick, also update the quote cache
  if (tick.assetType === 'STOCK') {
    const quotes = stockQuotes();
    const existing = quotes.get(tick.symbol);
    if (existing) {
      const next2 = new Map(quotes);
      next2.set(tick.symbol, {
        ...existing,
        price:         tick.price,
        change:        tick.change,
        changePercent: tick.changePct,
        timestamp:     tick.timestamp,
      });
      stockQuotes.set(next2);
    }
  }

  // Update crypto markets list
  if (tick.assetType === 'CRYPTO') {
    const sym = tick.symbol.replace('USDT','').toUpperCase();
    cryptoMarkets.update(markets =>
      markets.map(m =>
        m.symbol === sym
          ? { ...m, currentPrice: tick.price, priceChange24h: tick.change, priceChangePct24h: tick.changePct }
          : m
      )
    );
  }
}

export function addNotification(type: string, message: string) {
  const id = `notif_${Date.now()}`;
  notifications.update(n => [{ id, type, message, timestamp: Date.now() }, ...n].slice(0, 50));
  // Auto-remove after 5s
  setTimeout(() => {
    notifications.update(n => n.filter(x => x.id !== id));
  }, 5000);
}

export function dismissNotification(id: string) {
  notifications.update(n => n.filter(x => x.id !== id));
}

// ─── Clock Effect ─────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  setInterval(() => serverTime.set(new Date()), 1000);
}
