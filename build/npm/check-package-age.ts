/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Fails fast when a change adds npm package versions that the internal npm feed does not serve yet.
//
// The Azure Artifacts feed used by the official builds and the "VS Code Dependencies Check" pipeline
// only serves versions from npmjs.com once they are at least 7 days old. Packages published through
// internal release pipelines (e.g. `@vscode/*`, `typescript`) are mirrored without that delay, and a
// feed owner can make individual versions available early. `package-age-exceptions.json` records both.
//
// Usage:
//   node build/npm/check-package-age.ts [--base <ref>] [--feed <registry-url>]
//
//   --base  Git ref to compare against (default: origin/main). Uncommitted lockfile changes are included.
//   --feed  npm registry URL of the internal feed. When set, versions the feed already serves always pass.
//           Reads a bearer token from NPM_FEED_TOKEN.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const MIN_RELEASE_AGE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const NPM_REGISTRY = 'https://registry.npmjs.org';
const root = path.resolve(import.meta.dirname, '../..');

export interface PackageAgeExceptions {
	/** Package names or `@scope/*` patterns, mapped to the reason the feed serves them without delay. */
	readonly packages: Record<string, string>;
	/** Exact `name@version` entries a feed owner made available early, mapped to a reason or link. */
	readonly versions: Record<string, string>;
}

interface LockfileEntry {
	readonly version?: string;
	readonly resolved?: string;
	readonly link?: boolean;
	readonly inBundle?: boolean;
}

interface Lockfile {
	readonly packages?: Record<string, LockfileEntry>;
}

export interface PackageVersion {
	readonly name: string;
	readonly version: string;
}

/**
 * Returns the `name@version` of every lockfile entry that npm downloads from the npm registry.
 */
export function collectRegistryPackageVersions(lockfile: Lockfile): Set<string> {
	const result = new Set<string>();
	for (const [location, entry] of Object.entries(lockfile.packages ?? {})) {
		if (!location || entry.link || entry.inBundle || !entry.version) {
			continue;
		}
		// The tarball URL carries the real name, including for aliased (`npm:`) dependencies.
		const match = entry.resolved ? /^https:\/\/registry\.npmjs\.org\/(?<name>(?:@[^/]+\/)?[^/@]+)\/-\//.exec(entry.resolved) : undefined;
		if (entry.resolved && !match?.groups) {
			continue;
		}
		const name = match?.groups?.name ?? location.slice(location.lastIndexOf('node_modules/') + 'node_modules/'.length);
		result.add(`${name}@${entry.version}`);
	}
	return result;
}

export function parsePackageVersion(spec: string): PackageVersion {
	const separator = spec.lastIndexOf('@');
	return { name: spec.slice(0, separator), version: spec.slice(separator + 1) };
}

/**
 * Returns the exception that covers `name@version`, if any.
 */
export function findException(exceptions: PackageAgeExceptions, { name, version }: PackageVersion): string | undefined {
	const versionReason = exceptions.versions[`${name}@${version}`];
	if (versionReason) {
		return versionReason;
	}
	for (const [pattern, reason] of Object.entries(exceptions.packages)) {
		if (pattern === name || (pattern.endsWith('/*') && name.startsWith(pattern.slice(0, -1)))) {
			return reason;
		}
	}
	return undefined;
}

export interface PackageVersionAssessment {
	readonly verdict: 'ok' | 'exception' | 'tooNew';
	readonly availableAt?: Date;
	readonly reason?: string;
}

/**
 * Decides whether the internal feed will serve `name@version`.
 *
 * @param publishedAt publish time on npmjs.com, or `undefined` if unknown.
 * @param servedByFeed whether the internal feed already serves the version, or `undefined` if it was not queried.
 */
export function assessPackageVersion(packageVersion: PackageVersion, publishedAt: Date | undefined, servedByFeed: boolean | undefined, exceptions: PackageAgeExceptions, now: number): PackageVersionAssessment {
	if (servedByFeed || !publishedAt) {
		return { verdict: 'ok' };
	}
	const availableAt = new Date(publishedAt.getTime() + MIN_RELEASE_AGE_DAYS * DAY_MS);
	if (availableAt.getTime() <= now) {
		return { verdict: 'ok' };
	}
	const reason = findException(exceptions, packageVersion);
	return reason ? { verdict: 'exception', availableAt, reason } : { verdict: 'tooNew', availableAt };
}

function git(args: string[]): string {
	return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
}

function resolveDiffBase(base: string): string {
	if (spawnSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { cwd: root }).status !== 0) {
		// The base commit may be absent in a shallow CI checkout.
		git(['fetch', '--no-tags', '--depth=1', 'origin', base]);
		base = 'FETCH_HEAD';
	}
	const mergeBase = spawnSync('git', ['merge-base', base, 'HEAD'], { cwd: root, encoding: 'utf8' });
	return mergeBase.status === 0 ? mergeBase.stdout.trim() : base;
}

function readLockfileAt(ref: string, file: string): Lockfile {
	const result = spawnSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
	return result.status === 0 ? JSON.parse(result.stdout) : {};
}

/**
 * Returns the package versions that changed lockfiles in the working tree add relative to `diffBase`, with the lockfiles that add them.
 */
function getAddedPackageVersions(diffBase: string): Map<string, string[]> {
	const isLockfile = (file: string) => /(^|\/)package-lock\.json$/.test(file);
	const changed = git(['diff', '--name-only', diffBase]).split('\n').filter(isLockfile);
	const untracked = git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(isLockfile);
	const added = new Map<string, string[]>();
	for (const file of [...changed, ...untracked]) {
		const absolutePath = path.join(root, file);
		if (!existsSync(absolutePath)) {
			continue;
		}
		const before = collectRegistryPackageVersions(readLockfileAt(diffBase, file));
		for (const spec of collectRegistryPackageVersions(JSON.parse(readFileSync(absolutePath, 'utf8')))) {
			if (!before.has(spec)) {
				added.set(spec, [...added.get(spec) ?? [], file]);
			}
		}
	}
	return added;
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body?: Record<string, unknown> }> {
	for (let attempt = 1; ; attempt++) {
		try {
			const response = await fetch(url, { headers: { accept: 'application/json', ...headers } });
			if (response.ok) {
				return { status: response.status, body: await response.json() as Record<string, unknown> };
			}
			if (response.status < 500 || attempt === 3) {
				return { status: response.status };
			}
		} catch (error) {
			if (attempt === 3) {
				throw error;
			}
		}
		await new Promise(resolve => setTimeout(resolve, attempt * 2000));
	}
}

function encodePackageName(name: string): string {
	return name.replace('/', '%2F');
}

function annotate(level: 'error' | 'warning', message: string): void {
	if (process.env['GITHUB_ACTIONS']) {
		console.log(`::${level} title=npm package age::${message}`);
	} else if (process.env['TF_BUILD']) {
		console.log(`##vso[task.logissue type=${level}]${message}`);
	} else {
		(level === 'error' ? console.error : console.warn)(`${level}: ${message}`);
	}
}

async function main(argv: string[]): Promise<number> {
	const option = (flag: string) => {
		const index = argv.indexOf(flag);
		return index === -1 ? undefined : argv[index + 1];
	};
	const base = option('--base') ?? 'origin/main';
	const feed = option('--feed')?.replace(/\/$/, '');
	const feedToken = process.env['NPM_FEED_TOKEN'];
	const exceptions: PackageAgeExceptions = JSON.parse(readFileSync(path.join(import.meta.dirname, 'package-age-exceptions.json'), 'utf8'));

	const added = getAddedPackageVersions(resolveDiffBase(base));
	console.log(`Checking ${added.size} npm package version(s) added relative to ${base}${feed ? ` against ${feed}` : ''}.`);

	const publishTimes = new Map<string, Promise<Record<string, string> | undefined>>();
	const feedVersions = new Map<string, Promise<Set<string> | undefined>>();
	let feedUnavailable = false;
	const getPublishTimes = (name: string) => {
		if (!publishTimes.has(name)) {
			publishTimes.set(name, fetchJson(`${NPM_REGISTRY}/${encodePackageName(name)}`).then(r => r.body?.time as Record<string, string> | undefined));
		}
		return publishTimes.get(name)!;
	};
	const getFeedVersions = (name: string) => {
		if (!feedVersions.has(name)) {
			feedVersions.set(name, fetchJson(`${feed}/${encodePackageName(name)}`, feedToken ? { authorization: `Bearer ${feedToken}` } : {}).then(r => {
				if (r.status === 401 || r.status === 403) {
					feedUnavailable = true;
					return undefined;
				}
				return new Set(Object.keys((r.body?.versions ?? {}) as Record<string, unknown>));
			}));
		}
		return feedVersions.get(name)!;
	};

	const now = Date.now();
	const tooNew: string[] = [];
	const specs = [...added.keys()];
	const assess = async (spec: string) => {
		const packageVersion = parsePackageVersion(spec);
		const [times, served] = await Promise.all([getPublishTimes(packageVersion.name), feed ? getFeedVersions(packageVersion.name) : undefined]);
		const publishedAt = times?.[packageVersion.version] ? new Date(times[packageVersion.version]) : undefined;
		const result = assessPackageVersion(packageVersion, publishedAt, served?.has(packageVersion.version), exceptions, now);
		const where = added.get(spec)!.join(', ');
		if (result.verdict === 'tooNew') {
			tooNew.push(`${spec} (${where}) was published ${publishedAt!.toISOString()} and will be available from the internal npm feed at ${result.availableAt!.toISOString()}.`);
		} else if (result.verdict === 'exception') {
			console.log(`${spec} (${where}) is younger than ${MIN_RELEASE_AGE_DAYS} days but is an exception: ${result.reason}`);
		}
	};
	for (let i = 0; i < specs.length; i += 16) {
		await Promise.all(specs.slice(i, i + 16).map(assess));
	}

	if (feedUnavailable) {
		annotate('warning', `Could not authenticate to ${feed}; checked package ages against npmjs.com only.`);
	}
	if (!tooNew.length) {
		console.log('All added npm package versions are available from the internal npm feed or covered by an exception.');
		return 0;
	}
	for (const message of tooNew.sort()) {
		annotate('error', message);
	}
	console.error([
		'',
		`The internal npm feed used by the official build only serves npmjs.com package versions that are at least ${MIN_RELEASE_AGE_DAYS} days old.`,
		'Use an older version, wait until the version is available, or ask a feed owner to make it available early',
		'and add it to build/npm/package-age-exceptions.json. See .github/instructions/npm-dependencies.instructions.md.',
	].join('\n'));
	return 1;
}

if (import.meta.main) {
	process.exitCode = await main(process.argv.slice(2));
}
