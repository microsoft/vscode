/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as cp from 'child_process';
import { EventEmitter } from 'events';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { newWriteableBufferStream, VSBuffer } from '../../../../base/common/buffer.js';
import type { IRequestContext } from '../../../../base/parts/request/common/request.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IProductService } from '../../../product/common/productService.js';
import type { IRequestService } from '../../../request/common/request.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import type { IWSLConnectProgress, IWSLConnectResult } from '../../common/wslRemoteAgentHost.js';
import { WSLRemoteAgentHostMainService } from '../../node/wslRemoteAgentHostService.js';
import type { IRunWslCommandResult, IWSLDistroProbe } from '../../node/wslRemoteAgentHostHelpers.js';
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
 * In-process WSL service double that controls the distro probe, CLI
 * download and install, process output, and WebSocket creation without
 * spawning WSL, using the network, or loading `ws`.
 */
class TestableWSLRemoteAgentHostMainService extends WSLRemoteAgentHostMainService {
	readonly children: MockWSLChild[] = [];
	readonly webSockets: MockWebSocket[] = [];
	readonly webSocketUrls: string[] = [];
	readonly cliDownloads: string[] = [];
	readonly cliInstalls: { distro: string; archive: string }[] = [];
	private nextWebSocket: DeferredPromise<MockWebSocket> | undefined;

	private readonly _probe = new DeferredPromise<IWSLDistroProbe>();
	readonly terminations: string[] = [];
	readonly terminationResult = new DeferredPromise<IRunWslCommandResult>();

	protected override _runWslTerminate(distro: string): Promise<IRunWslCommandResult> {
		this.terminations.push(distro);
		return this.terminationResult.p;
	}

	/** Completes the distro probe; by default the installed CLI runs on glibc x64. */
	resolvePlatform(probe: Partial<IWSLDistroProbe> = {}): void {
		this._probe.complete({ unameS: 'Linux', unameM: 'x86_64', libc: '', cliRunnable: true, missingLibraries: [], hasApk: false, ...probe });
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

	protected override _probeDistro(_distro: string, _cliBin: string): Promise<IWSLDistroProbe> {
		return this._probe.p;
	}

	protected override async _downloadCLI(url: string): Promise<VSBuffer> {
		this.cliDownloads.push(url);
		return VSBuffer.fromString(`archive from ${url}`);
	}

	/** Downloads through the request service instead of the stub above. */
	downloadCLIWithRequestService(url: string): Promise<VSBuffer> {
		return super._downloadCLI(url);
	}

	protected override async _installCLI(distro: string, archive: VSBuffer): Promise<void> {
		this.cliInstalls.push({ distro, archive: archive.toString() });
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

function createService(requestService: IRequestService = new class extends mock<IRequestService>() { }()): TestableWSLRemoteAgentHostMainService {
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
		requestService,
	);
}

suite('WSL Remote Agent Host Service', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('termination lets a pending connect start its host, then stops it, and connects during termination start a new host afterwards', async () => {
		const service = disposables.add(createService());
		const pending = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		const termination = service.terminateDistro('Ubuntu');
		service.resolvePlatform();
		await Promise.resolve();
		service.children[0].emitStdout('ws://127.0.0.1:3000?tkn=first\n');
		await assert.rejects(pending, /closed while acquiring a relay/);
		await timeout(0);
		const stopped = { terminations: [...service.terminations], killed: service.children[0].killCalls };
		const duringTermination = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		await timeout(0);
		const spawnedDuringTermination = service.children.length;
		service.terminationResult.complete({ exitCode: 0, stdout: '', stderr: '' });
		await termination;
		await timeout(0);
		service.children[1].emitStdout('ws://127.0.0.1:3001?tkn=second\n');
		const restarted = await duringTermination;
		assert.deepStrictEqual({ stopped, spawnedDuringTermination, spawned: service.children.length, token: restarted.connectionToken }, {
			stopped: { terminations: ['Ubuntu'], killed: 1 },
			spawnedDuringTermination: 1,
			spawned: 2,
			token: 'second',
		});
	});

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

	test('downloads the CLI for the distro\'s platform on this computer only when the installed one does not run', async () => {
		const connect = async (probe: Partial<IWSLDistroProbe>) => {
			const service = disposables.add(createService());
			const result = service.connect({ distro: 'Alpine', name: 'Alpine' });
			service.resolvePlatform(probe);
			await timeout(0);
			service.children[0].emitStdout('ws://127.0.0.1:3000?tkn=token\n');
			await result;
			return { downloads: service.cliDownloads, installs: service.cliInstalls };
		};
		const url = (artifact: string) => `https://update.code.visualstudio.com/commit:${'a'.repeat(40)}/${artifact}/insider`;
		assert.deepStrictEqual({
			runs: await connect({ libc: 'musl' }),
			musl: await connect({ libc: 'musl', cliRunnable: false }),
			glibcArm64: await connect({ unameM: 'aarch64', cliRunnable: false }),
		}, {
			runs: { downloads: [], installs: [] },
			musl: { downloads: [url('cli-alpine-x64')], installs: [{ distro: 'Alpine', archive: `archive from ${url('cli-alpine-x64')}` }] },
			glibcArm64: { downloads: [url('cli-linux-arm64')], installs: [{ distro: 'Alpine', archive: `archive from ${url('cli-linux-arm64')}` }] },
		});
	});

	test('reports missing musl libraries before downloading or launching anything, with the apk command only where apk exists', async () => {
		const connect = async (hasApk: boolean) => {
			const service = disposables.add(createService());
			const result = service.connect({ distro: 'Alpine', name: 'Alpine' });
			service.resolvePlatform({ libc: 'musl', cliRunnable: false, missingLibraries: ['libstdc++.so.6', 'libgcc_s.so.1'], hasApk });
			const message = await result.then(() => '', (error: Error) => error.message);
			return { names: message.includes('without libstdc++.so.6, libgcc_s.so.1'), apkCommand: message.includes('apk add --update-cache libstdc++'), downloads: service.cliDownloads.length, spawned: service.children.length };
		};
		assert.deepStrictEqual({ apk: await connect(true), noApk: await connect(false) }, {
			apk: { names: true, apkCommand: true, downloads: 0, spawned: 0 },
			noApk: { names: true, apkCommand: false, downloads: 0, spawned: 0 },
		});
	});

	test('closes the CLI download response when its body stalls after the headers', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let responseDestroyed = false;
		const response = { statusCode: 200, headers: {}, destroy: () => { responseDestroyed = true; } };
		const service = disposables.add(createService(new class extends mock<IRequestService>() {
			override async request(): Promise<IRequestContext> {
				return { res: response, stream: newWriteableBufferStream() };
			}
		}()));
		const rejected = assert.rejects(service.downloadCLIWithRequestService('https://update.code.visualstudio.com/latest/cli-alpine-x64/insider'), /timed out after 300s/);
		await timeout(5 * 60_000);
		await rejected;
		assert.strictEqual(responseDestroyed, true);
	}));

	for (const exitTiming of ['before session creation', 'during relay acquisition', 'after relay acquisition'] as const) {
		test(`keeps the detached host session when the launcher exits successfully ${exitTiming}`, async () => {
			const service = disposables.add(createService());
			const closed: string[] = [];
			const relayClosed: string[] = [];
			disposables.add(service.onDidCloseConnection(id => closed.push(id)));
			disposables.add(service.onDidRelayClose(id => relayClosed.push(id)));
			const pendingSocket = exitTiming === 'during relay acquisition' ? service.deferNextWebSocket() : undefined;
			const first = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
			service.resolvePlatform();
			await Promise.resolve();
			const child = service.children[0];
			child.emitStdout('ws://127.0.0.1:3000?tkn=token\n');
			if (exitTiming === 'during relay acquisition') {
				await timeout(0);
			} else if (exitTiming === 'after relay acquisition') {
				await first;
			}

			child.exitCode = 0;
			child.emit('exit', 0, null);
			pendingSocket?.complete(new MockWebSocket());
			const firstResult = await first;
			assert.deepStrictEqual({ closed, relayClosed }, { closed: [], relayClosed: [] });

			const other = await service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
			const renewed = await service.reconnect('Ubuntu', 'Ubuntu', undefined, false, firstResult.connectionId);
			await service.releaseRelay(other.connectionId);
			await service.releaseRelay(renewed.connectionId);

			assert.deepStrictEqual({
				spawnCount: service.children.length,
				killCalls: child.killCalls,
				urls: service.webSocketUrls,
				socketCloseCalls: service.webSockets.map(ws => ws.closeCalls),
				closed,
				relayClosed,
			}, {
				spawnCount: 1,
				killCalls: 0,
				urls: Array(3).fill('ws://127.0.0.1:3000?tkn=token'),
				socketCloseCalls: [1, 1, 1],
				closed: [other.connectionId, renewed.connectionId],
				relayClosed: [other.connectionId, renewed.connectionId],
			});
		});
	}

	for (const event of ['exit', 'signal', 'error'] as const) {
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
			} else if (event === 'signal') {
				child.signalCode = 'SIGTERM';
				child.emit('exit', null, 'SIGTERM');
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

	for (const exitCode of [0, 1]) {
		test(`rejects a launcher exit with code ${exitCode} before printing the ready URL`, async () => {
			const service = disposables.add(createService());
			const connect = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
			const rejected = assert.rejects(connect, /exited/);
			service.resolvePlatform();
			await Promise.resolve();
			const child = service.children[0];
			child.emitStdout('Preparing agent host\n');
			child.exitCode = exitCode;
			child.emit('exit', exitCode, null);
			await rejected;

			assert.deepStrictEqual({
				socketCount: service.webSockets.length,
				childListeners: [child.listenerCount('exit'), child.listenerCount('error')],
			}, {
				socketCount: 0,
				childListeners: [0, 0],
			});
		});
	}

	test('rejects a failed launcher exit immediately after printing the ready URL', async () => {
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
