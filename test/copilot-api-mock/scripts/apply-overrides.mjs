/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Redirects Code OSS's four Copilot endpoints at the local mock by writing the
 * repo-root `product.overrides.json` (gitignored; merged over `product.json`
 * when `VSCODE_DEV` is set).
 *
 * `product.overrides.json` is shallow-`Object.assign`'d over `product.json`, so
 * overriding `defaultChatAgent` REPLACES the whole object. We therefore read the
 * complete `defaultChatAgent` from `product.json` and patch only the four URLs,
 * preserving every other field.
 *
 * Non-destructive: the previous `product.overrides.json` (if any) is backed up
 * to `.overrides-backup.json`; run `revert-overrides.mjs` to restore it.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const toolDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(toolDir, '..', '..');
const productPath = join(repoRoot, 'product.json');
const overridesPath = join(repoRoot, 'product.overrides.json');
const backupPath = join(toolDir, '.overrides-backup.json');

const portArgIndex = process.argv.indexOf('--port');
const PORT = Number(portArgIndex !== -1 ? process.argv[portArgIndex + 1] : (process.env.PORT ?? 3000));
const base = `http://localhost:${PORT}`;

const product = JSON.parse(readFileSync(productPath, 'utf8'));
if (!product.defaultChatAgent) {
	console.error('[apply-overrides] product.json has no defaultChatAgent; nothing to override.');
	process.exit(1);
}

const defaultChatAgent = {
	...product.defaultChatAgent,
	entitlementUrl: `${base}/copilot_internal/user`,
	tokenEntitlementUrl: `${base}/copilot_internal/v2/token`,
	mcpRegistryDataUrl: `${base}/copilot/mcp_registry`,
	managedSettingsUrl: `${base}/copilot_internal/managed_settings`,
};

const currentRaw = existsSync(overridesPath) ? readFileSync(overridesPath, 'utf8') : null;
const current = currentRaw !== null ? JSON.parse(currentRaw) : null;

// Back up the pre-existing overrides exactly once (raw bytes, so revert is
// byte-for-byte), so repeated applies don't clobber the original backup.
if (!existsSync(backupPath)) {
	writeFileSync(backupPath, JSON.stringify({ existed: currentRaw !== null, raw: currentRaw }, null, 2) + '\n');
}

const merged = { ...(current ?? {}), defaultChatAgent };
writeFileSync(overridesPath, JSON.stringify(merged, null, '\t') + '\n');

console.log(`[apply-overrides] product.overrides.json -> ${base}`);
console.log('[apply-overrides] launch Code OSS with the mock auth provider:');
console.log('');
console.log('  ./scripts/code.sh \\');
console.log('    --disable-extension vscode.github-authentication \\');
console.log(`    --extensionDevelopmentPath="${join(toolDir, 'auth-extension')}"`);
console.log('');
console.log('[apply-overrides] revert with: node scripts/revert-overrides.mjs');
