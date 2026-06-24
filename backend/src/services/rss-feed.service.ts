import Parser from 'rss-parser';
import { withCache, redisClient } from '../config/redis.js';

export interface FeedItem {
  id: string;
  source: string;
  category: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string;
}

interface FeedSource {
  source: string;
  category: string;
  url: string;
}

const FEED_SOURCES: FeedSource[] = [
  { source: 'MarketWatch',     category: 'markets',       url: 'https://feeds.marketwatch.com/marketwatch/topstories/' },
  { source: 'Seeking Alpha',   category: 'analysis',      url: 'https://seekingalpha.com/feed.xml' },
  { source: 'Benzinga',        category: 'markets',       url: 'https://feeds.benzinga.com/benzinga' },
  { source: 'SEC',             category: 'regulatory',    url: 'https://www.sec.gov/news/pressreleases.rss' },
  { source: 'Federal Reserve', category: 'central-bank',  url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { source: 'IMF',             category: 'macro',         url: 'https://www.imf.org/en/news/rss' },
  { source: 'CoinDesk',        category: 'crypto',        url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
];

const parser = new Parser({
  timeout: 8000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BloombergTrackerBot/1.0)' },
});

function makeId(source: string, link: string): string {
  return Buffer.from(`${source}:${link}`).toString('base64url');
}

async function fetchOneFeed(feedSource: FeedSource): Promise<FeedItem[]> {
  try {
    const feed = await parser.parseURL(feedSource.url);
    return (feed.items || []).slice(0, 20).map((item) => ({
      id:          makeId(feedSource.source, item.link || item.guid || item.title || ''),
      source:      feedSource.source,
      category:    feedSource.category,
      title:       item.title?.trim() || '(untitled)',
      link:        item.link || '',
      summary:     (item.contentSnippet || item.summary || '').trim().slice(0, 300),
      publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
    }));
  } catch (err: any) {
    console.error(`[rss-feed] Failed to fetch ${feedSource.source}: ${err.message}`);
    return [];
  }
}

export class RssFeedService {
  async getAllFeeds(): Promise<FeedItem[]> {
    return withCache('rss:all-feeds', 300, async () => {
      const results = await Promise.all(FEED_SOURCES.map(fetchOneFeed));
      const merged = results.flat();
      merged.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      return merged;
    });
  }

  async getFeedsBySource(source: string): Promise<FeedItem[]> {
    const all = await this.getAllFeeds();
    return all.filter((item) => item.source.toLowerCase() === source.toLowerCase());
  }

  async getFeedsByCategory(category: string): Promise<FeedItem[]> {
    const all = await this.getAllFeeds();
    return all.filter((item) => item.category === category);
  }

  listSources(): { source: string; category: string }[] {
    return FEED_SOURCES.map(({ source, category }) => ({ source, category }));
  }

  async refresh(): Promise<FeedItem[]> {
    await redisClient.del('rss:all-feeds');
    return this.getAllFeeds();
  }
}

export const rssFeedService = new RssFeedService();
