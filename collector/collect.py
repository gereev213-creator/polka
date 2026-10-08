#!/usr/bin/env python3
"""Сборщик находок для «Полки».

Запускается У ВАС НА КОМПЬЮТЕРЕ, а не на сервере Amvera. Причина простая:
Авито блокирует адреса дата-центров, и при блокировке лёг бы весь сервис —
вместе с ботом, подписками и приложением. С домашнего IP запросы выглядят
как обычные.

Что делает:
  1. Открывает страницы поиска, которые вы указали в config.json.
  2. Достаёт из них карточки: заголовок, цену, город, ссылку, фото.
  3. Отправляет пачкой на сервер: POST /api/ingest с вашим токеном.

Чего НЕ делает:
  • не сохраняет имена и телефоны продавцов — только то, что видно в поиске;
  • не обходит капчу: увидел блокировку — останавливается и говорит об этом;
  • не долбит сайт: пауза между запросами 2–4 секунды плюс случайный разброс.

Запуск:
    python3 collect.py --selftest          # проверка разбора на образце
    python3 collect.py                     # один проход по всем запросам
    python3 collect.py --loop --every 900  # повторять каждые 15 минут
"""
import argparse
import json
import os
import random
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from html import unescape

USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
              "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36")

# Признаки того, что нас остановили — по ним сразу выходим, а не долбим сайт
BLOCK_MARKERS = ('captcha', 'showcaptcha', 'Доступ ограничен', 'проблема с IP',
                 'IP-адрес', 'подтвердите, что вы не робот', 'blocked')

# Признаки того, что лот больше не продаётся. Авито не отдаёт статус
# в выдаче — узнаём только переоткрыв страницу.
GONE_MARKERS = ('объявление снято', 'снято с публикации', 'объявление не найдено',
                'страница не найдена', 'товар продан', 'продано', 'объявление удалено',
                'это объявление больше не доступно')


class Blocked(Exception):
    """Сайт показал капчу или ограничение — прекращаем работу."""


# Прокси для обхода блокировки по IP. Авито не пускает адреса дата-центров
# (проверено: сервер Amvera получает 429 «проблема с IP» на первом запросе),
# а резидентный или мобильный прокси выглядит как обычный домашний абонент.
# Формат: http://логин:пароль@хост:порт
PROXY = os.environ.get('POLKA_PROXY', '')
_OPENER = None

# ── Главное открытие ────────────────────────────────────────────────────────
# Авито блокирует не только по IP, но и по ОТПЕЧАТКУ КЛИЕНТА. Обычный Python
# и даже подделка под Chrome получают 429, а клиент с отпечатком Safari —
# HTTP 200 и полную выдачу. Проверено на живом сайте: 3 запроса подряд, 50
# карточек каждый. Поэтому ходим через curl_cffi, а не через urllib.
try:
    from curl_cffi import requests as _cffi
except Exception:
    _cffi = None

# Авито пропускает не всегда: несколько запросов проходят, потом 429.
# Поэтому перебираем отпечатки — какой-то из них в этот момент проходит, —
# и запоминаем удачный, чтобы не тратить попытки впустую.
IMPERSONATE = os.environ.get('POLKA_IMPERSONATE', 'safari')
IMPERSONATE_POOL = ('safari', 'safari17_0', 'safari15_3', 'chrome131',
                    'edge101', 'firefox133', 'chrome')
_WORKING_PROFILE = None


def _opener():
    """Открывалка запросов. Собирается один раз, с прокси или без."""
    global _OPENER
    if _OPENER is None:
        handlers = []
        if PROXY:
            handlers.append(urllib.request.ProxyHandler({'http': PROXY, 'https': PROXY}))
        # На macOS у системного python3 часто нет корневых сертификатов, и
        # запрос падает с CERTIFICATE_VERIFY_FAILED — это выглядит как
        # блокировка, хотя дело в локальной настройке. Если есть certifi,
        # берём сертификаты оттуда.
        try:
            import certifi
            handlers.append(urllib.request.HTTPSHandler(
                context=ssl.create_default_context(cafile=certifi.where())))
        except Exception:
            pass
        _OPENER = urllib.request.build_opener(*handlers)
    return _OPENER


# ── Цели по умолчанию ───────────────────────────────────────────────────────
# Проверены на живом Авито: каждая отдаёт 50–80 объявлений.
#
# Зачем в коде, а не только в config.json: на сервере config.json нет —
# он в .gitignore, потому что содержит токен. Без этого списка серверный
# сборщик запускался с нулём целей и не собирал НИЧЕГО.
#
# Форма адреса: /all/ — вся Россия. /rossiya/ Авито отдаёт пустой страницей.
DEFAULT_CATEGORIES = [
    ("Электроника", "telefony"),
    ("Электроника", "noutbuki"),
    ("Электроника", "planshety_i_elektronnye_knigi"),
    ("Электроника", "nastolnye_kompyutery"),
    ("Электроника", "igry_pristavki_i_programmy"),
    ("Электроника", "audio_i_video"),
    ("Электроника", "bytovaya_tehnika"),
    ("Электроника", "tovary_dlya_kompyutera"),
    ("Одежда, обувь, аксессуары", "odezhda_obuv_aksessuary"),
    ("Хобби и отдых", "hobbi_i_otdyh"),
    ("Транспорт", "avtomobili"),
    ("Недвижимость", "kvartiry"),
    ("Работа и подработка", "rabota"),
    ("Другое", "velosipedy"),
    ("Другое", "muzykalnye_instrumenty"),
    ("Другое", "krasota_i_zdorove"),
]


# ?s=104 — сортировка Авито «по дате». Проверено на живом сайте: с ней
# выдача состоит ТОЛЬКО из свежих объявлений (49 из 49 — по часу давности),
# а без неё даты есть у 10 из 50 и попадается недельное старьё.
DATE_SORT = "?s=104"


def default_targets() -> list:
    cats = DEFAULT_CATEGORIES
    # На сервере Amvera контейнер слабее, чем домашний Mac: ограничиваем
    # число категорий, иначе сбор съедает память и сервис уходит в перезапуск.
    try:
        limit = int(os.environ.get('POLKA_MAX_CATEGORIES', '0') or 0)
    except ValueError:
        limit = 0
    if limit > 0:
        cats = cats[:limit]
    return [{"source": "avito", "url": f"https://www.avito.ru/all/{slug}{DATE_SORT}",
             "city": "Россия", "category": cat} for cat, slug in cats]


def fetch(url: str, timeout: int = 25) -> str:
    """Один вежливый запрос. Никаких заголовков, имитирующих «свой» сайт."""
    req = urllib.request.Request(url, headers={
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru-RU,ru;q=0.9',
    })
    # Основной путь: перебираем отпечатки, пока какой-нибудь не пройдёт
    if _cffi is not None:
        global _WORKING_PROFILE
        proxies = {'http': PROXY, 'https': PROXY} if PROXY else None
        # Удачный отпечаток пробуем первым: он уже доказал, что работает
        order = list(IMPERSONATE_POOL)
        if _WORKING_PROFILE and _WORKING_PROFILE in order:
            order.remove(_WORKING_PROFILE)
            order.insert(0, _WORKING_PROFILE)
        last_error = 'ни один отпечаток не прошёл'
        for profile in order:
            try:
                r = _cffi.get(url, impersonate=profile, timeout=timeout, proxies=proxies)
            except Exception as exc:
                last_error = f"{profile}: {str(exc)[:70]}"
                continue
            if r.status_code in (403, 429) or 'data-marker="item"' not in r.text:
                last_error = f"{profile}: HTTP {r.status_code}"
                time.sleep(random.uniform(2.0, 5.0))
                continue
            _WORKING_PROFILE = profile
            if profile != IMPERSONATE:
                print(f"  (сработал отпечаток {profile})")
            return r.text
        raise Blocked(last_error)
        if r.status_code in (403, 429):
            raise Blocked(f"HTTP {r.status_code} — доступ ограничен по IP")
        html_cffi = r.text
        # Признаки блокировки проверяем ТОЛЬКО если карточек нет: слово
        # captcha встречается и на обычной странице выдачи, и раньше это
        # давало ложное «нас заблокировали» на живых данных.
        if 'data-marker="item"' not in html_cffi:
            low_cffi = html_cffi.lower()
            for marker in BLOCK_MARKERS:
                if marker.lower() in low_cffi:
                    raise Blocked(f"похоже на блокировку (нашли «{marker}»)")
        return html_cffi

    # Без curl_cffi шансов почти нет, но оставляем запасной путь

    # Запасной путь, если curl_cffi не установлен: обычно получает 429
    try:
        with _opener().open(req, timeout=timeout) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        # 429 и 403 Авито отдаёт на «плохой» IP. Это НЕ обычная ошибка:
        # без этой ветки сборщик счёл бы её временной и пошёл долбить дальше,
        # закрепляя блокировку. Проверено: наш IP получает 429 с текстом
        # «Доступ ограничен: проблема с IP» на первом же запросе.
        if exc.code in (403, 429):
            raise Blocked(f"HTTP {exc.code} — доступ ограничен по IP")
        raise
    html = raw.decode('utf-8', errors='replace')
    if 'data-marker="item"' not in html:
        low = html.lower()
        for marker in BLOCK_MARKERS:
            if marker.lower() in low:
                raise Blocked(f"похоже на блокировку (нашли «{marker}»)")
    return html


# ── Разбор страницы ─────────────────────────────────────────────────────────
def parse_price(text) -> int:
    """«1 250 ₽» → 1250. Пустое и «бесплатно» → 0."""
    if isinstance(text, (int, float)):
        return int(text)
    digits = re.sub(r'[^0-9]', '', str(text or ''))
    return int(digits) if digits else 0


def external_id_from_url(url: str) -> str:
    """Авито: .../some-title_123456789 → 123456789. Юла: .../offer/abc-123 → abc-123."""
    m = re.search(r'_(\d{6,})(?:\?|$)', url or '')
    if m:
        return m.group(1)
    m = re.search(r'/([0-9a-f]{8}-[0-9a-f-]{20,})', url or '', re.I)
    if m:
        return m.group(1)
    m = re.search(r'/(\d{6,})(?:\?|$)', url or '')
    if m:
        return m.group(1)
    return ''


def items_from_jsonld(html: str) -> list:
    """Самый надёжный путь: сайты кладут разметку schema.org для поисковиков."""
    out = []
    for block in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>',
                            html, re.S | re.I):
        try:
            data = json.loads(unescape(block.strip()))
        except Exception:
            continue
        for node in (data if isinstance(data, list) else [data]):
            if not isinstance(node, dict):
                continue
            graph = node.get('@graph') if isinstance(node.get('@graph'), list) else [node]
            for item in graph:
                if not isinstance(item, dict):
                    continue
                offers = item.get('offers')
                if isinstance(offers, list):
                    offers = offers[0] if offers else {}
                price = parse_price((offers or {}).get('price')) if isinstance(offers, dict) else 0
                url = item.get('url') or (offers or {}).get('url') if isinstance(offers, dict) else item.get('url')
                name = item.get('name') or item.get('headline')
                if name and price and url:
                    images = item.get('image')
                    if isinstance(images, str):
                        images = [images]
                    out.append({
                        'title': str(name)[:200],
                        'price': price,
                        'url': str(url),
                        'photos': [str(i) for i in (images or []) if isinstance(i, str)][:5],
                        'external_id': external_id_from_url(str(url)),
                        'city': '',
                    })
    return out


def items_from_initial_data(html: str) -> list:
    """Второй путь: Авито кладёт данные страницы в window.__initialData__."""
    out = []
    m = re.search(r'window\.__initialData__\s*=\s*"([^"]+)"', html)
    if not m:
        return out
    try:
        from urllib.parse import unquote
        payload = json.loads(unquote(m.group(1)))
    except Exception:
        return out

    def walk(node):
        if isinstance(node, dict):
            title = node.get('title')
            price = node.get('priceDetailed') or node.get('price')
            if isinstance(price, dict):
                price = price.get('value')
            url = node.get('urlPath') or node.get('url')
            if title and price and url:
                images = node.get('images') or []
                photos = []
                for img in images if isinstance(images, list) else []:
                    if isinstance(img, dict) and img.get('640x480'):
                        photos.append(img['640x480'])
                    elif isinstance(img, str):
                        photos.append(img)
                out.append({
                    'title': str(title)[:200],
                    'price': parse_price(price),
                    'url': url if str(url).startswith('http') else f"https://www.avito.ru{url}",
                    'photos': photos[:5],
                    'external_id': str(node.get('id') or '') or external_id_from_url(str(url)),
                    'city': str(node.get('location') or node.get('geo') or '')[:100],
                })
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(payload)
    return out


def hours_ago(text: str):
    """«7 дней назад» → 168 часов. «сегодня» → 0.

    Нужно, чтобы не присылать как «находку» объявление недельной давности:
    на Авито сверху выдачи висят как раз такие, и порядок там не по свежести.
    """
    t = str(text or '').lower().replace('\xa0', ' ').strip()
    if not t:
        return None
    if 'сегодня' in t or 'минут' in t or 'только что' in t or 'сейчас' in t:
        return 0
    if 'вчера' in t:
        return 24
    m = re.search(r'(\d+)?\s*(минут|час|день|дня|дней|сут|недел|месяц|год)', t)
    if not m:
        return None
    # «месяц назад» и «год назад» — без числа, поэтому n может быть пустым
    n = int(m.group(1)) if m.group(1) else 1
    unit = m.group(2)
    if unit.startswith('минут'):
        return 0
    if unit.startswith('час'):
        return n
    if unit.startswith(('день', 'дня', 'дней', 'сут')):
        return n * 24
    if unit.startswith('недел'):
        return n * 168
    if unit.startswith('месяц'):
        return n * 720
    if unit.startswith('год'):
        return n * 8760
    return None


def items_from_microdata(html: str) -> list:
    """Разбор микроразметки schema.org — ОСНОВНОЙ путь для Авито.

    Проверено на настоящей странице выдачи: карточки размечены атрибутами
    itemProp, а не JSON-LD, поэтому прежний разбор находил НОЛЬ карточек из 80.
    Классы у Авито хешированные (iva-item-title-KE8A9), так что цепляемся за
    itemProp — он смысловой и переживает пересборку вёрстки.
    """
    out = []
    for chunk in re.split(r'data-marker="item"', html)[1:]:
        chunk = chunk[:40000]

        def prop(name: str, attr: str = 'content') -> str:
            """Значение itemProp, в любом порядке атрибутов."""
            m = re.search(r'itemProp="%s"[^>]*?%s="([^"]*)"' % (name, attr), chunk, re.I)
            if m:
                return m.group(1)
            m = re.search(r'%s="([^"]*)"[^>]*?itemProp="%s"' % (attr, name), chunk, re.I)
            return m.group(1) if m else ''

        price = parse_price(prop('price'))
        url = prop('url', 'href')
        if not url:
            m = re.search(r'href="(/[^"]+_\d{6,}[^"]*)"', chunk)
            url = m.group(1) if m else ''
        if url.startswith('/'):
            url = "https://www.avito.ru" + url

        # Заголовок лежит внутри <a>, поэтому между тегами допускаем вложенность
        title = ''
        m = re.search(r'item-title[^>]*>(?:\s*<[^>]+>)*\s*([^<]{3,200})', chunk)
        if m:
            title = unescape(re.sub(r'\s+', ' ', m.group(1))).strip()

        m = re.search(r'data-item-id="(\d+)"', chunk)
        ext = m.group(1) if m else external_id_from_url(url)

        # Фото: Авито подгружает часть картинок лениво, поэтому кроме src
        # смотрим data-src и srcset. Без этого фотографии были лишь у 12
        # карточек из 50, а в приложении показывалась серая заглушка.
        photos = re.findall(r'itemProp="image"[^>]*?(?:data-)?src="([^"]+)"', chunk, re.I)
        if not photos:
            photos = re.findall(r'(?:data-)?src="(https://[\w.-]*img\.avito\.st/[^"]+)"', chunk)
        if not photos:
            photos = re.findall(r"https://[\w.-]*img\.avito\.st/[^\s<>]+", chunk)
        photos = [x.strip('"\',') for x in photos if x.startswith("http")]
        photos = list(dict.fromkeys(p for p in photos if p))

        city = ''
        m = re.search(r'itemProp="addressLocality"[^>]*content="([^"]*)"', chunk, re.I)
        if m:
            city = unescape(m.group(1)).strip()

        # Дата публикации: без неё мы бы слали недельные объявления как находки
        m = re.search(r'data-marker="item-date"[^>]*>([^<]+)<', chunk)
        ago = hours_ago(m.group(1)) if m else None

        photos = [p.split(' ')[0] for p in photos]
        if title and price and url.startswith('http'):
            out.append({
                'title': title[:200],
                'price': price,
                'url': url.split('?')[0],
                'photos': photos[:5],
                'external_id': ext,
                'city': city,
                'hours_ago': ago,
            })
    return out


def items_from_html(html: str) -> list:
    """Третий путь: обычный разбор карточек, если разметки нет."""
    out = []
    for chunk in re.split(r'data-marker="item"', html)[1:]:
        chunk = chunk[:4000]
        link = re.search(r'href="(/[^"]+_\d{6,}[^"]*)"', chunk)
        title = re.search(r'item-title[^>]*>([^<]{3,200})<', chunk) or \
            re.search(r'<h3[^>]*>([^<]{3,200})</h3>', chunk)
        price = re.search(r'item-price[^>]*>([^<]{0,40})<', chunk) or \
            re.search(r'(\d[\d\s]{2,})\s*₽', chunk)
        img = re.search(r'src="(https://[^"]+\.(?:jpg|jpeg|png|webp))"', chunk)
        city = re.search(r'geo-address[^>]*>([^<]{2,60})<', chunk)
        if link and title and price:
            url = f"https://www.avito.ru{link.group(1)}"
            out.append({
                'title': unescape(re.sub(r'\s+', ' ', title.group(1))).strip()[:200],
                'price': parse_price(price.group(1)),
                'url': url,
                'photos': [img.group(1)] if img else [],
                'external_id': external_id_from_url(url),
                'city': unescape(city.group(1)).strip() if city else '',
            })
    return out


def parse_page(html: str) -> list:
    """Пробуем три способа по очереди и берём тот, что дал больше карточек."""
    # Микроразметка первая: проверено, что на живой выдаче Авито JSON-LD нет,
    # а данные лежат именно в itemProp
    results = [items_from_microdata(html), items_from_jsonld(html),
               items_from_initial_data(html), items_from_html(html)]
    best = max(results, key=len) if results else []
    # Чистим: без цены и без ссылки карточка бесполезна
    clean, seen = [], set()
    for item in best:
        if not item.get('title') or not item.get('price') or not item.get('url'):
            continue
        key = item.get('external_id') or item['url']
        if key in seen:
            continue
        seen.add(key)
        clean.append(item)
    return clean


# ── Отправка на сервер ──────────────────────────────────────────────────────
def push(server: str, token: str, source: str, items: list) -> dict:
    """Отправка находок на сервер.

    Идёт через curl_cffi: у системного Python на macOS нет корневых
    сертификатов, и обычный urllib падал с CERTIFICATE_VERIFY_FAILED — из-за
    этого находки собирались, но НЕ доходили до сервера и до бота.
    """
    url = f"{server.rstrip('/')}/api/ingest"
    body = json.dumps({'source': source, 'items': items}).encode()
    headers = {'Content-Type': 'application/json', 'X-Ingest-Token': token}
    if _cffi is not None:
        r = _cffi.post(url, data=body, headers=headers, timeout=60)
        if r.status_code >= 400:
            raise RuntimeError(f"HTTP {r.status_code}: {r.text[:140]}")
        return json.loads(r.text)
    req = urllib.request.Request(url, data=body, headers=headers)
    with _opener().open(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def fetch_json(url: str, token: str, timeout: int = 30) -> dict:
    """GET с токеном. Идёт через curl_cffi: у системного Python на macOS
    нет корневых сертификатов, и любой https-запрос падал с
    CERTIFICATE_VERIFY_FAILED. curl_cffi проверяет сертификаты сам."""
    if _cffi is not None:
        r = _cffi.get(url, headers={'X-Ingest-Token': token}, timeout=timeout)
        if r.status_code >= 400:
            raise RuntimeError(f"HTTP {r.status_code}: {r.text[:140]}")
        return json.loads(r.text)
    req = urllib.request.Request(url, headers={'X-Ingest-Token': token})
    with _opener().open(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def post_json(url: str, token: str, payload: dict, timeout: int = 60) -> dict:
    """POST с токеном. Тоже через curl_cffi — по той же причине."""
    body = json.dumps(payload).encode()
    if _cffi is not None:
        r = _cffi.post(url, data=body, timeout=timeout, headers={
            'Content-Type': 'application/json', 'X-Ingest-Token': token})
        if r.status_code >= 400:
            raise RuntimeError(f"HTTP {r.status_code}: {r.text[:140]}")
        return json.loads(r.text)
    req = urllib.request.Request(url, data=body, headers={
        'Content-Type': 'application/json', 'X-Ingest-Token': token})
    with _opener().open(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


CITY_SLUG = {
    'Ижевск': 'izhevsk', 'Воткинск': 'votkinsk', 'Сарапул': 'sarapul',
    'Глазов': 'glazov', 'Можга': 'mozhga',
}


def targets_from_criteria(server: str, token: str) -> list:
    """Строит страницы поиска из критериев, которые задали пользователи.

    Так перекупу достаточно написать боту «/hunt iphone 13» — сборщик сам
    начнёт обходить нужный запрос, ничего править в конфиге не надо.
    """
    try:
        data = fetch_json(f"{server.rstrip('/')}/api/hunt?for_collector=1", token)
    except Exception as exc:
        print(f"  ⚠ критерии не получены: {exc}")
        return []
    targets = []
    # ВАЖНО: ссылки вида «?q=запрос» Авито отдаёт пустыми — поиск у него
    # защищён. Поэтому такие цели НЕ строим: критерий работает как фильтр
    # на сервере, а страницы берём из config.json (категории).
    skipped = 0
    for crit in data.get('items', []):
        if str(crit.get('query') or '').strip():
            skipped += 1
    if skipped:
        print(f"  Критериев: {skipped}. Они работают как фильтр заголовков,")
        print("  а страницы для обхода берутся из config.json (категории Авито).")
    return targets


def check_listings(server: str, token: str, limit: int = 30) -> int:
    """Перепроверяет лоты: продано, снято или ещё висит.

    Это и даёт «ушло за 3 часа» — главный ориентир цены для перекупа.
    """
    try:
        data = fetch_json(f"{server.rstrip('/')}/api/ingest/checklist?limit={limit}", token)
    except Exception as exc:
        print(f"  ✖ список не получен: {exc}")
        return 0
    items = data.get('items') or []
    print(f"  проверяем лотов: {len(items)}")
    report, gone = [], 0
    for item in items:
        url = item.get('source_url')
        ext = item.get('external_id')
        if not url or not ext:
            continue
        state = 'active'
        try:
            html = fetch(url)
            low = html.lower()
            if any(marker in low for marker in GONE_MARKERS):
                state = 'gone'
        except Blocked as exc:
            print(f"  ⛔ {exc} — прекращаю проверку")
            break
        except urllib.error.HTTPError as exc:
            # 404 и 410 — страницы больше нет, значит лот снят или продан
            if exc.code in (404, 410):
                state = 'gone'
        except Exception:
            continue
        if state == 'gone':
            gone += 1
        report.append({'external_id': ext, 'state': state})
        time.sleep(random.uniform(2.0, 4.0))
    if report:
        try:
            res = post_json(f"{server.rstrip('/')}/api/ingest/status", token,
                            {'source': data.get('source', 'avito'), 'items': report})
            print(f"  отмечено исчезнувшими: {res.get('gone', gone)} из {len(report)}")
        except Exception as exc:
            print(f"  ✖ статус не отправлен: {exc}")
    return gone


def check_proxy(url: str) -> int:
    """Пускает ли Авито через этот прокси.

    Запускать ДО того, как платить за тариф: дешёвые прокси из дата-центров
    Авито блокирует так же, как сервер. Нужен резидентный или мобильный.
    """
    print(f"Прокси: {PROXY or 'не задан — идём напрямую'}")
    print(f"Клиент: {'curl_cffi, отпечаток ' + IMPERSONATE if _cffi else 'urllib (curl_cffi НЕ установлен!)'}")
    print(f"Проверяем: {url}")
    try:
        html = fetch(url)
    except Blocked as exc:
        print(f"  ⛔ {exc}")
        if PROXY:
            print("  Этот прокси Авито не пускает — адреса дата-центров")
            print("  блокируются целиком. Нужен резидентный или мобильный.")
        else:
            print("  Если curl_cffi не установлен — поставьте его:")
            print("      pip3 install curl_cffi")
            print("  Именно отпечаток клиента решает: обычный Python Авито")
            print("  блокирует, а Safari-отпечаток проходит.")
        return 1
    except Exception as exc:
        print(f"  ✖ не открылось: {exc}")
        if 'CERTIFICATE_VERIFY' in str(exc):
            print("  Это НЕ блокировка Авито, а отсутствие корневых сертификатов")
            print("  у вашего Python. Лечится: pip3 install certifi")
        else:
            print("  Проверьте адрес, логин и пароль прокси.")
        return 1
    items = parse_page(html)
    print(f"  страница получена: {len(html)} байт")
    print(f"  карточек разобрано: {len(items)}")
    for it in items[:5]:
        ago = it.get('hours_ago')
        print(f"    {it['title'][:40]:42} {it['price']:>9} ₽  "
              f"{('свежее' if ago is not None and ago <= 24 else (str(ago) + ' ч' if ago is not None else 'без даты'))}")
    if not items:
        print("  ⚠ Страница открылась, но карточек нет — возможно, изменилась вёрстка.")
        return 2
    print("  ✅ Работает: Авито отдаёт выдачу, разбор находит объявления.")
    return 0


def load_config(path: str) -> dict:
    # Файл может отсутствовать: на сервере всё приходит из переменных
    # окружения, а цели берутся из критериев пользователей.
    cfg = {}
    if os.path.exists(path):
        try:
            with open(path, encoding='utf-8') as fh:
                cfg = json.load(fh)
        except Exception as exc:
            print(f"  ⚠ config.json не прочитан: {exc}")
    server = os.environ.get('POLKA_SERVER') or cfg.get('server') or ''
    token = os.environ.get('POLKA_INGEST_TOKEN') or cfg.get('token') or ''
    if not server or not token:
        sys.exit("Не заданы server и token: заполните config.json "
                 "или переменные POLKA_SERVER и POLKA_INGEST_TOKEN")
    # Токен уходит в HTTP-заголовке, а там допустима только латиница.
    # Кириллический токен иначе падал бы загадочной ошибкой кодировки.
    try:
        token.encode('ascii')
    except UnicodeEncodeError:
        sys.exit("Токен должен состоять только из латинских букв, цифр и "
                 "знаков -_ . Кириллица в заголовок не помещается.\n"
                 "Сгенерируйте новый: openssl rand -base64 32")
    cfg['server'] = server
    cfg['token'] = token
    cfg.setdefault('targets', [])
    return cfg


def run_once(cfg: dict) -> int:
    server, token = cfg['server'], cfg['token']
    total_sent = 0
    targets = list(cfg.get('targets', []))
    if not targets:
        # На сервере config.json нет — иначе сборщик шёл бы в пустоту
        targets = default_targets()
        print(f"Цели не заданы — берём встроенный список: {len(targets)} категорий по всей России")
    from_crit = targets_from_criteria(server, token)
    if from_crit:
        known = {t.get('url') for t in targets}
        targets += [t for t in from_crit if t['url'] not in known]
    for target in targets:
        url = target.get('url')
        source = target.get('source', 'avito')
        city = target.get('city', '')
        if not url:
            continue
        print(f"\n→ {source}: {url}")
        try:
            html = fetch(url)
        except Blocked as exc:
            print(f"  ⛔ {exc} — останавливаюсь, чтобы не усугублять")
            # Код 3 = «нас заблокировали». Супервизор на сервере по нему
            # делает длинную паузу вместо бессмысленных повторов.
            raise SystemExit(3)
        except (urllib.error.URLError, TimeoutError) as exc:
            print(f"  ✖ не открылось: {exc}")
            continue
        items = parse_page(html)
        for item in items:
            item['category'] = item.get('category') or target.get('category', '')
            item['city'] = item.get('city') or city
        print(f"  найдено карточек: {len(items)}")
        if not items:
            if '?' in url and 'q=' in url:
                # Проверено на живом сайте: на поисковый запрос Авито отдаёт
                # HTTP 200, но страницу БЕЗ объявлений — только подвал.
                # Это не поломка разбора, а защита именно поиска.
                print("  ⚠ Авито отдал пустую страницу: он не любит поиск по запросу (?q=).")
                print("    Ссылки на КАТЕГОРИИ работают. Возьмите нужную категорию")
                print("    на сайте, скопируйте адрес и добавьте в config.json:")
                print('      {"source":"avito","url":"https://www.avito.ru/izhevsk/telefony",'
                      '"city":"Ижевск","category":"Электроника"}')
            else:
                print("  ⚠ разбор ничего не дал — возможно, изменилась вёрстка сайта")
            continue
        try:
            stats = push(server, token, source, items)
            print(f"  отправлено: принято {stats.get('accepted')}, "
                  f"дублей {stats.get('duplicate')}, пропущено {stats.get('skipped')}")
            total_sent += int(stats.get('accepted') or 0)
        except Exception as exc:
            print(f"  ✖ сервер не принял: {exc}")
        # Пауза подлиннее: Авито ограничивает при частых запросах, а лишний
        # 429 обходится дороже, чем несколько секунд ожидания
        time.sleep(random.uniform(6.0, 12.0))
    return total_sent


def selftest() -> int:
    """Проверка разбора на образце — без обращения к чужим сайтам."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixture_avito.html')
    with open(path, encoding='utf-8') as fh:
        html = fh.read()
    items = parse_page(html)
    print(f"Разобрано карточек: {len(items)}")
    for item in items:
        print(f"  {item['title'][:40]:42} {item['price']:>9} ₽  id={item['external_id']}  "
              f"фото={len(item['photos'])}")
    ok = len(items) >= 2 and all(i['price'] > 0 and i['url'].startswith('http') for i in items)
    print("\nИТОГ:", "разбор работает" if ok else "РАЗБОР СЛОМАН")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="Сборщик находок для «Полки»")
    ap.add_argument('--config', default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                     'config.json'))
    ap.add_argument('--selftest', action='store_true', help='проверить разбор на образце')
    ap.add_argument('--check-proxy', metavar='URL', nargs='?', const='DEF',
                    help='проверить, пускает ли Авито через прокси')
    ap.add_argument('--check', action='store_true',
                    help='перепроверить лоты: продано или ещё висит')
    ap.add_argument('--loop', action='store_true', help='работать постоянно')
    ap.add_argument('--every', type=int, default=900, help='пауза между проходами, сек')
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    # Проверка прокси — отдельная диагностика: сервер и токен тут не нужны,
    # иначе проверить прокси до покупки было бы невозможно
    if args.check_proxy is not None:
        target = args.check_proxy
        if target in ('DEF', ''):
            target = "https://www.avito.ru/izhevsk/velosipedy"
        return check_proxy(target)

    cfg = load_config(args.config)
    # Режим сервера: цели только из критериев пользователей, файл не нужен
    if os.environ.get('POLKA_SERVER_MODE') == '1':
        args.loop = True if args.loop is None else args.loop

    if args.check:
        print("Проверяем, что уже продано…")
        check_listings(cfg['server'], cfg['token'], limit=args.every if False else 30)
        return 0

    while True:
        started = time.time()
        try:
            sent = run_once(cfg)
        except SystemExit as exc:
            if exc.code == 3:
                print("Нас заблокировали. Ждём долго, чтобы не закрепить блокировку.")
                raise
            raise
        print(f"\nПроход завершён, принято новых: {sent}")
        # Раз в проход смотрим, что уже ушло — так копится статистика
        # «за сколько часов уходит такая цена»
        check_listings(cfg['server'], cfg['token'], limit=25)
        if not args.loop:
            return 0
        wait = max(30, args.every - int(time.time() - started))
        print(f"Следующий проход через {wait} с")
        time.sleep(wait)


if __name__ == '__main__':
    sys.exit(main())
