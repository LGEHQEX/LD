(function () {
  const C = window.SURVEY_CONFIG;
  const KEYS = Object.keys(C.surveys);
  const params = new URLSearchParams(location.search);
  const DEMO = params.has('demo') || /여기에_배포ID/.test(C.GAS_URL);
  const scaleOf = q => Array.isArray(q.scale) ? q.scale : (C.SCALES[q.scale || 'agree'] || C.SCALES.agree);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => (Math.round(n * 100) / 100).toFixed(2);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const fmtTime = d => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };

  let DATA = null, tab = (location.hash.slice(1) || 'overview'), timer = null, left = C.REFRESH_SEC;
  const $ = id => document.getElementById(id);

  document.title = '설문 대시보드 | ' + C.COURSE_NAME;
  $('course').textContent = C.COURSE_NAME;
  if (DEMO) $('demo').hidden = false;

  /* ───── 데이터 ───── */
  async function load() {
    try {
      let raw;
      if (DEMO) raw = demoData();
      else {
        const u = C.GAS_URL + '?action=data' + (params.get('key') ? '&key=' + encodeURIComponent(params.get('key')) : '') + '&t=' + Date.now();
        const j = await (await fetch(u)).json();
        if (!j.ok) throw new Error(j.error);
        raw = j.data;
      }
      DATA = process(raw);
      $('dot').classList.remove('err');
      $('updated').textContent = '업데이트 ' + new Date().toLocaleTimeString('ko-KR');
      draw();
    } catch (e) {
      $('dot').classList.add('err');
      $('updated').textContent = '불러오기 실패: ' + e.message;
    }
    left = C.REFRESH_SEC;
  }

  function process(raw) {
    const out = {};
    KEYS.forEach(k => {
      const S = C.surveys[k], d = raw[k] || { headers: [], rows: [] };
      const rows = d.rows.filter(r => r.some(v => v !== '' && v != null));
      const ts = rows.map(r => r[0]);
      let no = 0;
      const qs = S.questions.filter(q => q.type !== 'section').map(q => {
        if (!q.identity && !(q.type === 'multi' && q.max)) q = { ...q, no: ++no };
        const i = d.headers.indexOf(q.label);
        const vals = i < 0 ? [] : rows.map((r, ri) => ({ v: r[i], t: ts[ri] })).filter(x => x.v !== '' && x.v != null);
        return { ...q, vals, col: i };
      });
      const roster = rows.map(r => ({ t: r[0], ids: qs.filter(q => q.identity).map(q => (q.col < 0 ? '' : r[q.col])) }));
      const likerts = qs.filter(q => q.type === 'likert').flatMap(q => q.vals.map(x => Number(x.v))).filter(n => n >= 1);
      out[k] = {
        S, n: rows.length, qs, roster,
        avg: likerts.length ? likerts.reduce((a, b) => a + b, 0) / likerts.length : null,
        last: ts.length ? ts.reduce((a, b) => (new Date(a) > new Date(b) ? a : b)) : null,
      };
    });
    return out;
  }

  /* ───── 렌더 ───── */
  function draw() {
    $('tabs').innerHTML = [['overview', '전체 요약', null], ...KEYS.map(k => [k, C.surveys[k].title, DATA[k].n])]
      .map(([k, t, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-k="${k}">${esc(t)}${n != null ? `<span class="cnt">${n}</span>` : ''}</button>`).join('');
    $('body').innerHTML = tab === 'overview' || !DATA[tab] ? overview() : survey(DATA[tab]);
  }

  function overview() {
    const kpis = KEYS.map(k => {
      const d = DATA[k];
      return `<div class="card kpi"><div class="label">${esc(d.S.title)}</div>
        <div class="val">${d.n}<small>명</small></div>
        <div class="foot">${d.avg != null ? `척도 평균 <b>${fmt(d.avg)}</b> / 5` : '척도 문항 없음'}${d.last ? ` · 최근 ${fmtTime(d.last)}` : ''}</div></div>`;
    }).join('');

    const avgOf = q => q.vals.length ? q.vals.reduce((a, x) => a + Number(x.v), 0) / q.vals.length : null;
    const dayName = k => DATA[k].S.title.replace(/ ?설문$/, '');

    // 모듈별 만족도 (전 일차, 높은 순)
    const mods = KEYS.flatMap(k => DATA[k].qs.filter(q => q.module).map(q => ({ k, q, avg: avgOf(q) })))
      .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
    let cmp = '';
    if (mods.length) cmp += `<div class="card wide"><h3>모듈별 만족도</h3><div class="meta">5점 평균 · 높은 순</div>
      <table class="cmp"><thead><tr><th>일차</th><th>모듈</th><th>강사</th><th>응답</th><th>평균</th><th style="width:30%"></th></tr></thead><tbody>
      ${mods.map(m => `<tr><td>${esc(dayName(m.k))}</td><td>${esc(m.q.module.name)}</td><td>${esc(m.q.module.who)}</td><td>${m.q.vals.length}</td>
        <td class="n">${m.avg != null ? fmt(m.avg) : '-'}</td><td><div class="track" style="height:10px;background:#f0f1f3;border-radius:5px"><div class="fill" style="height:100%;border-radius:5px;background:var(--accent);width:${((m.avg || 0) / 5) * 100}%"></div></div></td></tr>`).join('')}
      </tbody></table></div>`;

    // 과정 만족도
    const course = KEYS.flatMap(k => DATA[k].qs.filter(q => q.course));
    if (course.length) cmp += `<div class="card wide"><h3>과정 만족도</h3><div class="meta">5점 평균 · 긍정(4~5점) 비율</div><div class="bars">
      ${course.map(q => { const a = avgOf(q); const top = q.vals.filter(x => Number(x.v) >= 4).length;
        return `<div class="bar"><span class="name" title="${esc(q.label)}">${esc(q.label)}</span><div class="track"><div class="fill" style="width:${((a || 0) / 5) * 100}%"></div></div>
        <span class="num"><b>${a != null ? fmt(a) : '-'}</b> · ${pct(top, q.vals.length)}%</span></div>`; }).join('')}</div></div>`;
    return `<div class="kpis">${kpis}</div><div class="grid">${cmp}</div>`;
  }

  function survey(d) {
    if (!d.n) return `<div class="card"><div class="empty">아직 응답이 없습니다.</div></div>`;
    const kpi = `<div class="kpis">
      <div class="card kpi"><div class="label">응답 수</div><div class="val">${d.n}<small>명</small></div><div class="foot">최근 제출 ${fmtTime(d.last)}</div></div>
      ${d.avg != null ? `<div class="card kpi"><div class="label">척도 문항 종합 평균</div><div class="val">${fmt(d.avg)}<small>/ 5</small></div><div class="foot">5점 환산 ${fmt(d.avg * 20)}점</div></div>` : ''}
    </div>`;
    return kpi + '<div class="grid">' + areaCard(d) + modCard(d) + d.qs.filter(q => !q.identity).map(q => qCard(q, d.n)).join('') + rosterCard(d) + '</div>';
  }

  // 일차 탭 상단: 모듈 만족도 요약
  function modCard(d) {
    const qs = d.qs.filter(q => q.module);
    if (!qs.length) return '';
    return `<div class="card wide"><h3>모듈 만족도 요약</h3><div class="meta">5점 평균 · 긍정(4~5점) 비율</div><div class="bars">
      ${qs.map(q => { const n = q.vals.length, a = n ? q.vals.reduce((s, x) => s + Number(x.v), 0) / n : 0, top = q.vals.filter(x => Number(x.v) >= 4).length;
        return `<div class="bar"><span class="name" title="${esc(q.module.name)}">${esc(q.module.name)}</span><div class="track"><div class="fill" style="width:${(a / 5) * 100}%"></div></div>
        <span class="num"><b>${n ? fmt(a) : '-'}</b> · ${pct(top, n)}%</span></div>`; }).join('')}</div></div>`;
  }

  // 요구 영역별 평균 (낮은 순 = 먼저 채워야 할 영역)
  function areaCard(d) {
    const m = new Map();
    d.qs.filter(q => q.type === 'likert' && q.area).forEach(q => {
      const a = m.get(q.area) || { sum: 0, n: 0, qs: [] };
      q.vals.forEach(x => { a.sum += Number(x.v); a.n++; }); a.qs.push('Q' + q.no); m.set(q.area, a);
    });
    if (m.size < 2) return '';
    const list = [...m].map(([k, a]) => ({ k, avg: a.n ? a.sum / a.n : 0, qs: a.qs })).sort((a, b) => a.avg - b.avg);
    return `<div class="card wide"><h3>요구 영역별 평균</h3><div class="meta">5점 평균 · 낮은 순 (보완이 필요한 영역부터)</div><div class="bars">
      ${list.map(x => `<div class="bar"><span class="name">${esc(x.k)} <small style="opacity:.6">${x.qs.join('·')}</small></span>
        <div class="track"><div class="fill" style="width:${(x.avg / 5) * 100}%"></div></div><span class="num"><b>${fmt(x.avg)}</b> / 5</span></div>`).join('')}</div></div>`;
  }

  function rosterCard(d) {
    const idq = d.qs.filter(q => q.identity);
    if (!idq.length) return '';
    const list = [...d.roster].sort((a, b) => new Date(b.t) - new Date(a.t));
    const key = r => r.ids.join('|');
    const cnt = list.reduce((m, r) => m.set(key(r), (m.get(key(r)) || 0) + 1), new Map());
    const dup = [...cnt.values()].filter(c => c > 1).length;
    return `<div class="card wide"><h3>응답자 명단</h3><div class="meta">${list.length}건${dup ? ` · <b style="color:var(--bad)">중복 제출 ${dup}명</b>` : ''}</div>
      <div class="texts" style="max-height:320px"><table class="cmp"><thead><tr>${idq.map(q => `<th>${esc(q.label)}</th>`).join('')}<th>제출시각</th></tr></thead><tbody>
      ${list.map(r => `<tr${cnt.get(key(r)) > 1 ? ' style="background:#fef2f2"' : ''}>${r.ids.map(v => `<td>${esc(v)}</td>`).join('')}<td>${fmtTime(r.t)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  const bar = (name, c, total) => `<div class="bar"><span class="name" title="${esc(name)}">${esc(name)}</span>
    <div class="track"><div class="fill" style="width:${pct(c, total)}%"></div></div><span class="num"><b>${c}</b> · ${pct(c, total)}%</span></div>`;

  function qCard(q, n) {
    const tag = [q.area, q.lgway && 'LG Way: ' + q.lgway].filter(Boolean).join(' · ');
    const head = `<h3>${q.no ? 'Q' + q.no + '. ' : ''}${esc(q.label)}</h3><div class="meta">${tag ? esc(tag) + ' · ' : ''}응답 ${q.vals.length}건</div>`;
    if (!q.vals.length) return `<div class="card">${head}<div class="empty">응답 없음</div></div>`;
    const total = q.vals.length;

    if (q.type === 'likert') {
      const sc = scaleOf(q);
      const cnt = [0, 0, 0, 0, 0]; let sum = 0;
      q.vals.forEach(x => { const v = Number(x.v); if (v >= 1 && v <= 5) { cnt[v - 1]++; sum += v; } });
      const top2 = pct(cnt[3] + cnt[4], total);
      return `<div class="card">${head}<div class="avg"><b>${fmt(sum / total)}</b><span>/ 5 · 긍정(4~5점) ${top2}%</span></div>
        <div class="bars">${[5, 4, 3, 2, 1].map(v => bar(`${v} ${sc[v - 1]}`, cnt[v - 1], total)).join('')}</div></div>`;
    }
    if (q.type === 'nps') {
      let p = 0, pa = 0, de = 0, sum = 0;
      q.vals.forEach(x => { const v = Number(x.v); sum += v; if (v >= 9) p++; else if (v >= 7) pa++; else de++; });
      const score = pct(p, total) - pct(de, total);
      return `<div class="card">${head}<div class="avg"><span class="nps-score">${score > 0 ? '+' : ''}${score}</span><span>NPS · 평균 ${fmt(sum / total)}점</span></div>
        <div class="bars">${bar('추천 (9~10)', p, total)}${bar('중립 (7~8)', pa, total)}${bar('비추천 (0~6)', de, total)}</div></div>`;
    }
    if (q.type === 'single' || q.type === 'multi') {
      const m = new Map(q.options.map(o => [o, 0]));
      q.vals.forEach(x => String(x.v).split(', ').forEach(o => o && m.set(o, (m.get(o) || 0) + 1)));
      const items = q.type === 'multi' ? [...m].sort((a, b) => b[1] - a[1]) : [...m]; // 복수선택은 많이 고른 순
      return `<div class="card ${q.max ? 'wide' : ''}">${head}<div class="bars">${items.map(([o, c], r) => bar((q.max ? (r + 1) + '위 ' : '') + o, c, total)).join('')}</div>
        ${q.type === 'multi' ? '<div class="meta" style="margin:10px 0 0">비율 = 응답자 대비 선택 비율</div>' : ''}</div>`;
    }
    // text / textarea
    const list = [...q.vals].sort((a, b) => new Date(b.t) - new Date(a.t));
    return `<div class="card ${q.type === 'textarea' ? 'wide' : ''}">${head}<div class="texts">
      ${list.map(x => `<div><time>${fmtTime(x.t)}</time>${esc(x.v)}</div>`).join('')}</div></div>`;
  }

  /* ───── 이벤트 ───── */
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (!b) return;
    tab = b.dataset.k; history.replaceState(null, '', '#' + tab); draw();
  });
  $('refresh').addEventListener('click', load);
  setInterval(() => { left--; $('countdown').textContent = left + '초 후 갱신'; if (left <= 0) load(); }, 1000);

  /* ───── 데모 데이터 (GAS_URL 미설정 또는 ?demo) ───── */
  function demoData() {
    const rnd = a => a[Math.floor(Math.random() * a.length)];
    const sample = ['실습 위주라 이해가 잘 됐습니다.', '시간이 조금 부족했어요.', '사례가 현업과 맞닿아 있어 좋았습니다.', '쉬는 시간이 더 있었으면 합니다.', '강사님 설명이 명확했습니다.'];
    const out = {};
    KEYS.forEach((k, ki) => {
      const S = C.surveys[k], n = [42, 38, 35][ki] || 30;
      const headers = ['제출시각', ...S.questions.map(q => q.label)];
      const rows = Array.from({ length: n }, (_, r) => [new Date(Date.now() - (n - r) * 60000 * 7).toISOString(), ...S.questions.map(q => {
        if (q.type === 'likert') return rnd([3, 4, 4, 5, 5, 5, ki === 2 ? 5 : 4]);
        if (q.type === 'nps') return rnd([6, 7, 8, 9, 9, 10, 10]);
        if (q.type === 'single') return rnd(q.options);
        if (q.type === 'multi' && q.max) return [...q.options].sort(() => Math.random() - .5).slice(0, q.max).join(', ');
        if (q.type === 'multi') return q.options.filter(() => Math.random() < .4).join(', ') || q.options[0];
        if (q.id === 'name') return rnd(['김','이','박','최','정']) + rnd(['민준','서연','지훈','하은','도윤','수아']);
        if (q.id === 'empno') return String(100000 + Math.floor(Math.random() * 900000));
        if (q.type === 'text') return rnd(['DX추진팀', 'HR기획팀', '품질혁신파트', '생산기술팀']);
        return Math.random() < .6 ? rnd(sample) : '';
      })]);
      out[k] = { headers, rows };
    });
    return out;
  }

  load();
})();
