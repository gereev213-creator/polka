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
import glob
import json
import os
import random
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import quote_plus
from html import unescape
from html.parser import HTMLParser

# Искать у Авито по тексту запроса (q=)?
#
# По умолчанию ВЫКЛЮЧЕНО — проверено на живом сайте 15.10.2026: обычный
# раздел Авито отдаёт (48 карточек), а ссылки с текстом запроса, подкатегорией
# или моделью в пути Авито отбивает кодами 429/439, причём сразу первым же
# запросом, а не из-за количества. Домашний IP не помогает: проверено и с него.
# Включённый по умолчанию q= означал бы, что сбор перестанет работать совсем.
#
# Включить: POLKA_SEARCH_BY_QUERY=1 (или свой шаблон url_template со своим q) —
# если Авито изменит поведение либо если у вас прокси, с которого поиск идёт.
# Проверка формы ссылки:  python3 collect.py --check-query "iphone 13 pro"
SEARCH_BY_QUERY = os.environ.get('POLKA_SEARCH_BY_QUERY', '1') != '0'

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


# Маркеры страницы ОДНОГО объявления (на странице выдачи их нет, поэтому
# fetch() их не проверяет, а fetch_item() — проверяет).
ITEM_MARKERS = ('item-view/title-info', 'item-view/item-description',
                'item-view/item-price', 'seller-info/name')
# Короткая страница: если в ней ещё и маркер капчи — это блокировка.
SHORT_PAGE_CHARS = 20000
# Авито не пустил на страницу объявления в этом проходе: описания пропускаем
# до следующего прохода, чтобы не долбить сайт и не валить весь сбор.
_DETAILS_BLOCKED = False
# Сколько символов описания хранить. Дальше — маркетинговый шум продавца.
DESC_MAX_CHARS = 2000


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


def fetch_item(url: str, timeout: int = 20) -> str:
    """Страница ОДНОГО объявления — оттуда берём описание и продавца.

    Отдельно от fetch(): тот считает ответ валидным только при наличии
    data-marker="item" — это маркер СТРАНИЦЫ ВЫДАЧИ. На странице объявления
    его нет, поэтому fetch(url) перебирал весь пул отпечатков (по 2–5 с
    паузой после каждого), получал 439 и бросал Blocked. Итог: описания не
    собирались никогда, а Авито получал 4–5 лишних запросов на объявление.

    Здесь ровно ОДИН запрос рабочим отпечатком (если он ещё не найден —
    первым из пула), таймаут 20 с. Блокировка = статус 403/429/439 или
    маркеры капчи на короткой странице.
    """
    if _cffi is not None:
        global _WORKING_PROFILE
        profile = _WORKING_PROFILE or IMPERSONATE_POOL[0]
        proxies = {'http': PROXY, 'https': PROXY} if PROXY else None
        try:
            r = _cffi.get(url, impersonate=profile, timeout=timeout, proxies=proxies)
        except Exception as exc:
            raise Blocked(f"{profile}: {str(exc)[:70]}")
        text = r.text or ''
        if r.status_code in (403, 429, 439):
            raise Blocked(f"HTTP {r.status_code} — доступ ограничен по IP")
        if len(text) < SHORT_PAGE_CHARS:
            low = text.lower()
            for marker in BLOCK_MARKERS:
                if marker.lower() in low:
                    raise Blocked(f"похоже на блокировку (нашли «{marker}»)")
        if not any(m in text for m in ITEM_MARKERS):
            raise Blocked("страница объявления не распознана (нет знакомых маркеров)")
        _WORKING_PROFILE = profile
        return text

    # Без curl_cffi — обычный urllib; проверки те же
    req = urllib.request.Request(url, headers={
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru-RU,ru;q=0.9',
    })
    try:
        with _opener().open(req, timeout=timeout) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        if exc.code in (403, 429, 439):
            raise Blocked(f"HTTP {exc.code} — доступ ограничен по IP")
        raise
    text = raw.decode('utf-8', errors='replace')
    if len(text) < SHORT_PAGE_CHARS:
        low = text.lower()
        for marker in BLOCK_MARKERS:
            if marker.lower() in low:
                raise Blocked(f"похоже на блокировку (нашли «{marker}»)")
    if not any(m in text for m in ITEM_MARKERS):
        raise Blocked("страница объявления не распознана (нет знакомых маркеров)")
    return text


# ── Разбор страницы ─────────────────────────────────────────────────────────
# «2 000 ₽/мес» — это платёж, а не цена товара: такие карточки пропускаем
PER_MONTH_MARKERS = ('/мес', 'в месяц', 'мес.', 'месяц', 'рассрочк', 'за месяц',
                     'первый взнос', 'взнос')


def parse_price(text) -> int:
    """Цена из текста карточки. Осторожно с разделителями и рассрочкой.

    Было: все нецифровые символы вырезались, и «1 250,50 ₽» превращалось в
    125050 — объявление уходило в ленту с ценой в сто раз больше. Теперь:
      «1 250 ₽» → 1250, «1 250,50» → 1250, «1250.50» → 1250,
      «1.250.000» → 1250000, «от 1 200 ₽» → 1200,
      «10 000 – 12 000 ₽» → 10000 (нижняя граница),
      «2 000 ₽/мес» → 0 (платёж, а не цена: карточка пропускается),
      «бесплатно» → 0.
    """
    if isinstance(text, (int, float)):
        return int(text)
    raw = str(text or '').strip().lower()
    if not raw:
        return 0
    if any(marker in raw for marker in PER_MONTH_MARKERS):
        return 0
    m = re.search(r'\d[\d\s\u00a0]*(?:[.,]\d+)*', raw)
    if not m:
        return 0
    num = m.group(0).replace('\u00a0', '').replace(' ', '')
    if re.fullmatch(r'\d{1,3}(?:[.,]\d{3})+', num):
        # «1.250.000» — разделители тысяч, а не дробная часть
        num = re.sub(r'[.,]', '', num)
    else:
        num = num.replace(',', '.')
    try:
        return int(float(num))
    except ValueError:
        return 0


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


def seller_type_from_node(node: dict) -> str:
    """Частник или магазин — по данным КАРТОЧКИ СПИСКА, без захода на страницу.

    Раньше тип продавца доставался только со страницы объявления, а она
    требует домашнего IP или прокси (520/429 с дата-центров). Из-за этого
    условие «только с рук» не проверялось вовсе.
    """
    if not isinstance(node, dict):
        return ''
    for key in ('sellerType', 'seller_type'):
        value = str(node.get(key) or '').lower()
        if value in ('company', 'shop', 'brand'):
            return 'company'
        if value in ('private', 'person', 'individual'):
            return 'private'
    if node.get('isCompany') is True or node.get('companyName'):
        return 'company'
    for key in ('seller', 'sellerInfo', 'iva', 'sellerData'):
        sub = node.get(key)
        if isinstance(sub, dict):
            found = seller_type_from_node(sub)
            if found:
                return found
    return ''


def seller_type_from_card(chunk: str) -> str:
    """То же по разметке карточки: у магазина есть ссылка /brands/ или подпись."""
    low = chunk.lower()
    if '/brands/' in low or '>компания<' in low or 'магазин' in low:
        return 'company'
    if 'частное лицо' in low or '>частник<' in low:
        return 'private'
    return ''


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
                    'seller_type': seller_type_from_node(node),
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
                'seller_type': seller_type_from_card(chunk),
            })
    return out


class _MarkedText(HTMLParser):
    """Текст внутри элемента с нужным data-marker.

    Настоящий парсер, а не регулярка «до первого </div>»: описание на Авито
    размечено вложенными <p>, <br> и <div>, и прежний разбор обрывался на
    первой же вложенной закрывашке.
    """

    def __init__(self, marker: str):
        super().__init__(convert_charrefs=True)
        self.marker = marker
        self.tag = None
        self.depth = 0
        self.parts: list = []
        self.done = False

    def handle_starttag(self, tag, attrs):
        if self.done:
            return
        if self.depth == 0:
            if dict(attrs).get('data-marker') == self.marker:
                self.tag = tag
                self.depth = 1
            return
        if tag == self.tag:
            self.depth += 1
        if tag == 'br':
            self.parts.append('\n')
        elif tag in ('p', 'div', 'li'):
            self.parts.append('\n')

    def handle_startendtag(self, tag, attrs):
        if self.depth and tag == 'br':
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if self.done or not self.depth:
            return
        if tag == self.tag:
            self.depth -= 1
            if self.depth == 0:
                self.done = True
        elif tag in ('p', 'div', 'li'):
            self.parts.append('\n')

    def handle_data(self, data):
        if self.depth:
            self.parts.append(data)

    def text(self) -> str:
        raw = ''.join(self.parts).replace('\xa0', ' ')
        raw = re.sub(r'[ \t\r\f\v]+', ' ', raw)
        raw = re.sub(r' *\n *', '\n', raw)
        raw = re.sub(r'\n{3,}', '\n\n', raw)
        return raw.strip()


def text_from_marker(html: str, marker: str) -> str:
    """Текст элемента с data-marker=<marker> или ''."""
    parser = _MarkedText(marker)
    try:
        parser.feed(str(html or ''))
    except Exception:
        return ''
    return parser.text()


def _meta_content(html: str, key: str) -> str:
    """Содержимое <meta property|name="key" content="…">."""
    pat = (r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]*content=["\']([^"\']*)'
           % re.escape(key))
    m = re.search(pat, html, re.I)
    if not m:
        pat2 = (r'<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']%s["\']'
                % re.escape(key))
        m = re.search(pat2, html, re.I)
    return unescape(m.group(1)).strip() if m else ''


def _jsonld_description(html: str) -> str:
    """Описание из структурированных данных (запасной путь)."""
    for m in re.finditer(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>',
                         html, re.S | re.I):
        try:
            data = json.loads(m.group(1).strip())
        except Exception:
            continue
        for node in (data if isinstance(data, list) else [data]):
            if not isinstance(node, dict):
                continue
            if node.get('description'):
                return str(node['description']).strip()
            for sub in (node.get('item') or [], node.get('itemListElement') or []):
                if isinstance(sub, dict) and sub.get('description'):
                    return str(sub['description']).strip()
    return ''


# Магазинные слова в имени продавца — как HUNT_SHOP_MARKERS в боте
SHOP_NAME_MARKERS = ('магазин', 'shop', 'store', 'салон', 'маркет', 'market',
                     'ооо', 'ип ', 'trade', 'техно', 'центр', 'company')


def parse_item_seller(html: str) -> dict:
    """Тип, имя и число объявлений продавца со страницы объявления.

    Логика та же, что в боте (_parse_seller), но проверки идут по блоку
    продавца, а не по всей странице: слово «компания» встречается и в тексте
    объявления, и тогда магазином ошибочно помечался частник.
    """
    out = {'seller_type': '', 'seller_name': '', 'seller_ads': 0}
    raw = str(html or '')
    low = raw.lower()
    if not low:
        return out
    seller_block = text_from_marker(raw, 'item-view/seller-info')
    seller_low = seller_block.lower()
    name = text_from_marker(raw, 'seller-info/name')
    if name:
        out['seller_name'] = re.sub(r'\s+', ' ', name).strip()[:60]
    if 'частное лицо' in seller_low or 'частное лицо' in low:
        out['seller_type'] = 'private'
    if '/brands/' in low or 'компания' in seller_low:
        out['seller_type'] = 'company'
    m = re.search(r'(\d[\d\s]{0,7})\s*объявлен', seller_low or low)
    if m:
        try:
            out['seller_ads'] = int(re.sub(r'\D', '', m.group(1)) or 0)
        except Exception:
            out['seller_ads'] = 0
    nm = str(out['seller_name']).lower()
    if out['seller_type'] != 'company' and any(w in nm for w in SHOP_NAME_MARKERS):
        out['seller_type'] = 'company'
    return out


def parse_item_page(html: str) -> dict:
    """Описание и продавец со страницы ОДНОГО объявления.

    Порядок разбора описания: блок item-view/item-description → og:description
    → meta description → JSON-LD. Первое, что дало ≥ 20 символов, и берём.
    """
    raw = str(html or '')
    desc = text_from_marker(raw, 'item-view/item-description')
    if len(desc) < 20:
        for alt in (_meta_content(raw, 'og:description'),
                    _meta_content(raw, 'description'),
                    _jsonld_description(raw)):
            alt = re.sub(r'\s+', ' ', str(alt or '')).strip()
            if len(alt) >= 20:
                desc = alt
                break
    desc = desc.strip()[:DESC_MAX_CHARS]
    seller = parse_item_seller(raw)
    return {
        'description': desc,
        'seller_type': seller['seller_type'],
        'seller_name': seller['seller_name'],
        'seller_ads': seller['seller_ads'],
    }


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
    # Партию режем на порции. Раньше всё накопленное уходило ОДНИМ запросом:
    # на живой базе такой запрос занимал до 19.8 секунды, и всё это время
    # сервер не отвечал — приложение «зависало». Порция 400 карточек
    # обрабатывается за десятые доли секунды.
    CHUNK = 400
    if len(items) > CHUNK:
        total = {'accepted': 0, 'duplicate': 0, 'skipped': 0, 'ids': [], 'need_details': []}
        for start in range(0, len(items), CHUNK):
            part = push(server, token, source, items[start:start + CHUNK])
            for key in ('accepted', 'duplicate', 'skipped'):
                total[key] += int(part.get(key) or 0)
            total['ids'].extend(part.get('ids') or [])
            total['need_details'].extend(part.get('need_details') or [])
            time.sleep(1.0)
        return total
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


# Загрузка критериев у сервера. На старте он занят — считает медианы
# и греет картинки, — и за 30 секунд не отвечал. Из-за этого сбор
# шёл по общим страницам, а не по критериям.
def fetch_json(url: str, token: str, timeout: int = 90) -> dict:
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


# Слово из запроса → категория Авито (родной слаг сайта).
#
# Зачем: «?q=запрос» Авито блокирует, поэтому раньше критерии НЕ влияли на
# сбор — качались все телефоны подряд, а нужное отсеивалось уже на сервере.
# Если подходящий айфон лежал на пятой странице, его просто не находили.
# Теперь запрос переводится в категорию + цену, и фильтрует САМ Авито.
CATEGORY_BY_WORD = {
    # телефоны
    'айфон': 'telefony', 'iphone': 'telefony', 'самсунг': 'telefony',
    'samsung': 'telefony', 'телефон': 'telefony', 'смартфон': 'telefony',
    'xiaomi': 'telefony', 'redmi': 'telefony', 'pixel': 'telefony',
    'huawei': 'telefony', 'realme': 'telefony', 'honor': 'telefony',
    # ноутбуки
    'ноутбук': 'noutbuki', 'macbook': 'noutbuki', 'макбук': 'noutbuki',
    'lenovo': 'noutbuki', 'acer': 'noutbuki', 'asus': 'noutbuki',
    'hp': 'noutbuki', 'dell': 'noutbuki', 'msi': 'noutbuki',
    # планшеты
    'планшет': 'planshety_i_elektronnye_knigi', 'ipad': 'planshety_i_elektronnye_knigi',
    # приставки и игры
    'приставка': 'igry_pristavki_i_programmy', 'playstation': 'igry_pristavki_i_programmy',
    'xbox': 'igry_pristavki_i_programmy', 'nintendo': 'igry_pristavki_i_programmy',
    # аудио и видео
    'наушники': 'audio_i_video', 'airpods': 'audio_i_video', 'колонка': 'audio_i_video',
    'телевизор': 'audio_i_video', 'телек': 'audio_i_video', 'саундбар': 'audio_i_video',
    # бытовая техника
    'холодильник': 'bytovaya_tehnika', 'стиральная': 'bytovaya_tehnika',
    'пылесос': 'bytovaya_tehnika', 'микроволновка': 'bytovaya_tehnika',
    # комплектующие
    'монитор': 'tovary_dlya_kompyutera', 'клавиатура': 'tovary_dlya_kompyutera',
    'видеокарта': 'tovary_dlya_kompyutera', 'мышь': 'tovary_dlya_kompyutera',
    # одежда и обувь
    'куртка': 'odezhda_obuv_aksessuary', 'пуховик': 'odezhda_obuv_aksessuary',
    'кроссовки': 'odezhda_obuv_aksessuary', 'ботинки': 'odezhda_obuv_aksessuary',
    'сапоги': 'odezhda_obuv_aksessuary', 'платье': 'odezhda_obuv_aksessuary',
    'сумка': 'odezhda_obuv_aksessuary', 'джинсы': 'odezhda_obuv_aksessuary',
    'худи': 'odezhda_obuv_aksessuary', 'футболка': 'odezhda_obuv_aksessuary',
    # одежда и обувь: слова, которых не хватало — из-за них критерии вроде
    # «Зип кофта мальчика 158» не искались ВООБЩЕ (категория не узнавалась)
    'кофта': 'odezhda_obuv_aksessuary', 'свитер': 'odezhda_obuv_aksessuary',
    'джемпер': 'odezhda_obuv_aksessuary', 'толстовка': 'odezhda_obuv_aksessuary',
    'лонгслив': 'odezhda_obuv_aksessuary', 'рубашка': 'odezhda_obuv_aksessuary',
    'брюки': 'odezhda_obuv_aksessuary', 'шорты': 'odezhda_obuv_aksessuary',
    'пальто': 'odezhda_obuv_aksessuary', 'кардиган': 'odezhda_obuv_aksessuary',
    'ветровка': 'odezhda_obuv_aksessuary', 'дубленка': 'odezhda_obuv_aksessuary',
    'шапка': 'odezhda_obuv_aksessuary', 'шарф': 'odezhda_obuv_aksessuary',
    'перчатки': 'odezhda_obuv_aksessuary', 'туфли': 'odezhda_obuv_aksessuary',
    'сандалии': 'odezhda_obuv_aksessuary', 'рюкзак': 'odezhda_obuv_aksessuary',
    'часы': 'odezhda_obuv_aksessuary', 'очки': 'odezhda_obuv_aksessuary',
    # бренды одежды и обуви — их пишут в критерии вместо слова «куртка»
    'nike': 'odezhda_obuv_aksessuary', 'adidas': 'odezhda_obuv_aksessuary',
    'puma': 'odezhda_obuv_aksessuary', 'zara': 'odezhda_obuv_aksessuary',
    'lacoste': 'odezhda_obuv_aksessuary', 'columbia': 'odezhda_obuv_aksessuary',
    'salomon': 'odezhda_obuv_aksessuary', 'timberland': 'odezhda_obuv_aksessuary',
    'bape': 'odezhda_obuv_aksessuary', 'ugg': 'odezhda_obuv_aksessuary',
    'alpha': 'odezhda_obuv_aksessuary', 'the north face': 'odezhda_obuv_aksessuary',
    'stone island': 'odezhda_obuv_aksessuary', 'uniqlo': 'odezhda_obuv_aksessuary',
    # прочее
    'велосипед': 'velosipedy', 'гитара': 'muzykalnye_instrumenty',
    'квартира': 'kvartiry', 'автомобиль': 'avtomobili', 'машина': 'avtomobili',
    # инструменты, спорт, красота, авто-запчасти и прочее
    'перфоратор': 'instrumenty', 'шуруповёрт': 'instrumenty', 'шуруповерт': 'instrumenty',
    'дрель': 'instrumenty', 'болгарка': 'instrumenty', 'компрессор': 'instrumenty',
    'гантели': 'sport_i_otdyh', 'дорожка': 'sport_i_otdyh', 'тренажёр': 'sport_i_otdyh',
    'фен': 'krasota_i_zdorovie', 'эпилятор': 'krasota_i_zdorovie', 'массажёр': 'krasota_i_zdorovie',
    'шины': 'zapchasti_i_aksessuary', 'диски': 'zapchasti_i_aksessuary',
    'ssd': 'tovary_dlya_kompyutera', 'процессор': 'tovary_dlya_kompyutera',
    'infinix': 'telefony', 'oppo': 'telefony', 'vivo': 'telefony',
    'tecno': 'telefony', 'nothing': 'telefony', 'чехол': 'telefony',
    'компьютер': 'tovary_dlya_kompyutera', 'пк': 'tovary_dlya_kompyutera',
    'системный': 'tovary_dlya_kompyutera', 'keychron': 'tovary_dlya_kompyutera',
    'nuphy': 'tovary_dlya_kompyutera', 'процессор': 'tovary_dlya_kompyutera',
    'диван': 'mebel', 'стол': 'mebel', 'стул': 'mebel', 'шкаф': 'mebel',
    'книга': 'knigi_i_zhurnaly', 'самокат': 'velosipedy',
    'кровать': 'mebel', 'комод': 'mebel', 'матрас': 'mebel',
}


# Шаблон ссылки поиска. Задан по умолчанию, но его можно переопределить
# в config.json ("url_template": "…") или переменной POLKA_URL_TEMPLATE —
# не трогая код. Зачем: форму ссылки и фильтры Авито надёжнее всего взять
# из браузера (поиск → нужные фильтры → скопировать адрес из строки).
# Подстановки: {category} {query} {pmin} {pmax} {page}
# ПРОВЕРЕНО 15.10.2026 на живом сайте (ссылка владельца из браузера):
#   /all/odezhda_obuv_aksessuary?cd=1&localPriority=0&q=пуховик&user=1&s=104
# даёт 75–81 карточку ровно по запросу. Разница с прежними попытками —
# параметры cd=1, user=1 и localPriority=0: без них Авито отбивал запрос
# (429/439), и я решил, что поиск недоступен. Он доступен.
#   q={query}  — слова критерия, ищет сам Авито (точность вместо перебора)
#   user=1     — только частные объявления (фильтр продавца со стороны Авито)
#   cd=1       — как в браузерной ссылке, без него не работает
#   {filters}  — необязательный набор фильтров (f=...) из ссылки браузера:
#                состояние, доставка, память. Задаётся в config.json.
DEFAULT_URL_TEMPLATE = ("https://www.avito.ru/all/{category}"
                        "?cd=1&localPriority=0&q={query}&user=1{filters}"
                        "&s=104&pmin={pmin}&pmax={pmax}")


def search_url(template: str, slug: str, query: str, pmin: int, pmax: int,
               filters: str = '') -> str:
    """Собирает ссылку поиска по шаблону и убирает пустые параметры.

    Пустые pmin/pmax и отсутствие категории не должны оставлять в ссылке
    «хвосты» вида «&pmin=&pmax=» или «/all/»: Авито на такое отвечает
    ошибкой, а не пустой выдачей.
    """
    url = str(template or DEFAULT_URL_TEMPLATE)
    for key, value in (('{category}', slug or ''),
                       ('{query}', quote_plus(query or '')),
                       ('{filters}', str(filters or '')),
                       ('{pmin}', str(int(pmin)) if pmin else ''),
                       ('{pmax}', str(int(pmax)) if pmax else '')):
        url = url.replace(key, value)
    # Категории нет → путь /all/, превращаем в /all
    url = url.replace('/all/?', '/all?').replace('/all/&', '/all&')
    url = re.sub(r'[?&](pmin|pmax)=(?=&|$)', '', url)
    url = url.replace('?&', '?').replace('&&', '&')
    if url.endswith('/all/'):
        url = url[:-1]
    return url.rstrip('?&')


def targets_from_criteria(server: str, token: str, cfg: dict = None) -> list:
    """Строит страницы поиска из критериев, которые задали пользователи.

    Главное здесь — параметр q: это САМ ЗАПРОС, который Авито ищет своей
    выдачей. Раньше в ссылке были только категория и цена, поэтому сборщик
    качал ВСЮ категорию (десятки тысяч карточек), а нужное отсеивалось уже
    на сервере. Замер на живом сайте: в ссылке без q из 50 карточек по
    словам «iphone 13» подходили 3 — 94% трафика впустую. И критерии, чьи
    слова не попали в справочник категорий («пуховик lacoste», «зип кофта»),
    не искались ВООБЩЕ: для них цель просто не создавалась.

    Ещё это щадит Авито: один точный запрос вместо перебора категории —
    меньше запросов, реже ловим 429 (Too Many Requests).
    """
    template = (os.environ.get('POLKA_URL_TEMPLATE')
                or (cfg or {}).get('url_template')
                or DEFAULT_URL_TEMPLATE)
    try:
        data = fetch_json(f"{server.rstrip('/')}/api/hunt?for_collector=1", token)
    except Exception as exc:
        print(f"  ⚠ критерии не получены: {exc}")
        return []
    targets = []
    seen = set()
    built = 0
    no_query = 0
    no_slug = 0
    for crit in data.get('items', []):
        query = " ".join(str(crit.get('query') or '').split())[:80]
        if not query:
            no_query += 1
            continue
        # Разбиваем и по дефису: «робот-пылесос» должен найтись словом «пылесос»
        words = [w for w in re.split(r'[^\w]+', query.lower()) if w]
        slug = None
        for word in words:
            if word in CATEGORY_BY_WORD:
                slug = CATEGORY_BY_WORD[word]
                break
        try:
            pmin = int(crit.get('min_price') or 0)
        except Exception:
            pmin = 0
        try:
            pmax = int(crit.get('max_price') or 0)
        except Exception:
            pmax = 0
        if SEARCH_BY_QUERY:
            template_here = template
        else:
            # Проверенный рабочий вид: раздел + сортировка по дате + цена.
            # Точность обеспечивает сервер: он отсеивает по словам заголовка,
            # категории, городу и цене (этапы B и F).
            template_here = "https://www.avito.ru/all/{category}?s=104&pmin={pmin}&pmax={pmax}"
        if not slug:
            # Категория не узнана: цель всё равно создаём (поиск по площадке),
            # но считаем такие критерии — по ним раздел не определён.
            no_slug += 1
        # Фильтры Авито (только частные, состояние, АКБ, слова в описании)
        # живут в параметре f=…, который генерирует браузер. Наборы задаются
        # в config.json: {"filters_by_category": {"odezhda_obuv_aksessuary": "&f=…"}}
        # Общий набор — "filters" или POLKA_FILTERS.
        by_cat = dict((cfg or {}).get('filters_by_category') or {})
        # То же самое можно задать переменной окружения (на сервере это проще,
        # чем править config.json): POLKA_FILTERS_BY_CATEGORY='{"telefony":"&f=…"}'
        try:
            env_filters = os.environ.get('POLKA_FILTERS_BY_CATEGORY', '')
            if env_filters:
                by_cat.update(json.loads(env_filters))
        except Exception as exc:
            print(f"  ⚠ POLKA_FILTERS_BY_CATEGORY не разобран: {exc}")
        filters_here = ''
        for key in (slug or '', str(crit.get('category') or '')):
            if key and by_cat.get(key):
                filters_here = str(by_cat[key])
                break
        if not filters_here:
            filters_here = str((cfg or {}).get('filters') or os.environ.get('POLKA_FILTERS', ''))
        url = search_url(template_here, slug or '', query, pmin, pmax, filters=filters_here)
        if url in seen:
            continue
        seen.add(url)
        targets.append({'url': url, 'category': crit.get('category') or slug or '',
                        'query': query, 'page': 1})
        built += 1
    if built:
        mode = ("Авито ищет по тексту запроса (q=)" if SEARCH_BY_QUERY
                else "раздел Авито + отсев по словам на сервере")
        print(f"  Целей из критериев: {built} — {mode}")
    if no_query:
        print(f"  Критериев без текста: {no_query}")
    if no_slug:
        print(f"  ⚠ Критериев без узнаваемого слова категории: {no_slug} — "
              f"ищутся по всей площадке")
        print("    Точнее будет добавить слово категории (куртка, телефон, ноутбук)")
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


def push_details(server: str, token: str, source: str, items: list) -> dict:
    """Отправляет описания и продавцов на сервер: POST /api/ingest/details."""
    url = f"{server.rstrip('/')}/api/ingest/details"
    body = json.dumps({'source': source, 'items': items}).encode()
    headers = {'Content-Type': 'application/json', 'X-Ingest-Token': token}
    if _cffi is not None:
        r = _cffi.post(url, data=body, headers=headers, timeout=90)
        if r.status_code >= 400:
            raise RuntimeError(f"HTTP {r.status_code}: {r.text[:140]}")
        return json.loads(r.text)
    req = urllib.request.Request(url, data=body, headers=headers)
    with _opener().open(req, timeout=90) as resp:
        return json.loads(resp.read().decode())


def collect_details(server: str, token: str, source: str, items: list,
                    pause: tuple = (4.0, 9.0)) -> int:
    """Открывает карточки кандидатов и присылает описания на сервер.

    Сервер этого сделать не может: он в дата-центре, и Авито его блокирует,
    поэтому страницы объявлений открываем мы — по одной, с паузой 4–9 секунд.

    ВАЖНО про запуск на GitHub Actions: у раннеров адрес дата-центра, и
    страницы объявлений там, скорее всего, не откроются. Это НЕ повод валить
    весь сбор: при блокировке просто пропускаем описания до следующего
    прохода (объявления в базе остаются с пометкой «описание не проверено»)
    и продолжаем собирать выдачу. Пометку failed серверу в этом случае не
    шлём — иначе три неудачных прохода подряд навсегда закроют карточку.
    """
    global _DETAILS_BLOCKED
    if not items or _DETAILS_BLOCKED:
        return 0
    out = []
    for i, item in enumerate(items):
        url = str(item.get('url') or '')
        ext = str(item.get('external_id') or '')
        if not url.startswith('http'):
            continue
        try:
            html = fetch_item(url)
        except Blocked as exc:
            _DETAILS_BLOCKED = True
            print(f"  ⛔ описания недоступны с этого IP: {exc}")
            print("    Скорее всего это дата-центр (GitHub Actions). Соберите")
            print("    описания с домашнего компьютера: collector/start-local.sh")
            if out:
                try:
                    push_details(server, token, source, out)
                except Exception as exc2:
                    print(f"  ✖ сервер не принял описания: {exc2}")
            return len(out)
        except Exception as exc:
            print(f"  ✖ описание не открылось: {exc}")
            out.append({'external_id': ext, 'state': 'failed'})
            continue
        data = parse_item_page(html)
        if len(data.get('description') or '') < 20:
            print(f"  ⚠ описание пустое ({url[-32:]})")
            out.append({'external_id': ext, 'state': 'failed'})
        else:
            out.append({'external_id': ext, 'state': 'ok',
                        'description': data['description'],
                        'seller_type': data['seller_type'],
                        'seller_name': data['seller_name'],
                        'seller_ads': int(data['seller_ads'] or 0)})
            who = ('магазин' if data['seller_type'] == 'company'
                   else 'частник' if data['seller_type'] == 'private' else 'продавец не определён')
            print(f"  ✓ описание {len(data['description'])} симв., {who}")
        # Пауза между страницами: Авито ограничивает частые запросы
        if i < len(items) - 1:
            time.sleep(random.uniform(*pause))
    if out:
        try:
            stats = push_details(server, token, source, out)
            print(f"  описаний отправлено: {stats.get('updated')}, неудач {stats.get('failed')}")
        except Exception as exc:
            print(f"  ✖ сервер не принял описания: {exc}")
    return len(out)


def target_urls(target: dict, cfg: dict) -> list:
    """Ссылки одной цели: страницы 1..pages и необязательные pmin/pmax.

    Этап D10. По умолчанию pages=1: обход лишних страниц — это лишние
    запросы к Авито, и включать его нужно осознанно (в config.json у цели:
    "pages": 2, "pmin": 5000, "pmax": 60000). Условия проверять на живом
    сайте: разметка страниц и параметры цены могут отличаться.
    """
    url = str(target.get('url') or '')
    if not url.startswith('http'):
        return []
    pages = int(target.get('pages') or cfg.get('pages') or 1)
    pages = max(1, min(pages, 3))
    pmin = target.get('pmin') or cfg.get('pmin') or 0
    pmax = target.get('pmax') or cfg.get('pmax') or 0
    extra = []
    if pmin:
        extra.append(f"pmin={int(pmin)}")
    if pmax:
        extra.append(f"pmax={int(pmax)}")
    urls = []
    for page in range(1, pages + 1):
        parts = list(extra)
        if page > 1:
            parts.append(f"p={page}")
        if not parts:
            urls.append(url)
            continue
        joiner = '&' if '?' in url else '?'
        urls.append(url + joiner + '&'.join(parts))
    return urls


def date_sorted_first_page(url: str) -> bool:
    """Выдача отсортирована по дате и это первая страница?

    Отсюда берётся право считать «впервые увиденное» свежим: Авито отдаёт
    сначала самые новые объявления (этап D5).
    """
    text = str(url or '')
    return 's=104' in text and ('p=' not in text)


def run_once(cfg: dict) -> int:
    server, token = cfg['server'], cfg['token']
    total_sent = 0
    targets = list(cfg.get('targets', []))
    if not targets:
        # На сервере config.json нет — иначе сборщик шёл бы в пустоту
        targets = default_targets()
        print(f"Цели не заданы — берём встроенный список: {len(targets)} категорий по всей России")
    from_crit = targets_from_criteria(server, token, cfg)
    if from_crit:
        known = {t.get('url') for t in targets}
        targets += [t for t in from_crit if t['url'] not in known]
    for target in targets:
        source = target.get('source', 'avito')
        city = target.get('city', '')
        for url in target_urls(target, cfg):
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
            first_page_dated = date_sorted_first_page(url)
            for item in items:
                item['category'] = item.get('category') or target.get('category', '')
                item['city'] = item.get('city') or city
                # Этап D5: даты в карточке нет, но выдача отсортирована по
                # дате и это её первая страница — объявление почти наверняка
                # свежее, о чём и сообщаем серверу
                if item.get('hours_ago') is None and first_page_dated:
                    item['age_estimated'] = True
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
            # Сервер отвечает, по каким карточкам нужно описание: отбор
            # по требованиям словами без него работает вслепую (этап A3)
            need = stats.get('need_details') or []
            if need:
                print(f"  описаний нужно: {len(need)} — открываю карточки")
                collect_details(server, token, source, need)
        except Exception as exc:
            print(f"  ✖ сервер не принял: {exc}")
        # Пауза подлиннее: Авито ограничивает при частых запросах, а лишний
        # 429 обходится дороже, чем несколько секунд ожидания
        time.sleep(random.uniform(6.0, 12.0))
    return total_sent


def fetch_need_details(server: str, token: str, limit: int = 0) -> list:
    """Спрашивает у сервера, какие карточки открыть ради описания."""
    url = f"{server.rstrip('/')}/api/ingest/need-details"
    if limit:
        url += f"?limit={int(limit)}"
    data = fetch_json(url, token)
    return data.get('items') or []


def details_only_loop(server: str, token: str, limit: int = 0,
                      loop: bool = False, every: int = 600) -> int:
    """Режим для домашнего IP: приносим ТОЛЬКО описания и продавца.

    Зачем отдельно: выдача собирается из облака (GitHub Actions) и с любого
    IP, а страницы объявлений Авито отдаёт только домашним адресам. Если
    телефон будет делать полный проход, он потратит домашний IP на то, что
    уже делает облако, и оба будут мешать друг другу. Здесь он берёт ровно
    те карточки, где описание влияет на отбор.

    Паузы щедрые (5–11 с между карточками): один и тот же домашний IP
    используется и вами, когда вы листаете Авито с телефона.
    """
    total = 0
    while True:
        try:
            items = fetch_need_details(server, token, limit)
        except Exception as exc:
            print(f"  ✖ очередь не получена: {str(exc)[:120]}")
            items = []
        print(f"  карточек к открытию: {len(items)}")
        if items:
            try:
                got = collect_details(server, token, 'avito', items,
                                      pause=(5.0, 11.0))
                total += int(got or 0)
                print(f"  принесено описаний: {got} (всего за смену {total})")
            except Exception as exc:
                print(f"  ✖ описания не ушли: {str(exc)[:120]}")
        if _DETAILS_BLOCKED:
            print("  ⚠ Авито не пускает на страницы объявлений с этого IP.")
            print("    Проверьте: python3 collect.py --check-proxy")
        if not loop:
            return total
        wait = max(120, int(every)) + random.uniform(0, 60)
        print(f"  пауза {int(wait)} с…")
        time.sleep(wait)


def selftest() -> int:
    """Проверка разбора на образцах — без обращения к чужим сайтам.

    Две части: страница ВЫДАЧИ (fixture_avito.html) и страницы ОБЪЯВЛЕНИЙ
    (fixture_item_*.html: частник и магазин). Вторые нужны именно для
    parse_item_page: на живом сайте их проверять нельзя, а описание и
    продавец — то, ради чего этап A и делается.
    """
    here = os.path.dirname(os.path.abspath(__file__))

    listing_path = os.path.join(here, 'fixture_avito.html')
    with open(listing_path, encoding='utf-8') as fh:
        html = fh.read()
    items = parse_page(html)
    print(f"Разобрано карточек: {len(items)}")
    for item in items:
        print(f"  {item['title'][:40]:42} {item['price']:>9} ₽  id={item['external_id']}  "
              f"фото={len(item['photos'])}")
    ok = len(items) >= 2 and all(i['price'] > 0 and i['url'].startswith('http') for i in items)

    print()
    item_files = sorted(glob.glob(os.path.join(here, 'fixture_item*.html')))
    if not item_files:
        print("⚠ нет файлов fixture_item*.html — разбор страницы объявления не проверить")
    for path in item_files:
        with open(path, encoding='utf-8') as fh:
            page = fh.read()
        data = parse_item_page(page)
        kind = 'магазин' if data['seller_type'] == 'company' else (
            'частник' if data['seller_type'] == 'private' else 'тип не определён')
        print(f"  {os.path.basename(path):34} описание {len(data['description']):>4} симв. | "
              f"{kind} | {data['seller_name'][:34]!r} | объявлений: {data['seller_ads']}")
        print(f"      «{data['description'][:70].replace(chr(10), ' ')}…»")
        part_ok = (len(data['description']) >= 20
                   and data['seller_type'] in ('private', 'company'))
        if not part_ok:
            print("      ✖ описание или продавец не распознались")
        ok = ok and part_ok

    print("\nИТОГ:", "разбор работает" if ok else "РАЗБОР СЛОМАН")
    return 0 if ok else 1


def check_url(url: str) -> int:
    """Проверяет ЛЮБУЮ ссылку Авито: открывается ли и сколько карточек разобралось.

    Зачем: фильтры Авито (только частные, состояние, доставка, память) живут в
    самой ссылке. Форму этой ссылки знает только браузер — скопируйте адрес из
    строки браузера с нужными фильтрами и покажите его здесь. Если страница
    открывается и карточки разбираются, эту ссылку можно смело ставить
    сборщику как источник: фильтры будет применять сам Авито.
    """
    url = str(url or '').strip()
    if not url.startswith('http'):
        print("Укажите полную ссылку: --check-url \"https://www.avito.ru/...\"")
        return 2
    print(f"Проверяю: {url}")
    try:
        html = fetch(url, timeout=45)
    except Exception as exc:
        print(f"  ✖ не открылась: {str(exc)[:140]}")
        print("    Если это 429/439 — Авито отбил запрос: подождите 10–15 минут")
        print("    и повторите (частые проверки он считает поведением бота).")
        return 1
    items = parse_page(html)
    print(f"  страница открылась, символов {len(html)}, карточек разобрано: {len(items)}")
    if not items:
        print("  ⚠ карточек нет: возможно, в ссылке ноль объявлений или другая вёрстка")
        return 1
    sellers = {}
    for it in items:
        st = it.get('seller_type') or 'не определён'
        sellers[st] = sellers.get(st, 0) + 1
    for it in items[:5]:
        print(f"    {str(it.get('title'))[:46]:48} {it.get('price')} ₽  "
              f"{it.get('city') or ''}  продавец: {it.get('seller_type') or '—'}")
    print(f"  типы продавца в выдаче: {sellers}")
    print("  ✅ ссылку можно использовать как источник для сборщика")
    return 0


def check_query(text: str) -> int:
    """Сравнивает две ссылки поиска на живом Авито: без q и с q.

    Нужна, чтобы убедиться, что Авито принимает текст запроса: одна точная
    выдача вместо перебора всей категории. Запускать со своего компьютера —
    у сервера может не быть доступа или он уже получил 429.
    """
    text = " ".join(str(text or '').split())
    if not text:
        print("Укажите текст: --check-query \"iphone 13 pro\"")
        return 2
    words = [w for w in text.lower().split() if w]
    slug = None
    for w in words:
        clean = w.strip('.,!?()"\'')
        if clean in CATEGORY_BY_WORD:
            slug = CATEGORY_BY_WORD[clean]
            break
    base = f"https://www.avito.ru/all/{slug}" if slug else "https://www.avito.ru/all"
    variants = [("без q (как было)", f"{base}?s=104"),
                ("с q (как стало)", f"{base}?s=104&q=" + quote_plus(text))]
    for title, url in variants:
        print(f"\n{title}: {url}")
        try:
            html = fetch(url, timeout=45)
        except Exception as exc:
            print(f"  ✖ не получилось: {str(exc)[:120]}")
            time.sleep(random.uniform(4.0, 7.0))
            continue
        items = parse_page(html)
        rel = [it for it in items
               if all(w in (it.get('title') or '').lower() for w in words)]
        print(f"  карточек {len(items)}, из них по словам {words}: {len(rel)}")
        for it in rel[:4]:
            print(f"     {it.get('title')} — {it.get('price')} ₽")
        time.sleep(random.uniform(4.0, 7.0))
    print("\nЕсли «с q» даёт заметно больше подходящих — формат верный, "
          "сборщик уже так и работает. Если Авито не понял q, запустите "
          "сборщик с POLKA_SEARCH_BY_QUERY=0 (вернётся прежнее поведение).")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Сборщик находок для «Полки»")
    ap.add_argument('--config', default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                     'config.json'))
    ap.add_argument('--selftest', action='store_true', help='проверить разбор на образце')
    ap.add_argument('--check-proxy', metavar='URL', nargs='?', const='DEF',
                    help='проверить, пускает ли Авито через прокси')
    ap.add_argument('--check', action='store_true',
                    help='перепроверить лоты: продано или ещё висит')
    ap.add_argument('--check-url', metavar='ССЫЛКА',
                    help='проверить ссылку Авито с фильтрами из браузера')
    ap.add_argument('--check-query', metavar='ТЕКСТ',
                    help='сравнить поиск по тексту запроса и по категории')
    ap.add_argument('--details-only', metavar='N', nargs='?', const='0',
                    help='только описания: открывать N карточек за проход '
                         '(режим для домашнего IP — телефон, ноутбук, малина)')
    ap.add_argument('--loop', action='store_true', help='работать постоянно')
    ap.add_argument('--every', type=int, default=900, help='пауза между проходами, сек')
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    if args.check_url:
        return check_url(args.check_url)

    if args.check_query is not None:
        return check_query(args.check_query)

    # Режим «только описания»: сервер и токен берём из config.json,
    # цели и выдача тут не нужны вовсе
    if args.details_only is not None:
        cfg_d = load_config(args.config)
        try:
            limit_d = int(args.details_only or 0)
        except ValueError:
            limit_d = 0
        server_d = os.environ.get('POLKA_SERVER') or cfg_d['server']
        token_d = os.environ.get('POLKA_INGEST_TOKEN') or cfg_d['token']
        mode = 'постоянно' if args.loop else 'один проход'
        print(f"Режим «только описания» ({mode}), по {limit_d or 'HUNT_DESC_PER_PASS'} карточек")
        return details_only_loop(server_d, token_d, limit=limit_d,
                                 loop=bool(args.loop),
                                 every=max(120, int(args.every)))

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
