(function () {
  const c = document.getElementById('gl');
  const host = document.getElementById('stageCanvas');
  return {
    host: host.clientWidth + 'x' + host.clientHeight,
    canvasCss: c.clientWidth + 'x' + c.clientHeight,
    buffer: c.width + 'x' + c.height,
    cameraAspect: +camera.aspect.toFixed(4),
    displayAspect: +(c.clientWidth / c.clientHeight).toFixed(4),
    ratio: +((camera.aspect) / (c.clientWidth / c.clientHeight)).toFixed(4)
  };
})()
