const assert=require('node:assert/strict');
const {createEngine:makeEngine}=require('./harness.cjs');
// Keep coverage for airports using the original mixed scheduler. Heathrow's
// independent arrival stream is tested separately in arrival-traffic.cjs.
function createEngine(){
 const definition=JSON.parse(require('node:fs').readFileSync('simulator/airports/egll.json','utf8'));
 delete definition.traffic.arrival_interval_seconds;
 return makeEngine(undefined,definition);
}

const minute=(hour,min=0)=>hour*3600+min*60;
function atTime(engine,seconds){engine.getState().clockElapsed=(seconds-minute(6)+86400)%86400;}
// Exercise the real scheduler without moving aircraft. A Normal traffic second
// advances the airport clock by two seconds, exactly as the animation loop does.
function tick(engine,seconds=1){engine.update(0,seconds*2);engine.cleanup();}
function plain(value){return JSON.parse(JSON.stringify(value));}

const bands=[
  [0,minute(5,5),0,0],
  [minute(5,5),minute(6),.6,1],
  [minute(6),minute(7),1,.75],
  [minute(7),minute(22,40),1,.5],
  [minute(22,40),minute(22,55),.4,1],
  [minute(22,55),86400,0,0]
];
{
  const {engine}=createEngine();
  for(const [start,end,density,arrivalShare] of bands){
    for(const seconds of [start,(start+end)/2,end-.001]){
      assert.deepEqual(plain(engine.trafficPattern(seconds)),{density,arrivalShare},`schedule at ${seconds}`);
    }
  }
}

// Clock wrap and all offered traffic in a repeatable complete day. Clear active
// aircraft after recording them to measure demand independently of controller
// throughput; this is not an unattended-play difficulty benchmark.
const report=bands.map(([start,end])=>({start,end,arrivals:0,departures:0}));
{
  const {engine}=createEngine();
  const state=engine.getState();
  state.aircraft=[];atTime(engine,0);state.trafficElapsed=300;state.lastSpawn=300;
  for(let step=0;step<43200;step++){
    tick(engine);
    const time=engine.timeOfDaySeconds();
    for(const aircraft of state.aircraft){
      const band=report.find(b=>time>=b.start&&time<b.end);
      band[aircraft.kind==='arrival'?'arrivals':'departures']++;
      assert.ok(engine.trafficPattern(time).density>0,'no scheduled overnight activation');
      if(time<minute(6)||time>=minute(22,40))assert.equal(aircraft.kind,'arrival');
    }
    state.aircraft=[];
    assert.ok(state.upcoming.length<=6,'bounded staggered wave queue');
  }
  assert.equal(engine.timeOfDaySeconds(),0,'full day wraps to midnight');
  for(const row of report){
    const pattern=engine.trafficPattern(row.start);
    const total=row.arrivals+row.departures;
    if(!pattern.density){assert.equal(total,0);continue;}
    assert.ok(total>0,'each open band offers traffic');
    assert.ok(Math.abs(row.arrivals/total-pattern.arrivalShare)<.1,'seeded mix follows configured ratio');
  }
  assert.ok(report[1].arrivals/(report[1].end-report[1].start)<
    (report[2].arrivals+report[2].departures)/(report[2].end-report[2].start),'early arrivals are quieter');
}

{
  const {engine}=createEngine();
  const state=engine.getState();
  assert.equal(state.aircraft.length,1,'gentle start with one arrival');
  assert.equal(state.upcoming.length,0);
  for(let seconds=1;seconds<=25;seconds++){tick(engine);assert.equal(state.upcoming.length,0,'no initial burst');}
  let firstPreview;
  for(let seconds=26;seconds<=65;seconds++){
    tick(engine);
    if(state.upcoming.length&&!firstPreview)firstPreview=state.trafficElapsed;
    if(state.aircraft.length>1)break;
  }
  assert.ok(firstPreview>=25&&firstPreview<=30,'gradual initial notice');
  assert.equal(state.trafficElapsed-firstPreview,30,'first activation has full notice');
  assert.equal(state.aircraft.length,2,'only one new aircraft');
  // Preserve existing buildup curve: at maturity a new preview immediately
  // follows the previous activation, with a 30 Normal-second interval.
  state.aircraft=[];state.upcoming=[];state.trafficElapsed=300;state.lastSpawn=300;
  engine.update(0,0);
  assert.equal(state.upcoming[0].dueAt,330);
  tick(engine,29);assert.equal(state.aircraft.length,0);
  tick(engine);assert.equal(state.aircraft.length,1);
  assert.equal(state.upcoming[0].dueAt,360);
}

// Both preview types, attributes, countdown UI, pause/dialogs and pace changes.
for(const [kind,random] of [['arrival',.1],['departure',.9]]){
  const {engine,element,context}=createEngine();
  require('node:vm').runInContext(`Math.random=()=>${random}`,context);
  const state=engine.getState();
  state.trafficElapsed=300;state.lastSpawn=300;engine.update(0,0);
  const pending=plain(state.upcoming[0]);assert.equal(pending.kind,kind);
  assert.ok(!state.aircraft.some(a=>a.callsign===pending.callsign));
  const original=state.aircraft.length;
  engine.renderStrips();
  assert.match(element('strips').children.at(-1).innerHTML,/Coming in 30s/);
  engine.setSimulationRate(1);engine.advanceSimulation(10);
  assert.ok(Math.abs(state.trafficElapsed-305)<1e-7);
  engine.renderStrips();assert.match(element('strips').children.at(-1).innerHTML,/Coming in 25s/);
  for(const dialog of ['help','info','settings']){
    const before=plain({clock:state.clockElapsed,traffic:state.trafficElapsed,upcoming:state.upcoming});
    element(`${dialog}Btn`).onclick();engine.advanceSimulation(10);
    assert.deepEqual(plain({clock:state.clockElapsed,traffic:state.trafficElapsed,upcoming:state.upcoming}),before);
    element(`${dialog}Dialog`).close();assert.equal(state.paused,false);
  }
  state.paused=true;engine.setSimulationRate(8);engine.advanceSimulation(10);
  assert.ok(Math.abs(state.trafficElapsed-305)<1e-7);
  element('helpBtn').onclick();element('helpDialog').close();assert.equal(state.paused,true);
  state.paused=false;
  engine.setSimulationRate(4);engine.advanceSimulation(5); // 10 Normal seconds
  engine.setSimulationRate(8);engine.advanceSimulation(3.5); // 14 Normal seconds
  assert.equal(state.aircraft.length,original,'no early activation after switching pace');
  engine.setSimulationRate(2);engine.advanceSimulation(1.01);
  const active=state.aircraft.find(a=>a.callsign===pending.callsign);
  assert.ok(active,'reserved aircraft activates once');
  assert.equal(state.aircraft.filter(a=>a.callsign===pending.callsign).length,1);
  assert.equal(active.type,pending.type);assert.equal(active.kind,pending.kind);
  if(kind==='arrival')assert.equal(active.targetAltitude,pending.altitude);
  else {assert.equal(active.exitFix,pending.exitFix);assert.equal(active.phase,'holding');}
  engine.reset();assert.equal(engine.getSimulationRate(),2);
  assert.equal(engine.getState().upcoming.length,0);assert.equal(engine.timeOfDaySeconds(),minute(6));
}

for(const rate of [1,2,4,8]){
  const {engine}=createEngine();
  engine.setSimulationRate(rate);engine.advanceSimulation(10);
  assert.ok(Math.abs(engine.getState().clockElapsed-10*rate)<1e-7,'clock scales with pace');
  assert.ok(Math.abs(engine.getState().trafficElapsed-5*rate)<1e-7,'buildup scales with pace');
}

// A preview crossing an operating-hours boundary uses its activation time,
// rather than offering an overnight flight or a departure after the cutoff.
for(const [time,random,expected] of [
  [minute(5,4),.1,'arrival'],
  [minute(22,39),.9,'arrival'],
  [minute(22,54),.1,null]
]){
  const {engine,context}=createEngine();
  require('node:vm').runInContext(`Math.random=()=>${random}`,context);
  const state=engine.getState();state.aircraft=[];state.trafficElapsed=1000;state.lastSpawn=0;
  atTime(engine,time);engine.update(0,0);
  if(expected){
    assert.equal(state.upcoming[0].kind,expected);
    tick(engine,29);assert.equal(state.aircraft.length,0);
    tick(engine);assert.equal(state.aircraft[0].kind,expected);
  }else{
    assert.equal(state.upcoming.length,0,'no notice whose activation falls at night cutoff');
    tick(engine,30);assert.equal(state.aircraft.length,0);
  }
}

// Traffic keeps arriving even when the controller has not cleared existing flights.
{
  const {engine}=createEngine();const state=engine.getState();atTime(engine,minute(12));
  let sawWave=false;
  for(let seconds=0;seconds<1800;seconds++){
    tick(engine);
    if(state.upcoming.length>=3){
      sawWave=true;
      const arrivals=state.upcoming.filter(f=>f.kind==='arrival').length;
      const departures=state.upcoming.filter(f=>f.kind==='departure').length;
      assert.ok(arrivals<=4&&departures<=3,'wave plus at most one baseline preview');
      for(let i=1;i<state.upcoming.length;i++)assert.ok(state.upcoming[i].dueAt-state.upcoming[i-1].dueAt>=15);
      engine.renderStrips();
      assert.ok(!JSON.stringify(state.upcoming).includes('undefined'));
    }
  }
  assert.ok(sawWave,'waves occur after buildup');
  assert.ok(state.aircraft.filter(a=>a.kind==='arrival').length>5,'arrivals are uncapped');
  assert.ok(state.aircraft.filter(a=>a.kind==='departure').length>2,'waiting departures are uncapped');
}

{
  const {engine}=createEngine();atTime(engine,minute(23));
  const aircraft=engine.getState().aircraft[0],before={x:aircraft.x,y:aircraft.y};
  engine.advanceSimulation(1);
  assert.ok(aircraft.x!==before.x||aircraft.y!==before.y,'existing aircraft keep moving overnight');
  assert.equal(engine.getState().upcoming.length,0);
}

console.table(report.map(({start,end,arrivals,departures})=>({
  period:`${String(Math.floor(start/3600)).padStart(2,'0')}:${String(start/60%60).padStart(2,'0')}–${end===86400?'24:00':`${String(Math.floor(end/3600)).padStart(2,'0')}:${String(end/60%60).padStart(2,'0')}`}`,
  arrivals,departures
})));
console.log('PASS G04: full-day mix, boundaries, buildup, previews, pause/dialogs, all paces, uncapped traffic, waves and restart.');
