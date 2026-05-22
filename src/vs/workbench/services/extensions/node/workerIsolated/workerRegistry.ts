/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as worker_threads from 'worker_threads';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IWorkerLike } from '../../common/workerIsolated/workerProtocol.js';
import { WorkerConnection, WorkerConnectionOptions } from './workerConnection.js';

/**
 * Factory function for creating worker-like objects.
 * Defaults to creating real `worker_threads.Worker` instances.
 */
export type WorkerFactory = (scriptPath: string) => IWorkerLike;

function defaultWorkerFactory(scriptPath: string): IWorkerLike {
	return new worker_threads.Worker(scriptPath);
}

/**
 * Manages the lifecycle of all worker threads within the supervisor.
 */
export class WorkerRegistry extends Disposable {

	private readonly _workers = new Map<string, { connection: WorkerConnection; worker: IWorkerLike }>();
	private readonly _workerFactory: WorkerFactory;

	private readonly _onDidWorkerExit = this._register(new Emitter<{ extensionId: ExtensionIdentifier; code: number }>());
	readonly onDidWorkerExit: Event<{ extensionId: ExtensionIdentifier; code: number }> = this._onDidWorkerExit.event;

	constructor(workerFactory?: WorkerFactory) {
		super();
		this._workerFactory = workerFactory ?? defaultWorkerFactory;
	}

	get workers(): ReadonlyMap<string, WorkerConnection> {
		const result = new Map<string, WorkerConnection>();
		for (const [key, value] of this._workers) {
			result.set(key, value.connection);
		}
		return result;
	}

	/**
	 * Create a new worker thread for the given extension.
	 */
	createWorker(extensionId: ExtensionIdentifier, scriptPath: string, options?: WorkerConnectionOptions): WorkerConnection {
		const key = ExtensionIdentifier.toKey(extensionId);

		if (this._workers.has(key)) {
			throw new Error(`Worker already exists for extension '${extensionId.value}'`);
		}

		const worker = this._workerFactory(scriptPath);
		const connection = new WorkerConnection(worker, options);

		this._workers.set(key, { connection, worker });

		// Track worker exit — use _register to ensure disposal
		this._register(connection.onDidExit(({ code }) => {
			this._workers.delete(key);
			this._onDidWorkerExit.fire({ extensionId, code });
		}));

		return connection;
	}

	/**
	 * Get the connection for a given extension, if it exists.
	 */
	getWorker(extensionId: ExtensionIdentifier): WorkerConnection | undefined {
		const key = ExtensionIdentifier.toKey(extensionId);
		return this._workers.get(key)?.connection;
	}

	/**
	 * Terminate the worker for a given extension.
	 */
	async terminateWorker(extensionId: ExtensionIdentifier): Promise<void> {
		const key = ExtensionIdentifier.toKey(extensionId);
		const entry = this._workers.get(key);
		if (!entry) {
			return;
		}
		await entry.connection.terminate();
		entry.connection.dispose();
		this._workers.delete(key);
	}

	/**
	 * Terminate all workers.
	 */
	async terminateAll(): Promise<void> {
		const promises: Promise<void>[] = [];
		for (const [, entry] of this._workers) {
			promises.push(entry.connection.terminate().then(() => {
				entry.connection.dispose();
			}));
		}
		this._workers.clear();
		await Promise.all(promises);
	}

	override dispose(): void {
		// Synchronously clean up — terminate is best-effort during dispose
		for (const [, entry] of this._workers) {
			entry.worker.terminate();
			entry.connection.dispose();
		}
		this._workers.clear();
		super.dispose();
	}
}
