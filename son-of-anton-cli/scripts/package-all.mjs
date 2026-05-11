#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Drive all three platform packagers sequentially. We deliberately don't run
 * them in parallel — they share the `dist-bundle/` output directory and the
 * shared esbuild step, so a parallel run would race on the same files. The
 * vendor `npm install` step also benefits from npm's on-disk cache being
 * warm, which only happens after the first invocation completes.
 *
 * Each platform produces a distinct binary in `dist-bundle/`:
 *   - sota                    (darwin-arm64)
 *   - sota-linux-x64          (linux x86_64 ELF)
 *   - sota-windows-x64.exe    (Windows x86_64 PE)
 *
 * Outputs from earlier targets are preserved across runs — the pipeline only
 * cleans the parts of `dist-bundle/` that it actively rewrites, and renames
 * the final binary after injection.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
} from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(CLI_ROOT, 'dist-bundle');
// Preserve intermediate binaries across the sequential runs by stashing
// them in a sibling temp directory (`dist-bundle-stash/`). The per-platform
// pipeline's `ensureCleanOutDir()` wipes `dist-bundle/` wholesale on every
// invocation, so we can't stash inside it.
const ARCHIVE_DIR = resolve(CLI_ROOT, 'dist-bundle-stash');

/**
 * Files we want to preserve from each platform's output. We stash both the
 * binary itself and its accompanying license manifest (the latter varies
 * slightly per platform because the vendored native binaries differ).
 */
const TARGETS = [
	{
		script: 'package-macos-arm64.mjs',
		artefacts: ['sota', 'THIRD_PARTY_LICENSES.txt'],
		artefactRenames: { 'THIRD_PARTY_LICENSES.txt': 'THIRD_PARTY_LICENSES-darwin-arm64.txt' },
	},
	{
		script: 'package-linux-x64.mjs',
		artefacts: ['sota-linux-x64', 'THIRD_PARTY_LICENSES.txt'],
		artefactRenames: { 'THIRD_PARTY_LICENSES.txt': 'THIRD_PARTY_LICENSES-linux-x64.txt' },
	},
	{
		script: 'package-windows-x64.mjs',
		artefacts: ['sota-windows-x64.exe', 'THIRD_PARTY_LICENSES.txt'],
		artefactRenames: { 'THIRD_PARTY_LICENSES.txt': 'THIRD_PARTY_LICENSES-windows-x64.txt' },
	},
];

function run(scriptName) {
	const target = resolve(__dirname, scriptName);
	const r = spawnSync(process.execPath, [target], { stdio: 'inherit', cwd: CLI_ROOT });
	if (r.status !== 0) {
		console.error(`\n${scriptName} failed; aborting package:all`);
		process.exit(r.status ?? 1);
	}
}

function stash(target) {
	mkdirSync(ARCHIVE_DIR, { recursive: true });
	for (const artefact of target.artefacts) {
		const src = resolve(OUT_DIR, artefact);
		if (!existsSync(src)) {
			continue;
		}
		const dstName = target.artefactRenames[artefact] ?? artefact;
		copyFileSync(src, resolve(ARCHIVE_DIR, dstName));
	}
}

function restoreAll() {
	if (!existsSync(ARCHIVE_DIR)) {
		return;
	}
	mkdirSync(OUT_DIR, { recursive: true });
	for (const entry of readdirSync(ARCHIVE_DIR)) {
		copyFileSync(resolve(ARCHIVE_DIR, entry), resolve(OUT_DIR, entry));
	}
	rmSync(ARCHIVE_DIR, { recursive: true, force: true });
}

// Clear any pre-existing stash from a previous failed run so we don't
// resurrect stale binaries.
rmSync(ARCHIVE_DIR, { recursive: true, force: true });

for (const target of TARGETS) {
	run(target.script);
	stash(target);
}
restoreAll();

process.stdout.write('\n\x1b[1m[package:all]\x1b[0m all three platform binaries produced.\n');
const ls = spawnSync('ls', ['-lh', OUT_DIR], { stdio: 'inherit' });
if (ls.status !== 0 && process.platform === 'win32') {
	spawnSync('dir', [OUT_DIR], { stdio: 'inherit', shell: true });
}
