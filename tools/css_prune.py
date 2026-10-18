#!/usr/bin/env python3
"""Удаление СТАРЫХ определений выбранных семейств классов из css-файлов, чтобы единственным
владельцем осталась новая таблица (src/styles/mg-core.css).

Правило владения: селектор считается «своим» для семейства, если семейный класс стоит в ПЕРВОМ
составном селекторе (без префиксов .app-shell / html / body). Примеры:
   .cta-primary, .cta-primary:disabled, .app-shell .cta-primary, .cta-primary svg   -> свои (удаляются)
   .detail-bar .cta-primary, .topbar .ghost-btn                                    -> контекстные (остаются,
                                                                                     печатаются в отчёте)
Если в одном правиле список селекторов смешанный, удаляются только свои, остальные остаются.
mg-core.css никогда не трогается.

Запуск:
   python3 tools/css_prune.py polka-final/frontend/src            # только отчёт (ничего не меняет)
   python3 tools/css_prune.py polka-final/frontend/src --apply    # удалить, оригиналы -> *.css.bak
"""
import re, sys, pathlib

FAMILIES = {
    'кнопки-синие': ['cta-primary', 'primary-btn', 'cta-button', 'btn-primary'],
    'кнопки-тёмные': ['ghost-btn', 'dark-btn', 'btn-ghost', 'btn', 'btn-sm', 'btn-wide', 'btn-spinner'],
    'список-профиля': ['menu-list', 'menu-row', 'menu-left', 'menu-arrow'],
    'сегменты': ['segmented'],
    'список-общий': ['ui-group', 'ui-group-title', 'ui-group-body', 'list-row', 'list-row-body', 'list-row-title', 'list-row-sub'],
}
TARGETS = {c: f for f, cs in FAMILIES.items() for c in cs}
PREFIX = {'.app-shell', 'html', 'body', ':root'}
LAYOUT = ('flex', 'width', 'height', 'margin', 'position', 'grid', 'order', 'align-self', 'z-index', 'top', 'bottom', 'left', 'right')

def split_commas(s):
    out, depth, cur = [], 0, ''
    for ch in s:
        if ch in '([': depth += 1
        elif ch in ')]': depth -= 1
        if ch == ',' and depth == 0: out.append(cur); cur = ''
        else: cur += ch
    if cur.strip(): out.append(cur)
    return [x.strip() for x in out]

def first_compound(sel):
    parts, depth, cur, toks = [], 0, '', []
    for ch in sel.strip():
        if ch in '([': depth += 1
        elif ch in ')]': depth -= 1
        if depth == 0 and ch in ' >+~':
            if cur: toks.append(cur); cur = ''
            if toks and toks[-1] in PREFIX or (toks and toks[-1] in ('>', '+', '~')): pass
        else: cur += ch
    if cur: toks.append(cur)
    toks = [t for t in toks if t not in PREFIX and t not in ('>', '+', '~')]
    return toks[0] if toks else ''

def owned_family(sel):
    fc = first_compound(sel)
    for c in re.findall(r'\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)', re.sub(r'\[[^\]]*\]', '', fc)):
        if c in TARGETS: return TARGETS[c]
    return None

def mentions_target(sel):
    return any(c in TARGETS for c in re.findall(r'\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)', re.sub(r'\[[^\]]*\]', '', sel)))

def transform(css, full, removed, kept, base=0):
    out, i, n = [], 0, len(css)
    while i < n:
        j = i
        while j < n and css[j] in ' \t\r\n': j += 1
        out.append(css[i:j]); i = j
        if i >= n: break
        if css.startswith('/*', i):
            k = css.find('*/', i) + 2; out.append(css[i:k]); i = k; continue
        k = i
        while k < n and css[k] not in '{;': k += 1
        if k >= n: out.append(css[i:]); break
        if css[k] == ';': out.append(css[i:k + 1]); i = k + 1; continue
        head = css[i:k]; d = 0; m = k
        while m < n:
            if css[m] == '{': d += 1
            elif css[m] == '}':
                d -= 1
                if d == 0: break
            m += 1
        body = css[k + 1:m]; line = full[:base + i].count('\n') + 1
        h = head.strip()
        if h.startswith('@media') or h.startswith('@supports') or h.startswith('@layer'):
            inner = transform(body, full, removed, kept, base + k + 1)
            if inner.strip(): out.append(f'{head}{{{inner}}}')
            else: removed.append((line, f'{h} {{...пусто}}', '(пустой @media удалён)', ''))
        elif h.startswith('@'):
            out.append(css[i:m + 1])
        else:
            sels = split_commas(h); keep_s, drop_s = [], []
            for s in sels:
                (drop_s if owned_family(s) else keep_s).append(s)
                if not owned_family(s) and mentions_target(s): kept.append((line, s))
            for s in drop_s:
                decls = ', '.join(sorted({p.split(':')[0].strip() for p in body.split(';') if ':' in p and p.split(':')[0].strip().startswith(LAYOUT)}))
                removed.append((line, s, owned_family(s), decls))
            if keep_s and drop_s: out.append(f"{', '.join(keep_s)} {{{body}}}")
            elif keep_s: out.append(css[i:m + 1])
        i = m + 1
    return ''.join(out)

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    root = pathlib.Path(args[0] if args else 'polka-final/frontend/src')
    apply = '--apply' in sys.argv
    total_rm = total_keep = 0
    for p in sorted(root.rglob('*.css')):
        if p.name == 'mg-core.css' or 'node_modules' in p.parts: continue
        text = p.read_text(encoding='utf-8'); removed, kept = [], []
        new = transform(text, text, removed, kept)
        if not removed and not kept: continue
        print(f"\n== {p.relative_to(root)}: удалить селекторов {len(removed)}, контекстных оставить {len(kept)}")
        for ln, s, fam, decls in removed[:200]:
            print(f"   - стр.{ln:5d} [{fam}] {s[:78]}" + (f"   (были раскладочные: {decls})" if decls else ''))
        for ln, s in kept[:40]:
            print(f"   ~ ОСТАВЛЕН контекст стр.{ln}: {s[:90]}")
        total_rm += len(removed); total_keep += len(kept)
        if apply and removed:
            p.with_suffix('.css.bak').write_text(text, encoding='utf-8')
            p.write_text(new, encoding='utf-8')
            assert new.count('{') == new.count('}'), f'нарушен баланс скобок в {p}'
    print(f"\nИТОГО: удалено селекторов {total_rm}, оставлено контекстных (проверить вручную) {total_keep}" + ('' if apply else '   [режим отчёта: файлы не менялись]'))

if __name__ == '__main__':
    main()
