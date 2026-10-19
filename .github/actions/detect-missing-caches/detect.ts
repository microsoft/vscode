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
			readonly getActionsCacheList: (parameters: ICacheListParameters) => Promise<{ readonly data: { readonly actions_caches?: readonly { readonly key?: string }[] } }>;
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
 * Line endings of a runner's checkout. The Windows runners check out text files with CRLF, which
 * changes the cache keys that hash them.
 */
type LineEndings = 'lf' | 'crlf';

/**
 * A job of `.github/workflows/pr-node-modules.yml` and the caches it keeps warm on `main`.
 */
export interface ICacheWarmingJob {
	readonly lineEndings: LineEndings;
	/** The `key-prefix` and the evaluated `key-args` of `.github/actions/restore-node-modules`. */
	readonly nodeModules: { readonly prefix: string; readonly args: readonly string[] };
	/** The `runner.os` and `arch` of `.github/actions/setup-electron`. */
	readonly electron?: { readonly os: string; readonly arch: string };
	/** The marketplace target platform of the built-in extensions cache. */
	readonly builtInExtensions?: { readonly target: string };
	/** Whether the job caches the WSL installer with `.github/actions/restore-wsl-installer`. */
	readonly wslInstaller?: boolean;
}

/**
 * The cache warming jobs by job id, which is also the name of the output that tells whether the job needs to run.
 */
export const cacheWarmingJobs: Readonly<Record<string, ICacheWarmingJob>> = {
	'compile': {
		lineEndings: 'lf',
		nodeModules: { prefix: 'node_modules-compile', args: ['compile', 'x64'] },
		builtInExtensions: { target: 'linux-x64' },
	},
	'linux': {
		lineEndings: 'lf',
		nodeModules: { prefix: 'node_modules-linux', args: ['linux', 'x64', 'x64'] },
		electron: { os: 'Linux', arch: 'x64' },
	},
	'macOS': {
		lineEndings: 'lf',
		nodeModules: { prefix: 'node_modules-macos', args: ['darwin', 'arm64', 'arm64'] },
		electron: { os: 'macOS', arch: 'arm64' },
	},
	'windows': {
		lineEndings: 'crlf',
		nodeModules: { prefix: 'node_modules-windows', args: ['win32', 'x64', 'x64'] },
		electron: { os: 'Windows', arch: 'x64' },
		wslInstaller: true,
	},
	'copilot-linux': {
		lineEndings: 'lf',
		nodeModules: { prefix: 'copilot-node_modules-linux', args: ['linux', 'x64'] },
	},
	'copilot-windows': {
		lineEndings: 'crlf',
		nodeModules: { prefix: 'copilot-node_modules-windows', args: ['win32', 'x64'] },
	},
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
 * Returns the keys of the caches a job saves, as the job computes them on its runner.
 */
export function getCacheKeys(job: ICacheWarmingJob, readFile: ReadRepositoryFile): string[] {
	const keys = [`${job.nodeModules.prefix}-${hashFiles(Buffer.from(computeNodeModulesCacheKey(job.nodeModules.args, readFile)))}`];
	if (job.electron) {
		keys.push(`electron-download-v1-${job.electron.os}-${job.electron.arch}-${hashFiles(readFile('.npmrc'), readFile('build/checksums/electron.txt'))}`);
	}
	if (job.builtInExtensions) {
		const target = job.builtInExtensions.target;
		keys.push(`builtin-extensions-${hashFiles(Buffer.from(computeBuiltInDepsCacheKey(() => target, readFile)))}`);
	}
	if (job.wslInstaller) {
		keys.push(`wsl-installer-v1-Windows-${hashFiles(readFile('build/checksums/wsl.txt'))}`);
	}
	return keys;
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

async function cacheExists(github: IGitHub, context: IContext, key: string): Promise<boolean> {
	// The key parameter matches key prefixes.
	const { data } = await github.rest.actions.getActionsCacheList({ ...context.repo, ref: context.ref, key, per_page: 100 });
	return (data.actions_caches ?? []).some(cache => cache.key === key);
}

/**
 * Sets an output for each cache warming job: 'true' when one of its caches is missing on the
 * current branch, otherwise 'false'. Jobs whose caches cannot be checked run.
 */
export async function detectMissingCaches(github: IGitHub, context: IContext, core: ICore, readers: Readonly<Record<LineEndings, ReadRepositoryFile>> = createCheckoutReaders()): Promise<void> {
	for (const [name, job] of Object.entries(cacheWarmingJobs)) {
		let missing: string[] | undefined;
		try {
			const keys = getCacheKeys(job, readers[job.lineEndings]);
			const exists = await Promise.all(keys.map(key => cacheExists(github, context, key)));
			missing = keys.filter((_, index) => !exists[index]);
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
