/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, compareBy, delta } from '../../../../../base/common/arrays.js';
import { AsyncIterableSource } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { BugIndicatingError, ErrorNoTelemetry } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableStore, dispose, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { LinkedList } from '../../../../../base/common/linkedList.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { derived, IObservable, observableValueOpts, runOnChange, ValueWithChangeEventFromObservable } from '../../../../../base/common/observable.js';
import { compare } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { assertType, isString } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { CellUri } from '../../../notebook/common/notebookCommon.js';
import { ChatAgentLocation, IChatAgentService } from '../../common/chatAgents.js';
import { CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingAgentSupportsReadonlyReferencesContextKey, chatEditingMaxFileAssignmentName, chatEditingResourceContextKey, ChatEditingSessionState, defaultChatEditingMaxFileLimit, IChatEditingService, IChatEditingSession, IChatEditingSessionStream, IChatRelatedFile, IChatRelatedFilesProvider, IModifiedFileEntry, inChatEditingSessionContextKey, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel, IChatTextEditGroup } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { ChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingSession } from './chatEditingSession.js';
import { ChatEditingSnapshotTextModelContentProvider, ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';


const STORAGE_KEY_EDITING_SESSION = 'chat.editingSession';

export class ChatEditingService extends Disposable implements IChatEditingService {

	_serviceBrand: undefined;


	private readonly _sessionsObs = observableValueOpts<LinkedList<ChatEditingSession>>({ equalsFn: (a, b) => false }, new LinkedList());

	readonly editingSessionsObs: IObservable<readonly IChatEditingSession[]> = derived(r => {
		const result = Array.from(this._sessionsObs.read(r));
		return result;
	});

	private _editingSessionFileLimitPromise: Promise<number>;
	private _editingSessionFileLimit: number | undefined;
	get editingSessionFileLimit() {
		if (this._chatAgentService.toolsAgentModeEnabled) {
			return Number.MAX_SAFE_INTEGER;
		}

		return this._editingSessionFileLimit ?? defaultChatEditingMaxFileLimit;
	}

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
		@IWorkbenchAssignmentService private readonly _workbenchAssignmentService: IWorkbenchAssignmentService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
		@IExtensionService extensionService: IExtensionService,
		@IProductService productService: IProductService,
	) {
		super();
		this._register(decorationsService.registerDecorationsProvider(_instantiationService.createInstance(ChatDecorationsProvider, this.editingSessionsObs)));
		this._register(multiDiffSourceResolverService.registerResolver(_instantiationService.createInstance(ChatEditingMultiDiffSourceResolver)));
		this._register(textModelService.registerTextModelContentProvider(ChatEditingTextModelContentProvider.scheme, _instantiationService.createInstance(ChatEditingTextModelContentProvider)));
		this._register(textModelService.registerTextModelContentProvider(ChatEditingSnapshotTextModelContentProvider.scheme, _instantiationService.createInstance(ChatEditingSnapshotTextModelContentProvider)));


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
			const sessionIds: string[] = [];
			const tasks: Promise<any>[] = [];

			for (const session of this.editingSessionsObs.get()) {
				if (!session.isGlobalEditingSession) {
					continue;
				}
				sessionIds.push(session.chatSessionId);
				tasks.push((session as ChatEditingSession).storeState());
			}

			if (sessionIds.length) {
				storageService.store(STORAGE_KEY_EDITING_SESSION, sessionIds.join(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
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

		this._editingSessionFileLimitPromise = this._workbenchAssignmentService.getTreatment<number>(chatEditingMaxFileAssignmentName).then(value => {
			this._editingSessionFileLimit = value ?? defaultChatEditingMaxFileLimit;
			return this._editingSessionFileLimit;
		});

		const rawSessionsToRestore = storageService.get(STORAGE_KEY_EDITING_SESSION, StorageScope.WORKSPACE);
		if (isString(rawSessionsToRestore)) {

			const sessionIds = rawSessionsToRestore.split(',');

			const tasks: Promise<any>[] = [];
			for (const sessionId of sessionIds) {
				const chatModel = _chatService.getOrRestoreSession(sessionId);
				if (!chatModel) {
					logService.error(`Edit session session to restore is a non-existing chat session: ${rawSessionsToRestore}`);
					continue;
				}
				tasks.push(this.startOrContinueGlobalEditingSession(chatModel.sessionId));
			}

			this._restoringEditingSession = Promise.all(tasks).finally(() => {
				this._restoringEditingSession = undefined;
			});

			storageService.remove(STORAGE_KEY_EDITING_SESSION, StorageScope.WORKSPACE);
		}
	}

	override dispose(): void {
		dispose(this._sessionsObs.get());
		super.dispose();
	}

	async startOrContinueGlobalEditingSession(chatSessionId: string): Promise<IChatEditingSession> {
		await this._restoringEditingSession;

		const session = this.getEditingSession(chatSessionId);
		if (session) {
			return session;
		}
		return this.createEditingSession(chatSessionId, true);
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

	getEditingSession(chatSessionId: string): IChatEditingSession | undefined {
		return this.editingSessionsObs.get()
			.find(candidate => candidate.chatSessionId === chatSessionId);
	}

	async createEditingSession(chatSessionId: string, global: boolean = false): Promise<IChatEditingSession> {

		assertType(this.getEditingSession(chatSessionId) === undefined, 'CANNOT have more than one editing session per chat session');

		const session = this._instantiationService.createInstance(ChatEditingSession, chatSessionId, global, this._editingSessionFileLimitPromise, this._lookupEntry.bind(this));
		await session.init();

		const list = this._sessionsObs.get();
		const removeSession = list.unshift(session);

		const store = new DisposableStore();
		this._store.add(store);

		store.add(this.installAutoApplyObserver(session));

		store.add(session.onDidDispose(e => {
			removeSession();
			this._sessionsObs.set(list, undefined);
			this._store.delete(store);
		}));

		this._sessionsObs.set(list, undefined);

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
			}

			editsSource?.resolve();
			editsSource = undefined;
			editsSeen.clear();
			editedFilesExist.clear();
		};


		const handleResponseParts = async (responseModel: IChatResponseModel) => {

			if (responseModel.isCanceled) {
				return;
			}

			for (const part of responseModel.response.value) {
				if (part.kind !== 'codeblockUri' && part.kind !== 'textEditGroup') {
					continue;
				}
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

					editsPromise = this._continueEditingSession(session, async (builder) => {
						for await (const item of editsSource!.asyncIterable) {
							if (responseModel.isCanceled) {
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
		};

		observerDisposables.add(chatModel.onDidChange(async e => {
			if (e.kind !== 'addRequest') {
				return;
			}
			session.createSnapshot(e.request.id);
			const responseModel = e.request.response;
			if (!responseModel) {
				return;
			}
			if (responseModel.isComplete) {
				await handleResponseParts(responseModel);
				onResponseComplete(responseModel);
			} else {
				const disposable = observerDisposables.add(responseModel.onDidChange(async () => {
					await handleResponseParts(responseModel);
					if (responseModel.isComplete) {
						onResponseComplete(responseModel);
						observerDisposables.delete(disposable);
					}
				}));
			}
		}));
		observerDisposables.add(chatModel.onDidDispose(() => observerDisposables.dispose()));
		return observerDisposables;
	}

	private async _continueEditingSession(session: ChatEditingSession, builder: (stream: IChatEditingSessionStream) => Promise<void>): Promise<void> {
		if (session.state.get() === ChatEditingSessionState.StreamingEdits) {
			throw new BugIndicatingError('Cannot continue session that is still streaming');
		}

		const stream: IChatEditingSessionStream = {
			textEdits: (resource: URI, textEdits: TextEdit[], isDone: boolean, responseModel: IChatResponseModel) => {
				session.acceptTextEdits(resource, textEdits, isDone, responseModel);
			}
		};
		session.acceptStreamingEditsStart();
		try {
			await builder(stream);
		} finally {
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
		const currentSession = this.getEditingSession(chatSessionId);
		if (!currentSession) {
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
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService
	) { }

	canHandleUri(uri: URI): boolean {
		return uri.scheme === CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME;
	}

	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {

		const thisSession = derived(this, r => {
			return this._chatEditingService.editingSessionsObs.read(r).find(candidate => candidate.chatSessionId === uri.authority);
		});

		return this._instantiationService.createInstance(ChatEditingMultiDiffSource, thisSession);
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
		private readonly _currentSession: IObservable<IChatEditingSession | undefined>
	) { }
}
