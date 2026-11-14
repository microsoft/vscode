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
import { AbstractMessageLogger, DidChangeLoggersEvent, ILoggerResource, LogLevel } from '../../common/log.js';
import { LoggerChannelClient, RemoteLoggerChannelClient } from '../../common/logIpc.js';
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
				const result = this.roundTrip(await this.server.call(undefined, command, this.roundTrip(arg)));
				// Responses follow the notifications emitted while handling the request.
				this.notifications.push(() => resolve(result));
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

	async flushNotifications(): Promise<void> {
		while (this.notifications.length) {
			this.notifications.shift()!();
			await Promise.resolve();
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
				await channel.flushNotifications();
			}
			const sink = main.getLogger(resource) as TestLogger;
			const removals: DidChangeLoggersEvent[] = [];
			store.add(main.onDidChangeLoggers(event => removals.push(event)));
			main.deregisterLoggers(firstClosed);
			main.setLogLevel(resource, LogLevel.Trace);
			main.setVisibility(resource, false);
			const survivor = firstClosed === 1 ? 1 : 0;
			await channels[survivor].flushNotifications();
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
			for (const channel of channels) {
				await channel.flushNotifications();
			}
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
			for (const channel of channels) {
				await channel.flushNotifications();
			}
			main.setLogLevel(resource, LogLevel.Trace);
			main.setVisibility(resource, false);
			for (const channel of channels) {
				await channel.flushNotifications();
			}
			logger.trace('after global registration');
			await channels[0].flushRequests();
			main.deregisterLoggers(1);

			assert.deepStrictEqual({
				missingBefore,
				mirror: clients[1].getRegisteredLogger(resource),
				mirrorAdditions: mirrorAdditions.length,
				ownerAdditions: ownerAdditions.length,
				currentLogger: clients[0].getLogger(resource) === logger,
				currentSink: main.getLogger(resource) === sink,
				messages: sink.messages,
				disposals: sink.disposals,
				globals: main.getGlobalLoggers().length
			}, {
				missingBefore: true,
				mirror: { ...info, logLevel: LogLevel.Trace, hidden: true },
				mirrorAdditions: 1,
				ownerAdditions: 1,
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
			await channel.flushNotifications();
			client.deregisterLogger('test');
			const replacement = client.createLogger(replacementId);
			await channel.flushRequests();
			await channel.flushNotifications();
			main.setLogLevel(replacedResource, LogLevel.Trace);
			await channel.flushNotifications();
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
		await channel.flushNotifications();
		main.registerLogger(info, 1);
		main.deregisterLoggers(1);
		await channel.flushNotifications();
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

	for (const windowId of [2, undefined]) {
		test(`publishes final promotion metadata to client ${windowId}`, async () => {
			const { main, server } = setup();
			const sink = main.createLogger(resource, { id: 'window', name: 'Window' }, 1) as TestLogger;
			const channel = store.add(new QueuedChannel(server));
			const client = store.add(new LoggerChannelClient(windowId, LogLevel.Info, URI.file('/logs'), main.getGlobalLoggers(), channel));
			const options = { id: 'global', name: 'Global', group: { id: 'group', name: 'Group' } };
			const observed: (ILoggerResource | undefined)[] = [];
			store.add(main.getOnDidChangeLoggersEvent(2)(() => observed.push(main.getRegisteredLogger(resource))));
			main.createLogger(resource, options);
			await channel.flushNotifications();
			const snapshot = (logger: ILoggerResource | undefined) => logger && { id: logger.id, name: logger.name, group: logger.group };
			assert.deepStrictEqual({ mirror: snapshot(client.getRegisteredLogger(resource)), observed: observed.map(snapshot), sameSink: main.getLogger(resource) === sink }, {
				mirror: options, observed: [options], sameSink: true
			});
		});
	}

	test('removes mirrors that lose global interest without disposing the window sink', async () => {
		const { main, server } = setup();
		const sink = main.createLogger(resource, { id: 'terminal' }) as TestLogger;
		main.registerLogger(info, 1);
		const channels = [1, 2, undefined].map(() => store.add(new QueuedChannel(server)));
		const clients = [1, 2, undefined].map((id, index) => store.add(new LoggerChannelClient(id, LogLevel.Info, URI.file('/logs'), main.getGlobalLoggers(), channels[index])));
		main.deregisterLogger(resource);
		main.setVisibility(resource, false);
		for (const channel of channels) {
			await channel.flushNotifications();
		}
		sink.info('still owned');
		assert.deepStrictEqual({ mirrors: clients.map(client => !!client.getRegisteredLogger(resource)), disposals: sink.disposals, messages: sink.messages }, {
			mirrors: [true, false, false], disposals: 0, messages: ['still owned']
		});
	});

	test('restores the global mirror when a window releases its local writer', async () => {
		const { main, server } = setup();
		const sink = main.createLogger(resource, { id: 'terminal' }) as TestLogger;
		const channel = store.add(new QueuedChannel(server));
		const client = store.add(new LoggerChannelClient(1, LogLevel.Info, URI.file('/logs'), main.getGlobalLoggers(), channel));
		client.createLogger(resource, { id: 'terminal' });
		await channel.flushRequests();
		await channel.flushNotifications();
		client.deregisterLogger(resource);
		await channel.flushRequests();
		await channel.flushNotifications();
		main.setLogLevel(resource, LogLevel.Trace);
		main.setVisibility(resource, false);
		await channel.flushNotifications();
		assert.deepStrictEqual({ id: client.getRegisteredLogger(resource)?.id, level: client.getLogLevel(resource), hidden: client.getRegisteredLogger(resource)?.hidden, writer: client.getLogger(resource), disposals: sink.disposals }, {
			id: 'terminal', level: LogLevel.Trace, hidden: true, writer: undefined, disposals: 0
		});
		main.deregisterLogger(resource);
		await channel.flushNotifications();
		assert.strictEqual(client.getRegisteredLogger(resource), undefined);
	});

	for (const visibility of [true, false]) {
		test(`reconciles queued visibility for a replacement (visible: ${visibility})`, async () => {
			const { main, server } = setup();
			const channel = store.add(new QueuedChannel(server));
			const client = store.add(new LoggerChannelClient(1, LogLevel.Info, URI.file('/logs'), [], channel));
			client.createLogger(resource, { id: 'old', hidden: !visibility });
			await channel.flushRequests();
			await channel.flushNotifications();
			main.setVisibility(resource, !visibility);
			client.deregisterLogger(resource);
			const replacement = client.createLogger(resource, { id: 'replacement', hidden: !visibility });
			await channel.flushRequests();
			await channel.flushNotifications();
			assert.deepStrictEqual({ current: client.getLogger(resource) === replacement, hidden: client.getRegisteredLogger(resource)?.hidden, mainHidden: main.getRegisteredLogger(resource)?.hidden }, {
				current: true, hidden: !visibility, mainHidden: !visibility
			});
			main.setVisibility(resource, !visibility);
			await channel.flushNotifications();
			assert.strictEqual(client.getRegisteredLogger(resource)?.hidden, visibility);
		});
	}

	test('ignores an older registration response and applies updates after the replacement response', async () => {
		const { main, server } = setup();
		const channel = store.add(new QueuedChannel(server));
		const client = store.add(new LoggerChannelClient(1, LogLevel.Info, URI.file('/logs'), [], channel));
		client.createLogger(resource, { id: 'old', hidden: true });
		await channel.flushRequests();
		client.deregisterLogger(resource);
		const replacement = client.createLogger(resource, { id: 'replacement', hidden: false });
		await channel.flushRequests();
		main.setVisibility(resource, false);
		await channel.flushNotifications();
		assert.deepStrictEqual({ current: client.getLogger(resource) === replacement, hidden: client.getRegisteredLogger(resource)?.hidden }, { current: true, hidden: true });
	});

	test('releases serialized remote registrations from the owning window', async () => {
		const { main, server } = setup();
		const channel = store.add(new QueuedChannel(server));
		const client = store.add(new LoggerChannelClient(1, LogLevel.Info, URI.file('/logs'), [], channel));
		const changes = store.add(new Emitter<DidChangeLoggersEvent>());
		const remoteChannel: IChannel = {
			call: async <T>(command: string) => (command === 'getRegisteredLoggers' ? [] : undefined) as T,
			listen: <T>(event: string) => (event === 'onDidChangeLoggers' ? changes.event : Event.None) as Event<T>
		};
		store.add(new RemoteLoggerChannelClient(client, remoteChannel));
		await Promise.resolve();
		const serializedInfo: ILoggerResource = JSON.parse(JSON.stringify(info));
		changes.fire({ added: [serializedInfo], removed: [] });
		await channel.flushRequests();
		await channel.flushNotifications();
		assert.ok(main.getRegisteredLogger(resource));
		changes.fire({ added: [], removed: [serializedInfo] });
		await channel.flushRequests();
		await channel.flushNotifications();
		assert.deepStrictEqual({ main: main.getRegisteredLogger(resource), client: client.getRegisteredLogger(resource) }, { main: undefined, client: undefined });
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
