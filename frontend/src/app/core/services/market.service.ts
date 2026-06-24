import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, catchError, map, tap } from 'rxjs';
import type {
  StockQuote, OHLCVCandle, TechnicalIndicators,
  CompanyProfile, EarningsReport, RecommendationTrend,
  NewsArticle, ScreenerResult, ScreenerFilters, MarketStatus
} from '../models/stock.model';
import { stockQuotes, indicesTape, marketStatus } from '../signals/market.store';

const API = 'http://localhost:3000/api/v1';

interface ApiResponse<T> { success: boolean; data: T; count?: number; meta?: any; }

@Injectable({ providedIn: 'root' })
export class MarketService {
  constructor(private http: HttpClient) {}

  // ─── Quotes ────────────────────────────────────────────────────────────────
  getQuote(symbol: string): Observable<StockQuote | null> {
    return this.http.get<ApiResponse<StockQuote>>(`${API}/stocks/quote/${symbol.toUpperCase()}`).pipe(
      map(r => r.data),
      tap(q => {
        if (q) {
          stockQuotes.update(m => { const n = new Map(m); n.set(q.symbol, q); return n; });
        }
      }),
      catchError(() => of(null)),
    );
  }

  getBatchQuotes(symbols: string[]): Observable<Record<string, StockQuote>> {
    return this.http.get<ApiResponse<Record<string, StockQuote>>>(
      `${API}/stocks/quotes/batch`,
      { params: { symbols: symbols.join(',') } }
    ).pipe(
      map(r => r.data),
      tap(quotes => {
        stockQuotes.update(m => {
          const n = new Map(m);
          Object.values(quotes).forEach(q => n.set(q.symbol, q));
          return n;
        });
      }),
      catchError(() => of({})),
    );
  }

  getCandles(
    symbol: string,
    interval = 'D',
    from?: number,
    to?: number,
    source = 'twelvedata'
  ): Observable<OHLCVCandle[]> {
    let params = new HttpParams().set('interval', interval).set('source', source);
    if (from) params = params.set('from', from.toString());
    if (to)   params = params.set('to', to.toString());
    return this.http.get<ApiResponse<OHLCVCandle[]>>(
      `${API}/stocks/candles/${symbol.toUpperCase()}`, { params }
    ).pipe(map(r => r.data ?? []), catchError(() => of([])));
  }

  getIndicators(symbol: string, interval = 'daily', indicators?: string[]): Observable<TechnicalIndicators> {
    let params = new HttpParams().set('interval', interval);
    if (indicators?.length) params = params.set('indicators', indicators.join(','));
    return this.http.get<ApiResponse<TechnicalIndicators>>(
      `${API}/stocks/indicators/${symbol.toUpperCase()}`, { params }
    ).pipe(map(r => r.data ?? {}), catchError(() => of({})));
  }

  getCompanyProfile(symbol: string): Observable<CompanyProfile | null> {
    return this.http.get<ApiResponse<CompanyProfile>>(`${API}/stocks/profile/${symbol.toUpperCase()}`).pipe(
      map(r => r.data), catchError(() => of(null))
    );
  }

  getEarnings(symbol: string): Observable<EarningsReport[]> {
    return this.http.get<ApiResponse<EarningsReport[]>>(`${API}/stocks/earnings/${symbol.toUpperCase()}`).pipe(
      map(r => r.data ?? []), catchError(() => of([]))
    );
  }

  getRecommendations(symbol: string): Observable<RecommendationTrend[]> {
    return this.http.get<ApiResponse<RecommendationTrend[]>>(`${API}/stocks/recommendations/${symbol.toUpperCase()}`).pipe(
      map(r => r.data ?? []), catchError(() => of([]))
    );
  }

  searchSymbols(query: string): Observable<Array<{ symbol: string; description: string; type: string }>> {
    return this.http.get<ApiResponse<any[]>>(
      `${API}/stocks/search`, { params: { q: query } }
    ).pipe(map(r => r.data ?? []), catchError(() => of([])));
  }

  getMarketStatus(): Observable<MarketStatus> {
    return this.http.get<ApiResponse<MarketStatus>>(`${API}/stocks/market-status`).pipe(
      map(r => r.data),
      tap(s => marketStatus.set(s)),
      catchError(() => of({ isOpen: false, session: 'closed', timezone: 'America/New_York' }))
    );
  }

  getIndices(): Observable<Record<string, StockQuote>> {
    return this.http.get<ApiResponse<Record<string, StockQuote>>>(`${API}/stocks/indices`).pipe(
      map(r => r.data ?? {}),
      tap(quotes => {
        const list = Object.values(quotes);
        indicesTape.set(list);
      }),
      catchError(() => of({})),
    );
  }

  getTopMovers(type: 'gainers' | 'losers' | 'active' = 'gainers'): Observable<StockQuote[]> {
    return this.http.get<ApiResponse<StockQuote[]>>(
      `${API}/stocks/movers`, { params: { type } }
    ).pipe(map(r => r.data ?? []), catchError(() => of([])));
  }

  getInsider(symbol: string): Observable<any> {
    return this.http.get<ApiResponse<any>>(`${API}/stocks/insider/${symbol.toUpperCase()}`).pipe(
      map(r => r.data), catchError(() => of({ data: [] }))
    );
  }

  // ─── Screener ──────────────────────────────────────────────────────────────
  screenStocks(filters: ScreenerFilters): Observable<{ data: ScreenerResult[]; meta: any }> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<{ success: boolean; data: ScreenerResult[]; meta: any }>(
      `${API}/screener`, { params }
    ).pipe(map(r => ({ data: r.data ?? [], meta: r.meta })), catchError(() => of({ data: [], meta: null })));
  }

  getScreenerPreset(preset: string): Observable<ScreenerResult[]> {
    return this.http.get<ApiResponse<ScreenerResult[]>>(`${API}/screener/presets/${preset}`).pipe(
      map(r => r.data ?? []), catchError(() => of([]))
    );
  }

  getSectorHeatmap(): Observable<any[]> {
    return this.http.get<ApiResponse<any[]>>(`${API}/screener/heatmap`).pipe(
      map(r => r.data ?? []), catchError(() => of([]))
    );
  }

  getTopMoversScreen(): Observable<{ gainers: any[]; losers: any[]; mostActive: any[] }> {
    return this.http.get<ApiResponse<any>>(`${API}/screener/top-movers`).pipe(
      map(r => r.data ?? { gainers: [], losers: [], mostActive: [] }),
      catchError(() => of({ gainers: [], losers: [], mostActive: [] }))
    );
  }

  // ─── News ──────────────────────────────────────────────────────────────────
  getMarketNews(category = 'general', page = 1): Observable<NewsArticle[]> {
    return this.http.get<ApiResponse<NewsArticle[]>>(
      `${API}/news/market`, { params: { category, page: String(page) } }
    ).pipe(map(r => r.data ?? []), catchError(() => of([])));
  }

  getCompanyNews(symbol: string): Observable<NewsArticle[]> {
    return this.http.get<ApiResponse<NewsArticle[]>>(
      `${API}/news/company/${symbol.toUpperCase()}`
    ).pipe(map(r => r.data ?? []), catchError(() => of([])));
  }
}
