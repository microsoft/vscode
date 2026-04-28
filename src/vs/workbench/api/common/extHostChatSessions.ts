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
import { URI, UriComponents } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { SymbolKind, SymbolKinds } from '../../../editor/common/languages.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IChatRequestVariableEntry, IDiagnosticVariableEntryFilterData, ISymbolVariableEntry, PromptFileVariableKind, toPromptFileVariableEntry } from '../../contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatSessionProviderOptionItem } from '../../contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../contrib/chat/common/constants.js';
import { isUntitledChatSession } from '../../contrib/chat/common/model/chatUri.js';
import { IChatAgentRequest, IChatAgentResult } from '../../contrib/chat/common/participants/chatAgents.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';
import { ChatSessionContentContextDto, ExtHostChatSessionsShape, IChatAgentProgressShape, IChatNewSessionRequestDto, IChatSessionDto, IChatSessionProviderOptions, IChatSessionRequestHistoryItemDto, MainContext, MainThreadChatSessionsShape } from './extHost.protocol.js';
import { ChatAgentResponseStream } from './extHostChatAgents2.js';
import { CommandsConverter, ExtHostCommands } from './extHostCommands.js';
import { ExtHostLanguageModels } from './extHostLanguageModels.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import * as typeConvert from './extHostTypeConverters.js';
import { Diagnostic } from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';
import { isEqual } from '../../../base/common/resources.js';

type ChatSessionTiming = vscode.ChatSessionItem['timing'];

// #region Chat Session Input State

class ChatSessionInputStateImpl implements vscode.ChatSessionInputState {
	#groups: readonly vscode.ChatSessionProviderOptionGroup[];
	readonly #onChangedDelegate: (() => void) | undefined;

	readonly #onDidChangeEmitter = new Emitter<void>();
	readonly onDidChange = this.#onDidChangeEmitter.event;

	readonly #onDidDisposeEmitter = new Emitter<void>();
	readonly onDidDispose = this.#onDidDisposeEmitter.event;

	#sessionResource: vscode.Uri | undefined;
	get sessionResource(): vscode.Uri | undefined {
		return this.#sessionResource;
	}
	set sessionResource(value: vscode.Uri | undefined) {
		this.#sessionResource = value;
	}

	#untitledSessionResource: vscode.Uri | undefined;
	get untitledSessionResource(): vscode.Uri | undefined {
		return this.#untitledSessionResource;
	}
	set untitledSessionResource(value: vscode.Uri | undefined) {
		this.#untitledSessionResource = value;
	}

	constructor(groups: readonly vscode.ChatSessionProviderOptionGroup[], onChangedDelegate?: () => void) {
		this.#groups = groups;
		this.#onChangedDelegate = onChangedDelegate;
	}

	get groups(): readonly vscode.ChatSessionProviderOptionGroup[] {
		return this.#groups;
	}

	set groups(value: readonly vscode.ChatSessionProviderOptionGroup[]) {
		this.#groups = value;
		this.#onChangedDelegate?.();
	}

	_fireDidChange(): void {
		this.#onDidChangeEmitter.fire();
	}

	_setGroups(groups: readonly vscode.ChatSessionProviderOptionGroup[]): void {
		this.#groups = groups;
	}

	_dispose(): void {
		this.#onDidDisposeEmitter.fire();
		this.#onDidDisposeEmitter.dispose();
		this.#onDidChangeEmitter.dispose();
	}
}

// #endregion

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
	private readonly _proxy: Proxied<MainThreadChatSessionsShape>;

	private _itemControllerHandlePool = 0;
	private readonly _chatSessionItemControllers = new Map</* handle */ number, {
		readonly chatSessionType: string;
		readonly controller: vscode.ChatSessionItemController;
		readonly extension: IExtensionDescription;
		readonly disposable: DisposableStore;
		readonly onDidChangeChatSessionItemStateEmitter: Emitter<vscode.ChatSessionItem>;
		readonly inputStates: Set<ChatSessionInputStateImpl>;
		optionGroups?: readonly vscode.ChatSessionProviderOptionGroup[];
	}>();

	private _contentProviderHandlePool = 0;
	private readonly _chatSessionContentProviders = new Map</* handle */ number, {
		readonly chatSessionScheme: string;
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
	 * Map of proxy command id -> original command id + controller handle.
	 * Used to wrap option group commands so they receive `{ inputState, sessionResource }` instead of just `sessionResource`.
	 */
	private readonly _proxyCommands = new Map</* proxyId */ string, { readonly originalCommandId: string; readonly controllerHandle: number }>();

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
			createChatSessionInputState: (_options: vscode.ChatSessionProviderOptionGroup[]) => {
				return new ChatSessionInputStateImpl([]);
			},
			onDidChangeChatSessionItemState: onDidChangeChatSessionItemStateEmitter.event,
			newChatSessionItemHandler: undefined,
			// Bridge the deprecated `ChatSessionItemProvider.resolveChatSessionItem` hook through the
			// new controller surface so both code paths share the same `$resolveChatSessionItem` impl.
			// The legacy provider returns a new item; the bridge adds it to the collection so the
			// controller contract (update via collection, return void) is satisfied.
			resolveChatSessionItem: provider.resolveChatSessionItem
				? async (item, token) => {
					const resolved = await provider.resolveChatSessionItem!(item, token);
					if (resolved) {
						collection.add(resolved);
					}
				}
				: undefined,
			dispose: () => {
				disposables.dispose();
			},
			refreshHandler: async (token: vscode.CancellationToken) => {
				const items = await provider.provideChatSessionItems(token) ?? [];
				collection.replace(items);
			},
		};

		this._chatSessionItemControllers.set(controllerHandle, { chatSessionType: chatSessionType, controller, extension, disposable: disposables, onDidChangeChatSessionItemStateEmitter, inputStates: new Set() });
		this._proxy.$registerChatSessionItemController(controllerHandle, chatSessionType, !!provider.resolveChatSessionItem);

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

		const disposable: vscode.Disposable = {
			dispose: () => {
				this._chatSessionItemControllers.delete(controllerHandle);
				disposables.dispose();
				this._proxy.$unregisterChatSessionItemController(controllerHandle);
			}
		};

		return Object.assign(disposable, {
			onDidChangeChatSessionItemState: onDidChangeChatSessionItemStateEmitter.event,
		});
	}

	createChatSessionItemController(extension: IExtensionDescription, id: string, refreshHandler: (token: vscode.CancellationToken) => Thenable<void>): vscode.ChatSessionItemController {
		const controllerHandle = this._itemControllerHandlePool++;
		const disposables = new DisposableStore();

		let isDisposed = false;
		let newChatSessionItemHandler: vscode.ChatSessionItemController['newChatSessionItemHandler'];
		let forkHandler: vscode.ChatSessionItemController['forkHandler'];
		let resolveChatSessionItemHandler: vscode.ChatSessionItemController['resolveChatSessionItem'];
		let provideChatSessionInputStateHandler: vscode.ChatSessionItemController['getChatSessionInputState'];
		const onDidChangeChatSessionItemStateEmitter = disposables.add(new Emitter<vscode.ChatSessionItem>());
		const inputStates = new Set<ChatSessionInputStateImpl>();

		const collection = new ChatSessionItemCollectionImpl(controllerHandle, this._proxy);
		const proxy = this._proxy;

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
			get forkHandler() { return forkHandler; },
			set forkHandler(handler: vscode.ChatSessionItemController['forkHandler']) { forkHandler = handler; },
			get resolveChatSessionItem() { return resolveChatSessionItemHandler; },
			set resolveChatSessionItem(handler: vscode.ChatSessionItemController['resolveChatSessionItem']) {
				const hadHandler = !!resolveChatSessionItemHandler;
				resolveChatSessionItemHandler = handler;
				const hasHandler = !!handler;
				if (hadHandler !== hasHandler && !isDisposed) {
					proxy.$updateChatSessionItemControllerCapabilities(controllerHandle, hasHandler);
				}
			},
			get getChatSessionInputState() { return provideChatSessionInputStateHandler; },
			set getChatSessionInputState(handler: vscode.ChatSessionItemController['getChatSessionInputState']) { provideChatSessionInputStateHandler = handler; },
			createChatSessionInputState: (groups: vscode.ChatSessionProviderOptionGroup[]) => {
				if (isDisposed) {
					throw new Error('ChatSessionItemController has been disposed');
				}

				const inputState = new ChatSessionInputStateImpl(groups, () => {
					// Store updated option groups on the controller entry
					const entry = this._chatSessionItemControllers.get(controllerHandle);
					if (entry) {
						entry.optionGroups = inputState.groups;
					}
					const wrappedGroups = this._wrapOptionGroupCommands(controllerHandle, inputState.groups);
					const serializableGroups = wrappedGroups.map(g => ({
						id: g.id,
						name: g.name,
						description: g.description,
						items: g.items,
						selected: g.selected,
						when: g.when,
						icon: g.icon,
						commands: g.commands,
						kind: g.kind,
					}));
					const resource = inputState.sessionResource ?? inputState.untitledSessionResource;
					if (resource) {
						void this._proxy.$updateChatSessionInputState(controllerHandle, resource, serializableGroups);
					}
				});
				inputStates.add(inputState);
				return inputState;
			},
			dispose: () => {
				isDisposed = true;
				for (const inputState of inputStates) {
					inputState._dispose();
				}
				inputStates.clear();
				disposables.dispose();
			},
		});

		this._chatSessionItemControllers.set(controllerHandle, { controller, extension, disposable: disposables, chatSessionType: id, onDidChangeChatSessionItemStateEmitter, inputStates });

		// Register the controller with the main thread. `resolveChatSessionItem` may be assigned
		// later via the setter, which fires `$updateChatSessionItemControllerCapabilities` to
		// flip `supportsResolve` on. Start out as `false` so controllers that never set the
		// handler don't pay an RPC per render.
		this._proxy.$registerChatSessionItemController(controllerHandle, id, !!resolveChatSessionItemHandler);

		disposables.add(toDisposable(() => {
			this._chatSessionItemControllers.delete(controllerHandle);
			this._proxy.$unregisterChatSessionItemController(controllerHandle);
		}));

		return controller;
	}

	registerChatSessionContentProvider(extension: IExtensionDescription, chatSessionScheme: string, chatParticipant: vscode.ChatParticipant, provider: vscode.ChatSessionContentProvider, capabilities?: vscode.ChatSessionCapabilities): vscode.Disposable {
		const handle = this._contentProviderHandlePool++;
		const disposables = new DisposableStore();

		this._chatSessionContentProviders.set(handle, { chatSessionScheme, provider, extension, capabilities, disposable: disposables });
		this._proxy.$registerChatSessionContentProvider(handle, chatSessionScheme);

		if (provider.onDidChangeChatSessionOptions) {
			disposables.add(provider.onDidChangeChatSessionOptions(evt => {
				const updates: Record<string, string | IChatSessionProviderOptionItem> = Object.create(null);
				for (const update of evt.updates) {
					updates[update.optionId] = update.value;
				}
				this._proxy.$onDidChangeChatSessionOptions(handle, evt.resource, updates);
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

	async $provideChatSessionContent(handle: number, sessionResourceComponents: UriComponents, context: ChatSessionContentContextDto, token: CancellationToken): Promise<IChatSessionDto> {
		const provider = this._chatSessionContentProviders.get(handle);
		if (!provider) {
			throw new Error(`No provider for handle ${handle}`);
		}

		const sessionResource = URI.revive(sessionResourceComponents);

		const controllerData = this.getChatSessionItemController(sessionResource.scheme);
		let inputState: vscode.ChatSessionInputState;
		if (controllerData?.controller.getChatSessionInputState) {
			const result = await controllerData.controller.getChatSessionInputState(isUntitledChatSession(sessionResource) ? undefined : sessionResource, {
				previousInputState: this._createInputStateFromOptions(controllerData.optionGroups ?? [], context.initialSessionOptions),
			}, token);
			if (result) {
				inputState = result;
			}
		}
		inputState ??= this._createInputStateFromOptions(
			controllerData?.optionGroups ?? [], context.initialSessionOptions
		);

		if (inputState instanceof ChatSessionInputStateImpl) {
			// Dispose any previous input states for this session resource
			if (controllerData) {
				this._disposeInputStatesForResource(controllerData.inputStates, sessionResource);
			}

			if (isUntitledChatSession(sessionResource)) {
				inputState.untitledSessionResource = sessionResource;
			} else {
				inputState.sessionResource = sessionResource;
			}
		}

		const session = await provider.provider.provideChatSessionContent(sessionResource, token, {
			inputState,
		});
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		const sessionDisposables = new DisposableStore();
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
			resource: URI.revive(sessionResource),
			title: session.title,
			hasActiveResponseCallback: !!session.activeResponseCallback,
			hasRequestHandler: !!session.requestHandler,
			hasForkHandler: !!controllerData?.controller.forkHandler || !!session.forkHandler,
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

	async $provideHandleOptionsChange(handle: number, sessionResourceComponents: UriComponents, updates: Record<string, string | IChatSessionProviderOptionItem | undefined>, token: CancellationToken): Promise<void> {
		const sessionResource = URI.revive(sessionResourceComponents);
		const provider = this._chatSessionContentProviders.get(handle);
		if (!provider) {
			this._logService.warn(`No provider for handle ${handle}`);
			return;
		}

		// Old provider based implementation
		if (provider.provider.provideHandleOptionsChange) {
			try {
				const updatesToSend = Object.entries(updates).map(([optionId, value]) => ({
					optionId,
					value: value === undefined ? undefined : (typeof value === 'string' ? value : value.id)
				}));
				provider.provider.provideHandleOptionsChange(sessionResource, updatesToSend, token);
			} catch (error) {
				this._logService.error(`Error calling provideHandleOptionsChange for handle ${handle}, sessionResource ${sessionResource}:`, error);
			}
			return;
		}

		const controllerData = this.getChatSessionItemController(sessionResource.scheme);
		if (!controllerData || !controllerData.controller.getChatSessionInputState) {
			this._logService.warn(`No valid controller found for scheme ${sessionResource.scheme}`);
			return;
		}

		// Temporary workaround: input state changes for one resource are propagated to all
		// input states for the same resource type until we can make this session-specific.
		for (const inputState of controllerData?.inputStates ?? []) {
			// Update the selected items on the groups before firing the change event
			const updatedGroups = inputState.groups.map(group => {
				const update = updates[group.id];
				if (!update) {
					return group;
				}

				const selectedId = typeof update === 'string' ? update : update.id;
				const selectedItem = group.items.find(item => item.id === selectedId);
				if (!selectedItem) {
					return group;
				}
				return { ...group, selected: selectedItem };
			});

			// Use quiet setter to avoid notifying the main thread back (it's the source of this change)
			inputState._setGroups(updatedGroups);
			inputState._fireDidChange();
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
			const result = await provider.provideChatSessionProviderOptions(token);
			if (!result) {
				return;
			}
			const { optionGroups, newSessionOptions } = result;
			if (optionGroups) {
				const controllerData = this.getChatSessionItemController(entry.chatSessionScheme);
				if (controllerData) {
					controllerData.optionGroups = optionGroups;
				}
			}
			return {
				optionGroups,
				newSessionOptions,
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
		const resource = URI.revive(sessionResource);
		const entry = this._extHostChatSessions.get(resource);
		if (!entry) {
			this._logService.warn(`No chat session found for resource: ${sessionResource}`);
			return;
		}

		// Dispose input states associated with this session
		const controllerData = this.getChatSessionItemController(resource.scheme);
		if (controllerData) {
			this._disposeInputStatesForResource(controllerData.inputStates, resource);
		}

		entry.disposeCts.cancel();
		entry.sessionObj.sessionDisposables.dispose();
		this._extHostChatSessions.delete(resource);
	}

	async $invokeChatSessionRequestHandler(handle: number, sessionResource: UriComponents, request: IChatAgentRequest, history: any[], token: CancellationToken): Promise<IChatAgentResult> {
		const entry = this._extHostChatSessions.get(URI.revive(sessionResource));
		if (!entry || !entry.sessionObj.session.requestHandler) {
			return {};
		}

		const chatRequest = typeConvert.ChatAgentRequest.to(request, undefined, await this.getModelForRequest(request, entry.sessionObj.extension), request.modelConfiguration, [], new Map(), entry.sessionObj.extension, this._logService);

		const stream = entry.sessionObj.getActiveRequestStream(request);
		await entry.sessionObj.session.requestHandler(chatRequest, { history, yieldRequested: false }, stream.apiObject, token);

		// TODO: do we need to dispose the stream object?
		return {};
	}

	async $forkChatSession(handle: number, sessionResourceComponents: UriComponents, request: IChatSessionRequestHistoryItemDto | undefined, token: CancellationToken): Promise<ReturnType<typeof typeConvert.ChatSessionItem.from>> {
		const sessionResource = URI.revive(sessionResourceComponents);
		const entry = this._extHostChatSessions.get(sessionResource);
		if (!entry) {
			throw new Error(`No chat session found for resource ${sessionResource.toString()}`);
		}

		const requestTurn = this.convertRequestDtoToRequestTurn(request);

		const controllerData = this.getChatSessionItemController(sessionResource.scheme);
		if (controllerData?.controller.forkHandler) {
			const item = await controllerData.controller.forkHandler(sessionResource, requestTurn, token);
			return typeConvert.ChatSessionItem.from(item);
		}

		if (!entry.sessionObj.session.forkHandler) {
			throw new Error(`No fork handler for session ${sessionResource.toString()}`);
		}

		const item = await entry.sessionObj.session.forkHandler(sessionResource, requestTurn, token);
		return typeConvert.ChatSessionItem.from(item);
	}

	private convertRequestDtoToRequestTurn(request: IChatSessionRequestHistoryItemDto | undefined): extHostTypes.ChatRequestTurn | undefined {
		if (!request) {
			return undefined;
		}

		return new extHostTypes.ChatRequestTurn(
			request.prompt,
			request.command,
			[],
			request.participant,
			[],
			undefined,
			request.id,
			request.modelId,
			typeConvert.ChatRequestModeInstructions.to(request.modeInstructions),
		);
	}

	private getChatSessionItemController(chatSessionType: string) {
		for (const controllerData of this._chatSessionItemControllers.values()) {
			if (controllerData.chatSessionType === chatSessionType) {
				return controllerData;
			}
		}

		return undefined;
	}

	private _disposeInputStatesForResource(inputStates: Set<ChatSessionInputStateImpl>, resource: URI): void {
		for (const inputState of inputStates) {
			const inputResource = inputState.sessionResource ?? inputState.untitledSessionResource;
			if (inputResource && isEqual(resource, inputResource)) {
				inputState._dispose();
				inputStates.delete(inputState);
			}
		}
	}

	private _createInputStateFromOptions(
		groups: readonly vscode.ChatSessionProviderOptionGroup[],
		sessionOptions?: ReadonlyArray<{ optionId: string; value: string }>,
	): ChatSessionInputStateImpl {
		if (!sessionOptions?.length) {
			return new ChatSessionInputStateImpl(groups);
		}

		const resolvedGroups = groups.map(group => {
			const match = sessionOptions.find(o => o.optionId === group.id);
			if (!match) {
				return group;
			}
			const selectedItem = group.items.find(item => item.id === match.value);
			if (!selectedItem) {
				return group;
			}
			return { ...group, selected: selectedItem };
		});
		return new ChatSessionInputStateImpl(resolvedGroups);
	}

	/**
	 * Gets the input state for a session. This calls the controller's `getChatSessionInputState` handler if available,
	 * otherwise falls back to creating an input state from the session options.
	 */
	async getInputStateForSession(
		sessionResource: URI | undefined,
		initialSessionOptions: ReadonlyArray<{ optionId: string; value: string }> | undefined,
		token: CancellationToken,
	): Promise<vscode.ChatSessionInputState> {
		const scheme = sessionResource?.scheme;
		const controllerData = scheme ? this.getChatSessionItemController(scheme) : undefined;
		const resolvedResource = sessionResource && !isUntitledChatSession(sessionResource) ? sessionResource : undefined;
		if (controllerData?.controller.getChatSessionInputState) {
			const result = await controllerData.controller.getChatSessionInputState(
				resolvedResource,
				{ previousInputState: this._createInputStateFromOptions(controllerData.optionGroups ?? [], initialSessionOptions) },
				token,
			);
			if (result) {
				if (result instanceof ChatSessionInputStateImpl) {
					// Dispose any previous input states for this session resource
					if (sessionResource && controllerData) {
						this._disposeInputStatesForResource(controllerData.inputStates, sessionResource);
					}

					if (sessionResource && isUntitledChatSession(sessionResource)) {
						result.untitledSessionResource = sessionResource;
					} else if (sessionResource) {
						result.sessionResource = resolvedResource;
					}
				}
				return result;
			}
		}
		const fallback = this._createInputStateFromOptions(controllerData?.optionGroups ?? [], initialSessionOptions);
		fallback.sessionResource = resolvedResource;
		return fallback;
	}

	/**
	 * Wraps option group commands with proxy commands so that extensions using the new
	 * `getChatSessionInputState` API receive `{ inputState, sessionResource }` instead of just `sessionResource`.
	 *
	 * For controllers that do not implement the new API, commands are returned unchanged.
	 */
	private _wrapOptionGroupCommands(
		controllerHandle: number,
		groups: readonly vscode.ChatSessionProviderOptionGroup[],
	): readonly vscode.ChatSessionProviderOptionGroup[] {
		const controllerData = this._chatSessionItemControllers.get(controllerHandle);
		if (!controllerData?.controller.getChatSessionInputState) {
			return groups;
		}

		return groups.map(group => {
			if (!group.commands?.length) {
				return group;
			}
			return {
				...group,
				commands: group.commands.map(command => {
					const proxyId = `_chatSession.proxyCommand.${generateUuid()}`;
					this._proxyCommands.set(proxyId, { originalCommandId: command.command, controllerHandle });

					this.commands.registerCommand(true, proxyId, async (...args: unknown[]) => {
						// The main thread passes sessionResource as the first argument
						const sessionResource = args[0] instanceof URI ? args[0] : undefined;
						const inputState = await this.getInputStateForSession(
							sessionResource,
							undefined,
							CancellationToken.None,
						);
						// Call the original command with the new context object
						return this.commands.executeCommand(
							command.command,
							{ inputState, sessionResource },
							...(command.arguments ?? []),
						);
					});

					return { ...command, command: proxyId };
				}),
			};
		});
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
			modeInstructions: typeConvert.ChatRequestModeInstructions.from(turn.modeInstructions2),
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

		if (URI.isUri(value) && ref.name.startsWith(`prompt:`)) {
			if (ref.id.startsWith(PromptFileVariableKind.Instruction)) {
				return toPromptFileVariableEntry(value, PromptFileVariableKind.Instruction);
			}
			if (ref.id.startsWith(PromptFileVariableKind.InstructionReference)) {
				return toPromptFileVariableEntry(value, PromptFileVariableKind.InstructionReference);
			}
			if (ref.id.startsWith(PromptFileVariableKind.PromptFile)) {
				return toPromptFileVariableEntry(value, PromptFileVariableKind.PromptFile);
			}
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
			participant: turn.participant,
			details: turn.result?.details,
		};
	}

	async $refreshChatSessionItems(handle: number, token: CancellationToken): Promise<void> {
		const controllerData = this._chatSessionItemControllers.get(handle);
		if (!controllerData) {
			this._logService.warn(`No controller found for handle ${handle}`);
			return;
		}

		await controllerData.controller.refreshHandler(token);
	}

	async $newChatSessionItem(handle: number, request: IChatNewSessionRequestDto, token: CancellationToken): Promise<ReturnType<typeof typeConvert.ChatSessionItem.from> | undefined> {
		const controllerData = this._chatSessionItemControllers.get(handle);
		if (!controllerData) {
			this._logService.warn(`No controller found for handle ${handle}`);
			return undefined;
		}

		const handler = controllerData.controller.newChatSessionItemHandler;
		if (!handler) {
			return undefined;
		}

		const previousInputState = this._createInputStateFromOptions(controllerData.optionGroups ?? [], request.initialSessionOptions);
		let inputState: vscode.ChatSessionInputState;
		if (controllerData.controller.getChatSessionInputState) {
			inputState = await controllerData.controller.getChatSessionInputState(undefined, { previousInputState }, token);
		} else {
			inputState = previousInputState;
		}

		const item = await handler({
			request: {
				prompt: request.prompt,
				command: request.command
			},
			inputState,
		}, token);
		if (!item) {
			return undefined;
		}

		controllerData.controller.items.add(item);

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

	async $resolveChatSessionItem(handle: number, sessionResourceComponents: UriComponents, token: CancellationToken): Promise<ReturnType<typeof typeConvert.ChatSessionItem.from> | undefined> {
		const sessionResource = URI.revive(sessionResourceComponents);

		// Both the new `ChatSessionItemController.resolveChatSessionItem` and the deprecated
		// `ChatSessionItemProvider.resolveChatSessionItem` hooks are bridged onto the controller
		// surface, so a single code path handles both.
		const controllerData = this._chatSessionItemControllers.get(handle);
		if (!controllerData?.controller.resolveChatSessionItem) {
			return undefined;
		}

		const item = controllerData.controller.items.get(sessionResource);
		if (!item) {
			this._logService.warn(`No item found for session resource ${sessionResource.toString()}`);
			return undefined;
		}

		// The controller's resolve handler updates the item in the collection
		// (via items.add or by mutating properties). We re-read from the
		// collection after it completes to pick up the changes.
		await controllerData.controller.resolveChatSessionItem(item, token);

		const updatedItem = controllerData.controller.items.get(sessionResource);
		if (!updatedItem) {
			return undefined;
		}

		return typeConvert.ChatSessionItem.from(updatedItem);
	}

	async $provideChatSessionInputState(controllerHandle: number, sessionResourceComponents: UriComponents | undefined, token: CancellationToken): Promise<vscode.ChatSessionProviderOptionGroup[] | undefined> {
		const controllerData = this._chatSessionItemControllers.get(controllerHandle);
		if (!controllerData) {
			this._logService.warn(`No controller found for handle ${controllerHandle}`);
			return undefined;
		}

		const handler = controllerData.controller.getChatSessionInputState;
		if (!handler) {
			return undefined;
		}
		const sessionResource = sessionResourceComponents ? URI.revive(sessionResourceComponents) : undefined;
		const inputState = await handler(!sessionResource || isUntitledChatSession(sessionResource) ? undefined : sessionResource, { previousInputState: undefined }, token);
		if (!inputState) {
			return undefined;
		}

		if (inputState instanceof ChatSessionInputStateImpl && sessionResource) {
			// Dispose any previous input states for this session resource
			this._disposeInputStatesForResource(controllerData.inputStates, sessionResource);

			if (isUntitledChatSession(sessionResource)) {
				inputState.untitledSessionResource = sessionResource;
			} else {
				inputState.sessionResource = sessionResource;
			}
		}

		// Store the option groups for onSearch callbacks
		controllerData.optionGroups = inputState.groups;

		const wrappedGroups = this._wrapOptionGroupCommands(controllerHandle, inputState.groups);

		// Strip non-serializable fields (onSearch) before returning over the protocol
		return wrappedGroups.map(g => ({
			id: g.id,
			name: g.name,
			description: g.description,
			items: g.items,
			selected: g.selected,
			when: g.when,
			icon: g.icon,
			commands: g.commands,
			kind: g.kind,
		}));
	}
}
