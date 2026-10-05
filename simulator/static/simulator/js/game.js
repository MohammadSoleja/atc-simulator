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

  const airport = { x: 0.5, y: 0.54 };
  const runways = [
    { id:'27L', x1:0.39, y1:0.57, x2:0.61, y2:0.57, heading:270 },
    { id:'27R', x1:0.39, y1:0.51, x2:0.61, y2:0.51, heading:270 },
  ];
  const fixes = [
    {id:'BPK',x:0.50,y:0.10},{id:'LAM',x:0.82,y:0.32},{id:'OCK',x:0.25,y:0.77},
    {id:'BIG',x:0.72,y:0.76},{id:'BNN',x:0.26,y:0.20},{id:'CPT',x:0.08,y:0.52}
  ];
  const airlines = ['BAW','EZY','VIR','SAS','KLM','AFR','DLH','UAL','AAL','RYR'];
  const aircraftTypes = ['A320','A321','B738','B789','A20N','B77W'];

  let state;
  function reset() {
    state = { aircraft:[], selected:null, paused:false, elapsed:0, lastSpawn:0, nextId:1,
      landings:0, handoffs:0, violations:0, missed:0, score:0, conflicts:new Set() };
    for(let i=0;i<5;i++) spawnArrival();
    spawnDeparture(); spawnDeparture();
    say('New Heathrow session started.');
  }

  function rand(a,b){ return a + Math.random()*(b-a); }
  function normalizeHeading(h){ h%=360; if(h<0)h+=360; return h; }
  function turnDelta(from,to){ return ((to-from+540)%360)-180; }
  function distance(a,b){ const dx=(a.x-b.x)*70, dy=(a.y-b.y)*50; return Math.hypot(dx,dy); }
  function findFix(id){ return fixes.find(f=>f.id===id.toUpperCase()); }
  function findAircraft(cs){ return state.aircraft.find(a=>a.callsign===cs.toUpperCase()); }
  function callsign(){ return airlines[Math.floor(Math.random()*airlines.length)] + Math.floor(rand(100,999)); }

  function spawnArrival(){
    const side=Math.floor(rand(0,4)); let x,y,hdg;
    if(side===0){x=rand(.05,.95);y=.03;hdg=rand(150,210)}
    if(side===1){x=.97;y=rand(.08,.92);hdg=rand(240,300)}
    if(side===2){x=rand(.05,.95);y=.97;hdg=rand(330,30+360)%360}
    if(side===3){x=.03;y=rand(.08,.92);hdg=rand(60,120)}
    state.aircraft.push({id:state.nextId++,callsign:callsign(),type:aircraftTypes[Math.floor(rand(0,aircraftTypes.length))],kind:'arrival',x,y,heading:hdg,targetHeading:hdg,altitude:Math.round(rand(65,100))*100,targetAltitude:3000,speed:Math.round(rand(220,270)),targetSpeed:220,verticalSpeed:0,trail:[],clearedToLand:null,landed:false,nav:null,phase:'airborne'});
  }
  function spawnDeparture(){
    const rw=runways[Math.floor(rand(0,runways.length))];
    state.aircraft.push({id:state.nextId++,callsign:callsign(),type:aircraftTypes[Math.floor(rand(0,aircraftTypes.length))],kind:'departure',x:rw.x2,y:rw.y2,heading:90,targetHeading:90,altitude:0,targetAltitude:0,speed:0,targetSpeed:0,verticalSpeed:0,trail:[],clearedToLand:null,landed:false,nav:null,phase:'holding',runway:rw.id,exitFix:fixes[Math.floor(rand(0,fixes.length))].id});
  }

  function takeoff(a){
    if(a.kind!=='departure' || a.phase!=='holding') return say(`${a.callsign}: unable takeoff`,true);
    if(a.targetAltitude<1000) return say(`${a.callsign}: assign altitude before takeoff`,true);
    a.phase='takeoff'; a.targetSpeed=180; a.heading=90; a.targetHeading=90; say(`${a.callsign} cleared for takeoff.`);
  }

  function parseCommand(raw){
    const t=raw.trim().toUpperCase().split(/\s+/); if(!t[0])return;
    if(t[0]==='STATS'){return say(`Score ${state.score} | Landings ${state.landings} | Handoffs ${state.handoffs} | Violations ${state.violations}`)}
    const a=findAircraft(t[0]); if(!a)return say(`Aircraft ${t[0]} not found.`,true);
    let i=1;
    while(i<t.length){
      const cmd=t[i++];
      if((cmd==='H'||cmd==='C') && i<t.length){const h=Number(t[i++]); if(Number.isFinite(h)){a.targetHeading=normalizeHeading(h);a.nav=null;}}
      else if((cmd==='A'||cmd==='ALT') && i<t.length){let alt=Number(t[i++]); if(alt<100)alt*=1000; a.targetAltitude=Math.max(0,alt);}
      else if((cmd==='S'||cmd==='SPD') && i<t.length){a.targetSpeed=Math.max(0,Number(t[i++]));}
      else if((cmd==='D'||cmd==='DIRECT') && i<t.length){const f=findFix(t[i++]); if(f)a.nav=f; else return say('Unknown fix.',true);}
      else if((cmd==='L'||cmd==='LAND') && i<t.length){const r=t[i++]; if(!runways.some(x=>x.id===r))return say('Unknown runway.',true); if(a.kind!=='arrival')return say(`${a.callsign}: not an arrival`,true); a.clearedToLand=r;}
      else if(cmd==='T'||cmd==='TO'){takeoff(a);}
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
    const spawnEvery=Number(document.getElementById('trafficRate').value);
    if(state.elapsed-state.lastSpawn>spawnEvery){ Math.random()<.72?spawnArrival():spawnDeparture(); state.lastSpawn=state.elapsed; }

    for(const a of [...state.aircraft]){
      if(a.nav){ const dx=(a.nav.x-a.x)*canvas.width,dy=(a.nav.y-a.y)*canvas.height; a.targetHeading=normalizeHeading(Math.atan2(dx,-dy)*180/Math.PI); if(distance(a,a.nav)<1.2)a.nav=null; }
      let td=turnDelta(a.heading,a.targetHeading); const turn=Math.sign(td)*Math.min(Math.abs(td),3*dt); a.heading=normalizeHeading(a.heading+turn);
      const altDelta=a.targetAltitude-a.altitude; const climb=Math.sign(altDelta)*Math.min(Math.abs(altDelta),1600*dt/60); a.altitude=Math.max(0,a.altitude+climb);
      const spdDelta=a.targetSpeed-a.speed; a.speed+=Math.sign(spdDelta)*Math.min(Math.abs(spdDelta),12*dt);

      if(a.phase==='takeoff' && a.speed>90){a.altitude=Math.max(a.altitude,50); if(a.speed>150)a.phase='airborne';}
      if(a.phase!=='holding'){
        const pxPerNmX=canvas.width/70, pxPerNmY=canvas.height/50;
        const nmPerSec=a.speed/3600;
        const rad=a.heading*Math.PI/180;
        a.x+=(Math.sin(rad)*nmPerSec*dt*pxPerNmX)/canvas.width;
        a.y+=(-Math.cos(rad)*nmPerSec*dt*pxPerNmY)/canvas.height;
      }
      if(a.trail.length===0 || state.elapsed-a.trail[a.trail.length-1].t>4)a.trail.push({x:a.x,y:a.y,t:state.elapsed});
      if(a.trail.length>8)a.trail.shift();

      if(a.kind==='arrival' && a.clearedToLand){
        const rw=runways.find(r=>r.id===a.clearedToLand); const threshold={x:rw.x1,y:rw.y1};
        const aligned=Math.abs(turnDelta(a.heading,270))<18;
        if(distance(a,threshold)<5.5 && aligned && a.altitude<3200){a.targetHeading=270;a.targetAltitude=0;a.targetSpeed=135;}
        if(distance(a,threshold)<0.7 && a.altitude<500){a.altitude=0;a.speed=90;a.targetSpeed=0;a.phase='landed';a.landed=true;state.landings++;state.score+=100; removeAircraft(a,2.5);}
      }
      if(a.kind==='departure' && a.phase==='airborne' && a.altitude>=4000){ const f=findFix(a.exitFix); if(distance(a,f)<1.3){state.handoffs++;state.score+=80; removeAircraft(a);}}
      if(a.x<-.08||a.x>1.08||a.y<-.08||a.y>1.08){ if(a.kind==='arrival'){state.missed++;state.score-=100;} removeAircraft(a); }
    }
    checkSeparation();
  }

  function removeAircraft(a,delay=0){ a.removeAt=state.elapsed+delay; }
  function cleanup(){ state.aircraft=state.aircraft.filter(a=>!a.removeAt || state.elapsed<a.removeAt); }

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
    const w=canvas.width,h=canvas.height; ctx.fillStyle='#020906';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#0c2b1c';ctx.lineWidth=1;
    for(let x=0;x<w;x+=55){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
    for(let y=0;y<h;y+=55){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
    ctx.strokeStyle='#173d2a'; ctx.beginPath();ctx.arc(w/2,h/2,Math.min(w,h)*.4,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.arc(w/2,h/2,Math.min(w,h)*.2,0,Math.PI*2);ctx.stroke();

    ctx.font='12px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    for(const f of fixes){const x=f.x*w,y=f.y*h;ctx.strokeStyle='#488666';ctx.beginPath();ctx.moveTo(x,y-6);ctx.lineTo(x+5,y+4);ctx.lineTo(x-5,y+4);ctx.closePath();ctx.stroke();ctx.fillStyle='#72b98b';ctx.fillText(f.id,x,y+15)}
    for(const r of runways){ctx.strokeStyle='#9db9a6';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(r.x1*w,r.y1*h);ctx.lineTo(r.x2*w,r.y2*h);ctx.stroke();ctx.lineWidth=1;ctx.fillStyle='#809a88';ctx.fillText(r.id,r.x1*w-20,r.y1*h)}
    ctx.fillStyle='#6ca47e';ctx.fillText('HEATHROW',airport.x*w,airport.y*h+28);

    for(const a of state.aircraft){
      if(a.phase==='holding'){ drawGroundAircraft(a); continue; }
      ctx.strokeStyle='#254e37'; for(const p of a.trail){ctx.beginPath();ctx.arc(p.x*w,p.y*h,1.5,0,Math.PI*2);ctx.stroke();}
      const x=a.x*w,y=a.y*h; const selected=state.selected===a.id; const conflict=[...state.conflicts].some(k=>k.split('-').map(Number).includes(a.id));
      ctx.fillStyle=conflict?'#ff5f5f':selected?'#ffd166':'#75ffad'; ctx.fillRect(x-3,y-3,6,6);
      const rad=a.heading*Math.PI/180;ctx.strokeStyle=ctx.fillStyle;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(rad)*14,y-Math.cos(rad)*14);ctx.stroke();
      ctx.textAlign='left';ctx.font='12px monospace';ctx.fillText(a.callsign,x+9,y-12);ctx.fillText(`${String(Math.round(a.altitude/100)).padStart(3,'0')} ${Math.round(a.speed)}`,x+9,y+2);ctx.fillText(`${String(Math.round(a.heading)).padStart(3,'0')}${a.nav?'→'+a.nav.id:''}`,x+9,y+16);
    }
    ctx.textAlign='center';
  }
  function drawGroundAircraft(a){const rw=runways.find(r=>r.id===a.runway);const x=rw.x2*canvas.width+8,y=rw.y2*canvas.height;ctx.fillStyle=state.selected===a.id?'#ffd166':'#83b9ff';ctx.fillRect(x-3,y-3,6,6);ctx.textAlign='left';ctx.fillText(a.callsign,x+7,y-8);ctx.fillText(`DEP ${a.exitFix}`,x+7,y+7);ctx.textAlign='center';}

  function renderStrips(){
    stripsEl.innerHTML='';
    for(const a of state.aircraft){
      const d=document.createElement('div');d.className=`strip ${a.kind} ${state.selected===a.id?'selected':''}`;
      d.innerHTML=`<div class="strip-top"><span class="callsign">${a.callsign}</span><span class="kind">${a.kind==='arrival'?'ARR':'DEP'}</span></div><div class="strip-bottom"><span>${a.type}</span><span>${a.kind==='arrival'?Math.round(a.altitude)+'ft':a.exitFix}</span><span>${Math.round(a.speed)}kt</span></div>`;
      d.onclick=()=>selectAircraft(a);stripsEl.appendChild(d);
    }
  }

  function updateUI(){
    ui.score.textContent=state.score;ui.landings.textContent=state.landings;ui.handoffs.textContent=state.handoffs;ui.violations.textContent=state.violations;ui.missed.textContent=state.missed;
    ui.arrivals.textContent=state.aircraft.filter(a=>a.kind==='arrival').length;ui.departures.textContent=state.aircraft.filter(a=>a.kind==='departure').length;
    const m=Math.floor(state.elapsed/60),s=Math.floor(state.elapsed%60);ui.clock.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function resize(){ const r=canvas.parentElement.getBoundingClientRect();canvas.width=Math.max(700,Math.floor(r.width));canvas.height=Math.max(520,Math.floor(r.height)); }
  window.addEventListener('resize',resize);
  canvas.addEventListener('click',e=>{const r=canvas.getBoundingClientRect(),mx=(e.clientX-r.left)/r.width,my=(e.clientY-r.top)/r.height;let best=null,bd=.03;for(const a of state.aircraft){const d=Math.hypot(a.x-mx,a.y-my);if(d<bd){best=a;bd=d}}if(best)selectAircraft(best)});
  form.addEventListener('submit',e=>{e.preventDefault();parseCommand(input.value);input.value='';});
  document.getElementById('pauseBtn').onclick=()=>{state.paused=!state.paused;document.getElementById('pauseBtn').textContent=state.paused?'Resume':'Pause'};
  document.getElementById('restartBtn').onclick=()=>{reset();renderStrips()};
  document.getElementById('spawnBtn').onclick=()=>{Math.random()<.7?spawnArrival():spawnDeparture();renderStrips()};

  let last=performance.now(),stripTimer=0;
  function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;update(dt);cleanup();draw();updateUI();stripTimer+=dt;if(stripTimer>.7){renderStrips();stripTimer=0}requestAnimationFrame(frame)}
  reset();resize();renderStrips();requestAnimationFrame(frame);
})();
