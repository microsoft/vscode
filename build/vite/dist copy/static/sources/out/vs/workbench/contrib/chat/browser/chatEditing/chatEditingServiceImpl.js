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
import { compareBy, delta } from '../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { groupBy } from '../../../../../base/common/collections.js';
import { ErrorNoTelemetry } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../../base/common/lifecycle.js';
import { LinkedList } from '../../../../../base/common/linkedList.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { derived, observableValueOpts, runOnChange, ValueWithChangeEventFromObservable } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { compare } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IMultiDiffSourceResolverService, MultiDiffEditorItem } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { CellUri } from '../../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingAgentSupportsReadonlyReferencesContextKey, chatEditingResourceContextKey, inChatEditingSessionContextKey, parseChatMultiDiffUri } from '../../common/editing/chatEditingService.js';
import { isCellTextEditOperationArray } from '../../common/model/chatModel.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';
import { AbstractChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingSession } from './chatEditingSession.js';
import { ChatEditingSnapshotTextModelContentProvider, ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';
let ChatEditingService = class ChatEditingService extends Disposable {
    constructor(_instantiationService, multiDiffSourceResolverService, textModelService, contextKeyService, _chatService, _editorService, decorationsService, _fileService, lifecycleService, storageService, logService, extensionService, productService, notebookService, _configurationService) {
        super();
        this._instantiationService = _instantiationService;
        this._chatService = _chatService;
        this._editorService = _editorService;
        this._fileService = _fileService;
        this.lifecycleService = lifecycleService;
        this.notebookService = notebookService;
        this._configurationService = _configurationService;
        this._providers = new Map();
        this._sessionsObs = observableValueOpts({ equalsFn: (a, b) => false }, new LinkedList());
        this.editingSessionsObs = derived(r => {
            const result = Array.from(this._sessionsObs.read(r));
            return result;
        });
        this._register(decorationsService.registerDecorationsProvider(_instantiationService.createInstance(ChatDecorationsProvider, this.editingSessionsObs)));
        this._register(multiDiffSourceResolverService.registerResolver(_instantiationService.createInstance(ChatEditingMultiDiffSourceResolver, this.editingSessionsObs)));
        // TODO@jrieken
        // some ugly casting so that this service can pass itself as argument instad as service dependeny
        // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
        this._register(textModelService.registerTextModelContentProvider(ChatEditingTextModelContentProvider.scheme, _instantiationService.createInstance(ChatEditingTextModelContentProvider, this)));
        // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
        this._register(textModelService.registerTextModelContentProvider(Schemas.chatEditingSnapshotScheme, _instantiationService.createInstance(ChatEditingSnapshotTextModelContentProvider, this)));
        this._register(this._chatService.onDidDisposeSession((e) => {
            if (e.reason === 'cleared') {
                for (const resource of e.sessionResources) {
                    this.getEditingSession(resource)?.stop();
                }
            }
        }));
        // todo@connor4312: temporary until chatReadonlyPromptReference proposal is finalized
        const readonlyEnabledContextKey = chatEditingAgentSupportsReadonlyReferencesContextKey.bindTo(contextKeyService);
        const setReadonlyFilesEnabled = () => {
            const enabled = productService.quality !== 'stable' && extensionService.extensions.some(e => e.enabledApiProposals?.includes('chatReadonlyPromptReference'));
            readonlyEnabledContextKey.set(enabled);
        };
        setReadonlyFilesEnabled();
        this._register(extensionService.onDidRegisterExtensions(setReadonlyFilesEnabled));
        this._register(extensionService.onDidChangeExtensions(setReadonlyFilesEnabled));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let storageTask;
        this._register(storageService.onWillSaveState(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tasks = [];
            for (const session of this.editingSessionsObs.get()) {
                if (!session.isGlobalEditingSession) {
                    continue;
                }
                tasks.push(session.storeState());
            }
            storageTask = Promise.resolve(storageTask)
                .then(() => Promise.all(tasks))
                .finally(() => storageTask = undefined);
        }));
        this._register(this.lifecycleService.onWillShutdown(e => {
            if (!storageTask) {
                return;
            }
            e.join(storageTask, {
                id: 'join.chatEditingSession',
                label: localize('join.chatEditingSession', "Saving chat edits history")
            });
        }));
    }
    dispose() {
        dispose(this._sessionsObs.get());
        super.dispose();
    }
    startOrContinueGlobalEditingSession(chatModel) {
        return this.getEditingSession(chatModel.sessionResource) || this.createEditingSession(chatModel, true);
    }
    _lookupEntry(uri) {
        for (const item of Iterable.concat(this.editingSessionsObs.get())) {
            const candidate = item.getEntry(uri);
            if (candidate instanceof AbstractChatEditingModifiedFileEntry) {
                // make sure to ref-count this object
                return candidate.acquire();
            }
        }
        return undefined;
    }
    getEditingSession(chatSessionResource) {
        return this.editingSessionsObs.get()
            .find(candidate => isEqual(candidate.chatSessionResource, chatSessionResource));
    }
    createEditingSession(chatModel, global = false) {
        return this._createEditingSession(chatModel, global, undefined);
    }
    transferEditingSession(chatModel, session) {
        return this._createEditingSession(chatModel, session.isGlobalEditingSession, session);
    }
    _createEditingSession(chatModel, global, initFrom) {
        assertType(this.getEditingSession(chatModel.sessionResource) === undefined, 'CANNOT have more than one editing session per chat session');
        const provider = this._providers.get(chatModel.sessionResource.scheme);
        const session = provider
            ? provider.createEditingSession(chatModel.sessionResource)
            : this._instantiationService.createInstance(ChatEditingSession, chatModel.sessionResource, global, this._lookupEntry.bind(this), initFrom);
        const list = this._sessionsObs.get();
        const removeSession = list.unshift(session);
        const store = new DisposableStore();
        this._store.add(store);
        if (!provider && session instanceof ChatEditingSession) {
            store.add(this.installAutoApplyObserver(session, chatModel));
        }
        store.add(session.onDidDispose(e => {
            removeSession();
            this._sessionsObs.set(list, undefined);
            this._store.delete(store);
        }));
        this._sessionsObs.set(list, undefined);
        return session;
    }
    registerEditingSessionProvider(scheme, provider) {
        this._providers.set(scheme, provider);
        return toDisposable(() => {
            if (this._providers.get(scheme) === provider) {
                this._providers.delete(scheme);
            }
        });
    }
    installAutoApplyObserver(session, chatModel) {
        if (!chatModel) {
            throw new ErrorNoTelemetry(`Edit session was created for a non-existing chat session: ${session.chatSessionResource}`);
        }
        const observerDisposables = new DisposableStore();
        observerDisposables.add(chatModel.onDidChange(async (e) => {
            if (e.kind !== 'addRequest') {
                return;
            }
            session.createSnapshot(e.request.id, undefined);
            const responseModel = e.request.response;
            if (responseModel) {
                this.observerEditsInResponse(e.request.id, responseModel, session, observerDisposables);
            }
        }));
        observerDisposables.add(chatModel.onDidDispose(() => observerDisposables.dispose()));
        return observerDisposables;
    }
    observerEditsInResponse(requestId, responseModel, session, observerDisposables) {
        // Sparse array: the indicies are indexes of `responseModel.response.value`
        // that are edit groups, and then this tracks the edit application for
        // each of them. Note that text edit groups can be updated
        // multiple times during the process of response streaming.
        let K;
        (function (K) {
            K[K["Stream"] = 0] = "Stream";
            K[K["Workspace"] = 1] = "Workspace";
        })(K || (K = {}));
        const editsSeen = [];
        let editorDidChange = false;
        const editorListener = Event.once(this._editorService.onDidActiveEditorChange)(() => {
            editorDidChange = true;
        });
        const editorOpenPromises = new ResourceMap();
        const openChatEditedFiles = this._configurationService.getValue('accessibility.openChatEditedFiles');
        const ensureEditorOpen = (partUri) => {
            const uri = CellUri.parse(partUri)?.notebook ?? partUri;
            if (editorOpenPromises.has(uri)) {
                return;
            }
            editorOpenPromises.set(uri, (async () => {
                if (this.notebookService.getNotebookTextModel(uri) || uri.scheme === Schemas.untitled || await this._fileService.exists(uri).catch(() => false)) {
                    const activeUri = this._editorService.activeEditorPane?.input.resource;
                    const inactive = editorDidChange
                        || this._editorService.activeEditorPane?.input instanceof ChatEditorInput && isEqual(this._editorService.activeEditorPane.input.sessionResource, session.chatSessionResource)
                        || Boolean(activeUri && session.entries.get().find(entry => isEqual(activeUri, entry.modifiedURI)));
                    this._editorService.openEditor({ resource: uri, options: { inactive, preserveFocus: true, pinned: true } });
                }
            })());
        };
        const onResponseComplete = () => {
            for (const remaining of editsSeen) {
                if (remaining?.kind === 0 /* K.Stream */) {
                    remaining.stream.complete();
                }
            }
            editsSeen.length = 0;
            editorOpenPromises.clear();
            editorListener.dispose();
        };
        const handleResponseParts = async () => {
            if (responseModel.isCanceled) {
                return;
            }
            let undoStop;
            for (let i = 0; i < responseModel.response.value.length; i++) {
                const part = responseModel.response.value[i];
                if (part.kind === 'undoStop') {
                    undoStop = part.id;
                    continue;
                }
                if (part.kind === 'workspaceEdit') {
                    // Track if we've already started processing this workspace edit
                    if (!editsSeen[i]) {
                        editsSeen[i] = { kind: 1 /* K.Workspace */ };
                        session.applyWorkspaceEdit(part, responseModel, undoStop ?? responseModel.requestId);
                    }
                    continue;
                }
                if (part.kind !== 'textEditGroup' && part.kind !== 'notebookEditGroup') {
                    continue;
                }
                // Skip external edits - they're already applied on disk
                if (part.isExternalEdit) {
                    continue;
                }
                if (openChatEditedFiles) {
                    ensureEditorOpen(part.uri);
                }
                // get new edits and start editing session
                let entry = editsSeen[i];
                if (!entry) {
                    entry = { kind: 0 /* K.Stream */, seen: 0, stream: session.startStreamingEdits(CellUri.parse(part.uri)?.notebook ?? part.uri, responseModel, undoStop) };
                    editsSeen[i] = entry;
                }
                if (entry.kind !== 0 /* K.Stream */) {
                    continue;
                }
                const isFirst = entry.seen === 0;
                const newEdits = part.edits.slice(entry.seen);
                entry.seen = part.edits.length;
                if (newEdits.length > 0 || isFirst) {
                    for (let i = 0; i < newEdits.length; i++) {
                        const edit = newEdits[i];
                        const done = part.done ? i === newEdits.length - 1 : false;
                        if (isTextEditOperationArray(edit)) {
                            entry.stream.pushText(edit, done);
                        }
                        else if (isCellTextEditOperationArray(edit)) {
                            for (const edits of Object.values(groupBy(edit, e => e.uri.toString()))) {
                                if (edits) {
                                    entry.stream.pushNotebookCellText(edits[0].uri, edits.map(e => e.edit), done);
                                }
                            }
                        }
                        else {
                            entry.stream.pushNotebook(edit, done);
                        }
                    }
                }
                if (part.done) {
                    entry.stream.complete();
                }
            }
        };
        if (responseModel.isComplete) {
            handleResponseParts().then(() => {
                onResponseComplete();
            });
        }
        else {
            const disposable = observerDisposables.add(responseModel.onDidChange(e2 => {
                if (e2.reason === 'undoStop') {
                    session.createSnapshot(requestId, e2.id);
                }
                else {
                    handleResponseParts().then(() => {
                        if (responseModel.isComplete) {
                            onResponseComplete();
                            observerDisposables.delete(disposable);
                        }
                    });
                }
            }));
        }
    }
};
ChatEditingService = __decorate([
    __param(0, IInstantiationService),
    __param(1, IMultiDiffSourceResolverService),
    __param(2, ITextModelService),
    __param(3, IContextKeyService),
    __param(4, IChatService),
    __param(5, IEditorService),
    __param(6, IDecorationsService),
    __param(7, IFileService),
    __param(8, ILifecycleService),
    __param(9, IStorageService),
    __param(10, ILogService),
    __param(11, IExtensionService),
    __param(12, IProductService),
    __param(13, INotebookService),
    __param(14, IConfigurationService)
], ChatEditingService);
export { ChatEditingService };
/**
 * Emits an event containing the added or removed elements of the observable.
 */
function observeArrayChanges(obs, compare, store) {
    const emitter = store.add(new Emitter());
    store.add(runOnChange(obs, (newArr, oldArr) => {
        const change = delta(oldArr || [], newArr, compare);
        const changedElements = [].concat(change.added).concat(change.removed);
        emitter.fire(changedElements);
    }));
    return emitter.event;
}
class ChatDecorationsProvider extends Disposable {
    constructor(_sessions) {
        super();
        this._sessions = _sessions;
        this.label = localize('chat', "Chat Editing");
        this._currentEntries = derived(this, (r) => {
            const sessions = this._sessions.read(r);
            if (!sessions) {
                return [];
            }
            const result = [];
            for (const session of sessions) {
                if (session.state.read(r) !== 3 /* ChatEditingSessionState.Disposed */) {
                    const entries = session.entries.read(r);
                    result.push(...entries);
                }
            }
            return result;
        });
        this._currentlyEditingUris = derived(this, (r) => {
            const uri = this._currentEntries.read(r);
            return uri.filter(entry => entry.isCurrentlyBeingModifiedBy.read(r)).map(entry => entry.modifiedURI);
        });
        this._modifiedUris = derived(this, (r) => {
            const uri = this._currentEntries.read(r);
            return uri.filter(entry => !entry.isCurrentlyBeingModifiedBy.read(r) && entry.state.read(r) === 0 /* ModifiedFileEntryState.Modified */).map(entry => entry.modifiedURI);
        });
        this.onDidChange = Event.any(observeArrayChanges(this._currentlyEditingUris, compareBy(uri => uri.toString(), compare), this._store), observeArrayChanges(this._modifiedUris, compareBy(uri => uri.toString(), compare), this._store));
    }
    provideDecorations(uri, _token) {
        const isCurrentlyBeingModified = this._currentlyEditingUris.get().some(e => isEqual(e, uri));
        if (isCurrentlyBeingModified) {
            return {
                weight: 1000,
                letter: ThemeIcon.modify(Codicon.loading, 'spin'),
                bubble: false
            };
        }
        const isModified = this._modifiedUris.get().some(e => isEqual(e, uri));
        if (isModified) {
            return {
                weight: 1000,
                letter: Codicon.diffModified,
                tooltip: localize('chatEditing.modified2', "Pending changes from chat"),
                bubble: true
            };
        }
        return undefined;
    }
}
let ChatEditingMultiDiffSourceResolver = class ChatEditingMultiDiffSourceResolver {
    constructor(_editingSessionsObs, _instantiationService) {
        this._editingSessionsObs = _editingSessionsObs;
        this._instantiationService = _instantiationService;
    }
    canHandleUri(uri) {
        return uri.scheme === CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME;
    }
    async resolveDiffSource(uri) {
        const parsed = parseChatMultiDiffUri(uri);
        const thisSession = derived(this, r => {
            return this._editingSessionsObs.read(r).find(candidate => isEqual(candidate.chatSessionResource, parsed.chatSessionResource));
        });
        return this._instantiationService.createInstance(ChatEditingMultiDiffSource, thisSession, parsed.showPreviousChanges);
    }
};
ChatEditingMultiDiffSourceResolver = __decorate([
    __param(1, IInstantiationService)
], ChatEditingMultiDiffSourceResolver);
export { ChatEditingMultiDiffSourceResolver };
class ChatEditingMultiDiffSource {
    constructor(_currentSession, _showPreviousChanges) {
        this._currentSession = _currentSession;
        this._showPreviousChanges = _showPreviousChanges;
        this._resources = derived(this, (reader) => {
            const currentSession = this._currentSession.read(reader);
            if (!currentSession) {
                return [];
            }
            const entries = currentSession.entries.read(reader);
            return entries.map((entry) => {
                if (this._showPreviousChanges) {
                    const entryDiffObs = currentSession.getEntryDiffBetweenStops(entry.modifiedURI, undefined, undefined);
                    const entryDiff = entryDiffObs?.read(reader);
                    if (entryDiff) {
                        return new MultiDiffEditorItem(entryDiff.originalURI, entryDiff.modifiedURI, undefined, undefined, {
                            [chatEditingResourceContextKey.key]: entry.entryId,
                        });
                    }
                }
                return new MultiDiffEditorItem(entry.originalURI, entry.modifiedURI, undefined, undefined, {
                    [chatEditingResourceContextKey.key]: entry.entryId,
                    // [inChatEditingSessionContextKey.key]: true
                });
            });
        });
        this.resources = new ValueWithChangeEventFromObservable(this._resources);
        this.contextKeys = {
            [inChatEditingSessionContextKey.key]: true
        };
    }
}
function isTextEditOperationArray(value) {
    return value.some(e => TextEdit.isTextEdit(e));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdTZXJ2aWNlSW1wbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2VJbXBsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFeEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQWUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUgsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBZSxtQkFBbUIsRUFBRSxXQUFXLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN0SixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxTQUFT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