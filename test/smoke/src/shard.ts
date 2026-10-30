/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Suite } from 'mocha';

/**
 * A `--shard <index>/<total>` selection, with a 1-based index.
 */
export interface Shard {
	readonly index: number;
	readonly total: number;
}

/**
 * Approximate CI durations (in seconds) of the slowest top-level suites, used
 * only to balance the shards. Stale entries make shards uneven but never skip
 * a suite. Unlisted suites count as about one app launch.
 */
const suiteDurations = new Map<string, number>([
	['Data Loss (insiders -> insiders)', 210],
	['Terminal', 150],
	['Agents Window (Dev Container AgentHost)', process.platform === 'linux' ? 115 : 5], // skips itself without Docker
	['Agents Window (WSL Dev Container AgentHost)', 175], // includes the ~80s WSL setup step
	['Chat Sessions', 85],
	['Agents Window (SSH Dev Container AgentHost)', 75],
	['Agents Window (Codex)', 65],
	['Integrated Browser', 65],
	['Agents Window (local AgentHost)', 60],
	['Extension Host Restart', 55],
	['Agents Window (local AgentHost, SDK sandbox)', 55],
	[`Chat Sandbox (${process.platform})`, 50],
	['Chat Model Configuration', 40],
	['Task', 35],
	['Accessibility', 35],
]);
const defaultSuiteDuration = 20;

// Coupled to the PR workflows: pr-win32-test.yml only provisions WSL in the first
// shard, and pr-darwin-test.yml runs the PAC proxy suites after the last shard.
const firstShardSuite = 'Agents Window (WSL Dev Container AgentHost)';
const lastShardExtraDuration = process.platform === 'darwin' ? 270 : 0;

/**
 * Parses a `--shard` value of the form `<index>/<total>`, e.g. `1/2`.
 */
export function parseShard(value: string): Shard {
	const match = /^(?<index>\d+)\/(?<total>\d+)$/.exec(value.trim());
	const index = Number(match?.groups?.index);
	const total = Number(match?.groups?.total);
	if (!match || index < 1 || index > total) {
		throw new Error(`Invalid --shard value '${value}'. Expected <index>/<total> with 1 <= index <= total, for example 1/2.`);
	}

	return { index, total };
}

function hasRunnableTests(suite: Suite): boolean {
	return suite.tests.some(test => !test.isPending()) || suite.suites.some(hasRunnableTests);
}

function estimateDuration(suite: Suite): number {
	return hasRunnableTests(suite) ? suiteDurations.get(suite.title) ?? defaultSuiteDuration : 0;
}

/**
 * Returns the suites of the given shard, in their original order. Suites go
 * longest first to the shard with the least estimated time. Every shard
 * computes the same assignment, so each suite runs exactly once.
 */
export function selectShardSuites(suites: readonly Suite[], shard: Shard): Suite[] {
	const durations = suites.map(estimateDuration);
	const shardDurations = new Array<number>(shard.total).fill(0);
	shardDurations[shard.total - 1] += lastShardExtraDuration;
	const assignments: (number | undefined)[] = suites.map(suite => suite.title === firstShardSuite ? 0 : undefined);
	assignments.forEach((target, suiteIndex) => {
		if (target !== undefined) {
			shardDurations[target] += durations[suiteIndex];
		}
	});

	const order = suites.map((_, index) => index)
		.filter(index => assignments[index] === undefined)
		.sort((a, b) => durations[b] - durations[a] || a - b);
	for (const suiteIndex of order) {
		const target = shardDurations.indexOf(Math.min(...shardDurations));
		assignments[suiteIndex] = target;
		shardDurations[target] += durations[suiteIndex];
	}

	return suites.filter((_, suiteIndex) => assignments[suiteIndex] === shard.index - 1);
}
