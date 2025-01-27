/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, compareBy, delta } from '../../../../../base/common/arrays.js';
import { AsyncIterableSource } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { BugIndicatingError, ErrorNoTelemetry } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { LinkedList } from '../../../../../base/common/linkedList.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { derived, IObservable, observableValue, observableValueOpts, runOnChange, ValueWithChangeEventFromObservable } from '../../../../../base/common/observable.js';
import { compare } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isString } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { CellUri } from '../../../notebook/common/notebookCommon.js';
import { ChatAgentLocation, IChatAgentService } from '../../common/chatAgents.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { applyingChatEditsContextKey, applyingChatEditsFailedContextKey, CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingAgentSupportsReadonlyReferencesContextKey, chatEditingMaxFileAssignmentName, chatEditingResourceContextKey, ChatEditingSessionState, decidedChatEditingResourceContextKey, defaultChatEditingMaxFileLimit, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, IChatEditingSession, IChatEditingSessionStream, IChatRelatedFile, IChatRelatedFilesProvider, IModifiedFileEntry, inChatEditingSessionContextKey, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel, IChatTextEditGroup } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { ChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingSession } from './chatEditingSession.js';
import { ChatEditingSnapshotTextModelContentProvider, ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';


const STORAGE_KEY_EDITING_SESSION = 'chat.editingSession';

export class ChatEditingService extends Disposable implements IChatEditingService {

	_serviceBrand: undefined;

	private readonly _currentSessionObs = observableValue<ChatEditingSession | null>(this, null);
	private readonly _currentSessionDisposables = this._register(new DisposableStore());

	private readonly _adhocSessionsObs = observableValueOpts<LinkedList<ChatEditingSession>>({ equalsFn: (a, b) => false }, new LinkedList());

	readonly editingSessionsObs: IObservable<readonly IChatEditingSession[]> = derived(r => {
		const result = Array.from(this._adhocSessionsObs.read(r));
		const globalSession = this._currentSessionObs.read(r);
		if (globalSession) {
			result.push(globalSession);
		}
		return result;
	});

	private readonly _currentAutoApplyOperationObs = observableValue<CancellationTokenSource | null>(this, null);
	get currentAutoApplyOperation(): CancellationTokenSource | null {
		return this._currentAutoApplyOperationObs.get();
	}

	get currentEditingSession(): IChatEditingSession | null {
		return this._currentSessionObs.get();
	}

	get currentEditingSessionObs(): IObservable<IChatEditingSession | null> {
		return this._currentSessionObs;
	}

	private _editingSessionFileLimitPromise: Promise<number>;
	private _editingSessionFileLimit: number | undefined;
	get editingSessionFileLimit() {
		return this._editingSessionFileLimit ?? defaultChatEditingMaxFileLimit;
	}

	private _restoringEditingSession: Promise<IChatEditingSession> | undefined;

	private _applyingChatEditsFailedContextKey: IContextKey<boolean | undefined>;

	private _chatRelatedFilesProviders = new Map<number, IChatRelatedFilesProvider>();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ITextModelService textModelService: ITextModelService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService private readonly _chatService: IChatService,
		@IProgressService private readonly _progressService: IProgressService,
		@IEditorService private readonly _editorService: IEditorService,
		@IDecorationsService decorationsService: IDecorationsService,
		@IFileService private readonly _fileService: IFileService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IWorkbenchAssignmentService private readonly _workbenchAssignmentService: IWorkbenchAssignmentService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
		@IExtensionService extensionService: IExtensionService,
		@IProductService productService: IProductService,
	) {
		super();
		this._applyingChatEditsFailedContextKey = applyingChatEditsFailedContextKey.bindTo(contextKeyService);
		this._applyingChatEditsFailedContextKey.set(false);
		this._register(decorationsService.registerDecorationsProvider(_instantiationService.createInstance(ChatDecorationsProvider, this._currentSessionObs)));
		this._register(multiDiffSourceResolverService.registerResolver(_instantiationService.createInstance(ChatEditingMultiDiffSourceResolver, this._currentSessionObs)));
		this._register(textModelService.registerTextModelContentProvider(ChatEditingTextModelContentProvider.scheme, _instantiationService.createInstance(ChatEditingTextModelContentProvider, this._currentSessionObs)));
		this._register(textModelService.registerTextModelContentProvider(ChatEditingSnapshotTextModelContentProvider.scheme, _instantiationService.createInstance(ChatEditingSnapshotTextModelContentProvider, this._currentSessionObs)));
		this._register(bindContextKey(decidedChatEditingResourceContextKey, contextKeyService, (reader) => {
			const currentSession = this._currentSessionObs.read(reader);
			if (!currentSession) {
				return;
			}
			const entries = currentSession.entries.read(reader);
			const decidedEntries = entries.filter(entry => entry.state.read(reader) !== WorkingSetEntryState.Modified);
			return decidedEntries.map(entry => entry.entryId);
		}));
		this._register(bindContextKey(hasUndecidedChatEditingResourceContextKey, contextKeyService, (reader) => {

			for (const session of this.editingSessionsObs.read(reader)) {
				const entries = session.entries.read(reader);
				const decidedEntries = entries.filter(entry => entry.state.read(reader) === WorkingSetEntryState.Modified);
				return decidedEntries.length > 0;
			}

			return false;
		}));
		this._register(bindContextKey(hasAppliedChatEditsContextKey, contextKeyService, (reader) => {
			const currentSession = this._currentSessionObs.read(reader);
			if (!currentSession) {
				return false;
			}
			const entries = currentSession.entries.read(reader);
			return entries.length > 0;
		}));
		this._register(bindContextKey(inChatEditingSessionContextKey, contextKeyService, (reader) => {
			return this._currentSessionObs.read(reader) !== null;
		}));
		this._register(bindContextKey(applyingChatEditsContextKey, contextKeyService, (reader) => {
			return this._currentAutoApplyOperationObs.read(reader) !== null;
		}));
		this._register(bindContextKey(ChatContextKeys.chatEditingCanUndo, contextKeyService, (r) => {
			return this._currentSessionObs.read(r)?.canUndo.read(r) || false;
		}));
		this._register(bindContextKey(ChatContextKeys.chatEditingCanRedo, contextKeyService, (r) => {
			return this._currentSessionObs.read(r)?.canRedo.read(r) || false;
		}));
		this._register(this._chatService.onDidDisposeSession((e) => {
			if (e.reason === 'cleared' && this._currentSessionObs.get()?.chatSessionId === e.sessionId) {
				this._applyingChatEditsFailedContextKey.set(false);
				void this._currentSessionObs.get()?.stop();
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

		this._register(this.lifecycleService.onWillShutdown((e) => {
			const session = this._currentSessionObs.get();
			if (session) {
				storageService.store(STORAGE_KEY_EDITING_SESSION, session.chatSessionId, StorageScope.WORKSPACE, StorageTarget.MACHINE);
				e.join(session.storeState(), { id: 'join.chatEditingSession', label: localize('join.chatEditingSession', "Saving chat edits history") });
			}
		}));

		this._editingSessionFileLimitPromise = this._workbenchAssignmentService.getTreatment<number>(chatEditingMaxFileAssignmentName).then(value => {
			this._editingSessionFileLimit = value ?? defaultChatEditingMaxFileLimit;
			return this._editingSessionFileLimit;
		});
		void this._editingSessionFileLimitPromise;

		const sessionIdToRestore = storageService.get(STORAGE_KEY_EDITING_SESSION, StorageScope.WORKSPACE);
		if (isString(sessionIdToRestore)) {
			if (this._chatService.getOrRestoreSession(sessionIdToRestore)) {
				this._restoringEditingSession = this.startOrContinueEditingSession(sessionIdToRestore);
				this._restoringEditingSession.finally(() => {
					this._restoringEditingSession = undefined;
				});
			} else {
				logService.error(`Edit session session to restore is a non-existing chat session: ${sessionIdToRestore}`);
			}
			storageService.remove(STORAGE_KEY_EDITING_SESSION, StorageScope.WORKSPACE);
		}
	}

	async getOrRestoreEditingSession(): Promise<IChatEditingSession | null> {
		if (this._restoringEditingSession) {
			await this._restoringEditingSession;
		}
		return this.currentEditingSessionObs.get();
	}

	override dispose(): void {
		this._currentSessionObs.get()?.dispose();
		super.dispose();
	}

	async startOrContinueEditingSession(chatSessionId: string): Promise<IChatEditingSession> {
		await this._restoringEditingSession;

		const session = this._currentSessionObs.get();
		if (session) {
			if (session.chatSessionId === chatSessionId) {
				return session;
			} else if (session.chatSessionId !== chatSessionId) {
				await session.stop(true);
			}
		}
		return this._createEditingSession(chatSessionId);
	}


	private _lookupEntry(uri: URI): ChatEditingModifiedFileEntry | undefined {

		for (const item of Iterable.concat(this.editingSessionsObs.get())) {
			const candidate = item.getEntry(uri);
			if (candidate instanceof ChatEditingModifiedFileEntry) {
				// make sure to ref-count this object
				return candidate.acquire();
			}
		}
		return undefined;
	}

	private async _createEditingSession(chatSessionId: string): Promise<IChatEditingSession> {
		if (this._currentSessionObs.get()) {
			throw new BugIndicatingError('Cannot have more than one active editing session');
		}

		this._currentSessionDisposables.clear();

		const session = this._instantiationService.createInstance(ChatEditingSession, chatSessionId, true, this._editingSessionFileLimitPromise, this._lookupEntry.bind(this));
		await session.init();

		// listen for completed responses, run the code mapper and apply the edits to this edit session
		this._currentSessionDisposables.add(this.installAutoApplyObserver(session));

		this._currentSessionDisposables.add(session.onDidDispose(() => {
			this._currentSessionDisposables.clear();
			this._currentSessionObs.set(null, undefined);
		}));

		this._currentSessionObs.set(session, undefined);
		return session;
	}

	async createAdhocEditingSession(chatSessionId: string): Promise<IChatEditingSession & IDisposable> {
		const session = this._instantiationService.createInstance(ChatEditingSession, chatSessionId, false, this._editingSessionFileLimitPromise, this._lookupEntry.bind(this));
		await session.init();

		const list = this._adhocSessionsObs.get();
		const removeSession = list.unshift(session);

		const store = new DisposableStore();
		this._store.add(store);

		store.add(this.installAutoApplyObserver(session));

		store.add(session.onDidDispose(e => {
			removeSession();
			this._adhocSessionsObs.set(list, undefined);
			this._store.deleteAndLeak(store);
			store.dispose();
		}));

		this._adhocSessionsObs.set(list, undefined);

		return session;
	}

	private installAutoApplyObserver(session: ChatEditingSession): IDisposable {

		const chatModel = this._chatService.getOrRestoreSession(session.chatSessionId);
		if (!chatModel) {
			throw new ErrorNoTelemetry(`Edit session was created for a non-existing chat session: ${session.chatSessionId}`);
		}

		const observerDisposables = new DisposableStore();

		let editsSource: AsyncIterableSource<IChatTextEditGroup> | undefined;
		let editsPromise: Promise<void> | undefined;
		const editsSeen = new ResourceMap<{ seen: number }>();
		const editedFilesExist = new ResourceMap<Promise<boolean>>();

		const onResponseComplete = (responseModel: IChatResponseModel) => {
			if (responseModel.result?.errorDetails && !responseModel.result.errorDetails.responseIsIncomplete) {
				// Roll back everything
				session.restoreSnapshot(responseModel.requestId);
				this._applyingChatEditsFailedContextKey.set(true);
			}

			editsSource?.resolve();
			editsSource = undefined;
			editsSeen.clear();
			editedFilesExist.clear();
		};


		const handleResponseParts = async (responseModel: IChatResponseModel) => {
			for (const part of responseModel.response.value) {
				if (part.kind === 'codeblockUri' || part.kind === 'textEditGroup') {
					// ensure editor is open asap
					if (!editedFilesExist.get(part.uri)) {
						const uri = part.uri.scheme === Schemas.vscodeNotebookCell ? CellUri.parse(part.uri)?.notebook ?? part.uri : part.uri;
						editedFilesExist.set(part.uri, this._fileService.exists(uri).then((e) => {
							if (e) {
								this._editorService.openEditor({ resource: uri, options: { inactive: true, preserveFocus: true, pinned: true } });
							}
							return e;
						}));
					}

					// get new edits and start editing session
					const first = editsSeen.size === 0;
					let entry = editsSeen.get(part.uri);
					if (!entry) {
						entry = { seen: 0 };
						editsSeen.set(part.uri, entry);
					}

					const allEdits: TextEdit[][] = part.kind === 'textEditGroup' ? part.edits : [];
					const newEdits = allEdits.slice(entry.seen);
					entry.seen += newEdits.length;

					if (newEdits.length > 0 || entry.seen === 0) {
						// only allow empty edits when having just started, ignore otherwise to avoid unneccessary work
						editsSource ??= new AsyncIterableSource();
						editsSource.emitOne({ uri: part.uri, edits: newEdits, kind: 'textEditGroup', done: part.kind === 'textEditGroup' && part.done });
					}

					if (first) {

						await editsPromise;

						editsPromise = this._continueEditingSession(session, async (builder, token) => {
							for await (const item of editsSource!.asyncIterable) {
								if (token.isCancellationRequested) {
									break;
								}
								if (item.edits.length === 0) {
									// EMPTY edit, just signal via empty edits that work is starting
									builder.textEdits(item.uri, [], item.done ?? false, responseModel);
									continue;
								}
								for (let i = 0; i < item.edits.length; i++) {
									const group = item.edits[i];
									const isLastGroup = i === item.edits.length - 1;
									builder.textEdits(item.uri, group, isLastGroup && (item.done ?? false), responseModel);
								}
							}
						}).finally(() => {
							editsPromise = undefined;
						});
					}
				}
			}
		};

		observerDisposables.add(chatModel.onDidChange(async e => {
			if (e.kind === 'addRequest') {
				session.createSnapshot(e.request.id);
				this._applyingChatEditsFailedContextKey.set(false);
				const responseModel = e.request.response;
				if (responseModel) {
					if (responseModel.isComplete) {
						await handleResponseParts(responseModel);
						onResponseComplete(responseModel);
					} else {
						const disposable = responseModel.onDidChange(async () => {
							await handleResponseParts(responseModel);
							if (responseModel.isComplete) {
								onResponseComplete(responseModel);
								disposable.dispose();
							}
						});
					}
				}
			}
		}));
		observerDisposables.add(chatModel.onDidDispose(() => observerDisposables.dispose()));
		return observerDisposables;
	}

	private async _continueEditingSession(session: ChatEditingSession, builder: (stream: IChatEditingSessionStream, token: CancellationToken) => Promise<void>): Promise<void> {
		if (session.state.get() === ChatEditingSessionState.StreamingEdits) {
			throw new BugIndicatingError('Cannot continue session that is still streaming');
		}

		const stream: IChatEditingSessionStream = {
			textEdits: (resource: URI, textEdits: TextEdit[], isDone: boolean, responseModel: IChatResponseModel) => {
				session.acceptTextEdits(resource, textEdits, isDone, responseModel);
			}
		};
		session.acceptStreamingEditsStart();
		const cancellationTokenSource = new CancellationTokenSource();
		this._currentAutoApplyOperationObs.set(cancellationTokenSource, undefined);
		try {
			await this._progressService.withProgress({
				location: ProgressLocation.Window,
				title: localize2('chatEditing.startingSession', 'Generating edits...').value,
			}, async () => {
				await builder(stream, cancellationTokenSource.token);
			},
				() => cancellationTokenSource.cancel()
			);

		} finally {
			cancellationTokenSource.dispose();
			this._currentAutoApplyOperationObs.set(null, undefined);
			session.resolve();
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

	async getRelatedFiles(chatSessionId: string, prompt: string, token: CancellationToken): Promise<{ group: string; files: IChatRelatedFile[] }[] | undefined> {
		const currentSession = this._currentSessionObs.get();
		if (!currentSession || chatSessionId !== currentSession.chatSessionId) {
			return undefined;
		}
		const userAddedWorkingSetEntries: URI[] = [];
		for (const [uri, metadata] of currentSession.workingSet) {
			// Don't incorporate suggested files into the related files request
			// but do consider transient entries like open editors
			if (metadata.state !== WorkingSetEntryState.Suggested) {
				userAddedWorkingSetEntries.push(uri);
			}
		}

		const providers = Array.from(this._chatRelatedFilesProviders.values());
		const result = await Promise.all(providers.map(async provider => {
			try {
				const relatedFiles = await provider.provideRelatedFiles({ prompt, files: userAddedWorkingSetEntries }, token);
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
		const session = this._session.read(r);
		if (!session) {
			return [];
		}
		const state = session.state.read(r);
		if (state === ChatEditingSessionState.Disposed) {
			return [];
		}
		return session.entries.read(r);
	});

	private readonly _currentlyEditingUris = derived<URI[]>(this, (r) => {
		const uri = this._currentEntries.read(r);
		return uri.filter(entry => entry.isCurrentlyBeingModified.read(r)).map(entry => entry.modifiedURI);
	});

	private readonly _modifiedUris = derived<URI[]>(this, (r) => {
		const uri = this._currentEntries.read(r);
		return uri.filter(entry => !entry.isCurrentlyBeingModified.read(r) && entry.state.read(r) === WorkingSetEntryState.Modified).map(entry => entry.modifiedURI);
	});

	public readonly onDidChange = Event.any(
		observeArrayChanges(this._currentlyEditingUris, compareBy(uri => uri.toString(), compare), this._store),
		observeArrayChanges(this._modifiedUris, compareBy(uri => uri.toString(), compare), this._store),
	);

	constructor(
		private readonly _session: IObservable<IChatEditingSession | null>,
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
			const defaultAgentName = this._chatAgentService.getDefaultAgent(ChatAgentLocation.EditingSession)?.fullName;
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
		private readonly _currentSession: IObservable<ChatEditingSession | null>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	canHandleUri(uri: URI): boolean {
		return uri.scheme === CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME;
	}

	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {
		return this._instantiationService.createInstance(ChatEditingMultiDiffSource, this._currentSession);
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
		private readonly _currentSession: IObservable<ChatEditingSession | null>
	) { }
}
