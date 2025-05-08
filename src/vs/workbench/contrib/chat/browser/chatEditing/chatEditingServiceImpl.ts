/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, compareBy, delta } from '../../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ErrorNoTelemetry } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableStore, dispose, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { LinkedList } from '../../../../../base/common/linkedList.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { derived, IObservable, observableValueOpts, runOnChange, ValueWithChangeEventFromObservable } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { compare } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { CellUri } from '../../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { IChatAgentService } from '../../common/chatAgents.js';
import { CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingAgentSupportsReadonlyReferencesContextKey, chatEditingResourceContextKey, ChatEditingSessionState, chatEditingSnapshotScheme, IChatEditingService, IChatEditingSession, IChatRelatedFile, IChatRelatedFilesProvider, IModifiedFileEntry, inChatEditingSessionContextKey, IStreamingEdits, ModifiedFileEntryState, parseChatMultiDiffUri } from '../../common/chatEditingService.js';
import { ChatModel, IChatResponseModel, isCellTextEditOperation } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { AbstractChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingSession } from './chatEditingSession.js';
import { ChatEditingSnapshotTextModelContentProvider, ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';

export class ChatEditingService extends Disposable implements IChatEditingService {

	_serviceBrand: undefined;


	private readonly _sessionsObs = observableValueOpts<LinkedList<ChatEditingSession>>({ equalsFn: (a, b) => false }, new LinkedList());

	readonly editingSessionsObs: IObservable<readonly IChatEditingSession[]> = derived(r => {
		const result = Array.from(this._sessionsObs.read(r));
		return result;
	});

	private _restoringEditingSession: Promise<any> | undefined;

	private _chatRelatedFilesProviders = new Map<number, IChatRelatedFilesProvider>();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ITextModelService textModelService: ITextModelService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService private readonly _chatService: IChatService,
		@IEditorService private readonly _editorService: IEditorService,
		@IDecorationsService decorationsService: IDecorationsService,
		@IFileService private readonly _fileService: IFileService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
		@IExtensionService extensionService: IExtensionService,
		@IProductService productService: IProductService,
		@INotebookService private readonly notebookService: INotebookService
	) {
		super();
		this._register(decorationsService.registerDecorationsProvider(_instantiationService.createInstance(ChatDecorationsProvider, this.editingSessionsObs)));
		this._register(multiDiffSourceResolverService.registerResolver(_instantiationService.createInstance(ChatEditingMultiDiffSourceResolver, this.editingSessionsObs)));

		// TODO@jrieken
		// some ugly casting so that this service can pass itself as argument instad as service dependeny
		this._register(textModelService.registerTextModelContentProvider(ChatEditingTextModelContentProvider.scheme, _instantiationService.createInstance(ChatEditingTextModelContentProvider as any, this)));
		this._register(textModelService.registerTextModelContentProvider(chatEditingSnapshotScheme, _instantiationService.createInstance(ChatEditingSnapshotTextModelContentProvider as any, this)));

		this._register(this._chatService.onDidDisposeSession((e) => {
			if (e.reason === 'cleared') {
				this.getEditingSession(e.sessionId)?.stop();
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


		let storageTask: Promise<any> | undefined;

		this._register(storageService.onWillSaveState(() => {
			const tasks: Promise<any>[] = [];

			for (const session of this.editingSessionsObs.get()) {
				if (!session.isGlobalEditingSession) {
					continue;
				}
				tasks.push((session as ChatEditingSession).storeState());
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

	override dispose(): void {
		dispose(this._sessionsObs.get());
		super.dispose();
	}

	async startOrContinueGlobalEditingSession(chatModel: ChatModel, waitForRestore = true): Promise<IChatEditingSession> {
		if (waitForRestore) {
			await this._restoringEditingSession;
		}

		const session = this.getEditingSession(chatModel.sessionId);
		if (session) {
			return session;
		}
		const result = await this.createEditingSession(chatModel, true);
		return result;
	}


	private _lookupEntry(uri: URI): AbstractChatEditingModifiedFileEntry | undefined {

		for (const item of Iterable.concat(this.editingSessionsObs.get())) {
			const candidate = item.getEntry(uri);
			if (candidate instanceof AbstractChatEditingModifiedFileEntry) {
				// make sure to ref-count this object
				return candidate.acquire();
			}
		}
		return undefined;
	}

	getEditingSession(chatSessionId: string): IChatEditingSession | undefined {
		return this.editingSessionsObs.get()
			.find(candidate => candidate.chatSessionId === chatSessionId);
	}

	async createEditingSession(chatModel: ChatModel, global: boolean = false): Promise<IChatEditingSession> {

		assertType(this.getEditingSession(chatModel.sessionId) === undefined, 'CANNOT have more than one editing session per chat session');

		const session = this._instantiationService.createInstance(ChatEditingSession, chatModel.sessionId, global, this._lookupEntry.bind(this));
		await session.init();

		const list = this._sessionsObs.get();
		const removeSession = list.unshift(session);

		const store = new DisposableStore();
		this._store.add(store);

		store.add(this.installAutoApplyObserver(session, chatModel));

		store.add(session.onDidDispose(e => {
			removeSession();
			this._sessionsObs.set(list, undefined);
			this._store.delete(store);
		}));

		this._sessionsObs.set(list, undefined);

		return session;
	}

	private installAutoApplyObserver(session: ChatEditingSession, chatModel: ChatModel): IDisposable {
		if (!chatModel) {
			throw new ErrorNoTelemetry(`Edit session was created for a non-existing chat session: ${session.chatSessionId}`);
		}

		const observerDisposables = new DisposableStore();

		observerDisposables.add(chatModel.onDidChange(async e => {
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

	private observerEditsInResponse(requestId: string, responseModel: IChatResponseModel, session: ChatEditingSession, observerDisposables: DisposableStore) {
		// Sparse array: the indicies are indexes of `responseModel.response.value`
		// that are edit groups, and then this tracks the edit application for
		// each of them. Note that text edit groups can be updated
		// multiple times during the process of response streaming.
		const editsSeen: ({ seen: number; streaming: IStreamingEdits } | undefined)[] = [];

		let editorDidChange = false;
		const editorListener = Event.once(this._editorService.onDidActiveEditorChange)(() => {
			editorDidChange = true;
		});

		const editedFilesExist = new ResourceMap<Promise<void>>();
		const ensureEditorOpen = (partUri: URI) => {
			const uri = CellUri.parse(partUri)?.notebook ?? partUri;
			if (editedFilesExist.has(uri)) {
				return;
			}

			const fileExists = this.notebookService.getNotebookTextModel(uri) ? Promise.resolve(true) : this._fileService.exists(uri);
			editedFilesExist.set(uri, fileExists.then((e) => {
				if (!e) {
					return;
				}
				const activeUri = this._editorService.activeEditorPane?.input.resource;
				const inactive = editorDidChange
					|| this._editorService.activeEditorPane?.input instanceof ChatEditorInput && this._editorService.activeEditorPane.input.sessionId === session.chatSessionId
					|| Boolean(activeUri && session.entries.get().find(entry => isEqual(activeUri, entry.modifiedURI)));
				this._editorService.openEditor({ resource: uri, options: { inactive, preserveFocus: true, pinned: true } });
			}));
		};

		const onResponseComplete = () => {
			for (const remaining of editsSeen) {
				remaining?.streaming.complete();
			}
			if (responseModel.result?.errorDetails && !responseModel.result.errorDetails.responseIsIncomplete) {
				// Roll back everything
				session.restoreSnapshot(responseModel.requestId, undefined);
			}

			editsSeen.length = 0;
			editedFilesExist.clear();
			editorListener.dispose();
		};

		const handleResponseParts = async () => {
			if (responseModel.isCanceled) {
				return;
			}

			let undoStop: undefined | string;
			for (let i = 0; i < responseModel.response.value.length; i++) {
				const part = responseModel.response.value[i];

				if (part.kind === 'undoStop') {
					undoStop = part.id;
					continue;
				}

				if (part.kind !== 'textEditGroup' && part.kind !== 'notebookEditGroup') {
					continue;
				}

				ensureEditorOpen(part.uri);

				// get new edits and start editing session
				let entry = editsSeen[i];
				if (!entry) {
					entry = { seen: 0, streaming: session.startStreamingEdits(CellUri.parse(part.uri)?.notebook ?? part.uri, responseModel, undoStop) };
					editsSeen[i] = entry;
				}

				const isFirst = entry.seen === 0;
				const newEdits = part.edits.slice(entry.seen).flat();
				entry.seen = part.edits.length;

				if (newEdits.length > 0 || isFirst) {
					if (part.kind === 'notebookEditGroup') {
						newEdits.forEach(edit => {
							if (TextEdit.isTextEdit(edit)) {
								// Not possible, as Notebooks would have a different type.
								return;
							} else if (isCellTextEditOperation(edit)) {
								entry.streaming.pushNotebookCellText(edit.uri, [edit.edit]);
							} else {
								entry.streaming.pushNotebook([edit]);
							}
						});
					} else if (part.kind === 'textEditGroup') {
						entry.streaming.pushText(newEdits as TextEdit[]);
					}
				}

				if (part.done) {
					entry.streaming.complete();
				}
			}
		};

		if (responseModel.isComplete) {
			handleResponseParts().then(() => {
				onResponseComplete();
			});
		} else {
			const disposable = observerDisposables.add(responseModel.onDidChange(e2 => {
				if (e2.reason === 'undoStop') {
					session.createSnapshot(requestId, e2.id);
				} else {
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

	hasRelatedFilesProviders(): boolean {
		return this._chatRelatedFilesProviders.size > 0;
	}

	registerRelatedFilesProvider(handle: number, provider: IChatRelatedFilesProvider): IDisposable {
		this._chatRelatedFilesProviders.set(handle, provider);
		return toDisposable(() => {
			this._chatRelatedFilesProviders.delete(handle);
		});
	}

	async getRelatedFiles(chatSessionId: string, prompt: string, files: URI[], token: CancellationToken): Promise<{ group: string; files: IChatRelatedFile[] }[] | undefined> {
		const providers = Array.from(this._chatRelatedFilesProviders.values());
		const result = await Promise.all(providers.map(async provider => {
			try {
				const relatedFiles = await provider.provideRelatedFiles({ prompt, files }, token);
				if (relatedFiles?.length) {
					return { group: provider.description, files: relatedFiles };
				}
				return undefined;
			} catch (e) {
				return undefined;
			}
		}));

		return coalesce(result);
	}
}

/**
 * Emits an event containing the added or removed elements of the observable.
 */
function observeArrayChanges<T>(obs: IObservable<T[]>, compare: (a: T, b: T) => number, store: DisposableStore): Event<T[]> {
	const emitter = store.add(new Emitter<T[]>());
	store.add(runOnChange(obs, (newArr, oldArr) => {
		const change = delta(oldArr || [], newArr, compare);
		const changedElements = ([] as T[]).concat(change.added).concat(change.removed);
		emitter.fire(changedElements);
	}));
	return emitter.event;
}

class ChatDecorationsProvider extends Disposable implements IDecorationsProvider {

	readonly label: string = localize('chat', "Chat Editing");

	private readonly _currentEntries = derived<readonly IModifiedFileEntry[]>(this, (r) => {
		const sessions = this._sessions.read(r);
		if (!sessions) {
			return [];
		}
		const result: IModifiedFileEntry[] = [];
		for (const session of sessions) {
			if (session.state.read(r) !== ChatEditingSessionState.Disposed) {
				const entries = session.entries.read(r);
				result.push(...entries);
			}
		}
		return result;
	});

	private readonly _currentlyEditingUris = derived<URI[]>(this, (r) => {
		const uri = this._currentEntries.read(r);
		return uri.filter(entry => entry.isCurrentlyBeingModifiedBy.read(r)).map(entry => entry.modifiedURI);
	});

	private readonly _modifiedUris = derived<URI[]>(this, (r) => {
		const uri = this._currentEntries.read(r);
		return uri.filter(entry => !entry.isCurrentlyBeingModifiedBy.read(r) && entry.state.read(r) === ModifiedFileEntryState.Modified).map(entry => entry.modifiedURI);
	});

	public readonly onDidChange = Event.any(
		observeArrayChanges(this._currentlyEditingUris, compareBy(uri => uri.toString(), compare), this._store),
		observeArrayChanges(this._modifiedUris, compareBy(uri => uri.toString(), compare), this._store),
	);

	constructor(
		private readonly _sessions: IObservable<readonly IChatEditingSession[]>,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService
	) {
		super();
	}

	provideDecorations(uri: URI, _token: CancellationToken): IDecorationData | undefined {
		const isCurrentlyBeingModified = this._currentlyEditingUris.get().some(e => e.toString() === uri.toString());
		if (isCurrentlyBeingModified) {
			return {
				weight: 1000,
				letter: ThemeIcon.modify(Codicon.loading, 'spin'),
				bubble: false
			};
		}
		const isModified = this._modifiedUris.get().some(e => e.toString() === uri.toString());
		if (isModified) {
			const defaultAgentName = this._chatAgentService.getDefaultAgent(ChatAgentLocation.Panel)?.fullName;
			return {
				weight: 1000,
				letter: Codicon.diffModified,
				tooltip: defaultAgentName ? localize('chatEditing.modified', "Pending changes from {0}", defaultAgentName) : localize('chatEditing.modified2', "Pending changes from chat"),
				bubble: true
			};
		}
		return undefined;
	}
}

export class ChatEditingMultiDiffSourceResolver implements IMultiDiffSourceResolver {

	constructor(
		private readonly _editingSessionsObs: IObservable<readonly IChatEditingSession[]>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	canHandleUri(uri: URI): boolean {
		return uri.scheme === CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME;
	}

	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {

		const parsed = parseChatMultiDiffUri(uri);
		const thisSession = derived(this, r => {
			return this._editingSessionsObs.read(r).find(candidate => candidate.chatSessionId === parsed.chatSessionId);
		});

		return this._instantiationService.createInstance(ChatEditingMultiDiffSource, thisSession, parsed.showPreviousChanges);
	}
}

class ChatEditingMultiDiffSource implements IResolvedMultiDiffSource {
	private readonly _resources = derived<readonly MultiDiffEditorItem[]>(this, (reader) => {
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
					return new MultiDiffEditorItem(
						entryDiff.originalURI,
						entryDiff.modifiedURI,
						undefined,
						{
							[chatEditingResourceContextKey.key]: entry.entryId,
						},
					);
				}
			}

			return new MultiDiffEditorItem(
				entry.originalURI,
				entry.modifiedURI,
				undefined,
				{
					[chatEditingResourceContextKey.key]: entry.entryId,
					// [inChatEditingSessionContextKey.key]: true
				},
			);
		});
	});
	readonly resources = new ValueWithChangeEventFromObservable(this._resources);

	readonly contextKeys = {
		[inChatEditingSessionContextKey.key]: true
	};

	constructor(
		private readonly _currentSession: IObservable<IChatEditingSession | undefined>,
		private readonly _showPreviousChanges: boolean
	) { }
}
