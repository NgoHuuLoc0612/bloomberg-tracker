import { Routes } from '@angular/router';
import type { Type } from '@angular/core';

// Helper to handle lazy loaded components safely
const lazyLoad = <T>(fn: () => Promise<{ [key: string]: Type<T> }>, key: string) =>
  () => fn().then(m => m[key] ?? Object.values(m).find(Boolean));

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: lazyLoad(
      () => import('./features/dashboard/dashboard.component'),
      'DashboardComponent'
    ),
    title: 'Bloomberg — Dashboard',
  },
  {
    path: 'chart/:symbol',
    loadComponent: lazyLoad(
      () => import('./features/chart/chart.component'),
      'ChartComponent'
    ),
    title: 'Bloomberg — Chart',
  },
  {
    path: 'chart',
    loadComponent: lazyLoad(
      () => import('./features/chart/chart.component'),
      'ChartComponent'
    ),
    title: 'Bloomberg — Chart',
  },
  {
    path: 'portfolio',
    loadComponent: lazyLoad(
      () => import('./features/portfolio/portfolio.component'),
      'PortfolioComponent'
    ),
    title: 'Bloomberg — Portfolio',
  },
  {
    path: 'crypto',
    loadComponent: lazyLoad(
      () => import('./features/crypto/crypto.component'),
      'CryptoComponent'
    ),
    title: 'Bloomberg — Crypto Markets',
  },
  {
    path: 'screener',
    loadComponent: lazyLoad(
      () => import('./features/screener/screener.component'),
      'ScreenerComponent'
    ),
    title: 'Bloomberg — Stock Screener',
  },
  {
    path: 'watchlist',
    loadComponent: lazyLoad(
      () => import('./features/watchlist/watchlist.component'),
      'WatchlistComponent'
    ),
    title: 'Bloomberg — Watchlist',
  },
  {
    path: 'news',
    loadComponent: lazyLoad(
      () => import('./features/news/news.component'),
      'NewsComponent'
    ),
    title: 'Bloomberg — Market News',
  },
  {
    path: 'calendar',
    loadComponent: lazyLoad(
      () => import('./features/economic-calendar/economic-calendar.component'),
      'EconomicCalendarComponent'
    ),
    title: 'Bloomberg — Economic Calendar',
  },
  { path: '**', redirectTo: 'dashboard' },
];
