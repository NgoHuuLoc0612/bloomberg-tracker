// ─── Crypto ───────────────────────────────────────────────────────────────────
export interface CryptoMarket {
  id:                    string;
  symbol:                string;
  name:                  string;
  image?:                string;
  currentPrice:          number;
  marketCap:             number;
  marketCapRank?:        number;
  fullyDilutedValuation?:number;
  totalVolume:           number;
  high24h:               number;
  low24h:                number;
  priceChange24h:        number;
  priceChangePct24h:     number;
  priceChangePct7d?:     number;
  priceChangePct30d?:    number;
  circulatingSupply:     number;
  totalSupply?:          number;
  maxSupply?:            number;
  ath?:                  number;
  athDate?:              string;
  sparkline?:            number[];
}

export interface CryptoGlobalStats {
  totalMarketCap:         number;
  totalVolume:            number;
  btcDominance:           number;
  ethDominance:           number;
  marketCapChange24h:     number;
  activeCryptocurrencies: number;
  defiVolume:             number;
  defiDominance:          number;
}

export interface BinanceTicker {
  symbol:          string;
  price:           number;
  priceChange:     number;
  priceChangePct:  number;
  open:            number;
  high:            number;
  low:             number;
  volume:          number;
  quoteVolume:     number;
  bestBid:         number;
  bestAsk:         number;
  timestamp:       number;
}

// ─── Portfolio ─────────────────────────────────────────────────────────────────
export type AssetType      = 'STOCK' | 'CRYPTO' | 'ETF' | 'FOREX' | 'COMMODITY' | 'INDEX';
export type TransactionType= 'BUY' | 'SELL' | 'DIVIDEND' | 'SPLIT' | 'TRANSFER_IN' | 'TRANSFER_OUT';

export interface PortfolioPosition {
  id:             string;
  portfolioId:    string;
  symbol:         string;
  assetType:      AssetType;
  shares:         number;
  avgCostBasis:   number;
  currentPrice?:  number;
  totalValue?:    number;
  unrealizedPnL?: number;
  unrealizedPct?: number;
  realizedPnL:    number;
  dayGain?:       number;
  dayGainPct?:    number;
  weight?:        number;
  sector?:        string;
  change?:        number;
  changePct?:     number;
  openedAt:       string;
}

export interface Transaction {
  id:          string;
  portfolioId: string;
  symbol:      string;
  assetType:   AssetType;
  type:        TransactionType;
  shares:      number;
  price:       number;
  totalAmount: number;
  fees:        number;
  notes?:      string;
  executedAt:  string;
}

export interface Portfolio {
  id:          string;
  name:        string;
  description?:string;
  currency:    string;
  isDefault:   boolean;
  positions:   PortfolioPosition[];
}

export interface PortfolioValue {
  portfolioId:    string;
  name:           string;
  totalValue:     number;
  totalCost:      number;
  totalPnL:       number;
  totalPnLPct:    number;
  dayChange:      number;
  dayChangePct:   number;
  positions:      PortfolioPosition[];
  sectorBreakdown:Record<string, number>;
  currency:       string;
  timestamp:      number;
}

export interface PortfolioSnapshot {
  snapshotDate: string;
  totalValue:   number;
  totalPnL:     number;
  totalPnLPct:  number;
}

// ─── Alerts ───────────────────────────────────────────────────────────────────
export type AlertType      = 'PRICE' | 'PERCENT_CHANGE' | 'VOLUME' | 'MOVING_AVERAGE_CROSS';
export type AlertCondition = 'ABOVE' | 'BELOW' | 'CROSSES_UP' | 'CROSSES_DOWN' | 'PERCENT_UP' | 'PERCENT_DOWN';

export interface PriceAlert {
  id:            string;
  symbol:        string;
  assetType:     AssetType;
  alertType:     AlertType;
  condition:     AlertCondition;
  targetPrice:   number;
  currentPrice?: number;
  message?:      string;
  isActive:      boolean;
  isTriggered:   boolean;
  triggeredAt?:  string;
  expiresAt?:    string;
  createdAt:     string;
}

// ─── WebSocket Messages ────────────────────────────────────────────────────────
export type WsMessage =
  | { type: 'connected'; clientId: string; timestamp: number }
  | { type: 'ping'; timestamp: number }
  | { type: 'pong'; timestamp: number }
  | { type: 'subscribed'; assetType: string; symbols: string[]; timestamp: number }
  | { type: 'tick'; assetType: 'STOCK' | 'CRYPTO'; symbol: string; price: number; change: number; changePct: number; volume?: number; high24h?: number; low24h?: number; timestamp: number }
  | { type: 'portfolio'; portfolioId: string }
  | { type: 'alert'; alertId: string; symbol: string; price: number; condition: string }
  | { type: 'news'; headline: string; url: string; source: string }
  | { type: 'error'; message: string };

// ─── Tick (also in stock.model, re-exported here for convenience) ─────────────
export interface Tick {
  type:       'tick';
  assetType:  'STOCK' | 'CRYPTO';
  symbol:     string;
  price:      number;
  change:     number;
  changePct:  number;
  volume?:    number;
  high24h?:   number;
  low24h?:    number;
  timestamp:  number;
}

// ─── Watchlist ────────────────────────────────────────────────────────────────
export interface WatchlistItem {
  id:           string;
  watchlistId:  string;
  symbol:       string;
  assetType:    AssetType;
  displayName?: string;
  notes?:       string;
  addedAt:      string;
}

export interface Watchlist {
  id:           string;
  name:         string;
  description?: string;
  isDefault:    boolean;
  symbols:      WatchlistItem[];
}
