# CSS: правила проекта

Документ появился после консолидации 18.10.2026. До неё в `components.css` было
**201 `!important`** и 65 классов, определённых в трёх и более файлах: внешний вид
зависел не от «правильного» правила, а от того, что подключено позже или кричит громче.

## Порядок подключения (менять нельзя)

`main.jsx`, снизу вверх по приоритету:

```
styles.css              legacy, только чтение
styles/tokens.css       переменные, один :root
styles/base.css         сброс и базовая типографика
styles/components.css   компоненты (уже без !important)
styles/pages/*.css      оформление конкретных экранов
styles/memgift-final.css  слой владельца
styles/mg-core.css      ← ЭТАЛОН, подключается ПОСЛЕДНИМ
```

`mg-core.css` побеждает **порядком**, а не силой. Поэтому `!important` в проекте
запрещён: если правило не работает, ищите специфичность, а не глушите её.

## Правило владения

Один класс — одно место. Оформление семейства живёт **только** в `mg-core.css`.
Если нужно поправить вид кнопки, карточки или панели — правьте там, а не в
`components.css` и не в `styles.css`.

Закрытые семейства (эталон в `mg-core.css`):

| Семейство | Классы |
|---|---|
| Синяя кнопка | `cta-primary`, `primary-btn`, `cta-button` |
| Карточка товара | `product-card`, `product-figure`, `product-price`, `product-badge`, `save-btn`, `product-title` |
| Нижняя панель | `tabbar`, `tabbar-wrap`, `tabbar-item`, `tabbar-fab`, `tabbar-dot` |
| Вторичные кнопки | `ghost-btn`, `dark-btn`, `link-btn`, `danger-text-btn` |
| Поля и поиск | `text-input`, `ui-search`, `search-input`, `input`, `textarea`, `select` |
| Диалоги | `chat-row`, `chat-list`, `chat-thumb`, `chat-meta`, `chat-unread` |
| Панели | `glass-card`, `summary-card`, `pay-status`, `list-stack`, `stat*` |
| Состояния | `is-active` у чипов, сегментов, табов |
| Сегменты | `segmented button`, `chat-tab`, `admin-tab` |
| Чипы | `chip`, `hint-chip`, `badge`, `cta-round` |
| Строки меню | `menu-row`, `setting-row`, `menu-arrow` |
| Каркас страницы | `screen` + медиазапросы |
| Тулбар | `market-toolbar`, `filter-pill` |

Контекстные правила (`.detail-bar .cta-primary`, `.hunt-screen .topbar`) остаются
в своих файлах — это законные исключения, а не дубли.

## Решение по эффектам (18.10.2026)

Цели старого плана «минимализм» (`backdrop-filter = 0`, градиентов ≤ 3) **отменены
владельцем**. Принято: градиент, верхний блик и тень у плашек сохраняются — они дают
объём, которого требует стиль MemGift.

Действует единая формула поверхности:

```
фон:      linear-gradient(180deg, #26262A, #1A1A1C)
блик:     inset 0 1px 0 rgba(255,255,255,.16)
радиус:   999 для пилюль, 20 для панелей, 28 для карточек
```

Активное состояние: `#3A3A3E → #2C2C30` плюс блик `.20`.
Синяя кнопка: `#1F78FF → #0A62F0`, кромка сверху `rgba(255,255,255,.28)`.

**Обводок нет ни у одной плашки.** Кромки убирались трижды: две рамки в зазоре
между капсулой и «+» читались как линия между ними. Глубину дают фон, блик и тень.

## Проверка перед коммитом

```bash
cd amvera-upload
python3 tools/css_audit.py polka-final/frontend/src   # !important должен быть 0
python3 tools/css_prune.py polka-final/frontend/src   # отчёт, ничего не меняет
cd polka-final/frontend && npm run build
```

Если `css_audit.py` показывает `!important` больше нуля — правило добавлено не туда.
