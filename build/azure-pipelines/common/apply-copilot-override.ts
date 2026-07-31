/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { resolveCopilotOverrides, overrideBuildTags, isPinnedSourceRequested, RUNTIME_REPO, type GitOverride } from './copilotOverride.ts';
import { buildSdkTarball } from './buildCopilotOverride.ts';
import { clearRuntimeSourceMarker, resolvePinnedRuntimeCommit, writeRuntimeSourceMarker, writeRuntimeToken } from '../../lib/copilotRuntimeSource.ts';
import { mintCloneTokenFromEnv } from './mintGithubAppToken.ts';
import { dirs } from '../../npm/dirs.ts';

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

/**
 * Manifests whose installed `@github/copilot` a runtime source build replaces
 * during gulp packaging — the agent host's own `node_modules`. See
 * `gulpfile.vscode.ts` and `gulpfile.reh.ts`.
 */
const AGENT_HOST_DIRS = ['', 'remote'];

interface ManifestPin {
	readonly name: string;
	/** A published version / range / dist-tag; mutually exclusive with `tarball`. */
	readonly version?: string;
	/** Absolute path to a locally built `.tgz`; pinned as `file:` per manifest. */
	readonly tarball?: string;
}

/** The spec a manifest declares for `name`, or undefined if it declares none. */
function declaredDependency(dir: string, name: string): string | undefined {
	const packageJsonPath = path.join(ROOT, dir, 'package.json');
	if (!fs.existsSync(packageJsonPath)) {
		return undefined;
	}
	const dependencies = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).dependencies ?? {};
	const spec = dependencies[name];
	return typeof spec === 'string' ? spec : undefined;
}

/**
 * The manifests to pin, derived from the repo's canonical npm directory list
 * rather than a hardcoded pair. A manifest that declares an overridden
 * dependency but is missed here keeps its published version, so the build would
 * ship two differently versioned copies of the same package.
 */
function manifestsDeclaring(pins: ManifestPin[]): string[] {
	return dirs.filter(dir => pins.some(pin => declaredDependency(dir, pin.name) !== undefined));
}

/**
 * The built-in Copilot extension pins `@github/copilot` independently of the
 * agent host and ships a native matched to that pin, so the two versions
 * diverge by design (see `prepareBuiltInCopilotRipgrepShim`). A runtime source
 * build only replaces the agent host's copy — worth stating plainly when the
 * whole point of the build is to carry a fix.
 */
function reportIndependentRuntimePins(npmName: string): void {
	for (const dir of dirs) {
		if (AGENT_HOST_DIRS.includes(dir)) {
			continue;
		}
		const spec = declaredDependency(dir, npmName);
		if (spec) {
			console.warn(`[copilot-override] ${path.join(dir, 'package.json')} pins ${npmName}@${spec} independently and keeps it: the extension host will NOT contain this source build. Pin it to a published version too if the fix is needed there.`);
		}
	}
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
 * builds the runtime from source per target, and stashes the clone token for
 * that later step. No-op (clears any stale marker) when absent.
 */
async function handleRuntimeSource(runtimeGit: GitOverride | undefined, token: string | undefined): Promise<void> {
	if (!runtimeGit) {
		clearRuntimeSourceMarker();
		return;
	}
	reportIndependentRuntimePins(runtimeGit.npmName);
	writeRuntimeSourceMarker(runtimeGit.repo, runtimeGit.ref);
	if (token) {
		writeRuntimeToken(token);
	}
	console.log(`[copilot-override] Runtime will be built from source: ${runtimeGit.repo}@${runtimeGit.ref} (gulp packaging builds per target).`);
}

async function main(): Promise<void> {
	const detectOnly = process.argv.includes('--detect');
	// The dedicated runtime source build jobs need only the marker and the clone
	// token. They never install VS Code's dependencies, so rewriting the manifests
	// would be dead work — and building the SDK tarball would make an unrelated
	// SDK override able to fail the runtime build.
	const runtimeOnly = process.argv.includes('--runtime-only')
		|| (process.env['COPILOT_OVERRIDE_RUNTIME_ONLY'] ?? '').trim().toLowerCase() === 'true';
	const env: NodeJS.ProcessEnv = { ...process.env };

	// The sentinel is not a version, so keep it away from the pure resolver (which
	// would read it as a dist-tag). It resolves to a commit below, once the gated
	// Key Vault step has run — which is after `--detect`.
	const pinnedSource = isPinnedSourceRequested(env);
	if (pinnedSource) {
		delete env['VSCODE_COPILOT_RUNTIME'];
	}

	let overrides = resolveCopilotOverrides(ROOT, env);
	let runtimeGit = overrides.find((o): o is GitOverride => o.pkg === 'runtime' && o.kind === 'git');

	// Signal the pipeline (gates the Key Vault + Rust toolchain steps) as early as
	// possible so `--detect` can run before them.
	console.log(`##vso[task.setvariable variable=VSCODE_COPILOT_RUNTIME_SOURCE]${runtimeGit || pinnedSource ? 'true' : 'false'}`);
	if (detectOnly) {
		return;
	}

	const cloneToken = await mintCloneTokenFromEnv(RUNTIME_REPO);
	if (pinnedSource) {
		env['VSCODE_COPILOT_RUNTIME'] = resolvePinnedRuntimeCommit(ROOT, cloneToken);
		overrides = resolveCopilotOverrides(ROOT, env);
		runtimeGit = overrides.find((o): o is GitOverride => o.pkg === 'runtime' && o.kind === 'git');
	}

	await handleRuntimeSource(runtimeGit, cloneToken);
	if (overrides.length === 0) {
		console.log('[copilot-override] No overrides in copilotOverride — nothing to do.');
		return;
	}
	console.log(`[copilot-override] Overrides: ${overrides.map(o => `${o.pkg}=${o.kind === 'feed' ? o.spec : `${o.repo}@${o.ref}`}`).join(', ')}`);

	// Tag the build with what it actually contains, so a released build stays
	// traceable to these commits after the queue-time parameters are forgotten.
	for (const tag of overrideBuildTags(overrides)) {
		console.log(`##vso[build.addbuildtag]${tag}`);
	}

	if (runtimeOnly) {
		return;
	}

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

	for (const dir of manifestsDeclaring(pins)) {
		if (!AGENT_HOST_DIRS.includes(dir)) {
			// This manifest pins the package independently of the agent host, so an
			// override moving it is a deliberate change to a deliberate pin.
			console.log(`[copilot-override] ${path.join(dir, 'package.json')} pins these packages independently; the override moves it too.`);
		}
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
