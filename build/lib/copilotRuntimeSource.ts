/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { parseLsRemoteTagSha, pinnedRuntimeVersion, runtimeSourceTag, sourceBuildVersion, PINNED_SOURCE, RUNTIME_NPM_NAME, RUNTIME_REPO } from '../azure-pipelines/common/copilotOverride.ts';

/**
 * Full native source build of the `@github/copilot` runtime for a
 * `copilotOverride` `runtime` commit override.
 *
 * Unlike the SDK (pure TypeScript), the runtime carries compiled Rust addons, so
 * "build from source" means a real per-target native build — there is no JS-only
 * shortcut (the app is migrating into Rust). The flow:
 *
 *   1. `apply-copilot-override.ts` writes a lightweight marker ({repo, ref}) and
 *      signals the pipeline to install the Rust toolchain (gated so normal builds
 *      pay nothing — see `apply-copilot-override.yml`).
 *   2. During gulp packaging, `ensureCopilotPlatformPackage(platform, arch)` calls
 *      {@link materializeRuntimeSourcePackage} instead of downloading the published
 *      package. That lazily clones + installs once, then builds the specific
 *      target and drops the full package (JS + native) into node_modules.
 *
 * Because gulp only asks for the targets a given platform job actually packages,
 * each job cross-compiles just its own matrix slice — matching what the runtime's
 * own release pipeline does.
 */

const IS_WINDOWS = process.platform === 'win32';
const PNPM = IS_WINDOWS ? 'pnpm.cmd' : 'pnpm';
const COREPACK = IS_WINDOWS ? 'corepack.cmd' : 'corepack';

/** Scratch dir (git-ignored under `.build`), relative to the repo root (gulp cwd). */
const OVERRIDES_DIR = path.join('.build', 'copilot-overrides');
const RUNTIME_MARKER = path.join(OVERRIDES_DIR, 'runtime.json');
const RUNTIME_SRC_DIR = path.join(OVERRIDES_DIR, 'runtime-src');
/** Stamp recording which ref the checkout currently holds, for idempotency. */
const CHECKOUT_STAMP = path.join(RUNTIME_SRC_DIR, '.copilot-source-ref');
/** Finished per-target packages, keyed by ref + target so a repeat build is a copy. */
const RUNTIME_PKGS_DIR = path.join(OVERRIDES_DIR, 'runtime-pkgs');
/** Written last in a finished package dir, so a partial copy is never reused. */
const PACKAGE_STAMP = '.copilot-source-complete';
/**
 * Cargo output, deliberately outside the checkout: `ensureCheckout` wipes the
 * checkout whenever the ref changes, which would otherwise discard every
 * compiled dependency crate between hotfix iterations. Cargo namespaces builds
 * by target triple, so all targets can share one directory.
 */
const CARGO_TARGET_DIR = path.join(OVERRIDES_DIR, 'cargo-target');
/**
 * Secret bridge file: the pipeline apply step (which holds the GitHub App key)
 * mints an installation token and writes it here; the later gulp packaging step
 * (this module) reads it to clone the private runtime repo. Lives on the
 * ephemeral agent under git-ignored `.build`, never in a pipeline variable.
 */
const RUNTIME_TOKEN_FILE = path.join(OVERRIDES_DIR, 'runtime-token');

interface RuntimeMarker {
	readonly repo: string;
	readonly ref: string;
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): void {
	console.log(`[copilot-runtime-source] $ ${command} ${redactSecrets(args.join(' '))}  (cwd: ${cwd})`);
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
 * Re-wraps a `execFileSync` failure with credentials masked. Its message embeds
 * the whole argument list, so an authenticated git call that fails would
 * otherwise print a live token into the build log.
 */
export function redactedError(err: unknown): Error {
	const message = err instanceof Error ? err.message : String(err);
	return new Error(redactSecrets(message));
}

/** Masks credentials (tokens in URLs / auth headers) in a command or message. */
export function redactSecrets(text: string): string {
	return text
		.replace(/(extraheader=AUTHORIZATION: [^\s]+ )\S+/gi, '$1***')
		.replace(/\/\/[^@\s/]+@/g, '//***@');
}

/**
 * Builds `git -c ...` args for a token, keeping it out of the clone URL (so it
 * never lands in `.git/config`) and out of logs (redacted by
 * {@link redactSecrets}). Always disables git's interactive credential
 * fallback: in CI a bad or missing token must fail fast rather than block the
 * job on a prompt that nobody can answer.
 */
export function gitAuthArgs(token: string | undefined): string[] {
	const nonInteractive = ['-c', 'credential.helper=', '-c', 'core.askPass='];
	if (!token) {
		return nonInteractive;
	}
	const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
	return [...nonInteractive, '-c', `http.extraheader=AUTHORIZATION: basic ${basic}`];
}

/** Environment for git calls, with terminal credential prompting disabled. */
export function gitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	return { ...env, GIT_TERMINAL_PROMPT: '0' };
}

/** Records a runtime source override so gulp builds it. Called before `npm ci`. */
export function writeRuntimeSourceMarker(repo: string, ref: string): void {
	fs.mkdirSync(OVERRIDES_DIR, { recursive: true });
	fs.writeFileSync(RUNTIME_MARKER, JSON.stringify({ repo, ref } satisfies RuntimeMarker, null, 2) + '\n');
}

/** Clears any runtime source override marker (normal build). */
export function clearRuntimeSourceMarker(): void {
	fs.rmSync(RUNTIME_MARKER, { force: true });
}

/** Persists a clone token for the later gulp packaging step (0600). */
export function writeRuntimeToken(token: string): void {
	fs.mkdirSync(OVERRIDES_DIR, { recursive: true });
	fs.writeFileSync(RUNTIME_TOKEN_FILE, token, { mode: 0o600 });
}

/** Reads the token: explicit env wins, else the bridge file, else undefined. */
function resolveCloneToken(): string | undefined {
	const env = (process.env['COPILOT_OVERRIDE_TOKEN'] ?? '').trim();
	if (env) {
		return env;
	}
	if (fs.existsSync(RUNTIME_TOKEN_FILE)) {
		const token = fs.readFileSync(RUNTIME_TOKEN_FILE, 'utf8').trim();
		return token || undefined;
	}
	return undefined;
}

/** Whether a runtime source override is in effect for this build. */
export function isRuntimeSourceActive(): boolean {
	return fs.existsSync(RUNTIME_MARKER);
}

/**
 * Resolves the {@link PINNED_SOURCE} sentinel to the commit the runtime version
 * currently pinned in `root` was released from, via its `cli-<version>` tag.
 */
export function resolvePinnedRuntimeCommit(root: string, token: string | undefined): string {
	const version = pinnedRuntimeVersion(root);
	const tag = runtimeSourceTag(version);
	const url = `https://github.com/${RUNTIME_REPO}.git`;
	let output: string;
	try {
		output = execFileSync('git', [...gitAuthArgs(token), 'ls-remote', '--tags', url, tag, `${tag}^{}`], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			env: gitEnv(),
		});
	} catch (err) {
		throw redactedError(err);
	}
	const ref = parseLsRemoteTagSha(output, tag);
	console.log(`[copilot-runtime-source] '${PINNED_SOURCE}' -> ${RUNTIME_NPM_NAME}@${version} (${tag}) -> ${RUNTIME_REPO}@${ref}`);
	return ref;
}

function readMarker(): RuntimeMarker {
	return JSON.parse(fs.readFileSync(RUNTIME_MARKER, 'utf8'));
}

/**
 * Clones the runtime at the marked ref and installs its dependencies, once.
 * Idempotent across the many per-target calls in a single gulp run via a ref
 * stamp. Returns the absolute checkout dir.
 */
function ensureCheckout(marker: RuntimeMarker): string {
	const srcDir = path.resolve(RUNTIME_SRC_DIR);
	if (fs.existsSync(CHECKOUT_STAMP) && fs.readFileSync(CHECKOUT_STAMP, 'utf8').trim() === marker.ref) {
		return srcDir;
	}

	fs.rmSync(srcDir, { recursive: true, force: true });
	fs.mkdirSync(srcDir, { recursive: true });

	const token = resolveCloneToken();
	const authArgs = gitAuthArgs(token);
	const url = `https://github.com/${marker.repo}.git`;
	// Fetch just the pinned commit (GitHub allows fetching a reachable SHA), then
	// check it out. Falls back to a full fetch if the shallow SHA fetch is refused.
	try {
		run('git', ['init', '-q'], srcDir);
		run('git', ['remote', 'add', 'origin', url], srcDir);
		try {
			run('git', [...authArgs, 'fetch', '--depth', '1', 'origin', marker.ref], srcDir, gitEnv());
		} catch {
			console.log(`[copilot-runtime-source] Shallow fetch of ${marker.repo}@${marker.ref} failed; retrying with a full fetch.`);
			run('git', [...authArgs, 'fetch', 'origin'], srcDir, gitEnv());
		}
		run('git', ['checkout', '-q', marker.ref], srcDir);
	} finally {
		// Nothing after the clone needs it, and the rest of the job has no business
		// holding a live installation token inside the source tree.
		fs.rmSync(RUNTIME_TOKEN_FILE, { force: true });
	}

	// corepack provisions the pnpm version pinned by the runtime's packageManager
	// field; `--ignore-scripts` skips dependency lifecycle builds (the runtime's
	// own native build is invoked explicitly per target below).
	run(COREPACK, ['enable'], srcDir);
	run(PNPM, ['install', '--frozen-lockfile', '--ignore-scripts'], srcDir);

	fs.writeFileSync(CHECKOUT_STAMP, marker.ref);
	console.log(`[copilot-runtime-source] Prepared runtime source ${marker.repo}@${marker.ref} at ${srcDir}`);
	return srcDir;
}

interface BuildTarget {
	/** `process.platform` value the Rust build targets: darwin | linux | win32. */
	readonly nodePlatform: string;
	/** `process.arch` value: x64 | arm64. */
	readonly arch: string;
	/** libc for Linux; ignored elsewhere. */
	readonly libc: 'gnu' | 'musl';
	/** Package platform id used by the runtime's packager: linux | linuxmusl | darwin | win32. */
	readonly pkgPlatform: string;
}

/**
 * Maps a copilot platform-package id (e.g. `linuxmusl-x64`, `darwin-arm64`) to
 * the runtime's build arguments.
 */
function toBuildTarget(copilotPackagePlatformArch: string): BuildTarget {
	const sep = copilotPackagePlatformArch.lastIndexOf('-');
	const pkgPlatform = copilotPackagePlatformArch.slice(0, sep);
	const arch = copilotPackagePlatformArch.slice(sep + 1);
	const isMusl = pkgPlatform === 'linuxmusl';
	return {
		nodePlatform: isMusl ? 'linux' : pkgPlatform,
		arch,
		libc: isMusl ? 'musl' : 'gnu',
		pkgPlatform,
	};
}

/**
 * Builds the runtime from source for one target and populates `packageDir` (the
 * `node_modules/@github/copilot-<platform>-<arch>` directory) with the resulting
 * full package (JS bundle + native binaries). No-op unless a runtime source
 * override is active.
 */
export function materializeRuntimeSourcePackage(packageDir: string, copilotPackagePlatformArch: string): void {
	if (!isRuntimeSourceActive()) {
		return;
	}
	const marker = readMarker();
	const built = ensureTargetBuilt(marker, copilotPackagePlatformArch);

	fs.rmSync(packageDir, { recursive: true, force: true });
	fs.mkdirSync(packageDir, { recursive: true });
	fs.cpSync(built, packageDir, { recursive: true });
	console.log(`[copilot-runtime-source] Materialized ${copilotPackagePlatformArch} from ${marker.repo}@${marker.ref} into ${packageDir}`);
}

/**
 * Builds one target and returns the directory holding the finished package.
 *
 * Gulp asks for the same target once per packaging entry point (the desktop app
 * and the server/REH both package `@github/copilot-<platform>-<arch>`), so
 * without this reuse the expensive native build would run more than once per
 * agent for identical output.
 */
function ensureTargetBuilt(marker: RuntimeMarker, copilotPackagePlatformArch: string): string {
	const outDir = path.resolve(RUNTIME_PKGS_DIR, `${marker.ref}-${copilotPackagePlatformArch}`);
	if (fs.existsSync(path.join(outDir, PACKAGE_STAMP))) {
		console.log(`[copilot-runtime-source] Reusing built ${copilotPackagePlatformArch} at ${outDir}`);
		return outDir;
	}

	const srcDir = ensureCheckout(marker);
	assertBuildableSource(srcDir, `${marker.repo}@${marker.ref}`);
	const target = toBuildTarget(copilotPackagePlatformArch);

	// Rebuild dist-cli from scratch for this target so per-target trimming
	// (prebuilds, platform native deps) from a previous target can't leak in.
	const distCli = path.join(srcDir, 'dist-cli');
	fs.rmSync(distCli, { recursive: true, force: true });

	// 1. Compile the Rust napi addon for the target (cross-compiles as needed).
	//    `--release` is explicit: the runtime infers release from `CI`/`GITHUB_ACTIONS`,
	//    neither of which Azure Pipelines sets, so relying on inference would ship a
	//    debug addon. An explicit `--release` wins over every other profile input.
	const runtimeArgs = ['--release', `--platform=${target.nodePlatform}`, `--arch=${target.arch}`];
	if (target.nodePlatform === 'linux') {
		// Pass libc explicitly (gnu or musl) so the target never depends on the
		// build host's detected libc.
		runtimeArgs.push(`--libc=${target.libc}`);
	}
	run(PNPM, ['run', 'build:runtime', ...runtimeArgs], srcDir, { ...process.env, CARGO_TARGET_DIR: path.resolve(CARGO_TARGET_DIR) });
	// 2. Bundle the JS and copy native addons into dist-cli (CI=1 → minify).
	run(PNPM, ['exec', 'tsx', 'esbuild.ts'], srcDir, { ...process.env, CI: '1' });
	// 3. Assemble the single-platform package (installs target native deps, trims).
	run('node', ['script/cli-package-json.js', sourceBuildVersion(marker.ref), target.pkgPlatform, target.arch], srcDir);

	assertPackageComplete(distCli, target, copilotPackagePlatformArch, srcDir);

	fs.rmSync(outDir, { recursive: true, force: true });
	fs.mkdirSync(outDir, { recursive: true });
	fs.cpSync(distCli, outDir, { recursive: true });
	fs.writeFileSync(path.join(outDir, PACKAGE_STAMP), `${marker.ref}\n`);
	return outDir;
}

/**
 * Fails early when a ref does not expose the build entry points driven below.
 * This file reaches into the runtime's own build system, so a rename there would
 * otherwise surface as an opaque pnpm/node error deep inside packaging — during
 * a hotfix, which is the worst time to debug one.
 */
function assertBuildableSource(srcDir: string, source: string): void {
	const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'package.json'), 'utf8'));
	const missing = [
		...(manifest.scripts?.['build:runtime'] ? [] : ['package.json script "build:runtime"']),
		...['esbuild.ts', path.join('script', 'cli-package-json.js')].filter(entry => !fs.existsSync(path.join(srcDir, entry))),
	];
	if (missing.length > 0) {
		throw new Error(`[copilot-runtime-source] ${source} does not provide the runtime build entry points this integration drives (missing: ${missing.join(', ')}). Update the build recipe in build/lib/copilotRuntimeSource.ts to match.`);
	}
}

/**
 * Fails the build if the produced package is missing the pieces VS Code depends
 * on. Without this a subtly wrong package (e.g. a native addon built for the
 * host instead of the requested target) reaches the app and only surfaces as a
 * runtime load failure on a user's machine.
 */
function assertPackageComplete(distCli: string, target: BuildTarget, copilotPackagePlatformArch: string, srcDir: string): void {
	if (!fs.existsSync(distCli)) {
		throw new Error(`[copilot-runtime-source] Runtime build produced no dist-cli/ for ${copilotPackagePlatformArch} in ${srcDir}.`);
	}
	// The SDK spawns `index.js`; the agent host loads `sdk/index.js` beside it.
	for (const entry of ['index.js', path.join('sdk', 'index.js')]) {
		if (!fs.existsSync(path.join(distCli, entry))) {
			throw new Error(`[copilot-runtime-source] Runtime build for ${copilotPackagePlatformArch} is missing ${entry}.`);
		}
	}
	// Native addons are looked up at `prebuilds/${process.platform}-${process.arch}`,
	// so musl targets share the `linux-*` directory name with glibc.
	const prebuilds = path.join(distCli, 'prebuilds', `${target.nodePlatform}-${target.arch}`);
	if (!fs.existsSync(prebuilds) || !fs.readdirSync(prebuilds).some(name => name.endsWith('.node'))) {
		throw new Error(`[copilot-runtime-source] Runtime build for ${copilotPackagePlatformArch} produced no native addon in ${prebuilds}. Was the target cross-compiled?`);
	}
}
