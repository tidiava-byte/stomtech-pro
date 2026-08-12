<?php
/**
 * Приём заявки с сайта и создание сделки в Битрикс24.
 *
 *   POST /api/order   (Content-Type: application/json)
 *
 * Почему это здесь, а не на VPS: приложение статическое, и до появления
 * собственного сервера ключ вебхука положить негде — а класть его в браузер
 * нельзя, он открывает всю CRM. Beget умеет PHP, этого достаточно.
 * Контракт ручки — тот же, что описан в HANDOFF для будущего Node-сервера:
 * когда появится VPS, меняется реализация, фронт не трогаем.
 *
 * Три правила, которые здесь нельзя нарушать:
 *   1. Сумму считает сервер по products.json. Цены из браузера не принимаются
 *      никогда, иначе корзину подделают.
 *   2. Заявка сохраняется на диск ДО обращения в Битрикс. Если CRM недоступна,
 *      заявка всё равно жива и уходит письмом.
 *   3. Ответ клиенту не зависит от того, ответил ли Битрикс: он свою часть
 *      выполнил, а разбор сбоя — наша забота.
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$DIR = __DIR__;

/* ---------- ответ ---------- */
function reply($code, $data) {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}
function fail($message) {
  reply(400, array('ok' => false, 'error' => $message));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  reply(405, array('ok' => false, 'error' => 'Только POST'));
}

/* ---------- настройки ---------- */
if (!file_exists($DIR . '/config.php')) {
  error_log('order.php: нет api/config.php');
  reply(500, array('ok' => false, 'error' => 'Приём заявок не настроен'));
}
$cfg = require $DIR . '/config.php';

/* ---------- частота обращений ----------
   Простейший счётчик по адресу: без него через форму перебирают ИНН
   и заваливают CRM мусором. Файл на адрес, одна строка — метка часа и счёт. */
function rate_limited($dir, $limit) {
  $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'нет';
  $file = $dir . '/orders/.rate-' . md5($ip);
  $hour = date('YmdH');
  $count = 0;
  if (file_exists($file)) {
    $saved = explode(':', trim(file_get_contents($file)));
    if (isset($saved[0]) && $saved[0] === $hour) $count = (int) $saved[1];
  }
  if ($count >= $limit) return true;
  @file_put_contents($file, $hour . ':' . ($count + 1));
  return false;
}

/* ---------- разбор запроса ---------- */
/* Заявка приходит либо чистым JSON, либо multipart — когда к ней приложена
   карточка компании. Разбираем оба вида: сам файл в JSON не завернуть,
   не раздув его на треть базовой кодировкой. */
$raw = isset($_POST['payload']) ? (string) $_POST['payload'] : file_get_contents('php://input');
if (strlen($raw) > 20000) fail('Слишком большая заявка');
$in = json_decode($raw, true);
if (!is_array($in)) fail('Не разобрали данные формы');

/**
 * Приводим телефон к виду +7XXXXXXXXXX.
 *
 * Людям привычно писать «8 930 …», «+7 (930) …» или просто десять цифр,
 * а телефонии и CRM нужен один формат: иначе один и тот же человек заводится
 * в базе дважды, а автодозвон не срабатывает.
 *
 * Номер, который явно не российский, не ломаем: возвращаем как есть с плюсом.
 * Потерять заявку из ближнего зарубежья хуже, чем принять её в чужом формате.
 */
function normalize_phone($raw) {
  $d = preg_replace('/[^0-9]/', '', $raw);
  if ($d === '') return '';
  $len = strlen($d);
  if ($len === 11 && ($d[0] === '8' || $d[0] === '7')) return '+7' . substr($d, 1);
  if ($len === 10) return '+7' . $d;
  return '+' . $d;
}

function field($in, $key, $max) {
  $v = isset($in[$key]) ? trim((string) $in[$key]) : '';
  $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $v);
  return mb_substr($v, 0, $max, 'UTF-8');
}

/* Ловушка для роботов: поле спрятано стилями, человек его не видит и не заполнит.
   Заполнено — молча отвечаем «принято» и ничего не делаем: сообщать роботу,
   что он опознан, незачем. */
if (field($in, 'website', 100) !== '') {
  reply(200, array('ok' => true));
}

$consent = !empty($in['consent']);
if (!$consent) fail('Нужно согласие на обработку персональных данных');

$buyer   = field($in, 'buyer', 60);
/* Юрлицо — только когда форма прямо это сказала. Сравнение «не физлицо»
   считало юрлицом и обращения с форм «Контакты» и «Дилерам», где выбора типа
   нет вовсе: сервер требовал у них ИНН и отклонял каждую такую заявку. */
$isLegal = ($buyer === 'Юридическое лицо или ИП');
$name    = field($in, 'name', 120);
$phone   = normalize_phone(field($in, 'phone', 40));
$email   = field($in, 'email', 120);
$comment = field($in, 'comment', 2000);
$inn     = preg_replace('/\D/', '', field($in, 'inn', 20));
$org     = field($in, 'org', 250);
$kpp     = preg_replace('/\D/', '', field($in, 'kpp', 20));
$ogrn    = preg_replace('/\D/', '', field($in, 'ogrn', 20));
$address = field($in, 'legalAddress', 300);
$formTitle = field($in, 'form', 60);
if ($formTitle === '') $formTitle = 'Заявка с сайта';

if ($name === '') fail('Укажите имя');
if ($phone === '') fail('Укажите телефон');
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Проверьте адрес почты');
if ($isLegal) {
  if (strlen($inn) !== 10 && strlen($inn) !== 12) fail('ИНН — 10 или 12 цифр');
  if ($org === '') fail('Укажите организацию');
}

/* ---------- карточка компании ----------
   Реквизиты по ИНН подтягиваются из открытых реестров, но банковских там нет:
   без них не выставить счёт и не подготовить договор. Поэтому для юрлица файл
   обязателен, а для физлица его не существует. */
$card = null;
if (isset($_FILES['card']) && $_FILES['card']['error'] !== UPLOAD_ERR_NO_FILE) {
  $f = $_FILES['card'];
  if ($f['error'] !== UPLOAD_ERR_OK) fail('Файл не загрузился, попробуйте ещё раз');
  if ($f['size'] > 10 * 1024 * 1024) fail('Файл больше 10 МБ');
  $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
  $allowed = array('pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'rtf', 'odt');
  if (!in_array($ext, $allowed)) fail('Подойдут PDF, Word, Excel, JPG или PNG');
  // Имя файла приходит от посетителя: вычищаем разделители путей,
  // иначе загрузка уедет мимо папки заявок.
  $safeName = preg_replace('/[\\\\\/\x00-\x1F]/u', '', $f['name']);
  $card = array('name' => mb_substr($safeName, 0, 120, 'UTF-8'), 'tmp' => $f['tmp_name']);
}
if ($isLegal && !$card) fail('Приложите карточку компании с реквизитами');

if (rate_limited($DIR, (int) $cfg['rate_limit_per_hour'])) {
  reply(429, array('ok' => false, 'error' => 'Слишком много заявок подряд. Позвоните нам: +7 (930) 766-99-88'));
}

/* ---------- состав заказа: считаем по своему прайсу ----------
   products.json кладёт сюда сборка (node tools/build.mjs). Всё, что пришло
   из браузера кроме артикула и количества, игнорируется. */
$catalog = array();
$pj = @file_get_contents($DIR . '/products.json');
if ($pj) {
  $parsed = json_decode($pj, true);
  if (isset($parsed['items'])) {
    foreach ($parsed['items'] as $p) $catalog[$p['sku']] = $p;
  }
}

$items = array();
$total = 0;
if (isset($in['items']) && is_array($in['items'])) {
  foreach ($in['items'] as $line) {
    $sku = isset($line['sku']) ? (string) $line['sku'] : '';
    $qty = isset($line['qty']) ? (int) $line['qty'] : 0;
    if ($qty < 1 || $qty > 999 || !isset($catalog[$sku])) continue;
    $p = $catalog[$sku];
    $price = isset($p['price']) && $p['price'] !== null ? (float) $p['price'] : 0;
    $items[] = array(
      'sku' => $sku,
      'title' => $p['title'],
      'qty' => $qty,
      'price' => $price,
      'sum' => $price * $qty,
      'b24ProductId' => isset($p['b24ProductId']) ? $p['b24ProductId'] : null,
    );
    $total += $price * $qty;
  }
}

/* ---------- сохраняем до всего остального ----------
   Диск надёжнее сети: что бы дальше ни случилось с Битриксом,
   заявка уже никуда не денется. */
$order = array(
  'time' => date('c'),
  'form' => $formTitle,
  'buyer' => $isLegal ? 'Юрлицо или ИП' : 'Физическое лицо',
  'name' => $name, 'phone' => $phone, 'email' => $email,
  'inn' => $inn, 'org' => $org, 'kpp' => $kpp, 'ogrn' => $ogrn, 'address' => $address,
  'comment' => $comment,
  'items' => $items, 'total' => $total,
  'idempotencyKey' => field($in, 'idempotencyKey', 60),
  'page' => field($in, 'page', 200),
  'ip' => isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '',
);

if (!is_dir($DIR . '/orders')) @mkdir($DIR . '/orders', 0700, true);

/* Повторная отправка формы не должна заводить второй заказ. */
$key = $order['idempotencyKey'];
if ($key !== '') {
  $lock = $DIR . '/orders/.key-' . md5($key);
  if (file_exists($lock)) reply(200, array('ok' => true, 'duplicate' => true));
  @file_put_contents($lock, '1');
}

$fileName = $DIR . '/orders/' . date('Y-m-d_His') . '-' . substr(md5(uniqid('', true)), 0, 6) . '.json';
@file_put_contents($fileName, json_encode($order, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

/* Файл кладём рядом с заявкой и под тем же именем: если Битрикс окажется
   недоступен, карточка не потеряется вместе с заказом. */
$cardPath = null;
if ($card) {
  $cardPath = preg_replace('/\.json$/', '', $fileName) . '-karta-' . $card['name'];
  if (!@move_uploaded_file($card['tmp'], $cardPath)) $cardPath = null;
}

/**
 * Строка товара для сделки и счёта.
 *
 * Наименование НЕ передаём, если товар связан с каталогом Битрикса: тогда
 * подставится название из карточки товара. Оно совпадает с регистрационным
 * удостоверением, а в счёте медизделие должно называться так, как
 * зарегистрировано, — витринные ULTRA и DELICATE тут не годятся.
 * Для позиций без связи с каталогом (набор) название берём с сайта:
 * иначе строка уйдёт вовсе безымянной.
 */
function product_row($ownerType, $ownerId, $it) {
  $row = array(
    'ownerType' => $ownerType,
    'ownerId' => $ownerId,
    'price' => $it['price'],
    'quantity' => $it['qty'],
    'taxRate' => null,          // без НДС, ст. 145.1 НК РФ
    'taxIncluded' => 'Y',
    'measureCode' => 796,       // штука
  );
  if ($it['b24ProductId']) $row['productId'] = (int) $it['b24ProductId'];
  else $row['productName'] = $it['title'];
  return $row;
}

/**
 * Пользовательское поле сделки для карточки компании.
 * Ищем, а если его нет — заводим один раз. Отдельное поле удобнее вложения
 * в ленту: менеджер видит карточку прямо в сделке и не листает историю.
 */
function deal_card_field($cfg) {
  $r = b24($cfg, 'crm.deal.userfield.list', array(
    'filter' => array('FIELD_NAME' => 'UF_CRM_COMPANY_CARD'),
  ));
  if (!empty($r['result'][0]['FIELD_NAME'])) return $r['result'][0]['FIELD_NAME'];

  $a = b24($cfg, 'crm.deal.userfield.add', array('fields' => array(
    'FIELD_NAME' => 'UF_CRM_COMPANY_CARD',
    'USER_TYPE_ID' => 'file',
    'XML_ID' => 'SITE_COMPANY_CARD',
    'EDIT_FORM_LABEL' => array('ru' => 'Карточка компании'),
    'LIST_COLUMN_LABEL' => array('ru' => 'Карточка компании'),
    'SHOW_IN_LIST' => 'Y',
    'EDIT_IN_LIST' => 'Y',
  )));
  return isset($a['result']) ? 'UF_CRM_COMPANY_CARD' : null;
}

/* ---------- Битрикс24 ---------- */
function b24($cfg, $method, $params) {
  $url = rtrim($cfg['b24_webhook'], '/') . '/' . $method . '.json';
  $ch = curl_init($url);
  curl_setopt_array($ch, array(
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => http_build_query($params),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_SSL_VERIFYPEER => true,
  ));
  $body = curl_exec($ch);
  $err = curl_error($ch);
  curl_close($ch);
  if ($body === false) return array('error' => 'curl: ' . $err);
  $res = json_decode($body, true);
  if (!is_array($res)) return array('error' => 'Битрикс ответил не JSON');
  return $res;
}

/**
 * Клиент по ИНН. Ищем среди реквизитов — и у компаний, и у контактов:
 * индивидуальный предприниматель на портале может быть заведён и так, и так.
 * Нашли — работаем на существующей карточке, новую не плодим: два клиента
 * с одним ИНН расходятся историей заказов и взаимозачётами.
 *
 * ENTITY_TYPE_ID: 3 — контакт, 4 — компания.
 */
function client_by_inn($cfg, $inn) {
  $out = array('companyId' => null, 'contactId' => null);
  if ($inn === '') return $out;
  $r = b24($cfg, 'crm.requisite.list', array(
    'filter' => array('RQ_INN' => $inn),
    'select' => array('ENTITY_TYPE_ID', 'ENTITY_ID'),
  ));
  if (empty($r['result'])) return $out;
  foreach ($r['result'] as $q) {
    $type = (int) $q['ENTITY_TYPE_ID'];
    $id = (int) $q['ENTITY_ID'];
    if ($type === 4 && !$out['companyId']) $out['companyId'] = $id;
    if ($type === 3 && !$out['contactId']) $out['contactId'] = $id;
  }
  return $out;
}

/**
 * Контакт по телефону или почте. Нужен там, где ИНН не помог: у клиники
 * заказы обычно оформляет один и тот же человек, и заводить его заново
 * при каждом заказе — значит потерять историю переписки и звонков.
 */
function contact_by_comm($cfg, $phone, $email) {
  $tries = array(array('PHONE', $phone), array('EMAIL', $email));
  foreach ($tries as $t) {
    if ($t[1] === '') continue;
    $r = b24($cfg, 'crm.duplicate.findbycomm', array(
      'entity_type' => 'CONTACT',
      'type' => $t[0],
      'values' => array($t[1]),
    ));
    if (!empty($r['result']['CONTACT'][0])) return (int) $r['result']['CONTACT'][0];
  }
  return null;
}

/**
 * Набор полей реквизитов. Без него счёт печатается без ИНН и КПП.
 *
 * Осторожно с фильтром: у наборов ENTITY_TYPE_ID всегда 8 — это тип «реквизит»,
 * а не тип владельца. Фильтр по 4 (компания) молча возвращает пустой список,
 * и реквизиты не создаются вовсе. На портале заказчика наборов три:
 * 1 «Организация», 3 «ИП», 5 «Физ. лицо».
 *
 * Выбираем по длине ИНН: 12 цифр — это ИП, 10 — организация.
 */
/**
 * Поля, которые допускает набор реквизитов.
 *
 * Наборы устроены по-разному: у «Организации» есть КПП и ОГРН, а у «ИП» —
 * ни того ни другого, зато есть ОГРНИП. Лишнее поле роняет весь запрос
 * целиком: реквизиты не создаются, ИНН в карточку не попадает, а следом
 * перестаёт работать и поиск клиента по ИНН — каждый заказ заводит новую
 * компанию. Именно так и случилось на первых заявках от ИП.
 *
 * Поэтому состав полей спрашиваем у портала, а не держим в голове.
 */
function preset_fields($cfg, $presetId) {
  $r = b24($cfg, 'crm.requisite.preset.field.list', array('preset' => array('ID' => $presetId)));
  $out = array();
  if (!empty($r['result'])) {
    foreach ($r['result'] as $f) {
      if (!empty($f['FIELD_NAME'])) $out[] = $f['FIELD_NAME'];
    }
  }
  return $out;
}

function requisite_preset($cfg, $inn) {
  $r = b24($cfg, 'crm.requisite.preset.list', array(
    'filter' => array('ENTITY_TYPE_ID' => 8, 'ACTIVE' => 'Y'),
    'select' => array('ID', 'NAME', 'COUNTRY_ID'),
  ));
  if (empty($r['result'])) return null;

  $wantIp = (strlen($inn) === 12);
  foreach ($r['result'] as $p) {
    $isIp = (mb_stripos($p['NAME'], 'ИП', 0, 'UTF-8') !== false);
    $isPerson = (mb_stripos($p['NAME'], 'Физ', 0, 'UTF-8') !== false);
    if ($isPerson) continue;
    if ($wantIp === $isIp) return (int) $p['ID'];
  }
  return (int) $r['result'][0]['ID'];
}

$b24 = array('ok' => false, 'errors' => array());

if (empty($cfg['b24_webhook'])) {
  $b24['errors'][] = 'Вебхук Битрикс24 не задан в api/config.php';
} else {
  $assigned = (int) $cfg['b24_assigned_by'];
  $companyId = null;
  $contactId = null;

  /* --- компания и её реквизиты --- */
  if ($isLegal) {
    $found = client_by_inn($cfg, $inn);
    $companyId = $found['companyId'];
    $contactId = $found['contactId'];
    // Компанию заводим, только если по этому ИНН вообще ничего не нашлось:
    // ИП, заведённый контактом, компанией дублировать не надо.
    if (!$companyId && !$contactId) {
      $r = b24($cfg, 'crm.company.add', array('fields' => array(
        'TITLE' => $org !== '' ? $org : ('ИНН ' . $inn),
        'COMPANY_TYPE' => 'CUSTOMER',
        'ASSIGNED_BY_ID' => $assigned,
        'OPENED' => 'Y',
        'COMMENTS' => 'Заведена автоматически по заявке с сайта. ИНН ' . $inn
          . ($kpp ? ', КПП ' . $kpp : '') . ($ogrn ? ', ОГРН ' . $ogrn : '')
          . ($address ? '. Адрес: ' . $address : ''),
      )));
      if (isset($r['result'])) {
        $companyId = (int) $r['result'];
        $preset = requisite_preset($cfg, $inn);
        if ($preset) {
          /* Реквизиты отдельной сущностью: именно отсюда счёт берёт ИНН и КПП,
             и именно по ним потом находится постоянный клиент. */
          $allowed = preset_fields($cfg, $preset);
          $want = array(
            'RQ_COMPANY_NAME' => $org,
            'RQ_COMPANY_FULL_NAME' => $org,
            'RQ_INN' => $inn,
            'RQ_KPP' => $kpp,
            'RQ_OGRN' => $ogrn,
            // У предпринимателя тот же номер называется иначе.
            'RQ_OGRNIP' => $ogrn,
          );
          $rqFields = array(
            'ENTITY_TYPE_ID' => 4,
            'ENTITY_ID' => $companyId,
            'PRESET_ID' => $preset,
            'NAME' => $org !== '' ? $org : ('ИНН ' . $inn),
            'ACTIVE' => 'Y',
          );
          foreach ($want as $k => $v) {
            if ($v !== '' && (!$allowed || in_array($k, $allowed))) $rqFields[$k] = $v;
          }
          $rq = b24($cfg, 'crm.requisite.add', array('fields' => $rqFields));
          if (isset($rq['result']) && $address !== '') {
            // 6 — юридический адрес, 8 — сущность «реквизит»
            b24($cfg, 'crm.address.add', array('fields' => array(
              'TYPE_ID' => 6, 'ENTITY_TYPE_ID' => 8,
              'ENTITY_ID' => (int) $rq['result'],
              'ADDRESS_1' => $address, 'COUNTRY' => 'Россия',
            )));
          }
          if (empty($rq['result'])) {
            $b24['errors'][] = 'реквизиты не созданы: '
              . (isset($rq['error_description']) ? $rq['error_description'] : 'причина неизвестна');
          }
        }
      } else {
        $b24['errors'][] = 'компания: ' . (isset($r['error_description']) ? $r['error_description'] : 'не создана');
      }
    }
  }

  /* --- контактное лицо --- */
  // По ИНН контакт мог уже найтись выше; если нет — пробуем по телефону и почте.
  if (!$contactId) $contactId = contact_by_comm($cfg, $phone, $email);

  if ($contactId) {
    // Нашли существующего: привязываем к компании, если раньше связи не было.
    if ($companyId) {
      b24($cfg, 'crm.contact.update', array(
        'id' => $contactId,
        'fields' => array('COMPANY_ID' => $companyId),
      ));
    }
  } else {
  $c = b24($cfg, 'crm.contact.add', array('fields' => array(
    'NAME' => $name,
    'ASSIGNED_BY_ID' => $assigned,
    'OPENED' => 'Y',
    'TYPE_ID' => 'CLIENT',
    'SOURCE_ID' => 'WEB',
    'COMPANY_ID' => $companyId ? $companyId : '',
    'PHONE' => array(array('VALUE' => $phone, 'VALUE_TYPE' => 'WORK')),
    'EMAIL' => $email !== '' ? array(array('VALUE' => $email, 'VALUE_TYPE' => 'WORK')) : array(),
  )));
  if (isset($c['result'])) $contactId = (int) $c['result'];
  else $b24['errors'][] = 'контакт: ' . (isset($c['error_description']) ? $c['error_description'] : 'не создан');
  }

  /* --- сделка --- */
  $lines = array();
  foreach ($items as $it) {
    $lines[] = $it['title'] . ' — ' . $it['qty'] . ' шт';
  }
  $dealTitle = ($org !== '' ? $org : $name) . ' — заявка с сайта';
  $d = b24($cfg, 'crm.deal.add', array('fields' => array(
    'TITLE' => $dealTitle,
    'TYPE_ID' => 'SALE',
    'SOURCE_ID' => 'WEB',
    // Воронка. Без неё сделка падает в воронку по умолчанию — «Склад лидов».
    'CATEGORY_ID' => (int) $cfg['b24_deal_category'],
    'ASSIGNED_BY_ID' => $assigned,
    'OPENED' => 'Y',
    'CURRENCY_ID' => 'RUB',
    'OPPORTUNITY' => $total,
    'COMPANY_ID' => $companyId ? $companyId : '',
    'CONTACT_ID' => $contactId ? $contactId : '',
    'COMMENTS' => implode("\n", array_filter(array(
      'Форма: ' . $formTitle,
      'Покупатель: ' . $order['buyer'],
      $inn ? 'ИНН: ' . $inn . ($kpp ? ' / КПП ' . $kpp : '') : '',
      $ogrn ? 'ОГРН: ' . $ogrn : '',
      $address ? 'Юридический адрес: ' . $address : '',
      'Телефон: ' . $phone,
      $email ? 'Почта: ' . $email : '',
      $lines ? "Состав заказа:\n" . implode("\n", $lines) : 'Состав заказа не указан',
      $comment ? 'Комментарий: ' . $comment : '',
      $order['page'] ? 'Страница: ' . $order['page'] : '',
    ))),
  )));

  if (isset($d['result'])) {
    $dealId = (int) $d['result'];
    $b24['dealId'] = $dealId;

    /* ---------- карточка клиента ----------
       Основное место — поле компании «Карточка клиента + документы».

       Поле множественное, и дописать в него через REST, ничего не потеряв,
       нельзя: при обновлении Битрикс заменяет набор целиком, а скачать уже
       лежащие файлы через REST невозможно — значит, вернуть их обратно нечем.
       Проверено вручную: передача идентификаторов старых файлов их не сохраняет.

       Поэтому в поле компании пишем, только когда оно пустое. Если документы
       там уже есть, файл уходит в сделку, а в компанию — запись в ленте
       со ссылкой на сделку. Затереть документы клиента недопустимо ни при
       каких обстоятельствах: восстановить их будет неоткуда.

       У физлица компании нет — там карточка сразу идёт в поле сделки. */
    if ($cardPath) {
      $b64 = base64_encode(file_get_contents($cardPath));
      $attached = false;
      $companyField = isset($cfg['b24_company_card_field']) ? $cfg['b24_company_card_field'] : '';

      if ($companyId && $companyField) {
        $cur = b24($cfg, 'crm.company.get', array('id' => $companyId));
        $has = !empty($cur['result'][$companyField]);
        if (!$has) {
          $u = b24($cfg, 'crm.company.update', array('id' => $companyId, 'fields' => array(
            $companyField => array(array('fileData' => array($card['name'], $b64))),
          )));
          $attached = !empty($u['result']);
          if (!$attached) $b24['errors'][] = 'карточка в компанию не легла';
        } else {
          // Документы уже есть — не трогаем их, а сообщаем менеджеру в ленте компании.
          b24($cfg, 'crm.timeline.comment.add', array('fields' => array(
            'ENTITY_ID' => $companyId,
            'ENTITY_TYPE' => 'company',
            'COMMENT' => 'К заявке с сайта приложена карточка клиента — файл в сделке №' . $dealId
              . '. В поле «Карточка клиента + документы» не добавлен, чтобы не затереть уже загруженные документы.',
          )));
        }
      }

      /* Не легло в компанию — кладём в сделку: у неё своё поле под карточку. */
      if (!$attached) {
        $field = deal_card_field($cfg);
        if ($field) {
          $u = b24($cfg, 'crm.deal.update', array('id' => $dealId, 'fields' => array(
            $field => array('fileData' => array($card['name'], $b64)),
          )));
          $attached = !empty($u['result']);
        }
      }

      /* И совсем последний рубеж — вложение в ленту сделки. */
      if (!$attached) {
        $t = b24($cfg, 'crm.timeline.comment.add', array('fields' => array(
          'ENTITY_ID' => $dealId,
          'ENTITY_TYPE' => 'deal',
          'COMMENT' => 'Карточка клиента, приложенная к заявке на сайте',
          'FILES' => array(array($card['name'], $b64)),
        )));
        if (empty($t['result'])) $b24['errors'][] = 'карточка клиента не прикрепилась никуда';
      }
    }

    // Товарные позиции сделки. Без них счёт пришлось бы набирать руками.
    if ($items) {
      $rows = array();
      foreach ($items as $it) {
        $rows[] = product_row('D', $dealId, $it);
      }
      $pr = b24($cfg, 'crm.item.productrow.set', array(
        'ownerType' => 'D', 'ownerId' => $dealId, 'productRows' => $rows,
      ));
      if (isset($pr['error'])) $b24['errors'][] = 'позиции сделки: ' . $pr['error'];
    }

    /* --- счёт --- */
    if (!empty($cfg['b24_create_invoice']) && $items) {
      $inv = b24($cfg, 'crm.item.add', array(
        'entityTypeId' => 31,   // смарт-процесс «Счёт»
        'fields' => array(
          'title' => 'Счёт по заявке с сайта',
          'assignedById' => $assigned,
          'companyId' => $companyId ? $companyId : null,
          'contactId' => $contactId ? $contactId : null,
          'opportunity' => $total,
          'currencyId' => 'RUB',
          'parentId2' => $dealId,   // связь со сделкой
        ),
      ));
      if (isset($inv['result']['item']['id'])) {
        $invoiceId = (int) $inv['result']['item']['id'];
        $b24['invoiceId'] = $invoiceId;
        $rows = array();
        foreach ($items as $it) {
          $rows[] = product_row('SI', $invoiceId, $it);
        }
        b24($cfg, 'crm.item.productrow.set', array(
          'ownerType' => 'SI', 'ownerId' => $invoiceId, 'productRows' => $rows,
        ));
      } else {
        $b24['errors'][] = 'счёт: ' . (isset($inv['error_description']) ? $inv['error_description'] : 'не создан');
      }
    }

    $b24['ok'] = empty($b24['errors']);
  } else {
    $b24['errors'][] = 'сделка: ' . (isset($d['error_description']) ? $d['error_description'] : 'не создана');
  }
}

/* ---------- если что-то пошло не так ----------
   Клиенту про это знать незачем: свою часть он выполнил. А вот менеджер
   должен узнать сразу, иначе заявка тихо осядет в папке. */
if (!$b24['ok']) {
  @file_put_contents($DIR . '/orders/errors.log',
    date('c') . ' ' . basename($fileName) . ' ' . implode('; ', $b24['errors']) . "\n",
    FILE_APPEND);

  $body = "Заявка с сайта НЕ попала в Битрикс24.\n\n"
    . implode("\n", $b24['errors']) . "\n\n"
    . "Файл заявки: api/orders/" . basename($fileName) . "\n\n"
    . json_encode($order, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
  @mail($cfg['fallback_email'], '=?UTF-8?B?' . base64_encode('Заявка с сайта — сбой CRM') . '?=', $body,
    "Content-Type: text/plain; charset=UTF-8\r\nFrom: info@stomtech.pro");
}

reply(200, array('ok' => true));
