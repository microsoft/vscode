/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ExtHostChatSessionShape, MainContext, MainThreadChatSessionShape } from './extHost.protocol.js';
import type * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/log.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';

export interface IExtHostChatSession extends ExtHostChatSessionShape {
	registerChatSessionInformationProvider(provider: vscode.ChatSessionInformationProvider): vscode.Disposable;
	$provideChatSessionInformation(handle: number, token: vscode.CancellationToken): Promise<vscode.ChatSessionInformation[]>;
}
export const IExtHostChatSession = createDecorator<IExtHostChatSession>('IExtHostChatSession');

export class ExtHostChatSession extends Disposable implements IExtHostChatSession {
	declare _serviceBrand: undefined;

	private readonly _proxy: Proxied<MainThreadChatSessionShape>;
	private readonly _statusProviders = new Map<number, { provider: vscode.ChatSessionInformationProvider; disposable: DisposableStore }>();
	private _nextHandle = 0;

	constructor(
		@IExtHostRpcService private readonly _extHostRpc: IExtHostRpcService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._proxy = this._extHostRpc.getProxy(MainContext.MainThreadChatSession);
	}

	registerChatSessionInformationProvider(provider: vscode.ChatSessionInformationProvider): vscode.Disposable {
		const handle = this._nextHandle++;
		const disposables = new DisposableStore();

		this._statusProviders.set(handle, { provider, disposable: disposables });

		disposables.add(provider.onDidChangeChatSessionInformation(() => {
			this._proxy.$onDidChangeChatSessionInformation(handle);
		}));

		this._proxy.$registerChatSessionInformationProvider(handle);

		return {
			dispose: () => {
				this._statusProviders.delete(handle);
				disposables.dispose();
				provider.dispose();
				this._proxy.$unregisterChatSessionInformationProvider(handle);
			}
		};
	}

	async $provideChatSessionInformation(handle: number, token: vscode.CancellationToken): Promise<vscode.ChatSessionInformation[]> {
		const entry = this._statusProviders.get(handle);
		if (!entry) {
			this._logService.error(`No provider registered for handle ${handle}`);
			return [];
		}

		return await entry.provider.provideChatSessionInformation(token);
	}
}
