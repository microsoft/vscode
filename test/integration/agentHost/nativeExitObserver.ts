/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'assert';
import { AsyncLocalStorage } from 'node:async_hooks';
import childProcess, { ChildProcess } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { basename, normalize } from 'node:path';

export interface INativeExitRecord {
	readonly timestamp: string;
	readonly event: 'spawn' | 'exit' | 'close' | 'pipeClose' | 'stdoutEnd' | 'killRequested' | 'stopRequested' | 'forceStopRequested' | 'processError' | 'pipeError' | 'observerReady';
	readonly hostPid: number;
	readonly nativePid?: number;
	readonly clientInstance: number;
	readonly processInstance: number;
	readonly exitCode?: number | null;
	readonly signal?: string | number | null;
	readonly pipe?: 'stdin' | 'stdout' | 'stderr';
	readonly stopRequested?: boolean;
	readonly killRequested?: boolean;
	readonly unexpected?: boolean;
	readonly nodeVersion?: string;
	readonly electronVersion?: string;
	readonly hostSha256?: string;
	readonly nativeSha256?: string;
	readonly sdkVersion?: string;
	readonly targetCase?: boolean;
	readonly testPid?: number;
	readonly testNodeVersion?: string;
	readonly testElectronVersion?: string;
	readonly testSha256?: string;
}

export function validateNativeExitRecord(value: unknown): asserts value is INativeExitRecord {
	assert.ok(value !== null && typeof value === 'object');
	const record: Record<string, unknown> = Object.fromEntries(Object.entries(value));
	assert.ok(Object.keys(record).every(key => ['timestamp', 'event', 'hostPid', 'nativePid', 'clientInstance', 'processInstance', 'exitCode', 'signal', 'pipe', 'stopRequested', 'killRequested', 'unexpected', 'nodeVersion', 'electronVersion', 'hostSha256', 'nativeSha256', 'sdkVersion', 'targetCase', 'testPid', 'testNodeVersion', 'testElectronVersion', 'testSha256'].includes(key)));
	assert.equal(typeof record.timestamp, 'string');
	assert.match(String(record.timestamp), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
	assert.ok(['spawn', 'exit', 'close', 'pipeClose', 'stdoutEnd', 'killRequested', 'stopRequested', 'forceStopRequested', 'processError', 'pipeError', 'observerReady'].includes(String(record.event)));
	for (const key of ['hostPid', 'nativePid', 'clientInstance', 'processInstance', 'testPid']) {
		if (!['nativePid', 'testPid'].includes(key) || record[key] !== undefined) {
			assert.ok(typeof record[key] === 'number' && Number.isSafeInteger(record[key]) && record[key] >= 0);
		}
	}
	if (record.exitCode !== undefined && record.exitCode !== null) {
		assert.ok(typeof record.exitCode === 'number' && Number.isSafeInteger(record.exitCode));
	}
	if (record.signal !== undefined && record.signal !== null) {
		if (typeof record.signal === 'number') {
			assert.ok(Number.isSafeInteger(record.signal) && record.signal >= 0 && record.signal <= 64);
		} else {
			assert.equal(typeof record.signal, 'string');
			assert.match(String(record.signal), /^SIG[A-Z0-9]{1,12}$/);
		}
	}
	if (record.pipe !== undefined) {
		assert.ok(['stdin', 'stdout', 'stderr'].includes(String(record.pipe)));
	}
	for (const key of ['stopRequested', 'killRequested', 'unexpected', 'targetCase']) {
		if (record[key] !== undefined) {
			assert.equal(typeof record[key], 'boolean');
		}
		for (const key of ['nodeVersion', 'electronVersion', 'sdkVersion', 'testNodeVersion', 'testElectronVersion']) {
			if (record[key] !== undefined) {
				assert.equal(typeof record[key], 'string');
				assert.match(String(record[key]), key === 'sdkVersion' ? /^\d+\.\d+\.\d+-preview\.\d+$/ : /^\d+\.\d+\.\d+$/);
			}
		}
		for (const key of ['hostSha256', 'nativeSha256', 'testSha256']) {
			if (record[key] !== undefined) {
				assert.equal(typeof record[key], 'string');
				assert.match(String(record[key]), /^[a-f0-9]{64}$/);
			}
		}
	}
}

export interface INativeClientLifecycle {
	start(): Promise<void>;
	stop(): Promise<Error[]>;
	forceStop(): Promise<void>;
}

interface ITrackedProcess {
	readonly child: ChildProcess;
	readonly clientInstance: number;
	readonly processInstance: number;
	stopRequested: boolean;
	killRequested: boolean;
}

export class NativeExitObserver {
	private readonly store = new DisposableStack();
	private readonly scope = new AsyncLocalStorage<number>();
	private readonly instances = new WeakMap<object, number>();
	private readonly children = new Map<number, ITrackedProcess>();
	private nextClient = 0;
	private nextProcess = 0;

	constructor(
		private readonly write: (record: INativeExitRecord) => void,
		private readonly runtimePath: string,
	) { }

	private emit(event: INativeExitRecord['event'], tracked?: ITrackedProcess, extra: Partial<INativeExitRecord> = {}): void {
		const record: INativeExitRecord = {
			timestamp: new Date().toISOString(), event, hostPid: process.pid,
			clientInstance: tracked?.clientInstance ?? 0, processInstance: tracked?.processInstance ?? 0,
			...(tracked ? { nativePid: tracked.child.pid, stopRequested: tracked.stopRequested, killRequested: tracked.killRequested } : {}),
			...extra,
		};
		validateNativeExitRecord(record);
		this.write(record);
	}

	private instance(client: object): number {
		let instance = this.instances.get(client);
		if (instance === undefined) {
			instance = ++this.nextClient;
			this.instances.set(client, instance);
		}
		return instance;
	}

	observeChild(child: ChildProcess, clientInstance: number): void {
		const tracked: ITrackedProcess = { child, clientInstance, processInstance: ++this.nextProcess, stopRequested: false, killRequested: false };
		const lifetime = this.store.use(new DisposableStack());
		this.children.set(clientInstance, tracked);
		let exitObserved = false;
		const onExit = (exitCode: number | null, signal: NodeJS.Signals | null) => {
			if (!exitObserved) {
				exitObserved = true;
				this.emit('exit', tracked, { exitCode, signal, unexpected: !tracked.stopRequested && !tracked.killRequested });
			}
		};
		child.on('exit', onExit);
		lifetime.defer(() => child.removeListener('exit', onExit));
		const onClose = (exitCode: number | null, signal: NodeJS.Signals | null) => {
			this.emit('close', tracked, { exitCode, signal });
			if (this.children.get(clientInstance) === tracked) {
				this.children.delete(clientInstance);
			}
			lifetime.dispose();
		};
		child.on('close', onClose);
		lifetime.defer(() => child.removeListener('close', onClose));
		const onError = () => this.emit('processError', tracked);
		child.on('error', onError);
		lifetime.defer(() => child.removeListener('error', onError));
		for (const [pipe, stream] of [['stdin', child.stdin], ['stdout', child.stdout], ['stderr', child.stderr]] as const) {
			if (stream) {
				const close = () => this.emit('pipeClose', tracked, { pipe });
				const error = () => this.emit('pipeError', tracked, { pipe });
				stream.on('close', close);
				stream.on('error', error);
				lifetime.defer(() => { stream.removeListener('close', close); stream.removeListener('error', error); });
			}
		}
		if (child.stdout) {
			const end = () => this.emit('stdoutEnd', tracked);
			child.stdout.on('end', end);
			lifetime.defer(() => child.stdout?.removeListener('end', end));
		}
		const originalKill = child.kill;
		const observer = this;
		child.kill = function (signal) {
			tracked.killRequested = true;
			observer.emit('killRequested', tracked, { signal: signal ?? 'SIGTERM' });
			return originalKill.call(this, signal);
		};
		lifetime.defer(() => { child.kill = originalKill; });
		this.emit('spawn', tracked);
		if (child.exitCode !== null || child.signalCode !== null) {
			onExit(child.exitCode, child.signalCode);
		}
	}

	install(prototype: INativeClientLifecycle): void {
		const originalSpawn = childProcess.spawn;
		const observer = this;
		const spawn = new Proxy(originalSpawn, {
			apply(target, receiver, args) {
				const child: unknown = Reflect.apply(target, receiver, args);
				const command: unknown = args[0];
				if (typeof command === 'string' && observer.matchesRuntime(command)) {
					assert.ok(child instanceof ChildProcess);
					observer.observeChild(child, observer.scope.getStore() ?? 0);
				}
				return child;
			},
		});
		childProcess.spawn = spawn;
		syncBuiltinESMExports();
		this.store.defer(() => {
			if (childProcess.spawn === spawn) {
				childProcess.spawn = originalSpawn;
				syncBuiltinESMExports();
			}
		});
		const start = prototype.start;
		prototype.start = function () {
			return observer.scope.run(observer.instance(this), () => start.call(this));
		};
		this.store.defer(() => { prototype.start = start; });
		const stop = prototype.stop;
		prototype.stop = function () { observer.markStop(this, 'stopRequested'); return stop.call(this); };
		this.store.defer(() => { prototype.stop = stop; });
		const forceStop = prototype.forceStop;
		prototype.forceStop = function () { observer.markStop(this, 'forceStopRequested'); return forceStop.call(this); };
		this.store.defer(() => { prototype.forceStop = forceStop; });
		this.emit('observerReady', undefined, {
			nodeVersion: process.versions.node,
			...(process.versions.electron ? { electronVersion: process.versions.electron } : {}),
		});
	}

	private markStop(client: object, event: 'stopRequested' | 'forceStopRequested'): void {
		const clientInstance = this.instance(client);
		const tracked = this.children.get(clientInstance);
		if (tracked) {
			tracked.stopRequested = true;
		}
		this.emit(event, tracked, { clientInstance });
	}

	matchesRuntime(command: string): boolean {
		const name = basename(command).toLowerCase();
		return (name === 'copilot-runtime.exe' || name === 'copilot-runtime')
			&& normalize(command).toLowerCase() === normalize(this.runtimePath).toLowerCase();
	}

	dispose(): void {
		this.store.dispose();
		this.children.clear();
		this.scope.disable();
	}
}
