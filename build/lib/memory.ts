/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';

/** Share of the available memory to leave untouched, so that the machine does not start swapping. */
const MEMORY_HEADROOM = 0.25;

const GB = 1024 * 1024 * 1024;

/**
 * Returns the memory, in bytes, that new processes can use without the machine swapping.
 */
export function getAvailableMemory(): number {
	if (process.platform === 'darwin') {
		// `os.freemem()` and `process.availableMemory()` leave out the memory that macOS reclaims on demand, such as
		// inactive pages, which is usually most of it.
		try {
			const stats = cp.execFileSync('vm_stat', { encoding: 'utf8' });
			const pageSize = Number(/page size of (?<size>\d+) bytes/.exec(stats)?.groups?.size);
			const pages = (name: string) => Number(new RegExp(`^Pages ${name}:\\s+(?<count>\\d+)`, 'm').exec(stats)?.groups?.count ?? 0);
			const available = (pages('free') + pages('inactive') + pages('speculative') + pages('purgeable')) * pageSize;
			if (available > 0) {
				return available;
			}
		} catch {
			// Use the estimate of Node.js
		}
	}
	return process.availableMemory();
}

export interface IMemoryBoundJob<T> {
	/** The most memory, in bytes, that the job and its processes use at once. */
	readonly memory: number;
	run(): Promise<T>;
}

export interface IRunWithinMemoryOptions {
	/** The most jobs to run at once. */
	readonly maxConcurrency?: number;
	/** The available memory, in bytes, instead of {@link getAvailableMemory}. */
	readonly availableMemory?: number;
}

/**
 * Runs `jobs` in parallel, as many at a time as the available memory affords, and always at least one. Jobs start in
 * order, so put the longest first. Returns their results in the order of `jobs`.
 *
 * A job starts when the memory that was available at the start covers it and the jobs that run, and when the memory
 * that is available now covers it, which also accounts for the other processes of the machine as they grow.
 */
export async function runWithinMemory<T>(name: string, jobs: readonly IMemoryBoundJob<T>[], options: IRunWithinMemoryOptions = {}): Promise<T[]> {
	const maxConcurrency = options.maxConcurrency ?? Infinity;
	const getBudget = () => (options.availableMemory ?? getAvailableMemory()) * (1 - MEMORY_HEADROOM);
	const budget = getBudget();
	const needed = jobs.reduce((sum, job) => sum + job.memory, 0);
	if (jobs.length > 1 && needed > budget) {
		console.log(`[${name}] The ${jobs.length} jobs need ${(needed / GB).toFixed(1)} GB of memory, and ${(budget / GB).toFixed(1)} GB is available to them, so not all of them run at once.`);
	}

	const results: T[] = new Array(jobs.length);
	let next = 0;
	let running = 0;
	let reserved = 0;
	await new Promise<void>((resolve, reject) => {
		const startJobs = () => {
			while (next < jobs.length && running < maxConcurrency && (running === 0 || (reserved + jobs[next].memory <= budget && jobs[next].memory <= getBudget()))) {
				const index = next++;
				const job = jobs[index];
				running++;
				reserved += job.memory;
				job.run().then(result => {
					results[index] = result;
					running--;
					reserved -= job.memory;
					if (next === jobs.length && running === 0) {
						resolve();
					} else {
						startJobs();
					}
				}, reject);
			}
		};
		if (jobs.length) {
			startJobs();
		} else {
			resolve();
		}
	});
	return results;
}

/** Converts gigabytes to bytes. */
export function gigabytes(count: number): number {
	return count * GB;
}
