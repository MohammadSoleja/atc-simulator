/* Browser speech synthesis is optional; the simulator's text remains authoritative. */
(() => {
  const synthesis=window.speechSynthesis;
  const mute=document.getElementById('readbackMute');
  const volume=document.getElementById('readbackVolume');
  const status=document.getElementById('readbackStatus');
  const rate=document.getElementById('readbackRate');
  const voiceSelect=document.getElementById('readbackVoice');
  const pilotCalls=document.getElementById('pilotCalls');
  let voices=[],preferredVoice='';
  function loadVoices(){
    voices=(synthesis?.getVoices?.()||[]).filter(v=>/^en\b/i.test(v.lang));
    voiceSelect.innerHTML='';
    const automatic=document.createElement('option');automatic.value='';automatic.textContent='Automatic English voice';voiceSelect.appendChild(automatic);
    for(const voice of voices){const option=document.createElement('option');option.value=voice.voiceURI;option.textContent=`${voice.name} (${voice.lang})`;voiceSelect.appendChild(option);}
    voiceSelect.value=voices.some(v=>v.voiceURI===preferredVoice)?preferredVoice:'';
  }
  let listening=false,current=null,generation=0,activated=false,startTimer=null;
  const queue=[];
  const digits=['zero','one','two','three','four','five','six','seven','eight','niner'];
  function spokenDigits(text){return [...text].map(c=>digits[Number(c)]).join(' ');}
  function radioCallsign(callsign){
    const airline=window.ATC_AIRLINES.find(a=>callsign.startsWith(a.code));
    return airline?`${airline.radio} ${spokenDigits(callsign.slice(3))}`:callsign;
  }
  function instructionSpeech(text){
    return text.replace(/\b(\d{2})([LR])\b/g,(_,number,side)=>`${spokenDigits(number)} ${side==='L'?'left':'right'}`)
      .replace(/heading (\d+)°/g,(_,number)=>`heading ${spokenDigits(number)}`)
      .replace(/speed (\d+) kt/g,(_,number)=>`speed ${spokenDigits(number)} knots`)
      .replace(/([\d,]+) ft/g,(_,number)=>`${Number(number.replace(/,/g,''))} feet`);
  }
  function responseText(result){
    const parts=result.instructions.map(instructionSpeech);
    if(result.sayAgain||(!parts.length&&!result.error))parts.push('say again');
    if(result.error)parts.push(`unable, ${instructionSpeech(result.error.replace(new RegExp('^'+result.callsign+'[: ]*'),''))}`);
    return `${radioCallsign(result.callsign)}, ${parts.join(', ')}.`;
  }
  function eventText(event){
    const hour=Math.floor(event.clock/3600);
    const greeting=hour<12?'good morning':hour<18?'good afternoon':'good evening';
    const friendly=['SVA','RXI','UAE','ETD'].some(code=>event.callsign.startsWith(code))&&Number(event.callsign.slice(3))%4===0?'marhaba':greeting;
    const call=radioCallsign(event.callsign);
    if(event.kind==='arrival')return `${call}, ${friendly}, with you at ${Math.round(event.altitude)} feet.`;
    if(event.kind==='departure')return `${call}, ${friendly}, ready for departure, request clearance.`;
    if(event.kind==='fix')return `${call}, at ${event.fix}, request further instructions.`;
    if(event.kind==='handoff')return `${call}, leaving your frequency, thank you, goodbye.`;
    return '';
  }
  function clearStartTimer(){if(startTimer!==null){window.clearTimeout(startTimer);startTimer=null;}}
  function cancel(){
    generation++;clearStartTimer();queue.length=0;
    const hadSpeech=!!current||synthesis?.speaking||synthesis?.pending;
    current=null;
    if(hadSpeech)synthesis?.cancel();
  }
  function playNext(){
    if(!activated||current||listening||mute.checked||!queue.length||!synthesis||!window.SpeechSynthesisUtterance)return;
    const utterance=new window.SpeechSynthesisUtterance(queue.shift());
    const token=generation;
    utterance.lang='en-GB';utterance.volume=Number(volume.value)/100;
    utterance.rate=Number(rate.value);
    // Prefer available enhanced/natural voices, with a local/default fallback.
    utterance.voice=voices.find(v=>v.voiceURI===preferredVoice)||voices.find(v=>/natural|enhanced|premium|neural/i.test(v.name))||voices.find(v=>v.default)||voices[0]||null;
    utterance.lang=utterance.voice?.lang||'en-GB';
    current=utterance;
    utterance.onstart=()=>{if(token!==generation)return;clearStartTimer();status.textContent='Pilot voices active. Text feedback remains available.';};
    utterance.onend=()=>{if(token!==generation)return;clearStartTimer();current=null;playNext();};
    utterance.onerror=event=>{if(token!==generation)return;clearStartTimer();current=null;status.textContent=`Pilot audio failed (${event.error||'unknown error'}). Try another voice or browser. Text feedback remains available.`;playNext();};
    // A browser may expose voices but never start the platform speech service.
    // Detect that separately from successful playback or an explicit error.
    startTimer=window.setTimeout(()=>{
      if(token!==generation||current!==utterance)return;
      cancel();
      status.textContent='Browser speech did not start. In Chrome, fully quit and reopen Chrome, then try Test pilot voice again. Text commands still work.';
    },5000);
    try{if(synthesis.paused)synthesis.resume?.();synthesis.speak(utterance);}catch{clearStartTimer();current=null;queue.length=0;status.textContent='Pilot audio unavailable. Text feedback remains available.';}
  }
  window.ATCReadbacks={
    responseText,
    eventText,
    event(event){
      const text=eventText(event);
      if(!text||!pilotCalls.checked)return '';
      if(!mute.checked&&!listening&&queue.length<3&&synthesis&&window.SpeechSynthesisUtterance){queue.push(text);playNext();}
      return text;
    },
    respond(result){
      if(!result.callsign||mute.checked||listening||!synthesis||!window.SpeechSynthesisUtterance)return;
      queue.push(responseText(result));playNext();
    },
    // Drop interrupted/stale replies so microphone input cannot hear the pilot.
    setListening(value){listening=value;if(value)cancel();},
    clear:cancel
  };
  document.getElementById('readbackTest')?.addEventListener('click',()=>{
    if(!synthesis||!window.SpeechSynthesisUtterance){status.textContent='Speech synthesis is unavailable in this browser.';return;}
    if(mute.checked){status.textContent='Pilot voices are muted. Uncheck Mute pilot voices to test.';return;}
    if(Number(volume.value)===0){status.textContent='Pilot volume is zero. Increase the volume to test.';return;}
    cancel();listening=false;activated=true;loadVoices();
    status.textContent='Testing pilot voice. If silent, check browser/site mute and your sound output, or try another voice.';
    queue.push('Speedbird one two three, radio check. Can you hear me?');playNext();
  });
  mute.addEventListener('change',()=>{if(mute.checked)cancel();saveSettings();});
  volume.addEventListener('input',()=>{if(current)current.volume=Number(volume.value)/100;saveSettings();});
  rate.addEventListener('input',saveSettings);
  voiceSelect.addEventListener('change',()=>{preferredVoice=voiceSelect.value;saveSettings();});
  pilotCalls.addEventListener('change',saveSettings);
  function saveSettings(){try{localStorage.setItem('atc-readback-settings',JSON.stringify({muted:mute.checked,volume:Number(volume.value),rate:Number(rate.value),voice:preferredVoice,pilotCalls:pilotCalls.checked}));}catch{/* Session controls still work. */}}
  try{
    const saved=JSON.parse(localStorage.getItem('atc-readback-settings'));
    if(saved){mute.checked=saved.muted===true;if(Number.isFinite(saved.volume))volume.value=Math.max(0,Math.min(100,saved.volume));}
    if(saved){if(Number.isFinite(saved.rate))rate.value=Math.max(.9,Math.min(1.6,saved.rate));preferredVoice=typeof saved.voice==='string'?saved.voice:'';pilotCalls.checked=saved.pilotCalls!==false;}
  }catch{/* Storage unavailable or invalid. */}
  if(!synthesis||!window.SpeechSynthesisUtterance)status.textContent='Pilot audio unavailable in this browser. Text feedback remains available.';
  loadVoices();synthesis?.addEventListener?.('voiceschanged',loadVoices);
  // Browsers require a user gesture for audio. Hold entry calls until the first
  // interaction rather than treating an autoplay block as unavailable speech.
  function activate(){activated=true;playNext();}
  document.addEventListener('pointerdown',activate);
  document.addEventListener('keydown',activate);
})();
