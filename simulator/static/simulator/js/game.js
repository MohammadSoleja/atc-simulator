(() => {
  const canvas = document.getElementById('radar');
  const ctx = canvas.getContext('2d');
  const stripsEl = document.getElementById('strips');
  const input = document.getElementById('commandInput');
  const form = document.getElementById('commandForm');
  const messageEl = document.getElementById('message');
  const alertBanner = document.getElementById('alertBanner');

  const ui = {
    score: document.getElementById('score'), clock: document.getElementById('clock'),
    arrivals: document.getElementById('arrivalCount'), departures: document.getElementById('departureCount'),
    landings: document.getElementById('landings'), handoffs: document.getElementById('handoffs'),
    violations: document.getElementById('violations'), missed: document.getElementById('missed'),
  };

  const sector = { width:100, height:70, latitude:51.4775, longitude:-0.4614 };
  // Local geographic projection in NM. Keep simulation distances independent of Canvas size.
  function position(lat, lon){
    return {x:0.5+(lon-sector.longitude)*60*Math.cos(sector.latitude*Math.PI/180)/sector.width,
      y:0.5-(lat-sector.latitude)*60/sector.height};
  }
  function coordinate(value){
    const degrees=/[EW]$/.test(value)?3:2;
    const result=Number(value.slice(0,degrees))+Number(value.slice(degrees,degrees+2))/60+
      Number(value.slice(degrees+2,-1))/3600;
    return /[WS]$/.test(value)?-result:result;
  }
  function geographicPosition(lat,lon){return position(coordinate(lat),coordinate(lon));}
  const airport = position(sector.latitude,sector.longitude);
  // Public NATS UK AIP, 2026-10-01: EGLL AD 2.12 and ENR 4.1.
  const physicalRunways = [
    {west:'09L',east:'27R',start:geographicPosition('512839.00N','0002905.97W'),end:geographicPosition('512839.63N','0002559.82W')},
    {west:'09R',east:'27L',start:geographicPosition('512753.25N','0002856.33W'),end:geographicPosition('512753.82N','0002602.76W')}
  ];
  const runways = physicalRunways.flatMap(r=>[
    {id:r.west,x1:r.start.x,y1:r.start.y,x2:r.end.x,y2:r.end.y,heading:90},
    {id:r.east,x1:r.end.x,y1:r.end.y,x2:r.start.x,y2:r.start.y,heading:270}
  ]);
  const fixes = [
    ['BPK','514459.05N','0000624.25W'],['LAM','513845.69N','0000906.13E'],
    ['OCK','511818.17N','0002649.86W'],['BIG','511951.15N','0000205.32E'],
    ['BNN','514334.19N','0003259.10W'],['CPT','512929.66N','0011310.89W'],
    ['HEN','514535.07N','0004725.05W'],['WOD','512710.02N','0005243.68W'],
    ['LON','512914.09N','0002759.54W']
  ].map(([id,lat,lon])=>({id,kind:id==='CPT'?'VOR/DME':(['HEN','WOD'].includes(id)?'NDB':'DME'),...geographicPosition(lat,lon)}));
  // Coordinate-defined RNAV fixes from UK AIP ENR 4.4; no procedure routes are implied.
  fixes.push(...[
    ['DONNA','514200.38N','0004437.04W'],['DORKI','511633N','0001552W'],
    ['HILLY','512006.04N','0001437.38E'],['NIGIT','511846.96N','0011014.71W']
  ].map(([id,lat,lon])=>({id,kind:'RNAV',...geographicPosition(lat,lon)})));
  const departureFixes = fixes.filter(f=>f.id!=='LON');
  let mapView = {scale:1,left:0,top:0};
  const mapWidth=1000, mapHeight=700;
  const airlines = ['BAW','EZY','VIR','SAS','KLM','AFR','DLH','UAL','AAL','RYR'];
  const aircraftTypes = ['A320','A321','B738','B789','A20N','B77W'];
  // Simplified game envelopes in knots, not weight/configuration-dependent flight models.
  const performanceProfiles = {
    A320:{min:140,max:350,approach:140,initialClimb:175},
    A321:{min:145,max:350,approach:145,initialClimb:175},
    B738:{min:145,max:340,approach:145,initialClimb:180},
    B789:{min:150,max:330,approach:150,initialClimb:185},
    A20N:{min:140,max:350,approach:140,initialClimb:175},
    B77W:{min:155,max:330,approach:155,initialClimb:190}
  };
  function profile(a){return performanceProfiles[a.type];}

  let state;
  function reset() {
    state = { aircraft:[], selected:null, paused:false, elapsed:0, lastSpawn:0, nextId:1,
      landings:0, handoffs:0, violations:0, missed:0, score:0, conflicts:new Set() };
    spawnArrival();
    document.getElementById('pauseBtn').textContent='Pause';
    say('New Heathrow session started.');
  }

  function rand(a,b){ return a + Math.random()*(b-a); }
  function normalizeHeading(h){ h%=360; if(h<0)h+=360; return h; }
  function turnDelta(from,to){ return ((to-from+540)%360)-180; }
  function distance(a,b){ const dx=(a.x-b.x)*sector.width, dy=(a.y-b.y)*sector.height; return Math.hypot(dx,dy); }
  function findFix(id){ return fixes.find(f=>f.id===id.toUpperCase()); }
  function findAircraft(cs){ return state.aircraft.find(a=>a.callsign===cs.toUpperCase()); }
  function callsign(){ return airlines[Math.floor(Math.random()*airlines.length)] + Math.floor(rand(100,999)); }

  function spawnArrival(){
    const side=Math.floor(rand(0,4)); let x,y,hdg;
    if(side===0){x=rand(.05,.95);y=.03;hdg=rand(150,210)}
    if(side===1){x=.97;y=rand(.08,.92);hdg=rand(240,300)}
    if(side===2){x=rand(.05,.95);y=.97;hdg=rand(330,30+360)%360}
    if(side===3){x=.03;y=rand(.08,.92);hdg=rand(60,120)}
    const altitude = Math.round(rand(65,100))*100;
    state.aircraft.push({id:state.nextId++,callsign:callsign(),type:aircraftTypes[Math.floor(rand(0,aircraftTypes.length))],kind:'arrival',x,y,heading:hdg,targetHeading:hdg,altitude,targetAltitude:altitude,speed:Math.round(rand(220,270)),targetSpeed:220,verticalSpeed:0,trail:[],clearedToLand:null,landed:false,nav:null,phase:'airborne'});
  }
  function spawnDeparture(){
    state.aircraft.push({id:state.nextId++,callsign:callsign(),type:aircraftTypes[Math.floor(rand(0,aircraftTypes.length))],kind:'departure',x:airport.x,y:airport.y,heading:270,targetHeading:270,altitude:0,targetAltitude:0,speed:0,targetSpeed:0,verticalSpeed:0,trail:[],clearedToLand:null,landed:false,nav:null,phase:'holding',runway:null,exitFix:departureFixes[Math.floor(rand(0,departureFixes.length))].id});
  }

  function assignRunway(a,value){
    const rw=runways.find(r=>r.id===value.replace(/^9/,'09'));
    if(!rw){say('Unknown runway. Use 09L, 09R, 27L, or 27R.',true);return false;}
    if(a.kind!=='departure'||a.phase!=='holding'){say('Runway assignment requires a waiting departure.',true);return false;}
    a.runway=rw.id;a.x=rw.x1;a.y=rw.y1;a.heading=rw.heading;a.targetHeading=rw.heading;
    return true;
  }

  function takeoff(a){
    if(a.kind!=='departure' || a.phase!=='holding'){say(`${a.callsign}: unable takeoff`,true);return false;}
    if(a.targetAltitude<1000){say(`${a.callsign}: assign altitude before takeoff`,true);return false;}
    if(!a.runway){say(`${a.callsign}: assign a runway first, e.g. R 27L`,true);return false;}
    const rw=runways.find(r=>r.id===a.runway);
    a.phase='takeoff'; a.targetSpeed=profile(a).initialClimb; a.heading=rw.heading; a.targetHeading=rw.heading;
    say(`${a.callsign} cleared for takeoff.`); return true;
  }

  function applyClearance(a, value){
    const fix = findFix(value);
    if(fix){ a.nav=fix; return true; }
    if(!/^\d+$/.test(value)){
      say(`Invalid clearance: ${value}. Use C 3, C 010, or C CPT.`,true);
      return false;
    }
    const number = Number(value);
    if(!Number.isSafeInteger(number)){
      say('Invalid clearance number.',true);
      return false;
    }
    // Short numbers are thousands of feet; three digits preserve leading-zero headings.
    // Values above 360 are altitude clearances in feet.
    if(value.length<=2){ a.targetAltitude=number*1000; }
    else if(value.length===3 && number>=1 && number<=360){
      a.targetHeading=normalizeHeading(number);
      a.nav=null;
    }
    else if(number>360){ a.targetAltitude=number; }
    else {
      say('Use headings 001–360, short altitudes (C 3), or feet above 360 (C 4000).',true);
      return false;
    }
    return true;
  }

  function parseCommand(raw){
    const t=raw.trim().toUpperCase().split(/\s+/); if(!t[0])return;
    if(t[0]==='STATS'){return say(`Score ${state.score} | Landings ${state.landings} | Handoffs ${state.handoffs} | Violations ${state.violations}`)}
    const a=findAircraft(t[0]); if(!a)return say(`Aircraft ${t[0]} not found.`,true);
    let i=1;
    while(i<t.length){
      const cmd=t[i++];
      if(cmd==='C' && i<t.length){if(!applyClearance(a,t[i++]))return;}
      else if(cmd==='H' && i<t.length){const h=Number(t[i++]); if(Number.isFinite(h)){a.targetHeading=normalizeHeading(h);a.nav=null;}}
      else if((cmd==='A'||cmd==='ALT') && i<t.length){let alt=Number(t[i++]); if(alt<100)alt*=1000; a.targetAltitude=Math.max(0,alt);}
      else if((cmd==='S'||cmd==='SPD') && i<t.length){
        const speed=Number(t[i++]),limits=profile(a);
        if(!Number.isFinite(speed)||speed<limits.min||speed>limits.max)return say(`${a.callsign} ${a.type}: speed must be ${limits.min}–${limits.max} kt.`,true);
        a.targetSpeed=speed;
      }
      else if((cmd==='R'||cmd==='RWY') && i<t.length){if(!assignRunway(a,t[i++]))return;}
      else if((cmd==='D'||cmd==='DIRECT') && i<t.length){const f=findFix(t[i++]); if(f)a.nav=f; else return say('Unknown fix.',true);}
      else if((cmd==='L'||cmd==='LAND') && i<t.length){const r=t[i++].replace(/^9/,'09'); if(!runways.some(x=>x.id===r))return say('Unknown runway.',true); if(a.kind!=='arrival')return say(`${a.callsign}: not an arrival`,true); a.clearedToLand=r; a.nav=null;}
      else if(cmd==='T'||cmd==='TO'){if(!takeoff(a))return;}
      else if(cmd==='G'||cmd==='GA'){a.clearedToLand=null;a.targetAltitude=Math.max(3000,a.targetAltitude);a.targetSpeed=Math.max(190,a.targetSpeed);a.targetHeading=normalizeHeading(a.heading+30);a.phase='airborne';}
      else return say(`Unknown/incomplete command: ${cmd}`,true);
    }
    say(`${a.callsign}: command accepted.`); selectAircraft(a);
  }

  function say(msg,error=false){ messageEl.textContent=msg; messageEl.className='message '+(error?'error':'ok'); }
  function selectAircraft(a){ state.selected=a?.id ?? null; input.value=a?`${a.callsign} `:''; input.focus(); renderStrips(); }

  function update(dt){
    if(state.paused)return;
    state.elapsed+=dt;
    // Ease into the selected traffic rate over the first five minutes.
    const spawnEvery=Number(document.getElementById('trafficRate').value)*(1+2*Math.max(0,1-state.elapsed/300));
    if(state.elapsed-state.lastSpawn>spawnEvery){ Math.random()<.72?spawnArrival():spawnDeparture(); state.lastSpawn=state.elapsed; }

    for(const a of [...state.aircraft]){
      if(a.removeAt!==undefined || a.phase==='holding')continue;
      if(a.phase==='takeoff')a.targetHeading=runways.find(r=>r.id===a.runway).heading;
      if(a.nav && a.phase==='airborne'){ const dx=(a.nav.x-a.x)*sector.width,dy=(a.nav.y-a.y)*sector.height; a.targetHeading=normalizeHeading(Math.atan2(dx,-dy)*180/Math.PI); if(distance(a,a.nav)<1.2)a.nav=null; }
      let td=turnDelta(a.heading,a.targetHeading); const turn=Math.sign(td)*Math.min(Math.abs(td),3*dt); a.heading=normalizeHeading(a.heading+turn);
      const altDelta=a.targetAltitude-a.altitude; const climb=Math.sign(altDelta)*Math.min(Math.abs(altDelta),1600*dt/60);
      if(a.phase!=='takeoff'||a.speed>profile(a).min)a.altitude=Math.max(0,a.altitude+climb);
      const spdDelta=a.targetSpeed-a.speed; a.speed+=Math.sign(spdDelta)*Math.min(Math.abs(spdDelta),12*dt);

      if(a.phase==='takeoff' && a.speed>profile(a).min){a.altitude=Math.max(a.altitude,50); a.phase='airborne';}
      if(a.phase!=='holding'){
        const nmPerSec=a.speed/3600;
        const rad=a.heading*Math.PI/180;
        a.x+=Math.sin(rad)*nmPerSec*dt/sector.width;
        a.y-=Math.cos(rad)*nmPerSec*dt/sector.height;
      }
      if(a.trail.length===0 || state.elapsed-a.trail[a.trail.length-1].t>4)a.trail.push({x:a.x,y:a.y,t:state.elapsed});
      if(a.trail.length>8)a.trail.shift();

      if(a.kind==='arrival' && a.clearedToLand){
        const rw=runways.find(r=>r.id===a.clearedToLand); const threshold={x:rw.x1,y:rw.y1};
        const aligned=Math.abs(turnDelta(a.heading,rw.heading))<18;
        const rad=rw.heading*Math.PI/180;
        const dx=(threshold.x-a.x)*sector.width,dy=(threshold.y-a.y)*sector.height;
        const ahead=dx*Math.sin(rad)-dy*Math.cos(rad);
        const crossTrack=dx*Math.cos(rad)+dy*Math.sin(rad);
        if(ahead>0 && distance(a,threshold)<5.5 && Math.abs(crossTrack)<0.25 && aligned && a.altitude<3200){
          a.targetHeading=normalizeHeading(Math.atan2(dx,-dy)*180/Math.PI);a.targetAltitude=0;a.targetSpeed=profile(a).approach;
        }
        if(distance(a,threshold)<0.2 && Math.abs(crossTrack)<0.08 && aligned && a.altitude<500){a.x=threshold.x;a.y=threshold.y;a.altitude=0;a.speed=90;a.targetSpeed=0;a.phase='landed';a.landed=true;state.landings++;state.score+=100; removeAircraft(a,2.5);}
      }
      if(a.kind==='departure' && a.phase==='airborne' && a.altitude>=4000){ const f=findFix(a.exitFix); if(distance(a,f)<1.3){state.handoffs++;state.score+=80; removeAircraft(a);}}
      if(a.x<-.08||a.x>1.08||a.y<-.08||a.y>1.08){ if(a.kind==='arrival'){state.missed++;state.score-=100;} removeAircraft(a); }
    }
    checkSeparation();
  }

  function removeAircraft(a,delay=0){ a.removeAt=state.elapsed+delay; }
  function cleanup(){ state.aircraft=state.aircraft.filter(a=>a.removeAt===undefined || state.elapsed<a.removeAt); }

  function checkSeparation(){
    const current=new Set(); let alert=[];
    const air=state.aircraft.filter(a=>a.phase!=='holding'&&!a.landed);
    for(let i=0;i<air.length;i++)for(let j=i+1;j<air.length;j++){
      const a=air[i],b=air[j], key=[a.id,b.id].sort((x,y)=>x-y).join('-');
      if(distance(a,b)<3 && Math.abs(a.altitude-b.altitude)<1000){
        current.add(key); alert.push(`${a.callsign}/${b.callsign}`);
        if(!state.conflicts.has(key)){state.violations++;state.score-=10;}
      }
    }
    state.conflicts=current;
    if(alert.length){alertBanner.textContent='SEPARATION ALERT: '+alert.join('  ');alertBanner.classList.remove('hidden');}
    else alertBanner.classList.add('hidden');
  }

  function draw(){
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#020906';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.setTransform(mapView.scale,0,0,mapView.scale,mapView.left,mapView.top);
    const w=mapWidth,h=mapHeight;
    ctx.strokeStyle='#0c2b1c';ctx.lineWidth=1;
    for(let x=0;x<w;x+=55){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
    for(let y=0;y<h;y+=55){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
    ctx.strokeStyle='#173d2a'; ctx.beginPath();ctx.arc(w/2,h/2,Math.min(w,h)*.4,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.arc(w/2,h/2,Math.min(w,h)*.2,0,Math.PI*2);ctx.stroke();

    ctx.font='12px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    for(const f of fixes){
      const x=f.x*w,y=f.y*h;ctx.strokeStyle='#488666';ctx.beginPath();
      if(f.kind==='RNAV'){ctx.moveTo(x,y-6);ctx.lineTo(x+5,y+4);ctx.lineTo(x-5,y+4);ctx.closePath();}
      else {ctx.arc(x,y,5,0,Math.PI*2);}
      ctx.stroke();
      if(f.kind==='NDB'){ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.stroke();}
      ctx.fillStyle='#72b98b';ctx.fillText(f.id,f.id==='LON'?x-35:x,f.id==='LON'?y-16:y+15);
    }
    for(const [index,r] of physicalRunways.entries()){
      // Draw the same coordinates used by aircraft; offset only labels, never runway geometry.
      const labelY=(r.start.y+r.end.y)*h/2+(index===0?-9:9);
      ctx.strokeStyle='#9db9a6';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(r.start.x*w,r.start.y*h);ctx.lineTo(r.end.x*w,r.end.y*h);ctx.stroke();ctx.lineWidth=1;
      ctx.fillStyle='#809a88';ctx.textAlign='right';ctx.fillText(r.west,r.start.x*w-5,labelY);
      ctx.textAlign='left';ctx.fillText(r.east,r.end.x*w+5,labelY);ctx.textAlign='center';
    }
    ctx.fillStyle='#6ca47e';ctx.fillText('HEATHROW',airport.x*w,airport.y*h+28);

    for(const a of state.aircraft){
      if(a.phase==='holding')continue;
      ctx.strokeStyle='#254e37'; for(const p of a.trail){ctx.beginPath();ctx.arc(p.x*w,p.y*h,1.5,0,Math.PI*2);ctx.stroke();}
      const x=a.x*w,y=a.y*h; const selected=state.selected===a.id; const conflict=[...state.conflicts].some(k=>k.split('-').map(Number).includes(a.id));
      ctx.fillStyle=conflict?'#ff5f5f':selected?'#ffd166':'#75ffad'; ctx.fillRect(x-3,y-3,6,6);
      const rad=a.heading*Math.PI/180;ctx.strokeStyle=ctx.fillStyle;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(rad)*14,y-Math.cos(rad)*14);ctx.stroke();
      ctx.textAlign='left';ctx.font='12px monospace';ctx.fillText(a.callsign,x+9,y-12);ctx.fillText(`${String(Math.round(a.altitude/100)).padStart(3,'0')} ${Math.round(a.speed)}`,x+9,y+2);ctx.fillText(`${String(Math.round(a.heading)).padStart(3,'0')}${a.nav?'→'+a.nav.id:''}`,x+9,y+16);
    }
    ctx.textAlign='center';
    ctx.fillStyle='#53906c';ctx.fillText('100 × 70 NM · NORTH ↑',w/2,h-14);
  }

  function renderStrips(){
    const scrollTop = stripsEl.scrollTop;
    stripsEl.innerHTML='';
    for(const a of state.aircraft){
      const d=document.createElement('div');d.className=`strip ${a.kind} ${state.selected===a.id?'selected':''}`;
      d.innerHTML=`<div class="strip-top"><span class="callsign">${a.callsign}</span><span class="kind">${a.kind==='arrival'?'ARR':'DEP'}</span></div><div class="strip-bottom"><span>${a.type}</span><span>${a.kind==='arrival'?Math.round(a.altitude)+'ft':a.exitFix}</span><span>${Math.round(a.speed)}kt</span></div>${a.kind==='departure'?`<div class="strip-bottom">${a.runway?'RWY '+a.runway:'Assign runway: R 27L / R 27R / R 09L / R 09R'}</div>`:''}`;
      d.onclick=()=>selectAircraft(a);stripsEl.appendChild(d);
    }
    // Periodic strip updates should preserve the controller's place in the list.
    stripsEl.scrollTop = scrollTop;
  }

  function updateUI(){
    ui.score.textContent=state.score;ui.landings.textContent=state.landings;ui.handoffs.textContent=state.handoffs;ui.violations.textContent=state.violations;ui.missed.textContent=state.missed;
    ui.arrivals.textContent=state.aircraft.filter(a=>a.kind==='arrival').length;ui.departures.textContent=state.aircraft.filter(a=>a.kind==='departure').length;
    const m=Math.floor(state.elapsed/60),s=Math.floor(state.elapsed%60);ui.clock.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function resize(){
    const r=canvas.parentElement.getBoundingClientRect();canvas.width=Math.max(1,Math.floor(r.width));canvas.height=Math.max(1,Math.floor(r.height));
    const scale=Math.min(canvas.width/mapWidth,canvas.height/mapHeight);
    mapView={scale,left:(canvas.width-mapWidth*scale)/2,top:(canvas.height-mapHeight*scale)/2};
  }
  window.addEventListener('resize',resize);
  new ResizeObserver(resize).observe(canvas.parentElement);
  canvas.addEventListener('click',e=>{const r=canvas.getBoundingClientRect(),mx=((e.clientX-r.left)*canvas.width/r.width-mapView.left)/(mapWidth*mapView.scale),my=((e.clientY-r.top)*canvas.height/r.height-mapView.top)/(mapHeight*mapView.scale);let best=null,bd=20;for(const a of state.aircraft){if(a.phase==='holding')continue;const d=Math.hypot((a.x-mx)*mapWidth*mapView.scale,(a.y-my)*mapHeight*mapView.scale);if(d<bd){best=a;bd=d}}if(best)selectAircraft(best)});
  form.addEventListener('submit',e=>{e.preventDefault();parseCommand(input.value);input.value='';});
  document.getElementById('pauseBtn').onclick=()=>{state.paused=!state.paused;document.getElementById('pauseBtn').textContent=state.paused?'Resume':'Pause'};
  document.getElementById('restartBtn').onclick=()=>{reset();renderStrips()};
  document.getElementById('spawnBtn').onclick=()=>{Math.random()<.7?spawnArrival():spawnDeparture();renderStrips()};

  let last=performance.now(),stripTimer=0;
  function frame(now){
    const dt=Math.min(.1,(now-last)/1000);last=now;
    const rate=Number(document.getElementById('simulationRate').value);
    // Accelerate the entire simulation uniformly, using small steps for approach/separation checks.
    let remaining=dt*rate;
    while(remaining>0){const step=Math.min(.05,remaining);update(step);cleanup();remaining-=step;}
    draw();updateUI();stripTimer+=dt;if(stripTimer>.7){renderStrips();stripTimer=0}requestAnimationFrame(frame);
  }
  reset();resize();renderStrips();requestAnimationFrame(frame);
})();
