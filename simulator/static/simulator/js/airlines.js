/* Shared traffic/voice/reference catalogue. Codes and radio names checked against
 * https://www.faa.gov/air_traffic/publications/atpubs/cnt_html/chap3_section_1.html
 * Full airline names and extra spellings are simulator voice aliases. */
(() => {
  const phonetics='Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliet Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey Xray Yankee Zulu'.split(' ');
  const rows=[
    ['BAW','British Airways','Speedbird',['speed bird']],
    ['EZY','easyJet','Easy',['easy jet']],
    ['VIR','Virgin Atlantic','Virgin',[]],
    ['SAS','Scandinavian Airlines','Scandinavian',[]],
    ['KLM','KLM','KLM',['royal dutch airlines','K L M']],
    ['AFR','Air France','Air France',[]],
    ['DLH','Lufthansa','Lufthansa',[]],
    ['UAL','United Airlines','United',[]],
    ['AAL','American Airlines','American',[]],
    ['RYR','Ryanair','Ryanair',['ryan air']],
    ['SVA','Saudia','Saudia',['saudi arabian airlines','saudi arabian','saudi airlines']],
    ['RXI','Riyadh Air','Riyadh Air',['riyadh']],
    ['UAE','Emirates','Emirates',['emirates airlines']],
    ['QTR','Qatar Airways','Qatari',['qatar']],
    ['ETD','Etihad Airways','Etihad',[]],
    ['SIA','Singapore Airlines','Singapore',[]],
    ['CPA','Cathay Pacific','Cathay',[]],
    ['THY','Turkish Airlines','Turkish',[]],
    ['FIN','Finnair','Finnair',['finn air']],
    ['SWR','Swiss International Air Lines','Swiss',['swiss airlines','swiss international airlines']],
    ['QFA','Qantas','Qantas',['qantas airways']],
    ['ACA','Air Canada','Air Canada',[]],
    ['IBE','Iberia','Iberia',[]],
    ['DAL','Delta Air Lines','Delta',['delta airlines']],
    ['AIC','Air India','Airindia',[]],
    ['EIN','Aer Lingus','Shamrock',['air lingus']],
  ];
  window.ATC_AIRLINES=rows.map(([code,name,radio,extra])=>({code,name,radio,
    aliases:[...new Set([name,radio,...extra].map(s=>s.toLowerCase()))],
    letters:code.split('').join(' '),phonetic:code.split('').map(c=>phonetics[c.charCodeAt(0)-65]).join(' ')}));
})();
