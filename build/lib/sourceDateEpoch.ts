/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as path from 'path';

let cached: number | undefined;

// Resolves the value to use for SOURCE_DATE_EPOCH (https://reproducible-builds.org/specs/source-date-epoch/).
// Returns seconds-since-epoch of the current HEAD commit, falling back to the current time.
export function getSourceDateEpoch(): number {
	if (cached !== undefined) {
		return cached;
	}
	const envValue = process.env['SOURCE_DATE_EPOCH'];
	if (envValue && /^\d+$/.test(envValue)) {
		cached = parseInt(envValue, 10);
		return cached;
	}
	try {
		const cwd = path.dirname(path.dirname(import.meta.dirname));
		const out = cp.execSync('git log -1 --pretty=%ct', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
		const parsed = parseInt(out, 10);
		if (Number.isFinite(parsed)) {
			cached = parsed;
			return cached;
		}
	} catch {
		// fall through to wall-clock fallback
	}
	cached = Math.floor(Date.now() / 1000);
	return cached;
}

export function getSourceDate(): Date {
	return new Date(getSourceDateEpoch() * 1000);
}
