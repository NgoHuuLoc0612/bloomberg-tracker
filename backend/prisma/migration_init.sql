-- Bloomberg Tracker — Prisma Initial Migration
-- Run via: npx prisma migrate dev --name init

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('STOCK', 'CRYPTO', 'ETF', 'FOREX', 'COMMODITY', 'INDEX');
CREATE TYPE "TransactionType" AS ENUM ('BUY', 'SELL', 'DIVIDEND', 'SPLIT', 'TRANSFER_IN', 'TRANSFER_OUT');
CREATE TYPE "AlertType" AS ENUM ('PRICE', 'PERCENT_CHANGE', 'VOLUME', 'MOVING_AVERAGE_CROSS');
CREATE TYPE "AlertCondition" AS ENUM ('ABOVE', 'BELOW', 'CROSSES_UP', 'CROSSES_DOWN', 'PERCENT_UP', 'PERCENT_DOWN');

-- Users
CREATE TABLE "User" (
    "id"          TEXT NOT NULL,
    "email"       TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash"TEXT,
    "theme"       TEXT NOT NULL DEFAULT 'dark',
    "currency"    TEXT NOT NULL DEFAULT 'USD',
    "timezone"    TEXT NOT NULL DEFAULT 'UTC',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_email_idx" ON "User"("email");

-- UserPreference
CREATE TABLE "UserPreference" (
    "id"                    TEXT NOT NULL,
    "userId"                TEXT NOT NULL,
    "defaultChartInterval"  TEXT NOT NULL DEFAULT 'D',
    "defaultChartType"      TEXT NOT NULL DEFAULT 'candlestick',
    "showPremarket"         BOOLEAN NOT NULL DEFAULT true,
    "showAftermarket"       BOOLEAN NOT NULL DEFAULT true,
    "tickerScrollSpeed"     INTEGER NOT NULL DEFAULT 30,
    "decimalPlaces"         INTEGER NOT NULL DEFAULT 2,
    "notificationsEnabled"  BOOLEAN NOT NULL DEFAULT true,
    "emailAlerts"           BOOLEAN NOT NULL DEFAULT false,
    "soundAlerts"           BOOLEAN NOT NULL DEFAULT true,
    "compactMode"           BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"             TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- Portfolio
CREATE TABLE "Portfolio" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "currency"    TEXT NOT NULL DEFAULT 'USD',
    "isDefault"   BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Portfolio_userId_idx" ON "Portfolio"("userId");

-- PortfolioPosition
CREATE TABLE "PortfolioPosition" (
    "id"             TEXT NOT NULL,
    "portfolioId"    TEXT NOT NULL,
    "symbol"         TEXT NOT NULL,
    "assetType"      "AssetType" NOT NULL,
    "shares"         DECIMAL(18,8) NOT NULL,
    "avgCostBasis"   DECIMAL(18,8) NOT NULL,
    "currentPrice"   DECIMAL(18,8),
    "totalValue"     DECIMAL(18,8),
    "unrealizedPnL"  DECIMAL(18,8),
    "realizedPnL"    DECIMAL(18,8) NOT NULL DEFAULT 0,
    "dayGain"        DECIMAL(18,8),
    "dayGainPct"     DECIMAL(10,4),
    "weight"         DECIMAL(10,4),
    "sector"         TEXT,
    "industry"       TEXT,
    "openedAt"       TIMESTAMP(3) NOT NULL,
    "lastUpdated"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioPosition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PortfolioPosition_portfolioId_symbol_key" ON "PortfolioPosition"("portfolioId", "symbol");
CREATE INDEX "PortfolioPosition_portfolioId_idx" ON "PortfolioPosition"("portfolioId");
CREATE INDEX "PortfolioPosition_symbol_idx" ON "PortfolioPosition"("symbol");

-- Transaction
CREATE TABLE "Transaction" (
    "id"          TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "positionId"  TEXT,
    "symbol"      TEXT NOT NULL,
    "assetType"   "AssetType" NOT NULL,
    "type"        "TransactionType" NOT NULL,
    "shares"      DECIMAL(18,8) NOT NULL,
    "price"       DECIMAL(18,8) NOT NULL,
    "totalAmount" DECIMAL(18,8) NOT NULL,
    "fees"        DECIMAL(18,8) NOT NULL DEFAULT 0,
    "currency"    TEXT NOT NULL DEFAULT 'USD',
    "notes"       TEXT,
    "executedAt"  TIMESTAMP(3) NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Transaction_portfolioId_idx"  ON "Transaction"("portfolioId");
CREATE INDEX "Transaction_symbol_idx"       ON "Transaction"("symbol");
CREATE INDEX "Transaction_executedAt_idx"   ON "Transaction"("executedAt");

-- PortfolioSnapshot
CREATE TABLE "PortfolioSnapshot" (
    "id"           TEXT NOT NULL,
    "portfolioId"  TEXT NOT NULL,
    "totalValue"   DECIMAL(18,8) NOT NULL,
    "totalCost"    DECIMAL(18,8) NOT NULL,
    "totalPnL"     DECIMAL(18,8) NOT NULL,
    "totalPnLPct"  DECIMAL(10,4) NOT NULL,
    "dayChange"    DECIMAL(18,8) NOT NULL,
    "dayChangePct" DECIMAL(10,4) NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PortfolioSnapshot_portfolioId_snapshotDate_idx" ON "PortfolioSnapshot"("portfolioId", "snapshotDate");

-- Watchlist
CREATE TABLE "Watchlist" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "isDefault"   BOOLEAN NOT NULL DEFAULT false,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Watchlist_userId_idx" ON "Watchlist"("userId");

-- WatchlistItem
CREATE TABLE "WatchlistItem" (
    "id"          TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "symbol"      TEXT NOT NULL,
    "assetType"   "AssetType" NOT NULL,
    "displayName" TEXT,
    "notes"       TEXT,
    "addedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WatchlistItem_watchlistId_symbol_key" ON "WatchlistItem"("watchlistId", "symbol");
CREATE INDEX "WatchlistItem_watchlistId_idx" ON "WatchlistItem"("watchlistId");

-- PriceAlert
CREATE TABLE "PriceAlert" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "symbol"       TEXT NOT NULL,
    "assetType"    "AssetType" NOT NULL,
    "alertType"    "AlertType" NOT NULL,
    "condition"    "AlertCondition" NOT NULL,
    "targetPrice"  DECIMAL(18,8) NOT NULL,
    "currentPrice" DECIMAL(18,8),
    "percentChange"DECIMAL(10,4),
    "message"      TEXT,
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "isTriggered"  BOOLEAN NOT NULL DEFAULT false,
    "triggeredAt"  TIMESTAMP(3),
    "expiresAt"    TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PriceAlert_userId_idx"          ON "PriceAlert"("userId");
CREATE INDEX "PriceAlert_symbol_isActive_idx" ON "PriceAlert"("symbol", "isActive");

-- StockQuote (cache table updated by services)
CREATE TABLE "StockQuote" (
    "symbol"        TEXT NOT NULL,
    "companyName"   TEXT,
    "price"         DECIMAL(18,8) NOT NULL,
    "change"        DECIMAL(18,8) NOT NULL,
    "changePercent" DECIMAL(10,4) NOT NULL,
    "open"          DECIMAL(18,8) NOT NULL,
    "high"          DECIMAL(18,8) NOT NULL,
    "low"           DECIMAL(18,8) NOT NULL,
    "previousClose" DECIMAL(18,8) NOT NULL,
    "volume"        BIGINT NOT NULL,
    "avgVolume"     BIGINT,
    "marketCap"     DECIMAL(24,2),
    "peRatio"       DECIMAL(10,4),
    "eps"           DECIMAL(10,4),
    "beta"          DECIMAL(8,4),
    "weekHigh52"    DECIMAL(18,8),
    "weekLow52"     DECIMAL(18,8),
    "exchange"      TEXT,
    "currency"      TEXT NOT NULL DEFAULT 'USD',
    "sector"        TEXT,
    "industry"      TEXT,
    "source"        TEXT NOT NULL DEFAULT 'finnhub',
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StockQuote_pkey" PRIMARY KEY ("symbol")
);
CREATE INDEX "StockQuote_sector_idx" ON "StockQuote"("sector");

-- OHLCVCandle
CREATE TABLE "OHLCVCandle" (
    "id"        TEXT NOT NULL,
    "symbol"    TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "interval"  TEXT NOT NULL,
    "time"      TIMESTAMP(3) NOT NULL,
    "open"      DECIMAL(18,8) NOT NULL,
    "high"      DECIMAL(18,8) NOT NULL,
    "low"       DECIMAL(18,8) NOT NULL,
    "close"     DECIMAL(18,8) NOT NULL,
    "volume"    DECIMAL(24,2) NOT NULL,
    CONSTRAINT "OHLCVCandle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OHLCVCandle_symbol_interval_time_key" ON "OHLCVCandle"("symbol", "interval", "time");
CREATE INDEX "OHLCVCandle_symbol_interval_time_idx" ON "OHLCVCandle"("symbol", "interval", "time");

-- TechnicalIndicator
CREATE TABLE "TechnicalIndicator" (
    "id"        TEXT NOT NULL,
    "symbol"    TEXT NOT NULL,
    "interval"  TEXT NOT NULL,
    "indicator" TEXT NOT NULL,
    "time"      TIMESTAMP(3) NOT NULL,
    "values"    JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TechnicalIndicator_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TechnicalIndicator_symbol_interval_indicator_time_key" ON "TechnicalIndicator"("symbol", "interval", "indicator", "time");

-- NewsArticle
CREATE TABLE "NewsArticle" (
    "id"             TEXT NOT NULL,
    "externalId"     TEXT,
    "headline"       TEXT NOT NULL,
    "summary"        TEXT,
    "url"            TEXT NOT NULL,
    "source"         TEXT NOT NULL,
    "category"       TEXT,
    "sentiment"      TEXT,
    "sentimentScore" DECIMAL(5,4),
    "image"          TEXT,
    "relatedSymbols" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt"    TIMESTAMP(3) NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NewsArticle_externalId_key" ON "NewsArticle"("externalId");
CREATE INDEX "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt");

-- EconomicEvent
CREATE TABLE "EconomicEvent" (
    "id"          TEXT NOT NULL,
    "country"     TEXT NOT NULL,
    "currency"    TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "impact"      TEXT NOT NULL,
    "actual"      TEXT,
    "forecast"    TEXT,
    "previous"    TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EconomicEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EconomicEvent_scheduledAt_idx" ON "EconomicEvent"("scheduledAt");
CREATE INDEX "EconomicEvent_country_idx"     ON "EconomicEvent"("country");

-- Foreign Key Constraints
ALTER TABLE "UserPreference"     ADD CONSTRAINT "UserPreference_userId_fkey"    FOREIGN KEY ("userId")      REFERENCES "User"("id")              ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Portfolio"          ADD CONSTRAINT "Portfolio_userId_fkey"          FOREIGN KEY ("userId")      REFERENCES "User"("id")              ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioPosition"  ADD CONSTRAINT "PortfolioPosition_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id")    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction"        ADD CONSTRAINT "Transaction_portfolioId_fkey"   FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id")         ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction"        ADD CONSTRAINT "Transaction_positionId_fkey"    FOREIGN KEY ("positionId")  REFERENCES "PortfolioPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PortfolioSnapshot"  ADD CONSTRAINT "PortfolioSnapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id")    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Watchlist"          ADD CONSTRAINT "Watchlist_userId_fkey"          FOREIGN KEY ("userId")      REFERENCES "User"("id")              ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WatchlistItem"      ADD CONSTRAINT "WatchlistItem_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist"("id")         ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceAlert"         ADD CONSTRAINT "PriceAlert_userId_fkey"         FOREIGN KEY ("userId")      REFERENCES "User"("id")              ON DELETE CASCADE ON UPDATE CASCADE;

-- updatedAt triggers
CREATE TRIGGER "User_updatedAt"         BEFORE UPDATE ON "User"             FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER "Portfolio_updatedAt"    BEFORE UPDATE ON "Portfolio"        FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER "Watchlist_updatedAt"    BEFORE UPDATE ON "Watchlist"        FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER "PriceAlert_updatedAt"   BEFORE UPDATE ON "PriceAlert"       FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER "StockQuote_updatedAt"   BEFORE UPDATE ON "StockQuote"       FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ─── Useful indexes for screener queries ────────────────────────────────────
CREATE INDEX "StockQuote_price_idx"         ON "StockQuote"("price");
CREATE INDEX "StockQuote_changePercent_idx" ON "StockQuote"("changePercent");
CREATE INDEX "StockQuote_volume_idx"        ON "StockQuote"("volume");
CREATE INDEX "StockQuote_marketCap_idx"     ON "StockQuote"("marketCap");
CREATE INDEX "StockQuote_peRatio_idx"       ON "StockQuote"("peRatio");
