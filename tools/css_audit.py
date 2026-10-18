#!/usr/bin/env python3
"""Аудит каскада CSS: где один и тот же класс определён в нескольких файлах и сколько в проекте
!important, градиентов, теней и стекла (backdrop-filter).
Запуск:  python3 tools/css_audit.py polka-final/frontend/src
Чем больше файлов определяют один класс, тем менее предсказуем внешний вид (побеждает не «правильное»
правило, а то, что специфичнее или подключено позже)."""
import re, sys, pathlib, collections

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'polka-final/frontend/src')
files = sorted(p for p in root.rglob('*.css') if 'node_modules' not in p.parts)
order = [root / 'styles.css'] + [p for p in files if p.name != 'styles.css']
CLS = re.compile(r'\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)')
defs = collections.defaultdict(lambda: collections.Counter())
tot = collections.Counter()
print(f"{'файл':36s} {'строк':>6s} {'!important':>10s} {'blur':>5s} {'gradient':>8s} {'shadow':>6s}")
for p in files:
    t = re.sub(r'/\*.*?\*/', '', p.read_text(encoding='utf-8', errors='ignore'), flags=re.S)
    v = dict(imp=t.count('!important'), blur=t.count('backdrop-filter'), grad=len(re.findall('gradient', t)), sh=len(re.findall('box-shadow', t)))
    tot.update(v)
    print(f"{str(p.relative_to(root)):36s} {t.count(chr(10)):6d} {v['imp']:10d} {v['blur']:5d} {v['grad']:8d} {v['sh']:6d}")
    for head in re.findall(r'([^{}@]+)\{', t):
        for c in set(CLS.findall(re.sub(r'\[[^\]]*\]', '', head))):
            defs[c][str(p.relative_to(root))] += 1
print(f"{'ИТОГО':36s} {'':6s} {tot['imp']:10d} {tot['blur']:5d} {tot['grad']:8d} {tot['sh']:6d}")
rows = sorted(((len(f), sum(f.values()), c, f) for c, f in defs.items() if len(f) >= 3), reverse=True)
print(f"\nКлассы, которые определены в 3+ файлах ({len(rows)} шт.). Топ-25:")
for nf, n, c, f in rows[:25]:
    print(f"  .{c:24s} файлов {nf}, правил {n:3d}: " + ', '.join(f"{k.split('/')[-1]}:{v}" for k, v in f.most_common(6)))
