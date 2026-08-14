/**
 * IndexNow — уведомление поисковиков об изменившихся страницах.
 *
 * Обычно поисковый робот сам решает, когда прийти на сайт: может через день,
 * может через три недели. IndexNow переворачивает порядок — сайт сообщает
 * «вот эти адреса изменились, заходите». Обход ускоряется с недель до суток-двух.
 *
 * Протокол поддерживают Яндекс, Bing, Seznam и Naver. Google — нет, у него
 * для этого Search Console. Отправляем на общий адрес api.indexnow.org:
 * он рассылает уведомление всем участникам разом.
 *
 * ---------- как это устроено ----------
 * 1. Ключ. Произвольная строка, которая лежит на сайте файлом `<ключ>.txt`
 *    и содержит сама себя. Так поисковик убеждается, что уведомление отправил
 *    владелец сайта, а не посторонний. Ключ не секрет: он опубликован на сайте,
 *    поэтому спокойно хранится в репозитории (tools/indexnow.json) и попадает
 *    в корень сайта при сборке.
 * 2. Список адресов. Отправлять полагается только изменившееся — рассылка всего
 *    сайта на каждой выкладке считается злоупотреблением. Поэтому сборка
 *    считает отпечаток каждой страницы и запоминает его: в список попадают
 *    те, у которых он изменился (см. tools/build.mjs).
 * 3. Отправка. Делается ПОСЛЕ выкладки, из tools/deploy-beget.mjs: сообщать
 *    об изменениях, которых ещё нет на хостинге, бессмысленно — робот придёт
 *    на старую версию страницы и запомнит именно её.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY_FILE = join(ROOT, 'tools', 'indexnow.json');
const QUEUE_FILE = join(ROOT, 'tools', '.indexnow-queue.json');
/* Адреса, куда отправляем уведомление.
   Общий api.indexnow.org держит Microsoft, и он вместе с bing.com с августа 2026
   стабильно отвечает нашему домену 403 при полностью исправном файле ключа
   (проверено: text/plain, 32 байта, доступен по https). Яндекс на тот же запрос
   отвечает 202. Поэтому шлём в оба адреса и считаем успехом ответ любого:
   для нас Яндекс — основной поисковик, а общий адрес подхватит Bing и Seznam,
   когда те перестанут отказывать. */
const ENDPOINTS = [
  'https://yandex.com/indexnow',
  'https://api.indexnow.org/indexnow',
];

/* Ключ создаётся один раз и дальше живёт в репозитории. Менять его без нужды
   нельзя: сменили — старый файл на сайте пропал, а поисковик ещё какое-то время
   проверяет уведомления по нему. */
export function getKey() {
  if (existsSync(KEY_FILE)) return JSON.parse(readFileSync(KEY_FILE, 'utf8')).key;
  const key = randomBytes(16).toString('hex');
  writeFileSync(KEY_FILE, JSON.stringify({ key, created: new Date().toISOString().slice(0, 10) }, null, 2) + '\n', 'utf8');
  console.log(`IndexNow: создан ключ ${key}`);
  return key;
}

/* Файл-подтверждение в корне сайта. Кладётся при каждой сборке: если его
   не окажется на хостинге, поисковик молча отбросит все уведомления. */
export function writeKeyFile() {
  const key = getKey();
  writeFileSync(join(ROOT, `${key}.txt`), key, 'utf8');
  return key;
}

/* Очередь адресов между сборкой и выкладкой.
   Сборка знает, что изменилось, но ещё не выложено; выкладка знает, что файлы
   доехали, но уже не помнит, какие страницы менялись. Очередь связывает их. */
export const readQueue = () =>
  existsSync(QUEUE_FILE) ? JSON.parse(readFileSync(QUEUE_FILE, 'utf8')) : [];

export function writeQueue(urls) {
  if (urls.length) writeFileSync(QUEUE_FILE, JSON.stringify(urls, null, 2) + '\n', 'utf8');
  else if (existsSync(QUEUE_FILE)) unlinkSync(QUEUE_FILE);
}

/**
 * Отправка уведомления. Возвращает { sent, status } либо { sent: 0 },
 * если отправлять нечего.
 *
 * Ошибку наружу не бросаем: непрошедшее уведомление — не повод считать
 * выкладку неудачной. Сайт уже на хостинге, поисковик просто придёт позже сам.
 */
export async function ping(urls, host) {
  if (!urls || !urls.length) return { sent: 0 };
  const key = getKey();
  const body = {
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    // Ограничение протокола — 10 000 адресов за раз. У нас их четыре десятка,
    // но пусть проверка будет: список формируется автоматически.
    urlList: urls.slice(0, 10000),
  };
  const statuses = [];
  let ok = false;
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      // 200 — принято, 202 — принято, ключ ещё проверяется. Оба означают успех.
      if (res.status === 200 || res.status === 202) ok = true;
      statuses.push(`${new URL(endpoint).host} ${res.status}`);
    } catch (e) {
      statuses.push(`${new URL(endpoint).host} ${e.message}`);
    }
  }
  return { sent: ok ? body.urlList.length : 0, status: statuses.join(', '), ok };
}

/* Ручная отправка, когда нужно сообщить об адресах вне обычного цикла:
     node tools/indexnow.mjs https://stomtech.pro/catalog https://stomtech.pro/ultra
   Без аргументов отправляется то, что накопила последняя сборка. */
if (process.argv[1] && process.argv[1].endsWith('indexnow.mjs')) {
  const { SITE } = await import('./layout.mjs');
  const host = new URL(SITE.origin).host;
  const urls = process.argv.slice(2).length ? process.argv.slice(2) : readQueue();
  if (!urls.length) {
    console.log('IndexNow: отправлять нечего — со времени прошлой выкладки ничего не менялось.');
  } else {
    const r = await ping(urls, host);
    console.log(r.ok
      ? `IndexNow: отправлено адресов — ${r.sent} (ответ ${r.status}).`
      : `IndexNow: не отправлено (${r.error || 'ответ ' + r.status}).`);
    if (r.ok && !process.argv.slice(2).length) writeQueue([]);
  }
}
