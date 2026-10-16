/* Account saves never interrupt aircraft motion on network failure. */
(() => {
  const config=document.getElementById('saveConfig');
  if(!config)return;
  const game=window.ATCGame;
  const dialog=document.getElementById('saveDialog');
  const form=document.getElementById('saveForm');
  const name=document.getElementById('saveName');
  const feedback=document.getElementById('saveFeedback');
  const status=document.getElementById('autosaveStatus');
  const button=document.getElementById('confirmSaveBtn');
  let elapsed=0,busy=false,loading=false,failedLoad=false,previousPause=false;
  const token=document.querySelector('#saveCsrf input').value;
  async function request(url,options={}){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(url,{credentials:'same-origin',...options,signal:controller.signal});
      let result;try{result=await response.json();}catch{throw Error('Unable to access this save. Reload or log in again.');}
      if(!response.ok)throw Error(result.error||'Unable to access this save.');
      return result;
    }finally{clearTimeout(timeout);}
  }
  async function save(autosave){
    if(busy||loading||failedLoad)return;
    busy=true;button.disabled=true;
    try{
      const result=await request(config.dataset.createUrl,{method:'POST',
        headers:{'Content-Type':'application/json','X-CSRFToken':token},
        body:JSON.stringify({name:autosave?'Autosave':name.value.trim(),autosave,snapshot:game.exportSnapshot()})});
      elapsed=0;
      if(autosave)status.textContent=`Autosaved at ${new Date(result.saved_at).toLocaleTimeString()}.`;
      else{game.notify(`Saved “${result.name}”.`);dialog.close();}
    }catch(error){
      if(autosave)status.textContent='Autosave failed: '+error.message+' Retrying after 60 seconds of active play.';
      else feedback.textContent='Save failed: '+error.message+' Your game is unchanged.';
    }finally{busy=false;button.disabled=false;}
  }
  document.getElementById('saveBtn').addEventListener('click',()=>{
    if(loading||failedLoad)return;
    previousPause=game.isPaused();game.setPaused(true);
    name.value='Heathrow '+new Date().toLocaleString();feedback.textContent='';dialog.showModal();name.focus();
  });
  document.getElementById('closeSaveBtn').addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>game.setPaused(previousPause));
  form.addEventListener('submit',event=>{event.preventDefault();if(name.value.trim())save(false);});
  window.ATCSaves={
    newGame(){elapsed=0;failedLoad=false;document.getElementById('pauseBtn').disabled=false;status.textContent='Autosave every 60 seconds of active play; manual saves are separate.';},
    tick(dt,paused){
      if(paused||busy||loading||failedLoad)return;
      elapsed+=dt;if(elapsed>=60){elapsed=0;save(true);}
    }
  };
  if(config.dataset.loadUrl){
    loading=true;game.setPaused(true);game.notify('Loading saved game…');
    document.getElementById('pauseBtn').disabled=true;document.getElementById('restartBtn').disabled=true;
    request(config.dataset.loadUrl).then(result=>{game.restoreSnapshot(result.snapshot);})
      .catch(error=>{failedLoad=true;game.notify('Load failed: '+error.message+' Restart to begin a new game.',true);})
      .finally(()=>{loading=false;document.getElementById('pauseBtn').disabled=failedLoad;document.getElementById('restartBtn').disabled=false;});
  }
})();
