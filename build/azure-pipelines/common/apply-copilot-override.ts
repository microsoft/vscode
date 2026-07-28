/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { resolveCopilotOverrides, type GitOverride } from './copilotOverride.ts';
import { buildSdkTarball } from './buildCopilotOverride.ts';
import { clearRuntimeSourceMarker, writeRuntimeSourceMarker, writeRuntimeToken } from '../../lib/copilotRuntimeSource.ts';
import { COPILOT_APP_ID, mintInstallationToken } from './mintGithubAppToken.ts';

/**
 * Applies the `copilotOverride` overrides before `npm ci` in the product build.
 *
 * For each requested package:
 *   - feed spec    -> pin the manifest dependency to that version/range/dist-tag.
 *   - SDK commit   -> build a tarball from source and pin the manifest to `file:`.
 *   - runtime commit-> write a marker + signal the pipeline to install the Rust
 *                   toolchain; gulp packaging then builds the runtime from source
 *                   per target (see `build/lib/copilotRuntimeSource.ts`). The
 *                   manifest is left unchanged (native comes from source, not npm).
 *
 * Rewriting the manifests + refreshing the lockfiles busts the node_modules
 * cache key (derived from those files) so the override is actually installed.
 * A no-op for a normal build (all `copilotOverride` values empty).
 */

const ROOT = path.join(import.meta.dirname, '../../../');
const IS_WINDOWS = process.platform === 'win32';
const NPM = IS_WINDOWS ? 'npm.cmd' : 'npm';

/** Manifests that declare the Copilot dependencies. */
const TARGET_DIRS = ['', 'remote'];

interface ManifestPin {
	readonly name: string;
	/** A published version / range / dist-tag; mutually exclusive with `tarball`. */
	readonly version?: string;
	/** Absolute path to a locally built `.tgz`; pinned as `file:` per manifest. */
	readonly tarball?: string;
}

function applyOverrides(dir: string, pins: ManifestPin[]): ManifestPin[] {
	const packageJsonPath = path.join(ROOT, dir, 'package.json');
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	const dependencies = packageJson.dependencies ?? {};

	const applied: ManifestPin[] = [];
	for (const pin of pins) {
		const spec = pinSpec(dir, pin);
		if (Object.prototype.hasOwnProperty.call(dependencies, pin.name) && dependencies[pin.name] !== spec) {
			dependencies[pin.name] = spec;
			applied.push(pin);
			console.log(`[copilot-override] ${path.join(dir, 'package.json')}: ${pin.name} -> ${spec}`);
		}
	}

	if (applied.length > 0) {
		packageJson.dependencies = dependencies;
		fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
	}
	return applied;
}

/** Resolves a pin to a concrete manifest spec, `file:` paths being manifest-relative. */
function pinSpec(dir: string, pin: ManifestPin): string {
	if (pin.tarball) {
		const rel = path.relative(path.join(ROOT, dir), pin.tarball).split(path.sep).join('/');
		return `file:${rel}`;
	}
	return pin.version!;
}

function refreshLockfile(dir: string): void {
	// Refresh only the lockfile (no node_modules writes, no lifecycle scripts).
	// Contacts the registry, so npm auth for the private feed must already be set
	// up in the ambient environment.
	execFileSync(NPM, ['install', '--package-lock-only', '--ignore-scripts'], {
		cwd: path.join(ROOT, dir),
		stdio: 'inherit',
		shell: IS_WINDOWS,
	});
}

function verifyResolved(dir: string, pins: ManifestPin[]): void {
	const lockPath = path.join(ROOT, dir, 'package-lock.json');
	const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
	const packages = lock.packages ?? {};
	for (const pin of pins) {
		const entry = packages[`node_modules/${pin.name}`];
		if (!entry) {
			throw new Error(`[copilot-override] ${path.join(dir, 'package-lock.json')}: ${pin.name} not found after lockfile refresh (${pinSpec(dir, pin)}). Is it published / is npm auth configured?`);
		}
		console.log(`[copilot-override] verified ${path.join(dir, 'package-lock.json')}: ${pin.name}@${entry.version ?? '<file>'} (resolved ${entry.resolved ?? '<local>'})`);
	}
}

/**
 * Handles a runtime `git:<ref>` override: records a marker so gulp packaging
 * builds the runtime from source per target. When the GitHub App key is present
 * (from Key Vault), mints a clone token for the private runtime repo and stashes
 * it for the gulp step. No-op (clears any stale marker) when absent.
 */
async function handleRuntimeSource(runtimeGit: GitOverride | undefined): Promise<void> {
	if (!runtimeGit) {
		clearRuntimeSourceMarker();
		return;
	}
	writeRuntimeSourceMarker(runtimeGit.repo, runtimeGit.ref);

	// Mint a clone token for the (private) runtime repo when the App key is
	// available, and stash it for the later gulp packaging step. The key arrives
	// as the literal $(...) macro when the gated Key Vault step didn't run — treat
	// that (and empty) as "no key", leaving an explicit COPILOT_OVERRIDE_TOKEN or
	// a public clone to cover local runs.
	const privateKey = (process.env['GITHUB_APP_PRIVATE_KEY'] ?? '').trim();
	if (privateKey && !privateKey.startsWith('$(')) {
		const appId = (process.env['GITHUB_APP_ID'] ?? COPILOT_APP_ID).trim();
		const [owner, repo] = runtimeGit.repo.split('/');
		console.log(`[copilot-override] Minting GitHub App installation token (app ${appId}) for ${runtimeGit.repo}.`);
		writeRuntimeToken(await mintInstallationToken(appId, privateKey, owner, repo));
	}
	console.log(`[copilot-override] Runtime will be built from source: ${runtimeGit.repo}@${runtimeGit.ref} (gulp packaging builds per target).`);
}

async function main(): Promise<void> {
	const detectOnly = process.argv.includes('--detect');
	const overrides = resolveCopilotOverrides(ROOT);
	const runtimeGit = overrides.find((o): o is GitOverride => o.pkg === 'runtime' && o.kind === 'git');

	// Signal the pipeline (gates the Key Vault + Rust toolchain steps) as early as
	// possible so `--detect` can run before them.
	console.log(`##vso[task.setvariable variable=VSCODE_COPILOT_RUNTIME_SOURCE]${runtimeGit ? 'true' : 'false'}`);
	if (detectOnly) {
		return;
	}

	await handleRuntimeSource(runtimeGit);
	if (overrides.length === 0) {
		console.log('[copilot-override] No overrides in copilotOverride — nothing to do.');
		return;
	}
	console.log(`[copilot-override] Overrides: ${overrides.map(o => `${o.pkg}=${o.kind === 'feed' ? o.spec : `${o.repo}@${o.ref}`}`).join(', ')}`);

	// Manifest pins for feed + SDK-source overrides (runtime source is handled via
	// the marker above and does not touch the manifests). Build source artifacts
	// first so failures surface before touching manifests.
	const pins: ManifestPin[] = [];
	for (const override of overrides) {
		if (override.kind === 'feed') {
			pins.push({ name: override.npmName, version: override.spec });
		} else if (override.pkg === 'sdk') {
			pins.push({ name: override.npmName, tarball: buildSdkTarball(override) });
		}
		// runtime git: nothing to pin (built from source during packaging).
	}

	for (const dir of TARGET_DIRS) {
		const applied = applyOverrides(dir, pins);
		if (applied.length > 0) {
			refreshLockfile(dir);
			verifyResolved(dir, applied);
		}
	}
}

main().catch(err => {
	console.error(err instanceof Error ? err.stack ?? err.message : String(err));
	process.exit(1);
});
