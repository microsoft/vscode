/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { computeBuiltInDepsCacheKey, computeNodeModulesCacheKey, type ReadRepositoryFile } from '../../../build/azure-pipelines/common/cacheKeys.ts';

interface ICacheListParameters {
	readonly owner: string;
	readonly repo: string;
	readonly ref: string;
	readonly key: string;
	readonly per_page: number;
}

interface IGitHub {
	readonly rest: {
		readonly actions: {
			readonly getActionsCacheList: (parameters: ICacheListParameters) => Promise<{ readonly data: { readonly actions_caches?: readonly { readonly key?: string; readonly version?: string }[] } }>;
		};
	};
}

interface IContext {
	readonly repo: { readonly owner: string; readonly repo: string };
	readonly ref: string;
}

interface ICore {
	info(message: string): void;
	warning(message: string): void;
	setOutput(name: string, value: string): void;
}

/**
 * The `runner.os` of a job. The Windows runners check out text files with CRLF line endings, which
 * changes the cache keys that hash them.
 */
type RunnerOs = 'Linux' | 'macOS' | 'Windows';

/**
 * Line endings of a runner's checkout.
 */
type LineEndings = 'lf' | 'crlf';

/**
 * A job of `.github/workflows/pr-node-modules.yml` and the caches it keeps warm on `main`.
 */
export interface ICacheWarmingJob {
	readonly os: RunnerOs;
	/** The `key-prefix` and the evaluated `key-args` of `.github/actions/restore-node-modules`. */
	readonly nodeModules: { readonly prefix: string; readonly args: readonly string[] };
	/** The `arch` of `.github/actions/setup-electron`. */
	readonly electron?: { readonly arch: string };
	/** The marketplace target platform of the built-in extensions cache. */
	readonly builtInExtensions?: { readonly target: string };
	/** Whether the job caches the WSL installer with `.github/actions/restore-wsl-installer`. */
	readonly wslInstaller?: boolean;
}

/**
 * A cache that a job saves. `actions/cache` only restores a cache whose key and version both match.
 */
export interface ICache {
	readonly key: string;
	readonly version: string;
}

/**
 * The cache warming jobs by job id, which is also the name of the output that tells whether the job needs to run.
 */
export const cacheWarmingJobs: Readonly<Record<string, ICacheWarmingJob>> = {
	'compile': {
		os: 'Linux',
		nodeModules: { prefix: 'node_modules-compile', args: ['compile', 'x64'] },
		builtInExtensions: { target: 'linux-x64' },
	},
	'linux': {
		os: 'Linux',
		nodeModules: { prefix: 'node_modules-linux', args: ['linux', 'x64', 'x64'] },
		electron: { arch: 'x64' },
	},
	'macOS': {
		os: 'macOS',
		nodeModules: { prefix: 'node_modules-macos', args: ['darwin', 'arm64', 'arm64'] },
		electron: { arch: 'arm64' },
	},
	'windows': {
		os: 'Windows',
		nodeModules: { prefix: 'node_modules-windows', args: ['win32', 'x64', 'x64'] },
		electron: { arch: 'x64' },
		wslInstaller: true,
	},
	'copilot-linux': {
		os: 'Linux',
		nodeModules: { prefix: 'copilot-node_modules-linux', args: ['linux', 'x64'] },
	},
	'copilot-windows': {
		os: 'Windows',
		nodeModules: { prefix: 'copilot-node_modules-windows', args: ['win32', 'x64'] },
	},
};

/**
 * The `ELECTRON_CACHE_PATH` that `.github/actions/setup-electron` sets on the runners of the jobs. It
 * depends on the home directory of the runners and is part of the cache version.
 */
const electronCachePaths: Readonly<Record<RunnerOs, string>> = {
	Linux: '/home/cloudtest/.cache/electron',
	macOS: '/Users/runner/Library/Caches/electron',
	Windows: 'C:\\Users\\cloudtest\\AppData\\Local\\electron\\Cache',
};

/**
 * Mirrors the `hashFiles()` workflow expression function for the given file contents.
 */
function hashFiles(...contents: Buffer[]): string {
	const result = createHash('sha256');
	for (const content of contents) {
		result.update(createHash('sha256').update(content).digest());
	}
	return result.digest('hex');
}

/**
 * Mirrors the cache version of `actions/cache` (`getCacheVersion` in `@actions/cache`), which
 * depends on the cache path, the compression method (zstd on all runners) and the OS.
 */
function getCacheVersion(os: RunnerOs, cachePath: string, enableCrossOsArchive = false): string {
	const components = [cachePath, 'zstd-without-long'];
	if (os === 'Windows' && !enableCrossOsArchive) {
		components.push('windows-only');
	}
	components.push('1.0');
	return createHash('sha256').update(components.join('|')).digest('hex');
}

/**
 * Returns the caches a job saves, as the job computes their keys and versions on its runner.
 */
export function getCaches(job: ICacheWarmingJob, readFile: ReadRepositoryFile): ICache[] {
	const cache = (key: string, cachePath: string, enableCrossOsArchive?: boolean): ICache => ({ key, version: getCacheVersion(job.os, cachePath, enableCrossOsArchive) });
	const caches = [cache(`${job.nodeModules.prefix}-${hashFiles(Buffer.from(computeNodeModulesCacheKey(job.nodeModules.args, readFile)))}`, '.build/node_modules_cache')];
	if (job.electron) {
		caches.push(cache(`electron-download-v1-${job.os}-${job.electron.arch}-${hashFiles(readFile('.npmrc'), readFile('build/checksums/electron.txt'))}`, electronCachePaths[job.os]));
	}
	if (job.builtInExtensions) {
		const target = job.builtInExtensions.target;
		caches.push(cache(`builtin-extensions-${hashFiles(Buffer.from(computeBuiltInDepsCacheKey(() => target, readFile)))}`, '.build/builtInExtensions', true));
	}
	if (job.wslInstaller) {
		caches.push(cache(`wsl-installer-v1-${job.os}-${hashFiles(readFile('build/checksums/wsl.txt'))}`, '.build/wsl-installer'));
	}
	return caches;
}

function createCheckoutReaders(): Readonly<Record<LineEndings, ReadRepositoryFile>> {
	const root = path.join(import.meta.dirname, '../../..');
	const crlfFiles = new Map<string, Buffer>();
	return {
		lf: relativePath => readFileSync(path.join(root, relativePath)),
		// Let Git convert the line endings so that `.gitattributes` applies as on the Windows runners.
		crlf: relativePath => {
			let content = crlfFiles.get(relativePath);
			if (!content) {
				content = execFileSync('git', ['-c', 'core.autocrlf=true', 'cat-file', '--filters', `HEAD:${relativePath}`], { cwd: root, maxBuffer: 256 * 1024 * 1024 });
				crlfFiles.set(relativePath, content);
			}
			return content;
		},
	};
}

/**
 * Returns the versions of the caches on the current branch with the given key.
 */
async function listCacheVersions(github: IGitHub, context: IContext, key: string): Promise<(string | undefined)[]> {
	// The key parameter matches key prefixes.
	const { data } = await github.rest.actions.getActionsCacheList({ ...context.repo, ref: context.ref, key, per_page: 100 });
	return (data.actions_caches ?? []).filter(cache => cache.key === key).map(cache => cache.version);
}

/**
 * Sets an output for each cache warming job: 'true' when one of its caches is missing on the
 * current branch, otherwise 'false'. A cache with the right key but another version is missing,
 * because the job could not restore it. Jobs whose caches cannot be checked run.
 */
export async function detectMissingCaches(github: IGitHub, context: IContext, core: ICore, readers: Readonly<Record<LineEndings, ReadRepositoryFile>> = createCheckoutReaders()): Promise<void> {
	for (const [name, job] of Object.entries(cacheWarmingJobs)) {
		let missing: string[] | undefined;
		try {
			const caches = getCaches(job, readers[job.os === 'Windows' ? 'crlf' : 'lf']);
			const versions = await Promise.all(caches.map(cache => listCacheVersions(github, context, cache.key)));
			missing = [];
			for (const [index, cache] of caches.entries()) {
				if (versions[index].includes(cache.version)) {
					continue;
				}
				missing.push(cache.key);
				if (versions[index].length > 0) {
					core.warning(`${cache.key} exists with version ${versions[index].join(', ')} instead of ${cache.version}. If ${name} keeps running, update the cache versions in .github/actions/detect-missing-caches/detect.ts.`);
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			core.warning(`Unable to check the caches of ${name}; running it. ${message}`);
		}

		const run = missing === undefined || missing.length > 0;
		const reason = missing === undefined ? 'caches unavailable'
			: missing.length > 0 ? `missing ${missing.join(', ')}`
				: 'all caches exist';
		core.info(`${name}: ${run ? 'run' : 'skip'} (${reason})`);
		core.setOutput(name, run ? 'true' : 'false');
	}
}
