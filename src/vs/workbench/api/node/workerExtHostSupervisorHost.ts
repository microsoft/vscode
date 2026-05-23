/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';
import {
	IWorkerExtHostSupervisorShape,
	IWorkerExtHostWorkerShape,
} from '../../services/extensions/common/workerIsolated/workerExtHostProtocol.js';
import { IExtHostCommands } from '../common/extHostCommands.js';
import { MainContext, MainThreadMessageServiceShape } from '../common/extHost.protocol.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';

/**
 * Hosts one isolated extension worker on the ext host process side.
 *
 * Each isolated worker gets its own instance. The host object implements
 * {@link IWorkerExtHostSupervisorShape} — every `$`-prefixed method is
 * called by the worker via RPCProtocol.
 *
 * Later phases will split this into per-API-surface host objects
 * (commands host, messages host, etc.) that mirror the ExtHost* services.
 */
export class WorkerExtHostSupervisorHost extends Disposable implements IWorkerExtHostSupervisorShape {

	private readonly _registeredCommands = new Set<string>();
	private readonly _messageProxy: MainThreadMessageServiceShape;

	constructor(
		readonly extensionId: ExtensionIdentifier,
		private readonly _workerProxy: Proxied<IWorkerExtHostWorkerShape>,
		@IExtHostCommands private readonly _extHostCommands: IExtHostCommands,
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
	) {
		super();
		this._messageProxy = extHostRpc.getProxy(MainContext.MainThreadMessageService);
	}

	// --- Commands ---

	async $registerCommand(commandId: string): Promise<void> {
		this._registeredCommands.add(commandId);
		this._register(this._extHostCommands.registerCommand(true, commandId, <T>(...args: unknown[]): Thenable<T> => {
			return this._workerProxy.$invokeCommand(commandId, args) as Promise<T>;
		}));
	}

	async $unregisterCommand(_commandId: string): Promise<void> {
		// Disposal is handled by the DisposableStore via _register above.
		// When this host is disposed, all registered commands are cleaned up.
	}

	async $executeCommand(commandId: string, args: unknown[]): Promise<unknown> {
		return this._extHostCommands.executeCommand(commandId, ...args);
	}

	// --- Messages ---

	async $showInformationMessage(message: string): Promise<unknown> {
		return this._messageProxy.$showMessage(1 /* Severity.Info */, message, {}, []);
	}

	async $showWarningMessage(message: string): Promise<unknown> {
		return this._messageProxy.$showMessage(2 /* Severity.Warning */, message, {}, []);
	}

	async $showErrorMessage(message: string): Promise<unknown> {
		return this._messageProxy.$showMessage(3 /* Severity.Error */, message, {}, []);
	}
}
