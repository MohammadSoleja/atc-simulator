const assert=require('node:assert/strict');
const {scenario}=require('./fixtures.cjs');

// Same scenarios on both physical strips and both approach directions.
for(const id of ['09L','09R','27L','27R']){
  for(const cross of [0,-1,1]){
    const s=scenario(),a=s.arrival(id,10,cross,cross===0?0:Math.sign(cross)*30);
    s.command(a,`L ${id}`);s.until(()=>a.landed);
    const state=s.engine.getState();
    assert.equal(a.phase,'landed',`${id}: aligned/angled touchdown`);
    assert.equal(state.landings,1);assert.equal(state.score,100);
    s.command(a,'G');assert.equal(a.phase,'landed');assert.match(s.element('message').textContent,/airborne arrival/);
    s.advance(3);assert.equal(state.landings,1);assert.equal(state.score,100);
    s.engine.cleanup();assert.ok(!state.aircraft.includes(a),'landed target removed after delay');
  }
  for(const offset of [-60,60]){
    const s=scenario(),a=s.arrival(id,10,0,offset);s.command(a,`L ${id}`);
    assert.equal(a.clearedToLand,id,'inclusive heading clearance boundary');
  }
  for(const [offset,altitude,reason] of [[61,3000,/within 60/],[-61,3000,/within 60/],[0,3001,/above 3,000/]]){
    const s=scenario(),a=s.arrival(id,10,0,offset,altitude);s.command(a,`L ${id}`);
    assert.equal(a.clearedToLand,null);assert.match(s.element('message').textContent,reason);
    assert.equal(s.element('message').className,'message error');
  }
  // Parallel path, late clearance after crossing, and past-threshold clearance.
  for(const [ahead,cross,offset] of [[10,1,0],[5,-.01,30],[-.1,0,0]]){
    const s=scenario(),a=s.arrival(id,ahead,cross,offset,2000);s.command(a,`L ${id}`);
    s.advance(60);assert.equal(a.approachCaptured,false);assert.equal(a.altitude,2000);
    assert.equal(s.engine.getState().landings,0);
  }
  // Captured but too high at the far end: pilot goes around, no landing score.
  const s=scenario(),a=s.arrival(id,0,0,0,1000),rw=s.engine.runways.find(r=>r.id===id);
  Object.assign(a,{clearedToLand:id,approachCaptured:true});
  const length=s.engine.distance({x:rw.x1,y:rw.y1},{x:rw.x2,y:rw.y2});
  s.position(a,rw,-length);s.advance(.05);
  assert.equal(a.approachCaptured,false);assert.equal(a.clearedToLand,null);
  assert.equal(a.targetAltitude,3000);assert.match(s.element('message').textContent,/going around/);
  assert.equal(s.engine.getState().score,0);
}
{
 const s=scenario(),a=s.arrival('27L',5,0,0,2000);s.command(a,'L INVALID');assert.match(s.element('message').textContent,/Unknown runway/);
 s.command(a,'L 27L');s.advance(.05);assert.equal(a.approachCaptured,true);
 s.command(a,'G');assert.equal(a.approachCaptured,false);assert.equal(a.clearedToLand,null);assert.equal(a.nav,null);assert.ok(a.targetSpeed>=190);
 s.advance(10);assert.ok(a.altitude>2000);assert.equal(a.targetAltitude,3000);assert.equal(s.engine.getState().landings,0);
}
console.log('G01 PASS: all runway directions, both interception sides, clearance boundaries/reasons, missed captures, automatic/manual go-arounds and single scoring.');
