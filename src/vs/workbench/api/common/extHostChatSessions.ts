/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { coalesce } from '../../../base/common/arrays.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IChatAgentRequest } from '../../contrib/chat/common/chatAgents.js';
import { IChatSessionItem } from '../../contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../contrib/chat/common/constants.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';
import { ChatSessionDto, ExtHostChatSessionsShape, IChatAgentProgressShape, MainContext, MainThreadChatSessionsShape } from './extHost.protocol.js';
import { ChatAgentResponseStream } from './extHostChatAgents2.js';
import { CommandsConverter, ExtHostCommands } from './extHostCommands.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import * as typeConvert from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';

class ExtHostChatSession {
	private _stream: ChatAgentResponseStream;

	constructor(
		extension: IExtensionDescription,
		request: IChatAgentRequest,
		proxy: IChatAgentProgressShape,
		commandsConverter: CommandsConverter,
		sessionDisposables: DisposableStore
	) {
		this._stream = new ChatAgentResponseStream(extension, request, proxy, commandsConverter, sessionDisposables);
	}

	get stream() {
		return this._stream;
	}
}

export class ExtHostChatSessions extends Disposable implements ExtHostChatSessionsShape {

	private readonly _proxy: Proxied<MainThreadChatSessionsShape>;
	private readonly _chatSessionItemProviders = new Map<number, { provider: vscode.ChatSessionItemProvider; extension: IExtensionDescription; disposable: DisposableStore }>();
	private readonly _chatSessionContentProviders = new Map<number, { provider: vscode.ChatSessionContentProvider; extension: IExtensionDescription; disposable: DisposableStore }>();
	private _nextChatSessionItemProviderHandle = 0;
	private _nextChatSessionContentProviderHandle = 0;
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

	registerChatSessionItemProvider(extension: IExtensionDescription, chatSessionType: string, provider: vscode.ChatSessionItemProvider): vscode.Disposable {
		const handle = this._nextChatSessionItemProviderHandle++;
		const disposables = new DisposableStore();

		this._chatSessionItemProviders.set(handle, { provider, extension, disposable: disposables });
		this._proxy.$registerChatSessionItemProvider(handle, chatSessionType, provider.label);

		return new extHostTypes.Disposable(() => {
			this._chatSessionItemProviders.delete(handle);
			disposables.dispose();
			this._proxy.$unregisterChatSessionItemProvider(handle);
		});
	}

	registerChatSessionContentProvider(extension: IExtensionDescription, chatSessionType: string, provider: vscode.ChatSessionContentProvider): vscode.Disposable {
		const handle = this._nextChatSessionContentProviderHandle++;
		const disposables = new DisposableStore();

		this._chatSessionContentProviders.set(handle, { provider, extension, disposable: disposables });
		this._proxy.$registerChatSessionContentProvider(handle, chatSessionType);

		return new extHostTypes.Disposable(() => {
			this._chatSessionContentProviders.delete(handle);
			disposables.dispose();
			this._proxy.$unregisterChatSessionContentProvider(handle);
		});
	}

	async showChatSession(_extension: IExtensionDescription, chatSessionType: string, sessionId: string, options: vscode.ChatSessionShowOptions | undefined): Promise<void> {
		await this._proxy.$showChatSession(chatSessionType, sessionId, typeConvert.ViewColumn.from(options?.viewColumn));
	}

	async $provideChatSessionItems(handle: number, token: vscode.CancellationToken): Promise<IChatSessionItem[]> {
		const entry = this._chatSessionItemProviders.get(handle);
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
		const provider = this._chatSessionContentProviders.get(handle);
		if (!provider) {
			throw new Error(`No provider for handle ${handle}`);
		}

		const session = await provider.provider.provideChatSessionContent(id, token);

		// TODO: leaked
		const sessionDisposables = new DisposableStore();

		const sessionId = ExtHostChatSessions._sessionHandlePool++;
		const chatSession = new ExtHostChatSession(provider.extension, {
			sessionId: `${id}.${sessionId}`,
			requestId: 'ongoing',
			agentId: id,
			message: '',
			variables: { variables: [] },
			location: ChatAgentLocation.Panel,
		}, {
			$handleProgressChunk: (requestId, chunks) => {
				return this._proxy.$handleProgressChunk(handle, id, requestId, chunks);
			},
			$handleAnchorResolve: (requestId, requestHandle, anchor) => {
				this._proxy.$handleAnchorResolve(handle, id, requestId, requestHandle, anchor);
			},
		}, this.commands.converter, sessionDisposables);

		if (session.activeResponseCallback) {
			session.activeResponseCallback(chatSession.stream.apiObject, token).then(() => {
				// complete
				this._proxy.$handleProgressComplete(handle, id, 'ongoing');
			});
		}

		return {
			id: sessionId + '',
			activeResponseCallback: !!session.activeResponseCallback,
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
