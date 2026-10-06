const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    width: 1100, height: 760, value: id === 'trafficRate' ? '22' : '',
    scrollTop: 0, classList: {add(){},remove(){}},
    parentElement: {getBoundingClientRect: () => ({width:1100,height:760})},
    addEventListener(){}, focus(){}, appendChild(){}, getContext: () => ({})
  });
  return elements.get(id);
}
const context = vm.createContext({
  document: {getElementById: element, querySelectorAll: () => [], createElement: () => ({appendChild(){}})},
  ResizeObserver: class {observe(){}}, window: {addEventListener(){}}, performance: {now: () => 0}, requestAnimationFrame(){}
});
let source = fs.readFileSync(process.argv[2] || require('node:path').resolve(__dirname, '../simulator/static/simulator/js/game.js'), 'utf8');
// Expose the real engine only inside this isolated verification harness.
source = source.replace('  reset();resize();renderStrips();requestAnimationFrame(frame);',
  '  globalThis.engine={reset,parseCommand,update,spawnArrival,spawnDeparture,cleanup,runways,fixes,distance,checkSeparation,trafficPattern,timeOfDaySeconds,setSimulationRate,getSimulationRate:()=>simulationRate,updateUI,getState:()=>state}; reset();');
vm.runInContext(source, context);
const engine = context.engine;

engine.reset();
let a=engine.getState().aircraft[0];
a.altitude=7000;a.targetAltitude=7000;
engine.parseCommand(`${a.callsign} C 3 C NIGIT S 180`);
assert.equal(element('message').textContent,`${a.callsign}: descend and maintain 3,000 ft, head direct to NIGIT, speed 180 kt.`);
engine.parseCommand(`${a.callsign} L 27L`);
assert.equal(element('message').className,'message error');
assert.equal(a.clearedToLand,null);
for(const id of ['09L','09R','27L','27R']) {
 engine.reset();a=engine.getState().aircraft[0];
 const rw=engine.runways.find(r=>r.id===id);
 const rad=rw.heading*Math.PI/180;
 Object.assign(a,{x:rw.x1-Math.sin(rad)*10/100,y:rw.y1+Math.cos(rad)*10/70,
 altitude:3000,targetAltitude:3000,heading:rw.heading,targetHeading:rw.heading,speed:180,targetSpeed:180});
 engine.parseCommand(`${a.callsign} L ${id}`);
 assert.ok(element('message').textContent.includes(`cleared to land runway ${id}`));
 for(let i=0;i<10000&&!a.landed;i++)engine.update(.05);
 assert.equal(a.landed,true,`full approach lands on ${id}`);
 assert.equal(engine.getState().landings,1);
 assert.equal(a.x,rw.x1);assert.equal(a.y,rw.y1);
 engine.update(.05);assert.equal(engine.getState().landings,1);
}
engine.reset();a=engine.getState().aircraft[0];
const rw=engine.runways.find(r=>r.id==='27L');
Object.assign(a,{x:rw.x1+.1,y:rw.y1-1/70,altitude:3000,targetAltitude:3000,
 heading:240,targetHeading:240,speed:180,targetSpeed:180});
engine.parseCommand(`${a.callsign} L 27L`);
for(let i=0;i<14000&&!a.landed;i++)engine.update(.05);
assert.equal(a.landed,true,'angled intercept captures and lands');
engine.reset();a=engine.getState().aircraft[0];
Object.assign(a,{x:rw.x1+.1,y:rw.y1-1/70,altitude:3000,targetAltitude:3000,
 heading:270,targetHeading:270,speed:180,targetSpeed:180});
engine.parseCommand(`${a.callsign} L 27L`);
for(let i=0;i<7000;i++)engine.update(.05);
assert.ok(!a.landed,'parallel off-centreline flight does not land');
assert.equal(a.targetAltitude,3000);
console.log('PASS: full chained readback, high-altitude rejection, complete approaches on all four runways, angled interception, single landing score, and off-centreline missed approach.');

engine.reset();a=engine.getState().aircraft[0];
Object.assign(a,{x:rw.x1+.05,y:rw.y1+.01/70,heading:240,targetHeading:270,altitude:2000,targetAltitude:2000,speed:180,targetSpeed:180});
engine.parseCommand(`${a.callsign} L 27L`);
assert.equal(a.clearedToLand,'27L');assert.equal(a.targetHeading,240);
for(let i=0;i<3000;i++)engine.update(.05);
assert.equal(a.approachCaptured,false,'late clearance after centreline crossing misses capture');
assert.equal(a.targetHeading,240);assert.equal(a.altitude,2000);
engine.reset();a=engine.getState().aircraft[0];
Object.assign(a,{x:rw.x1-.01,y:rw.y1,heading:270,targetHeading:270,altitude:2000,targetAltitude:2000,speed:180,targetSpeed:180});
engine.parseCommand(`${a.callsign} L 27L`);
assert.equal(a.clearedToLand,'27L','past-threshold clearance accepted based on heading and altitude');
engine.update(1);assert.equal(a.approachCaptured,false);assert.equal(a.targetAltitude,2000);
for(const heading of [210,330]) {
 a.heading=heading;engine.parseCommand(`${a.callsign} L 27L`);
 assert.equal(element('message').className,'message ok');
}
a.heading=209;engine.parseCommand(`${a.callsign} L 27L`);assert.equal(element('message').className,'message error');
console.log('PASS: late/behind-threshold clearance acceptance, continuing interception heading without descent, and inclusive ±60° limits.');
engine.reset();a=engine.getState().aircraft[0];
Object.assign(a,{x:.5,y:.5,heading:90,targetHeading:270,speed:240,targetSpeed:240,altitude:6000,targetAltitude:6000});
engine.update(1);
assert.ok(Math.abs(a.heading-90)<1,'turn starts gradually');
for(let i=0;i<59;i++)engine.update(1);
assert.ok(Math.abs(a.heading-270)>20,'180 degree turn cannot complete in 60 simulation seconds at 240 knots');
for(let i=0;i<80;i++)engine.update(1);
assert.ok(Math.abs(a.heading-270)<1,'turn settles onto commanded heading');
engine.reset();a=engine.getState().aircraft[0];
Object.assign(a,{x:rw.x1+.20,y:rw.y1,altitude:3000,targetAltitude:3000,heading:270,targetHeading:270,speed:180,targetSpeed:180});
engine.parseCommand(`${a.callsign} L 27L`);engine.update(.05);
assert.equal(a.approachCaptured,true,'capture extends to 20 NM');
console.log('PASS: gradual bank entry, speed-dependent turn duration, rollout and 20 NM approach capture.');

engine.reset();
assert.equal(engine.getSimulationRate(),2,'Normal is default');
for(const rate of [1,2,4,8]){
 engine.reset();engine.setSimulationRate(rate);engine.update(10*rate);
 assert.equal(engine.getState().clockElapsed,10*rate,'clock scales with selected speed');
 assert.equal(engine.getState().trafficElapsed,5*rate,'traffic uses the same Normal baseline');
 engine.getState().paused=true;engine.update(100);
 assert.equal(engine.getState().clockElapsed,10*rate,'pause freezes clock');
}
engine.reset();assert.equal(engine.getSimulationRate(),2,'restart restores Normal');
assert.equal(engine.timeOfDaySeconds(),21600,'session starts at 06:00');
engine.getState().clockElapsed=86400;assert.equal(engine.timeOfDaySeconds(),21600,'clock wraps daily');
for(const minute of [0,304.99,1375,1439])assert.equal(engine.trafficPattern(minute*60).density,0,'no scheduled overnight traffic');
assert.equal(engine.trafficPattern(305*60).arrivalShare,1);
assert.equal(engine.trafficPattern(360*60).arrivalShare,.75);
assert.equal(engine.trafficPattern(420*60).arrivalShare,.5);
assert.equal(engine.trafficPattern(1360*60).arrivalShare,1);
console.log('PASS: default/restart speed, all clock/traffic speed ratios, pause, daily wrap and traffic-pattern boundaries.');

// Regression: a visually aligned, parallel approach must not need sub-pixel aiming.
for(const id of ['09L','09R','27L','27R'])for(const cross of [-0.15,0.15]){
 engine.reset();a=engine.getState().aircraft[0];const runway=engine.runways.find(r=>r.id===id);
 const rad=runway.heading*Math.PI/180;
 Object.assign(a,{x:runway.x1-(Math.sin(rad)*8+Math.cos(rad)*cross)/100,
 y:runway.y1+(Math.cos(rad)*8-Math.sin(rad)*cross)/70,
 altitude:3000,targetAltitude:3000,heading:runway.heading,targetHeading:runway.heading,speed:180,targetSpeed:180});
 engine.parseCommand(`${a.callsign} L ${id}`);engine.update(.05);
 assert.equal(a.approachCaptured,true,`${id} captures a near-aligned approach`);
 for(let i=0;i<12000&&!a.landed;i++)engine.update(.05);
 assert.equal(a.landed,true,`${id} near-aligned approach completes`);
}
// Regression: safely descending across the threshold must not trigger an immediate go-around.
engine.reset();a=engine.getState().aircraft[0];
Object.assign(a,{x:rw.x1-.2/100,y:rw.y1,altitude:80,targetAltitude:0,heading:270,targetHeading:270,
 speed:145,targetSpeed:145,clearedToLand:'27L',approachCaptured:true});
engine.update(.05);assert.equal(a.landed,true,'touchdown beyond threshold on usable runway');
assert.equal(engine.getState().landings,1);engine.update(.05);assert.equal(engine.getState().landings,1);
console.log('PASS: near-aligned approaches on all runway ends and touchdown beyond the threshold.');

function runwayPair(){
 engine.reset();const landing=engine.getState().aircraft[0];
 const north=engine.runways.find(r=>r.id==='27R'),south=engine.runways.find(r=>r.id==='27L');
 Object.assign(landing,{x:north.x1+.01,y:north.y1,heading:270,altitude:600,clearedToLand:'27R',approachCaptured:true});
 engine.spawnDeparture();const departure=engine.getState().aircraft[1];
 Object.assign(departure,{x:south.x1-.005,y:south.y1,heading:270,altitude:0,phase:'takeoff',runway:'27L'});
 return {landing,departure,north,south};
}
let pair=runwayPair();engine.checkSeparation();assert.equal(engine.getState().violations,0,'parallel runway final and ground roll exempt');
pair.departure.phase='airborne';pair.departure.altitude=50;engine.checkSeparation();
assert.equal(engine.getState().violations,1,'liftoff immediately restores airborne separation');
engine.checkSeparation();assert.equal(engine.getState().violations,1,'continued conflict is not double penalised');
for(const scenario of ['same runway','not captured','overhead','outside final']){
 pair=runwayPair();
 if(scenario==='same runway')Object.assign(pair.departure,{runway:'27R',y:pair.north.y1});
 if(scenario==='not captured')pair.landing.approachCaptured=false;
 if(scenario==='overhead')pair.landing.heading=90;
 if(scenario==='outside final')pair.landing.y-=.2/70;
 engine.checkSeparation();assert.equal(engine.getState().violations,1,scenario+' still monitored');
}
engine.reset();engine.update(24,20);
assert.equal(engine.getState().elapsed,24,'aircraft dynamics can run 20% faster');
assert.equal(engine.getState().clockElapsed,20,'clock uses the new Normal baseline');
assert.equal(engine.getState().trafficElapsed,10,'traffic timing retains clock baseline');
console.log('PASS: narrow parallel-runway exemption, liftoff/same-runway/overhead conflicts, and separate gameplay/clock pace.');

engine.reset();engine.getState().trafficElapsed=31;engine.update(0);
let notice=engine.getState().upcoming[0];assert.ok(notice,'next flight is previewed');
assert.equal(notice.dueAt-engine.getState().trafficElapsed,30,'full 30-second notice');
assert.equal(engine.getState().aircraft.length,1,'pending flight is not active');
engine.getState().paused=true;engine.update(10);assert.equal(engine.getState().trafficElapsed,31,'pause freezes notice');
engine.getState().paused=false;engine.getState().trafficElapsed=notice.dueAt-.01;engine.update(0);
assert.equal(engine.getState().aircraft.length,1,'no early activation');
engine.getState().trafficElapsed=notice.dueAt;engine.update(0);
const activated=engine.getState().aircraft.find(a=>a.callsign===notice.callsign);
assert.ok(activated,'previewed callsign activates');assert.equal(activated.type,notice.type);
assert.equal(activated.kind,notice.kind);assert.equal(engine.getState().upcoming.length,0);
if(notice.kind==='arrival')assert.equal(activated.altitude,notice.altitude);
else assert.equal(activated.exitFix,notice.exitFix);
engine.reset();assert.equal(engine.getState().upcoming.length,0,'restart clears notices');
console.log('PASS: full notice, pause, activation deadline, preserved flight identity and restart.');

for(const [kind,random] of [['arrival',0.1],['departure',0.9]]){
 vm.runInContext(`Math.random=()=>${random}`,context);
 engine.reset();engine.getState().trafficElapsed=31;engine.update(0);
 const scheduled=engine.getState().upcoming[0];assert.equal(scheduled.kind,kind);
 assert.notEqual(scheduled.callsign,engine.getState().aircraft[0].callsign,'preview callsigns are unique');
 engine.getState().trafficElapsed=scheduled.dueAt;engine.update(0);
 const flight=engine.getState().aircraft.find(a=>a.callsign===scheduled.callsign);
 assert.equal(flight.kind,kind);assert.equal(flight.type,scheduled.type);
 if(kind==='departure'){assert.equal(flight.phase,'holding');assert.equal(flight.exitFix,scheduled.exitFix);}
 else assert.equal(flight.altitude,scheduled.altitude);
}
console.log('PASS: arrival and departure preview activation, unique callsigns and departure holding phase.');

function parallelFinalPair(firstId='27R',secondId='27L'){
 engine.reset();engine.spawnArrival();
 const aircraft=engine.getState().aircraft;
 for(const [index,id] of [firstId,secondId].entries()){
  const runway=engine.runways.find(r=>r.id===id),rad=runway.heading*Math.PI/180;
  Object.assign(aircraft[index],{x:runway.x1-Math.sin(rad)*2/100,y:runway.y1+Math.cos(rad)*2/70,
   heading:runway.heading,altitude:650,phase:'airborne',clearedToLand:id,approachCaptured:true});
 }
 return aircraft;
}
for(const ids of [['27R','27L'],['27L','27R'],['09L','09R'],['09R','09L']]){
 parallelFinalPair(...ids);engine.checkSeparation();
 assert.equal(engine.getState().violations,0,ids.join('/')+' established parallel finals exempt');
}
for(const scenario of ['same runway','not captured','off centreline','turning','go-around','departure','opposite direction']){
 const aircraft=parallelFinalPair();
 if(scenario==='same runway'){aircraft[1].clearedToLand='27R';aircraft[1].y=aircraft[0].y;}
 if(scenario==='not captured')aircraft[1].approachCaptured=false;
 if(scenario==='off centreline')aircraft[1].y+=.2/70;
 if(scenario==='turning')aircraft[1].heading=240;
 if(scenario==='go-around')aircraft[1].clearedToLand=null;
 if(scenario==='departure')aircraft[1].kind='departure';
 if(scenario==='opposite direction'){aircraft[1].clearedToLand='09R';aircraft[1].heading=90;}
 engine.checkSeparation();assert.equal(engine.getState().violations,1,scenario+' remains a conflict');
}
const finals=parallelFinalPair();engine.checkSeparation();finals[1].approachCaptured=false;
engine.checkSeparation();assert.equal(engine.getState().violations,1,'leaving final restores separation immediately');
console.log('PASS: established parallel finals in both directions, same runway/crossing/go-around conflicts and immediate restoration.');
