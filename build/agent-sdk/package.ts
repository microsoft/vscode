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
 *   - Pinned in `agents/<sdk>/package.json` (`getAgentMeta`), with the
 *     `package-lock.json` alongside it fixing the transitive graph.
 *   - Peer dependencies are omitted from the install (see `npmCi`), so the
 *     tarball is a function of the SDK version and target alone. A peer bump
 *     in the lockfile can no longer change the bytes at a CDN path that is
 *     already published.
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
import { pathToFileURL } from 'url';
import { findMissingNativeOptionalDep } from '../azure-pipelines/common/checkNativeOptionalDeps.ts';
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

		// The SDK ships its native binary in a per-platform package declared as
		// an *optional* dependency (e.g. `@openai/codex-linux-x64`). npm does not
		// fail when an optional dependency can't be installed, so a transient
		// registry hiccup can leave the base package present but the native
		// package missing — which would silently produce a binary-less tarball
		// and upload it to the (immutable, content-addressed) CDN path, failing
		// only at runtime for end users. Fail loud here instead.
		// See https://github.com/microsoft/vscode/pull/323881.
		const missingNativeDep = findMissingNativeOptionalDep(nodeModulesDir, packageName, args.sdkTarget);
		if (missingNativeDep) {
			throw new Error(`[${SCRIPT}] npm ci left ${packageName}@${sdkVersion} without its native package '${missingNativeDep}' for target ${args.sdkTarget} — the optional dependency was silently skipped. Refusing to build a binary-less tarball; re-run to re-fetch it.`);
		}

		chmodPlatformBinaries(nodeModulesDir, args.sdk, args.sdkTarget);

		// Runs last, so it inspects the tree exactly as `buildTarball` will
		// collect it, including the executable bits just set above.
		verifyStagedTree(args.sdk, stagingDir, args.sdkTarget, sdkVersion);

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


/** Both SDKs suffix their native binary with `.exe` on win32 targets. */
function exeName(base: string, sdkTarget: string): string {
	return sdkTarget.startsWith('win32') ? `${base}.exe` : base;
}

/**
 * Chmod the executable binaries in an extracted node_modules tree. The layout
 * differs per SDK: claude ships one binary at the root of its platform
 * package, codex nests it under `vendor/<rust-triple>/bin/`.
 */
function chmodPlatformBinaries(nodeModulesDir: string, sdk: Sdk, sdkTarget: string): void {
	if (sdk === 'claude') {
		const scopeDir = path.join(nodeModulesDir, '@anthropic-ai');
		if (!fs.existsSync(scopeDir)) {
			return;
		}
		for (const child of fs.readdirSync(scopeDir)) {
			if (!child.startsWith('claude-agent-sdk-')) {
				continue;
			}
			const binary = path.join(scopeDir, child, exeName('claude', sdkTarget));
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

/**
 * Checks the staged tree the way the agent host will consume it, before the
 * bytes become immutable on the CDN.
 *
 * Every SDK needs a case: `Sdk` is an open string type, so a new folder under
 * `agents/` would otherwise inherit `--omit=peer` unchecked. What gets checked
 * is per-SDK, since claude's tarball is imported as JS and codex's is only ever
 * spawned. See "Keeping the assumption honest" in README.md.
 */
function verifyStagedTree(sdk: Sdk, stagingDir: string, sdkTarget: string, sdkVersion: string): void {
	const nodeModulesDir = path.join(stagingDir, 'node_modules');
	switch (sdk) {
		case 'claude':
			verifyClaudeSdkLoads(stagingDir, sdkVersion);
			// `sdk.mjs` resolves this lazily, at query time, so the load probe
			// above never touches it.
			assertStagedBinary(
				path.join(nodeModulesDir, '@anthropic-ai', `claude-agent-sdk-${sdkTarget}`, exeName('claude', sdkTarget)),
				`claude-agent-sdk@${sdkVersion} (${sdkTarget})`,
			);
			return;
		case 'codex':
			verifyCodexBinaryLayout(nodeModulesDir, sdkTarget, sdkVersion);
			return;
		default:
			throw new Error(`[${SCRIPT}] No staged-tree verification defined for SDK '${sdk}'. Add a case to verifyStagedTree() describing how the agent host consumes its tarball; see build/agent-sdk/README.md.`);
	}
}

/**
 * Present, non-empty, executable. The mode check is skipped on Windows hosts,
 * where `fs.chmodSync` only toggles the read-only flag so the POSIX bits it
 * reports back mean nothing.
 */
function assertStagedBinary(binaryPath: string, context: string): void {
	let stat: fs.Stats;
	try {
		stat = fs.statSync(binaryPath);
	} catch {
		throw new Error(`[${SCRIPT}] ${context}: no native binary at '${binaryPath}'. The agent host resolves exactly this path at runtime.`);
	}
	if (stat.size === 0) {
		throw new Error(`[${SCRIPT}] ${context}: the native binary at '${binaryPath}' is empty.`);
	}
	if (process.platform !== 'win32' && (stat.mode & 0o111) === 0) {
		throw new Error(`[${SCRIPT}] ${context}: '${binaryPath}' is not executable (mode ${(stat.mode & 0o777).toString(8)}). chmodPlatformBinaries did not reach it.`);
	}
}

/**
 * codex is spawned from `codex-<target>/vendor/<rust-triple>/bin/codex[.exe]`.
 *
 * Asserts the structure `codexAgent.ts`'s `sdkTarget → triple` table rests on
 * rather than copying the table, which could drift and then validate a path
 * nothing uses. A renamed triple stays the runtime's to catch.
 */
function verifyCodexBinaryLayout(nodeModulesDir: string, sdkTarget: string, sdkVersion: string): void {
	const context = `codex@${sdkVersion} (${sdkTarget})`;
	const vendorDir = path.join(nodeModulesDir, '@openai', `codex-${sdkTarget}`, 'vendor');
	if (!fs.existsSync(vendorDir)) {
		throw new Error(`[${SCRIPT}] ${context}: no 'vendor' directory at '${vendorDir}'.`);
	}
	const triples = fs.readdirSync(vendorDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
	if (triples.length !== 1) {
		throw new Error(`[${SCRIPT}] ${context}: expected one rust-triple directory under '${vendorDir}', found ${triples.length}${triples.length ? ` (${triples.join(', ')})` : ''}. codexAgent.ts picks the triple from a fixed table, so anything else means that table needs revisiting.`);
	}
	assertStagedBinary(path.join(vendorDir, triples[0], 'bin', exeName('codex', sdkTarget)), context);
}

const PROBE_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Imports the packaged SDK and repeats `buildClientToolMcpServer`'s call shape
 * against it, with the peers absent (see `npmCi`).
 *
 * The SDK inlines MCP, zod and ajv today but never promised to, and its
 * `peerDependencies` block says otherwise. If that changes, this fails the
 * build with ERR_MODULE_NOT_FOUND instead of failing on a user's machine
 * against a tarball that is already immutable.
 *
 * Importing `sdk.mjs` alone would catch a static peer import (every static
 * import it has today is a node builtin), but not a lazily-resolved one, and
 * the SDK already resolves its native binary that way. So the probe calls
 * through: `createSdkMcpServer()` validates and converts the zod raw shape at
 * call time, which is where a de-inlined zod would be resolved. `tool()` is
 * only there to build its argument.
 *
 * Child process to keep the module out of this process's cache; timeout so a
 * stray handle fails the build instead of hanging the release job.
 */
function verifyClaudeSdkLoads(stagingDir: string, sdkVersion: string): void {
	const entry = path.join(stagingDir, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs');
	// Resolves from this file, so it lands on the repo's own zod. The staged
	// tree has none. This matches what the agent host passes in at runtime.
	const zodUrl = import.meta.resolve('zod');
	// At the staging root, so it is outside what `buildTarball` collects.
	const probePath = path.join(stagingDir, 'sdk-load-probe.mjs');
	fs.writeFileSync(probePath, [
		// File-URL dynamic import, as in `claudeAgentSdkService.ts`.
		`const sdk = await import(${JSON.stringify(pathToFileURL(entry).href)});`,
		`const { z } = await import(${JSON.stringify(zodUrl)});`,
		// Only the exports that would reach for a peer. Drift across the full
		// binding set is `_assertBindingsMatchSdk`'s job, at compile time.
		`for (const name of ['query', 'tool', 'createSdkMcpServer']) {`,
		`	if (typeof sdk[name] !== 'function') { throw new Error('SDK export missing or not callable: ' + name); }`,
		`}`,
		`const probeTool = sdk.tool(`,
		`	'agent_sdk_package_probe',`,
		`	'Exercises tool() during packaging; never bound to a real session.',`,
		`	{ query: z.string(), limit: z.number().optional() },`,
		`	async () => ({ content: [{ type: 'text', text: 'ok' }] }),`,
		`);`,
		`sdk.createSdkMcpServer({ name: 'agent-sdk-package-probe', tools: [probeTool] });`,
		'',
	].join('\n'));

	console.log(`[${SCRIPT}] Verifying the SDK loads without its peerDependencies…`);
	const result = spawnSync(process.execPath, [probePath], { cwd: stagingDir, stdio: 'inherit', timeout: PROBE_TIMEOUT_MS });
	if (result.signal) {
		throw new Error(`[${SCRIPT}] SDK load probe was killed by ${result.signal}. For SIGTERM that means it hit the ${PROBE_TIMEOUT_MS}ms timeout, so claude-agent-sdk@${sdkVersion} left a timer or handle open instead of exiting.`);
	}
	if (result.error) {
		throw new Error(`[${SCRIPT}] SDK load probe failed to spawn: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(`[${SCRIPT}] claude-agent-sdk@${sdkVersion} does not load with its peerDependencies omitted (probe exited ${result.status}; see output above). It likely stopped inlining a peer such as '@modelcontextprotocol/sdk' or 'zod'. Either drop '--omit=peer' from npmCi or add that package as a real dependency in build/agent-sdk/agents/claude/package.json.`);
	}
}

function npmCi(workDir: string, env: NodeJS.ProcessEnv): void {
	// `npm ci` rather than `npm install`: installs the exact graph from the
	// committed package-lock.json without resolving versions, which is what
	// makes the tarball bytes reproducible across runs.
	// `--ignore-scripts` blocks any pre/postinstall the SDK or its deps ship.
	// `--omit=peer` drops the auto-installed peerDependencies, which the agent
	// host never loads out of the tarball. That makes the bytes a function of
	// (SDK version, target) alone, so a transitive peer bump can no longer
	// change the content at an already-published CDN path. That was the failure
	// mode of https://github.com/microsoft/vscode/pull/334094.
	// `verifyStagedTree` keeps the "never loads them" claim honest; README.md
	// has the long version.
	// Unlike `--omit=optional`, this does not touch the native binary package.
	// On Windows, npm is a `.cmd` shim. Two things matter:
	//   1. The explicit `.cmd` suffix — Node won't resolve PATHEXT.
	//   2. `shell: true` — since Node 20 (CVE-2024-27980) child_process
	//      refuses to spawn .cmd/.bat without it.
	const isWindows = process.platform === 'win32';
	const npm = isWindows ? 'npm.cmd' : 'npm';
	const result = spawnSync(npm, ['ci', '--ignore-scripts', '--omit=peer'], {
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
