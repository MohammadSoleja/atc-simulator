/* Versioned simulation snapshots; no browser settings or audio queues. */
(() => {
  function validate(save, context) {
    const fail = message => { throw new Error(message); };
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const number = (value, low=0, high=1e9) => Number.isFinite(value) && value >= low && value <= high;
    if (!object(save) || save.version !== 1) fail('Unsupported save version.');
    if (save.airport !== context.airport) fail('This airport is not available.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(save.session_id)) fail('Invalid game session.');
    if (![1,2,4,8].includes(save.pace)) fail('Invalid simulation pace.');
    const s = save.state;
    if (!object(s)) fail('Missing simulation state.');
    const stateKeys = ['elapsed','clockElapsed','trafficElapsed','lastSpawn','nextId','landings','handoffs','violations','missed','score','aircraft','upcoming','conflicts'];
    if (Object.keys(s).some(key=>!stateKeys.includes(key)&&key!=='trafficSchedule') || stateKeys.some(key => !(key in s))) fail('Incomplete simulation state.');
    for (const key of stateKeys.slice(0,9)) if (!number(s[key]) || (['nextId','landings','handoffs','violations','missed'].includes(key) && !Number.isInteger(s[key]))) fail(`Invalid ${key}.`);
    if (s.nextId < 1 || !Number.isInteger(s.score) || !number(s.score,-1e9) || s.lastSpawn > s.trafficElapsed) fail('Invalid game counters.');
    if (!Array.isArray(s.aircraft) || !Array.isArray(s.upcoming) || s.upcoming.length > 10 || !Array.isArray(s.conflicts)) fail('Invalid traffic lists.');
    if('trafficSchedule' in s&&(!object(s.trafficSchedule)||Object.keys(s.trafficSchedule).length!==2||!number(s.trafficSchedule.arrival)||!number(s.trafficSchedule.departure)))fail('Invalid traffic schedule.');
    const ids = new Set(), callsigns = new Set();
    const identity = a => {
      if (!object(a) || !/^[A-Z]{3}[0-9]{1,7}$/.test(a.callsign) || callsigns.has(a.callsign) || !context.types.includes(a.type) || !['arrival','departure'].includes(a.kind)) fail('Invalid aircraft identity.');
      callsigns.add(a.callsign);
    };
    for (const a of s.aircraft) {
      identity(a);
      if (!Number.isInteger(a.id) || a.id < 1 || a.id >= s.nextId || ids.has(a.id)) fail('Invalid aircraft ID.');
      ids.add(a.id);
      for (const key of ['x','y']) if (!number(a[key],-2,3)) fail('Invalid aircraft position.');
      for (const key of ['altitude','targetAltitude']) if (!number(a[key],0,100000)) fail('Invalid aircraft altitude.');
      for (const key of ['speed','targetSpeed']) if (!number(a[key],0,350)) fail('Invalid aircraft speed.');
      for (const key of ['heading','targetHeading']) if (!number(a[key],0,360)) fail('Invalid aircraft heading.');
      if (!number(a.verticalSpeed,-10000,10000) || ('bank' in a && !number(a.bank,-30,30))) fail('Invalid aircraft dynamics.');
      if (!['holding','takeoff','airborne','landed'].includes(a.phase) || typeof a.landed !== 'boolean') fail('Invalid aircraft phase.');
      if (a.nav !== null && !context.fixes.includes(a.nav)) fail('Unknown navigation fix.');
      if (a.clearedToLand !== null && !context.runways.includes(a.clearedToLand)) fail('Unknown landing runway.');
      if (a.runway != null && !context.runways.includes(a.runway)) fail('Unknown departure runway.');
      if (a.kind === 'departure' && (!context.departureFixes.includes(a.exitFix) || (a.phase === 'takeoff' && !a.runway))) fail('Invalid departure route.');
      if (a.approachCaptured && !a.clearedToLand) fail('Missing approach runway.');
      if ('removeAt' in a && !number(a.removeAt)) fail('Invalid removal timer.');
      if (!Array.isArray(a.trail) || a.trail.length > 8 || a.trail.some(p => !object(p) || !number(p.x,-2,3) || !number(p.y,-2,3) || !number(p.t,0,s.elapsed))) fail('Invalid aircraft trail.');
    }
    for (const a of s.upcoming) {
      identity(a);
      if (!number(a.dueAt)) fail('Invalid traffic notice.');
      if (a.kind === 'departure' && !context.departureFixes.includes(a.exitFix)) fail('Invalid pending departure.');
      if (a.kind === 'arrival' && (!number(a.altitude,0,100000) || !number(a.targetAltitude,0,100000) || !number(a.speed,0,350))) fail('Invalid pending arrival.');
    }
    const pairs = new Set();
    for (const pair of s.conflicts) {
      if (typeof pair !== 'string' || !/^\d+-\d+$/.test(pair) || pairs.has(pair)) fail('Invalid separation state.');
      const [a,b] = pair.split('-').map(Number);
      if (a >= b || !ids.has(a) || !ids.has(b)) fail('Invalid conflict targets.');
      pairs.add(pair);
    }
    return save;
  }
  window.ATCSaveFormat = {validate};
})();
