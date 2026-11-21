import {backtest,enrich} from './engine.js';
import {renderCharts,focusTrade,fitCharts} from './charts.js';
const $=id=>document.getElementById(id);
const today=new Date(), before=new Date(Date.now()-30*86400000);
$('end').value=today.toISOString().slice(0,10);$('start').value=before.toISOString().slice(0,10);
let last=null;
const fmt=(x,n=2)=>Number.isFinite(x)?Number(x).toFixed(n):'∞';
const dt=t=>new Date(t).toLocaleString('zh-TW',{hour12:false,timeZone:'Asia/Taipei'});
function setStatus(s){$('status').textContent=s;}
async function download({symbol,market,interval,start,end}) {
  const step={'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000}[interval];
  const first=Date.parse(start+'T00:00:00Z'), until=Date.parse(end+'T00:00:00Z')+86400000;
  if(!Number.isFinite(first)||!Number.isFinite(until)||until<=first)throw Error('請檢查日期');
  const estimate=Math.ceil((until-first)/step);
  if(estimate>60000)throw Error('單次最多 60,000 根 K 線，請縮短日期或改用較大週期');
  const base=market==='futures'
    ? 'https://fapi.binance.com/fapi/v1/klines'
    : 'https://api.binance.com/api/v3/klines';
  const backup=market==='spot'?'https://data-api.binance.vision/api/v3/klines':null;
  const map=new Map(); let cursor=first, page=0;
  const now=Date.now();
  const endTime=Math.min(until-1,now-1);
  while(cursor<=endTime){
    const params=new URLSearchParams({symbol,interval,limit:'1000',startTime:String(cursor),endTime:String(endTime)});
    let data=null, lastError='';
    for(const endpoint of [base,...(backup?[backup]:[])]){
      try{
        const res=await fetch(endpoint+'?'+params,{mode:'cors'});
        if(!res.ok){
          const body=await res.text();
          throw Error('HTTP '+res.status+' '+body.slice(0,160));
        }
        data=await res.json();
        if(!Array.isArray(data))throw Error('幣安回傳格式不正確');
        break;
      }catch(err){lastError=err.message;}
    }
    if(!data)throw Error('無法從 Safari 連接 Binance：'+lastError+'。可能是地區限制、CORS 或網路封鎖；可改用 CSV 匯入。');
    if(data.length===0)break;
    let lastTime=-1;
    for(const r of data){
      const time=Number(r[0]);lastTime=Math.max(lastTime,time);
      const candle={time,open:+r[1],high:+r[2],low:+r[3],close:+r[4],volume:+r[5],closeTime:+r[6]};
      if(candle.closeTime<now && time>=first && time<until)map.set(time,candle);
    }
    if(lastTime<cursor)throw Error('幣安回傳時間異常');
    cursor=lastTime+step;
    page++;setStatus(`已下載 ${map.size.toLocaleString()} 根 K 線（第 ${page} 批）`);
    if(data.length<1000)break;
    if(page>100)throw Error('下載批次過多');
  }
  return [...map.values()].sort((a,b)=>a.time-b.time);
}
function csv(trades){const keys=['side','signalTime','entryTime','exitTime','entry','stop','target','exit','risk','reason','grossR','netR','equity'];return [keys.join(','),...trades.map(t=>keys.map(k=>k.endsWith('Time')?new Date(t[k]).toISOString():t[k]).join(','))].join('\n');}
$('run').addEventListener('click',async()=>{
  $('run').disabled=true;$('run').textContent='下載與回測中…';$('results').hidden=true;
  try{
    const symbol=$('symbol').value.trim().toUpperCase(), market=$('market').value, interval=$('interval').value;
    if(!/^[A-Z0-9]{5,24}$/.test(symbol))throw Error('請輸入有效交易對，例如 BTCUSDT');
    const candles=await download({symbol,market,interval,start:$('start').value,end:$('end').value});
    if(candles.length<50)throw Error('有效 K 線不足 50 根');
    const opts={rr:+$('rr').value,feeBps:+$('fee').value,slippageBps:+$('slippage').value,maxBars:+$('maxbars').value,firstOnly:true,riskPct:+$('risk').value,equity:10000};
    if([opts.rr,opts.feeBps,opts.slippageBps,opts.maxBars,opts.riskPct].some(x=>!Number.isFinite(x)||x<0)||opts.rr<=0||opts.maxBars<1||opts.riskPct<=0||opts.riskPct>10)throw Error('參數設定不合理');
    last=backtest(candles,opts);const s=last.stats;
    $('count').textContent=s.count;$('winrate').textContent=fmt(s.winRate)+'%';$('avgR').textContent=fmt(s.avgR,3)+'R';$('pf').textContent=fmt(s.profitFactor);$('dd').textContent=fmt(s.maxDrawdownPct)+'%';$('totalR').textContent=fmt(s.totalR,2)+'R';$('targets').textContent=s.targets;$('stops').textContent=s.stops;
    $('details').innerHTML='';for(const t of last.trades.slice(-300).reverse()){
      const tr=document.createElement('tr');for(const val of [dt(t.entryTime),t.side,fmt(t.entry),fmt(t.stop),fmt(t.target),fmt(t.exit),fmt(t.netR,2),t.reason]){const td=document.createElement('td');td.textContent=val;tr.appendChild(td)}
      tr.tabIndex=0;tr.title='點擊查看這筆交易的 K 線';
      const jump=()=>{document.querySelectorAll('#details tr.selected').forEach(x=>x.classList.remove('selected'));tr.classList.add('selected');focusTrade(t);document.getElementById('price-chart').scrollIntoView({behavior:'smooth',block:'center'});};
      tr.addEventListener('click',jump);tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();jump();}});
      $('details').appendChild(tr);
    }
    $('results').hidden=false;
    try{renderCharts(enrich(candles),last.trades);}catch(chartError){$('chart-status').textContent='圖表載入失敗：'+chartError.message+'。回測數據仍可查看。';}
    setStatus(`完成：${candles.length.toLocaleString()} 根已收盤 K 線、${s.count} 筆交易。時間採 UTC 下載，畫面以台灣時間顯示。`);
  }catch(e){setStatus('錯誤：'+e.message);}finally{$('run').disabled=false;$('run').textContent='開始下載並回測';}
});
$('export').addEventListener('click',()=>{if(!last)return;const blob=new Blob(['\uFEFF'+csv(last.trades)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='macd_5r_trades.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

$('fit-chart').addEventListener('click',fitCharts);
