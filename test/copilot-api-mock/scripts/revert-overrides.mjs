/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Restores `product.overrides.json` to whatever it was before
 * `apply-overrides.mjs` ran (deleting it if it did not previously exist), then
 * removes the backup. Safe to run repeatedly.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const toolDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(toolDir, '..', '..');
const overridesPath = join(repoRoot, 'product.overrides.json');
const backupPath = join(toolDir, '.overrides-backup.json');

if (!existsSync(backupPath)) {
	console.log('[revert-overrides] no backup found; nothing to revert.');
	process.exit(0);
}

const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
if (backup.existed) {
	writeFileSync(overridesPath, backup.raw);
	console.log('[revert-overrides] restored the previous product.overrides.json');
} else if (existsSync(overridesPath)) {
	rmSync(overridesPath);
	console.log('[revert-overrides] removed product.overrides.json (did not exist before)');
}

rmSync(backupPath);
console.log('[revert-overrides] done.');
