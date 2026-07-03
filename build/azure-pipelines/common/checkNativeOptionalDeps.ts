/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

// Some dependencies ship their native binary in a per-platform package that is
// declared as an *optional* dependency of a small base package — e.g.
// `@openai/codex` and `@anthropic-ai/claude-agent-sdk` are thin launchers and
// the real binaries live in `@openai/codex-<platform>-<arch>` /
// `@anthropic-ai/claude-agent-sdk-<platform>-<arch>`. `npm install` / `npm ci`
// do NOT fail when an optional dependency cannot be installed, so a transient
// hiccup can leave the base package present while the per-platform package is
// missing. That broken tree then gets frozen into the node_modules cache and
// served to every consumer, failing far away from the cause
// (see https://github.com/microsoft/vscode/pull/323881).
//
// This check runs after `npm ci` when building a node_modules cache and fails
// the job when a required per-platform package is missing, so a poisoned cache
// is never saved.

const ROOT = path.join(import.meta.dirname, '../../../');

// Base packages whose per-platform package (`<base>-<platform>-<arch>`) is
// required whenever the base package itself is installed.
const NATIVE_OPTIONAL_DEP_BASE_PACKAGES = [
	'@openai/codex',
	'@anthropic-ai/claude-agent-sdk',
];

// Platform/arch combinations these packages publish a per-platform package for.
const SUPPORTED_PLATFORMS = new Set(['linux', 'darwin', 'win32']);
const SUPPORTED_ARCHS = new Set(['x64', 'arm64']);

function isInstalled(pkg: string): boolean {
	return fs.existsSync(path.join(ROOT, 'node_modules', pkg));
}

const { platform, arch } = process;

if (!SUPPORTED_PLATFORMS.has(platform) || !SUPPORTED_ARCHS.has(arch)) {
	console.log(`Skipping native optional-dependency check on unsupported ${platform}-${arch}.`);
	process.exit(0);
}

const errors: string[] = [];
for (const basePackage of NATIVE_OPTIONAL_DEP_BASE_PACKAGES) {
	// Only enforce when the base package is installed; if it is not, the
	// dependency simply was not requested here and there is nothing to verify.
	if (!isInstalled(basePackage)) {
		continue;
	}
	// The glibc Linux package (no `-musl` suffix) is the one required on the
	// glibc-based CI hosts; the naming is always `<base>-<platform>-<arch>`.
	const platformPackage = `${basePackage}-${platform}-${arch}`;
	if (!isInstalled(platformPackage)) {
		errors.push(`${basePackage}: required per-platform package '${platformPackage}' is missing from node_modules — the optional dependency was silently skipped during install`);
	}
}

if (errors.length > 0) {
	console.error('\x1b[1;31m*** Missing native optional-dependency packages — refusing to save a poisoned node_modules cache ***\x1b[0m');
	for (const err of errors) {
		console.error(`  - ${err}`);
	}
	console.error('\nnpm does not fail when an optional dependency cannot be installed, so this tree would poison the shared node_modules cache. Re-run a fresh `npm ci` (e.g. after bumping build/.cachesalt) to restore the package before the cache is saved.');
	process.exit(1);
}

console.log(`Verified native optional-dependency packages for ${platform}-${arch}.`);
