// ============================================================
// RENDER CARDS
// ============================================================
function renderCards(computed) {
  const container = document.getElementById('cardsContainer');
  const codes = Object.keys(funds);
  if (!codes.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📊</div><div>暂无基金，请添加代码</div></div>';
    return;
  }
  container.innerHTML = codes.map(code => buildCard(code, computed && computed[code])).join('');
  // Restore checkbox state for any selected items
  batchSelected.forEach(code => {
    const chk = document.getElementById('chk-' + code);
    if (chk) chk.checked = true;
  });
  codes.forEach(code => {
    const c = computed && computed[code];
    if (c) {
      const trend = fundData[code] && fundData[code].hist && fundData[code].hist.trend;
      if (trend) drawChart(code, filterTrend(trend, currentPeriod));
    }
  });
}

function buildCard(code, c) {
  const f = funds[code];
  const name = f.name || code;
  const rt = fundData[code] && fundData[code].rt;

  const navVal = c ? fmt4(c.nav) : '--';
  const navDate = c ? new Date(c.navDate).toLocaleDateString('zh-CN') : '--';
  const navCls  = c ? (c.dailyReturn > 0 ? 'up' : c.dailyReturn < 0 ? 'dn' : 'flat') : '';

  const rtVal  = rt ? rt.gsz    : '--';
  const rtPct  = rt ? rt.gszzl  : '--';
  const rtTime = rt ? rt.gztime : '';
  const rtCls  = rt ? (parseFloat(rt.gszzl) > 0 ? 'up' : parseFloat(rt.gszzl) < 0 ? 'dn' : 'flat') : '';

  const sg = c ? getSuggestion(c.score) : null;

  // Holding P&L
  let holdHtml = '';
  if (f.amount > 0 && c && f.cost > 0) {
    const pnlPct = (c.nav - f.cost) / f.cost * 100;
    const pnlAmt = f.amount * (c.nav - f.cost) / f.cost;
    const pcls   = pnlAmt >= 0 ? 'up' : 'dn';
    holdHtml = `<div class="holding-row">
      <div class="holding-item"><span class="holding-label">持仓</span><span class="holding-value">¥${fmt0(f.amount)}</span></div>
      <div class="holding-item"><span class="holding-label">成本</span><span class="holding-value">${fmt4(f.cost)}</span></div>
      <div class="holding-item"><span class="holding-label">盈亏</span><span class="holding-value ${pcls}">${pnlAmt>=0?'+':''}¥${fmt0(pnlAmt)} (${pnlPct>=0?'+':''}${pnlPct.toFixed(2)}%)</span></div>
    </div>`;
  }

  const metricsHtml = c ? `
    <div class="metrics">
      <div class="metric"><div class="metric-label">日涨跌</div><div class="metric-value ${c.dailyReturn>=0?'up':'dn'}">${fmtPct(c.dailyReturn)}</div></div>
      <div class="metric"><div class="metric-label">区间涨跌</div><div class="metric-value ${c.periodReturn>=0?'up':'dn'}">${fmtPct(c.periodReturn)}</div></div>
      <div class="metric"><div class="metric-label">近3日</div><div class="metric-value ${c.ret3>=0?'up':'dn'}">${fmtPct(c.ret3)}</div></div>
      <div class="metric"><div class="metric-label">近5日</div><div class="metric-value ${c.ret5>=0?'up':'dn'}">${fmtPct(c.ret5)}</div></div>
      <div class="metric"><div class="metric-label">连续天数</div><div class="metric-value ${c.consecutive>=0?'up':'dn'}">${c.consecutive>0?'+':''}${c.consecutive}天</div></div>
      <div class="metric"><div class="metric-label">ROC</div><div class="metric-value ${c.roc>=0?'up':'dn'}">${fmtPct(c.roc)}</div></div>
      <div class="metric"><div class="metric-label">波动率</div><div class="metric-value flat">${fmtPct(c.volatility)}</div></div>
      <div class="metric"><div class="metric-label">MA5</div><div class="metric-value">${c.ma5?fmt4(c.ma5):'--'}</div></div>
      <div class="metric"><div class="metric-label">MA20</div><div class="metric-value">${c.ma20?fmt4(c.ma20):'--'}</div></div>
    </div>` : '';

  const sgHtml = sg ? `<div class="suggestion-row" style="background:${sg.bgColor}">
    <span class="suggestion-badge ${sg.cls}">${sg.label}</span>
    <span class="badge-score">评分: ${c.score.toFixed(2)}</span>
    <span class="action-text">${sg.actionText}</span>
  </div>` : '';

  const periodTabsHtml = `<div class="period-tabs">
    ${['w1','1m','3m','6m'].map(p =>
      `<button class="period-tab${p===currentPeriod?' active':''}" onclick="switchPeriod('${p}','${code}')">${{w1:'1周','1m':'1月','3m':'3月','6m':'6月'}[p]}</button>`
    ).join('')}
  </div>`;

  const cardBorderStyle = sg ? `border-left: 4px solid ${sg.borderColor};` : '';

  return `<div class="card" id="card-${code}" style="${cardBorderStyle}">
    <div class="card-header">
      <input type="checkbox" class="card-checkbox" id="chk-${code}" onchange="toggleBatchSelect('${code}')">
      <div class="card-info">
        <div class="card-name">${escHtml(name)}</div>
        <div class="card-code">${code}</div>
      </div>
      <div class="card-nav">
        <div class="nav-value ${navCls}">${navVal}</div>
        <div class="nav-date">${navDate}</div>
      </div>
      <div class="card-actions">
        <button class="btn-icon" title="编辑" onclick="openEditModal('${code}')">✏️</button>
      </div>
    </div>

    ${rt ? `<div class="realtime-row">
      <span class="rt-label">实时估值</span>
      <span class="rt-value ${rtCls}">${rtVal}</span>
      <span class="rt-value ${rtCls}" style="font-size:.85rem;margin-left:4px">${rtPct !== '--' ? (parseFloat(rtPct)>=0?'+':'')+rtPct+'%' : ''}</span>
      <span class="rt-time">${rtTime}</span>
    </div>` : ''}

    ${metricsHtml}
    ${sgHtml}
    ${periodTabsHtml}
    ${holdHtml}

    <div class="chart-wrap">
      <canvas id="chart-${code}" class="fund-chart" height="200"></canvas>
      <div class="chart-legend">
        <div class="legend-item"><div class="legend-dot" style="background:#faad14;border-top:2px dashed #faad14;height:0"></div><span>MA5</span></div>
        <div class="legend-item"><div class="legend-dot" style="background:#1890ff;border-top:2px dashed #1890ff;height:0"></div><span>MA20</span></div>
        <div class="legend-item"><div class="legend-dot" style="background:#e53935"></div><span>净值</span></div>
      </div>
    </div>

    <button class="nav-toggle" onclick="toggleNavTable('${code}')">📋 展开净值明细</button>
    <div id="navtable-${code}" style="display:none"></div>
  </div>`;
}

function switchPeriod(period, code) {
  currentPeriod = period;
  // Re-render all cards with new period
  const codes = Object.keys(funds);
  const computed = {};
  codes.forEach(c => {
    const trend = fundData[c] && fundData[c].hist && fundData[c].hist.trend;
    computed[c] = calcIndicators(trend, currentPeriod);
  });
  renderCards(computed);
  updateSummary(computed);
}

function toggleNavTable(code) {
  const wrap = document.getElementById('navtable-' + code);
  if (!wrap) return;
  if (wrap.style.display !== 'none') {
    wrap.style.display = 'none';
    return;
  }
  const trend = fundData[code] && fundData[code].hist && fundData[code].hist.trend;
  if (!trend || !trend.length) { wrap.innerHTML = '<p style="padding:8px 16px;color:#888;font-size:.8rem">暂无数据</p>'; wrap.style.display='block'; return; }
  const pts = filterTrend(trend, currentPeriod).slice(-30).reverse();
  wrap.innerHTML = `<div class="nav-table-wrap"><table class="nav-table">
    <thead><tr><th>日期</th><th>净值</th><th>日涨跌</th></tr></thead>
    <tbody>${pts.map((p,i) => {
      const prev = pts[i+1];
      const chg = prev ? ((p.y - prev.y) / prev.y * 100) : 0;
      return `<tr><td>${new Date(p.x).toLocaleDateString('zh-CN')}</td><td>${fmt4(p.y)}</td><td class="${chg>=0?'up':'dn'}">${chg>=0?'+':''}${chg.toFixed(2)}%</td></tr>`;
    }).join('')}</tbody>
  </table></div>`;
  wrap.style.display = 'block';
}

// ============================================================
// SUMMARY BAR
// ============================================================
function updateSummary(computed) {
  const codes = Object.keys(funds);
  let buy=0, hold=0, sell=0, totalPnl=0, hasPnl=false;

  codes.forEach(code => {
    const c = computed && computed[code];
    if (!c) return;
    const sg = getSuggestion(c.score);
    if (sg.label.includes('买') || sg.label.includes('加仓')) buy++;
    else if (sg.label === '观望') hold++;
    else sell++;

    const f = funds[code];
    if (f.amount > 0 && f.cost > 0) {
      totalPnl += f.amount * (c.nav - f.cost) / f.cost;
      hasPnl = true;
    }
  });

  document.getElementById('sumTotal').textContent = codes.length;
  document.getElementById('sumBuy').textContent   = buy;
  document.getElementById('sumHold').textContent  = hold;
  document.getElementById('sumSell').textContent  = sell;

  const pnlEl = document.getElementById('sumPnl');
  if (hasPnl) {
    pnlEl.textContent = (totalPnl >= 0 ? '+' : '') + '¥' + fmt0(totalPnl);
    pnlEl.className = 'summary-value summary-pnl ' + (totalPnl >= 0 ? 'pos' : 'neg');
  } else {
    pnlEl.textContent = '--';
    pnlEl.className = 'summary-value summary-pnl';
  }
}
