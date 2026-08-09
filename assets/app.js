/* ============================================================
   STOMTECH PRO — интерактив и моушн
   Ванильный JS, без зависимостей. Каждый модуль самодостаточен:
   если на странице нет нужной разметки — модуль просто не работает.
   ============================================================ */
(function () {
  'use strict';

  var TG_URL = 'https://t.me/stomtechpro';
  var EMAIL = 'info@stomtech.pro';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------------------------------------------------
     Появление блоков при скролле + каскад внутри группы
     --------------------------------------------------------- */
  function initReveal() {
    var items = $$('[data-reveal]');
    if (!items.length) return;

    // каскад: детям блока с data-stagger назначаем нарастающую задержку
    $$('[data-stagger]').forEach(function (group) {
      var step = parseInt(group.dataset.stagger, 10) || 90;
      $$('[data-reveal]', group).forEach(function (el, i) {
        el.style.setProperty('--d', i * step + 'ms');
      });
    });

    if (!('IntersectionObserver' in window) || reduced) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        // элемент уже прокручен выше экрана (переход по якорю, восстановление
        // позиции, быстрый скролл) — показываем сразу, без анимации
        if (!e.isIntersecting && e.boundingClientRect.bottom > 0) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) { io.observe(el); });

    // последний рубеж: что бы ни случилось, через 4 секунды контент виден
    setTimeout(function () {
      items.forEach(function (el) { el.classList.add('is-in'); });
    }, 4000);
  }

  /* ---------------------------------------------------------
     Шапка: уплотняется при скролле
     --------------------------------------------------------- */
  function initHeader() {
    var header = $('.header');
    if (!header) return;
    var tick = false;
    function upd() { header.classList.toggle('scrolled', window.scrollY > 10); tick = false; }
    window.addEventListener('scroll', function () {
      if (!tick) { tick = true; requestAnimationFrame(upd); }
    }, { passive: true });
    upd();
  }

  /* ---------------------------------------------------------
     Мобильное меню
     --------------------------------------------------------- */
  function initMenu() {
    var burger = $('.burger'), nav = $('.nav-links');
    if (!burger || !nav) return;
    function close() {
      nav.classList.remove('open');
      burger.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
    burger.setAttribute('aria-expanded', 'false');
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    });
    $$('a', nav).forEach(function (a) { a.addEventListener('click', close); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  /* ---------------------------------------------------------
     Аккордеон (высота раскрывается на CSS через grid-template-rows)
     --------------------------------------------------------- */
  function initAccordion() {
    $$('.acc-head').forEach(function (btn) {
      var item = btn.closest('.acc-item');
      if (!item) return;
      btn.setAttribute('aria-expanded', item.classList.contains('open') ? 'true' : 'false');
      btn.addEventListener('click', function () {
        var open = item.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(open));
      });
    });
  }

  /* ---------------------------------------------------------
     Счётчик количества в форме заказа
     --------------------------------------------------------- */
  function initQty() {
    $$('.qty-ctl').forEach(function (ctl) {
      var out = $('span', ctl);
      if (!out) return;
      var val = parseInt(out.textContent, 10) || 0;
      $$('button', ctl).forEach(function (b) {
        b.addEventListener('click', function () {
          val = Math.max(0, val + (b.dataset.step === '+' ? 1 : -1));
          out.textContent = val;
        });
      });
    });
  }

  /* ---------------------------------------------------------
     Цифры, которые «набегают» при появлении
     Формат хранится в data-count: "1 990", "14 мкм", "100+"
     --------------------------------------------------------- */
  function initCounters() {
    var nodes = $$('[data-count]');
    if (!nodes.length) return;
    if (reduced || !('IntersectionObserver' in window)) return;

    function run(el) {
      var raw = el.dataset.count;
      var m = raw.match(/\d[\d\s.,]*/);
      if (!m) return;
      // хвостовые пробел/точка/запятая относятся к тексту, а не к числу:
      // «14 мкм» -> число «14» и суффикс « мкм», а не «14 » и «мкм»
      var numStr = m[0].replace(/[\s.,]+$/, '');
      var target = parseFloat(numStr.replace(/\s/g, '').replace(',', '.'));
      if (!isFinite(target)) return;
      var decimals = (numStr.split(/[.,]/)[1] || '').length;
      var pre = raw.slice(0, m.index), post = raw.slice(m.index + numStr.length);
      var start = performance.now(), dur = 1400;

      (function frame(now) {
        var p = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - p, 4);          // expo-out
        var v = target * eased;
        var shown = decimals
          ? v.toFixed(decimals).replace('.', ',')
          : Math.round(v).toLocaleString('ru-RU').replace(/,/g, ' ');
        el.textContent = pre + shown + post;
        if (p < 1) requestAnimationFrame(frame);
      })(start);
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        run(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.6 });
    nodes.forEach(function (el) { io.observe(el); });
  }

  /* ---------------------------------------------------------
     Курсорный «прожектор» на карточках бенто
     --------------------------------------------------------- */
  function initSpotlight() {
    if (reduced || !window.matchMedia('(hover:hover)').matches) return;
    $$('.bento-cell, .feat, .form-card').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* ---------------------------------------------------------
     Лёгкий параллакс флаконов в герое (за курсором)
     --------------------------------------------------------- */
  function initHeroParallax() {
    var hero = $('.hero');
    if (!hero || reduced || !window.matchMedia('(hover:hover)').matches) return;
    var wrap = $('.hero-bottles', hero);
    if (!wrap) return;
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      wrap.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      wrap.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    });
    hero.addEventListener('pointerleave', function () {
      wrap.style.setProperty('--px', 0);
      wrap.style.setProperty('--py', 0);
    });
  }

  /* ---------------------------------------------------------
     Бегущая строка: дублируем содержимое для бесшовной петли
     --------------------------------------------------------- */
  function initMarquee() {
    $$('.marquee-track').forEach(function (track) {
      if (track.dataset.cloned) return;
      var clone = track.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      while (clone.firstChild) track.appendChild(clone.firstChild);
      track.dataset.cloned = '1';
    });
  }

  /* ---------------------------------------------------------
     Статья: прогресс чтения + активный пункт оглавления
     --------------------------------------------------------- */
  function initArticle() {
    var article = $('.article');
    if (!article) return;

    var bar = $('.read-progress');
    if (bar) {
      var tick = false;
      function upd() {
        var r = article.getBoundingClientRect();
        var total = r.height - window.innerHeight;
        var p = total > 0 ? (-r.top) / total : 0;
        bar.style.width = Math.max(0, Math.min(1, p)) * 100 + '%';
        tick = false;
      }
      window.addEventListener('scroll', function () {
        if (!tick) { tick = true; requestAnimationFrame(upd); }
      }, { passive: true });
      window.addEventListener('resize', upd);
      upd();
    }

    var links = $$('.toc a');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var map = {};
    links.forEach(function (a) {
      var el = document.getElementById(a.getAttribute('href').slice(1));
      if (el) map[el.id] = a;
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove('active'); });
        if (map[e.target.id]) map[e.target.id].classList.add('active');
      });
    }, { rootMargin: '-15% 0px -70% 0px' });
    Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
  }

  /* ---------------------------------------------------------
     Блог: фильтр по рубрикам
     --------------------------------------------------------- */
  function initBlogFilter() {
    var chips = $$('[data-filter]');
    var cards = $$('[data-cat]');
    if (!chips.length || !cards.length) return;

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var cat = chip.dataset.filter;
        chips.forEach(function (c) { c.classList.toggle('active', c === chip); });
        cards.forEach(function (card) {
          var show = cat === 'all' || card.dataset.cat === cat;
          card.style.display = show ? '' : 'none';
        });
      });
    });
  }

  /* ---------------------------------------------------------
     Плавающая кнопка связи — появляется после первого экрана
     --------------------------------------------------------- */
  function initFab() {
    var fab = $('.fab');
    if (!fab) return;
    var tick = false;
    function upd() { fab.classList.toggle('show', window.scrollY > window.innerHeight * 0.7); tick = false; }
    window.addEventListener('scroll', function () {
      if (!tick) { tick = true; requestAnimationFrame(upd); }
    }, { passive: true });
    upd();
  }

  /* ---------------------------------------------------------
     Заявки: собираем текст и отправляем в Telegram или на почту
     --------------------------------------------------------- */
  function initForms() {
    $$('form[data-lead]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var consent = form.querySelector('input[type=checkbox][required]');
        if (consent && !consent.checked) {
          toast('Подтвердите согласие на обработку данных');
          consent.focus();
          return;
        }

        var title = form.getAttribute('data-lead');
        var lines = ['Заявка с сайта STOMTECH PRO'];
        if (title) lines.push('Тип: ' + title);
        lines.push('—————————');

        $$('input,select,textarea', form).forEach(function (f) {
          if (f.type === 'checkbox' || !f.name || !f.value.trim()) return;
          lines.push((f.getAttribute('data-label') || f.name) + ': ' + f.value.trim());
        });
        $$('.qty-row', form).forEach(function (row) {
          var nm = row.getAttribute('data-name');
          var q = $('.qty-ctl span', row);
          if (nm && q && parseInt(q.textContent, 10) > 0) lines.push(nm + ': ' + q.textContent + ' шт');
        });

        var text = lines.join('\n');
        if (confirm('Отправить заявку через Telegram?\n\nОК — Telegram, Отмена — по почте.')) {
          if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
          window.open(TG_URL, '_blank', 'noopener');
          toast('Открываем Telegram — текст заявки скопирован, вставьте в чат');
        } else {
          window.location.href = 'mailto:' + EMAIL +
            '?subject=' + encodeURIComponent('Заявка с сайта' + (title ? ' — ' + title : '')) +
            '&body=' + encodeURIComponent(text);
        }
        form.reset();
        $$('.qty-ctl span', form).forEach(function (s) { s.textContent = '0'; });
      });
    });
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); }, 3400);
    setTimeout(function () { t.remove(); }, 3900);
  }

  /* --------------------------------------------------------- */
  function boot() {
    // скрипт доехал — сторож из <head> больше не нужен
    clearTimeout(window.__revealGuard);
    document.documentElement.classList.remove('no-motion');

    initReveal();
    initHeader();
    initMenu();
    initAccordion();
    initQty();
    initCounters();
    initSpotlight();
    initHeroParallax();
    initMarquee();
    initArticle();
    initBlogFilter();
    initFab();
    initForms();
    var y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
