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

  const NORMAL_SIMULATION_RATE = 2;
  let simulationRate = NORMAL_SIMULATION_RATE;
  const TRAFFIC_INTERVAL = 30;
  const TRAFFIC_NOTICE_SECONDS = 30;
  const GAMEPLAY_PACE = 1.2; // 20% faster aircraft dynamics, independent of the airport clock.
  // Airport time advances two minutes per real minute at Normal.
  const SESSION_START_SECONDS = 6*60*60;
  const CLOCK_SECONDS_PER_SIM_SECOND = 1;
  const MAP_ZOOM = 1.4;
  const APPROACH_RANGE_NM = 25;

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
  const mapData=window.ATC_MAP_DATA||{urban:[],rivers:[]};
  const projectLine=line=>line.map(([lon,lat])=>position(lat,lon));
  const geography={urban:mapData.urban.map(poly=>poly.map(projectLine)),rivers:mapData.rivers.map(projectLine)};

  function drawGeography(){
    ctx.fillStyle='#294c59';ctx.strokeStyle='#355866';ctx.lineWidth=0.7;
    for(const polygon of geography.urban){
      ctx.beginPath();
      for(const ring of polygon){ring.forEach((p,i)=>i?ctx.lineTo(p.x*mapWidth,p.y*mapHeight):ctx.moveTo(p.x*mapWidth,p.y*mapHeight));ctx.closePath();}
      ctx.fill('evenodd');ctx.stroke();
    }
    ctx.strokeStyle='#426f80';ctx.lineWidth=1.5;ctx.lineJoin='round';ctx.lineCap='round';
    for(const line of geography.rivers){ctx.beginPath();line.forEach((p,i)=>i?ctx.lineTo(p.x*mapWidth,p.y*mapHeight):ctx.moveTo(p.x*mapWidth,p.y*mapHeight));ctx.stroke();}
    ctx.lineCap='butt';ctx.lineJoin='miter';

  }
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
    state = { aircraft:[], upcoming:[], selected:null, paused:false, elapsed:0, clockElapsed:0, trafficElapsed:0, lastSpawn:0, nextId:1,
      landings:0, handoffs:0, violations:0, missed:0, score:0, conflicts:new Set() };
    setSimulationRate(NORMAL_SIMULATION_RATE);
    input.value='';
    resize();
    spawnArrival();
    document.getElementById('pauseBtn').textContent='Pause';
    say('New Heathrow session started.');
  }

  function rand(a,b){ return a + Math.random()*(b-a); }
  function normalizeHeading(h){ h%=360; if(h<0)h+=360; return h; }
  function turnDelta(from,to){ return ((to-from+540)%360)-180; }
  // Coordinated turn: up to 25° bank or 3°/s, whichever gives the slower turn.
  // Gradual bank changes and early rollout avoid instant heading changes.
  function maximumTurnRate(a){
    return Math.min(3,9.80665*Math.tan(25*Math.PI/180)/Math.max(70,a.speed*0.514444)*180/Math.PI);
  }
  function updateTurn(a,dt){
    const delta=turnDelta(a.heading,a.targetHeading);
    const desiredRate=Math.sign(delta)*Math.min(maximumTurnRate(a),Math.abs(delta)*0.25);
    const velocity=Math.max(70,a.speed*0.514444);
    const desiredBank=Math.atan(desiredRate*Math.PI/180*velocity/9.80665)*180/Math.PI;
    const bank=a.bank||0;
    a.bank=bank+Math.sign(desiredBank-bank)*Math.min(Math.abs(desiredBank-bank),5*dt);
    const rate=9.80665*Math.tan(a.bank*Math.PI/180)/velocity*180/Math.PI;
    const turn=rate*dt;
    a.heading=normalizeHeading(a.heading+(Math.sign(turn)===Math.sign(delta)?Math.sign(turn)*Math.min(Math.abs(delta),Math.abs(turn)):turn));
  }
  function distance(a,b){ const dx=(a.x-b.x)*sector.width, dy=(a.y-b.y)*sector.height; return Math.hypot(dx,dy); }
  function findFix(id){ return fixes.find(f=>f.id===id.toUpperCase()); }
  function findAircraft(cs){ return state.aircraft.find(a=>a.callsign===cs.toUpperCase()); }
  function callsign(){
    const airline=airlines[Math.floor(Math.random()*airlines.length)];
    const start=Math.floor(rand(100,999));
    for(let offset=0;offset<900;offset++){
      const candidate=airline+(100+(start-100+offset)%900);
      if(!state.aircraft.some(a=>a.callsign===candidate)&&!state.upcoming.some(a=>a.callsign===candidate))return candidate;
    }
    return airline+(1000+state.nextId++);
  }

  function spawnArrival(planned=null){
    const side=Math.floor(rand(0,4)); let x,y,hdg;
    if(side===0){x=rand(.05,.95);y=.03;hdg=rand(150,210)}
    if(side===1){x=.97;y=rand(.08,.92);hdg=rand(240,300)}
    if(side===2){x=rand(.05,.95);y=.97;hdg=rand(330,30+360)%360}
    if(side===3){x=.03;y=rand(.08,.92);hdg=rand(60,120)}
    // Spawn within the visible part of the sector at the selected map zoom.
    const left=Math.max(.03,-mapView.left/(mapWidth*mapView.scale)+.03);
    const right=Math.min(.97,(canvas.width-mapView.left)/(mapWidth*mapView.scale)-.03);
    const top=Math.max(.03,-mapView.top/(mapHeight*mapView.scale)+.03);
    const bottom=Math.min(.97,(canvas.height-mapView.top)/(mapHeight*mapView.scale)-.03);
    x=side===1?right:side===3?left:rand(left,right);
    y=side===0?top:side===2?bottom:rand(top,bottom);
    const altitude = Math.round(rand(65,100))*100;
    state.aircraft.push({id:state.nextId++,callsign:callsign(),type:aircraftTypes[Math.floor(rand(0,aircraftTypes.length))],kind:'arrival',x,y,heading:hdg,targetHeading:hdg,altitude,targetAltitude:altitude,speed:Math.round(rand(220,270)),targetSpeed:220,verticalSpeed:0,trail:[],clearedToLand:null,landed:false,nav:null,phase:'airborne'});
    if(planned)Object.assign(state.aircraft[state.aircraft.length-1],planned);
  }
  function spawnDeparture(planned=null){
    state.aircraft.push({id:state.nextId++,callsign:callsign(),type:aircraftTypes[Math.floor(rand(0,aircraftTypes.length))],kind:'departure',x:airport.x,y:airport.y,heading:270,targetHeading:270,altitude:0,targetAltitude:0,speed:0,targetSpeed:0,verticalSpeed:0,trail:[],clearedToLand:null,landed:false,nav:null,phase:'holding',runway:null,exitFix:departureFixes[Math.floor(rand(0,departureFixes.length))].id});
    if(planned)Object.assign(state.aircraft[state.aircraft.length-1],planned);
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
    if(fix){ a.nav=fix; return `head direct to ${fix.id}`; }
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
    return value.length===3 && number>=1 && number<=360
      ? `heading ${String(number).padStart(3,'0')}°` : altitudeReadback(a);
  }

  function altitudeReadback(a){
    const action=a.targetAltitude>a.altitude?'climb and maintain':a.targetAltitude<a.altitude?'descend and maintain':'maintain';
    return `${action} ${a.targetAltitude.toLocaleString('en-GB')} ft`;
  }

  function runwayPosition(a,rw){
    const rad=rw.heading*Math.PI/180;
    const dx=(rw.x1-a.x)*sector.width,dy=(rw.y1-a.y)*sector.height;
    return {ahead:dx*Math.sin(rad)-dy*Math.cos(rad),cross:dx*Math.cos(rad)+dy*Math.sin(rad),dx,dy};
  }

  function clearToLand(a,id){
    const rw=runways.find(r=>r.id===id.replace(/^9/,'09'));
    if(!rw){say('Unknown runway.',true);return false;}
    if(a.kind!=='arrival'||a.landed){say(`${a.callsign}: not an airborne arrival`,true);return false;}
    if(a.altitude>3000){say(`${a.callsign}: unable landing clearance above 3,000 ft; descend first.`,true);return false;}
    if(Math.abs(turnDelta(a.heading,rw.heading))>60){say(`${a.callsign}: vector within 60° of heading ${rw.heading} before landing clearance.`,true);return false;}
    a.clearedToLand=rw.id;a.nav=null;a.approachCaptured=false;
    a.targetHeading=a.heading;
    return `cleared to land runway ${rw.id}, maintain heading until centreline interception`;
  }

  function updateApproach(a){
    if(a.kind!=='arrival'||!a.clearedToLand||a.landed)return;
    const rw=runways.find(r=>r.id===a.clearedToLand);
    const p=runwayPosition(a,rw);
    const angle=turnDelta(rw.heading,a.heading)*Math.PI/180;
    // Begin the turn just before crossing the centreline, allowing for turn radius.
    const turnRadius=(a.speed/3600)/(maximumTurnRate(a)*Math.PI/180);
    const intercepting=p.cross*Math.sin(angle)>0;
    // A practical localizer corridor, not sub-pixel precision on the overview map.
    const onFinal=Math.abs(p.cross)<0.2 && Math.abs(angle)<5*Math.PI/180;
    if(!a.approachCaptured && p.ahead>0 && p.ahead<APPROACH_RANGE_NM &&
      (onFinal || (intercepting&&Math.abs(p.cross)<turnRadius*(1-Math.cos(angle))+0.12))){
      a.approachCaptured=true;
      say(`${a.callsign}: runway ${rw.id} centreline captured, descending on final.`);
    }
    if(a.approachCaptured){
      // Track an aim point ahead on the centreline rather than chasing the threshold.
      // This gives the pilot time to align before reaching the runway.
      const lookAhead=Math.max(0.8,a.speed/120);
      const correction=Math.max(-25,Math.min(25,Math.atan2(p.cross,lookAhead)*180/Math.PI));
      a.targetHeading=normalizeHeading(rw.heading+correction);
      // Approximate 3° glide path: 318 ft/NM. Never climb to join it from below.
      a.targetAltitude=Math.min(a.altitude,Math.max(0,(p.ahead-0.1)*318));
      a.targetSpeed=profile(a).approach;
    }
  }

  function parseCommand(raw){
    const t=raw.trim().toUpperCase().split(/\s+/); if(!t[0])return;
    if(t[0]==='STATS'){return say(`Score ${state.score} | Landings ${state.landings} | Handoffs ${state.handoffs} | Violations ${state.violations}`)}
    const a=findAircraft(t[0]); if(!a)return say(`Aircraft ${t[0]} not found.`,true);
    let i=1;
    const readback=[];
    while(i<t.length){
      const cmd=t[i++];
      if(cmd==='C' && i<t.length){const result=applyClearance(a,t[i++]);if(!result)return;readback.push(result);}
      else if(cmd==='H' && i<t.length){const h=Number(t[i++]); if(!Number.isFinite(h))return say('Invalid heading.',true);a.targetHeading=normalizeHeading(h);a.nav=null;readback.push(`heading ${String(a.targetHeading).padStart(3,'0')}°`);}
      else if((cmd==='A'||cmd==='ALT') && i<t.length){let alt=Number(t[i++]);if(!Number.isFinite(alt)||alt<0)return say('Invalid altitude.',true); if(alt<100)alt*=1000; a.targetAltitude=alt;readback.push(altitudeReadback(a));}
      else if((cmd==='S'||cmd==='SPD') && i<t.length){
        const speed=Number(t[i++]),limits=profile(a);
        if(!Number.isFinite(speed)||speed<limits.min||speed>limits.max)return say(`${a.callsign} ${a.type}: speed must be ${limits.min}–${limits.max} kt.`,true);
        a.targetSpeed=speed;
        readback.push(`speed ${speed} kt`);
      }
      else if((cmd==='R'||cmd==='RWY') && i<t.length){if(!assignRunway(a,t[i++]))return;readback.push(`use runway ${a.runway}`);}
      else if((cmd==='D'||cmd==='DIRECT') && i<t.length){const f=findFix(t[i++]); if(f){a.nav=f;readback.push(`head direct to ${f.id}`);} else return say('Unknown fix.',true);}
      else if((cmd==='L'||cmd==='LAND') && i<t.length){const result=clearToLand(a,t[i++]);if(!result)return;readback.push(result);}
      else if(cmd==='T'||cmd==='TO'){if(!takeoff(a))return;readback.push(`cleared for takeoff runway ${a.runway}`);}
      else if(cmd==='G'||cmd==='GA'){a.clearedToLand=null;a.approachCaptured=false;a.nav=null;a.targetAltitude=Math.max(3000,a.targetAltitude);a.targetSpeed=Math.max(190,a.targetSpeed);a.targetHeading=normalizeHeading(a.heading+30);a.phase='airborne';readback.push(`go around, ${altitudeReadback(a)}, heading ${Math.round(a.targetHeading)}°, speed ${a.targetSpeed} kt`);}
      else return say(`Unknown/incomplete command: ${cmd}`,true);
    }
    say(`${a.callsign}: ${readback.length?readback.join(', '):'no instructions provided'}.`); selectAircraft(a);
  }

  function say(msg,error=false){ messageEl.textContent=msg; messageEl.className='message '+(error?'error':'ok'); }
  function selectAircraft(a){ state.selected=a?.id ?? null; input.value=a?`${a.callsign} `:''; input.focus(); renderStrips(); }

  function timeOfDaySeconds(){return (SESSION_START_SECONDS+state.clockElapsed)%86400;}
  // Heathrow documents the 06:00–07:00 arrival peak and scheduled night limits.
  // Ratios/density below are modest gameplay approximations, not a live timetable.
  function trafficPattern(seconds){
    const minutes=seconds/60;
    if(minutes<305 || minutes>=1375)return {density:0,arrivalShare:0};
    if(minutes<360)return {density:0.6,arrivalShare:1};
    if(minutes<420)return {density:1,arrivalShare:0.75};
    if(minutes<1360)return {density:1,arrivalShare:0.5};
    return {density:0.4,arrivalShare:1};
  }

  function updateTraffic(){
    const pending=state.upcoming[0];
    if(pending && state.trafficElapsed>=pending.dueAt){
      const {dueAt,...flight}=pending;
      flight.kind==='arrival'?spawnArrival(flight):spawnDeparture(flight);
      state.upcoming.shift();state.lastSpawn=state.trafficElapsed;
    }
    if(state.upcoming.length)return;
    // Choose the next flight once and reserve its identity for the preview strip.
    const futureTime=(timeOfDaySeconds()+TRAFFIC_NOTICE_SECONDS*NORMAL_SIMULATION_RATE*CLOCK_SECONDS_PER_SIM_SECOND)%86400;
    const pattern=trafficPattern(futureTime);
    if(pattern.density===0){state.lastSpawn=state.trafficElapsed;return;}
    const interval=TRAFFIC_INTERVAL*(1+Math.max(0,1-state.trafficElapsed/300))/pattern.density;
    if(state.trafficElapsed-state.lastSpawn<Math.max(0,interval-TRAFFIC_NOTICE_SECONDS))return;
    const arrivals=state.aircraft.filter(a=>a.kind==='arrival'&&!a.landed&&a.removeAt===undefined).length;
    const waiting=state.aircraft.filter(a=>a.kind==='departure'&&a.phase==='holding').length;
    const kind=Math.random()<pattern.arrivalShare?'arrival':'departure';
    if((kind==='arrival'&&arrivals>=5)||(kind==='departure'&&waiting>=2)){
      state.lastSpawn=state.trafficElapsed;return;
    }
    const flight={callsign:callsign(),kind,type:aircraftTypes[Math.floor(rand(0,aircraftTypes.length))],dueAt:state.trafficElapsed+TRAFFIC_NOTICE_SECONDS};
    if(kind==='departure')flight.exitFix=departureFixes[Math.floor(rand(0,departureFixes.length))].id;
    else {flight.altitude=Math.round(rand(65,100))*100;flight.targetAltitude=flight.altitude;flight.speed=Math.round(rand(220,270));}
    state.upcoming.push(flight);
  }

  function update(dt, clockDt=dt){
    if(state.paused)return;
    state.elapsed+=dt;
    state.clockElapsed+=clockDt*CLOCK_SECONDS_PER_SIM_SECOND;
    // Preserve Normal spawning pace; other speeds advance the same traffic model.
    const pace=NORMAL_SIMULATION_RATE;
    state.trafficElapsed+=clockDt/pace;
    updateTraffic();

    for(const a of [...state.aircraft]){
      if(a.removeAt!==undefined || a.phase==='holding')continue;
      if(a.phase==='takeoff')a.targetHeading=runways.find(r=>r.id===a.runway).heading;
      if(a.nav && a.phase==='airborne'){ const dx=(a.nav.x-a.x)*sector.width,dy=(a.nav.y-a.y)*sector.height; a.targetHeading=normalizeHeading(Math.atan2(dx,-dy)*180/Math.PI); if(distance(a,a.nav)<1.2)a.nav=null; }
      updateApproach(a);
      updateTurn(a,dt);
      const altDelta=a.targetAltitude-a.altitude; const climb=Math.sign(altDelta)*Math.min(Math.abs(altDelta),1600*dt/60);
      if(a.phase!=='takeoff'||a.speed>profile(a).min)a.altitude=Math.max(0,a.altitude+climb);
      // Airborne clearances change speed gradually; runway acceleration is faster.
      const speedChangeRate=a.phase==='takeoff'?3:0.6; // kt per simulation second
      const spdDelta=a.targetSpeed-a.speed; a.speed+=Math.sign(spdDelta)*Math.min(Math.abs(spdDelta),speedChangeRate*dt);

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
        const {ahead,cross:crossTrack}=runwayPosition(a,rw);
        const runwayLength=distance(threshold,{x:rw.x2,y:rw.y2});
        // Touchdown may happen anywhere along the runway, not only at its threshold.
        // Stop targeting the approach before turning back toward a passed threshold.
        if(a.approachCaptured && ahead<=0)a.targetHeading=rw.heading;
        const inTouchdownArea=ahead<0.12 && ahead>-(runwayLength-0.1);
        if(a.approachCaptured && inTouchdownArea && Math.abs(crossTrack)<0.1 && aligned && a.altitude<100){
          if(ahead>0){a.x=threshold.x;a.y=threshold.y;}
          a.altitude=0;a.speed=90;a.targetSpeed=0;a.phase='landed';a.landed=true;
          state.landings++;state.score+=100;removeAircraft(a,2.5);say(`${a.callsign}: landed runway ${rw.id}.`);
        }
        else if(a.approachCaptured && ahead<=-(runwayLength-0.1)){
          a.clearedToLand=null;a.approachCaptured=false;a.targetAltitude=3000;
          a.targetSpeed=Math.max(190,a.targetSpeed);a.targetHeading=rw.heading;
          say(`${a.callsign}: unable to complete landing on ${rw.id}, going around to 3,000 ft.`,true);
        }
      }
      if(a.kind==='departure' && a.phase==='airborne' && a.altitude>=4000){ const f=findFix(a.exitFix); if(distance(a,f)<1.3){state.handoffs++;state.score+=80; removeAircraft(a);}}
      if(a.x<-.08||a.x>1.08||a.y<-.08||a.y>1.08){ if(a.kind==='arrival'){state.missed++;state.score-=100;} removeAircraft(a); }
    }
    checkSeparation();
  }

  function removeAircraft(a,delay=0){ a.removeAt=state.elapsed+delay; }
  function cleanup(){ state.aircraft=state.aircraft.filter(a=>a.removeAt===undefined || state.elapsed<a.removeAt); }

  function isParallelRunwayOperation(a,b){
    const arrival=a.kind==='arrival'?a:b;
    const departure=a.kind==='departure'?a:b;
    if(arrival.kind!=='arrival'||departure.kind!=='departure')return false;
    // Only the ground roll is exempt. Liftoff immediately restores separation.
    if(departure.phase!=='takeoff'||departure.altitude>1||!arrival.approachCaptured||!arrival.clearedToLand)return false;
    const landingRunway=runways.find(r=>r.id===arrival.clearedToLand);
    const takeoffRunway=runways.find(r=>r.id===departure.runway);
    if(!landingRunway||!takeoffRunway||landingRunway.heading!==takeoffRunway.heading)return false;
    const samePhysicalRunway=physicalRunways.some(r=>[r.west,r.east].includes(landingRunway.id)&&[r.west,r.east].includes(takeoffRunway.id));
    if(samePhysicalRunway)return false;
    const landing=runwayPosition(arrival,landingRunway),takeoff=runwayPosition(departure,takeoffRunway);
    const length=distance({x:takeoffRunway.x1,y:takeoffRunway.y1},{x:takeoffRunway.x2,y:takeoffRunway.y2});
    return arrival.altitude<=1000 && landing.ahead>=0 && landing.ahead<=3 &&
      Math.abs(landing.cross)<0.1 && Math.abs(turnDelta(arrival.heading,landingRunway.heading))<10 &&
      takeoff.ahead<=0.05 && takeoff.ahead>=-length && Math.abs(takeoff.cross)<0.05;
  }

  function isParallelFinalPair(a,b){
    // Clearance alone is insufficient: both aircraft must actually be aligned
    // on their separate localizers. Losing final capture restores separation.
    function finalRunway(aircraft){
      if(aircraft.kind!=='arrival'||aircraft.phase!=='airborne'||!aircraft.approachCaptured||aircraft.landed)return null;
      const runway=runways.find(r=>r.id===aircraft.clearedToLand);
      if(!runway)return null;
      const position=runwayPosition(aircraft,runway);
      const length=distance({x:runway.x1,y:runway.y1},{x:runway.x2,y:runway.y2});
      return position.ahead>=-(length-0.1) && position.ahead<=APPROACH_RANGE_NM &&
        Math.abs(position.cross)<0.1 && Math.abs(turnDelta(aircraft.heading,runway.heading))<10 ? runway : null;
    }
    const first=finalRunway(a),second=finalRunway(b);
    if(!first||!second||first.heading!==second.heading)return false;
    return !physicalRunways.some(r=>[r.west,r.east].includes(first.id)&&[r.west,r.east].includes(second.id));
  }

  function checkSeparation(){
    const current=new Set(); let alert=[];
    const air=state.aircraft.filter(a=>a.phase!=='holding'&&!a.landed);
    for(let i=0;i<air.length;i++)for(let j=i+1;j<air.length;j++){
      const a=air[i],b=air[j], key=[a.id,b.id].sort((x,y)=>x-y).join('-');
      if(!isParallelRunwayOperation(a,b) && !isParallelFinalPair(a,b) && distance(a,b)<3 && Math.abs(a.altitude-b.altitude)<1000){
        current.add(key); alert.push(`${a.callsign}/${b.callsign}`);
        if(!state.conflicts.has(key)){state.violations++;state.score-=10;}
      }
    }
    state.conflicts=current;
    if(alert.length){alertBanner.textContent='SEPARATION ALERT: '+alert.join('  ');alertBanner.classList.remove('hidden');}
    else alertBanner.classList.add('hidden');
  }

  function drawCompass(){
    // Screen-space, unfilled compass beneath targets: never blocks clicks or labels.
    ctx.save();ctx.setTransform(1,0,0,1,0,0);
    const x=canvas.width-67,y=canvas.height-67,radius=38;
    ctx.globalAlpha=0.35;ctx.strokeStyle='#b0c7d3';ctx.fillStyle='#b0c7d3';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.stroke();
    ctx.font='10px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    for(let heading=0;heading<360;heading+=30){
      const angle=heading*Math.PI/180,sin=Math.sin(angle),cos=Math.cos(angle);
      ctx.beginPath();ctx.moveTo(x+sin*radius,y-cos*radius);
      ctx.lineTo(x+sin*(radius-(heading%90===0?7:3)),y-cos*(radius-(heading%90===0?7:3)));ctx.stroke();
      if(heading%90===0)ctx.fillText(heading===0?'360':String(heading).padStart(3,'0'),x+sin*(radius+12),y-cos*(radius+12));
    }
    ctx.fillText('WIND',x,y-6);ctx.fillText('270° / 10 kt',x,y+7);
    // Marker on the west side shows the direction the wind comes FROM.
    ctx.beginPath();ctx.moveTo(x-radius+10,y);ctx.lineTo(x-radius+17,y-4);ctx.lineTo(x-radius+17,y+4);ctx.closePath();ctx.fill();
    ctx.restore();
  }

  function draw(){
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#203f4c';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.setTransform(mapView.scale,0,0,mapView.scale,mapView.left,mapView.top);
    const w=mapWidth,h=mapHeight;
    drawGeography();
    const left=-mapView.left/mapView.scale,top=-mapView.top/mapView.scale;
    const right=left+canvas.width/mapView.scale,bottom=top+canvas.height/mapView.scale;
    ctx.strokeStyle='#345361';ctx.lineWidth=0.5;
    for(let x=Math.floor(left/100)*100;x<right;x+=100){ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke()}
    for(let y=Math.floor(top/100)*100;y<bottom;y+=100){ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke()}
    ctx.strokeStyle='#426370'; ctx.beginPath();ctx.arc(w/2,h/2,Math.min(w,h)*.4,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.arc(w/2,h/2,Math.min(w,h)*.2,0,Math.PI*2);ctx.stroke();

    ctx.font=`${11/mapView.scale}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    for(const f of fixes){
      const x=f.x*w,y=f.y*h;ctx.strokeStyle='#99b5c4';ctx.beginPath();
      if(f.kind==='RNAV'){ctx.moveTo(x,y-6);ctx.lineTo(x+5,y+4);ctx.lineTo(x-5,y+4);ctx.closePath();}
      else {ctx.arc(x,y,5,0,Math.PI*2);}
      ctx.stroke();
      if(f.kind==='NDB'){ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.stroke();}
      ctx.fillStyle='#b0c7d3';ctx.fillText(f.id,f.id==='LON'?x-30:x,f.id==='LON'?y-22:y+12);
    }
    // Extended approach paths use the same capture range as landing guidance.
    ctx.save();ctx.strokeStyle='#6e909f';ctx.lineWidth=0.6;ctx.setLineDash([3,5]);
    for(const rw of runways){
      const rad=rw.heading*Math.PI/180;
      ctx.beginPath();ctx.moveTo(rw.x1*w,rw.y1*h);
      ctx.lineTo((rw.x1-Math.sin(rad)*APPROACH_RANGE_NM/sector.width)*w,(rw.y1+Math.cos(rad)*APPROACH_RANGE_NM/sector.height)*h);ctx.stroke();
    }
    ctx.restore();
    for(const [index,r] of physicalRunways.entries()){
      // Deliberately enlarged runway symbols, as on an overview radar chart.
      // Their centre/centreline stay geographic; aircraft and landing thresholds
      // continue using the real runway coordinates, independent of this glyph.
      const cx=(r.start.x+r.end.x)*w/2,cy=(r.start.y+r.end.y)*h/2;
      const halfLength=Math.max((r.end.x-r.start.x)*w*1.1,22/mapView.scale);
      const labelY=cy+(index===0?-10:10)/mapView.scale;
      ctx.strokeStyle='#dae7ee';ctx.lineWidth=2.5/mapView.scale;
      ctx.beginPath();ctx.moveTo(cx-halfLength,cy);ctx.lineTo(cx+halfLength,cy);ctx.stroke();
      ctx.fillStyle='#c0d2dd';ctx.textAlign='right';ctx.fillText(r.west,cx-halfLength-5/mapView.scale,labelY);
      ctx.textAlign='left';ctx.fillText(r.east,cx+halfLength+5/mapView.scale,labelY);ctx.textAlign='center';
    }
    ctx.lineWidth=1;
    drawCompass();

    for(const a of state.aircraft){
      if(a.phase==='holding')continue;
      const colour=a.kind==='departure'?'#8dccff':'#f0f7fb';
      ctx.strokeStyle=a.kind==='departure'?'#659fca':'#7396a5'; for(const p of a.trail){ctx.beginPath();ctx.arc(p.x*w,p.y*h,1.5,0,Math.PI*2);ctx.stroke();}
      const x=a.x*w,y=a.y*h; const selected=state.selected===a.id; const conflict=[...state.conflicts].some(k=>k.split('-').map(Number).includes(a.id));
      ctx.fillStyle=conflict?'#ff9292':selected?'#ffd48a':colour; ctx.fillRect(x-3,y-3,6,6);
      const rad=a.heading*Math.PI/180;ctx.strokeStyle=ctx.fillStyle;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(rad)*14,y-Math.cos(rad)*14);ctx.stroke();
      const trend=a.targetAltitude-a.altitude;
      ctx.textAlign='left';ctx.font=`${11/mapView.scale}px sans-serif`;
      ctx.fillText(a.callsign,x+8,y-10/mapView.scale);
      ctx.fillText(`${String(Math.round(a.altitude/100)).padStart(3,'0')}${trend>50?'↑':trend<-50?'↓':'='}${Math.round(a.speed/10)}`,x+8,y+3/mapView.scale);
    }
    ctx.textAlign='center';
    ctx.fillStyle='#a2bccb';ctx.fillText('NORTH ↑',w/2,bottom-14);
  }

  function renderStrips(){
    const scrollTop = stripsEl.scrollTop;
    stripsEl.innerHTML='';
    for(const a of state.aircraft){
      const d=document.createElement('div');d.className=`strip ${a.kind} ${state.selected===a.id?'selected':''}`;
      d.innerHTML=`<div class="strip-top"><span class="callsign">${a.callsign}</span><span class="kind">${a.kind==='arrival'?'ARR':'DEP'}</span></div><div class="strip-bottom"><span>${a.type}</span><span>${Math.round(a.altitude)}ft</span><span>${Math.round(a.speed)}kt</span></div>${a.kind==='departure'?`<div class="strip-bottom">${a.runway?'RWY '+a.runway:'Assign runway: R 27L / R 27R / R 09L / R 09R'} · FIX ${a.exitFix}</div>`:''}`;
      if(a.kind==='arrival'&&a.clearedToLand){
        const status=document.createElement('div');status.className='strip-bottom';
        status.textContent=`RWY ${a.clearedToLand} · ${a.approachCaptured?'FINAL':'AWAITING INTERCEPT'}`;d.appendChild(status);
      }
      d.onclick=()=>selectAircraft(a);stripsEl.appendChild(d);
    }
    for(const flight of state.upcoming){
      const seconds=Math.max(0,Math.ceil(flight.dueAt-state.trafficElapsed));
      const strip=document.createElement('div');strip.className=`strip upcoming ${flight.kind}`;
      strip.innerHTML=`<div class="strip-top"><span class="callsign">${flight.callsign}</span><span class="kind">${flight.kind==='arrival'?'ARR':'DEP'}</span></div><div class="strip-bottom"><span>${flight.type}</span><span>${flight.kind==='arrival'?flight.altitude+'ft':flight.exitFix}</span></div><div class="strip-bottom upcoming-countdown">Coming in ${seconds}s · not active yet</div>`;
      stripsEl.appendChild(strip);
    }
    // Periodic strip updates should preserve the controller's place in the list.
    stripsEl.scrollTop = scrollTop;
  }

  function updateUI(){
    ui.score.textContent=state.score;ui.landings.textContent=state.landings;ui.handoffs.textContent=state.handoffs;ui.violations.textContent=state.violations;ui.missed.textContent=state.missed;
    ui.arrivals.textContent=state.aircraft.filter(a=>a.kind==='arrival').length;ui.departures.textContent=state.aircraft.filter(a=>a.kind==='departure').length;
    const time=timeOfDaySeconds(),hours=Math.floor(time/3600),minutes=Math.floor(time/60)%60;
    ui.clock.textContent=`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
  }

  function resize(){
    const r=canvas.parentElement.getBoundingClientRect();canvas.width=Math.max(1,Math.floor(r.width));canvas.height=Math.max(1,Math.floor(r.height));
    const zoom=MAP_ZOOM;
    const scale=Math.min(canvas.width/mapWidth,canvas.height/mapHeight)*zoom;
    mapView={scale,left:(canvas.width-mapWidth*scale)/2,top:(canvas.height-mapHeight*scale)/2};
  }
  window.addEventListener('resize',resize);
  new ResizeObserver(resize).observe(canvas.parentElement);
  canvas.addEventListener('click',e=>{const r=canvas.getBoundingClientRect(),mx=((e.clientX-r.left)*canvas.width/r.width-mapView.left)/(mapWidth*mapView.scale),my=((e.clientY-r.top)*canvas.height/r.height-mapView.top)/(mapHeight*mapView.scale);let best=null,bd=20;for(const a of state.aircraft){if(a.phase==='holding')continue;const d=Math.hypot((a.x-mx)*mapWidth*mapView.scale,(a.y-my)*mapHeight*mapView.scale);if(d<bd){best=a;bd=d}}if(best)selectAircraft(best)});
  form.addEventListener('submit',e=>{e.preventDefault();parseCommand(input.value);input.value='';});
  document.getElementById('pauseBtn').onclick=()=>{state.paused=!state.paused;document.getElementById('pauseBtn').textContent=state.paused?'Resume':'Pause'};
  const helpDialog=document.getElementById('helpDialog');
  let pausedBeforeHelp=false;
  document.getElementById('helpBtn').onclick=()=>{
    pausedBeforeHelp=state.paused;state.paused=true;
    document.getElementById('pauseBtn').textContent='Resume';helpDialog.showModal();
  };
  document.getElementById('closeHelpBtn').onclick=()=>helpDialog.close();
  helpDialog.addEventListener('close',()=>{
    state.paused=pausedBeforeHelp;
    document.getElementById('pauseBtn').textContent=state.paused?'Resume':'Pause';input.focus();
  });
  const speedButtons=[...document.querySelectorAll('[data-speed]')];
  function setSimulationRate(rate){
    simulationRate=rate;
    for(const button of speedButtons)button.setAttribute('aria-pressed',String(Number(button.dataset.speed)===rate));
  }
  for(const button of speedButtons)button.addEventListener('click',()=>setSimulationRate(Number(button.dataset.speed)));
  document.getElementById('restartBtn').onclick=()=>{reset();renderStrips()};
  document.getElementById('spawnBtn').onclick=()=>{Math.random()<.7?spawnArrival():spawnDeparture();renderStrips()};

  let last=performance.now(),stripTimer=0;
  function frame(now){
    const dt=Math.min(.1,(now-last)/1000);last=now;
    const rate=simulationRate;
    // Accelerate the entire simulation uniformly, using small steps for approach/separation checks.
    let remaining=dt*rate*GAMEPLAY_PACE;
    while(remaining>0){const step=Math.min(.05,remaining);update(step,step/GAMEPLAY_PACE);cleanup();remaining-=step;}
    draw();updateUI();stripTimer+=dt;if(stripTimer>.7){renderStrips();stripTimer=0}requestAnimationFrame(frame);
  }
  reset();resize();renderStrips();requestAnimationFrame(frame);
})();
