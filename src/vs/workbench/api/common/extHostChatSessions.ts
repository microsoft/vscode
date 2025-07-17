/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ExtHostChatSessionsShape, MainContext, MainThreadChatSessionsShape } from './extHost.protocol.js';
import type * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/log.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';

export interface IExtHostChatSessions extends ExtHostChatSessionsShape {
	registerChatSessionsProvider(provider: vscode.ChatSessionsProvider): vscode.Disposable;
	$provideChatSessions(handle: number, token: vscode.CancellationToken): Promise<vscode.ChatSessionContent[]>;
}
export const IExtHostChatSessions = createDecorator<IExtHostChatSessions>('IExtHostChatSessions');

export class ExtHostChatSessions extends Disposable implements IExtHostChatSessions {
	declare _serviceBrand: undefined;

	private readonly _proxy: Proxied<MainThreadChatSessionsShape>;
	private readonly _statusProviders = new Map<number, { provider: vscode.ChatSessionsProvider; disposable: DisposableStore }>();
	private _nextHandle = 0;

	constructor(
		@IExtHostRpcService private readonly _extHostRpc: IExtHostRpcService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._proxy = this._extHostRpc.getProxy(MainContext.MainThreadChatSessions);
	}

	registerChatSessionsProvider(provider: vscode.ChatSessionsProvider): vscode.Disposable {
		const handle = this._nextHandle++;
		const disposables = new DisposableStore();

		this._statusProviders.set(handle, { provider, disposable: disposables });
		this._proxy.$registerChatSessionsProvider(handle);

		return {
			dispose: () => {
				this._statusProviders.delete(handle);
				disposables.dispose();
				provider.dispose();
				this._proxy.$unregisterChatSessionsProvider(handle);
			}
		};
	}

	async $provideChatSessions(handle: number, token: vscode.CancellationToken): Promise<vscode.ChatSessionContent[]> {
		const entry = this._statusProviders.get(handle);
		if (!entry) {
			this._logService.error(`No provider registered for handle ${handle}`);
			return [];
		}

		return await entry.provider.provideChatSessions(token);
	}
}
