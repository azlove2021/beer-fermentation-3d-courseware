(function () {
  runStart();
  RUN.idx = 3; RUN.phase = 'process'; RUN.t = 1.0;
  RING.position.set(STATIONS[3].x, 0.045, 0);
  RING.material.opacity = 0.40;
  VESSELS.forEach(function (v) { if (v.station === 3) setVesselLevel(v, 1); });
  setXray(true);
  goTo(3, { fromRun: true, force: true });
  return 'ok';
})()
