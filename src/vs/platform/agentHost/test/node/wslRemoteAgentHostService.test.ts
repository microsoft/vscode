/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as cp from 'child_process';
import { EventEmitter } from 'events';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IProductService } from '../../../product/common/productService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import type { IWSLConnectProgress, IWSLConnectResult } from '../../common/wslRemoteAgentHost.js';
import { WSLRemoteAgentHostMainService } from '../../node/wslRemoteAgentHostService.js';
import type WebSocket from 'ws';

class MockWSLChild extends EventEmitter {
	readonly stdout = new EventEmitter();
	readonly stderr = new EventEmitter();

	exitCode: number | null = null;
	signalCode: NodeJS.Signals | null = null;
	killCalls = 0;

	kill(_signal?: NodeJS.Signals): boolean {
		this.killCalls++;
		if (this.exitCode === null && this.signalCode === null) {
			this.signalCode = 'SIGTERM';
			queueMicrotask(() => this.emit('exit', null, 'SIGTERM'));
		}
		return true;
	}

	emitStdout(text: string): void {
		this.stdout.emit('data', Buffer.from(text));
	}
}

class MockWebSocket extends EventEmitter {
	closeCalls = 0;

	close(): void {
		this.closeCalls++;
		this.emit('close');
	}
}

/**
 * In-process WSL service double that controls platform detection, process
 * output, and WebSocket creation without spawning WSL or loading `ws`.
 */
class TestableWSLRemoteAgentHostMainService extends WSLRemoteAgentHostMainService {
	readonly children: MockWSLChild[] = [];
	readonly webSockets: MockWebSocket[] = [];
	readonly webSocketUrls: string[] = [];
	private nextWebSocket: DeferredPromise<MockWebSocket> | undefined;

	private readonly _platform = new DeferredPromise<{ os: string; arch: string }>();

	resolvePlatform(): void {
		this._platform.complete({ os: 'linux', arch: 'x64' });
	}

	deferNextWebSocket(): DeferredPromise<MockWebSocket> {
		const deferred = new DeferredPromise<MockWebSocket>();
		this.nextWebSocket = deferred;
		return deferred;
	}

	protected override _spawnAgentHost(_distro: string, _script: string): cp.ChildProcess {
		const child = new MockWSLChild();
		this.children.push(child);
		return child as unknown as cp.ChildProcess;
	}

	protected override _resolvePlatform(_distro: string): Promise<{ os: string; arch: string }> {
		return this._platform.p;
	}

	protected override async _openWebSocket(url: string): Promise<WebSocket> {
		this.webSocketUrls.push(url);
		const deferred = this.nextWebSocket;
		this.nextWebSocket = undefined;
		const ws = deferred ? await deferred.p : new MockWebSocket();
		this.webSockets.push(ws);
		return ws as never;
	}
}

function createService(): TestableWSLRemoteAgentHostMainService {
	const productService: Pick<IProductService, '_serviceBrand' | 'quality' | 'serverDataFolderName' | 'commit'> = {
		_serviceBrand: undefined,
		quality: 'insider',
		serverDataFolderName: '.vscode-server',
		commit: 'a'.repeat(40),
	};
	return new TestableWSLRemoteAgentHostMainService(
		new NullLogService(),
		productService as IProductService,
		NullTelemetryService,
	);
}

suite('WSL Remote Agent Host Service', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('shares one bootstrap while allocating separate relay leases', async () => {
		const service = disposables.add(createService());
		const first = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		const second = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });

		service.resolvePlatform();
		await Promise.resolve();
		service.children[0].emitStdout('ws://127.0.0.1:3000?tkn=token\n');
		const [firstResult, secondResult] = await Promise.all([first, second]);

		assert.deepStrictEqual(
			{ spawnCount: service.children.length, sameRelay: firstResult.connectionId === secondResult.connectionId, results: [firstResult, secondResult] },
			{
				spawnCount: 1,
				sameRelay: false,
				results: [
					{
						connectionId: firstResult.connectionId,
						address: 'wsl:Ubuntu',
						distro: 'Ubuntu',
						name: 'Ubuntu',
						connectionToken: 'token',
					},
					{
						connectionId: secondResult.connectionId,
						address: 'wsl:Ubuntu',
						distro: 'Ubuntu',
						name: 'Ubuntu',
						connectionToken: 'token',
					},
				],
			},
		);
	});

	test('keeps the shared bootstrap until its final relay lease closes', async () => {
		const service = disposables.add(createService());
		const first = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		service.resolvePlatform();
		await Promise.resolve();
		service.children[0].emitStdout('ws://127.0.0.1:3000?tkn=token\n');
		const firstResult = await first;
		const secondResult = await service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });

		await service.releaseRelay(firstResult.connectionId);
		const afterFirstRelease = service.children[0].killCalls;
		await service.releaseRelay(secondResult.connectionId);

		assert.deepStrictEqual(
			{ afterFirstRelease, afterFinalRelease: service.children[0].killCalls },
			{ afterFirstRelease: 0, afterFinalRelease: 1 },
		);
	});

	for (const event of ['exit', 'error'] as const) {
		test(`child ${event} after ready closes all leases and the next connect bootstraps a fresh session`, async () => {
			const service = disposables.add(createService());
			const first = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
			service.resolvePlatform();
			await Promise.resolve();
			const child = service.children[0];
			child.emitStdout('ws://127.0.0.1:3000?tkn=token\n');
			const firstResult = await first;
			const renewed = await service.reconnect('Ubuntu', 'Ubuntu', undefined, false, firstResult.connectionId);
			const other = await service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
			const closed: string[] = [];
			const relayClosed: string[] = [];
			let changes = 0;
			disposables.add(service.onDidCloseConnection(id => closed.push(id)));
			disposables.add(service.onDidRelayClose(id => relayClosed.push(id)));
			disposables.add(service.onDidChangeConnections(() => changes++));

			if (event === 'exit') {
				child.exitCode = 1;
				child.emit('exit', 1, null);
			} else {
				child.emit('error', new Error('agent host died'));
			}
			const changesAfterFailure = changes;
			const replacement = service.reconnect('Ubuntu', 'Ubuntu', undefined, false, firstResult.connectionId);
			await Promise.resolve();
			service.children[1].emitStdout('ws://127.0.0.1:3001?tkn=new-token\n');
			const replacementResult = await replacement;
			child.emit('exit', 1, null);

			assert.deepStrictEqual({
				closed,
				relayClosed,
				changed: changesAfterFailure > 0,
				spawnCount: service.children.length,
				socketCloseCalls: service.webSockets.slice(0, 3).map(ws => ws.closeCalls),
				oldChildListeners: [child.listenerCount('exit'), child.listenerCount('error'), child.stdout.listenerCount('data'), child.stderr.listenerCount('data')],
				replacementKillCalls: service.children[1].killCalls,
				connectionToken: replacementResult.connectionToken,
			}, {
				closed: [renewed.connectionId, other.connectionId],
				relayClosed: [renewed.connectionId, other.connectionId],
				changed: true,
				spawnCount: 2,
				socketCloseCalls: [1, 1, 1],
				oldChildListeners: [0, 0, 0, 0],
				replacementKillCalls: 0,
				connectionToken: 'new-token',
			});
		});
	}

	test('WebSocket open failure on an existing session closes all leases and the next connect re-bootstraps', async () => {
		const service = disposables.add(createService());
		const first = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		service.resolvePlatform();
		await Promise.resolve();
		service.children[0].emitStdout('ws://127.0.0.1:3000?tkn=token\n');
		const firstResult = await first;
		const other = await service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		const closed: string[] = [];
		const relayClosed: string[] = [];
		disposables.add(service.onDidCloseConnection(id => closed.push(id)));
		disposables.add(service.onDidRelayClose(id => relayClosed.push(id)));
		service.webSockets[0].emit('close');

		const pendingSocket = service.deferNextWebSocket();
		const reconnect = service.reconnect('Ubuntu', 'Ubuntu', undefined, false, firstResult.connectionId);
		const rejected = assert.rejects(reconnect, /dead endpoint/);
		pendingSocket.error(new Error('dead endpoint'));
		await rejected;

		const replacement = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		await Promise.resolve();
		service.children[1].emitStdout('ws://127.0.0.1:3001?tkn=new-token\n');
		await replacement;

		assert.deepStrictEqual({
			closed,
			relayClosed,
			spawnCount: service.children.length,
			oldKillCalls: service.children[0].killCalls,
			replacementKillCalls: service.children[1].killCalls,
			urls: service.webSocketUrls,
		}, {
			closed: [firstResult.connectionId, other.connectionId],
			relayClosed: [firstResult.connectionId, firstResult.connectionId, other.connectionId],
			spawnCount: 2,
			oldKillCalls: 1,
			replacementKillCalls: 0,
			urls: ['ws://127.0.0.1:3000?tkn=token', 'ws://127.0.0.1:3000?tkn=token', 'ws://127.0.0.1:3000?tkn=token', 'ws://127.0.0.1:3001?tkn=new-token'],
		});
	});

	test('does not stop a replacement session when an old WebSocket open fails or its child exits', async () => {
		const service = disposables.add(createService());
		const first = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		service.resolvePlatform();
		await Promise.resolve();
		const oldChild = service.children[0];
		oldChild.emitStdout('ws://127.0.0.1:3000?tkn=token\n');
		const firstResult = await first;
		const pendingSocket = service.deferNextWebSocket();
		const staleReconnect = service.reconnect('Ubuntu', 'Ubuntu', undefined, false, firstResult.connectionId);
		const rejected = assert.rejects(staleReconnect, /old socket failed/);
		await service.disconnect('Ubuntu');

		const replacement = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		await Promise.resolve();
		service.children[1].emitStdout('ws://127.0.0.1:3001?tkn=token\n');
		const replacementResult = await replacement;
		const closed: string[] = [];
		disposables.add(service.onDidCloseConnection(id => closed.push(id)));
		pendingSocket.error(new Error('old socket failed'));
		await rejected;
		oldChild.emit('exit', 1, null);

		assert.deepStrictEqual({
			closed,
			replacementKillCalls: service.children[1].killCalls,
			retainedRelay: (await service.reconnect('Ubuntu', 'Ubuntu', undefined, false, replacementResult.connectionId)).address,
			spawnCount: service.children.length,
		}, {
			closed: [],
			replacementKillCalls: 0,
			retainedRelay: 'wsl:Ubuntu',
			spawnCount: 2,
		});
	});

	test('rejects a child exit immediately after printing the ready URL', async () => {
		const service = disposables.add(createService());
		const first = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		const rejected = assert.rejects(first, /exited/);
		service.resolvePlatform();
		await Promise.resolve();
		const child = service.children[0];
		child.emitStdout('ws://127.0.0.1:3000?tkn=token\n');
		child.exitCode = 1;
		child.emit('exit', 1, null);
		await rejected;

		assert.deepStrictEqual({
			socketCount: service.webSockets.length,
			childListeners: [child.listenerCount('exit'), child.listenerCount('error')],
		}, {
			socketCount: 0,
			childListeners: [0, 0],
		});
	});

	test('does not stop a replacement bootstrap when a failed relay acquisition belongs to the old session', async () => {
		const service = disposables.add(createService());
		const first = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		service.resolvePlatform();
		await Promise.resolve();
		service.children[0].emitStdout('ws://127.0.0.1:3000?tkn=token\n');
		const firstResult = await first;

		const pendingSocket = service.deferNextWebSocket();
		const staleReconnect = service.reconnect('Ubuntu', 'Ubuntu', undefined, false, firstResult.connectionId);
		await service.disconnect('Ubuntu');

		const replacement = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		await Promise.resolve();
		service.children[1].emitStdout('ws://127.0.0.1:3001?tkn=token\n');
		const replacementResult = await replacement;

		pendingSocket.complete(new MockWebSocket());
		await assert.rejects(staleReconnect, /session.*closed while acquiring a relay/);

		assert.deepStrictEqual(
			{ replacementConnectionId: replacementResult.connectionId, replacementKillCalls: service.children[1].killCalls },
			{ replacementConnectionId: replacementResult.connectionId, replacementKillCalls: 0 },
		);
	});

	test('accepts initial bootstrap output after the output-idle budget', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const service = disposables.add(createService());
			const connect = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
			service.resolvePlatform();
			await Promise.resolve();

			const child = service.children[0];
			await timeout(60_001);
			child.emitStdout('ws://127.0.0.1:3000?tkn=token\n');

			const result = await connect;
			assert.deepStrictEqual(
				{ distro: result.distro, address: result.address, connectionToken: result.connectionToken },
				{ distro: 'Ubuntu', address: 'wsl:Ubuntu', connectionToken: 'token' },
			);
		});
	});

	test('fails a silent bootstrap after the initial-output startup budget', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const service = disposables.add(createService());
			const rejected = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' }).then<IWSLConnectResult | Error, Error>(
				result => result,
				error => error instanceof Error ? error : new Error(String(error)),
			);
			service.resolvePlatform();
			await Promise.resolve();

			await timeout(180_001);
			const result = await rejected;

			assert.ok(result instanceof Error);
			assert.match(result.message, /180000ms startup budget/);
		});
	});

	test('fails after output goes quiet for the output-idle budget', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const service = disposables.add(createService());
			const rejected = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' }).then<IWSLConnectResult | Error, Error>(
				result => result,
				error => error instanceof Error ? error : new Error(String(error)),
			);
			service.resolvePlatform();
			await Promise.resolve();

			service.children[0].emitStdout('Downloading server 50%\n');
			await timeout(60_001);
			const result = await rejected;

			assert.ok(result instanceof Error);
			assert.match(result.message, /60000ms output-idle budget after output started/);
		});
	});

	test('reports redacted, throttled server download progress', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const service = disposables.add(createService());
			const progress: IWSLConnectProgress[] = [];
			disposables.add(service.onDidReportConnectProgress(update => progress.push(update)));
			const connect = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
			service.resolvePlatform();
			await Promise.resolve();

			const child = service.children[0];
			child.emitStdout('bootstrap shell noise\n');
			for (const percentage of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
				child.emitStdout(`Downloading server: ${percentage}/100 (${percentage}%) tkn=bootstrap-token\n`);
			}
			await timeout(250);
			child.emitStdout('Downloading server: 99/100 (99%) tkn=bootstrap-token\n');
			child.emitStdout('ws://127.0.0.1:3000?tkn=token\n');
			await connect;

			assert.deepStrictEqual({
				downloadMessages: progress.filter(update => update.message.startsWith('Downloading server')).map(update => update.message),
				hasNoise: progress.some(update => update.message === 'bootstrap shell noise'),
				hasToken: progress.some(update => update.message.includes('bootstrap-token') || update.message.includes('tkn=token')),
			}, {
				downloadMessages: ['Downloading server (10%)', 'Downloading server (100%)', 'Downloading server (99%)'],
				hasNoise: false,
				hasToken: false,
			});
		});
	});
});
