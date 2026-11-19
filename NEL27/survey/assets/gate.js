/**
 * 설문 공개 여부 판단 (index·설문 페이지·관리 페이지 공통)
 *  - 관리자 설정(GAS): open = 지금 열기 / closed = 닫기 / auto = config 의 openAt 시각대로
 *  - GAS 상태를 못 불러오면 openAt 시각 기준으로만 판단
 */
window.SurveyGate = (function () {
  const C = window.SURVEY_CONFIG;
  let cache = {};

  async function load() {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      const j = await (await fetch(C.GAS_URL + '?action=status&t=' + Date.now(), { signal: ctl.signal })).json();
      clearTimeout(timer);
      if (j.ok && j.status) cache = j.status;
    } catch (e) { /* 실패 시 직전 값 또는 예약 시각 기준 */ }
    return cache;
  }

  const mode = k => cache[k] || 'auto';

  function isOpen(k) {
    const m = mode(k);
    if (m === 'open') return true;
    if (m === 'closed') return false;
    const at = C.surveys[k] && C.surveys[k].openAt;
    return !at || Date.now() >= new Date(at).getTime();
  }

  function when(k) {
    const at = C.surveys[k] && C.surveys[k].openAt;
    if (!at) return '';
    return new Date(at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
  }

  // 닫혀 있을 때 안내 문구
  function closedText(k) {
    if (mode(k) === 'closed') return '현재 응답을 받지 않는 설문입니다.';
    const w = when(k);
    return w ? `${w} 에 열립니다.` : '아직 열리지 않은 설문입니다.';
  }

  return { load, isOpen, mode, when, closedText };
})();
