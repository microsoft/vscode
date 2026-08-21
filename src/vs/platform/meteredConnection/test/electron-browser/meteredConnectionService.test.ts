/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IMainProcessService } from '../../../ipc/common/mainProcessService.js';
import { METERED_CONNECTION_CHANNEL, MeteredConnectionCommand } from '../../common/meteredConnectionIpc.js';
import { NativeMeteredConnectionService } from '../../electron-browser/meteredConnectionService.js';

class TestChannel implements IChannel, IDisposable {
	readonly calls: { command: string; argument: unknown }[] = [];
	private readonly onDidChangeEmitter = new Emitter<boolean>();

	constructor(private readonly initialState: Promise<boolean> = Promise.resolve(true)) { }

	call<T>(command: string, arg?: unknown, _cancellationToken?: CancellationToken): Promise<T> {
		this.calls.push({ command, argument: arg });
		return this.initialState as Promise<T>;
	}

	listen<T>(event: string, _arg?: unknown): Event<T> {
		if (event === MeteredConnectionCommand.OnDidChangeIsConnectionMetered) {
			return this.onDidChangeEmitter.event as Event<T>;
		}
		return Event.None;
	}

	fire(value: boolean): void {
		this.onDidChangeEmitter.fire(value);
	}

	dispose(): void {
		this.onDidChangeEmitter.dispose();
	}
}

suite('NativeMeteredConnectionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('receives the initial native connection state from the main process', async () => {
		const channel = store.add(new TestChannel());
		const mainProcessService = new class extends mock<IMainProcessService>() {
			override getChannel(channelName: string): IChannel {
				assert.strictEqual(channelName, METERED_CONNECTION_CHANNEL);
				return channel;
			}
		};

		const service = store.add(new NativeMeteredConnectionService(mainProcessService));
		await timeout(0);

		assert.deepStrictEqual({
			calls: channel.calls,
			isConnectionMetered: service.isConnectionMetered,
		}, {
			calls: [{
				command: MeteredConnectionCommand.IsConnectionMetered,
				argument: undefined,
			}],
			isConnectionMetered: true,
		});
	});

	test('does not overwrite an event with a stale initial state', async () => {
		const initialState = new DeferredPromise<boolean>();
		const channel = store.add(new TestChannel(initialState.p));
		const mainProcessService = new class extends mock<IMainProcessService>() {
			override getChannel(): IChannel {
				return channel;
			}
		};
		const service = store.add(new NativeMeteredConnectionService(mainProcessService));

		channel.fire(true);
		initialState.complete(false);
		await timeout(0);

		assert.strictEqual(service.isConnectionMetered, true);
	});
});
