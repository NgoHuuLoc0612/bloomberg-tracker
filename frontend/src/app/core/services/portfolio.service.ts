import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map, tap } from 'rxjs';
import type {
  Portfolio, PortfolioValue, Transaction,
  Watchlist, WatchlistItem, PriceAlert
} from '../models/crypto.model';
import { portfolioValue, portfolioList, watchlists, activeAlerts } from '../signals/market.store';

const API = 'http://localhost:3000/api/v1/portfolio';
interface ApiResponse<T> { success: boolean; data: T; meta?: any; }

@Injectable({ providedIn: 'root' })
export class PortfolioService {
  constructor(private http: HttpClient) {}

  // ─── Portfolios ────────────────────────────────────────────────────────────
  getPortfolios(): Observable<Portfolio[]> {
    return this.http.get<ApiResponse<Portfolio[]>>(`${API}/portfolios`).pipe(
      map(r => r.data ?? []),
      tap(data => portfolioList.set(data)),
      catchError(() => of([]))
    );
  }

  createPortfolio(name: string, description?: string, currency = 'USD'): Observable<Portfolio | null> {
    return this.http.post<ApiResponse<Portfolio>>(`${API}/portfolios`, { name, description, currency }).pipe(
      map(r => r.data),
      tap(() => this.getPortfolios().subscribe()),
      catchError(() => of(null))
    );
  }

  deletePortfolio(id: string): Observable<boolean> {
    return this.http.delete<ApiResponse<any>>(`${API}/portfolios/${id}`).pipe(
      map(() => true), catchError(() => of(false))
    );
  }

  getPortfolioValue(id: string): Observable<PortfolioValue | null> {
    return this.http.get<ApiResponse<PortfolioValue>>(`${API}/portfolios/${id}/value`).pipe(
      map(r => r.data),
      tap(v => portfolioValue.set(v)),
      catchError(() => of(null))
    );
  }

  getPortfolioSnapshots(id: string): Observable<any[]> {
    return this.http.get<ApiResponse<any>>(`${API}/portfolios/${id}`).pipe(
      map(r => r.data?.snapshots ?? []),
      catchError(() => of([]))
    );
  }

  // ─── Transactions ────────────────────────────────────────────────────────────
  getTransactions(portfolioId: string, params?: { symbol?: string; type?: string; page?: number }): Observable<{ data: Transaction[]; meta: any }> {
    const query = new URLSearchParams();
    if (params?.symbol) query.set('symbol', params.symbol);
    if (params?.type)   query.set('type', params.type);
    if (params?.page)   query.set('page', String(params.page));
    return this.http.get<ApiResponse<Transaction[]>>(
      `${API}/portfolios/${portfolioId}/transactions?${query}`
    ).pipe(map(r => ({ data: r.data ?? [], meta: r.meta })), catchError(() => of({ data: [], meta: null })));
  }

  addTransaction(tx: {
    portfolioId: string; symbol: string; assetType: string; type: string;
    shares: number; price: number; fees?: number; notes?: string; executedAt: string;
  }): Observable<Transaction | null> {
    return this.http.post<ApiResponse<Transaction>>(`${API}/transactions`, tx).pipe(
      map(r => r.data), catchError(() => of(null))
    );
  }

  // ─── Watchlists ────────────────────────────────────────────────────────────
  getWatchlists(): Observable<Watchlist[]> {
    return this.http.get<ApiResponse<Watchlist[]>>(`${API}/watchlists`).pipe(
      map(r => r.data ?? []),
      tap(data => watchlists.set(data)),
      catchError(() => of([]))
    );
  }

  createWatchlist(name: string, description?: string): Observable<Watchlist | null> {
    return this.http.post<ApiResponse<Watchlist>>(`${API}/watchlists`, { name, description }).pipe(
      map(r => r.data),
      tap(() => this.getWatchlists().subscribe()),
      catchError(() => of(null))
    );
  }

  addToWatchlist(watchlistId: string, symbol: string, assetType: string): Observable<WatchlistItem | null> {
    return this.http.post<ApiResponse<WatchlistItem>>(
      `${API}/watchlists/${watchlistId}/items`, { symbol: symbol.toUpperCase(), assetType }
    ).pipe(map(r => r.data), catchError(() => of(null)));
  }

  removeFromWatchlist(watchlistId: string, symbol: string): Observable<boolean> {
    return this.http.delete<ApiResponse<any>>(
      `${API}/watchlists/${watchlistId}/items/${symbol.toUpperCase()}`
    ).pipe(map(() => true), catchError(() => of(false)));
  }

  // ─── Alerts ────────────────────────────────────────────────────────────────
  getAlerts(): Observable<PriceAlert[]> {
    return this.http.get<ApiResponse<PriceAlert[]>>(`${API}/alerts`).pipe(
      map(r => r.data ?? []),
      tap(data => activeAlerts.set(data)),
      catchError(() => of([]))
    );
  }

  createAlert(alert: {
    symbol: string; assetType: string; alertType: string;
    condition: string; targetPrice: number; message?: string; expiresAt?: string;
  }): Observable<PriceAlert | null> {
    return this.http.post<ApiResponse<PriceAlert>>(`${API}/alerts`, alert).pipe(
      map(r => r.data),
      tap(() => this.getAlerts().subscribe()),
      catchError(() => of(null))
    );
  }

  toggleAlert(id: string, isActive: boolean): Observable<PriceAlert | null> {
    return this.http.patch<ApiResponse<PriceAlert>>(`${API}/alerts/${id}/toggle`, { isActive }).pipe(
      map(r => r.data), catchError(() => of(null))
    );
  }

  deleteAlert(id: string): Observable<boolean> {
    return this.http.delete<ApiResponse<any>>(`${API}/alerts/${id}`).pipe(
      map(() => true), catchError(() => of(false))
    );
  }
}
