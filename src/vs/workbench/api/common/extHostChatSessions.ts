/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable local/code-no-native-private */

import type * as vscode from 'vscode';
import { coalesce } from '../../../base/common/arrays.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import { basename } from '../../../base/common/resources.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { SymbolKind, SymbolKinds } from '../../../editor/common/languages.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IChatRequestVariableEntry, IDiagnosticVariableEntryFilterData, IPromptFileVariableEntry, ISymbolVariableEntry, PromptFileVariableKind } from '../../contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionProviderOptionItem } from '../../contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../contrib/chat/common/constants.js';
import { IChatAgentRequest, IChatAgentResult } from '../../contrib/chat/common/participants/chatAgents.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';
import { ChatSessionDto, ExtHostChatSessionsShape, IChatAgentProgressShape, IChatSessionProviderOptions, MainContext, MainThreadChatSessionsShape } from './extHost.protocol.js';
import { ChatAgentResponseStream } from './extHostChatAgents2.js';
import { CommandsConverter, ExtHostCommands } from './extHostCommands.js';
import { ExtHostLanguageModels } from './extHostLanguageModels.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import * as typeConvert from './extHostTypeConverters.js';
import { Diagnostic } from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';
import * as objects from '../../../base/common/objects.js';

type ChatSessionTiming = vscode.ChatSessionItem['timing'];

// #region Chat Session Item Controller

class ChatSessionItemImpl implements vscode.ChatSessionItem {
	#label: string;
	#iconPath?: vscode.IconPath;
	#description?: string | vscode.MarkdownString;
	#badge?: string | vscode.MarkdownString;
	#status?: vscode.ChatSessionStatus;
	#archived?: boolean;
	#tooltip?: string | vscode.MarkdownString;
	#timing?: ChatSessionTiming;
	#changes?: readonly vscode.ChatSessionChangedFile[];
	#metadata?: { readonly [key: string]: unknown };
	#onChanged: () => void;

	readonly resource: vscode.Uri;

	constructor(resource: vscode.Uri, label: string, onChanged: () => void) {
		this.resource = resource;
		this.#label = label;
		this.#onChanged = onChanged;
	}

	get label(): string {
		return this.#label;
	}

	set label(value: string) {
		if (this.#label !== value) {
			this.#label = value;
			this.#onChanged();
		}
	}

	get iconPath(): vscode.IconPath | undefined {
		return this.#iconPath;
	}

	set iconPath(value: vscode.IconPath | undefined) {
		if (this.#iconPath !== value) {
			this.#iconPath = value;
			this.#onChanged();
		}
	}

	get description(): string | vscode.MarkdownString | undefined {
		return this.#description;
	}

	set description(value: string | vscode.MarkdownString | undefined) {
		if (this.#description !== value) {
			this.#description = value;
			this.#onChanged();
		}
	}

	get badge(): string | vscode.MarkdownString | undefined {
		return this.#badge;
	}

	set badge(value: string | vscode.MarkdownString | undefined) {
		if (this.#badge !== value) {
			this.#badge = value;
			this.#onChanged();
		}
	}

	get status(): vscode.ChatSessionStatus | undefined {
		return this.#status;
	}

	set status(value: vscode.ChatSessionStatus | undefined) {
		if (this.#status !== value) {
			this.#status = value;
			this.#onChanged();
		}
	}

	get archived(): boolean | undefined {
		return this.#archived;
	}

	set archived(value: boolean | undefined) {
		if (this.#archived !== value) {
			this.#archived = value;
			this.#onChanged();
		}
	}

	get tooltip(): string | vscode.MarkdownString | undefined {
		return this.#tooltip;
	}

	set tooltip(value: string | vscode.MarkdownString | undefined) {
		if (this.#tooltip !== value) {
			this.#tooltip = value;
			this.#onChanged();
		}
	}

	get timing(): ChatSessionTiming | undefined {
		return this.#timing;
	}

	set timing(value: ChatSessionTiming | undefined) {
		if (this.#timing !== value) {
			this.#timing = value;
			this.#onChanged();
		}
	}

	get changes(): readonly vscode.ChatSessionChangedFile[] | undefined {
		return this.#changes;
	}

	set changes(value: readonly vscode.ChatSessionChangedFile[] | undefined) {
		if (this.#changes !== value) {
			this.#changes = value;
			this.#onChanged();
		}
	}

	get metadata(): { readonly [key: string]: unknown } | undefined {
		return this.#metadata;
	}

	set metadata(value: { readonly [key: string]: unknown } | undefined) {
		if (value !== undefined) {
			try {
				JSON.stringify(value);
			} catch {
				throw new Error('metadata must be JSON-serializable');
			}
		}
		if (!objects.equals(this.#metadata, value)) {
			this.#metadata = value;
			this.#onChanged();
		}
	}
}

class ChatSessionItemCollectionImpl implements vscode.ChatSessionItemCollection {
	readonly #items = new ResourceMap<vscode.ChatSessionItem>();
	#onItemsChanged: () => void;

	constructor(onItemsChanged: () => void) {
		this.#onItemsChanged = onItemsChanged;
	}

	get size(): number {
		return this.#items.size;
	}

	replace(items: readonly vscode.ChatSessionItem[]): void {
		if (items.length === 0 && this.#items.size === 0) {
			return;
		}

		this.#items.clear();
		for (const item of items) {
			this.#items.set(item.resource, item);
		}
		this.#onItemsChanged();
	}

	forEach(callback: (item: vscode.ChatSessionItem, collection: vscode.ChatSessionItemCollection) => unknown, thisArg?: any): void {
		for (const [_, item] of this.#items) {
			callback.call(thisArg, item, this);
		}
	}

	add(item: vscode.ChatSessionItem): void {
		this.#items.set(item.resource, item);
		this.#onItemsChanged();
	}

	delete(resource: vscode.Uri): void {
		this.#items.delete(resource);
		this.#onItemsChanged();
	}

	get(resource: vscode.Uri): vscode.ChatSessionItem | undefined {
		return this.#items.get(resource);
	}

	[Symbol.iterator](): Iterator<readonly [id: URI, chatSessionItem: vscode.ChatSessionItem]> {
		return this.#items.entries();
	}
}

// #endregion

class ExtHostChatSession {
	private _stream: ChatAgentResponseStream;
	// Empty map since question carousel is designed for chat agents, not chat sessions
	private readonly _pendingCarouselResolvers = new Map<string, Map<string, DeferredPromise<Record<string, unknown> | undefined>>>();

	constructor(
		public readonly session: vscode.ChatSession,
		public readonly extension: IExtensionDescription,
		request: IChatAgentRequest,
		public readonly proxy: IChatAgentProgressShape,
		public readonly commandsConverter: CommandsConverter,
		public readonly sessionDisposables: DisposableStore
	) {
		this._stream = new ChatAgentResponseStream(extension, request, proxy, commandsConverter, sessionDisposables, this._pendingCarouselResolvers, CancellationToken.None);
	}

	get activeResponseStream() {
		return this._stream;
	}

	getActiveRequestStream(request: IChatAgentRequest) {
		return new ChatAgentResponseStream(this.extension, request, this.proxy, this.commandsConverter, this.sessionDisposables, this._pendingCarouselResolvers, CancellationToken.None);
	}
}

export class ExtHostChatSessions extends Disposable implements ExtHostChatSessionsShape {
	private static _sessionHandlePool = 0;

	private readonly _proxy: Proxied<MainThreadChatSessionsShape>;

	private _itemProviderHandlePool = 0;
	private readonly _chatSessionItemProviders = new Map</* handle */ number, {
		readonly sessionType: string;
		readonly provider: vscode.ChatSessionItemProvider;
		readonly extension: IExtensionDescription;
		readonly disposable: DisposableStore;
	}>();

	private _itemControllerHandlePool = 0;
	private readonly _chatSessionItemControllers = new Map</* handle */ number, {
		readonly sessionType: string;
		readonly controller: vscode.ChatSessionItemController;
		readonly extension: IExtensionDescription;
		readonly disposable: DisposableStore;
		readonly onDidChangeChatSessionItemStateEmitter: Emitter<vscode.ChatSessionItem>;
	}>();

	private _contentProviderHandlePool = 0;
	private readonly _chatSessionContentProviders = new Map</* handle */ number, {
		readonly provider: vscode.ChatSessionContentProvider;
		readonly extension: IExtensionDescription;
		readonly capabilities?: vscode.ChatSessionCapabilities;
		readonly disposable: DisposableStore;
	}>();

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
	/**
	 * Store option groups with onSearch callbacks per provider handle
	 */
	private readonly _providerOptionGroups = new Map<number, vscode.ChatSessionProviderOptionGroup[]>();

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
				if (arg && arg.$mid === MarshalledId.AgentSessionContext) {
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
		const handle = this._itemProviderHandlePool++;
		const disposables = new DisposableStore();

		this._chatSessionItemProviders.set(handle, { provider, extension, disposable: disposables, sessionType: chatSessionType });
		this._proxy.$registerChatSessionItemProvider(handle, chatSessionType);
		if (provider.onDidChangeChatSessionItems) {
			disposables.add(provider.onDidChangeChatSessionItems(() => {
				this._logService.trace(`ExtHostChatSessions. Firing $onDidChangeChatSessionItems for ${chatSessionType}`);
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


	createChatSessionItemController(extension: IExtensionDescription, id: string, refreshHandler: (token: vscode.CancellationToken) => Thenable<void>): vscode.ChatSessionItemController {
		const controllerHandle = this._itemControllerHandlePool++;
		const disposables = new DisposableStore();

		let isDisposed = false;
		let refreshIdPool = 0;
		let activeRefreshId: number | undefined = undefined;

		const onDidChangeItemsEmitter = disposables.add(new Emitter<void>());
		const onDidChangeChatSessionItemStateEmitter = disposables.add(new Emitter<vscode.ChatSessionItem>());

		const notifyItemsChanged = () => {
			// Suppress updates when a refresh is already happening
			if (typeof activeRefreshId === 'undefined') {
				onDidChangeItemsEmitter.fire();
			}
		};

		const collection = new ChatSessionItemCollectionImpl(() => {
			notifyItemsChanged();
		});

		const controller = Object.freeze<vscode.ChatSessionItemController>({
			id,
			refreshHandler: async (refreshToken: CancellationToken) => {
				if (isDisposed) {
					throw new Error('ChatSessionItemController has been disposed');
				}

				const opId = ++refreshIdPool;
				activeRefreshId = opId;

				try {
					this._logService.trace(`ExtHostChatSessions. Controller(${id}).refresh()`);
					await refreshHandler(refreshToken);
				} finally {
					if (activeRefreshId === opId) {
						activeRefreshId = undefined;
					}
				}
			},
			items: collection,
			onDidChangeChatSessionItemState: onDidChangeChatSessionItemStateEmitter.event,
			createChatSessionItem: (resource: vscode.Uri, label: string) => {
				if (isDisposed) {
					throw new Error('ChatSessionItemController has been disposed');
				}

				return new ChatSessionItemImpl(resource, label, () => {
					// TODO: Optimize to only update the specific item
					notifyItemsChanged();
				});
			},
			dispose: () => {
				isDisposed = true;
				disposables.dispose();
			},
		});

		this._chatSessionItemControllers.set(controllerHandle, { controller, extension, disposable: disposables, sessionType: id, onDidChangeChatSessionItemStateEmitter });

		// Controllers are implemented using providers on the ext host side for now
		disposables.add(this.registerChatSessionItemProvider(extension, id, {
			onDidChangeChatSessionItems: onDidChangeItemsEmitter.event,
			onDidCommitChatSessionItem: Event.None,
			provideChatSessionItems: async (token: CancellationToken): Promise<vscode.ChatSessionItem[]> => {
				await controller.refreshHandler(token);
				return Array.from(controller.items, x => x[1]);
			},
		}));

		disposables.add(toDisposable(() => {
			this._chatSessionItemControllers.delete(controllerHandle);
			this._proxy.$unregisterChatSessionItemProvider(controllerHandle);
		}));

		return controller;
	}

	registerChatSessionContentProvider(extension: IExtensionDescription, chatSessionScheme: string, chatParticipant: vscode.ChatParticipant, provider: vscode.ChatSessionContentProvider, capabilities?: vscode.ChatSessionCapabilities): vscode.Disposable {
		const handle = this._contentProviderHandlePool++;
		const disposables = new DisposableStore();

		this._chatSessionContentProviders.set(handle, { provider, extension, capabilities, disposable: disposables });
		this._proxy.$registerChatSessionContentProvider(handle, chatSessionScheme);

		if (provider.onDidChangeChatSessionOptions) {
			disposables.add(provider.onDidChangeChatSessionOptions(evt => {
				this._proxy.$onDidChangeChatSessionOptions(handle, evt.resource, evt.updates);
			}));
		}

		if (provider.onDidChangeChatSessionProviderOptions) {
			disposables.add(provider.onDidChangeChatSessionProviderOptions(() => {
				this._proxy.$onDidChangeChatSessionProviderOptions(handle);
			}));
		}

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
			// Need to support NeedsInput status if we ever export it to the extension API
			default:
				return undefined;
		}
	}

	private convertChatSessionItem(sessionContent: vscode.ChatSessionItem): IChatSessionItem {
		// Support both new (created, lastRequestStarted, lastRequestEnded) and old (startTime, endTime) timing properties
		const timing = sessionContent.timing;
		const created = timing?.created ?? timing?.startTime ?? 0;
		const lastRequestStarted = timing?.lastRequestStarted ?? timing?.startTime;
		const lastRequestEnded = timing?.lastRequestEnded ?? timing?.endTime;

		return {
			resource: sessionContent.resource,
			label: sessionContent.label,
			description: sessionContent.description ? typeConvert.MarkdownString.from(sessionContent.description) : undefined,
			badge: sessionContent.badge ? typeConvert.MarkdownString.from(sessionContent.badge) : undefined,
			status: this.convertChatSessionStatus(sessionContent.status),
			archived: sessionContent.archived,
			tooltip: typeConvert.MarkdownString.fromStrict(sessionContent.tooltip),
			timing: {
				created,
				lastRequestStarted,
				lastRequestEnded,
			},
			changes: sessionContent.changes instanceof Array ? sessionContent.changes : undefined,
			metadata: sessionContent.metadata,
		};
	}

	async $provideChatSessionItems(handle: number, token: vscode.CancellationToken): Promise<IChatSessionItem[]> {
		const itemProvider = this._chatSessionItemProviders.get(handle);
		if (!itemProvider) {
			this._logService.error(`No provider registered for handle ${handle}`);
			return [];
		}

		this._logService.trace(`ExtHostChatSessions:$provideChatSessionItems(${itemProvider.sessionType})`);
		const items = await itemProvider.provider.provideChatSessionItems(token) ?? [];
		if (token.isCancellationRequested) {
			return [];
		}

		const response: IChatSessionItem[] = [];
		for (const sessionContent of items) {
			this._sessionItems.set(sessionContent.resource, sessionContent);
			response.push(this.convertChatSessionItem(sessionContent));
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
			sessionResource,
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

	async $provideHandleOptionsChange(handle: number, sessionResourceComponents: UriComponents, updates: ReadonlyArray<{ optionId: string; value: string | IChatSessionProviderOptionItem | undefined }>, token: CancellationToken): Promise<void> {
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
			const updatesToSend = updates.map(update => ({
				optionId: update.optionId,
				value: update.value === undefined ? undefined : (typeof update.value === 'string' ? update.value : update.value.id)
			}));
			await provider.provider.provideHandleOptionsChange(sessionResource, updatesToSend, token);
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
			this._providerOptionGroups.set(handle, optionGroups);
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
		await entry.sessionObj.session.requestHandler(chatRequest, { history, yieldRequested: false }, stream.apiObject, token);

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
			id: turn.id,
			prompt: turn.prompt,
			participant: turn.participant,
			command: turn.command,
			variableData: variables.length > 0 ? { variables } : undefined
		};
	}

	private convertReferenceToVariable(ref: vscode.ChatPromptReference): IChatRequestVariableEntry {
		const value = ref.value && typeof ref.value === 'object' && 'uri' in ref.value && 'range' in ref.value
			? typeConvert.Location.from(ref.value as vscode.Location)
			: ref.value;
		const range = ref.range ? { start: ref.range[0], endExclusive: ref.range[1] } : undefined;

		if (value && value instanceof extHostTypes.ChatReferenceDiagnostic && Array.isArray(value.diagnostics) && value.diagnostics.length && value.diagnostics[0][1].length) {
			const marker = Diagnostic.from(value.diagnostics[0][1][0]);
			const refValue: IDiagnosticVariableEntryFilterData = {
				filterRange: { startLineNumber: marker.startLineNumber, startColumn: marker.startColumn, endLineNumber: marker.endLineNumber, endColumn: marker.endColumn },
				filterSeverity: marker.severity,
				filterUri: value.diagnostics[0][0],
				problemMessage: value.diagnostics[0][1][0].message
			};
			return IDiagnosticVariableEntryFilterData.toEntry(refValue);
		}

		if (extHostTypes.Location.isLocation(ref.value) && ref.name.startsWith(`sym:`)) {
			const loc = typeConvert.Location.from(ref.value);
			return {
				id: ref.id,
				name: ref.name,
				fullName: ref.name.substring(4),
				value: { uri: ref.value.uri, range: loc.range },
				// We never send this information to extensions, so default to Property
				symbolKind: SymbolKind.Property,
				// We never send this information to extensions, so default to Property
				icon: SymbolKinds.toIcon(SymbolKind.Property),
				kind: 'symbol',
				range,
			} satisfies ISymbolVariableEntry;
		}

		if (URI.isUri(value) && ref.name.startsWith(`prompt:`) &&
			ref.id.startsWith(PromptFileVariableKind.PromptFile) &&
			ref.id.endsWith(value.toString())) {
			return {
				id: ref.id,
				name: `prompt:${basename(value)}`,
				value,
				kind: 'promptFile',
				modelDescription: 'Prompt instructions file',
				isRoot: true,
				automaticallyAdded: false,
				range,
			} satisfies IPromptFileVariableEntry;
		}

		const isFile = URI.isUri(value) || (value && typeof value === 'object' && 'uri' in value);
		const isFolder = isFile && URI.isUri(value) && value.path.endsWith('/');
		return {
			id: ref.id,
			name: ref.name,
			value,
			modelDescription: ref.modelDescription,
			range,
			kind: isFolder ? 'directory' as const : isFile ? 'file' as const : 'generic' as const
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

	async $invokeOptionGroupSearch(providerHandle: number, optionGroupId: string, query: string, token: CancellationToken): Promise<IChatSessionProviderOptionItem[]> {
		const optionGroups = this._providerOptionGroups.get(providerHandle);
		if (!optionGroups) {
			this._logService.warn(`No option groups found for provider handle ${providerHandle}`);
			return [];
		}

		const group = optionGroups.find((g: vscode.ChatSessionProviderOptionGroup) => g.id === optionGroupId);
		if (!group || !group.onSearch) {
			this._logService.warn(`No onSearch callback found for option group ${optionGroupId}`);
			return [];
		}

		try {
			const results = await group.onSearch(query, token);
			return results ?? [];
		} catch (error) {
			this._logService.error(`Error calling onSearch for option group ${optionGroupId}:`, error);
			return [];
		}
	}

	$onDidChangeChatSessionItemState(controllerHandle: number, sessionResourceComponents: UriComponents, archived: boolean): void {
		const controllerData = this._chatSessionItemControllers.get(controllerHandle);
		if (!controllerData) {
			this._logService.warn(`No controller found for handle ${controllerHandle}`);
			return;
		}

		const sessionResource = URI.revive(sessionResourceComponents);
		const item = controllerData.controller.items.get(sessionResource);
		if (!item) {
			this._logService.warn(`No item found for session resource ${sessionResource.toString()}`);
			return;
		}

		item.archived = archived;
		controllerData.onDidChangeChatSessionItemStateEmitter.fire(item);
	}
}
