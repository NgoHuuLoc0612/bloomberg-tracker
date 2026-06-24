import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy,
  ChangeDetectorRef, signal, computed
} from '@angular/core';
import { CommonModule }    from '@angular/common';
import { RouterLink }      from '@angular/router';
import { Subject, takeUntil, interval, forkJoin } from 'rxjs';
import { MarketService }   from '../../core/services/market.service';
import { CryptoService }   from '../../core/services/crypto.service';
import { WebSocketService } from '../../core/services/websocket.service';
import {
  tickCache, cryptoMarkets, cryptoGlobal,
  indicesTape, activeSymbol, topGainers, topLosers
} from '../../core/signals/market.store';
import type { StockQuote } from '../../core/models/stock.model';

interface HeatmapCell { symbol:string; name?:string; sector?:string; changePct:number; marketCap:number; weight:number; }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls:   ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  readonly indicesTape   = indicesTape;
  readonly cryptoMarkets = cryptoMarkets;
  readonly global        = cryptoGlobal;
  readonly topGainers    = topGainers;
  readonly topLosers     = topLosers;
  readonly Math          = Math;
  gainers     = signal<StockQuote[]>([]);
  losers      = signal<StockQuote[]>([]);
  mostActive  = signal<StockQuote[]>([]);
  news        = signal<any[]>([]);
  sectors     = signal<any[]>([]);
  heatmapData = signal<HeatmapCell[]>([]);
  moversTab   = 'GAINERS';
  currentMovers = computed(() => {
    switch (this.moversTab) {
      case 'LOSERS': return this.losers();
      case 'ACTIVE': return this.mostActive();
      default:       return this.gainers();
    }
  });
  btcArc = computed(() => (this.global()?.btcDominance ?? 0) / 100 * 314);
  ethArc = computed(() => (this.global()?.ethDominance ?? 0) / 100 * 314);
  constructor(private market:MarketService, private crypto:CryptoService, private ws:WebSocketService, private cdr:ChangeDetectorRef) {}
  ngOnInit() { this.loadAll(); interval(60_000).pipe(takeUntil(this.destroy$)).subscribe(() => this.loadAll()); }
  private loadAll() {
    forkJoin({ movers:this.market.getTopMoversScreen(), news:this.market.getMarketNews('general'), heatmap:this.market.getSectorHeatmap(), indices:this.market.getIndices() })
      .pipe(takeUntil(this.destroy$)).subscribe(data => {
        this.gainers.set(data.movers.gainers);
        this.losers.set(data.movers.losers);
        this.mostActive.set(data.movers.mostActive);
        this.news.set(data.news.slice(0,15));
        const hmap = (data.heatmap as any[]).map(s => ({ symbol:s.symbol, name:s.companyName, sector:s.sector, changePct:Number(s.changePercent??0), marketCap:Number(s.marketCap??0), weight:0 }));
        const total = hmap.reduce((s,c)=>s+c.marketCap,0);
        hmap.forEach(c=>{ c.weight=total>0?(c.marketCap/total)*100:1; });
        this.heatmapData.set(hmap);
        this.cdr.markForCheck();
      });
    this.crypto.getMarkets(undefined,50).pipe(takeUntil(this.destroy$)).subscribe(()=>this.cdr.markForCheck());
    this.crypto.getGlobalStats().pipe(takeUntil(this.destroy$)).subscribe(()=>this.cdr.markForCheck());
    this.crypto.getSectors().pipe(takeUntil(this.destroy$)).subscribe(s=>{this.sectors.set(s);this.cdr.markForCheck();});
    this.ws.subscribeStock(['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','SPY','QQQ','VIX']);
    this.ws.subscribeCrypto(['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT']);
  }
  navigate(symbol: string) { activeSymbol.set(symbol); }
  heatColor(pct: number): string {
    const c=Math.max(-5,Math.min(5,pct));
    if(c>0){const i=Math.round((c/5)*180);return `rgba(0,${i+75},${Math.round(i*0.4)},0.9)`;}
    const i=Math.round((Math.abs(c)/5)*180);return `rgba(${i+75},${Math.round(i*0.08)},${Math.round(i*0.12)},0.9)`;
  }
  cellWidth(w:number):number{return Math.max(3,Math.min(22,w*1.5));}
  fmtMcap(v:number):string{return v>=1e12?'$'+(v/1e12).toFixed(2)+'T':v>=1e9?'$'+(v/1e9).toFixed(2)+'B':'$'+(v/1e6).toFixed(1)+'M';}
  fmtVol(v:number):string{return v>=1e9?(v/1e9).toFixed(1)+'B':v>=1e6?(v/1e6).toFixed(1)+'M':(v/1e3).toFixed(0)+'K';}
  fmtCryptoPrice(p:number):string{return p>=1000?p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):p>=1?p.toFixed(4):p>=0.01?p.toFixed(6):p.toFixed(8);}
  fmtTime(ts:number):string{const d=(Date.now()/1000)-ts;return d<3600?Math.floor(d/60)+'m':d<86400?Math.floor(d/3600)+'h':Math.floor(d/86400)+'d';}
  ngOnDestroy(){this.destroy$.next();this.destroy$.complete();}
}
