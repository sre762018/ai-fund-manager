// ============================================================
// PERIOD FILTER
// ============================================================
function getPeriodDays(p) {
  return {w1:7, '1m':30, '3m':90, '6m':180}[p] || 30;
}

function filterTrend(trend, period) {
  if (!trend || !trend.length) return [];
  const days = getPeriodDays(period);
  const cutoff = Date.now() - days * 86400000;
  return trend.filter(d => d.x >= cutoff);
}

// ============================================================
// INDICATOR CALCULATION
// ============================================================
function calcIndicators(trend, period) {
  const pts = filterTrend(trend, period);
  if (!pts || pts.length < 2) return null;

  const navs = pts.map(p => p.y);
  const n = navs.length;

  // Period return
  const periodReturn = n >= 2 ? ((navs[n-1] - navs[0]) / navs[0]) * 100 : 0;

  // Daily return (last day)
  const dailyReturn = n >= 2 ? ((navs[n-1] - navs[n-2]) / navs[n-2]) * 100 : 0;

  // 3-day return
  const ret3 = n >= 4 ? ((navs[n-1] - navs[n-4]) / navs[n-4]) * 100 : dailyReturn;

  // 5-day return
  const ret5 = n >= 6 ? ((navs[n-1] - navs[n-6]) / navs[n-6]) * 100 : periodReturn;

  // Consecutive days
  let consecutive = 0;
  if (n >= 2) {
    const dir = navs[n-1] >= navs[n-2] ? 1 : -1;
    for (let i = n-1; i >= 1; i--) {
      if ((navs[i] - navs[i-1]) * dir >= 0) consecutive++;
      else break;
    }
    consecutive *= dir;
  }

  // ROC (Rate of Change, 5-day)
  const roc = n >= 6 ? ((navs[n-1] - navs[n-6]) / navs[n-6]) * 100 : 0;

  // Volatility (std dev of daily returns)
  const dailyRets = [];
  for (let i = 1; i < navs.length; i++) {
    dailyRets.push((navs[i] - navs[i-1]) / navs[i-1] * 100);
  }
  const mean = dailyRets.reduce((a,b) => a+b, 0) / dailyRets.length;
  const variance = dailyRets.reduce((a,b) => a + (b-mean)**2, 0) / dailyRets.length;
  const volatility = Math.sqrt(variance);

  // MA5 / MA20
  function ma(arr, len) {
    if (arr.length < len) return null;
    return arr.slice(-len).reduce((a,b)=>a+b,0) / len;
  }
  const ma5  = ma(navs, 5);
  const ma10 = ma(navs, 10);
  const ma20 = ma(navs, 20);

  // Score
  let score = periodReturn * SCORE_W_PERIOD + ret5 * SCORE_W_RET5 + consecutive * SCORE_W_CONSEC + roc * SCORE_W_ROC;
  if (ma5 !== null && ma20 !== null) {
    score += ma5 > ma20 ? 0.5 : -0.5;
  }

  return {
    periodReturn, dailyReturn, ret3, ret5,
    consecutive, roc, volatility,
    ma5, ma10, ma20, score,
    nav: navs[n-1],
    navDate: pts[n-1].x,
    navPrev: navs[n-2] || navs[n-1]
  };
}

function getSuggestion(score) {
  if (score < -6) return {label:'强烈加仓', cls:'badge-strong-buy', color:'#52c41a', borderColor:'#1b5e20', bgColor:'rgba(27,94,32,0.07)', actionText:'建议操作：加仓 30%~50%'};
  if (score < -3) return {label:'买入',     cls:'badge-buy',        color:'#73d13d', borderColor:'#388e3c', bgColor:'rgba(56,142,60,0.07)', actionText:'建议操作：加仓 10%~20%'};
  if (score <  3) return {label:'观望',     cls:'badge-hold',       color:'#faad14', borderColor:'#f57c00', bgColor:'rgba(245,124,0,0.07)',  actionText:'建议操作：维持现仓'};
  if (score <  6) return {label:'卖出',     cls:'badge-sell',       color:'#ff7875', borderColor:'#c62828', bgColor:'rgba(198,40,40,0.07)',  actionText:'建议操作：减仓 10%~20%'};
  return               {label:'大幅减仓', cls:'badge-strong-sell', color:'#f5222d', borderColor:'#880e4f', bgColor:'rgba(136,14,79,0.07)',  actionText:'建议操作：减仓 20%~30%'};
}

// ============================================================
// MAIN ANALYSIS FLOW
// ============================================================
async function startAnalysis() {
  if (isAnalyzing) return;
  const codes = Object.keys(funds);
  if (!codes.length) { showToast('请先添加基金'); return; }

  isAnalyzing = true;
  document.getElementById('analyzeBtn').disabled = true;
  document.getElementById('stepsRow').style.display = 'flex';
  document.getElementById('progressWrap').classList.add('show');
  setStep(0);
  setProgress(5, '正在拉取基金数据...');

  // Step 1: Fetch data
  const total = codes.length;
  for (let i = 0; i < total; i++) {
    const code = codes[i];
    setProgress(5 + Math.round(i / total * 40), `拉取 ${code} (${i+1}/${total})...`);
    try {
      const [hist, rt] = await Promise.all([
        fetchHistory(code),
        fetchRealtime(code)
      ]);
      if (hist && hist.name) {
        funds[code].name = hist.name;
      }
      fundData[code] = {hist, rt};
    } catch(e) {
      fundData[code] = {hist:null, rt:null};
    }
  }
  saveFundsToLS();

  // Step 2: Calc indicators
  setStep(1);
  setProgress(50, '计算技术指标...');
  await delay(300);

  const computed = {};
  codes.forEach(code => {
    const {hist} = fundData[code] || {};
    const trend = hist && hist.trend;
    computed[code] = calcIndicators(trend, currentPeriod);
  });

  setProgress(65, '渲染卡片...');
  await delay(100);
  renderCards(computed);
  updateSummary(computed);

  // Step 3: AI analysis
  setStep(2);
  setProgress(70, '准备AI分析...');

  const apiKey = localStorage.getItem(LS_KEY) || '';
  if (!apiKey) {
    setProgress(100, 'AI分析已跳过（未设置Key）');
    showToast('数据已更新，未设置DeepSeek Key，跳过AI分析');
    document.getElementById('keyDetails').open = true;
  } else {
    setProgress(75, 'AI深度分析中...');
    document.getElementById('aiPanel').style.display = 'block';
    document.getElementById('aiContent').textContent = '';
    await runAiAnalysis(codes, computed, apiKey);
    setProgress(100, 'AI分析完成');
  }

  setStepDone(2);
  await delay(1500);
  document.getElementById('stepsRow').style.display = 'none';
  document.getElementById('progressWrap').classList.remove('show');
  isAnalyzing = false;
  document.getElementById('analyzeBtn').disabled = false;
}

function setStep(n) {
  for (let i=0; i<3; i++) {
    const el = document.getElementById('step'+i);
    el.className = 'step' + (i < n ? ' done' : i === n ? ' active' : '');
  }
  if (n > 0) document.getElementById('line01').className = 'step-line' + (n > 1 ? ' done' : '');
  if (n > 1) document.getElementById('line12').className = 'step-line done';
}

function setStepDone(n) {
  document.getElementById('step'+n).className = 'step done';
}

function setProgress(pct, txt) {
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = txt;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// AI ANALYSIS
// ============================================================
async function runAiAnalysis(codes, computed, apiKey) {
  const userMsg = buildUserPrompt(codes, computed);

  const systemPrompt = `你是一位拥有20年实战经验的资深基金经理，曾管理过百亿级基金规模，擅长技术分析、趋势判断和仓位管理。你的分析风格：
1. 不做简单的阈值判断（不是涨了5%就喊卖、跌了5%就喊买）
2. 会分析趋势的持续性：如果一只基金刚启动上涨趋势（连涨2-3天但动量仍在增强），你会建议继续持有甚至加仓，而不是急着卖
3. 会结合多个维度：连续涨跌天数、动量变化、均线关系(MA5/MA10/MA20)、波动率、历史走势形态
4. 核心策略是"越涨越卖，越跌越买"，但执行时讲究节奏和时机
5. 会给出具体的操作金额或比例建议，而不是模糊的"适当买入"
6. 会关注趋势拐点信号：如连续下跌后首次翻红、连涨后动量衰减等
注意：你的分析仅供参考，不构成投资建议。`;

  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        stream: true,
        messages: [
          {role:'system', content: systemPrompt},
          {role:'user',   content: userMsg}
        ]
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      document.getElementById('aiContent').textContent = '❌ API错误: ' + resp.status + ' ' + err;
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aiEl = document.getElementById('aiContent');

    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream:true});
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
          if (delta) {
            aiEl.textContent += delta;
            aiEl.scrollTop = aiEl.scrollHeight;
          }
        } catch(_) {}
      }
    }
  } catch(e) {
    document.getElementById('aiContent').textContent = '❌ 请求失败: ' + e.message;
  }
}

function buildUserPrompt(codes, computed) {
  const today = new Date().toLocaleDateString('zh-CN');
  let msg = `请对以下基金组合进行深度分析（数据日期：${today}）。\n\n`;

  codes.forEach(code => {
    const f = funds[code];
    const c = computed[code];
    const rt = fundData[code] && fundData[code].rt;
    msg += `【${f.name || code}】(${code})\n`;
    if (c) {
      msg += `  最新净值: ${fmt4(c.nav)} (${new Date(c.navDate).toLocaleDateString('zh-CN')})\n`;
      msg += `  日涨跌: ${fmtPct(c.dailyReturn)}\n`;
      msg += `  区间涨跌(${currentPeriod}): ${fmtPct(c.periodReturn)}\n`;
      msg += `  近3日: ${fmtPct(c.ret3)}  近5日: ${fmtPct(c.ret5)}\n`;
      msg += `  连续${c.consecutive > 0 ? '上涨' : '下跌'}${Math.abs(c.consecutive)}天\n`;
      msg += `  ROC: ${fmtPct(c.roc)}  波动率: ${fmtPct(c.volatility)}\n`;
      if (c.ma5) msg += `  MA5: ${fmt4(c.ma5)}  MA20: ${c.ma20 ? fmt4(c.ma20) : 'N/A'}\n`;
      msg += `  综合评分: ${c.score.toFixed(2)}  建议: ${getSuggestion(c.score).label}\n`;
    }
    if (rt) {
      msg += `  实时估值: ${rt.gsz || '--'}  估算涨幅: ${rt.gszzl || '--'}%\n`;
    }
    if (f.amount > 0) {
      msg += `  持仓金额: ¥${f.amount}  成本净值: ${f.cost || '未设置'}\n`;
      if (c && f.cost > 0) {
        const pnlPct = (c.nav - f.cost) / f.cost * 100;
        const pnlAmt = f.amount * (c.nav - f.cost) / f.cost;
        msg += `  当前盈亏: ${fmtPct(pnlPct)} (${pnlAmt >= 0 ? '+' : ''}¥${pnlAmt.toFixed(0)})\n`;
      }
    }
    msg += '\n';
  });

  msg += `请按以下结构输出分析：
1. 大盘环境判断（结合各基金涨跌情况推断市场风格）
2. 逐只基金深度分析（走势判断/预判方向/具体操作建议/关键价位）
3. 组合整体建议（仓位分配/风险平衡）
4. 今日操作清单（具体金额或比例，可执行的操作步骤）`;

  return msg;
}
