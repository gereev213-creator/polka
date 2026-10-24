"""Живая проверка: ссылка владельца → разбор → отбор нашим кодом."""
import re, sys, json
SRC = open('polka_bot-9-3.py', encoding='utf-8').read()
COL = open('collector/collect.py', encoding='utf-8').read()

def cut(src, start_pat, end_pat):
    i = src.index(start_pat)
    j = src.index(end_pat, i + 5)
    return src[i:j]

ns = {'re': re, 'json': json, 'sys': sys, 'Dict': dict, 'List': list, 'Any': object,
      'os': __import__('os'), 'time': __import__('time')}

# минимальные зависимости парсера
ns['parse_price'] = lambda s: int(re.sub(r'[^0-9]', '', str(s or '0')) or 0)
ns['external_id_from_url'] = lambda u: (re.search(r'_(\d{6,})', u or '') or [None, ''])[1]
ns['unescape'] = __import__('html').unescape

# парсер карточек из сборщика
i = COL.index('def items_from_microdata')
j = COL.index('\ndef ', i + 10)
exec(COL[i:j], ns)
parse_items = ns['items_from_microdata']

html = open('/tmp/av.html', encoding='utf-8', errors='ignore').read()
items = parse_items(html)
print(f'1) карточек разобрано со страницы: {len(items)}')
for it in items[:3]:
    print('   ·', str(it.get('title'))[:52], '·', it.get('price'), '₽ ·', it.get('city'))

# критерий из ссылки
k = SRC.index('AVITO_CATEGORY_SLUGS'); k_end = SRC.index('\n}', k) + 2
exec(SRC[k:k_end], ns)
exec(cut(SRC, 'def parse_avito_filter_url(', '\n# Запросы-аксессуары'), ns)
URL = ('https://m.avito.ru/all/telefony/mobilnye_telefony/apple/iphone_15_pro-ASgBAgICA0SywA2Sn~0RtMANzqs5sMENiPw3'
       '?f=ASgBAQECA0SywA2Sn~0RtMANzqs5sMENiPw3AUDo6w40~P3bAvr92wL8_dsCAkXGmgwVeyJmcm9tIjowLCJ0byI6MzUwMDB9'
       'gu4OFXsiZnJvbSI6ODAsInRvIjpudWxsfQ&user=1')
parsed = ns['parse_avito_filter_url'](URL)
crit = {'query': parsed['title_from_path'], 'category': 'Электроника',
        'filter_url': URL, 'filter_blob': parsed['filters'], 'active': 1,
        'requirements_json': '{}'}
print(f"2) критерий: «{crit['query']}» · filter_url сохранён: {bool(crit['filter_url'])}")

# отбор нашим кодом
eval_src = cut(SRC, 'def evaluate_ad(', '\ndef ')
# вырезаем только функцию решения и заглушки для зависимостей
stub = '''
HUNT_STRICT_MODEL_HINTS = ()
HUNT_ACCESSORY_CATEGORY_HINTS = ()
def _hunt_reason_label(r): return r
def _condition_ok(c, t): return True
def _query_alt_numbers(q): return []
def _query_words_required(q): return []
def query_word_variants(w): return []
def _hunt_extra_qualifier(q, t, strict=False): return ''
def _crit_excluded(c, t): return ''
def _query_subject_word(q): return ''
def hunt_junk_word(t, q): return ''
def hunt_junk_start_word(t, q): return ''
def _accessory_before_model(t, q): return ''
def hunt_condition_word(t, q): return ''
def classify_condition(t, d): return ('used', 0.5)
def extract_battery_percent(t, d): return 0
def _hunt_find_discount(a, c): return 0
def cfg_get(k, d=None): return d if d is not None else '1'
class Decision:
    def __init__(self, ok, reason, label):
        self.ok, self.reason, self.label = ok, reason, label
'''
exec(stub, ns)
exec(eval_src, ns)
evaluate_ad = ns['evaluate_ad']

passed = 0
reasons = {}
for it in items:
    ad = {'title': it.get('title'), 'price': it.get('price'), 'description': '',
          'city': it.get('city'), 'photos': json.dumps(it.get('photos') or []),
          'category': 'Электроника', 'source_url': it.get('url')}
    d = evaluate_ad(ad, crit, require_description=False)
    if d.ok:
        passed += 1
    else:
        reasons[d.reason] = reasons.get(d.reason, 0) + 1
print(f'3) прошли наш отбор: {passed} из {len(items)}')
print('   причины отказа:', reasons or 'нет')
