(function () {
  const C = window.SURVEY_CONFIG;
  const KEYS = Object.keys(C.surveys);
  const params = new URLSearchParams(location.search);
  const DEMO = params.has('demo') || /여기에_배포ID/.test(C.GAS_URL);
  const scaleOf = q => Array.isArray(q.scale) ? q.scale : (C.SCALES[q.scale || 'agree'] || C.SCALES.agree);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => (n == null || isNaN(n) ? '-' : (Math.round(n * 100) / 100).toFixed(2));
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const fmtTime = d => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const dayName = k => C.surveys[k].title.replace(/ ?설문/, '');

  let RAW = null, DATA = null, tab = (location.hash.slice(1) || 'overview'), left = C.REFRESH_SEC;
  const $ = id => document.getElementById(id);

  document.title = '설문 대시보드 | ' + C.COURSE_NAME;
  $('course').textContent = C.COURSE_NAME;
  if (DEMO) $('demo').hidden = false;
  if (C.SHEET_URL) { $('sheet').hidden = false; $('sheet').href = C.SHEET_URL; }

  /* ═════ 데이터 ═════ */
  async function load() {
    try {
      if (DEMO) RAW = RAW || demoData();
      else {
        const u = C.GAS_URL + '?action=data' + (params.get('key') ? '&key=' + encodeURIComponent(params.get('key')) : '') + '&t=' + Date.now();
        const j = await (await fetch(u)).json();
        if (!j.ok) throw new Error(j.error);
        RAW = j.data;
      }
      DATA = process(RAW);
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
        if (!q.identity && !q.intro && !(q.type === 'multi' && q.max)) q = { ...q, no: ++no };
        const i = d.headers.indexOf(q.label);
        let vals, cols = null;
        if (q.split) {
          const re = new RegExp('^' + q.split.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\d+$');
          cols = d.headers.map((h, ci) => (re.test(h) ? ci : -1)).filter(ci => ci >= 0);
          if (i >= 0) cols.push(i);
          vals = rows.map((r, ri) => ({ v: cols.map(ci => r[ci]).filter(x => x !== '' && x != null).join(', '), t: ts[ri] })).filter(x => x.v);
        } else vals = i < 0 ? [] : rows.map((r, ri) => ({ v: r[i], t: ts[ri] })).filter(x => x.v !== '' && x.v != null);
        return { ...q, vals, col: i, cols };
      });
      // 응답자별 영역 평균 (area 가 있는 5점 문항)
      const areaNames = [...new Set(qs.filter(q => q.type === 'likert' && q.area).map(q => q.area))];
      const roster = rows.map(r => ({
        t: r[0], row: r, ids: qs.filter(q => q.identity).map(q => (q.col < 0 ? '' : r[q.col])),
        areas: areaNames.map(a => {
          const vs = qs.filter(q => q.type === 'likert' && q.area === a && q.col >= 0).map(q => Number(r[q.col])).filter(v => v >= 1);
          return vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : null;
        }),
      }));
      const likerts = qs.filter(q => q.type === 'likert').flatMap(q => q.vals.map(x => Number(x.v))).filter(n => n >= 1);
      out[k] = {
        k, S, n: rows.length, qs, roster, areaNames,
        avg: likerts.length ? likerts.reduce((a, b) => a + b, 0) / likerts.length : null,
        last: ts.length ? ts.reduce((a, b) => (new Date(a) > new Date(b) ? a : b)) : null,
      };
    });
    return out;
  }

  // 5점 문항 분포
  function dist(q) {
    const cnt = [0, 0, 0, 0, 0]; let sum = 0, n = 0;
    q.vals.forEach(x => { const v = Number(x.v); if (v >= 1 && v <= 5) { cnt[v - 1]++; sum += v; n++; } });
    return { cnt, n, avg: n ? sum / n : null, top: pct(cnt[3] + cnt[4], n), low: pct(cnt[0] + cnt[1], n) };
  }

  /* ═════ 공통 그래픽 ═════ */
  // 100% 누적 막대 (1점 → 5점)
  function stack(q, d) {
    const sc = scaleOf(q);
    if (!d.n) return '<div class="stack empty"></div>';
    return '<div class="stack">' + d.cnt.map((c, i) => {
      const w = (c / d.n) * 100;
      return w ? `<span class="s${i + 1}" style="width:${w}%" title="${i + 1}점 ${esc(sc[i])}: ${c}명 (${Math.round(w)}%)">${w >= 9 ? Math.round(w) + '%' : ''}</span>` : '';
    }).join('') + '</div>';
  }
  const legend = q => `<div class="legend">${scaleOf(q).map((s, i) => `<span><i class="s${i + 1}"></i>${i + 1} ${esc(s)}</span>`).join('')}</div>`;
  const tone = a => (a == null ? '' : a >= 4.5 ? 'hi' : a < 4 ? 'lo' : '');
  const score = (a, cls = '') => `<b class="score ${tone(a)} ${cls}">${fmt(a)}</b>`;

  function hbar(name, c, total, rank) {
    return `<div class="hbar"><span class="name">${rank ? `<em>${rank}</em>` : ''}${esc(name)}</span>
      <div class="track"><div class="fill" style="width:${pct(c, total)}%"></div></div><span class="num"><b>${c}</b>명 · ${pct(c, total)}%</span></div>`;
  }

  function texts(vals, title, sub) {
    const list = [...vals].sort((a, b) => new Date(b.t) - new Date(a.t));
    return `<div class="tbox">${title ? `<div class="tbox-h">${esc(title)}<span>${list.length}건</span></div>` : ''}${sub || ''}
      <div class="texts">${list.length ? list.map(x => `<div><time>${fmtTime(x.t)}</time>${esc(x.v)}</div>`).join('') : '<p class="empty">응답 없음</p>'}</div></div>`;
  }

  /* ═════ 렌더 ═════ */
  function draw() {
    const cq = courseQs();
    const tabs = [['overview', '전체 요약', null], ...KEYS.map(k => [k, C.surveys[k].title, DATA[k].n])];
    if (cq.likert.length) tabs.push(['course', '과정 만족도', cq.n]);
    $('tabs').innerHTML = tabs
      .map(([k, t, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-k="${k}">${esc(t)}${n != null ? `<span class="cnt">${n}</span>` : ''}</button>`).join('');
    $('body').innerHTML = tab === 'course' && cq.likert.length ? coursePage(cq) : tab === 'overview' || !DATA[tab] ? overview() : survey(DATA[tab]);
  }

  // course: true 문항 모으기 (어느 설문에 있든)
  function courseQs() {
    const all = KEYS.flatMap(k => DATA[k].qs.filter(q => q.course).map(q => ({ ...q, k })));
    const likert = all.filter(q => q.type === 'likert'), text = all.filter(q => q.type !== 'likert');
    const ks = [...new Set(all.map(q => q.k))];
    return { likert, text, n: ks.reduce((a, k) => a + DATA[k].n, 0), last: ks.map(k => DATA[k].last).filter(Boolean).sort().pop() };
  }

  function coursePage(cq) {
    if (!cq.n) return `<div class="card"><p class="empty big">아직 응답이 없습니다.</p></div>`;
    const ov = dist(cq.likert[0]);
    const all = cq.likert.flatMap(q => q.vals.map(x => Number(x.v))).filter(v => v >= 1);
    const avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
    let html = `<div class="kpis">${kpi('응답 수', cq.n, '명', cq.last ? '최근 제출 ' + fmtTime(cq.last) : '')}
      ${kpi('전체 만족도', fmt(ov.avg), ' / 5', `긍정(4~5점) ${ov.top}%`, 'accent')}
      ${kpi('과정 만족도 4개 문항 평균', fmt(avg), ' / 5', '100점 환산 ' + (avg ? Math.round(avg * 20) : '-') + '점')}</div>`;
    html += courseBlock(cq.likert);
    if (cq.text.length) html += `<div class="sec-h"><h2>주관식 응답</h2></div><div class="tgrid">${cq.text.map(q => `<div class="card">${texts(q.vals, q.label)}</div>`).join('')}</div>`;
    return html;
  }

  function kpi(label, val, unit, foot, cls = '') {
    return `<div class="card kpi ${cls}"><div class="label">${label}</div><div class="val">${val}<small>${unit}</small></div><div class="foot">${foot}</div></div>`;
  }

  function overview() {
    const tiles = KEYS.map(k => {
      const d = DATA[k];
      return kpi(esc(d.S.title), d.n, '명', d.last ? '최근 제출 ' + fmtTime(d.last) : '응답 없음');
    });
    const courseQ = courseQs().likert;
    let html = `<div class="kpis">${tiles.join('')}</div>`;       // ① 참여 인원
    if (courseQ.length) html += courseBlock(courseQ);              // ② 과정 만족도

    // ③ 모듈별 만족도 (설문 문항 순서대로)
    const mods = KEYS.flatMap(k => DATA[k].qs.filter(q => q.module).map(q => ({ k, q, d: dist(q) })));
    if (mods.length) {
      html += `<div class="card"><div class="card-h"><h3>모듈별 만족도</h3>${legend(mods[0].q)}</div>
        <div class="rank">${mods.map((m, i) => `
          <div class="rank-row ${i && mods[i - 1].k !== m.k ? 'daybreak' : ''}">
            <div class="rank-name"><span class="day">${esc(dayName(m.k))}</span><b>${esc(m.q.module.name)}</b><small>${esc(m.q.module.who)}</small></div>
            ${score(m.d.avg)}
            ${stack(m.q, m.d)}
            <span class="rank-meta">긍정 <b>${m.d.top}%</b><br>${m.d.n}명</span>
          </div>`).join('')}</div></div>`;
    }
    return html;
  }

  function courseBlock(qs, title = '과정 만족도') {
    return `<div class="card"><div class="card-h"><h3>${esc(title)}</h3>${legend(qs[0])}</div>
      <div class="course">${qs.map(q => { const d = dist(q); return `
        <div class="course-item"><div class="course-q">${esc(q.label)}</div>
          <div class="course-s">${score(d.avg)}<span>긍정 <b>${d.top}%</b> · ${d.n}명</span></div>${stack(q, d)}</div>`; }).join('')}</div></div>`;
  }

  function survey(d) {
    if (!d.n) return `<div class="card"><p class="empty big">아직 응답이 없습니다.</p></div>`;
    const used = new Set();
    let html = `<div class="kpis">${kpi('응답 수', d.n, '명', '최근 제출 ' + fmtTime(d.last))}
      ${d.avg != null ? kpi('5점 문항 종합 평균', fmt(d.avg), ' / 5', '100점 환산 ' + Math.round(d.avg * 20) + '점', 'accent') : ''}</div>`;

    // ① 모듈: 한 줄에 점수 · 분포 · 기억에 남는 내용
    const mods = d.qs.filter(q => q.module);
    if (mods.length) {
      html += `<div class="sec-h"><h2>모듈 만족도</h2>${legend(mods[0])}</div>`;
      html += mods.map(q => {
        const dd = dist(q), memo = d.qs.find(x => x.id === q.id + '_memo');
        used.add(q.id); if (memo) used.add(memo.id);
        return `<div class="card mod">
          <div class="mod-info"><small>${esc(q.module.who)}</small><h3>${esc(q.module.name)}</h3>
            <div class="mod-score">${score(dd.avg, 'xl')}<span>/ 5</span></div>
            <div class="mod-meta">긍정(4~5점) <b>${dd.top}%</b> · 부정(1~2점) <b>${dd.low}%</b> · ${dd.n}명</div>
            ${stack(q, dd)}
            <div class="counts">${[1, 2, 3, 4, 5].map(v => `<span>${v}점 <b>${dd.cnt[v - 1]}</b></span>`).join('')}</div></div>
          ${memo ? texts(memo.vals, '가장 기억에 남는 내용') : ''}
        </div>`;
      }).join('');
    }

    // ② 과정 만족도
    // 과정 만족도 문항은 '과정 만족도' 탭에서 따로 표시
    const course = d.qs.filter(q => q.course);
    course.forEach(q => used.add(q.id));
    if (course.length) html += `<div class="card note">과정 만족도 문항은 <a href="#course" data-go="course">과정 만족도 탭</a>에서 확인하세요.</div>`;

    // ③ 사전설문: 공통 질문(예/아니오 등) → 영역별 평균 → 문항
    const introQs = d.qs.filter(q => q.intro && q.type !== 'textarea' && q.type !== 'text');
    if (introQs.length) { introQs.forEach(q => used.add(q.id)); html += `<div class="sec-h"><h2>공통 질문</h2></div>` + introQs.map(otherCard).join(''); }
    html += areaCard(d);
    const likerts = d.qs.filter(q => q.type === 'likert' && !used.has(q.id));
    if (likerts.length) {
      likerts.forEach(q => used.add(q.id));
      html += `<div class="sec-h"><h2>문항별 결과</h2>${legend(likerts[0])}</div><div class="card"><div class="qlist">` +
        likerts.map(q => { const dd = dist(q); return `<div class="qrow">
          <div class="qrow-t"><b>${q.no ? 'Q' + q.no : '공통'}</b>${esc(q.label)}${q.area ? `<small>${esc(q.area)}${q.lgway ? ' · LG Way: ' + esc(q.lgway) : ''}</small>` : ''}</div>
          ${score(dd.avg)}${stack(q, dd)}<span class="rank-meta">긍정 <b>${dd.top}%</b></span></div>`; }).join('') + '</div></div>';
    }

    // ④ 나머지 (복수선택·NPS·주관식 등)
    const rest = d.qs.filter(q => !used.has(q.id) && !q.identity);
    const textQs = rest.filter(q => q.type === 'textarea' || q.type === 'text');
    rest.filter(q => !textQs.includes(q)).forEach(q => { html += otherCard(q); });
    if (textQs.length) html += `<div class="sec-h"><h2>주관식 응답</h2></div><div class="tgrid">${textQs.map(q => `<div class="card">${texts(q.vals, q.label)}</div>`).join('')}</div>`;

    html += rosterCard(d);
    return html;
  }

  function otherCard(q) {
    const total = q.vals.length;
    if (q.type === 'nps') {
      let p = 0, pa = 0, de = 0;
      q.vals.forEach(x => { const v = Number(x.v); if (v >= 9) p++; else if (v >= 7) pa++; else de++; });
      const s = pct(p, total) - pct(de, total);
      return `<div class="card"><h3>${esc(q.label)}</h3><div class="mod-score"><b class="score xl">${s > 0 ? '+' : ''}${s}</b><span>NPS · ${total}명</span></div>
        <div class="hbars">${hbar('추천 (9~10)', p, total)}${hbar('중립 (7~8)', pa, total)}${hbar('비추천 (0~6)', de, total)}</div></div>`;
    }
    const m = new Map((q.options || []).map(o => [o, 0]));
    q.vals.forEach(x => String(x.v).split(', ').forEach(o => o && m.set(o, (m.get(o) || 0) + 1)));
    const items = q.type === 'multi' ? [...m].sort((a, b) => b[1] - a[1]) : [...m];
    return `<div class="card"><div class="card-h"><h3>${esc(q.label)}</h3><span class="muted">응답 ${total}명${q.type === 'multi' ? ' · 비율 = 응답자 중 선택 비율' : ''}</span></div>
      <div class="hbars">${items.map(([o, c], r) => hbar(o, c, total, q.max ? r + 1 : 0)).join('')}</div></div>`;
  }

  function areaCard(d) {
    const m = new Map();
    d.qs.filter(q => q.type === 'likert' && q.area).forEach(q => {
      const a = m.get(q.area) || { sum: 0, n: 0, qs: [] };
      q.vals.forEach(x => { a.sum += Number(x.v); a.n++; }); a.qs.push('Q' + q.no); m.set(q.area, a);
    });
    if (m.size < 2) return '';
    const list = [...m].map(([k, a]) => ({ k, avg: a.n ? a.sum / a.n : null, qs: a.qs })).sort((a, b) => (a.avg ?? 9) - (b.avg ?? 9));
    return `<div class="sec-h"><h2>영역별 평균</h2><span class="muted">낮은 순 · 보완이 필요한 영역부터</span></div>
      <div class="areas">${list.map((x, i) => `<div class="card area ${i === 0 ? 'first' : ''}"><div class="label">${esc(x.k)}</div>
        ${score(x.avg, 'xl')}<div class="foot">${x.qs.join(' · ')}</div></div>`).join('')}</div>`;
  }

  let ROSTER = { d: null, list: [] };
  function rosterCard(d) {
    const idq = d.qs.filter(q => q.identity);
    if (!idq.length) return '';
    const list = [...d.roster].sort((a, b) => new Date(b.t) - new Date(a.t));
    ROSTER = { d, list };
    const key = r => r.ids.join('|');
    const cnt = list.reduce((m, r) => m.set(key(r), (m.get(key(r)) || 0) + 1), new Map());
    const dup = [...cnt.values()].filter(c => c > 1).length;
    return `<div class="sec-h"><h2>응답자 명단</h2><span class="muted">이름을 누르면 개인별 응답을 볼 수 있어요 · ${list.length}건${dup ? ` · <b style="color:var(--bad)">중복 제출 ${dup}명</b>` : ''}</span></div>
      <div class="card"><div class="roster"><table class="cmp"><thead><tr><th>#</th>${idq.filter(q => !q.private).map(q => `<th>${esc(q.label)}</th>`).join('')}<th>제출시각</th>${d.areaNames.map(a => `<th class="c">${esc(a)}</th>`).join('')}</tr></thead><tbody>
      ${list.map((r, i) => `<tr${cnt.get(key(r)) > 1 ? ' class="dup"' : ''}><td>${list.length - i}</td>${r.ids.map((v, j) => idq[j].private ? '' : j === 0 ? `<td><button class="person" data-person="${i}">${esc(v)}</button></td>` : `<td>${esc(v)}</td>`).join('')}<td>${fmtTime(r.t)}</td>${r.areas.map(v => `<td class="c av ${v != null && v < 3 ? 'low' : v >= 4.5 ? 'top' : ''}">${v != null ? v.toFixed(1) : '-'}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div></div>`;
  }

  /* ═════ 개인별 응답 팝업 ═════ */
  function personHtml(d, r) {
    const idq = d.qs.filter(q => q.identity);
    const name = r.ids[0] || '(이름 없음)';
    const valOf = q => (q.cols ? q.cols.map(ci => r.row[ci]).filter(x => x !== '' && x != null) : (q.col < 0 ? '' : r.row[q.col]));
    // 전체 응답자 영역 평균 (비교용)
    const allAvg = d.areaNames.map((a, ai) => { const vs = d.roster.map(x => x.areas[ai]).filter(v => v != null); return vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : null; });
    const dots = (v, q) => {
      const n = Number(v), sc = scaleOf(q);
      if (!(n >= 1)) return '<span class="muted">-</span>';
      return `<span class="dots">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span><b class="pv ${tone(n)}">${n}</b><span class="muted">${esc(sc[n - 1] || '')}</span>`;
    };
    let h = `<div class="pm-head"><div><small>${esc(d.S.title)} · ${fmtTime(r.t)} 제출</small><h2>${esc(name)}</h2></div><button class="pm-x" data-close aria-label="닫기">✕</button></div><div class="pm-body">`;
    if (d.areaNames.length) {
      h += `<h4>영역별 결과 <span class="muted">· 괄호는 전체 응답자 평균</span></h4><div class="pm-areas">${d.areaNames.map((a, ai) => {
        const v = r.areas[ai], g = allAvg[ai], diff = v != null && g != null ? v - g : null;
        return `<div class="pm-area"><span>${esc(a)}</span><b class="${tone(v)}">${v != null ? v.toFixed(1) : '-'}</b>
          <em>(${g != null ? g.toFixed(1) : '-'})${diff != null && Math.abs(diff) >= 0.05 ? ` <i class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'}${Math.abs(diff).toFixed(1)}</i>` : ''}</em></div>`;
      }).join('')}</div>`;
    }
    let area = '__';
    d.qs.filter(q => !q.identity).forEach(q => {
      const grp = q.intro ? '공통 질문' : q.type === 'likert' ? q.area || '문항' : q.type === 'multi' ? (q.area || '선택') : '주관식';
      if (grp !== area) { area = grp; h += `<h4>${esc(grp)}</h4>`; }
      const v = valOf(q);
      const label = `${q.no && q.type === 'likert' ? `<b class="qn">Q${q.no}</b>` : ''}${esc(q.label)}`;
      if (q.type === 'likert') h += `<div class="pm-q"><div class="pm-l">${label}</div><div class="pm-v">${dots(v, q)}</div></div>`;
      else if (q.type === 'single') h += `<div class="pm-q"><div class="pm-l">${label}</div><div class="chips">${v !== '' && v != null ? `<span>${esc(v)}</span>` : '<span class="muted">-</span>'}</div></div>`;
      else if (q.type === 'multi') { const arr = Array.isArray(v) ? v : String(v || '').split(', ').filter(Boolean);
        h += `<div class="pm-q col"><div class="pm-l">${label}</div><div class="chips">${arr.length ? arr.map((x, i) => `<span>${q.max ? i + 1 + '. ' : ''}${esc(x)}</span>`).join('') : '<span class="muted">-</span>'}</div></div>`; }
      else h += `<div class="pm-q col"><div class="pm-l">${label}</div><div class="pm-t">${v !== '' && v != null ? esc(v) : '<span class="muted">응답 없음</span>'}</div></div>`;
    });
    return h + '</div>';
  }
  function openPerson(i) {
    const r = ROSTER.list[i]; if (!r) return;
    let m = $('pmodal');
    if (!m) { m = document.createElement('div'); m.id = 'pmodal'; m.className = 'pm-wrap'; document.body.appendChild(m);
      m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) closePerson(); }); }
    m.innerHTML = `<div class="pm" role="dialog" aria-modal="true">${personHtml(ROSTER.d, r)}</div>`;
    m.hidden = false; document.body.style.overflow = 'hidden';
  }
  function closePerson() { const m = $('pmodal'); if (m) { m.hidden = true; document.body.style.overflow = ''; } }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePerson(); });

  /* ═════ 엑셀 다운로드 (시트 원본과 같은 탭·열 구성) ═════ */
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'assets/xlsx.full.min.js'; // 같은 폴더에 포함 (사내망 CDN 차단 대비)
      s.onload = ok; s.onerror = () => no(new Error('엑셀 라이브러리 로드 실패'));
      document.head.appendChild(s);
    });
  }
  const pad = n => String(n).padStart(2, '0');
  const stamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const cellOut = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? stamp(new Date(v)) : v);

  async function download() {
    const btn = $('download');
    if (!RAW) return;
    btn.disabled = true; btn.textContent = '준비 중...';
    const now = new Date();
    const base = `${C.COURSE_NAME}_설문응답_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    try {
      await loadXLSX();
      const wb = XLSX.utils.book_new();
      KEYS.forEach(k => {
        const d = RAW[k] || { headers: [], rows: [] };
        const ws = XLSX.utils.aoa_to_sheet([d.headers, ...d.rows.map(r => r.map(cellOut))]);
        ws['!cols'] = d.headers.map((h, i) => ({ wch: i === 0 ? 20 : Math.min(40, Math.max(10, String(h).length * 1.6)) }));
        XLSX.utils.book_append_sheet(wb, ws, (C.surveys[k].sheet || k).slice(0, 31));
      });
      XLSX.writeFile(wb, base + '.xlsx');
    } catch (e) {
      // 라이브러리를 못 불러오면 탭별 CSV 로 대체
      KEYS.forEach(k => {
        const d = RAW[k] || { headers: [], rows: [] };
        const csv = [d.headers, ...d.rows.map(r => r.map(cellOut))]
          .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `${base}_${C.surveys[k].sheet || k}.csv`; a.click();
      });
    }
    btn.disabled = false; btn.textContent = '엑셀 다운로드';
  }

  /* ═════ 이벤트 ═════ */
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (!b) return;
    tab = b.dataset.k; history.replaceState(null, '', '#' + tab); draw(); window.scrollTo(0, 0);
  });
  $('body').addEventListener('click', e => {
    const pb = e.target.closest('[data-person]'); if (pb) return openPerson(+pb.dataset.person);
    const a = e.target.closest('[data-go]'); if (!a) return;
    e.preventDefault(); tab = a.dataset.go; history.replaceState(null, '', '#' + tab); draw(); window.scrollTo(0, 0);
  });
  $('refresh').addEventListener('click', load);
  $('download').addEventListener('click', download);
  setInterval(() => { left--; $('countdown').textContent = left + '초 후 갱신'; if (left <= 0) load(); }, 1000);

  /* ═════ 데모 데이터 ═════ */
  function demoData() {
    const rnd = a => a[Math.floor(Math.random() * a.length)];
    const sample = ['실습 위주라 이해가 잘 됐습니다.', '시간이 조금 부족했어요.', '사례가 현업과 맞닿아 있어 좋았습니다.', '쉬는 시간이 더 있었으면 합니다.', '강사님 설명이 명확했습니다.', '다른 신임담당들과 고민을 나눌 수 있어 의미 있었습니다.'];
    const out = {};
    KEYS.forEach((k, ki) => {
      const S = C.surveys[k], n = [42, 38, 35][ki] || 30;
      const qs = S.questions.filter(q => q.type !== 'section');
      const headers = ['제출시각'];
      qs.forEach(q => { if (q.split) for (let j = 0; j < q.max; j++) headers.push(`${q.split} ${j + 1}`); else headers.push(q.label); });
      const rows = Array.from({ length: n }, (_, r) => {
        const row = [new Date(Date.now() - (n - r) * 60000 * 7).toISOString()];
        const bias = Math.random();
        qs.forEach(q => {
          if (q.split) { const p = [...q.options].sort(() => Math.random() - .5).slice(0, q.max); for (let j = 0; j < q.max; j++) row.push(p[j]); return; }
          if (q.type === 'likert') return row.push(rnd(bias < .15 ? [2, 3, 3, 4] : [3, 4, 4, 5, 5, 5]));
          if (q.type === 'nps') return row.push(rnd([6, 7, 8, 9, 9, 10, 10]));
          if (q.type === 'single') return row.push(rnd(q.options));
          if (q.type === 'multi') return row.push(q.options.filter(() => Math.random() < .4).join(', ') || q.options[0]);
          if (q.id === 'name') return row.push(rnd(['김', '이', '박', '최', '정']) + rnd(['민준', '서연', '지훈', '하은', '도윤', '수아']));
          if (q.id === 'empno') return row.push(String(100000 + Math.floor(Math.random() * 900000)));
          return row.push(Math.random() < .6 ? rnd(sample) : '');
        });
        return row;
      });
      out[k] = { headers, rows };
    });
    return out;
  }

  load();
})();
