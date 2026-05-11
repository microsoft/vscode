/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared SEA packaging pipeline. The per-platform driver scripts
 * (`package-macos-arm64.mjs`, `package-linux-x64.mjs`,
 * `package-windows-x64.mjs`) call `runPipeline()` with a platform descriptor
 * that captures the bits that differ between targets:
 *
 *   - the Node tarball URL + extraction layout (Mach-O vs ELF vs PE);
 *   - the postject flags (Mach-O segment name is darwin-only);
 *   - whether to codesign the result (macOS only);
 *   - the npm install `--os` / `--cpu` flags that pin the optional-dep
 *     binaries (ripgrep, tree-sitter, etc.) to the target platform;
 *   - the on-disk shim format inside `node_modules/.bin/` (Unix uses
 *     symlinks with `#!/usr/bin/env node` shebangs; Windows uses
 *     `.cmd` files that call `node`).
 *
 * Everything else (esbuild bundling, SEA blob generation, vendor archive,
 * smoke tests) is shared.
 *
 * The pipeline steps are:
 *
 *   1.  Bundle src/seaEntry.ts → dist-bundle/cli.cjs (esbuild).
 *   2.  Vendor: `npm install --prefix dist-bundle/vendor` the upstream
 *       Claude Code + Codex CLIs with `--os <target> --cpu <target>` so the
 *       resulting node_modules/ tree carries the *target* platform's
 *       optional-dep binaries, even when running on a different host.
 *   3.  Rewrite bin shims so they re-enter via the SEA binary's trampoline
 *       mode (`sota --sota-run-node <script>`).
 *   4.  Tar+gzip the vendor tree → dist-bundle/vendor.tgz.
 *   5.  Collect license texts → dist-bundle/THIRD_PARTY_LICENSES.txt.
 *   6.  Emit sea-config.json with the bundle + prompts + vendor.tgz assets.
 *   7.  Generate the SEA blob via a SEA-capable Node (cached under
 *       ~/.cache/sota-sea/<target>/).
 *   8.  Copy the target's Node binary, inject the blob via postject.
 *   9.  Re-sign (Mach-O only).
 *   10. Smoke (only when the target == host).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { build as esbuild } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const CLI_ROOT = resolve(__dirname, '..', '..');
export const REPO_ROOT = resolve(CLI_ROOT, '..');
export const CORE_DIST = resolve(REPO_ROOT, 'son-of-anton-core', 'dist');
export const PROMPTS_DIR = resolve(CORE_DIST, 'agents', 'prompts');
export const OUT_DIR = resolve(CLI_ROOT, 'dist-bundle');
export const CLI_PKG_JSON = resolve(CLI_ROOT, 'package.json');

// Pin the upstream CLIs we vendor. Bump in lockstep with the local
// `claude --version` / `codex --version` you want to ship.
export const CLAUDE_CODE_VERSION = '2.1.138';
export const CODEX_VERSION = '0.130.0';

// Node version used for the SEA host. Bump in lockstep with the esbuild
// `target` field below and with PACKAGING.md.
export const NODE_VERSION = 'v22.20.0';

const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function log(step, msg) {
	process.stdout.write(`\x1b[1m[${step}]\x1b[0m ${msg}\n`);
}

function ensureCleanOutDir() {
	if (existsSync(OUT_DIR)) {
		rmSync(OUT_DIR, { recursive: true, force: true });
	}
	mkdirSync(OUT_DIR, { recursive: true });
}

// --- Step 1 ---------------------------------------------------------------
async function bundleEntry(bundlePath) {
	log('1/10', `esbuild ${relative(CLI_ROOT, bundlePath)}`);
	const result = await esbuild({
		entryPoints: [resolve(CLI_ROOT, 'src', 'seaEntry.ts')],
		outfile: bundlePath,
		bundle: true,
		platform: 'node',
		target: 'node22',
		format: 'cjs',
		external: [],
		minify: false,
		sourcemap: false,
		keepNames: true,
		logLevel: 'warning',
	});
	if (result.errors.length) {
		console.error('esbuild errors:', result.errors);
		process.exit(1);
	}
	const sizeMb = (statSync(bundlePath).size / 1024 / 1024).toFixed(2);
	log('1/10', `bundle written, ${sizeMb} MiB`);
}

// --- Step 2 ---------------------------------------------------------------
function installVendor(vendorDir, target) {
	log('2/10', `npm install vendor CLIs (${target.os}/${target.cpu})`);
	mkdirSync(vendorDir, { recursive: true });
	// Seed an empty package.json so npm doesn't walk up to the parent and
	// pick up unrelated dependencies. `--prefix` alone isn't enough — npm
	// requires a package.json in the prefix dir to install into.
	writeFileSync(
		resolve(vendorDir, 'package.json'),
		JSON.stringify({ name: 'sota-vendor', version: '0.0.0', private: true }, null, 2) + '\n',
	);
	const args = [
		'install',
		'--no-save',
		'--no-package-lock',
		'--no-audit',
		'--no-fund',
		'--prefix', vendorDir,
		'--os', target.os,
		'--cpu', target.cpu,
		`@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}`,
		`@openai/codex@${CODEX_VERSION}`,
	];
	const r = spawnSync('npm', args, { stdio: 'inherit', cwd: vendorDir });
	if (r.status !== 0) {
		console.error('vendor npm install failed');
		process.exit(r.status ?? 1);
	}
	// Verify the bin shims actually appeared. The optional-dep mechanic
	// silently no-ops on a platform mismatch, so we'd rather fail loudly here
	// than ship a vendor tree that boots into an ENOENT at runtime.
	const binDir = resolve(vendorDir, 'node_modules', '.bin');
	if (!existsSync(binDir)) {
		console.error(`vendor install produced no node_modules/.bin: ${binDir}`);
		process.exit(1);
	}
	const binEntries = readdirSync(binDir);
	const missing = ['claude', 'codex'].filter(
		name => !binEntries.includes(name) && !binEntries.includes(`${name}.cmd`) && !binEntries.includes(`${name}.exe`),
	);
	if (missing.length) {
		console.error(`vendor missing bin shims: ${missing.join(', ')}\nGot: ${binEntries.join(', ')}`);
		process.exit(1);
	}
}

// --- Step 3 ---------------------------------------------------------------
function rewriteBinShims(vendorDir, target) {
	log('3/10', `rewrite bin shims (${target.exeFormat})`);
	const binDir = resolve(vendorDir, 'node_modules', '.bin');
	for (const name of ['claude', 'codex']) {
		if (target.exeFormat === 'windows') {
			rewriteWindowsShim(binDir, name);
		} else {
			rewriteUnixShim(binDir, name);
		}
	}
}

/**
 * On Unix, npm creates `node_modules/.bin/<name>` as a symlink pointing at
 * the package's main bin target. That target is one of two flavours:
 *
 *   - **JavaScript launcher** (e.g. `@openai/codex` → `bin/codex.js` with a
 *     `#!/usr/bin/env node` shebang). The vendored copy needs a Node
 *     interpreter to run, but a SEA binary cannot host arbitrary JS, so we
 *     wrap it in a sh script that re-enters via the SEA trampoline
 *     (`--sota-run-node`).
 *
 *   - **Native binary** (e.g. `@anthropic-ai/claude-code` 2.x →
 *     `bin/claude.exe`, despite the `.exe` suffix it's a Mach-O / ELF /
 *     PE for the host platform shipped via optional-dep packages). The
 *     vendored copy is directly executable; we wrap it in a sh script that
 *     just `exec`s it with the same argv so PATH discovery hits something
 *     marked executable rather than the underlying native binary directly
 *     (which would still work but bypasses our control point).
 */
function rewriteUnixShim(binDir, name) {
	const shimPath = resolve(binDir, name);
	if (!existsSync(shimPath)) {
		return;
	}
	const realPath = readSymlinkOrFile(shimPath);
	const relScript = relativeFromBin(binDir, realPath);
	const flavour = classifyBinTarget(realPath);
	rmSync(shimPath, { force: true });
	let wrapper;
	if (flavour === 'native') {
		wrapper = [
			'#!/bin/sh',
			'# Auto-generated by sota packager. Exec native binary directly.',
			'DIR="$(cd "$(dirname "$0")" && pwd)"',
			`exec "$DIR/${relScript}" "$@"`,
			'',
		].join('\n');
	} else {
		wrapper = [
			'#!/bin/sh',
			'# Auto-generated by sota packager. Re-enter through the SEA binary.',
			'DIR="$(cd "$(dirname "$0")" && pwd)"',
			`exec "__SOTA_BIN__" --sota-run-node "$DIR/${relScript}" "$@"`,
			'',
		].join('\n');
	}
	writeFileSync(shimPath, wrapper);
	chmodSync(shimPath, 0o755);
}

/**
 * Tell native binaries from JS launcher scripts by sniffing the first few
 * bytes. We treat ELF (`\x7fELF`), Mach-O (multiple magic numbers), and PE
 * (`MZ`) as native. Anything textual (shebang, plain JS) is treated as a
 * launcher. We also fall back to the `.exe` suffix on Windows, since
 * package authors sometimes name their native binaries `.exe` regardless
 * of host platform.
 */
function classifyBinTarget(filePath) {
	try {
		const head = readFileSync(filePath).slice(0, 4);
		// ELF
		if (head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) {
			return 'native';
		}
		// Mach-O (32-bit, 64-bit, fat, both endiannesses)
		const magic = head.readUInt32BE(0);
		if (
			magic === 0xfeedface || magic === 0xfeedfacf ||
			magic === 0xcefaedfe || magic === 0xcffaedfe ||
			magic === 0xcafebabe || magic === 0xbebafeca
		) {
			return 'native';
		}
		// PE / MS-DOS
		if (head[0] === 0x4d && head[1] === 0x5a) {
			return 'native';
		}
	} catch {
		// Fall through.
	}
	if (filePath.endsWith('.exe')) {
		return 'native';
	}
	return 'script';
}

/**
 * On Windows, npm-cmd-shim generates `<name>.cmd` and a sibling
 * extension-less posix shim (for MSYS / git-bash). We rewrite both. As on
 * Unix the underlying bin target may be either a JS launcher (codex) or a
 * native PE (claude 2.x); the wrapper format differs accordingly.
 */
function rewriteWindowsShim(binDir, name) {
	const cmdPath = resolve(binDir, `${name}.cmd`);
	const psPath = resolve(binDir, `${name}.ps1`);
	const shPath = resolve(binDir, name);
	// Discover the target script/binary path from the original .cmd. npm
	// emits a line like:
	//   "%~dp0\node.exe" "%~dp0\..\@scope\pkg\bin\foo.js" %*
	// or for native bins shipped via optional deps:
	//   "%~dp0\..\@scope\pkg-win32-x64\bin\foo.exe" %*
	let script = `..\\@anthropic-ai\\claude-code\\bin\\claude.exe`;
	if (existsSync(cmdPath)) {
		const cmdContents = readFileSync(cmdPath, 'utf8');
		const match = cmdContents.match(/"%~dp0\\([^"\n]+\.(?:[mc]?js|exe))"/i);
		if (match) {
			script = match[1];
		}
	}
	const resolvedTarget = resolve(binDir, script);
	const flavour = classifyBinTarget(resolvedTarget);
	let cmdWrapper;
	if (flavour === 'native') {
		cmdWrapper = [
			'@ECHO OFF',
			'SETLOCAL',
			`"%~dp0\\${script}" %*`,
			'ENDLOCAL',
			'EXIT /B %ERRORLEVEL%',
			'',
		].join('\r\n');
	} else {
		cmdWrapper = [
			'@ECHO OFF',
			'SETLOCAL',
			`"__SOTA_BIN__" --sota-run-node "%~dp0\\${script}" %*`,
			'ENDLOCAL',
			'EXIT /B %ERRORLEVEL%',
			'',
		].join('\r\n');
	}
	writeFileSync(cmdPath, cmdWrapper);
	// Best-effort: remove the PowerShell variant (it's the same payload
	// re-implemented in PS, and would otherwise still hit `node` from PATH).
	if (existsSync(psPath)) {
		rmSync(psPath, { force: true });
	}
	if (existsSync(shPath)) {
		rmSync(shPath, { force: true });
		const scriptPosix = script.replace(/\\/g, '/');
		let shWrapper;
		if (flavour === 'native') {
			shWrapper = [
				'#!/bin/sh',
				'# Auto-generated by sota packager. Exec native binary directly.',
				'DIR="$(cd "$(dirname "$0")" && pwd)"',
				`exec "$DIR/${scriptPosix}" "$@"`,
				'',
			].join('\n');
		} else {
			shWrapper = [
				'#!/bin/sh',
				'# Auto-generated by sota packager. Re-enter through the SEA binary.',
				'DIR="$(cd "$(dirname "$0")" && pwd)"',
				`exec "__SOTA_BIN__" --sota-run-node "$DIR/${scriptPosix}" "$@"`,
				'',
			].join('\n');
		}
		writeFileSync(shPath, shWrapper);
		chmodSync(shPath, 0o755);
	}
}

function readSymlinkOrFile(p) {
	// npm's .bin entries are usually symlinks; on some filesystems (e.g.
	// Windows without symlink perms, or shared volumes on macOS) they're
	// hard-linked copies of the JS file directly. Handle both.
	try {
		return realpathSync(p);
	} catch {
		return p;
	}
}

function relativeFromBin(binDir, realPath) {
	const rel = relative(binDir, realPath);
	// Always use POSIX-style separators in the sh wrapper.
	return rel.split('\\').join('/');
}

// --- Step 4 ---------------------------------------------------------------
function archiveVendor(vendorDir, archivePath) {
	log('4/10', `tar+gzip vendor → ${relative(CLI_ROOT, archivePath)}`);
	// Use system `tar` (available on macOS, Linux, and Windows 10+). The
	// runtime extraction step in seaEntry.ts uses the same tool, so we keep
	// the build/runtime symmetric.
	const r = spawnSync('tar', ['-czf', archivePath, '-C', vendorDir, 'node_modules'], { stdio: 'inherit' });
	if (r.status !== 0) {
		console.error('vendor tar failed');
		process.exit(r.status ?? 1);
	}
	const sizeMb = (statSync(archivePath).size / 1024 / 1024).toFixed(2);
	log('4/10', `vendor.tgz ${sizeMb} MiB`);
}

// --- Step 5 ---------------------------------------------------------------
function collectLicenses(vendorDir, licensesPath) {
	log('5/10', `collect licenses → ${relative(CLI_ROOT, licensesPath)}`);
	const nodeModules = resolve(vendorDir, 'node_modules');
	if (!existsSync(nodeModules)) {
		writeFileSync(licensesPath, '# No vendored packages found.\n');
		return;
	}
	const out = [
		'# Third-party licenses bundled with sota',
		'',
		'This file is auto-generated by the sota packager. It lists licenses for',
		`packages bundled inside the vendor archive (claude-code@${CLAUDE_CODE_VERSION},`,
		`codex@${CODEX_VERSION}, plus all transitive runtime deps).`,
		'',
	];
	const pkgs = walkPackages(nodeModules);
	for (const pkgDir of pkgs) {
		const pj = safeReadJson(resolve(pkgDir, 'package.json'));
		if (!pj?.name) {
			continue;
		}
		const licenseText = readFirstExisting(pkgDir, [
			'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'License', 'License.md',
			'LICENCE', 'LICENCE.md', 'LICENCE.txt',
		]);
		out.push('## ' + pkgDir.slice(nodeModules.length + 1));
		out.push(`Name:    ${pj.name}`);
		out.push(`Version: ${pj.version ?? 'unknown'}`);
		out.push(`License: ${pj.license ?? pj.licenses ?? 'unknown'}`);
		out.push('');
		if (licenseText) {
			out.push(licenseText.trimEnd());
		} else {
			out.push('(no LICENSE file shipped in the package)');
		}
		out.push('', '---', '');
	}
	writeFileSync(licensesPath, out.join('\n') + '\n');
}

function walkPackages(rootNodeModules) {
	const results = [];
	function walk(dir) {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const ent of entries) {
			if (!ent.isDirectory() && !ent.isSymbolicLink()) {
				continue;
			}
			const full = resolve(dir, ent.name);
			if (ent.name.startsWith('@')) {
				walk(full);
				continue;
			}
			if (ent.name === '.bin' || ent.name === '.package-lock.json') {
				continue;
			}
			if (existsSync(resolve(full, 'package.json'))) {
				results.push(full);
			}
			const nested = resolve(full, 'node_modules');
			if (existsSync(nested)) {
				walk(nested);
			}
		}
	}
	walk(rootNodeModules);
	return results;
}

function safeReadJson(path) {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return undefined;
	}
}

function readFirstExisting(dir, names) {
	for (const name of names) {
		const p = resolve(dir, name);
		if (existsSync(p)) {
			try {
				return readFileSync(p, 'utf8');
			} catch {
				return undefined;
			}
		}
	}
	return undefined;
}

// --- Step 6 ---------------------------------------------------------------
function writeSeaConfig(target, paths) {
	const promptFiles = readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.prompt.md'));
	const assets = Object.fromEntries(
		promptFiles.map(f => [f, join(PROMPTS_DIR, f)]),
	);
	assets['vendor.tgz'] = paths.vendorArchive;
	const cfg = {
		main: relative(CLI_ROOT, paths.bundle),
		output: relative(CLI_ROOT, paths.blob),
		disableExperimentalSEAWarning: true,
		useSnapshot: false,
		// V8 code cache is keyed to the producing platform. Cross-builds
		// (e.g. linux-x64 from a darwin-arm64 host) crash on startup if we
		// embed a host-built cache; keep useCodeCache off for them and only
		// enable it when we're building for the running platform.
		useCodeCache: target.matchesHost,
		assets,
	};
	writeFileSync(paths.seaConfig, JSON.stringify(cfg, null, 2) + '\n');
	log('6/10', `sea-config.json written (${promptFiles.length} prompts + vendor.tgz, useCodeCache=${cfg.useCodeCache})`);
}

// --- Step 7 ---------------------------------------------------------------
/**
 * Ensure two Node binaries are available:
 *
 *   - **producer**: a SEA-capable Node that runs on the *host*. Used to
 *     generate the SEA blob (`node --experimental-sea-config …`). The
 *     blob format only depends on the producer's Node major matching the
 *     target's Node major; arch differences are fine.
 *   - **target**: the actual Node binary that becomes `dist-bundle/<bin>`
 *     after blob injection. Must match the target OS/CPU.
 *
 * For host builds these are usually the same binary; for cross builds they
 * are different and both are cached under `~/.cache/sota-sea/`.
 */
function ensureNodeBinaries(target) {
	const producerCacheKey = describeHost();
	const producerNode = ensureNodeForPlatform({
		id: producerCacheKey.id,
		nodeArchiveName: producerCacheKey.nodeArchiveName,
		nodeDir: producerCacheKey.nodeDir,
		nodeExeRelative: producerCacheKey.nodeExeRelative,
		isProducer: true,
	});
	const targetNode = target.matchesHost
		? producerNode
		: ensureNodeForPlatform({ ...target, isProducer: false });
	return { producerNode, targetNode };
}

function describeHost() {
	if (process.platform === 'darwin' && process.arch === 'arm64') {
		return {
			id: 'darwin-arm64-host',
			nodeArchiveName: `node-${NODE_VERSION}-darwin-arm64.tar.gz`,
			nodeDir: `node-${NODE_VERSION}-darwin-arm64`,
			nodeExeRelative: 'bin/node',
		};
	}
	if (process.platform === 'darwin' && process.arch === 'x64') {
		return {
			id: 'darwin-x64-host',
			nodeArchiveName: `node-${NODE_VERSION}-darwin-x64.tar.gz`,
			nodeDir: `node-${NODE_VERSION}-darwin-x64`,
			nodeExeRelative: 'bin/node',
		};
	}
	if (process.platform === 'linux' && process.arch === 'x64') {
		return {
			id: 'linux-x64-host',
			nodeArchiveName: `node-${NODE_VERSION}-linux-x64.tar.xz`,
			nodeDir: `node-${NODE_VERSION}-linux-x64`,
			nodeExeRelative: 'bin/node',
		};
	}
	if (process.platform === 'linux' && process.arch === 'arm64') {
		return {
			id: 'linux-arm64-host',
			nodeArchiveName: `node-${NODE_VERSION}-linux-arm64.tar.xz`,
			nodeDir: `node-${NODE_VERSION}-linux-arm64`,
			nodeExeRelative: 'bin/node',
		};
	}
	if (process.platform === 'win32' && process.arch === 'x64') {
		return {
			id: 'win-x64-host',
			nodeArchiveName: `node-${NODE_VERSION}-win-x64.zip`,
			nodeDir: `node-${NODE_VERSION}-win-x64`,
			nodeExeRelative: 'node.exe',
		};
	}
	console.error(`unsupported host platform: ${process.platform}/${process.arch}`);
	process.exit(1);
}

function ensureNodeForPlatform(spec) {
	const cacheRoot = resolve(homedir(), '.cache', 'sota-sea');
	const targetDir = resolve(cacheRoot, spec.nodeDir);
	const cachedNode = resolve(targetDir, spec.nodeExeRelative);
	if (spec.isProducer) {
		if (hasFuse(process.execPath)) {
			log('7a/10', `producer: ${process.execPath} (running interpreter, SEA fuse present)`);
			return process.execPath;
		}
		if (existsSync(cachedNode) && hasFuse(cachedNode)) {
			log('7a/10', `producer: ${cachedNode} (cached, SEA fuse present)`);
			return cachedNode;
		}
	} else if (existsSync(cachedNode)) {
		log('7a/10', `target Node cached at ${cachedNode}`);
		return cachedNode;
	}
	log('7a/10', `downloading official Node ${NODE_VERSION} (${spec.id})`);
	mkdirSync(cacheRoot, { recursive: true });
	const archivePath = resolve(cacheRoot, spec.nodeArchiveName);
	if (!existsSync(archivePath)) {
		const url = `https://nodejs.org/dist/${NODE_VERSION}/${spec.nodeArchiveName}`;
		const dl = spawnSync('curl', ['-fL', '-o', archivePath, url], { stdio: 'inherit' });
		if (dl.status !== 0) {
			console.error(`failed to download ${url}`);
			process.exit(dl.status ?? 1);
		}
	}
	extractNodeArchive(archivePath, cacheRoot, spec);
	if (!existsSync(cachedNode)) {
		console.error(`extracted Node not found at ${cachedNode}`);
		process.exit(1);
	}
	if (spec.isProducer && !hasFuse(cachedNode)) {
		console.error(`downloaded producer Node missing SEA fuse at ${cachedNode}`);
		process.exit(1);
	}
	return cachedNode;
}

function extractNodeArchive(archivePath, destDir, target) {
	if (target.nodeArchiveName.endsWith('.zip')) {
		const r = spawnSync('unzip', ['-q', '-o', archivePath, '-d', destDir], { stdio: 'inherit' });
		if (r.status !== 0) {
			console.error('unzip failed for Windows Node tarball');
			process.exit(r.status ?? 1);
		}
		return;
	}
	if (target.nodeArchiveName.endsWith('.tar.xz')) {
		const r = spawnSync('tar', ['-xJf', archivePath, '-C', destDir], { stdio: 'inherit' });
		if (r.status !== 0) {
			console.error('tar -xJ failed (xz not available?)');
			process.exit(r.status ?? 1);
		}
		return;
	}
	const r = spawnSync('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'inherit' });
	if (r.status !== 0) {
		console.error('tar -xz failed');
		process.exit(r.status ?? 1);
	}
}

function hasFuse(binary) {
	try {
		const content = readFileSync(binary);
		return content.indexOf(SEA_FUSE) !== -1;
	} catch {
		return false;
	}
}

function generateBlob(producerNode, seaConfig, blobPath) {
	log('7/10', `generate SEA blob via ${relative(homedir(), producerNode)}`);
	const r = spawnSync(producerNode, ['--experimental-sea-config', seaConfig], {
		stdio: 'inherit',
		cwd: CLI_ROOT,
	});
	if (r.status !== 0) {
		console.error('SEA blob generation failed');
		process.exit(r.status ?? 1);
	}
	if (!existsSync(blobPath)) {
		console.error(`blob missing at ${blobPath}`);
		process.exit(1);
	}
}

// --- Step 8 ---------------------------------------------------------------
function copyNodeBinary(target, paths) {
	log('8a/10', `copy ${target.id} Node → ${relative(CLI_ROOT, paths.binary)}`);
	copyFileSync(paths.sourceNode, paths.binary);
	// Some Homebrew installs ship 0555; postject needs to write.
	try {
		chmodSync(paths.binary, 0o755);
	} catch {
		// Windows ignores chmod; postject doesn't care.
	}
}

function inject(target, paths) {
	log('8b/10', 'postject inject');
	const postjectArgs = [
		'--yes',
		'postject',
		paths.binary,
		'NODE_SEA_BLOB',
		paths.blob,
		'--sentinel-fuse', SEA_FUSE,
		'--overwrite',
	];
	if (target.exeFormat === 'macho') {
		postjectArgs.push('--macho-segment-name', 'NODE_SEA');
	}
	const r = spawnSync('npx', postjectArgs, { stdio: 'inherit', cwd: CLI_ROOT });
	if (r.status !== 0) {
		console.error('postject failed');
		process.exit(r.status ?? 1);
	}
}

// --- Step 9 ---------------------------------------------------------------
function reSign(target, paths) {
	if (target.exeFormat !== 'macho') {
		log('9/10', `skip codesign (${target.exeFormat})`);
		return;
	}
	if (!target.matchesHost) {
		log('9/10', 'skip codesign (cross-build; sign on the macOS host before distribution)');
		return;
	}
	log('9/10', 'codesign --remove-signature && --sign -');
	const strip = spawnSync('codesign', ['--remove-signature', paths.binary], { stdio: 'inherit' });
	if (strip.status !== 0) {
		console.error('codesign --remove-signature failed');
		process.exit(strip.status ?? 1);
	}
	const sign = spawnSync('codesign', ['--sign', '-', paths.binary], { stdio: 'inherit' });
	if (sign.status !== 0) {
		console.error('codesign --sign - failed');
		process.exit(sign.status ?? 1);
	}
}

// --- Step 10 --------------------------------------------------------------
function smoke(target, paths) {
	const sizeMb = (statSync(paths.binary).size / 1024 / 1024).toFixed(2);
	if (!target.matchesHost) {
		log('10/10', `skip smoke (cross-build); produced ${relative(CLI_ROOT, paths.binary)} (${sizeMb} MiB)`);
		return;
	}
	log('10/10', `smoke ${relative(CLI_ROOT, paths.binary)} --version`);
	const r = spawnSync(paths.binary, ['--version'], { stdio: 'pipe' });
	const out = (r.stdout?.toString() ?? '') + (r.stderr?.toString() ?? '');
	process.stdout.write(out);
	if (r.status !== 0) {
		console.error('smoke test failed');
		process.exit(r.status ?? 1);
	}
	log('done', `${relative(CLI_ROOT, paths.binary)} (${sizeMb} MiB)`);
}

// --- Driver --------------------------------------------------------------
export async function runPipeline(target) {
	if (!existsSync(PROMPTS_DIR)) {
		console.error(`prompts dir missing: ${PROMPTS_DIR}\nRun 'npm run build' in son-of-anton-core first.`);
		process.exit(1);
	}
	ensureCleanOutDir();
	const paths = {
		bundle: resolve(OUT_DIR, 'cli.cjs'),
		seaConfig: resolve(CLI_ROOT, 'sea-config.json'),
		blob: resolve(OUT_DIR, target.blobName),
		binary: resolve(OUT_DIR, target.binaryName),
		vendorDir: resolve(OUT_DIR, 'vendor'),
		vendorArchive: resolve(OUT_DIR, 'vendor.tgz'),
		licenses: resolve(OUT_DIR, 'THIRD_PARTY_LICENSES.txt'),
		sourceNode: '',
	};
	await bundleEntry(paths.bundle);
	installVendor(paths.vendorDir, target);
	rewriteBinShims(paths.vendorDir, target);
	archiveVendor(paths.vendorDir, paths.vendorArchive);
	collectLicenses(paths.vendorDir, paths.licenses);
	writeSeaConfig(target, paths);
	const { producerNode, targetNode } = ensureNodeBinaries(target);
	paths.sourceNode = targetNode;
	generateBlob(producerNode, paths.seaConfig, paths.blob);
	copyNodeBinary(target, paths);
	inject(target, paths);
	reSign(target, paths);
	// Clean the unpacked vendor directory now that it's archived — keeps
	// dist-bundle/ smaller and avoids developers shipping the loose tree
	// alongside the binary by accident.
	rmSync(paths.vendorDir, { recursive: true, force: true });
	smoke(target, paths);
}

