const assert=require('node:assert/strict');
const {scenario}=require('./fixtures.cjs');
function departureScenario(){
 const s=scenario(),a=s.departure();
 s.engine.getState().aircraft=[a];
 return {...s,a};
}
{
 const s=departureScenario(),a=s.a;
 s.command(a,'T');assert.match(s.element('message').textContent,/assign altitude/);assert.equal(a.phase,'holding');
 s.command(a,'C 5 T');assert.match(s.element('message').textContent,/assign a runway/);assert.equal(a.phase,'holding');
 s.command(a,'R INVALID');assert.match(s.element('message').textContent,/Unknown runway/);assert.equal(a.runway,null);
 s.command(a,'R 09R C 0 T');assert.match(s.element('message').textContent,/assign altitude/);assert.equal(a.phase,'holding');
 s.command(a,'G');assert.equal(a.phase,'holding','go-around cannot launch a waiting departure');
 assert.equal(s.element('message').className,'message error');
 s.command(a,'L 09R');assert.match(s.element('message').textContent,/not an airborne arrival/);
}
for(const id of ['09L','09R','27L','27R']){
 for(const type of ['A320','A321','B738','B789','A20N','B77W']){
  const s=departureScenario(),a=s.a,rw=s.engine.runways.find(r=>r.id===id);a.type=type;
  s.command(a,`C 5 R ${id} T`);
  assert.equal(a.phase,'takeoff');assert.equal(a.x,rw.x1);assert.equal(a.y,rw.y1);
  assert.equal(a.heading,rw.heading);assert.equal(a.targetAltitude,5000);
  assert.match(s.element('message').textContent,new RegExp(`cleared for takeoff runway ${id}`));
  s.advance(20);assert.equal(a.phase,'takeoff');assert.equal(a.altitude,0);
  assert.ok(a.speed>0&&a.speed<=s.engine.profile(a).min);
  assert.ok(Math.abs(s.engine.runwayPosition(a,rw).cross)<1e-8,'ground roll stays on its assigned runway');
  s.until(()=>a.phase==='airborne',100);assert.ok(a.altitude>=50);assert.ok(a.speed>s.engine.profile(a).min);
  assert.equal(s.engine.getState().handoffs,0,'liftoff is not a successful handoff');
  s.command(a,'T');assert.match(s.element('message').textContent,/unable takeoff/);assert.equal(a.phase,'airborne');
  const before={x:a.x,y:a.y,runway:a.runway};s.command(a,`R ${id==='27L'?'09R':'27L'}`);
  assert.match(s.element('message').textContent,/waiting departure/);
  assert.equal(a.x,before.x);assert.equal(a.y,before.y);assert.equal(a.runway,before.runway);
 }
 // Complete a real commanded departure through climb, navigation and handoff.
 const s=departureScenario(),a=s.a;a.exitFix='BPK';
 s.command(a,`C 5 R ${id} T`);s.until(()=>a.phase==='airborne',100);
 s.command(a,'C BPK');s.until(()=>a.removeAt!==undefined,1800);
 assert.equal(s.engine.getState().handoffs,1);assert.equal(s.engine.getState().score,80);
 const fix=s.engine.fixes.find(f=>f.id==='BPK');assert.ok(s.engine.distance(a,fix)<1.3);assert.ok(a.altitude>=4000);
 s.advance(2);assert.equal(s.engine.getState().handoffs,1);assert.equal(s.engine.getState().score,80);
 s.engine.cleanup();assert.equal(s.engine.getState().aircraft.length,0);
}
for(const [altitude,offset,expected] of [[3999,0,false],[4000,0,true],[4000,1.31,false]]){
 const s=departureScenario(),a=s.a,fix=s.engine.fixes.find(f=>f.id===a.exitFix);
 Object.assign(a,{phase:'airborne',altitude,targetAltitude:altitude,speed:0,targetSpeed:0,x:fix.x+offset/100,y:fix.y});
 s.engine.update(0,0);assert.equal(s.engine.getState().handoffs,expected?1:0,'handoff altitude/proximity boundary');
}
{
 const s=departureScenario(),a=s.a,wrong=s.engine.fixes.find(f=>f.id!=='LON'&&f.id!==a.exitFix&&s.engine.distance(f,s.engine.fixes.find(f=>f.id===a.exitFix))>3);
 Object.assign(a,{phase:'airborne',altitude:5000,targetAltitude:5000,x:wrong.x,y:wrong.y});
 s.engine.update(0,0);assert.equal(s.engine.getState().handoffs,0,'wrong fix is not success');
 a.x=1.09;s.engine.update(0,0);s.engine.cleanup();
 assert.equal(s.engine.getState().handoffs,0);assert.equal(s.engine.getState().score,0,'uncontrolled exit earns no reward');
}
console.log('G03 PASS: departure prerequisites, go-around misuse, all runway/type takeoffs, airborne runway protection, real routing/handoff, altitude/fix boundaries and single scoring.');
