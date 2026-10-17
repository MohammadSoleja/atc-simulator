const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createEngine}=require('./harness.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const {engine,context}=createEngine();
const game=context.window.ATCGame;
engine.spawnDeparture();
const aircraft=engine.getState().aircraft;
engine.parseCommand(`${aircraft[0].callsign} C 3 C HEN S 180`);
engine.parseCommand(`${aircraft[1].callsign} C 5 R 27L T`);
for(let i=0;i<100&&!engine.getState().upcoming.length;i++)engine.advanceSimulation(1);
const before=clone(game.exportSnapshot());
assert.equal(before.version,1);assert.equal(before.airport,'egll');
assert.ok(before.state.upcoming.length,'pending traffic included');
assert.equal(before.state.aircraft[0].nav,'HEN');
assert.ok(!('selected' in before.state));assert.ok(!('paused' in before.state));
assert.ok(!('theme' in before));
engine.reset();game.restoreSnapshot(before);
assert.deepEqual(clone(game.exportSnapshot()),before,'exact simulation snapshot round trip');
assert.equal(engine.getState().paused,true);
const restored=engine.getState().aircraft[0];
assert.equal(restored.nav,engine.fixes.find(f=>f.id==='HEN'),'fix references reconstructed');
engine.advanceSimulation(10);assert.deepEqual(clone(game.exportSnapshot()),before,'restored game stays paused');
for(const mutate of [s=>s.version=99,s=>s.airport='unknown',s=>s.state.aircraft[0].nav='UNKNOWN',
 s=>s.state.aircraft[0].x=NaN,s=>s.state.aircraft[0].trail[0].t=Infinity,s=>s.state.conflicts=['1-999'],
 s=>s.state.aircraft[1].id=s.state.aircraft[0].id]){
 const invalid=clone(before);mutate(invalid);
 assert.throws(()=>game.restoreSnapshot(invalid));
 assert.deepEqual(clone(game.exportSnapshot()),before,'invalid restore is atomic');
}
// Established conflicts retain their episode marker and are not penalised again.
engine.reset();engine.spawnArrival();
const [a,b]=engine.getState().aircraft;
Object.assign(a,{x:.2,y:.2,altitude:5000,targetAltitude:5000});
Object.assign(b,{x:.21,y:.2,altitude:5000,targetAltitude:5000});
engine.checkSeparation();const conflict=clone(game.exportSnapshot());
assert.equal(conflict.state.score,-10);
game.restoreSnapshot(conflict);engine.checkSeparation();
assert.equal(engine.getState().violations,conflict.state.violations);
assert.equal(engine.getState().score,-10);
// Landing capture and removal timers survive, rather than re-awarding a landing.
engine.reset();const arrival=engine.getState().aircraft[0],rw=engine.runways.find(r=>r.id==='27L');
Object.assign(arrival,{x:rw.x1,y:rw.y1,heading:270,targetHeading:270,altitude:50,targetAltitude:0,
 clearedToLand:'27L',approachCaptured:true});
engine.update(0,0);const landed=clone(game.exportSnapshot());
assert.equal(landed.state.landings,1);assert.equal(landed.state.aircraft[0].phase,'landed');
game.restoreSnapshot(landed);game.setPaused(false);engine.advanceSimulation(3);
assert.equal(engine.getState().landings,1);assert.equal(engine.getState().aircraft.some(a=>a.id===arrival.id),false);
// Export one real-engine fixture for server compatibility tests.
assert.deepEqual(before,JSON.parse(fs.readFileSync('tests/fixtures/save-v1.json','utf8')),'browser snapshot matches the server compatibility fixture');
console.log('PASS: snapshot round trip, pending flights, navigation/runways, paused load, atomic rejection, conflict and landing deduplication.');

// A staggered wave retains identities and due times across save/restore.
{
 const {engine,context}=createEngine();
 const state=engine.getState();state.trafficElapsed=750;state.lastSpawn=750;
 for(let i=0;i<180&&state.upcoming.length<3;i++)engine.update(0,2);
 assert.ok(state.upcoming.length>=3,'wave queued');
 const snapshot=clone(context.window.ATCGame.exportSnapshot());
 context.window.ATCGame.restoreSnapshot(snapshot);
 assert.deepEqual(clone(context.window.ATCGame.exportSnapshot()),snapshot,'wave save round trip');
}
