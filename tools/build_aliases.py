"""Собирает ru→en словарь брендов из Wikidata (CC0).

Зачем: люди пишут «айфон», а в объявлениях «iPhone». Без словаря примеры
находок для таких запросов пустые, хотя товар в базе есть.

Источник — Wikidata (CC0): бренды (Q431289) и товарные знаки (Q167270).
Генератор запускается один раз, результат коммитится в data/ru_en_aliases.json;
на сервере интернет не нужен.

Запуск: python3 tools/build_aliases.py
"""
import json
import re
import ssl
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'ru_en_aliases.json'
ENDPOINT = 'https://query.wikidata.org/sparql'
UA = 'polka-dictionary-builder/1.0 (https://github.com/gereev213-creator/polka)'
PAGE = 1000
CLASSES = [('Q431289', 'brand'), ('Q167270', 'trademark')]
CYR = re.compile('[а-яё]')
LAT = re.compile('[a-z]')

# Популярные товары, которых нет в классах «бренд/товарный знак»
# (айфон — серия продуктов, а не бренд организации).
CURATED = {
    'айфон': 'iphone', 'айфоны': 'iphone', 'ифон': 'iphone',
    'айпад': 'ipad', 'айпэд': 'ipad', 'айпод': 'ipod',
    'эйрподс': 'airpods', 'аирподс': 'airpods', 'аирподсы': 'airpods',
    'эйрподс про': 'airpods pro',
    'макбук': 'macbook', 'мак бук': 'macbook', 'аймак': 'imac',
    'эпл вотч': 'apple watch', 'эппл вотч': 'apple watch',
    'плейстейшн': 'playstation', 'пс5': 'ps5', 'пс4': 'ps4',
    'иксбокс': 'xbox', 'нитендо свитч': 'nintendo switch', 'свитч': 'switch',
    'самсунг': 'samsung', 'сяоми': 'xiaomi', 'хуавей': 'huawei',
    'редми': 'redmi', 'поуко': 'poco', 'хонор': 'honor',
    'найк': 'nike', 'адидас': 'adidas', 'пума': 'puma', 'рибок': 'reebok',
    'нью бэланс': 'new balance', 'нью баланс': 'new balance',
    'гуччи': 'gucci', 'прада': 'prada', 'баленсиага': 'balenciaga',
    'феррагамо': 'ferragamo', 'версаче': 'versace', 'диор': 'dior',
    'шанель': 'chanel', 'луи виттон': 'louis vuitton', 'эрмес': 'hermes',
    'канада гус': 'canada goose', 'канада гусь': 'canada goose',
    'стоун айленд': 'stone island', 'стон айленд': 'stone island',
    'палм энджелс': 'palm angels', 'палм энжелс': 'palm angels',
    'поло рэйф лорен': 'ralph lauren', 'рэйф лорен': 'ralph lauren',
    'томми хилфигер': 'tommy hilfiger', 'хилфигер': 'tommy hilfiger',
    'кальвин кляйн': 'calvin klein', 'кэлвин кляйн': 'calvin klein',
    'армани': 'armani', 'джорджио армани': 'giorgio armani',
    'хьюго босс': 'hugo boss', 'босс': 'boss',
    'лакост': 'lacoste', 'ливс': 'levis', 'ли вайс': 'levis',
    'дизель': 'diesel', 'зара': 'zara', 'биба': 'biba',
    'эко': 'ecco', 'экко': 'ecco', 'тимберленд': 'timberland',
    'доктор мартинс': 'dr martens', 'доктор мартенс': 'dr martens',
    'мартинс': 'dr martens', 'конверс': 'converse', 'ванс': 'vans',
    'джордан': 'jordan', 'эир джордан': 'air jordan',
    'иксбокс сериес икс': 'xbox series x',
    'тесла': 'tesla', 'дайсон': 'dyson', 'блендер': 'blender',
    # Компании-производители: в Wikidata это не «бренд», а организация,
    # поэтому в автоматической части словаря их нет.
    'нитендо': 'nintendo', 'нинтендо': 'nintendo', 'сони': 'sony',
    'майкрософт': 'microsoft', 'эпл': 'apple', 'эппл': 'apple',
    'лджи': 'lg', 'леново': 'lenovo', 'асус': 'asus', 'асер': 'acer',
    'мси': 'msi', 'интел': 'intel', 'амд': 'amd', 'нвидиа': 'nvidia',
    'кэнон': 'canon', 'никон': 'nikon', 'фуджифилм': 'fujifilm',
    'панасоник': 'panasonic', 'филипс': 'philips', 'боуз': 'bose',
    'сенхайзер': 'sennheiser', 'джейбиэл': 'jbl', 'маршалл': 'marshall',
    'логитек': 'logitech', 'логитеч': 'logitech', 'рэйзер': 'razer',
    'гипер икс': 'hyperx', 'гоупро': 'gopro', 'инстакс': 'instax',
    'сяоми': 'xiaomi', 'редми': 'redmi', 'поуко': 'poco',
    # Авто
    'тойота': 'toyota', 'бмв': 'bmw', 'мерседес': 'mercedes',
    'ауди': 'audi', 'фольксваген': 'volkswagen', 'киа': 'kia',
    'хендай': 'hyundai', 'хундай': 'hyundai', 'ниссан': 'nissan',
    'мазда': 'mazda', 'хонда': 'honda', 'мицубиси': 'mitsubishi',
    'рено': 'renault', 'пежо': 'peugeot', 'ситроен': 'citroen',
    'шевроле': 'chevrolet', 'форд': 'ford', 'шкода': 'skoda',
    'субару': 'subaru', 'лексус': 'lexus', 'инфинити': 'infiniti',
    'вольво': 'volvo', 'лифан': 'lifan', 'лада': 'lada', 'уаз': 'uaz',
}


def fetch_class(qid: str):
    """Все пары (ru-метка, en-метка) для класса, постранично."""
    pairs = {}
    en_terms = set()
    offset = 0
    while True:
        query = (
            'SELECT ?ru ?en WHERE { '
            f'?item wdt:P31/wdt:P279* wd:{qid} . '
            '?item rdfs:label ?ru FILTER(lang(?ru)="ru") . '
            '?item rdfs:label ?en FILTER(lang(?en)="en") } '
            f'ORDER BY ?item LIMIT {PAGE} OFFSET {offset}'
        )
        url = ENDPOINT + '?' + urllib.parse.urlencode({'query': query})
        req = urllib.request.Request(url, headers={
            'Accept': 'application/sparql-results+json', 'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode('utf-8'))
        except Exception:
            # На некоторых машинах в Python нет корневых сертификатов
            # (curl при этом работает). Для разового генератора это не риск:
            # данные — публичные метки Wikidata.
            ctx = ssl._create_unverified_context()
            with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
                data = json.loads(resp.read().decode('utf-8'))
        rows = data['results']['bindings']
        for row in rows:
            ru = str(row['ru']['value']).strip()
            en = str(row['en']['value']).strip()
            if not ru or not en:
                continue
            low_ru, low_en = ru.lower(), en.lower()
            if low_ru == low_en:
                continue
            if LAT.search(low_en) and 2 <= len(low_en) <= 40:
                en_terms.add(low_en)
            # нужна пара «кириллица → латиница», это и есть транслит-барьер
            if not CYR.search(low_ru) or not LAT.search(low_en):
                continue
            if len(low_ru) > 40 or len(low_en) > 40:
                continue
            pairs.setdefault(low_ru, low_en)
        print(f'  {qid}: offset {offset} → {len(rows)} строк, '
              f'пар: {len(pairs)}, латинских названий: {len(en_terms)}')
        if len(rows) < PAGE:
            break
        offset += PAGE
        time.sleep(1.0)
    return pairs, en_terms


def main():
    result = {}
    en_terms = set()
    for qid, label in CLASSES:
        print(f'Класс {label} ({qid})...')
        try:
            _pairs, _en = fetch_class(qid)
            result.update(_pairs)
            en_terms |= _en
        except Exception as e:
            print(f'  ОШИБКА {qid}: {e}')
    before = len(result)
    for ru, en in CURATED.items():
        result.setdefault(ru, en)
    payload = {
        'source': 'Wikidata (Q431289 brand, Q167270 trademark) + curated',
        'license': 'CC0',
        'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'count': len(result),
        'pairs': dict(sorted(result.items())),
        # Латинские названия нужны для фонетического сопоставления:
        # «гуччи» → Gucci там, где в Wikidata русская метка совпадает с англ.
        'en_terms': sorted(en_terms),
        'en_terms_count': len(en_terms),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')),
                   encoding='utf-8')
    print(f'Готово: {len(result)} пар (бренды/знаки: {before}, дописано вручную: '
          f'{len(result) - before}), латинских названий: {len(en_terms)}, '
          f'файл {OUT} ({OUT.stat().st_size // 1024} КБ)')


if __name__ == '__main__':
    main()
