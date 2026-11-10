/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IChannel, IChannelClient } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { NullLogService, NullLoggerService } from '../../../log/common/log.js';
import { createLocalPtyChannel } from '../../common/localPtyChannel.js';
import { IPtyHostConnection, IPtyHostStarter } from '../../node/ptyHost.js';
import { PtyHostService } from '../../node/ptyHostService.js';

suite('PtyHostService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('restartPtyHost disposes listeners registered during pty host startup', async () => {
		// Track active listener counts per event across pty host restarts. Without the
		// fix, each restart would leak the listeners registered in _startPtyHost.
		const listenerCounts = new Map<string, number>();
		const makeEvent = (name: string): Event<unknown> => (_listener: (e: unknown) => void): IDisposable => {
			listenerCounts.set(name, (listenerCounts.get(name) ?? 0) + 1);
			return { dispose: () => listenerCounts.set(name, listenerCounts.get(name)! - 1) };
		};

		const channel: IChannel = {
			call<T>(): Promise<T> { return Promise.resolve([] as unknown as T); },
			listen<T>(event: string): Event<T> { return makeEvent(event) as Event<T>; }
		};
		const client: IChannelClient = {
			getChannel<T extends IChannel>(): T { return channel as T; }
		};

		const starter: IPtyHostStarter = {
			start: (): IPtyHostConnection => ({
				client,
				store: new DisposableStore(),
				onDidProcessExit: Event.None
			}),
			dispose: () => { }
		};

		const service = store.add(new PtyHostService(
			starter,
			new TestConfigurationService(),
			new NullLogService(),
			store.add(new NullLoggerService())
		));
		const localChannel = createLocalPtyChannel(service, store.add(new DisposableStore()));
		let starts = 0;

		// _startPtyHost runs lazily on first use, so trigger one restart to spin up the
		// initial host and capture the listener counts after a single startup as the baseline.
		await service.restartPtyHost();
		const baseline = new Map(listenerCounts);
		store.add(localChannel.listen<void>('window', 'onPtyHostStart')(() => starts++));
		await timeout(0);

		for (let i = 0; i < 5; i++) {
			await service.restartPtyHost();
		}

		deepStrictEqual(
			{ listeners: [...listenerCounts.entries()].sort(), starts },
			{ listeners: [...baseline.entries()].sort(), starts: 6 },
			'restarts should notify the local channel without accumulating startup listeners'
		);
	});

	test('forwards auto reply ownership through the local pty channel', async () => {
		const calls: { command: string; args: unknown }[] = [];
		const channel: IChannel = {
			call<T>(command: string, args: unknown): Promise<T> {
				if (command === 'installAutoReply' || command === 'uninstallAllAutoReplies') {
					calls.push({ command, args });
				}
				return Promise.resolve([] as T);
			},
			listen: () => Event.None
		};
		const starter: IPtyHostStarter = {
			start: () => ({
				client: { getChannel: <T extends IChannel>() => channel as T },
				store: new DisposableStore(),
				onDidProcessExit: Event.None
			}),
			dispose: () => { }
		};
		const service = store.add(new PtyHostService(
			starter,
			new TestConfigurationService(),
			new NullLogService(),
			store.add(new NullLoggerService())
		));
		const localChannel = createLocalPtyChannel(service, store.add(new DisposableStore()));
		await localChannel.call('window A', 'installAutoReply', ['A prompt', 'A reply', 'owner A']);
		await localChannel.call('window B', 'installAutoReply', ['B prompt', 'B reply', 'owner B']);
		await localChannel.call('window B', 'uninstallAllAutoReplies', ['owner B']);
		await timeout(0);

		deepStrictEqual(calls, [
			{ command: 'installAutoReply', args: ['A prompt', 'A reply', 'owner A'] },
			{ command: 'installAutoReply', args: ['B prompt', 'B reply', 'owner B'] },
			{ command: 'uninstallAllAutoReplies', args: ['owner B'] }
		]);
	});
});
