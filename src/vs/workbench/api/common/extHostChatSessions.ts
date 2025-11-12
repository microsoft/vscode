/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { coalesce } from '../../../base/common/arrays.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { revive } from '../../../base/common/marshalling.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IChatAgentRequest, IChatAgentResult } from '../../contrib/chat/common/chatAgents.js';
import { ChatSessionStatus, IChatSessionItem } from '../../contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../contrib/chat/common/constants.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';
import { ChatSessionDto, ExtHostChatSessionsShape, IChatAgentProgressShape, IChatSessionProviderOptions, MainContext, MainThreadChatSessionsShape } from './extHost.protocol.js';
import { ChatAgentResponseStream } from './extHostChatAgents2.js';
import { CommandsConverter, ExtHostCommands } from './extHostCommands.js';
import { ExtHostLanguageModels } from './extHostLanguageModels.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import * as typeConvert from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';

class ExtHostChatSession {
	private _stream: ChatAgentResponseStream;

	constructor(
		public readonly session: vscode.ChatSession,
		public readonly extension: IExtensionDescription,
		request: IChatAgentRequest,
		public readonly proxy: IChatAgentProgressShape,
		public readonly commandsConverter: CommandsConverter,
		public readonly sessionDisposables: DisposableStore
	) {
		this._stream = new ChatAgentResponseStream(extension, request, proxy, commandsConverter, sessionDisposables);
	}

	get activeResponseStream() {
		return this._stream;
	}

	getActiveRequestStream(request: IChatAgentRequest) {
		return new ChatAgentResponseStream(this.extension, request, this.proxy, this.commandsConverter, this.sessionDisposables);
	}
}

export class ExtHostChatSessions extends Disposable implements ExtHostChatSessionsShape {
	private static _sessionHandlePool = 0;

	private readonly _proxy: Proxied<MainThreadChatSessionsShape>;
	private readonly _chatSessionItemProviders = new Map<number, {
		readonly sessionType: string;
		readonly provider: vscode.ChatSessionItemProvider;
		readonly extension: IExtensionDescription;
		readonly disposable: DisposableStore;
	}>();
	private readonly _chatSessionContentProviders = new Map<number, {
		readonly provider: vscode.ChatSessionContentProvider;
		readonly extension: IExtensionDescription;
		readonly capabilities?: vscode.ChatSessionCapabilities;
		readonly disposable: DisposableStore;
	}>();
	private _nextChatSessionItemProviderHandle = 0;
	private _nextChatSessionContentProviderHandle = 0;

	/**
	 * Map of uri -> chat session items
	 *
	 * TODO: this isn't cleared/updated properly
	 */
	private readonly _sessionItems = new ResourceMap<vscode.ChatSessionItem>();

	/**
	 * Map of uri -> chat sessions infos
	 */
	private readonly _extHostChatSessions = new ResourceMap<{ readonly sessionObj: ExtHostChatSession; readonly disposeCts: CancellationTokenSource }>();


	constructor(
		private readonly commands: ExtHostCommands,
		private readonly _languageModels: ExtHostLanguageModels,
		@IExtHostRpcService private readonly _extHostRpc: IExtHostRpcService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._proxy = this._extHostRpc.getProxy(MainContext.MainThreadChatSessions);

		commands.registerArgumentProcessor({
			processArgument: (arg) => {
				if (arg && arg.$mid === MarshalledId.ChatSessionContext) {
					const id = arg.session.resource || arg.sessionId;
					const sessionContent = this._sessionItems.get(id);
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

		this._chatSessionItemProviders.set(handle, { provider, extension, disposable: disposables, sessionType: chatSessionType });
		this._proxy.$registerChatSessionItemProvider(handle, chatSessionType);
		if (provider.onDidChangeChatSessionItems) {
			disposables.add(provider.onDidChangeChatSessionItems(() => {
				this._proxy.$onDidChangeChatSessionItems(handle);
			}));
		}
		if (provider.onDidCommitChatSessionItem) {
			disposables.add(provider.onDidCommitChatSessionItem((e) => {
				const { original, modified } = e;
				this._proxy.$onDidCommitChatSessionItem(handle, original.resource, modified.resource);
			}));
		}
		return {
			dispose: () => {
				this._chatSessionItemProviders.delete(handle);
				disposables.dispose();
				this._proxy.$unregisterChatSessionItemProvider(handle);
			}
		};
	}

	registerChatSessionContentProvider(extension: IExtensionDescription, chatSessionScheme: string, chatParticipant: vscode.ChatParticipant, provider: vscode.ChatSessionContentProvider, capabilities?: vscode.ChatSessionCapabilities): vscode.Disposable {
		const handle = this._nextChatSessionContentProviderHandle++;
		const disposables = new DisposableStore();

		this._chatSessionContentProviders.set(handle, { provider, extension, capabilities, disposable: disposables });
		this._proxy.$registerChatSessionContentProvider(handle, chatSessionScheme);

		return new extHostTypes.Disposable(() => {
			this._chatSessionContentProviders.delete(handle);
			disposables.dispose();
			this._proxy.$unregisterChatSessionContentProvider(handle);
		});
	}

	private convertChatSessionStatus(status: vscode.ChatSessionStatus | undefined): ChatSessionStatus | undefined {
		if (status === undefined) {
			return undefined;
		}

		switch (status) {
			case 0: // vscode.ChatSessionStatus.Failed
				return ChatSessionStatus.Failed;
			case 1: // vscode.ChatSessionStatus.Completed
				return ChatSessionStatus.Completed;
			case 2: // vscode.ChatSessionStatus.InProgress
				return ChatSessionStatus.InProgress;
			default:
				return undefined;
		}
	}

	private convertChatSessionItem(sessionType: string, sessionContent: vscode.ChatSessionItem): IChatSessionItem {
		return {
			id: sessionContent.resource.toString(),
			resource: sessionContent.resource,
			label: sessionContent.label,
			description: sessionContent.description ? typeConvert.MarkdownString.from(sessionContent.description) : undefined,
			status: this.convertChatSessionStatus(sessionContent.status),
			tooltip: typeConvert.MarkdownString.fromStrict(sessionContent.tooltip),
			timing: {
				startTime: sessionContent.timing?.startTime ?? 0,
				endTime: sessionContent.timing?.endTime
			},
			statistics: sessionContent.statistics ? {
				files: sessionContent.statistics?.files ?? 0,
				insertions: sessionContent.statistics?.insertions ?? 0,
				deletions: sessionContent.statistics?.deletions ?? 0
			} : undefined
		};
	}

	async $provideNewChatSessionItem(handle: number, options: { request: IChatAgentRequest; metadata?: any }, token: CancellationToken): Promise<IChatSessionItem> {
		const entry = this._chatSessionItemProviders.get(handle);
		if (!entry || !entry.provider.provideNewChatSessionItem) {
			throw new Error(`No provider registered for handle ${handle} or provider does not support creating sessions`);
		}

		try {
			const model = await this.getModelForRequest(options.request, entry.extension);
			const vscodeRequest = typeConvert.ChatAgentRequest.to(
				revive(options.request),
				undefined,
				model,
				[],
				new Map(),
				entry.extension,
				this._logService);

			const vscodeOptions = {
				request: vscodeRequest,
				metadata: options.metadata
			};

			const chatSessionItem = await entry.provider.provideNewChatSessionItem(vscodeOptions, token);
			if (!chatSessionItem) {
				throw new Error('Provider did not create session');
			}

			this._sessionItems.set(chatSessionItem.resource, chatSessionItem);
			return this.convertChatSessionItem(entry.sessionType, chatSessionItem);
		} catch (error) {
			this._logService.error(`Error creating chat session: ${error}`);
			throw error;
		}
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
			this._sessionItems.set(sessionContent.resource, sessionContent);
			response.push(this.convertChatSessionItem(entry.sessionType, sessionContent));
		}
		return response;
	}

	async $provideChatSessionContent(handle: number, sessionResourceComponents: UriComponents, token: CancellationToken): Promise<ChatSessionDto> {
		const provider = this._chatSessionContentProviders.get(handle);
		if (!provider) {
			throw new Error(`No provider for handle ${handle}`);
		}

		const sessionResource = URI.revive(sessionResourceComponents);

		const session = await provider.provider.provideChatSessionContent(sessionResource, token);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		const sessionDisposables = new DisposableStore();
		const sessionId = ExtHostChatSessions._sessionHandlePool++;
		const id = sessionResource.toString();
		const chatSession = new ExtHostChatSession(session, provider.extension, {
			sessionId: `${id}.${sessionId}`,
			requestId: 'ongoing',
			agentId: id,
			message: '',
			variables: { variables: [] },
			location: ChatAgentLocation.Chat,
		}, {
			$handleProgressChunk: (requestId, chunks) => {
				return this._proxy.$handleProgressChunk(handle, sessionResource, requestId, chunks);
			},
			$handleAnchorResolve: (requestId, requestHandle, anchor) => {
				this._proxy.$handleAnchorResolve(handle, sessionResource, requestId, requestHandle, anchor);
			},
		}, this.commands.converter, sessionDisposables);

		const disposeCts = sessionDisposables.add(new CancellationTokenSource());
		this._extHostChatSessions.set(sessionResource, { sessionObj: chatSession, disposeCts });

		// Call activeResponseCallback immediately for best user experience
		if (session.activeResponseCallback) {
			Promise.resolve(session.activeResponseCallback(chatSession.activeResponseStream.apiObject, disposeCts.token)).finally(() => {
				// complete
				this._proxy.$handleProgressComplete(handle, sessionResource, 'ongoing');
			});
		}
		const { capabilities } = provider;
		return {
			id: sessionId + '',
			resource: URI.revive(sessionResource),
			hasActiveResponseCallback: !!session.activeResponseCallback,
			hasRequestHandler: !!session.requestHandler,
			supportsInterruption: !!capabilities?.supportsInterruptions,
			options: session.options,
			history: session.history.map(turn => {
				if (turn instanceof extHostTypes.ChatRequestTurn) {
					return this.convertRequestTurn(turn);
				} else {
					return this.convertResponseTurn(turn as extHostTypes.ChatResponseTurn2, sessionDisposables);
				}
			})
		};
	}

	async $provideHandleOptionsChange(handle: number, sessionResourceComponents: UriComponents, updates: ReadonlyArray<{ optionId: string; value: string | undefined }>, token: CancellationToken): Promise<void> {
		const sessionResource = URI.revive(sessionResourceComponents);
		const provider = this._chatSessionContentProviders.get(handle);
		if (!provider) {
			this._logService.warn(`No provider for handle ${handle}`);
			return;
		}

		if (!provider.provider.provideHandleOptionsChange) {
			this._logService.debug(`Provider for handle ${handle} does not implement provideHandleOptionsChange`);
			return;
		}

		try {
			await provider.provider.provideHandleOptionsChange(sessionResource, updates, token);
		} catch (error) {
			this._logService.error(`Error calling provideHandleOptionsChange for handle ${handle}, sessionResource ${sessionResource}:`, error);
		}
	}

	async $provideChatSessionProviderOptions(handle: number, token: CancellationToken): Promise<IChatSessionProviderOptions | undefined> {
		const entry = this._chatSessionContentProviders.get(handle);
		if (!entry) {
			this._logService.warn(`No provider for handle ${handle} when requesting chat session options`);
			return;
		}

		const provider = entry.provider;
		if (!provider.provideChatSessionProviderOptions) {
			return;
		}

		try {
			const { optionGroups } = await provider.provideChatSessionProviderOptions(token);
			if (!optionGroups) {
				return;
			}
			return {
				optionGroups,
			};
		} catch (error) {
			this._logService.error(`Error calling provideChatSessionProviderOptions for handle ${handle}:`, error);
			return;
		}
	}

	async $interruptChatSessionActiveResponse(providerHandle: number, sessionResource: UriComponents, requestId: string): Promise<void> {
		const entry = this._extHostChatSessions.get(URI.revive(sessionResource));
		entry?.disposeCts.cancel();
	}

	async $disposeChatSessionContent(providerHandle: number, sessionResource: UriComponents): Promise<void> {
		const entry = this._extHostChatSessions.get(URI.revive(sessionResource));
		if (!entry) {
			this._logService.warn(`No chat session found for resource: ${sessionResource}`);
			return;
		}

		entry.disposeCts.cancel();
		entry.sessionObj.sessionDisposables.dispose();
		this._extHostChatSessions.delete(URI.revive(sessionResource));
	}

	async $invokeChatSessionRequestHandler(handle: number, sessionResource: UriComponents, request: IChatAgentRequest, history: any[], token: CancellationToken): Promise<IChatAgentResult> {
		const entry = this._extHostChatSessions.get(URI.revive(sessionResource));
		if (!entry || !entry.sessionObj.session.requestHandler) {
			return {};
		}

		const chatRequest = typeConvert.ChatAgentRequest.to(request, undefined, await this.getModelForRequest(request, entry.sessionObj.extension), [], new Map(), entry.sessionObj.extension, this._logService);

		const stream = entry.sessionObj.getActiveRequestStream(request);
		await entry.sessionObj.session.requestHandler(chatRequest, { history: history }, stream.apiObject, token);

		// TODO: do we need to dispose the stream object?
		return {};
	}

	private async getModelForRequest(request: IChatAgentRequest, extension: IExtensionDescription): Promise<vscode.LanguageModelChat> {
		let model: vscode.LanguageModelChat | undefined;
		if (request.userSelectedModelId) {
			model = await this._languageModels.getLanguageModelByIdentifier(extension, request.userSelectedModelId);
		}
		if (!model) {
			model = await this._languageModels.getDefaultLanguageModel(extension);
			if (!model) {
				throw new Error('Language model unavailable');
			}
		}

		return model;
	}

	private convertRequestTurn(turn: extHostTypes.ChatRequestTurn) {
		const variables = turn.references.map(ref => this.convertReferenceToVariable(ref));
		return {
			type: 'request' as const,
			prompt: turn.prompt,
			participant: turn.participant,
			command: turn.command,
			variableData: variables.length > 0 ? { variables } : undefined
		};
	}

	private convertReferenceToVariable(ref: vscode.ChatPromptReference) {
		const value = ref.value && typeof ref.value === 'object' && 'uri' in ref.value && 'range' in ref.value
			? typeConvert.Location.from(ref.value as vscode.Location)
			: ref.value;
		const range = ref.range ? { start: ref.range[0], endExclusive: ref.range[1] } : undefined;
		const isFile = URI.isUri(value) || (value && typeof value === 'object' && 'uri' in value);
		return {
			id: ref.id,
			name: ref.id,
			value,
			modelDescription: ref.modelDescription,
			range,
			kind: isFile ? 'file' as const : 'generic' as const
		};
	}

	private convertResponseTurn(turn: extHostTypes.ChatResponseTurn2, sessionDisposables: DisposableStore) {
		const parts = coalesce(turn.response.map(r => typeConvert.ChatResponsePart.from(r, this.commands.converter, sessionDisposables)));
		return {
			type: 'response' as const,
			parts,
			participant: turn.participant
		};
	}
}
