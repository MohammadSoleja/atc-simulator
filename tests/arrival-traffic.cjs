const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createEngine}=require('./harness.cjs');
const definition=()=>JSON.parse(fs.readFileSync('simulator/airports/egll.json','utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
function setup(waves=false){
 const data=definition();
 if(!waves)delete data.traffic.waves;
 else {data.traffic.waves.enabled=true;data.traffic.arrival_interval_seconds=20;}
 const result=createEngine(undefined,data),s=result.engine.getState();
 s.aircraft=[];s.trafficElapsed=300;s.lastSpawn=300;s.clockElapsed=6*3600;
 return result;
}
function step(engine,seconds=1){engine.update(0,seconds*2);engine.cleanup();}
// Independent streams: roughly 1.3 arrivals/minute and one departure/minute at midday,
// with overlapping full notices. No aircraft are cleared to free spawning slots.
{
 const {engine,element,context}=setup();const s=engine.getState();engine.update(0,0);
 const notices=new Map(),arrivals=[],departures=[];
 for(let t=0;t<300;t++){
  engine.renderStrips();
  for(const flight of s.upcoming){
   if(!notices.has(flight.callsign))notices.set(flight.callsign,s.trafficElapsed);
   assert.ok(flight.dueAt-s.trafficElapsed<=30+1e-6,'visible within notice window');
  }
  const known=new Set(s.aircraft.map(a=>a.callsign));step(engine);
  for(const a of s.aircraft.filter(a=>!known.has(a.callsign))){
   assert.ok(s.trafficElapsed-notices.get(a.callsign)>=30-1e-6,'full notice before activation');
   (a.kind==='arrival'?arrivals:departures).push(s.trafficElapsed);
  }
 }
 assert.ok(arrivals.length===6);
 assert.ok(departures.length>=4&&departures.length<=5);
 for(let i=1;i<arrivals.length;i++)assert.equal(arrivals[i]-arrivals[i-1],45);
 for(let i=1;i<departures.length;i++)assert.equal(departures[i]-departures[i-1],60);
 assert.ok(s.upcoming.filter(f=>f.kind==='arrival').length>=1,'arrival previews continue');
 const snapshot=clone(context.window.ATCGame.exportSnapshot());
 context.window.ATCGame.restoreSnapshot(snapshot);
 assert.deepEqual(clone(context.window.ATCGame.exportSnapshot()),snapshot,'both stream timers survive save/restore');
 step(engine,60);assert.deepEqual(clone(context.window.ATCGame.exportSnapshot()),snapshot,'paused load freezes both streams');
}
// Waves cannot compress arrival spacing, and only the next 30 seconds are shown.
{
 const {engine,element}=setup(true),s=engine.getState();let previous=-Infinity,sawWave=false;
 for(let t=0;t<1800;t++){
  const known=new Set(s.aircraft.map(a=>a.callsign));step(engine);
  if(s.upcoming.length>3)sawWave=true;
  for(const a of s.aircraft.filter(a=>a.kind==='arrival'&&!known.has(a.callsign))){
   assert.ok(s.trafficElapsed-previous>=20-1e-6,'wave arrival minimum spacing');previous=s.trafficElapsed;
  }
  engine.renderStrips();
  assert.ok(!element('strips').children.some(c=>/Coming in (?:[4-9]\d|[1-9]\d{2,})s/.test(c.innerHTML||'')),'distant wave flights stay hidden');
  assert.ok(s.upcoming.length<=10);
 }
 assert.ok(sawWave);
}
// Faster game paces reserve the same traffic after equivalent simulated time.
for(const pace of [1,2,4,8]){
 const {engine}=setup();engine.setSimulationRate(pace);engine.advanceSimulation(92/pace);
 assert.ok(Math.abs(engine.getState().trafficElapsed-346)<1e-6);
 assert.equal(engine.getState().aircraft.filter(a=>a.kind==='arrival').length,1);
}
console.log('PASS: independent 45-second arrivals, unchanged departure cadence, full overlapping notices, wave spacing, save/resume, pause and all paces.');

// Actual default configs use exactly two arrivals and one departure in each wave, even
// across wave trigger times and with aircraft neither landed nor cleared.
for(const airport of ['egll','oerk']){
 const data=JSON.parse(fs.readFileSync(`simulator/airports/${airport}.json`,'utf8'));
 // Exercise the retained optional wave settings independently of the live toggle.
 data.traffic.waves.enabled=true;
 const {engine}=createEngine(undefined,data),s=engine.getState();
 s.aircraft=[];s.trafficElapsed=300;s.lastSpawn=300;s.clockElapsed=6*3600;
 let waves=0;
 for(let i=0;i<1200;i++){
  const before=new Set(s.upcoming.map(f=>f.callsign));
  step(engine);s.aircraft=[];
  const added=s.upcoming.filter(f=>!before.has(f.callsign));
  if(added.length>=3){
   waves++;assert.equal(added.length,3);
   assert.equal(added.filter(f=>f.kind==='arrival').length,2);
   assert.equal(added.filter(f=>f.kind==='departure').length,1);
   for(let j=1;j<added.length;j++)assert.ok(added[j].dueAt-added[j-1].dueAt>=20);
  }
  assert.ok(s.upcoming.length<=5,'small wave plus existing notices');
 }
 assert.ok(waves>=2,`${airport}: mixed waves enabled`);
 assert.equal(data.traffic.arrival_interval_seconds,45,'regular arrival interval retained');
}
console.log('PASS: both production map configurations keep 45-second regular arrivals and fixed 2-arrival/1-departure waves.');

for(const airport of ['egll','oerk']){
 const data=JSON.parse(fs.readFileSync(`simulator/airports/${airport}.json`,'utf8'));
 assert.equal(data.traffic.waves.enabled,false);
 const {engine}=createEngine(undefined,data),s=engine.getState();
 s.aircraft=[];s.trafficElapsed=300;s.lastSpawn=300;s.clockElapsed=6*3600;
 const counts={arrival:0,departure:0};
 for(let i=0;i<1200;i++){
  step(engine);for(const a of s.aircraft)counts[a.kind]++;s.aircraft=[];
  assert.ok(s.upcoming.length<=2,'no wave queue');
 }
 assert.equal(counts.arrival,26);assert.equal(counts.departure,20);
}
console.log('PASS: live Heathrow/Riyadh wave toggles disabled; regular traffic unchanged.');
