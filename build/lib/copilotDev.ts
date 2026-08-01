/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { resolveCopilotOverrides } from '../azure-pipelines/common/copilotOverride.ts';

/**
 * Local development loop for the Copilot runtime (`@github/copilot`) and SDK
 * (`@github/copilot-sdk`) inside VS Code. Driven by `scripts/copilot-dev.ts`.
 *
 * `link` builds sibling checkouts and points this VS Code at them:
 *   - the runtime through `product.overrides.json` -> `copilotCliPath`, which
 *     `resolveCopilotCliPath` honors (see `copilotAgent.ts`). The file is
 *     git-ignored and only merged when running from source, so a packaged build
 *     can never pick it up.
 *   - the SDK by moving `node_modules/@github/copilot-sdk` aside and symlinking
 *     the checkout in its place, so edits are picked up by a rebuild alone.
 *
 * `pin` writes the same commits into `package.json` `copilotOverride`, which is
 * what the product pipeline consumes — so the local loop and the pipeline are
 * configured through the same two values.
 */

export type CopilotDevCommand = 'status' | 'link' | 'unlink' | 'pin' | 'help';

export interface CopilotDevOptions {
	readonly command: CopilotDevCommand;
	readonly runtimeRepo: string;
	readonly sdkRepo: string;
	/** Restrict the command to one package; both when neither flag is passed. */
	readonly runtime: boolean;
	readonly sdk: boolean;
	/** Rebuild the Rust addon too, not just the JS bundle. */
	readonly native: boolean;
	readonly skipBuild: boolean;
	/** `pin` arguments: runtime spec then SDK spec, either may be `-` to skip. */
	readonly pins: readonly string[];
}

const DEFAULT_RUNTIME_REPO = '../copilot-agent-runtime';
const DEFAULT_SDK_REPO = '../copilot-sdk';

const IS_WINDOWS = process.platform === 'win32';
const PNPM = IS_WINDOWS ? 'pnpm.cmd' : 'pnpm';
const NPM = IS_WINDOWS ? 'npm.cmd' : 'npm';

const RUNTIME_NPM_NAME = '@github/copilot';
const SDK_NPM_NAME = '@github/copilot-sdk';

/** Where the linked SDK's real directory is parked so `unlink` can restore it. */
const SDK_BACKUP_SUFFIX = '.copilot-dev-backup';

export const USAGE = `
Usage: npm run copilot:dev -- <command> [options]

Commands:
  status                Show which runtime and SDK this checkout resolves to.
  link                  Build the local checkouts and use them in this VS Code.
  unlink                Restore the published runtime and SDK.
  pin <runtime> <sdk>   Write package.json copilotOverride for a pipeline build.
                        Each value is a full 40-char commit SHA (build from
                        source), an npm version/range/dist-tag (published), or
                        '-' to leave that package alone.

Options:
  --runtime[=<path>]    Act on the runtime only; optionally give its checkout.
  --sdk[=<path>]        Act on the SDK only; optionally give its checkout.
  --native              Also rebuild the runtime's Rust addon (slow).
  --skip-build          Reuse existing build output instead of rebuilding.

Checkouts default to ${DEFAULT_RUNTIME_REPO} and ${DEFAULT_SDK_REPO}, and can be
set with COPILOT_RUNTIME_REPO / COPILOT_SDK_REPO.
`.trimStart();

export function parseArgs(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): CopilotDevOptions {
	const positional: string[] = [];
	let runtimeRepo = env['COPILOT_RUNTIME_REPO'] || DEFAULT_RUNTIME_REPO;
	let sdkRepo = env['COPILOT_SDK_REPO'] || DEFAULT_SDK_REPO;
	let runtime = false;
	let sdk = false;
	let native = false;
	let skipBuild = false;

	for (const arg of argv) {
		const [flag, value] = splitFlag(arg);
		switch (flag) {
			case '--runtime':
				runtime = true;
				if (value) { runtimeRepo = value; }
				break;
			case '--sdk':
				sdk = true;
				if (value) { sdkRepo = value; }
				break;
			case '--native':
				native = true;
				break;
			case '--skip-build':
				skipBuild = true;
				break;
			case '--help':
			case '-h':
				positional.unshift('help');
				break;
			default:
				// A bare `-` is pin's "leave this package alone" sentinel, not an option.
				if (flag.length > 1 && flag.startsWith('-')) {
					throw new Error(`[copilot-dev] Unknown option "${arg}". Run with --help.`);
				}
				positional.push(arg);
		}
	}

	const command = (positional[0] ?? 'status') as CopilotDevCommand;
	if (!['status', 'link', 'unlink', 'pin', 'help'].includes(command)) {
		throw new Error(`[copilot-dev] Unknown command "${command}". Run with --help.`);
	}

	return {
		command,
		runtimeRepo,
		sdkRepo,
		// Neither flag means "both packages"; either flag narrows the command.
		runtime: runtime || !sdk,
		sdk: sdk || !runtime,
		native,
		skipBuild,
		pins: positional.slice(1),
	};
}

function splitFlag(arg: string): [string, string | undefined] {
	const eq = arg.indexOf('=');
	return eq === -1 ? [arg, undefined] : [arg.slice(0, eq), arg.slice(eq + 1)];
}

/* -------------------------------------------------------------------------- */
/* product.overrides.json                                                      */
/* -------------------------------------------------------------------------- */

export function productOverridesPath(root: string): string {
	return path.join(root, 'product.overrides.json');
}

export function readProductOverrides(root: string): Record<string, unknown> {
	const file = productOverridesPath(root);
	if (!fs.existsSync(file)) {
		return {};
	}
	const raw = fs.readFileSync(file, 'utf8').trim();
	return raw ? JSON.parse(raw) : {};
}

/**
 * Sets or clears `copilotCliPath`, preserving every other key — the file is a
 * shared dev-override surface (the mock policy server writes to it too), so it
 * must never be clobbered wholesale. Removes the file once it would be empty.
 */
export function setCopilotCliPath(root: string, cliPath: string | undefined): void {
	const overrides = readProductOverrides(root);
	if (cliPath) {
		overrides.copilotCliPath = cliPath;
	} else {
		delete overrides.copilotCliPath;
	}

	const file = productOverridesPath(root);
	if (Object.keys(overrides).length === 0) {
		fs.rmSync(file, { force: true });
		return;
	}
	fs.writeFileSync(file, JSON.stringify(overrides, null, 2) + '\n');
}

/* -------------------------------------------------------------------------- */
/* package.json copilotOverride                                                */
/* -------------------------------------------------------------------------- */

/**
 * Writes `copilotOverride` entries, then proves the result by resolving it with
 * the pipeline's own resolver and rolling back if it is rejected — so `pin` can
 * never leave behind a value that would fail the product build.
 */
export function writeCopilotOverride(root: string, entries: Record<string, string>): void {
	const file = path.join(root, 'package.json');
	const before = fs.readFileSync(file, 'utf8');
	const manifest = JSON.parse(before);
	manifest.copilotOverride = { ...manifest.copilotOverride, ...entries };
	fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');

	try {
		resolveCopilotOverrides(root);
	} catch (err) {
		fs.writeFileSync(file, before);
		throw err;
	}
}

/* -------------------------------------------------------------------------- */
/* Building and linking                                                        */
/* -------------------------------------------------------------------------- */

function run(command: string, args: string[], cwd: string): void {
	console.log(`[copilot-dev] $ ${command} ${args.join(' ')}  (cwd: ${cwd})`);
	execFileSync(command, args, { cwd, stdio: 'inherit', shell: IS_WINDOWS && /\.(cmd|bat)$/i.test(command) });
}

function assertCheckout(repo: string, label: string): string {
	const resolved = path.resolve(repo);
	if (!fs.existsSync(path.join(resolved, 'package.json'))) {
		throw new Error(`[copilot-dev] No ${label} checkout at ${resolved}. Clone it there, pass --${label === 'runtime' ? 'runtime' : 'sdk'}=<path>, or set COPILOT_${label.toUpperCase()}_REPO.`);
	}
	return resolved;
}

/** Native addons live at `prebuilds/${process.platform}-${process.arch}`. */
function hostPrebuildsDir(distCli: string): string {
	return path.join(distCli, 'prebuilds', `${process.platform}-${process.arch}`);
}

export function buildRuntime(repo: string, options: { native: boolean; skipBuild: boolean }): string {
	const resolved = assertCheckout(repo, 'runtime');
	const distCli = path.join(resolved, 'dist-cli');
	const cliPath = path.join(distCli, 'index.js');

	if (!options.skipBuild) {
		if (!fs.existsSync(path.join(resolved, 'node_modules'))) {
			run(PNPM, ['install', '--frozen-lockfile'], resolved);
		}
		// The Rust addon is slow to build and rarely changes, so only build it when
		// asked or when this host has no addon to bundle yet.
		const prebuilds = hostPrebuildsDir(distCli);
		if (options.native || !fs.existsSync(prebuilds)) {
			run(PNPM, ['run', 'build:runtime'], resolved);
		}
		run(PNPM, ['run', 'build'], resolved);
	}

	if (!fs.existsSync(cliPath)) {
		throw new Error(`[copilot-dev] Runtime build produced no ${cliPath}. Run without --skip-build.`);
	}
	if (!fs.existsSync(hostPrebuildsDir(distCli))) {
		throw new Error(`[copilot-dev] Runtime build produced no native addon in ${hostPrebuildsDir(distCli)}. Re-run with --native.`);
	}
	return cliPath;
}

export function sdkPackageDir(repo: string): string {
	// The publishable package lives in the `nodejs/` workspace of copilot-sdk.
	return path.join(path.resolve(repo), 'nodejs');
}

export function buildSdk(repo: string, options: { skipBuild: boolean }): string {
	assertCheckout(repo, 'sdk');
	const pkgDir = sdkPackageDir(repo);
	if (!fs.existsSync(path.join(pkgDir, 'package.json'))) {
		throw new Error(`[copilot-dev] No SDK package at ${pkgDir} (nodejs/ workspace not found).`);
	}

	if (!options.skipBuild) {
		if (!fs.existsSync(path.join(pkgDir, 'node_modules'))) {
			run(NPM, ['ci', '--no-audit', '--no-fund'], pkgDir);
		}
		run(NPM, ['run', 'build'], pkgDir);
	}

	const entry = path.join(pkgDir, 'dist', 'index.js');
	if (!fs.existsSync(entry)) {
		throw new Error(`[copilot-dev] SDK build produced no ${entry}. Run without --skip-build.`);
	}
	return pkgDir;
}

export function sdkLinkPath(root: string): string {
	return path.join(root, 'node_modules', ...SDK_NPM_NAME.split('/'));
}

export function isSdkLinked(root: string): boolean {
	try {
		return fs.lstatSync(sdkLinkPath(root)).isSymbolicLink();
	} catch {
		return false;
	}
}

/**
 * Replaces the installed SDK with a symlink to a checkout, parking the real
 * directory next to it so `unlink` restores it without touching the network.
 */
export function linkSdk(root: string, pkgDir: string): void {
	const link = sdkLinkPath(root);
	const backup = link + SDK_BACKUP_SUFFIX;

	if (isSdkLinked(root)) {
		fs.rmSync(link, { force: true });
	} else if (fs.existsSync(link)) {
		// Keep the first backup: re-linking twice must not overwrite the real one.
		if (fs.existsSync(backup)) {
			fs.rmSync(link, { recursive: true, force: true });
		} else {
			fs.renameSync(link, backup);
		}
	}

	fs.mkdirSync(path.dirname(link), { recursive: true });
	fs.symlinkSync(pkgDir, link, IS_WINDOWS ? 'junction' : 'dir');
}

export function unlinkSdk(root: string): boolean {
	const link = sdkLinkPath(root);
	if (!isSdkLinked(root)) {
		return false;
	}
	fs.rmSync(link, { force: true });

	const backup = link + SDK_BACKUP_SUFFIX;
	if (fs.existsSync(backup)) {
		fs.renameSync(backup, link);
	} else {
		console.warn(`[copilot-dev] No backup at ${backup}; run "npm ci" to reinstall ${SDK_NPM_NAME}.`);
	}
	return true;
}

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

export interface RepoStatus {
	readonly path: string;
	readonly exists: boolean;
	readonly head?: string;
	readonly dirty?: boolean;
}

/** HEAD and dirtiness of a checkout, so `status` can answer "what am I testing?". */
export function repoStatus(repo: string): RepoStatus {
	const resolved = path.resolve(repo);
	if (!fs.existsSync(path.join(resolved, '.git'))) {
		return { path: resolved, exists: false };
	}
	try {
		const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: resolved, encoding: 'utf8' }).trim();
		const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: resolved, encoding: 'utf8' }).trim().length > 0;
		return { path: resolved, exists: true, head, dirty };
	} catch {
		return { path: resolved, exists: true };
	}
}

export interface CopilotDevStatus {
	readonly cliPathOverride?: string;
	readonly cliPathOverrideExists: boolean;
	readonly sdkLinked: boolean;
	readonly sdkLinkTarget?: string;
	readonly pinned: Record<string, string>;
	readonly runtimeRepo: RepoStatus;
	readonly sdkRepo: RepoStatus;
}

export function collectStatus(root: string, options: CopilotDevOptions): CopilotDevStatus {
	const cliPathOverride = readProductOverrides(root).copilotCliPath as string | undefined;
	const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
	const pinned: Record<string, string> = {};
	for (const [name, value] of Object.entries(manifest.copilotOverride ?? {})) {
		if (typeof value === 'string' && value.trim()) {
			pinned[name] = value;
		}
	}

	return {
		cliPathOverride,
		cliPathOverrideExists: Boolean(cliPathOverride && fs.existsSync(cliPathOverride)),
		sdkLinked: isSdkLinked(root),
		sdkLinkTarget: isSdkLinked(root) ? fs.readlinkSync(sdkLinkPath(root)) : undefined,
		pinned,
		runtimeRepo: repoStatus(options.runtimeRepo),
		sdkRepo: repoStatus(options.sdkRepo),
	};
}

export function formatStatus(status: CopilotDevStatus): string {
	const lines: string[] = [];
	lines.push('Copilot runtime (@github/copilot)');
	if (status.cliPathOverride) {
		lines.push(`  linked to  ${status.cliPathOverride}${status.cliPathOverrideExists ? '' : '  (MISSING - run link)'}`);
	} else {
		lines.push('  bundled    node_modules/@github/copilot-<os>-<arch>');
	}
	lines.push(formatRepo(status.runtimeRepo));

	lines.push('');
	lines.push('Copilot SDK (@github/copilot-sdk)');
	lines.push(status.sdkLinked ? `  linked to  ${status.sdkLinkTarget}` : '  bundled    node_modules/@github/copilot-sdk');
	lines.push(formatRepo(status.sdkRepo));

	lines.push('');
	const pins = Object.entries(status.pinned);
	lines.push('Pipeline pins (package.json copilotOverride)');
	if (pins.length === 0) {
		lines.push('  none       normal build');
	}
	for (const [name, value] of pins) {
		lines.push(`  ${name} -> ${value}`);
	}
	return lines.join('\n');
}

function formatRepo(repo: RepoStatus): string {
	if (!repo.exists) {
		return `  checkout   ${repo.path}  (not found)`;
	}
	const head = repo.head ? repo.head.slice(0, 7) : 'unknown';
	return `  checkout   ${repo.path}  @ ${head}${repo.dirty ? ' (uncommitted changes)' : ''}`;
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                    */
/* -------------------------------------------------------------------------- */

export function link(root: string, options: CopilotDevOptions): void {
	if (options.runtime) {
		const cliPath = buildRuntime(options.runtimeRepo, options);
		setCopilotCliPath(root, cliPath);
		console.log(`[copilot-dev] Runtime -> ${cliPath}`);
	}
	if (options.sdk) {
		const pkgDir = buildSdk(options.sdkRepo, options);
		linkSdk(root, pkgDir);
		console.log(`[copilot-dev] SDK -> ${pkgDir}`);
	}
	console.log('[copilot-dev] Restart the dev instance (./scripts/code.sh) to pick this up.');
}

export function unlink(root: string, options: CopilotDevOptions): void {
	if (options.runtime) {
		setCopilotCliPath(root, undefined);
		console.log('[copilot-dev] Runtime -> bundled package');
	}
	if (options.sdk && unlinkSdk(root)) {
		console.log('[copilot-dev] SDK -> bundled package');
	}
}

export function pin(root: string, options: CopilotDevOptions): void {
	const [runtimeSpec, sdkSpec] = options.pins;
	if (!runtimeSpec) {
		throw new Error('[copilot-dev] pin needs a runtime spec (use \'-\' to leave it alone).');
	}

	const entries: Record<string, string> = {};
	if (runtimeSpec !== '-') { entries[RUNTIME_NPM_NAME] = runtimeSpec; }
	if (sdkSpec && sdkSpec !== '-') { entries[SDK_NPM_NAME] = sdkSpec; }
	if (Object.keys(entries).length === 0) {
		throw new Error('[copilot-dev] pin needs at least one spec that is not \'-\'.');
	}

	writeCopilotOverride(root, entries);
	for (const [name, value] of Object.entries(entries)) {
		console.log(`[copilot-dev] Pinned ${name} -> ${value}`);
	}
	console.log('[copilot-dev] Commit package.json to carry this into a build: it is the only way the pipeline takes an override.');
}

export function main(argv: readonly string[], root: string): void {
	const options = parseArgs(argv);
	switch (options.command) {
		case 'help':
			console.log(USAGE);
			return;
		case 'status':
			console.log(formatStatus(collectStatus(root, options)));
			return;
		case 'link':
			link(root, options);
			return;
		case 'unlink':
			unlink(root, options);
			return;
		case 'pin':
			pin(root, options);
			return;
	}
}
