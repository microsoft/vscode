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

function pnpmSource(version: string, resolution: Record<string, string>): PackageSource {
	if (resolution.directory !== undefined || /^(link|file|workspace):/.test(version) || resolution.tarball?.startsWith('file:')) {
		return { kind: 'local' };
	}
	if (resolution.type === 'git' || resolution.repo !== undefined || resolution.commit !== undefined) {
		return { kind: 'other', description: `git repository ${resolution.repo ?? version}${resolution.commit ? `#${resolution.commit}` : ''}` };
	}
	if (resolution.type !== undefined || (resolution.tarball !== undefined && !resolution.tarball.startsWith(NPM_REGISTRY))) {
		return { kind: 'other', description: resolution.tarball !== undefined ? `tarball ${resolution.tarball}` : `a resolution of type ${resolution.type}` };
	}
	if (resolution.integrity === undefined) {
		throw new Error(`cannot read the source of ${version}`);
	}
	return { kind: 'registry' };
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
			packages.push({ ecosystem: 'npm', ...nameAndVersion, source: pnpmSource(nameAndVersion.version, resolution) });
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
	readonly dependencies?: Record<string, IPackageLockEntry>;
}

function npmSource(entry: IPackageLockEntry): PackageSource {
	if (entry.resolved === undefined || entry.resolved.startsWith(NPM_REGISTRY)) {
		return { kind: 'registry' };
	}
	if (entry.resolved.startsWith('file:')) {
		return { kind: 'local' };
	}
	return { kind: 'other', description: entry.resolved.startsWith('git') ? `git repository ${entry.resolved}` : `tarball ${entry.resolved}` };
}

/** Lists the installed packages of an npm lockfile, of version 1 (`dependencies`) or 2 and 3 (`packages`). */
export function parsePackageLockfile(text: string): ILockedPackage[] {
	assertNoConflictMarkers(text);
	const lockfile = JSON.parse(text) as { readonly packages?: Record<string, IPackageLockEntry>; readonly dependencies?: Record<string, IPackageLockEntry> };
	const packages: ILockedPackage[] = [];
	const add = (name: string, entry: IPackageLockEntry) => {
		if (typeof entry !== 'object' || entry === null || (entry.version !== undefined && typeof entry.version !== 'string') || (entry.resolved !== undefined && typeof entry.resolved !== 'string') || typeof name !== 'string') {
			throw new Error(`cannot read the entry of ${name}`);
		}
		if (entry.link || entry.inBundle || entry.bundled) {
			return;
		}
		if (!entry.version) {
			throw new Error(`has no version of ${name}`);
		}
		if (entry.version.startsWith('file:')) {
			packages.push({ ecosystem: 'npm', name, version: entry.version, source: { kind: 'local' } });
			return;
		}
		packages.push({ ecosystem: 'npm', name, version: entry.version, source: npmSource(entry) });
	};
	if (lockfile.packages) {
		for (const [key, entry] of Object.entries(lockfile.packages)) {
			const modules = key.lastIndexOf('node_modules/');
			// The root and the workspace packages are not installed from a registry.
			if (modules !== -1) {
				add(entry.name ?? key.slice(modules + 'node_modules/'.length), entry);
			}
		}
	} else {
		const visit = (dependencies: Record<string, IPackageLockEntry> | undefined) => {
			for (const [name, entry] of Object.entries(dependencies ?? {})) {
				add(name, entry);
				visit(entry.dependencies);
			}
		};
		visit(lockfile.dependencies);
	}
	return packages;
}

/** Reads a TOML string value, `"..."` or `'...'`, with an optional trailing comment. */
function readTomlString(value: string): string | undefined {
	const match = /^(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*(?:#.*)?$/.exec(value.trim());
	if (!match) {
		return undefined;
	}
	return match[2] ?? match[1].replace(/\\(["\\])/g, '$1');
}

/**
 * Lists the `[[package]]` entries of a Cargo lockfile. Packages without a `source` are crates of the workspace. Throws on a
 * package whose name, version or source it cannot read, so that a lockfile the check cannot read fails it.
 */
export function parseCargoLockfile(text: string): ILockedPackage[] {
	assertNoConflictMarkers(text);
	const packages: ILockedPackage[] = [];
	let current: Record<string, string> | undefined;
	// Other tables, such as [metadata] or [[patch.unused]], don't list installed packages.
	let inOtherTable = false;
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
				source: source === undefined ? { kind: 'local' }
					: CRATES_IO_SOURCES.includes(source) ? { kind: 'registry' }
						: { kind: 'other', description: source.startsWith('git+') ? `git repository ${source.slice(4)}` : `registry ${source}` },
			});
		}
		current = undefined;
	};
	const lines = text.split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const header = /^\s*\[/.test(line) ? line.replace(/#.*$/, '').trim() : undefined;
		if (header !== undefined) {
			flush();
			inOtherTable = header !== '[[package]]';
			if (header === '[[package]]') {
				current = {};
			} else if (/^\[+\s*["']?package\b/.test(header)) {
				throw new Error(`line ${index + 1}: unexpected package table: ${line}`);
			}
			continue;
		}
		const field = /^\s*["']?(name|version|source|package)["']?\s*=(.*)$/.exec(line);
		if (!field || inOtherTable) {
			continue;
		}
		if (!current) {
			// The lockfile format version is the only one of these keys outside of a package.
			if (field[1] === 'version' && /^\s*\d+\s*(#.*)?$/.test(field[2])) {
				continue;
			}
			throw new Error(`line ${index + 1}: unexpected ${field[1]} outside of a [[package]]: ${line}`);
		}
		const value = field[1] === 'package' ? undefined : readTomlString(field[2]);
		if (value === undefined || Object.hasOwn(current, field[1])) {
			throw new Error(`line ${index + 1}: cannot read the ${field[1]} of a [[package]]: ${line}`);
		}
		current[field[1]] = value;
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

/**
 * Reads `minimumReleaseAge` and `minimumReleaseAgeExclude` from a pnpm-workspace.yaml. Throws when they are set to something
 * else than a number of minutes and a list of strings, so that a policy the check cannot read fails it.
 */
export function parseReleaseAgePolicy(text: string, file: string): IReleaseAgePolicy {
	const settings = yaml.load(text, { schema: yaml.FAILSAFE_SCHEMA }) ?? {};
	if (!isRecord(settings)) {
		throw new Error(`${file} is not a mapping`);
	}
	const { minimumReleaseAge, minimumReleaseAgeExclude } = settings;
	if (minimumReleaseAge !== undefined && (typeof minimumReleaseAge !== 'string' || !/^\d+$/.test(minimumReleaseAge))) {
		throw new Error(`cannot read the minimumReleaseAge of ${file}: ${JSON.stringify(minimumReleaseAge)}`);
	}
	if (minimumReleaseAgeExclude !== undefined && (!Array.isArray(minimumReleaseAgeExclude) || !minimumReleaseAgeExclude.every(item => typeof item === 'string'))) {
		throw new Error(`cannot read the minimumReleaseAgeExclude of ${file}: ${JSON.stringify(minimumReleaseAgeExclude)}`);
	}
	return { minimumReleaseAge: minimumReleaseAge === undefined ? undefined : Number(minimumReleaseAge), exclude: (minimumReleaseAgeExclude ?? []) as string[], file };
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
			if (pkg.source.kind === 'local') {
				continue;
			}
			if (pkg.source.kind === 'other') {
				violation(`${pkg.name}@${pkg.version} comes from ${pkg.source.description}. Dependencies must come from ${pkg.ecosystem === 'npm' ? 'registry.npmjs.org' : 'crates.io'}.`);
				continue;
			}
			const minimumReleaseAge = policy.minimumReleaseAge;
			if (minimumReleaseAge === undefined || lockedOnBase.has(packageId(pkg)) || (pkg.ecosystem === 'npm' && isExcluded(pkg.name, pkg.version, policy.exclude))) {
				continue;
			}
			checks.push(registry.release(pkg.ecosystem, pkg.name, pkg.version).then(release => {
				if (release.kind === 'notFound') {
					violation(`${pkg.name}@${pkg.version} is not published on ${pkg.ecosystem === 'npm' ? 'registry.npmjs.org' : 'crates.io'}.`);
					return;
				}
				const eligibleAt = new Date(release.publishedAt.getTime() + minimumReleaseAge * 60_000);
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

	const getWithRetries = async (url: string, headers: Record<string, string>) => {
		for (let attempt = 0; ; attempt++) {
			let error: string;
			try {
				const { status, body } = await get(url, headers);
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
					packument = npmLimit(() => getWithRetries(`${NPM_REGISTRY}${name.replace('/', '%2F')}`, { accept: 'application/json' })) as Promise<{ readonly versions?: Record<string, unknown>; readonly time?: Record<string, string> } | undefined>;
					packuments.set(name, packument);
				}
				const { time, versions } = (await packument) ?? {};
				const published = versions?.[version] ? time?.[version] : undefined;
				return published ? { kind: 'published', publishedAt: new Date(published) } : { kind: 'notFound' };
			}
			const body = await cratesLimit(() => getWithRetries(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, {
				'accept': 'application/json',
				'user-agent': 'microsoft/vscode dependency release age check (https://github.com/microsoft/vscode)',
			})) as { readonly version?: { readonly created_at?: string } } | undefined;
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

function listLockfiles(cwd: string, revision: string): string[] {
	return git(cwd, 'ls-tree', '-r', '--name-only', revision).split('\n').filter(isLockfile);
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

export interface ICheckResult {
	readonly lockfiles: readonly string[];
	readonly checked: number;
	readonly violations: readonly IViolation[];
	readonly errors: readonly string[];
}

/** Checks the lockfiles that differ between the base and the head commits. */
export async function checkRevisions(base: string, head: string, registry: IRegistry, now: Date, cwd = process.cwd()): Promise<ICheckResult> {
	const changedFiles = git(cwd, 'diff', '--name-only', '--no-renames', base, head).split('\n').filter(Boolean);
	const lockedOnBase = new Set<string>();
	const errors: string[] = [];
	for (const lockfile of listLockfiles(cwd, base)) {
		try {
			for (const pkg of parseLockfile(lockfile, readAt(cwd, base, lockfile) ?? '')) {
				lockedOnBase.add(packageId(pkg));
			}
		} catch {
			// A broken lockfile of the base locks nothing.
		}
	}

	const changes: ILockfileChange[] = [];
	for (const lockfile of changedFiles.filter(isLockfile)) {
		const headText = readAt(cwd, head, lockfile);
		if (headText === undefined) {
			continue;
		}
		let added: ILockedPackage[];
		try {
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
		changes.push({ lockfile, added, policy: findPolicy(cwd, head, lockfile) });
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
				changes.push({ lockfile: 'package.json', added: [headPackageManager], policy: findPolicy(cwd, head, 'package.json') });
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

	for (const error of result.errors) {
		console.log(`::error title=Dependency release age::${escapeAnnotation(`Cannot read ${error}`)}`);
	}
	for (const violation of result.violations) {
		console.log(`::error file=${escapeProperty(violation.lockfile)},title=Dependency release age::${escapeAnnotation(violation.message)}`);
	}
	const summary = result.violations.length === 0 && result.errors.length === 0
		? `Checked ${result.checked} added package versions in ${result.lockfiles.length} changed lockfiles: all come from the official registries and meet the minimumReleaseAge of pnpm-workspace.yaml.`
		: `Checked ${result.checked} added package versions in ${result.lockfiles.length} changed lockfiles: ${result.violations.length} violate the dependency policy${result.errors.length ? `, and ${result.errors.length} lockfiles cannot be read` : ''}.`;
	console.log(summary);
	if (process.env.GITHUB_STEP_SUMMARY && (result.violations.length > 0 || result.errors.length > 0)) {
		const { appendFileSync } = await import('fs');
		const rows = result.violations.map(violation => `| \`${violation.lockfile}\` | \`${violation.name}@${violation.version}\` | ${violation.message.replace(/\|/g, '\\|')} |`);
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
			'### Dependency release age',
			'',
			summary,
			'',
			...(rows.length ? ['| Lockfile | Package | Problem |', '| --- | --- | --- |', ...rows, ''] : []),
			...result.errors.map(error => `- Cannot read ${error}`),
			'',
		].join('\n'));
	}
	return result.violations.length > 0 || result.errors.length > 0 ? 1 : 0;
}

if (import.meta.main) {
	main(process.argv.slice(2)).then(code => process.exit(code), error => {
		console.error(error);
		process.exit(1);
	});
}
