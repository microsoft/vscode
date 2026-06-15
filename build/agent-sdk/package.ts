/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Builds one per-target tarball for one agent SDK. Callable as both a Node
 * library function (`buildOne(...)`) and a thin CLI (the bottom of this file).
 *
 * The library form is what `produce.ts` calls during the per-platform
 * "Agent SDK: build + upload" pipeline step; the CLI form is for local
 * one-off builds during development.
 *
 * Runs on any OS — `npm install` with `npm_config_libc/os/cpu` set fetches
 * the foreign platform's pre-built binary package as-is from the registry,
 * no compilation involved. The tarball is then `tar`'d on whatever host is
 * doing the packaging. Each `(sdk, target)` pair has exactly one producer
 * per pipeline run (no cross-host race), so we don't need byte-identical
 * tarballs across OSes — only across re-runs on the same host, which the
 * same npm install + same tar version produces naturally.
 *
 * SDK version pinning:
 *   - Pinned via repo-root `package.json` devDeps (`getSdkVersion`).
 *   - No `node_modules` package-lock for the scratch install: transitive
 *     drift surfaces at upload time as a sha mismatch against the existing
 *     blob, where a human investigates.
 *
 * Uses node-tar (pure JS) for tar creation rather than system tar so that
 * tarballs produced on a Windows or macOS host have the same shape as ones
 * produced on Linux — same library, same flags, same output bytes given
 * the same input tree.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as tar from 'tar';
import { getAgentDir, getAgentMeta, parseFlags, type Sdk, sha256OfFile } from './common.ts';

const SCRIPT = 'package.ts';

export interface IBuildResult {
	readonly tgzPath: string;
	readonly sha256: string;
	readonly sdkVersion: string;
	readonly sizeBytes: number;
}

export interface IBuildArgs {
	readonly sdk: Sdk;
	readonly sdkTarget: string;
	readonly outDir: string;
}

/**
 * Build one tarball. Copies the SDK's pinned `agents/<sdk>/{package.json,
 * package-lock.json}` into a scratch dir, runs `npm ci` against the
 * lockfile (byte-deterministic dep graph), chmods+normalises+tars the
 * result. Returns the produced `.tgz` path and its sha256.
 *
 * Determinism comes from the lockfile + node-tar's portable mode. Two
 * runs against the same lockfile on different hosts should produce the
 * same bytes — that's what the CDN's HEAD-then-fail upload depends on.
 */
export async function buildOne(args: IBuildArgs): Promise<IBuildResult> {
	const { name: packageName, version: sdkVersion } = getAgentMeta(args.sdk);
	const agentDir = getAgentDir(args.sdk);

	const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-sdk-pkg-'));
	try {
		// Copy the pinned package.json + package-lock.json into the scratch
		// dir. `npm ci` errors out if a node_modules is already present, so
		// the scratch dir starts clean.
		fs.copyFileSync(path.join(agentDir, 'package.json'), path.join(stagingDir, 'package.json'));
		fs.copyFileSync(path.join(agentDir, 'package-lock.json'), path.join(stagingDir, 'package-lock.json'));

		console.log(`[${SCRIPT}] Building ${packageName}@${sdkVersion} for ${args.sdkTarget} in ${stagingDir}`);

		const { os: targetOs, cpu, libc } = parseTargetTriple(args.sdkTarget);
		const npmEnv: NodeJS.ProcessEnv = { npm_config_os: targetOs, npm_config_cpu: cpu };
		if (libc) {
			npmEnv.npm_config_libc = libc;
		}
		npmCi(stagingDir, npmEnv);

		const nodeModulesDir = path.join(stagingDir, 'node_modules');
		chmodPlatformBinaries(nodeModulesDir, args.sdk);

		fs.mkdirSync(args.outDir, { recursive: true });
		const tgzPath = path.join(args.outDir, `${args.sdk}-${sdkVersion}-${args.sdkTarget}.tgz`);
		await buildTarball(stagingDir, tgzPath);

		const sha256 = await sha256OfFile(tgzPath);
		const sizeBytes = fs.statSync(tgzPath).size;

		console.log(`[${SCRIPT}] Wrote ${tgzPath} (${sizeBytes} bytes, sha256=${sha256})`);
		return { tgzPath, sha256, sdkVersion, sizeBytes };
	} finally {
		fs.rmSync(stagingDir, { recursive: true, force: true });
	}
}

function parseTargetTriple(sdkTarget: string): { os: string; cpu: string; libc?: string } {
	// `darwin-arm64`, `linux-x64`, `linux-x64-musl`, `win32-x64`, …
	const match = /^([a-z0-9]+)-([a-z0-9]+)(?:-([a-z0-9]+))?$/.exec(sdkTarget);
	if (!match) {
		throw new Error(`[${SCRIPT}] Cannot parse target '${sdkTarget}'`);
	}
	const [, osStr, cpu, libc] = match;
	return { os: osStr, cpu, libc };
}


/**
 * Chmod the executable binaries inside a per-SDK extracted node_modules tree.
 * Layout differs per SDK; we don't pretend it's configurable:
 *   - claude: a single top-level `claude` binary per platform package
 *   - codex:  `vendor/<rust-triple>/bin/codex` under the platform package
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

function npmCi(workDir: string, env: NodeJS.ProcessEnv): void {
	// `npm ci` instead of `npm install`: installs the EXACT graph from the
	// committed package-lock.json without resolving versions, which is what
	// makes the tarball bytes reproducible across pipeline runs.
	// `--ignore-scripts` blocks any postinstall/preinstall the SDK or its
	// transitive deps might ship.
	// On Windows, npm is a `.cmd` shim. Two things matter:
	//   1. The explicit `.cmd` suffix — Node won't resolve PATHEXT.
	//   2. `shell: true` — since Node 20 (CVE-2024-27980) child_process
	//      refuses to spawn .cmd/.bat without it.
	const isWindows = process.platform === 'win32';
	const npm = isWindows ? 'npm.cmd' : 'npm';
	const result = spawnSync(npm, ['ci', '--ignore-scripts'], {
		cwd: workDir,
		env: { ...process.env, ...env },
		stdio: 'inherit',
		shell: isWindows,
	});
	if (result.error) {
		throw new Error(`[${SCRIPT}] npm ci failed to spawn: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(`[${SCRIPT}] npm ci exited ${result.status}`);
	}
}

/**
 * Builds the gzipped tar via node-tar. Same library on every host, so the
 * output is consistent regardless of whether GNU/BSD/Windows tar is what
 * the host normally ships.
 */
async function buildTarball(stagingDir: string, outTgz: string): Promise<void> {
	await tar.c(
		{
			file: outTgz,
			cwd: stagingDir,
			gzip: { level: 9 },
			portable: true, // omit user/group names and similar host-specific metadata
			mtime: new Date(0),
		},
		['node_modules'],
	);
}

// #region CLI entry point
//
// Lets a developer run `node build/agent-sdk/package.ts --sdk=claude
// --target=darwin-arm64 --out=/tmp/out` to produce one tarball locally.
// The gulpfile-side packaging uses `buildOne()` directly.

function isCliInvocation(): boolean {
	// `import.meta.filename` is already a real filesystem path; comparing
	// it directly to `process.argv[1]` works on Windows (where the
	// manual `file://${argv}` construction breaks because Node URL-encodes
	// drive letters and spaces). Pattern matches `build/npm/installStateHash.ts:143`.
	return import.meta.filename === process.argv[1];
}

function parseCliArgs(): IBuildArgs {
	const flags = parseFlags(process.argv.slice(2));
	const sdk = flags.get('sdk');
	if (sdk !== 'claude' && sdk !== 'codex') {
		throw new Error(`--sdk must be 'claude' or 'codex'; got '${sdk}'`);
	}
	const sdkTarget = flags.get('target');
	if (!sdkTarget) {
		throw new Error('--target=<sdkTarget> is required');
	}
	const outDir = flags.get('out') ?? path.resolve(process.cwd(), 'out');
	return { sdk, sdkTarget, outDir };
}

if (isCliInvocation()) {
	buildOne(parseCliArgs()).catch(err => {
		console.error(err);
		process.exit(1);
	});
}

// #endregion
