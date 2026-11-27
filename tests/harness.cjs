const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the actual browser engine in isolation. Test hooks never ship to the UI.
function createEngine(sourcePath,definition) {
  definition=definition||JSON.parse(fs.readFileSync(path.join(__dirname,'../simulator/airports/egll.json'),'utf8'));
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        width:1100, height:760, value:'', scrollTop:0, children:[],
        classList:{add(name){classes.add(name);},remove(name){classes.delete(name);},contains(name){return classes.has(name);}},
        parentElement:{getBoundingClientRect:()=>({width:1100,height:760})},
        handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},
        showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},
        focus(){},appendChild(child){this.children.push(child);},getContext:()=>({})
      });
    }
    return elements.get(id);
  }
  element('airportDefinition').textContent=JSON.stringify(definition);
  const context = vm.createContext({
    document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>({children:[],appendChild(child){this.children.push(child);}})},
    ResizeObserver:class {observe(){}},window:{addEventListener(){},crypto:{randomUUID:()=>'12345678-1234-4234-8234-123456789012'}},
    performance:{now:()=>0},requestAnimationFrame(){}
  });
  context.window.ATC_MAP_DATA={urban:[],rivers:[]};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../simulator/static/simulator/js/airport.js'),'utf8'),context);
  // Reproducible aircraft types and callsigns, including the legacy suite.
  vm.runInContext('let testSeed=12345; Math.random=()=>((testSeed=(testSeed*1664525+1013904223)>>>0)/4294967296);',context);
  const startup='  reset();resize();renderStrips();requestAnimationFrame(frame);';
  let source=fs.readFileSync(sourcePath || path.join(__dirname,'../simulator/static/simulator/js/game.js'),'utf8');
  if(!source.includes(startup))throw Error('Engine startup changed; update test harness hooks.');
  source=source.replace(startup,'globalThis.engine={resize,getMapView:()=>mapView,reset,parseCommand,update,advanceSimulation,spawnArrival,spawnDeparture,cleanup,runways,fixes,distance,checkSeparation,trafficPattern,timeOfDaySeconds,setSimulationRate,getSimulationRate:()=>simulationRate,updateUI,renderStrips,runwayPosition,airport,profile,getState:()=>state}; reset();');
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../simulator/static/simulator/js/airlines.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../simulator/static/simulator/js/save-format.js'),'utf8'),context);
  vm.runInContext(source,context);
  return {engine:context.engine,element,context};
}
module.exports={createEngine};
