const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { UPGRADE, USER_LIMITS } = require('./house-config');
const { applyLucky, calculateRealBaseChance } = require('./upgrade-logic');

const root = __dirname;
const db = fs.readFileSync(path.join(root, 'db.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'webapp-api.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const upgradeUi = fs.readFileSync(path.join(root, 'webapp/src/components/UpgradeTab.jsx'), 'utf8');
const inventoryUi = fs.readFileSync(path.join(root, 'webapp/src/components/InventoryTab.jsx'), 'utf8');
const appUi = fs.readFileSync(path.join(root, 'webapp/src/App.jsx'), 'utf8');

// 1) Lucky is server-side and materially stronger for representative low-probability upgrades.
const source = { id: 1, price_stars: 10 };
const target = { id: 2, price_stars: 1000 };
const base = calculateRealBaseChance(source, target, 1);
const lucky = applyLucky(base, true);
assert(lucky > base, 'Lucky must always improve the real chance');
assert(lucky >= base + UPGRADE.LUCKY_FLAT_BOOST, 'Lucky must include the configured flat boost before cap');
assert(lucky <= UPGRADE.LUCKY_MAX_CHANCE, 'Lucky may never exceed configured cap');

// 2) The client cannot choose lucky mode: the real decision is taken from the DB user state.
assert(/SELECT lucky_mode, pre_demo_balance[\s\S]*FOR UPDATE/.test(db), 'Upgrade must read and lock demo state server-side');
assert(/resolveUpgrade\([\s\S]*\{ luckyMode \}/.test(db), 'Upgrade must pass server-side lucky mode into the decision');

// 3) Demo isolation: ordinary items cannot be upgraded in demo; demo items cannot escape back into real mode.
assert(/demoActive && Number\(sourceItem\.is_demo\) !== 1/.test(db), 'Demo must reject non-demo source items');
assert(/!demoActive && Number\(sourceItem\.is_demo\) === 1/.test(db), 'Real mode must reject demo source items');
assert(/const isDemo = demoActive \? 1 : 0/.test(db), 'Successful demo upgrades must remain demo-tagged');
assert(/if \(!demoActive\) \{[\s\S]*upgrades_count = upgrades_count \+ 1/.test(db), 'Demo upgrades must not advance real progression');
assert(/SELECT ui\.id, ui\.is_demo/.test(db), 'Upgrade must know whether the source is demo');

// 4) Demo items cannot be converted to withdrawable balance via selling.
assert(/if \(demoActive\) \{ await client\.query\('ROLLBACK'\); return \{ error: 'demo_active' \}; \}/.test(db), 'Selling must be blocked while demo is active');
assert(/Number\(row\.is_demo\) === 1/.test(db), 'Selling must inspect demo flag');
assert(/rows\.rows\.some\(\(r\) => Number\(r\.is_demo\) === 1\)/.test(db), 'Batch selling must inspect demo flags');

// 5) Withdraw has defence in depth: active demo OR orphaned demo items are blocked.
assert(/demoItemsRes/.test(db) && /demoItemsRes\.rows\[0\]\?\.cnt/.test(db), 'Withdraw must check for demo inventory');
assert(/dUser\.pre_demo_balance != null \|\| Number\(dUser\.lucky_mode\) > 0 \|\| Number\(demoItemsRes\.rows\[0\]\?\.cnt\) > 0/.test(db), 'Withdraw must remain blocked for any demo state');

// 6) Revoke removes demo items and restores the pre-demo snapshot.
assert(/DELETE FROM user_inventory WHERE user_id = \$1 AND is_demo = 1/.test(db), 'Revoke must delete demo items');
assert(/CASE WHEN pre_demo_balance IS NOT NULL OR lucky_mode = 1 THEN 1 ELSE 0 END/.test(db), 'Inventory grants must inherit demo state');
assert(/SELECT pre_demo_balance, lucky_mode FROM users WHERE telegram_id = \$1 FOR UPDATE/.test(db), 'Inventory reward paths must lock the user state');
assert(/SET balance = \$1, pre_demo_balance = NULL, lucky_mode = 0/.test(db), 'Revoke must restore and clear demo state');

// 7) Demo grant is atomic, locked, and non-stackable.
assert(/SELECT balance, pre_demo_balance, lucky_mode FROM users WHERE telegram_id = \$1 FOR UPDATE/.test(db), 'Demo grant must lock the user row');
assert(/demo_already_active/.test(db), 'Demo grant must not stack while already active');
assert(/const preBalance = Number\(user\.balance\) \|\| 0/.test(db), 'Demo snapshot must be taken from the locked current balance');

// 8) The old public balance-grant endpoint is gone.
assert(!db.includes('grantDemoCredits'), 'Vulnerable grantDemoCredits function must be removed');
assert(!api.includes("'/demo/topup'"), 'Public demo topup route must be removed');

// 9) Withdrawal flood limit is actually enforced.
assert(/daily_withdrawal_limit/.test(db), 'Configured daily withdrawal limit must be enforced');
assert(/created_at >= CURRENT_DATE/.test(db), 'Daily withdrawal count must be scoped to the current day');

// 10) Public diagnostics must not leak admin/whitelist information.
assert(!index.includes("app.get('/api/diag'"), 'Public /api/diag must be removed');
assert(!index.includes('adminChatIdRaw'), 'Admin chat ID must not be exposed');
assert(!index.includes('checkedUserInWhitelist'), 'Whitelist state must not be exposed');

// 11) UI follows server-side demo state instead of inventing its own lucky state.
assert(/demoActive \? inventory\.filter\(\(i\) => Number\(i\.is_demo\) === 1\)/.test(upgradeUi), 'Upgrade UI must show demo items only during demo');
assert(/demoActive/.test(appUi), 'App must pass server-provided demo state to UI');
assert(/demoActive/.test(inventoryUi), 'Inventory UI must react to demo state');

console.log('✅ Demo/security audit passed');
console.log(`   Lucky base=${base.toFixed(3)}% -> lucky=${lucky.toFixed(3)}% (cap ${UPGRADE.LUCKY_MAX_CHANCE}%)`);
console.log(`   Daily withdrawals=${USER_LIMITS.MAX_DAILY_WITHDRAWALS}`);
