/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Verify the vendored codex app-server protocol client
// (src/vs/platform/agentHost/node/codex/protocol/generated/**) is byte-for-byte what the
// generation script produces for the codex version pinned in the repo-root package.json
// devDependencies (@openai/codex). Guards against hand-edited or stale generated files:
// the committed client must be reproducible by `npm run codex:gen-protocol`.
//
// Usage:
//   node build/codex/check-protocol-sync.ts
//       Always regenerate into a scratch dir and compare (local "is my client fresh?").
//
//   node build/codex/check-protocol-sync.ts --if-changed [--base <ref>]
//       CI mode: only run when the PR touches codex generation outputs (the generated dir
//       or codex-version.txt). `--base` defaults to origin/main.
//
// Never modifies the working tree. Exit codes: 0 = in sync (or skipped), 1 = drift.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	REPO_ROOT,
	OUT_DIR,
	VERSION_FILE,
	resolveCodexBinary,
	readBinaryVersion,
	readPinnedVersion,
	generate,
} from './generate-protocol.mjs';

const toPosix = (p: string): string => p.split(path.sep).join('/');
const GENERATED_DIR_REL = toPosix(path.relative(REPO_ROOT, OUT_DIR));
const VERSION_FILE_REL = toPosix(path.relative(REPO_ROOT, VERSION_FILE));

// A PR touching any of these paths must keep the generated client in sync. Entries ending
// in '/' match by prefix (a directory); others match exactly. The generator itself
// (generate-protocol.mjs) is intentionally excluded: output-preserving refactors of the
// generator should not force a regeneration; only changes to the generated output or the
// version contract do.
const CODEX_INPUT_PREFIXES: readonly string[] = [
	`${GENERATED_DIR_REL}/`,
	VERSION_FILE_REL,
];

// README.md lives inside the generated dir but is hand-authored and preserved across
// regeneration (see `generate()` / `listFiles()`), so a doc-only edit to it must NOT
// trigger the freshness check.
const GENERATED_README_REL = `${GENERATED_DIR_REL}/README.md`;

function readDevDepVersion(): string {
	const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
	const version: string | undefined = pkg.devDependencies?.['@openai/codex'];
	if (!version) {
		throw new Error('Could not find @openai/codex in repo-root package.json devDependencies.');
	}
	return version.trim();
}

/** Filters a list of changed repo-relative paths down to codex generation inputs. */
export function filterCodexInputs(changedPaths: readonly string[]): string[] {
	return changedPaths.filter(p =>
		p !== GENERATED_README_REL &&
		CODEX_INPUT_PREFIXES.some(prefix => (prefix.endsWith('/') ? p.startsWith(prefix) : p === prefix)));
}

/** Returns the codex generation inputs changed between `baseRef` and HEAD. */
function changedCodexInputs(baseRef: string): string[] {
	const run = () => spawnSync('git', ['diff', '--name-only', baseRef, 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
	let r = run();
	if (r.status !== 0) {
		// The base commit may be absent in a shallow CI checkout; fetch it once, then retry.
		spawnSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', baseRef], { cwd: REPO_ROOT, encoding: 'utf8' });
		r = run();
		if (r.status !== 0) {
			throw new Error(`git diff against '${baseRef}' failed:\n${r.stderr}`);
		}
	}
	const changed = r.stdout.split('\n').map(s => s.trim()).filter(Boolean);
	return filterCodexInputs(changed);
}

/** Recursively lists repo-relative files under `dir`, excluding README.md. */
export function listFiles(dir: string): string[] {
	const out: string[] = [];
	const walk = (d: string, rel: string): void => {
		for (const entry of readdirSync(d, { withFileTypes: true })) {
			if (entry.name === 'README.md') { continue; }
			const abs = path.join(d, entry.name);
			const r = rel ? `${rel}/${entry.name}` : entry.name;
			if (entry.isDirectory()) { walk(abs, r); }
			else if (entry.isFile()) { out.push(r); }
		}
	};
	walk(dir, '');
	return out.sort();
}

/**
 * Compares two generated trees. Returns a sorted list of relative paths that differ
 * (content mismatch, or present in only one tree). README.md is ignored.
 */
export function diffGeneratedTrees(committedDir: string, freshDir: string): string[] {
	const committed = new Set(listFiles(committedDir));
	const fresh = new Set(listFiles(freshDir));
	const diffs: string[] = [];
	for (const rel of committed) {
		if (!fresh.has(rel)) {
			diffs.push(`${rel} (committed but not produced by regeneration)`);
			continue;
		}
		const a = readFileSync(path.join(committedDir, rel));
		const b = readFileSync(path.join(freshDir, rel));
		if (!a.equals(b)) {
			diffs.push(`${rel} (content differs from regeneration)`);
		}
	}
	for (const rel of fresh) {
		if (!committed.has(rel)) {
			diffs.push(`${rel} (produced by regeneration but missing from the committed client)`);
		}
	}
	return diffs.sort();
}

function fail(message: string): void {
	// allow-any-unicode-next-line
	console.error(`\n✗ ${message}`);
	process.exit(1);
}

function main(): void {
	const argv = process.argv.slice(2);
	const ifChanged = argv.includes('--if-changed');
	let base: string | undefined;
	const baseFlagIdx = argv.indexOf('--base');
	if (baseFlagIdx !== -1) { base = argv[baseFlagIdx + 1]; }
	const baseEq = argv.find(a => a.startsWith('--base='));
	if (baseEq) { base = baseEq.slice('--base='.length); }

	if (ifChanged) {
		const ref = base || 'origin/main';
		const changed = changedCodexInputs(ref);
		if (changed.length === 0) {
			console.log(`No codex protocol generation inputs changed vs ${ref}; skipping freshness check.`);
			console.log(`(inputs: ${GENERATED_DIR_REL}/**, ${VERSION_FILE_REL})`);
			return;
		}
		console.log(`Codex generation inputs changed vs ${ref}:`);
		for (const c of changed) { console.log(`  ${c}`); }
	}

	const devDep = readDevDepVersion();
	const bin = resolveCodexBinary();
	const binVersion = readBinaryVersion(bin);
	const pinned = readPinnedVersion();

	console.log(`\n@openai/codex devDependency: ${devDep}`);
	console.log(`vendored codex binary:       ${binVersion}  (${toPosix(path.relative(REPO_ROOT, bin))})`);
	console.log(`${VERSION_FILE_REL}:          ${pinned}`);

	if (binVersion !== devDep) {
		fail(`The vendored codex binary is ${binVersion} but package.json pins @openai/codex ${devDep}. ` +
			`Run \`npm ci\` so the freshness check regenerates with the dev-dependency version.`);
	}

	// Regenerate into a throwaway dir using the dev-dependency binary; never touch the working tree.
	const scratch = mkdtempSync(path.join(tmpdir(), 'codex-protocol-check-'));
	try {
		generate(bin, scratch, binVersion);
		const diffs = diffGeneratedTrees(OUT_DIR, scratch);
		if (diffs.length > 0) {
			// allow-any-unicode-next-line
			console.error(`\n✗ The committed codex protocol client does not match \`codex app-server generate-ts\` for @openai/codex ${devDep}.`);
			console.error(`  ${diffs.length} file(s) differ:`);
			for (const d of diffs.slice(0, 40)) { console.error(`    ${d}`); }
			if (diffs.length > 40) { console.error(`    …and ${diffs.length - 40} more.`); }
			console.error(`\n  Regenerate with:  npm run codex:gen-protocol`);
			console.error(`  (ensure ${VERSION_FILE_REL} and the @openai/codex devDependency are both ${devDep} first.)`);
			process.exit(1);
		}
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}

	if (pinned !== devDep) {
		fail(`${VERSION_FILE_REL} is ${pinned} but the generated client matches @openai/codex ${devDep}. ` +
			`Bump ${VERSION_FILE_REL} to ${devDep} so \`npm run codex:gen-protocol\` stays reproducible.`);
	}

	console.log(`\n✓ Codex protocol client matches \`codex app-server generate-ts\` for @openai/codex ${devDep}.`);
}

// Only run when invoked directly, not when imported by the unit tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}

export { CODEX_INPUT_PREFIXES };
