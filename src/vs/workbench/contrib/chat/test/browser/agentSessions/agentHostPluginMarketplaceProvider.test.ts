/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { AgentHostPluginMarketplaceProvider } from '../../../browser/agentSessions/agentHost/agentHostPluginMarketplaceProvider.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { ICustomizationPluginMarketplaceSnapshot } from '../../../common/customizationHarnessService.js';

suite('AgentHostPluginMarketplaceProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('vscode-chat-session://local/session');
	const snapshot = {
		plugins: [{ name: 'plugin', marketplace: 'managed', source: 'plugin@managed', installed: false }],
		failures: [],
	};

	test('shares in-flight reads and cached results without cancelling another caller', async () => {
		const pending = new DeferredPromise<ICustomizationPluginMarketplaceSnapshot>();
		let calls = 0;
		const provider = disposables.add(new AgentHostPluginMarketplaceProvider(new class extends mock<IAgentHostCustomizationService>() {
			override getPluginMarketplaceSnapshot() {
				calls++;
				return pending.p;
			}
		}()));
		const cts = disposables.add(new CancellationTokenSource());
		const cancelled = assert.rejects(provider.getSnapshot(session, cts.token), isCancellationError);
		const second = provider.getSnapshot(session, CancellationToken.None);
		cts.cancel();
		await cancelled;
		await pending.complete(snapshot);

		assert.deepStrictEqual({ second: await second, cached: await provider.getSnapshot(session, CancellationToken.None), calls }, {
			second: snapshot, cached: snapshot, calls: 1,
		});
	});

	test('expires cached snapshots and never caches an unsupported result', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let calls = 0;
		const provider = disposables.add(new AgentHostPluginMarketplaceProvider(new class extends mock<IAgentHostCustomizationService>() {
			override async getPluginMarketplaceSnapshot() {
				return ++calls === 1 ? undefined : snapshot;
			}
		}()));
		await provider.getSnapshot(session, CancellationToken.None);
		await provider.getSnapshot(session, CancellationToken.None);
		await timeout(59_999);
		await provider.getSnapshot(session, CancellationToken.None);
		await timeout(1);
		await provider.getSnapshot(session, CancellationToken.None);

		assert.strictEqual(calls, 3);
	}));

	test('late results from the previous session do not replace the current cache', async () => {
		const pending = new DeferredPromise<ICustomizationPluginMarketplaceSnapshot>();
		const secondSession = URI.parse('vscode-chat-session://local/second');
		let calls = 0;
		const provider = disposables.add(new AgentHostPluginMarketplaceProvider(new class extends mock<IAgentHostCustomizationService>() {
			override getPluginMarketplaceSnapshot(resource: URI) {
				calls++;
				return isEqual(resource, session) ? pending.p : Promise.resolve(snapshot);
			}
		}()));
		const first = provider.getSnapshot(session, CancellationToken.None);
		await provider.getSnapshot(secondSession, CancellationToken.None);
		await pending.complete({ plugins: [], failures: [] });
		await first;

		assert.deepStrictEqual({ cached: await provider.getSnapshot(secondSession, CancellationToken.None), calls }, { cached: snapshot, calls: 2 });
	});

	test('retries a synchronous failure instead of retaining a rejected cache entry', async () => {
		let calls = 0;
		const provider = disposables.add(new AgentHostPluginMarketplaceProvider(new class extends mock<IAgentHostCustomizationService>() {
			override getPluginMarketplaceSnapshot() {
				if (++calls === 1) {
					throw new Error('Snapshot failed');
				}
				return Promise.resolve(snapshot);
			}
		}()));

		await assert.rejects(provider.getSnapshot(session, CancellationToken.None), /Snapshot failed/);
		assert.deepStrictEqual({ snapshot: await provider.getSnapshot(session, CancellationToken.None), calls }, { snapshot, calls: 2 });
	});

	test('refresh publishes its returned snapshot and installation invalidates it', async () => {
		let reads = 0;
		const provider = disposables.add(new AgentHostPluginMarketplaceProvider(new class extends mock<IAgentHostCustomizationService>() {
			override async getPluginMarketplaceSnapshot() { reads++; return snapshot; }
			override async refreshPluginMarketplaces() { return snapshot; }
			override async installPlugin() { return {}; }
		}()));
		const eventReads: Promise<ICustomizationPluginMarketplaceSnapshot | undefined>[] = [];
		disposables.add(provider.onDidChange(() => eventReads.push(provider.getSnapshot(session, CancellationToken.None))));

		await provider.refresh(session, CancellationToken.None);
		await provider.install(session, 'plugin@managed');

		assert.deepStrictEqual({ snapshots: await Promise.all(eventReads), reads }, { snapshots: [snapshot, snapshot], reads: 1 });
	});

	test('preserves undefined when no live session marketplace is available', async () => {
		const service = new class extends mock<IAgentHostCustomizationService>() {
			override getPluginMarketplaceSnapshot(): Promise<undefined> {
				return Promise.resolve(undefined);
			}
		}();
		const provider = disposables.add(new AgentHostPluginMarketplaceProvider(service));

		assert.strictEqual(await provider.getSnapshot(session, CancellationToken.None), undefined);
	});

	test('fires after successful refresh and install', async () => {
		const service = new class extends mock<IAgentHostCustomizationService>() {
			override refreshPluginMarketplaces() {
				return Promise.resolve(snapshot);
			}
			override installPlugin() {
				return Promise.resolve({});
			}
		}();
		const provider = disposables.add(new AgentHostPluginMarketplaceProvider(service));
		let changes = 0;
		disposables.add(provider.onDidChange(() => changes++));

		const refreshResult = await provider.refresh(session, CancellationToken.None);
		const installResult = await provider.install(session, 'plugin@managed');

		assert.deepStrictEqual({ refreshResult, installResult, changes }, {
			refreshResult: snapshot,
			installResult: {},
			changes: 2,
		});
	});
});
