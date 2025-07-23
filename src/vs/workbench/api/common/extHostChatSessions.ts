/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';
import { ChatSessionDto, ExtHostChatSessionsShape, IChatAgentProgressShape, MainContext, MainThreadChatSessionsShape } from './extHost.protocol.js';
import { CommandsConverter, ExtHostCommands } from './extHostCommands.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IChatSessionItem } from '../../contrib/chat/common/chatSessionsService.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import * as typeConvert from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';
import { coalesce } from '../../../base/common/arrays.js';
import { ChatAgentResponseStream } from './extHostChatAgents2.js';
import { IChatAgentRequest, IChatAgentResult } from '../../contrib/chat/common/chatAgents.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ChatAgentLocation } from '../../contrib/chat/common/constants.js';

class ExtHostChatSession {
	private _stream: ChatAgentResponseStream;

	constructor(
		public readonly session: vscode.ChatSession,
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
		this._proxy.$registerChatSessionItemProvider(handle, chatSessionType);

		return {
			dispose: () => {
				this._chatSessionItemProviders.delete(handle);
				disposables.dispose();
				this._proxy.$unregisterChatSessionItemProvider(handle);
			}
		};
	}

	registerChatSessionContentProvider(extension: IExtensionDescription, chatSessionType: string, provider: vscode.ChatSessionContentProvider) {
		const handle = this._nextChatSessionContentProviderHandle++;
		const disposables = new DisposableStore();

		this._chatSessionContentProviders.set(handle, { provider, extension, disposable: disposables });
		this._proxy.$registerChatSessionContentProvider(handle, chatSessionType);

		return {
			dispose: () => {
				this._chatSessionContentProviders.delete(handle);
				disposables.dispose();
				this._proxy.$unregisterChatSessionContentProvider(handle);
			}
		};
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

	private _map = new Map<string, ExtHostChatSession>();

	async $provideChatSessionContent(handle: number, id: string, token: CancellationToken): Promise<ChatSessionDto> {
		const provider = this._chatSessionContentProviders.get(handle);
		if (!provider) {
			throw new Error(`No provider for handle ${handle}`);
		}

		const session = await provider.provider.provideChatSessionContent(id, token);

		// TODO: leaked
		const sessionDisposables = new DisposableStore();

		const sessionId = ExtHostChatSessions._sessionHandlePool++;
		const chatSession = new ExtHostChatSession(session, provider.extension, {
			sessionId: `${id}.${sessionId}`,
			requestId: id,
			agentId: id,
			message: '',
			variables: { variables: [] },
			location: ChatAgentLocation.Panel,
		}, {
			$handleProgressChunk: (requestId, chunks) => {
				return this._proxy.$handleProgressChunk(handle, requestId, chunks);
			},
			$handleAnchorResolve: (requestId, requestHandle, anchor) => {
				this._proxy.$handleAnchorResolve(handle, requestId, requestHandle, anchor);
			},
		}, this.commands.converter, sessionDisposables);

		if (session.activeResponseCallback) {
			session.activeResponseCallback(chatSession.stream.apiObject, token).then(() => {
				// complete
				this._proxy.$handleProgressComplete(handle, id);
			});
		}

		if (session.requestHandler) {
			// it can handle request
			this._map.set(`${handle}_${id}`, chatSession);
		}

		return {
			id: sessionId + '',
			activeResponseCallback: !!session.activeResponseCallback,
			supportRequestHandler: !!session.requestHandler,
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

	async $invokeChatSessionRequestHandler(handle: number, id: string, request: IChatAgentRequest, history: any[], token: CancellationToken): Promise<IChatAgentResult> {
		const chatSession = this._map.get(`${handle}_${id}`);
		if (!chatSession) {
			throw new Error(`No session found for handle ${handle} and id ${id}`);
		}

		// Convert IChatAgentRequest to compatible object for the request handler
		// We need to create an object that has the expected properties the requestHandler expects
		const chatRequest = {
			prompt: request.message,
			command: request.command,
			references: []
		} as any; // Using 'as any' to work around strict type requirements

		// Create context object with history
		const context = { history };

		// Create a new session disposables for this request
		const sessionDisposables = new DisposableStore();

		// Get the provider info to access the extension
		const contentProviderEntry = Array.from(this._chatSessionContentProviders.entries())
			.find(([h]) => h === handle);

		if (!contentProviderEntry) {
			throw new Error(`No content provider found for handle ${handle}`);
		}

		const [, { extension }] = contentProviderEntry;

		// Create a new stream specifically for THIS request
		// The key issue is that we need a stream that uses the current request ID
		const newStream = new ChatAgentResponseStream(
			extension,
			// Use the current request from the invocation
			request,
			{
				$handleProgressChunk: (requestId, chunks) => {
					return this._proxy.$handleProgressChunk(handle, requestId, chunks);
				},
				$handleAnchorResolve: (requestId, requestHandle, anchor) => {
					this._proxy.$handleAnchorResolve(handle, requestId, requestHandle, anchor);
				},
			},
			this.commands.converter,
			sessionDisposables
		);

		try {
			// Call the request handler with the NEW stream that is tied to this specific request
			const result = await chatSession.session.requestHandler!(
				chatRequest,
				context,
				newStream.apiObject,
				token
			);

			// Signal completion when done
			this._proxy.$handleProgressComplete(handle, id);

			// Clean up
			sessionDisposables.dispose();

			// Return a simple result structure
			return {
				errorDetails: result?.errorDetails ? {
					message: result.errorDetails.message
				} : undefined
			};
		} catch (error) {
			// Handle any errors
			sessionDisposables.dispose();

			return {
				errorDetails: {
					message: error instanceof Error ? error.message : String(error)
				}
			};
		}
	}
}
