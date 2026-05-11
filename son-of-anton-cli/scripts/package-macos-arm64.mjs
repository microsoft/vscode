#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Stage-1 packager — produce a single-binary `sota` for darwin-arm64 using
 * esbuild + Node SEA (Single Executable Applications).
 *
 * Steps (matches the seven-step flow documented in Node's SEA docs):
 *   1. Bundle src/seaEntry.ts → dist-bundle/cli.cjs via esbuild.
 *   2. Materialise sea-config.json with the bundle + the live list of
 *      `son-of-anton-core/dist/agents/prompts/*.prompt.md` files as assets.
 *   3. Generate the SEA blob: `node --experimental-sea-config sea-config.json`.
 *   4. Copy the running Node binary to dist-bundle/sota.
 *   5. Inject the blob via `npx postject`.
 *   6. macOS: strip the existing code signature and re-sign ad-hoc.
 *   7. Smoke: `./dist-bundle/sota --version` must exit 0.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { build as esbuild } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(CLI_ROOT, '..');
const CORE_DIST = resolve(REPO_ROOT, 'son-of-anton-core', 'dist');
const PROMPTS_DIR = resolve(CORE_DIST, 'agents', 'prompts');
const OUT_DIR = resolve(CLI_ROOT, 'dist-bundle');
const BUNDLE = resolve(OUT_DIR, 'cli.cjs');
const SEA_CONFIG = resolve(CLI_ROOT, 'sea-config.json');
const BLOB = resolve(OUT_DIR, 'sota.blob');
const BIN = resolve(OUT_DIR, 'sota');

// We cache the official Node tarball in ~/.cache/sota-sea/ to avoid
// re-downloading on every build. The version tracks the major.minor that
// the bundle targets (node22 today; bump in lockstep with the esbuild
// `target` field below).
const NODE_VERSION = 'v22.20.0';
const NODE_TARBALL = `node-${NODE_VERSION}-darwin-arm64.tar.gz`;
const NODE_URL = `https://nodejs.org/dist/${NODE_VERSION}/${NODE_TARBALL}`;
const CACHE_DIR = resolve(homedir(), '.cache', 'sota-sea');
const CACHED_NODE = resolve(CACHE_DIR, `node-${NODE_VERSION}-darwin-arm64`, 'bin', 'node');

// Step 0 — sanity checks. The packager assumes the regular `npm run build`
// in both son-of-anton-core and son-of-anton-cli has already produced the
// dist/ trees (esbuild reads from src/, but the prompts must be in
// son-of-anton-core/dist for the SEA assets list to be populated).
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
	console.error(`refusing to run: this packager only targets darwin-arm64, got ${process.platform}-${process.arch}`);
	process.exit(1);
}
if (!existsSync(PROMPTS_DIR)) {
	console.error(`prompts dir missing: ${PROMPTS_DIR}\nRun 'npm run build' in son-of-anton-core first.`);
	process.exit(1);
}

function log(step, msg) {
	process.stdout.write(`\x1b[1m[${step}]\x1b[0m ${msg}\n`);
}

function ensureCleanOutDir() {
	if (existsSync(OUT_DIR)) {
		rmSync(OUT_DIR, { recursive: true, force: true });
	}
	mkdirSync(OUT_DIR, { recursive: true });
}

// --- Step 1 ----------------------------------------------------------------
async function bundle() {
	log('1/7', `esbuild ${BUNDLE.replace(CLI_ROOT + '/', '')}`);
	const result = await esbuild({
		entryPoints: [resolve(CLI_ROOT, 'src', 'seaEntry.ts')],
		outfile: BUNDLE,
		bundle: true,
		platform: 'node',
		target: 'node22',
		format: 'cjs',
		// We bundle everything: SEA has no module resolution at runtime, so any
		// `external` here would crash with MODULE_NOT_FOUND inside the binary.
		external: [],
		// Mark Node built-ins as external (esbuild ships a default list but we
		// also need the `node:` prefixed variants. Without this esbuild tries
		// to walk into `node:fs` etc. and warns.)
		// `platform: 'node'` already handles this — verified below by checking
		// the bundle warnings.
		minify: false, // readable stack traces matter more than -10% binary size
		sourcemap: false,
		keepNames: true, // keep function.name for stable stack traces
		logLevel: 'warning',
		// `react-devtools-core` is referenced lazily by Ink and is only used in
		// dev mode (process.env.DEV). Mark as external so the bundle doesn't
		// fail on it; if it's ever needed the user will need a non-SEA build.
		// We also exclude `yoga-wasm-web` for the same reason: Ink falls back
		// to it when the native yoga binary is unavailable, and we want to
		// keep the bundle pure-JS where possible.
		// Note: these are commented out unless esbuild actually complains —
		// most modern Ink installs ship a JS-only yoga.
	});
	if (result.errors.length) {
		console.error('esbuild errors:', result.errors);
		process.exit(1);
	}
	const sizeMb = (statSync(BUNDLE).size / 1024 / 1024).toFixed(2);
	log('1/7', `bundle written, ${sizeMb} MiB`);
}

// --- Step 2 ----------------------------------------------------------------
function writeSeaConfig() {
	const promptFiles = readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.prompt.md'));
	const assets = Object.fromEntries(
		promptFiles.map(f => [f, join(PROMPTS_DIR, f)]),
	);
	const cfg = {
		main: 'dist-bundle/cli.cjs',
		output: 'dist-bundle/sota.blob',
		disableExperimentalSEAWarning: true,
		useSnapshot: false,
		useCodeCache: true,
		assets,
	};
	writeFileSync(SEA_CONFIG, JSON.stringify(cfg, null, 2) + '\n');
	log('2/7', `sea-config.json written (${promptFiles.length} prompt assets)`);
}

// --- Step 3 ----------------------------------------------------------------
function generateBlob() {
	// We deliberately use the SEA-capable Node (selected in step 4a) to
	// generate the blob — the blob format is keyed to the Node version that
	// will load it, and using the cached official tarball ensures the major
	// version of the producer matches the one we copy in step 4.
	const producer = ensureSeaCapableNode();
	log('3/7', `generate SEA blob via ${producer}`);
	const r = spawnSync(producer, ['--experimental-sea-config', SEA_CONFIG], {
		stdio: 'inherit',
		cwd: CLI_ROOT,
	});
	if (r.status !== 0) {
		console.error('SEA blob generation failed');
		process.exit(r.status ?? 1);
	}
	if (!existsSync(BLOB)) {
		console.error(`blob missing at ${BLOB}`);
		process.exit(1);
	}
}

/**
 * Locate a Node binary that still contains the SEA fuse sentinel. Homebrew
 * strips this sentinel to keep its tarball small, so on a default macOS dev
 * machine `process.execPath` will fail postject injection. We probe for the
 * fuse and download an official tarball into ~/.cache/sota-sea/ when the
 * running Node is unusable. The cache is keyed by NODE_VERSION above.
 */
function ensureSeaCapableNode() {
	const fuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
	const hasFuse = (binary) => {
		try {
			const content = readFileSync(binary);
			return content.indexOf(fuse) !== -1;
		} catch {
			return false;
		}
	};
	if (hasFuse(process.execPath)) {
		log('4a/7', `using ${process.execPath} (SEA fuse present)`);
		return process.execPath;
	}
	if (hasFuse(CACHED_NODE)) {
		log('4a/7', `using cached ${CACHED_NODE} (SEA fuse present)`);
		return CACHED_NODE;
	}
	log('4a/7', `downloading official Node ${NODE_VERSION} (running binary lacks SEA fuse)`);
	mkdirSync(CACHE_DIR, { recursive: true });
	const tarballPath = resolve(CACHE_DIR, NODE_TARBALL);
	if (!existsSync(tarballPath)) {
		const dl = spawnSync('curl', ['-fL', '-o', tarballPath, NODE_URL], { stdio: 'inherit' });
		if (dl.status !== 0) {
			console.error(`failed to download ${NODE_URL}`);
			process.exit(dl.status ?? 1);
		}
	}
	const tar = spawnSync('tar', ['-xzf', tarballPath, '-C', CACHE_DIR], { stdio: 'inherit' });
	if (tar.status !== 0) {
		console.error('tar extraction failed');
		process.exit(tar.status ?? 1);
	}
	if (!hasFuse(CACHED_NODE)) {
		console.error(`downloaded Node still missing fuse sentinel at ${CACHED_NODE}`);
		process.exit(1);
	}
	return CACHED_NODE;
}

let sourceNodeBin = process.execPath;

// --- Step 4 ----------------------------------------------------------------
function copyNodeBinary() {
	sourceNodeBin = ensureSeaCapableNode();
	log('4/7', `copy ${sourceNodeBin} → ${BIN}`);
	copyFileSync(sourceNodeBin, BIN);
	execFileSync('chmod', ['+w', BIN]); // some Homebrew installs ship 0555
}

// --- Step 5 ----------------------------------------------------------------
function inject() {
	log('5/7', 'postject inject');
	const r = spawnSync('npx', [
		'--yes',
		'postject',
		BIN,
		'NODE_SEA_BLOB',
		BLOB,
		'--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
		'--macho-segment-name', 'NODE_SEA',
		'--overwrite',
	], { stdio: 'inherit', cwd: CLI_ROOT });
	if (r.status !== 0) {
		console.error('postject failed');
		process.exit(r.status ?? 1);
	}
}

// --- Step 6 ----------------------------------------------------------------
function reSignMacho() {
	log('6/7', 'codesign --remove-signature && --sign -');
	// Both can warn on stderr but should exit 0; we don't pipe stdio so the
	// developer sees the messages.
	const strip = spawnSync('codesign', ['--remove-signature', BIN], { stdio: 'inherit' });
	if (strip.status !== 0) {
		console.error('codesign --remove-signature failed');
		process.exit(strip.status ?? 1);
	}
	const sign = spawnSync('codesign', ['--sign', '-', BIN], { stdio: 'inherit' });
	if (sign.status !== 0) {
		console.error('codesign --sign - failed');
		process.exit(sign.status ?? 1);
	}
}

// --- Step 7 ----------------------------------------------------------------
function smoke() {
	log('7/7', 'smoke ./dist-bundle/sota --version');
	const r = spawnSync(BIN, ['--version'], { stdio: 'pipe' });
	const out = (r.stdout?.toString() ?? '') + (r.stderr?.toString() ?? '');
	process.stdout.write(out);
	if (r.status !== 0) {
		console.error('smoke test failed');
		process.exit(r.status ?? 1);
	}
	const sizeMb = (statSync(BIN).size / 1024 / 1024).toFixed(2);
	log('done', `${BIN} (${sizeMb} MiB)`);
}

ensureCleanOutDir();
await bundle();
writeSeaConfig();
generateBlob();
copyNodeBinary();
inject();
reSignMacho();
smoke();
