// ============================================================
// CONSTANTS & STATE
// ============================================================
const DEFAULT_CODES = ['015740','017470','161226','023551'];
const LS_CODES = 'afm_codes';
const LS_FUNDS = 'afm_funds';
const LS_KEY   = 'afm_dskey';
const FETCH_TIMEOUT_MS = 12000;
const DEEPSEEK_MODEL   = 'deepseek-chat';
const SCORE_W_PERIOD = 0.35, SCORE_W_RET5 = 0.25, SCORE_W_CONSEC = 0.8, SCORE_W_ROC = 0.15;

let funds = {};      // code -> {code,name,amount,cost}
let fundData = {};   // code -> computed data
let currentPeriod = '1m';
let timerRunning = false;
let timerHandle = null;
let nextRunTime = null;
let editingCode = null;
let searchTimer = null;
let isAnalyzing = false;
let batchSelected = new Set();

// ============================================================
// INIT
// ============================================================
function init() {
  loadFundsFromLS();
  loadApiKey();
  renderClock();
  setInterval(renderClock, 1000);
  renderCards();
  updateSummary();
}

function loadFundsFromLS() {
  const codes = JSON.parse(localStorage.getItem(LS_CODES) || 'null') || DEFAULT_CODES;
  const saved  = JSON.parse(localStorage.getItem(LS_FUNDS) || '{}');
  funds = {};
  codes.forEach(c => {
    funds[c] = saved[c] || {code:c, name:c, amount:0, cost:0};
  });
}

function saveFundsToLS() {
  localStorage.setItem(LS_CODES, JSON.stringify(Object.keys(funds)));
  localStorage.setItem(LS_FUNDS, JSON.stringify(funds));
}

function loadApiKey() {
  const k = localStorage.getItem(LS_KEY) || '';
  document.getElementById('apiKeyInput').value = k;
  updateKeyStatus(k);
}

function saveApiKey() {
  const k = document.getElementById('apiKeyInput').value.trim();
  localStorage.setItem(LS_KEY, k);
  updateKeyStatus(k);
}

function updateKeyStatus(k) {
  const st = k ? '✅ 已设置' : '❌ 未设置';
  document.getElementById('keyStatus').textContent = st;
  document.getElementById('keyStatusInline').textContent = k ? '✅ Key已保存' : '';
}

// ============================================================
// CLOCK & TRADE STATUS
// ============================================================
function renderClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('zh-CN');
  const h = now.getHours(), m = now.getMinutes();
  const day = now.getDay();
  const isWeekday = day >= 1 && day <= 5;
  const isMorning = (h === 9 && m >= 30) || (h >= 10 && h < 11) || (h === 11 && m <= 30);
  const isAfternoon = (h >= 13 && h < 15) || (h === 15 && m === 0);
  const isOpen = isWeekday && (isMorning || isAfternoon);
  const badge = document.getElementById('tradeBadge');
  badge.textContent = isOpen ? '交易中' : '已收盘';
  badge.className = 'trade-badge ' + (isOpen ? 'trade-open' : 'trade-closed');
}

// ============================================================
// TIMER
// ============================================================
function toggleTimer() {
  timerRunning = !timerRunning;
  const btn = document.getElementById('timerBtn');
  if (timerRunning) {
    btn.textContent = '⏸ 关闭';
    btn.className = 'btn-timer on';
    scheduleNext();
  } else {
    btn.textContent = '▶ 开启';
    btn.className = 'btn-timer off';
    clearTimeout(timerHandle);
    document.getElementById('nextTime').textContent = '';
  }
}

function scheduleNext() {
  if (!timerRunning) return;
  const mins = parseInt(document.getElementById('timerInterval').value);
  const ms = mins * 60 * 1000;
  nextRunTime = Date.now() + ms;
  clearTimeout(timerHandle);
  timerHandle = setTimeout(() => { startAnalysis(); scheduleNext(); }, ms);
  updateNextTime();
}

function updateNextTime() {
  if (!timerRunning || !nextRunTime) return;
  const rem = Math.max(0, Math.round((nextRunTime - Date.now()) / 1000));
  const mm = String(Math.floor(rem / 60)).padStart(2,'0');
  const ss = String(rem % 60).padStart(2,'0');
  document.getElementById('nextTime').textContent = `下次: ${mm}:${ss}`;
  setTimeout(updateNextTime, 1000);
}

// ============================================================
// FUND MANAGEMENT
// ============================================================
function addFundFromInput() {
  const val = document.getElementById('codeInput').value.trim();
  if (!val) { showToast('请输入基金代码'); return; }

  // If exactly 6 digits, add directly
  if (/^\d{6}$/.test(val)) {
    if (funds[val]) { showToast('该基金已添加'); return; }
    funds[val] = {code: val, name: val, amount: 0, cost: 0};
    saveFundsToLS();
    document.getElementById('codeInput').value = '';
    document.getElementById('searchDropdown').classList.remove('show');
    renderCards();
    updateSummary();
    showToast('已添加 ' + val);
    return;
  }

  // If dropdown is visible, auto-select first item
  const dropdown = document.getElementById('searchDropdown');
  if (dropdown.classList.contains('show') && dropdown.querySelector('.search-item')) {
    dropdown.querySelector('.search-item').click();
    return;
  }

  // Otherwise trigger search and prompt user
  doSearch(val);
  showToast('请从下拉列表中选择基金');
}

function removeFund() {
  if (!editingCode) return;
  if (!confirm('确认删除 ' + editingCode + '？')) return;
  delete funds[editingCode];
  delete fundData[editingCode];
  batchSelected.delete(editingCode);
  saveFundsToLS();
  closeModal();
  renderCards();
  updateSummary();
  updateBatchToolbar();
  showToast('已删除');
}

function openEditModal(code) {
  editingCode = code;
  const f = code ? funds[code] : null;
  document.getElementById('mCode').value = f ? f.code : '';
  document.getElementById('mName').value = f ? (f.name || f.code) : '';
  document.getElementById('mAmount').value = f ? (f.amount || '') : '';
  document.getElementById('mCost').value = f ? (f.cost || '') : '';
  document.getElementById('modalTitle').textContent = f ? '编辑持仓 - ' + (f.name || f.code) : '管理基金';
  document.getElementById('modalOverlay').style.display = 'flex';
}

function saveModal() {
  if (!editingCode) { closeModal(); return; }
  funds[editingCode].amount = parseFloat(document.getElementById('mAmount').value) || 0;
  funds[editingCode].cost   = parseFloat(document.getElementById('mCost').value)   || 0;
  saveFundsToLS();
  closeModal();
  renderCards();
  updateSummary();
  showToast('已保存');
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').style.display = 'none';
  editingCode = null;
}

// ============================================================
// BATCH SELECT & DELETE
// ============================================================
function toggleBatchSelect(code) {
  if (batchSelected.has(code)) {
    batchSelected.delete(code);
  } else {
    batchSelected.add(code);
  }
  updateBatchToolbar();
}

function toggleSelectAll() {
  const codes = Object.keys(funds);
  if (batchSelected.size === codes.length) {
    batchSelected.clear();
    codes.forEach(c => {
      const chk = document.getElementById('chk-' + c);
      if (chk) chk.checked = false;
    });
  } else {
    batchSelected = new Set(codes);
    codes.forEach(c => {
      const chk = document.getElementById('chk-' + c);
      if (chk) chk.checked = true;
    });
  }
  updateBatchToolbar();
}

function updateBatchToolbar() {
  const toolbar = document.getElementById('batchToolbar');
  if (batchSelected.size > 0) {
    toolbar.classList.add('show');
    document.getElementById('batchCount').textContent = '已选 ' + batchSelected.size + ' 只';
  } else {
    toolbar.classList.remove('show');
  }
}

function batchDelete() {
  if (batchSelected.size === 0) return;
  if (!confirm('确认删除已选的 ' + batchSelected.size + ' 只基金？')) return;
  batchSelected.forEach(code => {
    delete funds[code];
    delete fundData[code];
  });
  batchSelected.clear();
  saveFundsToLS();
  updateBatchToolbar();
  renderCards();
  updateSummary();
  showToast('已批量删除');
}

// ============================================================
// SEARCH
// ============================================================
function onSearchInput() {
  clearTimeout(searchTimer);
  const v = document.getElementById('codeInput').value.trim();
  if (!v) { document.getElementById('searchDropdown').classList.remove('show'); return; }
  if (/^\d{6}$/.test(v)) { document.getElementById('searchDropdown').classList.remove('show'); return; }
  searchTimer = setTimeout(() => doSearch(v), 400);
}

function onSearchKey(e) {
  if (e.key === 'Enter') addFundFromInput();
}

function doSearch(kw) {
  const cb = 'afm_search_' + Date.now();
  const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(kw)}&callback=${cb}`;
  loadScript(url, cb, (data) => {
    const items = data && data.Datas ? data.Datas : [];
    renderSearchDropdown(items.slice(0,8));
  }, () => {
    document.getElementById('searchDropdown').classList.remove('show');
  }, 8000);
}

function renderSearchDropdown(items) {
  const dd = document.getElementById('searchDropdown');
  if (!items.length) { dd.classList.remove('show'); return; }
  dd.innerHTML = items.map(it =>
    `<div class="search-item" onclick="selectSearch('${it.CODE}','${escHtml(it.NAME)}')">
      ${escHtml(it.NAME)}<span class="code">${it.CODE}</span>
    </div>`
  ).join('');
  dd.classList.add('show');
}

function selectSearch(code, name) {
  document.getElementById('codeInput').value = code;
  document.getElementById('searchDropdown').classList.remove('show');
  if (!funds[code]) {
    funds[code] = {code, name, amount:0, cost:0};
    saveFundsToLS();
    renderCards();
    updateSummary();
    showToast('已添加 ' + name);
  } else {
    showToast('已存在: ' + name);
  }
}

document.addEventListener('click', e => {
  if (!document.getElementById('codeInput').contains(e.target)) {
    document.getElementById('searchDropdown').classList.remove('show');
  }
});

// ============================================================
// SCRIPT LOADER (JSONP helper)
// ============================================================
function loadScript(url, callbackName, onSuccess, onError, timeout) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    let done = false;
    const tid = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      if (onError) onError(new Error('timeout'));
      reject(new Error('timeout'));
    }, timeout || FETCH_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(tid);
      if (s.parentNode) s.parentNode.removeChild(s);
      if (callbackName && window[callbackName] === handler) delete window[callbackName];
    }

    function handler(data) {
      if (done) return;
      done = true;
      cleanup();
      if (onSuccess) onSuccess(data);
      resolve(data);
    }

    if (callbackName) window[callbackName] = handler;

    s.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      if (onError) onError(new Error('load error'));
      reject(new Error('load error'));
    };

    if (!callbackName) {
      s.onload = () => {
        if (done) return;
        done = true;
        cleanup();
        if (onSuccess) onSuccess();
        resolve();
      };
    }

    s.src = url;
    document.head.appendChild(s);
  });
}

// ============================================================
// TEXT IMPORT (粘贴文本提取基金代码)
// ============================================================
function parseTextImport() {
  const text = document.getElementById('ocrText').value;
  if (!text.trim()) { showToast('请粘贴包含基金代码的文本'); return; }

  // 提取所有6位数字作为基金代码
  const codeMatches = text.match(/\b\d{6}\b/g) || [];
  const seen = {};
  const uniqueCodes = [];
  codeMatches.forEach(c => {
    if (!seen[c]) { seen[c] = true; uniqueCodes.push(c); }
  });

  // 尝试提取代码后面跟着的金额
  const amountMap = {};
  uniqueCodes.forEach(code => {
    const regex = new RegExp(code + '[^\\d]*([\\d,]+(?:\\.\\d+)?)\\s*(元|¥)?');
    const m = regex.exec(text);
    if (m && m[1]) amountMap[code] = parseFloat(m[1].replace(/,/g, ''));
  });

  let added = 0;
  uniqueCodes.forEach(code => {
    if (!funds[code]) {
      funds[code] = {code, name: code, amount: amountMap[code] || 0, cost: 0};
      added++;
    } else if (amountMap[code]) {
      funds[code].amount = amountMap[code];
    }
  });

  saveFundsToLS();
  renderCards();
  updateSummary();

  const resultEl = document.getElementById('ocrResult');
  if (uniqueCodes.length === 0) {
    resultEl.textContent = '未找到6位基金代码，请检查文本内容';
  } else {
    resultEl.textContent = '✅ 找到 ' + uniqueCodes.length + ' 个代码，新增 ' + added + ' 只：' + uniqueCodes.join(', ');
    showToast('导入完成，新增 ' + added + ' 只');
  }
}

// ============================================================
// UTILS
// ============================================================
function fmt4(v) { return v != null ? parseFloat(v).toFixed(4) : '--'; }
function fmt0(v) { return v != null ? Math.round(v).toLocaleString() : '--'; }
function fmtPct(v) { return v != null ? (v>=0?'+':'')+v.toFixed(2)+'%' : '--'; }
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, duration) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), duration || 2500);
}

// ============================================================
// BOOT
// ============================================================
window.addEventListener('DOMContentLoaded', init);
