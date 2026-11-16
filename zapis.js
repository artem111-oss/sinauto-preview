/* Sin Auto: форма записи. Контракт API — docs/box-spec.md, раздел «HTTP API».
   Адрес API берётся из <meta name="box-api">. Если API не отвечает, форма прячется
   и предлагает позвонить или написать: запись не теряется, человек просто идёт другим путём. */
(() => {
  const d = document;
  const form = d.querySelector('[data-booking]');
  if (!form) return;
  const $ = (s, c = d) => c.querySelector(s), $$ = (s, c = d) => [...c.querySelectorAll(s)];
  const api = (($('meta[name="box-api"]') || {}).content || '').replace(/\/+$/, '');
  const tz = form.dataset.tz || 'Asia/Yekaterinburg';
  const offline = $('[data-offline]'), done = $('[data-done]');
  const nbBox = $('[data-notbookable]'), nbName = $('[data-nb-name]');
  const slotsNote = $('[data-slots-note]'), dayNote = $('[data-day-note]'), slotsBox = $('[data-slots]'), daySlots = $('[data-day-slots]'), dateIn = $('[data-date]');
  const note = $('[data-note]'), submit = $('[data-submit]'), summary = $('[data-summary]'), comment = $('[data-comment]');
  const INSPECT = 'inspect-chassis';
  const state = { service: null, wanted: null, slot: null, busy: false, touched: false };
  form.addEventListener('change', () => { state.touched = true; }, true);
  form.addEventListener('click', () => { state.touched = true; }, true);

  /* --- сеть: таймаут 8 секунд; сетевой сбой → режим «позвоните» --- */
  class Offline extends Error {}
  const call = async (path, opts = {}) => {
    if (!api) throw new Offline('no api');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    let res;
    try {
      res = await fetch(api + path, { ...opts, signal: ctl.signal, headers: { Accept: 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    } catch (e) { throw new Offline(String(e)); } finally { clearTimeout(t); }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.status >= 500 || (!data && !res.ok)) throw new Offline('status ' + res.status);
    return { status: res.status, ok: res.ok, data: data || {} };
  };
  const goOffline = (quiet = false) => {
    const was = !offline.hidden;
    form.hidden = true;
    offline.hidden = false;
    if (quiet || was) return;
    offline.focus({ preventScroll: true });
    offline.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  /* --- даты в часовом поясе сервиса --- */
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const addDays = (iso, n) => { const x = new Date(iso + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const dayLabel = (iso) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00:00Z'));
  dateIn.min = today; dateIn.max = addDays(today, 30);

  /* --- шаг 1: работа --- */
  const radios = $$('input[name="service"]', form);
  const nameOf = (code) => { const r = radios.find((x) => x.value === code); return r ? r.dataset.name : code; };
  const pick = (code) => {
    const r = radios.find((x) => x.value === code);
    if (!r) return;
    r.checked = true;
    onService(r);
  };
  const onService = (r) => {
    if (r.dataset.bookable !== '1') {
      state.service = null; state.wanted = r.dataset.name;
      nbName.textContent = r.dataset.name;
      nbBox.hidden = false;
      clearSlots('Эту работу записываем через бесплатный осмотр ходовой — кнопка выше.');
      dateIn.disabled = true;
      return;
    }
    nbBox.hidden = true;
    if (r.value !== INSPECT) state.wanted = null;
    state.service = r.value;
    dateIn.disabled = false;
    loadNearest();
    updateSummary();
  };
  radios.forEach((r) => r.addEventListener('change', () => onService(r)));
  $('[data-to-inspect]').addEventListener('click', () => {
    const wanted = state.wanted;
    pick(INSPECT);
    state.wanted = wanted;
    if (wanted && comment && !comment.value.includes(wanted)) comment.value = (`Нужно: ${wanted}. ` + comment.value).trim();
    const first = $('[data-step="2"]');
    first.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    updateSummary();
  });

  /* --- шаг 2: время --- */
  const clearSlots = (msg) => { slotsBox.replaceChildren(); daySlots.replaceChildren(); dayNote.textContent = ''; state.slot = null; slotsNote.textContent = msg; updateSummary(); };
  const chip = (box, date, time, label) => {
    const l = d.createElement('label'); l.className = 'slot';
    const i = d.createElement('input'); i.type = 'radio'; i.name = 'slot'; i.value = date + ' ' + time;
    i.addEventListener('change', () => { state.slot = { date, time, label }; updateSummary(); note.textContent = ''; });
    const s = d.createElement('span'); s.textContent = label;
    l.append(i, s); box.append(l);
  };
  let ask = 0;
  const loadNearest = async (flash = '') => {
    const my = ++ask;
    clearSlots((flash ? flash + ' ' : '') + 'Ищем ближайшее свободное время…');
    form.classList.add('is-loading');
    try {
      const r = await call(`/api/slots/nearest?service=${encodeURIComponent(state.service)}&limit=4`);
      if (my !== ask) return;
      const list = (r.data && r.data.slots) || [];
      if (!r.ok) { slotsNote.textContent = r.data.message || 'Не получилось загрузить время. Выберите день ниже или позвоните.'; return; }
      if (!list.length) { slotsNote.textContent = 'Ближайших свободных окон нет. Выберите другой день или позвоните.'; return; }
      slotsNote.textContent = (flash ? flash + ' ' : '') + 'Ближайшее свободное время:';
      list.forEach((s) => chip(slotsBox, s.date, s.time, s.label || `${dayLabel(s.date)}, ${s.time}`));
    } catch (e) {
      if (e instanceof Offline) goOffline(!state.touched); else throw e;
    } finally { if (my === ask) form.classList.remove('is-loading'); }
  };
  dateIn.addEventListener('change', async () => {
    if (!state.service || !dateIn.value) return;
    const my = ++ask, date = dateIn.value;
    daySlots.replaceChildren();
    if (state.slot && state.slot.date === date) state.slot = null;
    form.classList.add('is-loading');
    try {
      const r = await call(`/api/slots?service=${encodeURIComponent(state.service)}&date=${encodeURIComponent(date)}`);
      if (my !== ask) return;
      const list = (r.data && r.data.slots) || [];
      if (!r.ok) { dayNote.textContent = r.data.message || 'Не получилось загрузить время на этот день.'; return; }
      dayNote.textContent = list.length ? `Свободно ${dayLabel(date)}:` : `На ${dayLabel(date)} свободного времени нет. Попробуйте другой день.`;
      list.forEach((t) => chip(daySlots, date, t, t));
      updateSummary();
    } catch (e) {
      if (e instanceof Offline) goOffline(!state.touched); else throw e;
    } finally { if (my === ask) form.classList.remove('is-loading'); }
  });

  /* --- итог над кнопкой --- */
  const updateSummary = () => {
    const parts = [];
    if (state.service) parts.push(nameOf(state.service));
    if (state.slot) parts.push(state.slot.label.includes(',') || /[а-я]/i.test(state.slot.label) ? state.slot.label : `${dayLabel(state.slot.date)}, ${state.slot.time}`);
    summary.textContent = parts.join(' · ');
  };

  /* --- шаг 3: отправка --- */
  const normPhone = (v) => {
    let x = v.replace(/\D/g, '');
    if (x.length === 11 && x[0] === '8') x = '7' + x.slice(1);
    if (x.length === 10) x = '7' + x;
    return x.length === 11 && x[0] === '7' ? '+' + x : null;
  };
  const mark = (el, bad) => el.setAttribute('aria-invalid', bad ? 'true' : 'false');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.busy) return;
    const f = form.elements;
    note.textContent = '';
    if (!state.service) { note.textContent = 'Выберите работу в первом шаге.'; (radios.find((r) => r.checked) || radios[0]).focus(); return; }
    if (!state.slot) { note.textContent = 'Выберите время во втором шаге.'; ($('input[name="slot"]', form) || dateIn).focus(); return; }
    const name = f.name.value.trim(), phone = normPhone(f.phone.value);
    mark(f.name, name.length < 2); mark(f.phone, !phone); mark(f.consent_pd, !f.consent_pd.checked);
    if (name.length < 2) { note.textContent = 'Напишите, как к вам обращаться.'; f.name.focus(); return; }
    if (!phone) { note.textContent = 'Проверьте телефон: нужен номер из 10 цифр после +7.'; f.phone.focus(); return; }
    if (!f.consent_pd.checked) { note.textContent = 'Без согласия на обработку персональных данных мы не можем записать вас онлайн. Можно позвонить.'; f.consent_pd.focus(); return; }

    const body = {
      service: state.service, date: state.slot.date, time: state.slot.time,
      name, phone,
      consent_pd: true, consent_ads: f.consent_ads.checked,
      consent_text_version: form.dataset.consentVersion || '',
      website: f.website.value,
    };
    const plate = f.plate.value.trim(), car = f.car.value.trim();
    let cm = f.comment.value.trim();
    if (state.wanted && !cm.includes(state.wanted)) cm = `Нужно: ${state.wanted}. ${cm}`.trim();
    if (plate) body.plate = plate;
    if (car) body.car = car;
    if (cm) body.comment = cm;

    state.busy = true; submit.disabled = true; submit.textContent = 'Записываем…'; form.classList.add('is-loading');
    try {
      const r = await call('/api/bookings', { method: 'POST', body: JSON.stringify(body) });
      if (r.status === 201 || (r.ok && r.data.id)) return success(r.data);
      const code = r.data.error, msg = r.data.message;
      if (code === 'slot_taken') {
        note.textContent = msg || 'Это время только что заняли. Выберите другое.';
        state.slot = null; loadNearest(msg || 'Это время только что заняли.');
        $('[data-step="2"]').scrollIntoView({ block: 'start' });
      } else if (code === 'consent_required') { note.textContent = msg || 'Нужно согласие на обработку персональных данных.'; f.consent_pd.focus(); }
      else if (code === 'bad_phone') { note.textContent = msg || 'Проверьте номер телефона.'; mark(f.phone, true); f.phone.focus(); }
      else if (code === 'not_bookable') { note.textContent = msg || 'Эту работу записываем через бесплатный осмотр.'; }
      else note.textContent = msg || 'Не получилось записать. Позвоните, запишем по телефону.';
    } catch (err) {
      if (err instanceof Offline) goOffline(); else note.textContent = 'Не получилось записать. Позвоните, запишем по телефону.';
    } finally {
      state.busy = false; submit.disabled = false; submit.textContent = 'Записаться'; form.classList.remove('is-loading');
    }
  });

  const success = (data) => {
    form.hidden = true;
    $('[data-done-when]').textContent = data.start_label || (state.slot ? `${dayLabel(state.slot.date)}, ${state.slot.time}` : '');
    $('[data-done-what]').textContent = nameOf(state.service) + (state.wanted && state.wanted !== nameOf(state.service) ? `. В комментарии: ${state.wanted}` : '') + '.';
    const tg = $('[data-done-tg]');
    if (typeof data.telegram_link === 'string' && /^https:\/\/t\.me\//.test(data.telegram_link)) { tg.href = data.telegram_link; tg.hidden = false; }
    done.hidden = false;
    done.focus({ preventScroll: true });
    done.scrollIntoView({ block: 'start' });
  };

  /* --- старт: проверка, что API живо, и выбор из адреса (?service=…&need=…) --- */
  const q = new URLSearchParams(location.search);
  call('/api/services').then((r) => { if (!r.ok) goOffline(true); }).catch((e) => { if (e instanceof Offline) goOffline(true); });
  const want = q.get('service'), need = q.get('need');
  if (want && radios.some((r) => r.value === want)) {
    pick(want);
    if (need) {
      state.wanted = need.slice(0, 80);
      if (comment && !comment.value) comment.value = `Нужно: ${state.wanted}.`;
    }
  }
})();
