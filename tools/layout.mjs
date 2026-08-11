/* ============================================================
   STOMTECH PRO — общий каркас страниц.
   Здесь живут: реквизиты, меню, шапка, подвал, <head>.
   Правка в одном месте расходится по всем страницам после `node tools/build.mjs`.
   ============================================================ */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Отпечаток содержимого файла в адресе ассета.
   GitHub Pages отдаёт Cache-Control: max-age=600 — без этого вернувшийся посетитель
   может получить новый HTML со старыми CSS/JS. Хэш меняется только вместе с файлом,
   поэтому кэш не сбрасывается зря. */
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const rev = (file) =>
  createHash('sha1').update(readFileSync(join(ASSETS, file))).digest('hex').slice(0, 8);
const V = { css: rev('style.css'), icons: rev('icons.css'), js: rev('app.js') };

/* Картинка-превью для мессенджеров и соцсетей. Появится в <head> сама, как только
   файл assets/img/og-cover.jpg будет положен на место (промпт — в PHOTO-PROMPTS.md).
   Пока файла нет, теги не выводятся: пустой og:image хуже, чем его отсутствие. */
const OG_FILE = 'og-cover.jpg';
const HAS_OG = existsSync(join(ASSETS, 'img', OG_FILE));

/* Товары для корзины. Тот же tools/products.json, что и для цен на страницах, —
   витрина и корзина обязаны считать по одному прайсу. В браузер уходит только
   необходимое: артикул, название, цена, фасовка. */
const CATALOG = JSON.parse(readFileSync(join(ASSETS, '..', 'tools', 'products.json'), 'utf8'));

/* Ключ DaData для подсказок по ИНН. Это отдельный «ключ для подсказок» из личного
   кабинета DaData — он рассчитан на работу в браузере и ограничивается списком
   разрешённых доменов там же. Секретный ключ стандартизации сюда класть нельзя.
   Пока строка пуста, подстановка реквизитов просто не включается: поля заполняются
   руками, форма работает как обычно. */
const DADATA_TOKEN = 'f80e44d20b652ea5c5d403cdf01308414f77b34e';

const cartData = () => `<script>window.__PRODUCTS=${JSON.stringify(
  CATALOG.items.map((p) => ({ sku: p.sku, title: p.title, price: p.price, weight: p.weight }))
)};window.__DADATA=${JSON.stringify(DADATA_TOKEN)}</script>`;

/* Яндекс.Метрика. Номер счётчика — в одном месте: меняется здесь, попадает на все страницы.
   Пустая строка полностью убирает счётчик из сборки (например, для локального просмотра).
   dataLayer объявляем до инициализации: без него не заработает электронная коммерция,
   которую счётчик уже ждёт (ecommerce:"dataLayer") — пригодится, когда появится корзина.
   Счётчик разнесён на две части: скрипт — в <head> (считает раньше), пиксель-заглушка
   для отключённого JS — в начало <body>. Держать <noscript><div><img> внутри <head> нельзя:
   браузер на первом же <div> закрывает голову и начинает тело — вёрстка поедет. */
const METRIKA_ID = '111496189';
const metrikaHead = () => METRIKA_ID ? `
<script>window.dataLayer=window.dataLayer||[];
(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
})(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}','ym');
ym(${METRIKA_ID},'init',{ssr:true,webvisor:true,clickmap:true,ecommerce:"dataLayer",referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});</script>` : '';
const metrikaBody = () => METRIKA_ID
  ? `<noscript><div><img src="https://mc.yandex.ru/watch/${METRIKA_ID}" style="position:absolute;left:-9999px" alt=""></div></noscript>\n`
  : '';

export const SITE = {
  name: 'STOMTECH PRO',
  // Адрес, где сайт реально лежит. От него считаются canonical, sitemap и og:image.
  // Переехали на свой домен 2026-08-11: DNS делегирован на Beget, сайт отдаётся
  // с виртуального хостинга. Копия на github.io остаётся как резерв и история правок.
  origin: 'https://stomtech.pro',
  phone: '+7 (930) 766-99-88',
  phoneHref: 'tel:+79307669988',
  email: 'info@stomtech.pro',
  tg: 'https://t.me/stomtechpro',
  vk: 'https://vk.com/stomtech_pro',
  // WhatsApp убран с сайта 2026-08-11 решением заказчика: мессенджер Meta,
  // как канал связи в материалах медизделия не используем. Если понадобится вернуть —
  // добавить сюда `wa`, иконку в gen-icons.mjs и ссылки в подвале, контактах и share.
  // Ссылка на розницу для физлиц. Показывается ТОЛЬКО в форме заказа, с rel=nofollow:
  // закупщик клиники, увидевший розничную цену, начнёт сравнивать её с оптовой.
  // Пока пусто — строка про Wildberries не выводится.
  wb: '',
  legal: 'ООО «Дентал Клин»',
  inn: '4632297120',
  // ОГРН — обязательный реквизит блока информации для покупателя (ПП РФ № 2463)
  // и требование модерации платёжного провайдера.
  ogrn: '1234600003758',
  address: '305044, г. Курск, ул. Соловьиная, зд. 51, офис 16',
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
${m.noindex ? `<meta name="robots" content="noindex, follow">
` : `<link rel="canonical" href="${canonical}">
`}
<meta name="theme-color" content="#ffffff">
<meta property="og:type" content="${m.type === 'article' ? 'article' : 'website'}">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${og}">
<meta property="og:description" content="${m.ogDescription || m.description}">
<meta property="og:url" content="${canonical}">${HAS_OG ? `
<meta property="og:image" content="${SITE.origin}/assets/img/${OG_FILE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="icon" href="assets/img/favicon.svg?v=2" type="image/svg+xml">
<link rel="icon" href="assets/img/favicon-32.png?v=2" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png?v=2">
<link rel="preload" href="assets/fonts/onest-cyrillic-700.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/onest-cyrillic-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/style.css?v=${V.css}">
<link rel="stylesheet" href="assets/icons.css?v=${V.icons}">
<script>/* Помечаем, что JS жив — только тогда прячем блоки под анимацию появления.
Если app.js не доехал (кэш, блокировщик, ошибка), сторож через 2,5 с показывает всё как есть:
пустой страницы не будет ни при каких обстоятельствах. */
(function(h){h.classList.add('js');
window.__revealGuard=setTimeout(function(){h.classList.add('no-motion')},2500)})(document.documentElement)</script>${metrikaHead()}${[m.jsonld, ...(m.jsonldExtra || [])].filter(Boolean).map((j) => `
<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('')}`;
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
      <a href="zakaz.html" class="nav-only-mobile" data-order>Сделать заказ</a>
${links}
    </nav>
    <div class="nav-cta">
      <a href="${SITE.phoneHref}" class="nav-phone"><i class="i i-phone" aria-hidden="true"></i>${SITE.phone}</a>
      <a href="zakaz.html" class="cart-btn" data-order hidden aria-label="Корзина"><i class="i i-cart" aria-hidden="true"></i><span class="cart-count" data-cart-count>0</span></a>
      <a href="zakaz.html" class="btn btn-primary btn-sm" data-order>Сделать заказ</a>
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
        <a href="oplata-i-dostavka.html">Оплата и доставка</a>
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
      <span>© <span id="year">2026</span> ${SITE.legal} · ИНН ${SITE.inn} · ОГРН ${SITE.ogrn}</span>
      <a href="politika.html">Политика обработки персональных данных</a>
      <span>Производство полного цикла в России</span>
    </div>
  </div>
</footer>`;
}

/* ---------- окно заказа ----------
   Кнопки «Сделать заказ» открывают форму прямо поверх страницы: заявка не должна
   стоить посетителю лишнего перехода. Кнопки при этом остаются ссылками на zakaz.html —
   если JS не доехал, они просто уводят на страницу заказа, как раньше. */
function orderModal() {
  return `<dialog class="modal" id="order-modal" aria-labelledby="order-modal-title">
  <div class="modal-card">
    <button type="button" class="modal-close" data-close aria-label="Закрыть"><i class="i i-plus" aria-hidden="true"></i></button>
    <h3 id="order-modal-title">Ваш заказ</h3>
    <p class="note mt-xs" style="margin-bottom:20px">Соберите позиции и оставьте реквизиты — выставим счёт и подтвердим срок отгрузки в течение рабочего дня.</p>
    ${orderForm('m')}
  </div>
</dialog>`;
}

/* ---------- условия оплаты, доставки и возврата ----------
   Обязательная информация для покупателя (Правила продажи, ПП РФ № 2463) — она же
   то, что проверяет модерация платёжного провайдера перед подключением приёма оплаты.

   Источник один на всё: и страница oplata-i-dostavka.html (директива <!-- @terms -->),
   и окно поверх страницы берут этот блок. Две разошедшиеся версии условий — это спор
   с покупателем, который мы заведомо проиграем.

   Окно нужно рядом со страницей, а не вместо неё: у окна нет адреса, а ссылку
   на условия требуют и модерация, и поисковики. */
export function termsBlock() {
  return `<div class="terms">
      <h4>Продавец</h4>
      <div class="spec-list">
        <div><span>Наименование</span><span>${SITE.legal}</span></div>
        <div><span>ИНН</span><span>${SITE.inn}</span></div>
        <div><span>ОГРН</span><span>${SITE.ogrn}</span></div>
        <div><span>Адрес</span><span>${SITE.address}</span></div>
        <div><span>Связь</span><span><a href="${SITE.phoneHref}" class="tlink">${SITE.phone}</a> · <a href="mailto:${SITE.email}" class="tlink">${SITE.email}</a></span></div>
      </div>

      <h4>Товар</h4>
      <ul class="check">
        <li>Порошок стоматологический «Стомтеч.Про» — медицинское изделие, регистрационное удостоверение № РЗН 2025/25937 от 24.07.2025.</li>
        <li>Срок годности — 4 года с даты производства, указанной на упаковке.</li>
        <li>Цены указаны на страницах каталога в рублях и едины для всех покупателей.</li>
      </ul>

      <h4>Оплата</h4>
      <ul class="check">
        <li>Частным покупателям — онлайн через Систему быстрых платежей. Кассовый чек приходит на указанный e-mail сразу после оплаты.</li>
        <li>Организациям и индивидуальным предпринимателям — по счёту, безналичным переводом с расчётного счёта.</li>
      </ul>

      <h4>Доставка</h4>
      <ul class="check">
        <li>СДЭК по всей России — до пункта выдачи или курьером по адресу.</li>
        <li>Стоимость доставки рассчитывается при оформлении заказа по тарифам СДЭК и оплачивается покупателем.</li>
        <li>Отгрузка со склада в Курске — в течение 10 дней с момента оплаты.</li>
      </ul>

      <h4>Возврат</h4>
      <ul class="check">
        <li>Отказаться от заказа можно в любое время до его получения и в течение 7 дней после.</li>
        <li>Товар возвращается, если сохранены его товарный вид, потребительские свойства и упаковка.</li>
        <li>Деньги возвращаются тем же способом, которым была произведена оплата, в течение 10 дней с момента получения заявления.</li>
        <li>Расходы на обратную пересылку несёт покупатель.</li>
      </ul>
    </div>`;
}

/* Окно с условиями. Выводится на всех страницах, кроме самой страницы условий:
   там содержимое и так на месте. Ссылки-триггеры остаются обычными ссылками
   на oplata-i-dostavka.html — без JS посетитель просто перейдёт по ним. */
function termsModal() {
  return `<dialog class="modal modal-wide" id="terms-modal" aria-labelledby="terms-modal-title">
  <div class="modal-card">
    <button type="button" class="modal-close" data-close aria-label="Закрыть"><i class="i i-plus" aria-hidden="true"></i></button>
    <h3 id="terms-modal-title">Оплата, доставка и возврат</h3>
    <p class="note mt-xs" style="margin-bottom:20px">Условия продажи и обязательная информация о продавце и товаре.</p>
    ${termsBlock()}
  </div>
</dialog>`;
}

/* Форма заказа. Используется и в окне, и на странице zakaz.html, поэтому вынесена
   в одно место: расхождение двух форм заказа — прямой путь к потерянным заявкам.
   Строки корзины подставляет app.js в [data-cart-lines]; разметка строки — та же
   .qty-row, что уже умеет собирать сборщик заявок, так что ничего дублировать не надо.
   `p` — префикс идентификаторов полей: на странице заказа и в окне они не должны совпасть. */
export function orderForm(p) {
  return `<form data-lead="Заказ" data-cart-form>
      <p class="note" style="margin:0 0 4px">Что отгрузить</p>
      <div data-cart-lines></div>
      <p class="note cart-empty" data-cart-empty>Корзина пуста. Добавьте порошки из <a href="catalog.html" class="tlink">каталога</a> — или опишите задачу в комментарии, подберём сами.</p>
      <div class="cart-total" data-cart-total hidden>
        <span>Итого</span><strong data-cart-sum>0 ₽</strong>
      </div>
      <input type="hidden" name="total" data-label="Сумма заказа" value="">

      <!-- Кто покупает. Спрашиваем до реквизитов: физлицу мы не отгружаем,
           и узнать об этом человек должен сразу, а не после заполнения формы. -->
      <p class="note" style="margin:22px 0 8px">Кто оформляет заказ</p>
      <div class="buyer-switch" role="radiogroup" aria-label="Тип покупателя">
        <label class="buyer-opt">
          <input type="radio" name="buyer" value="Юридическое лицо или ИП" data-label="Покупатель" data-buyer="legal" checked>
          <span><strong>Юрлицо или ИП</strong><small>Счёт, документы, безналичный расчёт</small></span>
        </label>
        <label class="buyer-opt">
          <input type="radio" name="buyer" value="Физическое лицо" data-label="Покупатель" data-buyer="person">
          <span><strong>Физическое лицо</strong><small>Для частных покупателей</small></span>
        </label>
      </div>

      <div class="buyer-note" data-buyer-note hidden>
        <span class="ic"><i class="i i-info" aria-hidden="true"></i></span>
        <div>
          <h4>Частным лицам мы не отгружаем</h4>
          <p>Порошки — медицинское изделие для профессионального применения в клинике, поэтому напрямую с производства они поставляются только организациям и индивидуальным предпринимателям.${SITE.wb ? ` Купить в розницу можно в <a href="${SITE.wb}" class="tlink" rel="nofollow noopener" target="_blank">нашем магазине на Wildberries</a>.` : ' Розничная продажа идёт через маркетплейсы — напишите нам, подскажем, где купить.'}</p>
        </div>
      </div>

      <div class="field-row" data-legal-fields style="margin-top:18px">
        <div class="field"><label for="${p}-inn">ИНН *</label><input id="${p}-inn" type="text" name="inn" data-label="ИНН" data-inn required inputmode="numeric" pattern="[0-9]{10}|[0-9]{12}" placeholder="10 или 12 цифр" autocomplete="off"></div>
        <div class="field"><label for="${p}-org">Организация или ИП *</label><input id="${p}-org" type="text" name="org" data-label="Организация" data-org required autocomplete="organization" placeholder="Подставится по ИНН"></div>
      </div>
      <p class="note inn-status" data-inn-status hidden></p>
      <input type="hidden" name="kpp" data-label="КПП" data-kpp value="">
      <input type="hidden" name="ogrn" data-label="ОГРН" data-ogrn value="">
      <input type="hidden" name="legalAddress" data-label="Юридический адрес" data-legal-address value="">
      <div class="field"><label for="${p}-name">Имя *</label><input id="${p}-name" type="text" name="name" data-label="Имя" required autocomplete="name" placeholder="Как к вам обращаться"></div>
      <div class="field-row">
        <div class="field"><label for="${p}-phone">Телефон *</label><input id="${p}-phone" type="tel" name="phone" data-label="Телефон" required autocomplete="tel" placeholder="+7 (___) ___-__-__"></div>
        <div class="field"><label for="${p}-email">E-mail для счёта</label><input id="${p}-email" type="email" name="email" data-label="E-mail" autocomplete="email" placeholder="Для счёта и УПД"></div>
      </div>
      <div class="field"><label for="${p}-note">Комментарий</label><input id="${p}-note" type="text" name="comment" data-label="Комментарий" placeholder="Наконечник, объём, сроки доставки"></div>

      <label class="consent"><input type="checkbox" required>
        Согласен(на) на обработку персональных данных и принимаю <a href="politika.html" target="_blank" rel="noopener">политику</a>.</label>
      <button type="submit" class="btn btn-primary btn-lg" style="width:100%;margin-top:18px">Отправить заказ <i class="i i-arrow-right" aria-hidden="true"></i></button>
      <p class="note center mt-s">Цены без НДС. Оформляя заказ, вы принимаете <a href="oplata-i-dostavka.html" class="tlink" data-terms>условия оплаты, доставки и возврата</a>.${SITE.wb ? ` Частным покупателям — <a href="${SITE.wb}" class="tlink" rel="nofollow noopener" target="_blank">наш магазин на Wildberries</a>.` : ''}</p>
    </form>`;
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
${metrikaBody()}${meta.progress ? '<div class="read-progress" aria-hidden="true"></div>\n' : ''}${header(meta.nav)}

${body.trim()}

${footer()}

<a href="${SITE.tg}" class="fab" aria-label="Написать в Telegram" rel="noopener"><i class="i i-chat" aria-hidden="true"></i></a>
${meta.slug === 'zakaz' ? '' : orderModal()}
${meta.slug === 'oplata-i-dostavka' ? '' : termsModal()}
${cartData()}
<script src="assets/app.js?v=${V.js}"></script>
</body>
</html>
`;
}

/* ---------- переиспользуемые куски разметки ---------- */

export function ctaBand(opts = {}) {
  const {
    title = 'Закажите порошки напрямую с производства',
    text = 'ULTRA, DELICATE и HARD — со склада в Курске. Подберём фракции под задачи вашего приёма, рассчитаем объём и назовём срок доставки.',
    btn = 'Сделать заказ',
    href = 'zakaz.html',
    note = 'Доставка по РФ · Отгрузка с производства · Ответим в течение рабочего дня',
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
