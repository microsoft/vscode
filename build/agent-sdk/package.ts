/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Build one per-target tarball for a single agent SDK.
 *
 * Usage:
 *   node build/agent-sdk/package.ts --sdk=<claude|codex> --target=<sdkTarget> [--out=<dir>]
 *
 * Where `<sdkTarget>` matches the npm `optionalDependencies` suffix the SDK
 * ships its platform package under (e.g. `darwin-arm64`, `linux-x64-musl`,
 * `win32-x64`). The supported set per SDK is `TARGETS` in `common.ts`; the
 * pinned version is read from the repo-root `package.json` devDeps (via
 * `getSdkVersion` in `common.ts`).
 *
 * Produces in `<out>`:
 *   <sdk>-<version>-<target>.tgz
 *   <sdk>-<version>-<target>.tgz.json   ← ITarballSidecar, consumed by upload.ts + aggregate.ts
 *
 * Determinism contract:
 *   - This script MUST run on Linux only. Asserts at startup.
 *   - SDK pinned to an exact version by `SDK_VERSIONS`. npm install fetches
 *     transitive deps fresh each run; day-to-day drift in those resolutions
 *     surfaces at upload time as a sha mismatch against the existing blob,
 *     where a human investigates whether it's an intentional SDK bump.
 *   - Forces `npm_config_libc/os/cpu` to fetch the foreign platform binary.
 *   - Normalizes mtime on every file (including symlinks via `lutimes`).
 *   - Tar with `--format=gnu --sort=name --owner=0 --group=0 --numeric-owner --mtime=@0 --no-acls --no-xattrs --no-selinux` + `gzip -n -9`.
 */

import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fail, getSdkVersion, PACKAGE_NAME, parseFlags, parseSdk, parseTarget, type Sdk, sha256OfFile, writeSidecar } from './common.ts';

const SCRIPT = 'package.ts';

interface ICliArgs {
	sdk: Sdk;
	sdkTarget: string;
	outDir: string;
}

function parseArgs(): ICliArgs {
	const flags = parseFlags(process.argv.slice(2));
	const sdk = parseSdk(flags.get('sdk'), SCRIPT);
	const sdkTarget = parseTarget(flags.get('target'), SCRIPT);
	const outDir = flags.get('out') ?? path.resolve(process.cwd(), 'out');
	return { sdk, sdkTarget, outDir };
}

function assertEnvironment(): void {
	if (process.platform !== 'linux') {
		fail(SCRIPT, `This script must run on Linux for byte-reproducible tarballs (got ${process.platform}).`);
	}
}

function parseTargetTriple(sdkTarget: string): { os: string; cpu: string; libc?: string } {
	// `darwin-arm64`, `linux-x64`, `linux-x64-musl`, `win32-x64`, …
	const match = /^([a-z0-9]+)-([a-z0-9]+)(?:-([a-z0-9]+))?$/.exec(sdkTarget);
	if (!match) {
		fail(SCRIPT, `Cannot parse target '${sdkTarget}'`);
	}
	const [, osStr, cpu, libc] = match;
	return { os: osStr, cpu, libc };
}

function normalizeMtimes(root: string): void {
	const fixedDate = new Date(0);
	const walk = (dir: string) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			// lutimes handles symlinks without following them; utimes would
			// stamp the target. .bin/codex etc. are symlinks.
			fs.lutimesSync(full, fixedDate, fixedDate);
			if (entry.isDirectory() && !entry.isSymbolicLink()) {
				walk(full);
			}
		}
	};
	walk(root);
	fs.lutimesSync(root, fixedDate, fixedDate);
}

/**
 * Chmod the executable binaries inside a per-SDK extracted node_modules tree.
 *
 * Layout differs per SDK; we don't pretend it's configurable:
 *   - claude: a single top-level `claude` (or `claude.exe`) binary per
 *     platform package at `node_modules/@anthropic-ai/claude-agent-sdk-<target>/claude`.
 *   - codex:  a `vendor/<rust-triple>/bin/codex` tree per platform package
 *     at `node_modules/@openai/codex-<target>/vendor/.../bin/codex`.
 */
function chmodPlatformBinaries(nodeModulesDir: string, sdk: Sdk): void {
	if (sdk === 'claude') {
		const scopeDir = path.join(nodeModulesDir, '@anthropic-ai');
		if (!fs.existsSync(scopeDir)) {
			return;
		}
		for (const child of fs.readdirSync(scopeDir)) {
			if (!child.startsWith('claude-agent-sdk-')) {
				continue;
			}
			const binary = path.join(scopeDir, child, 'claude');
			if (fs.existsSync(binary)) {
				fs.chmodSync(binary, 0o755);
			}
		}
		return;
	}

	// codex
	const scopeDir = path.join(nodeModulesDir, '@openai');
	if (!fs.existsSync(scopeDir)) {
		return;
	}
	for (const child of fs.readdirSync(scopeDir)) {
		if (!child.startsWith('codex-')) {
			continue;
		}
		const vendorDir = path.join(scopeDir, child, 'vendor');
		if (!fs.existsSync(vendorDir)) {
			continue;
		}
		for (const triple of fs.readdirSync(vendorDir)) {
			const binDir = path.join(vendorDir, triple, 'bin');
			if (!fs.existsSync(binDir)) {
				continue;
			}
			for (const f of fs.readdirSync(binDir)) {
				fs.chmodSync(path.join(binDir, f), 0o755);
			}
		}
	}
}

function npmInstall(workDir: string, env: NodeJS.ProcessEnv): void {
	// `--no-package-lock` skips writing a lockfile we'd just throw away.
	// `--ignore-scripts` blocks any postinstall/preinstall hooks the SDK
	// or its transitive deps might ship — we're producing an artifact, not
	// running a dev environment.
	const result = spawnSync('npm', ['install', '--no-package-lock', '--ignore-scripts'], {
		cwd: workDir,
		env: { ...process.env, ...env },
		stdio: 'inherit',
	});
	if (result.status !== 0) {
		fail(SCRIPT, `npm install exited ${result.status}`);
	}
}

/**
 * Stream `tar -C stagingDir -cf - node_modules` into `gzip -n -9` into the
 * output file. No shell — args are passed as argv (no quoting concerns), the
 * tar→gzip pipe is built by handing tar's stdout directly to gzip's stdin.
 */
function buildTarball(stagingDir: string, outTgz: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const tarArgs = [
			'--format=gnu',
			'--sort=name',
			'--owner=0',
			'--group=0',
			'--numeric-owner',
			'--mtime=@0',
			'--no-acls',
			'--no-xattrs',
			'--no-selinux',
			'-C', stagingDir,
			'-cf', '-',
			'node_modules',
		];
		const tarProc = spawn('tar', tarArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
		const gzipProc = spawn('gzip', ['-n', '-9'], { stdio: ['pipe', 'pipe', 'inherit'] });
		const outStream = fs.createWriteStream(outTgz);

		tarProc.stdout.pipe(gzipProc.stdin);
		gzipProc.stdout.pipe(outStream);

		let tarStatus: number | null = null;
		let gzipStatus: number | null = null;
		const settle = () => {
			if (tarStatus === null || gzipStatus === null) {
				return;
			}
			if (tarStatus !== 0) {
				reject(new Error(`tar exited ${tarStatus}`));
			} else if (gzipStatus !== 0) {
				reject(new Error(`gzip exited ${gzipStatus}`));
			} else {
				resolve();
			}
		};
		tarProc.on('exit', code => { tarStatus = code; settle(); });
		gzipProc.on('exit', code => { gzipStatus = code; settle(); });
		tarProc.on('error', reject);
		gzipProc.on('error', reject);
		outStream.on('error', reject);
	});
}

async function main(): Promise<void> {
	assertEnvironment();
	const args = parseArgs();
	const packageName = PACKAGE_NAME[args.sdk];
	const sdkVersion = getSdkVersion(args.sdk);

	const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-sdk-pkg-'));
	try {
		// Stage a minimal package.json that pins this SDK exactly. npm install
		// will fetch the foreign platform binary based on the `npm_config_*`
		// env vars set below.
		fs.writeFileSync(path.join(stagingDir, 'package.json'), JSON.stringify({
			name: `agent-sdk-build-${args.sdk}-${args.sdkTarget}`,
			private: true,
			dependencies: { [packageName]: sdkVersion },
		}, null, 2));

		console.log(`[${SCRIPT}] Building ${args.sdk}@${sdkVersion} for ${args.sdkTarget} in ${stagingDir}`);

		const { os: targetOs, cpu, libc } = parseTargetTriple(args.sdkTarget);
		const npmEnv: NodeJS.ProcessEnv = { npm_config_os: targetOs, npm_config_cpu: cpu };
		if (libc) {
			npmEnv.npm_config_libc = libc;
		}
		npmInstall(stagingDir, npmEnv);

		const nodeModulesDir = path.join(stagingDir, 'node_modules');
		chmodPlatformBinaries(nodeModulesDir, args.sdk);
		normalizeMtimes(nodeModulesDir);

		fs.mkdirSync(args.outDir, { recursive: true });
		const outTgz = path.join(args.outDir, `${args.sdk}-${sdkVersion}-${args.sdkTarget}.tgz`);
		await buildTarball(stagingDir, outTgz);

		const sha256 = await sha256OfFile(outTgz);
		writeSidecar(outTgz, {
			sdk: args.sdk,
			sdkVersion,
			sdkTarget: args.sdkTarget,
			sha256,
		});

		console.log(`[${SCRIPT}] Wrote ${outTgz} (${fs.statSync(outTgz).size} bytes, sha256=${sha256})`);
	} finally {
		fs.rmSync(stagingDir, { recursive: true, force: true });
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
