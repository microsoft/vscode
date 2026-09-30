/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MAX_TIMEOUT_DELAY } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubBackoffGate } from '../../common/githubBackoff.js';
import { GitHubRateLimitCoordinator } from '../../common/githubRateLimitCoordinator.js';
import { schedulerDelay, systemGitHubScheduler } from '../../common/githubScheduler.js';
import { GitHubTransport } from '../../common/githubTransport.js';

suite('GitHub system scheduler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const account = { host: 'api.example.test', accountId: '1' };
	const serverDelay = Math.ceil(MAX_TIMEOUT_DELAY / 1_000) * 1_000 + 1_000;

	function limitedResponse(): Response {
		return new Response(null, { status: 429, headers: { 'Retry-After': String(serverDelay / 1_000) } });
	}

	test('splits server delays above the native timer maximum into bounded chunks', async () => {
		let times: readonly number[] = [];
		await runWithFakedTimers({ onHistory: history => times = history.map(event => event.time) }, async () => {
			await schedulerDelay(systemGitHubScheduler, MAX_TIMEOUT_DELAY + 1_000, new AbortController().signal);
		});
		assert.deepStrictEqual(times, [MAX_TIMEOUT_DELAY, MAX_TIMEOUT_DELAY + 1_000]);
	});

	test('identity backoff serves the full server delay across multiple native timer chunks', async () => {
		let times: readonly number[] = [];
		await runWithFakedTimers({ onHistory: history => times = history.map(event => event.time) }, async () => {
			const gate = disposables.add(new GitHubBackoffGate('identity', { immediateRetries: 1, base: 1, maximum: 10, jitter: 0 }, systemGitHubScheduler));
			gate.fail('credential', MAX_TIMEOUT_DELAY * 2 + 1_000);
			await gate.wait('credential', new AbortController().signal);
		});
		assert.deepStrictEqual(times, [MAX_TIMEOUT_DELAY, MAX_TIMEOUT_DELAY * 2, MAX_TIMEOUT_DELAY * 2 + 1_000]);
	});

	test('queue cooldown wakes are chunked without dispatching before the server deadline', async () => {
		let firstWake: number | undefined;
		const dispatchTimes: number[] = [];
		await runWithFakedTimers({ onHistory: history => firstWake = history[0]?.time }, async () => {
			const transport = disposables.add(new GitHubTransport(async () => {
				dispatchTimes.push(systemGitHubScheduler.now());
				return new Response('{}');
			}, systemGitHubScheduler, false, undefined, { requestTimeout: serverDelay + 1_000 }));
			transport.rateLimits.updateFromResponse(account, limitedResponse());
			await transport.rest(account, 'token', { method: 'GET', url: 'https://api.example.test/resource' }, new AbortController().signal);
		});
		assert.deepStrictEqual({ firstWake, dispatchTimes }, { firstWake: MAX_TIMEOUT_DELAY, dispatchTimes: [serverDelay] });
	});

	test('inactive-account cleanup retains the full cooldown beyond the native timer maximum', async () => {
		const observations: { delay: number; retained: boolean }[] = [];
		await runWithFakedTimers({}, async () => {
			const coordinator = disposables.add(new GitHubRateLimitCoordinator(systemGitHubScheduler));
			coordinator.updateFromResponse(account, limitedResponse());
			coordinator.releaseAccount(account);
			const signal = new AbortController().signal;
			await schedulerDelay(systemGitHubScheduler, MAX_TIMEOUT_DELAY, signal);
			observations.push({ delay: coordinator.getDelay(account, 'core'), retained: coordinator.getState(account, 'core') !== undefined });
			await schedulerDelay(systemGitHubScheduler, serverDelay - MAX_TIMEOUT_DELAY, signal);
			observations.push({ delay: coordinator.getDelay(account, 'core'), retained: coordinator.getState(account, 'core') !== undefined });
		});
		assert.deepStrictEqual(observations, [{ delay: serverDelay - MAX_TIMEOUT_DELAY, retained: true }, { delay: 0, retained: false }]);
	});
});
