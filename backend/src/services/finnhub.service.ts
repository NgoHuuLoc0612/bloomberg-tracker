import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env.js';
import { cacheKey, withCache } from '../config/redis.js';
import type { StockQuote, Candle } from '../schemas/zod.schemas.js';

interface FinnhubQuote {
  c: number;   // Current price
  d: number;   // Change
  dp: number;  // Percent change
  h: number;   // High
  l: number;   // Low
  o: number;   // Open
  pc: number;  // Previous close
  t: number;   // Timestamp
  v?: number;  // Volume
}

interface FinnhubCandle {
  c: number[];  // Close prices
  h: number[];  // High prices
  l: number[];  // Low prices
  o: number[];  // Open prices
  s: string;    // Status
  t: number[];  // Timestamps
  v: number[];  // Volume
}

interface FinnhubProfile {
  name: string;
  ticker: string;
  exchange: string;
  finnhubIndustry: string;
  marketCapitalization: number;
  shareOutstanding: number;
  logo: string;
  weburl: string;
  ipo: string;
  currency: string;
  country: string;
  gsector: string;
  gind: string;
  gsubind: string;
}

interface FinnhubNews {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

interface FinnhubEarnings {
  actual:      number | null;
  estimate:    number | null;
  period:      string;
  quarter:     number;
  surprise:    number | null;
  surprisePct: number | null;
  symbol:      string;
  year:        number;
}

interface FinnhubMetrics {
  metric: {
    '52WeekHigh'?: number;
    '52WeekLow'?: number;
    'peNormalizedAnnual'?: number;
    'epsNormalizedAnnual'?: number;
    'beta'?: number;
    '10DayAverageTradingVolume'?: number;
    'netMarginAnnual'?: number;
    'revenueGrowth3Y'?: number;
    'currentRatioAnnual'?: number;
    'debtToEquityAnnual'?: number;
    'dividendYieldIndicatedAnnual'?: number;
    'roaRfy'?: number;
    'roeRfy'?: number;
    'grossMarginAnnual'?: number;
    'ebitdaInterimCagr5Y'?: number;
  };
}

export class FinnhubService {
  private http: AxiosInstance;
  private readonly defaultTTL = 60;     // 1 minute for quotes
  private readonly candleTTL  = 3600;   // 1 hour for daily candles
  private readonly profileTTL = 86400;  // 24 hours for profiles

  constructor() {
    this.http = axios.create({
      baseURL: env.FINNHUB_BASE_URL,
      params: { token: env.FINNHUB_API_KEY },
      timeout: 10000,
    });

    // Request interceptor for rate limiting logging
    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 429) {
          console.warn('⚠️  Finnhub rate limit hit');
        }
        return Promise.reject(err);
      }
    );
  }

  async getQuote(symbol: string): Promise<StockQuote | null> {
    const key = cacheKey.quote(symbol);
    return withCache(key, this.defaultTTL, async () => {
      const [quoteRes, profileRes] = await Promise.allSettled([
        this.http.get<FinnhubQuote>('/quote', { params: { symbol } }),
        this.http.get<FinnhubProfile>('/stock/profile2', { params: { symbol } }),
      ]);

      const q = quoteRes.status === 'fulfilled' ? quoteRes.value.data : null;
      const p = profileRes.status === 'fulfilled' ? profileRes.value.data : null;

      if (!q || !q.c) return null;

      return {
        symbol:        symbol.toUpperCase(),
        companyName:   p?.name,
        price:         q.c,
        change:        q.d,
        changePercent: q.dp,
        open:          q.o,
        high:          q.h,
        low:           q.l,
        previousClose: q.pc,
        volume:        0,
        marketCap:     p ? p.marketCapitalization * 1_000_000 : undefined,
        exchange:      p?.exchange,
        sector:        p?.gsector,
        industry:      p?.finnhubIndustry,
        currency:      p?.currency || 'USD',
        timestamp:     q.t,
      } satisfies StockQuote;
    });
  }

  async getBatchQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
    const results = await Promise.allSettled(
      symbols.map(s => this.getQuote(s))
    );
    const map = new Map<string, StockQuote>();
    results.forEach((res, i) => {
      if (res.status === 'fulfilled' && res.value) {
        map.set(symbols[i], res.value);
      }
    });
    return map;
  }

  async getCandles(
    symbol: string,
    resolution: string,
    from: number,
    to: number
  ): Promise<Candle[]> {
    const key = `${cacheKey.candles(symbol, resolution)}:${from}:${to}`;
    return withCache(key, this.candleTTL, async () => {
      const { data } = await this.http.get<FinnhubCandle>('/stock/candle', {
        params: { symbol, resolution, from, to },
      });

      if (data.s !== 'ok' || !data.t?.length) return [];

      return data.t.map((time, i) => ({
        time:   time,
        open:   data.o[i],
        high:   data.h[i],
        low:    data.l[i],
        close:  data.c[i],
        volume: data.v[i],
      }));
    });
  }

  async getCompanyProfile(symbol: string): Promise<FinnhubProfile | null> {
    const key = cacheKey.profile(symbol);
    return withCache(key, this.profileTTL, async () => {
      const { data } = await this.http.get<FinnhubProfile>('/stock/profile2', {
        params: { symbol },
      });
      return data?.name ? data : null;
    });
  }

  async getCompanyNews(
    symbol: string,
    from: string,
    to: string
  ): Promise<FinnhubNews[]> {
    const key = `${cacheKey.news(symbol)}:${from}:${to}`;
    return withCache(key, 900, async () => {
      const { data } = await this.http.get<FinnhubNews[]>('/company-news', {
        params: { symbol, from, to },
      });
      return data || [];
    });
  }

  async getMarketNews(category: string = 'general'): Promise<FinnhubNews[]> {
    return withCache(`news:market:${category}`, 600, async () => {
      const { data } = await this.http.get<FinnhubNews[]>('/news', {
        params: { category },
      });
      return data || [];
    });
  }

  async getBasicFinancials(symbol: string): Promise<FinnhubMetrics | null> {
    const key = `metrics:${symbol}`;
    return withCache(key, 3600, async () => {
      const { data } = await this.http.get<FinnhubMetrics>('/stock/metric', {
        params: { symbol, metric: 'all' },
      });
      return data?.metric ? data : null;
    });
  }

  async getEarnings(symbol: string): Promise<FinnhubEarnings[]> {
    const key = cacheKey.earnings(symbol);
    return withCache(key, 3600, async () => {
      const { data } = await this.http.get<FinnhubEarnings[]>('/stock/earnings', {
        params: { symbol, limit: 12 },
      });
      return data || [];
    });
  }

  async getSymbolSearch(query: string): Promise<Array<{ symbol: string; description: string; type: string }>> {
    return withCache(`search:${query}`, 3600, async () => {
      const { data } = await this.http.get('/search', { params: { q: query } });
      return (data?.result || []).slice(0, 20);
    });
  }

  async getMarketStatus(): Promise<{ isOpen: boolean; session: string; timezone: string }> {
    return withCache('market:status', 60, async () => {
      const { data } = await this.http.get('/stock/market-status', {
        params: { exchange: 'US' },
      });
      return {
        isOpen:   data?.isOpen ?? false,
        session:  data?.session ?? 'closed',
        timezone: data?.timezone ?? 'America/New_York',
      };
    });
  }

  async getRecommendationTrend(symbol: string): Promise<Array<{
    buy: number; hold: number; sell: number; strongBuy: number; strongSell: number; period: string;
  }>> {
    return withCache(`recommendation:${symbol}`, 86400, async () => {
      const { data } = await this.http.get('/stock/recommendation', {
        params: { symbol },
      });
      return data || [];
    });
  }

  async getSupportedStocks(exchange: string = 'US'): Promise<Array<{ symbol: string; description: string }>> {
    return withCache(`stocks:${exchange}`, 86400, async () => {
      const { data } = await this.http.get('/stock/symbol', {
        params: { exchange },
      });
      return (data || []).slice(0, 5000);
    });
  }

  async getPeers(symbol: string): Promise<string[]> {
    return withCache(`peers:${symbol}`, 86400, async () => {
      const { data } = await this.http.get('/stock/peers', { params: { symbol } });
      return data || [];
    });
  }

  async getInsiderTransactions(symbol: string): Promise<{ data: Array<{
    name: string; share: number; change: number; filingDate: string; transactionDate: string; transactionCode: string; transactionPrice: number;
  }>}> {
    return withCache(`insider:${symbol}`, 3600, async () => {
      const { data } = await this.http.get('/stock/insider-transactions', {
        params: { symbol },
      });
      return data || { data: [] };
    });
  }
}

export const finnhubService = new FinnhubService();
