// ─────────────────────────────────────────────────────────────────────────────
// Stock Models
// ─────────────────────────────────────────────────────────────────────────────

export interface StockQuote {
  symbol:        string;
  companyName?:  string;
  price:         number;
  change:        number;
  changePercent: number;
  open:          number;
  high:          number;
  low:           number;
  previousClose: number;
  volume:        number;
  avgVolume?:    number;
  marketCap?:    number;
  peRatio?:      number;
  eps?:          number;
  beta?:         number;
  weekHigh52?:   number;
  weekLow52?:    number;
  exchange?:     string;
  sector?:       string;
  industry?:     string;
  currency:      string;
  timestamp:     number;
  // Extended metrics
  netMargin?:    number;
  roe?:          number;
  roa?:          number;
  grossMargin?:  number;
  debtToEquity?: number;
  dividendYield?:number;
  revenueGrowth3Y?: number;
  peers?:        string[];
}

export interface OHLCVCandle {
  time:   number;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface CompanyProfile {
  name:        string;
  ticker:      string;
  exchange:    string;
  industry:    string;
  marketCap:   number;
  logo:        string;
  weburl:      string;
  ipo:         string;
  currency:    string;
  country:     string;
  sector:      string;
}

export interface EarningsReport {
  actual:      number | null;
  estimate:    number | null;
  period:      string;
  quarter:     number;
  surprise:    number | null;
  surprisePct: number | null;
  symbol:      string;
  year:        number;
}

export interface RecommendationTrend {
  buy:        number;
  hold:       number;
  sell:       number;
  strongBuy:  number;
  strongSell: number;
  period:     string;
}

export interface InsiderTransaction {
  name:            string;
  share:           number;
  change:          number;
  filingDate:      string;
  transactionDate: string;
  transactionCode: string;
  transactionPrice:number;
}

// ─── Technical Indicators ─────────────────────────────────────────────────────
export interface RSIPoint    { time: number; value: number; }
export interface MACDPoint   { time: number; macd: number; signal: number; histogram: number; }
export interface BBPoint     { time: number; upper: number; middle: number; lower: number; }
export interface SMAPoint    { time: number; value: number; }
export interface StochPoint  { time: number; slowK: number; slowD: number; }

export interface TechnicalIndicators {
  rsi?:   RSIPoint[];
  macd?:  MACDPoint[];
  bb?:    BBPoint[];
  ema20?: SMAPoint[];
  ema50?: SMAPoint[];
  ema200?:SMAPoint[];
  sma50?: SMAPoint[];
  sma200?:SMAPoint[];
  stoch?: StochPoint[];
  atr?:   SMAPoint[];
  obv?:   SMAPoint[];
  adx?:   SMAPoint[];
}

// ─── Real-time Tick ────────────────────────────────────────────────────────────
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

// ─── Order Book ───────────────────────────────────────────────────────────────
export interface OrderBookEntry {
  price:    number;
  quantity: number;
  total:    number;
}

export interface OrderBook {
  symbol:      string;
  bids:        OrderBookEntry[];
  asks:        OrderBookEntry[];
  spread:      number;
  spreadPct:   number;
  bestBid:     number;
  bestAsk:     number;
  timestamp:   number;
}

// ─── Market Status ────────────────────────────────────────────────────────────
export interface MarketStatus {
  isOpen:   boolean;
  session:  string;
  timezone: string;
}

// ─── News ─────────────────────────────────────────────────────────────────────
export interface NewsArticle {
  id?:        number | string;
  category:   string;
  datetime:   number;
  headline:   string;
  image?:     string;
  related?:   string;
  source:     string;
  summary?:   string;
  url:        string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

// ─── Screener ─────────────────────────────────────────────────────────────────
export interface ScreenerResult {
  symbol:        string;
  companyName?:  string;
  price:         number;
  change:        number;
  changePercent: number;
  volume:        number;
  marketCap?:    number;
  peRatio?:      number;
  beta?:         number;
  sector?:       string;
  exchange?:     string;
}

export interface ScreenerFilters {
  exchange?:     string;
  sector?:       string;
  minMarketCap?: number;
  maxMarketCap?: number;
  minPrice?:     number;
  maxPrice?:     number;
  minPE?:        number;
  maxPE?:        number;
  minChangePct?: number;
  maxChangePct?: number;
  minVolume?:    number;
  minBeta?:      number;
  maxBeta?:      number;
  sortBy?:       'price' | 'change' | 'changePct' | 'volume' | 'marketCap' | 'pe';
  sortDir?:      'asc' | 'desc';
  page?:         number;
  limit?:        number;
}

// ─── Watchlist ────────────────────────────────────────────────────────────────
export interface WatchlistItem {
  id:           string;
  watchlistId:  string;
  symbol:       string;
  assetType:    'STOCK' | 'CRYPTO' | 'ETF' | 'FOREX' | 'COMMODITY' | 'INDEX';
  displayName?: string;
  notes?:       string;
  addedAt:      string;
  // Enriched at runtime
  quote?:       StockQuote | null;
}

export interface Watchlist {
  id:          string;
  name:        string;
  description?:string;
  isDefault:   boolean;
  symbols:     WatchlistItem[];
}
