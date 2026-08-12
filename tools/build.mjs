/* ============================================================
   STOMTECH PRO — сборка статических страниц.

   Запуск:  node tools/build.mjs   (из папки site/)

   Что делает:
     • берёт фрагменты из tools/content/**.html;
     • оборачивает их в общий каркас (tools/layout.mjs);
     • раскрывает подстановки {{cta}}, {{blogCards:3}}, {{blogIndex}}, {{related}};
     • собирает индекс блога и sitemap.xml из мета-данных статей;
     • кладёт готовый HTML в корень site/.

   Правила: HTML в корне — результат сборки, руками его не редактируем.
   ============================================================ */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, AUTHORS, RETAIL, pagePath, page, ctaBand, orderForm, termsBlock } from './layout.mjs';

/* ---------- адреса без .html ----------
   В разметке страниц ссылки пишутся как обычно — `href="catalog.html"`: так их
   видно в исходнике, и не приходится держать в голове две формы записи. Расширение
   срезается один раз здесь, на готовой странице.

   Почему это работает без правки путей к ассетам: все страницы лежат в корне,
   поэтому у адреса `/oferta` базовый каталог — тот же корень, и относительный
   `assets/style.css` по-прежнему указывает на `/assets/style.css`.

   Ссылка на главную становится `/`: `index` в адресе не нужен, а относительная
   форма из подстраницы читалась бы как `./` — менее очевидно.

   Файлы на диске остаются с расширением. Сопоставление `/oferta` → `oferta.html`
   делает `.htaccess` на хостинге и `tools/serve.mjs` при локальном просмотре. */
const cleanUrls = (html) => html
  .replace(/href="index\.html(#[^"]*)?"/g, 'href="/$1"')
  .replace(/href="([a-z0-9-]+)\.html(#[^"]*)?"/g, 'href="$1$2"');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'tools', 'content');

/* ---------- цены: единственный источник ----------
   Раньше цена была зашита в шести файлах и продублирована в JSON-LD и в описаниях
   страниц — смена цены означала шесть правок с риском, что витрина разойдётся со счётом.
   Теперь цифры живут в tools/products.json и подставляются при сборке.

   Подстановки (работают и в мета-блоке, и в разметке):
     {{price:ULTRA-170}}    → 1 990 ₽      цена с неразрывным пробелом
     {{priceNum:ULTRA-170}} → 1990         число, для JSON-LD
     {{perGram:ULTRA-170}}  → 11,7         рублей за грамм
     {{weight:ULTRA-170}}   → 170
     {{grit:ULTRA-170}}     → 14
   Неизвестный артикул или подстановка — ошибка сборки: молча показать неверную цену
   хуже, чем не собраться. */
export const PRODUCTS = JSON.parse(readFileSync(join(ROOT, 'tools', 'products.json'), 'utf8'));
const BY_SKU = new Map(PRODUCTS.items.map((p) => [p.sku, p]));

const rub = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const perGram = (p) => (p.price / p.weight).toFixed(1).replace('.', ',');

/* Цены нет — это ошибка сборки, а не повод напечатать «null ₽».
   Ровно так страница каталога и показывала цену набора, пока её не задали:
   подстановка молча выводила «null ₽» прямо на живом сайте. */
function requirePrice(p, kind) {
  if (p.price == null) {
    throw new Error(
      `у ${p.sku} нет цены в products.json — подстановка {{${kind}:${p.sku}}} невозможна`
    );
  }
  return p.price;
}

const SUBST = {
  price: (p) => `${rub(requirePrice(p, 'price'))} ₽`,
  priceNum: (p) => String(requirePrice(p, 'priceNum')),
  perGram: (p) => (p.price == null ? '—' : perGram(p)),
  weight: (p) => String(p.weight),
  grit: (p) => String(p.grit),
};

function fillPrices(text, where) {
  return text.replace(/\{\{(\w+):([A-Z0-9-]+)\}\}/g, (all, kind, sku) => {
    const p = BY_SKU.get(sku);
    if (!p) throw new Error(`${where}: в products.json нет артикула ${sku} (подстановка ${all})`);
    const fn = SUBST[kind];
    if (!fn) throw new Error(`${where}: неизвестная подстановка ${all}. Доступны: ${Object.keys(SUBST).join(', ')}`);
    return fn(p);
  });
}

/* ---------- микроразметка, собираемая автоматически ----------
   Хлебные крошки уже есть в разметке каждой страницы — значит, их можно
   не описывать вручную второй раз, а вынуть из готового HTML. Поисковик
   показывает такую цепочку прямо в выдаче вместо голого адреса, и это
   заметно поднимает кликабельность.

   WebSite отдаётся только с главной: он описывает сайт целиком. */
function breadcrumbLd(body) {
  const nav = body.match(/<nav class="crumb"[^>]*>([\s\S]*?)<\/nav>/);
  if (!nav) return null;

  const items = [];
  for (const m of nav[1].matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)) {
    items.push({ href: m[1], label: m[2].trim() });
  }
  const last = nav[1].match(/aria-current="page"[^>]*>([^<]+)</);
  if (last) items.push({ href: null, label: last[1].trim() });
  if (items.length < 2) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.label,
      // крошки вынуты из разметки, где ссылки ещё с расширением: срезаем его,
      // чтобы адрес в микроразметке совпал с canonical
      ...(it.href ? { item: SITE.origin + pagePath(it.href.replace(/\.html$/, '')) } : {}),
    })),
  };
}

const websiteLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE.name,
  url: `${SITE.origin}/`,
  inLanguage: 'ru-RU',
  publisher: { '@type': 'Organization', name: SITE.legal },
});

/* ---------- типографика ----------
   Висящие предлоги и союзы в конце строки — самый заметный признак неаккуратной
   вёрстки, и на узких экранах они вылезают почти в каждом абзаце. Чинить это
   руками в сорока файлах бессмысленно: правило должно работать само, в том числе
   для текстов, которые напишут потом.

   Обрабатываем только текст между тегами: содержимое самих тегов, скриптов
   и стилей не трогаем, иначе поедут адреса и атрибуты. */
const SHORT_WORDS = /(^|[\s(«"„—-])([А-Яа-яЁёA-Za-z]{1,2}|как|что|это|или|для|под|при|над|про|без|его|её|их|наш|наша|уже|ещё)\s+(?=[А-Яа-яЁёA-Za-z0-9«])/g;

function typoText(t) {
  // короткое слово прилипает к следующему
  t = t.replace(SHORT_WORDS, '$1$2 ');
  // тире не начинает строку: пробел перед ним делаем неразрывным
  t = t.replace(/([^\s])\s+([—–])\s/g, '$1 $2 ');
  // число не отрывается от единицы измерения
  t = t.replace(/(\d)\s+(мкм|г|кг|мл|мм|см|₽|руб\.|шт\.|мин|ч|%)(?![А-Яа-яЁё])/g, '$1 $2');
  return t;
}

function typo(html) {
  let skip = 0;
  return html
    .split(/(<[^>]*>)/)
    .map((chunk) => {
      if (chunk.startsWith('<')) {
        const tag = chunk.toLowerCase();
        if (/^<(script|style|pre|code)[\s>]/.test(tag)) skip++;
        else if (/^<\/(script|style|pre|code)>/.test(tag)) skip = Math.max(0, skip - 1);
        return chunk;
      }
      return skip ? chunk : typoText(chunk);
    })
    .join('');
}

/* ---------- чтение фрагментов ---------- */
function readFragment(dir, file) {
  const raw = fillPrices(readFileSync(join(dir, file), 'utf8'), file);
  const m = raw.match(/^\s*<!--\s*(\{[\s\S]*?\})\s*-->/);
  if (!m) throw new Error(`${file}: нет мета-блока <!--{ ... }--> в начале файла`);
  let meta;
  try { meta = JSON.parse(m[1]); }
  catch (e) { throw new Error(`${file}: некорректный JSON в мета-блоке — ${e.message}`); }
  meta.src = file;
  return { meta, body: raw.slice(m[0].length) };
}

const pages = readdirSync(CONTENT).filter((f) => f.endsWith('.html')).map((f) => readFragment(CONTENT, f));
const posts = readdirSync(join(CONTENT, 'blog')).filter((f) => f.endsWith('.html'))
  .map((f) => {
    const p = readFragment(join(CONTENT, 'blog'), f);
    p.meta.src = 'blog/' + f;
    return p;
  })
  .sort((a, b) => (a.meta.date < b.meta.date ? 1 : -1));   // свежие сверху

/* ---------- вспомогательное ---------- */
const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function dateRu(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/* pro:true в мета-блоке помечает материал для специалистов —
   пациент и гигиенист сразу видят, что перед ними разный уровень текста */
const proMark = (m) =>
  m.pro ? '<span class="pro-mark"><i class="i i-microscope" aria-hidden="true"></i>Для специалистов</span>' : '';

/* Обложка карточки берётся автоматически: первая фотография из статьи,
   которая уже лежит в assets/img/blog/. Пока фото нет — прежний градиент
   с иконкой. Привязывать обложки руками не нужно: положили файл — обложка
   появилась сама. */
const coverPhoto = (p) => {
  for (const m of p.body.matchAll(/<!--\s*@figure\s+(\{[\s\S]*?\})\s*-->/g)) {
    let src;
    try { src = JSON.parse(m[1]).src; } catch { continue; }
    if (src && existsSync(join(ROOT, 'assets', 'img', 'blog', src))) return src;
  }
  return null;
};

/* В карточке обложка показывается шириной около 400 px, а лежала она в полном
   размере 1400 px — на индексе блога это два десятка лишних сотен килобайт.
   Сетка карточек берёт уменьшенную копию из blog/card/, статьи и большая
   карточка-герой — оригинал. */
const coverInner = (p, card = false) => {
  const photo = coverPhoto(p);
  const m = p.meta;
  if (!photo) return `<i class="i i-${m.icon}" aria-hidden="true"></i>`;
  const small = card && existsSync(join(ROOT, 'assets', 'img', 'blog', 'card', photo));
  const src = small ? `assets/img/blog/card/${photo}` : `assets/img/blog/${photo}`;
  return `<img src="${src}" alt="" width="${small ? 800 : 1400}" height="${small ? 447 : 782}" loading="lazy" decoding="async">`;
};

function postCard(p, opts = {}) {
  const m = p.meta;
  const photo = coverPhoto(p);
  return `<a href="${m.slug}.html" class="blog-card${m.pro ? ' is-pro' : ''}${photo ? ' has-photo' : ''}"${opts.filter ? ` data-cat="${m.categorySlug}"` : ''} data-reveal="up">
        <div class="blog-cover ${photo ? '' : m.cover || ''}"><span class="tag">${m.category}</span>${proMark(m)}${coverInner(p, true)}</div>
        <div class="blog-body">
          <h3>${m.cardTitle || m.h1}</h3>
          <p>${m.excerpt}</p>
          <div class="blog-meta"><i class="i i-clock" aria-hidden="true"></i>${m.readTime} мин<span class="sep"></span>${dateRu(m.date)}</div>
        </div>
      </a>`;
}

function postHeroCard(p) {
  const m = p.meta;
  const photo = coverPhoto(p);
  return `<a href="${m.slug}.html" class="blog-hero${photo ? ' has-photo' : ''}" data-reveal="rise">
      <div class="blog-cover ${photo ? '' : m.cover || ''}"><span class="tag">${m.category}</span>${proMark(m)}${coverInner(p)}</div>
      <div class="blog-hero-body">
        <span class="kicker">Читают чаще всего</span>
        <h2>${m.cardTitle || m.h1}</h2>
        <p>${m.excerpt}</p>
        <div class="blog-meta"><i class="i i-clock" aria-hidden="true"></i>${m.readTime} мин чтения<span class="sep"></span>${dateRu(m.date)}</div>
      </div>
    </a>`;
}

/* индекс блога: чипы рубрик + главная статья + сетка */
function blogIndex() {
  const cats = [];
  posts.forEach((p) => {
    let c = cats.find((x) => x.slug === p.meta.categorySlug);
    if (!c) cats.push((c = { slug: p.meta.categorySlug, label: p.meta.category, n: 0 }));
    c.n++;
  });
  const chips = [`<button type="button" class="chip active" data-filter="all">Все статьи <span class="cnt">${posts.length}</span></button>`]
    .concat(cats.map((c) => `<button type="button" class="chip" data-filter="${c.slug}">${c.label} <span class="cnt">${c.n}</span></button>`))
    .join('\n        ');

  const featured = posts.find((p) => p.meta.featured) || posts[0];
  const rest = posts.filter((p) => p !== featured);

  return `<div class="chips" data-reveal="up">
        ${chips}
      </div>

      <div class="mt-l">${postHeroCard(featured)}</div>

      <div class="blog-grid mt-l" data-stagger="80">
        ${rest.map((p) => postCard(p, { filter: true })).join('\n        ')}
      </div>`;
}

/* похожие статьи — та же рубрика, потом остальные */
function related(slug, n = 3) {
  const cur = posts.find((p) => p.meta.slug === slug);
  const pool = posts.filter((p) => p !== cur);
  const same = pool.filter((p) => p.meta.categorySlug === cur.meta.categorySlug);
  const list = same.concat(pool.filter((p) => !same.includes(p))).slice(0, n);
  return list.map((p) => postCard(p)).join('\n      ');
}

/* ---------- подстановки ----------
   Директивы пишутся HTML-комментарием: <!-- @имя аргумент -->
   Так они не конфликтуют со скобками JSON и не мешают, если сборку не запускать.
     <!-- @cta -->                        стандартный блок с призывом
     <!-- @cta {"title":"…","text":"…"} --> он же с заменой текста
     <!-- @blogCards 3 -->                N свежих карточек блога
     <!-- @blogIndex -->                  чипы рубрик + главная статья + сетка
     <!-- @related -->                    похожие статьи
     <!-- @share --> <!-- @author -->     блок «поделиться» и карточка автора
------------------------------------------------------------------ */
/* Список мест под фотографии, которые ещё не сняты — собирается при сборке
   и выводится в конце, чтобы было видно, что осталось подготовить. */
const missingPhotos = [];

/* <!-- @figure {"src":"...","alt":"...","caption":"...","brief":"..."} -->
   Если файл assets/img/blog/<src> существует — вставляется фотография.
   Если нет — на его месте стоит заглушка с описанием нужного кадра и именем файла.
   Разметка и место в тексте при этом не меняются: положили файл, пересобрали — готово. */
function figure(arg) {
  const f = JSON.parse(arg);
  const rel = `assets/img/blog/${f.src}`;
  const ratio = f.ratio || '16 / 9';
  if (existsSync(join(ROOT, rel))) {
    return `<figure class="fig">
            <img src="${rel}" alt="${f.alt}" loading="lazy" style="aspect-ratio:${ratio};object-fit:cover">
            ${f.caption ? `<figcaption>${f.caption}</figcaption>` : ''}
          </figure>`;
  }
  missingPhotos.push({ src: f.src, brief: f.brief || f.alt });
  return `<figure class="fig fig-empty" style="--ratio:${ratio}">
            <div class="fig-slot">
              <i class="i i-microscope" aria-hidden="true"></i>
              <b>Место под фотографию</b>
              <span>${f.brief || f.alt}</span>
              <code>${f.src}</code>
            </div>
            ${f.caption ? `<figcaption>${f.caption}</figcaption>` : ''}
          </figure>`;
}

const DIRECTIVES = {
  cta: (arg) => ctaBand(arg ? JSON.parse(arg) : undefined),
  // форма заказа одна на сайт: и в окне, и на странице zakaz.html
  orderForm: (arg) => orderForm(arg || 'z'),
  // условия продажи одни на сайт: и в окне, и на странице oplata-i-dostavka.html
  terms: () => termsBlock(),
  figure,
  blogCards: (arg) => posts.slice(0, parseInt(arg, 10) || 3).map((p) => postCard(p)).join('\n      '),
  blogIndex: () => blogIndex(),
  related: (arg, meta) => related(meta.slug),
  author: (arg, meta) => {
    const a = AUTHORS[meta.author || 'expert'];
    return `<div class="author-card">
        <div class="av">${a.initials}</div>
        <div>
          <div class="nm">${a.name}</div>
          <div class="rl">${a.role}</div>
          <p>${a.bio}</p>
        </div>
      </div>`;
  },
  share: (arg, meta) => {
    const url = SITE.origin + pagePath(meta.slug);
    return `<div class="share">
        <span>Поделиться</span>
        <a href="https://t.me/share/url?url=${encodeURIComponent(url)}" aria-label="Telegram" rel="noopener nofollow"><i class="i i-telegram" aria-hidden="true"></i></a>
        <a href="https://vk.com/share.php?url=${encodeURIComponent(url)}" aria-label="ВКонтакте" rel="noopener nofollow"><i class="i i-vk" aria-hidden="true"></i></a>
      </div>`;
  },
};

/* Область, которая существует только при включённой рознице:
     <!-- @retail --> … <!-- /@retail -->
   Пока RETAIL === false (флаг в tools/layout.mjs), содержимое вырезается из страницы
   целиком — вместе с маркерами. Так розничный раздел оферты пишется и хранится вместе
   с остальным текстом, а не в отдельном файле, но не показывается посетителю до того,
   как сайт научится принимать оплату от физлица.
   Обрабатывается до expand(): к моменту разбора директив маркеров уже нет. */
function retailRegions(body) {
  return body.replace(
    /<!--\s*@retail\s*-->([\s\S]*?)<!--\s*\/@retail\s*-->/g,
    (all, inner) => (RETAIL ? inner : '')
  );
}

function expand(body, meta) {
  return retailRegions(body).replace(/<!--\s*@(\w+)\s*([\s\S]*?)\s*-->/g, (full, name, arg) => {
    const fn = DIRECTIVES[name];
    if (!fn) throw new Error(`${meta.src}: неизвестная директива @${name}`);
    return fn(arg, meta);
  });
}

/* ---------- микроразметка ---------- */
const ORG = {
  '@type': 'Organization',
  name: SITE.name,
  url: SITE.origin + '/',
  logo: SITE.origin + '/assets/img/logo.svg',
  telephone: SITE.phoneHref.replace('tel:', ''),
  email: SITE.email,
  address: { '@type': 'PostalAddress', addressLocality: 'Курск', streetAddress: 'ул. Соловьиная, зд. 51, офис 16', postalCode: '305044', addressCountry: 'RU' },
  // Номера документов в разметке — чтобы регистрацию было видно машинам:
  // нейропоиску, агрегаторам и языковым моделям, которые сравнивают производителей.
  hasCertification: [
    {
      '@type': 'Certification',
      name: 'Регистрационное удостоверение на медицинское изделие',
      certificationIdentification: 'РЗН 2025/25937',
      datePublished: '2025-07-24',
      certificationStatus: 'https://schema.org/CertificationActive',
      issuedBy: { '@type': 'Organization', name: 'Федеральная служба по надзору в сфере здравоохранения (Росздравнадзор)' },
    },
    {
      '@type': 'Certification',
      name: 'Свидетельство на товарный знак STOMTECH.PRO',
      certificationIdentification: '1155746',
      datePublished: '2025-10-07',
      certificationStatus: 'https://schema.org/CertificationActive',
      issuedBy: { '@type': 'Organization', name: 'Федеральная служба по интеллектуальной собственности (Роспатент)' },
    },
  ],
  award: [
    'Резидент инновационного центра «Сколково»',
    'Поддержка Фонда содействия инновациям',
    'Поддержка Министерства промышленности и торговли Российской Федерации',
  ],
};

function articleJsonLd(m) {
  const a = AUTHORS[m.author || 'expert'];
  const graph = [{
    '@type': 'Article',
    headline: m.h1,
    description: m.description,
    datePublished: m.date,
    dateModified: m.updated || m.date,
    inLanguage: 'ru-RU',
    author: { '@type': 'Organization', name: a.name },
    publisher: ORG,
    mainEntityOfPage: { '@type': 'WebPage', '@id': SITE.origin + pagePath(m.slug) },
  }];
  if (m.faq && m.faq.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: m.faq.map((f) => ({
        '@type': 'Question', name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

/* ---------- сборка ---------- */
const all = pages.concat(posts);
let count = 0;

for (const { meta, body } of all) {
  if (meta.type === 'article') {
    meta.progress = true;
    meta.nav = 'blog';
    meta.jsonld = articleJsonLd(meta);
  } else if (!meta.jsonld && meta.slug === 'index') {
    meta.jsonld = { '@context': 'https://schema.org', ...ORG };
  }
  const html = typo(expand(body, meta));
  // крошки достаём из готовой разметки, чтобы не описывать их второй раз руками
  const extra = [breadcrumbLd(html), meta.slug === 'index' ? websiteLd() : null].filter(Boolean);
  if (extra.length) meta.jsonldExtra = extra;
  writeFileSync(join(ROOT, `${meta.slug}.html`), cleanUrls(page(meta, html)), 'utf8');
  count++;
}

/* ---------- прайс для обработчика заявок ----------
   api/order.php пересчитывает сумму заказа сам: цены из браузера не принимаются
   никогда. Но папка tools/ на хостинг не уезжает, поэтому копия прайса кладётся
   рядом с обработчиком. Источник правды по-прежнему один — tools/products.json. */
writeFileSync(
  join(ROOT, 'api', 'products.json'),
  JSON.stringify(
    { updated: PRODUCTS.updated, items: PRODUCTS.items.map(({ sku, title, price, weight, b24ProductId }) =>
      ({ sku, title, price, weight, b24ProductId })) },
    null, 2
  ),
  'utf8'
);

/* ---------- sitemap ---------- */
const today = new Date().toISOString().slice(0, 10);
// страницы с noindex в карту сайта не попадают: 404 незачем предлагать поисковику
const urls = all
  .filter((p) => !p.meta.noindex)
  .map((p) => ({
    loc: SITE.origin + pagePath(p.meta.slug),
    lastmod: p.meta.updated || p.meta.date || today,
    priority: p.meta.slug === 'index' ? '1.0' : p.meta.priority || (p.meta.type === 'article' ? '0.7' : '0.8'),
  }))
  .sort((a, b) => b.priority.localeCompare(a.priority));

writeFileSync(
  join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`,
  'utf8'
);

console.log(`Собрано страниц: ${count} (из них статей блога: ${posts.length}). sitemap.xml обновлён.`);

/* Памятка по недостающим фотографиям — она же техзадание на съёмку/генерацию */
if (missingPhotos.length) {
  const uniq = [...new Map(missingPhotos.map((p) => [p.src, p])).values()];
  writeFileSync(
    join(ROOT, 'tools', 'PHOTO-TODO.md'),
    `# Нужные фотографии для статей\n\n` +
      `Кладите файлы в \`site/assets/img/blog/\` под указанными именами и запускайте \`node tools/build.mjs\` —\n` +
      `заглушки заменятся автоматически, разметку править не нужно.\n\n` +
      `Формат: WebP, ширина 1200–1600 px, соотношение 16:9 (если в статье не указано иное).\n\n` +
      uniq.map((p) => `- [ ] \`${p.src}\` — ${p.brief}`).join('\n') +
      '\n',
    'utf8'
  );
  console.log(`Ждут фотографии: ${uniq.length} шт. Список — tools/PHOTO-TODO.md`);
}
