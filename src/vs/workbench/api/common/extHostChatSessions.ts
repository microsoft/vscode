/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';
import { ChatSessionDto, ExtHostChatSessionsShape, MainContext, MainThreadChatSessionsShape } from './extHost.protocol.js';
import { ExtHostCommands } from './extHostCommands.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IChatSessionItem } from '../../contrib/chat/common/chatSessionsService.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import * as typeConvert from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';
import { coalesce } from '../../../base/common/arrays.js';

export class ExtHostChatSessions extends Disposable implements ExtHostChatSessionsShape {

	private readonly _proxy: Proxied<MainThreadChatSessionsShape>;
	private readonly _statusProviders = new Map<number, { provider: vscode.ChatSessionItemProvider; disposable: DisposableStore }>();
	private _nextHandle = 0;
	private _sessionMap: Map<string, vscode.ChatSessionItem> = new Map();
	private static _sessionHandlePool = 0;

	constructor(
		private readonly commands: ExtHostCommands,
		@IExtHostRpcService private readonly _extHostRpc: IExtHostRpcService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._proxy = this._extHostRpc.getProxy(MainContext.MainThreadChatSessions);

		commands.registerArgumentProcessor({
			processArgument: (arg) => {
				if (arg && arg.$mid === MarshalledId.ChatSessionContext) {
					const id = arg.id;
					const sessionContent = this._sessionMap.get(id);
					if (sessionContent) {
						return sessionContent;
					} else {
						this._logService.warn(`No chat session found for ID: ${id}`);
						return arg;
					}
				}

				return arg;
			}
		});
	}

	registerChatSessionItemProvider(chatSessionType: string, provider: vscode.ChatSessionItemProvider): vscode.Disposable {
		const handle = this._nextHandle++;
		const disposables = new DisposableStore();

		this._statusProviders.set(handle, { provider, disposable: disposables });
		this._proxy.$registerChatSessionItemProvider(handle, chatSessionType);

		return {
			dispose: () => {
				this._statusProviders.delete(handle);
				disposables.dispose();
				this._proxy.$unregisterChatSessionItemProvider(handle);
			}
		};
	}

	async $provideChatSessionItems(handle: number, token: vscode.CancellationToken): Promise<IChatSessionItem[]> {
		const entry = this._statusProviders.get(handle);
		if (!entry) {
			this._logService.error(`No provider registered for handle ${handle}`);
			return [];
		}

		const sessions = await entry.provider.provideChatSessionItems(token);
		if (!sessions) {
			return [];
		}

		const response: IChatSessionItem[] = [];
		for (const sessionContent of sessions) {
			if (sessionContent.id) {
				this._sessionMap.set(
					sessionContent.id,
					sessionContent
				);
				response.push({
					id: sessionContent.id,
					label: sessionContent.label,
					iconPath: sessionContent.iconPath
				});
			}
		}
		return response;
	}

	async $provideChatSessionContent(handle: number, id: string, token: CancellationToken): Promise<ChatSessionDto> {
		const provider = this._statusProviders.get(handle)?.provider;
		if (!provider) {
			throw new Error(`No provider for handle ${handle}`);
		}

		const session = await provider.provideChatSessionContent(id, token);

		// TODO: leaked
		const sessionDisposables = new DisposableStore();

		const sessionId = ExtHostChatSessions._sessionHandlePool++;

		return {
			id: sessionId + '',
			history: session.history.map(turn => {
				if (turn instanceof extHostTypes.ChatRequestTurn) {
					return { type: 'request', prompt: turn.prompt };
				} else {
					const responseTurn = turn as extHostTypes.ChatResponseTurn2;
					const parts = coalesce(responseTurn.response.map(r => typeConvert.ChatResponsePart.from(r, this.commands.converter, sessionDisposables)));

					return {
						type: 'response',
						parts
					};
				}
			})
		};
	}
}
