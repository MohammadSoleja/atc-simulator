const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements={},listeners={},instances=[];
function element(id){return elements[id]??=( {value:'',textContent:'',open:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},setAttribute(name,value){this[name]=value;},focus(){},setPointerCapture(){}} );}
class Recognition {constructor(){instances.push(this);}start(){}stop(){this.stopped=true;}abort(){this.onend();}}
const context={window:{SpeechRecognition:Recognition,addEventListener(){}},document:{getElementById:element,addEventListener(type,fn){listeners[type]=fn;}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('simulator/static/simulator/js/airlines.js','utf8'),context);vm.runInContext(fs.readFileSync('simulator/static/simulator/js/voice.js','utf8'),context);
const vocabulary={callsigns:['SVA111','BAW123','AAL798','KLM713','VIR636','VIR153','UAE501','AIC786'],fixes:['WOD','CPT','NIGIT','HEN','DONNA','LAM'],runways:['27L','27R','09L','09R']};
context.window.getVoiceContext=()=>vocabulary;
const translate=text=>context.window.ATCVoice.translate(text,vocabulary);
for(const name of ['Lima Alpha Mic','Lima Alpha Mike','Lima Alpha Mick'])assert.equal(translate('Virgin 636 heading '+name),'VIR636 C LAM');
// Reported playtest transcripts and adjacent forms, grouped for new reports.
const transcriptCases=require('./voice-transcripts.json');
for(const {group,spoken,expected} of transcriptCases){
 assert.equal(translate(spoken),expected,`${group}: ${spoken}`);
}

for(const spoken of ['Saudia one one two speed two five zero','alpha alpha lima 799 heading 090','SVA111 direct XYZ','SVA111 direct niner indigo golf indigo zulu','SVA111 heading four zero zero','SVA111 speed banana'])assert.throws(()=>translate(spoken));
const input=element('commandInput'),status=element('voiceStatus');
input.value='BAW123';
listeners.keydown({code:'KeyQ',preventDefault(){}});const session=instances.at(-1);
listeners.keydown({code:'KeyQ',repeat:true,preventDefault(){}});assert.equal(instances.length,1,'held key starts only once');
session.onresult({results:[[{transcript:'SVA111 speed two five zero'}]]});assert.equal(input.value,'SVA111 speed two five zero','live transcript appears');
assert.equal(context.window.ATCVoice.getFeedback().heard,input.value);
let prevented=false;element('commandForm').handlers.submit({preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,true,'cannot submit while listening');
listeners.keyup({code:'KeyQ'});assert.equal(session.stopped,true);session.onend();assert.equal(input.value,'SVA111 S 250','release produces draft');
assert.equal(context.window.ATCVoice.getFeedback().draft,'SVA111 S 250');
assert.equal(context.window.ATCVoice.getFeedback().heard,'SVA111 speed two five zero','full transcript retained after translation');
prevented=false;element('commandForm').handlers.submit({preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,false,'Enter can submit draft');
listeners.keydown({code:'KeyQ',preventDefault(){}});const bad=instances.at(-1);bad.onresult({results:[[{transcript:'SVA111 direct XYZ'}]]});bad.onend();
assert.equal(element('voiceDetails').open,false,'errors never expand the console');
assert.match(context.window.ATCVoice.getFeedback().error,/Direct-to fix.*Unknown fix/);
assert.equal(context.window.ATCVoice.getFeedback().draft,'','no partial command offered after error');
prevented=false;element('commandForm').handlers.submit({preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,true,'unrecognised speech blocked');
input.value='SVA111 C WOD';input.handlers.input();prevented=false;element('commandForm').handlers.submit({preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,false,'manual correction enables submission');
assert.equal(context.window.ATCVoice.getFeedback().draft,input.value,'manual edit reflected in details');
listeners.keydown({code:'KeyQ',preventDefault(){}});const errorSession=instances.at(-1);errorSession.onerror({error:'not-allowed'});errorSession.onend();assert.equal(input.value,'SVA111 C WOD','permission error preserves previous draft');assert.match(status.textContent,/not-allowed/);
const unsupported={window:{},document:{getElementById:element}};vm.createContext(unsupported);vm.runInContext(fs.readFileSync('simulator/static/simulator/js/airlines.js','utf8'),unsupported);vm.runInContext(fs.readFileSync('simulator/static/simulator/js/voice.js','utf8'),unsupported);assert.equal(element('voiceBtn').disabled,true);
console.log('PASS: spoken numbers, phonetic/airline callsigns, all commands, live drafts, key repeat, submission gating, manual correction, microphone errors and unsupported browsers.');

// Every entry shown in Info must actually be usable by the voice translator.
const catalogue=context.window.ATC_AIRLINES;
assert.equal(new Set(catalogue.map(a=>a.code)).size,catalogue.length);
for(const airline of catalogue){
 const vocabulary={callsigns:[airline.code+'123'],fixes:['WOD'],runways:['09R']};
 for(const alias of [...airline.aliases,airline.code,airline.letters,airline.phonetic]){
  assert.equal(context.window.ATCVoice.translate(`${alias} one two three heading Whiskey Oscar Delta`,vocabulary),`${airline.code}123 C WOD`,alias);
 }
}
assert.equal(translate('American Airlines seven nine eight speed two five zero'),'AAL798 S 250');
const resolver=context.window.ATCVoice.resolveAlternatives;
assert.equal(resolver(['garbled text','VIR153 heading 090'],vocabulary).command,'VIR153 C 090');
assert.throws(()=>resolver(['garbled text','VIR153 heading 090','VIR153 heading 180'],vocabulary),/multiple possible/);
assert.equal(resolver(['VIR153 heading 090','VIR153 heading 180'],vocabulary).command,'VIR153 C 090','valid best transcript wins');
// Ensure actual recognition events use the alternative when only it is valid.
element('voiceBtn').disabled=false;listeners.keydown({code:'KeyQ',preventDefault(){}});
const alternativeSession=instances.at(-1);assert.equal(alternativeSession.maxAlternatives,5);
alternativeSession.onresult({results:[[{transcript:'garbled text'},{transcript:'American Airlines seven nine eight speed two five zero'}]]});
alternativeSession.onend();assert.equal(input.value,'AAL798 S 250');assert.match(status.textContent,/matched alternative/);
assert.equal(context.window.ATCVoice.getFeedback().heard,'garbled text');
assert.equal(context.window.ATCVoice.getFeedback().alternative,'American Airlines seven nine eight speed two five zero');
assert.equal(context.window.ATCVoice.getFeedback().draft,'AAL798 S 250');

for(const [group,spoken,error] of [
 ['callsign','American Airlines seven nine nine speed two five zero',/Callsign.*No active aircraft/],
 ['altitude','SVA111 descend and maintain banana',/Altitude.*banana.*Unrecognised number/],
 ['altitude','SVA111 flight level zero',/Altitude.*above zero/],
 ['numbers','SVA111 speed banana',/Speed.*banana/],
 ['heading','SVA111 heading four zero zero',/Heading.*001–360/],
 ['fix','SVA111 heading Charlie Papa Zulu',/Heading.*Unknown fix/],
 ['runway','SVA111 runway zero nine',/Runway.*left or right/],
 ['runway','SVA111 runway two eight left',/Runway.*Unknown runway/],
 ['clearance','SVA111 cleared for banana',/Instruction.*clearance/],
 ['clearance','SVA111 go nowhere',/Go-around.*go around/],
])assert.throws(()=>translate(spoken),error,group);

// A valid prefix must never escape as a draft when a later clause fails.
listeners.keydown({code:'KeyQ',preventDefault(){}});
let failure=instances.at(-1);
failure.onresult({results:[[{transcript:'SVA111 maintain three thousand speed banana'}]]});failure.onend();
assert.match(context.window.ATCVoice.getFeedback().error,/Speed.*banana/);
assert.equal(context.window.ATCVoice.getFeedback().draft,'');
prevented=false;element('commandForm').handlers.submit({preventDefault(){prevented=true;},stopImmediatePropagation(){}});
assert.equal(prevented,true);

// Multiple valid alternatives stay blocked, rather than picking an aircraft
// instruction arbitrarily. Duplicate translations are not ambiguous.
assert.equal(resolver(['garbled','SVA111 heading 090','SVA111 heading zero nine zero'],vocabulary).command,'SVA111 C 090');
listeners.keydown({code:'KeyQ',preventDefault(){}});failure=instances.at(-1);
failure.onresult({results:[[{transcript:'garbled'},{transcript:'SVA111 heading 090'},{transcript:'SVA111 heading 180'}]]});failure.onend();
assert.match(context.window.ATCVoice.getFeedback().error,/multiple possible/);
prevented=false;element('commandForm').handlers.submit({preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,true);
listeners.keydown({code:'KeyQ',preventDefault(){}});
assert.equal(element('voiceDetails').open,false,'new recording starts compact');
assert.equal(context.window.ATCVoice.getFeedback().error,'','new recording clears previous error');
listeners.keydown({key:'Escape',preventDefault(){}});
assert.match(status.textContent,/cancelled/);
assert.equal(context.window.ATCVoice.getFeedback().draft,input.value,'cancel restores previous text');
console.log(`V01/V02 PASS: ${transcriptCases.length} grouped transcripts, clause-specific rejections, separate transcript/draft/alternative/error evidence and ambiguous/partial submission guards.`);
const finnairContext={...vocabulary,callsigns:['FIN123']};
for(const name of ['Finnair','Fin Air','Finn Air','Thin Air']){
 assert.equal(context.window.ATCVoice.translate(`${name} one two three heading zero nine zero`,finnairContext),'FIN123 C 090');
}
assert.throws(()=>context.window.ATCVoice.translate('Thin Air one two four heading zero nine zero',finnairContext),/No active aircraft/);
assert.throws(()=>translate('SVA111 direct thin air'),/Unknown fix/,'alias only applies to callsigns');
const attempts=context.window.ATCVoice.getDiagnostics();
assert.ok(attempts.some(a=>a.outcome==='translation-error'&&/Speed/.test(a.error)));
assert.ok(attempts.some(a=>a.command==='AAL798 S 250'&&a.matchedAlternative));
assert.ok(attempts.some(a=>a.outcome==='recognition-error'));
attempts.length=0;assert.ok(context.window.ATCVoice.getDiagnostics().length,'diagnostics returns a copy');
for(let n=0;n<105;n++){
 listeners.keydown({code:'KeyQ',preventDefault(){}});const r=instances.at(-1);
 r.onresult({results:[[{transcript:'SVA111 heading 090'}]]});r.onend();
}
assert.equal(context.window.ATCVoice.getDiagnostics().length,100,'bounded diagnostic buffer');
const pilotReplies=[],listeningStates=[];
context.window.ATCReadbacks={respond(result){pilotReplies.push(result);},setListening(value){listeningStates.push(value);}};
for(const [spoken,expectedReply] of [['SVA111 speed banana','SVA111'],['SVA1119 speed banana',null]]){
 listeners.keydown({code:'KeyQ',preventDefault(){}});const r=instances.at(-1);
 const before=pilotReplies.length;
 r.onresult({results:[[{transcript:spoken}]]});r.onend();
 assert.equal(pilotReplies.length,before,'drafting never produces a pilot reply');
 element('commandForm').handlers.submit({preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(pilotReplies.length,before+(expectedReply?1:0));
 if(expectedReply)assert.equal(pilotReplies.at(-1).callsign,expectedReply);
}
assert.deepEqual(listeningStates,[true,false,true,false]);
console.log(`PASS: all aliases/code/letters/phonetics for ${catalogue.length} airlines, full American Airlines, unique alternatives and ambiguity blocking.`);
// Conversation must preserve the command and never hide invalid instructions.
for(const spoken of [
 'Good morning SVA111 descend and maintain three thousand speed two five zero thank you',
 'SVA111 marhaba descend and maintain three thousand speed two five zero goodbye',
])assert.equal(translate(spoken),'SVA111 C 3 S 250');
for(const spoken of ['hello','good evening SVA111','SVA111 thank you goodbye'])assert.equal(translate(spoken),'');
assert.throws(()=>translate('hello SVA111 speed banana goodbye'),/Speed.*banana/);
assert.throws(()=>translate('good morning SVA1119 hello'),/Callsign/);
listeners.keydown({code:'KeyQ',preventDefault(){}});
const greetingRecognition=instances.at(-1),replyCount=pilotReplies.length;
greetingRecognition.onresult({results:[[{transcript:'SVA111 good morning'}]]});greetingRecognition.onend();
assert.match(status.textContent,/Greeting recognised/);
prevented=false;element('commandForm').handlers.submit({preventDefault(){prevented=true;},stopImmediatePropagation(){}});
assert.equal(prevented,true,'greetings never reach the simulation command parser');
assert.equal(input.value,'');assert.equal(pilotReplies.length,replyCount,'no say-again for a greeting');
assert.match(status.textContent,/No aircraft instructions changed/);
console.log('PASS: greeting boundaries, combined instructions, unknown callsigns and greeting-only submission.');
