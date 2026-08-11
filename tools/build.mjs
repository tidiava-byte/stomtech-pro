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
import { SITE, AUTHORS, page, ctaBand, orderForm } from './layout.mjs';

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

const SUBST = {
  price: (p) => `${rub(p.price)} ₽`,
  priceNum: (p) => String(p.price),
  perGram,
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

const coverInner = (p) => {
  const photo = coverPhoto(p);
  const m = p.meta;
  return photo
    ? `<img src="assets/img/blog/${photo}" alt="" width="1400" height="782" loading="lazy">`
    : `<i class="i i-${m.icon}" aria-hidden="true"></i>`;
};

function postCard(p, opts = {}) {
  const m = p.meta;
  const photo = coverPhoto(p);
  return `<a href="${m.slug}.html" class="blog-card${m.pro ? ' is-pro' : ''}${photo ? ' has-photo' : ''}"${opts.filter ? ` data-cat="${m.categorySlug}"` : ''} data-reveal="up">
        <div class="blog-cover ${photo ? '' : m.cover || ''}"><span class="tag">${m.category}</span>${proMark(m)}${coverInner(p)}</div>
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
    const url = `${SITE.origin}/${meta.slug}.html`;
    return `<div class="share">
        <span>Поделиться</span>
        <a href="https://t.me/share/url?url=${encodeURIComponent(url)}" aria-label="Telegram" rel="noopener nofollow"><i class="i i-telegram" aria-hidden="true"></i></a>
        <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(url)}" aria-label="WhatsApp" rel="noopener nofollow"><i class="i i-whatsapp" aria-hidden="true"></i></a>
        <a href="https://vk.com/share.php?url=${encodeURIComponent(url)}" aria-label="ВКонтакте" rel="noopener nofollow"><i class="i i-vk" aria-hidden="true"></i></a>
      </div>`;
  },
};

function expand(body, meta) {
  return body.replace(/<!--\s*@(\w+)\s*([\s\S]*?)\s*-->/g, (full, name, arg) => {
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
  address: { '@type': 'PostalAddress', addressLocality: 'Курск', streetAddress: 'ул. Соловьиная, зд. 51, офис 16', postalCode: '305022', addressCountry: 'RU' },
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
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE.origin}/${m.slug}.html` },
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
  writeFileSync(join(ROOT, `${meta.slug}.html`), page(meta, expand(body, meta)), 'utf8');
  count++;
}

/* ---------- sitemap ---------- */
const today = new Date().toISOString().slice(0, 10);
const urls = all
  .map((p) => ({
    loc: `${SITE.origin}/${p.meta.slug === 'index' ? '' : p.meta.slug + '.html'}`,
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
