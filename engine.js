/* Pure strategy engine. Closed candles only. Signal at bar i close, fill at i+1 open.
   "Previous candle" = bar i-1. Only one position at a time.
   If stop and target touched in same bar, assume STOP first.
*/
export function enrich(candles, fast=12, slow=26, signal=9) {
  const ema = (values,n) => {let prev=values[0], alpha=2/(n+1);return values.map((v,i)=>prev=i?alpha*v+(1-alpha)*prev:v)};
  const closes=candles.map(c=>c.close), a=ema(closes,fast), b=ema(closes,slow);
  const dif=a.map((v,i)=>v-b[i]), dea=ema(dif,signal);
  return candles.map((c,i)=>({...c,dif:dif[i],dea:dea[i],hist:2*(dif[i]-dea[i])}));
}
export function backtest(raw,opts={}) {
  const {rr=5,feeBps=4,slippageBps=2, firstOnly=false, maxBars=288, equity=10000, riskPct=0.5}=opts;
  const candles=enrich(raw), trades=[];
  const roundTripRate=2*(Number(feeBps)+Number(slippageBps))/10000;
  let i=35, equityNow=Number(equity), peak=equityNow, maxDD=0;
  while(i<candles.length-1) {
    const c=candles[i], prev=candles[i-1], before=candles[i-2];
    const long=c.dif>0 && c.dea>0 && c.hist>0 && prev.hist>0 && c.hist>prev.hist;
    const short=c.dif<0 && c.dea<0 && c.hist<0 && prev.hist<0 && c.hist<prev.hist;
    const firstLong=!(prev.hist>0 && before.hist>0 && prev.hist>before.hist);
    const firstShort=!(prev.hist<0 && before.hist<0 && prev.hist<before.hist);
    if ((!long&&!short) || (firstOnly && !(long&&firstLong || short&&firstShort))) {i++;continue;}
    const side=long?'LONG':'SHORT', sign=long?1:-1;
    const entryBar=candles[i+1], rawEntry=entryBar.open;
    const entry=rawEntry*(1+sign*slippageBps/10000);
    const stop=long?prev.low:prev.high;
    const risk=sign*(entry-stop);
    if(risk<=0 || !Number.isFinite(risk)) {i++;continue;}
    const target=entry+sign*rr*risk;
    let exit=null, exitIdx=-1, reason='';
    for(let j=i+1;j<candles.length && j<=i+maxBars;j++) {
      const bar=candles[j];
      // If entry candle opens beyond stop, gap/invalid setup: skip trade entirely.
      if(j===i+1 && (long?bar.open<=stop:bar.open>=stop)) {reason='invalid';break;}
      // For later bars, gaps beyond stop execute at the worse open.
      if(j>i+1 && (long?bar.open<=stop:bar.open>=stop)) {exit=bar.open;exitIdx=j;reason='gap_stop';break;}
      const hitStop=long?bar.low<=stop:bar.high>=stop;
      const hitTarget=long?bar.high>=target:bar.low<=target;
      if(hitStop) {exit=stop;exitIdx=j;reason=hitTarget?'both_stop_first':'stop';break;}
      if(hitTarget) {exit=target;exitIdx=j;reason='target';break;}
    }
    if(reason==='invalid'){i++;continue;}
    if(exit===null) {exitIdx=Math.min(i+maxBars,candles.length-1);exit=candles[exitIdx].close;reason=exitIdx===candles.length-1?'data_end':'time_exit';}
    // Slippage applied to exits, fee on both sides, R normalized by price risk.
    const exitFill=exit*(1-sign*slippageBps/10000);
    const grossR=sign*(exitFill-entry)/risk;
    const costR=(entry+exitFill)*(feeBps/10000)/risk;
    const netR=grossR-costR;
    const riskAmount=equityNow*(riskPct/100);
    equityNow+=riskAmount*netR;
    peak=Math.max(peak,equityNow);maxDD=Math.max(maxDD,(peak-equityNow)/peak*100);
    trades.push({side,signalTime:c.time,entryTime:entryBar.time,exitTime:candles[exitIdx].time,entry,stop,target,exit:exitFill,risk,reason,grossR,netR,equity:equityNow});
    i=exitIdx+1; // never overlap positions or use an exit bar as a new signal
  }
  const n=trades.length, wins=trades.filter(t=>t.netR>0), losses=trades.filter(t=>t.netR<0);
  const profit=wins.reduce((s,t)=>s+t.netR,0), loss=-losses.reduce((s,t)=>s+t.netR,0);
  const sum=trades.reduce((s,t)=>s+t.netR,0);
  return {trades, stats:{count:n,wins:wins.length,losses:losses.length,winRate:n?100*wins.length/n:0,avgR:n?sum/n:0,totalR:sum,profitFactor:loss?profit/loss:(profit?Infinity:0),maxDrawdownPct:maxDD,finalEquity:equityNow,targets:trades.filter(t=>t.reason==='target').length,stops:trades.filter(t=>t.reason==='stop'||t.reason==='both_stop_first'||t.reason==='gap_stop').length},params:{rr,feeBps,slippageBps,firstOnly,maxBars,equity,riskPct,macd:'12/26/9'}};
}
