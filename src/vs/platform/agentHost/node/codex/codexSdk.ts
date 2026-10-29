/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { dirname, join } from '../../../../base/common/path.js';
import { hasKey } from '../../../../base/common/types.js';
import { AgentHostCodexAgentSdkRootEnvVar } from '../../common/agentService.js';
import type { IAgentSdkPackage } from '../agentSdkDownloader.js';

export const CodexSdkPackage: IAgentSdkPackage = {
	id: 'codex',
	displayName: 'Codex',
	devOverrideEnvVar: AgentHostCodexAgentSdkRootEnvVar,
	hasSeparateMuslLinuxPackage: false,
};

/**
 * The suffix Codex uses for its platform `optionalDependencies` packages
 * (`@openai/codex-${suffix}`). Codex's Linux binaries are statically
 * musl-linked and ship under the same `linux-<arch>` package regardless of
 * host libc, so this never returns a `-musl` suffix.
 *
 * Returns undefined for unsupported `(platform, arch)` combinations — the
 * caller surfaces the error.
 */
export function codexPackageSuffix(platform: NodeJS.Platform, arch: string): string | undefined {
	if ((platform !== 'linux' && platform !== 'darwin' && platform !== 'win32') ||
		(arch !== 'x64' && arch !== 'arm64')) {
		return undefined;
	}
	return `${platform}-${arch}`;
}

/**
 * Mirrors the triple table inside `@openai/codex/bin/codex.js` so we can spawn
 * the native binary at `vendor/<triple>/bin/codex` directly without going
 * through the JS shim launcher.
 */
export function codexBinaryTriple(sdkTarget: string): string | undefined {
	switch (sdkTarget) {
		case 'linux-x64': return 'x86_64-unknown-linux-musl';
		case 'linux-arm64': return 'aarch64-unknown-linux-musl';
		case 'darwin-x64': return 'x86_64-apple-darwin';
		case 'darwin-arm64': return 'aarch64-apple-darwin';
		case 'win32-x64': return 'x86_64-pc-windows-msvc';
		case 'win32-arm64': return 'aarch64-pc-windows-msvc';
		default: return undefined;
	}
}

/**
 * Resolve platform dependencies from the selected Codex package, including
 * installs where they aren't hoisted to the SDK root. Like the Codex CLI,
 * fall back to the main package's vendor directory when the platform package
 * can't be found.
 */
export async function resolveCodexBinaryPath(sdkRoot: string, sdkTarget: string): Promise<string> {
	const triple = codexBinaryTriple(sdkTarget);
	if (!triple) {
		throw new Error(`Codex: no binary triple known for sdkTarget '${sdkTarget}'`);
	}

	// The renderer test harness maps unprefixed Node builtins through its import map.
	const { createRequire } = await import('module');
	const packageJsonPath = await fs.promises.realpath(join(sdkRoot, 'node_modules', '@openai', 'codex', 'package.json'));
	let vendorRoot: string;
	try {
		const platformPackageJsonPath = createRequire(packageJsonPath).resolve(`@openai/codex-${sdkTarget}/package.json`);
		vendorRoot = join(dirname(platformPackageJsonPath), 'vendor');
	} catch (error) {
		if (!error || typeof error !== 'object' || !hasKey(error, { code: true }) || error.code !== 'MODULE_NOT_FOUND') {
			throw error;
		}
		vendorRoot = join(dirname(packageJsonPath), 'vendor');
	}

	const binaryName = sdkTarget.startsWith('win32-') ? 'codex.exe' : 'codex';
	const binaryPath = join(vendorRoot, triple, 'bin', binaryName);
	try {
		await fs.promises.access(binaryPath, fs.constants.X_OK);
	} catch (err) {
		throw new Error(`Codex binary not executable: ${binaryPath} (${err instanceof Error ? err.message : String(err)})`);
	}
	return binaryPath;
}

/**
 * Locate the SDK root for the dev (running-from-source) fallback by resolving
 * `@openai/codex` — a devDependency in source checkouts — out of this repo's
 * `node_modules`. Returns the directory that *contains* that `node_modules`
 * (i.e. the root passed to `resolveCodexBinaryPath`), or undefined when the
 * package can't be resolved (e.g. a built product where it isn't shipped).
 * `@openai/codex` declares no `exports` map, so its
 * `package.json` is resolvable.
 *
 * `resolvePackageJsonPath` is a seam for tests; production resolves the path
 * via {@link defaultResolveCodexPackageJsonPath}.
 */
export async function resolveCodexDevSdkRoot(
	resolvePackageJsonPath: () => string | Promise<string> = defaultResolveCodexPackageJsonPath,
): Promise<string | undefined> {
	try {
		const pkgJson = await resolvePackageJsonPath();
		// <root>/node_modules/@openai/codex/package.json → <root>
		return dirname(dirname(dirname(dirname(pkgJson))));
	} catch {
		return undefined;
	}
}

async function defaultResolveCodexPackageJsonPath(): Promise<string> {
	// Dynamic import of `node:module` (not a static top-level import): the
	// unit-test electron renderer that loads this module for
	// `codexPackagePaths.test` cannot fetch a static `node:module` import, so
	// the sibling WSL/SSH host services resolve `createRequire` the same way
	// for the same reason.
	const { createRequire } = await import('node:module');
	return createRequire(import.meta.url).resolve('@openai/codex/package.json');
}
