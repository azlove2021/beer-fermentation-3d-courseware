(function(){
  runStart();
  runGoto(3);
  RUN.t = 9.5;
  updateRun(0.001, 1);
  VESSELS.forEach(function(v){ if (v.station===3) setVesselLevel(v, 0.72); });
  flyTo(stationView(3), true);
  return {xray:XRAY.on, playing:State.playing, chip:document.getElementById('stChip').textContent};
})()
