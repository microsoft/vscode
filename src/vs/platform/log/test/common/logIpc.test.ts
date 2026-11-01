/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import type { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DidChangeLoggersEvent, LogLevel } from '../../common/log.js';
import { LoggerChannelClient } from '../../common/logIpc.js';

class TestChannel implements IChannel {
	readonly onDidChangeLoggers = new Emitter<DidChangeLoggersEvent>();

	call<T>(): Promise<T> {
		return Promise.resolve(undefined as T);
	}

	listen<T>(event: string): Event<T> {
		if (event === 'onDidChangeLoggers') {
			return this.onDidChangeLoggers.event as Event<unknown> as Event<T>;
		}
		return Event.None;
	}
}

suite('LoggerChannelClient', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('deregisters logger resources received over IPC', () => {
		const channel = new TestChannel();
		disposables.add(channel.onDidChangeLoggers);
		const client = disposables.add(new LoggerChannelClient(undefined, LogLevel.Info, URI.file('/logs'), [], channel));
		const resource = URI.file('/logs/window/renderer.log');
		const serializedResource = resource.toJSON() as URI;

		channel.onDidChangeLoggers.fire({ added: [{ resource: serializedResource, id: 'window' }], removed: [] });
		assert.ok(client.getRegisteredLogger(resource));

		channel.onDidChangeLoggers.fire({ added: [], removed: [{ resource: serializedResource, id: 'window' }] });
		assert.strictEqual(client.getRegisteredLogger(resource), undefined);
	});
});
