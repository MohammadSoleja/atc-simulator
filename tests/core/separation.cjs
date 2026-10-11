const assert=require('node:assert/strict');
const {scenario}=require('./fixtures.cjs');
function plainPair(horizontal,vertical){
 const s=scenario(),a=s.arrival('27L',10,0,0,5000);s.engine.spawnArrival();
 const b=s.engine.getState().aircraft.at(-1);
 Object.assign(b,{x:a.x+horizontal/100,y:a.y,altitude:a.altitude+vertical});
 return {...s,a,b};
}
for(const [horizontal,vertical,conflict] of [[2.99,999,true],[3,999,false],[2.99,1000,false],[4,0,false],[0,2000,false]]){
 const s=plainPair(horizontal,vertical);s.engine.checkSeparation();
 assert.equal(s.engine.getState().violations,conflict?1:0,`${horizontal} NM / ${vertical} ft`);
 assert.equal(s.element('alertBanner').classList.contains('hidden'),!conflict);
}
{
 const s=plainPair(2,0),state=s.engine.getState();s.engine.checkSeparation();
 assert.equal(state.score,-10);s.engine.checkSeparation();assert.equal(state.score,-10);
 s.b.altitude+=1000;s.engine.checkSeparation();assert.equal(state.conflicts.size,0);
 assert.equal(s.element('alertBanner').classList.contains('hidden'),true);
 s.b.altitude=s.a.altitude;s.engine.checkSeparation();assert.equal(state.violations,2);assert.equal(state.score,-20);
 // A target already handed off/removed must not create a final-frame penalty.
 s.b.removeAt=state.elapsed;s.engine.checkSeparation();assert.equal(state.conflicts.size,0);
}
function runwayPair(arrivalId,departureId){
 const s=scenario(),a=s.arrival(arrivalId,1,0,0,600),b=s.departure();
 const rw=s.engine.runways.find(r=>r.id===departureId);
 s.command(a,`L ${arrivalId}`);a.approachCaptured=true;
 s.command(b,`C 5 R ${departureId} T`);s.position(b,rw,-.5);
 return {...s,a,b,rw};
}
for(const [arrivalId,departureId] of [['27R','27L'],['27L','27R'],['09L','09R'],['09R','09L']]){
 for(const altitude of [0,500,1000]){
  const s=runwayPair(arrivalId,departureId);s.b.altitude=altitude;s.b.phase=altitude?'airborne':'takeoff';
  s.engine.checkSeparation();assert.equal(s.engine.getState().violations,0);
  s.engine.getState().aircraft.reverse();s.engine.checkSeparation();assert.equal(s.engine.getState().violations,0,'pair order independent');
 }
 for(const reason of ['same runway','go-around','turn','crossing','high departure','high arrival','not captured','heading boundary']){
  const s=runwayPair(arrivalId,departureId);
  if(reason==='same runway'){s.b.runway=arrivalId;s.position(s.b,s.engine.runways.find(r=>r.id===arrivalId),-.5);}
  if(reason==='go-around')s.command(s.a,'G');
  if(reason==='turn')s.b.heading=(s.rw.heading+15)%360;
  if(reason==='crossing')s.position(s.b,s.rw,-.5,.11);
  if(reason==='high departure')s.b.altitude=1001;
  if(reason==='high arrival')s.a.altitude=1001,s.b.altitude=500;
  if(reason==='not captured')s.a.approachCaptured=false;
  if(reason==='heading boundary')s.b.heading=(s.rw.heading+10)%360;
  s.engine.checkSeparation();assert.equal(s.engine.getState().violations,1,reason);
 }
}
// Parallel finals never exempt a third aircraft crossing above their runways.
{
 const s=scenario(),a=s.arrival('27R',2,0,0,650);s.command(a,'L 27R');a.approachCaptured=true;
 s.engine.spawnArrival();const b=s.engine.getState().aircraft.at(-1),rw=s.engine.runways.find(r=>r.id==='27L');
 s.position(b,rw,2);Object.assign(b,{heading:270,altitude:650,clearedToLand:'27L',approachCaptured:true});
 s.engine.checkSeparation();assert.equal(s.engine.getState().violations,0);
 s.engine.spawnArrival();const crossing=s.engine.getState().aircraft.at(-1);
 Object.assign(crossing,{x:a.x,y:a.y,heading:180,altitude:800});
 s.engine.checkSeparation();assert.equal(s.engine.getState().violations,2);
}
console.log('G02 PASS: separation thresholds, continuous/new conflicts, alert clearing, removed targets, parallel operations in both directions and third-aircraft conflicts.');
