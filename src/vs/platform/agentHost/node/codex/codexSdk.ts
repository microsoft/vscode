/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import { dirname, join } from '../../../../base/common/path.js';
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
 * Returns the path of the native Codex binary for `sdkTarget` (see {@link codexPackageSuffix}) and
 * its `triple` (see {@link codexBinaryTriple}) under `sdkRoot`, the folder that contains the
 * `node_modules` with `@openai/codex`.
 *
 * The platform package `@openai/codex-${sdkTarget}` is an optional dependency of `@openai/codex`.
 * The downloaded product SDK and a flat `node_modules` (npm, or pnpm's hoisted layout) put it next
 * to `@openai/codex` in `sdkRoot/node_modules`. A symlinked `node_modules` (pnpm's isolated layout)
 * only puts it next to the real folder of `@openai/codex`, which is where this falls back to.
 * When neither folder has the binary, returns the path in `sdkRoot/node_modules`, so that callers
 * report that path.
 */
export async function resolveCodexBinaryPath(sdkRoot: string, sdkTarget: string, triple: string, platform: NodeJS.Platform = process.platform): Promise<string> {
	const binaryName = platform === 'win32' ? 'codex.exe' : 'codex';
	const scopeDir = join(sdkRoot, 'node_modules', '@openai');
	const candidates = [scopeDir];
	try {
		const realScopeDir = dirname(await fs.realpath(join(scopeDir, 'codex')));
		if (realScopeDir !== scopeDir) {
			candidates.push(realScopeDir);
		}
	} catch {
		// No `@openai/codex` next to the platform package (for example a downloaded SDK that only
		// has the platform package).
	}
	const paths = candidates.map(dir => join(dir, `codex-${sdkTarget}`, 'vendor', triple, 'bin', binaryName));
	for (const path of paths) {
		try {
			// The real path: in pnpm's isolated layout the platform package folder is a link, and
			// Codex's macOS sandbox can't read the link when its file helper starts the binary again.
			return await fs.realpath(path);
		} catch {
			// Try the next folder.
		}
	}
	return paths[0];
}

/**
 * Locate the SDK root for the dev (running-from-source) fallback by resolving
 * `@openai/codex` — a devDependency in source checkouts — out of this repo's
 * `node_modules`. Returns the directory that *contains* that `node_modules`
 * (the `sdkRoot` of {@link resolveCodexBinaryPath}), or undefined when the package can't be resolved (e.g. a built product
 * where it isn't shipped). `@openai/codex` declares no `exports` map, so its
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
