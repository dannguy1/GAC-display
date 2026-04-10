#!/usr/bin/env node
/**
 * Validate lunch-specials.json against the live menu database.
 * Fetches all menu items from the backend REST API and checks that
 * every configured special maps to an existing menu item.
 *
 * Usage:  node scripts/validate-config.mjs [--api URL]
 * Default API: http://192.168.10.3:8000/v1/menu
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'public', 'lunch-specials.json');
const DEFAULT_API = 'http://192.168.10.3:8000/v1/menu';

// --- Parse args ---
const apiUrl = (() => {
  const idx = process.argv.indexOf('--api');
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : DEFAULT_API;
})();

// --- Load config ---
let config;
try {
  config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
} catch (err) {
  console.error(`✗ Failed to read config: ${CONFIG_PATH}`);
  console.error(`  ${err.message}`);
  process.exit(1);
}

const specials = config.specials || [];
if (specials.length === 0) {
  console.error('✗ No specials defined in config');
  process.exit(1);
}

console.log(`Config: ${specials.length} specials in ${CONFIG_PATH}`);
console.log(`API:    ${apiUrl}\n`);

// --- Fetch menu items from REST API ---
let menuItems;
try {
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  menuItems = await res.json();
  if (!Array.isArray(menuItems)) throw new Error('Response is not an array');
} catch (err) {
  console.error(`✗ Failed to fetch menu items: ${err.message}`);
  process.exit(1);
}

console.log(`Menu:   ${menuItems.length} items from backend\n`);

// --- Build lookup (lowercase, trimmed) ---
const menuMap = new Map();
for (const item of menuItems) {
  const key = item.item_name?.toLowerCase().trim();
  if (key) menuMap.set(key, item);
}

// --- Validate each special ---
let passed = 0;
let failed = 0;

for (const spec of specials) {
  const key = spec.item_name?.toLowerCase().trim();
  const match = menuMap.get(key);

  if (match) {
    passed++;
    const priceDiff = match.price != null
      ? ` (menu $${match.price.toFixed(2)} → special $${spec.price.toFixed(2)})`
      : '';
    console.log(`  ✓ "${spec.item_name}"${priceDiff}`);
  } else {
    failed++;
    console.log(`  ✗ "${spec.item_name}" — NOT FOUND in menu`);

    // Suggest close matches using the first word of the item name
    const firstWord = key?.split(' ')[0]?.toLowerCase();
    if (firstWord) {
      const suggestions = [...menuMap.keys()]
        .filter(k => k.includes(firstWord))
        .slice(0, 3);
      if (suggestions.length > 0) {
        console.log(`    Did you mean: ${suggestions.map(s => `"${menuMap.get(s).item_name}"`).join(', ')}?`);
      }
    }
  }
}

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed out of ${specials.length} specials`);
process.exit(failed > 0 ? 1 : 0);
