/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { coalesce } from '../../../base/common/arrays.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../base/common/map.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import * as objects from '../../../base/common/objects.js';
import { basename } from '../../../base/common/resources.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { SymbolKind, SymbolKinds } from '../../../editor/common/languages.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IChatRequestVariableEntry, IDiagnosticVariableEntryFilterData, IPromptFileVariableEntry, ISymbolVariableEntry, PromptFileVariableKind } from '../../contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatSessionProviderOptionItem } from '../../contrib/chat/common/chatSessionsService.js';
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

interface ChatSessionDelta {
	readonly addedOrUpdated?: ResourceMap<vscode.ChatSessionItem>;
	readonly removed?: ResourceSet;
}

function computeItemsDelta(oldItems: ResourceMap<vscode.ChatSessionItem>, newItems: ResourceMap<vscode.ChatSessionItem>): ChatSessionDelta {
	const delta = {
		addedOrUpdated: new ResourceMap<vscode.ChatSessionItem>(),
		removed: new ResourceSet(),
	} satisfies ChatSessionDelta;

	for (const [newResource, newItem] of newItems) {
		const oldItem = oldItems.get(newResource);
		if (oldItem !== newItem) {
			delta.addedOrUpdated.set(newResource, newItem);
		}
	}

	for (const oldResource of oldItems.keys()) {
		if (!newItems.has(oldResource)) {
			delta.removed.add(oldResource);
		}
	}

	return delta;
}

function convertChatSessionDeltaToDto(delta: ChatSessionDelta): { addedOrUpdated: ReturnType<typeof typeConvert.ChatSessionItem.from>[]; removed: URI[] } {
	return {
		addedOrUpdated: delta.addedOrUpdated ? Array.from(delta.addedOrUpdated.values(), typeConvert.ChatSessionItem.from) : [],
		removed: delta.removed ? Array.from(delta.removed.keys()) : []
	};
}

class ChatSessionItemCollectionImpl implements vscode.ChatSessionItemCollection {
	#items = new ResourceMap<vscode.ChatSessionItem>();
	readonly #proxy: Proxied<MainThreadChatSessionsShape>;
	readonly #controllerHandle: number;

	constructor(controllerHandle: number, proxy: Proxied<MainThreadChatSessionsShape>) {
		this.#proxy = proxy;
		this.#controllerHandle = controllerHandle;
	}

	get size(): number {
		return this.#items.size;
	}

	replace(newItems: readonly vscode.ChatSessionItem[]): void {
		if (!newItems.length && !this.#items.size) {
			// No change
			return;
		}

		const newItemsMap = new ResourceMap(newItems.map(item => [item.resource, item] as const));

		const delta = computeItemsDelta(this.#items, newItemsMap);
		if (!delta.addedOrUpdated?.size && !delta.removed?.size) {
			// No change
			return;
		}

		this.#items = newItemsMap;
		void this.#proxy.$updateChatSessionItems(this.#controllerHandle, convertChatSessionDeltaToDto(delta));
	}

	forEach(callback: (item: vscode.ChatSessionItem, collection: vscode.ChatSessionItemCollection) => unknown, thisArg?: any): void {
		for (const [_, item] of this.#items) {
			callback.call(thisArg, item, this);
		}
	}

	add(item: vscode.ChatSessionItem): void {
		const existing = this.#items.get(item.resource);
		if (existing && existing === item) {
			// We're adding the same item again
			return;
		}

		this.#items.set(item.resource, item);
		void this.#proxy.$addOrUpdateChatSessionItem(this.#controllerHandle, typeConvert.ChatSessionItem.from(item));
	}

	delete(resource: vscode.Uri): void {
		if (this.#items.delete(resource)) {
			void this.#proxy.$updateChatSessionItems(this.#controllerHandle, {
				addedOrUpdated: [],
				removed: [resource]
			});
		}
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

	private _itemControllerHandlePool = 0;
	private readonly _chatSessionItemControllers = new Map</* handle */ number, {
		readonly chatSessionType: string;
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
					const resource = arg.session.resource;
					for (const { controller } of this._chatSessionItemControllers.values()) {
						const item = controller.items.get(resource);
						if (item) {
							return item;
						}
					}

					this._logService.warn(`No chat session found with uri: ${resource}`);
					return arg;
				}

				return arg;
			}
		});
	}

	registerChatSessionItemProvider(extension: IExtensionDescription, chatSessionType: string, provider: vscode.ChatSessionItemProvider): vscode.Disposable {
		// The legacy provider api is implemented using the new controller API on the backend
		const controllerHandle = this._itemControllerHandlePool++;
		const disposables = new DisposableStore();

		const onDidChangeChatSessionItemStateEmitter = disposables.add(new Emitter<vscode.ChatSessionItem>());

		const collection = new ChatSessionItemCollectionImpl(controllerHandle, this._proxy);

		const controller: vscode.ChatSessionItemController = {
			id: chatSessionType,
			items: collection,
			createChatSessionItem: (_resource: vscode.Uri, _label: string) => {
				throw new Error('Not implemented for providers');
			},
			onDidChangeChatSessionItemState: onDidChangeChatSessionItemStateEmitter.event,
			newChatSessionItemHandler: undefined,
			dispose: () => {
				disposables.dispose();
			},
			refreshHandler: async (token: vscode.CancellationToken) => {
				const items = await provider.provideChatSessionItems(token) ?? [];
				collection.replace(items);
			},
		};

		this._chatSessionItemControllers.set(controllerHandle, { chatSessionType: chatSessionType, controller, extension, disposable: disposables, onDidChangeChatSessionItemStateEmitter });
		this._proxy.$registerChatSessionItemController(controllerHandle, chatSessionType);

		if (provider.onDidChangeChatSessionItems) {
			disposables.add(provider.onDidChangeChatSessionItems(() => {
				this._logService.trace(`ExtHostChatSessions. Provider items changed for ${chatSessionType}`);
				// When a provider fires this, we treat it the same as triggering a refresh in the new controller based model.
				// This is because with providers, firing this event would signal that `provide` should be called again.
				// With controllers, it instead signals that you should read the current items again.
				controller.refreshHandler(CancellationToken.None);
			}));
		}

		if (provider.onDidCommitChatSessionItem) {
			disposables.add(provider.onDidCommitChatSessionItem((e) => {
				const { original, modified } = e;
				this._proxy.$onDidCommitChatSessionItem(controllerHandle, original.resource, modified.resource);
			}));
		}

		return {
			dispose: () => {
				this._chatSessionItemControllers.delete(controllerHandle);
				disposables.dispose();
				this._proxy.$unregisterChatSessionItemController(controllerHandle);
			}
		};
	}

	createChatSessionItemController(extension: IExtensionDescription, id: string, refreshHandler: (token: vscode.CancellationToken) => Thenable<void>): vscode.ChatSessionItemController {
		const controllerHandle = this._itemControllerHandlePool++;
		const disposables = new DisposableStore();

		let isDisposed = false;
		let newChatSessionItemHandler: vscode.ChatSessionItemController['newChatSessionItemHandler'];
		const onDidChangeChatSessionItemStateEmitter = disposables.add(new Emitter<vscode.ChatSessionItem>());

		const collection = new ChatSessionItemCollectionImpl(controllerHandle, this._proxy);

		const controller = Object.freeze<vscode.ChatSessionItemController>({
			id,
			refreshHandler: async (refreshToken: CancellationToken) => {
				if (isDisposed) {
					throw new Error('ChatSessionItemController has been disposed');
				}

				this._logService.trace(`ExtHostChatSessions. Controller(${id}).refresh()`);
				await refreshHandler(refreshToken);
			},
			items: collection,
			onDidChangeChatSessionItemState: onDidChangeChatSessionItemStateEmitter.event,
			createChatSessionItem: (resource: vscode.Uri, label: string) => {
				if (isDisposed) {
					throw new Error('ChatSessionItemController has been disposed');
				}

				const item = new ChatSessionItemImpl(resource, label, () => {
					// Make sure the item really is in the collection. If not we don't need to transmit it to the main thread yet
					if (collection.get(resource) === item) {
						void this._proxy.$addOrUpdateChatSessionItem(controllerHandle, typeConvert.ChatSessionItem.from(item));
					}
				});
				return item;
			},
			get newChatSessionItemHandler() { return newChatSessionItemHandler; },
			set newChatSessionItemHandler(handler: vscode.ChatSessionItemController['newChatSessionItemHandler']) { newChatSessionItemHandler = handler; },
			dispose: () => {
				isDisposed = true;
				disposables.dispose();
			},
		});

		this._chatSessionItemControllers.set(controllerHandle, { controller, extension, disposable: disposables, chatSessionType: id, onDidChangeChatSessionItemStateEmitter });

		// Register the controller with the main thread
		this._proxy.$registerChatSessionItemController(controllerHandle, id);

		disposables.add(toDisposable(() => {
			this._chatSessionItemControllers.delete(controllerHandle);
			this._proxy.$unregisterChatSessionItemController(controllerHandle);
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
			variableData: variables.length > 0 ? { variables } : undefined,
			modelId: turn.modelId,
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

	async $refreshChatSessionItems(handle: number, token: CancellationToken): Promise<void> {
		const controllerData = this._chatSessionItemControllers.get(handle);
		if (!controllerData) {
			this._logService.warn(`No controller found for handle ${handle}`);
			return;
		}

		await controllerData.controller.refreshHandler(token);
	}

	async $newChatSessionItem(handle: number, request: IChatAgentRequest, token: CancellationToken): Promise<ReturnType<typeof typeConvert.ChatSessionItem.from> | undefined> {
		const controllerData = this._chatSessionItemControllers.get(handle);
		if (!controllerData) {
			this._logService.warn(`No controller found for handle ${handle}`);
			return undefined;
		}

		const handler = controllerData.controller.newChatSessionItemHandler;
		if (!handler) {
			return undefined;
		}

		const model = await this.getModelForRequest(request, controllerData.extension);
		const chatRequest = typeConvert.ChatAgentRequest.to(request, undefined, model, [], new Map(), controllerData.extension, this._logService);

		const item = await handler({ request: chatRequest }, token);
		if (!item) {
			return undefined;
		}

		return typeConvert.ChatSessionItem.from(item);
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
