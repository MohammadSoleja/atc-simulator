(() => {
  const body=document.getElementById('airlineInfoRows');
  for(const airline of window.ATC_AIRLINES){
    const row=document.createElement('tr');
    for(const text of [airline.code,airline.name,[airline.code,airline.letters,airline.phonetic,...airline.aliases].join(' · ')]){
      const cell=document.createElement('td');cell.textContent=text;row.appendChild(cell);
    }
    body.appendChild(row);
  }
})();
