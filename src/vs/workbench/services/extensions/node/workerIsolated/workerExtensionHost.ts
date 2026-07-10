/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IExtensionDescription, ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { Proxied } from '../../common/proxyIdentifier.js';
import { RPCProtocol } from '../../common/rpcProtocol.js';
import { MessagePortProtocol } from '../../common/workerIsolated/messagePortProtocol.js';
import { IWorkerLike } from '../../common/workerIsolated/workerProtocol.js';
import {
	IWorkerActivationData,
	IWorkerExtHostSupervisorShape,
	IWorkerExtHostWorkerShape,
	WorkerClient,
	WorkerHost,
	getWorkerIdentifierCount,
	getWorkerStringIdentifierForProxy,
} from '../../common/workerIsolated/workerExtHostProtocol.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { FileAccess } from '../../../../../base/common/network.js';

/**
 * Factory function for creating worker-like objects.
 * In production, creates a real `worker_threads.Worker`.
 * In tests, returns a fake.
 */
export type WorkerFactory = (scriptPath: string) => IWorkerLike;

/**
 * Result of activating an extension in a worker, returned to the API layer
 * which wraps it in an ActivatedExtension.
 */
export interface IWorkerActivationResult {
	/** Whether the extension returned exports from activate() */
	readonly hasExports: boolean;
	/** Time spent spawning the worker + loading the extension module (ms) */
	readonly codeLoadingTime: number;
	/** Time spent calling activate() synchronously (ms) */
	readonly activateCallTime: number;
	/** Time spent awaiting the activate() promise (ms) */
	readonly activateResolveTime: number;
	/** Calls deactivate() on the worker */
	deactivate(): void;
	/** Disposable that cleans up the worker and host */
	readonly disposable: IDisposable;
}

/**
 * Factory that creates a supervisor host object for an isolated worker.
 * Called during activation with the worker proxy so the host can call back
 * into the worker (e.g. to invoke commands).
 *
 * The returned host must implement {@link IWorkerExtHostSupervisorShape} and
 * be {@link IDisposable}. It is registered on the RPCProtocol and disposed
 * when the worker is torn down.
 */
export type WorkerSupervisorHostFactory = (workerProxy: Proxied<IWorkerExtHostWorkerShape>) => IWorkerExtHostSupervisorShape & IDisposable;

/**
 * Manages a single extension running in a worker thread.
 *
 * Owns the full worker lifecycle: spawn, RPCProtocol setup, activation,
 * exit detection, and termination. Communication uses {@link RPCProtocol}
 * over a {@link MessagePortProtocol} bridge with two identifier hierarchies:
 * - {@link WorkerHost} — supervisor-side host objects the worker calls into
 * - {@link WorkerClient} — worker-side objects the supervisor calls into
 */
export class WorkerExtensionHost extends Disposable {

	private readonly _onDidExit = this._register(new Emitter<{ extensionId: ExtensionIdentifier; code: number }>());
	readonly onDidExit: Event<{ extensionId: ExtensionIdentifier; code: number }> = this._onDidExit.event;

	private _workerProxy: Proxied<IWorkerExtHostWorkerShape> | undefined;

	constructor(
		private readonly _workerFactory: WorkerFactory,
		private readonly _logService: ILogService,
	) {
		super();
	}

	/**
	 * Activate an extension in a new worker thread.
	 *
	 * @param supervisorHostFactory Creates the host object that will be
	 *   registered as {@link WorkerHost.Supervisor} on the RPCProtocol.
	 *   The host is created with DI in the API layer and knows how to
	 *   delegate `$` calls to the real ExtHost services.
	 */
	async activate(
		extensionDescription: IExtensionDescription,
		storagePath: string | undefined,
		globalStoragePath: string,
		logPath: string,
		supervisorHostFactory: WorkerSupervisorHostFactory,
	): Promise<IWorkerActivationResult> {
		const codeLoadingStart = Date.now();

		const bootstrapUri = FileAccess.asFileUri('vs/workbench/api/node/extensionWorkerBootstrap.js');
		const bootstrapPath = bootstrapUri.fsPath;

		this._logService.info(`WorkerExtensionHost: spawning worker for '${extensionDescription.identifier.value}'`);

		// Spawn the worker
		const worker = this._workerFactory(bootstrapPath);

		const extensionDisposables = this._register(new DisposableStore());

		// Ensure worker is terminated on disposal
		extensionDisposables.add(toDisposable(() => {
			worker.terminate();
			this._workerProxy = undefined;
		}));

		// Bridge MessagePort → RPCProtocol
		const portProtocol = extensionDisposables.add(new MessagePortProtocol(worker));
		const rpcProtocol = extensionDisposables.add(new RPCProtocol(portProtocol, {
			identifierCount: getWorkerIdentifierCount(),
			getStringIdentifier: getWorkerStringIdentifierForProxy,
		}));

		// Get typed proxy for calling into the worker (WorkerClient)
		const workerProxy: Proxied<IWorkerExtHostWorkerShape> = rpcProtocol.getProxy(WorkerClient.Worker);
		this._workerProxy = workerProxy;

		// Create and register the supervisor host object
		const supervisorHost = supervisorHostFactory(workerProxy);
		extensionDisposables.add(supervisorHost);
		rpcProtocol.set(WorkerHost.Supervisor, supervisorHost);

		// Handle worker exit
		worker.on('exit', (...args: unknown[]) => {
			const code = typeof args[0] === 'number' ? args[0] : 1;
			this._logService.warn(`WorkerExtensionHost: worker for '${extensionDescription.identifier.value}' exited with code ${code}`);
			this._onDidExit.fire({ extensionId: extensionDescription.identifier, code });
		});

		// Activate the extension via RPCProtocol proxy
		const activationData: IWorkerActivationData = {
			extensionDescription,
			storagePath,
			globalStoragePath,
			logPath,
		};

		try {
			const result = await workerProxy.$activate(activationData);

			const totalTime = Date.now() - codeLoadingStart;
			const codeLoadingTime = totalTime - (result.activateCallTime ?? 0) - (result.activateResolveTime ?? 0);
			this._logService.info(`WorkerExtensionHost: extension '${extensionDescription.identifier.value}' activated successfully`);

			return {
				hasExports: result.hasExports,
				codeLoadingTime: Math.max(0, codeLoadingTime),
				activateCallTime: result.activateCallTime ?? 0,
				activateResolveTime: result.activateResolveTime ?? 0,
				deactivate: () => {
					workerProxy.$deactivate().catch((_err: unknown) => {
						this._logService.warn(`WorkerExtensionHost: error deactivating '${extensionDescription.identifier.value}'`);
					});
				},
				disposable: toDisposable(() => extensionDisposables.dispose()),
			};
		} catch (err) {
			this._logService.error(`WorkerExtensionHost: failed to activate '${extensionDescription.identifier.value}': ${err}`);
			throw err;
		}
	}

	/**
	 * Execute a command that is registered in this worker.
	 */
	executeCommand(commandId: string, args: unknown[]): Promise<unknown> {
		if (!this._workerProxy) {
			throw new Error('Worker not started');
		}
		return this._workerProxy.$invokeCommand(commandId, args);
	}
}
