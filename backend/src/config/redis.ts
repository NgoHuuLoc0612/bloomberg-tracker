import { Redis } from 'ioredis';
import { env } from './env.js';

const createRedisClient = (): Redis => {
  const client = new Redis({
    host:        env.REDIS_HOST,
    port:        env.REDIS_PORT,
    password:    env.REDIS_PASSWORD || undefined,
    db:          env.REDIS_DB,
    lazyConnect: false,
    retryStrategy(times: number) {
      if (times > 10) return null;
      return Math.min(times * 200, 3000);
    },
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    connectTimeout:  10000,
    commandTimeout:  5000,
  });
  client.on('connect', () => console.log('✅ Redis connected (Memurai)'));
  client.on('error',   (err: Error) => console.error('❌ Redis error:', err.message));
  client.on('reconnecting', () => console.log('🔄 Redis reconnecting...'));
  return client;
};

export const redisClient     = createRedisClient();
export const redisSubscriber = createRedisClient();
export const redisPublisher  = createRedisClient();

export const REDIS_CHANNELS = {
  STOCK_TICK:       'bloomberg:tick:stock',
  CRYPTO_TICK:      'bloomberg:tick:crypto',
  PORTFOLIO_UPDATE: 'bloomberg:portfolio:update',
  ALERT_TRIGGERED:  'bloomberg:alert:triggered',
  NEWS:             'bloomberg:news:new',
  ORDERBOOK:        'bloomberg:orderbook',
} as const;

export const cacheKey = {
  quote:        (symbol: string) => `quote:${symbol.toUpperCase()}`,
  candles:      (symbol: string, interval: string) => `candles:${symbol}:${interval}`,
  indicators:   (symbol: string, indicator: string) => `indicator:${symbol}:${indicator}`,
  news:         (symbol: string) => `news:${symbol}`,
  cryptoMarket: ()               => `crypto:market`,
  cryptoCoin:   (id: string)     => `crypto:coin:${id}`,
  screener:     (filter: string) => `screener:${filter}`,
  earnings:     (symbol: string) => `earnings:${symbol}`,
  profile:      (symbol: string) => `profile:${symbol}`,
} as const;

export async function withCache<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redisClient.get(key);
  if (cached) { try { return JSON.parse(cached) as T; } catch {} }
  const fresh = await fetcher();
  await redisClient.setex(key, ttlSeconds, JSON.stringify(fresh));
  return fresh;
}
