// ============================================================
// DATA FETCHING
// ============================================================

async function fetchRealtime(code) {
  const cb = 'jsonpgz';
  const prev = window[cb];
  return new Promise((resolve) => {
    const url = `https://fundgz.1234567.com.cn/js/${code}.js?callback=${cb}&_=${Date.now()}`;
    let done = false;
    const tid = setTimeout(() => {
      if (done) return;
      done = true;
      window[cb] = prev;
      if (s.parentNode) s.parentNode.removeChild(s);
      resolve(null);
    }, FETCH_TIMEOUT_MS);

    const s = document.createElement('script');
    window[cb] = (data) => {
      if (done) return;
      done = true;
      clearTimeout(tid);
      window[cb] = prev;
      if (s.parentNode) s.parentNode.removeChild(s);
      resolve(data);
    };
    s.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(tid);
      window[cb] = prev;
      if (s.parentNode) s.parentNode.removeChild(s);
      resolve(null);
    };
    s.src = url;
    document.head.appendChild(s);
  });
}

async function fetchHistory(code) {
  return new Promise((resolve) => {
    // Save globals we might overwrite
    const savedVars = {};
    const GLOBALS = ['fS_name','fS_code','Data_netWorthTrend','Data_grandTotal',
                     'Data_rateInSimilarType','Data_performanceEvaluation'];
    GLOBALS.forEach(k => { savedVars[k] = window[k]; delete window[k]; });

    const url = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`;
    const s = document.createElement('script');
    let done = false;
    const tid = setTimeout(() => {
      if (done) return;
      done = true;
      if (s.parentNode) s.parentNode.removeChild(s);
      GLOBALS.forEach(k => { window[k] = savedVars[k]; });
      resolve(null);
    }, FETCH_TIMEOUT_MS);

    s.onload = () => {
      if (done) return;
      done = true;
      clearTimeout(tid);
      if (s.parentNode) s.parentNode.removeChild(s);
      const result = {
        name: window['fS_name'],
        code: window['fS_code'],
        trend: window['Data_netWorthTrend'],
        grandTotal: window['Data_grandTotal']
      };
      GLOBALS.forEach(k => { window[k] = savedVars[k]; });
      resolve(result);
    };
    s.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(tid);
      if (s.parentNode) s.parentNode.removeChild(s);
      GLOBALS.forEach(k => { window[k] = savedVars[k]; });
      resolve(null);
    };
    s.src = url;
    document.head.appendChild(s);
  });
}
