/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IMainProcessService } from '../../../ipc/common/mainProcessService.js';
import { METERED_CONNECTION_CHANNEL, MeteredConnectionCommand } from '../../common/meteredConnectionIpc.js';
import { NativeMeteredConnectionService } from '../../electron-browser/meteredConnectionService.js';

class TestChannel implements IChannel {
	readonly calls: { command: string; argument: unknown }[] = [];

	call<T>(command: string, arg?: unknown, _cancellationToken?: CancellationToken): Promise<T> {
		this.calls.push({ command, argument: arg });
		return Promise.resolve(undefined as T);
	}

	listen<T>(_event: string, _arg?: unknown): Event<T> {
		return Event.None;
	}
}

suite('NativeMeteredConnectionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports the initial browser connection state to the main process', () => {
		const channel = new TestChannel();
		const mainProcessService = new class extends mock<IMainProcessService>() {
			override getChannel(channelName: string): IChannel {
				assert.strictEqual(channelName, METERED_CONNECTION_CHANNEL);
				return channel;
			}
		};
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);

		store.add(new NativeMeteredConnectionService(() => true, configurationService, mainProcessService));

		assert.deepStrictEqual(channel.calls, [{
			command: MeteredConnectionCommand.SetIsBrowserConnectionMetered,
			argument: true,
		}]);
	});
});
