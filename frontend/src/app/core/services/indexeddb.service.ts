import { Injectable } from '@angular/core';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { OHLCVCandle } from '../models/stock.model';
import type { CryptoMarket } from '../models/crypto.model';

interface BloombergDB extends DBSchema {
  candles: {
    key: string;   // `${symbol}:${interval}`
    value: { key: string; symbol: string; interval: string; data: OHLCVCandle[]; updatedAt: number };
    indexes: { 'by-symbol': string; 'by-updated': number };
  };
  quotes: {
    key: string;
    value: { symbol: string; data: any; updatedAt: number };
    indexes: { 'by-updated': number };
  };
  crypto: {
    key: string;
    value: { id: string; data: CryptoMarket; updatedAt: number };
    indexes: { 'by-rank': number };
  };
  indicators: {
    key: string;   // `${symbol}:${interval}:${indicator}`
    value: { key: string; data: any[]; updatedAt: number };
  };
  watchlist: {
    key: string;
    value: { id: string; symbols: string[]; updatedAt: number };
  };
  settings: {
    key: string;
    value: { key: string; value: any };
  };
}

const DB_NAME    = 'bloomberg-tracker';
const DB_VERSION = 1;
const QUOTE_TTL  = 60_000;        // 1 min
const CANDLE_TTL = 3_600_000;     // 1 hr for intraday
const CRYPTO_TTL = 30_000;        // 30s

@Injectable({ providedIn: 'root' })
export class IndexedDbService {
  private db: IDBPDatabase<BloombergDB> | null = null;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.init();
  }

  private async init() {
    this.db = await openDB<BloombergDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Candles store
        const candlesStore = db.createObjectStore('candles', { keyPath: 'key' });
        candlesStore.createIndex('by-symbol',  'symbol');
        candlesStore.createIndex('by-updated', 'updatedAt');

        // Quotes store
        const quotesStore = db.createObjectStore('quotes', { keyPath: 'symbol' });
        quotesStore.createIndex('by-updated', 'updatedAt');

        // Crypto store
        const cryptoStore = db.createObjectStore('crypto', { keyPath: 'id' });
        cryptoStore.createIndex('by-rank', 'data.marketCapRank');

        // Indicators
        db.createObjectStore('indicators', { keyPath: 'key' });

        // Watchlist
        db.createObjectStore('watchlist', { keyPath: 'id' });

        // Settings (theme, preferences, etc.)
        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
    console.log('[IndexedDB] Bloomberg DB initialized');
  }

  private async ensureDb(): Promise<IDBPDatabase<BloombergDB>> {
    await this.initPromise;
    return this.db!;
  }

  // ─── Candles ────────────────────────────────────────────────────────────────
  async saveCandles(symbol: string, interval: string, data: OHLCVCandle[]) {
    const db  = await this.ensureDb();
    const key = `${symbol.toUpperCase()}:${interval}`;
    await db.put('candles', { key, symbol: symbol.toUpperCase(), interval, data, updatedAt: Date.now() });
  }

  async getCandles(symbol: string, interval: string): Promise<OHLCVCandle[] | null> {
    const db  = await this.ensureDb();
    const key = `${symbol.toUpperCase()}:${interval}`;
    const rec = await db.get('candles', key);
    if (!rec) return null;

    const ttl = interval === 'D' || interval === 'W' || interval === 'M' ? CANDLE_TTL * 24 : CANDLE_TTL;
    if (Date.now() - rec.updatedAt > ttl) return null;    // stale
    return rec.data;
  }

  // ─── Quotes ─────────────────────────────────────────────────────────────────
  async saveQuote(symbol: string, data: any) {
    const db = await this.ensureDb();
    await db.put('quotes', { symbol: symbol.toUpperCase(), data, updatedAt: Date.now() });
  }

  async getQuote<T>(symbol: string): Promise<T | null> {
    const db  = await this.ensureDb();
    const rec = await db.get('quotes', symbol.toUpperCase());
    if (!rec || Date.now() - rec.updatedAt > QUOTE_TTL) return null;
    return rec.data as T;
  }

  // ─── Crypto ─────────────────────────────────────────────────────────────────
  async saveCryptoMarkets(markets: CryptoMarket[]) {
    const db = await this.ensureDb();
    const tx = db.transaction('crypto', 'readwrite');
    await Promise.all([
      ...markets.map(m => tx.store.put({ id: m.id, data: m, updatedAt: Date.now() })),
      tx.done,
    ]);
  }

  async getCryptoMarkets(): Promise<CryptoMarket[] | null> {
    const db      = await this.ensureDb();
    const records = await db.getAll('crypto');
    if (!records.length) return null;
    const latestUpdate = Math.max(...records.map(r => r.updatedAt));
    if (Date.now() - latestUpdate > CRYPTO_TTL) return null;
    return records.map(r => r.data).sort((a, b) => (a.marketCapRank ?? 9999) - (b.marketCapRank ?? 9999));
  }

  // ─── Indicators ─────────────────────────────────────────────────────────────
  async saveIndicators(symbol: string, interval: string, indicator: string, data: any[]) {
    const db  = await this.ensureDb();
    const key = `${symbol}:${interval}:${indicator}`;
    await db.put('indicators', { key, data, updatedAt: Date.now() });
  }

  async getIndicators(symbol: string, interval: string, indicator: string): Promise<any[] | null> {
    const db  = await this.ensureDb();
    const key = `${symbol}:${interval}:${indicator}`;
    const rec = await db.get('indicators', key);
    if (!rec || Date.now() - rec.updatedAt > CANDLE_TTL) return null;
    return rec.data;
  }

  // ─── Settings ────────────────────────────────────────────────────────────────
  async saveSetting(key: string, value: any) {
    const db = await this.ensureDb();
    await db.put('settings', { key, value });
  }

  async getSetting<T>(key: string): Promise<T | null> {
    const db  = await this.ensureDb();
    const rec = await db.get('settings', key);
    return rec ? (rec.value as T) : null;
  }

  // ─── Cleanup (purge stale data) ──────────────────────────────────────────────
  async purgeStale() {
    const db  = await this.ensureDb();
    const now = Date.now();

    // Purge old candles (older than 7 days)
    const candles = await db.getAll('candles');
    const tx = db.transaction('candles', 'readwrite');
    for (const c of candles) {
      if (now - c.updatedAt > 7 * 24 * 3600 * 1000) {
        await tx.store.delete(c.key);
      }
    }
    await tx.done;

    // Purge stale quotes
    const quotes = await db.getAll('quotes');
    const tx2 = db.transaction('quotes', 'readwrite');
    for (const q of quotes) {
      if (now - q.updatedAt > 24 * 3600 * 1000) {
        await tx2.store.delete(q.symbol);
      }
    }
    await tx2.done;
  }
}
