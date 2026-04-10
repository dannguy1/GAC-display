/**
 * Build verification tests.
 *
 * Runs `npx vite build` for each app and verifies it succeeds.
 * These are slower (~2s each) but catch import/alias issues.
 *
 * Usage:
 *   node --test test/integration/build.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const apps = [
    { name: 'shell',        dir: 'shell' },
    { name: 'menu',         dir: 'sessions/menu' },
    { name: 'announcement', dir: 'sessions/announcement' },
    { name: 'happy-hour',   dir: 'sessions/happy-hour' },
];

describe('Vite builds', { timeout: 30_000 }, () => {
    for (const { name, dir } of apps) {
        it(`${name} builds without errors`, () => {
            const cwd = resolve(ROOT, dir);
            try {
                const output = execSync('npx vite build', {
                    cwd,
                    encoding: 'utf-8',
                    timeout: 20_000,
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
                // Vite outputs "✓ N modules transformed" on success
                assert.ok(
                    output.includes('built in') || output.includes('modules transformed'),
                    `Build output should indicate success:\n${output.slice(-200)}`
                );
            } catch (e) {
                assert.fail(`${name} build failed:\n${e.stderr || e.message}`);
            }
        });
    }
});
