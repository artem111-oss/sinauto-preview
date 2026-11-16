/* Бокс · приложение мастера. Ванильный JS, без анимаций. Без JS формы работают обычной отправкой. */
(function () {
  'use strict';
  var MAX_SIDE = 1600;
  var QUALITY = 0.8;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // --- сжатие фото на клиенте: длинная сторона до 1600 px, JPEG ---
  function loadImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); });
    }
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function compress(file) {
    if (!file || !/^image\//.test(file.type) || /gif|svg/.test(file.type)) return Promise.resolve(file);
    return loadImage(file).then(function (img) {
      var w = img.width, h = img.height;
      var k = Math.min(1, MAX_SIDE / Math.max(w, h));
      if (k === 1 && file.size < 900 * 1024 && file.type === 'image/jpeg') return file;
      var c = document.createElement('canvas');
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (resolve) {
        c.toBlob(function (blob) { resolve(blob || file); }, 'image/jpeg', QUALITY);
      });
    }).catch(function () { return file; });
  }

  function thumb(container, blobOrUrl, kind) {
    var url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    var el;
    if (kind === 'video') { el = document.createElement('video'); el.controls = true; el.preload = 'metadata'; }
    else { el = document.createElement('img'); el.alt = ''; }
    el.src = url;
    container.appendChild(el);
  }

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      body: body,
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json', 'X-Box-Fetch': '1' }
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.message || ('Ошибка ' + r.status));
        return j;
      });
    });
  }

  function say(form, text) {
    var s = $('.js-status', form);
    if (s) s.textContent = text; else if (text) alert(text);
  }

  // --- подтверждение опасных действий ---
  $all('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!confirm(f.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // --- приёмка: копим фото по одному (камера отдаёт по снимку), сжимаем, шлём одной формой ---
  var intake = $('#intake');
  if (intake) {
    var box = $('.js-collect', intake);
    var input = $('input[type=file]', box);
    var thumbs = $('.thumbs', box);
    var count = $('.js-count', box);
    var collected = [];
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      say(intake, 'Сжимаю фото…');
      Promise.all(files.map(compress)).then(function (blobs) {
        blobs.forEach(function (b) { collected.push(b); thumb(thumbs, b, 'photo'); });
        count.textContent = String(collected.length);
        say(intake, '');
      });
    });
    intake.addEventListener('submit', function (e) {
      e.preventDefault();
      var min = parseInt(box.getAttribute('data-min') || '0', 10);
      if (collected.length < min && !confirm('Фото меньше ' + min + '. Всё равно принять?')) return;
      var fd = new FormData(intake);
      fd.delete('photos');
      collected.forEach(function (b, i) { fd.append('photos', b, 'photo-' + (i + 1) + '.jpg'); });
      var btn = $('button[type=submit]', intake);
      btn.disabled = true;
      say(intake, 'Отправляю…');
      post(intake.action, fd).then(function (j) { location.href = j.redirect; })
        .catch(function (err) { btn.disabled = false; say(intake, err.message); });
    });
  }

  // --- осмотр: цвет пункта без перезагрузки ---
  var doneEl = $('.js-done');
  $all('form.js-item').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = e.submitter;
      if (!btn) return;
      var fd = new FormData(f);
      fd.set('color', btn.value);
      var item = f.closest('.item');
      var prev = item.getAttribute('data-color');
      item.setAttribute('data-color', btn.value);
      $all('button[name=color]', f).forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      post(f.action, fd).then(function (j) {
        if (doneEl && j.done != null) doneEl.textContent = j.done;
      }).catch(function (err) {
        if (prev) item.setAttribute('data-color', prev); else item.removeAttribute('data-color');
        alert(err.message);
      });
    });
  });

  $all('form.js-note').forEach(function (f) {
    var ta = $('textarea', f);
    $all('[data-chip]', f).forEach(function (chip) {
      chip.addEventListener('click', function () {
        var t = chip.getAttribute('data-chip');
        ta.value = ta.value ? (ta.value.replace(/[\s,.]+$/, '') + ', ' + t.toLowerCase()) : t;
        ta.focus();
      });
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('button[type=submit]', f);
      btn.disabled = true;
      post(f.action, new FormData(f)).then(function () { btn.textContent = 'Сохранено'; })
        .catch(function (err) { alert(err.message); })
        .then(function () { btn.disabled = false; setTimeout(function () { btn.textContent = 'Сохранить заметку'; }, 1500); });
    });
  });

  // --- загрузка фото/видео: сразу после выбора ---
  $all('form.js-upload').forEach(function (f) {
    var thumbs = $('.thumbs', f);
    $all('input[type=file]', f).forEach(function (input) {
      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(input.files || []);
        input.value = '';
        if (!files.length) return;
        Promise.all(files.map(compress)).then(function (blobs) {
          var fd = new FormData();
          fd.append('stage', $('input[name=stage]', f).value);
          var key = $('input[name=item_key]', f);
          if (key) fd.append('item_key', key.value);
          blobs.forEach(function (b, i) {
            var name = files[i].type.indexOf('video/') === 0 ? files[i].name : ('photo-' + (i + 1) + '.jpg');
            fd.append('file', b, name);
          });
          var label = input.parentNode;
          label.setAttribute('aria-busy', 'true');
          return post(f.action, fd).then(function (j) {
            (j.media || []).forEach(function (m) { thumb(thumbs, m.url, m.kind); });
          }).catch(function (err) { alert(err.message); })
            .then(function () { label.removeAttribute('aria-busy'); });
        });
      });
    });
  });

  // --- ручная запись: свободное время по услуге и дате ---
  var manual = $('#manual');
  if (manual) {
    var svc = $('select[name=service]', manual);
    var day = $('input[name=date]', manual);
    var sel = $('select[name=time]', manual);
    var note = $('.js-slots-note');
    function loadSlots() {
      if (!svc.value || !day.value) return;
      sel.innerHTML = '<option value="">…</option>';
      fetch(sel.getAttribute('data-slots') + '?service=' + encodeURIComponent(svc.value) + '&date=' + encodeURIComponent(day.value),
        { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          sel.innerHTML = '';
          var slots = j.slots || [];
          if (!slots.length) sel.innerHTML = '<option value="">нет свободного времени</option>';
          slots.forEach(function (t) { var o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o); });
          note.textContent = j.message || (slots.length ? 'Свободно: ' + slots.length : '');
        }).catch(function () { note.textContent = 'Не удалось загрузить время'; });
    }
    svc.addEventListener('change', loadSlots);
    day.addEventListener('change', loadSlots);
    loadSlots();
  }

  // --- введённое не теряется при ошибке проверки ---
  // Перед отправкой форма запоминает поля (sessionStorage, только эта вкладка). Если сервер вернул страницу
  // с ошибкой (?err=…), значения подставляются обратно. Без ошибки черновик удаляется. PIN не запоминается.
  (function keepDrafts() {
    var store;
    try { store = window.sessionStorage; store.setItem('box-t', '1'); store.removeItem('box-t'); } catch (e) { return; }
    var forms = $all('form[method="post"]');
    var hasErr = /[?&]err=/.test(location.search) || !!$('.flash--err');
    function key(form, i) { return 'box-draft:' + location.pathname + ':' + (form.getAttribute('action') || '') + ':' + i; }
    function skip(el) { return !el.name || el.type === 'password' || el.type === 'file' || el.type === 'hidden' || el.type === 'submit' || el.type === 'button'; }
    forms.forEach(function (form, i) {
      var k = key(form, i);
      var raw = null;
      try { raw = store.getItem(k); } catch (e) { raw = null; }
      if (raw && hasErr) {
        var saved = {};
        try { saved = JSON.parse(raw); } catch (e) { saved = {}; }
        var restored = false;
        $all('input, select, textarea', form).forEach(function (el, j) {
          if (skip(el)) return;
          var id = el.name + '#' + j;
          if (!(id in saved)) return;
          if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!saved[id];
          else el.value = saved[id];
          restored = true;
        });
        if (restored && !form.querySelector('.js-restored')) {
          var note = document.createElement('p');
          note.className = 'small muted js-restored';
          note.setAttribute('role', 'status');
          note.textContent = 'Вернули то, что вы ввели. Исправьте и сохраните ещё раз.';
          form.insertBefore(note, form.firstChild);
        }
      }
      try { store.removeItem(k); } catch (e) { /* ничего */ }
      form.addEventListener('submit', function () {
        var data = {};
        $all('input, select, textarea', form).forEach(function (el, j) {
          if (skip(el)) return;
          data[el.name + '#' + j] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
        });
        try { store.setItem(k, JSON.stringify(data)); } catch (e) { /* место кончилось — не страшно */ }
      });
    });
  })();
})();
