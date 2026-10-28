(function () {
  var out = [], errs = [];
  for (var i = 0; i < STATIONS.length; i++) {
    try {
      goTo(i, { force: true });
      var name = document.querySelector('.p-name');
      var no = document.querySelector('.p-no');
      out.push((no ? no.textContent.replace('SECTION ', '') : '?') + ':' + (name ? name.textContent : 'MISSING'));
    } catch (e) { errs.push(i + ' -> ' + e.message); }
  }
  /* 弹层逐个构建一次，捕获模板错误 */
  ['cell', 'engine', 'sim', 'quiz', 'help'].forEach(function (k) {
    try { openOverlay(k); } catch (e) { errs.push(k + ' -> ' + e.message); }
  });
  closeOverlay();
  goTo(0, { force: true });
  return { panels: out.join(' | '), errors: errs.length ? errs.join(' ; ') : 'none' };
})()
