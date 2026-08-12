/* ============================================================
   STOMTECH PRO — интерактив и моушн
   Ванильный JS, без зависимостей. Каждый модуль самодостаточен:
   если на странице нет нужной разметки — модуль просто не работает.
   ============================================================ */
(function () {
  'use strict';

  var TG_URL = 'https://t.me/stomtechpro';

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

    // Показать элемент и убедиться, что он действительно стал видимым.
    // Класс is-in опирается на правило в style.css. Если таблица стилей пришла
    // битой, устаревшей или не пришла вовсе, правило не сработает — и блок
    // останется прозрачным. Через 2 с проверяем факт и дожимаем инлайном:
    // пустой страницы не будет даже при испорченном CSS.
    function reveal(el) {
      el.classList.add('is-in');
      setTimeout(function () {
        var cs = getComputedStyle(el);
        var hidden =
          parseFloat(cs.opacity) < 0.9 ||
          // вариант «шторка»: блок остаётся обрезанным, хотя непрозрачен
          (el.dataset.reveal === 'clip' && cs.clipPath !== 'none' && cs.clipPath !== 'inset(0px)');
        if (hidden) {
          el.style.opacity = '1';
          el.style.transform = 'none';
          el.style.clipPath = 'none';
        }
      }, 2000);
    }

    if (!('IntersectionObserver' in window) || reduced) {
      items.forEach(reveal);
      return;
    }

    // Наблюдатель включается только после первого отрисованного кадра.
    // Если сменить стиль до первой отрисовки, браузер заводит переход,
    // у которого не разрешается время старта: он остаётся в начальной точке
    // (opacity 0) навсегда — первый экран выглядит пустым.
    // Два кадра гарантируют, что исходное состояние уже отрисовано.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            // элемент уже прокручен выше экрана (переход по якорю, восстановление
            // позиции, быстрый скролл) — показываем сразу, без анимации
            if (!e.isIntersecting && e.boundingClientRect.bottom > 0) return;
            reveal(e.target);
            io.unobserve(e.target);
          });
        }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });
        items.forEach(function (el) { io.observe(el); });
      });
    });

    // последний рубеж: что бы ни случилось, через 4 секунды контент виден
    setTimeout(function () { items.forEach(reveal); }, 4000);
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
     Шаги: дорожки заполняются по очереди, одна за другой
     --------------------------------------------------------- */
  function initSteps() {
    var groups = $$('.steps');
    if (!groups.length) return;

    groups.forEach(function (g) {
      $$('.step', g).forEach(function (s, i) { s.style.setProperty('--sd', i * 420 + 'ms'); });
    });

    if (reduced || !('IntersectionObserver' in window)) {
      groups.forEach(function (g) { g.classList.add('is-run'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-run');
        io.unobserve(e.target);
      });
    }, { threshold: 0.25 });
    groups.forEach(function (g) { io.observe(g); });
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
     Корзина

     Состояние — только количества по артикулам, в localStorage:
     { "ULTRA-170": 2 }. Цены здесь не храним, они всегда берутся из
     window.__PRODUCTS (собран из tools/products.json). Иначе после смены
     прайса у вернувшегося посетителя в корзине осталась бы старая цена.

     Когда появится сервер, сумму всё равно будет пересчитывать он: цифры
     из браузера доверия не заслуживают. Здесь сумма нужна только чтобы
     клиника видела порядок трат до отправки заявки.
     --------------------------------------------------------- */
  var CART_KEY = 'stomtech-cart';
  var PRODUCTS = Array.isArray(window.__PRODUCTS) ? window.__PRODUCTS : [];
  var BY_SKU = {};
  PRODUCTS.forEach(function (p) { BY_SKU[p.sku] = p; });

  function cartRead() {
    try {
      var raw = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
      var clean = {};
      // отбрасываем артикулы, которых больше нет в прайсе, и мусорные количества
      Object.keys(raw).forEach(function (sku) {
        var n = parseInt(raw[sku], 10);
        if (BY_SKU[sku] && n > 0) clean[sku] = Math.min(n, 999);
      });
      return clean;
    } catch (e) { return {}; }
  }

  function cartWrite(cart) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
    cartRender();
  }

  function cartCount(cart) {
    return Object.keys(cart).reduce(function (n, sku) { return n + cart[sku]; }, 0);
  }

  // Позиции без цены («по запросу») в сумму не входят, но в заявку попадают:
  // менеджер посчитает их вручную при подтверждении.
  function cartSum(cart) {
    return Object.keys(cart).reduce(function (s, sku) {
      var p = BY_SKU[sku].price;
      return p == null ? s : s + p * cart[sku];
    }, 0);
  }

  function cartHasOnRequest(cart) {
    return Object.keys(cart).some(function (sku) { return BY_SKU[sku].price == null; });
  }

  var rub = function (n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
  };

  /* Отправка события электронной коммерции. Метрика уже инициализирована
     с ecommerce:"dataLayer" — остаётся класть события в нужном формате. */
  function ecommerce(action, items) {
    if (!window.dataLayer) return;
    var payload = { currencyCode: 'RUB' };
    payload[action] = {
      products: items.map(function (it) {
        return { id: it.sku, name: BY_SKU[it.sku].title, price: BY_SKU[it.sku].price, quantity: it.qty };
      }),
    };
    window.dataLayer.push({ ecommerce: payload });
  }

  function cartSet(sku, qty, opts) {
    if (!BY_SKU[sku]) return;
    var cart = cartRead();
    var was = cart[sku] || 0;
    qty = Math.max(0, Math.min(999, qty));
    if (qty === was) return;
    if (qty === 0) delete cart[sku]; else cart[sku] = qty;
    cartWrite(cart);
    if (!(opts && opts.silent)) {
      ecommerce(qty > was ? 'add' : 'remove', [{ sku: sku, qty: Math.abs(qty - was) }]);
    }
  }

  /* Перерисовка всего, что показывает корзину: счётчик в шапке, строки и сумма
     в каждой форме заказа (их две — окно и страница zakaz.html). */
  function cartRender() {
    var cart = cartRead();
    var count = cartCount(cart);
    var sum = cartSum(cart);
    var skus = Object.keys(cart);

    $$('[data-cart-count]').forEach(function (el) { el.textContent = count; });
    $$('.cart-btn').forEach(function (el) { el.hidden = count === 0; });

    $$('[data-cart-lines]').forEach(function (box) {
      box.innerHTML = skus.map(function (sku) {
        var p = BY_SKU[sku];
        var sum = p.price == null ? 'цена по запросу' : rub(p.price * cart[sku]);
        var each = p.price == null ? 'цену подтвердит менеджер' : rub(p.price) + ' за упаковку';
        return '<div class="qty-row" data-name="' + p.title + ' — ' + sum + '" data-sku="' + sku + '">' +
          '<span class="cart-name">' + p.title + '<small>' + each + '</small></span>' +
          '<span class="qty-ctl">' +
            '<button type="button" data-step="-" aria-label="Убрать одну упаковку: ' + p.title + '"><i class="i i-minus" aria-hidden="true"></i></button>' +
            '<span>' + cart[sku] + '</span>' +
            '<button type="button" data-step="+" aria-label="Добавить одну упаковку: ' + p.title + '"><i class="i i-plus" aria-hidden="true"></i></button>' +
          '</span></div>';
      }).join('');
    });

    // блоки покупки под товарами: кнопка или счётчик
    $$('[data-buy]').forEach(function (box) {
      var n = cart[box.getAttribute('data-buy')] || 0;
      var btn = $('.btn-buy', box), qty = $('.buy-qty', box);
      if (btn) btn.hidden = n > 0;
      if (qty) qty.hidden = n === 0;
      var out = $('[data-buy-qty]', box);
      if (out) out.textContent = n;
    });

    $$('[data-cart-empty]').forEach(function (el) { el.hidden = count > 0; });
    $$('[data-cart-total]').forEach(function (el) { el.hidden = count === 0; });
    $$('[data-cart-sum]').forEach(function (el) { el.textContent = rub(sum); });
    $$('[data-cart-note]').forEach(function (el) { el.hidden = !cartHasOnRequest(cart); });
    $$('form[data-cart-form] input[name="total"]').forEach(function (el) {
      el.value = count ? rub(sum) : '';
    });
  }

  function initCart() {
    if (!PRODUCTS.length) return;

    // «В корзину» на карточках и страницах продуктов
    $$('[data-add]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var sku = btn.getAttribute('data-add');
        var cart = cartRead();
        cartSet(sku, (cart[sku] || 0) + 1);
        toast(BY_SKU[sku].title + ' — в корзине');
      });
    });

    // плюс-минус в блоке покупки под товаром
    $$('[data-buy]').forEach(function (box) {
      var sku = box.getAttribute('data-buy');
      $$('button[data-step]', box).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var cart = cartRead();
          cartSet(sku, (cart[sku] || 0) + (btn.dataset.step === '+' ? 1 : -1));
        });
      });
    });

    // плюс-минус внутри строк корзины (строки перерисовываются, поэтому слушаем на форме)
    $$('[data-cart-lines]').forEach(function (box) {
      box.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('button[data-step]') : null;
        if (!btn) return;
        var row = btn.closest('.qty-row');
        var sku = row && row.getAttribute('data-sku');
        if (!sku) return;
        var cart = cartRead();
        cartSet(sku, (cart[sku] || 0) + (btn.dataset.step === '+' ? 1 : -1));
      });
    });

    // корзина живёт в другой вкладке того же сайта — синхронизируем
    window.addEventListener('storage', function (e) { if (e.key === CART_KEY) cartRender(); });

    cartRender();
  }

  /* ---------------------------------------------------------
     Уведомление о cookie

     Метрика с вебвизором пишет действия на странице, поэтому предупредить
     обязаны. Полоса не блокирует сайт: в России достаточно информировать,
     а модальное окно поверх контента портит первое впечатление и мешает
     поисковику. Согласие запоминаем, чтобы не показывать повторно.
     --------------------------------------------------------- */
  function initCookies() {
    var KEY = 'stomtech-cookies';
    try { if (localStorage.getItem(KEY)) return; } catch (e) { return; }

    var bar = document.createElement('div');
    bar.className = 'cookie-bar';
    bar.setAttribute('role', 'note');
    bar.innerHTML = '<p>Сайт использует файлы cookie: они нужны для работы корзины и для статистики посещаемости. ' +
      'Подробнее — в <a href="/politika">политике обработки персональных данных</a>.</p>' +
      '<button type="button" class="btn btn-primary btn-sm">Понятно</button>';
    document.body.appendChild(bar);
    // класс на body сдвигает плавающие кнопки вверх, чтобы полоса их не накрыла
    document.body.classList.add('has-cookie-bar');
    requestAnimationFrame(function () { bar.classList.add('show'); });

    $('button', bar).addEventListener('click', function () {
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
      bar.classList.remove('show');
      document.body.classList.remove('has-cookie-bar');
      setTimeout(function () { bar.remove(); }, 400);
    });
  }

  /* ---------------------------------------------------------
     Тип покупателя

     Спрашиваем до реквизитов: физлицам мы не отгружаем, и узнать об этом
     человек должен сразу, а не после того как заполнит ИНН и КПП.
     У выбранного «физического лица» поля реквизитов прячутся и перестают
     быть обязательными — иначе форма молча не отправится.
     --------------------------------------------------------- */
  function initBuyerType() {
    $$('form[data-cart-form]').forEach(function (form) {
      var opts = $$('[data-buyer]', form);
      if (!opts.length) return;
      var note = $('[data-buyer-note]', form);
      var fields = $('[data-legal-fields]', form);
      var card = $('[data-legal-card]', form);
      var required = $$('[data-inn],[data-org],[data-card]', form);

      function apply() {
        var person = !!$('[data-buyer="person"]:checked', form);
        if (note) note.hidden = !person;
        if (fields) fields.hidden = person;
        // Скрытое поле файла всё равно участвует в проверке формы,
        // и браузер отказался бы отправлять её с невидимой ошибкой.
        // Поэтому required снимается вместе с показом — см. цикл ниже.
        if (card) card.hidden = person;
        required.forEach(function (el) {
          if (person) el.removeAttribute('required');
          else el.setAttribute('required', '');
        });
      }

      opts.forEach(function (el) { el.addEventListener('change', apply); });
      apply();
    });
  }

  /* ---------------------------------------------------------
     Реквизиты по ИНН (DaData)

     Главное трение B2B-заказа — вручную набивать название, КПП, ОГРН и юрадрес.
     Вводится только ИНН, остальное подставляется. Запрос уходит прямо из браузера:
     это ключ подсказок DaData, он для того и предназначен и ограничен доменом
     в личном кабинете. Секретный ключ стандартизации сюда класть нельзя.

     Если ключа нет, поля просто заполняются руками — форма работает как раньше.
     --------------------------------------------------------- */
  function initInn() {
    var token = window.__DADATA;
    if (!token) return;

    var URL_ = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party';
    var cache = {};

    $$('[data-inn]').forEach(function (input) {
      var form = input.form;
      if (!form) return;
      var status = $('[data-inn-status]', form);
      var timer;

      function say(text, kind) {
        if (!status) return;
        status.textContent = text || '';
        status.hidden = !text;
        status.className = 'note inn-status' + (kind ? ' is-' + kind : '');
      }

      function fill(party) {
        var d = party.data || {};
        var set = function (sel, value) {
          var el = $(sel, form);
          if (el) el.value = value || '';
        };
        set('[data-org]', party.value);
        set('[data-kpp]', d.kpp);
        set('[data-ogrn]', d.ogrn);
        set('[data-legal-address]', d.address && d.address.value);
        var liquidated = d.state && d.state.status && d.state.status !== 'ACTIVE';
        say(liquidated
          ? 'Организация найдена, но по данным реестра не действует. Проверьте ИНН.'
          : 'Реквизиты подставлены: ' + (d.kpp ? 'КПП ' + d.kpp + ', ' : '') + 'ОГРН ' + (d.ogrn || '—'),
          liquidated ? 'warn' : 'ok');
      }

      function lookup(inn) {
        if (cache[inn]) { fill(cache[inn]); return; }
        say('Ищем в реестре…');
        fetch(URL_, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: 'Token ' + token,
          },
          body: JSON.stringify({ query: inn, count: 1 }),
        })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
          .then(function (data) {
            var party = data && data.suggestions && data.suggestions[0];
            if (!party) { say('По этому ИНН ничего не нашлось — заполните название вручную.', 'warn'); return; }
            cache[inn] = party;
            fill(party);
          })
          // Сеть или лимит запросов. Заказ важнее подсказки: молча отпускаем
          // человека заполнять поля руками, ошибку не показываем как проблему.
          .catch(function () { say('Не удалось получить реквизиты — заполните название вручную.', 'warn'); });
      }

      function check() {
        var inn = input.value.replace(/\D/g, '');
        if (inn.length !== 10 && inn.length !== 12) { say(''); return; }
        lookup(inn);
      }

      input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(check, 400);
      });
      input.addEventListener('blur', check);
    });
  }

  /* ---------------------------------------------------------
     Окна поверх страницы: заказ и условия оплаты/доставки.
     Триггеры остаются обычными ссылками (zakaz.html, oplata-i-dostavka.html) —
     если <dialog> не поддержан или скрипт не доехал, посетитель просто
     переходит на соответствующую страницу.
     --------------------------------------------------------- */
  function initModal(id, attr, focusFirst) {
    var modal = document.getElementById(id);
    if (!modal || typeof modal.showModal !== 'function') return;

    $$('[' + attr + ']').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        modal.showModal();
        // На телефоне не ставим курсор в поле: иначе сразу выскакивает клавиатура
        // и закрывает половину формы. На десктопе — наоборот, удобно печатать сразу.
        if (!focusFirst) return;
        var first = $('input', modal);
        if (first && window.matchMedia('(min-width: 861px)').matches) first.focus();
      });
    });

    $$('[data-close]', modal).forEach(function (b) {
      b.addEventListener('click', function () { modal.close(); });
    });
    // клик по затемнению вне карточки закрывает окно
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });
  }

  /* ---------------------------------------------------------
     Заявки: уходят на сервер, оттуда — в Битрикс24

     Раньше форма ничего не отправляла: собирала текст, открывала Telegram
     и просила посетителя вставить его руками. В CRM при этом не попадало
     ничего. Теперь заявка уходит на /api/order, а обработчик заводит
     компанию, контакт, сделку с позициями и счёт.

     Резервный путь оставлен: если сервер не ответил, форма не молчит,
     а предлагает написать в Telegram — терять заявку из-за сбоя нельзя.
     --------------------------------------------------------- */
  var ORDER_URL = '/api/order';

  function leadText(form, title) {
    var lines = ['Заявка с сайта STOMTECH PRO'];
    if (title) lines.push('Тип: ' + title);
    lines.push('—————————');
    $$('input,select,textarea', form).forEach(function (f) {
      if (f.type === 'checkbox' || !f.name || f.name === 'website' || !f.value.trim()) return;
      lines.push((f.getAttribute('data-label') || f.name) + ': ' + f.value.trim());
    });
    $$('.qty-row', form).forEach(function (row) {
      var nm = row.getAttribute('data-name');
      var q = $('.qty-ctl span', row);
      if (nm && q && parseInt(q.textContent, 10) > 0) lines.push(nm + ': ' + q.textContent + ' шт');
    });
    return lines.join('\n');
  }

  /* ---------------------------------------------------------
     Телефон: всегда +7 и человеческая разбивка

     Люди пишут номер как придётся — «8 930…», «+7(930)…», десять цифр подряд.
     В CRM из-за этого один и тот же человек заводится дважды, а автодозвон
     не срабатывает. Маска приводит ввод к одному виду прямо в поле, а сервер
     повторяет ту же нормализацию: на клиентскую проверку полагаться нельзя.

     Форматируем российские номера: и «8 930…», и «+7 930…», и просто десять
     цифр приводятся к одному виду. Вставленный номер другой страны — длиннее
     одиннадцати цифр — поле не трогает: потерять заявку из ближнего зарубежья
     хуже, чем принять её в чужом формате.
     --------------------------------------------------------- */
  function formatPhone(raw) {
    // Поле уже показывает наш префикс? Тогда первая семёрка в разборе — это он,
    // а не часть номера, и лишние цифры сверх номера надо просто отбрасывать.
    // Судить по количеству цифр нельзя: в «+7 (930) 766-99-88» их одиннадцать,
    // и следующее нажатие объявило бы номер иностранным.
    var masked = /^\+7/.test(raw);
    var d = raw.replace(/\D/g, '');
    if (!d) return '';

    // Больше одиннадцати цифр в чистом поле — это не российский номер.
    if (!masked && d.length > 11) return '+' + d;

    // Снимаем код страны, который сами же и показали.
    if (masked && d[0] === '7') d = d.slice(1);
    else if (!masked && (d[0] === '7' || d[0] === '8')) d = d.slice(1);

    // Остался ведущий ноль-восемь при полном наборе — это междугородний префикс:
    // человек набрал «8 930 …» поверх готового «+7». Убираем его только теперь,
    // когда номер набран целиком: пока цифр меньше, восьмёрка может быть началом
    // кода города — 812, 831, 843.
    if (d.length === 11 && d[0] === '8') d = d.slice(1);

    d = d.slice(0, 10);
    var out = '+7';
    if (d.length) out += ' (' + d.slice(0, 3);
    if (d.length >= 3) out += ') ' + d.slice(3, 6);
    if (d.length > 6) out += '-' + d.slice(6, 8);
    if (d.length > 8) out += '-' + d.slice(8, 10);
    return out;
  }

  function initPhoneMask() {
    $$('input[type=tel]').forEach(function (el) {
      // Встали в пустое поле — сразу показываем «+7 »: человеку видно,
      // что код страны вводить не надо. Набор через восьмёрку это не ломает:
      // formatPhone снимает её, когда номер набран целиком.
      el.addEventListener('focus', function () {
        if (!el.value) el.value = '+7 ';
      });
      el.addEventListener('input', function () {
        var atEnd = el.selectionStart === el.value.length;
        el.value = formatPhone(el.value);
        // Курсор возвращаем в конец только если он там и был: иначе правка
        // в середине номера каждый раз выбрасывала бы его в хвост.
        if (atEnd) el.setSelectionRange(el.value.length, el.value.length);
      });
      // «+7» без единой цифры — это не введённый номер, а мусор в поле:
      // он мешает и браузерной проверке required, и менеджеру.
      el.addEventListener('blur', function () {
        if (/^\+7[\s(]*$/.test(el.value)) el.value = '';
      });
    });
  }

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

        var btn = form.querySelector('button[type=submit]');
        if (btn && btn.disabled) return;              // защита от двойного нажатия
        var btnHtml = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Отправляем…'; }

        var title = form.getAttribute('data-lead') || 'Заявка';
        var data = { form: title, consent: true, page: location.pathname, items: [] };
        $$('input,select,textarea', form).forEach(function (f) {
          if (f.type === 'checkbox' || f.type === 'file' || !f.name) return;
          if (f.type === 'radio' && !f.checked) return;
          data[f.name] = f.value.trim();
        });

        // В корзине сервер доверяет только артикулу и количеству: цену
        // и сумму он считает сам по своему прайсу.
        var cart = form.hasAttribute('data-cart-form') ? cartRead() : {};
        Object.keys(cart).forEach(function (sku) {
          if (cart[sku] > 0) data.items.push({ sku: sku, qty: cart[sku] });
        });

        // Ключ повторной отправки: если посетитель нажмёт кнопку дважды
        // или у него моргнёт сеть, второй заказ в CRM не появится.
        data.idempotencyKey = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);

        function restore() {
          if (btn) { btn.disabled = false; btn.innerHTML = btnHtml; }
        }

        function accepted() {
          if (form.hasAttribute('data-cart-form')) {
            var skus = Object.keys(cart);
            if (skus.length) {
              ecommerce('purchase', skus.map(function (s) { return { sku: s, qty: cart[s] }; }));
              cartWrite({});
            }
          }
          form.reset();
          $$('.qty-ctl span', form).forEach(function (s) { s.textContent = '0'; });
          restore();
          var dlg = form.closest('dialog');
          if (dlg && dlg.open) dlg.close();
          toast('Заявка принята. Свяжемся в течение рабочего дня и пришлём счёт');
        }

        // Если приложена карточка компании, заявка уходит как multipart:
        // файл в JSON не завернуть, не раздув его на треть базовой кодировкой.
        // Сервер понимает оба вида — контракт ручки от этого не меняется.
        var fileInput = form.querySelector('input[type=file][data-card]');
        var file = fileInput && fileInput.files && fileInput.files[0];
        var body, headers;
        if (file) {
          body = new FormData();
          body.append('payload', JSON.stringify(data));
          body.append('card', file);
          headers = undefined;   // границу multipart проставит браузер сам
        } else {
          body = JSON.stringify(data);
          headers = { 'Content-Type': 'application/json' };
        }

        fetch(ORDER_URL, { method: 'POST', headers: headers, body: body })
          .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
          .then(function (res) {
            if (res && res.ok) { accepted(); return; }
            restore();
            toast(res && res.error ? res.error : 'Не получилось отправить — попробуйте ещё раз');
          })
          .catch(function () {
            // Сервер недоступен. Заявку терять нельзя: кладём текст в буфер
            // и открываем Telegram — это хуже автоматики, но лучше молчания.
            restore();
            if (navigator.clipboard) navigator.clipboard.writeText(leadText(form, title)).catch(function () {});
            toast('Связь с сервером пропала. Текст заявки скопирован — отправьте нам в Telegram');
            window.open(TG_URL, '_blank', 'noopener');
          });
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
    initCounters();
    initSpotlight();
    initHeroParallax();
    initSteps();
    initMarquee();
    initArticle();
    initBlogFilter();
    initFab();
    initCart();
    initCookies();
    initBuyerType();
    initInn();
    initModal('order-modal', 'data-order', true);
    initModal('terms-modal', 'data-terms', false);
    initPhoneMask();
    initForms();
    var y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
