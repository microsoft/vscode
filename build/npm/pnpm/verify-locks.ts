/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Verifies the pnpm lockfiles and settings of every install root against the npm state that
 * convert.ts converted (see the rules in the migration plan, V-1.2 and V-1.3):
 *
 *   (a) direct dependencies of every project match its npm lockfile (a higher version within the
 *       specifier's range that exists in the npm lockfiles is allowed),
 *   (b) every package exists in some npm lockfile of the same commit,
 *   (c) npm `overrides` hold for the packages each project reaches,
 *   (e) all install roots of build/npm/dirs.ts, plus distro folders when present,
 *   (f) every `pnpm-workspace.yaml` setting reads back with pnpm as intended, and there are no
 *       unknown settings; every patch file of `patchedDependencies` exists and the lockfile
 *       records its hash,
 *   (g) no lockfile records an SSH git URL,
 *   (h) writes a JSON report and exits with a non-zero code on failure,
 *   (i) the production closure of every project matches its own npm lockfile: each added or
 *       removed package is listed with a dependency path for the owner to review (no rule accepts
 *       it, even when the version exists in another npm lockfile),
 *   (j) every dependency that a package also declares as a peer is provided by a parent, because
 *       pnpm's hoisted linker doesn't install it otherwise (with `autoInstallPeers: false`),
 *   (k) the lockfile records the checksum of the root's pnpmfile (`pnpmfileChecksum`), which every
 *       frozen install compares with the pnpmfile,
 *   (l) the lockfile is a single YAML document: with `pmOnFail: ignore`, pnpm doesn't add the
 *       `packageManagerDependencies` document that the lockfile readers can't parse.
 *
 * Distro roots: settings are read back against the distro's own `pnpm-workspace.yaml`; its
 * `allowBuilds` must be the conversion of `allowScripts`; without a `package-lock.json` (after the
 * distro removed them) only the settings, `packageManager` and SSH URLs are checked.
 *
 * Options:
 *   --distro <path>    also check a distro checkout (`<path>/npm`, `npm/remote`, `npm/remote/web`);
 *                      `.build/distro` is checked automatically when present
 *   --report <file>    write the JSON report to this file
 *   --npm-ref <ref>    read the npm state from this git revision (default: see npmSource.ts)
 *   --verbose          print informational findings too
 *   --strict           also fail on differences for the owner to review
 */

import fs from 'fs';
import path from 'path';
import { parseArgs, isDeepStrictEqual } from 'util';
import { load } from 'js-yaml';
import { parsePnpmLockfile, type PnpmLockfile } from '../../lib/pnpmLock.ts';
import { checkDirectDependencies, checkEdges, checkOverrides, checkPatches, checkPeerProvidedDependencies, checkProductionClosure, checkSshUrls, checkSubtrees, checkUniverse, createUniverse, type Finding, type RootUnderTest } from './checks.ts';
import { getAllNpmLockfileFolders, getDistroRootFolders, getInstallRootFolders, loadInstallRoot, loadNpmFolder, type InstallRoot } from './installRoots.ts';
import { getPnpmfileChecksum, loadSatisfies, runPnpm } from './lockfileGenerator.ts';
import { getDiskSource, getNpmSource } from './npmSource.ts';
import { knownSettingNames, pnpmVersion, type WorkspaceSettings } from './workspaceConfig.ts';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..', '..');
const start = Date.now();

function progress(message: string): void {
	console.log(`[verify-locks] ${((Date.now() - start) / 1000).toFixed(1)}s ${message}`);
}

/**
 * (f) Reads the settings of an install root back with `pnpm config list --json` and compares them
 * with the intended values. Also rejects setting names that the conversion doesn't write and any
 * "not recognized" warning from pnpm.
 */
export function checkSettings(root: InstallRoot, dir: string, displayFolder: string): Finding[] {
	const findings: Finding[] = [];
	const error = (message: string) => findings.push({ check: 'setting', severity: 'error', root: displayFolder, message });
	const yamlFile = path.join(dir, 'pnpm-workspace.yaml');
	if (!fs.existsSync(yamlFile)) {
		error('pnpm-workspace.yaml is missing');
		return findings;
	}
	const yaml = (load(fs.readFileSync(yamlFile, 'utf8')) ?? {}) as Record<string, unknown>;
	for (const name of Object.keys(yaml)) {
		if (!(knownSettingNames as readonly string[]).includes(name)) {
			error(`unknown setting in pnpm-workspace.yaml: ${name}`);
		} else if (root.settings[name as keyof typeof root.settings] === undefined) {
			error(`unexpected setting in pnpm-workspace.yaml: ${name}`);
		}
	}
	const result = runPnpm(['config', 'list', '--json'], dir);
	if (result.status !== 0) {
		error(`pnpm config list failed: ${result.stderr}`);
		return findings;
	}
	for (const line of result.stderr.split(/\r?\n/)) {
		if (/not recognized/.test(line)) {
			error(line.trim());
		}
	}
	const actual = JSON.parse(result.stdout.substring(result.stdout.indexOf('{'))) as Record<string, unknown>;
	const toRelative = (file: string) => path.relative(dir, file).split(path.sep).join('/');
	for (const name of knownSettingNames) {
		const intended = root.settings[name];
		// pnpm may report the pnpmfile as a list of absolute paths, and patch files as absolute paths
		const value = name === 'pnpmfile' && Array.isArray(actual[name]) ? (actual[name] as string[]).map(toRelative).join(',')
			: name === 'patchedDependencies' && actual[name] && typeof actual[name] === 'object' ? Object.fromEntries(Object.entries(actual[name] as Record<string, string>).map(([key, file]) => [key, toRelative(file)]))
				: actual[name];
		if (intended !== undefined && !isDeepStrictEqual(normalize(value), normalize(intended))) {
			error(`setting ${name} reads back as ${JSON.stringify(value)}, expected ${JSON.stringify(intended)}`);
		}
	}
	return findings;
}

/**
 * Reads the settings of a `pnpm-workspace.yaml`. Distro roots are converted by the distro, so their
 * own file holds the intended values.
 */
function readWorkspaceSettings(dir: string): WorkspaceSettings {
	const yamlFile = path.join(dir, 'pnpm-workspace.yaml');
	return fs.existsSync(yamlFile) ? (load(fs.readFileSync(yamlFile, 'utf8')) ?? {}) as WorkspaceSettings : {};
}

function normalize(value: unknown): unknown {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
	}
	return value;
}

/**
 * Checks the converted `package.json` files: no npm-only fields left, and the pinned
 * `packageManager` in every install root (also distro roots, which the root postinstall installs
 * with the same pnpm).
 */
function checkPackageJsons(root: InstallRoot, baseDir: string, displayFolder: string, keepNpmFields: boolean): Finding[] {
	const findings: Finding[] = [];
	for (const project of root.projects) {
		const json = JSON.parse(fs.readFileSync(path.join(baseDir, project.folder, 'package.json'), 'utf8'));
		const where = path.posix.join(project.folder, 'package.json');
		if (!keepNpmFields && (json.overrides || json.allowScripts)) {
			findings.push({ check: 'setting', severity: 'error', root: displayFolder, message: `${where} still has npm-only overrides/allowScripts; run convert.ts` });
		}
	}
	const rootJson = JSON.parse(fs.readFileSync(path.join(baseDir, root.folder, 'package.json'), 'utf8'));
	if (rootJson.packageManager !== `pnpm@${pnpmVersion}`) {
		findings.push({ check: 'setting', severity: 'error', root: displayFolder, message: `${path.posix.join(root.folder, 'package.json')} must have "packageManager": "pnpm@${pnpmVersion}", found ${JSON.stringify(rootJson.packageManager)}` });
	}
	return findings;
}

/**
 * (k) The lockfile records the checksum of the root's pnpmfile, and none without a pnpmfile.
 */
export function checkPnpmfileChecksum(lockfile: PnpmLockfile, dir: string, settings: WorkspaceSettings, displayFolder: string): Finding[] {
	const expected = getPnpmfileChecksum(dir, settings);
	return lockfile.pnpmfileChecksum === expected ? [] : [{
		check: 'setting',
		severity: 'error',
		root: displayFolder,
		message: `pnpm-lock.yaml records pnpmfileChecksum ${JSON.stringify(lockfile.pnpmfileChecksum)}, but the pnpmfile's checksum is ${JSON.stringify(expected)}; run convert.ts`,
	}];
}

/**
 * Distro roots are converted by the distro; while they still have npm `allowScripts`, their
 * `allowBuilds` must be the conversion of it (git dependencies by name and commit URL).
 */
function checkDistroAllowBuilds(root: InstallRoot, dir: string, displayFolder: string): Finding[] {
	const actual = readWorkspaceSettings(dir).allowBuilds ?? {};
	const expected = root.settings.allowBuilds ?? {};
	return isDeepStrictEqual(normalize(actual), normalize(expected)) ? [] : [{
		check: 'setting', severity: 'error', root: displayFolder,
		message: `allowBuilds is ${JSON.stringify(actual)}, expected the conversion of allowScripts ${JSON.stringify(expected)}`,
	}];
}

function main(): void {
	const { values } = parseArgs({
		options: {
			'distro': { type: 'string' },
			'report': { type: 'string' },
			'npm-ref': { type: 'string' },
			'verbose': { type: 'boolean', default: false },
			'strict': { type: 'boolean', default: false },
		},
	});

	const source = getNpmSource(REPO_ROOT, values['npm-ref']);
	source.prefetch?.(getAllNpmLockfileFolders().flatMap(folder => [path.posix.join(folder, 'package.json'), path.posix.join(folder, 'package-lock.json')]));
	const satisfies = loadSatisfies(REPO_ROOT);
	const roots: { root: InstallRoot; baseDir: string; display: string; distro: boolean }[] = getInstallRootFolders()
		.map(folders => ({ root: loadInstallRoot(source, folders, satisfies, REPO_ROOT, true), baseDir: REPO_ROOT, display: folders[0], distro: false }));

	const distroDirs = [values.distro ? path.resolve(values.distro) : path.join(REPO_ROOT, '.build', 'distro')].filter(dir => fs.existsSync(path.join(dir, 'npm', 'package.json')));
	for (const distroDir of distroDirs) {
		const distroSource = getDiskSource(distroDir);
		for (const folders of getDistroRootFolders()) {
			const display = path.relative(REPO_ROOT, path.join(distroDir, folders[0])) || folders[0];
			// Once the distro has removed its npm lockfiles, only the checks without npm state apply.
			const root: InstallRoot = fs.existsSync(path.join(distroDir, folders[0], 'package-lock.json'))
				? loadInstallRoot(distroSource, folders, satisfies, distroDir)
				: { folder: folders[0], projects: [], settings: {}, notes: [] };
			roots.push({ root, baseDir: distroDir, display, distro: true });
		}
	}

	const universe = createUniverse([
		...getAllNpmLockfileFolders().map(folder => loadNpmFolder(source, folder).lockfile),
		...roots.flatMap(({ root }) => root.projects.map(p => p.lockfile)),
	]);

	progress(`loaded the npm state (${source.description}) and ${roots.length} install roots`);
	const findings: Finding[] = [];
	for (const { root, baseDir, display, distro } of roots) {
		const dir = path.join(baseDir, root.folder);
		const lockfilePath = path.join(dir, 'pnpm-lock.yaml');
		if (!fs.existsSync(lockfilePath)) {
			findings.push({ check: 'importer', severity: 'error', root: display, message: 'pnpm-lock.yaml is missing; run convert.ts' });
			continue;
		}
		const lockfileText = fs.readFileSync(lockfilePath, 'utf8');
		if (/^---$/m.test(lockfileText)) {
			findings.push({ check: 'setting', severity: 'error', root: display, message: 'pnpm-lock.yaml has more than one YAML document: pnpm adds `packageManagerDependencies` unless `pmOnFail` is `ignore`; run convert.ts' });
			continue;
		}
		const underTest: RootUnderTest = {
			folder: root.folder,
			dir,
			lockfile: parsePnpmLockfile(lockfileText),
			lockfileText,
			projects: root.projects,
		};
		const rootFindings: Finding[] = [];
		const run = (name: string, check: () => Finding[]) => {
			const checkStart = Date.now();
			rootFindings.push(...check());
			if (Date.now() - checkStart > 2000) {
				progress(`${display || '.'}: ${name} took ${((Date.now() - checkStart) / 1000).toFixed(1)}s`);
			}
		};
		const hasNpmState = root.projects.length > 0;
		if (hasNpmState) {
			run('direct dependencies', () => checkDirectDependencies(underTest, universe, satisfies));
			run('universe', () => checkUniverse(underTest, universe));
			run('overrides', () => checkOverrides(underTest, satisfies));
			run('production closure', () => checkProductionClosure(underTest));
			if (distro) {
				run('allowBuilds', () => checkDistroAllowBuilds(root, dir, display));
			}
		} else {
			rootFindings.push({ check: 'importer', severity: 'info', root: display, message: 'no package-lock.json: checked settings and SSH URLs only' });
		}
		run('ssh urls', () => checkSshUrls(display, lockfileText));
		run('peer-provided dependencies', () => checkPeerProvidedDependencies(underTest));
		run('settings', () => checkSettings(distro ? { ...root, settings: readWorkspaceSettings(dir) } : root, dir, display));
		run('pnpmfile checksum', () => checkPnpmfileChecksum(underTest.lockfile, dir, distro ? readWorkspaceSettings(dir) : root.settings, display));
		run('patches', () => checkPatches(underTest, ((distro ? readWorkspaceSettings(dir) : root.settings).patchedDependencies ?? {}) as Readonly<Record<string, string>>, display));
		run('package.json', () => checkPackageJsons(root, baseDir, display, distro));
		if (hasNpmState) {
			run('subtrees', () => checkSubtrees(underTest));
			run('edges', () => checkEdges(underTest));
		}
		progress(`${display || '.'}: checked`);
		findings.push(...rootFindings.map(f => ({ ...f, root: display })));
	}

	const errors = findings.filter(f => f.severity === 'error');
	const allowed = findings.filter(f => f.severity === 'allowed');
	const review = findings.filter(f => f.severity === 'review');
	const info = findings.filter(f => f.severity === 'info');
	for (const f of [...errors, ...allowed, ...review, ...(values.verbose ? info : [])]) {
		console.log(`[verify-locks] ${f.severity.toUpperCase()} ${f.check} ${f.root || '.'}${f.importer ? ` (${f.importer})` : ''}: ${f.message}`);
	}
	console.log(`[verify-locks] npm state: ${source.description}; ${roots.length} install roots; ${errors.length} errors, ${allowed.length} allowed differences, ${review.length} differences for the owner to review${values.strict ? ' (--strict: they fail)' : ''}, ${info.length} informational findings${values.verbose ? '' : ' (--verbose to list)'}`);
	if (values.report) {
		fs.mkdirSync(path.dirname(path.resolve(values.report)), { recursive: true });
		fs.writeFileSync(values.report, JSON.stringify({ npmState: source.description, pnpmVersion, roots: roots.map(r => r.display), errors, allowed, review, info }, null, '\t') + '\n');
	}
	if (errors.length > 0 || (values.strict && review.length > 0)) {
		process.exitCode = 1;
	}
}

if (import.meta.main) {
	try {
		main();
	} catch (err) {
		console.error(`[verify-locks] ${err instanceof Error ? err.stack : err}`);
		process.exit(1);
	}
}
