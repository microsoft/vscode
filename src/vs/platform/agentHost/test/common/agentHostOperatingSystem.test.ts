/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAgentHostOperatingSystem } from '../../common/agentHostOperatingSystem.js';
import type { IAgentConnection, IAgentHostNetworkDiagnosticsInfo } from '../../common/agentService.js';

suite('AgentHostOperatingSystem', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function diagnostics(os: string): IAgentHostNetworkDiagnosticsInfo {
		return { version: '1.0.0', os, arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] };
	}

	function createConnection(getInfo: () => Promise<IAgentHostNetworkDiagnosticsInfo>) {
		return new class extends mock<IAgentConnection>() {
			override readonly clientId = 'test-client';
			requestCount = 0;

			override async getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> {
				this.requestCount++;
				return getInfo();
			}
		}();
	}

	for (const [platform, expected] of [
		['win32', OperatingSystem.Windows],
		['darwin', OperatingSystem.Macintosh],
		['linux', OperatingSystem.Linux],
	] as const) {
		test(`resolves ${platform} from the host rather than the client OS`, async () => {
			const connection = createConnection(async () => diagnostics(platform));

			assert.strictEqual(await getAgentHostOperatingSystem(connection), expected);
		});
	}

	test('fetches lazily and shares pending and completed requests across callers', async () => {
		const pending = new DeferredPromise<IAgentHostNetworkDiagnosticsInfo>();
		const connection = createConnection(() => pending.p);
		const callsBeforeFirstRequest = connection.requestCount;
		const first = getAgentHostOperatingSystem(connection);
		const second = getAgentHostOperatingSystem(connection);
		await pending.complete(diagnostics('linux'));
		const values = await Promise.all([first, second]);
		const third = getAgentHostOperatingSystem(connection);

		assert.deepStrictEqual({
			callsBeforeFirstRequest,
			callsAfterRequests: connection.requestCount,
			samePendingRequest: first === second,
			sameCompletedRequest: first === third,
			values: [...values, await third],
		}, {
			callsBeforeFirstRequest: 0,
			callsAfterRequests: 1,
			samePendingRequest: true,
			sameCompletedRequest: true,
			values: [OperatingSystem.Linux, OperatingSystem.Linux, OperatingSystem.Linux],
		});
	});

	test('caches by connection identity even when connections share a client ID', async () => {
		const windows = createConnection(async () => diagnostics('win32'));
		const linux = createConnection(async () => diagnostics('linux'));

		assert.deepStrictEqual({
			values: await Promise.all([
				getAgentHostOperatingSystem(windows),
				getAgentHostOperatingSystem(linux),
				getAgentHostOperatingSystem(windows),
				getAgentHostOperatingSystem(linux),
			]),
			requestCounts: [windows.requestCount, linux.requestCount],
		}, {
			values: [OperatingSystem.Windows, OperatingSystem.Linux, OperatingSystem.Windows, OperatingSystem.Linux],
			requestCounts: [1, 1],
		});
	});

	test('shares request failures but retries and caches a successful lookup afterwards', async () => {
		const error = new Error('Agent host disconnected');
		const pending = new DeferredPromise<IAgentHostNetworkDiagnosticsInfo>();
		let available = false;
		const connection = createConnection(() => available ? Promise.resolve(diagnostics('win32')) : pending.p);
		const first = getAgentHostOperatingSystem(connection);
		const second = getAgentHostOperatingSystem(connection);
		const rejected = Promise.all([assert.rejects(first, error), assert.rejects(second, error)]);
		await pending.error(error);
		await rejected;
		available = true;
		const retry = getAgentHostOperatingSystem(connection);
		const concurrentRetry = getAgentHostOperatingSystem(connection);
		const os = await retry;

		assert.deepStrictEqual({
			sameRequest: first === second,
			newRequest: retry !== first,
			sameRetry: retry === concurrentRetry,
			cachedSuccess: retry === getAgentHostOperatingSystem(connection),
			os,
			requestCount: connection.requestCount,
		}, {
			sameRequest: true,
			newRequest: true,
			sameRetry: true,
			cachedSuccess: true,
			os: OperatingSystem.Windows,
			requestCount: 2,
		});
	});

	test('a replacement connection resolves independently of an earlier failure', async () => {
		const failed = createConnection(async () => { throw new Error('Disconnected'); });
		await assert.rejects(getAgentHostOperatingSystem(failed), /Disconnected/);
		const replacement = createConnection(async () => diagnostics('darwin'));

		assert.deepStrictEqual({
			os: await getAgentHostOperatingSystem(replacement),
			requestCounts: [failed.requestCount, replacement.requestCount],
		}, {
			os: OperatingSystem.Macintosh,
			requestCounts: [1, 1],
		});
	});

	test('rejects an unsupported OS without falling back or caching the failure', async () => {
		const connection = createConnection(async () => diagnostics('unsupported'));
		await assert.rejects(getAgentHostOperatingSystem(connection), /Unsupported agent host operating system: unsupported/);
		await assert.rejects(getAgentHostOperatingSystem(connection), /Unsupported agent host operating system: unsupported/);

		assert.strictEqual(connection.requestCount, 2);
	});
});
