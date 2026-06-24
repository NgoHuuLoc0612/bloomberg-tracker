import { z } from 'zod';

// ─── Common ───────────────────────────────────────────────────────────────────
export const SymbolSchema     = z.string().min(1).max(20).toUpperCase();
export const IntervalSchema   = z.enum(['1min','5min','15min','30min','1h','4h','D','W','M']);
export const AssetTypeSchema  = z.enum(['STOCK','CRYPTO','ETF','FOREX','COMMODITY','INDEX']);
export const CurrencySchema   = z.string().length(3).toUpperCase();
export const PaginationSchema = z.object({
  page:  z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(200).default(50),
});

// ─── Stock Quote ──────────────────────────────────────────────────────────────
export const StockQuoteSchema = z.object({
  symbol:         SymbolSchema,
  companyName:    z.string().optional(),
  price:          z.number(),
  change:         z.number(),
  changePercent:  z.number(),
  open:           z.number(),
  high:           z.number(),
  low:            z.number(),
  previousClose:  z.number(),
  volume:         z.number(),
  avgVolume:      z.number().optional(),
  marketCap:      z.number().optional(),
  peRatio:        z.number().optional(),
  eps:            z.number().optional(),
  beta:           z.number().optional(),
  weekHigh52:     z.number().optional(),
  weekLow52:      z.number().optional(),
  exchange:       z.string().optional(),
  sector:         z.string().optional(),
  industry:       z.string().optional(),
  currency:       z.string().default('USD'),
  timestamp:      z.number(),
});

export type StockQuote = z.infer<typeof StockQuoteSchema>;

// ─── Candle ───────────────────────────────────────────────────────────────────
export const CandleSchema = z.object({
  time:   z.number(),
  open:   z.number(),
  high:   z.number(),
  low:    z.number(),
  close:  z.number(),
  volume: z.number(),
});

export type Candle = z.infer<typeof CandleSchema>;

// ─── Technical Indicators ────────────────────────────────────────────────────
export const RSISchema = z.object({
  time:  z.number(),
  value: z.number(),
});

export const MACDSchema = z.object({
  time:      z.number(),
  macd:      z.number(),
  signal:    z.number(),
  histogram: z.number(),
});

export const BollingerBandSchema = z.object({
  time:   z.number(),
  upper:  z.number(),
  middle: z.number(),
  lower:  z.number(),
});

export const EMASchema = z.object({
  time:  z.number(),
  value: z.number(),
  ema9:  z.number().optional(),
  ema20: z.number().optional(),
  ema50: z.number().optional(),
  ema200:z.number().optional(),
});

// ─── Crypto ───────────────────────────────────────────────────────────────────
export const CryptoMarketSchema = z.object({
  id:                   z.string(),
  symbol:               z.string(),
  name:                 z.string(),
  image:                z.string().optional(),
  currentPrice:         z.number(),
  marketCap:            z.number(),
  marketCapRank:        z.number().optional(),
  fullyDilutedValuation:z.number().optional(),
  totalVolume:          z.number(),
  high24h:              z.number(),
  low24h:               z.number(),
  priceChange24h:       z.number(),
  priceChangePct24h:    z.number(),
  priceChangePct7d:     z.number().optional(),
  priceChangePct30d:    z.number().optional(),
  circulatingSupply:    z.number(),
  totalSupply:          z.number().optional(),
  maxSupply:            z.number().optional(),
  ath:                  z.number().optional(),
  athDate:              z.string().optional(),
  sparkline:            z.array(z.number()).optional(),
});

export type CryptoMarket = z.infer<typeof CryptoMarketSchema>;

// ─── Order Book ───────────────────────────────────────────────────────────────
export const OrderBookEntrySchema = z.object({
  price:    z.number(),
  quantity: z.number(),
  total:    z.number(),
});

export const OrderBookSchema = z.object({
  symbol:     z.string(),
  bids:       z.array(OrderBookEntrySchema),
  asks:       z.array(OrderBookEntrySchema),
  timestamp:  z.number(),
  spread:     z.number(),
  spreadPct:  z.number(),
});

export type OrderBook = z.infer<typeof OrderBookSchema>;

// ─── Portfolio ────────────────────────────────────────────────────────────────
export const CreateTransactionSchema = z.object({
  portfolioId: z.string().uuid(),
  symbol:      SymbolSchema,
  assetType:   AssetTypeSchema,
  type:        z.enum(['BUY','SELL','DIVIDEND','SPLIT','TRANSFER_IN','TRANSFER_OUT']),
  shares:      z.number().positive(),
  price:       z.number().positive(),
  fees:        z.number().min(0).default(0),
  notes:       z.string().max(500).optional(),
  executedAt:  z.string().datetime(),
});

export const CreatePortfolioSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  currency:    CurrencySchema.default('USD'),
});

// ─── Watchlist ────────────────────────────────────────────────────────────────
export const CreateWatchlistSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const AddWatchlistItemSchema = z.object({
  symbol:      SymbolSchema,
  assetType:   AssetTypeSchema,
  displayName: z.string().optional(),
  notes:       z.string().max(500).optional(),
});

// ─── Alerts ───────────────────────────────────────────────────────────────────
export const CreateAlertSchema = z.object({
  symbol:       SymbolSchema,
  assetType:    AssetTypeSchema,
  alertType:    z.enum(['PRICE','PERCENT_CHANGE','VOLUME','MOVING_AVERAGE_CROSS']),
  condition:    z.enum(['ABOVE','BELOW','CROSSES_UP','CROSSES_DOWN','PERCENT_UP','PERCENT_DOWN']),
  targetPrice:  z.number().positive(),
  message:      z.string().max(200).optional(),
  expiresAt:    z.string().datetime().optional(),
});

// ─── Screener ────────────────────────────────────────────────────────────────
export const StockScreenerSchema = z.object({
  exchange:       z.string().optional(),
  sector:         z.string().optional(),
  minMarketCap:   z.coerce.number().optional(),
  maxMarketCap:   z.coerce.number().optional(),
  minPrice:       z.coerce.number().optional(),
  maxPrice:       z.coerce.number().optional(),
  minPE:          z.coerce.number().optional(),
  maxPE:          z.coerce.number().optional(),
  minChangePct:   z.coerce.number().optional(),
  maxChangePct:   z.coerce.number().optional(),
  minVolume:      z.coerce.number().optional(),
  minBeta:        z.coerce.number().optional(),
  maxBeta:        z.coerce.number().optional(),
  country:        z.string().optional(),
  sortBy:         z.enum(['price','change','changePct','volume','marketCap','pe']).default('marketCap'),
  sortDir:        z.enum(['asc','desc']).default('desc'),
}).merge(PaginationSchema);

// ─── WebSocket Messages ───────────────────────────────────────────────────────
export const WsSubscribeSchema = z.object({
  action:   z.enum(['subscribe','unsubscribe']),
  type:     z.enum(['stock','crypto','orderbook','portfolio']),
  symbols:  z.array(z.string()).min(1).max(50),
});

export const WsTickSchema = z.object({
  type:       z.literal('tick'),
  assetType:  z.string(),
  symbol:     z.string(),
  price:      z.number(),
  change:     z.number(),
  changePct:  z.number(),
  volume:     z.number().optional(),
  timestamp:  z.number(),
});

export type WsTick = z.infer<typeof WsTickSchema>;

// ─── News ────────────────────────────────────────────────────────────────────
export const NewsQuerySchema = z.object({
  symbol:   z.string().optional(),
  category: z.string().optional(),
  from:     z.string().optional(),
  to:       z.string().optional(),
}).merge(PaginationSchema);
