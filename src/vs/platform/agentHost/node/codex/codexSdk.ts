/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
 * Locate the SDK root for the dev (running-from-source) fallback by resolving
 * `@openai/codex` — a devDependency in source checkouts — out of this repo's
 * `node_modules`. Returns the directory that *contains* that `node_modules`
 * (i.e. the value `_startConnection` joins `node_modules/@openai/codex-<target>`
 * onto), or undefined when the package can't be resolved (e.g. a built product
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

/**
 * Locates the executable Codex native binary within an SDK root directory.
 * Supports hoisted, nested, global npm, pnpm, and direct vendor/bin layouts.
 *
 * @param root The directory containing the Codex package, node_modules, or binary.
 * @param platform Target platform (defaults to process.platform).
 * @param arch Target architecture (defaults to process.arch).
 * @param accessFn Optional seam for testing file accessibility without disk I/O.
 * @returns The absolute path to the executable binary, or undefined if not found.
 */
export async function findCodexBinaryPath(
	root: string,
	platform: NodeJS.Platform = process.platform,
	arch: string = process.arch,
	accessFn?: (path: string) => Promise<boolean>,
): Promise<string | undefined> {
	const target = codexPackageSuffix(platform, arch);
	if (!target) {
		return undefined;
	}
	const triple = codexBinaryTriple(target);
	if (!triple) {
		return undefined;
	}
	const binaryName = platform === 'win32' ? 'codex.exe' : 'codex';
	const canExecute = accessFn ?? (async (candidate: string) => {
		try {
			const fs = await import('node:fs/promises');
			await fs.access(candidate, (fs.constants?.X_OK ?? 1));
			return true;
		} catch {
			return false;
		}
	});

	// Candidate paths to check in order:
	const candidates: string[] = [
		// 1. Hoisted node_modules: <root>/node_modules/@openai/codex-<target>/vendor/<triple>/bin/codex
		join(root, 'node_modules', '@openai', `codex-${target}`, 'vendor', triple, 'bin', binaryName),
		// 2. Nested node_modules (e.g. npm global install): <root>/node_modules/@openai/codex/node_modules/@openai/codex-<target>/vendor/<triple>/bin/codex
		join(root, 'node_modules', '@openai', 'codex', 'node_modules', '@openai', `codex-${target}`, 'vendor', triple, 'bin', binaryName),
		// 3. Sibling platform package if root points at @openai/codex directly: <root>/../codex-<target>/vendor/<triple>/bin/codex
		join(root, '..', `codex-${target}`, 'vendor', triple, 'bin', binaryName),
		// 4. Nested inside @openai/codex if root points at @openai/codex directly: <root>/node_modules/@openai/codex-<target>/vendor/<triple>/bin/codex
		join(root, 'node_modules', '@openai', `codex-${target}`, 'vendor', triple, 'bin', binaryName),
		// 5. Directly under @openai: <root>/@openai/codex-<target>/vendor/<triple>/bin/codex
		join(root, '@openai', `codex-${target}`, 'vendor', triple, 'bin', binaryName),
		// 6. Direct vendor layout (e.g. within platform package or standalone): <root>/vendor/<triple>/bin/codex
		join(root, 'vendor', triple, 'bin', binaryName),
		// 7. Direct bin directory: <root>/bin/codex
		join(root, 'bin', binaryName),
		// 8. Binary directly in root: <root>/codex
		join(root, binaryName),
	];

	for (const candidate of candidates) {
		if (await canExecute(candidate)) {
			return candidate;
		}
	}

	// Dynamic resolution attempt via createRequire if available
	try {
		const { createRequire } = await import('node:module');
		const requireRoots = [
			join(root, 'node_modules', '@openai', 'codex', 'package.json'),
			join(root, 'package.json'),
		];
		for (const reqRoot of requireRoots) {
			try {
				const req = createRequire(reqRoot);
				const pkgJson = req.resolve(`@openai/codex-${target}/package.json`);
				const candidate = join(dirname(pkgJson), 'vendor', triple, 'bin', binaryName);
				if (await canExecute(candidate)) {
					return candidate;
				}
			} catch {
				// Continue to next candidate
			}
		}
	} catch {
		// Ignore dynamic import failure in non-node test environments
	}

	return undefined;
}
