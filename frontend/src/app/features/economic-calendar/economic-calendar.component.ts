import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy,
  signal, computed, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { HttpClient }   from '@angular/common/http';
import { Subject, takeUntil, interval } from 'rxjs';

interface FeedItem {
  id:          string;
  source:      string;
  category:    string;
  title:       string;
  link:        string;
  summary:     string;
  publishedAt: string;
}

interface ApiResponse<T> { success: boolean; data: T; meta?: any; }

const API = 'http://localhost:3000/api/v1';

const CATEGORY_LABEL: Record<string, string> = {
  markets:       'Markets',
  analysis:      'Analysis',
  regulatory:    'Regulatory',
  'central-bank':'Central Bank',
  macro:         'Macro',
  crypto:        'Crypto',
};

@Component({
  selector: 'app-economic-calendar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<div class="cal-shell">
  <div class="cal-header">
    <span class="cal-title">MARKET NEWS FEED</span>
    <div class="cal-filters">
      <div class="bb-tabs" style="border:none">
        <div class="bb-tabs__tab" [class.active]="sourceFilter() === ''" (click)="sourceFilter.set('')">All Sources</div>
        @for (s of sources(); track s.source) {
          <div class="bb-tabs__tab" [class.active]="sourceFilter() === s.source" (click)="sourceFilter.set(s.source)">{{ s.source }}</div>
        }
      </div>
      <select class="bb-select" style="width:160px" [ngModel]="categoryFilter()" (ngModelChange)="categoryFilter.set($event)">
        <option value="">All Categories</option>
        @for (c of categories(); track c) {
          <option [value]="c">{{ categoryLabel(c) }}</option>
        }
      </select>
      <button class="bb-btn bb-btn--sm" (click)="refresh()" [disabled]="loading()">
        {{ loading() ? 'Refreshing…' : '↻ Refresh' }}
      </button>
    </div>
  </div>

  @if (error()) {
    <div class="cal-error">{{ error() }}</div>
  }

  <div class="cal-body">
    @if (loading() && !items().length) {
      <div class="cal-empty">Loading news feed…</div>
    } @else if (!filteredItems().length) {
      <div class="cal-empty">No items match the current filters.</div>
    } @else {
      @for (item of filteredItems(); track item.id) {
        <a class="feed-row" [href]="item.link" target="_blank" rel="noopener">
          <span class="feed-row__source">{{ item.source }}</span>
          <span class="feed-badge" [class]="'feed-badge--' + item.category">{{ categoryLabel(item.category) }}</span>
          <span class="feed-row__title">{{ item.title }}</span>
          <span class="feed-row__time mono">{{ timeAgo(item.publishedAt) }}</span>
        </a>
      }
    }
  </div>
</div>
  `,
  styles: [`
    .cal-shell{display:flex;flex-direction:column;height:100%;overflow:hidden;background:#060a14}
    .cal-header{display:flex;align-items:center;gap:16px;padding:8px 16px;background:#0c1322;border-bottom:1px solid #1a2840;flex-shrink:0;flex-wrap:wrap}
    .cal-title{font-size:11px;font-weight:700;letter-spacing:2px;color:#8da0bc;text-transform:uppercase;white-space:nowrap}
    .cal-filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .cal-error{padding:8px 16px;background:rgba(255,51,85,0.1);color:#ff3355;font-size:11px}
    .cal-body{flex:1;overflow:auto}
    .cal-empty{padding:32px;text-align:center;color:#4a5e7a;font-size:12px}
    .feed-row{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid #131c30;text-decoration:none;color:inherit;transition:background 120ms}
    .feed-row:hover{background:#0d1526}
    .feed-row__source{font-size:10px;font-weight:700;color:#8da0bc;width:96px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .feed-row__title{flex:1;font-size:12px;color:#d4e0f5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .feed-row__time{font-size:10px;color:#4a5e7a;flex-shrink:0;white-space:nowrap}
    .feed-badge{font-size:8px;padding:2px 6px;border-radius:2px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;flex-shrink:0;white-space:nowrap}
    .feed-badge--markets{background:rgba(0,212,255,0.12);color:#00d4ff}
    .feed-badge--analysis{background:rgba(255,149,0,0.12);color:#ff9500}
    .feed-badge--regulatory{background:rgba(255,51,85,0.12);color:#ff3355}
    .feed-badge--central-bank{background:rgba(168,85,247,0.15);color:#a855f7}
    .feed-badge--macro{background:rgba(0,217,126,0.12);color:#00d97e}
    .feed-badge--crypto{background:rgba(255,193,7,0.15);color:#ffc107}
    .mono{font-family:'IBM Plex Mono',monospace;font-feature-settings:'tnum'}
    .bb-tabs__tab.active{color:#ff9500;border-bottom-color:#ff9500}
  `]
})
export class EconomicCalendarComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private destroy$ = new Subject<void>();

  items     = signal<FeedItem[]>([]);
  sources   = signal<{ source: string; category: string }[]>([]);
  loading   = signal(false);
  error     = signal<string | null>(null);

  sourceFilter   = signal('');
  categoryFilter = signal('');

  categories = computed(() => {
    const set = new Set(this.sources().map(s => s.category));
    return Array.from(set);
  });

  filteredItems = computed(() => {
    const src = this.sourceFilter();
    const cat = this.categoryFilter();
    return this.items().filter(i => {
      if (src && i.source !== src) return false;
      if (cat && i.category !== cat) return false;
      return true;
    });
  });

  categoryLabel = (c: string) => CATEGORY_LABEL[c] || c;

  timeAgo(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  loadFeed() {
    this.loading.set(true);
    this.error.set(null);
    this.http.get<ApiResponse<FeedItem[]>>(`${API}/economic-calendar/feed`).subscribe({
      next: (res) => { this.items.set(res.data || []); this.loading.set(false); },
      error: () => { this.error.set('Failed to load news feed.'); this.loading.set(false); },
    });
  }

  loadSources() {
    this.http.get<ApiResponse<{ source: string; category: string }[]>>(`${API}/economic-calendar/sources`)
      .subscribe({ next: (res) => this.sources.set(res.data || []) });
  }

  refresh() {
    this.loading.set(true);
    this.error.set(null);
    this.http.post<ApiResponse<FeedItem[]>>(`${API}/economic-calendar/refresh`, {}).subscribe({
      next: (res) => { this.items.set(res.data || []); this.loading.set(false); },
      error: () => { this.error.set('Failed to refresh news feed.'); this.loading.set(false); },
    });
  }

  ngOnInit() {
    this.loadSources();
    this.loadFeed();
    interval(300000).pipe(takeUntil(this.destroy$)).subscribe(() => this.loadFeed());
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}
