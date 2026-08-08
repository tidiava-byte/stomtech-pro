/* STOMTECH PRO — site interactions (vanilla JS, no deps) */
(function () {
  'use strict';

  // Telegram + email endpoints for lead forms
  var TG_URL = 'https://t.me/stomtechpro';
  var EMAIL = 'info@stomtech.pro';

  /* ---- header shadow on scroll ---- */
  var header = document.querySelector('.header');
  function onScroll() {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- mobile menu ---- */
  var burger = document.querySelector('.burger');
  var navLinks = document.querySelector('.nav-links');
  if (burger && navLinks) {
    burger.addEventListener('click', function () {
      var open = navLinks.classList.toggle('open');
      burger.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    navLinks.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        navLinks.classList.remove('open');
        burger.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  /* ---- accordion ---- */
  document.querySelectorAll('.acc-head').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.acc-item');
      var body = item.querySelector('.acc-body');
      var open = item.classList.toggle('open');
      body.style.maxHeight = open ? body.scrollHeight + 'px' : 0;
    });
  });

  /* ---- quantity steppers ---- */
  document.querySelectorAll('.qty-ctl').forEach(function (ctl) {
    var span = ctl.querySelector('span');
    var val = parseInt(span.textContent, 10) || 0;
    ctl.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        val = Math.max(0, val + (b.dataset.step === '+' ? 1 : -1));
        span.textContent = val;
      });
    });
  });

  /* ---- reveal on scroll ---- */
  var revs = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revs.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    revs.forEach(function (el) { io.observe(el); });
  } else {
    revs.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---- lead forms: compose message, send via Telegram / mailto ---- */
  document.querySelectorAll('form[data-lead]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var consent = form.querySelector('input[type=checkbox][required]');
      if (consent && !consent.checked) { alert('Пожалуйста, подтвердите согласие на обработку данных.'); return; }

      var lines = ['Заявка с сайта STOMTECH PRO', '—————————'];
      var title = form.getAttribute('data-lead');
      if (title) lines.splice(1, 0, 'Тип: ' + title);

      form.querySelectorAll('input,select,textarea').forEach(function (f) {
        if (f.type === 'checkbox' || !f.name) return;
        var label = f.getAttribute('data-label') || f.name;
        if (f.value && f.value.trim()) lines.push(label + ': ' + f.value.trim());
      });
      // quantities
      form.querySelectorAll('.qty-row').forEach(function (row) {
        var nm = row.getAttribute('data-name');
        var q = row.querySelector('.qty-ctl span');
        if (nm && q && parseInt(q.textContent, 10) > 0) lines.push(nm + ': ' + q.textContent + ' шт');
      });

      var text = lines.join('\n');
      var choice = confirm('Отправить заявку через Telegram?\n\nОК — Telegram, Отмена — по почте.');
      if (choice) {
        // Telegram can't prefill arbitrary chat text via link; open chat + copy to clipboard
        copyToClipboard(text);
        window.open(TG_URL, '_blank');
        showToast('Открываем Telegram. Текст заявки скопирован — вставьте в чат.');
      } else {
        window.location.href = 'mailto:' + EMAIL +
          '?subject=' + encodeURIComponent('Заявка с сайта' + (title ? ' — ' + title : '')) +
          '&body=' + encodeURIComponent(text);
      }
      form.reset();
      form.querySelectorAll('.qty-ctl span').forEach(function (s) { s.textContent = '0'; });
    });
  });

  function copyToClipboard(t) {
    if (navigator.clipboard) { navigator.clipboard.writeText(t).catch(function () {}); }
  }
  function showToast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#0A2540;' +
      'color:#fff;padding:14px 22px;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.3);' +
      'z-index:999;font-size:15px;max-width:90%;text-align:center';
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 3200);
    setTimeout(function () { t.remove(); }, 3700);
  }

  /* ---- footer year ---- */
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();
