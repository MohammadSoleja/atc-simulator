const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createEngine}=require('./harness.cjs');
const read=name=>JSON.parse(fs.readFileSync(name,'utf8'));
const heathrow=read('simulator/airports/egll.json'),test=read('tests/fixtures/test-airport.json');
const {engine,context,element}=createEngine(undefined,test);
assert.equal(context.window.ATCGame.airport,'test');
assert.equal(context.window.ATCGame.exportSnapshot().airport,'test');
assert.equal(engine.runways.length,2);assert.equal(engine.runways[0].id,'18');
assert.deepEqual(Array.from(engine.fixes,f=>f.id),['TST1','TST2']);
const a=engine.getState().aircraft[0];engine.parseCommand(`${a.callsign} C HEN`);
assert.match(element('message').textContent,/Invalid clearance/);
engine.parseCommand(`${a.callsign} C TST1`);assert.equal(a.nav.id,'TST1');
engine.parseCommand(`${a.callsign} L 27L`);assert.match(element('message').textContent,/Unknown runway/);
engine.spawnDeparture();const dep=engine.getState().aircraft.at(-1);
assert.equal(dep.exitFix,'TST2');engine.parseCommand(`${dep.callsign} C 5 R 18 T`);
assert.equal(dep.runway,'18');assert.equal(dep.phase,'takeoff');assert.equal(dep.heading,180);
engine.reset();assert.equal(context.window.ATCGame.airport,'test');
assert.match(element('message').textContent,/New Test Field session/);
assert.equal(engine.trafficPattern(0).density,1);assert.equal(engine.trafficPattern(86399).density,1);
const local=JSON.parse(JSON.stringify(context.window.ATCGame.exportSnapshot()));
local.airport='egll';assert.throws(()=>context.window.ATCGame.restoreSnapshot(local),/airport/);
// Validation fails before constructing the engine; no half-initialized simulation.
for(const change of [a=>a.sector.width=0,a=>a.fixes[0].id=a.fixes[1].id,
 a=>a.departure_fixes=['UNKNOWN'],a=>a.runways[0].headings=[90,90],
 a=>a.runways[0].start=['999999N','0000000W'],a=>a.background.attribution='',
 a=>a.traffic.patterns[0].until_minute=1440]){
 const bad=JSON.parse(JSON.stringify(heathrow));change(bad);
 const broken=createEngine(undefined,bad);assert.equal(broken.engine,undefined);
 assert.match(broken.element('message').textContent,/Map unavailable: Invalid airport configuration/);
}
const legacy=createEngine();assert.equal(legacy.engine.runways.length,4);
assert.equal(legacy.context.window.ATCGame.airport,'egll');
console.log('PASS M01/M02: airport configuration, selected fixes/runways/traffic, restart, cross-map saves and useful invalid-map errors.');
