/* Build simulation coordinates from a local, readable airport definition. */
(() => {
  function initialize(data, background) {
    const fail = label => { throw Error('Invalid airport configuration: '+label+'.'); };
    const finite = (n,min,max) => Number.isFinite(n) && n>=min && n<=max;
    function coordinate(value,latitude){
      const pattern=latitude?/^\d{6}(\.\d+)?[NS]$/:/^\d{7}(\.\d+)?[EW]$/;
      if(typeof value!=='string'||!pattern.test(value))fail('geographic coordinate');
      const digits=latitude?2:3;
      const degrees=Number(value.slice(0,digits)),minutes=Number(value.slice(digits,digits+2)),seconds=Number(value.slice(digits+2,-1));
      const result=degrees+minutes/60+seconds/3600;
      if(minutes>=60||seconds>=60||result>(latitude?90:180))fail('geographic coordinate range');
      return /[WS]$/.test(value)?-result:result;
    }
    try{
      if(data.version!==1||!/^[a-z0-9]{4}$/.test(data.id)||!/^[A-Z0-9]{4}$/.test(data.code)||!data.name||!data.short_name)fail('identity/version');
      const s=data.sector,d=data.display,t=data.traffic;
      if(!finite(s.width,10,500)||!finite(s.height,10,500)||!finite(s.latitude,-85,85)||!finite(s.longitude,-180,180))fail('sector bounds');
      if(Math.abs(d.width/d.height-s.width/s.height)>.001)fail('display/sector aspect ratio');
      if(!finite(d.width,100,5000)||!finite(d.height,100,5000)||!finite(d.zoom,.5,4)||!finite(d.approach_range_nm,1,100))fail('display');
      const position=(lat,lon)=>({x:0.5+(lon-s.longitude)*60*Math.cos(s.latitude*Math.PI/180)/s.width,y:0.5-(lat-s.latitude)*60/s.height});
      const point=values=>position(coordinate(values[0],true),coordinate(values[1],false));
      if(!Array.isArray(data.runways)||!data.runways.length)fail('runways');
      const ids=new Set(),runways=[],physicalRunways=[];
      for(const r of data.runways){
        if(r.ends.length!==2||r.headings.length!==2)fail('runway endpoints');
        const start=point(r.start),end=point(r.end);
        if(start.x===end.x&&start.y===end.y)fail('zero-length runway');
        for(let i=0;i<2;i++){
          if(!/^(0[1-9]|[12][0-9]|3[0-6])[LRC]?$/.test(r.ends[i])||ids.has(r.ends[i])||!finite(r.headings[i],0,360))fail('runway identifier/heading');
          const p=i?end:start,q=i?start:end;ids.add(r.ends[i]);
          runways.push({id:r.ends[i],x1:p.x,y1:p.y,x2:q.x,y2:q.y,heading:r.headings[i]%360});
        }
        const [a,b]=r.ends;
        if((Number(a.slice(0,2))-Number(b.slice(0,2))+36)%36!==18||({L:'R',R:'L',C:'C','':''})[a.slice(2)]!==b.slice(2)||Math.abs((r.headings[1]-r.headings[0]+360)%360-180)>.01)fail('reciprocal runways');
        physicalRunways.push({ends:[...r.ends],heading:r.headings[0]%360,start,end});
      }
      const fixIds=new Set();
      const fixes=data.fixes.map(f=>{
        if(!/^[A-Z0-9]{2,8}$/.test(f.id)||fixIds.has(f.id)||!['RNAV','DME','VOR/DME','NDB'].includes(f.kind)||!Array.isArray(f.label_offset)||f.label_offset.length!==2||f.label_offset.some(n=>!finite(n,-100,100)))fail('navigation fix');
        fixIds.add(f.id);return {id:f.id,kind:f.kind,label_offset:f.label_offset,...point([f.latitude,f.longitude])};
      });
      if(!fixes.length||!data.departure_fixes.length||new Set(data.departure_fixes).size!==data.departure_fixes.length||data.departure_fixes.some(id=>!fixIds.has(id)))fail('departure fixes');
      for(const [key,min,max] of [['start_seconds',0,86399],['interval_seconds',1,3600],['notice_seconds',1,3600],['buildup_seconds',1,3600],['initial_arrivals',0,100]])if(!Number.isInteger(t[key])||!finite(t[key],min,max))fail('traffic '+key);
      for(const [key,min,max] of [['arrival_altitude_hundreds',1,999],['arrival_speed',140,350]])if(t[key].length!==2||t[key].some(n=>!finite(n,min,max))||t[key][0]>t[key][1])fail('traffic '+key);
      if(t.arrival_interval_seconds!==undefined&&(!Number.isInteger(t.arrival_interval_seconds)||!finite(t.arrival_interval_seconds,15,3600)))fail('arrival interval');
      if(t.waves){
        for(const [key,min,max] of [['spacing_seconds',1,30],['interval_seconds',300,600],['jitter_seconds',0,150]])if(!Number.isInteger(t.waves[key])||!finite(t.waves[key],min,max))fail('wave '+key);
        if(t.waves.jitter_seconds>=t.waves.interval_seconds)fail('wave timing');
      }
      if(!finite(t.arrival_target_speed,140,350))fail('initial traffic');
      let previous=0;
      for(const p of t.patterns){if(!finite(p.until_minute,previous+1e-9,1440)||!finite(p.density,0,5)||!finite(p.arrival_share,0,1))fail('traffic pattern');previous=p.until_minute;}
      if(previous!==1440)fail('full-day traffic patterns');
      if(!finite(data.wind.heading,0,360)||!finite(data.wind.speed,0,100))fail('wind');
      if(!data.background.attribution||!data.background.sources.length||!data.aeronautical_sources.length)fail('source attribution');
      if(!background||!Array.isArray(background.urban)||!Array.isArray(background.rivers))fail('background data unavailable');
      const projectLine=line=>line.map(([lon,lat])=>{if(!finite(lon,-180,180)||!finite(lat,-90,90))fail('background coordinate');return position(lat,lon);});
      const geography={urban:background.urban.map(poly=>poly.map(projectLine)),rivers:background.rivers.map(projectLine)};
      return {definition:data,sector:s,position,airport:position(s.latitude,s.longitude),physicalRunways,runways,fixes,departureFixes:fixes.filter(f=>data.departure_fixes.includes(f.id)),geography};
    }catch(error){
      if(error.message.startsWith('Invalid airport configuration:'))throw error;
      fail('missing or malformed fields');
    }
  }
  window.ATCAirport={initialize};
})();
