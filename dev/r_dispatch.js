(function(){
  var q = new URLSearchParams(location.search);
  var d = q.get('do') || '';
  function click(id){ var e=document.getElementById(id); if(!e) return id+':MISSING'; e.click(); return id+':ok'; }
  var log = [];
  if (d==='xray') { log.push(click('btnXray')); }
  if (d==='immersive') { log.push(click('btnImmersive')); log.push(click('btnXray')); }
  if (d==='s4') { goTo(3,{force:true}); flyTo(stationView(3), true); log.push('s4'); }
  if (d==='s8') { goTo(7,{force:true}); flyTo(stationView(7), true); log.push('s8'); }
  if (d==='s8x') { goTo(7,{force:true}); setXray(true); flyTo(stationView(7), true); log.push('s8x'); }
  if (d==='cellmode') { goTo(7,{force:true}); setCellMode(true); log.push('cellmode'); }
  if (d==='sim') { openOverlay('sim'); log.push('sim'); }
  if (d==='cell') { openOverlay('cell'); log.push('cell'); }
  if (d==='engine') { openOverlay('engine'); log.push('engine'); }
  if (d==='quiz') { openOverlay('quiz'); log.push('quiz'); }
  if (d==='help') { openOverlay('help'); log.push('help'); }
  if (d==='run') { click('btnPlay'); log.push('play clicked on='+RUN.on); }
  if (d==='labels') { click('btnLabels'); log.push('labels off'); }
  if (d==='back') { goTo(9,{force:true}); log.push('s10'); }
  return log.join(' | ');
})()
