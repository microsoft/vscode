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
 * Overrides `@github/copilot-sdk` in the root and `remote` manifests, records
 * the runtime version owned by that SDK, and refreshes the lockfiles.
 *
 * The SDK and runtime cannot be overridden independently: the SDK's platform
 * package owns the runtime executable and native module as one release unit.
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
 * Allowlist for npm versions and dist-tags before they are interpolated into
 * `npm view <pkg>@<spec>` argument strings. These specs come from
 * queue-time pipeline parameters and from registry responses, and on Windows
 * the npm calls run with `shell: true`, so shell metacharacters must be rejected.
 */
const SAFE_SPEC = /^[\w.+-]+$/;

function assertSafeSpec(label: string, value: string): void {
	if (!SAFE_SPEC.test(value)) {
		throw new Error(`[canary-override] Refusing unsafe ${label} "${value}": only exact versions and dist-tags are allowed.`);
	}
}

/** Manifests that declare the Copilot dependencies. */
const TARGET_DIRS = ['', 'remote'];

interface Override {
	readonly name: string;
	readonly version: string;
}

interface CopilotOverride {
	readonly dependencies: readonly Override[];
	readonly runtimeVersion?: string;
}

function resolveSdkRuntimeVersion(sdkVersion: string): string {
	const versionRaw = execFileSync(NPM, ['view', `@github/copilot-sdk@${sdkVersion}`, 'copilotCliVersion', '--json'], { encoding: 'utf8', shell: IS_WINDOWS });
	const version = JSON.parse(versionRaw || 'null');
	if (typeof version !== 'string' || !version) {
		throw new Error(`[canary-override] @github/copilot-sdk@${sdkVersion} does not declare copilotCliVersion.`);
	}
	assertSafeSpec('SDK runtime version', version);
	return version;
}

/**
 * Resolves the `latest-canary` sentinel to the concrete newest published
 * `@github/copilot-sdk` canary version. Runs inside the product build, where
 * npm auth for the private feed is already established, so the GitHub-side
 * orchestrator that queues the build never needs feed-read access.
 *
 * Canary versions look like `X.Y.Z-canary.<N>.g<sha>`; "newest" is the highest
 * `[X, Y, Z, N]` tuple (numeric, so `canary.9` < `canary.10`).
 */
function resolveLatestCanary(): string {
	const versionsRaw = execFileSync(NPM, ['view', '@github/copilot-sdk', 'versions', '--json'], { encoding: 'utf8', shell: IS_WINDOWS });
	const parsed = JSON.parse(versionsRaw || '[]');
	const versions: string[] = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
	const canaryRe = /^(\d+)\.(\d+)\.(\d+)-canary\.(\d+)\b/;
	const canaries = versions
		.map(v => {
			const m = canaryRe.exec(v);
			return m ? { v, key: [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] } : undefined;
		})
		.filter((x): x is { v: string; key: number[] } => x !== undefined)
		.sort((a, b) => {
			for (let i = 0; i < a.key.length; i++) {
				if (a.key[i] !== b.key[i]) {
					return a.key[i] - b.key[i];
				}
			}
			return 0;
		});
	if (canaries.length === 0) {
		throw new Error(`[canary-override] No @github/copilot-sdk -canary.* versions found on the feed to resolve 'latest-canary'.`);
	}
	const latest = canaries[canaries.length - 1].v;
	console.log(`[canary-override] Resolved 'latest-canary' -> @github/copilot-sdk@${latest} (from ${canaries.length} canary versions on the feed).`);
	// Surface the concrete version on the build so the GitHub orchestrator can
	// read it back (build tags API) for accurate reporting, without itself
	// needing feed-read access. Idempotent across the per-platform jobs. Use `=`
	// (not `:`) as the separator: build tags land in the Add Build Tag REST URL
	// path, and ASP.NET rejects `:` there as a "dangerous" path character.
	console.log(`##vso[build.addbuildtag]sdk-canary=${latest}`);
	return latest;
}

function collectOverrides(): CopilotOverride {
	let sdkVersion = (process.env['VSCODE_SDK_CANARY_VERSION'] ?? '').trim();
	const expectedRuntimeVersion = (process.env['VSCODE_CLI_CANARY_VERSION'] ?? '').trim();
	// `latest-canary` sentinel: resolve the newest published @github/copilot-sdk
	// canary here, inside the build, where private-feed npm auth already exists —
	// so the GitHub-side orchestrator that queues this build never needs
	// feed-read access.
	if (sdkVersion === 'latest-canary') {
		sdkVersion = resolveLatestCanary();
	}
	if (!sdkVersion) {
		if (expectedRuntimeVersion) {
			throw new Error('[canary-override] VSCODE_CLI_CANARY_VERSION cannot override the SDK-owned runtime independently.');
		}
		return { dependencies: [] };
	}

	assertSafeSpec('SDK canary version', sdkVersion);
	const runtimeVersion = resolveSdkRuntimeVersion(sdkVersion);
	if (expectedRuntimeVersion) {
		assertSafeSpec('expected SDK runtime version', expectedRuntimeVersion);
		if (expectedRuntimeVersion !== runtimeVersion) {
			throw new Error(`[canary-override] @github/copilot-sdk@${sdkVersion} bundles runtime ${runtimeVersion}, not requested runtime ${expectedRuntimeVersion}.`);
		}
	}
	console.log(`##vso[build.addbuildtag]cli-canary=${runtimeVersion}`);
	return {
		dependencies: [{ name: '@github/copilot-sdk', version: sdkVersion }],
		runtimeVersion,
	};
}

function applyOverrides(dir: string, override: CopilotOverride): Override[] {
	const packageJsonPath = path.join(ROOT, dir, 'package.json');
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	const dependencies = packageJson.dependencies ?? {};

	const applied: Override[] = [];
	for (const dependencyOverride of override.dependencies) {
		const { name, version } = dependencyOverride;
		if (Object.prototype.hasOwnProperty.call(dependencies, name) && dependencies[name] !== version) {
			dependencies[name] = version;
			applied.push(dependencyOverride);
			console.log(`[canary-override] ${path.join(dir, 'package.json')}: ${name} -> ${version}`);
		}
	}

	const runtimeVersionChanged = override.runtimeVersion !== undefined && packageJson.copilotRuntimeVersion !== override.runtimeVersion;
	if (runtimeVersionChanged) {
		packageJson.copilotRuntimeVersion = override.runtimeVersion;
		console.log(`[canary-override] ${path.join(dir, 'package.json')}: copilotRuntimeVersion -> ${override.runtimeVersion}`);
	}

	if (applied.length > 0 || runtimeVersionChanged) {
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
	const override = collectOverrides();
	if (override.dependencies.length === 0) {
		console.log('[canary-override] No canary versions set — nothing to do.');
		return;
	}

	for (const dir of TARGET_DIRS) {
		const applied = applyOverrides(dir, override);
		if (applied.length > 0) {
			refreshLockfile(dir);
			verifyResolved(dir, applied);
		}
	}
}

main();
