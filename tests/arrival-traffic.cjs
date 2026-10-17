const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createEngine}=require('./harness.cjs');
const definition=()=>JSON.parse(fs.readFileSync('simulator/airports/egll.json','utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
function setup(waves=false){
 const data=definition();if(!waves)delete data.traffic.waves;
 const result=createEngine(undefined,data),s=result.engine.getState();
 s.aircraft=[];s.trafficElapsed=300;s.lastSpawn=300;s.clockElapsed=6*3600;
 return result;
}
function step(engine,seconds=1){engine.update(0,seconds*2);engine.cleanup();}
// Independent streams: three arrivals/minute and one departure/minute at midday,
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
 assert.ok(arrivals.length>=13&&arrivals.length<=14);
 assert.ok(departures.length>=4&&departures.length<=5);
 for(let i=1;i<arrivals.length;i++)assert.equal(arrivals[i]-arrivals[i-1],20);
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
 const {engine}=setup();engine.setSimulationRate(pace);engine.advanceSimulation(62/pace);
 assert.ok(Math.abs(engine.getState().trafficElapsed-331)<1e-6);
 assert.equal(engine.getState().aircraft.filter(a=>a.kind==='arrival').length,1);
}
console.log('PASS: independent 20-second arrivals, unchanged departure cadence, full overlapping notices, wave spacing, save/resume, pause and all paces.');
