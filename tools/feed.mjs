/**
 * YML-фид для Яндекс.Вебмастера («Товары и цены») и Яндекс.Бизнеса.
 *
 * Запуск отдельно не нужен: фид собирается вместе с сайтом (tools/build.mjs)
 * и кладётся в site/yml.xml. Выкладка отправляет его на хостинг как обычный файл.
 *
 * Зачем. По коммерческим запросам Яндекс может показать товарную галерею —
 * карточку с фотографией, ценой и наличием прямо в выдаче. Без фида он такой
 * галереи не соберёт: разметки Product на странице для этого недостаточно.
 *
 * Источник данных — tools/products.json, тот же, что у цен на сайте и у корзины.
 * Иначе в выдаче однажды окажется цена, которой на сайте уже нет: за расхождение
 * Яндекс отключает товарную галерею целиком.
 *
 * Формат YML описан в справке Яндекса. Здесь используется упрощённый набор
 * (offer type="vendor.model"), которого достаточно для трёх артикулов.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, pagePath } from './layout.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Экранирование: в XML пять символов нельзя оставлять как есть, иначе
   валидатор Яндекса отвергнет весь файл целиком, а не одну строку. */
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/* Категория одна: три фракции одного продукта незачем разносить по дереву. */
const CATEGORY = { id: 1, name: 'Порошки для профессиональной гигиены полости рта' };

/* Название товара в фиде. Пишется полностью, без сокращений с точками:
   в товарной галерее это единственная строка, которую человек читает.
   Слово Air Flow сюда не идёт намеренно — это товарный знак EMS, и в названии
   собственного товара он выглядел бы как присвоение чужой марки. В описании
   и на странице метод назван корректно: воздушно-абразивная обработка. */
const NAMES = {
  'ULTRA-170': 'Порошок для воздушно-абразивной обработки STOMTECH PRO ULTRA 14 мкм, 170 г',
  'DELICATE-170': 'Порошок для воздушно-абразивной обработки STOMTECH PRO DELICATE 30 мкм, 170 г',
  'HARD-300': 'Порошок для воздушно-абразивной обработки STOMTECH PRO HARD 40 мкм, 300 г',
  'SET-3': 'Набор порошков STOMTECH PRO 3 в 1: ULTRA 14 мкм, DELICATE 30 мкм, HARD 40 мкм',
};

const DESCRIPTIONS = {
  'ULTRA-170': 'Порошок на основе эритритола, фракция 14 мкм. Для чувствительных пациентов, зоны вокруг имплантов, поддесневой обработки и детского приёма. Совместим со стандартными наконечниками и аппаратами для воздушно-абразивной обработки.',
  'DELICATE-170': 'Порошок на основе эритритола, фракция 30 мкм. Универсальная фракция для регулярной профессиональной гигиены, подготовки к отбеливанию и реставрации. Совместим со стандартными наконечниками и аппаратами.',
  'HARD-300': 'Порошок на основе бикарбоната натрия, фракция 40 мкм. Для плотного пигментированного налёта от кофе, чая и табака. Только наддесневая обработка. Совместим со стандартными наконечниками и аппаратами.',
  'SET-3': 'Набор из трёх фракций: ULTRA 14 мкм и DELICATE 30 мкм на эритритоле, HARD 40 мкм на бикарбонате натрия. Закрывает весь приём — от чувствительных пациентов до плотного налёта курильщика.',
};

export function buildFeed() {
  const products = JSON.parse(readFileSync(join(ROOT, 'tools', 'products.json'), 'utf8'));

  // Дата в формате YYYY-MM-DD HH:mm — так её ждёт валидатор Яндекса.
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const offers = products.items
    // Позиции «по запросу» (price:null) в фид не идут: товар без цены Яндекс отклоняет.
    .filter((p) => typeof p.price === 'number')
    .map((p) => {
      const url = SITE.origin + pagePath(p.page.replace(/\.html$/, ''));
      const params = [
        p.grit ? `      <param name="Фракция" unit="мкм">${p.grit}</param>` : '',
        `      <param name="Основа">${esc(p.base)}</param>`,
        `      <param name="Фасовка" unit="г">${p.weight}</param>`,
      ].filter(Boolean).join('\n');
      return `    <offer id="${esc(p.sku)}" available="true">
      <url>${esc(url)}</url>
      <price>${p.price}</price>
      <currencyId>RUB</currencyId>
      <categoryId>${CATEGORY.id}</categoryId>
      <picture>${esc(SITE.origin + '/' + p.img)}</picture>
      <name>${esc(NAMES[p.sku] || p.title)}</name>
      <vendor>${esc(SITE.name)}</vendor>
      <description>${esc(DESCRIPTIONS[p.sku] || p.title)}</description>
      <sales_notes>Продажа организациям и ИП. Отгрузка напрямую с производства.</sales_notes>
      <manufacturer_warranty>true</manufacturer_warranty>
      <country_of_origin>Россия</country_of_origin>
${params}
    </offer>`;
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE yml_catalog SYSTEM "shops.dtd">
<yml_catalog date="${date}">
  <shop>
    <name>${esc(SITE.name)}</name>
    <company>${esc(SITE.legal)}</company>
    <url>${esc(SITE.origin)}/</url>
    <currencies>
      <currency id="RUB" rate="1"/>
    </currencies>
    <categories>
      <category id="${CATEGORY.id}">${esc(CATEGORY.name)}</category>
    </categories>
    <offers>
${offers.join('\n')}
    </offers>
  </shop>
</yml_catalog>
`;

  writeFileSync(join(ROOT, 'yml.xml'), xml, 'utf8');
  return offers.length;
}

// Позволяет собрать фид и отдельно: node tools/feed.mjs
if (process.argv[1] && process.argv[1].endsWith('feed.mjs')) {
  console.log(`yml.xml собран, позиций: ${buildFeed()}`);
}

/* Проверка перед отправкой в Вебмастер:
   Вебмастер → «Товары и цены» → указать https://stomtech.pro/yml.xml
   Валидатор покажет, все ли предложения приняты. */
