# Crimson Glass UI — что изменено

Изменены ТОЛЬКО эти файлы (весь остальной JS/JSX/сервер — побайтово как был):
- `webapp/src/styles.css` — токены + стеклянный слой (старые правила раскладки/механики сохранены)
- `webapp/src/components/TabBar.jsx` — только разметка иконок (эмодзи → SVG). id/label/onChange не тронуты
- `webapp/index.html` — `<meta color-scheme>` и подключение `/theme-sync.js`
- `webapp/public/theme-sync.js` — НОВЫЙ, 12 строк: ставит `data-scheme="light|dark"` из `Telegram.WebApp.colorScheme`
  и слушает `themeChanged`. Без React, без запросов, без ре-рендеров. Удалить можно — UI останется тёмным.

## Не менялось намеренно (по желанию)
`src/telegram.js` вызывает `setHeaderColor('#0b0407')` / `setBackgroundColor('#0b0407')`. В светлой теме нативная
шапка Telegram останется тёмной. Если хотите идеально — замените на `'bg_color'` (одна строка, я её не трогал).

## Производительность
- `backdrop-filter` только на: шапка, таб-бар, шторки, toast, подсказка туториала (макс. ~4 слоя одновременно).
  Карточки — «faux glass» (полупрозрачная заливка + блик), т.к. блюр над статичным фоном не виден, но нагружает GPU.
- Анимируются только transform/opacity. Убраны бесконечные анимации box-shadow / filter / background-position.
- Фон-«аврора» статичный (движущийся фон заставил бы все blur-слои перерисовываться каждый кадр).
- Фолбэки: нет backdrop-filter или `prefers-reduced-transparency` → шапка/таб-бар/шторки почти непрозрачные;
  нет color-mix() → статические rgba; нет :has() → активная вкладка красит себя сама; `prefers-reduced-motion` учтён.

## Заодно исправлено
`card-in` использовал `fill-mode: both` и навсегда «замораживал» transform — из-за этого `:active` у карточек не работал.
