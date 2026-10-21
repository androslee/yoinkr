// New native-host presentation, no donor React/MUI/D3 runtime is installed.
(()=>{
 const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';let selected='',last=null,paused=false;
 function draw(detail){const changed=(detail?.topic??'')!==selected;last=detail;if(changed||!detail){paused=false;$('plot-pause').textContent='Pause plot';}selected=detail?.topic??'';if(paused)return;
  const points=detail?.plot?.points??[],svg=$('numeric-plot');svg.replaceChildren();$('plot-section').hidden=!selected;$('plot-reset').disabled=!selected;
  $('plot-summary').textContent=points.length?`${points.length} / ${detail.plot.limit} samples · latest ${points.at(-1).value} · ${detail.plot.received} numeric messages`:'No numeric samples for this topic. Text, JSON objects and non-finite values are not plotted.';
  svg.dataset.samples=points.length;svg.setAttribute('aria-label',points.length?`Numeric history for ${selected}, latest ${points.at(-1).value}`:'No numeric history');
  if(!points.length)return;
  const values=points.map(p=>p.value),lo=Math.min(...values),hi=Math.max(...values),scale=Math.max(Math.abs(lo),Math.abs(hi),1),normalized=values.map(v=>v/scale),min=lo/scale,max=hi/scale,padding=max===min?.5:Math.max((max-min)*.1,1e-9),range=max-min+2*padding;
  const times=points.map(p=>p.time),start=Math.min(...times),span=Math.max(...times)-start;
  const coords=points.map((p,i)=>[48+(span?(p.time-start)/span:points.length>1?i/(points.length-1):.5)*570,155-(normalized[i]-min+padding)/range*125]);
  for(const [y,label]of [[30,hi],[155,lo]]){const line=document.createElementNS(ns,'line');line.setAttribute('x1','48');line.setAttribute('x2','618');line.setAttribute('y1',y);line.setAttribute('y2',y);line.setAttribute('stroke','#394b60');svg.append(line);const text=document.createElementNS(ns,'text');text.setAttribute('x','4');text.setAttribute('y',y+4);text.setAttribute('fill','#b7c8dc');text.setAttribute('font-size','11');text.textContent=Number(label.toPrecision(5));svg.append(text);}
  const path=document.createElementNS(ns,'polyline');path.setAttribute('points',coords.map(p=>p.join(',')).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','#67d8b2');path.setAttribute('stroke-width','2.5');svg.append(path);
  const dot=document.createElementNS(ns,'circle'),[x,y]=coords.at(-1);dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('r','4');dot.setAttribute('fill','#a4f3d8');const title=document.createElementNS(ns,'title');title.textContent=`${points.at(-1).value} · ${new Date(points.at(-1).time).toLocaleTimeString()}`;dot.append(title);svg.append(dot);
 }
 window.modkitHost.onMessage(m=>{if(m.type==='detail')draw(m.detail);if(m.type==='snapshot'&&!m.snapshot.topics.some(t=>t.topic===selected)){selected='';draw(null);}});
 $('plot-pause').onclick=()=>{paused=!paused;$('plot-pause').textContent=paused?'Resume plot':'Pause plot';if(!paused)draw(last);};
 $('plot-reset').onclick=()=>{if(selected)window.modkitHost.send({type:'clear-plot',topic:selected,mode:$('mode').value});};
})();
