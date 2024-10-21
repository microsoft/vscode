/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, delta } from '../../../../../base/common/arrays.js';
import { AsyncIterableSource } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { derived, IObservable, observableValue, runOnChange, ValueWithChangeEventFromObservable } from '../../../../../base/common/observable.js';
import { compare } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { bindContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { MultiDiffEditor } from '../../../multiDiffEditor/browser/multiDiffEditor.js';
import { MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ICodeMapperResponse, ICodeMapperService } from '../../common/chatCodeMapperService.js';
import { CONTEXT_CHAT_EDITING_CAN_REDO, CONTEXT_CHAT_EDITING_CAN_UNDO } from '../../common/chatContextKeys.js';
import { applyingChatEditsContextKey, CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingResourceContextKey, ChatEditingSessionState, decidedChatEditingResourceContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, IChatEditingSession, IChatEditingSessionStream, inChatEditingSessionContextKey, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel, IChatTextEditGroup } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { ChatEditingSession } from './chatEditingSession.js';
import { ChatEditingSnapshotTextModelContentProvider, ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';

export class ChatEditingService extends Disposable implements IChatEditingService {

	_serviceBrand: undefined;

	private readonly _currentSessionObs = observableValue<ChatEditingSession | null>(this, null);
	private readonly _currentSessionDisposables = this._register(new DisposableStore());

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

	private readonly _onDidCreateEditingSession = this._register(new Emitter<IChatEditingSession>());
	get onDidCreateEditingSession() {
		return this._onDidCreateEditingSession.event;
	}

	private readonly _onDidChangeEditingSession = this._register(new Emitter<void>());
	public readonly onDidChangeEditingSession = this._onDidChangeEditingSession.event;

	constructor(
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ITextModelService textModelService: ITextModelService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService private readonly _chatService: IChatService,
		@IProgressService private readonly _progressService: IProgressService,
		@ICodeMapperService private readonly _codeMapperService: ICodeMapperService,
		@IEditorService private readonly _editorService: IEditorService,
		@IDecorationsService decorationsService: IDecorationsService,
	) {
		super();
		this._register(decorationsService.registerDecorationsProvider(new ChatDecorationsProvider(this._currentSessionObs)));
		this._register(multiDiffSourceResolverService.registerResolver(_instantiationService.createInstance(ChatEditingMultiDiffSourceResolver, this._currentSessionObs)));
		textModelService.registerTextModelContentProvider(ChatEditingTextModelContentProvider.scheme, _instantiationService.createInstance(ChatEditingTextModelContentProvider, this._currentSessionObs));
		textModelService.registerTextModelContentProvider(ChatEditingSnapshotTextModelContentProvider.scheme, _instantiationService.createInstance(ChatEditingSnapshotTextModelContentProvider, this._currentSessionObs));
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
			const currentSession = this._currentSessionObs.read(reader);
			if (!currentSession) {
				return;
			}
			const entries = currentSession.entries.read(reader);
			const decidedEntries = entries.filter(entry => entry.state.read(reader) === WorkingSetEntryState.Modified);
			return decidedEntries.length > 0;
		}));
		this._register(bindContextKey(inChatEditingSessionContextKey, contextKeyService, (reader) => {
			return this._currentSessionObs.read(reader) !== null;
		}));
		this._register(bindContextKey(applyingChatEditsContextKey, contextKeyService, (reader) => {
			return this._currentAutoApplyOperationObs.read(reader) !== null;
		}));
		this._register(bindContextKey(CONTEXT_CHAT_EDITING_CAN_UNDO, contextKeyService, (r) => {
			return this._currentSessionObs.read(r)?.canUndo.read(r) || false;
		}));
		this._register(bindContextKey(CONTEXT_CHAT_EDITING_CAN_REDO, contextKeyService, (r) => {
			return this._currentSessionObs.read(r)?.canRedo.read(r) || false;
		}));
		this._register(this._chatService.onDidDisposeSession((e) => {
			if (e.reason === 'cleared' && this._currentSessionObs.get()?.chatSessionId === e.sessionId) {
				void this._currentSessionObs.get()?.stop();
			}
		}));
	}

	getSnapshotUri(id: string, uri: URI) {
		const session = this._currentSessionObs.get();
		if (!session) {
			return undefined;
		}
		return session.getSnapshot(id, uri)?.snapshotUri;
	}

	getEditingSession(resource: URI): IChatEditingSession | null {
		const session = this.currentEditingSession;
		if (!session) {
			return null;
		}
		const entries = session.entries.get();
		for (const entry of entries) {
			if (entry.modifiedURI.toString() === resource.toString()) {
				return session;
			}
		}
		return null;
	}

	override dispose(): void {
		this._currentSessionObs.get()?.dispose();
		super.dispose();
	}

	async startOrContinueEditingSession(chatSessionId: string, options?: { silent: boolean }): Promise<IChatEditingSession> {
		const session = this._currentSessionObs.get();
		if (session) {
			if (session.chatSessionId !== chatSessionId) {
				throw new BugIndicatingError('Cannot start new session while another session is active');
			}
		}
		return this._createEditingSession(chatSessionId, options);
	}

	private async _createEditingSession(chatSessionId: string, options?: { silent: boolean }): Promise<IChatEditingSession> {
		if (this._currentSessionObs.get()) {
			throw new BugIndicatingError('Cannot have more than one active editing session');
		}

		this._currentSessionDisposables.clear();

		// listen for completed responses, run the code mapper and apply the edits to this edit session
		this._currentSessionDisposables.add(this.installAutoApplyObserver(chatSessionId));

		const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
			multiDiffSource: ChatEditingMultiDiffSourceResolver.getMultiDiffSourceUri(),
			label: localize('multiDiffEditorInput.name', "Suggested Edits")
		}, this._instantiationService);

		const editorPane = options?.silent ? undefined : await this._editorGroupsService.activeGroup.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE }) as MultiDiffEditor | undefined;

		const session = this._instantiationService.createInstance(ChatEditingSession, chatSessionId, editorPane);
		this._currentSessionDisposables.add(session.onDidDispose(() => {
			this._currentSessionDisposables.clear();
			this._currentSessionObs.set(null, undefined);
			this._onDidChangeEditingSession.fire();
		}));
		this._currentSessionDisposables.add(session.onDidChange(() => {
			this._onDidChangeEditingSession.fire();
		}));

		this._currentSessionObs.set(session, undefined);
		this._onDidCreateEditingSession.fire(session);
		this._onDidChangeEditingSession.fire();
		return session;
	}

	public triggerEditComputation(responseModel: IChatResponseModel): Promise<void> {
		return this._continueEditingSession(async (builder, token) => {
			const codeMapperResponse: ICodeMapperResponse = {
				textEdit: (resource, edits) => builder.textEdits(resource, edits, responseModel),
			};
			await this._codeMapperService.mapCodeFromResponse(responseModel, codeMapperResponse, token);
		}, { silent: true });
	}

	public createSnapshot(requestId: string): void {
		this._currentSessionObs.get()?.createSnapshot(requestId);
	}

	public async restoreSnapshot(requestId: string | undefined): Promise<void> {
		await this._currentSessionObs.get()?.restoreSnapshot(requestId);
	}

	private installAutoApplyObserver(sessionId: string): IDisposable {

		const chatModel = this._chatService.getSession(sessionId);
		if (!chatModel) {
			throw new Error(`Edit session was created for a non-existing chat session: ${sessionId}`);
		}

		const observerDisposables = new DisposableStore();

		let editsSource: AsyncIterableSource<IChatTextEditGroup> | undefined;
		const editsSeen = new ResourceMap<{ seen: number }>();

		const onResponseComplete = (responseModel: IChatResponseModel) => {
			if (responseModel.result?.metadata?.autoApplyEdits) {
				this.triggerEditComputation(responseModel);
			}

			editsSource?.resolve();
			editsSource = undefined;
			editsSeen.clear();
		};


		const handleResponseParts = (responseModel: IChatResponseModel) => {
			for (const part of responseModel.response.value) {
				if (part.kind === 'codeblockUri' || part.kind === 'textEditGroup') {
					// ensure editor is open asap
					this._editorService.openEditor({ resource: part.uri, options: { inactive: true, preserveFocus: true, pinned: true } });

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

					editsSource ??= new AsyncIterableSource();
					editsSource.emitOne({ uri: part.uri, edits: newEdits, kind: 'textEditGroup' });

					if (first) {
						this._continueEditingSession(async (builder, token) => {
							for await (const item of editsSource!.asyncIterable) {
								if (token.isCancellationRequested) {
									break;
								}
								for (const group of item.edits) {
									builder.textEdits(item.uri, group, responseModel);
								}
							}
						}, { silent: true });
					}
				}
			}
		};

		observerDisposables.add(chatModel.onDidChange(e => {
			if (e.kind === 'addRequest') {
				const responseModel = e.request.response;
				if (responseModel) {
					if (responseModel.isComplete) {
						handleResponseParts(responseModel);
						onResponseComplete(responseModel);
					} else {
						const disposable = responseModel.onDidChange(() => {
							handleResponseParts(responseModel);
							if (responseModel.isComplete) {
								onResponseComplete(responseModel);
								disposable.dispose();
							} else if (responseModel.isCanceled || responseModel.isStale) {
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

	private async _continueEditingSession(builder: (stream: IChatEditingSessionStream, token: CancellationToken) => Promise<void>, options?: { silent?: boolean }): Promise<void> {
		const session = this._currentSessionObs.get();
		if (!session) {
			throw new BugIndicatingError('Cannot continue missing session');
		}

		if (session.state.get() === ChatEditingSessionState.StreamingEdits) {
			throw new BugIndicatingError('Cannot continue session that is still streaming');
		}

		let editorPane: MultiDiffEditor | undefined;
		if (!options?.silent && session.isVisible) {
			const groupedEditors = this._findGroupedEditors();
			if (groupedEditors.length !== 1) {
				throw new Error(`Unexpected number of editors: ${groupedEditors.length}`);
			}
			const [group, editor] = groupedEditors[0];

			editorPane = await group.openEditor(editor, { pinned: true, activation: EditorActivation.ACTIVATE }) as MultiDiffEditor | undefined;
		}

		const stream: IChatEditingSessionStream = {
			textEdits: (resource: URI, textEdits: TextEdit[], responseModel: IChatResponseModel) => {
				session.acceptTextEdits(resource, textEdits, responseModel);
			}
		};
		session.acceptStreamingEditsStart();
		const cancellationTokenSource = new CancellationTokenSource();
		this._currentAutoApplyOperationObs.set(cancellationTokenSource, undefined);
		try {
			if (editorPane) {
				await editorPane?.showWhile(builder(stream, cancellationTokenSource.token));
			} else {
				await this._progressService.withProgress({
					location: ProgressLocation.Window,
					title: localize2('chatEditing.startingSession', 'Generating edits...').value,
				}, async () => {
					await builder(stream, cancellationTokenSource.token);
				},
					() => cancellationTokenSource.cancel()
				);
			}
		} finally {
			cancellationTokenSource.dispose();
			this._currentAutoApplyOperationObs.set(null, undefined);
			session.resolve();
		}
	}

	private _findGroupedEditors() {
		const editors: [IEditorGroup, EditorInput][] = [];
		for (const group of this._editorGroupsService.groups) {
			for (const editor of group.editors) {
				if (editor.resource?.scheme === ChatEditingMultiDiffSourceResolver.scheme) {
					editors.push([group, editor]);
				}
			}
		}
		return editors;
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

	private readonly _currentlyEditingUris = derived<URI[]>(this, (r) => {
		const session = this._session.read(r);
		if (!session) {
			return [];
		}
		const state = session.state.read(r);
		if (state === ChatEditingSessionState.Disposed) {
			return [];
		}
		return session.entries.read(r).filter(entry => entry.isCurrentlyBeingModified.read(r)).map(entry => entry.modifiedURI);
	});

	public readonly onDidChange = observeArrayChanges(this._currentlyEditingUris, compareBy(uri => uri.toString(), compare), this._store);

	constructor(
		private readonly _session: IObservable<IChatEditingSession | null>
	) {
		super();
	}

	provideDecorations(uri: URI, _token: CancellationToken): IDecorationData | undefined {
		const isCurrentlyBeingModified = this._currentlyEditingUris.get().some(e => e.toString() === uri.toString());
		if (!isCurrentlyBeingModified) {
			return undefined;
		}
		return {
			weight: 1000,
			letter: ThemeIcon.modify(Codicon.loading, 'spin'),
			bubble: false
		};
	}
}

export class ChatEditingMultiDiffSourceResolver implements IMultiDiffSourceResolver {
	public static readonly scheme = CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME;

	public static getMultiDiffSourceUri(): URI {
		return URI.from({
			scheme: ChatEditingMultiDiffSourceResolver.scheme,
			path: '',
		});
	}

	constructor(
		private readonly _currentSession: IObservable<ChatEditingSession | null>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	canHandleUri(uri: URI): boolean {
		return uri.scheme === ChatEditingMultiDiffSourceResolver.scheme;
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
