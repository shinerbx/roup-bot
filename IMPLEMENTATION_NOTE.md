# RoUP WebApp — stability/UI update

Implemented:
- Long item names now wrap safely, stay inside their containers, and are clamped to two lines across catalog, inventory, purchase and upgrade UI.
- Upgrade targets must be more expensive than the source item. The server enforces this too, so cheaper targets and same-price targets cannot be submitted directly. The most expensive catalog item therefore has no valid next target.
- Purchase, upgrade and sell operations use idempotency keys to make network retries safe; sell now has the same protection as purchase/upgrade.
- Subscription rewards and referral rewards are protected against concurrent duplicate callbacks/registration races.
- Added per-Telegram-account tutorial completion state with a backward-compatible database migration.
- Added a first-run interactive tutorial with a spotlight, animated arrow, exact click-through target, modal finish screen, and blocking overlay for all non-target controls.

Validation:
- Node syntax checks passed for the modified CommonJS server files.
- Standalone upgrade-logic tests passed for higher targets, invalid targets, multiplier validation and chance calculation.
- Full Vite build could not be executed in this environment because npm registry DNS access is unavailable; no dependencies were added to the project archive.
