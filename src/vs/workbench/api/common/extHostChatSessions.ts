/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ChatSessionDto, ExtHostChatSessionsShape, MainContext, MainThreadChatSessionsShape } from './extHost.protocol.js';
import type * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/log.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostCommands } from './extHostCommands.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import * as typeConvert from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';
import { coalesce } from '../../../base/common/arrays.js';

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
	private _sessionMap: Map<string, vscode.ChatSessionContent & Record<string, unknown>> = new Map();
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
					const id = this.uriToId(arg.uri);
					const sessionContent = this._sessionMap.get(id);
					if (sessionContent) {
						return sessionContent;
					} else {
						this._logService.warn(`No chat session found for URI: ${id}`);
						return arg;
					}
				}

				return arg;
			}
		});
	}

	registerChatSessionsProvider(provider: vscode.ChatSessionsProvider): vscode.Disposable {
		const handle = this._nextHandle++;
		const disposables = new DisposableStore();

		this._statusProviders.set(handle, { provider, disposable: disposables });
		this._proxy.$registerChatSessionsProvider(handle, provider.chatSessionType);

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

		const session = await entry.provider.provideChatSessions(token);
		for (const sessionContent of session) {
			if (sessionContent.uri) {
				this._sessionMap.set(
					this.uriToId(sessionContent.uri),
					sessionContent as vscode.ChatSessionContent & Record<string, unknown>
				);
			}
		}

		return session;
	}

	async $provideChatSessionContent(handle: number, uri: UriComponents, token: CancellationToken): Promise<ChatSessionDto> {
		const provider = this._statusProviders.get(handle)?.provider;
		if (!provider) {
			throw new Error(`No provider for handle ${handle}`);
		}

		const session = await provider.provideChatSessionContent(URI.revive(uri), token);

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

	private uriToId(uri: URI): string {
		return `${uri.scheme}+${uri.authority}+${uri.path}`;
	}
}
