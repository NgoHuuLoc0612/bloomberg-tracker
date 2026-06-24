import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, catchError, map, tap } from 'rxjs';
import type { CryptoMarket, CryptoGlobalStats, BinanceTicker } from '../models/crypto.model';
import { cryptoMarkets, cryptoGlobal } from '../signals/market.store';
import { IndexedDbService } from './indexeddb.service';

const API = 'http://localhost:3000/api/v1/crypto';

interface ApiResponse<T> { success: boolean; data: T; }

@Injectable({ providedIn: 'root' })
export class CryptoService {
  constructor(private http: HttpClient, private idb: IndexedDbService) {}

  getMarkets(ids?: string[], perPage = 100, page = 1): Observable<CryptoMarket[]> {
    let params = new HttpParams().set('per_page', perPage).set('page', page);
    if (ids?.length) params = params.set('ids', ids.join(','));
    return this.http.get<ApiResponse<CryptoMarket[]>>(`${API}/markets`, { params }).pipe(
      map(r => r.data ?? []),
      tap(data => {
        cryptoMarkets.set(data);
        this.idb.saveCryptoMarkets(data);
      }),
      catchError(async () => {
        const cached = await this.idb.getCryptoMarkets();
        return cached ?? [];
      }),
    );
  }

  getCoinDetails(id: string): Observable<any> {
    return this.http.get<ApiResponse<any>>(`${API}/coin/${id}`).pipe(
      map(r => r.data), catchError(() => of(null))
    );
  }

  getCoinOHLCV(id: string, days = 30): Observable<any[]> {
    return this.http.get<ApiResponse<any[]>>(`${API}/coin/${id}/ohlcv`, {
      params: { days: String(days) }
    }).pipe(map(r => r.data ?? []), catchError(() => of([])));
  }

  getCoinChart(id: string, days = 30): Observable<any> {
    return this.http.get<ApiResponse<any>>(`${API}/coin/${id}/chart`, {
      params: { days: String(days) }
    }).pipe(map(r => r.data ?? {}), catchError(() => of({})));
  }

  getGlobalStats(): Observable<CryptoGlobalStats> {
    return this.http.get<ApiResponse<CryptoGlobalStats>>(`${API}/global`).pipe(
      map(r => r.data),
      tap(g => cryptoGlobal.set(g)),
      catchError(() => of({
        totalMarketCap: 0, totalVolume: 0, btcDominance: 0, ethDominance: 0,
        marketCapChange24h: 0, activeCryptocurrencies: 0, defiVolume: 0, defiDominance: 0,
      }))
    );
  }

  getTrending(): Observable<any[]> {
    return this.http.get<ApiResponse<any[]>>(`${API}/trending`).pipe(
      map(r => r.data ?? []), catchError(() => of([]))
    );
  }

  getOrderBook(symbol: string, limit = 20): Observable<any> {
    return this.http.get<ApiResponse<any>>(`${API}/orderbook/${symbol}`, {
      params: { limit: String(limit) }
    }).pipe(map(r => r.data), catchError(() => of(null)));
  }

  getBinanceTicker(symbol: string): Observable<BinanceTicker | null> {
    return this.http.get<ApiResponse<BinanceTicker>>(`${API}/binance/ticker/${symbol}`).pipe(
      map(r => r.data), catchError(() => of(null))
    );
  }

  getBinanceKlines(symbol: string, interval = '1d', limit = 500): Observable<any[]> {
    return this.http.get<ApiResponse<any[]>>(`${API}/binance/klines/${symbol}`, {
      params: { interval, limit: String(limit) }
    }).pipe(map(r => r.data ?? []), catchError(() => of([])));
  }

  getDominance(): Observable<any> {
    return this.http.get<ApiResponse<any>>(`${API}/dominance`).pipe(
      map(r => r.data), catchError(() => of({}))
    );
  }

  getDefi(): Observable<CryptoMarket[]> {
    return this.http.get<ApiResponse<CryptoMarket[]>>(`${API}/defi`).pipe(
      map(r => r.data ?? []), catchError(() => of([]))
    );
  }

  getSectors(): Observable<any[]> {
    // Return fake sector data for crypto (BTC/ETH/DeFi/L1/L2/Gaming)
    return of([
      { sector: 'Layer 1',  avgChange:  2.4, stockCount: 45 },
      { sector: 'DeFi',     avgChange:  1.1, stockCount: 82 },
      { sector: 'Layer 2',  avgChange:  3.7, stockCount: 28 },
      { sector: 'Gaming',   avgChange: -1.2, stockCount: 37 },
      { sector: 'NFT/Meta', avgChange: -2.8, stockCount: 24 },
      { sector: 'Exchange', avgChange:  0.9, stockCount: 15 },
      { sector: 'Storage',  avgChange:  0.3, stockCount: 12 },
      { sector: 'Privacy',  avgChange: -0.6, stockCount: 18 },
    ]);
  }
}
