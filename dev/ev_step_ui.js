(function () {
  runStart();
  runGoto(3);
  RUN.t = 1.4 + 2.2 + 0.8;        /* 进入第 3 道：β-淀粉酶休止 */
  updateRun(0.001, 1);
  VESSELS.forEach(function (v) { if (v.station === 3) setVesselLevel(v, 0.72); });
  setXray(true);
  return { step: RUN.step, chip: document.getElementById('stChip').textContent };
})()
