/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ITerminalBackend } from '../../../../../../platform/terminal/common/terminal.js';
import { ILifecycleService, IWillShutdownEventJoiner, ShutdownReason, WillShutdownEvent, WillShutdownJoinerOrder } from '../../../../../services/lifecycle/common/lifecycle.js';
import { ITerminalInstanceService } from '../../../../terminal/browser/terminal.js';
import { TerminalAutoRepliesContribution } from '../../browser/terminal.autoReplies.contribution.js';

suite('TerminalAutoRepliesContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createLifecycleService(disconnect: () => void): ILifecycleService {
		const willShutdown = store.add(new Emitter<WillShutdownEvent>());
		// Register disconnection first, as the extension service may initialize before the contribution.
		store.add(willShutdown.event(e => e.join(async () => disconnect(), {
			id: 'join.disconnectRemote', label: 'Disconnect', order: WillShutdownJoinerOrder.Last
		})));
		return new class extends mock<ILifecycleService>() {
			override readonly onWillShutdown = willShutdown.event;
			override async shutdown(): Promise<void> {
				const joiners: Promise<void>[] = [];
				const lastJoiners: (() => Promise<void>)[] = [];
				willShutdown.fire({
					reason: ShutdownReason.RELOAD,
					token: CancellationToken.None,
					join: (promise: Promise<void> | (() => Promise<void>), joiner: IWillShutdownEventJoiner) => {
						if (joiner.order === WillShutdownJoinerOrder.Last) {
							lastJoiners.push(typeof promise === 'function' ? promise : () => promise);
						} else {
							joiners.push(typeof promise === 'function' ? promise() : promise);
						}
					},
					joiners: () => [],
					force: () => { }
				});
				await Promise.all(joiners);
				await Promise.all(lastJoiners.map(join => join()));
			}
		};
	}

	function createInstanceService(backends: ITerminalBackend[], onDidRegisterBackend: Event<ITerminalBackend> = Event.None): ITerminalInstanceService {
		return new class extends mock<ITerminalInstanceService>() {
			override getRegisteredBackends(): IterableIterator<ITerminalBackend> { return backends.values(); }
			override readonly onDidRegisterBackend = onDidRegisterBackend;
		};
	}

	test('awaits cleanup on initial and late backends before disconnection', async () => {
		const cleanup = new DeferredPromise<void>();
		const calls: string[] = [];
		let disconnected = false;
		const lifecycleService = createLifecycleService(() => { disconnected = true; });
		const makeBackend = (name: string): ITerminalBackend => new class extends mock<ITerminalBackend>() {
			override uninstallAllAutoReplies(): Promise<void> {
				calls.push(name);
				return cleanup.p;
			}
		};
		const didRegisterBackend = store.add(new Emitter<ITerminalBackend>());
		const configurationService = new TestConfigurationService({ 'terminal.integrated': { autoReplies: {} } });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const contribution = store.add(new TerminalAutoRepliesContribution(configurationService, createInstanceService([makeBackend('local')], didRegisterBackend.event), lifecycleService));
		didRegisterBackend.fire(makeBackend('remote'));

		const shutdown = lifecycleService.shutdown();
		await Promise.resolve();
		assert.deepStrictEqual({ calls, disconnected }, { calls: ['local', 'remote'], disconnected: false });
		await cleanup.complete();
		await shutdown;
		contribution.dispose();
		assert.deepStrictEqual({ calls, disconnected }, { calls: ['local', 'remote'], disconnected: true });
	});

	test('removes reloaded owners while preserving a live peer', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const activeOwners = new Set<string>(['live peer']);
		for (let reload = 0; reload < 3; reload++) {
			let disconnected = false;
			let installCount = 0;
			const lifecycleService = createLifecycleService(() => { disconnected = true; });
			const backend = new class extends mock<ITerminalBackend>() {
				override async installAutoReply(match: string, reply: string, ownerId: string): Promise<void> {
					installCount++;
					activeOwners.add(ownerId);
				}
				override async uninstallAllAutoReplies(ownerId: string): Promise<void> {
					await timeout(0);
					assert.strictEqual(disconnected, false, 'cleanup must finish before IPC disconnects');
					activeOwners.delete(ownerId);
				}
			};
			const configurationService = new TestConfigurationService({ 'terminal.integrated': { autoReplies: { 'old prompt': 'old reply' } } });
			store.add(configurationService.onDidChangeConfigurationEmitter);
			const contribution = store.add(new TerminalAutoRepliesContribution(configurationService, createInstanceService([backend]), lifecycleService));
			assert.strictEqual(activeOwners.size, 2);
			const shutdown = lifecycleService.shutdown();
			// A setting update during cleanup must not reinstall the departing owner's replies.
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: () => true, affectedKeys: new Set(), change: { keys: [], overrides: [] }, source: ConfigurationTarget.WORKSPACE
			});
			await shutdown;
			contribution.dispose();
			assert.deepStrictEqual({ owners: [...activeOwners], installCount }, { owners: ['live peer'], installCount: 1 });
		}
	}));
});
