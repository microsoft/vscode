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
 * Approximate durations (in seconds) of the slowest top-level suites in the
 * pull request workflows, as printed at the end of each smoke test run, used
 * only to balance the shards. Stale entries make shards uneven but never skip
 * a suite. Unlisted suites count as about one app launch.
 */
const suiteDurations = new Map<string, number>([
	['Terminal', process.platform === 'linux' ? 10 : 135],
	['Data Loss (insiders -> insiders)', 100],
	['Agents Window (Dev Container AgentHost)', process.platform === 'linux' ? 70 : 15], // skips itself without Docker
	['Agents Window (SSH Dev Container AgentHost)', 50],
	['Agents Window (Codex)', 45],
	['Integrated Browser', 40],
	[`Chat Sandbox (${process.platform})`, 35],
	['Agents Window (local AgentHost)', 30],
	['Extension Host Restart', 30],
	['Chat Model Configuration', 25],
	['Chat Sessions', 25],
	['Task', 25],
]);
const defaultSuiteDuration = 20;

// Coupled to the PR workflows: pr-darwin-test.yml runs the PAC, Kerberos and Basic proxy suites after the last shard.
// The WSL Dev Container suite runs in its own job instead of a shard (see pr-win32-test.yml).
const lastShardExtraDuration = process.platform === 'darwin' ? 315 : 0;

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
	const assignments = new Array<number>(suites.length);
	const order = suites.map((_, index) => index)
		.sort((a, b) => durations[b] - durations[a] || a - b);
	for (const suiteIndex of order) {
		const target = shardDurations.indexOf(Math.min(...shardDurations));
		assignments[suiteIndex] = target;
		shardDurations[target] += durations[suiteIndex];
	}

	return suites.filter((_, suiteIndex) => assignments[suiteIndex] === shard.index - 1);
}
