import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env.js';
import { withCache } from '../config/redis.js';

export class TwelveDataService {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: env.TWELVE_DATA_BASE_URL,
      timeout: 15000,
    });
  }

  private apiKey() { return env.TWELVE_DATA_API_KEY; }

  async getPrice(symbol: string, exchange?: string): Promise<{ price: number } | null> {
    return withCache(`td:price:${symbol}`, 30, async () => {
      const { data } = await this.http.get('/price', {
        params: { symbol, exchange, apikey: this.apiKey() },
      });
      if (data?.price) return { price: parseFloat(data.price) };
      return null;
    });
  }

  async getTimeSeries(
    symbol: string,
    interval: string,
    outputSize = 500,
    exchange?: string
  ): Promise<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>> {
    return withCache(`td:ts:${symbol}:${interval}:${outputSize}`, 120, async () => {
      const { data } = await this.http.get('/time_series', {
        params: { symbol, interval, outputsize: outputSize, exchange, apikey: this.apiKey() },
      });
      if (data?.status === 'error' || !data?.values) return [];
      return (data.values as any[]).map(v => ({
        time:   Math.floor(new Date(v.datetime).getTime() / 1000),
        open:   parseFloat(v.open),
        high:   parseFloat(v.high),
        low:    parseFloat(v.low),
        close:  parseFloat(v.close),
        volume: parseFloat(v.volume || '0'),
      })).reverse();
    });
  }

  async getRSI(symbol: string, interval: string, timePeriod = 14): Promise<Array<{ time: number; rsi: number }>> {
    return withCache(`td:rsi:${symbol}:${interval}:${timePeriod}`, 3600, async () => {
      const { data } = await this.http.get('/rsi', {
        params: { symbol, interval, time_period: timePeriod, apikey: this.apiKey() },
      });
      if (!data?.values) return [];
      return (data.values as any[]).map(v => ({
        time: Math.floor(new Date(v.datetime).getTime() / 1000),
        rsi:  parseFloat(v.rsi),
      })).reverse();
    });
  }

  async getMACD(
    symbol: string,
    interval: string,
    fast = 12, slow = 26, signal = 9
  ): Promise<Array<{ time: number; macd: number; signal: number; histogram: number }>> {
    return withCache(`td:macd:${symbol}:${interval}`, 3600, async () => {
      const { data } = await this.http.get('/macd', {
        params: { symbol, interval, fast_period: fast, slow_period: slow, signal_period: signal, apikey: this.apiKey() },
      });
      if (!data?.values) return [];
      return (data.values as any[]).map(v => ({
        time:      Math.floor(new Date(v.datetime).getTime() / 1000),
        macd:      parseFloat(v.macd),
        signal:    parseFloat(v.macd_signal),
        histogram: parseFloat(v.macd_hist),
      })).reverse();
    });
  }

  async getBollingerBands(symbol: string, interval: string, timePeriod = 20): Promise<
    Array<{ time: number; upper: number; middle: number; lower: number }>
  > {
    return withCache(`td:bb:${symbol}:${interval}:${timePeriod}`, 3600, async () => {
      const { data } = await this.http.get('/bbands', {
        params: { symbol, interval, time_period: timePeriod, apikey: this.apiKey() },
      });
      if (!data?.values) return [];
      return (data.values as any[]).map(v => ({
        time:   Math.floor(new Date(v.datetime).getTime() / 1000),
        upper:  parseFloat(v.upper_band),
        middle: parseFloat(v.middle_band),
        lower:  parseFloat(v.lower_band),
      })).reverse();
    });
  }

  async getEMA(symbol: string, interval: string, timePeriod: number): Promise<Array<{ time: number; ema: number }>> {
    return withCache(`td:ema:${symbol}:${interval}:${timePeriod}`, 3600, async () => {
      const { data } = await this.http.get('/ema', {
        params: { symbol, interval, time_period: timePeriod, apikey: this.apiKey() },
      });
      if (!data?.values) return [];
      return (data.values as any[]).map(v => ({
        time: Math.floor(new Date(v.datetime).getTime() / 1000),
        ema:  parseFloat(v.ema),
      })).reverse();
    });
  }

  async getMultipleQuotes(symbols: string[]): Promise<Map<string, number>> {
    const symbolsStr = symbols.join(',');
    return withCache(`td:multi:${symbolsStr}`, 30, async () => {
      const { data } = await this.http.get('/price', {
        params: { symbol: symbolsStr, apikey: this.apiKey() },
      });
      const map = new Map<string, number>();
      if (typeof data === 'object') {
        for (const [sym, val] of Object.entries(data)) {
          if ((val as any)?.price) map.set(sym, parseFloat((val as any).price));
        }
      }
      return map;
    });
  }

  async getStochasticOscillator(symbol: string, interval: string): Promise<
    Array<{ time: number; slowK: number; slowD: number }>
  > {
    return withCache(`td:stoch:${symbol}:${interval}`, 3600, async () => {
      const { data } = await this.http.get('/stoch', {
        params: { symbol, interval, apikey: this.apiKey() },
      });
      if (!data?.values) return [];
      return (data.values as any[]).map(v => ({
        time:  Math.floor(new Date(v.datetime).getTime() / 1000),
        slowK: parseFloat(v.slow_k),
        slowD: parseFloat(v.slow_d),
      })).reverse();
    });
  }

  async getADX(symbol: string, interval: string, timePeriod = 14): Promise<Array<{ time: number; adx: number }>> {
    return withCache(`td:adx:${symbol}:${interval}`, 3600, async () => {
      const { data } = await this.http.get('/adx', {
        params: { symbol, interval, time_period: timePeriod, apikey: this.apiKey() },
      });
      if (!data?.values) return [];
      return (data.values as any[]).map(v => ({
        time: Math.floor(new Date(v.datetime).getTime() / 1000),
        adx:  parseFloat(v.adx),
      })).reverse();
    });
  }

  async getForexRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
    return withCache(`td:forex:${fromCurrency}:${toCurrency}`, 60, async () => {
      const { data } = await this.http.get('/exchange_rate', {
        params: { symbol: `${fromCurrency}/${toCurrency}`, apikey: this.apiKey() },
      });
      return data?.rate ? parseFloat(data.rate) : null;
    });
  }
}

export const twelveDataService = new TwelveDataService();
