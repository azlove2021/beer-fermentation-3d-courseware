(function () {
  runStart();
  const seq = [];
  let last = '';
  for (let i = 0; i < 6000; i++) {
    updateRun(1 / 60, i / 60);
    const k = RUN.idx + ':' + RUN.step;
    if (k !== last) { last = k; seq.push(k); }
    if (RUN.done) break;
  }
  return { transitions: seq.length, head: seq.slice(0, 12).join(' '), tail: seq.slice(-3).join(' '), done: RUN.done };
})()
