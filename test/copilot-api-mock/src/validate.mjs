/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Static CI validation for the mock Copilot API.
 *
 * Two parts:
 *   1. Architecture checks (run once) — the things the tool DOES encode about
 *      core: the entitlements `chat_enabled` gate is a boolean, and the token
 *      string parses the way core does with the flags core reads.
 *   2. Example snapshot — every example payload under `examples/` is run through
 *      core's REAL compiled `adaptManagedSettings`, and the adapted result +
 *      warning count are asserted against a committed snapshot in
 *      `examples/snapshots.json`. This is the generic regression guard: a new
 *      managed-settings key flows through the real adapter and is captured on
 *      the next `--update` with ZERO code change here — the tool never needs a
 *      per-policy edit, only when the architecture itself changes.
 *
 * Usage:
 *   node src/validate.mjs            # assert mode (CI). Exits non-zero on drift.
 *   node src/validate.mjs --update   # regenerate examples/snapshots.json.
 *
 * Requires Code OSS to be built (needs out/…/managedSettings.js). Run from the
 * repo with `npm run test-copilot-api-mock`.
 */

import assert from 'node:assert';
import { writeFileSync } from 'node:fs';
import { buildEntitlements, buildToken } from './responses.mjs';
import { loadAdaptManagedSettings } from './adapter.mjs';
import { SNAPSHOTS_FILE, listExamples, loadExample, loadSnapshots } from './examples.mjs';

const UPDATE = process.argv.includes('--update');

/** Mirrors core's `extractFromToken`: fields are `key=value;…` before the first `:`. */
function parseTokenString(token) {
	const map = new Map();
	for (const field of token.split(':')[0].split(';')) {
		const [key, value] = field.split('=');
		map.set(key, value);
	}
	return map;
}

/** JSON round-trip so `undefined`-valued keys compare equal to absent keys. */
const normalize = value => JSON.parse(JSON.stringify(value ?? null));

async function main() {
	const adapter = await loadAdaptManagedSettings();
	if (!adapter.available) {
		console.error(`\n  ✗ cannot validate: ${adapter.reason}\n`);
		process.exit(1);
	}

	const rows = [];
	let failures = 0;

	// --- 1. Architecture checks (payload-independent) ------------------------
	{
		/** @type {string[]} */
		const problems = [];
		if (typeof buildEntitlements().chat_enabled !== 'boolean') {
			problems.push('entitlements.chat_enabled is not a boolean (the gate)');
		}
		const tokenFields = parseTokenString(buildToken().token);
		for (const key of ['agent_mode', 'mcp', 'editor_preview_features']) {
			if (typeof tokenFields.get(key) !== 'string') {
				problems.push(`token string missing core-read flag "${key}"`);
			}
		}
		failures += problems.length ? 1 : 0;
		rows.push({ name: 'architecture (gate + token string)', ok: problems.length === 0, problems });
	}

	// --- 2. Example snapshot (through core's REAL adapter) -------------------
	const previous = loadSnapshots();
	/** @type {Record<string, { adapted: unknown; warnings: number }>} */
	const snapshot = {};

	for (const name of listExamples()) {
		/** @type {string[]} */
		const problems = [];
		const warns = [];
		const adapted = normalize(adapter.adapt(loadExample(name), m => warns.push(m)));
		snapshot[name] = { adapted, warnings: warns.length };

		if (!UPDATE) {
			const expected = previous[name];
			if (!expected) {
				problems.push('no snapshot — run: npm run test-copilot-api-mock -- --update');
			} else {
				try {
					assert.deepStrictEqual(adapted, expected.adapted);
				} catch {
					problems.push('adapted output != snapshot (core drift? re-run with --update if intended)');
				}
				if (warns.length !== expected.warnings) {
					problems.push(`warnings ${warns.length} != snapshot ${expected.warnings}`);
				}
			}
		}
		failures += problems.length ? 1 : 0;
		rows.push({ name, ok: problems.length === 0, problems });
	}

	if (UPDATE) {
		writeFileSync(SNAPSHOTS_FILE, JSON.stringify(snapshot, null, '\t') + '\n');
	}

	// --- report --------------------------------------------------------------
	console.log('');
	for (const row of rows) {
		console.log(`  ${row.ok ? '✓' : '✗'} ${row.name}`);
		for (const p of row.problems) {
			console.log(`      - ${p}`);
		}
	}
	console.log('');

	if (UPDATE) {
		console.log(`  wrote examples/snapshots.json (${Object.keys(snapshot).length} examples).\n`);
		process.exit(0);
	}
	if (failures) {
		console.error(`  ${failures} check(s) failed.\n`);
		process.exit(1);
	}
	console.log(`  all checks passed (examples validated against core's real adaptManagedSettings).\n`);
}

main();
