/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { BufferReader, BufferWriter, deserialize, IChannel, serialize } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AbstractMessageLogger, DidChangeLoggersEvent, LogLevel } from '../../common/log.js';
import { LoggerChannelClient } from '../../common/logIpc.js';
import { LoggerChannel } from '../../electron-main/logIpc.js';
import { LoggerMainService } from '../../electron-main/loggerService.js';

class TestLogger extends AbstractMessageLogger {
	readonly messages: string[] = [];
	disposals = 0;

	protected log(_level: LogLevel, message: string): void {
		this.messages.push(message);
	}

	override dispose(): void {
		this.disposals++;
		super.dispose();
	}
}

class TestLoggerMainService extends LoggerMainService {
	failCreation = false;

	protected override doCreateLogger(_resource: URI, level: LogLevel): TestLogger {
		if (this.failCreation) {
			throw new Error('Cannot create logger');
		}
		const logger = new TestLogger();
		logger.setLevel(level);
		return logger;
	}
}

class QueuedChannel extends Disposable implements IChannel {
	private readonly requests: (() => Promise<void>)[] = [];
	private readonly notifications: (() => void)[] = [];

	constructor(private readonly server: LoggerChannel) {
		super();
	}

	private roundTrip<T>(value: T): T {
		const writer = new BufferWriter();
		try {
			serialize(writer, value);
			return deserialize(new BufferReader(writer.buffer));
		} finally {
			writer.dispose();
		}
	}

	call<T>(command: string, arg?: object): Promise<T> {
		return new Promise<T>((resolve, reject) => this.requests.push(async () => {
			try {
				resolve(await this.server.call(undefined, command, this.roundTrip(arg)));
			} catch (error) {
				reject(error);
			}
		}));
	}

	listen<T>(event: string, windowId?: number): Event<T> {
		const emitter = this._register(new Emitter<T>());
		this._register(this.server.listen(undefined, event, windowId)((value: T) => {
			const serialized = this.roundTrip(value);
			this.notifications.push(() => emitter.fire(serialized));
		}));
		return emitter.event;
	}

	async flushRequests(): Promise<void> {
		while (this.requests.length) {
			await this.requests.shift()!();
		}
	}

	flushNotifications(): void {
		while (this.notifications.length) {
			this.notifications.shift()!();
		}
	}
}

suite('LoggerMainService ownership', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.file('/logs/terminal.log');
	const info = { resource, id: 'terminal' };

	function setup() {
		const main = store.add(new TestLoggerMainService(LogLevel.Info, URI.file('/logs')));
		const server = store.add(new LoggerChannel(main));
		return { main, server };
	}

	test('preserves global resources supplied at construction', () => {
		const main = store.add(new TestLoggerMainService(LogLevel.Info, URI.file('/logs'), [info]));
		main.registerLogger(info, 1);
		main.deregisterLoggers(1);
		assert.deepStrictEqual(main.getGlobalLoggers(), [info]);
		main.deregisterLogger(resource);
		assert.strictEqual(main.getRegisteredLogger(resource), undefined);
	});

	test('does not claim ownership when logger creation fails', () => {
		const { main } = setup();
		main.registerLogger(info, 1);
		main.failCreation = true;
		assert.throws(() => main.createLogger(resource, {}, 2), /Cannot create logger/);
		main.deregisterLoggers(1);
		assert.strictEqual(main.getRegisteredLogger(resource), undefined);
	});

	for (const firstClosed of [1, 2]) {
		test(`keeps a shared logger after closing window ${firstClosed}`, async () => {
			const { main, server } = setup();
			const channels = [store.add(new QueuedChannel(server)), store.add(new QueuedChannel(server))];
			const clients = channels.map((channel, index) => store.add(new LoggerChannelClient(index + 1, LogLevel.Info, URI.file('/logs'), [], channel)));
			const loggers = clients.map(client => client.createLogger(resource, { id: 'terminal' }));
			for (const channel of channels) {
				await channel.flushRequests();
				channel.flushNotifications();
			}
			const sink = main.getLogger(resource) as TestLogger;
			const removals: DidChangeLoggersEvent[] = [];
			store.add(main.onDidChangeLoggers(event => removals.push(event)));
			main.deregisterLoggers(firstClosed);
			main.setLogLevel(resource, LogLevel.Trace);
			main.setVisibility(resource, false);
			const survivor = firstClosed === 1 ? 1 : 0;
			channels[survivor].flushNotifications();
			loggers[survivor].trace('still logging');
			await channels[survivor].flushRequests();

			assert.deepStrictEqual({
				registered: !!main.getRegisteredLogger(resource),
				clientLogger: clients[survivor].getLogger(resource) === loggers[survivor],
				level: loggers[survivor].getLevel(),
				hidden: clients[survivor].getRegisteredLogger(resource)?.hidden,
				messages: sink.messages,
				disposals: sink.disposals,
				removals
			}, { registered: true, clientLogger: true, level: LogLevel.Trace, hidden: true, messages: ['still logging'], disposals: 0, removals: [] });

			main.deregisterLoggers(survivor + 1);
			assert.deepStrictEqual({ registered: main.getRegisteredLogger(resource), disposals: sink.disposals, removals: removals.length }, { registered: undefined, disposals: 1, removals: 1 });
		});
	}

	test('releases only the explicitly deregistering window over IPC', async () => {
		const { main, server } = setup();
		main.registerLogger(info, 1);
		main.registerLogger(info, 1);
		main.registerLogger(info, 2);
		await server.call(undefined, 'deregisterLogger', [resource.toJSON(), 3]);
		await server.call(undefined, 'deregisterLogger', [resource.toJSON(), 1]);
		await server.call(undefined, 'deregisterLogger', [resource.toJSON(), 1]);
		assert.ok(main.getRegisteredLogger(resource));
		await server.call(undefined, 'deregisterLogger', [resource.toJSON(), 2]);
		assert.strictEqual(main.getRegisteredLogger(resource), undefined);
	});

	for (const globalFirst of [true, false]) {
		test(`preserves global ownership (global first: ${globalFirst})`, () => {
			const { main } = setup();
			main.createLogger(resource, {}, globalFirst ? undefined : 1);
			main.createLogger(resource, {}, globalFirst ? 1 : undefined);
			main.registerLogger(info, 2);
			main.deregisterLoggers(1);
			main.deregisterLoggers(2);
			assert.deepStrictEqual(main.getGlobalLoggers().map(logger => logger.resource.toString()), [resource.toString()]);
			main.deregisterLogger(resource);
			assert.strictEqual(main.getRegisteredLogger(resource), undefined);
		});
	}

	for (const createGlobalLogger of [true, false]) {
		test(`notifies existing non-owning windows when a logger becomes global (create: ${createGlobalLogger})`, async () => {
			const { main, server } = setup();
			const channels = [store.add(new QueuedChannel(server)), store.add(new QueuedChannel(server))];
			const clients = channels.map((channel, index) => store.add(new LoggerChannelClient(index + 1, LogLevel.Info, URI.file('/logs'), [], channel)));
			const logger = clients[0].createLogger(resource, { id: 'terminal' });
			await channels[0].flushRequests();
			channels.forEach(channel => channel.flushNotifications());
			const missingBefore = clients[1].getRegisteredLogger(resource) === undefined;
			const sink = main.getLogger(resource) as TestLogger;
			const ownerAdditions: DidChangeLoggersEvent[] = [];
			const mirrorAdditions: DidChangeLoggersEvent[] = [];
			store.add(main.getOnDidChangeLoggersEvent(1)(event => ownerAdditions.push(event)));
			store.add(clients[1].onDidChangeLoggers(event => mirrorAdditions.push(event)));

			if (createGlobalLogger) {
				main.createLogger(resource, { id: 'terminal' });
			} else {
				main.registerLogger(info);
			}
			main.registerLogger(info);
			channels.forEach(channel => channel.flushNotifications());
			main.setLogLevel(resource, LogLevel.Trace);
			main.setVisibility(resource, false);
			channels.forEach(channel => channel.flushNotifications());
			logger.trace('after global registration');
			await channels[0].flushRequests();
			main.deregisterLoggers(1);

			assert.deepStrictEqual({
				missingBefore,
				mirror: clients[1].getRegisteredLogger(resource),
				mirrorAdditions: mirrorAdditions.length,
				ownerAdditions,
				currentLogger: clients[0].getLogger(resource) === logger,
				currentSink: main.getLogger(resource) === sink,
				messages: sink.messages,
				disposals: sink.disposals,
				globals: main.getGlobalLoggers().length
			}, {
				missingBefore: true,
				mirror: { ...info, logLevel: LogLevel.Trace, hidden: true },
				mirrorAdditions: 1,
				ownerAdditions: [],
				currentLogger: true,
				currentSink: true,
				messages: ['after global registration'],
				disposals: 0,
				globals: 1
			});
		});
	}

	for (const replacementId of ['test', 'te:st']) {
		test(`keeps a replacement through serialized queued notifications (${replacementId})`, async () => {
			const { main, server } = setup();
			const channel = store.add(new QueuedChannel(server));
			const client = store.add(new LoggerChannelClient(1, LogLevel.Info, URI.file('/logs'), [], channel));
			const replacedResource = URI.file('/logs/test.log');
			client.createLogger('test');
			await channel.flushRequests();
			channel.flushNotifications();
			client.deregisterLogger('test');
			const replacement = client.createLogger(replacementId);
			await channel.flushRequests();
			channel.flushNotifications();
			main.setLogLevel(replacedResource, LogLevel.Trace);
			channel.flushNotifications();
			replacement.trace('after replacement');
			await channel.flushRequests();

			assert.deepStrictEqual({
				current: client.getLogger(replacedResource) === replacement,
				id: client.getRegisteredLogger(replacedResource)?.id,
				level: replacement.getLevel(),
				messages: (main.getLogger(replacedResource) as TestLogger).messages
			}, { current: true, id: replacementId, level: LogLevel.Trace, messages: ['after replacement'] });
		});
	}

	test('keeps a shared-process logger when a window releases the same resource', async () => {
		const { main, server } = setup();
		const channel = store.add(new QueuedChannel(server));
		const client = store.add(new LoggerChannelClient(undefined, LogLevel.Info, URI.file('/logs'), [], channel));
		const logger = client.createLogger(resource);
		await channel.flushRequests();
		channel.flushNotifications();
		main.registerLogger(info, 1);
		main.deregisterLoggers(1);
		channel.flushNotifications();
		logger.info('shared process');
		await channel.flushRequests();

		assert.deepStrictEqual({ globals: main.getGlobalLoggers().length, messages: (main.getLogger(resource) as TestLogger).messages }, { globals: 1, messages: ['shared process'] });
		client.deregisterLogger(resource);
		await channel.flushRequests();
		assert.strictEqual(main.getRegisteredLogger(resource), undefined);
	});

	test('releasing a global owner preserves window ownership and filtering', async () => {
		const { main, server } = setup();
		main.registerLogger(info);
		main.registerLogger(info, 1);
		const changes: number[] = [];
		store.add(main.getOnDidChangeLogLevelEvent(1)(() => changes.push(1)));
		store.add(main.getOnDidChangeLogLevelEvent(2)(() => changes.push(2)));
		await server.call(undefined, 'deregisterLogger', [resource.toJSON(), undefined]);
		main.setLogLevel(resource, LogLevel.Trace);
		assert.deepStrictEqual({ registered: !!main.getRegisteredLogger(resource), globals: main.getGlobalLoggers(), changes }, { registered: true, globals: [], changes: [1] });
	});

	test('notifies all owners, excluding unrelated windows', () => {
		const { main } = setup();
		main.registerLogger(info, 1);
		main.registerLogger(info, 2);
		const changes: number[] = [];
		for (const id of [1, 2, 3]) {
			store.add(main.getOnDidChangeVisibilityEvent(id)(() => changes.push(id)));
		}
		main.setVisibility(resource, false);
		assert.deepStrictEqual(changes, [1, 2]);
	});
});
