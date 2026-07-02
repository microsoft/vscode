/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

// Some dependencies ship their native binary as a per-platform *optional*
// dependency of a small launcher package (e.g. `@openai/codex` is only a
// launcher shim; the real binary lives in `@openai/codex-<platform>-<arch>`).
// `npm install` / `npm ci` do NOT fail when an optional dependency cannot be
// installed, so a transient hiccup can leave the launcher package present while
// the platform binary is missing. That broken tree then gets frozen into the
// node_modules cache and served to every consumer, failing far away from the
// cause (see https://github.com/microsoft/vscode/pull/323881).
//
// This check runs after `npm ci` when building a node_modules cache and fails
// the job when a required native binary is missing, so a poisoned cache is
// never saved.

const ROOT = path.join(import.meta.dirname, '../../../');

interface NativeOptionalDep {
	/** Launcher package that is always installed; the check is skipped when it is absent. */
	readonly basePackage: string;
	/** Per-platform package (an optional dependency of `basePackage`) that carries the binary. */
	readonly platformPackage: string;
	/** Binary file name expected under `<platformPackage>/vendor/<triple>/bin/`. */
	readonly binaryName: string;
}

function nativeOptionalDeps(platform: string, arch: string): NativeOptionalDep[] {
	const deps: NativeOptionalDep[] = [];

	// @openai/codex — the launcher shim resolves `@openai/codex-<platform>-<arch>`
	// at runtime and execs its bundled `vendor/<triple>/bin/codex` binary.
	if ((platform === 'linux' || platform === 'darwin' || platform === 'win32') && (arch === 'x64' || arch === 'arm64')) {
		deps.push({
			basePackage: '@openai/codex',
			platformPackage: `@openai/codex-${platform}-${arch}`,
			binaryName: platform === 'win32' ? 'codex.exe' : 'codex',
		});
	}

	return deps;
}

function hasBinary(platformPackage: string, binaryName: string): boolean {
	// The rust target triple under `vendor/` differs per platform, so match any.
	const vendorDir = path.join(ROOT, 'node_modules', platformPackage, 'vendor');
	try {
		return fs.readdirSync(vendorDir).some(triple => fs.existsSync(path.join(vendorDir, triple, 'bin', binaryName)));
	} catch {
		return false;
	}
}

const errors: string[] = [];
for (const dep of nativeOptionalDeps(process.platform, process.arch)) {
	// Only enforce when the launcher package is installed; if it is not, the
	// dependency simply was not requested here and there is nothing to verify.
	if (!fs.existsSync(path.join(ROOT, 'node_modules', dep.basePackage))) {
		continue;
	}
	if (!hasBinary(dep.platformPackage, dep.binaryName)) {
		errors.push(`${dep.basePackage}: native binary '${dep.binaryName}' missing under node_modules/${dep.platformPackage}/vendor/*/bin/ — the optional dependency was silently skipped during install`);
	}
}

if (errors.length > 0) {
	console.error('\x1b[1;31m*** Missing native optional-dependency binaries — refusing to save a poisoned node_modules cache ***\x1b[0m');
	for (const err of errors) {
		console.error(`  - ${err}`);
	}
	console.error('\nnpm does not fail when an optional dependency cannot be installed, so this tree would poison the shared node_modules cache. Re-run a fresh `npm ci` (e.g. after bumping build/.cachesalt) to restore the binary before the cache is saved.');
	process.exit(1);
}

console.log(`Verified native optional-dependency binaries for ${process.platform}-${process.arch}.`);
