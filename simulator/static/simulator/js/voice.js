/* Speech is an editable input method. It never issues aircraft commands itself. */
(() => {
  const digits={zero:'0',oh:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',niner:'9'};
  const phonetics='alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu'.split(' ');
  const letters=Object.fromEntries(phonetics.map((word,i)=>[word,String.fromCharCode(65+i)]));
  Object.assign(letters,{alfa:'A',juliett:'J',whisky:'W',pappa:'P'});
  const airlineAliases=window.ATC_AIRLINES.flatMap(a=>a.aliases.map(alias=>[alias,a.code]))
    .sort((a,b)=>b[0].length-a[0].length);
  function tokens(text){
    text=text.toLowerCase().replace(/x-ray/g,'xray')
      // Recognition sometimes joins a phonetic letter to the flight number.
      .replace(/([a-z])(\d)/g,'$1 $2').replace(/[^a-z0-9\s]/g,' ');
    // Repair observed speech-to-text substitutions only in instruction
    // contexts, before identifying commands or the runway-first pattern.
    text=text.replace(/\bmaintained\b/g,'maintain')
      .replace(/\bdescent\b/g,'descend')
      .replace(/\bdescendant\s+(?:and\s+)?maintain\b/g,'descend and maintain')
      .replace(/\bflight\s+levels\b/g,'flight level')
      .replace(/\b(?:ride|write|rite)\b(?=\s+(?:cleared|clear|heading)\b|\s*$)/g,'right')
      .replace(/\b(\d+|zero|oh|one|two|three|four|five|six|seven|eight|nine|niner)\s+(?:ride|write|rite)\b/g,'$1 right');
    return text.trim().split(/\s+/).filter(Boolean);
  }
  function number(words){
    const filtered=words.filter(w=>!['to','at','and','knots','knot','feet','foot','degrees','degree'].includes(w));
    if(!filtered.length)throw Error('Missing number.');
    if(filtered.every(w=>/^\d+$/.test(w)||w in digits))return Number(filtered.map(w=>digits[w]??w).join(''));
    const values={ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
    // Accept conversational "two fifty" as well as digit-by-digit numbers.
    if(filtered.length===2 && filtered[0] in digits && filtered[1] in values && values[filtered[1]]>=20)return Number(digits[filtered[0]])*100+values[filtered[1]];
    let total=0,group=0;
    for(const w of filtered){
      if(w in digits)group+=Number(digits[w]);
      else if(w in values)group+=values[w];
      else if(/^\d+$/.test(w))group+=Number(w);
      else if(w==='hundred')group*=100;
      else if(w==='thousand'){total+=group*1000;group=0;}
      else throw Error(`Unrecognised number: ${w}.`);
    }
    return total+group;
  }
  function identifier(words){return words.map(w=>letters[w]??digits[w]??w.toUpperCase()).join('');}
  function navigationFix(words,fixes){
    const exact=identifier(words);
    if(fixes.includes(exact))return exact;
    // Observed recognition variants are resolved only against known fixes.
    // "Niner" remains 9 in headings/speeds/callsigns, never globally becomes N.
    const aliases={indigo:'I',niner:'N',nine:'N'};
    const candidate=words.map(w=>aliases[w]??letters[w]??w.toUpperCase()).join('');
    return fixes.includes(candidate)?candidate:null;
  }
  function callsign(words,active){
    const compact=identifier(words);
    if(active.includes(compact))return compact;
    const firstDigit=words.findIndex(w=>w in digits||/^\d/.test(w));
    if(firstDigit<0)throw Error('Say an aircraft callsign and flight number.');
    const prefixWords=words.slice(0,firstDigit);
    // Airline names apply only to the callsign, so Delta in a spelled fix
    // or phonetic callsign is never replaced with the airline code DAL.
    const alias=airlineAliases.find(([name])=>name===prefixWords.join(' '));
    const prefix=alias?alias[1]:identifier(prefixWords);
    const candidate=prefix+words.slice(firstDigit).map(w=>String(number([w]))).join('');
    if(!active.includes(candidate))throw Error(`No active aircraft matches ${candidate}.`);
    return candidate;
  }
  const markers=new Set(['climb','descend','decend','maintain','flight','altitude','speed','reduce','increase','heading','turn','direct','head','cleared','clear','runway','go']);
  // Remove conversation only at utterance edges or immediately after a
  // complete active callsign. Never discard unknown words inside instructions.
  const greetings=['good morning','good afternoon','good evening','hello','hi','marhaba','thank you','thanks','goodbye','good bye'].map(s=>s.split(' '));
  function conversation(text,context){
    let words=tokens(text),greeting=false;
    function trimEdges(){
      let changed=true;
      while(changed){
        changed=false;
        for(const phrase of greetings){
          if(phrase.every((w,i)=>words[i]===w)){
            words=words.slice(phrase.length);greeting=true;changed=true;break;
          }
          if(phrase.every((w,i)=>words[words.length-phrase.length+i]===w)){
            words=words.slice(0,-phrase.length);greeting=true;changed=true;break;
          }
        }
      }
    }
    trimEdges();
    for(let split=1;split<words.length;split++){
      try{callsign(words.slice(0,split),context.callsigns);}catch{continue;}
      const prefix=words.slice(0,split);words=words.slice(split);trimEdges();words=[...prefix,...words];break;
    }
    let call=null;
    if(greeting&&words.length){try{call=callsign(words,context.callsigns);}catch{}}
    return {words,greeting,only:greeting&&(!words.length||!!call),callsign:call};
  }
  function translate(text,context){
    const speech=conversation(text,context);
    if(speech.only)return ''; // Conversation is never an aircraft command.
    let words=speech.words;
    // Runway-first landing phrase: "VIR636 [runway] 09 left cleared for
    // landing". Move only this explicit landing pattern into canonical order.
    const clearance=words.findIndex((w,i)=>['clear','cleared'].includes(w)&&
      (['land','landing'].includes(words[i+1])||
       (['for','to'].includes(words[i+1])&&['land','landing'].includes(words[i+2]))));
    if(clearance>1 && ['left','right'].includes(words[clearance-1])){
      let runwayStart=clearance-1;
      while(runwayStart>0){
        const word=words[runwayStart-1];
        if(!(word in digits)&&!/^\d+$/.test(word))break;
        runwayStart--;
      }
      // The flight number can also be numeric: find a split whose callsign
      // matches an active flight and whose remaining number is a valid runway.
      const splits=[];
      for(let split=runwayStart;split<clearance-1;split++){
        let callWords=words.slice(0,split),runwayWords=words.slice(split,clearance-1);
        if(callWords.at(-1)==='runway')callWords=callWords.slice(0,-1);
        try{
          callsign(callWords,context.callsigns);
          const id=String(number(runwayWords)).padStart(2,'0')+(words[clearance-1]==='left'?'L':'R');
          if(context.runways.includes(id))splits.push({callWords,runwayWords});
        }catch{/* A candidate split is not a complete callsign/runway pair. */}
      }
      if(splits.length===1){
        const {callWords,runwayWords}=splits[0];
        const landingEnd=clearance+(['for','to'].includes(words[clearance+1])?3:2);
        words=[...callWords,'cleared','for','landing','runway',...runwayWords,words[clearance-1],...words.slice(landingEnd)];
      }else if(splits.length>1)throw Error('Ambiguous callsign/runway. Say the callsign, then cleared to land runway.');
    }
    // A name such as "speed bird" contains a command word. Resolve the
    // complete active callsign before choosing the instruction boundary.
    let start=-1;
    for(let index=1;index<words.length;index++){
      if(!markers.has(words[index]))continue;
      try{callsign(words.slice(0,index),context.callsigns);start=index;break;}catch{}
    }
    if(start<0)start=words.findIndex(w=>markers.has(w));
    if(start<1)throw Error('Callsign: say the callsign followed by an instruction.');
    let selectedCallsign;
    try{selectedCallsign=callsign(words.slice(0,start),context.callsigns);}
    catch(error){throw Error(`Callsign: ${error.message}`);}
    const result=[selectedCallsign];
    let i=start;
    while(i<words.length){
      if(words[i]==='and'){i++;continue;}
      const instructionStart=i;
      let action=words[i++],level=false;
      try{
      if(action==='climb'||action==='descend'||action==='decend'){
        while(['and','maintain','to'].includes(words[i]))i++;
        action='altitude';
      }
      if(action==='maintain')action='altitude';
      if(action==='flight'){if(words[i++]!=='level')throw Error('Expected flight level.');level=true;action='altitude';}
      if(action==='altitude'&&words[i]==='flight'){i++;if(words[i++]!=='level')throw Error('Expected flight level.');level=true;}
      if(action==='reduce'||action==='increase'){if(words[i++]!=='speed')throw Error('Expected speed.');action='speed';}
      if(action==='turn'){if(['left','right'].includes(words[i]))i++;if(words[i++]!=='heading')throw Error('Expected heading.');action='heading';}
      if(action==='head'){if(words[i]==='to')i++;action='direct';}
      if(action==='cleared'||action==='clear'){
        if(words[i]==='for')i++;if(words[i]==='to')i++;
        if(words[i]==='takeoff'){i++;result.push('T');continue;}
        if(words[i]==='take'&&words[i+1]==='off'){i+=2;result.push('T');continue;}
        if(['land','landing'].includes(words[i])){
          i++;if(words[i]==='runway')i++;action='landing';
        }else{
          // Informal simulator shorthand: "cleared five thousand" assigns
          // altitude, without issuing takeoff or landing clearance implicitly.
          let end=i;while(end<words.length&&!markers.has(words[end]))end++;
          try{number(words.slice(i,end));}
          catch{throw Error('Expected an altitude, landing or takeoff clearance.');}
          action='altitude';
        }
      }
      if(action==='go'){if(words[i++]!=='around')throw Error('Expected go around.');result.push('G');continue;}
      let end=i;while(end<words.length&&!markers.has(words[end]))end++;
      let value=words.slice(i,end);i=end;
      while(['and','to'].includes(value[0]))value.shift();
      while(value[value.length-1]==='and')value.pop();
      if(action==='runway'||action==='landing'){
        const side=value.pop();if(!['left','right'].includes(side))throw Error('Say runway left or right.');
        const runway=String(number(value)).padStart(2,'0')+(side==='left'?'L':'R');
        if(!context.runways.includes(runway))throw Error(`Unknown runway ${runway}.`);
        result.push(action==='landing'?'L':'R',runway);continue;
      }
      if(action==='direct'||action==='heading'){
        const fix=navigationFix(value,context.fixes);
        if(fix){result.push('C',fix);continue;}
        if(action==='direct')throw Error(`Unknown fix ${identifier(value)}.`);
        if(value.some(w=>w in letters||w==='indigo'))throw Error(`Unknown fix ${identifier(value)}. Check the waypoint spelling.`);
        const heading=number(value);if(heading<1||heading>360)throw Error('Heading must be 001–360.');
        result.push('C',String(heading).padStart(3,'0'));continue;
      }
      if(action==='altitude'){
        let altitude=number(value);if(level&&altitude<=360)altitude*=100;
        if(altitude<1)throw Error('Specify an altitude above zero.');
        // Explicit A prevents three-digit feet from being mistaken for a heading.
        result.push(altitude%1000===0?'C':'A',String(altitude%1000===0?altitude/1000:altitude));continue;
      }
      if(action==='speed'){result.push('S',String(number(value)));continue;}
      throw Error(`Unrecognised instruction: ${action}.`);
      }catch(error){
        const label={altitude:'Altitude',flight:'Altitude',speed:'Speed',heading:'Heading / fix',direct:'Direct-to fix',runway:'Runway',landing:'Landing clearance',go:'Go-around'}[action]||'Instruction';
        throw Error(`${label}: "${words.slice(instructionStart,i).join(' ')}" — ${error.message}`);
      }
    }
    return result.join(' ');
  }
  function resolveAlternatives(transcripts,context){
    // Prefer the best transcript if valid; otherwise require one unique draft.
    try{return {command:translate(transcripts[0],context),heard:transcripts[0]};}catch{}
    const valid=new Map();
    for(const text of transcripts.slice(1)){
      try{valid.set(translate(text,context),text);}catch{/* Incomplete or unknown instruction. */}
    }
    if(valid.size===1){const [command,heard]=[...valid][0];return {command,heard};}
    if(valid.size>1)throw Error('Speech has multiple possible commands. Edit the draft or repeat it.');
    translate(transcripts[0],context); // Report the best transcript's useful error.
  }
  window.ATCVoice={translate,resolveAlternatives};
  function recognisedCallsign(text){
    const context=window.getVoiceContext(),words=conversation(text,context).words,active=context.callsigns;
    for(let i=1;i<=words.length;i++){
      if(i<words.length&&!markers.has(words[i]))continue;
      try{return callsign(words.slice(0,i),active);}catch{/* Require an active match. */}
    }
    return null;
  }
  const input=document.getElementById('commandInput'),button=document.getElementById('voiceBtn'),status=document.getElementById('voiceStatus');
  if(!button)return;
  let latestFeedback=null;
  window.ATCVoice.getFeedback=()=>latestFeedback?{...latestFeedback}:null;
  const diagnostics=[];
  function recordAttempt(outcome,command='',alternative='',error=''){
    diagnostics.push({time:new Date().toISOString(),outcome,heard:transcript,
      alternatives:[...alternatives],command,matchedAlternative:alternative,error,
      context:JSON.parse(JSON.stringify(window.getVoiceContext()))});
    if(diagnostics.length>100)diagnostics.shift();
  }
  window.ATCVoice.getDiagnostics=()=>JSON.parse(JSON.stringify(diagnostics));
  document.getElementById('voiceExportBtn').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({version:1,attempts:diagnostics},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='atc-voice-log.json';link.click();URL.revokeObjectURL(url);
  });
  function feedback({heard='',draft='',alternative='',error=''}={}){
    latestFeedback={heard,draft,alternative,error};
  }
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){button.disabled=true;status.textContent='Voice unavailable in this browser. Try Chrome or Edge; typed commands still work.';return;}
  let recognition=null,transcript='',alternatives=[],previous='',busy=false,blocked=false,cancelled=false,failed=false,greetingPending=false;
  function start(){
    if(busy||['helpDialog','infoDialog','settingsDialog','saveDialog'].some(id=>document.getElementById(id)?.open))return;
    greetingPending=false;previous=input.value;transcript='';alternatives=[];busy=true;blocked=true;cancelled=false;failed=false;
    feedback();
    window.ATCReadbacks?.setListening(true);
    recognition=new Recognition();recognition.lang='en-GB';recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=5;
    status.textContent='Listening… speak, then release Q. Enter submits the draft.';button.setAttribute('aria-pressed','true');
    recognition.onresult=e=>{
      if(cancelled||failed)return;
      transcript=Array.from(e.results,r=>r[0].transcript).join(' ');
      // Vary one recognition segment at a time rather than combining guesses.
      const segments=Array.from(e.results,r=>Array.from(r,a=>a.transcript));
      alternatives=[transcript];
      segments.forEach((segment,index)=>segment.slice(1).forEach(option=>{
        alternatives.push(segments.map((s,i)=>i===index?option:s[0]).join(' '));
      }));
      input.value=transcript;feedback({heard:transcript});status.textContent='Listening… '+transcript;
    };
    recognition.onerror=e=>{failed=true;status.textContent=`Voice error: ${e.error}. Check microphone permission/connection and try again.`;feedback({heard:transcript,error:status.textContent});recordAttempt('recognition-error','', '',status.textContent);transcript='';};
    recognition.onend=()=>{
      busy=false;button.setAttribute('aria-pressed','false');
      window.ATCReadbacks?.setListening(false);
      if(!transcript||cancelled){
        if(!failed)recordAttempt(cancelled?'cancelled':'no-speech');
        input.value=previous;blocked=false;
        if(!failed){feedback({draft:previous});status.textContent=cancelled?'Voice cancelled.':'No speech detected. Hold Q to try again.';}
        else latestFeedback.draft=previous;
        return;
      }
      try{
        const draft=resolveAlternatives(alternatives,window.getVoiceContext());
        greetingPending=draft.command==='';
        input.value=greetingPending?draft.heard:draft.command;blocked=false;
        recordAttempt('translated',draft.command,draft.heard!==transcript?draft.heard:'');
        feedback({heard:transcript,draft:draft.command,alternative:draft.heard!==transcript?draft.heard:''});
        status.textContent=greetingPending?'Greeting recognised. Enter to acknowledge; no aircraft instructions.':`${draft.heard!==transcript?'Used matched alternative. ':''}Draft ready. Check it, then Enter.`;
      }
      catch(error){input.value=transcript;feedback({heard:transcript,error:error.message});recordAttempt('translation-error','','',error.message);status.textContent=`${error.message} Edit the text into a command, or hold Q to retry.`;}
      input.focus();
    };
    try{recognition.start();}catch(error){busy=false;blocked=false;window.ATCReadbacks?.setListening(false);feedback({error:error.message});recordAttempt('recognition-error','','',error.message);status.textContent=error.message;button.setAttribute('aria-pressed','false');}
  }
  function stop(){if(busy){status.textContent='Finishing recognition…';recognition.stop();}}
  // Q works even in the command box; ordinary typing resumes on key release.
  document.addEventListener('keydown',e=>{
    if(e.code==='KeyQ'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();if(!e.repeat)start();}
    if(e.key==='Escape'&&busy){cancelled=true;transcript='';recognition.abort();}
  });
  document.addEventListener('keyup',e=>{if(e.code==='KeyQ')stop();});
  window.addEventListener('blur',stop);
  button.addEventListener('pointerdown',e=>{button.setPointerCapture(e.pointerId);start();});
  button.addEventListener('pointerup',stop);button.addEventListener('pointercancel',stop);
  button.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)start();}});
  button.addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();stop();}});
  input.addEventListener('input',()=>{
    if(!busy){
      blocked=false;greetingPending=false;
      if(latestFeedback){latestFeedback.draft=input.value;status.textContent='Draft edited. Check it, then Enter; the simulator validates submitted commands.';}
    }
  });
  document.getElementById('commandForm').addEventListener('submit',e=>{
    if(greetingPending&&!busy){
      e.preventDefault();e.stopImmediatePropagation();greetingPending=false;
      input.value='';status.textContent='Greeting acknowledged. No aircraft instructions changed.';
      return;
    }
    if(busy||blocked){
      e.preventDefault();e.stopImmediatePropagation();
      status.textContent=busy?'Release Q and wait for the draft before submitting.':'Correct the unrecognised speech before submitting.';
      if(!busy){const call=recognisedCallsign(transcript);if(call)window.ATCReadbacks?.respond({callsign:call,instructions:[],sayAgain:true});}
    }
  },true);
})();
