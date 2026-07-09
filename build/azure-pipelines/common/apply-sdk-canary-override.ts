/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

/**
 * Stage 3 of the Copilot SDK -> VS Code integration pipeline.
 * See microsoft/vscode-engineering specs/sdk-vscode-integration.spec.md.
 *
 * Overrides the `@github/copilot-sdk` and/or `@github/copilot` dependency in the
 * root and `remote` manifests to a canary version published to the private npm
 * feed, then refreshes the lockfiles so `npm ci` stays consistent (and the
 * node_modules cache key, derived from these manifests + lockfiles, naturally
 * misses).
 *
 * Driven by environment variables so it is a no-op in normal builds:
 *   VSCODE_SDK_CANARY_VERSION - version to pin `@github/copilot-sdk` to (empty =
 *                               no override / normal build)
 *   VSCODE_CLI_CANARY_VERSION - version to pin `@github/copilot` to. When empty
 *                               (and an SDK version is set) the CLI version is
 *                               inferred from the SDK's own `@github/copilot`
 *                               dependency so the two stay compatible. When set
 *                               explicitly, it is validated against that same
 *                               dependency range and the build fails fast on a
 *                               confirmed incompatible SDK/CLI pair.
 *
 * npm registry + auth must already be configured in the ambient environment
 * (the orchestrator authenticates to the private feed before invoking this).
 */

const ROOT = path.join(import.meta.dirname, '../../../');

/**
 * On Windows `npm` is a `.cmd` shim. Two things matter:
 *   1. The explicit `.cmd` suffix — Node won't resolve it via PATHEXT for `execFile`.
 *   2. `shell: true` — since Node 20 (CVE-2024-27980) `child_process` refuses to
 *      spawn a `.cmd`/`.bat` without it.
 */
const IS_WINDOWS = process.platform === 'win32';
const NPM = IS_WINDOWS ? 'npm.cmd' : 'npm';

/**
 * Allowlist for npm version / range specifiers before they are interpolated
 * into `npm view <pkg>@<spec>` argument strings. These specs come from
 * queue-time pipeline parameters and from registry responses, and on Windows
 * the npm calls run with `shell: true` — so restrict to the characters that
 * appear in valid semver versions, ranges and dist-tags and reject anything a
 * shell could otherwise interpret.
 */
const SAFE_SPEC = /^[\w.+~^><=|* -]+$/;

function assertSafeSpec(label: string, value: string): void {
	if (!SAFE_SPEC.test(value)) {
		throw new Error(`[canary-override] Refusing unsafe ${label} "${value}": only semver versions, ranges and dist-tags are allowed.`);
	}
}

/** Manifests that declare the Copilot dependencies. */
const TARGET_DIRS = ['', 'remote'];

interface Override {
	readonly name: string;
	readonly version: string;
}

/**
 * Infers the `@github/copilot` version to use from the SDK canary's own
 * `@github/copilot` dependency range, resolved to a concrete published version.
 * Returns undefined (leaving VS Code's pinned CLI) if the SDK declares no such
 * dependency or resolution fails — inference is best-effort, never fatal.
 */
function inferCliVersion(sdkVersion: string): string | undefined {
	try {
		const depsRaw = execFileSync(NPM, ['view', `@github/copilot-sdk@${sdkVersion}`, 'dependencies', '--json'], { encoding: 'utf8', shell: IS_WINDOWS });
		const deps = JSON.parse(depsRaw || '{}');
		const range = deps['@github/copilot'];
		if (!range) {
			console.log(`[canary-override] SDK ${sdkVersion} declares no @github/copilot dependency — leaving VS Code's pinned CLI.`);
			return undefined;
		}
		assertSafeSpec('inferred @github/copilot range', range);
		const versionRaw = execFileSync(NPM, ['view', `@github/copilot@${range}`, 'version', '--json'], { encoding: 'utf8', shell: IS_WINDOWS });
		const parsed = JSON.parse(versionRaw);
		const resolved = Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed;
		if (typeof resolved !== 'string') {
			console.warn(`[canary-override] Could not resolve @github/copilot@${range} to a concrete version — leaving VS Code's pinned CLI.`);
			return undefined;
		}
		console.log(`[canary-override] Inferred @github/copilot ${resolved} from @github/copilot-sdk@${sdkVersion} (range ${range}).`);
		return resolved;
	} catch (err) {
		console.warn(`[canary-override] Failed to infer @github/copilot from SDK ${sdkVersion}: ${err instanceof Error ? err.message : err}. Leaving VS Code's pinned CLI.`);
		return undefined;
	}
}

/**
 * When the CLI version is pinned explicitly (`VSCODE_CLI_CANARY_VERSION`),
 * verify it satisfies the `@github/copilot` range the SDK canary declares so an
 * incompatible SDK/CLI pair fails here with a clear message rather than
 * surfacing as a confusing runtime error in the shipped build. Best-effort: if
 * the SDK declares no such range, or the range cannot be resolved from the feed,
 * we log and continue rather than block on a transient registry hiccup — only a
 * *confirmed* mismatch is fatal.
 */
function assertCliSatisfiesSdk(sdkVersion: string, cliVersion: string): void {
	let range: string | undefined;
	try {
		const depsRaw = execFileSync(NPM, ['view', `@github/copilot-sdk@${sdkVersion}`, 'dependencies', '--json'], { encoding: 'utf8', shell: IS_WINDOWS });
		range = JSON.parse(depsRaw || '{}')['@github/copilot'];
	} catch (err) {
		console.warn(`[canary-override] Could not read @github/copilot-sdk@${sdkVersion} dependencies to check CLI compatibility: ${err instanceof Error ? err.message : err}. Skipping check.`);
		return;
	}
	if (!range) {
		console.log(`[canary-override] SDK ${sdkVersion} declares no @github/copilot dependency — skipping CLI compatibility check for pinned @github/copilot@${cliVersion}.`);
		return;
	}
	assertSafeSpec('@github/copilot range', range);
	let satisfying: string[];
	try {
		const versionsRaw = execFileSync(NPM, ['view', `@github/copilot@${range}`, 'version', '--json'], { encoding: 'utf8', shell: IS_WINDOWS });
		const parsed = JSON.parse(versionsRaw || 'null');
		satisfying = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
	} catch (err) {
		console.warn(`[canary-override] Could not resolve @github/copilot@${range} to check CLI compatibility: ${err instanceof Error ? err.message : err}. Skipping check.`);
		return;
	}
	if (!satisfying.includes(cliVersion)) {
		throw new Error(
			`[canary-override] Incompatible pinned versions: @github/copilot@${cliVersion} does not satisfy the range "${range}" required by @github/copilot-sdk@${sdkVersion} ` +
			`(versions satisfying the range: ${satisfying.length ? satisfying.join(', ') : '<none published>'}). ` +
			`Set VSCODE_CLI_CANARY_VERSION to a compatible version, or leave it as 'auto' to infer a compatible CLI from the SDK.`
		);
	}
	console.log(`[canary-override] Verified @github/copilot@${cliVersion} satisfies "${range}" required by @github/copilot-sdk@${sdkVersion}.`);
}

function collectOverrides(): Override[] {
	const sdkVersion = (process.env['VSCODE_SDK_CANARY_VERSION'] ?? '').trim();
	if (!sdkVersion) {
		return [];
	}
	assertSafeSpec('SDK canary version', sdkVersion);
	const overrides: Override[] = [{ name: '@github/copilot-sdk', version: sdkVersion }];

	// Explicit CLI version wins (but must be compatible with the SDK); empty
	// means "infer a compatible CLI from the SDK".
	const explicitCli = (process.env['VSCODE_CLI_CANARY_VERSION'] ?? '').trim();
	let cliVersion: string | undefined;
	if (explicitCli) {
		assertSafeSpec('CLI canary version', explicitCli);
		assertCliSatisfiesSdk(sdkVersion, explicitCli);
		cliVersion = explicitCli;
	} else {
		cliVersion = inferCliVersion(sdkVersion);
	}
	if (cliVersion) {
		overrides.push({ name: '@github/copilot', version: cliVersion });
	}
	return overrides;
}

function applyOverrides(dir: string, overrides: Override[]): Override[] {
	const packageJsonPath = path.join(ROOT, dir, 'package.json');
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	const dependencies = packageJson.dependencies ?? {};

	const applied: Override[] = [];
	for (const override of overrides) {
		const { name, version } = override;
		if (Object.prototype.hasOwnProperty.call(dependencies, name) && dependencies[name] !== version) {
			dependencies[name] = version;
			applied.push(override);
			console.log(`[canary-override] ${path.join(dir, 'package.json')}: ${name} -> ${version}`);
		}
	}

	if (applied.length > 0) {
		packageJson.dependencies = dependencies;
		fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
	}
	return applied;
}

function refreshLockfile(dir: string): void {
	// Refresh only the lockfile (no node_modules writes, no lifecycle scripts)
	// so `npm ci` in the product build resolves the overridden versions. This
	// contacts the configured registry, so npm auth for the private feed must
	// already be established in the ambient environment.
	execFileSync(NPM, ['install', '--package-lock-only', '--ignore-scripts'], {
		cwd: path.join(ROOT, dir),
		stdio: 'inherit',
		shell: IS_WINDOWS
	});
}

/**
 * Confirms the refreshed lockfile actually resolved each override to the
 * requested version. Fails loudly if a version is missing (e.g. not published
 * to the feed, or a registry/auth misconfiguration) so a bad canary version is
 * caught here rather than surfacing as a confusing downstream build error.
 */
function verifyResolved(dir: string, overrides: Override[]): void {
	const lockPath = path.join(ROOT, dir, 'package-lock.json');
	const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
	const packages = lock.packages ?? {};
	for (const { name, version } of overrides) {
		const entry = packages[`node_modules/${name}`];
		if (!entry) {
			throw new Error(`[canary-override] ${path.join(dir, 'package-lock.json')}: ${name} not found after lockfile refresh — is ${name}@${version} published to the feed and is npm auth configured?`);
		}
		if (entry.version !== version) {
			throw new Error(`[canary-override] ${path.join(dir, 'package-lock.json')}: ${name} resolved to ${entry.version}, expected ${version}`);
		}
		console.log(`[canary-override] verified ${path.join(dir, 'package-lock.json')}: ${name}@${entry.version} (resolved ${entry.resolved ?? '<no url>'})`);
	}
}

function main(): void {
	const overrides = collectOverrides();
	if (overrides.length === 0) {
		console.log('[canary-override] No canary versions set — nothing to do.');
		return;
	}

	for (const dir of TARGET_DIRS) {
		const applied = applyOverrides(dir, overrides);
		if (applied.length > 0) {
			refreshLockfile(dir);
			verifyResolved(dir, applied);
		}
	}
}

main();
