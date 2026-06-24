import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env.js';
import { withCache } from '../config/redis.js';

interface AlphaVantageGlobalQuote {
  'Global Quote': {
    '01. symbol': string;
    '02. open': string;
    '03. high': string;
    '04. low': string;
    '05. price': string;
    '06. volume': string;
    '07. latest trading day': string;
    '08. previous close': string;
    '09. change': string;
    '10. change percent': string;
  };
}

interface AlphaVantageTimeSeries {
  'Meta Data': Record<string, string>;
  [key: string]: Record<string, Record<string, string>> | Record<string, string>;
}

interface RSIPoint    { time: number; value: number; }
interface MACDPoint   { time: number; macd: number; signal: number; histogram: number; }
interface BBPoint     { time: number; upper: number; middle: number; lower: number; }
interface SMAPoint    { time: number; value: number; }

export class AlphaVantageService {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: env.ALPHA_VANTAGE_BASE_URL,
      timeout: 15000,
    });
  }

  private apiKey() { return env.ALPHA_VANTAGE_API_KEY; }

  async getGlobalQuote(symbol: string): Promise<{
    price: number; open: number; high: number; low: number;
    volume: number; previousClose: number; change: number; changePercent: number;
  } | null> {
    return withCache(`av:quote:${symbol}`, 60, async () => {
      const { data } = await this.http.get<AlphaVantageGlobalQuote>('', {
        params: { function: 'GLOBAL_QUOTE', symbol, apikey: this.apiKey() },
      });
      const q = data['Global Quote'];
      if (!q || !q['05. price']) return null;
      return {
        price:          parseFloat(q['05. price']),
        open:           parseFloat(q['02. open']),
        high:           parseFloat(q['03. high']),
        low:            parseFloat(q['04. low']),
        volume:         parseInt(q['06. volume'], 10),
        previousClose:  parseFloat(q['08. previous close']),
        change:         parseFloat(q['09. change']),
        changePercent:  parseFloat(q['10. change percent'].replace('%', '')),
      };
    });
  }

  async getDailyCandles(symbol: string, outputSize: 'compact' | 'full' = 'compact'): Promise<Array<{
    time: number; open: number; high: number; low: number; close: number; volume: number;
  }>> {
    return withCache(`av:daily:${symbol}:${outputSize}`, 3600, async () => {
      const { data } = await this.http.get<AlphaVantageTimeSeries>('', {
        params: {
          function: 'TIME_SERIES_DAILY_ADJUSTED',
          symbol,
          outputsize: outputSize,
          apikey: this.apiKey(),
        },
      });
      const series = data['Time Series (Daily)'] as Record<string, Record<string, string>>;
      if (!series) return [];

      return Object.entries(series)
        .map(([date, ohlcv]) => ({
          time:   Math.floor(new Date(date).getTime() / 1000),
          open:   parseFloat(ohlcv['1. open']),
          high:   parseFloat(ohlcv['2. high']),
          low:    parseFloat(ohlcv['3. low']),
          close:  parseFloat(ohlcv['5. adjusted close']),
          volume: parseInt(ohlcv['6. volume'], 10),
        }))
        .sort((a, b) => a.time - b.time);
    });
  }

  async getRSI(
    symbol: string,
    interval: string = 'daily',
    timePeriod: number = 14
  ): Promise<RSIPoint[]> {
    return withCache(`av:rsi:${symbol}:${interval}:${timePeriod}`, 3600, async () => {
      const { data } = await this.http.get('', {
        params: {
          function: 'RSI',
          symbol,
          interval,
          time_period: timePeriod,
          series_type: 'close',
          apikey: this.apiKey(),
        },
      });
      const series = data['Technical Analysis: RSI'];
      if (!series) return [];
      return Object.entries(series)
        .map(([date, val]: [string, any]) => ({
          time:  Math.floor(new Date(date).getTime() / 1000),
          value: parseFloat(val['RSI']),
        }))
        .sort((a, b) => a.time - b.time);
    });
  }

  async getMACD(
    symbol: string,
    interval: string = 'daily',
    fastPeriod = 12,
    slowPeriod = 26,
    signalPeriod = 9
  ): Promise<MACDPoint[]> {
    return withCache(`av:macd:${symbol}:${interval}`, 3600, async () => {
      const { data } = await this.http.get('', {
        params: {
          function:      'MACD',
          symbol,
          interval,
          fastperiod:    fastPeriod,
          slowperiod:    slowPeriod,
          signalperiod:  signalPeriod,
          series_type:   'close',
          apikey:        this.apiKey(),
        },
      });
      const series = data['Technical Analysis: MACD'];
      if (!series) return [];
      return Object.entries(series)
        .map(([date, val]: [string, any]) => ({
          time:      Math.floor(new Date(date).getTime() / 1000),
          macd:      parseFloat(val['MACD']),
          signal:    parseFloat(val['MACD_Signal']),
          histogram: parseFloat(val['MACD_Hist']),
        }))
        .sort((a, b) => a.time - b.time);
    });
  }

  async getBollingerBands(
    symbol: string,
    interval: string = 'daily',
    timePeriod = 20,
    deviation = 2
  ): Promise<BBPoint[]> {
    return withCache(`av:bb:${symbol}:${interval}:${timePeriod}:${deviation}`, 3600, async () => {
      const { data } = await this.http.get('', {
        params: {
          function:   'BBANDS',
          symbol,
          interval,
          time_period: timePeriod,
          series_type: 'close',
          nbdevup:    deviation,
          nbdevdn:    deviation,
          apikey:     this.apiKey(),
        },
      });
      const series = data['Technical Analysis: BBANDS'];
      if (!series) return [];
      return Object.entries(series)
        .map(([date, val]: [string, any]) => ({
          time:   Math.floor(new Date(date).getTime() / 1000),
          upper:  parseFloat(val['Real Upper Band']),
          middle: parseFloat(val['Real Middle Band']),
          lower:  parseFloat(val['Real Lower Band']),
        }))
        .sort((a, b) => a.time - b.time);
    });
  }

  async getEMA(
    symbol: string,
    interval: string = 'daily',
    timePeriod = 20
  ): Promise<SMAPoint[]> {
    return withCache(`av:ema:${symbol}:${interval}:${timePeriod}`, 3600, async () => {
      const { data } = await this.http.get('', {
        params: {
          function:    'EMA',
          symbol,
          interval,
          time_period: timePeriod,
          series_type: 'close',
          apikey:      this.apiKey(),
        },
      });
      const series = data['Technical Analysis: EMA'];
      if (!series) return [];
      return Object.entries(series)
        .map(([date, val]: [string, any]) => ({
          time:  Math.floor(new Date(date).getTime() / 1000),
          value: parseFloat(val['EMA']),
        }))
        .sort((a, b) => a.time - b.time);
    });
  }

  async getSMA(
    symbol: string,
    interval: string = 'daily',
    timePeriod = 50
  ): Promise<SMAPoint[]> {
    return withCache(`av:sma:${symbol}:${interval}:${timePeriod}`, 3600, async () => {
      const { data } = await this.http.get('', {
        params: {
          function:    'SMA',
          symbol,
          interval,
          time_period: timePeriod,
          series_type: 'close',
          apikey:      this.apiKey(),
        },
      });
      const series = data['Technical Analysis: SMA'];
      if (!series) return [];
      return Object.entries(series)
        .map(([date, val]: [string, any]) => ({
          time:  Math.floor(new Date(date).getTime() / 1000),
          value: parseFloat(val['SMA']),
        }))
        .sort((a, b) => a.time - b.time);
    });
  }

  async getATR(symbol: string, interval = 'daily', timePeriod = 14): Promise<SMAPoint[]> {
    return withCache(`av:atr:${symbol}:${interval}`, 3600, async () => {
      const { data } = await this.http.get('', {
        params: { function: 'ATR', symbol, interval, time_period: timePeriod, apikey: this.apiKey() },
      });
      const series = data['Technical Analysis: ATR'];
      if (!series) return [];
      return Object.entries(series)
        .map(([date, val]: [string, any]) => ({
          time:  Math.floor(new Date(date).getTime() / 1000),
          value: parseFloat(val['ATR']),
        }))
        .sort((a, b) => a.time - b.time);
    });
  }

  async getOBV(symbol: string, interval = 'daily'): Promise<SMAPoint[]> {
    return withCache(`av:obv:${symbol}:${interval}`, 3600, async () => {
      const { data } = await this.http.get('', {
        params: { function: 'OBV', symbol, interval, apikey: this.apiKey() },
      });
      const series = data['Technical Analysis: OBV'];
      if (!series) return [];
      return Object.entries(series)
        .map(([date, val]: [string, any]) => ({
          time:  Math.floor(new Date(date).getTime() / 1000),
          value: parseFloat(val['OBV']),
        }))
        .sort((a, b) => a.time - b.time);
    });
  }

  async getAllIndicators(symbol: string, interval = 'daily'): Promise<{
    rsi:     RSIPoint[];
    macd:    MACDPoint[];
    bb:      BBPoint[];
    ema20:   SMAPoint[];
    ema50:   SMAPoint[];
    ema200:  SMAPoint[];
    sma50:   SMAPoint[];
    sma200:  SMAPoint[];
  }> {
    const [rsi, macd, bb, ema20, ema50, ema200, sma50, sma200] = await Promise.all([
      this.getRSI(symbol, interval, 14),
      this.getMACD(symbol, interval),
      this.getBollingerBands(symbol, interval, 20, 2),
      this.getEMA(symbol, interval, 20),
      this.getEMA(symbol, interval, 50),
      this.getEMA(symbol, interval, 200),
      this.getSMA(symbol, interval, 50),
      this.getSMA(symbol, interval, 200),
    ]);
    return { rsi, macd, bb, ema20, ema50, ema200, sma50, sma200 };
  }
}

export const alphaVantageService = new AlphaVantageService();
