/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ExtHostRemoteCodingAgentsShape, MainContext } from './extHost.protocol.js';
import type * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/log.js';

export interface IExtHostRemoteCodingAgents extends ExtHostRemoteCodingAgentsShape {
	registerAgentInformationProvider(provider: vscode.RemoteCodingAgentInformationProvider): vscode.Disposable;
}
export const IExtHostRemoteCodingAgents = createDecorator<IExtHostRemoteCodingAgents>('IExtHostRemoteCodingAgents');

export class ExtHostRemoteCodingAgents extends Disposable implements IExtHostRemoteCodingAgents {
	declare _serviceBrand: undefined;

	private readonly _proxy = this._extHostRpc.getProxy(MainContext.MainThreadRemoteCodingAgents);
	private readonly _statusProviders = new Map<number, { provider: vscode.RemoteCodingAgentInformationProvider; disposable: DisposableStore }>();
	private _nextHandle = 0;

	constructor(
		@IExtHostRpcService private readonly _extHostRpc: IExtHostRpcService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	registerAgentInformationProvider(provider: vscode.RemoteCodingAgentInformationProvider): vscode.Disposable {
		const handle = this._nextHandle++;
		const disposables = new DisposableStore();

		this._statusProviders.set(handle, { provider, disposable: disposables });

		// Subscribe to provider's event and forward changes to main thread
		disposables.add(provider.onDidChangeAgentInformation((info) => {
			this._proxy.$onDidChangeAgentInformation(handle, info);
		}));

		this._proxy.$registerAgentInformationProvider(handle);

		return {
			dispose: () => {
				this._statusProviders.delete(handle);
				disposables.dispose();
				provider.dispose();
				this._proxy.$unregisterAgentInformationProvider(handle);
			}
		};
	}

	async $onDidSelectItem(handle: number, codingAgentId: string): Promise<void> {
		const entry = this._statusProviders.get(handle);
		if (!entry) {
			this._logService.error(`No provider registered for handle ${handle}`);
		} else {
			entry.provider.onDidSelectItem(codingAgentId);
		}
	}

	async $provideCodingAgentsInformation(handle: number, token: vscode.CancellationToken): Promise<vscode.RemoteCodingAgentInformation[]> {
		const entry = this._statusProviders.get(handle);
		if (!entry) {
			this._logService.error(`No provider registered for handle ${handle}`);
			return [];
		}

		// Collect all results from the async iterable into an array
		const results: vscode.RemoteCodingAgentInformation[] = [];
		for await (const info of entry.provider.provideCodingAgentsInformation(token)) {
			if (token.isCancellationRequested) {
				break;
			}
			results.push(info);
		}
		return results;
	}
}
