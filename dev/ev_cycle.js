(function () {
  runStart();
  const seen = [];
  let last = '';
  for (let i = 0; i < 3600; i++) {           /* 60fps × 60s */
    const t = i / 60;
    updateRun(1 / 60, t);
    const k = RUN.idx + ':' + RUN.phase;
    if (k !== last) { last = k; seen.push(k); }
    if (RUN.phase === 'done') break;
  }
  return {
    steps: seen.length,
    seq: seen.slice(0, 26).join(' > '),
    tail: seen.slice(-4).join(' > '),
    endPhase: RUN.phase,
    endIdx: RUN.idx
  };
})()
