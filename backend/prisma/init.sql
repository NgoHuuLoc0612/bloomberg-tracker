-- ─────────────────────────────────────────────────────────────────────────────
-- Bloomberg Tracker — PostgreSQL 18 (EDB) Initialization
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- Fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";     -- GIN index support
CREATE EXTENSION IF NOT EXISTS "unaccent";      -- Accent-insensitive search

-- Performance settings for market data workloads
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '128MB';
ALTER SYSTEM SET checkpoint_completion_target = '0.9';
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET random_page_cost = '1.1';      -- SSD-optimized
ALTER SYSTEM SET effective_io_concurrency = '200';

-- For high-frequency tick data writes
ALTER SYSTEM SET synchronous_commit = 'off';
ALTER SYSTEM SET max_wal_size = '1GB';

-- Connection settings
ALTER SYSTEM SET max_connections = '200';

-- Logging (development)
ALTER SYSTEM SET log_min_duration_statement = '1000';  -- Log queries > 1s

-- Timezone
ALTER SYSTEM SET timezone = 'America/New_York';

-- Reload config
SELECT pg_reload_conf();

-- Create bloomberg schema
CREATE SCHEMA IF NOT EXISTS bloomberg;

-- ─── Helper Functions ─────────────────────────────────────────────────────────

-- Function: update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Useful Views ─────────────────────────────────────────────────────────────

-- View: sector performance summary (created after Prisma migrations)
-- These will be created after migration via seed or a separate migration

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA public TO bloomberg_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bloomberg_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bloomberg_user;

-- Future tables auto-grant
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO bloomberg_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO bloomberg_user;

\echo '✅ Bloomberg Tracker database initialized successfully'
