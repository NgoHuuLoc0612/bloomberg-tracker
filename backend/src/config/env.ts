import { z } from 'zod';

const EnvSchema = z.object({
  PORT:                   z.coerce.number().default(3000),
  NODE_ENV:               z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL:           z.string().default('http://localhost:4200'),

  // Database
  DATABASE_URL:           z.string().url(),

  // Redis
  REDIS_HOST:             z.string().default('localhost'),
  REDIS_PORT:             z.coerce.number().default(6379),
  REDIS_PASSWORD:         z.string().optional(),
  REDIS_DB:               z.coerce.number().default(0),
  REDIS_TTL:              z.coerce.number().default(300),

  // Finnhub
  FINNHUB_API_KEY:        z.string().min(1),
  FINNHUB_WSS:            z.string().default('wss://ws.finnhub.io'),
  FINNHUB_BASE_URL:       z.string().default('https://finnhub.io/api/v1'),

  // Alpha Vantage
  ALPHA_VANTAGE_API_KEY:  z.string().min(1),
  ALPHA_VANTAGE_BASE_URL: z.string().default('https://www.alphavantage.co/query'),

  // Twelve Data
  TWELVE_DATA_API_KEY:    z.string().min(1),
  TWELVE_DATA_BASE_URL:   z.string().default('https://api.twelvedata.com'),

  // CoinGecko
  COINGECKO_API_KEY:      z.string().optional(),
  COINGECKO_BASE_URL:     z.string().default('https://api.coingecko.com/api/v3'),

  // Binance
  BINANCE_WSS:            z.string().default('wss://stream.binance.com:9443'),
  BINANCE_API_KEY:        z.string().optional(),
  BINANCE_SECRET:         z.string().optional(),

  // JWT
  JWT_SECRET:             z.string().min(32),
  JWT_EXPIRES_IN:         z.string().default('7d'),

  // Rate Limits
  RATE_LIMIT_MAX:         z.coerce.number().default(100),
  RATE_LIMIT_WINDOW:      z.coerce.number().default(60000),
});

const _env = EnvSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:');
  console.error(_env.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = _env.data;
export type Env = z.infer<typeof EnvSchema>;
