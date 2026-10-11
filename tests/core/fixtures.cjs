const assert=require('node:assert/strict');
const {createEngine}=require('../harness.cjs');

function scenario(){
  const harness=createEngine();
  const {engine}=harness;
  // Isolate the scenario from new traffic without altering production logic.
  engine.getState().lastSpawn=Infinity;
  function position(aircraft,runway,ahead,cross=0){
    const radians=runway.heading*Math.PI/180;
    aircraft.x=runway.x1-(Math.sin(radians)*ahead+Math.cos(radians)*cross)/100;
    aircraft.y=runway.y1+(Math.cos(radians)*ahead-Math.sin(radians)*cross)/70;
  }
  function arrival(id='27L',ahead=10,cross=0,offset=0,altitude=3000){
    const aircraft=engine.getState().aircraft[0];
    const runway=engine.runways.find(r=>r.id===id);
    position(aircraft,runway,ahead,cross);
    Object.assign(aircraft,{heading:(runway.heading+offset+360)%360,targetHeading:(runway.heading+offset+360)%360,
      speed:180,targetSpeed:180,altitude,targetAltitude:altitude,bank:0});
    return aircraft;
  }
  function departure(){engine.spawnDeparture();return engine.getState().aircraft.at(-1);}
  function command(aircraft,text){engine.parseCommand(`${aircraft.callsign} ${text}`);}
  function advance(seconds){for(let remaining=seconds;remaining>1e-8;remaining-=.05)engine.update(Math.min(.05,remaining),0);}
  function until(predicate,seconds=800){
    for(let i=0;i<seconds/.05&&!predicate();i++)engine.update(.05,0);
    assert.ok(predicate(),'scenario must reach its expected state before timeout');
  }
  return {...harness,position,arrival,departure,command,advance,until};
}
module.exports={scenario};
