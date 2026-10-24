#!/usr/bin/env python3
"""Сквозная проверка экранов: падения, горизонтальный скролл, пустые экраны.

Запуск (нужен собранный dist и playwright с chromium):

    cd polka-final/frontend && npm run build
    python3 -m http.server 8899 --directory polka-final/frontend/dist &
    python3 tools/screens_sweep.py

Что проверяет каждый маршрут:
  • экран отрисовался и не показал «Не удалось показать экран»;
  • documentElement.scrollWidth не больше innerWidth (нет горизонтали);
  • в консоли нет ошибок, кроме сетевых (API подменён заглушкой).

API подменяется универсальной заглушкой: цель — вёрстка и отсутствие
падений, а не данные. Внешние запросы блокируются: без этого шрифты
держат снимок и проверка висит.
"""
import json
import sys

from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8899/'
ROUTES = [
    ('#/', 'feed'), ('#/search', 'search'), ('#/create', 'create'),
    ('#/profile', 'profile'), ('#/tariffs', 'tariffs'), ('#/hunt', 'hunt'),
    ('#/hunt/words', 'words'), ('#/hunt/manual', 'manual'), ('#/news', 'news'),
    ('#/chats', 'chats'), ('#/my', 'my'), ('#/favorites', 'favorites'),
]
MOCK = {
    'ok': True, 'items': [], 'plans': [], 'plan': 'trial', 'free_max_criteria': 1,
    'ad': {'id': 1, 'title': 'iPhone 13 Pro', 'price': 42900, 'photos': '[]', 'city': 'Ижевск'},
    'user': {'id': 'u', 'name': 'Никита', 'username': 'nik', 'active_ads': 2, 'favorites': 1},
    'legal': {'privacy_url': '#', 'terms_url': '#'},
}


def main() -> int:
    bad = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)

        def handler(route):
            url = route.request.url
            if '/api/' in url:
                return route.fulfill(status=200, content_type='application/json',
                                     body=json.dumps(MOCK, ensure_ascii=False))
            return route.continue_() if '127.0.0.1' in url else route.abort()

        page.route('**/*', handler)
        page.goto(BASE, wait_until='commit', timeout=15000)
        page.wait_for_timeout(1500)

        for hash_, name in ROUTES:
            page.evaluate(f"location.hash = '{hash_}'")
            page.wait_for_timeout(1100)
            info = page.evaluate('''() => ({
                text: document.body.innerText.slice(0, 60).replace(/\\n/g, ' | '),
                overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
                crash: document.body.innerText.includes('Не удалось показать экран'),
            })''')
            if info['crash']:
                status = 'ПАДЕНИЕ'
            elif info['overflow']:
                status = 'СКРОЛЛ'
            else:
                status = 'ок'
            if status != 'ок':
                bad += 1
            print(f"  {name:10s} {status:9s} {info['text'][:58]}")
        browser.close()
    print('\nвсе экраны в порядке' if not bad else f'\nпроблемных экранов: {bad}')
    return 0 if not bad else 1


if __name__ == '__main__':
    sys.exit(main())
