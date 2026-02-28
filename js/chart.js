// ============================================================
// CANVAS CHART
// ============================================================
function drawChart(code, pts) {
  const canvas = document.getElementById('chart-' + code);
  if (!canvas || !pts || pts.length < 2) return;

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 400;
  const H = parseInt(canvas.getAttribute('height')) || 200;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const pad = {top:10, right:10, bottom:20, left:40};
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top  - pad.bottom;

  const navs = pts.map(p => p.y);
  const minV = Math.min(...navs);
  const maxV = Math.max(...navs);
  const range = maxV - minV || 0.001;

  function xCoord(i) { return pad.left + (i / (pts.length - 1)) * cW; }
  function yCoord(v) { return pad.top + (1 - (v - minV) / range) * cH; }

  function calcMA(arr, len) {
    return arr.map((_,i) => {
      if (i < len - 1) return null;
      return arr.slice(i - len + 1, i + 1).reduce((a,b) => a+b, 0) / len;
    });
  }

  const ma5vals  = calcMA(navs, 5);
  const ma20vals = calcMA(navs, 20);

  // Determine color: up or down
  const isUp = navs[navs.length-1] >= navs[0];
  const lineColor = isUp ? '#e53935' : '#52c41a';

  // Gradient fill
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
  grad.addColorStop(0, isUp ? 'rgba(229,57,53,.25)' : 'rgba(82,196,26,.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');

  // Fill area
  ctx.beginPath();
  ctx.moveTo(xCoord(0), yCoord(navs[0]));
  for (let i=1; i<pts.length; i++) ctx.lineTo(xCoord(i), yCoord(navs[i]));
  ctx.lineTo(xCoord(pts.length-1), pad.top + cH);
  ctx.lineTo(xCoord(0), pad.top + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // NAV line
  ctx.beginPath();
  ctx.moveTo(xCoord(0), yCoord(navs[0]));
  for (let i=1; i<pts.length; i++) ctx.lineTo(xCoord(i), yCoord(navs[i]));
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // MA5 dashed yellow
  ctx.setLineDash([4,3]);
  ctx.beginPath();
  let started = false;
  for (let i=0; i<pts.length; i++) {
    if (ma5vals[i] === null) continue;
    if (!started) { ctx.moveTo(xCoord(i), yCoord(ma5vals[i])); started=true; }
    else ctx.lineTo(xCoord(i), yCoord(ma5vals[i]));
  }
  ctx.strokeStyle = '#faad14';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // MA20 dashed blue
  ctx.beginPath();
  started = false;
  for (let i=0; i<pts.length; i++) {
    if (ma20vals[i] === null) continue;
    if (!started) { ctx.moveTo(xCoord(i), yCoord(ma20vals[i])); started=true; }
    else ctx.lineTo(xCoord(i), yCoord(ma20vals[i]));
  }
  ctx.strokeStyle = '#1890ff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);

  // Y axis labels
  ctx.fillStyle = '#999';
  ctx.font = `${10 * dpr / dpr}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText(fmt4(maxV), pad.left - 4, pad.top + 8);
  ctx.fillText(fmt4(minV), pad.left - 4, pad.top + cH);

  // End point dot
  const lastX = xCoord(pts.length-1);
  const lastY = yCoord(navs[navs.length-1]);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, Math.PI*2);
  ctx.fillStyle = lineColor;
  ctx.fill();
}
