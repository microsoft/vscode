/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as worker_threads from 'worker_threads';
import nodeModule from 'node:module';
import { URI } from '../../../base/common/uri.js';
import type * as vscode from 'vscode';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';
import { RPCProtocol } from '../../services/extensions/common/rpcProtocol.js';
import { MessagePortProtocol } from '../../services/extensions/common/workerIsolated/messagePortProtocol.js';
import {
	IWorkerActivateResult,
	IWorkerActivationData,
	IWorkerExtHostSupervisorShape,
	IWorkerExtHostWorkerShape,
	WorkerClient,
	WorkerHost,
	getWorkerIdentifierCount,
	getWorkerStringIdentifierForProxy,
} from '../../services/extensions/common/workerIsolated/workerExtHostProtocol.js';

const nodeRequire = nodeModule.createRequire(import.meta.url);

/**
 * Creates a minimal proxied `vscode` API namespace for use inside a worker.
 *
 * API calls are routed to the supervisor via the typed {@link IWorkerExtHostSupervisorShape}
 * proxy obtained from RPCProtocol — every `$`-prefixed method is automatically
 * serialized as a request over the binary wire format.
 */
function createWorkerVscodeApi(supervisorProxy: Proxied<IWorkerExtHostSupervisorShape>, commandHandlers: Map<string, (...args: unknown[]) => unknown>): typeof vscode {
	const subscriptions: { dispose(): void }[] = [];

	const commands = {
		registerCommand(command: string, callback: (...args: unknown[]) => unknown, thisArg?: unknown): vscode.Disposable {
			const wrappedCallback = thisArg ? callback.bind(thisArg) : callback;
			commandHandlers.set(command, wrappedCallback);
			supervisorProxy.$registerCommand(command);
			return {
				dispose() {
					commandHandlers.delete(command);
					supervisorProxy.$unregisterCommand(command);
				}
			};
		},
		executeCommand<T>(command: string, ...rest: unknown[]): Thenable<T> {
			return supervisorProxy.$executeCommand(command, rest) as Promise<T>;
		},
	};

	const window: Partial<typeof vscode.window> = {
		showInformationMessage(...args: unknown[]): Thenable<unknown> {
			return supervisorProxy.$showInformationMessage(args[0] as string, ...(args.slice(1)));
		},
		showWarningMessage(...args: unknown[]): Thenable<unknown> {
			return supervisorProxy.$showWarningMessage(args[0] as string, ...(args.slice(1)));
		},
		showErrorMessage(...args: unknown[]): Thenable<unknown> {
			return supervisorProxy.$showErrorMessage(args[0] as string, ...(args.slice(1)));
		},
	};

	// TODO@isolation: implement the complete API here and move away from a proxy to get type safety

	return new Proxy(Object.create(null), {
		get(_target, prop: string) {
			switch (prop) {
				case 'commands': return commands;
				case 'window': return window;
				case 'Uri': return URI;
				case 'ExtensionKind': return { UI: 1, Workspace: 2 };
				case 'subscriptions': return subscriptions;
				default:
					return notSupportedNamespace(prop);
			}
		}
	});
}

function notSupportedNamespace(namespaceName: string): unknown {
	return new Proxy({}, {
		get(_target, prop: string) {
			throw new Error(`'vscode.${namespaceName}.${prop}' is not yet available in worker-isolated mode.`);
		}
	});
}

/**
 * Main entry point for an extension worker thread.
 * Sets up RPCProtocol over the parent MessagePort and registers the worker-side handler.
 */
async function workerMain(): Promise<void> {
	const parentPort = worker_threads.parentPort;
	if (!parentPort) {
		throw new Error('extensionWorkerBootstrap must be run as a worker_thread');
	}

	// Bridge parentPort → RPCProtocol
	const portProtocol = new MessagePortProtocol(parentPort);
	const rpcProtocol = new RPCProtocol(portProtocol, {
		identifierCount: getWorkerIdentifierCount(),
		getStringIdentifier: getWorkerStringIdentifierForProxy,
	});

	// Get the supervisor proxy (WorkerHost — supervisor-side objects)
	const supervisorProxy: Proxied<IWorkerExtHostSupervisorShape> = rpcProtocol.getProxy(WorkerHost.Supervisor);

	let extensionModule: { activate?(ctx: vscode.ExtensionContext): Promise<unknown>; deactivate?(): void } | undefined;
	const commandHandlers = new Map<string, (...args: unknown[]) => unknown>();

	// Register worker-side handler (WorkerClient — supervisor calls these)
	const workerHandler: IWorkerExtHostWorkerShape = {
		async $activate(data: IWorkerActivationData): Promise<IWorkerActivateResult> {
			const extensionDescription = data.extensionDescription;

			const vsCodeApi = createWorkerVscodeApi(supervisorProxy, commandHandlers);

			// Intercept require('vscode')
			const node_module = nodeRequire('module');
			const originalLoad = node_module._load;
			node_module._load = function load(request: string, parent: unknown, isMain: boolean) {
				if (request === 'vscode') {
					return vsCodeApi;
				}
				return originalLoad.apply(this, arguments);
			};

			const entryPoint = extensionDescription.main;
			if (!entryPoint) {
				return { hasExports: false, activateCallTime: 0, activateResolveTime: 0 };
			}

			const modulePath = URI.revive(extensionDescription.extensionLocation).fsPath + '/' + entryPoint;

			try {
				extensionModule = nodeRequire(modulePath);
			} catch (err) {
				throw new Error(`Failed to load extension module '${modulePath}': ${err instanceof Error ? err.message : String(err)}`);
			}

			const extensionLocation = URI.revive(extensionDescription.extensionLocation);

			const context: vscode.ExtensionContext = {
				subscriptions: [],
				extensionUri: extensionLocation,
				extensionPath: extensionLocation.fsPath,
				asAbsolutePath(relativePath: string): string {
					return URI.joinPath(extensionLocation, relativePath).fsPath;
				},
				globalState: createGlobalStateProxy(),
				workspaceState: createMementoProxy(),
				secrets: createSecretsProxy(),
				storagePath: data.storagePath ?? undefined, // deprecated
				globalStoragePath: data.globalStoragePath, // deprecated
				logPath: data.logPath, // deprecated
				storageUri: data.storagePath ? URI.file(data.storagePath) : undefined,
				globalStorageUri: URI.file(data.globalStoragePath),
				logUri: URI.file(data.logPath),
				extensionMode: 1, // vscode.ExtensionMode.Production
				extension: {
					id: extensionDescription.identifier.value,
					extensionUri: extensionLocation,
					extensionPath: extensionLocation.fsPath,
					extensionKind: 1 as vscode.ExtensionKind, // TODO@isolation: resolve from actual extension kind
					isActive: true,
					isFromDifferentExtensionHost: false, // TODO@isolation: might be true depending on perspective
					packageJSON: extensionDescription,
					exports: undefined as unknown,
					activate: () => Promise.resolve(undefined as unknown), // TODO@isolation: proper activation
				},
				environmentVariableCollection: new Proxy(Object.create(null), {
					get() { throw new Error('environmentVariableCollection is not available in worker-isolated mode.'); } // TODO@isolation
				}),
				languageModelAccessInformation: new Proxy(Object.create(null), {
					get() { throw new Error('languageModelAccessInformation is not available in worker-isolated mode.'); } // TODO@isolation
				}),
				extensionRuntime: 1 as vscode.ExtensionRuntime, // TODO@isolation: should this be a new runtime kind?
				messagePassingProtocol: undefined, // TODO@isolation: not yet supported
			};

			let extensionExports: unknown;
			let activateCallTime = 0;
			let activateResolveTime = 0;

			if (typeof extensionModule?.activate === 'function') {
				const activateCallStart = Date.now();
				const activatePromise = extensionModule.activate(context);
				activateCallTime = Date.now() - activateCallStart;

				const activateResolveStart = Date.now();
				extensionExports = await activatePromise;
				activateResolveTime = Date.now() - activateResolveStart;
			} else {
				extensionExports = extensionModule;
			}

			return { hasExports: extensionExports !== undefined, activateCallTime, activateResolveTime };
		},

		async $deactivate(): Promise<void> {
			if (extensionModule && typeof extensionModule.deactivate === 'function') {
				extensionModule.deactivate();
			}
		},

		async $invokeCommand(commandId: string, args: unknown[]): Promise<unknown> {
			const handler = commandHandlers.get(commandId);
			if (!handler) {
				throw new Error(`Command '${commandId}' not found in worker`);
			}
			return handler(...args);
		},
	};

	rpcProtocol.set(WorkerClient.Worker, workerHandler);
}

/**
 * Creates an in-memory globalState (Memento + setKeysForSync).
 * TODO@isolation: proxy to real storage via RPC.
 */
function createGlobalStateProxy(): vscode.Memento & { setKeysForSync(keys: readonly string[]): void } {
	const memento = createMementoProxy();
	return {
		...memento,
		setKeysForSync(_keys: readonly string[]): void {
			// TODO@isolation: forward to real sync service
		},
	};
}

/**
 * Creates an in-memory Memento. TODO@isolation: proxy to real storage via RPC.
 */
function createMementoProxy(): vscode.Memento {
	const store = new Map<string, unknown>();
	return {
		keys: () => [...store.keys()],
		get<T>(key: string, defaultValue?: T): T {
			return store.has(key) ? store.get(key) as T : defaultValue as T;
		},
		update(key: string, value: unknown): Thenable<void> {
			if (value === undefined) {
				store.delete(key);
			} else {
				store.set(key, value);
			}
			return Promise.resolve();
		}
	};
}

/**
 * Creates a no-op SecretStorage. TODO@isolation: proxy to real secret storage via RPC.
 */
function createSecretsProxy(): vscode.SecretStorage {
	return {
		keys: () => Promise.resolve([]),
		get: () => Promise.resolve(undefined),
		store: () => Promise.resolve(),
		delete: () => Promise.resolve(),
		onDidChange: () => ({ dispose() { } }),
	};
}

workerMain().catch(err => {
	console.error(`[extensionWorkerBootstrap] Fatal error: ${err}`);
	process.exit(1);
});
