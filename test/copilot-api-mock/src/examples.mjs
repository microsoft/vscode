/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Example `managed_settings` payloads.
 *
 * Each `examples/<name>.json` is a REAL `.github/copilot/settings.json` payload —
 * the artifact an enterprise admin actually authors — with no test scaffolding
 * wrapped around it. They are starting points you load into the inspector's
 * editor; the editable payload (not the example) is the primary input.
 *
 * Files beginning with `_` (e.g. `_meta.json`) and the generated `snapshots.json`
 * are NOT examples.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');
export const SNAPSHOTS_FILE = join(EXAMPLES_DIR, 'snapshots.json');

/** A file is an example payload iff it's `*.json`, not `_`-prefixed, and not the snapshot. */
function isExampleFile(file) {
	return file.endsWith('.json') && !file.startsWith('_') && file !== 'snapshots.json';
}

/**
 * Lists the available example names.
 * @returns {string[]}
 */
export function listExamples() {
	return readdirSync(EXAMPLES_DIR)
		.filter(isExampleFile)
		.map(f => f.replace(/\.json$/, ''))
		.sort();
}

/**
 * Loads an example's `managed_settings` payload by name. Throws if missing.
 * @param {string} name
 * @returns {object}
 */
export function loadExample(name) {
	return JSON.parse(readFileSync(join(EXAMPLES_DIR, `${name}.json`), 'utf8'));
}

/**
 * Loads the optional `_meta.json` description manifest (name → one-line blurb).
 * @returns {Record<string, string>}
 */
export function loadMeta() {
	try {
		return JSON.parse(readFileSync(join(EXAMPLES_DIR, '_meta.json'), 'utf8'));
	} catch {
		return {};
	}
}

/**
 * Loads the committed CI snapshot (name → { adapted, warnings }), or `{}`.
 * @returns {Record<string, { adapted: unknown; warnings: number }>}
 */
export function loadSnapshots() {
	if (!existsSync(SNAPSHOTS_FILE)) {
		return {};
	}
	return JSON.parse(readFileSync(SNAPSHOTS_FILE, 'utf8'));
}
