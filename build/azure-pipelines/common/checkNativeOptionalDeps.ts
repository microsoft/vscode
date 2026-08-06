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
// missing (see https://github.com/microsoft/vscode/pull/323881).
//
// `findMissingNativeOptionalDep` is the reusable primitive that detects this.
// It is used from two places:
//   - The CLI entry point below runs after restoring or installing the root
//     node_modules in CI and fails the job so a poisoned cache is neither used
//     nor saved.
//   - The agent-SDK producer (build/agent-sdk/package.ts) runs it after its
//     scratch `npm ci` so a binary-less tarball is never built and uploaded to
//     the CDN.

/**
 * Returns the name of the required per-platform package that is missing from
 * `nodeModulesDir`, or `undefined` when nothing is wrong.
 *
 * A base package (e.g. `@openai/codex`) ships its native binary in a
 * per-platform optional dependency named `<base>-<target>` (e.g.
 * `@openai/codex-linux-x64`, `@anthropic-ai/claude-agent-sdk-linux-x64-musl`).
 * npm does not fail when an optional dependency cannot be installed, so this
 * detects a base package that ended up installed without its matching native
 * package.
 *
 * `target` is the `<platform>-<arch>[-<libc>]` suffix — e.g. `darwin-arm64`,
 * `linux-x64`, `linux-x64-musl`.
 *
 * Only enforced when the base package itself is installed; if it is not, the
 * dependency simply was not requested here and there is nothing to verify.
 */
export function findMissingNativeOptionalDep(nodeModulesDir: string, basePackage: string, target: string): string | undefined {
	if (!fs.existsSync(path.join(nodeModulesDir, basePackage))) {
		return undefined;
	}
	const platformPackage = `${basePackage}-${target}`;
	if (!fs.existsSync(path.join(nodeModulesDir, platformPackage))) {
		return platformPackage;
	}
	return undefined;
}

// #region CLI entry point
//
// Runs after the root node_modules is restored or installed in CI. Verifies
// the repo-root node_modules has the per-platform package for the machine
// running the install, so a silently incomplete install (base package present,
// native package skipped) is neither used nor persisted in the cache.
//
// This deliberately checks the HOST platform/arch, never the build target. The
// pipelines set `npm_config_arch`, but that only steers node-gyp/prebuild
// downloads — it does NOT drive npm's `os`/`cpu` optional-dependency
// filtering. On a cross-architecture job (e.g. Windows arm64 built on an x64
// agent) npm therefore installs the HOST's per-platform package, and asserting
// on the target's would fail every such job. The per-target binaries that
// actually ship are produced separately by `build/agent-sdk/package.ts`, which
// installs into a scratch dir with `npm_config_os`/`npm_config_cpu` set and
// validates the result via `findMissingNativeOptionalDep` below.

// Base packages whose per-platform package (`<base>-<platform>-<arch>`) is
// required whenever the base package itself is installed.
const NATIVE_OPTIONAL_DEP_BASE_PACKAGES = [
	'@openai/codex',
	'@anthropic-ai/claude-agent-sdk',
];

// Platform/arch combinations these packages publish a per-platform package for.
const SUPPORTED_PLATFORMS = new Set(['linux', 'darwin', 'win32']);
const SUPPORTED_ARCHS = new Set(['x64', 'arm64']);

function isCliInvocation(): boolean {
	// `import.meta.filename` is already a real filesystem path; comparing it
	// directly to `process.argv[1]` works on Windows too. Matches the pattern
	// in `build/agent-sdk/package.ts` and `build/npm/installStateHash.ts`.
	return import.meta.filename === process.argv[1];
}

function main(): void {
	const platform = process.platform;
	const arch = process.arch;
	if (!SUPPORTED_PLATFORMS.has(platform) || !SUPPORTED_ARCHS.has(arch)) {
		console.log(`Skipping native optional-dependency check on unsupported ${platform}-${arch}.`);
		return;
	}

	const nodeModulesDir = path.join(import.meta.dirname, '../../../', 'node_modules');
	const target = `${platform}-${arch}`;
	const errors: string[] = [];
	for (const basePackage of NATIVE_OPTIONAL_DEP_BASE_PACKAGES) {
		const missing = findMissingNativeOptionalDep(nodeModulesDir, basePackage, target);
		if (missing) {
			errors.push(`${basePackage}: required per-platform package '${missing}' is missing from node_modules — the optional dependency was silently skipped during install`);
		}
	}

	if (errors.length > 0) {
		console.error('\x1b[1;31m*** Missing native optional-dependency packages in node_modules ***\x1b[0m');
		for (const err of errors) {
			console.error(`  - ${err}`);
		}
		console.error('\nnpm does not fail when an optional dependency cannot be installed, so a fresh install or restored cache can be incomplete. Re-run a fresh `npm ci` (e.g. after bumping build/.cachesalt) to restore the missing package.');
		process.exit(1);
	}

	console.log(`Verified native optional-dependency packages for ${platform}-${arch}.`);
}

if (isCliInvocation()) {
	main();
}

// #endregion
