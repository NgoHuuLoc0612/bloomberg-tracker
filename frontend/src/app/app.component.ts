import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy
} from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule }    from '@angular/common';
import { FormsModule }     from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { WebSocketService } from './core/services/websocket.service';
import { MarketService }    from './core/services/market.service';
import {
  wsConnected, wsLatency, serverTime, marketStatus,
  activeSymbol, sidebarOpen, searchQuery, searchResults,
  notifications, indicesTape, unreadNotifications,
  portfolioValue, dismissNotification
} from './core/signals/market.store';

@Component({
  selector:         'app-root',
  standalone:       true,
  changeDetection:  ChangeDetectionStrategy.OnPush,
  imports:          [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, FormsModule],
  templateUrl:      './app.component.html',
  styleUrls:        ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private searchSubject$ = new Subject<string>();

  readonly wsConnected         = wsConnected;
  readonly wsLatency           = wsLatency;
  readonly serverTime          = serverTime;
  readonly marketStatus        = marketStatus;
  readonly sidebarOpen         = sidebarOpen;
  readonly notifications       = notifications;
  readonly unreadNotifications = unreadNotifications;
  readonly searchResults       = searchResults;
  readonly activeSymbol        = activeSymbol;
  readonly portfolioValue      = portfolioValue;
  readonly tapeData            = indicesTape;
  readonly dismissNotification = dismissNotification;

  searchTerm        = '';
  searchOpen        = false;
  showNotifications = false;

  navItems = [
    { path: '/dashboard', icon: '+', label: 'Dashboard' },
    { path: '/chart',     icon: 'c', label: 'Charts'   },
    { path: '/portfolio', icon: 'o', label: 'Portfolio' },
    { path: '/crypto',    icon: 'B', label: 'Crypto'   },
    { path: '/screener',  icon: '#', label: 'Screener' },
    { path: '/watchlist', icon: '*', label: 'Watch'    },
    { path: '/news',      icon: 'N', label: 'News'     },
    { path: '/calendar',  icon: 'C', label: 'Calendar' },
  ];

  quickSymbols = ['AAPL','MSFT','NVDA','GOOGL','AMZN','TSLA','META','SPY','QQQ'];

  constructor(
    private ws:     WebSocketService,
    private market: MarketService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.market.getIndices().pipe(takeUntil(this.destroy$)).subscribe();
    this.market.getMarketStatus().pipe(takeUntil(this.destroy$)).subscribe();
    this.ws.subscribeStock(['AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','SPY','QQQ','DIA','VIX']);
    this.ws.subscribeCrypto(['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT']);
    this.searchSubject$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => q.length >= 1 ? this.market.searchSymbols(q) : []),
      takeUntil(this.destroy$),
    ).subscribe(results => searchResults.set(results));
  }

  onSearch(event: Event) {
    this.searchSubject$.next((event.target as HTMLInputElement).value);
  }

  onSearchBlur() { setTimeout(() => { this.searchOpen = false; }, 200); }
  closeSearch()  { this.searchTerm = ''; this.searchOpen = false; searchResults.set([]); }

  selectSymbol(result: { symbol: string }) {
    activeSymbol.set(result.symbol);
    this.router.navigate(['/chart', result.symbol]);
    this.closeSearch();
  }

  navigate(symbol: string) {
    activeSymbol.set(symbol);
    this.router.navigate(['/chart', symbol]);
  }

  toggleSidebar() { sidebarOpen.update(v => !v); }

  dismissNotif(id: string) { dismissNotification(id); }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}
