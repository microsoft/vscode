/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { coalesce } from '../../../base/common/arrays.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../base/common/map.js';
import * as objects from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { SymbolKinds } from '../../../editor/common/languages.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IDiagnosticVariableEntryFilterData, PromptFileVariableKind, toPromptFileVariableEntry } from '../../contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatAgentLocation } from '../../contrib/chat/common/constants.js';
import { MainContext } from './extHost.protocol.js';
import { ChatAgentResponseStream } from './extHostChatAgents2.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import * as typeConvert from './extHostTypeConverters.js';
import { Diagnostic } from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';
import { isUntitledChatSession } from '../../contrib/chat/common/model/chatUri.js';
// #region Chat Session Input State
class ChatSessionInputStateImpl {
    #groups;
    #onChangedDelegate;
    #onDidChangeEmitter;
    constructor(groups, onChangedDelegate) {
        this.#onDidChangeEmitter = new Emitter();
        this.onDidChange = this.#onDidChangeEmitter.event;
        this.#groups = groups;
        this.#onChangedDelegate = onChangedDelegate;
    }
    get groups() {
        return this.#groups;
    }
    set groups(value) {
        this.#groups = value;
        this.#onChangedDelegate?.();
    }
    _fireDidChange() {
        this.#onDidChangeEmitter.fire();
    }
}
// #endregion
// #region Chat Session Item Controller
class ChatSessionItemImpl {
    #label;
    #iconPath;
    #description;
    #badge;
    #status;
    #archived;
    #tooltip;
    #timing;
    #changes;
    #metadata;
    #onChanged;
    constructor(resource, label, onChanged) {
        this.resource = resource;
        this.#label = label;
        this.#onChanged = onChanged;
    }
    get label() {
        return this.#label;
    }
    set label(value) {
        if (this.#label !== value) {
            this.#label = value;
            this.#onChanged();
        }
    }
    get iconPath() {
        return this.#iconPath;
    }
    set iconPath(value) {
        if (this.#iconPath !== value) {
            this.#iconPath = value;
            this.#onChanged();
        }
    }
    get description() {
        return this.#description;
    }
    set description(value) {
        if (this.#description !== value) {
            this.#description = value;
            this.#onChanged();
        }
    }
    get badge() {
        return this.#badge;
    }
    set badge(value) {
        if (this.#badge !== value) {
            this.#badge = value;
            this.#onChanged();
        }
    }
    get status() {
        return this.#status;
    }
    set status(value) {
        if (this.#status !== value) {
            this.#status = value;
            this.#onChanged();
        }
    }
    get archived() {
        return this.#archived;
    }
    set archived(value) {
        if (this.#archived !== value) {
            this.#archived = value;
            this.#onChanged();
        }
    }
    get tooltip() {
        return this.#tooltip;
    }
    set tooltip(value) {
        if (this.#tooltip !== value) {
            this.#tooltip = value;
            this.#onChanged();
        }
    }
    get timing() {
        return this.#timing;
    }
    set timing(value) {
        if (this.#timing !== value) {
            this.#timing = value;
            this.#onChanged();
        }
    }
    get changes() {
        return this.#changes;
    }
    set changes(value) {
        if (this.#changes !== value) {
            this.#changes = value;
            this.#onChanged();
        }
    }
    get metadata() {
        return this.#metadata;
    }
    set metadata(value) {
        if (value !== undefined) {
            try {
                JSON.stringify(value);
            }
            catch {
                throw new Error('metadata must be JSON-serializable');
            }
        }
        if (!objects.equals(this.#metadata, value)) {
            this.#metadata = value;
            this.#onChanged();
        }
    }
}
function computeItemsDelta(oldItems, newItems) {
    const delta = {
        addedOrUpdated: new ResourceMap(),
        removed: new ResourceSet(),
    };
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
function convertChatSessionDeltaToDto(delta) {
    return {
        addedOrUpdated: delta.addedOrUpdated ? Array.from(delta.addedOrUpdated.values(), typeConvert.ChatSessionItem.from) : [],
        removed: delta.removed ? Array.from(delta.removed.keys()) : []
    };
}
class ChatSessionItemCollectionImpl {
    #items = new ResourceMap();
    #proxy;
    #controllerHandle;
    constructor(controllerHandle, proxy) {
        this.#proxy = proxy;
        this.#controllerHandle = controllerHandle;
    }
    get size() {
        return this.#items.size;
    }
    replace(newItems) {
        if (!newItems.length && !this.#items.size) {
            // No change
            return;
        }
        const newItemsMap = new ResourceMap(newItems.map(item => [item.resource, item]));
        const delta = computeItemsDelta(this.#items, newItemsMap);
        if (!delta.addedOrUpdated?.size && !delta.removed?.size) {
            // No change
            return;
        }
        this.#items = newItemsMap;
        void this.#proxy.$updateChatSessionItems(this.#controllerHandle, convertChatSessionDeltaToDto(delta));
    }
    forEach(callback, thisArg) {
        for (const [_, item] of this.#items) {
            callback.call(thisArg, item, this);
        }
    }
    add(item) {
        const existing = this.#items.get(item.resource);
        if (existing && existing === item) {
            // We're adding the same item again
            return;
        }
        this.#items.set(item.resource, item);
        void this.#proxy.$addOrUpdateChatSessionItem(this.#controllerHandle, typeConvert.ChatSessionItem.from(item));
    }
    delete(resource) {
        if (this.#items.delete(resource)) {
            void this.#proxy.$updateChatSessionItems(this.#controllerHandle, {
                addedOrUpdated: [],
                removed: [resource]
            });
        }
    }
    get(resource) {
        return this.#items.get(resource);
    }
    [Symbol.iterator]() {
        return this.#items.entries();
    }
}
// #endregion
class ExtHostChatSession {
    constructor(session, extension, request, proxy, commandsConverter, sessionDisposables) {
        this.session = session;
        this.extension = extension;
        this.proxy = proxy;
        this.commandsConverter = commandsConverter;
        this.sessionDisposables = sessionDisposables;
        // Empty map since question carousel is designed for chat agents, not chat sessions
        this._pendingCarouselResolvers = new Map();
        this._stream = new ChatAgentResponseStream(extension, request, proxy, commandsConverter, sessionDisposables, this._pendingCarouselResolvers, CancellationToken.None);
    }
    get activeResponseStream() {
        return this._stream;
    }
    getActiveRequestStream(request) {
        return new ChatAgentResponseStream(this.extension, request, this.proxy, this.commandsConverter, this.sessionDisposables, this._pendingCarouselResolvers, CancellationToken.None);
    }
}
let ExtHostChatSessions = class ExtHostChatSessions extends Disposable {
    constructor(commands, _languageModels, _extHostRpc, _logService) {
        super();
        this.commands = commands;
        this._languageModels = _languageModels;
        this._extHostRpc = _extHostRpc;
        this._logService = _logService;
        this._itemControllerHandlePool = 0;
        this._chatSessionItemControllers = new Map();
        this._contentProviderHandlePool = 0;
        this._chatSessionContentProviders = new Map();
        /**
         * Map of uri -> chat sessions infos
         */
        this._extHostChatSessions = new ResourceMap();
        this._proxy = this._extHostRpc.getProxy(MainContext.MainThreadChatSessions);
        commands.registerArgumentProcessor({
            processArgument: (arg) => {
                if (arg && arg.$mid === 25 /* MarshalledId.AgentSessionContext */) {
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
    registerChatSessionItemProvider(extension, chatSessionType, provider) {
        // The legacy provider api is implemented using the new controller API on the backend
        const controllerHandle = this._itemControllerHandlePool++;
        const disposables = new DisposableStore();
        const onDidChangeChatSessionItemStateEmitter = disposables.add(new Emitter());
        const collection = new ChatSessionItemCollectionImpl(controllerHandle, this._proxy);
        const controller = {
            id: chatSessionType,
            items: collection,
            createChatSessionItem: (_resource, _label) => {
                throw new Error('Not implemented for providers');
            },
            createChatSessionInputState: (_options) => {
                return new ChatSessionInputStateImpl([]);
            },
            onDidChangeChatSessionItemState: onDidChangeChatSessionItemStateEmitter.event,
            newChatSessionItemHandler: undefined,
            dispose: () => {
                disposables.dispose();
            },
            refreshHandler: async (token) => {
                const items = await provider.provideChatSessionItems(token) ?? [];
                collection.replace(items);
            },
        };
        this._chatSessionItemControllers.set(controllerHandle, { chatSessionType: chatSessionType, controller, extension, disposable: disposables, onDidChangeChatSessionItemStateEmitter, inputStates: new Set() });
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
    createChatSessionItemController(extension, id, refreshHandler) {
        const controllerHandle = this._itemControllerHandlePool++;
        const disposables = new DisposableStore();
        let isDisposed = false;
        let newChatSessionItemHandler;
        let forkHandler;
        let provideChatSessionInputStateHandler;
        const onDidChangeChatSessionItemStateEmitter = disposables.add(new Emitter());
        const inputStates = new Set();
        const collection = new ChatSessionItemCollectionImpl(controllerHandle, this._proxy);
        const controller = Object.freeze({
            id,
            refreshHandler: async (refreshToken) => {
                if (isDisposed) {
                    throw new Error('ChatSessionItemController has been disposed');
                }
                this._logService.trace(`ExtHostChatSessions. Controller(${id}).refresh()`);
                await refreshHandler(refreshToken);
            },
            items: collection,
            onDidChangeChatSessionItemState: onDidChangeChatSessionItemStateEmitter.event,
            createChatSessionItem: (resource, label) => {
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
            set newChatSessionItemHandler(handler) { newChatSessionItemHandler = handler; },
            get forkHandler() { return forkHandler; },
            set forkHandler(handler) { forkHandler = handler; },
            get getChatSessionInputState() { return provideChatSessionInputStateHandler; },
            set getChatSessionInputState(handler) { provideChatSessionInputStateHandler = handler; },
            createChatSessionInputState: (groups) => {
                if (isDisposed) {
                    throw new Error('ChatSessionItemController has been disposed');
                }
                const inputState = new ChatSessionInputStateImpl(groups, () => {
                    // Store updated option groups on the controller entry
                    const entry = this._chatSessionItemControllers.get(controllerHandle);
                    if (entry) {
                        entry.optionGroups = inputState.groups;
                    }
                    const serializableGroups = inputState.groups.map(g => ({
                        id: g.id,
                        name: g.name,
                        description: g.description,
                        items: g.items,
                        selected: g.selected,
                        when: g.when,
                        icon: g.icon,
                        commands: g.commands,
                    }));
                    void this._proxy.$updateChatSessionInputState(controllerHandle, serializableGroups);
                });
                inputStates.add(inputState);
                return inputState;
            },
            dispose: () => {
                isDisposed = true;
                disposables.dispose();
            },
        });
        this._chatSessionItemControllers.set(controllerHandle, { controller, extension, disposable: disposables, chatSessionType: id, onDidChangeChatSessionItemStateEmitter, inputStates });
        // Register the controller with the main thread
        this._proxy.$registerChatSessionItemController(controllerHandle, id);
        disposables.add(toDisposable(() => {
            this._chatSessionItemControllers.delete(controllerHandle);
            this._proxy.$unregisterChatSessionItemController(controllerHandle);
        }));
        return controller;
    }
    registerChatSessionContentProvider(extension, chatSessionScheme, chatParticipant, provider, capabilities) {
        const handle = this._contentProviderHandlePool++;
        const disposables = new DisposableStore();
        this._chatSessionContentProviders.set(handle, { chatSessionScheme, provider, extension, capabilities, disposable: disposables });
        this._proxy.$registerChatSessionContentProvider(handle, chatSessionScheme);
        if (provider.onDidChangeChatSessionOptions) {
            disposables.add(provider.onDidChangeChatSessionOptions(evt => {
                const updates = Object.create(null);
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
    async $provideChatSessionContent(handle, sessionResourceComponents, context, token) {
        const provider = this._chatSessionContentProviders.get(handle);
        if (!provider) {
            throw new Error(`No provider for handle ${handle}`);
        }
        const sessionResource = URI.revive(sessionResourceComponents);
        const controllerData = this.getChatSessionItemController(sessionResource.scheme);
        let inputState;
        if (controllerData?.controller.getChatSessionInputState) {
            const result = await controllerData.controller.getChatSessionInputState(isUntitledChatSession(sessionResource) ? undefined : sessionResource, {
                previousInputState: this._createInputStateFromOptions(controllerData.optionGroups ?? [], context.initialSessionOptions),
            }, token);
            if (result) {
                inputState = result;
            }
        }
        inputState ??= this._createInputStateFromOptions(controllerData?.optionGroups ?? [], context.initialSessionOptions);
        const session = await provider.provider.provideChatSessionContent(sessionResource, token, {
            sessionOptions: context?.initialSessionOptions ?? [],
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
                }
                else {
                    return this.convertResponseTurn(turn, sessionDisposables);
                }
            })
        };
    }
    async $provideHandleOptionsChange(handle, sessionResourceComponents, updates, token) {
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
            const updatesToSend = Object.entries(updates).map(([optionId, value]) => ({
                optionId,
                value: value === undefined ? undefined : (typeof value === 'string' ? value : value.id)
            }));
            provider.provider.provideHandleOptionsChange(sessionResource, updatesToSend, token);
        }
        catch (error) {
            this._logService.error(`Error calling provideHandleOptionsChange for handle ${handle}, sessionResource ${sessionResource}:`, error);
        }
        // Temporary workaround: input state changes for one resource are propagated to all
        // input states for the same resource type until we can make this session-specific.
        const controllerData = this.getChatSessionItemController(sessionResource.scheme);
        for (const inputState of controllerData?.inputStates ?? []) {
            inputState._fireDidChange();
        }
    }
    async $provideChatSessionProviderOptions(handle, token) {
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
        }
        catch (error) {
            this._logService.error(`Error calling provideChatSessionProviderOptions for handle ${handle}:`, error);
            return;
        }
    }
    async $interruptChatSessionActiveResponse(providerHandle, sessionResource, requestId) {
        const entry = this._extHostChatSessions.get(URI.revive(sessionResource));
        entry?.disposeCts.cancel();
    }
    async $disposeChatSessionContent(providerHandle, sessionResource) {
        const entry = this._extHostChatSessions.get(URI.revive(sessionResource));
        if (!entry) {
            this._logService.warn(`No chat session found for resource: ${sessionResource}`);
            return;
        }
        entry.disposeCts.cancel();
        entry.sessionObj.sessionDisposables.dispose();
        this._extHostChatSessions.delete(URI.revive(sessionResource));
    }
    async $invokeChatSessionRequestHandler(handle, sessionResource, request, history, token) {
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
    async $forkChatSession(handle, sessionResourceComponents, request, token) {
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
    convertRequestDtoToRequestTurn(request) {
        if (!request) {
            return undefined;
        }
        return new extHostTypes.ChatRequestTurn(request.prompt, request.command, [], request.participant, [], undefined, request.id, request.modelId, typeConvert.ChatRequestModeInstructions.to(request.modeInstructions));
    }
    getChatSessionItemController(chatSessionType) {
        for (const controllerData of this._chatSessionItemControllers.values()) {
            if (controllerData.chatSessionType === chatSessionType) {
                return controllerData;
            }
        }
        return undefined;
    }
    _createInputStateFromOptions(groups, sessionOptions) {
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
    async getModelForRequest(request, extension) {
        let model;
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
    convertRequestTurn(turn) {
        const variables = turn.references.map(ref => this.convertReferenceToVariable(ref));
        return {
            type: 'request',
            id: turn.id,
            prompt: turn.prompt,
            participant: turn.participant,
            command: turn.command,
            variableData: variables.length > 0 ? { variables } : undefined,
            modelId: turn.modelId,
            modeInstructions: typeConvert.ChatRequestModeInstructions.from(turn.modeInstructions2),
        };
    }
    convertReferenceToVariable(ref) {
        const value = ref.value && typeof ref.value === 'object' && 'uri' in ref.value && 'range' in ref.value
            ? typeConvert.Location.from(ref.value)
            : ref.value;
        const range = ref.range ? { start: ref.range[0], endExclusive: ref.range[1] } : undefined;
        if (value && value instanceof extHostTypes.ChatReferenceDiagnostic && Array.isArray(value.diagnostics) && value.diagnostics.length && value.diagnostics[0][1].length) {
            const marker = Diagnostic.from(value.diagnostics[0][1][0]);
            const refValue = {
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
                symbolKind: 6 /* SymbolKind.Property */,
                // We never send this information to extensions, so default to Property
                icon: SymbolKinds.toIcon(6 /* SymbolKind.Property */),
                kind: 'symbol',
                range,
            };
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
            kind: isFolder ? 'directory' : isFile ? 'file' : 'generic'
        };
    }
    convertResponseTurn(turn, sessionDisposables) {
        const parts = coalesce(turn.response.map(r => typeConvert.ChatResponsePart.from(r, this.commands.converter, sessionDisposables)));
        return {
            type: 'response',
            parts,
            participant: turn.participant
        };
    }
    async $refreshChatSessionItems(handle, token) {
        const controllerData = this._chatSessionItemControllers.get(handle);
        if (!controllerData) {
            this._logService.warn(`No controller found for handle ${handle}`);
            return;
        }
        await controllerData.controller.refreshHandler(token);
    }
    async $newChatSessionItem(handle, request, token) {
        const controllerData = this._chatSessionItemControllers.get(handle);
        if (!controllerData) {
            this._logService.warn(`No controller found for handle ${handle}`);
            return undefined;
        }
        const handler = controllerData.controller.newChatSessionItemHandler;
        if (!handler) {
            return undefined;
        }
        let inputState;
        if (controllerData.controller.getChatSessionInputState) {
            inputState = await controllerData.controller.getChatSessionInputState(undefined, { previousInputState: this._createInputStateFromOptions(controllerData.optionGroups ?? [], request.initialSessionOptions) }, token);
        }
        else {
            inputState = new ChatSessionInputStateImpl([]);
        }
        const item = await handler({
            request: {
                prompt: request.prompt,
                command: request.command
            },
            sessionOptions: request.initialSessionOptions ?? [],
            inputState,
        }, token);
        if (!item) {
            return undefined;
        }
        return typeConvert.ChatSessionItem.from(item);
    }
    $onDidChangeChatSessionItemState(controllerHandle, sessionResourceComponents, archived) {
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
    async $provideChatSessionInputState(controllerHandle, sessionResourceComponents, token) {
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
        const inputState = await handler(sessionResource, { previousInputState: undefined }, token);
        if (!inputState) {
            return undefined;
        }
        // Store the option groups for onSearch callbacks
        controllerData.optionGroups = inputState.groups;
        // Strip non-serializable fields (onSearch) before returning over the protocol
        return inputState.groups.map(g => ({
            id: g.id,
            name: g.name,
            description: g.description,
            items: g.items,
            selected: g.selected,
            when: g.when,
            icon: g.icon,
            commands: g.commands,
        }));
    }
};
ExtHostChatSessions = __decorate([
    __param(2, IExtHostRpcService),
    __param(3, ILogService)
], ExtHostChatSessions);
export { ExtHostChatSessions };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdENoYXRTZXNzaW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RDaGF0U2Vzc2lvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRTFELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RixPQUFPLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRXZFLE9BQU8sS0FBSyxPQUFPLE1BQU0saUNBQWlDLENBQUM7QUFDM0QsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQWMsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFOUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBNkIsa0NBQWtDLEVBQXdCLHNCQUFzQixFQUFFLHlCQUF5QixFQUFFLE1BQU0sOERBQThELENBQUM7QUFFdE4sT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFHM0UsT0FBTyxFQUFvSyxXQUFXLEVBQTBELE1BQU0sdUJBQXVCLENBQUM7QUFDOVEsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFHbEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDNUQsT0FBTyxLQUFLLFdBQVcsTUFBTSw0QkFBNEIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDeEQsT0FBTyxLQUFLLFlBQVksTUFBTSxtQkFBbUIsQ0FBQztBQUNsRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUluRixtQ0FBbUM7QUFFbkMsTUFBTSx5QkFBeUI7SUFDOUIsT0FBTyxDQUFtRDtJQUNqRCxrQkFBa0IsQ0FBMkI7SUFFN0MsbUJBQW1CLENBQXVCO0lBR25ELFlBQVksTUFBd0QsRUFBRSxpQkFBOEI7UUFIM0Ysd0JBQW1CLEdBQUcsSUFBSSxPQUFPLEVBQVEsQ0FBQztRQUMxQyxnQkFBVyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7UUFHckQsSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7UUFDdEIsSUFBSSxDQUFDLGtCQUFrQixHQUFHLGlCQUFpQixDQUFDO0lBQzdDLENBQUM7SUFFRCxJQUFJLE1BQU07UUFDVCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDckIsQ0FBQztJQUVELElBQUksTUFBTSxDQUFDLEtBQXVEO1FBQ2pFLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO1FBQ3JCLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUVELGNBQWM7UUFDYixJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDakMsQ0FBQztDQUNEO0FBRUQsYUFBYTtBQUViLHVDQUF1QztBQUV2QyxNQUFNLG1CQUFtQjtJQUN4QixNQUFNLENBQVM7SUFDZixTQUFTLENBQW1CO0lBQzVCLFlBQVksQ0FBa0M7SUFDOUMsTUFBTSxDQUFrQztJQUN4QyxPQUFPLENBQTRCO0lBQ25DLFNBQVMsQ0FBVztJQUNwQixRQUFRLENBQWtDO0lBQzFDLE9BQU8sQ0FBcUI7SUFDNUIsUUFBUSxDQUE0QztJQUNwRCxTQUFTLENBQXVDO0lBQ2hELFVBQVUsQ0FBYTtJQUl2QixZQUFZLFFBQW9CLEVBQUUsS0FBYSxFQUFFLFNBQXFCO1FBQ3JFLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBQ3BCLElBQUksQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDO0lBQzdCLENBQUM7SUFFRCxJQUFJLEtBQUs7UUFDUixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDcEIsQ0FBQztJQUVELElBQUksS0FBSyxDQUFDLEtBQWE7UUFDdEIsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQzNCLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1lBQ3BCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNuQixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksUUFBUTtRQUNYLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQztJQUN2QixDQUFDO0lBRUQsSUFBSSxRQUFRLENBQUMsS0FBa0M7UUFDOUMsSUFBSSxJQUFJLENBQUMsU0FBUyxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNuQixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksV0FBVztRQUNkLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQztJQUMxQixDQUFDO0lBRUQsSUFBSSxXQUFXLENBQUMsS0FBaUQ7UUFDaEUsSUFBSSxJQUFJLENBQUMsWUFBWSxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQ2pDLElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDO1lBQzFCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNuQixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksS0FBSztRQUNSLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUNwQixDQUFDO0lBRUQsSUFBSSxLQUFLLENBQUMsS0FBaUQ7UUFDMUQsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQzNCLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1lBQ3BCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNuQixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksTUFBTTtRQUNULE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztJQUNyQixDQUFDO0lBRUQsSUFBSSxNQUFNLENBQUMsS0FBMkM7UUFDckQsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO1lBQ3JCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNuQixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksUUFBUTtRQUNYLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQztJQUN2QixDQUFDO0lBRUQsSUFBSSxRQUFRLENBQUMsS0FBMEI7UUFDdEMsSUFBSSxJQUFJLENBQUMsU0FBUyxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNuQixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksT0FBTztRQUNWLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUN0QixDQUFDO0lBRUQsSUFBSSxPQUFPLENBQUMsS0FBaUQ7UUFDNUQsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO1lBQ3RCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNuQixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksTUFBTTtRQUNULE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztJQUNyQixDQUFDO0lBRUQsSUFBSSxNQUFNLENBQUMsS0FBb0M7UUFDOUMsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO1lBQ3JCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNuQixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksT0FBTztRQUNWLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUN0QixDQUFDO0lBRUQsSUFBSSxPQUFPLENBQUMsS0FBMkQ7UUFDdEUsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO1lBQ3RCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNuQixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksUUFBUTtRQUNYLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQztJQUN2QixDQUFDO0lBRUQsSUFBSSxRQUFRLENBQUMsS0FBc0Q7UUFDbEUsSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDekIsSUFBSSxDQUFDO2dCQUNKLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdkIsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUixNQUFNLElBQUksS0FBSyxDQUFDLG9DQUFvQyxDQUFDLENBQUM7WUFDdkQsQ0FBQztRQUNGLENBQUM7UUFDRCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDNUMsSUFBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7WUFDdkIsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ25CLENBQUM7SUFDRixDQUFDO0NBQ0Q7QUFPRCxTQUFTLGlCQUFpQixDQUFDLFFBQTZDLEVBQUUsUUFBNkM7SUFDdEgsTUFBTSxLQUFLLEdBQUc7UUFDYixjQUFjLEVBQUUsSUFBSSxXQUFXLEVBQTBCO1FBQ3pELE9BQU8sRUFBRSxJQUFJLFdBQVcsRUFBRTtLQUNDLENBQUM7SUFFN0IsS0FBSyxNQUFNLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQy9DLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDMUMsSUFBSSxPQUFPLEtBQUssT0FBTyxFQUFFLENBQUM7WUFDekIsS0FBSyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ2hELENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxNQUFNLFdBQVcsSUFBSSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQztRQUMzQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO1lBQ2hDLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ2hDLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsU0FBUyw0QkFBNEIsQ0FBQyxLQUF1QjtJQUM1RCxPQUFPO1FBQ04sY0FBYyxFQUFFLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxXQUFXLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO1FBQ3ZILE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtLQUM5RCxDQUFDO0FBQ0gsQ0FBQztBQUVELE1BQU0sNkJBQTZCO0lBQ2xDLE1BQU0sR0FBRyxJQUFJLFdBQVcsRUFBMEIsQ0FBQztJQUMxQyxNQUFNLENBQXVDO0lBQzdDLGlCQUFpQixDQUFTO0lBRW5DLFlBQVksZ0JBQXdCLEVBQUUsS0FBMkM7UUFDaEYsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDcEIsSUFBSSxDQUFDLGlCQUFpQixHQUFHLGdCQUFnQixDQUFDO0lBQzNDLENBQUM7SUFFRCxJQUFJLElBQUk7UUFDUCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ3pCLENBQUM7SUFFRCxPQUFPLENBQUMsUUFBMkM7UUFDbEQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQzNDLFlBQVk7WUFDWixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFHLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFVLENBQUMsQ0FBQyxDQUFDO1FBRTFGLE1BQU0sS0FBSyxHQUFHLGlCQUFpQixDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDMUQsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQztZQUN6RCxZQUFZO1lBQ1osT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsTUFBTSxHQUFHLFdBQVcsQ0FBQztRQUMxQixLQUFLLElBQUksQ0FBQyxNQUFNLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLDRCQUE0QixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDdkcsQ0FBQztJQUVELE9BQU8sQ0FBQyxRQUFpRyxFQUFFLE9BQWE7UUFDdkgsS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNyQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDcEMsQ0FBQztJQUNGLENBQUM7SUFFRCxHQUFHLENBQUMsSUFBNEI7UUFDL0IsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2hELElBQUksUUFBUSxJQUFJLFFBQVEsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUNuQyxtQ0FBbUM7WUFDbkMsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JDLEtBQUssSUFBSSxDQUFDLE1BQU0sQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsV0FBVyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUM5RyxDQUFDO0lBRUQsTUFBTSxDQUFDLFFBQW9CO1FBQzFCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUNsQyxLQUFLLElBQUksQ0FBQyxNQUFNLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFO2dCQUNoRSxjQUFjLEVBQUUsRUFBRTtnQkFDbEIsT0FBTyxFQUFFLENBQUMsUUFBUSxDQUFDO2FBQ25CLENBQUMsQ0FBQztRQUNKLENBQUM7SUFDRixDQUFDO0lBRUQsR0FBRyxDQUFDLFFBQW9CO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVELENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQztRQUNoQixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDOUIsQ0FBQztDQUNEO0FBRUQsYUFBYTtBQUViLE1BQU0sa0JBQWtCO0lBS3ZCLFlBQ2lCLE9BQTJCLEVBQzNCLFNBQWdDLEVBQ2hELE9BQTBCLEVBQ1YsS0FBOEIsRUFDOUIsaUJBQW9DLEVBQ3BDLGtCQUFtQztRQUxuQyxZQUFPLEdBQVAsT0FBTyxDQUFvQjtRQUMzQixjQUFTLEdBQVQsU0FBUyxDQUF1QjtRQUVoQyxVQUFLLEdBQUwsS0FBSyxDQUF5QjtRQUM5QixzQkFBaUIsR0FBakIsaUJBQWlCLENBQW1CO1FBQ3BDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBaUI7UUFUcEQsbUZBQW1GO1FBQ2xFLDhCQUF5QixHQUFHLElBQUksR0FBRyxFQUE2RSxDQUFDO1FBVWpJLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSx1QkFBdUIsQ0FBQyxTQUFTLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLENBQUMseUJBQXlCLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdEssQ0FBQztJQUVELElBQUksb0JBQW9CO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztJQUNyQixDQUFDO0lBRUQsc0JBQXNCLENBQUMsT0FBMEI7UUFDaEQsT0FBTyxJQUFJLHVCQUF1QixDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMseUJBQXlCLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbEwsQ0FBQztDQUNEO0FBRU0sSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxVQUFVO0lBNEJsRCxZQUNrQixRQUF5QixFQUN6QixlQUFzQyxFQUNuQyxXQUFnRCxFQUN2RCxXQUF5QztRQUV0RCxLQUFLLEVBQUUsQ0FBQztRQUxTLGFBQVEsR0FBUixRQUFRLENBQWlCO1FBQ3pCLG9CQUFlLEdBQWYsZUFBZSxDQUF1QjtRQUNsQixnQkFBVyxHQUFYLFdBQVcsQ0FBb0I7UUFDdEMsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUE3Qi9DLDhCQUF5QixHQUFHLENBQUMsQ0FBQztRQUNyQixnQ0FBMkIsR0FBRyxJQUFJLEdBQUcsRUFRbEQsQ0FBQztRQUVHLCtCQUEwQixHQUFHLENBQUMsQ0FBQztRQUN0QixpQ0FBNEIsR0FBRyxJQUFJLEdBQUcsRUFNbkQsQ0FBQztRQUVMOztXQUVHO1FBQ2MseUJBQW9CLEdBQUcsSUFBSSxXQUFXLEVBQTZGLENBQUM7UUFTcEosSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUU1RSxRQUFRLENBQUMseUJBQXlCLENBQUM7WUFDbEMsZUFBZSxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUU7Z0JBQ3hCLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLDhDQUFxQyxFQUFFLENBQUM7b0JBQzFELE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDO29CQUN0QyxLQUFLLE1BQU0sRUFBRSxVQUFVLEVBQUUsSUFBSSxJQUFJLENBQUMsMkJBQTJCLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQzt3QkFDeEUsTUFBTSxJQUFJLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7d0JBQzVDLElBQUksSUFBSSxFQUFFLENBQUM7NEJBQ1YsT0FBTyxJQUFJLENBQUM7d0JBQ2IsQ0FBQztvQkFDRixDQUFDO29CQUVELElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLG1DQUFtQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO29CQUNyRSxPQUFPLEdBQUcsQ0FBQztnQkFDWixDQUFDO2dCQUVELE9BQU8sR0FBRyxDQUFDO1lBQ1osQ0FBQztTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCwrQkFBK0IsQ0FBQyxTQUFnQyxFQUFFLGVBQXVCLEVBQUUsUUFBd0M7UUFDbEkscUZBQXFGO1FBQ3JGLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDMUQsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUUxQyxNQUFNLHNDQUFzQyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLEVBQTBCLENBQUMsQ0FBQztRQUV0RyxNQUFNLFVBQVUsR0FBRyxJQUFJLDZCQUE2QixDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVwRixNQUFNLFVBQVUsR0FBcUM7WUFDcEQsRUFBRSxFQUFFLGVBQWU7WUFDbkIsS0FBSyxFQUFFLFVBQVU7WUFDakIscUJBQXFCLEVBQUUsQ0FBQyxTQUFxQixFQUFFLE1BQWMsRUFBRSxFQUFFO2dCQUNoRSxNQUFNLElBQUksS0FBSyxDQUFDLCtCQUErQixDQUFDLENBQUM7WUFDbEQsQ0FBQztZQUNELDJCQUEyQixFQUFFLENBQUMsUUFBaUQsRUFBRSxFQUFFO2dCQUNsRixPQUFPLElBQUkseUJBQXlCLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDMUMsQ0FBQztZQUNELCtCQUErQixFQUFFLHNDQUFzQyxDQUFDLEtBQUs7WUFDN0UseUJBQXlCLEVBQUUsU0FBUztZQUNwQyxPQUFPLEVBQUUsR0FBRyxFQUFFO2dCQUNiLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN2QixDQUFDO1lBQ0QsY0FBYyxFQUFFLEtBQUssRUFBRSxLQUErQixFQUFFLEVBQUU7Z0JBQ3pELE1BQU0sS0FBSyxHQUFHLE1BQU0sUUFBUSxDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDbEUsVUFBVSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMzQixDQUFDO1NBQ0QsQ0FBQztRQUVGLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxlQUFlLEVBQUUsZUFBZSxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxzQ0FBc0MsRUFBRSxXQUFXLEVBQUUsSUFBSSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDN00sSUFBSSxDQUFDLE1BQU0sQ0FBQyxrQ0FBa0MsQ0FBQyxnQkFBZ0IsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUVsRixJQUFJLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxDQUFDO1lBQzFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLDJCQUEyQixDQUFDLEdBQUcsRUFBRTtnQkFDekQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsbURBQW1ELGVBQWUsRUFBRSxDQUFDLENBQUM7Z0JBQzdGLDhHQUE4RztnQkFDOUcsd0dBQXdHO2dCQUN4RyxxRkFBcUY7Z0JBQ3JGLFVBQVUsQ0FBQyxjQUFjLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbkQsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxJQUFJLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxDQUFDO1lBQ3pDLFdBQVcsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7Z0JBQ3pELE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUNqQyxJQUFJLENBQUMsTUFBTSxDQUFDLDJCQUEyQixDQUFDLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2pHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO1FBRUQsT0FBTztZQUNOLE9BQU8sRUFBRSxHQUFHLEVBQUU7Z0JBQ2IsSUFBSSxDQUFDLDJCQUEyQixDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUMxRCxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ3RCLElBQUksQ0FBQyxNQUFNLENBQUMsb0NBQW9DLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUNwRSxDQUFDO1NBQ0QsQ0FBQztJQUNILENBQUM7SUFFRCwrQkFBK0IsQ0FBQyxTQUFnQyxFQUFFLEVBQVUsRUFBRSxjQUFtRTtRQUNoSixNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1FBQzFELE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFFMUMsSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDO1FBQ3ZCLElBQUkseUJBQXdGLENBQUM7UUFDN0YsSUFBSSxXQUE0RCxDQUFDO1FBQ2pFLElBQUksbUNBQWlHLENBQUM7UUFDdEcsTUFBTSxzQ0FBc0MsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUEwQixDQUFDLENBQUM7UUFDdEcsTUFBTSxXQUFXLEdBQUcsSUFBSSxHQUFHLEVBQTZCLENBQUM7UUFFekQsTUFBTSxVQUFVLEdBQUcsSUFBSSw2QkFBNkIsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFcEYsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBbUM7WUFDbEUsRUFBRTtZQUNGLGNBQWMsRUFBRSxLQUFLLEVBQUUsWUFBK0IsRUFBRSxFQUFFO2dCQUN6RCxJQUFJLFVBQVUsRUFBRSxDQUFDO29CQUNoQixNQUFNLElBQUksS0FBSyxDQUFDLDZDQUE2QyxDQUFDLENBQUM7Z0JBQ2hFLENBQUM7Z0JBRUQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsbUNBQW1DLEVBQUUsYUFBYSxDQUFDLENBQUM7Z0JBQzNFLE1BQU0sY0FBYyxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ3BDLENBQUM7WUFDRCxLQUFLLEVBQUUsVUFBVTtZQUNqQiwrQkFBK0IsRUFBRSxzQ0FBc0MsQ0FBQyxLQUFLO1lBQzdFLHFCQUFxQixFQUFFLENBQUMsUUFBb0IsRUFBRSxLQUFhLEVBQUUsRUFBRTtnQkFDOUQsSUFBSSxVQUFVLEVBQUUsQ0FBQztvQkFDaEIsTUFBTSxJQUFJLEtBQUssQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO2dCQUNoRSxDQUFDO2dCQUVELE1BQU0sSUFBSSxHQUFHLElBQUksbUJBQW1CLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUU7b0JBQzFELDZHQUE2RztvQkFDN0csSUFBSSxVQUFVLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO3dCQUN2QyxLQUFLLElBQUksQ0FBQyxNQUFNLENBQUMsMkJBQTJCLENBQUMsZ0JBQWdCLEVBQUUsV0FBVyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDeEcsQ0FBQztnQkFDRixDQUFDLENBQUMsQ0FBQztnQkFDSCxPQUFPLElBQUksQ0FBQztZQUNiLENBQUM7WUFDRCxJQUFJLHlCQUF5QixLQUFLLE9BQU8seUJBQXlCLENBQUMsQ0FBQyxDQUFDO1lBQ3JFLElBQUkseUJBQXlCLENBQUMsT0FBc0UsSUFBSSx5QkFBeUIsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzlJLElBQUksV0FBVyxLQUFLLE9BQU8sV0FBVyxDQUFDLENBQUMsQ0FBQztZQUN6QyxJQUFJLFdBQVcsQ0FBQyxPQUF3RCxJQUFJLFdBQVcsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3BHLElBQUksd0JBQXdCLEtBQUssT0FBTyxtQ0FBbUMsQ0FBQyxDQUFDLENBQUM7WUFDOUUsSUFBSSx3QkFBd0IsQ0FBQyxPQUFxRSxJQUFJLG1DQUFtQyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDdEosMkJBQTJCLEVBQUUsQ0FBQyxNQUErQyxFQUFFLEVBQUU7Z0JBQ2hGLElBQUksVUFBVSxFQUFFLENBQUM7b0JBQ2hCLE1BQU0sSUFBSSxLQUFLLENBQUMsNkNBQTZDLENBQUMsQ0FBQztnQkFDaEUsQ0FBQztnQkFFRCxNQUFNLFVBQVUsR0FBRyxJQUFJLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUU7b0JBQzdELHNEQUFzRDtvQkFDdEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLDJCQUEyQixDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO29CQUNyRSxJQUFJLEtBQUssRUFBRSxDQUFDO3dCQUNYLEtBQUssQ0FBQyxZQUFZLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FBQztvQkFDeEMsQ0FBQztvQkFDRCxNQUFNLGtCQUFrQixHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQzt3QkFDdEQsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFO3dCQUNSLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSTt3QkFDWixXQUFXLEVBQUUsQ0FBQyxDQUFDLFdBQVc7d0JBQzFCLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSzt3QkFDZCxRQUFRLEVBQUUsQ0FBQyxDQUFDLFFBQVE7d0JBQ3BCLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSTt3QkFDWixJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUk7d0JBQ1osUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRO3FCQUNwQixDQUFDLENBQUMsQ0FBQztvQkFDSixLQUFLLElBQUksQ0FBQyxNQUFNLENBQUMsNEJBQTRCLENBQUMsZ0JBQWdCLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztnQkFDckYsQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDNUIsT0FBTyxVQUFVLENBQUM7WUFDbkIsQ0FBQztZQUNELE9BQU8sRUFBRSxHQUFHLEVBQUU7Z0JBQ2IsVUFBVSxHQUFHLElBQUksQ0FBQztnQkFDbEIsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3ZCLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMkJBQTJCLENBQUMsR0FBRyxDQUFDLGdCQUFnQixFQUFFLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRSxFQUFFLEVBQUUsc0NBQXNDLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUVyTCwrQ0FBK0M7UUFDL0MsSUFBSSxDQUFDLE1BQU0sQ0FBQyxrQ0FBa0MsQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVyRSxXQUFXLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUU7WUFDakMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1lBQzFELElBQUksQ0FBQyxNQUFNLENBQUMsb0NBQW9DLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNwRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosT0FBTyxVQUFVLENBQUM7SUFDbkIsQ0FBQztJQUVELGtDQUFrQyxDQUFDLFNBQWdDLEVBQUUsaUJBQXlCLEVBQUUsZUFBdUMsRUFBRSxRQUEyQyxFQUFFLFlBQTZDO1FBQ2xPLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO1FBQ2pELE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFFMUMsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUNqSSxJQUFJLENBQUMsTUFBTSxDQUFDLG1DQUFtQyxDQUFDLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBRTNFLElBQUksUUFBUSxDQUFDLDZCQUE2QixFQUFFLENBQUM7WUFDNUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsNkJBQTZCLENBQUMsR0FBRyxDQUFDLEVBQUU7Z0JBQzVELE1BQU0sT0FBTyxHQUE0RCxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUM3RixLQUFLLE1BQU0sTUFBTSxJQUFJLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDbEMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDO2dCQUN6QyxDQUFDO2dCQUNELElBQUksQ0FBQyxNQUFNLENBQUMsOEJBQThCLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDM0UsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxJQUFJLFFBQVEsQ0FBQyxxQ0FBcUMsRUFBRSxDQUFDO1lBQ3BELFdBQVcsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLHFDQUFxQyxDQUFDLEdBQUcsRUFBRTtnQkFDbkUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxzQ0FBc0MsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM1RCxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELE9BQU8sSUFBSSxZQUFZLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRTtZQUN2QyxJQUFJLENBQUMsNEJBQTRCLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2pELFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN0QixJQUFJLENBQUMsTUFBTSxDQUFDLHFDQUFxQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzNELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxNQUFjLEVBQUUseUJBQXdDLEVBQUUsT0FBcUMsRUFBRSxLQUF3QjtRQUN6SixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsNEJBQTRCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQy9ELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsMEJBQTBCLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDckQsQ0FBQztRQUVELE1BQU0sZUFBZSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUU5RCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsNEJBQTRCLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2pGLElBQUksVUFBd0MsQ0FBQztRQUM3QyxJQUFJLGNBQWMsRUFBRSxVQUFVLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztZQUN6RCxNQUFNLE1BQU0sR0FBRyxNQUFNLGNBQWMsQ0FBQyxVQUFVLENBQUMsd0JBQXdCLENBQUMscUJBQXFCLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFO2dCQUM3SSxrQkFBa0IsRUFBRSxJQUFJLENBQUMsNEJBQTRCLENBQUMsY0FBYyxDQUFDLFlBQVksSUFBSSxFQUFFLEVBQUUsT0FBTyxDQUFDLHFCQUFxQixDQUFDO2FBQ3ZILEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDVixJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNaLFVBQVUsR0FBRyxNQUFNLENBQUM7WUFDckIsQ0FBQztRQUNGLENBQUM7UUFDRCxVQUFVLEtBQUssSUFBSSxDQUFDLDRCQUE0QixDQUMvQyxjQUFjLEVBQUUsWUFBWSxJQUFJLEVBQUUsRUFBRSxPQUFPLENBQUMscUJBQXFCLENBQ2pFLENBQUM7UUFFRixNQUFNLE9BQU8sR0FBRyxNQUFNLFFBQVEsQ0FBQyxRQUFRLENBQUMseUJBQXlCLENBQUMsZUFBZSxFQUFFLEtBQUssRUFBRTtZQUN6RixjQUFjLEVBQUUsT0FBTyxFQUFFLHFCQUFxQixJQUFJLEVBQUU7WUFDcEQsVUFBVTtTQUNWLENBQUMsQ0FBQztRQUNILElBQUksS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7WUFDbkMsTUFBTSxJQUFJLGlCQUFpQixFQUFFLENBQUM7UUFDL0IsQ0FBQztRQUVELE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNqRCxNQUFNLEVBQUUsR0FBRyxlQUFlLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDdEMsTUFBTSxXQUFXLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLFNBQVMsRUFBRTtZQUN2RSxlQUFlO1lBQ2YsU0FBUyxFQUFFLFNBQVM7WUFDcEIsT0FBTyxFQUFFLEVBQUU7WUFDWCxPQUFPLEVBQUUsRUFBRTtZQUNYLFNBQVMsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUU7WUFDNUIsUUFBUSxFQUFFLGlCQUFpQixDQUFDLElBQUk7U0FDaEMsRUFBRTtZQUNGLG9CQUFvQixFQUFFLENBQUMsU0FBUyxFQUFFLE1BQU0sRUFBRSxFQUFFO2dCQUMzQyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsb0JBQW9CLENBQUMsTUFBTSxFQUFFLGVBQWUsRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDckYsQ0FBQztZQUNELG9CQUFvQixFQUFFLENBQUMsU0FBUyxFQUFFLGFBQWEsRUFBRSxNQUFNLEVBQUUsRUFBRTtnQkFDMUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLEVBQUUsZUFBZSxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDN0YsQ0FBQztTQUNELEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUVoRCxNQUFNLFVBQVUsR0FBRyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsSUFBSSx1QkFBdUIsRUFBRSxDQUFDLENBQUM7UUFDekUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFFeEYsbUVBQW1FO1FBQ25FLElBQUksT0FBTyxDQUFDLHNCQUFzQixFQUFFLENBQUM7WUFDcEMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsc0JBQXNCLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFO2dCQUMxSCxXQUFXO2dCQUNYLElBQUksQ0FBQyxNQUFNLENBQUMsdUJBQXVCLENBQUMsTUFBTSxFQUFFLGVBQWUsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN6RSxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7UUFDRCxNQUFNLEVBQUUsWUFBWSxFQUFFLEdBQUcsUUFBUSxDQUFDO1FBQ2xDLE9BQU87WUFDTixRQUFRLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUM7WUFDckMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxLQUFLO1lBQ3BCLHlCQUF5QixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsc0JBQXNCO1lBQzNELGlCQUFpQixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsY0FBYztZQUMzQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLGNBQWMsRUFBRSxVQUFVLENBQUMsV0FBVyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNqRixvQkFBb0IsRUFBRSxDQUFDLENBQUMsWUFBWSxFQUFFLHFCQUFxQjtZQUMzRCxPQUFPLEVBQUUsT0FBTyxDQUFDLE9BQU87WUFDeEIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUNuQyxJQUFJLElBQUksWUFBWSxZQUFZLENBQUMsZUFBZSxFQUFFLENBQUM7b0JBQ2xELE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN0QyxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBc0MsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO2dCQUM3RixDQUFDO1lBQ0YsQ0FBQyxDQUFDO1NBQ0YsQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsMkJBQTJCLENBQUMsTUFBYyxFQUFFLHlCQUF3QyxFQUFFLE9BQTRFLEVBQUUsS0FBd0I7UUFDak0sTUFBTSxlQUFlLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQzlELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDL0QsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLE1BQU0sRUFBRSxDQUFDLENBQUM7WUFDMUQsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxDQUFDO1lBQ25ELElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLHVCQUF1QixNQUFNLGdEQUFnRCxDQUFDLENBQUM7WUFDdEcsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDSixNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUN6RSxRQUFRO2dCQUNSLEtBQUssRUFBRSxLQUFLLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7YUFDdkYsQ0FBQyxDQUFDLENBQUM7WUFDSixRQUFRLENBQUMsUUFBUSxDQUFDLDBCQUEwQixDQUFDLGVBQWUsRUFBRSxhQUFhLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDckYsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsdURBQXVELE1BQU0scUJBQXFCLGVBQWUsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3JJLENBQUM7UUFFRCxtRkFBbUY7UUFDbkYsbUZBQW1GO1FBQ25GLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDakYsS0FBSyxNQUFNLFVBQVUsSUFBSSxjQUFjLEVBQUUsV0FBVyxJQUFJLEVBQUUsRUFBRSxDQUFDO1lBQzVELFVBQVUsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUM3QixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxNQUFjLEVBQUUsS0FBd0I7UUFDaEYsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1RCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQywwQkFBMEIsTUFBTSx1Q0FBdUMsQ0FBQyxDQUFDO1lBQy9GLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQztRQUNoQyxJQUFJLENBQUMsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLENBQUM7WUFDakQsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDSixNQUFNLE1BQU0sR0FBRyxNQUFNLFFBQVEsQ0FBQyxpQ0FBaUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN2RSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ2IsT0FBTztZQUNSLENBQUM7WUFDRCxNQUFNLEVBQUUsWUFBWSxFQUFFLGlCQUFpQixFQUFFLEdBQUcsTUFBTSxDQUFDO1lBQ25ELElBQUksWUFBWSxFQUFFLENBQUM7Z0JBQ2xCLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQztnQkFDbEYsSUFBSSxjQUFjLEVBQUUsQ0FBQztvQkFDcEIsY0FBYyxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7Z0JBQzVDLENBQUM7WUFDRixDQUFDO1lBQ0QsT0FBTztnQkFDTixZQUFZO2dCQUNaLGlCQUFpQjthQUNqQixDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsOERBQThELE1BQU0sR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3ZHLE9BQU87UUFDUixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxtQ0FBbUMsQ0FBQyxjQUFzQixFQUFFLGVBQThCLEVBQUUsU0FBaUI7UUFDbEgsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7UUFDekUsS0FBSyxFQUFFLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRUQsS0FBSyxDQUFDLDBCQUEwQixDQUFDLGNBQXNCLEVBQUUsZUFBOEI7UUFDdEYsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7UUFDekUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsdUNBQXVDLGVBQWUsRUFBRSxDQUFDLENBQUM7WUFDaEYsT0FBTztRQUNSLENBQUM7UUFFRCxLQUFLLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQzFCLEtBQUssQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDOUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7SUFDL0QsQ0FBQztJQUVELEtBQUssQ0FBQyxnQ0FBZ0MsQ0FBQyxNQUFjLEVBQUUsZUFBOEIsRUFBRSxPQUEwQixFQUFFLE9BQWMsRUFBRSxLQUF3QjtRQUMxSixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUN6RSxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDeEQsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO1FBRUQsTUFBTSxXQUFXLEdBQUcsV0FBVyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLEVBQUUsSUFBSSxHQUFHLEVBQUUsRUFBRSxLQUFLLENBQUMsVUFBVSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFck8sTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNoRSxNQUFNLEtBQUssQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxXQUFXLEVBQUUsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEgsaURBQWlEO1FBQ2pELE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUVELEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFjLEVBQUUseUJBQXdDLEVBQUUsT0FBc0QsRUFBRSxLQUF3QjtRQUNoSyxNQUFNLGVBQWUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFDOUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixNQUFNLElBQUksS0FBSyxDQUFDLHNDQUFzQyxlQUFlLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3JGLENBQUM7UUFFRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsOEJBQThCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFakUsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqRixJQUFJLGNBQWMsRUFBRSxVQUFVLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDNUMsTUFBTSxJQUFJLEdBQUcsTUFBTSxjQUFjLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxlQUFlLEVBQUUsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzlGLE9BQU8sV0FBVyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0MsQ0FBQztRQUVELElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUMzQyxNQUFNLElBQUksS0FBSyxDQUFDLCtCQUErQixlQUFlLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzlFLENBQUM7UUFFRCxNQUFNLElBQUksR0FBRyxNQUFNLEtBQUssQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxlQUFlLEVBQUUsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzdGLE9BQU8sV0FBVyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVPLDhCQUE4QixDQUFDLE9BQXNEO1FBQzVGLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxPQUFPLElBQUksWUFBWSxDQUFDLGVBQWUsQ0FDdEMsT0FBTyxDQUFDLE1BQU0sRUFDZCxPQUFPLENBQUMsT0FBTyxFQUNmLEVBQUUsRUFDRixPQUFPLENBQUMsV0FBVyxFQUNuQixFQUFFLEVBQ0YsU0FBUyxFQUNULE9BQU8sQ0FBQyxFQUFFLEVBQ1YsT0FBTyxDQUFDLE9BQU8sRUFDZixXQUFXLENBQUMsMkJBQTJCLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUNwRSxDQUFDO0lBQ0gsQ0FBQztJQUVPLDRCQUE0QixDQUFDLGVBQXVCO1FBQzNELEtBQUssTUFBTSxjQUFjLElBQUksSUFBSSxDQUFDLDJCQUEyQixDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDeEUsSUFBSSxjQUFjLENBQUMsZUFBZSxLQUFLLGVBQWUsRUFBRSxDQUFDO2dCQUN4RCxPQUFPLGNBQWMsQ0FBQztZQUN2QixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFTyw0QkFBNEIsQ0FDbkMsTUFBd0QsRUFDeEQsY0FBbUU7UUFFbkUsSUFBSSxDQUFDLGNBQWMsRUFBRSxNQUFNLEVBQUUsQ0FBQztZQUM3QixPQUFPLElBQUkseUJBQXlCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDekMsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2hFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDWixPQUFPLEtBQUssQ0FBQztZQUNkLENBQUM7WUFDRCxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3ZFLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDbkIsT0FBTyxLQUFLLENBQUM7WUFDZCxDQUFDO1lBQ0QsT0FBTyxFQUFFLEdBQUcsS0FBSyxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsQ0FBQztRQUM3QyxDQUFDLENBQUMsQ0FBQztRQUNILE9BQU8sSUFBSSx5QkFBeUIsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRU8sS0FBSyxDQUFDLGtCQUFrQixDQUFDLE9BQTBCLEVBQUUsU0FBZ0M7UUFDNUYsSUFBSSxLQUEyQyxDQUFDO1FBQ2hELElBQUksT0FBTyxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDakMsS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FBQyw0QkFBNEIsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDekcsQ0FBQztRQUNELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsdUJBQXVCLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDdEUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNaLE1BQU0sSUFBSSxLQUFLLENBQUMsNEJBQTRCLENBQUMsQ0FBQztZQUMvQyxDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVPLGtCQUFrQixDQUFDLElBQWtDO1FBQzVELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbkYsT0FBTztZQUNOLElBQUksRUFBRSxTQUFrQjtZQUN4QixFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUU7WUFDWCxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07WUFDbkIsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXO1lBQzdCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztZQUNyQixZQUFZLEVBQUUsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDOUQsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ3JCLGdCQUFnQixFQUFFLFdBQVcsQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDO1NBQ3RGLENBQUM7SUFDSCxDQUFDO0lBRU8sMEJBQTBCLENBQUMsR0FBK0I7UUFDakUsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssSUFBSSxPQUFPLEdBQUcsQ0FBQyxLQUFLLEtBQUssUUFBUSxJQUFJLEtBQUssSUFBSSxHQUFHLENBQUMsS0FBSyxJQUFJLE9BQU8sSUFBSSxHQUFHLENBQUMsS0FBSztZQUNyRyxDQUFDLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQXdCLENBQUM7WUFDekQsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7UUFDYixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLFlBQVksRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUUxRixJQUFJLEtBQUssSUFBSSxLQUFLLFlBQVksWUFBWSxDQUFDLHVCQUF1QixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDdEssTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0QsTUFBTSxRQUFRLEdBQXVDO2dCQUNwRCxXQUFXLEVBQUUsRUFBRSxlQUFlLEVBQUUsTUFBTSxDQUFDLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSxDQUFDLFdBQVcsRUFBRSxhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWEsRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVMsRUFBRTtnQkFDM0osY0FBYyxFQUFFLE1BQU0sQ0FBQyxRQUFRO2dCQUMvQixTQUFTLEVBQUUsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xDLGNBQWMsRUFBRSxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU87YUFDbEQsQ0FBQztZQUNGLE9BQU8sa0NBQWtDLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzdELENBQUM7UUFFRCxJQUFJLFlBQVksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ2hGLE1BQU0sR0FBRyxHQUFHLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNqRCxPQUFPO2dCQUNOLEVBQUUsRUFBRSxHQUFHLENBQUMsRUFBRTtnQkFDVixJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUk7Z0JBQ2QsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztnQkFDL0IsS0FBSyxFQUFFLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsS0FBSyxFQUFFO2dCQUMvQyx1RUFBdUU7Z0JBQ3ZFLFVBQVUsNkJBQXFCO2dCQUMvQix1RUFBdUU7Z0JBQ3ZFLElBQUksRUFBRSxXQUFXLENBQUMsTUFBTSw2QkFBcUI7Z0JBQzdDLElBQUksRUFBRSxRQUFRO2dCQUNkLEtBQUs7YUFDMEIsQ0FBQztRQUNsQyxDQUFDO1FBRUQsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDeEQsSUFBSSxHQUFHLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxzQkFBc0IsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO2dCQUMzRCxPQUFPLHlCQUF5QixDQUFDLEtBQUssRUFBRSxzQkFBc0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUM3RSxDQUFDO1lBQ0QsSUFBSSxHQUFHLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxzQkFBc0IsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLENBQUM7Z0JBQ3BFLE9BQU8seUJBQXlCLENBQUMsS0FBSyxFQUFFLHNCQUFzQixDQUFDLG9CQUFvQixDQUFDLENBQUM7WUFDdEYsQ0FBQztZQUNELElBQUksR0FBRyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsc0JBQXNCLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztnQkFDMUQsT0FBTyx5QkFBeUIsQ0FBQyxLQUFLLEVBQUUsc0JBQXNCLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDNUUsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxLQUFLLElBQUksS0FBSyxDQUFDLENBQUM7UUFDMUYsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEUsT0FBTztZQUNOLEVBQUUsRUFBRSxHQUFHLENBQUMsRUFBRTtZQUNWLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSTtZQUNkLEtBQUs7WUFDTCxnQkFBZ0IsRUFBRSxHQUFHLENBQUMsZ0JBQWdCO1lBQ3RDLEtBQUs7WUFDTCxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxXQUFvQixDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQWUsQ0FBQyxDQUFDLENBQUMsU0FBa0I7U0FDckYsQ0FBQztJQUNILENBQUM7SUFFTyxtQkFBbUIsQ0FBQyxJQUFvQyxFQUFFLGtCQUFtQztRQUNwRyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsSSxPQUFPO1lBQ04sSUFBSSxFQUFFLFVBQW1CO1lBQ3pCLEtBQUs7WUFDTCxXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVc7U0FDN0IsQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsd0JBQXdCLENBQUMsTUFBYyxFQUFFLEtBQXdCO1FBQ3RFLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEUsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3JCLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGtDQUFrQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1lBQ2xFLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxjQUFjLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRUQsS0FBSyxDQUFDLG1CQUFtQixDQUFDLE1BQWMsRUFBRSxPQUFrQyxFQUFFLEtBQXdCO1FBQ3JHLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEUsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3JCLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGtDQUFrQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1lBQ2xFLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLE9BQU8sR0FBRyxjQUFjLENBQUMsVUFBVSxDQUFDLHlCQUF5QixDQUFDO1FBQ3BFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLFVBQXdDLENBQUM7UUFDN0MsSUFBSSxjQUFjLENBQUMsVUFBVSxDQUFDLHdCQUF3QixFQUFFLENBQUM7WUFDeEQsVUFBVSxHQUFHLE1BQU0sY0FBYyxDQUFDLFVBQVUsQ0FBQyx3QkFBd0IsQ0FBQyxTQUFTLEVBQUUsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLENBQUMsNEJBQTRCLENBQUMsY0FBYyxDQUFDLFlBQVksSUFBSSxFQUFFLEVBQUUsT0FBTyxDQUFDLHFCQUFxQixDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0TixDQUFDO2FBQU0sQ0FBQztZQUNQLFVBQVUsR0FBRyxJQUFJLHlCQUF5QixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFFRCxNQUFNLElBQUksR0FBRyxNQUFNLE9BQU8sQ0FBQztZQUMxQixPQUFPLEVBQUU7Z0JBQ1IsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNO2dCQUN0QixPQUFPLEVBQUUsT0FBTyxDQUFDLE9BQU87YUFDeEI7WUFDRCxjQUFjLEVBQUUsT0FBTyxDQUFDLHFCQUFxQixJQUFJLEVBQUU7WUFDbkQsVUFBVTtTQUNWLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDVixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDWCxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsT0FBTyxXQUFXLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRUQsZ0NBQWdDLENBQUMsZ0JBQXdCLEVBQUUseUJBQXdDLEVBQUUsUUFBaUI7UUFDckgsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLDJCQUEyQixDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzlFLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxrQ0FBa0MsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO1lBQzVFLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxlQUFlLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQzlELE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNsRSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDWCxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxzQ0FBc0MsZUFBZSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUMxRixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1FBQ3pCLGNBQWMsQ0FBQyxzQ0FBc0MsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVELEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxnQkFBd0IsRUFBRSx5QkFBb0QsRUFBRSxLQUF3QjtRQUMzSSxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsMkJBQTJCLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDOUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3JCLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGtDQUFrQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7WUFDNUUsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE1BQU0sT0FBTyxHQUFHLGNBQWMsQ0FBQyxVQUFVLENBQUMsd0JBQXdCLENBQUM7UUFDbkUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2QsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE1BQU0sZUFBZSxHQUFHLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUN0RyxNQUFNLFVBQVUsR0FBRyxNQUFNLE9BQU8sQ0FBQyxlQUFlLEVBQUUsRUFBRSxrQkFBa0IsRUFBRSxTQUFTLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1RixJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDakIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELGlEQUFpRDtRQUNqRCxjQUFjLENBQUMsWUFBWSxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUM7UUFFaEQsOEVBQThFO1FBQzlFLE9BQU8sVUFBVSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2xDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRTtZQUNSLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSTtZQUNaLFdBQVcsRUFBRSxDQUFDLENBQUMsV0FBVztZQUMxQixLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUs7WUFDZCxRQUFRLEVBQUUsQ0FBQyxDQUFDLFFBQVE7WUFDcEIsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJO1lBQ1osSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJO1lBQ1osUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRO1NBQ3BCLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNELENBQUE7QUEvcEJZLG1CQUFtQjtJQStCN0IsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLFdBQVcsQ0FBQTtHQWhDRCxtQkFBbUIsQ0ErcEIvQiJ9