const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements={},listeners={},instances=[];
function element(id){return elements[id]??=( {value:'',textContent:'',open:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},setAttribute(name,value){this[name]=value;},focus(){},setPointerCapture(){}} );}
class Recognition {constructor(){instances.push(this);}start(){}stop(){this.stopped=true;}abort(){this.onend();}}
const context={window:{SpeechRecognition:Recognition,addEventListener(){}},document:{getElementById:element,addEventListener(type,fn){listeners[type]=fn;}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('simulator/static/simulator/js/voice.js','utf8'),context);
const vocabulary={callsigns:['SVA111','BAW123','AAL798','KLM713','VIR636','VIR153'],fixes:['WOD','CPT','NIGIT'],runways:['27L','27R','09L','09R']};
context.window.getVoiceContext=()=>vocabulary;
const translate=text=>context.window.ATCVoice.translate(text,vocabulary);
for(const [spoken,expected] of [
 ['VIR153 descendant maintain flight level 3,000 speed 250 heading 090','VIR153 C 3 S 250 C 090'],
 ['VIR153 descendant and maintain three thousand','VIR153 C 3'],
 ['VIR153 cleared for landing runway zero nine ride','VIR153 L 09R'],
 ['VIR153 09 ride cleared for landing','VIR153 L 09R'],
 ['KLM713 cleared five thousand runway nine ride cleared for takeoff','KLM713 C 5 R 09R T'],
 ['VIR153 turn ride heading zero nine zero','VIR153 C 090'],
 ['Victor India Romeo 1 5 3 descend and maintain flight Level 3,000 Speed 2 5 0 heading Charlie Pappa tango','VIR153 C 3 S 250 C CPT'],
 ['Victor India Romeo 636 09 left cleared for landing','VIR636 L 09L'],
 ['Victor India Romeo six three six zero nine left cleared for landing','VIR636 L 09L'],
 ['VIR636 runway 09 left cleared to land','VIR636 L 09L'],
 ['Virgin six three six two seven right cleared for landing','VIR636 L 27R'],
 ['VIR636 09 left cleared for landing speed one eight zero','VIR636 L 09L S 180'],
 ['KLM 713 cleared five thousand runway 9 right cleared for takeoff','KLM713 C 5 R 09R T'],
 ['Kilo Lima Mike seven one three cleared to 5,000 runway zero nine right cleared for take off','KLM713 C 5 R 09R T'],
 ['KLM713 cleared five thousand','KLM713 C 5'],
 ['aal798  descend  and maintain  flight Level  3, 000 speed  250 heading  niner indigo golf indigo tango','AAL798 C 3 S 250 C NIGIT'],
 ['alpha alpha lima 798 descend and maintain flight level 3,000 speed 250 heading niner indigo golf indigo tango','AAL798 C 3 S 250 C NIGIT'],
 ['alpha alpha lima798 descend and maintain three thousand direct November India Golf India Tango','AAL798 C 3 C NIGIT'],
 ['American seven niner eight heading zero niner zero','AAL798 C 090'],
 ['AAL798 heading nine indigo golf indigo tango','AAL798 C NIGIT'],
 ['AAL798 speed two niner zero','AAL798 S 290'],
 ['Sierra Victor Alpha one one one descend and maintain three thousand speed two five zero heading Whiskey Oscar Delta','SVA111 C 3 S 250 C WOD'],
 ['Saudia one eleven reduce speed to two five zero heading zero nine zero','SVA111 S 250 C 090'],
 ['SVA111 increase speed two five zero direct W O D','SVA111 S 250 C WOD'],
 ['Speedbird one two three climb and maintain flight level three zero','BAW123 C 3'],
 ['British Airways one two three maintain flight level 3000 speed two fifty','BAW123 C 3 S 250'],
 ['B A W one two three runway zero nine right cleared for takeoff','BAW123 R 09R T'],
 ['SVA111 cleared to land runway two seven left','SVA111 L 27L'],
 ['SVA111 go around','SVA111 G'],
 ['SVA111 turn left heading three six zero','SVA111 C 360'],
 ['SVA111 altitude five hundred','SVA111 A 500'],
 ])assert.equal(translate(spoken),expected,spoken);
for(const spoken of ['Saudia one one two speed two five zero','alpha alpha lima 799 heading 090','SVA111 direct XYZ','SVA111 direct niner indigo golf indigo zulu','SVA111 heading four zero zero','SVA111 speed banana'])assert.throws(()=>translate(spoken));
const input=element('commandInput'),status=element('voiceStatus');
input.value='BAW123';
listeners.keydown({code:'KeyQ',preventDefault(){}});const session=instances.at(-1);
listeners.keydown({code:'KeyQ',repeat:true,preventDefault(){}});assert.equal(instances.length,1,'held key starts only once');
session.onresult({results:[[{transcript:'SVA111 speed two five zero'}]]});assert.equal(input.value,'SVA111 speed two five zero','live transcript appears');
let prevented=false;element('commandForm').handlers.submit({preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,true,'cannot submit while listening');
listeners.keyup({code:'KeyQ'});assert.equal(session.stopped,true);session.onend();assert.equal(input.value,'SVA111 S 250','release produces draft');
prevented=false;element('commandForm').handlers.submit({preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,false,'Enter can submit draft');
listeners.keydown({code:'KeyQ',preventDefault(){}});const bad=instances.at(-1);bad.onresult({results:[[{transcript:'SVA111 direct XYZ'}]]});bad.onend();
prevented=false;element('commandForm').handlers.submit({preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,true,'unrecognised speech blocked');
input.value='SVA111 C WOD';input.handlers.input();prevented=false;element('commandForm').handlers.submit({preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,false,'manual correction enables submission');
listeners.keydown({code:'KeyQ',preventDefault(){}});const errorSession=instances.at(-1);errorSession.onerror({error:'not-allowed'});errorSession.onend();assert.equal(input.value,'SVA111 C WOD','permission error preserves previous draft');assert.match(status.textContent,/not-allowed/);
const unsupported={window:{},document:{getElementById:element}};vm.createContext(unsupported);vm.runInContext(fs.readFileSync('simulator/static/simulator/js/voice.js','utf8'),unsupported);assert.equal(element('voiceBtn').disabled,true);
console.log('PASS: spoken numbers, phonetic/airline callsigns, all commands, live drafts, key repeat, submission gating, manual correction, microphone errors and unsupported browsers.');
