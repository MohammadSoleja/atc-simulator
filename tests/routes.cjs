const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createEngine}=require('./harness.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
for(const [airport,ids] of [['egll',['BPK','BNN','HEN']],['oerk',['RK538','RK507','ORLUD']]]){
 const definition=JSON.parse(fs.readFileSync(`simulator/airports/${airport}.json`,'utf8'));
 const {engine,element,context}=createEngine(undefined,definition),a=engine.getState().aircraft[0];
 vm.runInContext(fs.readFileSync('simulator/static/simulator/js/voice.js','utf8'),context);
 const translated=context.window.ATCVoice.translate(`${a.callsign} direct ${ids[0]} direct ${ids[1]}`,{callsigns:[a.callsign],fixes:engine.fixes.map(f=>f.id),runways:engine.runways.map(r=>r.id)});
 assert.equal(translated,`${a.callsign} C ${ids[0]} C ${ids[1]}`,'voice retains queued clauses');
 const command=text=>engine.parseCommand(`${a.callsign} ${text}`);
 command(`C ${ids[0]} C ${ids[1]}`);
 assert.equal(a.nav.id,ids[0]);assert.deepEqual(clone(a.route),[ids[1]]);
 assert.match(element('message').textContent,new RegExp(`head direct to ${ids[0]}, then ${ids[1]}`));
 engine.renderStrips();assert.ok(element('strips').children[0].children.some(c=>(c.textContent||'').includes(`${ids[0]} → ${ids[1]}`)));
 const before=clone(context.window.ATCGame.exportSnapshot());context.window.ATCGame.restoreSnapshot(before);
 assert.deepEqual(clone(context.window.ATCGame.exportSnapshot()),before,'queued route save round trip');
 const restored=engine.getState().aircraft[0];
 engine.parseCommand(`${restored.callsign} C ${ids[2]}`);
 assert.equal(restored.nav.id,ids[2]);assert.deepEqual(clone(restored.route),[],'new clearance replaces all queued waypoints');
 // Rebuild the route and complete actual movement through both waypoints.
 context.window.ATCGame.setPaused(false);
 engine.parseCommand(`${restored.callsign} C ${ids[0]} C ${ids[1]}`);
 const first=engine.fixes.find(f=>f.id===ids[0]);
 Object.assign(restored,{x:first.x-.05,y:first.y,heading:90,targetHeading:90,speed:220,targetSpeed:220,altitude:7000,targetAltitude:7000});
 const visits=[];context.window.ATCReadbacks={respond(){},clear(){},event:e=>{if(e.kind==='fix')visits.push(e.fix);}};
 for(let t=0;t<20000&&restored.nav;t++)engine.update(.1,0);
 assert.equal(restored.nav,null,'route completes by movement');assert.deepEqual(visits,ids.slice(0,2));
 assert.deepEqual(clone(restored.route),[]);
 for(const clearance of ['H 270','C 270','G']){
  engine.parseCommand(`${restored.callsign} C ${ids[0]} C ${ids[1]}`);
  engine.parseCommand(`${restored.callsign} ${clearance}`);
  assert.equal(restored.nav,null);assert.deepEqual(clone(restored.route),[]);
 }
 engine.parseCommand(`${restored.callsign} C ${ids[0]} C ${ids[1]}`);
 engine.parseCommand(`${restored.callsign} S 200 A 7000`);
 assert.equal(restored.nav.id,ids[0]);assert.deepEqual(clone(restored.route),[ids[1]],'speed/altitude preserve route');
 engine.parseCommand(`${restored.callsign} C ${ids[2]} C MISSING`);
 assert.equal(restored.nav.id,ids[0]);assert.deepEqual(clone(restored.route),[ids[1]],'invalid route group leaves old route intact');
 const invalid=clone(context.window.ATCGame.exportSnapshot());invalid.state.aircraft[0].route=['MISSING'];
 assert.throws(()=>context.window.ATCGame.restoreSnapshot(invalid));
}
console.log('PASS: queued waypoint navigation on both maps, real ordered passage, replacement, readback/strips, vectors/go-around, altitude/speed preservation, save/restore and invalid-route rejection.');
