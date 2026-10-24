/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { collectImporterPackages, getImporterId, importerDependencyKinds, parsePackageKey, resolveDependencyVersion, snapshotDependencyKinds, type PnpmLockfile, type PnpmLockfileSnapshot } from '../../lib/pnpmLock.ts';
import { getInstalledPackages, resolveNpmDependency, type NpmLockfile } from './npmLockfile.ts';
import { convertNpmOverrides, parseOverrideKey, type NpmFolder } from './workspaceConfig.ts';

/**
 * One result of a check. `error` fails verification. `allowed` is a difference covered by the
 * rules for accepting differences (plan V-1.3). `review` is a difference that no rule accepts and
 * that the owner must review (fails with `--strict`). `info` is reported only.
 */
export interface Finding {
	readonly check: 'importer' | 'direct' | 'universe' | 'override' | 'ssh' | 'setting' | 'subtree' | 'edge' | 'closure' | 'peer';
	readonly severity: 'error' | 'allowed' | 'review' | 'info';
	/** Install root folder relative to the repository root (`''` for the main workspace). */
	readonly root: string;
	readonly importer?: string;
	readonly message: string;
}

/**
 * An install root with its pnpm lockfile and the npm state of every project in it.
 */
export interface RootUnderTest {
	readonly folder: string;
	/** Absolute path of the install root. */
	readonly dir: string;
	readonly lockfile: PnpmLockfile;
	readonly lockfileText: string;
	/** The root project first, then the workspace members, with paths relative to the repository root. */
	readonly projects: readonly NpmFolder[];
}

/**
 * The `name@version` keys of every package in all npm lockfiles at the same commit, plus the
 * resolved URLs (for git dependencies).
 */
export interface Universe {
	readonly keys: Set<string>;
	readonly resolvedByName: Map<string, Set<string>>;
}

export type Satisfies = (version: string, range: string) => boolean;

export function createUniverse(lockfiles: Iterable<NpmLockfile>): Universe {
	const keys = new Set<string>();
	const resolvedByName = new Map<string, Set<string>>();
	for (const lockfile of lockfiles) {
		for (const p of getInstalledPackages(lockfile)) {
			keys.add(`${p.name}@${p.version}`);
			if (p.entry.resolved) {
				let set = resolvedByName.get(p.name);
				if (!set) {
					set = new Set();
					resolvedByName.set(p.name, set);
				}
				set.add(p.entry.resolved);
			}
		}
	}
	return { keys, resolvedByName };
}

function isLocalVersion(version: string): boolean {
	return version.startsWith('file:') || version.startsWith('link:');
}

function isRemoteVersion(version: string): boolean {
	return /^[a-z+]+:/.test(version) && !isLocalVersion(version);
}

function getCommit(text: string): string | undefined {
	return /\b([0-9a-f]{40})\b/.exec(text)?.[1];
}

/**
 * Returns `host/owner/repo#commit` (lower case) for a git or GitHub tarball dependency, from any
 * form npm or pnpm records: `git+ssh://git@github.com/o/r.git#sha`, `git+https://github.com/o/r.git#sha`,
 * `git@github.com:o/r.git#sha`, `github:o/r#sha`, `https://codeload.github.com/o/r/tar.gz/sha`.
 * Git dependencies are identified by repository and commit, never by the package version.
 */
export function getGitIdentity(url: string): string | undefined {
	const commit = getCommit(url);
	if (!commit) {
		return undefined;
	}
	const codeload = /^https:\/\/codeload\.github\.com\/([^/]+)\/([^/]+)\/tar\.gz\//.exec(url);
	const github = /^github:([^/#]+)\/([^#]+)#/.exec(url);
	const scp = /^(?:git\+)?(?:[^@/:]+@)?([^/:@]+):(?!\/\/)([^#]+)#/.exec(url);
	const standard = /^(?:git\+)?[a-z+]+:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/([^#]+)#/.exec(url);
	const repository = codeload ? `github.com/${codeload[1]}/${codeload[2]}`
		: github ? `github.com/${github[1]}/${github[2]}`
			: standard ? `${standard[1]}/${standard[2]}`
				: scp ? `${scp[1]}/${scp[2]}`
					: undefined;
	return repository && `${repository.replace(/\.git$/, '').toLowerCase()}#${commit}`;
}

/**
 * Returns whether `name@version` from a pnpm lockfile exists in the npm lockfiles. Git and
 * tarball dependencies match on repository and commit ({@link getGitIdentity}).
 */
export function isInUniverse(universe: Universe, name: string, version: string): boolean {
	if (isRemoteVersion(version)) {
		const identity = getGitIdentity(version);
		return !!identity && [...universe.resolvedByName.get(name) ?? []].some(resolved => getGitIdentity(resolved) === identity);
	}
	return universe.keys.has(`${name}@${version}`);
}

function getRange(specifier: string): string {
	return specifier.startsWith('npm:') ? specifier.substring(specifier.indexOf('@', 5) + 1) : specifier;
}

function compareVersions(a: string, b: string, satisfies: Satisfies | undefined): number | undefined {
	if (!satisfies) {
		return undefined;
	}
	if (a === b) {
		return 0;
	}
	return satisfies(a, `>${b}`) ? 1 : satisfies(a, `<${b}`) ? -1 : undefined;
}

/**
 * (a) Compares the direct dependencies of each project with that project's npm lockfile. A
 * higher version within the specifier's range that exists in the npm lockfiles is allowed (V-1.3).
 */
export function checkDirectDependencies(root: RootUnderTest, universe: Universe, satisfies: Satisfies | undefined): Finding[] {
	const findings: Finding[] = [];
	for (const project of root.projects) {
		const importerId = getImporterId(root.dir, path.join(root.dir, path.relative(root.folder, project.folder)));
		const importer = root.lockfile.importers[importerId];
		if (!importer) {
			findings.push({ check: 'importer', severity: 'error', root: root.folder, importer: importerId, message: 'project is missing from the lockfile importers' });
			continue;
		}
		const npmRoot = project.lockfile.packages[''] ?? {};
		const npmDirect = new Map<string, string>();
		for (const kind of importerDependencyKinds) {
			for (const [name, specifier] of Object.entries(npmRoot[kind] ?? {})) {
				npmDirect.set(name, specifier);
			}
		}
		const seen = new Set<string>();
		for (const kind of importerDependencyKinds) {
			for (const [alias, { specifier, version }] of Object.entries(importer[kind] ?? {})) {
				seen.add(alias);
				const resolved = resolveDependencyVersion(alias, version);
				const npmEntry = project.lockfile.packages[`node_modules/${alias}`];
				if (!npmEntry) {
					findings.push({ check: 'direct', severity: 'error', root: root.folder, importer: importerId, message: `${alias} (${specifier}): pnpm ${resolved.name}@${resolved.version}, not installed by npm` });
					continue;
				}
				if (npmEntry.link) {
					const expected = `file:${path.posix.join(path.posix.relative(root.folder, project.folder), npmEntry.resolved ?? '')}`;
					if (resolved.version !== expected) {
						findings.push({ check: 'direct', severity: 'error', root: root.folder, importer: importerId, message: `${alias} (${specifier}): pnpm ${resolved.version}, npm link to ${expected}` });
					}
					continue;
				}
				if (resolved.version.startsWith('file:') && npmEntry.resolved?.startsWith('file:')) {
					// A local tarball: pnpm records its path from the lockfile's folder, npm from the project's.
					const projectDir = path.join(root.dir, path.relative(root.folder, project.folder));
					const pnpmTarball = path.resolve(root.dir, resolved.version.substring('file:'.length));
					const npmTarball = path.resolve(projectDir, npmEntry.resolved.substring('file:'.length));
					if (pnpmTarball !== npmTarball) {
						findings.push({ check: 'direct', severity: 'error', root: root.folder, importer: importerId, message: `${alias} (${specifier}): pnpm ${pnpmTarball}, npm ${npmTarball}` });
					}
					continue;
				}
				const npmName = npmEntry.name ?? alias;
				if (isRemoteVersion(resolved.version)) {
					const identity = getGitIdentity(resolved.version);
					if (resolved.name !== npmName || !identity || identity !== getGitIdentity(npmEntry.resolved ?? '')) {
						findings.push({ check: 'direct', severity: 'error', root: root.folder, importer: importerId, message: `${alias} (${specifier}): pnpm ${resolved.name}@${resolved.version}, npm ${npmName} ${npmEntry.resolved}` });
					}
					continue;
				}
				if (resolved.name === npmName && resolved.version === npmEntry.version) {
					continue;
				}
				const higher = resolved.name === npmName && npmEntry.version && compareVersions(resolved.version, npmEntry.version, satisfies) === 1;
				const inRange = satisfies?.(resolved.version, getRange(specifier)) ?? false;
				const known = universe.keys.has(`${resolved.name}@${resolved.version}`);
				findings.push({
					check: 'direct',
					severity: higher && inRange && known ? 'allowed' : 'error',
					root: root.folder,
					importer: importerId,
					message: `${alias} (${specifier}): pnpm ${resolved.name}@${resolved.version}, npm ${npmName}@${npmEntry.version}${higher && inRange && known ? ' (V-1.3: higher version in range, present in the npm lockfiles)' : ''}`
				});
			}
		}
		for (const [name, specifier] of npmDirect) {
			if (!seen.has(name) && project.lockfile.packages[`node_modules/${name}`]) {
				findings.push({ check: 'direct', severity: 'error', root: root.folder, importer: importerId, message: `${name} (${specifier}) is installed by npm but missing from the pnpm importer` });
			}
		}
	}
	return findings;
}

/**
 * (b) Every `name@version` in the pnpm lockfile must exist in some npm lockfile at the same commit.
 */
export function checkUniverse(root: RootUnderTest, universe: Universe): Finding[] {
	const findings: Finding[] = [];
	for (const key of Object.keys(root.lockfile.packages ?? {})) {
		const { name, version } = parsePackageKey(key);
		if (isLocalVersion(version) || isInUniverse(universe, name, version)) {
			continue;
		}
		findings.push({ check: 'universe', severity: 'error', root: root.folder, message: `${name}@${version} is not in any npm lockfile (${describeDependents(root.lockfile, key)})` });
	}
	return findings;
}

/**
 * Describes which importers reach a package, for error messages.
 */
export function describeDependents(lockfile: PnpmLockfile, packageKey: string): string {
	const importers = Object.keys(lockfile.importers).filter(id => [...collectImporterPackages(lockfile, id)].some(key => key === packageKey || key.startsWith(`${packageKey}(`)));
	return importers.length > 0 ? `reached from ${importers.join(', ')}` : 'not reachable from any importer';
}

function satisfiesOverrideValue(name: string, version: string, value: string, satisfies: Satisfies | undefined): boolean {
	if (isLocalVersion(value)) {
		return version === value;
	}
	if (value.startsWith('npm:')) {
		const at = value.indexOf('@', 5);
		const target = value.substring(4, at);
		const range = value.substring(at + 1);
		return name === target && (version === range || !!satisfies?.(version, range));
	}
	return version === value || !!satisfies?.(version, value);
}

/**
 * (c) Re-applies the npm `overrides` of every project to its part of the pnpm lockfile: within the
 * packages that a project reaches, every package selected by an override must satisfy it.
 */
export function checkOverrides(root: RootUnderTest, satisfies: Satisfies | undefined): Finding[] {
	const findings: Finding[] = [];
	const snapshots = root.lockfile.snapshots ?? {};
	for (const project of root.projects) {
		const overrides = convertNpmOverrides(project.packageJson.overrides);
		if (overrides.size === 0) {
			continue;
		}
		const importerId = getImporterId(root.dir, path.join(root.dir, path.relative(root.folder, project.folder)));
		const reachable = root.lockfile.importers[importerId] ? collectImporterPackages(root.lockfile, importerId) : new Set<string>();
		for (const [key, value] of overrides) {
			const { parent, name } = parseOverrideKey(key);
			for (const snapshotKey of reachable) {
				const snapshot = parsePackageKey(snapshotKey);
				if (!parent) {
					if (snapshot.name === name && !satisfiesOverrideValue(name, snapshot.version, value, satisfies)) {
						findings.push({ check: 'override', severity: 'error', root: root.folder, importer: importerId, message: `override ${key}: ${value} is not applied: ${snapshot.name}@${snapshot.version}` });
					}
					continue;
				}
				if (snapshot.name !== parent.name || (parent.version && snapshot.version !== parent.version)) {
					continue;
				}
				for (const kind of snapshotDependencyKinds) {
					const dependencyVersion = snapshots[snapshotKey]?.[kind]?.[name];
					if (dependencyVersion === undefined) {
						continue;
					}
					const resolved = resolveDependencyVersion(name, dependencyVersion);
					if (!satisfiesOverrideValue(resolved.name, resolved.version, value, satisfies)) {
						findings.push({ check: 'override', severity: 'error', root: root.folder, importer: importerId, message: `override ${key}: ${value} is not applied: ${snapshot.name}@${snapshot.version} depends on ${resolved.name}@${resolved.version}` });
					}
				}
			}
		}
	}
	return dedupe(findings);
}

/**
 * (g) Lockfiles must not record SSH git URLs, which CI can't fetch.
 */
export function checkSshUrls(root: string, lockfileText: string): Finding[] {
	const findings: Finding[] = [];
	const lines = lockfileText.split(/\r?\n/);
	lines.forEach((line, index) => {
		if (/git\+ssh:\/\/|\bssh:\/\/|git@github\.com:/.test(line)) {
			findings.push({ check: 'ssh', severity: 'error', root, message: `line ${index + 1} records an SSH git URL: ${line.trim()}` });
		}
	});
	return findings;
}

/**
 * Checks that every patch of `patchedDependencies` exists and that the lockfile records its
 * current hash (pnpm's: SHA-256 of the content with LF line endings). Otherwise a frozen install
 * fails, or a changed patch is not applied by a non-frozen one until the lockfile is updated.
 */
export function checkPatches(root: RootUnderTest, patches: Readonly<Record<string, string>>, display: string): Finding[] {
	const findings: Finding[] = [];
	for (const [name, file] of Object.entries(patches)) {
		const patchFile = path.join(root.dir, file);
		if (!fs.existsSync(patchFile)) {
			findings.push({ check: 'setting', severity: 'error', root: display, message: `the patch of ${name} doesn't exist: ${file}` });
			continue;
		}
		const hash = crypto.createHash('sha256').update(fs.readFileSync(patchFile, 'utf8').split('\r\n').join('\n')).digest('hex');
		const recorded = root.lockfile.patchedDependencies?.[name];
		if (recorded !== hash) {
			findings.push({ check: 'setting', severity: 'error', root: display, message: `pnpm-lock.yaml records ${recorded === undefined ? 'no patch hash' : `patch hash ${recorded}`} for ${name}, but ${file} has hash ${hash}; run convert.ts` });
		}
	}
	for (const name of Object.keys(root.lockfile.patchedDependencies ?? {})) {
		if (!Object.hasOwn(patches, name)) {
			findings.push({ check: 'setting', severity: 'error', root: display, message: `pnpm-lock.yaml records a patch for ${name}, which has none in pnpm-workspace.yaml; run convert.ts` });
		}
	}
	return findings;
}

/**
 * Informational: packages that a project reaches in the pnpm lockfile but that its own npm
 * lockfile doesn't have (they exist in another npm lockfile, or the universe check fails).
 * Typical causes: pnpm links optional peer dependencies that npm doesn't install with
 * `legacy-peer-deps`, and pnpm resolves the dependencies of a package once per workspace.
 */
export function checkSubtrees(root: RootUnderTest): Finding[] {
	const findings: Finding[] = [];
	for (const project of root.projects) {
		const importerId = getImporterId(root.dir, path.join(root.dir, path.relative(root.folder, project.folder)));
		if (!root.lockfile.importers[importerId]) {
			continue;
		}
		const own = new Set(getInstalledPackages(project.lockfile).map(p => `${p.name}@${p.version}`));
		const extra = new Set<string>();
		for (const key of collectImporterPackages(root.lockfile, importerId)) {
			const { name, version } = parsePackageKey(key);
			if (!isLocalVersion(version) && !isRemoteVersion(version) && !own.has(`${name}@${version}`)) {
				extra.add(`${name}@${version}`);
			}
		}
		if (extra.size > 0) {
			findings.push({ check: 'subtree', severity: 'info', root: root.folder, importer: importerId, message: `${extra.size} packages not in its own npm lockfile: ${[...extra].sort().join(' ')}` });
		}
	}
	return findings;
}

/**
 * For every `name@version` in npm lockfiles, the versions (`name@version`) that npm resolves each
 * of its dependencies to, over all the locations of the package.
 */
export function collectNpmEdges(lockfiles: readonly NpmLockfile[]): Map<string, Map<string, Set<string>>> {
	const npmEdges = new Map<string, Map<string, Set<string>>>();
	for (const lockfile of lockfiles) {
		for (const pkg of getInstalledPackages(lockfile)) {
			const edges = npmEdges.get(`${pkg.name}@${pkg.version}`) ?? new Map<string, Set<string>>();
			npmEdges.set(`${pkg.name}@${pkg.version}`, edges);
			for (const dependency of Object.keys({ ...pkg.entry.dependencies, ...pkg.entry.optionalDependencies })) {
				const target = resolveNpmDependency(lockfile, pkg.key, dependency);
				const entry = target ? lockfile.packages[target] : undefined;
				if (entry?.version && !entry.link) {
					const versions = edges.get(dependency) ?? new Set<string>();
					versions.add(`${entry.name ?? dependency}@${entry.version}`);
					edges.set(dependency, versions);
				}
			}
		}
	}
	return npmEdges;
}

/**
 * Compares the dependencies of every package in the pnpm lockfile with npm's resolution of the
 * same `name@version` in the root's npm lockfiles. pnpm records one set of dependencies per
 * package (and peer set), while npm resolves each copy of a package from its own location. A
 * difference is `consistent` when all npm copies agree on another version than pnpm's, and `mixed`
 * when npm itself resolves the dependency differently in different locations. Informational: the
 * versions are all in the npm lockfiles (checked by the universe check).
 */
export function checkEdges(root: RootUnderTest): Finding[] {
	const npmEdges = collectNpmEdges(root.projects.map(project => project.lockfile));
	const consistent = new Set<string>();
	const mixed = new Set<string>();
	for (const [key, snapshot] of Object.entries(root.lockfile.snapshots ?? {})) {
		const { name, version } = parsePackageKey(key);
		const edges = npmEdges.get(`${name}@${version}`);
		for (const kind of snapshotDependencyKinds) {
			for (const [alias, dependencyVersion] of Object.entries(snapshot[kind] ?? {})) {
				const resolved = resolveDependencyVersion(alias, dependencyVersion);
				const npmVersions = edges?.get(alias);
				const pnpmId = `${resolved.name}@${resolved.version}`;
				if (!npmVersions || isLocalVersion(resolved.version) || isRemoteVersion(resolved.version) || (npmVersions.size === 1 && npmVersions.has(pnpmId))) {
					continue;
				}
				const description = `${name}@${version} -> ${pnpmId} (npm ${[...npmVersions].sort().join(', ')})`;
				(npmVersions.size === 1 ? consistent : mixed).add(description);
			}
		}
	}
	const findings: Finding[] = [];
	if (consistent.size > 0) {
		findings.push({ check: 'edge', severity: 'info', root: root.folder, message: `${consistent.size} dependencies that npm resolves to one other version: ${[...consistent].sort().join('; ')}` });
	}
	if (mixed.size > 0) {
		findings.push({ check: 'edge', severity: 'info', root: root.folder, message: `${mixed.size} dependencies that npm resolves differently by location: ${[...mixed].sort().join('; ')}` });
	}
	return findings;
}

function toPackageId(name: string, version: string): string | undefined {
	if (isLocalVersion(version)) {
		return undefined;
	}
	if (isRemoteVersion(version)) {
		const identity = getGitIdentity(version);
		return `${name}@${identity ? `git:${identity}` : version}`;
	}
	return `${name}@${version}`;
}

function toNpmPackageId(name: string, version: string | undefined, resolved: string | undefined): string | undefined {
	if (resolved && /^(git\+|git:|github:|https:\/\/codeload\.)/.test(resolved)) {
		return toPackageId(name, resolved);
	}
	return version ? `${name}@${version}` : undefined;
}

/**
 * The production closure of a pnpm importer (`dependencies` and `optionalDependencies`, then the
 * packages' own dependencies), with one dependency path to each package.
 */
function collectPnpmProductionClosure(lockfile: PnpmLockfile, importerId: string): Map<string, string[]> {
	const importer = lockfile.importers[importerId];
	const closure = new Map<string, string[]>();
	const visited = new Set<string>();
	const queue: { key: string; path: string[] }[] = [];
	const enqueue = (alias: string, version: string, path: string[], isPeer = false) => {
		const resolved = resolveDependencyVersion(alias, version);
		const key = version.split('(')[0].includes('@') ? version : `${alias}@${version}`;
		const id = toPackageId(resolved.name, resolved.version) ?? `${resolved.name}@${resolved.version}`;
		queue.push({ key, path: [...path, isPeer ? `${id} (peer)` : id] });
	};
	for (const kind of ['dependencies', 'optionalDependencies'] as const) {
		for (const [alias, { version }] of Object.entries(importer?.[kind] ?? {})) {
			if (!version.startsWith('link:')) {
				enqueue(alias, version, []);
			}
		}
	}
	while (queue.length > 0) {
		const { key, path } = queue.shift()!;
		if (visited.has(key)) {
			continue;
		}
		visited.add(key);
		const { name, version } = parsePackageKey(key);
		const id = toPackageId(name, version);
		if (id && !closure.has(id)) {
			closure.set(id, path);
		}
		const snapshot = lockfile.snapshots?.[key];
		// pnpm records resolved peers as dependencies; npm with legacy-peer-deps never installs them
		const peers = lockfile.packages?.[key.split('(')[0]]?.peerDependencies ?? {};
		for (const kind of snapshotDependencyKinds) {
			for (const [alias, dependencyVersion] of Object.entries(snapshot?.[kind] ?? {})) {
				enqueue(alias, dependencyVersion, path, Object.hasOwn(peers, alias));
			}
		}
	}
	return closure;
}

/**
 * The production closure of an npm project as npm resolves it (`dependencies` and
 * `optionalDependencies` from the project, followed through Node's resolution in the lockfile),
 * with one dependency path to each package.
 */
function collectNpmProductionClosure(lockfile: NpmLockfile): Map<string, string[]> {
	const closure = new Map<string, string[]>();
	const visited = new Set<string>();
	const queue: { from: string; dependencies: string[]; path: string[] }[] = [];
	const rootEntry = lockfile.packages[''] ?? {};
	queue.push({ from: '', dependencies: Object.keys({ ...rootEntry.dependencies, ...rootEntry.optionalDependencies }), path: [] });
	while (queue.length > 0) {
		const { from, dependencies, path } = queue.shift()!;
		for (const dependency of dependencies) {
			let key = resolveNpmDependency(lockfile, from, dependency);
			let entry = key !== undefined ? lockfile.packages[key] : undefined;
			if (entry?.link && entry.resolved !== undefined) {
				key = entry.resolved;
				entry = lockfile.packages[key];
			}
			if (key === undefined || !entry || visited.has(key)) {
				continue;
			}
			visited.add(key);
			const local = !key.includes('node_modules/');
			const id = local ? undefined : toNpmPackageId(entry.name ?? dependency, entry.version, entry.resolved);
			const childPath = [...path, id ?? `${dependency}@file:${key}`];
			if (id && !closure.has(id)) {
				closure.set(id, childPath);
			}
			queue.push({ from: key, dependencies: Object.keys({ ...entry.dependencies, ...entry.optionalDependencies }), path: childPath });
		}
	}
	return closure;
}

/**
 * (i) Compares the production closure of every project in the pnpm lockfile with the production
 * closure of the project's own npm lockfile and reports every package added or removed, with a
 * dependency path. No rule accepts these automatically: an addition can be a package that npm
 * satisfied in another way (for example with a `file:` mock), even when the same version exists in
 * another npm lockfile. They are listed for the owner to review.
 */
export function checkProductionClosure(root: RootUnderTest): Finding[] {
	const findings: Finding[] = [];
	for (const project of root.projects) {
		const importerId = getImporterId(root.dir, path.join(root.dir, path.relative(root.folder, project.folder)));
		if (!root.lockfile.importers[importerId]) {
			continue;
		}
		const pnpmClosure = collectPnpmProductionClosure(root.lockfile, importerId);
		const npmClosure = collectNpmProductionClosure(project.lockfile);
		const ownPackages = new Set(getInstalledPackages(project.lockfile).map(p => toNpmPackageId(p.name, p.version, p.entry.resolved)));
		const add = (message: string) => findings.push({ check: 'closure', severity: 'review', root: root.folder, importer: importerId, message });
		for (const [id, dependencyPath] of [...pnpmClosure].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
			if (!npmClosure.has(id)) {
				add(`+ ${id} (${ownPackages.has(id) ? 'in its npm lockfile, outside the production closure' : 'not in its npm lockfile'}) via ${dependencyPath.join(' > ')}`);
			}
		}
		for (const [id, dependencyPath] of [...npmClosure].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
			if (!pnpmClosure.has(id)) {
				add(`- ${id} (npm) via ${dependencyPath.join(' > ')}`);
			}
		}
	}
	return findings;
}

/**
 * (j) With `autoInstallPeers: false`, pnpm's hoisted linker treats every peer dependency name of a
 * package (and its transitive peer names) as provided by an ancestor, even when the lockfile also
 * resolves it as the package's own dependency (for example `vitest` declares `vite` both ways). If
 * no ancestor provides it and nothing else in the install root depends on that version as a
 * regular dependency (which gets it placed, visible in the hoisted tree), the package is not
 * installed at all, while npm (`legacy-peer-deps`) installed it.
 */
export function checkPeerProvidedDependencies(root: RootUnderTest): Finding[] {
	if (root.lockfile.settings?.autoInstallPeers !== false) {
		return [];
	}
	const snapshots = root.lockfile.snapshots ?? {};
	const keyOf = (alias: string, version: string) => version.split('(')[0].includes('@') ? version : `${alias}@${version}`;
	const depsOf = (snapshot: PnpmLockfileSnapshot | undefined) => ({ ...snapshot?.dependencies, ...snapshot?.optionalDependencies });
	const peerNames = (key: string) => new Set([
		...Object.keys(root.lockfile.packages?.[key.replace(/\(.*$/, '')]?.peerDependencies ?? {}),
		...snapshots[key]?.transitivePeerDependencies ?? [],
	]);
	// parents of every snapshot: other snapshots, or importers (prefixed with `importer:`)
	const parents = new Map<string, Set<string>>();
	const addParent = (child: string, parent: string) => {
		let set = parents.get(child);
		if (!set) {
			set = new Set();
			parents.set(child, set);
		}
		set.add(parent);
	};
	for (const [id, importer] of Object.entries(root.lockfile.importers)) {
		for (const kind of importerDependencyKinds) {
			for (const [alias, { version }] of Object.entries(importer[kind] ?? {})) {
				addParent(keyOf(alias, version), `importer:${id}`);
			}
		}
	}
	for (const [key, snapshot] of Object.entries(snapshots)) {
		for (const [alias, version] of Object.entries(depsOf(snapshot))) {
			addParent(keyOf(alias, version), key);
		}
	}
	const provides = (node: string, name: string, visiting: Set<string>): boolean => {
		if (node.startsWith('importer:')) {
			const importer = root.lockfile.importers[node.substring('importer:'.length)];
			return importerDependencyKinds.some(kind => importer?.[kind]?.[name] !== undefined);
		}
		if (Object.hasOwn(depsOf(snapshots[node]), name) && !peerNames(node).has(name)) {
			return true;
		}
		if (visiting.has(node)) {
			return false;
		}
		visiting.add(node);
		return [...parents.get(node) ?? []].some(parent => provides(parent, name, visiting));
	};
	// `name@version` of every regular (non-peer) dependency: pnpm places these packages somewhere
	const placed = new Set<string>();
	for (const importer of Object.values(root.lockfile.importers)) {
		for (const kind of importerDependencyKinds) {
			for (const [alias, { version }] of Object.entries(importer[kind] ?? {})) {
				const resolved = resolveDependencyVersion(alias, version);
				placed.add(`${resolved.name}@${resolved.version}`);
			}
		}
	}
	for (const [key, snapshot] of Object.entries(snapshots)) {
		const peers = peerNames(key);
		for (const [alias, version] of Object.entries(depsOf(snapshot))) {
			if (!peers.has(alias)) {
				const resolved = resolveDependencyVersion(alias, version);
				placed.add(`${resolved.name}@${resolved.version}`);
			}
		}
	}
	const findings: Finding[] = [];
	for (const [key, snapshot] of Object.entries(snapshots)) {
		const peers = peerNames(key);
		for (const [name, version] of Object.entries(depsOf(snapshot))) {
			const resolved = resolveDependencyVersion(name, version);
			if (peers.has(name) && !placed.has(`${resolved.name}@${resolved.version}`) && ![...parents.get(key) ?? []].some(parent => provides(parent, name, new Set()))) {
				const { name: packageName, version } = parsePackageKey(key);
				findings.push({ check: 'peer', severity: 'error', root: root.folder, message: `${packageName}@${version} depends on ${name}, which is also its peer and is not provided by any parent: pnpm's hoisted linker won't install it (npm did). Declare ${name} where the package is used.` });
			}
		}
	}
	return dedupe(findings);
}

function dedupe(findings: Finding[]): Finding[] {
	const seen = new Set<string>();
	return findings.filter(f => {
		const key = JSON.stringify(f);
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}
