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
import type { IWSLConnectResult } from '../../common/wslRemoteAgentHost.js';
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

class MockWebSocket {
	on(_event: string, _listener: (...args: never[]) => void): this {
		return this;
	}

	close(): void {
	}
}

/**
 * In-process WSL service double that controls platform detection, process
 * output, and WebSocket creation without spawning WSL or loading `ws`.
 */
class TestableWSLRemoteAgentHostMainService extends WSLRemoteAgentHostMainService {
	readonly children: MockWSLChild[] = [];

	private readonly _platform = new DeferredPromise<{ os: string; arch: string }>();

	resolvePlatform(): void {
		this._platform.complete({ os: 'linux', arch: 'x64' });
	}

	protected override _spawnAgentHost(_distro: string, _script: string): cp.ChildProcess {
		const child = new MockWSLChild();
		this.children.push(child);
		return child as unknown as cp.ChildProcess;
	}

	protected override _resolvePlatform(_distro: string): Promise<{ os: string; arch: string }> {
		return this._platform.p;
	}

	protected override async _openWebSocket(_url: string): Promise<WebSocket> {
		return new MockWebSocket() as never;
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

	test('deduplicates simultaneous connects to one distro', async () => {
		const service = disposables.add(createService());
		const first = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		const second = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });

		assert.strictEqual(first, second);

		service.resolvePlatform();
		await Promise.resolve();
		service.children[0].emitStdout('ws://127.0.0.1:3000?tkn=token\n');
		const [firstResult, secondResult] = await Promise.all([first, second]);

		assert.deepStrictEqual(
			{ spawnCount: service.children.length, sameResult: firstResult === secondResult, results: [firstResult, secondResult] },
			{
				spawnCount: 1,
				sameResult: true,
				results: [
					{
						connectionId: firstResult.connectionId,
						address: 'wsl:Ubuntu',
						distro: 'Ubuntu',
						name: 'Ubuntu',
						connectionToken: 'token',
					},
					{
						connectionId: firstResult.connectionId,
						address: 'wsl:Ubuntu',
						distro: 'Ubuntu',
						name: 'Ubuntu',
						connectionToken: 'token',
					},
				],
			},
		);
	});

	test('keeps a chatty bootstrap alive past the output-idle timeout', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const service = disposables.add(createService());
			const connect = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
			service.resolvePlatform();
			await Promise.resolve();

			const child = service.children[0];
			await timeout(59_000);
			child.emitStdout('Downloading server 50%\n');
			await timeout(59_000);
			child.emitStdout('ws://127.0.0.1:3000?tkn=token\n');

			const result = await connect;
			assert.deepStrictEqual(
				{ distro: result.distro, address: result.address, connectionToken: result.connectionToken },
				{ distro: 'Ubuntu', address: 'wsl:Ubuntu', connectionToken: 'token' },
			);
		});
	});

	test('fails a silent bootstrap after the output-idle timeout', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const service = disposables.add(createService());
			const rejected = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' }).then<IWSLConnectResult | Error, Error>(
				result => result,
				error => error instanceof Error ? error : new Error(String(error)),
			);
			service.resolvePlatform();
			await Promise.resolve();

			await timeout(60_001);
			const result = await rejected;

			assert.ok(result instanceof Error);
			assert.match(result.message, /no output for 60000ms/);
		});
	});
});
