/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { workspaceMembers, separateRoots, standaloneRoots, distroRoots } from '../npm/dirs.ts';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..');

// Scripts that run before the dependencies are installed import this module (through
// `getLockedVersion`), so it must not import packages: js-yaml is loaded when first needed.
const require = createRequire(import.meta.url);

/**
 * A direct dependency of a lockfile importer.
 */
export interface PnpmLockfileDependency {
	readonly specifier: string;
	readonly version: string;
}

/**
 * A project (`package.json`) recorded in a lockfile.
 */
export interface PnpmLockfileImporter {
	readonly dependencies?: Record<string, PnpmLockfileDependency>;
	readonly devDependencies?: Record<string, PnpmLockfileDependency>;
	readonly optionalDependencies?: Record<string, PnpmLockfileDependency>;
}

/**
 * How a package is fetched.
 */
export interface PnpmLockfileResolution {
	readonly integrity?: string;
	readonly tarball?: string;
	readonly directory?: string;
	readonly repo?: string;
	readonly commit?: string;
	readonly type?: string;
}

/**
 * A package (`name@version`, without peer dependencies) recorded in a lockfile.
 */
export interface PnpmLockfilePackage {
	readonly resolution: PnpmLockfileResolution;
	readonly version?: string;
	readonly peerDependencies?: Record<string, string>;
	readonly hasBin?: boolean;
	readonly requiresBuild?: boolean;
}

/**
 * A package together with the resolved versions of its dependencies (and peer dependencies).
 */
export interface PnpmLockfileSnapshot {
	readonly dependencies?: Record<string, string>;
	readonly optionalDependencies?: Record<string, string>;
	readonly transitivePeerDependencies?: readonly string[];
	readonly optional?: boolean;
}

/**
 * The parts of a `pnpm-lock.yaml` file (lockfile version 9) that the build reads.
 */
export interface PnpmLockfile {
	readonly lockfileVersion: string;
	readonly settings?: Record<string, unknown>;
	readonly overrides?: Record<string, string>;
	/** The hash of each patch file of `patchedDependencies` in `pnpm-workspace.yaml`. */
	readonly patchedDependencies?: Record<string, string>;
	readonly pnpmfileChecksum?: string;
	readonly importers: Record<string, PnpmLockfileImporter>;
	readonly packages?: Record<string, PnpmLockfilePackage>;
	readonly snapshots?: Record<string, PnpmLockfileSnapshot>;
}

export const importerDependencyKinds = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;
export const snapshotDependencyKinds = ['dependencies', 'optionalDependencies'] as const;

/**
 * Parses the contents of a `pnpm-lock.yaml` file.
 */
export function parsePnpmLockfile(content: string): PnpmLockfile {
	const { load } = require('js-yaml') as typeof import('js-yaml');
	const lockfile = load(content) as PnpmLockfile | undefined;
	if (!lockfile || typeof lockfile !== 'object' || !lockfile.importers) {
		throw new Error('Not a pnpm lockfile: missing `importers`.');
	}
	assertLockfileVersion(lockfile.lockfileVersion);
	return lockfile;
}

function assertLockfileVersion(version: unknown): void {
	if (!/^9\./.test(String(version))) {
		throw new Error(`Unsupported pnpm lockfile version: ${version}`);
	}
}

/**
 * Matches a `key:` or `key: value` line of a YAML block mapping. The key is plain or quoted.
 */
const yamlMappingLine = /^(?<indent> *)(?<key>'(?:[^']|'')*'|"(?:[^"\\]|\\.)*"|[^\s'"#{[][^:#]*?):(?: (?<value>.*))?$/;

/**
 * Returns the value of a YAML scalar as pnpm writes it in a lockfile: plain, single-quoted or
 * double-quoted, on one line.
 */
function parseYamlScalar(text: string): string {
	if (text.startsWith('\'')) {
		if (text.length < 2 || !text.endsWith('\'')) {
			throw new Error(`Unsupported YAML scalar in pnpm lockfile: ${text}`);
		}
		return text.substring(1, text.length - 1).replace(/''/g, '\'');
	}
	if (text.startsWith('"')) {
		return JSON.parse(text);
	}
	if (/^[{[&*!|>%@`]| #|^$/.test(text)) {
		throw new Error(`Unsupported YAML scalar in pnpm lockfile: ${text}`);
	}
	return text;
}

/**
 * Returns the direct dependencies of the importer `importerId` in the contents of a
 * `pnpm-lock.yaml` file, or `undefined` if the lockfile has no such importer.
 *
 * Unlike {@link parsePnpmLockfile}, this needs no YAML parser, so that scripts can read locked
 * versions before the dependencies are installed. It reads the block layout in which pnpm writes
 * the `importers` section, and throws on anything else in the requested importer.
 */
export function readLockfileImporter(content: string, importerId: string): PnpmLockfileImporter | undefined {
	const lines = content.split(/\r?\n/);
	const start = lines.indexOf('importers:');
	if (start === -1) {
		throw new Error('Not a pnpm lockfile: missing `importers`.');
	}
	const versionLine = lines.find(line => line.startsWith('lockfileVersion:'));
	assertLockfileVersion(versionLine && parseYamlScalar(versionLine.substring('lockfileVersion:'.length).trim()));

	type Dependency = { specifier?: string; version?: string };
	let importer: { [K in typeof importerDependencyKinds[number]]?: Record<string, Dependency> } | undefined;
	let dependencies: Record<string, Dependency> | undefined;
	let dependency: Dependency | undefined;
	for (const line of lines.slice(start + 1)) {
		if (line.trim() === '') {
			continue;
		}
		const indent = line.length - line.trimStart().length;
		if (indent === 0) {
			break;
		}
		// Skips other importers, and the fields of the importer other than its dependencies.
		if ((indent > 2 && !importer) || (indent > 4 && !dependencies)) {
			continue;
		}
		const match = yamlMappingLine.exec(line);
		if (!match?.groups) {
			throw new Error(`Unsupported line in the importers of a pnpm lockfile: ${line}`);
		}
		const key = parseYamlScalar(match.groups.key);
		const value = match.groups.value?.trimEnd();
		if (indent === 2) {
			if (importer) {
				break;
			}
			if (key === importerId) {
				if (value !== undefined && value !== '{}') {
					throw new Error(`Unsupported importer in pnpm lockfile: ${line}`);
				}
				importer = {};
			}
		} else if (indent === 4) {
			const kind = importerDependencyKinds.find(kind => kind === key);
			if (kind && value !== undefined && value !== '{}') {
				throw new Error(`Unsupported dependencies in pnpm lockfile: ${line}`);
			}
			dependencies = kind ? importer![kind] = {} : undefined;
			dependency = undefined;
		} else if (indent === 6 && value === undefined) {
			dependency = dependencies![key] = {};
		} else if (indent === 8 && dependency && (key === 'specifier' || key === 'version') && value !== undefined) {
			dependency[key] = parseYamlScalar(value);
		} else {
			throw new Error(`Unsupported line in the importers of a pnpm lockfile: ${line}`);
		}
	}

	for (const kind of importerDependencyKinds) {
		for (const [name, { specifier, version }] of Object.entries(importer?.[kind] ?? {})) {
			if (specifier === undefined || version === undefined) {
				throw new Error(`Missing specifier or version of ${name} in the ${kind} of importer ${importerId} in pnpm lockfile.`);
			}
		}
	}
	return importer as PnpmLockfileImporter | undefined;
}

/**
 * Reads and parses a `pnpm-lock.yaml` file.
 */
export function readPnpmLockfile(file: string): PnpmLockfile {
	return parsePnpmLockfile(fs.readFileSync(file, 'utf8'));
}

/**
 * Splits a lockfile package or snapshot key such as `@scope/name@1.0.0(peer@2.0.0)` into the
 * package name, the version (without the peer suffix) and the peer suffix.
 */
export function parsePackageKey(key: string): { name: string; version: string; peers: string } {
	const peerStart = key.indexOf('(');
	const withoutPeers = peerStart === -1 ? key : key.substring(0, peerStart);
	const at = withoutPeers.indexOf('@', 1);
	if (at === -1) {
		throw new Error(`Invalid lockfile package key: ${key}`);
	}
	return {
		name: withoutPeers.substring(0, at),
		version: withoutPeers.substring(at + 1),
		peers: peerStart === -1 ? '' : key.substring(peerStart),
	};
}

/**
 * Returns whether the version of a dependency, as written in an importer or snapshot, refers to
 * another package (an npm alias such as `typescript@6.0.3`) rather than a version of the
 * dependency itself.
 */
function isAliasVersion(version: string): boolean {
	const peerStart = version.indexOf('(');
	const withoutPeers = peerStart === -1 ? version : version.substring(0, peerStart);
	return !/^(link|file|workspace):/.test(withoutPeers) && withoutPeers.indexOf('@', 1) !== -1 && !/^[a-z+]+:\/\//.test(withoutPeers);
}

/**
 * Returns the snapshot key for a dependency named `name` that resolved to `version` (as written
 * in an importer or a snapshot), or `undefined` for `link:` dependencies, which have no snapshot.
 */
export function getSnapshotKey(name: string, version: string): string | undefined {
	if (version.startsWith('link:')) {
		return undefined;
	}
	return isAliasVersion(version) ? version : `${name}@${version}`;
}

/**
 * Returns the real package name and version (without peer suffix) of a dependency named `name`
 * that resolved to `version`.
 */
export function resolveDependencyVersion(name: string, version: string): { name: string; version: string } {
	if (isAliasVersion(version)) {
		const parsed = parsePackageKey(version);
		return { name: parsed.name, version: parsed.version };
	}
	const peerStart = version.indexOf('(');
	return { name, version: peerStart === -1 ? version : version.substring(0, peerStart) };
}

/**
 * Returns the lockfile importer id (`.` for the lockfile folder itself) of `folder`.
 */
export function getImporterId(lockfileDir: string, folder: string): string {
	const relative = path.relative(lockfileDir, folder).split(path.sep).join('/');
	return relative === '' ? '.' : relative;
}

/**
 * Returns the snapshot keys of every package reachable from an importer, including the packages
 * that its packages depend on.
 */
export function collectImporterPackages(lockfile: PnpmLockfile, importerId: string, options: { readonly includeDevDependencies?: boolean } = {}): Set<string> {
	const importer = lockfile.importers[importerId];
	if (!importer) {
		throw new Error(`Importer not found in lockfile: ${importerId}`);
	}
	const kinds = options.includeDevDependencies === false ? ['dependencies', 'optionalDependencies'] as const : importerDependencyKinds;
	const result = new Set<string>();
	const stack: string[] = [];
	for (const kind of kinds) {
		for (const [name, { version }] of Object.entries(importer[kind] ?? {})) {
			const key = getSnapshotKey(name, version);
			if (key) {
				stack.push(key);
			}
		}
	}
	while (stack.length > 0) {
		const key = stack.pop()!;
		if (result.has(key)) {
			continue;
		}
		result.add(key);
		const snapshot = lockfile.snapshots?.[key];
		for (const kind of snapshotDependencyKinds) {
			for (const [name, version] of Object.entries(snapshot?.[kind] ?? {})) {
				const dependencyKey = getSnapshotKey(name, version);
				if (dependencyKey && !result.has(dependencyKey)) {
					stack.push(dependencyKey);
				}
			}
		}
	}
	return result;
}

/**
 * Returns the folder (relative to the repository root, `''` for the root) whose `pnpm-lock.yaml`
 * records the dependencies of `folder`, or `undefined` if the folder is not a pnpm project.
 */
export function getLockfileFolder(folder: string): string | undefined {
	const normalized = folder.split(path.sep).join('/').replace(/\/+$/, '').replace(/^\.\/?/, '');
	if (workspaceMembers.includes(normalized)) {
		return '';
	}
	if ([...separateRoots, ...standaloneRoots, ...distroRoots].includes(normalized)) {
		return normalized;
	}
	return undefined;
}

/**
 * Returns the version (without peer suffix) to which the direct dependency `packageName` of the
 * project in `folder` (relative to the repository root) is locked, or `undefined` if it is not a
 * direct dependency. For an npm alias, this is the version of the aliased package.
 *
 * Needs no installed packages: the SDK canary override runs it before `pnpm install`.
 */
export function getLockedVersion(folder: string, packageName: string, root = REPO_ROOT): string | undefined {
	const lockfileFolder = getLockfileFolder(folder);
	if (lockfileFolder === undefined) {
		throw new Error(`Not a pnpm project folder: ${folder}`);
	}
	const lockfilePath = path.join(root, lockfileFolder, 'pnpm-lock.yaml');
	const importer = readLockfileImporter(fs.readFileSync(lockfilePath, 'utf8'), getImporterId(path.join(root, lockfileFolder), path.join(root, folder)));
	for (const kind of importerDependencyKinds) {
		const dependency = importer?.[kind]?.[packageName];
		if (dependency) {
			return resolveDependencyVersion(packageName, dependency.version).version;
		}
	}
	return undefined;
}

/**
 * Returns the `pnpm-lock.yaml` files of every pnpm install root that exists, relative to the
 * repository root, in a fixed order.
 */
export function listLockfiles(root = REPO_ROOT): string[] {
	return ['', ...separateRoots, ...standaloneRoots, ...distroRoots]
		.map(folder => path.posix.join(folder, 'pnpm-lock.yaml'))
		.filter(file => fs.existsSync(path.join(root, file)));
}
