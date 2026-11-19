(function () {
  const C = window.SURVEY_CONFIG;
  const KEY = document.body.dataset.survey;
  const S = C.surveys[KEY];
  const app = document.getElementById('app');
  const scaleOf = q => Array.isArray(q.scale) ? q.scale : (C.SCALES[q.scale || 'agree'] || C.SCALES.agree);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  document.title = S.title + ' | ' + C.COURSE_NAME;

  function field(q) {
    const n = 'q_' + q.id;
    switch (q.type) {
      case 'likert': {
        const sc = scaleOf(q);
        return '<div class="likert">' + [1, 2, 3, 4, 5].map(v =>
          `<label><input type="radio" name="${n}" value="${v}"><span><b>${v}</b>${esc(sc[v - 1])}</span></label>`).join('') + '</div>';
      }
      case 'nps':
        return '<div class="nps">' + Array.from({ length: 11 }, (_, v) =>
          `<label><input type="radio" name="${n}" value="${v}"><span>${v}</span></label>`).join('') +
          '</div><div class="nps-ends"><span>전혀 추천 안 함</span><span>적극 추천</span></div>';
      case 'single':
      case 'multi': {
        const t = q.type === 'single' ? 'radio' : 'checkbox';
        return (q.max ? `<div class="pick-count" data-for="${q.id}">0 / ${q.max} 선택</div>` : '') + `<div class="opts ${q.type}" data-max="${q.max || ''}">` + q.options.map(o =>
          `<label><input type="${t}" name="${n}" value="${esc(o)}">${esc(o)}</label>`).join('') + '</div>';
      }
      case 'textarea':
        return `<textarea name="${n}" placeholder="자유롭게 작성해 주세요"></textarea>`;
      default:
        return `<input type="text" name="${n}" autocomplete="off">`;
    }
  }

  // 신원 문항(이름/사번)은 번호 없이, 나머지는 Q1부터
  function qno(q, i) {
    if (q.identity) return '';
    const n = S.questions.slice(0, i + 1).filter(x => !x.identity && x.type !== 'section').length;
    return q.type === 'multi' && q.max ? '' : `Q${n}.`;
  }

  function limit(e) {
    const box = e.target.closest('.opts[data-max]');
    if (!box || !box.dataset.max) return;
    const max = +box.dataset.max, ins = [...box.querySelectorAll('input')];
    const n = ins.filter(i => i.checked).length;
    ins.forEach(i => { i.disabled = !i.checked && n >= max; i.parentElement.classList.toggle('off', i.disabled); });
    const id = box.closest('.q').dataset.id;
    document.querySelector(`.pick-count[data-for="${id}"]`).textContent = `${n} / ${max} 선택`;
  }

  // 모듈 구분 헤더 (모듈 만족도 문항 앞에 표시)
  let modNo = 0;
  function modHead(q) {
    if (!q.module) return '';
    modNo++;
    return `<div class="mod-head"><span class="mod-no">MODULE ${String(modNo).padStart(2, '0')}</span>
      <div class="mod-t"><b>${esc(q.module.name)}</b><small>${esc(q.module.who)}</small></div></div>`;
  }

  function render() {
    app.innerHTML = `
      <div class="hero"><div class="course">${esc(C.COURSE_NAME)}</div><h1>${esc(S.title)}</h1><p>${esc(S.desc || '')}</p></div>
      <form id="f" novalidate>
        ${S.questions.map((q, i) => q.type === 'section' ? `<h2 class="sec">${esc(q.label)}</h2>` : modHead(q) + `
          <div class="q${q.module || /_memo$/.test(q.id) ? ' in-mod' : ''}" data-id="${q.id}">
            ${q.area ? `<div class="chip">${esc(q.area)}</div>` : ''}
            <div class="q-title">${qno(q, i) ? `<span class="no">${qno(q, i)}</span>` : ''}${esc(q.label)}${q.required ? '<span class="req">*</span>' : ''}</div>
            ${field(q)}
            <div class="err-msg">${q.min ? `${q.min}개를 선택해 주세요.` : '필수 응답 문항입니다.'}</div>
          </div>`).join('')}
        <button class="submit" type="submit">제출하기</button>
        <div class="notice" id="notice"></div>
      </form>`;
    const f = document.getElementById('f');
    f.addEventListener('change', e => { limit(e); e.target.closest('.q')?.classList.remove('error'); });
    f.addEventListener('input', e => e.target.closest('.q')?.classList.remove('error'));
    f.addEventListener('submit', submit);
  }

  function collect(f) {
    const answers = [], missing = [];
    S.questions.forEach(q => {
      if (q.type === 'section') return;
      const n = 'q_' + q.id;
      let v;
      if (q.type === 'multi') v = [...f.querySelectorAll(`[name="${n}"]:checked`)].map(i => i.value).join(', ');
      else if (['likert', 'nps', 'single'].includes(q.type)) {
        const c = f.querySelector(`[name="${n}"]:checked`);
        v = c ? (q.type === 'single' ? c.value : Number(c.value)) : '';
      } else v = f.elements[n].value.trim();
      if (q.required && (v === '' || v == null)) missing.push(q.id);
      else if (q.min && v.split(', ').filter(Boolean).length < q.min) missing.push(q.id);
      if (q.split && q.type === 'multi') {
        // 선택 항목을 '라벨 1', '라벨 2', ... 열로 나눠 기록
        const picks = v ? v.split(', ') : [];
        for (let k = 0; k < (q.max || picks.length); k++) answers.push({ id: q.id + '_' + (k + 1), label: `${q.split} ${k + 1}`, value: picks[k] || '' });
      } else answers.push({ id: q.id, label: q.label, value: v });
    });
    return { answers, missing };
  }

  async function submit(e) {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('.submit'), notice = document.getElementById('notice');
    notice.classList.remove('show');
    const { answers, missing } = collect(f);
    f.querySelectorAll('.q').forEach(el => el.classList.toggle('error', missing.includes(el.dataset.id)));
    if (missing.length) {
      f.querySelector(`.q[data-id="${missing[0]}"]`).scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    btn.disabled = true; btn.textContent = '제출 중...';
    try {
      const res = await fetch(C.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // preflight 회피
        body: JSON.stringify({ survey: KEY, answers }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || '저장 실패');
      app.innerHTML = `<div class="done"><div class="check">✓</div><h2>제출 완료</h2><p>소중한 의견 감사합니다.</p></div>`;
      window.scrollTo(0, 0);
    } catch (err) {
      notice.textContent = '제출에 실패했습니다. 잠시 후 다시 시도해 주세요. (' + err.message + ')';
      notice.classList.add('show');
      btn.disabled = false; btn.textContent = '제출하기';
    }
  }

  render();
})();
