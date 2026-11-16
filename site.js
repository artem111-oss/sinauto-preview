/* Sin Auto: движение страницы. Всё содержимое видно и без этого файла. */
(() => {
  const d = document, root = d.documentElement;
  const $ = (s, c = d) => c.querySelector(s), $$ = (s, c = d) => [...c.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desktop = matchMedia('(min-width: 900px)');
  const canHover = matchMedia('(hover: hover)').matches;
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const motion = hasGsap && !reduce;
  root.classList.add('js');
  if (motion) { root.classList.add('motion'); gsap.registerPlugin(ScrollTrigger); ScrollTrigger.config({ ignoreMobileResize: true }); }

  /* --- открыто ли сейчас (время Уфы, UTC+5). Часы — из <meta name="box-hours">, их пишет сборка из data/shop.json --- */
  let hours = { week: Array(7).fill(['10:00', '20:00']), special: {} };
  try { const m = $('meta[name="box-hours"]'); if (m) hours = JSON.parse(m.content); } catch (e) { /* остаются часы по умолчанию */ }
  const toMin = (t) => { const [h, mm] = t.split(':'); return +h * 60 + +mm; };
  const iso = (x) => x.toISOString().slice(0, 10);
  const ufaAt = (dayShift) => { const x = new Date(Date.now() + 300 * 60000); x.setUTCDate(x.getUTCDate() + dayShift); return x; };
  const hoursOn = (x) => {
    const key = iso(x);
    if (Object.prototype.hasOwnProperty.call(hours.special || {}, key)) return hours.special[key];
    return hours.week[(x.getUTCDay() + 6) % 7];
  };
  const DAYS = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];
  const nowUfa = ufaAt(0), mins = nowUfa.getUTCHours() * 60 + nowUfa.getUTCMinutes();
  const today = hoursOn(nowUfa);
  const open = !!today && mins >= toMin(today[0]) && mins < toMin(today[1]);
  let next = '';
  if (!open) {
    if (today && mins < toMin(today[0])) next = `откроемся в ${today[0]}`;
    else for (let i = 1; i <= 14; i++) {
      const day = ufaAt(i), h = hoursOn(day);
      if (h) { next = `откроемся ${i === 1 ? 'завтра' : DAYS[day.getUTCDay()]} в ${h[0]}`; break; }
    }
  }
  $$('[data-open]').forEach((el) => { el.textContent = open ? `открыто до ${today[1]}` : next; el.hidden = !el.textContent; el.classList.toggle('is-closed', !open); });
  $$('[data-open-long]').forEach((el) => { el.textContent = open ? 'Сейчас открыто.' : 'Сейчас закрыто, сообщение прочитаем, когда откроемся.'; });

  /* --- видео: источник подставляется по требованию, вне экрана пауза --- */
  const sized = (u) => (desktop.matches || /zero-|-m\.mp4$/.test(u) ? u : u.replace('.mp4', '-m.mp4'));
  const arm = (v) => { if (!v.getAttribute('src') && v.dataset.src) v.src = sized(v.dataset.src); };
  const play = (v) => { arm(v); const p = v.play(); if (p) p.catch(() => {}); };
  const lazyVideo = new IntersectionObserver((es) => es.forEach((e) => { e.isIntersecting ? play(e.target) : e.target.pause(); }), { rootMargin: '160px' });
  if (!reduce) $$('video[data-autoplay]').forEach((v) => lazyVideo.observe(v));

  /* --- герой: слова по очереди, под каждое свой кадр --- */
  const hero = $('[data-hero]'), pin = $('[data-hero-pin]');
  const words = $$('.hero__title .w'), clips = $$('[data-film] video'), caps = $$('.hero__caps li');
  let active = 0, timer = null;
  const setWord = (i) => {
    active = i;
    words.forEach((w, k) => w.classList.toggle('is-on', k === i));
    caps.forEach((c, k) => c.classList.toggle('is-on', k === i));
    clips.forEach((v, k) => { v.classList.toggle('is-on', k === i); if (k === i) play(v); else setTimeout(() => { if (active !== k) v.pause(); }, 950); });
  };
  const cycle = (on) => { clearInterval(timer); if (on) timer = setInterval(() => setWord((active + 1) % words.length), 4200); };
  if (hero && words.length) {
    setWord(0);
    const warm = () => clips.forEach((v) => { v.preload = 'auto'; arm(v); });
    if (clips[0]) clips[0].addEventListener('playing', warm, { once: true });
    new IntersectionObserver(([e]) => { cycle(e.isIntersecting); if (e.isIntersecting) play(clips[active]); else clips.forEach((v) => v.pause()); }, { threshold: 0.05 }).observe(hero);
    if (canHover) words.forEach((w, k) => w.addEventListener('mouseenter', () => { setWord(k); cycle(true); }));
  }

  /* --- герой: видео во весь экран, без закрепления прокрутки --- */
  const ap = $('[data-aperture]'), film = $('[data-film]');

  if (motion && ap) {
    /* вступление: кадр проявляется, слова выезжают */
    gsap.timeline({ defaults: { ease: 'expo.out' } })
      .from(film, { scale: 1.12, opacity: 0, duration: 1.8 }, 0)
      .from('.hero__title .w i', { yPercent: 108, duration: 1.1, stagger: 0.12 }, 0.2)
      .from('.hero__bar > *', { opacity: 0, y: 18, duration: 0.7, stagger: 0.08 }, 0.8)
      .from('.hero__caps', { opacity: 0, duration: 0.7 }, 1.1)
      .from('.nav', { opacity: 0, y: -16, duration: 0.6 }, 0.8);
    /* прокрутка: кадр слегка отстаёт от страницы, одна прокрутка уводит дальше */
    gsap.to(ap, { yPercent: 14, ease: 'none', scrollTrigger: { trigger: pin, start: 'top top', end: 'bottom top', scrub: true } });
  }

  /* --- шапка: фон после прокрутки, прячется при движении вниз --- */
  const nav = $('[data-nav]'); let last = 0;
  addEventListener('scroll', () => {
    const y = scrollY;
    nav.classList.toggle('is-solid', y > innerHeight * 0.7);
    nav.classList.toggle('is-away', y > innerHeight * 0.4 && y > last + 4);
    if (y < last - 4) nav.classList.remove('is-away');
    last = y;
  }, { passive: true });

  /* --- появление блоков --- */
  const seen = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); seen.unobserve(e.target); } }), { threshold: 0.2 });
  $$('[data-reveal]').forEach((el) => seen.observe(el));

  /* --- слово: текст проявляется по мере прокрутки --- */
  const say = $('[data-say]');
  if (say && motion) {
    say.innerHTML = say.textContent.trim().split(/\s+/).map((w) => `<span>${w}</span>`).join(' ');
    gsap.to($$('span', say), { opacity: 1, ease: 'none', stagger: 0.12, scrollTrigger: { trigger: say, start: 'top 82%', end: 'bottom 52%', scrub: 0.4 } });
  }

  /* --- работы: строка переключает кадр --- */
  const works = $$('[data-work]'), screen = $('[data-screen]');
  if (works.length && screen) {
    const vid = $('video', screen), no = $('[data-screen-no]', screen), name = $('[data-screen-name]', screen);
    let cur = works[0].dataset.work, busy = null;
    const base = 'assets/stock/';
    const show = (li) => {
      const key = li.dataset.work;
      works.forEach((w) => { const on = w === li; w.classList.toggle('is-active', on); $('button', w).setAttribute('aria-pressed', on); });
      if (key === cur && vid.getAttribute('src')) return;
      cur = key;
      const swap = () => { vid.poster = base + key + '.jpg'; vid.src = sized(base + key + '.mp4'); no.textContent = $('.work__no', li).textContent; name.textContent = $('.work__name', li).textContent; const p = vid.play(); if (p) p.catch(() => {}); };
      if (motion) {
        if (busy) busy.kill();
        busy = gsap.timeline().to(screen, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.3, ease: 'power3.in' }).add(swap).fromTo(screen, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.65, ease: 'expo.out' }).fromTo(vid, { scale: 1.18 }, { scale: 1, duration: 1.1, ease: 'expo.out' }, '<');
      } else swap();
    };
    works.forEach((li) => {
      const b = $('button', li);
      b.addEventListener('click', () => show(li)); b.addEventListener('focus', () => show(li));
      if (canHover) b.addEventListener('mouseenter', () => show(li));
    });
    new IntersectionObserver(([e]) => { if (e.isIntersecting) { if (!vid.getAttribute('src')) vid.src = sized(base + cur + '.mp4'); play(vid); } else vid.pause(); }, { rootMargin: '100px' }).observe(screen);
    const grid = screen.parentElement;
    const place = () => { const on = $('.work.is-active') || works[0]; if (desktop.matches) grid.appendChild(screen); else on.appendChild(screen); };
    works.forEach((li) => $('button', li).addEventListener('click', () => { if (!desktop.matches) li.appendChild(screen); }));
    place(); desktop.addEventListener('change', place);
  }

  if (motion) {
    const mm = gsap.matchMedia();
    /* визит: горизонтальная лента на закреплённом экране (только широкий экран) */
    mm.add('(min-width: 900px)', () => {
      const vp = $('.visit__pin'), track = $('[data-visit-track]'), bar = $('[data-visit-bar]');
      if (!vp || !track) return;
      const dist = () => Math.max(0, track.scrollWidth - innerWidth);
      const move = gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: vp, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.6, invalidateOnRefresh: true, onUpdate: (s) => { if (bar) bar.style.transform = `scaleX(${0.25 + s.progress * 0.75})`; } } });
      $$('.step__no').forEach((n) => gsap.fromTo(n, { xPercent: 30 }, { xPercent: -8, ease: 'none', scrollTrigger: { trigger: n, containerAnimation: move, start: 'left right', end: 'right left', scrub: true } }));
      gsap.utils.toArray('.work').forEach((w, i) => gsap.from(w, { opacity: 0, y: 36, duration: 0.8, ease: 'expo.out', delay: i * 0.06, scrollTrigger: { trigger: '.works__list', start: 'top 80%' } }));
    });
    /* цифры «0 ₽» выезжают сбоку, оценка и подпись в подвале плывут */
    if (desktop.matches) $$('.zero__glyph').forEach((g, i) => gsap.from(g, { xPercent: i ? 22 : -22, ease: 'none', scrollTrigger: { trigger: g, start: 'top bottom', end: 'top 35%', scrub: 0.5 } }));
    gsap.to('.reviews__num', { yPercent: -12, ease: 'none', scrollTrigger: { trigger: '.reviews', start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.fromTo('[data-crew] video', { scale: 1.25 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '[data-crew]', start: 'top bottom', end: 'bottom bottom', scrub: true } });
    gsap.from('[data-crew] h2', { yPercent: 60, opacity: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '[data-crew]', start: 'top 45%' } });
    gsap.from('.foot__mark', { yPercent: 28, ease: 'none', scrollTrigger: { trigger: '.foot', start: 'top bottom', end: 'bottom bottom', scrub: true } });
    gsap.from('.book__phone span', { yPercent: 105, duration: 1, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: '.book__phone', start: 'top 88%' } });
    addEventListener('load', () => ScrollTrigger.refresh());
  }

  /* --- оценка: счёт до 5,0 --- */
  const score = $('[data-score]');
  if (score && !reduce) {
    new IntersectionObserver(([e], o) => {
      if (!e.isIntersecting) return; o.disconnect();
      const t0 = performance.now(), dur = 1400;
      const step = (t) => { const k = Math.min(1, (t - t0) / dur), v = 5 * (1 - Math.pow(1 - k, 4)); score.textContent = v.toFixed(1).replace('.', ','); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }, { threshold: 0.4 }).observe(score);
  }

  /* --- нижняя панель на телефоне уходит, когда виден блок записи --- */
  const dock = $('.dock'), book = $('#book');
  if (dock && book) {
    const off = new Set();
    const io = new IntersectionObserver((es) => { es.forEach((e) => { if (e.isIntersecting) off.add(e.target); else off.delete(e.target); }); dock.classList.toggle('is-off', off.size > 0); }, { threshold: 0.15 });
    io.observe(book); if (pin) io.observe(pin);
  }

  /* --- меню на телефоне: закрывается по Escape и при переходе по ссылке --- */
  const menu = $('[data-menu]');
  if (menu) {
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.open) { menu.open = false; $('summary', menu).focus(); } });
    $$('a', menu).forEach((a) => a.addEventListener('click', () => { menu.open = false; }));
  }

  /* --- форма: проверяет поля; адрес отправки ещё не подключён --- */
  const form = $('[data-form]');
  if (form) {
    const note = $('[data-form-note]', form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let bad = null;
      $$('input[required]', form).forEach((i) => { const ok = i.type === 'checkbox' ? i.checked : i.value.trim().length > 1; i.setAttribute('aria-invalid', !ok); if (!ok && !bad) bad = i; });
      if (bad) { note.textContent = bad.name === 'agree' ? 'Отметьте согласие, без него мы не можем перезвонить.' : 'Заполните имя и телефон.'; bad.focus(); return; }
      note.textContent = 'Форма пока не подключена к сервису. Позвоните или напишите в Telegram: +7 993 133-93-36.';
    });
  }
})();
