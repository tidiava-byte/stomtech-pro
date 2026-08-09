/* ============================================================
   STOMTECH PRO — общий каркас страниц.
   Здесь живут: реквизиты, меню, шапка, подвал, <head>.
   Правка в одном месте расходится по всем страницам после `node tools/build.mjs`.
   ============================================================ */

export const SITE = {
  name: 'STOMTECH PRO',
  origin: 'https://stomtech.pro',
  phone: '+7 (930) 766-99-88',
  phoneHref: 'tel:+79307669988',
  email: 'info@stomtech.pro',
  tg: 'https://t.me/stomtechpro',
  wa: 'https://wa.me/79307669988',
  vk: 'https://vk.com/stomtech_pro',
  legal: 'ООО «Дентал Клин»',
  inn: '4632297120',
  address: '305022, г. Курск, ул. Соловьиная, зд. 51, офис 16',
  addressShort: 'г. Курск, ул. Соловьиная, 51',
};

export const NAV = [
  { id: 'catalog', href: 'catalog.html', label: 'Каталог' },
  { id: 'sovmestimost', href: 'sovmestimost.html', label: 'Совместимость' },
  { id: 'dlya-klinik', href: 'dlya-klinik.html', label: 'Для клиник' },
  { id: 'blog', href: 'blog.html', label: 'Блог' },
  { id: 'kontakty', href: 'kontakty.html', label: 'Контакты' },
];

export const AUTHORS = {
  expert: {
    name: 'Экспертная группа STOMTECH PRO',
    role: 'Технологи производства и клинические консультанты',
    initials: 'SP',
    bio: 'Материалы готовит команда производства STOMTECH PRO совместно с практикующими гигиенистами. ' +
         'Мы пишем о том, что проверяем на своём производстве и в клиниках-партнёрах.',
  },
};

/* ---------- <head> ---------- */
function head(m) {
  const canonical = `${SITE.origin}/${m.slug === 'index' ? '' : m.slug + '.html'}`;
  const og = m.ogTitle || m.title;
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${m.title}</title>
<meta name="description" content="${m.description}">${m.keywords ? `\n<meta name="keywords" content="${m.keywords}">` : ''}
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#ffffff">
<meta property="og:type" content="${m.type === 'article' ? 'article' : 'website'}">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${og}">
<meta property="og:description" content="${m.ogDescription || m.description}">
<meta property="og:url" content="${canonical}">
<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="preload" href="assets/fonts/onest-cyrillic-700.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/onest-cyrillic-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="assets/icons.css">
<script>document.documentElement.classList.add('js')</script>${m.jsonld ? `\n<script type="application/ld+json">${JSON.stringify(m.jsonld)}</script>` : ''}`;
}

/* ---------- шапка ---------- */
function header(active) {
  const links = NAV.map(
    (n) => `      <a href="${n.href}"${n.id === active ? ' class="active"' : ''}>${n.label}</a>`
  ).join('\n');
  return `<header class="header">
  <div class="container nav">
    <a href="index.html" class="brand" aria-label="STOMTECH PRO — на главную"><img src="assets/img/logo.svg" alt="STOMTECH PRO" width="150" height="23"></a>
    <nav class="nav-links" aria-label="Основное меню">
      <a href="probnik.html" class="nav-only-mobile">Получить пробник бесплатно</a>
${links}
    </nav>
    <div class="nav-cta">
      <a href="${SITE.phoneHref}" class="nav-phone"><i class="i i-phone" aria-hidden="true"></i>${SITE.phone}</a>
      <a href="probnik.html" class="btn btn-primary btn-sm">Пробник бесплатно</a>
      <button class="burger" type="button" aria-label="Открыть меню"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>`;
}

/* ---------- подвал ---------- */
function footer() {
  return `<footer class="footer grain">
  <div class="container">
    <div class="foot-grid">
      <div>
        <a href="index.html" class="brand"><img src="assets/img/logo.svg" alt="STOMTECH PRO" width="150" height="26"></a>
        <p>Профессиональные порошки для воздушно-абразивной чистки зубов. Российское производство полного цикла.</p>
        <div class="foot-social">
          <a href="${SITE.tg}" aria-label="Telegram" rel="noopener"><i class="i i-telegram" aria-hidden="true"></i></a>
          <a href="${SITE.wa}" aria-label="WhatsApp" rel="noopener"><i class="i i-whatsapp" aria-hidden="true"></i></a>
          <a href="${SITE.vk}" aria-label="ВКонтакте" rel="noopener"><i class="i i-vk" aria-hidden="true"></i></a>
        </div>
      </div>
      <nav aria-label="Продукция">
        <h4>Продукция</h4>
        <a href="ultra.html">ULTRA · 14 мкм</a>
        <a href="delicate.html">DELICATE · 30 мкм</a>
        <a href="hard.html">HARD · 40 мкм</a>
        <a href="catalog.html">Весь каталог</a>
        <a href="sovmestimost.html">Совместимость</a>
      </nav>
      <nav aria-label="Компания">
        <h4>Компания</h4>
        <a href="o-kompanii.html">О компании</a>
        <a href="dokumenty.html">Документы</a>
        <a href="gde-kupit.html">Где купить</a>
        <a href="dileram.html">Дилерам</a>
        <a href="blog.html">Блог</a>
      </nav>
      <div class="foot-contact">
        <h4>Контакты</h4>
        <p><a href="${SITE.phoneHref}"><i class="i i-phone" aria-hidden="true"></i>${SITE.phone}</a></p>
        <p><a href="mailto:${SITE.email}"><i class="i i-mail" aria-hidden="true"></i>${SITE.email}</a></p>
        <p>${SITE.address}</p>
      </div>
    </div>
    <p class="foot-legal">Порошки для воздушно-абразивной обработки — медицинское изделие. Имеются противопоказания, необходима консультация специалиста. Информация на сайте не является публичной офертой.</p>
    <div class="foot-bottom">
      <span>© <span id="year">2026</span> ${SITE.legal} · ИНН ${SITE.inn}</span>
      <span>Производство полного цикла в России</span>
    </div>
  </div>
</footer>`;
}

/* ---------- сборка страницы ---------- */
export function page(meta, body) {
  return `<!DOCTYPE html>
<!-- Сгенерировано tools/build.mjs. Правьте tools/content/${meta.src} и запускайте: node tools/build.mjs -->
<html lang="ru">
<head>
${head(meta)}
</head>
<body>
${meta.progress ? '<div class="read-progress" aria-hidden="true"></div>\n' : ''}${header(meta.nav)}

${body.trim()}

${footer()}

<a href="${SITE.tg}" class="fab" aria-label="Написать в Telegram" rel="noopener"><i class="i i-chat" aria-hidden="true"></i></a>
<script src="assets/app.js"></script>
</body>
</html>
`;
}

/* ---------- переиспользуемые куски разметки ---------- */

export function ctaBand(opts = {}) {
  const {
    title = 'Протестируйте все три порошка бесплатно',
    text = 'Отправим комплект ULTRA, DELICATE и HARD в вашу клинику. Оцените расход, деликатность и комфорт пациента на своём оборудовании.',
    btn = 'Получить пробник',
    href = 'probnik.html',
    note = 'Доставка по РФ · Без обязательств · Ответим в течение рабочего дня',
  } = opts;
  return `<section class="section tight">
  <div class="container">
    <div class="cta-band" data-reveal="rise">
      <div class="cta-inner">
        <div>
          <h2>${title}</h2>
          <p class="mt-s">${text}</p>
          <div class="cta-note"><i class="i i-truck" aria-hidden="true"></i>${note}</div>
        </div>
        <a href="${href}" class="btn btn-primary btn-lg">${btn} <i class="i i-arrow-right" aria-hidden="true"></i></a>
      </div>
    </div>
  </div>
</section>`;
}

export function crumbs(items) {
  const parts = items.map((it, i) =>
    i === items.length - 1
      ? `<span aria-current="page" class="muted">${it.label}</span>`
      : `<a href="${it.href}">${it.label}</a><span>/</span>`
  );
  return `<nav class="crumb" aria-label="Хлебные крошки">${parts.join('')}</nav>`;
}
