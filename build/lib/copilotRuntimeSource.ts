/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { sourceBuildVersion } from '../azure-pipelines/common/copilotSource.ts';

/**
 * Full native source build of `@github/copilot` for the standalone source-build
 * pipeline. Each target is built on its matching host OS and published as a
 * pipeline artifact before the packages are assembled for the internal feed.
 */

const IS_WINDOWS = process.platform === 'win32';
const PNPM = IS_WINDOWS ? 'pnpm.cmd' : 'pnpm';
const COREPACK = IS_WINDOWS ? 'corepack.cmd' : 'corepack';

/** Scratch dir (git-ignored under `.build`), relative to the repository root. */
const OVERRIDES_DIR = path.join('.build', 'copilot-overrides');
const RUNTIME_MARKER = path.join(OVERRIDES_DIR, 'runtime.json');
const RUNTIME_SRC_DIR = path.join(OVERRIDES_DIR, 'runtime-src');
/** Stamp recording which ref the checkout currently holds, for idempotency. */
const CHECKOUT_STAMP = path.join(RUNTIME_SRC_DIR, '.copilot-source-ref');
/** Finished per-target packages, keyed by ref + target so a repeat build is a copy. */
const RUNTIME_PKGS_DIR = path.join(OVERRIDES_DIR, 'runtime-pkgs');
/**
 * Written last in a finished package dir, so a partial copy is never reused.
 * Holds the commit it was built from, which is also what lets a packaging job
 * prove a downloaded artifact belongs to the build it is packaging.
 */
const PACKAGE_STAMP = '.copilot-source-complete';
/**
 * Cargo output, deliberately outside the checkout: `ensureCheckout` wipes the
 * checkout whenever the ref changes, which would otherwise discard every
 * compiled dependency crate between hotfix iterations. Cargo namespaces builds
 * by target triple, so all targets can share one directory.
 */
const CARGO_TARGET_DIR = path.join(OVERRIDES_DIR, 'cargo-target');
/**
 * Secret bridge file: the preparation step mints an installation token and
 * writes it here for the source checkout step.
 */
const RUNTIME_TOKEN_FILE = path.join(OVERRIDES_DIR, 'runtime-token');

interface RuntimeMarker {
	readonly repo: string;
	readonly ref: string;
}

/** The commit the runtime is being built from. */
export function runtimeSourceRef(): string | undefined {
	return isRuntimeSourceActive() ? readMarker().ref : undefined;
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

/**
 * Environment for the runtime's own toolchain. Corepack asks for confirmation
 * before downloading the pnpm version pinned by `packageManager`, which blocks
 * on stdin that no CI job can answer.
 */
export function toolEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	return { ...env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' };
}

/** Records the runtime source repository and commit for the build job. */
export function writeRuntimeSourceMarker(repo: string, ref: string): void {
	fs.mkdirSync(OVERRIDES_DIR, { recursive: true });
	fs.writeFileSync(RUNTIME_MARKER, JSON.stringify({ repo, ref } satisfies RuntimeMarker, null, 2) + '\n');
}

/** Persists a clone token for the source checkout step (0600). */
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
 * Retries an authenticated read from GitHub.
 *
 * A freshly minted GitHub App installation token is not always usable
 * immediately — GitHub answers with `Repository not found` rather than a 401,
 * so it is indistinguishable from a permissions problem and cannot be detected
 * any more precisely than "it failed". Every target mints its own token and
 * clones independently, so a blip that would once have hit one job now gets
 * eight chances to fail the stage.
 */
export function withGitHubRetries<T>(what: string, attempt: () => T, delaysMs: readonly number[] = [2_000, 8_000, 20_000]): T {
	for (let i = 0; ; i++) {
		try {
			return attempt();
		} catch (err) {
			if (i >= delaysMs.length) {
				throw err;
			}
			console.log(`[copilot-runtime-source] ${what} failed (${redactSecrets(err instanceof Error ? err.message : String(err)).split('\n')[0]}); retrying in ${delaysMs[i] / 1000}s.`);
			// Synchronous: the callers are sync and run inside a gulp packaging step.
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delaysMs[i]);
		}
	}
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
		withGitHubRetries(`fetch ${marker.repo}@${marker.ref}`, () => {
			try {
				run('git', [...authArgs, 'fetch', '--depth', '1', 'origin', marker.ref], srcDir, gitEnv());
			} catch {
				console.log(`[copilot-runtime-source] Shallow fetch of ${marker.repo}@${marker.ref} failed; retrying with a full fetch.`);
				run('git', [...authArgs, 'fetch', 'origin'], srcDir, gitEnv());
			}
		});
		run('git', ['checkout', '-q', marker.ref], srcDir);
	} finally {
		// Nothing after the clone needs it, and the rest of the job has no business
		// holding a live installation token inside the source tree.
		fs.rmSync(RUNTIME_TOKEN_FILE, { force: true });
	}

	// corepack provisions the pnpm version pinned by the runtime's packageManager
	// field; `--ignore-scripts` skips dependency lifecycle builds (the runtime's
	// own native build is invoked explicitly per target below).
	run(COREPACK, ['enable'], srcDir, toolEnv());
	run(PNPM, ['install', '--frozen-lockfile', '--ignore-scripts'], srcDir, toolEnv());

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

/** Pipeline artifact name carrying the built package for one target. */
export function runtimeArtifactName(copilotPackagePlatformArch: string): string {
	return `copilot_runtime_${copilotPackagePlatformArch.replace(/-/g, '_')}`;
}

/**
 * Builds one target from source and returns the directory holding the finished
 * package, for a dedicated build job that publishes it as a pipeline artifact.
 * Throws unless the preparation step wrote the runtime source marker.
 */
export function buildRuntimeTarget(copilotPackagePlatformArch: string): string {
	if (!isRuntimeSourceActive()) {
		throw new Error(`[copilot-runtime-source] No runtime source override is active, so ${copilotPackagePlatformArch} cannot be built from source.`);
	}
	return ensureTargetBuilt(readMarker(), copilotPackagePlatformArch);
}

/**
 * The target this host can execute. Node reports `linux` for both libc flavors;
 * the glibc package is the default and callers name `linuxmusl-*` explicitly.
 */
function hostTarget(): string {
	return `${process.platform}-${process.arch}`;
}

/**
 * Runs the built CLI, because a package can satisfy every structural assertion
 * and still fail to load (a native addon built against the wrong Node ABI, a
 * bundling regression). Skipped for cross-compiled targets, which cannot be
 * executed on this host.
 */
export function smokeRunPackage(packageDir: string, copilotPackagePlatformArch: string): void {
	if (copilotPackagePlatformArch !== hostTarget()) {
		console.log(`[copilot-runtime-source] ${copilotPackagePlatformArch} is cross-compiled; skipping the smoke run.`);
		return;
	}
	const entry = path.join(packageDir, 'index.js');
	const version = execFileSync(process.execPath, [entry, '--version'], { encoding: 'utf8', timeout: 120_000 }).trim();
	console.log(`[copilot-runtime-source] smoke run: ${entry} --version -> ${version}`);
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
	run(PNPM, ['run', 'build:runtime', ...runtimeArgs], srcDir, toolEnv({
		...process.env,
		...installLinuxSysroot(srcDir, target),
		CARGO_TARGET_DIR: path.resolve(CARGO_TARGET_DIR),
	}));
	// 2. Bundle the JS and copy native addons into dist-cli (CI=1 → minify).
	run(PNPM, ['exec', 'tsx', 'esbuild.ts'], srcDir, toolEnv({ ...process.env, CI: '1' }));
	// 3. Assemble the single-platform package (installs target native deps, trims).
	run('node', ['script/cli-package-json.js', sourceBuildVersion(marker.ref), target.pkgPlatform, target.arch], srcDir);

	assertPackageComplete(distCli, target, copilotPackagePlatformArch, srcDir);
	stripSourceMaps(distCli);

	fs.rmSync(outDir, { recursive: true, force: true });
	fs.mkdirSync(outDir, { recursive: true });
	fs.cpSync(distCli, outDir, { recursive: true });
	fs.writeFileSync(path.join(outDir, PACKAGE_STAMP), `${marker.ref}\n`);
	return outDir;
}

/**
 * Removes source maps and their trailing `sourceMappingURL` comments, matching
 * what the runtime's own publish workflow strips before shipping. Without this a
 * source build ships ~47MB of maps for a private codebase that the published
 * package does not contain.
 */
export function stripSourceMaps(distCli: string): number {
	let removed = 0;
	const walk = (dir: string): void => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.name.endsWith('.map')) {
				fs.rmSync(full, { force: true });
				removed++;
			} else if (entry.name.endsWith('.js')) {
				const source = fs.readFileSync(full, 'utf8');
				const stripped = source.replace(/^\/\/# sourceMappingURL=.*$\n?/gm, '');
				if (stripped !== source) {
					fs.writeFileSync(full, stripped);
				}
			}
		}
	};
	walk(distCli);
	console.log(`[copilot-runtime-source] Stripped ${removed} source map(s) from ${distCli}`);
	return removed;
}

/**
 * Cargo/cc environment that links a Linux glibc target against `sysroot`.
 *
 * Mirrors the runtime's own release build. The sysroot's GCC must be the linker:
 * the system GCC's CRT files reference newer glibc symbols that `--sysroot`
 * alone cannot override.
 */
export function linuxSysrootEnv(arch: string, sysroot: string, binDir: string): NodeJS.ProcessEnv {
	const triple = arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
	const gccPrefix = arch === 'arm64' ? 'aarch64-linux-gnu' : 'x86_64-linux-gnu';
	const upper = triple.replace(/-/g, '_').toUpperCase();
	return {
		[`CARGO_TARGET_${upper}_LINKER`]: path.join(binDir, `${gccPrefix}-gcc`),
		[`CFLAGS_${triple.replace(/-/g, '_')}`]: `--sysroot=${sysroot}`,
		[`CARGO_TARGET_${upper}_RUSTFLAGS`]: `-C link-arg=--sysroot=${sysroot}`,
	};
}

/**
 * Installs the glibc 2.28 sysroot the runtime's release build uses and returns
 * the environment that targets it. Without this the addon links against the
 * build agent's much newer glibc, raising the shipped package's `libc6` floor
 * and dropping support for distros the published package still covers.
 *
 * Only glibc Linux targets need it; musl routes through cargo-zigbuild instead.
 */
function installLinuxSysroot(srcDir: string, target: BuildTarget): NodeJS.ProcessEnv {
	if (target.nodePlatform !== 'linux' || target.libc !== 'gnu') {
		return {};
	}

	const installer = path.join('script', 'linux', 'install-sysroot.cjs');
	if (!fs.existsSync(path.join(srcDir, installer))) {
		throw new Error(`[copilot-runtime-source] ${installer} is missing from the runtime checkout; a glibc Linux build would link against this agent's libc and raise the shipped libc6 floor.`);
	}

	console.log(`[copilot-runtime-source] $ node ${installer} ${target.arch}  (cwd: ${srcDir})`);
	const output = execFileSync('node', [installer, target.arch], { cwd: srcDir, encoding: 'utf8', env: process.env });
	const sysroot = /^SYSROOT_PATH=(.+)$/m.exec(output)?.[1]?.trim();
	if (!sysroot) {
		throw new Error(`[copilot-runtime-source] ${installer} printed no SYSROOT_PATH for ${target.arch}.`);
	}

	// Sysroot is <base>/<triple>/<triple>/sysroot, so ../../bin holds the toolchain.
	const binDir = path.join(path.dirname(path.dirname(sysroot)), 'bin');
	console.log(`[copilot-runtime-source] Linking ${target.arch} against sysroot ${sysroot}`);
	return linuxSysrootEnv(target.arch, sysroot, binDir);
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
	// The runtime stages addons under the package platform name, so musl targets
	// use `linuxmusl-<arch>`, and `cli-package-json.js` prunes every other
	// target's directory. The Node platform name would miss musl entirely.
	const prebuilds = path.join(distCli, 'prebuilds', copilotPackagePlatformArch);
	const addons = fs.existsSync(prebuilds) ? fs.readdirSync(prebuilds).filter(name => name.endsWith('.node')) : [];
	if (addons.length === 0) {
		throw new Error(`[copilot-runtime-source] Runtime build for ${copilotPackagePlatformArch} produced no native addon in ${prebuilds}. Was the target cross-compiled?`);
	}

	// The directory name comes from the *requested* target, so a cross-compile
	// that silently fell back to the host would still land here. Read the object
	// header to confirm the binary really is for the requested architecture.
	for (const addon of addons) {
		const actual = readNativeArch(path.join(prebuilds, addon));
		if (actual && actual !== target.arch) {
			throw new Error(`[copilot-runtime-source] ${path.join(prebuilds, addon)} is a ${actual} binary but ${copilotPackagePlatformArch} was requested; the cross-compile fell back to the host.`);
		}
	}
}

/**
 * The architecture a native addon was compiled for, read from its object header
 * (Mach-O, ELF or PE). Returns undefined for a format or machine this does not
 * recognise, so an unknown toolchain output is not treated as a mismatch.
 */
export function readNativeArch(file: string): 'x64' | 'arm64' | undefined {
	const fd = fs.openSync(file, 'r');
	try {
		const head = Buffer.alloc(64);
		if (fs.readSync(fd, head, 0, head.length, 0) < 64) {
			return undefined;
		}

		// Mach-O 64-bit little-endian: magic 0xfeedfacf, then cputype.
		if (head.readUInt32LE(0) === 0xfeedfacf) {
			const cpuType = head.readUInt32LE(4);
			return cpuType === 0x0100000c ? 'arm64' : cpuType === 0x01000007 ? 'x64' : undefined;
		}
		// ELF: magic \x7FELF, then e_machine at offset 18.
		if (head.readUInt32BE(0) === 0x7f454c46) {
			const machine = head.readUInt16LE(18);
			return machine === 0xb7 ? 'arm64' : machine === 0x3e ? 'x64' : undefined;
		}
		// PE: 'MZ', PE header offset at 0x3c, machine at that offset + 4.
		if (head.readUInt16BE(0) === 0x4d5a) {
			const peOffset = head.readUInt32LE(0x3c);
			const coff = Buffer.alloc(6);
			if (fs.readSync(fd, coff, 0, coff.length, peOffset) < 6 || coff.readUInt32BE(0) !== 0x50450000) {
				return undefined;
			}
			const machine = coff.readUInt16LE(4);
			return machine === 0xaa64 ? 'arm64' : machine === 0x8664 ? 'x64' : undefined;
		}
		return undefined;
	} finally {
		fs.closeSync(fd);
	}
}
