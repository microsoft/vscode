/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  PR-time license-coverage check for changed package.json files.
 *
 *  Implements vscode-engineering#2142 comment 4624222337:
 *    1. Detect package.json files modified between --base and --head.
 *    2. For each added dependency: pass iff ClearlyDefined has license metadata,
 *       OR node_modules/<pkg>/LICENSE* is present, OR cglicenses.json has an entry.
 *    3. For each removed dependency: fail if cglicenses.json still has an entry
 *       (the override is now stale and must be removed).
 *
 *  Exits non-zero on any failure so the build/PR check can block.
 *
 *  Usage:
 *    node check-pr-dependencies.js \
 *      --repo <path> \
 *      --base <ref> \
 *      --head <ref> \
 *      [--cglicenses <path>] \
 *      [--no-clearlydefined]   // skip the HTTP lookup (e.g. offline CI)
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { readCglicenses, CglicenseEntry } from './apply-overrides.js';

interface Args {
	repo: string;
	base: string;
	head: string;
	cglicensesPath?: string;
	useClearlyDefined: boolean;
}

interface Dep {
	name: string;
	version: string;
}

interface ChangedManifest {
	relPath: string;
	added: Dep[];
	removed: Dep[];
}

const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

function parseArgs(argv: string[]): Args {
	const map: Record<string, string> = {};
	const flags = new Set<string>();
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith('--')) {
			continue;
		}
		const key = a.substring(2);
		if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
			map[key] = argv[i + 1];
			i++;
		} else {
			flags.add(key);
		}
	}
	const repo = map['repo'] || process.cwd();
	if (!map['base'] || !map['head']) {
		console.error('Usage: check-pr-dependencies.js --repo <path> --base <ref> --head <ref> [--cglicenses <path>] [--no-clearlydefined]');
		process.exit(2);
	}
	return {
		repo,
		base: map['base'],
		head: map['head'],
		cglicensesPath: map['cglicenses'],
		useClearlyDefined: !flags.has('no-clearlydefined'),
	};
}

function git(repo: string, ...gitArgs: string[]): string {
	const r = cp.spawnSync('git', gitArgs, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	if (r.status !== 0) {
		throw new Error(`git ${gitArgs.join(' ')} failed: ${r.stderr || r.stdout}`);
	}
	return r.stdout;
}

function gitOrEmpty(repo: string, ...gitArgs: string[]): string {
	const r = cp.spawnSync('git', gitArgs, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	if (r.status !== 0) {
		return '';
	}
	return r.stdout;
}

function listChangedPackageJsons(args: Args): string[] {
	const out = git(args.repo, 'diff', '--name-only', `${args.base}...${args.head}`);
	return out.split('\n')
		.map(l => l.trim())
		.filter(l => l && /(?:^|\/)package\.json$/.test(l));
}

function depsFromPkgJson(text: string): Map<string, string> {
	const out = new Map<string, string>();
	if (!text.trim()) {
		return out;
	}
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(text);
	} catch {
		return out;
	}
	for (const field of DEP_FIELDS) {
		const obj = parsed[field];
		if (obj && typeof obj === 'object') {
			for (const [name, version] of Object.entries(obj as Record<string, string>)) {
				if (typeof version === 'string') {
					out.set(name, version);
				}
			}
		}
	}
	return out;
}

function diffDeps(args: Args, relPath: string): ChangedManifest {
	const oldText = gitOrEmpty(args.repo, 'show', `${args.base}:${relPath}`);
	const newText = gitOrEmpty(args.repo, 'show', `${args.head}:${relPath}`);
	const oldDeps = depsFromPkgJson(oldText);
	const newDeps = depsFromPkgJson(newText);

	const added: Dep[] = [];
	for (const [name, version] of newDeps) {
		if (!oldDeps.has(name)) {
			added.push({ name, version });
		}
	}
	const removed: Dep[] = [];
	for (const [name, version] of oldDeps) {
		if (!newDeps.has(name)) {
			removed.push({ name, version });
		}
	}
	return { relPath, added, removed };
}

const LICENSE_FILE_RE = /^licen[sc]e(\.md|\.txt|\.mit|\.bsd|\.apache|\.markdown)?$/i;

function findLicenseOnDisk(repo: string, manifestRelPath: string, depName: string): boolean {
	// node_modules of the manifest's directory
	const manifestDir = path.join(repo, path.dirname(manifestRelPath));
	const candidates = [
		path.join(manifestDir, 'node_modules', ...depName.split('/')),
		// Hoisted to repo root node_modules
		path.join(repo, 'node_modules', ...depName.split('/')),
	];
	for (const pkgDir of candidates) {
		try {
			if (!fs.existsSync(pkgDir)) {
				continue;
			}
			for (const f of fs.readdirSync(pkgDir)) {
				if (LICENSE_FILE_RE.test(f)) {
					return true;
				}
			}
		} catch {
			/* ignore */
		}
	}
	return false;
}

/**
 * Look up a package in ClearlyDefined. Returns true iff the API reports
 * a real SPDX expression in `licensed.declared` AND a non-zero score
 * (the threshold CG uses before including a NOTICE entry).
 */
function clearlyDefinedHas(name: string, version: string, timeoutMs = 8_000): Promise<boolean> {
	// ClearlyDefined coordinate format: <type>/<provider>/<namespace>/<name>/<version>
	// For npm: type=npm provider=npmjs namespace=- (or scope without @) name=pkg version=...
	let nsPath: string;
	if (name.startsWith('@')) {
		const slash = name.indexOf('/');
		if (slash < 0) {
			return Promise.resolve(false);
		}
		const ns = name.substring(0, slash); // includes @
		const pkg = name.substring(slash + 1);
		nsPath = `${encodeURIComponent(ns)}/${encodeURIComponent(pkg)}`;
	} else {
		nsPath = `-/${encodeURIComponent(name)}`;
	}
	// Strip semver range characters; ClearlyDefined wants an exact version.
	const cleanVersion = version.replace(/^[\^~><=*v\s]+/, '').split(/\s|,/)[0] || 'latest';
	const url = `https://api.clearlydefined.io/definitions/npm/npmjs/${nsPath}/${encodeURIComponent(cleanVersion)}`;

	return new Promise(resolve => {
		const req = https.get(url, { timeout: timeoutMs }, res => {
			if (res.statusCode !== 200) {
				res.resume();
				resolve(false);
				return;
			}
			let body = '';
			res.setEncoding('utf8');
			res.on('data', chunk => body += chunk);
			res.on('end', () => {
				try {
					const data = JSON.parse(body) as {
						licensed?: {
							declared?: string;
							score?: { total?: number };
						};
					};
					const declared = data.licensed?.declared;
					const score = data.licensed?.score?.total ?? 0;
					const covered = !!declared &&
						declared !== 'NOASSERTION' &&
						declared !== 'OTHER' &&
						score > 0;
					resolve(covered);
				} catch {
					resolve(false);
				}
			});
		});
		req.on('error', () => resolve(false));
		req.on('timeout', () => {
			req.destroy();
			resolve(false);
		});
	});
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	console.log(`PR dependency license check (${args.base}...${args.head})`);
	console.log(`  repo: ${args.repo}`);
	console.log(`  cglicenses: ${args.cglicensesPath || '(none)'}`);
	console.log(`  ClearlyDefined: ${args.useClearlyDefined ? 'enabled' : 'disabled'}`);

	// Load cglicenses overrides if present.
	let overrides: CglicenseEntry[] = [];
	let overrideNames = new Set<string>();
	if (args.cglicensesPath) {
		if (!fs.existsSync(args.cglicensesPath)) {
			console.warn(`  WARN: cglicenses file not found at ${args.cglicensesPath}`);
		} else {
			try {
				overrides = readCglicenses(args.cglicensesPath);
				overrideNames = new Set(overrides.map(o => o.name.toLowerCase()));
				console.log(`  Loaded ${overrides.length} cglicenses overrides`);
			} catch (err) {
				console.error(`  ERROR loading cglicenses.json: ${(err as Error).message}`);
				process.exit(2);
			}
		}
	}

	// Find changed package.json files in the PR diff.
	const changed = listChangedPackageJsons(args);
	if (changed.length === 0) {
		console.log('No package.json files changed. Nothing to check.');
		return;
	}
	console.log(`Found ${changed.length} changed package.json file(s):`);
	for (const p of changed) {
		console.log(`  - ${p}`);
	}

	const errors: string[] = [];
	const warnings: string[] = [];

	for (const relPath of changed) {
		const { added, removed } = diffDeps(args, relPath);
		if (added.length === 0 && removed.length === 0) {
			continue;
		}
		console.log(`\n-- ${relPath}`);
		console.log(`   +${added.length} added, -${removed.length} removed`);

		// Removed deps: stale-override check.
		for (const dep of removed) {
			if (overrideNames.has(dep.name.toLowerCase())) {
				errors.push(
					`Stale override: package "${dep.name}" was removed (in ${relPath}) but still ` +
					`has an entry in ${path.basename(args.cglicensesPath || 'cglicenses.json')}. ` +
					`Please delete the override entry in the same PR.`
				);
			}
		}

		// Added deps: must have ClearlyDefined coverage, on-disk LICENSE, or override.
		for (const dep of added) {
			if (overrideNames.has(dep.name.toLowerCase())) {
				console.log(`   ✓ ${dep.name}@${dep.version}  (covered by cglicenses override)`);
				continue;
			}
			if (findLicenseOnDisk(args.repo, relPath, dep.name)) {
				console.log(`   ✓ ${dep.name}@${dep.version}  (LICENSE file present in node_modules)`);
				continue;
			}
			if (args.useClearlyDefined) {
				const inCd = await clearlyDefinedHas(dep.name, dep.version);
				if (inCd) {
					console.log(`   ✓ ${dep.name}@${dep.version}  (covered by ClearlyDefined)`);
					continue;
				}
				warnings.push(`ClearlyDefined: no coverage for ${dep.name}@${dep.version}`);
			}
			errors.push(
				`Missing license source for "${dep.name}@${dep.version}" (added in ${relPath}). ` +
				`No LICENSE file in node_modules, no ClearlyDefined coverage, and no cglicenses.json ` +
				`override. Either install the package and verify it ships a LICENSE, file a ClearlyDefined ` +
				`curation at https://clearlydefined.io, or add an entry to cglicenses.json.`
			);
		}
	}

	console.log('');
	console.log('=== Summary ===');
	console.log(`  Errors:   ${errors.length}`);
	console.log(`  Warnings: ${warnings.length}`);

	for (const w of warnings) {
		console.warn(`  WARN: ${w}`);
	}
	for (const e of errors) {
		console.error(`  ERROR: ${e}`);
	}

	if (errors.length > 0) {
		process.exit(1);
	}
}

main().catch(err => {
	console.error(`Unhandled error: ${(err as Error).stack || err}`);
	process.exit(2);
});
