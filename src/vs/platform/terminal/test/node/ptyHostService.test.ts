/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IChannel, IChannelClient } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { NullLogService, NullLoggerService } from '../../../log/common/log.js';
import { IPtyHostController, ptyServiceEvents } from '../../common/terminal.js';
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

	test('every event of the service is accounted for on the local pty channel', () => {
		// `ProxyChannel.fromService` buffers every `on*` property of the service it is handed until a client
		// listens, and the local pty channel lists the `IPtyService` events as unbuffered because a window
		// never listens to them there (see app.ts, #328885). `ptyServiceEvents` is exhaustive for the
		// interface; this checks the class, which is what the channel reflects over: an event it gains that is
		// in neither list would be buffered in the main process for a client that never comes.
		const consumedOverLocalPtyChannel = [
			'onPtyHostExit', 'onPtyHostStart', 'onPtyHostUnresponsive', 'onPtyHostResponsive', 'onPtyHostRequestResolveVariables'
		] satisfies readonly (keyof IPtyHostController)[];

		const starter: IPtyHostStarter = {
			start: (): IPtyHostConnection => { throw new Error('the pty host is not expected to start'); },
			dispose: () => { }
		};
		const service = store.add(new PtyHostService(
			starter,
			new TestConfigurationService(),
			new NullLogService(),
			store.add(new NullLoggerService())
		));

		const events: string[] = [];
		for (const key in service) {
			if (/^on[A-Z]/.test(key)) {
				events.push(key);
			}
		}
		deepStrictEqual(events.sort(), [...ptyServiceEvents, ...consumedOverLocalPtyChannel].sort());
	});
});
