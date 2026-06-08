/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Loads the REAL, compiled `adaptManagedSettings` from Code OSS core
 * (`out/…/managedSettings.js`). Shared by the dev web app (`/__adapted`
 * preview) and the CI validator (`validate.mjs`).
 *
 * Importing core's own adapter — rather than re-implementing it here — is the
 * whole point: the dev sees exactly what the workbench will compute, and CI
 * fails if the examples ever drift from core's behaviour.
 *
 * Degrades gracefully: if `out/` is missing (core not built), returns
 * `{ available: false, reason }` instead of throwing, so the web app still
 * starts. The CI validator treats unavailability as a hard error.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Compiled location of `src/vs/workbench/services/accounts/browser/managedSettings.ts`. */
export const compiledAdapterPath = join(
	here, '..', '..', '..',
	'out', 'vs', 'workbench', 'services', 'accounts', 'browser', 'managedSettings.js'
);

/** @type {{ available: boolean; reason?: string; adapt?: (response: object, onWarn?: (m: string) => void) => object } | undefined} */
let cached;

/**
 * @returns {Promise<{ available: boolean; reason?: string; adapt?: (response: object, onWarn?: (m: string) => void) => object }>}
 */
export async function loadAdaptManagedSettings() {
	if (cached) {
		return cached;
	}
	if (!existsSync(compiledAdapterPath)) {
		cached = {
			available: false,
			reason: `compiled core not found at ${compiledAdapterPath} — build Code OSS first (the adapter lives in out/).`,
		};
		return cached;
	}
	try {
		const mod = await import(pathToFileURL(compiledAdapterPath).href);
		if (typeof mod.adaptManagedSettings !== 'function') {
			cached = { available: false, reason: 'out/…/managedSettings.js did not export adaptManagedSettings (core changed?).' };
		} else {
			cached = { available: true, adapt: mod.adaptManagedSettings };
		}
	} catch (err) {
		cached = { available: false, reason: String((err && /** @type {Error} */(err).message) || err) };
	}
	return cached;
}
