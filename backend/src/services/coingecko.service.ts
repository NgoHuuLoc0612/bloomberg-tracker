import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env.js';
import { cacheKey, withCache } from '../config/redis.js';
import type { CryptoMarket } from '../schemas/zod.schemas.js';

export class CoinGeckoService {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: env.COINGECKO_BASE_URL,
      timeout: 15000,
      headers: env.COINGECKO_API_KEY
        ? { 'x-cg-pro-api-key': env.COINGECKO_API_KEY }
        : {},
    });
  }

  async getMarkets(
    vsCurrency = 'usd',
    ids?: string[],
    perPage = 100,
    page = 1
  ): Promise<CryptoMarket[]> {
    const cacheId = ids?.join(',') || 'top';
    return withCache(`${cacheKey.cryptoMarket()}:${cacheId}:${page}`, 60, async () => {
      const { data } = await this.http.get('/coins/markets', {
        params: {
          vs_currency:         vsCurrency,
          ids:                 ids?.join(','),
          order:               'market_cap_desc',
          per_page:            perPage,
          page,
          sparkline:           true,
          price_change_percentage: '1h,24h,7d,30d',
        },
      });
      return (data || []).map((c: any): CryptoMarket => ({
        id:                   c.id,
        symbol:               c.symbol.toUpperCase(),
        name:                 c.name,
        image:                c.image,
        currentPrice:         c.current_price,
        marketCap:            c.market_cap,
        marketCapRank:        c.market_cap_rank,
        fullyDilutedValuation:c.fully_diluted_valuation,
        totalVolume:          c.total_volume,
        high24h:              c.high_24h,
        low24h:               c.low_24h,
        priceChange24h:       c.price_change_24h,
        priceChangePct24h:    c.price_change_percentage_24h,
        priceChangePct7d:     c.price_change_percentage_7d_in_currency,
        priceChangePct30d:    c.price_change_percentage_30d_in_currency,
        circulatingSupply:    c.circulating_supply,
        totalSupply:          c.total_supply,
        maxSupply:            c.max_supply,
        ath:                  c.ath,
        athDate:              c.ath_date,
        sparkline:            c.sparkline_in_7d?.price,
      }));
    });
  }

  async getCoinDetails(id: string): Promise<{
    id: string; name: string; symbol: string;
    description: string; image: string;
    links: { homepage: string[]; twitter: string; reddit: string; github: string[] };
    marketData: {
      currentPrice: number; marketCap: number; totalVolume: number;
      high24h: number; low24h: number; priceChangePct24h: number;
      priceChangePct7d: number; priceChangePct30d: number; priceChangePct1y: number;
      ath: number; atl: number; circulatingSupply: number; totalSupply: number | null;
    };
    developerData: { stars: number; forks: number; pullRequests: number };
    sentimentVotes: { positive: number; negative: number };
  } | null> {
    return withCache(cacheKey.cryptoCoin(id), 300, async () => {
      const { data: c } = await this.http.get(`/coins/${id}`, {
        params: {
          localization:  false,
          tickers:       false,
          market_data:   true,
          community_data:false,
          developer_data:true,
        },
      });
      if (!c) return null;
      return {
        id:     c.id,
        name:   c.name,
        symbol: c.symbol?.toUpperCase(),
        description: c.description?.en?.split('.')[0] || '',
        image:  c.image?.large,
        links: {
          homepage: c.links?.homepage || [],
          twitter:  c.links?.twitter_screen_name,
          reddit:   c.links?.subreddit_url,
          github:   c.links?.repos_url?.github || [],
        },
        marketData: {
          currentPrice:      c.market_data?.current_price?.usd,
          marketCap:         c.market_data?.market_cap?.usd,
          totalVolume:       c.market_data?.total_volume?.usd,
          high24h:           c.market_data?.high_24h?.usd,
          low24h:            c.market_data?.low_24h?.usd,
          priceChangePct24h: c.market_data?.price_change_percentage_24h,
          priceChangePct7d:  c.market_data?.price_change_percentage_7d,
          priceChangePct30d: c.market_data?.price_change_percentage_30d,
          priceChangePct1y:  c.market_data?.price_change_percentage_1y,
          ath:               c.market_data?.ath?.usd,
          atl:               c.market_data?.atl?.usd,
          circulatingSupply: c.market_data?.circulating_supply,
          totalSupply:       c.market_data?.total_supply,
        },
        developerData: {
          stars:        c.developer_data?.stars || 0,
          forks:        c.developer_data?.forks || 0,
          pullRequests: c.developer_data?.pull_request_contributors || 0,
        },
        sentimentVotes: {
          positive: c.sentiment_votes_up_percentage || 0,
          negative: c.sentiment_votes_down_percentage || 0,
        },
      };
    });
  }

  async getOHLCV(
    id: string,
    vsCurrency = 'usd',
    days: number | 'max' = 30
  ): Promise<Array<{ time: number; open: number; high: number; low: number; close: number }>> {
    return withCache(`coingecko:ohlcv:${id}:${days}`, 3600, async () => {
      const { data } = await this.http.get(`/coins/${id}/ohlc`, {
        params: { vs_currency: vsCurrency, days },
      });
      return (data || []).map(([time, open, high, low, close]: number[]) => ({
        time: Math.floor(time / 1000),
        open, high, low, close,
      }));
    });
  }

  async getMarketChart(
    id: string,
    vsCurrency = 'usd',
    days: number | 'max' = 30
  ): Promise<{
    prices: Array<[number, number]>;
    marketCaps: Array<[number, number]>;
    totalVolumes: Array<[number, number]>;
  }> {
    return withCache(`coingecko:chart:${id}:${days}`, 1800, async () => {
      const { data } = await this.http.get(`/coins/${id}/market_chart`, {
        params: { vs_currency: vsCurrency, days, interval: (typeof days === 'number' && days <= 1) ? 'minutely' : (typeof days === 'number' && days <= 90) ? 'hourly' : 'daily' },
      });
      return {
        prices:       data.prices || [],
        marketCaps:   data.market_caps || [],
        totalVolumes: data.total_volumes || [],
      };
    });
  }

  async getGlobalStats(): Promise<{
    totalMarketCap: number;
    totalVolume: number;
    btcDominance: number;
    ethDominance: number;
    marketCapChange24h: number;
    activeCryptocurrencies: number;
    defiVolume: number;
    defiDominance: number;
  }> {
    return withCache('coingecko:global', 300, async () => {
      const { data } = await this.http.get('/global');
      const d = data?.data;
      return {
        totalMarketCap:         d?.total_market_cap?.usd || 0,
        totalVolume:            d?.total_volume?.usd || 0,
        btcDominance:           d?.market_cap_percentage?.btc || 0,
        ethDominance:           d?.market_cap_percentage?.eth || 0,
        marketCapChange24h:     d?.market_cap_change_percentage_24h_usd || 0,
        activeCryptocurrencies: d?.active_cryptocurrencies || 0,
        defiVolume:             d?.defi_volume_24h_usd || 0,
        defiDominance:          d?.defi_market_cap_percentage || 0,
      };
    });
  }

  async getTrending(): Promise<Array<{
    id: string; name: string; symbol: string;
    rank: number; image: string; score: number;
  }>> {
    return withCache('coingecko:trending', 600, async () => {
      const { data } = await this.http.get('/search/trending');
      return (data?.coins || []).map((item: any) => ({
        id:     item.item.id,
        name:   item.item.name,
        symbol: item.item.symbol,
        rank:   item.item.market_cap_rank,
        image:  item.item.thumb,
        score:  item.item.score,
      }));
    });
  }
}

export const coinGeckoService = new CoinGeckoService();
