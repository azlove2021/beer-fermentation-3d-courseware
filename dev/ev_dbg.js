(async function () {
  const log = [];
  runStart();
  const grab = (tag) => log.push(tag + ': t=' + RUN.t.toFixed(2) + ' idx=' + RUN.idx + ' phase=' + RUN.phase + ' on=' + RUN.on);
  grab('start');
  await new Promise(r => setTimeout(r, 1200)); grab('1.2s');
  await new Promise(r => setTimeout(r, 1200)); grab('2.4s');
  await new Promise(r => setTimeout(r, 2000)); grab('4.4s');
  return log.join(' | ');
})()
