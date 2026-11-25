/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import type { Client, IPCServer } from '../../../base/parts/ipc/common/ipc.js';
import { NullLogService } from '../../../platform/log/common/log.js';
import type { IAgentHostIpcConnectionOptions } from '../../../platform/agentHost/common/agentService.js';
import { createAgentHostCustomizationManagementChannel, type IAgentHostCustomizationManagementService } from '../../../platform/agentHost/common/agentHostCustomizationManagement.js';
import { WebSocketProtocolServer } from '../../../platform/agentHost/node/webSocketTransport.js';
import { AgentHostChannel, IAgentHostUpstreamEndpoint, IUpstreamConnection, UnavailableAgentHostChannel } from '../../node/agentHostChannel.js';

class TestLogService extends NullLogService {
	readonly infos: string[] = [];

	override info(message: string, ...args: unknown[]): void {
		this.infos.push([message, ...args].join(' '));
	}
}

class FakeUpstream extends Disposable implements IUpstreamConnection {
	readonly pluginManagementSupported = false;
	private readonly _onFrame = this._register(new Emitter<string>());
	readonly onFrame: Event<string> = this._onFrame.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose: Event<void> = this._onClose.event;

	readonly sentFrames: string[] = [];
	readonly connectOptions: (IAgentHostIpcConnectionOptions | undefined)[] = [];
	connectResult: Promise<void> = Promise.resolve();
	connectCount = 0;
	disposed = false;

	async connect(options?: IAgentHostIpcConnectionOptions): Promise<void> {
		this.connectCount++;
		this.connectOptions.push(options);
		await this.connectResult;
	}

	send(frame: string): void {
		this.sentFrames.push(frame);
	}

	async callCustomizationManagement<T>(): Promise<T> {
		throw new Error('Plugin management is unavailable in this test upstream');
	}

	fireFrame(text: string): void {
		this._onFrame.fire(text);
	}

	fireClose(): void {
		this._onClose.fire();
	}

	override dispose(): void {
		this.disposed = true;
		this._onClose.fire();
		super.dispose();
	}
}

class FakeIPCServer {
	private readonly _onDidRemoveConnection = new Emitter<Client<string>>();
	readonly onDidRemoveConnection: Event<Client<string>> = this._onDidRemoveConnection.event;

	fireRemove(ctx: string): void {
		this._onDidRemoveConnection.fire({ ctx });
	}

	dispose(): void {
		this._onDidRemoveConnection.dispose();
	}
}

suite('AgentHostChannel', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	function createChannel(): { channel: AgentHostChannel<string>; upstreams: Map<string, FakeUpstream>; ipc: FakeIPCServer } {
		const ipc = ds.add(new FakeIPCServer());
		const upstreams = new Map<string, FakeUpstream>();
		// `ctx` is captured by id-keyed map so tests can fish out the upstream.
		let nextCtxId = 0;
		const factory = (_endpoint: IAgentHostUpstreamEndpoint): IUpstreamConnection => {
			const id = `upstream-${nextCtxId++}`;
			const up = ds.add(new FakeUpstream());
			upstreams.set(id, up);
			return up;
		};
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			{ host: 'localhost', port: '12345' },
			new NullLogService(),
			factory,
		));
		return { channel, upstreams, ipc };
	}

	test('routes frames between renderer and upstream per context', async () => {
		const { channel, upstreams } = createChannel();

		// Subscribe ctxA's frame event (forces creation of its upstream).
		const ctxAFrames: string[] = [];
		ds.add(channel.listen<string>('a', 'frame')(f => ctxAFrames.push(f)));

		const ctxBFrames: string[] = [];
		ds.add(channel.listen<string>('b', 'frame')(f => ctxBFrames.push(f)));

		await channel.call('a', 'connect');
		await channel.call('b', 'connect');

		const upA = upstreams.get('upstream-0')!;
		const upB = upstreams.get('upstream-1')!;

		assert.strictEqual(upA.connectCount, 1);
		assert.strictEqual(upB.connectCount, 1);

		upA.fireFrame('frameA');
		upB.fireFrame('frameB');
		assert.deepStrictEqual(ctxAFrames, ['frameA']);
		assert.deepStrictEqual(ctxBFrames, ['frameB']);

		await channel.call('a', 'send', 'outA');
		assert.deepStrictEqual(upA.sentFrames, ['outA']);
		assert.deepStrictEqual(upB.sentFrames, []);
	});

	test('closes upstream when renderer client disconnects', async () => {
		const { channel, upstreams, ipc } = createChannel();

		let closed = 0;
		ds.add(channel.listen<void>('a', 'close')(() => closed++));
		await channel.call('a', 'connect');

		const upA = upstreams.get('upstream-0')!;
		assert.strictEqual(upA.disposed, false);

		ipc.fireRemove('a');

		assert.strictEqual(upA.disposed, true);
		assert.strictEqual(closed, 1);
	});

	test('resolves a deferred endpoint only when connecting', async () => {
		const ipc = ds.add(new FakeIPCServer());
		let resolveCount = 0;
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			async () => {
				resolveCount++;
				return { socketPath: 'agent-host.sock' };
			},
			new NullLogService(),
			() => ds.add(new FakeUpstream()),
		));

		channel.listen('renderer', 'frame');
		assert.strictEqual(resolveCount, 0);

		await channel.call('renderer', 'connect');
		assert.strictEqual(resolveCount, 1);
	});

	test('passes the resolver environment to the server-owned launch on each connection', async () => {
		const ipc = ds.add(new FakeIPCServer());
		const options: (IAgentHostIpcConnectionOptions | undefined)[] = [];
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			async connectionOptions => {
				options.push(connectionOptions);
				return { socketPath: 'agent-host.sock' };
			},
			new NullLogService(),
			() => ds.add(new FakeUpstream()),
		));
		channel.listen('first', 'frame');
		const beforeConnect = options.length;
		await channel.call('first', 'connect', {
			env: { GITHUB_TOKEN: 'codespace-token', GH_TOKEN: null, EMPTY: '' },
			debugEnv: { Github_Token: 'debug-token' },
			preferredAgentLocation: 'editor',
		});
		await channel.call('second', 'connect', { env: { GITHUB_TOKEN: 'refreshed-codespace-token' }, preferredAgentLocation: 'dedicated' });
		await channel.call('third', 'connect');

		assert.deepStrictEqual({ beforeConnect, options }, {
			beforeConnect: 0,
			options: [
				{ env: { GITHUB_TOKEN: 'codespace-token', GH_TOKEN: null, EMPTY: '' }, debugEnv: { Github_Token: 'debug-token' }, preferredAgentLocation: 'editor' },
				{ env: { GITHUB_TOKEN: 'refreshed-codespace-token' }, preferredAgentLocation: 'dedicated' },
				undefined,
			],
		});
	});

	test('does not forward the resolver environment to an externally managed upstream', async () => {
		const { channel, upstreams } = createChannel();
		await channel.call('renderer', 'connect', { env: { GITHUB_TOKEN: 'codespace-token' }, debugEnv: { GITHUB_TOKEN: 'debug-token' } });

		assert.deepStrictEqual(upstreams.get('upstream-0')!.connectOptions, [undefined]);
	});

	test('rejects malformed connection options before starting the host', async () => {
		const ipc = ds.add(new FakeIPCServer());
		let resolveCount = 0;
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			async () => {
				resolveCount++;
				return { socketPath: 'agent-host.sock' };
			},
			new NullLogService(),
			() => ds.add(new FakeUpstream()),
		));

		for (const options of [null, [], 'secret', { env: null }, { env: [] }, { env: 'secret' }, { env: { GITHUB_TOKEN: 123 } }, { debugEnv: null }, { debugEnv: [] }, { debugEnv: 'secret' }, { debugEnv: { GITHUB_TOKEN: 123 } }, { preferredAgentLocation: null }, { preferredAgentLocation: 'standalone' }, { preferredAgentLocation: {} }, { preferredAgentLocation: 1 }]) {
			await assert.rejects(channel.call('renderer', 'connect', options), /Invalid agent host connection options/);
		}
		assert.strictEqual(resolveCount, 0);
	});

	test('does not log the upstream connection token', async () => {
		const ipc = ds.add(new FakeIPCServer());
		const logService = new TestLogService();
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			{ host: 'localhost', port: '12345', connectionToken: 'secret-token' },
			logService,
			() => ds.add(new FakeUpstream()),
		));

		channel.listen('renderer', 'frame');
		assert.deepStrictEqual(logService.infos, []);

		await channel.call('renderer', 'connect', { env: { GITHUB_TOKEN: 'secret-environment-token' } });

		assert.deepStrictEqual(logService.infos, [
			'[AgentHostChannel] Renderer ctx=renderer requested connect to upstream',
			'[AgentHostChannel] Opening upstream to localhost:12345',
		]);
	});

	for (const initialToken of [undefined, 'stale-codespace-token']) {
		test(`applies concurrent renderer environments when the first token is ${initialToken ? 'stale' : 'absent'}`, async () => {
			const ipc = ds.add(new FakeIPCServer());
			const endpoint = new DeferredPromise<IAgentHostUpstreamEndpoint>();
			const environments: IAgentHostIpcConnectionOptions['env'][] = [];
			let upstreamCount = 0;
			const channel = ds.add(new AgentHostChannel<string>(
				ipc as unknown as IPCServer<string>,
				options => {
					environments.push(options?.env);
					return endpoint.p;
				},
				new NullLogService(),
				() => {
					upstreamCount++;
					return ds.add(new FakeUpstream());
				},
			));
			const initialOptions = initialToken ? { env: { GITHUB_TOKEN: initialToken } } : undefined;
			const refreshedEnvironment = { GITHUB_TOKEN: 'refreshed-codespace-token', GH_TOKEN: null, EMPTY: '' };
			const connect = Promise.all([
				channel.call('editor', 'connect', initialOptions),
				channel.call('agents', 'connect', { env: refreshedEnvironment }),
			]);
			await Promise.resolve();
			const beforeReady = { environments: [...environments], upstreamCount };

			await endpoint.complete({ socketPath: 'agent-host.sock' });
			await connect;

			assert.deepStrictEqual({ beforeReady, upstreamCount }, {
				beforeReady: { environments: [initialOptions?.env, refreshedEnvironment], upstreamCount: 0 },
				upstreamCount: 2,
			});
		});
	}

	test('surfaces deferred endpoint resolution failures and allows retry', async () => {
		const ipc = ds.add(new FakeIPCServer());
		let resolveCount = 0;
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			async () => {
				resolveCount++;
				if (resolveCount === 1) {
					throw new Error('agent host did not start');
				}
				return { socketPath: 'agent-host.sock' };
			},
			new NullLogService(),
			() => ds.add(new FakeUpstream()),
		));

		await assert.rejects(() => channel.call('renderer', 'connect'), /agent host did not start/);
		await assert.doesNotReject(() => channel.call('renderer', 'connect'));
		assert.strictEqual(resolveCount, 2);
	});

	test('re-resolves the endpoint for later connections', async () => {
		const ipc = ds.add(new FakeIPCServer());
		let resolveCount = 0;
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			async () => {
				resolveCount++;
				return { socketPath: 'agent-host.sock' };
			},
			new NullLogService(),
			() => ds.add(new FakeUpstream()),
		));

		await channel.call('first', 'connect');
		await channel.call('second', 'connect');

		// Resolution is `ensureStarted()` in the lazy server path, so a later
		// connection must be able to restart a host that has since died.
		assert.strictEqual(resolveCount, 2);
	});

	test('routes plugin management to the same authenticated shared host as the data connection', async () => {
		const calls: unknown[] = [];
		const backendSession = URI.parse('vendor-session:/opaque');
		const backendChat = URI.parse('vendor-chat:/opaque');
		const resource = URI.file('/plugins/sample');
		const management = upcastPartial<IAgentHostCustomizationManagementService>({
			installPlugin: async (...args) => { calls.push(['installPlugin', ...args]); },
			listPluginInstallations: async (...args) => {
				calls.push(['listPluginInstallations', ...args]);
				return [{ name: 'sample', marketplace: 'test', resource, enabled: true }];
			},
			uninstallPlugin: async (...args) => { calls.push(['uninstallPlugin', ...args]); },
			setPluginEnabled: async (...args) => { calls.push(['setPluginEnabled', ...args]); },
			listPluginMarketplaces: async (...args) => { calls.push(['listPluginMarketplaces', ...args]); return []; },
			addPluginMarketplace: async (...args) => {
				calls.push(['addPluginMarketplace', ...args]);
				return { name: 'test', source: 'owner/repo', isDefault: false, managed: false, available: true };
			},
			browsePluginMarketplace: async (...args) => { calls.push(['browsePluginMarketplace', ...args]); return []; },
			removePluginMarketplace: async (...args) => { calls.push(['removePluginMarketplace', ...args]); return { removed: true }; },
			refreshPluginMarketplaces: async (...args) => { calls.push(['refreshPluginMarketplaces', ...args]); return []; },
		});
		const server = ds.add(await WebSocketProtocolServer.create({
			port: 0,
			connectionTokenValidate: token => token === 'shared-token',
			customizationManagementChannel: createAgentHostCustomizationManagementChannel(management, ds.add(new DisposableStore())),
		}, new NullLogService()));
		ds.add(server.onConnection(transport => ds.add(transport)));
		await server.whenListening;
		const ipc = ds.add(new FakeIPCServer());
		let resolutions = 0;
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			async () => {
				if (++resolutions > 1) {
					throw new Error('Management must not rediscover a different host');
				}
				return { host: '127.0.0.1', port: String(server.boundPort), connectionToken: 'shared-token' };
			},
			new NullLogService(),
		));
		await channel.call('renderer', 'connect');
		const install = { source: 'sample@test' };
		const uninstall = { name: 'sample', marketplace: 'test' };
		await channel.call('renderer', 'installPlugin', ['copilotcli', install, backendSession, backendChat]);
		const inventory = await channel.call('renderer', 'listPluginInstallations', ['copilotcli', backendSession, backendChat]);
		await channel.call('renderer', 'setPluginEnabled', ['copilotcli', 'sample@test', null, 'repository', backendSession, backendChat]);
		await channel.call('renderer', 'uninstallPlugin', ['copilotcli', uninstall, backendSession, backendChat]);
		await channel.call('renderer', 'listPluginMarketplaces', ['copilotcli', backendSession, backendChat]);
		await channel.call('renderer', 'addPluginMarketplace', ['copilotcli', backendSession, 'owner/repo', backendChat]);
		await channel.call('renderer', 'browsePluginMarketplace', ['copilotcli', backendSession, 'test', backendChat]);
		await channel.call('renderer', 'removePluginMarketplace', ['copilotcli', backendSession, 'test', true, backendChat]);
		await channel.call('renderer', 'refreshPluginMarketplaces', ['copilotcli', backendSession, 'test', backendChat]);

		assert.deepStrictEqual({ calls, inventory, resolutions }, {
			calls: [
				['installPlugin', 'copilotcli', install, backendSession, backendChat],
				['listPluginInstallations', 'copilotcli', backendSession, backendChat],
				['setPluginEnabled', 'copilotcli', 'sample@test', null, 'repository', backendSession, backendChat],
				['uninstallPlugin', 'copilotcli', uninstall, backendSession, backendChat],
				['listPluginMarketplaces', 'copilotcli', backendSession, backendChat],
				['addPluginMarketplace', 'copilotcli', backendSession, 'owner/repo', backendChat],
				['browsePluginMarketplace', 'copilotcli', backendSession, 'test', backendChat],
				['removePluginMarketplace', 'copilotcli', backendSession, 'test', true, backendChat],
				['refreshPluginMarketplaces', 'copilotcli', backendSession, 'test', backendChat],
			],
			inventory: [{ name: 'sample', marketplace: 'test', resource: resource.toJSON(), enabled: true }],
			resolutions: 1,
		});
	});

	test('rejects unrelated management methods at both sides of the bridge', async () => {
		const { channel, upstreams } = createChannel();
		const management = createAgentHostCustomizationManagementChannel(upcastPartial<IAgentHostCustomizationManagementService>({
			installPlugin: async () => { throw new Error('Disabled by runtime policy'); },
		}), ds.add(new DisposableStore()));
		for (const command of ['shutdown', 'authenticate', 'setHostExecutionCredentials', 'constructor', 'toString']) {
			await assert.rejects(() => channel.call('renderer', command, []), /Invalid call/);
			assert.throws(() => management.call('remote', command, []), /Invalid customization management call/);
		}
		assert.throws(() => management.listen('remote', 'onAnything'), /Invalid customization management event/);
		await assert.rejects(() => management.call('remote', 'installPlugin', ['copilotcli', { source: 'sample@test' }]), /Disabled by runtime policy/);
		assert.deepStrictEqual([...upstreams.values()], []);
	});

	test('requires a connected data endpoint before plugin management', async () => {
		const { channel } = createChannel();
		await assert.rejects(() => channel.call('renderer', 'installPlugin', []), /Connect to the agent host/);
		await assert.rejects(() => channel.call('renderer', 'installPlugin', {}), /Invalid customization management arguments/);
	});

	test('reports an older host without plugin management explicitly', async () => {
		const server = ds.add(await WebSocketProtocolServer.create({ port: 0 }, new NullLogService()));
		ds.add(server.onConnection(transport => ds.add(transport)));
		await server.whenListening;
		const ipc = ds.add(new FakeIPCServer());
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			{ host: '127.0.0.1', port: String(server.boundPort) },
			new NullLogService(),
		));
		await channel.call('renderer', 'connect');
		await assert.rejects(() => channel.call('renderer', 'listPluginMarketplaces', ['copilotcli']), /does not support plugin management/);
	});

	test('rejects pending management calls on disconnect and reconnects to the newly selected host', async () => {
		const requested = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		const closed = new DeferredPromise<void>();
		const transports = ds.add(new DisposableStore());
		const server = ds.add(await WebSocketProtocolServer.create({
			port: 0,
			connectionTokenValidate: token => token === 'token',
			customizationManagementChannel: createAgentHostCustomizationManagementChannel(upcastPartial<IAgentHostCustomizationManagementService>({
				installPlugin: async () => {
					await requested.complete();
					await finish.p;
				},
			}), ds.add(new DisposableStore())),
		}, new NullLogService()));
		ds.add(server.onConnection(transport => {
			transports.add(transport);
			transports.add(transport.onClose(() => closed.complete()));
		}));
		await server.whenListening;
		const replacement = ds.add(await WebSocketProtocolServer.create({
			port: 0,
			connectionTokenValidate: token => token === 'replacement-token',
			customizationManagementChannel: createAgentHostCustomizationManagementChannel(upcastPartial<IAgentHostCustomizationManagementService>({
				listPluginMarketplaces: async () => [{ name: 'replacement', source: 'owner/repo', isDefault: false, managed: false, available: true }],
			}), ds.add(new DisposableStore())),
		}, new NullLogService()));
		ds.add(replacement.onConnection(transport => transports.add(transport)));
		await replacement.whenListening;
		const ipc = ds.add(new FakeIPCServer());
		let endpoint: IAgentHostUpstreamEndpoint = { host: '127.0.0.1', port: String(server.boundPort), connectionToken: 'token' };
		const channel = ds.add(new AgentHostChannel<string>(ipc as unknown as IPCServer<string>, async () => endpoint, new NullLogService()));
		await channel.call('renderer', 'connect');
		const installing = channel.call('renderer', 'installPlugin', ['copilotcli', { source: 'sample@test' }]);
		await requested.p;
		const rejected = assert.rejects(installing, /Canceled|closed/);
		await channel.call('renderer', 'close');
		await rejected;
		await finish.complete();
		await closed.p;
		endpoint = { host: '127.0.0.1', port: String(replacement.boundPort), connectionToken: 'replacement-token' };
		await channel.call('renderer', 'connect');
		const marketplaces = await channel.call('renderer', 'listPluginMarketplaces', ['copilotcli']);
		assert.deepStrictEqual(marketplaces, [{ name: 'replacement', source: 'owner/repo', isDefault: false, managed: false, available: true }]);
	});
});

suite('UnavailableAgentHostChannel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('rejects connect without reporting an unknown IPC channel', async () => {
		const channel = new UnavailableAgentHostChannel<string>();

		assert.doesNotThrow(() => channel.listen('renderer1', 'frame'));
		assert.doesNotThrow(() => channel.listen('renderer1', 'close'));
		await assert.rejects(() => channel.call('renderer1', 'connect'), /Agent host proxy is not available/);
		await assert.doesNotReject(() => channel.call('renderer1', 'send'));
		await assert.doesNotReject(() => channel.call('renderer1', 'close'));
	});
});
