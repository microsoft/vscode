/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IChannel, IChannelClient, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { NullLogService, NullLoggerService } from '../../../log/common/log.js';
import { localPtyServiceUnbufferedEvents } from '../../common/terminal.js';
import { IPtyHostConnection, IPtyHostStarter } from '../../node/ptyHost.js';
import { PtyHostService } from '../../node/ptyHostService.js';

suite('PtyHostService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('localPty channel', () => {
		for (const eventName of ['onProcessData', 'onProcessReady', 'onProcessReplay', 'onProcessOrphanQuestion', 'onDidRequestDetach', 'onDidChangeProperty', 'onProcessExit']) {
			test(`${eventName} only subscribes while an IPC listener is attached`, () => {
				const emitter = store.add(new Emitter<string>());
				const channel = ProxyChannel.fromService({ [eventName]: emitter.event }, store, {
					unbufferedEvents: localPtyServiceUnbufferedEvents
				});
				const onEvent = channel.listen<string>(undefined, eventName);
				const listenerStates = [emitter.hasListeners()];
				const messages: string[] = [];

				emitter.fire('before');
				const firstListener = store.add(onEvent(e => messages.push(e)));
				listenerStates.push(emitter.hasListeners());
				emitter.fire('first');
				firstListener.dispose();
				listenerStates.push(emitter.hasListeners());

				emitter.fire('between');
				const secondListener = store.add(onEvent(e => messages.push(e)));
				listenerStates.push(emitter.hasListeners());
				emitter.fire('second');
				secondListener.dispose();
				listenerStates.push(emitter.hasListeners());
				emitter.fire('after');

				deepStrictEqual({ listenerStates, messages }, {
					listenerStates: [false, true, false, true, false],
					messages: ['first', 'second']
				});
			});
		}

		for (const eventName of ['onPtyHostExit', 'onPtyHostStart', 'onPtyHostUnresponsive', 'onPtyHostResponsive', 'onPtyHostRequestResolveVariables']) {
			test(`${eventName} remains buffered until an IPC listener attaches`, async () => {
				const emitter = store.add(new Emitter<number>());
				const channel = ProxyChannel.fromService({ [eventName]: emitter.event }, store, {
					unbufferedEvents: localPtyServiceUnbufferedEvents
				});

				emitter.fire(1);

				deepStrictEqual(await Event.toPromise(channel.listen<number>(undefined, eventName)), 1);
			});
		}
	});

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

		// _startPtyHost runs lazily on first use, so trigger one restart to spin up the
		// initial host and capture the listener counts after a single startup as the baseline.
		await service.restartPtyHost();
		const baseline = new Map(listenerCounts);

		for (let i = 0; i < 5; i++) {
			await service.restartPtyHost();
		}

		deepStrictEqual(
			[...listenerCounts.entries()].sort(),
			[...baseline.entries()].sort(),
			'listener counts should not grow across pty host restarts'
		);
	});
});
