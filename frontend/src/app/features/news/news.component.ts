import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy,
  ChangeDetectorRef, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { MarketService } from '../../core/services/market.service';

@Component({
  selector: 'app-news',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<div class="news-shell">
  <div class="news-sidebar">
    <div class="news-sidebar__title">CATEGORIES</div>
    @for (cat of categories; track cat.id) {
      <div class="news-sidebar__cat" [class.active]="activeCategory === cat.id"
        (click)="loadCategory(cat.id)">
        <span>{{ cat.icon }}</span><span>{{ cat.label }}</span>
      </div>
    }
    <div class="news-sidebar__title" style="margin-top:16px">SOURCES</div>
    @for (src of activeSources(); track src) {
      <div class="news-sidebar__src" (click)="filterBySource(src)" [class.active]="sourceFilter === src">{{ src }}</div>
    }
    @if (sourceFilter) {
      <div style="padding:6px 12px">
        <button class="bb-btn bb-btn--sm" style="width:100%" (click)="sourceFilter='';filterNews()">Clear Filter</button>
      </div>
    }
  </div>
  <div class="news-main">
    <div class="news-toolbar">
      <div class="news-search-wrap">
        <span style="color:#4a5e7a">S</span>
        <input class="news-search-input" placeholder="Search headlines..." [(ngModel)]="searchQ" (input)="filterNews()" />
        @if (searchQ) { <button (click)="searchQ='';filterNews()" style="background:none;border:none;color:#4a5e7a;cursor:pointer">✕</button> }
      </div>
      <div style="display:flex;gap:3px">
        @for (v of views; track v.id) {
          <button class="bb-btn bb-btn--sm" [class.active]="viewMode===v.id" (click)="viewMode=v.id" [title]="v.label">{{ v.icon }}</button>
        }
      </div>
      <span class="news-count mono">{{ filteredNews().length }}</span>
    </div>

    @if (loading() && filteredNews().length===0) {
      <div class="news-loading"><div class="news-spinner"></div><span>Loading...</span></div>
    } @else if (filteredNews().length===0) {
      <div class="news-empty"><div style="font-size:32px;opacity:0.2">N</div><span>No articles found</span></div>
    } @else {
      <div class="news-content" [class.grid]="viewMode==='grid'" [class.compact]="viewMode==='compact'">
        @for (n of filteredNews(); track n.datetime) {
          <a class="news-card" [href]="n.url" target="_blank" rel="noopener"
            [class.pos]="n.sentiment==='positive'" [class.neg]="n.sentiment==='negative'">
            @if (n.image && viewMode==='grid') {
              <img [src]="n.image" class="news-card-img" loading="lazy" onerror="this.style.display='none'" />
            }
            <div class="news-card-body">
              <div class="news-meta-row">
                <span class="news-src">{{ n.source }}</span>
                @if (n.category) { <span class="news-cat">{{ n.category | uppercase }}</span> }
                @if (n.sentiment==='positive') { <span class="gain" style="font-size:8px;font-weight:700">^POS</span> }
                @else if (n.sentiment==='negative') { <span class="loss" style="font-size:8px;font-weight:700">vNEG</span> }
                <span class="news-time">{{ fmtTime(n.datetime) }}</span>
              </div>
              <div class="news-headline" [class.compact-hl]="viewMode==='compact'">{{ n.headline }}</div>
              @if (n.summary && viewMode!=='compact') {
                <div class="news-summary">{{ n.summary | slice:0:200 }}{{ (n.summary?.length??0)>200?'…':'' }}</div>
              }
              @if (n.related && viewMode!=='compact') {
                <div class="news-tickers">
                  @for (sym of getRelated(n.related); track sym) {
                    <span class="news-ticker">{{ sym }}</span>
                  }
                </div>
              }
            </div>
          </a>
        }
      </div>
      @if (filteredNews().length >= 30) {
        <div class="news-load-more"><button class="bb-btn" (click)="loadMore()">Load More →</button></div>
      }
    }
  </div>
</div>
  `,
  styles: [`
    .news-shell{display:flex;height:100%;overflow:hidden;background:#060a14}
    .news-sidebar{width:180px;background:#0c1322;border-right:1px solid #1a2840;overflow-y:auto;flex-shrink:0}
    .news-sidebar::-webkit-scrollbar{width:3px} .news-sidebar::-webkit-scrollbar-thumb{background:#1e3555}
    .news-sidebar__title{padding:10px 12px 4px;font-size:9px;font-weight:700;letter-spacing:1.5px;color:#4a5e7a;text-transform:uppercase}
    .news-sidebar__cat{display:flex;align-items:center;gap:7px;padding:8px 12px;font-size:11px;color:#8da0bc;cursor:pointer;border-left:2px solid transparent;transition:all 150ms}
    .news-sidebar__cat:hover{color:#d4e0f5;background:#131d30}
    .news-sidebar__cat.active{color:#ff9500;border-left-color:#ff9500;background:rgba(255,149,0,0.05)}
    .news-sidebar__src{padding:5px 12px;font-size:10px;color:#4a5e7a;cursor:pointer;border-left:2px solid transparent;transition:all 150ms}
    .news-sidebar__src:hover{color:#8da0bc}
    .news-sidebar__src.active{color:#ff9500;border-left-color:#ff9500}
    .news-main{flex:1;display:flex;flex-direction:column;overflow:hidden}
    .news-toolbar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #1a2840;flex-shrink:0;background:#0d1526}
    .news-search-wrap{display:flex;align-items:center;gap:6px;background:#060a14;border:1px solid #1a2840;border-radius:2px;padding:0 8px;height:28px;flex:1;max-width:360px}
    .news-search-wrap:focus-within{border-color:#ff9500}
    .news-search-input{background:none;border:none;outline:none;color:#d4e0f5;font-size:11px;font-family:'IBM Plex Mono',monospace;flex:1}
    .news-search-input::placeholder{color:#4a5e7a}
    .news-count{font-size:9px;color:#4a5e7a;margin-left:auto}
    .news-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:12px;color:#4a5e7a;font-size:12px}
    .news-spinner{width:28px;height:28px;border:2px solid #1a2840;border-top-color:#ff9500;border-radius:50%;animation:spin 0.8s linear infinite}
    @keyframes spin { to { transform: rotate(360deg); } }
    .news-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:12px;color:#4a5e7a;font-size:12px}
    .news-content{flex:1;overflow-y:auto;background:#1a2840;display:flex;flex-direction:column;gap:0}
    .news-content::-webkit-scrollbar{width:4px} .news-content::-webkit-scrollbar-thumb{background:#1e3555}
    .news-content.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1px}
    .news-load-more{display:flex;justify-content:center;padding:16px;border-top:1px solid #1a2840;flex-shrink:0;background:#060a14}
    .news-card{display:flex;flex-direction:column;background:#0c1322;text-decoration:none;cursor:pointer;transition:background 150ms;border-left:3px solid transparent}
    .news-card:hover{background:#131d30}
    .news-card.pos{border-left-color:rgba(0,217,126,0.5)}
    .news-card.neg{border-left-color:rgba(255,51,85,0.5)}
    .news-card-img{width:100%;height:130px;object-fit:cover;opacity:0.85}
    .news-card-body{padding:10px 12px;flex:1}
    .news-meta-row{display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap}
    .news-src{font-size:9px;font-weight:700;letter-spacing:1px;color:#ff9500;text-transform:uppercase}
    .news-cat{font-size:9px;color:#4a5e7a}
    .news-time{font-size:9px;color:#4a5e7a;font-family:'IBM Plex Mono',monospace;margin-left:auto}
    .news-headline{font-size:12px;color:#d4e0f5;font-weight:500;line-height:1.5;margin-bottom:5px}
    .news-headline.compact-hl{font-size:11px;margin-bottom:0;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;display:-webkit-box}
    .news-summary{font-size:10px;color:#8da0bc;line-height:1.5;margin-bottom:5px}
    .news-tickers{display:flex;flex-wrap:wrap;gap:4px}
    .news-ticker{font-size:9px;padding:2px 6px;background:rgba(255,149,0,0.1);color:#ff9500;border-radius:2px;font-family:'IBM Plex Mono',monospace;font-weight:700}
    .gain{color:#00d97e}.loss{color:#ff3355}.mono{font-family:'IBM Plex Mono',monospace;font-feature-settings:'tnum'}
    .bb-btn.active{background:rgba(255,149,0,0.1);border-color:#c47300;color:#ff9500}
  `],
})
export class NewsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private page = 1;
  allNews      = signal<any[]>([]);
  filteredNews = signal<any[]>([]);
  activeSources= signal<string[]>([]);
  loading      = signal(true);
  searchQ      = '';
  activeCategory = 'general';
  sourceFilter   = '';
  viewMode     = 'list';
  views = [
    { id:'grid',    icon:'+', label:'Grid' },
    { id:'list',    icon:'=', label:'List' },
    { id:'compact', icon:'=', label:'Compact' },
  ];
  categories = [
    { id:'general',    icon:'o', label:'General'    },
    { id:'forex',      icon:'$', label:'Forex'      },
    { id:'crypto',     icon:'B', label:'Crypto'     },
    { id:'merger',     icon:'M', label:'M&A'        },
    { id:'technology', icon:'!', label:'Technology' },
  ];
  constructor(private market: MarketService, private cdr: ChangeDetectorRef) {}
  ngOnInit() { this.loadCategory('general'); }
  loadCategory(cat: string) {
    this.activeCategory = cat; this.sourceFilter = ''; this.searchQ = ''; this.page = 1;
    this.loading.set(true);
    this.market.getMarketNews(cat, 1).pipe(takeUntil(this.destroy$)).subscribe(news => {
      this.allNews.set(news);
      this.applyFilters();
      this.activeSources.set([...new Set(news.map((n:any) => n.source as string))].slice(0,12));
      this.loading.set(false);
      this.cdr.markForCheck();
    });
  }
  filterNews() { this.applyFilters(); this.cdr.markForCheck(); }
  filterBySource(src: string) { this.sourceFilter = this.sourceFilter===src?'':src; this.applyFilters(); this.cdr.markForCheck(); }
  loadMore() {
    this.page++;
    this.market.getMarketNews(this.activeCategory, this.page).pipe(takeUntil(this.destroy$)).subscribe(more => {
      this.allNews.update(p => [...p, ...more]);
      this.applyFilters();
      this.cdr.markForCheck();
    });
  }
  private applyFilters() {
    let items = this.allNews();
    if (this.searchQ) { const q=this.searchQ.toLowerCase(); items=items.filter(n=>n.headline?.toLowerCase().includes(q)||n.source?.toLowerCase().includes(q)); }
    if (this.sourceFilter) items=items.filter(n=>n.source===this.sourceFilter);
    this.filteredNews.set(items);
  }
  getRelated(r: string): string[] { return (r||'').split(',').map(s=>s.trim()).filter(Boolean).slice(0,5); }
  fmtTime(ts: number): string {
    const diff=(Date.now()/1000)-ts;
    if(diff<3600) return Math.floor(diff/60)+'m ago';
    if(diff<86400) return Math.floor(diff/3600)+'h ago';
    return new Date(ts*1000).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}
