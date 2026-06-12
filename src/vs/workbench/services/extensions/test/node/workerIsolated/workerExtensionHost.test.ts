/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IMessagePassingProtocol } from '../../../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Proxied } from '../../../common/proxyIdentifier.js';
import { RPCProtocol } from '../../../common/rpcProtocol.js';
import {
	IWorkerActivationData,
	IWorkerExtHostSupervisorShape,
	IWorkerExtHostWorkerShape,
	WorkerClient,
	WorkerHost,
	getWorkerIdentifierCount,
	getWorkerStringIdentifierForProxy,
} from '../../../common/workerIsolated/workerExtHostProtocol.js';
import { IWorkerLike } from '../../../common/workerIsolated/workerProtocol.js';
import { WorkerExtensionHost, WorkerSupervisorHostFactory, WorkerFactory } from '../../../node/workerIsolated/workerExtensionHost.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../../platform/extensions/common/extensions.js';
import { URI } from '../../../../../../base/common/uri.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';

function createFakeExtension(id: string, main: string = './out/extension.js'): IExtensionDescription {
	return {
		identifier: new ExtensionIdentifier(id),
		extensionLocation: URI.file(`/test/extensions/${id}`),
		name: id,
		publisher: 'test',
		version: '1.0.0',
		engines: { vscode: '*' },
		isBuiltin: false,
		isUserBuiltin: false,
		isUnderDevelopment: false,
		main,
		enabledApiProposals: undefined,
	} as IExtensionDescription;
}

/**
 * Fake worker that runs an RPCProtocol internally, just like the real
 * extensionWorkerBootstrap.ts would. The supervisor-side RPCProtocol
 * communicates with this fake via ArrayBuffer messages.
 */
class FakeExtensionWorker implements IWorkerLike {

	private readonly _supervisorListeners: ((value: unknown) => void)[] = [];
	private readonly _exitListeners: ((code: number) => void)[] = [];
	private _terminated = false;

	// In-memory protocol pair: supervisor ↔ worker
	private readonly _workerIncoming = new Emitter<VSBuffer>();
	private readonly _workerProtocol: IMessagePassingProtocol;
	private readonly _rpc: RPCProtocol;

	/** Commands registered by the fake extension */
	readonly registeredCommands = new Map<string, (...args: unknown[]) => unknown>();

	activateCalled = false;
	deactivateCalled = false;
	activateError: string | undefined;
	fakeExports: unknown = undefined;
	lastActivationData: IWorkerActivationData | undefined;

	/** Proxy to call supervisor-side (host) methods */
	readonly supervisorProxy: Proxied<IWorkerExtHostSupervisorShape>;

	constructor() {
		// Worker-side protocol: receives from supervisor, sends back to supervisor
		this._workerProtocol = {
			onMessage: this._workerIncoming.event,
			send: (msg: VSBuffer) => {
				// Deliver to supervisor asynchronously (simulates real MessagePort)
				const ab = msg.buffer.buffer.slice(msg.buffer.byteOffset, msg.buffer.byteOffset + msg.buffer.byteLength);
				Promise.resolve().then(() => {
					if (!this._terminated) {
						for (const listener of this._supervisorListeners) {
							listener(ab);
						}
					}
				});
			},
		};

		this._rpc = new RPCProtocol(this._workerProtocol, {
			identifierCount: getWorkerIdentifierCount(),
			getStringIdentifier: getWorkerStringIdentifierForProxy,
		});

		// Get supervisor proxy
		this.supervisorProxy = this._rpc.getProxy(WorkerHost.Supervisor);

		// Register worker-side handler
		this._rpc.set(WorkerClient.Worker, this._createWorkerHandler());
	}

	private _createWorkerHandler(): IWorkerExtHostWorkerShape {
		return {
			$activate: async (data: IWorkerActivationData) => {
				this.lastActivationData = data;
				this.activateCalled = true;

				if (this.activateError) {
					throw new Error(this.activateError);
				}

				// Simulate the extension registering commands
				for (const [commandId] of this.registeredCommands) {
					this.supervisorProxy.$registerCommand(commandId);
				}

				return { hasExports: this.fakeExports !== undefined, activateCallTime: 1, activateResolveTime: 2 };
			},
			$deactivate: async (): Promise<void> => {
				this.deactivateCalled = true;
			},
			$invokeCommand: async (commandId: string, args: unknown[]): Promise<unknown> => {
				const handler = this.registeredCommands.get(commandId);
				if (!handler) {
					throw new Error(`Command '${commandId}' not found`);
				}
				return handler(...args);
			},
		};
	}

	// --- IWorkerLike implementation ---

	postMessage(value: unknown): void {
		if (this._terminated) {
			return;
		}
		// Supervisor sends ArrayBuffer → feed into worker's RPCProtocol
		if (value instanceof ArrayBuffer) {
			Promise.resolve().then(() => {
				if (!this._terminated) {
					this._workerIncoming.fire(VSBuffer.wrap(new Uint8Array(value)));
				}
			});
		}
	}

	on(event: string, listener: (...args: unknown[]) => void): void {
		switch (event) {
			case 'message': this._supervisorListeners.push(listener as (value: unknown) => void); break;
			case 'error': break;
			case 'exit': this._exitListeners.push(listener as (code: number) => void); break;
		}
	}

	async terminate(): Promise<number> {
		this._terminated = true;
		this._rpc.dispose();
		this._workerIncoming.dispose();
		for (const listener of this._exitListeners) {
			listener(0);
		}
		return 0;
	}

	simulateCrash(code: number): void {
		this._terminated = true;
		this._rpc.dispose();
		this._workerIncoming.dispose();
		for (const listener of this._exitListeners) {
			listener(code);
		}
	}
}

suite('WorkerExtensionHost', () => {

	let disposables: DisposableStore;
	let lastCreatedWorker: FakeExtensionWorker;
	let logService: NullLogService;

	const fakeWorkerFactory: WorkerFactory = (_scriptPath: string) => {
		const worker = new FakeExtensionWorker();
		lastCreatedWorker = worker;
		return worker;
	};

	setup(() => {
		disposables = new DisposableStore();
		logService = new NullLogService();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Creates a fake supervisor host and factory for testing.
	 * The host tracks all calls for assertions.
	 */
	function createHostFactory(): {
		factory: WorkerSupervisorHostFactory;
		registeredCommands: Set<string>;
		executedCommands: Array<{ id: string; args: unknown[] }>;
		shownMessages: Array<{ type: string; message: string }>;
	} {
		const registeredCommands = new Set<string>();
		const executedCommands: Array<{ id: string; args: unknown[] }> = [];
		const shownMessages: Array<{ type: string; message: string }> = [];

		const factory: WorkerSupervisorHostFactory = (workerProxy) => {
			const host: IWorkerExtHostSupervisorShape & IDisposable = {
				async $registerCommand(commandId: string): Promise<void> {
					registeredCommands.add(commandId);
				},
				async $unregisterCommand(commandId: string): Promise<void> {
					registeredCommands.delete(commandId);
				},
				async $executeCommand(commandId: string, args: unknown[]): Promise<unknown> {
					executedCommands.push({ id: commandId, args });
					return `executed:${commandId}`;
				},
				async $showInformationMessage(message: string): Promise<unknown> {
					shownMessages.push({ type: 'info', message });
					return undefined;
				},
				async $showWarningMessage(message: string): Promise<unknown> {
					shownMessages.push({ type: 'warning', message });
					return undefined;
				},
				async $showErrorMessage(message: string): Promise<unknown> {
					shownMessages.push({ type: 'error', message });
					return undefined;
				},
				dispose() { },
			};
			return host;
		};

		return { factory, registeredCommands, executedCommands, shownMessages };
	}

	test('activate extension in worker — basic lifecycle', async () => {
		const { factory } = createHostFactory();
		const host = disposables.add(new WorkerExtensionHost(fakeWorkerFactory, logService));
		const ext = createFakeExtension('test.basic');

		const activated = await host.activate(ext, '/tmp/storage', '/tmp/global', '/tmp/logs', factory);
		disposables.add(activated.disposable);

		assert.strictEqual(activated.hasExports, false);
		assert.ok(lastCreatedWorker.activateCalled);
	});

	test('activation data is sent to worker', async () => {
		const { factory } = createHostFactory();
		const host = disposables.add(new WorkerExtensionHost(fakeWorkerFactory, logService));
		const ext = createFakeExtension('test.data');

		const activated = await host.activate(ext, '/tmp/ws-storage', '/tmp/gs', '/tmp/logs/test', factory);
		disposables.add(activated.disposable);

		assert.ok(lastCreatedWorker.lastActivationData);
		assert.strictEqual(lastCreatedWorker.lastActivationData.storagePath, '/tmp/ws-storage');
		assert.strictEqual(lastCreatedWorker.lastActivationData.globalStoragePath, '/tmp/gs');
		assert.strictEqual(lastCreatedWorker.lastActivationData.logPath, '/tmp/logs/test');
	});

	test('command registration from worker to supervisor', async () => {
		const { factory, registeredCommands } = createHostFactory();
		const ext = createFakeExtension('test.commands');

		const worker = new FakeExtensionWorker();
		worker.registeredCommands.set('test.hello', () => 'Hello World');
		lastCreatedWorker = worker;

		const host = disposables.add(new WorkerExtensionHost(() => worker, logService));

		const activated = await host.activate(ext, undefined, '/tmp/gs', '/tmp/logs', factory);
		disposables.add(activated.disposable);

		// Give async delivery time
		await new Promise(resolve => setTimeout(resolve, 10));

		assert.ok(registeredCommands.has('test.hello'));
	});

	test('command execution from supervisor to worker', async () => {
		const { factory } = createHostFactory();
		const worker = new FakeExtensionWorker();
		worker.registeredCommands.set('test.compute', (x: unknown) => (x as number) * 2);
		lastCreatedWorker = worker;

		const host = disposables.add(new WorkerExtensionHost(() => worker, logService));
		const ext = createFakeExtension('test.exec');

		const activated = await host.activate(ext, undefined, '/tmp/gs', '/tmp/logs', factory);
		disposables.add(activated.disposable);

		const result = await host.executeCommand('test.compute', [21]);
		assert.strictEqual(result, 42);
	});

	test('activation failure is propagated', async () => {
		const { factory } = createHostFactory();
		const worker = new FakeExtensionWorker();
		worker.activateError = 'Extension failed to load: module not found';
		lastCreatedWorker = worker;

		const host = disposables.add(new WorkerExtensionHost(() => worker, logService));
		const ext = createFakeExtension('test.fail');

		await assert.rejects(
			host.activate(ext, undefined, '/tmp/gs', '/tmp/logs', factory),
			/Extension failed to load: module not found/
		);
	});

	test('deactivation calls deactivate on worker', async () => {
		const { factory } = createHostFactory();
		const worker = new FakeExtensionWorker();
		lastCreatedWorker = worker;

		const host = disposables.add(new WorkerExtensionHost(() => worker, logService));
		const ext = createFakeExtension('test.deactivate');

		const activated = await host.activate(ext, undefined, '/tmp/gs', '/tmp/logs', factory);
		disposables.add(activated.disposable);

		activated.deactivate();
		await new Promise(resolve => setTimeout(resolve, 10));

		assert.ok(worker.deactivateCalled);
	});

	test('worker crash fires onDidExit', async () => {
		const { factory } = createHostFactory();
		const worker = new FakeExtensionWorker();
		lastCreatedWorker = worker;

		const host = disposables.add(new WorkerExtensionHost(() => worker, logService));
		const ext = createFakeExtension('test.crash');

		const activated = await host.activate(ext, undefined, '/tmp/gs', '/tmp/logs', factory);
		disposables.add(activated.disposable);

		const exitPromise = new Promise<{ extensionId: ExtensionIdentifier; code: number }>(resolve => {
			disposables.add(host.onDidExit(e => resolve(e)));
		});

		worker.simulateCrash(1);

		const exitEvent = await exitPromise;
		assert.strictEqual(exitEvent.code, 1);
		assert.strictEqual(exitEvent.extensionId.value, 'test.crash');
	});

	test('exports are proxied correctly', async () => {
		const { factory } = createHostFactory();
		const worker = new FakeExtensionWorker();
		worker.fakeExports = { version: '1.0.0' };
		lastCreatedWorker = worker;

		const host = disposables.add(new WorkerExtensionHost(() => worker, logService));
		const ext = createFakeExtension('test.exports');

		const activated = await host.activate(ext, undefined, '/tmp/gs', '/tmp/logs', factory);
		disposables.add(activated.disposable);
		assert.ok(activated.hasExports, 'hasExports should be true when the extension returns exports');
	});

	test('extension with no exports', async () => {
		const { factory } = createHostFactory();
		const worker = new FakeExtensionWorker();
		worker.fakeExports = undefined;
		lastCreatedWorker = worker;

		const host = disposables.add(new WorkerExtensionHost(() => worker, logService));
		const ext = createFakeExtension('test.noexports');

		const activated = await host.activate(ext, undefined, '/tmp/gs', '/tmp/logs', factory);
		disposables.add(activated.disposable);
		assert.strictEqual(activated.hasExports, false, 'hasExports should be false when extension returns no exports');
	});

	test('activation times are recorded', async () => {
		const { factory } = createHostFactory();
		const host = disposables.add(new WorkerExtensionHost(fakeWorkerFactory, logService));
		const ext = createFakeExtension('test.times');

		const activated = await host.activate(ext, undefined, '/tmp/gs', '/tmp/logs', factory);
		disposables.add(activated.disposable);

		assert.ok(activated.codeLoadingTime >= 0, 'codeLoadingTime should be >= 0');
		assert.strictEqual(activated.activateCallTime, 1, 'activateCallTime should match worker-reported value');
		assert.strictEqual(activated.activateResolveTime, 2, 'activateResolveTime should match worker-reported value');
	});

	test('commands are cleaned up on dispose', async () => {
		const { factory, registeredCommands } = createHostFactory();
		const worker = new FakeExtensionWorker();
		worker.registeredCommands.set('test.cleanup', () => 'ok');
		lastCreatedWorker = worker;

		const host = disposables.add(new WorkerExtensionHost(() => worker, logService));
		const ext = createFakeExtension('test.cleanup');

		const activated = await host.activate(ext, undefined, '/tmp/gs', '/tmp/logs', factory);

		await new Promise(resolve => setTimeout(resolve, 10));
		assert.ok(registeredCommands.has('test.cleanup'));

		// Disposing the activated extension disposes the host, which cleans up commands
		activated.disposable.dispose();
	});
});
