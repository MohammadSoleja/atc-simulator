const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/save-v1.json','utf8'));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(loadUrl=''){
 const nodes=new Map(),requests=[],notifications=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{handlers:{},value:'',disabled:false,open:false,dataset:{},
  addEventListener(type,fn){this.handlers[type]=fn;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},focus(){}});return nodes.get(id);};
 node('saveConfig').dataset={createUrl:'/saves/create/',loadUrl};
 let paused=false,fetchResult={ok:true,json:async()=>({name:'Test save',saved_at:'2026-10-12T12:00:00Z',snapshot:fixture})};
 const game={airportName:'Heathrow',isPaused:()=>paused,setPaused(value){paused=value;},exportSnapshot:()=>fixture,
  restoreSnapshot(value){assert.deepEqual(value,fixture);paused=true;},notify(...args){notifications.push(args);}};
 const context=vm.createContext({window:{ATCGame:game},document:{getElementById:node,querySelector:()=>({value:'csrf-token'})},
  AbortController,setTimeout:()=>1,clearTimeout(){},fetch:async(url,options)=>{requests.push({url,options});if(fetchResult instanceof Error)throw fetchResult;return fetchResult;}});
 vm.runInContext(fs.readFileSync('simulator/static/simulator/js/saves.js','utf8'),context);
 return {node,requests,notifications,game,saves:context.window.ATCSaves,setResult(value){fetchResult=value;}};
}
(async()=>{
 const app=setup();
 app.saves.tick(59,false);assert.equal(app.requests.length,0);
 app.saves.tick(100,true);assert.equal(app.requests.length,0,'paused time is excluded');
 app.saves.tick(1,false);await flush();assert.equal(app.requests.length,1);
 const auto=app.requests[0];assert.equal(auto.options.credentials,'same-origin');
 assert.equal(auto.options.headers['X-CSRFToken'],'csrf-token');
 assert.equal(JSON.parse(auto.options.body).autosave,true);
 assert.match(app.node('autosaveStatus').textContent,/Autosaved/);
 app.node('saveBtn').handlers.click();assert.equal(app.game.isPaused(),true);
 app.node('saveName').value='Manual';app.node('saveForm').handlers.submit({preventDefault(){}});
 await flush();assert.equal(JSON.parse(app.requests[1].options.body).autosave,false);
 assert.equal(app.game.isPaused(),false,'manual save restores previous pause');
 app.game.setPaused(true);app.node('saveBtn').handlers.click();app.node('closeSaveBtn').handlers.click();
 assert.equal(app.game.isPaused(),true,'cancel preserves a previously paused game');
 app.game.setPaused(false);app.setResult(new Error('Offline'));
 app.node('saveBtn').handlers.click();app.node('saveName').value='Fail';app.node('saveForm').handlers.submit({preventDefault(){}});
 await flush();assert.equal(app.node('saveDialog').open,true);assert.match(app.node('saveFeedback').textContent,/Offline.*unchanged/);
 app.node('closeSaveBtn').handlers.click();assert.equal(app.game.isPaused(),false);
 app.saves.tick(60,false);await flush();assert.match(app.node('autosaveStatus').textContent,/Autosave failed/);
 const count=app.requests.length;app.saves.tick(59,false);assert.equal(app.requests.length,count,'no failure retry storm');
 app.saves.tick(1,false);await flush();assert.equal(app.requests.length,count+1);
 const loaded=setup('/saves/1/snapshot/');assert.equal(loaded.game.isPaused(),true);
 loaded.saves.tick(60,false);assert.equal(loaded.requests.length,1,'no autosave while loading');
 await flush();assert.equal(loaded.game.isPaused(),true);assert.equal(loaded.node('pauseBtn').disabled,false);
 const bad=setup('/saves/1/snapshot/');bad.setResult({ok:false,json:async()=>({error:'Unsupported save'})});
 // The existing request gets its JSON result asynchronously; the response itself
 // is already captured, so reject restore explicitly to model corrupt load.
 bad.game.restoreSnapshot=()=>{throw Error('Unsupported save');};
 await flush();assert.match(bad.notifications.at(-1)[0],/Load failed/);
 assert.equal(bad.node('pauseBtn').disabled,true);bad.saves.tick(60,false);assert.equal(bad.requests.length,1);
 bad.saves.newGame();assert.equal(bad.node('pauseBtn').disabled,false,'restart recovers failed load');
 console.log('PASS: 60 active-second autosave, CSRF, manual/cancel pause restoration, network failures, loading guard and failed-load restart.');
})().catch(error=>{console.error(error);process.exitCode=1;});
