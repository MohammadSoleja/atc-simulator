const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {createEngine}=require('./harness.cjs');
const definition=JSON.parse(fs.readFileSync('simulator/airports/oerk.json','utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
function setup(){return createEngine(undefined,definition);}
function position(a,r,ahead,cross=0){const rad=r.heading*Math.PI/180;a.x=r.x1-(Math.sin(rad)*ahead+Math.cos(rad)*cross)/100;a.y=r.y1+(Math.cos(rad)*ahead-Math.sin(rad)*cross)/100;}
function until(engine,condition,seconds=1800){for(let i=0;i<seconds*10&&!condition();i++)engine.update(.1,0);assert.ok(condition(),'scenario completes');}
for(const id of ['15L','15R','33L','33R']){
 for(const cross of [0,-1,1]){
  const {engine,element}=setup(),a=engine.getState().aircraft[0],r=engine.runways.find(r=>r.id===id);
  position(a,r,10,cross);Object.assign(a,{altitude:5000,targetAltitude:5000,speed:180,targetSpeed:180,heading:r.heading+Math.sign(cross)*30,targetHeading:r.heading+Math.sign(cross)*30});
  engine.parseCommand(`${a.callsign} L ${id}`);assert.equal(a.clearedToLand,id);
  until(engine,()=>a.landed);
  assert.equal(a.altitude,r.elevation);assert.equal(a.targetAltitude,r.elevation);
  assert.equal(engine.getState().landings,1);assert.equal(engine.getState().score,100);
  engine.update(1,0);assert.equal(engine.getState().landings,1);
 }
 const {engine,element}=setup(),a=engine.getState().aircraft[0],r=engine.runways.find(r=>r.id===id);
 position(a,r,10);Object.assign(a,{altitude:r.elevation+3000.01,targetAltitude:r.elevation+3000.01,heading:r.heading});
 engine.parseCommand(`${a.callsign} L ${id}`);assert.equal(a.clearedToLand,null,'clearance height measured above threshold');
 a.altitude=5000;engine.parseCommand(`${a.callsign} L ${id}`);engine.update(.1,0);assert.equal(a.approachCaptured,true);
 engine.parseCommand(`${a.callsign} G`);assert.equal(a.targetAltitude,6000);
 const oldTarget=a.targetAltitude;engine.parseCommand(`${a.callsign} C 2`);assert.equal(a.targetAltitude,oldTarget,'no below-ground command');
 assert.match(element('message').textContent,/at least 2,053/);
 engine.spawnDeparture();const dep=engine.getState().aircraft.at(-1);engine.getState().aircraft=[dep];
 engine.parseCommand(`${dep.callsign} R ${id}`);assert.equal(dep.altitude,r.elevation);assert.equal(dep.targetAltitude,r.elevation);
 engine.parseCommand(`${dep.callsign} T`);assert.equal(dep.phase,'holding','must assign altitude above local ground');
 engine.parseCommand(`${dep.callsign} C 7 T`);assert.equal(dep.x,r.x1);assert.equal(dep.y,r.y1);assert.equal(dep.heading,r.heading);
 until(engine,()=>dep.phase==='airborne',100);assert.ok(dep.altitude>=r.elevation+50);
 const fix=definition.departure_fixes[['15L','15R','33L','33R'].indexOf(id)];dep.exitFix=fix;
 engine.parseCommand(`${dep.callsign} C ${fix}`);until(engine,()=>dep.removeAt!==undefined);
 assert.equal(engine.getState().handoffs,1);assert.ok(dep.altitude>=7000);
 assert.ok(engine.distance(dep,engine.fixes.find(f=>f.id===fix))<1.3);
}
// Elevated parallel operations retain only the existing narrow separation exception.
for(const [arrId,depId] of [['33L','33R'],['15L','15R']]){
 const {engine}=setup(),a=engine.getState().aircraft[0];engine.spawnDeparture();const b=engine.getState().aircraft[1];
 const ar=engine.runways.find(r=>r.id===arrId),dr=engine.runways.find(r=>r.id===depId);
 position(a,ar,1);Object.assign(a,{heading:ar.heading,clearedToLand:arrId,approachCaptured:true,altitude:ar.elevation+500});
 position(b,dr,-.5);Object.assign(b,{heading:dr.heading,runway:depId,phase:'takeoff',altitude:dr.elevation});
 engine.checkSeparation();assert.equal(engine.getState().conflicts.size,0);
 b.altitude=dr.elevation+1100;engine.checkSeparation();assert.equal(engine.getState().conflicts.size,1,'climb above runway exception restores normal checks');
}
{
 const {engine,context}=setup();
 for(const f of engine.fixes){assert.ok(f.x>=0&&f.x<=1&&f.y>=0&&f.y<=1,`${f.id} inside approved sector`);engine.parseCommand(`${engine.getState().aircraft[0].callsign} C ${f.id}`);assert.equal(engine.getState().aircraft[0].nav.id,f.id);}
 vm.runInContext(fs.readFileSync('simulator/static/simulator/js/voice.js','utf8'),context);
 const ctx={callsigns:['SVA111'],fixes:engine.fixes.map(f=>f.id),runways:engine.runways.map(r=>r.id)};
 assert.equal(context.window.ATCVoice.translate('Saudia one one one descend and maintain five thousand direct kilo sierra alpha',ctx),'SVA111 C 5 C KSA');
 assert.equal(context.window.ATCVoice.translate('Saudia one one one runway three three left cleared to land',ctx),'SVA111 L 33L');
 engine.spawnDeparture();const dep=engine.getState().aircraft.at(-1);engine.parseCommand(`${dep.callsign} C 7 R 33R T`);
 const snapshot=clone(context.window.ATCGame.exportSnapshot());context.window.ATCGame.restoreSnapshot(snapshot);
 assert.deepEqual(clone(context.window.ATCGame.exportSnapshot()),snapshot);engine.reset();assert.equal(context.window.ATCGame.airport,'oerk');
 const geographyContext={window:{}};vm.createContext(geographyContext);vm.runInContext(fs.readFileSync('simulator/static/simulator/js/map-oerk.js','utf8'),geographyContext);
 assert.ok(geographyContext.window.ATC_MAP_DATA.urban.length>0);assert.equal(geographyContext.window.ATC_MAP_DATA.rivers.length,0);
}
// Map-specific traffic keeps its own gentler independent cadence.
{
 const {engine}=setup(),state=engine.getState();
 assert.equal(state.aircraft.length,1);
 for(let i=0;i<25;i++)engine.update(0,2);
 assert.equal(state.upcoming.length,0,'no initial burst');
 state.aircraft=[];state.upcoming=[];state.trafficElapsed=300;state.lastSpawn=300;delete state.trafficSchedule;
 const seen=new Set(),counts={arrival:0,departure:0};
 for(let t=0;t<300;t++){
  engine.update(0,2);
  for(const a of state.aircraft)if(!seen.has(a.callsign)){seen.add(a.callsign);counts[a.kind]++;}
  state.aircraft=[];
 }
 assert.ok(counts.arrival===5,'60-second mature arrivals');
 assert.ok(counts.departure>=4&&counts.departure<=5,'60-second mature departures');
 state.paused=true;const elapsed=state.trafficElapsed;engine.update(0,100);assert.equal(state.trafficElapsed,elapsed);
}
// Both airports use the same NM-to-pixel scale at desktop and narrow sizes.
for(const [width,height] of [[1720,840],[1100,760],[454,310]]){
 const ruh=setup(),lhr=createEngine();
 for(const h of [ruh,lhr]){
  h.element('radar').parentElement.getBoundingClientRect=()=>({width,height});h.engine.resize();
 }
 assert.equal(ruh.engine.getMapView().scale,lhr.engine.getMapView().scale,'same aircraft/trail/fix symbol scale');
 assert.equal(definition.sector.width,100);assert.equal(definition.sector.height,100,'sector remains intact');
}
// MEPTU's gameplay offset keeps the real navigation target and marker together.
{
 const data=clone(definition),original=clone(definition);
 delete original.fixes.find(f=>f.id==='MEPTU').position_offset_nm;
 const adjusted=setup(),published=createEngine(undefined,original);
 const point=adjusted.engine.fixes.find(f=>f.id==='MEPTU');
 assert.ok(Math.abs(adjusted.engine.distance(point,published.engine.fixes.find(f=>f.id==='MEPTU'))-6)<1e-8);
 adjusted.element('radar').parentElement.getBoundingClientRect=()=>({width:1720,height:840});adjusted.engine.resize();
 const view=adjusted.engine.getMapView(),y=point.y*1000*view.scale+view.top;
 assert.ok(y>40&&y<800,'MEPTU symbol and label sit comfortably inside desktop view');
 for(const id of ['RK762','RK783','RK579','RK565'])assert.ok(adjusted.engine.fixes.some(f=>f.id===id));
 data.fixes[0].position_offset_nm={east:0,north:999};assert.equal(createEngine(undefined,data).engine,undefined,'invalid offsets fail initialization');
}
// Every destination remains visible on the owner's desktop layout, including
// all requested departure fixes; preserved identifiers keep old saves loadable.
{
 const {engine,element}=setup();element('radar').parentElement.getBoundingClientRect=()=>({width:1720,height:840});engine.resize();
 const view=engine.getMapView();
 for(const f of engine.fixes){
  const x=f.x*1000*view.scale+view.left,y=f.y*1000*view.scale+view.top;
  assert.ok(x>35&&x<1685&&y>35&&y<805,`${f.id}: marker and label inside view`);
 }
}
// Practical intercepts from repositioned staging fixes, not just synthetic
// centreline positions: execute the same commands the player can use.
for(const [fixName,heading,id] of [['RK734',120,'15L'],['RK734',120,'15R'],['RK538',300,'33L'],['RK538',300,'33R']]){
 const {engine}=setup(),a=engine.getState().aircraft[0],fix=engine.fixes.find(f=>f.id===fixName);
 Object.assign(a,{x:fix.x,y:fix.y,altitude:5000,targetAltitude:5000,speed:180,targetSpeed:180,heading,targetHeading:heading});
 engine.parseCommand(`${a.callsign} H ${heading} L ${id}`);
 until(engine,()=>a.landed,1500);assert.equal(engine.getState().landings,1,`${fixName} intercept lands on ${id}`);
}
console.log('PASS M04–M06: Riyadh all-end aligned/angled landings, threshold elevations, go-arounds, takeoff/climb/handoffs, narrow separation, verified-fix navigation, voice, background, restart and saves.');
