// Interactive visualization only. Trading decisions are produced by engine.js.
let priceChart=null, macdChart=null, candles=[], trades=[], selectedLines=[];
let priceSeries=null, syncBusy=false, resizeObserver=null;
const $=id=>document.getElementById(id);
const toSeconds=ms=>Math.floor(ms/1000);
const fmt=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const timeFormatter=unix=>new Date(unix*1000).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
function clearPrevious(){
  if(resizeObserver){resizeObserver.disconnect();resizeObserver=null;}
  if(priceChart){priceChart.remove();priceChart=null;}
  if(macdChart){macdChart.remove();macdChart=null;}
  priceSeries=null;selectedLines=[];
}
export function renderCharts(enriched, completedTrades){
  clearPrevious();
  candles=enriched;trades=completedTrades;
  const LC=window.LightweightCharts;
  if(!LC)throw Error('無法載入圖表套件。請檢查網路或 Safari 內容阻擋設定。');
  const common={
    layout:{background:{type:'solid',color:'#0e1727'},textColor:'#afc3dd',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif'},
    grid:{vertLines:{color:'#1b2a3d'},horzLines:{color:'#1b2a3d'}},
    crosshair:{mode:LC.CrosshairMode.Normal},
    rightPriceScale:{borderColor:'#354761'},
    timeScale:{borderColor:'#354761',timeVisible:true,secondsVisible:false},
    localization:{timeFormatter}
  };
  const priceEl=$('price-chart'),macdEl=$('macd-chart');
  priceChart=LC.createChart(priceEl,{...common,width:priceEl.clientWidth,height:priceEl.clientHeight});
  macdChart=LC.createChart(macdEl,{...common,width:macdEl.clientWidth,height:macdEl.clientHeight});
  priceSeries=priceChart.addCandlestickSeries({upColor:'#26a69a',downColor:'#ef5350',borderVisible:false,wickUpColor:'#26a69a',wickDownColor:'#ef5350'});
  priceSeries.setData(enriched.map(c=>({time:toSeconds(c.time),open:c.open,high:c.high,low:c.low,close:c.close})));
  const hist=macdChart.addHistogramSeries({priceFormat:{type:'price',precision:4,minMove:0.0001},priceScaleId:'right'});
  hist.setData(enriched.map(c=>({time:toSeconds(c.time),value:c.hist,color:c.hist>=0?'#26a69a':'#ef5350'})));
  const dif=macdChart.addLineSeries({color:'#f5c14b',lineWidth:1,priceFormat:{type:'price',precision:4,minMove:0.0001},title:'DIF'});
  const dea=macdChart.addLineSeries({color:'#5da9ff',lineWidth:1,priceFormat:{type:'price',precision:4,minMove:0.0001},title:'DEA'});
  dif.setData(enriched.map(c=>({time:toSeconds(c.time),value:c.dif})));
  dea.setData(enriched.map(c=>({time:toSeconds(c.time),value:c.dea})));
  const markers=[];
  for(const t of completedTrades){
    markers.push({time:toSeconds(t.entryTime),position:t.side==='LONG'?'belowBar':'aboveBar',color:t.side==='LONG'?'#3fdb98':'#ff7777',shape:t.side==='LONG'?'arrowUp':'arrowDown',text:t.side==='LONG'?'多':'空'});
    markers.push({time:toSeconds(t.exitTime),position:t.side==='LONG'?'aboveBar':'belowBar',color:'#ffd36b',shape:'circle',text:'出'});
  }
  markers.sort((a,b)=>a.time-b.time);
  priceSeries.setMarkers(markers);
  const sync=(source,target)=>source.timeScale().subscribeVisibleLogicalRangeChange(range=>{
    if(syncBusy||!range)return;
    syncBusy=true;
    try{target.timeScale().setVisibleLogicalRange(range);}catch(e){/* Chart may be resizing */}finally{syncBusy=false;}
  });
  sync(priceChart,macdChart);sync(macdChart,priceChart);
  resizeObserver=new ResizeObserver(()=>{
    if(priceChart)priceChart.applyOptions({width:priceEl.clientWidth,height:priceEl.clientHeight});
    if(macdChart)macdChart.applyOptions({width:macdEl.clientWidth,height:macdEl.clientHeight});
  });
  resizeObserver.observe(priceEl);resizeObserver.observe(macdEl);
  // Show last ~120 bars for legibility; all historical data remain accessible by panning.
  const end=enriched.length-1,start=Math.max(0,end-120);
  priceChart.timeScale().setVisibleLogicalRange({from:start,to:end+5});
  $('chart-status').textContent=`已繪製 ${enriched.length.toLocaleString()} 根 K 線、${completedTrades.length} 筆交易標記。時間顯示為台灣時間。`;
  $('trade-selected').textContent='點擊下方交易紀錄，即可跳到該筆交易並顯示止損、止盈線。';
}
export function fitCharts(){
  if(priceChart)priceChart.timeScale().fitContent();
}
export function focusTrade(t){
  if(!priceChart||!priceSeries){$('trade-selected').textContent='圖表尚未載入。';return;}
  for(const line of selectedLines)priceSeries.removePriceLine(line);
  selectedLines=[];
  const make=(price,color,title)=>priceSeries.createPriceLine({price,color,lineWidth:2,lineStyle:2,axisLabelVisible:true,title});
  selectedLines.push(make(t.entry,'#8dbdff','進場'),make(t.stop,'#ff7777','止損'),make(t.target,'#49dba3','止盈'));
  const targetTime=toSeconds(t.entryTime);
  let lo=0,hi=candles.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(toSeconds(candles[mid].time)<targetTime)lo=mid+1;else hi=mid;}
  priceChart.timeScale().setVisibleLogicalRange({from:Math.max(0,lo-50),to:Math.min(candles.length-1,lo+75)});
  $('trade-selected').textContent=`${t.side==='LONG'?'做多':'做空'}｜進場 ${timeFormatter(targetTime)}｜進場 ${fmt(t.entry)}｜止損 ${fmt(t.stop)}｜止盈 ${fmt(t.target)}｜出場 ${fmt(t.exit)}｜淨 ${t.netR.toFixed(2)}R`;
}
