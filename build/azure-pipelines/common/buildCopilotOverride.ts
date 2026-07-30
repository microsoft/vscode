/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { sourceBuildVersion, type GitOverride } from './copilotOverride.ts';
import { gitAuthArgs, gitEnv, redactedError, redactSecrets } from '../../lib/copilotRuntimeSource.ts';

/**
 * Source build for the `copilotOverride` SDK `git:<commit>` override. The SDK is
 * pure TypeScript, so this clones its public repo, runs the package's own build,
 * and packs a tarball the manifests pin via `file:`. The runtime is a full
 * native build handled separately in `build/lib/copilotRuntimeSource.ts`.
 */

const ROOT = path.join(import.meta.dirname, '../../../');

/** Where clones + build outputs live; git-ignored, cache-key neutral. */
export const OVERRIDES_DIR = path.join(ROOT, '.build', 'copilot-overrides');

const IS_WINDOWS = process.platform === 'win32';
const NPM = IS_WINDOWS ? 'npm.cmd' : 'npm';

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): void {
	console.log(`[copilot-override] $ ${command} ${redactSecrets(args.join(' '))}  (cwd: ${cwd})`);
	// Only `.cmd`/`.bat` shims need a shell; git/node must not use one, or spaced
	// args (e.g. the http.extraheader auth header) get split on Windows.
	const shell = IS_WINDOWS && /\.(cmd|bat)$/i.test(command);
	try {
		execFileSync(command, args, { cwd, stdio: 'inherit', shell, env });
	} catch (err) {
		throw redactedError(err);
	}
}

/**
 * Fetches `owner/name` at commit `sha` into `dest` (shallow, single commit).
 * Assumes public repos; an optional `COPILOT_OVERRIDE_TOKEN` / `GITHUB_TOKEN`
 * authenticates a private fetch via `http.extraheader`, keeping the token out of
 * the URL, `.git/config` and (redacted) logs.
 */
function cloneRepo(repo: string, sha: string, dest: string): void {
	fs.rmSync(dest, { recursive: true, force: true });
	fs.mkdirSync(dest, { recursive: true });

	const token = (process.env['COPILOT_OVERRIDE_TOKEN'] ?? process.env['GITHUB_TOKEN'] ?? '').trim();
	const authArgs = gitAuthArgs(token || undefined);
	const url = `https://github.com/${repo}.git`;

	// Fetch just the pinned commit (GitHub allows fetching a reachable SHA), then
	// check it out. Falls back to a full fetch if the shallow SHA fetch is refused.
	run('git', ['init', '-q'], dest);
	run('git', ['remote', 'add', 'origin', url], dest);
	try {
		run('git', [...authArgs, 'fetch', '--depth', '1', 'origin', sha], dest, gitEnv());
	} catch {
		console.log(`[copilot-override] Shallow fetch of ${repo}@${sha} failed; retrying with a full fetch.`);
		run('git', [...authArgs, 'fetch', 'origin'], dest, gitEnv());
	}
	run('git', ['checkout', '-q', sha], dest);
	console.log(`[copilot-override] Checked out ${repo}@${sha} -> ${dest}`);
}

/**
 * Builds `@github/copilot-sdk` from source and returns the absolute path to a
 * packed `.tgz`. Pure TypeScript: install dev deps (ignoring native lifecycle
 * scripts), run the package's own esbuild + `tsc`, then `npm pack`.
 */
export function buildSdkTarball(override: GitOverride): string {
	const srcDir = path.join(OVERRIDES_DIR, 'sdk-src');
	cloneRepo(override.repo, override.ref, srcDir);

	// The publishable package lives in the `nodejs/` workspace of copilot-sdk.
	const pkgDir = path.join(srcDir, 'nodejs');
	if (!fs.existsSync(path.join(pkgDir, 'package.json'))) {
		throw new Error(`[copilot-override] Expected SDK package at ${pkgDir} (nodejs/ workspace not found in ${override.repo}@${override.ref}).`);
	}

	run(NPM, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], pkgDir);
	run(NPM, ['run', 'build'], pkgDir);

	// Stamp after building and before packing, mirroring the SDK's own `package`
	// script. The in-repo manifest carries a fixed `0.0.0-dev`, so without this
	// every commit packs to the same filename — see `sourceBuildVersion`.
	const version = sourceBuildVersion(override.ref);
	stampVersion(pkgDir, version);

	const outDir = path.join(OVERRIDES_DIR, 'sdk-pack');
	fs.rmSync(outDir, { recursive: true, force: true });
	fs.mkdirSync(outDir, { recursive: true });
	run(NPM, ['pack', '--pack-destination', outDir], pkgDir);

	const tarball = fs.readdirSync(outDir).find(name => name.endsWith('.tgz'));
	if (!tarball) {
		throw new Error(`[copilot-override] npm pack produced no tarball for SDK in ${outDir}.`);
	}
	if (!tarball.includes(version)) {
		throw new Error(`[copilot-override] Packed SDK tarball "${tarball}" does not carry the stamped version ${version}, so the node_modules cache key cannot distinguish SDK commits.`);
	}
	const tarballPath = path.join(outDir, tarball);
	console.log(`[copilot-override] Built SDK tarball ${tarballPath} from ${override.repo}@${override.ref}`);
	return tarballPath;
}

/** Rewrites the package version so the packed tarball name is commit-unique. */
function stampVersion(pkgDir: string, version: string): void {
	const manifestPath = path.join(pkgDir, 'package.json');
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	manifest.version = version;
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
