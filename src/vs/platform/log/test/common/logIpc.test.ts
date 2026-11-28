/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DidChangeLoggersEvent, LogLevel } from '../../common/log.js';
import { LoggerChannelClient } from '../../common/logIpc.js';

class TestChannel extends Disposable implements IChannel {
	readonly loggers = this._register(new Emitter<DidChangeLoggersEvent>());
	readonly levels = this._register(new Emitter<LogLevel | [URI, LogLevel]>());
	readonly messages: [LogLevel, string][] = [];
	private readonly pending: (() => Promise<void>)[] = [];

	call<T>(command: string, arg?: [URI, [LogLevel, string][]]): Promise<T> {
		return new Promise<T>(resolve => this.pending.push(async () => {
			if (command === 'log') {
				this.messages.push(...arg![1]);
			}
			resolve(undefined as T);
		}));
	}

	listen<T>(event: string): Event<T> {
		return (event === 'onDidChangeLoggers' ? this.loggers.event : event === 'onDidChangeLogLevel' ? this.levels.event : Event.None) as Event<T>;
	}

	async flush(): Promise<void> {
		while (this.pending.length) {
			await this.pending.shift()!();
		}
	}
}

suite('LoggerChannelClient', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.file('/logs/test.log');

	for (const replacementId of ['test', 'te:st']) {
		test(`preserves a local replacement after old notifications (${replacementId})`, async () => {
			const channel = store.add(new TestChannel());
			const client = store.add(new LoggerChannelClient(1, LogLevel.Info, URI.file('/logs'), [], channel));
			client.createLogger('test');
			await channel.flush();
			client.deregisterLogger('test');
			const replacement = client.createLogger(replacementId);
			await channel.flush();

			channel.loggers.fire({ added: [], removed: [{ resource, id: 'test' }] });
			channel.loggers.fire({ added: [{ resource, id: 'test', hidden: true }], removed: [] });
			channel.levels.fire([resource, LogLevel.Trace]);
			replacement.trace('after replacement');
			await channel.flush();

			assert.deepStrictEqual({
				current: client.getLogger(resource) === replacement,
				id: client.getRegisteredLogger(resource)?.id,
				hidden: client.getRegisteredLogger(resource)?.hidden,
				level: replacement.getLevel(),
				messages: channel.messages
			}, { current: true, id: replacementId, hidden: undefined, level: LogLevel.Trace, messages: [[LogLevel.Trace, 'after replacement']] });
		});
	}

	test('removes mirrors after local ownership has been released', async () => {
		const channel = store.add(new TestChannel());
		const client = store.add(new LoggerChannelClient(1, LogLevel.Info, URI.file('/logs'), [], channel));
		client.createLogger(resource);
		await channel.flush();
		client.deregisterLogger(resource);
		channel.loggers.fire({ added: [{ resource, id: 'mirror' }], removed: [] });
		channel.loggers.fire({ added: [], removed: [{ resource, id: 'mirror' }] });
		await channel.flush();

		assert.strictEqual(client.getRegisteredLogger(resource), undefined);
	});
});
