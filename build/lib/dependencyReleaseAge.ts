/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Checks the package versions that a change adds to the lockfiles (pnpm-lock.yaml, package-lock.json and Cargo.lock)
// against the release-age policy of pnpm-workspace.yaml (`minimumReleaseAge` and `minimumReleaseAgeExclude`), and
// checks that they come from the official registries (registry.npmjs.org, crates.io) rather than from git
// repositories, tarball URLs or other registries. pnpm applies the policy when it resolves new versions, but the
// lockfiles that npm and Cargo install are not covered by it. The Dependency Release Age job of
// .github/workflows/pr.yml runs this script with only public data, so it also works for pull requests from forks.
//
//   node build/lib/dependencyReleaseAge.ts --base <commit> [--head <commit>] [--now <ISO date>]

import { execFileSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

export type Ecosystem = 'npm' | 'crates';

export type PackageSource =
	| { readonly kind: 'registry' }
	| { readonly kind: 'local' }
	/** A git repository of ALLOWED_CARGO_GIT_REPOSITORIES, which is neither checked for its source nor for its age. */
	| { readonly kind: 'allowed'; readonly description: string }
	| { readonly kind: 'other'; readonly description: string };

export interface ILockedPackage {
	readonly ecosystem: Ecosystem;
	readonly name: string;
	readonly version: string;
	readonly source: PackageSource;
}

export interface IReleaseAgePolicy {
	/** The minimum age of a version, in minutes, or undefined when the policy sets none. */
	readonly minimumReleaseAge: number | undefined;
	readonly exclude: readonly string[];
	/** Exclusions that a version must match as well, those of the base when a change edits the policy. */
	readonly alsoExclude?: readonly string[];
	/** The pnpm-workspace.yaml that the policy comes from. */
	readonly file: string | undefined;
}

export type Release = { readonly kind: 'published'; readonly publishedAt: Date } | { readonly kind: 'notFound' };

export interface IRegistry {
	/** Throws when the registry cannot be reached. */
	release(ecosystem: Ecosystem, name: string, version: string): Promise<Release>;
}

export interface IViolation {
	readonly lockfile: string;
	readonly name: string;
	readonly version: string;
	readonly message: string;
}

const NPM_REGISTRY = 'https://registry.npmjs.org/';
const CRATES_IO_SOURCES = ['registry+https://github.com/rust-lang/crates.io-index', 'sparse+https://index.crates.io/'];

/**
 * The git repositories that Cargo.lock may take crates from at any revision, though they're not on crates.io: the Dev
 * Tunnels SDK, and the SSH library that it and the CLI use. They're compared with the whole host and path of the source.
 */
const ALLOWED_CARGO_GIT_REPOSITORIES = new Set(['https://github.com/microsoft/dev-tunnels', 'https://github.com/microsoft/vscode-russh']);

/** The source of a Cargo package: crates.io, a git repository that ALLOWED_CARGO_GIT_REPOSITORIES lists, or another one. */
export function cargoSource(source: string): PackageSource {
	if (CRATES_IO_SOURCES.includes(source)) {
		return { kind: 'registry' };
	}
	if (source.startsWith('git+')) {
		const description = `git repository ${source.slice(4)}`;
		let url: URL | undefined;
		try {
			url = new URL(source.slice(4));
		} catch {
			// Then it isn't allowed.
		}
		const repository = url && !url.username && !url.password && !url.port ? `${url.protocol}//${url.hostname}${url.pathname}` : undefined;
		return repository && ALLOWED_CARGO_GIT_REPOSITORIES.has(repository) ? { kind: 'allowed', description } : { kind: 'other', description };
	}
	return { kind: 'other', description: `registry ${source}` };
}

const LOCKFILE_NAMES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'Cargo.lock']);

export function isLockfile(file: string): boolean {
	return LOCKFILE_NAMES.has(path.posix.basename(file));
}

function assertNoConflictMarkers(text: string): void {
	if (/^(<{7}|>{7}|={7})(\s|$)/m.test(text)) {
		throw new Error('contains merge conflict markers');
	}
}

/** Splits `name@version` and `@scope/name@version`, without the peer dependency suffix of pnpm, `(peer@1.0.0)`. */
export function splitPackageKey(key: string): { readonly name: string; readonly version: string } | undefined {
	const at = key.indexOf('@', 1);
	if (at <= 0) {
		return undefined;
	}
	const version = key.slice(at + 1);
	const peers = version.indexOf('(');
	return { name: key.slice(0, at), version: peers === -1 ? version : version.slice(0, peers) };
}

/** The fields of a pnpm lockfile `resolution`. Any other field fails the check, rather than being read as the registry. */
const PNPM_RESOLUTION_FIELDS = new Set(['integrity', 'tarball', 'type', 'repo', 'commit', 'directory', 'path']);

/** A version that a registry publishes, rather than a git, URL or path specifier in the version field. */
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses YAML with js-yaml, reading every scalar as a string (the failsafe schema). The Dependency Release Age job of
 * .github/workflows/pr.yml downloads a version that it pins with its integrity, and passes its path in
 * DEPENDENCY_RELEASE_AGE_JS_YAML, so that a pull request cannot change the parser that checks it. Elsewhere, such as in
 * the tests, it uses the js-yaml of the root package.json.
 */
interface IYaml {
	load(text: string, options: { readonly schema: unknown }): unknown;
	loadAll(text: string, iterator: undefined, options: { readonly schema: unknown }): unknown[];
	readonly FAILSAFE_SCHEMA: unknown;
	readonly CORE_SCHEMA: unknown;
}

const yaml: IYaml = await import(process.env.DEPENDENCY_RELEASE_AGE_JS_YAML ? pathToFileURL(process.env.DEPENDENCY_RELEASE_AGE_JS_YAML).href : 'js-yaml') as IYaml;

function readResolution(key: string, resolution: unknown): Record<string, string> {
	if (!isRecord(resolution) || Object.keys(resolution).length === 0) {
		throw new Error(`${key} has no resolution`);
	}
	for (const [field, value] of Object.entries(resolution)) {
		if (!PNPM_RESOLUTION_FIELDS.has(field) || typeof value !== 'string') {
			throw new Error(`cannot read the resolution of ${key}: ${JSON.stringify(resolution)}`);
		}
	}
	return resolution as Record<string, string>;
}

/**
 * The URL of the tarball that registry.npmjs.org publishes for a version. A lockfile that names another tarball of the
 * registry, such as one of a newer package, for a locked version would install it under that name and version.
 */
function registryTarball(name: string, version: string): string {
	return `${NPM_REGISTRY}${name}/-/${name.slice(name.lastIndexOf('/') + 1)}-${version}.tgz`;
}

function otherTarball(name: string, version: string, tarball: string): PackageSource {
	return { kind: 'other', description: tarball.startsWith(NPM_REGISTRY) ? `tarball ${tarball}, which is not the registry tarball of ${name}@${version}` : `tarball ${tarball}` };
}

function pnpmSource(name: string, version: string, resolution: Record<string, string>): PackageSource {
	if (resolution.directory !== undefined || /^(link|file|workspace):/.test(version) || resolution.tarball?.startsWith('file:')) {
		return { kind: 'local' };
	}
	if (resolution.type === 'git' || resolution.repo !== undefined || resolution.commit !== undefined) {
		return { kind: 'other', description: `git repository ${resolution.repo ?? version}${resolution.commit ? `#${resolution.commit}` : ''}` };
	}
	if (resolution.type !== undefined) {
		return { kind: 'other', description: `a resolution of type ${resolution.type}` };
	}
	if (resolution.tarball !== undefined && resolution.tarball !== registryTarball(name, version)) {
		return otherTarball(name, version, resolution.tarball);
	}
	if (resolution.integrity === undefined) {
		throw new Error(`cannot read the source of ${version}`);
	}
	return SEMVER.test(version) ? { kind: 'registry' } : { kind: 'other', description: `the version specifier ${version}` };
}

/**
 * Lists the packages of a pnpm lockfile: the `packages` of each of its YAML documents (pnpm writes the package manager
 * and its dependencies in a document of their own). Throws when the file isn't a pnpm lockfile, or a package has a
 * resolution that the check cannot read, so that a lockfile the check cannot read fails it instead of passing as empty.
 */
export function parsePnpmLockfile(text: string): ILockedPackage[] {
	assertNoConflictMarkers(text);
	const documents = yaml.loadAll(text, undefined, { schema: yaml.FAILSAFE_SCHEMA });
	if (documents.length === 0) {
		throw new Error('is empty');
	}
	const packages: ILockedPackage[] = [];
	for (const document of documents) {
		if (!isRecord(document) || typeof document.lockfileVersion !== 'string') {
			throw new Error('is not a pnpm lockfile: a document has no lockfileVersion');
		}
		const entries = document.packages ?? {};
		if (!isRecord(entries)) {
			throw new Error('has packages that are not a mapping');
		}
		for (const [key, entry] of Object.entries(entries)) {
			const nameAndVersion = splitPackageKey(key);
			if (!nameAndVersion || !isRecord(entry)) {
				throw new Error(`cannot read the package ${key}`);
			}
			const resolution = readResolution(key, entry.resolution);
			packages.push({ ecosystem: 'npm', ...nameAndVersion, source: pnpmSource(nameAndVersion.name, nameAndVersion.version, resolution) });
		}
	}
	return packages;
}
interface IPackageLockEntry {
	readonly name?: string;
	readonly version?: string;
	readonly resolved?: string;
	readonly link?: boolean;
	readonly inBundle?: boolean;
	readonly bundled?: boolean;
	readonly extraneous?: boolean;
	readonly dependencies?: Record<string, IPackageLockEntry>;
}

function npmSource(name: string, version: string, entry: IPackageLockEntry): PackageSource {
	if (entry.resolved === undefined || entry.resolved === registryTarball(name, version)) {
		// Version 1 lockfiles may give a git or URL specifier as the version, with no resolved URL.
		return SEMVER.test(version) ? { kind: 'registry' } : { kind: 'other', description: `the version specifier ${version}` };
	}
	if (entry.resolved.startsWith('file:')) {
		return { kind: 'local' };
	}
	return entry.resolved.startsWith('git') ? { kind: 'other', description: `git repository ${entry.resolved}` } : otherTarball(name, version, entry.resolved);
}

/** Lists the installed packages of an npm lockfile, of version 1 (`dependencies`) or 2 and 3 (`packages`). */
export function parsePackageLockfile(text: string): ILockedPackage[] {
	assertNoConflictMarkers(text);
	const lockfile: unknown = JSON.parse(text);
	if (!isRecord(lockfile) || ![1, 2, 3].includes(lockfile.lockfileVersion as number)) {
		throw new Error('is not an npm lockfile of version 1, 2 or 3');
	}
	// Versions 2 and 3 list every installed package in `packages`, version 1 in nested `dependencies`.
	const entries = lockfile.lockfileVersion === 1 ? undefined : lockfile.packages;
	if (lockfile.lockfileVersion === 1 ? lockfile.dependencies !== undefined && !isRecord(lockfile.dependencies) : !isRecord(entries)) {
		throw new Error(`has no ${lockfile.lockfileVersion === 1 ? 'dependencies' : 'packages'} mapping`);
	}
	const packages: ILockedPackage[] = [];
	const add = (name: string, entry: IPackageLockEntry) => {
		if (typeof entry !== 'object' || entry === null || (entry.version !== undefined && typeof entry.version !== 'string') || (entry.resolved !== undefined && typeof entry.resolved !== 'string') || typeof name !== 'string') {
			throw new Error(`cannot read the entry of ${name}`);
		}
		// Links, bundled packages and extraneous packages, which npm ci doesn't install, have no source of their own.
		if (entry.link || entry.inBundle || entry.bundled || entry.extraneous) {
			return;
		}
		if (!entry.version) {
			throw new Error(`has no version of ${name}`);
		}
		if (entry.version.startsWith('file:')) {
			packages.push({ ecosystem: 'npm', name, version: entry.version, source: { kind: 'local' } });
			return;
		}
		packages.push({ ecosystem: 'npm', name, version: entry.version, source: npmSource(name, entry.version, entry) });
	};
	if (isRecord(entries)) {
		for (const [key, entry] of Object.entries(entries as Record<string, IPackageLockEntry>)) {
			const modules = key.lastIndexOf('node_modules/');
			// The root and the workspace packages are not installed from a registry.
			if (modules !== -1) {
				add(isRecord(entry) && entry.name !== undefined ? entry.name as string : key.slice(modules + 'node_modules/'.length), entry);
			}
		}
	} else {
		const visit = (dependencies: unknown) => {
			if (dependencies === undefined) {
				return;
			}
			if (!isRecord(dependencies)) {
				throw new Error('has dependencies that are not a mapping');
			}
			for (const [name, entry] of Object.entries(dependencies as Record<string, IPackageLockEntry>)) {
				add(name, entry);
				visit(entry.dependencies);
			}
		};
		visit(lockfile.dependencies);
	}
	return packages;
}

/**
 * Lists the `[[package]]` entries of a Cargo lockfile. Packages without a `source` are crates of the workspace. Cargo
 * writes the lockfile in a fixed layout, and the reader accepts only that layout in the `[[package]]` tables: `name`,
 * `version`, `source` and `checksum` as plain double-quoted strings, and `dependencies` as an array of them. Anything
 * else, such as quoted keys, escapes or an unterminated array, fails the check, rather than being read as no source.
 */
export function parseCargoLockfile(text: string): ILockedPackage[] {
	assertNoConflictMarkers(text);
	const packages: ILockedPackage[] = [];
	let current: Record<string, string> | undefined;
	// Other tables, such as [metadata] or [[patch.unused]], don't list installed packages.
	let inOtherTable = false;
	let inDependencies = false;
	const keys = new Set<string>();
	const flush = () => {
		if (current) {
			if (!current.name || !current.version) {
				throw new Error(`has a [[package]] without a name or version${current.name ? ` (${current.name})` : ''}`);
			}
			const source = current.source;
			packages.push({
				ecosystem: 'crates',
				name: current.name,
				version: current.version,
				source: source === undefined ? { kind: 'local' } : cargoSource(source),
			});
		}
		current = undefined;
	};
	const lines = text.split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const fail = (): never => {
			throw new Error(`line ${index + 1}: cannot read: ${line.slice(0, 120)}`);
		};
		if (inDependencies) {
			if (line === ']') {
				inDependencies = false;
			} else if (!/^ "[^"\\]*",$/.test(line)) {
				fail();
			}
			continue;
		}
		if (line.trim() === '' || /^#/.test(line)) {
			continue;
		}
		if (line.startsWith('[')) {
			flush();
			keys.clear();
			inOtherTable = line !== '[[package]]';
			if (!inOtherTable) {
				current = {};
			} else if (!/^(\[[A-Za-z][\w.-]*\]|\[\[[A-Za-z][\w.-]*\]\])$/.test(line) || /^\[\[?package\b/.test(line)) {
				fail();
			}
			continue;
		}
		// TOML allows each key once per table.
		const key = /^("[^"\\]*"|[A-Za-z0-9_-]+) =/.exec(line)?.[1];
		if (key !== undefined) {
			if (keys.has(key)) {
				fail();
			}
			keys.add(key);
		}
		if (inOtherTable) {
			// Cargo writes only plain string fields and dependency arrays in its other tables, such as the checksums of
			// version 1 [metadata] or [[patch.unused]]. They don't list installed packages, but must still be readable.
			if (line === 'dependencies = [') {
				inDependencies = true;
			} else if (!/^("[^"\\]*"|[A-Za-z0-9_-]+) = "[^"\\]*"$/.test(line) && !/^dependencies = \[( "[^"\\]*",)* ?\]$/.test(line)) {
				fail();
			}
			continue;
		}
		if (!current) {
			// The format version is the only top-level key that Cargo writes.
			if (!/^version = \d+$/.test(line)) {
				fail();
			}
			continue;
		}
		const field = /^(name|version|source|checksum) = "([^"\\]*)"$/.exec(line);
		if (field) {
			if (Object.hasOwn(current, field[1])) {
				fail();
			}
			current[field[1]] = field[2];
		} else if (line === 'dependencies = [') {
			inDependencies = true;
		} else if (!/^dependencies = \[( "[^"\\]*",)* ?\]$/.test(line)) {
			fail();
		}
	}
	if (inDependencies) {
		throw new Error('has an unterminated dependencies array');
	}
	flush();
	return packages;
}
export function parseLockfile(file: string, text: string): ILockedPackage[] {
	switch (path.posix.basename(file)) {
		case 'pnpm-lock.yaml': return parsePnpmLockfile(text);
		case 'package-lock.json': return parsePackageLockfile(text);
		case 'Cargo.lock': return parseCargoLockfile(text);
		default: throw new Error(`${file} is not a lockfile`);
	}
}

/** pnpm-workspace.yaml, .npmrc and Cargo configuration files, which can route packages to other registries. */
export function isRegistryConfiguration(file: string): boolean {
	return /(^|\/)(pnpm-workspace\.yaml|\.npmrc|\.cargo\/config(\.toml)?)$/.test(file);
}

/** The pnpm-workspace.yaml settings that route packages to registries, from which pnpm rebuilds tarball URLs. */
const PNPM_REGISTRY_SETTINGS = ['registry', 'registries', 'namedRegistries', 'pnprServer'];

/**
 * The problems with the registry configuration of a pnpm-workspace.yaml or .npmrc. The lockfiles name no registry for
 * most packages, so the check reads them as registry.npmjs.org packages only while nothing routes them to another one.
 */
export function registryConfigurationProblems(file: string, text: string): string[] {
	const basename = path.posix.basename(file);
	if (basename === '.npmrc') {
		const problems: string[] = [];
		for (const line of text.split(/\r?\n/)) {
			if (/^\s*([;#].*)?$/.test(line)) {
				continue;
			}
			// npm and pnpm read .npmrc as INI, which decodes quoted keys and values, and nests keys under [sections].
			const setting = /^\s*([^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
			if (!setting) {
				problems.push(`${file} has a line that this check can't read: ${line}`);
				continue;
			}
			const key = decodeIniString(setting[1]);
			if (key === undefined || /registry/i.test(key) && !/^(@[^:\s]+:)?registry$/.test(key) && !/^\/\/[^\s]*:_/.test(key)) {
				problems.push(`${file} has a registry setting that this check can't read: ${setting[1]}`);
			} else if (/^(@[^:\s]+:)?registry$/.test(key) && !/^https:\/\/registry\.npmjs\.org\/?$/.test(decodeIniString(setting[2]) ?? '')) {
				problems.push(`${file} sets ${key} to ${setting[2]}. Dependencies must come from registry.npmjs.org.`);
			}
		}
		return problems;
	}
	if (basename === 'config' || basename === 'config.toml') {
		// Cargo source replacement or patches in .cargo/config(.toml) can fetch crates that Cargo.lock still lists as coming
		// from crates.io. The check doesn't read TOML, so any of these words, or an escape that could spell one, fails it.
		const content = text.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join('\n');
		return /\b(source|registry|registries|replace-with|patch|paths)\b|\\[uU]/.test(content)
			? [`${file} may replace or patch where Cargo downloads crates from, which this check doesn't read. Dependencies must come from crates.io.`]
			: [];
	}
	const settings = yaml.load(text, { schema: yaml.CORE_SCHEMA }) ?? {};
	if (!isRecord(settings)) {
		return [`${file} is not a mapping`];
	}
	return PNPM_REGISTRY_SETTINGS.filter(setting => Object.hasOwn(settings, setting))
		.map(setting => `${file} sets ${setting}, which routes packages to registries that this check doesn't read. Dependencies must come from registry.npmjs.org.`);
}

/** Decodes an INI key or value as npm reads it: a double-quoted string as JSON, a single-quoted one as is. */
function decodeIniString(value: string): string | undefined {
	const trimmed = value.trim();
	if (trimmed.startsWith('"')) {
		try {
			const decoded: unknown = JSON.parse(trimmed);
			return typeof decoded === 'string' ? decoded : undefined;
		} catch {
			return undefined;
		}
	}
	if (trimmed.startsWith('\'')) {
		return trimmed.endsWith('\'') && trimmed.length > 1 ? trimmed.slice(1, -1) : undefined;
	}
	// An unquoted value ends at an unescaped ; or #, and a backslash escapes \, ; and #, as the ini package reads it.
	let decoded = '';
	for (let index = 0; index < trimmed.length; index++) {
		const char = trimmed[index];
		if (char === '\\' && '\\;#'.includes(trimmed[index + 1] ?? '')) {
			decoded += trimmed[++index];
		} else if (char === ';' || char === '#') {
			break;
		} else {
			decoded += char;
		}
	}
	return decoded.trim();
}

/**
 * Reads `minimumReleaseAge` and `minimumReleaseAgeExclude` from a pnpm-workspace.yaml. Throws when they are set to something
 * else than a number of minutes and a list of strings, so that a policy the check cannot read fails it.
 */
export function parseReleaseAgePolicy(text: string, file: string): IReleaseAgePolicy {
	// The YAML types that pnpm reads, so that `[true, 123]` isn't a list of strings.
	const settings = yaml.load(text, { schema: yaml.CORE_SCHEMA }) ?? {};
	if (!isRecord(settings)) {
		throw new Error(`${file} is not a mapping`);
	}
	const { minimumReleaseAge, minimumReleaseAgeExclude } = settings;
	// A bounded whole number of minutes, so that the dates it gives stay valid.
	if (minimumReleaseAge !== undefined && (typeof minimumReleaseAge !== 'number' || !Number.isSafeInteger(minimumReleaseAge) || minimumReleaseAge < 0 || minimumReleaseAge > 99_999_999)) {
		throw new Error(`cannot read the minimumReleaseAge of ${file}: ${JSON.stringify(minimumReleaseAge)}`);
	}
	if (minimumReleaseAgeExclude !== undefined && minimumReleaseAgeExclude !== null && (!Array.isArray(minimumReleaseAgeExclude) || !minimumReleaseAgeExclude.every(item => typeof item === 'string'))) {
		throw new Error(`cannot read the minimumReleaseAgeExclude of ${file}: ${JSON.stringify(minimumReleaseAgeExclude)}`);
	}
	return { minimumReleaseAge, exclude: (minimumReleaseAgeExclude ?? []) as string[], file };
}
function globToRegExp(glob: string): RegExp {
	return new RegExp(`^${glob.split('*').map(part => part.replace(/[.+?^${}()|[\]\\/]/g, '\\$&')).join('.*')}$`);
}

/**
 * Whether `minimumReleaseAgeExclude` exempts a version, as pnpm matches it: a package name or a name pattern with `*`
 * exempts every version, and `name@1.0.0 || 1.0.1` exempts the listed versions.
 */
export function isExcluded(name: string, version: string, exclude: readonly string[]): boolean {
	return exclude.some(pattern => {
		const at = pattern.indexOf('@', 1);
		const namePattern = at === -1 ? pattern : pattern.slice(0, at);
		if (!globToRegExp(namePattern).test(name)) {
			return false;
		}
		return at === -1 || pattern.slice(at + 1).split('||').some(excluded => excluded.trim() === version);
	});
}

function packageId(pkg: ILockedPackage): string {
	return `${pkg.ecosystem}:${pkg.name}@${pkg.version}`;
}

function entryId(pkg: ILockedPackage): string {
	return `${packageId(pkg)}:${pkg.source.kind === 'other' ? pkg.source.description : pkg.source.kind}`;
}

/** The packages of a lockfile at the head that it does not have, from the same source, at the base. */
export function addedPackages(base: readonly ILockedPackage[], head: readonly ILockedPackage[]): ILockedPackage[] {
	const existing = new Set(base.map(entryId));
	const added = new Map<string, ILockedPackage>();
	for (const pkg of head) {
		if (!existing.has(entryId(pkg))) {
			added.set(entryId(pkg), pkg);
		}
	}
	return [...added.values()];
}

export interface ILockfileChange {
	readonly lockfile: string;
	readonly added: readonly ILockedPackage[];
	readonly policy: IReleaseAgePolicy;
}

function formatMinutes(minutes: number): string {
	return minutes % 1440 === 0 ? `${minutes / 1440} days` : `${minutes} minutes`;
}

/**
 * Checks the added packages: each must come from the official registry, and unless the policy excludes it, must have been
 * published at least `minimumReleaseAge` minutes before `now`. Versions that any lockfile of the base already locks are
 * not checked for age again.
 */
export async function checkChanges(changes: readonly ILockfileChange[], lockedOnBase: ReadonlySet<string>, registry: IRegistry, now: Date): Promise<IViolation[]> {
	const violations: IViolation[] = [];
	const checks: Promise<void>[] = [];
	for (const { lockfile, added, policy } of changes) {
		for (const pkg of added) {
			const violation = (message: string) => violations.push({ lockfile, name: pkg.name, version: pkg.version, message });
			if (pkg.source.kind === 'local' || pkg.source.kind === 'allowed') {
				continue;
			}
			if (pkg.source.kind === 'other') {
				violation(`${pkg.name}@${pkg.version} comes from ${pkg.source.description}. Dependencies must come from ${pkg.ecosystem === 'npm' ? 'registry.npmjs.org' : 'crates.io'}.`);
				continue;
			}
			const minimumReleaseAge = policy.minimumReleaseAge;
			if (minimumReleaseAge === undefined || lockedOnBase.has(packageId(pkg)) || (pkg.ecosystem === 'npm' && isExcluded(pkg.name, pkg.version, policy.exclude) && (policy.alsoExclude === undefined || isExcluded(pkg.name, pkg.version, policy.alsoExclude)))) {
				continue;
			}
			checks.push(registry.release(pkg.ecosystem, pkg.name, pkg.version).then(release => {
				if (release.kind === 'notFound') {
					violation(`${pkg.name}@${pkg.version} is not published on ${pkg.ecosystem === 'npm' ? 'registry.npmjs.org' : 'crates.io'}.`);
					return;
				}
				const eligibleAt = new Date(release.publishedAt.getTime() + minimumReleaseAge * 60_000);
				if (Number.isNaN(eligibleAt.getTime())) {
					violation(`${pkg.name}@${pkg.version} has no valid date from which the minimumReleaseAge of ${policy.file} allows it.`);
					return;
				}
				if (eligibleAt > now) {
					violation(`${pkg.name}@${pkg.version} was published on ${release.publishedAt.toISOString()}. The minimumReleaseAge of ${policy.file} (${formatMinutes(minimumReleaseAge)}) allows it from ${eligibleAt.toISOString()}.`);
				}
			}));
		}
	}
	await Promise.all(checks);
	return violations.sort((a, b) => a.lockfile.localeCompare(b.lockfile) || a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/** Runs at most `limit` of the tasks at the same time, at least `intervalMs` apart. */
export function createLimiter(limit: number, intervalMs = 0): <T>(task: () => Promise<T>) => Promise<T> {
	let running = 0;
	let lastStart = 0;
	const queue: (() => void)[] = [];
	const next = () => {
		if (running >= limit || queue.length === 0) {
			return;
		}
		const wait = Math.max(0, lastStart + intervalMs - Date.now());
		if (wait > 0) {
			setTimeout(next, wait);
			return;
		}
		running++;
		lastStart = Date.now();
		queue.shift()!();
	};
	return task => new Promise((resolve, reject) => {
		queue.push(() => task().then(resolve, reject).finally(() => {
			running--;
			next();
		}));
		next();
	});
}

const RETRY_DELAYS_MS = [2_000, 10_000, 30_000];

type FetchJson = (url: string, headers: Record<string, string>) => Promise<{ readonly status: number; readonly body: unknown }>;

async function fetchJson(url: string, headers: Record<string, string>): Promise<{ readonly status: number; readonly body: unknown }> {
	const response = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
	return { status: response.status, body: response.ok ? await response.json() : undefined };
}

/** Looks up publish dates on registry.npmjs.org and crates.io, retrying failed requests. */
export function createPublicRegistry(get: FetchJson = fetchJson, retryDelaysMs = RETRY_DELAYS_MS): IRegistry {
	const npmLimit = createLimiter(8);
	// The crates.io crawler policy asks for at most one request per second.
	const cratesLimit = createLimiter(1, 1_000);
	const packuments = new Map<string, Promise<{ readonly versions?: Record<string, unknown>; readonly time?: Record<string, string> } | undefined>>();

	// Each attempt, including retries, waits for its turn, so that retries keep to the limit too.
	const getWithRetries = async (url: string, headers: Record<string, string>, limit: <T>(task: () => Promise<T>) => Promise<T>) => {
		for (let attempt = 0; ; attempt++) {
			let error: string;
			try {
				const { status, body } = await limit(() => get(url, headers));
				if (status === 404) {
					return undefined;
				}
				if (status >= 200 && status < 300) {
					return body;
				}
				error = `HTTP ${status}`;
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
			}
			if (attempt >= retryDelaysMs.length) {
				throw new Error(`GET ${url} failed: ${error}`);
			}
			await new Promise(resolve => setTimeout(resolve, retryDelaysMs[attempt]));
		}
	};

	return {
		async release(ecosystem, name, version) {
			if (ecosystem === 'npm') {
				let packument = packuments.get(name);
				if (!packument) {
					packument = getWithRetries(`${NPM_REGISTRY}${name.replace('/', '%2F')}`, { accept: 'application/json' }, npmLimit) as Promise<{ readonly versions?: Record<string, unknown>; readonly time?: Record<string, string> } | undefined>;
					packuments.set(name, packument);
				}
				const { time, versions } = (await packument) ?? {};
				const published = versions?.[version] ? time?.[version] : undefined;
				return published ? { kind: 'published', publishedAt: new Date(published) } : { kind: 'notFound' };
			}
			const body = await getWithRetries(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, {
				'accept': 'application/json',
				'user-agent': 'microsoft/vscode dependency release age check (https://github.com/microsoft/vscode)',
			}, cratesLimit) as { readonly version?: { readonly created_at?: string } } | undefined;
			const created = body?.version?.created_at;
			return created ? { kind: 'published', publishedAt: new Date(created) } : { kind: 'notFound' };
		},
	};
}

function git(cwd: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

function readAt(cwd: string, revision: string, file: string): string | undefined {
	try {
		return git(cwd, 'show', `${revision}:${file}`);
	} catch {
		return undefined;
	}
}

/** Lists paths NUL-separated, so that git doesn't quote the ones with unusual characters. */
function listLockfiles(cwd: string, revision: string): string[] {
	return git(cwd, 'ls-tree', '-r', '-z', '--name-only', revision).split('\0').filter(isLockfile);
}

/** The policy of the nearest pnpm-workspace.yaml at or above the folder of the lockfile, or of the root one for Cargo. */
function findPolicy(cwd: string, revision: string, lockfile: string): IReleaseAgePolicy {
	const isCargo = path.posix.basename(lockfile) === 'Cargo.lock';
	for (let dir = isCargo ? '.' : path.posix.dirname(lockfile); ; dir = path.posix.dirname(dir)) {
		const file = dir === '.' ? 'pnpm-workspace.yaml' : `${dir}/pnpm-workspace.yaml`;
		const text = readAt(cwd, revision, file);
		if (text !== undefined) {
			const policy = parseReleaseAgePolicy(text, file);
			// The exclusions name npm packages.
			return isCargo ? { ...policy, exclude: [] } : policy;
		}
		if (dir === '.') {
			return { minimumReleaseAge: undefined, exclude: [], file: undefined };
		}
	}
}

/** The pnpm version of the `packageManager` field of package.json, such as `pnpm@10.0.0+sha512.abc`. */
export function packageManagerPackage(packageJson: string | undefined): ILockedPackage | undefined {
	if (packageJson === undefined) {
		return undefined;
	}
	const packageManager = (JSON.parse(packageJson) as { readonly packageManager?: string }).packageManager;
	const match = packageManager ? /^(pnpm|npm|yarn)@([^+]+)/.exec(packageManager) : null;
	return match ? { ecosystem: 'npm', name: match[1], version: match[2], source: { kind: 'registry' } } : undefined;
}

/**
 * The stricter of the policies of the base and the head, so that a change can't relax the policy that checks it: the
 * larger minimumReleaseAge, and only versions that the exclusions of both exempt.
 */
export function stricterPolicy(base: IReleaseAgePolicy, head: IReleaseAgePolicy): IReleaseAgePolicy {
	const ages = [base.minimumReleaseAge, head.minimumReleaseAge].filter(age => age !== undefined);
	return {
		minimumReleaseAge: ages.length ? Math.max(...ages) : undefined,
		exclude: head.exclude,
		alsoExclude: base.exclude,
		file: head.file ?? base.file,
	};
}

export interface ICheckResult {
	readonly lockfiles: readonly string[];
	readonly checked: number;
	readonly violations: readonly IViolation[];
	readonly errors: readonly string[];
	/** Registry configurations that route packages away from registry.npmjs.org, which fail the check. */
	readonly problems: readonly string[];
	/** Changes of the release-age policy, which the check reports but doesn't apply. */
	readonly notices: readonly string[];
}

/** Checks the lockfiles that differ between the base and the head commits. */
export async function checkRevisions(base: string, head: string, registry: IRegistry, now: Date, cwd = process.cwd()): Promise<ICheckResult> {
	const changedFiles = git(cwd, 'diff', '--name-only', '-z', '--no-renames', base, head).split('\0').filter(Boolean);
	// Registry versions that the base already locks, which pass the age check. Only registry entries count: a git crate
	// foo@1.0.0 doesn't make a newly published foo@1.0.0 on crates.io older.
	const lockedOnBase = new Set<string>();
	const errors: string[] = [];
	const problems: string[] = [];
	const notices: string[] = [];
	for (const lockfile of listLockfiles(cwd, base)) {
		try {
			for (const pkg of parseLockfile(lockfile, readAt(cwd, base, lockfile) ?? '')) {
				if (pkg.source.kind === 'registry') {
					lockedOnBase.add(packageId(pkg));
				}
			}
		} catch {
			// A broken lockfile of the base locks nothing.
		}
	}

	// A change to a policy is read, so that one the check can't read fails it, and reported. The check applies the
	// stricter of the base and the head policies (see stricterPolicy).
	// Every registry configuration of the head, whether or not this change edits it, as it applies to every lockfile.
	for (const file of git(cwd, 'ls-tree', '-r', '-z', '--name-only', head).split('\0').filter(isRegistryConfiguration)) {
		try {
			problems.push(...registryConfigurationProblems(file, readAt(cwd, head, file) ?? ''));
		} catch (error) {
			errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	for (const file of changedFiles.filter(file => path.posix.basename(file) === 'pnpm-workspace.yaml')) {
		const headText = readAt(cwd, head, file);
		if (headText === undefined) {
			continue;
		}
		try {
			const headPolicy = parseReleaseAgePolicy(headText, file);
			const baseText = readAt(cwd, base, file);
			const basePolicy = baseText === undefined ? undefined : parseReleaseAgePolicy(baseText, file);
			if (!basePolicy || basePolicy.minimumReleaseAge !== headPolicy.minimumReleaseAge || basePolicy.exclude.join('\n') !== headPolicy.exclude.join('\n')) {
				notices.push(`${file} changes the release-age policy. This check applies the stricter of the policies of the base and of this change.`);
			}
		} catch (error) {
			errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	const policyFor = (file: string): IReleaseAgePolicy => stricterPolicy(findPolicy(cwd, base, file), findPolicy(cwd, head, file));

	const changes: ILockfileChange[] = [];
	for (const lockfile of changedFiles.filter(isLockfile)) {
		const headText = readAt(cwd, head, lockfile);
		if (headText === undefined) {
			continue;
		}
		let added: ILockedPackage[];
		let policy: IReleaseAgePolicy;
		try {
			policy = policyFor(lockfile);
			const baseText = readAt(cwd, base, lockfile);
			let basePackages: ILockedPackage[] = [];
			try {
				basePackages = baseText === undefined ? [] : parseLockfile(lockfile, baseText);
			} catch {
				// Then every package of the head counts as added.
			}
			added = addedPackages(basePackages, parseLockfile(lockfile, headText));
		} catch (error) {
			errors.push(`${lockfile}: ${error instanceof Error ? error.message : String(error)}`);
			continue;
		}
		changes.push({ lockfile, added, policy });
	}

	if (changedFiles.includes('package.json')) {
		let basePackageManager: ILockedPackage | undefined;
		try {
			basePackageManager = packageManagerPackage(readAt(cwd, base, 'package.json'));
		} catch {
			// Then the pnpm version of the head counts as added.
		}
		try {
			const headPackageManager = packageManagerPackage(readAt(cwd, head, 'package.json'));
			if (headPackageManager && (!basePackageManager || packageId(basePackageManager) !== packageId(headPackageManager))) {
				changes.push({ lockfile: 'package.json', added: [headPackageManager], policy: policyFor('package.json') });
			}
		} catch (error) {
			errors.push(`package.json: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	const violations = await checkChanges(changes, lockedOnBase, registry, now);
	return {
		lockfiles: changes.map(change => change.lockfile),
		checked: changes.reduce((count, change) => count + change.added.length, 0),
		violations,
		errors,
		problems,
		notices,
	};
}

function escapeAnnotation(value: string): string {
	return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(value: string): string {
	return escapeAnnotation(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

async function main(argv: readonly string[]): Promise<number> {
	const option = (name: string) => {
		const index = argv.indexOf(name);
		return index === -1 ? undefined : argv[index + 1];
	};
	const base = option('--base');
	if (!base) {
		console.error('Usage: node build/lib/dependencyReleaseAge.ts --base <commit> [--head <commit>] [--now <ISO date>]');
		return 2;
	}
	const head = option('--head') ?? 'HEAD';
	const now = option('--now') ? new Date(option('--now')!) : new Date();

	let result: ICheckResult;
	try {
		result = await checkRevisions(base, head, createPublicRegistry(), now);
	} catch (error) {
		console.log(`::error title=Dependency release age::${escapeAnnotation(error instanceof Error ? error.message : String(error))}`);
		return 1;
	}

	for (const notice of result.notices) {
		console.log(`::notice title=Dependency release age::${escapeAnnotation(notice)}`);
	}
	for (const error of result.errors) {
		console.log(`::error title=Dependency release age::${escapeAnnotation(`Cannot read ${error}`)}`);
	}
	for (const problem of result.problems) {
		console.log(`::error title=Dependency release age::${escapeAnnotation(problem)}`);
	}
	for (const violation of result.violations) {
		console.log(`::error file=${escapeProperty(violation.lockfile)},title=Dependency release age::${escapeAnnotation(violation.message)}`);
	}
	const failed = result.violations.length > 0 || result.errors.length > 0 || result.problems.length > 0;
	const summary = !failed
		? `Checked ${result.checked} added package versions in ${result.lockfiles.length} changed lockfiles: all come from the official registries and meet the minimumReleaseAge of pnpm-workspace.yaml.`
		: `Checked ${result.checked} added package versions in ${result.lockfiles.length} changed lockfiles: ${result.violations.length} violate the dependency policy${result.errors.length ? `, ${result.errors.length} files cannot be read` : ''}${result.problems.length ? `, and ${result.problems.length} registry settings route packages elsewhere` : ''}.`;
	console.log(summary);
	if (process.env.GITHUB_STEP_SUMMARY && failed) {
		const { appendFileSync } = await import('fs');
		const rows = result.violations.map(violation => `| \`${violation.lockfile}\` | \`${violation.name}@${violation.version}\` | ${violation.message.replace(/\|/g, '\\|')} |`);
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
			'### Dependency release age',
			'',
			summary,
			'',
			...(rows.length ? ['| Lockfile | Package | Problem |', '| --- | --- | --- |', ...rows, ''] : []),
			...result.errors.map(error => `- Cannot read ${error}`),
			...result.problems.map(problem => `- ${problem}`),
			'',
		].join('\n'));
	}
	return failed ? 1 : 0;
}

if (import.meta.main) {
	main(process.argv.slice(2)).then(code => process.exit(code), error => {
		console.error(error);
		process.exit(1);
	});
}
