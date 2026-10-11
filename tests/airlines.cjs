const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const table={children:[],appendChild(row){this.children.push(row);}};
const context=vm.createContext({window:{},document:{getElementById:id=>id==='airlineInfoRows'?table:null,createElement:()=>({children:[],appendChild(cell){this.children.push(cell);}})}});
for(const name of ['airlines','info','voice'])vm.runInContext(fs.readFileSync(`simulator/static/simulator/js/${name}.js`,'utf8'),context);
const catalogue=context.window.ATC_AIRLINES;
const aliases=new Map();
assert.equal(table.children.length,catalogue.length);
for(const [i,airline] of catalogue.entries()){
  for(const alias of airline.aliases){
    assert.ok(!aliases.has(alias)||aliases.get(alias)===airline.code,`conflicting alias ${alias}`);aliases.set(alias,airline.code);
  }
  const forms=[airline.code,airline.letters,airline.phonetic,...airline.aliases];
  assert.equal(table.children[i].children[2].textContent,forms.join(' · '),'Info uses exactly the translator catalogue');
  const vocabulary={callsigns:[airline.code+'123'],fixes:['CPT','WOD','NIGIT','HEN','DONNA','BPK','LAM','OCK','BIG','BNN','LON','DORKI','HILLY'],runways:['09L','09R','27L','27R']};
  for(const alias of forms){
    for(const fix of vocabulary.fixes){
      assert.equal(context.window.ATCVoice.translate(`${alias} one two three direct ${fix}`,vocabulary),`${airline.code}123 C ${fix}`);
    }
    assert.equal(context.window.ATCVoice.translate(`${alias} one two three heading Whiskey Oscar Delta`,vocabulary),`${airline.code}123 C WOD`);
  }
}
console.log('V04 PASS: every catalogue alias across all Heathrow fixes, Info parity, phonetic context and alias collisions.');
