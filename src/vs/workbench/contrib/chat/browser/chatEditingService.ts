/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, IReference, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, ITransaction, observableValue, ValueWithChangeEventFromObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../editor/common/model/textModel.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorActivation } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { MultiDiffEditor } from '../../multiDiffEditor/browser/multiDiffEditor.js';
import { MultiDiffEditorInput } from '../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ICodeMapperResponse, ICodeMapperService } from '../common/chatCodeMapperService.js';
import { ChatEditingSessionState, IChatEditingService, IChatEditingSession, IChatEditingSessionStream, IModifiedFileEntry, ModifiedFileEntryState } from '../common/chatEditingService.js';
import { IChatResponseModel } from '../common/chatModel.js';
import { IChatService } from '../common/chatService.js';
import { IChatWidgetService } from './chat.js';

const decidedChatEditingResourceContextKey = new RawContextKey<string[]>('decidedChatEditingResource', []);
const chatEditingResourceContextKey = new RawContextKey<string | undefined>('chatEditingResource', undefined);
const inChatEditingSessionContextKey = new RawContextKey<boolean | undefined>('inChatEditingSession', undefined);

export class ChatEditingService extends Disposable implements IChatEditingService {

	_serviceBrand: undefined;

	private readonly _currentSessionObs = observableValue<ChatEditingSession | null>(this, null);
	private readonly _currentSessionDisposeListener = this._register(new MutableDisposable());

	get currentEditingSession(): IChatEditingSession | null {
		return this._currentSessionObs.get();
	}

	private readonly _onDidCreateEditingSession = new Emitter<IChatEditingSession>();
	get onDidCreateEditingSession() {
		return this._onDidCreateEditingSession.event;
	}

	constructor(
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ITextModelService textModelService: ITextModelService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService private readonly _chatService: IChatService,
		@IProgressService private readonly _progressService: IProgressService,
		@ICodeMapperService private readonly _codeMapperService: ICodeMapperService,
	) {
		super();
		this._register(multiDiffSourceResolverService.registerResolver(_instantiationService.createInstance(ChatEditingMultiDiffSourceResolver, this._currentSessionObs)));
		textModelService.registerTextModelContentProvider(ChatEditingTextModelContentProvider.scheme, _instantiationService.createInstance(ChatEditingTextModelContentProvider, this._currentSessionObs));
		this._register(bindContextKey(decidedChatEditingResourceContextKey, contextKeyService, (reader) => {
			const currentSession = this._currentSessionObs.read(reader);
			if (!currentSession) {
				return;
			}
			const entries = currentSession.entries.read(reader);
			const decidedEntries = entries.filter(entry => entry.state.read(reader) !== ModifiedFileEntryState.Undecided);
			return decidedEntries.map(entry => entry.entryId);
		}));
		this._register(this._chatService.onDidDisposeSession((e) => {
			if (e.reason === 'cleared' && this._currentSessionObs.get()?.chatSessionId === e.sessionId) {
				void this._currentSessionObs.get()?.stop();
			}
		}));
	}

	async addFileToWorkingSet(resource: URI): Promise<void> {
		const session = this._currentSessionObs.get();
		if (session) {
			session.addFileToWorkingSet(resource);
		}
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

		// listen for completed responses, run the code mapper and apply the edits to this edit session
		this._register(this.installAutoApplyObserver(chatSessionId));

		const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
			multiDiffSource: ChatEditingMultiDiffSourceResolver.getMultiDiffSourceUri(),
			label: localize('multiDiffEditorInput.name', "Suggested Edits")
		}, this._instantiationService);

		const editorPane = options?.silent ? undefined : await this._editorGroupsService.activeGroup.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE }) as MultiDiffEditor | undefined;

		const session = this._instantiationService.createInstance(ChatEditingSession, chatSessionId, editorPane);
		this._currentSessionDisposeListener.value = session.onDidDispose(() => {
			this._currentSessionDisposeListener.clear();
			this._currentSessionObs.set(null, undefined);
		});

		this._currentSessionObs.set(session, undefined);
		this._onDidCreateEditingSession.fire(session);
		return session;
	}

	public triggerEditComputation(responseModel: IChatResponseModel): Promise<void> {
		return this._continueEditingSession(async (builder, token) => {
			const codeMapperResponse: ICodeMapperResponse = {
				textEdit: (resource, edits) => builder.textEdits(resource, edits),
			};
			await this._codeMapperService.mapCodeFromResponse(responseModel, codeMapperResponse, token);
		}, { silent: true });
	}

	private installAutoApplyObserver(sessionId: string): IDisposable {

		const chatModel = this._chatService.getSession(sessionId);
		if (!chatModel) {
			throw new Error(`Edit session was created for a non-existing chat session: ${sessionId}`);
		}

		const observerDisposables = new DisposableStore();

		const onResponseComplete = (responseModel: IChatResponseModel) => {
			if (responseModel.result?.metadata?.autoApplyEdits) {
				this.triggerEditComputation(responseModel);
			}
		};

		observerDisposables.add(chatModel.onDidChange(e => {
			if (e.kind === 'addRequest') {
				const responseModel = e.request.response;
				if (responseModel) {
					if (responseModel.isComplete) {
						onResponseComplete(responseModel);
					} else {
						const disposable = responseModel.onDidChange(() => {
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
			textEdits: (resource: URI, textEdits: TextEdit[]) => {
				session.acceptTextEdits(resource, textEdits);
			}
		};
		session.acceptStreamingEditsStart();
		const cancellationTokenSource = new CancellationTokenSource();
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

class ChatEditingMultiDiffSourceResolver implements IMultiDiffSourceResolver {
	public static readonly scheme = 'chat-editing-multi-diff-source';

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

registerAction2(class OpenFileAction extends Action2 {
	constructor() {
		super({
			id: 'chatEditing.openFile',
			title: localize2('open.file', 'Open File'),
			icon: Codicon.goToFile,
			menu: [{
				id: MenuId.ChatEditingSessionWidgetToolbar,
				order: 0,
				group: 'navigation'
			}],
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const editorService = accessor.get(IEditorService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}

		const chatWidget = accessor.get(IChatWidgetService).lastFocusedWidget;
		const uris: URI[] = [];
		if (URI.isUri(args[0])) {
			uris.push(args[0]);
		} else if (chatWidget) {
			uris.push(...chatWidget.input.selectedElements);
		}
		if (!uris.length) {
			return;
		}

		await Promise.all(uris.map((uri) => editorService.openEditor({ resource: uri, options: { pinned: true, activation: EditorActivation.ACTIVATE } })));
	}
});

registerAction2(class AcceptAction extends Action2 {
	constructor() {
		super({
			id: 'chatEditing.acceptFile',
			title: localize2('accept.file', 'Accept'),
			icon: Codicon.check,
			menu: [{
				when: ContextKeyExpr.and(ContextKeyExpr.equals('resourceScheme', ChatEditingMultiDiffSourceResolver.scheme), ContextKeyExpr.notIn(chatEditingResourceContextKey.key, decidedChatEditingResourceContextKey.key)),
				id: MenuId.MultiDiffEditorFileToolbar,
				order: 0,
				group: 'navigation',
			}, {
				id: MenuId.ChatEditingSessionWidgetToolbar,
				order: 2,
				group: 'navigation'
			}],
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}

		const chatWidget = accessor.get(IChatWidgetService).lastFocusedWidget;
		const uris: URI[] = [];
		if (URI.isUri(args[0])) {
			uris.push(args[0]);
		} else if (chatWidget) {
			uris.push(...chatWidget.input.selectedElements);
		}
		if (!uris.length) {
			return;
		}

		await currentEditingSession.accept(...uris);
	}
});

registerAction2(class DiscardAction extends Action2 {
	constructor() {
		super({
			id: 'chatEditing.discardFile',
			title: localize2('discard.file', 'Discard'),
			icon: Codicon.discard,
			menu: [{
				when: ContextKeyExpr.and(ContextKeyExpr.equals('resourceScheme', ChatEditingMultiDiffSourceResolver.scheme), ContextKeyExpr.notIn(chatEditingResourceContextKey.key, decidedChatEditingResourceContextKey.key)),
				id: MenuId.MultiDiffEditorFileToolbar,
				order: 0,
				group: 'navigation',
			}, {
				id: MenuId.ChatEditingSessionWidgetToolbar,
				order: 1,
				group: 'navigation'
			}],
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}

		const chatWidget = accessor.get(IChatWidgetService).lastFocusedWidget;
		const uris: URI[] = [];
		if (URI.isUri(args[0])) {
			uris.push(args[0]);
		} else if (chatWidget) {
			uris.push(...chatWidget.input.selectedElements);
		}
		if (!uris.length) {
			return;
		}

		await currentEditingSession.reject(...uris);
	}
});

export class ChatEditingAcceptAllAction extends Action2 {
	static readonly ID = 'chatEditing.acceptAllFiles';
	static readonly LABEL = localize('accept.allFiles', 'Accept All');

	constructor() {
		super({
			id: ChatEditingAcceptAllAction.ID,
			title: ChatEditingAcceptAllAction.LABEL,
			// icon: Codicon.goToFile,
			menu: {
				when: ContextKeyExpr.equals('resourceScheme', ChatEditingMultiDiffSourceResolver.scheme),
				id: MenuId.EditorTitle,
				order: 0,
				group: 'navigation',
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}
		await currentEditingSession.accept();
	}
}
registerAction2(ChatEditingAcceptAllAction);

export class ChatEditingDiscardAllAction extends Action2 {
	static readonly ID = 'chatEditing.discardAllFiles';
	static readonly LABEL = localize('discard.allFiles', 'Discard All');

	constructor() {
		super({
			id: ChatEditingDiscardAllAction.ID,
			title: ChatEditingDiscardAllAction.LABEL,
			// icon: Codicon.goToFile,
			menu: {
				when: ContextKeyExpr.equals('resourceScheme', ChatEditingMultiDiffSourceResolver.scheme),
				id: MenuId.EditorTitle,
				order: 0,
				group: 'navigation',
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}
		await currentEditingSession.reject();
	}
}
registerAction2(ChatEditingDiscardAllAction);

export class ChatEditingShowChangesAction extends Action2 {
	static readonly ID = 'chatEditing.openDiffs';
	static readonly LABEL = localize('chatEditing.openDiffs', 'Open Diffs');

	constructor() {
		super({
			id: ChatEditingShowChangesAction.ID,
			title: ChatEditingShowChangesAction.LABEL,
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}
		await currentEditingSession.show();
	}
}
registerAction2(ChatEditingShowChangesAction);

type ChatEditingTextModelContentQueryData = { kind: 'empty' } | { kind: 'doc'; documentId: string };

class ChatEditingTextModelContentProvider implements ITextModelContentProvider {
	public static readonly scheme = 'chat-editing-text-model';

	public static getEmptyFileURI(): URI {
		return URI.from({
			scheme: ChatEditingTextModelContentProvider.scheme,
			query: JSON.stringify({ kind: 'empty' }),
		});
	}

	public static getFileURI(documentId: string, path: string): URI {
		return URI.from({
			scheme: ChatEditingTextModelContentProvider.scheme,
			path,
			query: JSON.stringify({ kind: 'doc', documentId }),
		});
	}

	constructor(
		private readonly _currentSessionObs: IObservable<ChatEditingSession | null>,
		@IModelService private readonly _modelService: IModelService,
	) { }

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		const data: ChatEditingTextModelContentQueryData = JSON.parse(resource.query);
		if (data.kind === 'empty') {
			return this._modelService.createModel('', null, resource, false);
		}

		const session = this._currentSessionObs.get();
		if (!session) {
			return null;
		}

		return session.getVirtualModel(data.documentId);
	}
}

class ChatEditingSession extends Disposable implements IChatEditingSession {
	private readonly _state = observableValue<ChatEditingSessionState>(this, ChatEditingSessionState.Initial);
	private readonly _entriesObs = observableValue<readonly ModifiedFileEntry[]>(this, []);
	public get entries(): IObservable<readonly ModifiedFileEntry[]> {
		this._assertNotDisposed();
		return this._entriesObs;
	}
	private readonly _sequencer = new Sequencer();

	private _entries: ModifiedFileEntry[] = [];

	private _workingSetObs = observableValue<readonly URI[]>(this, []);
	private _workingSet: URI[] = [];
	get workingSet() {
		this._assertNotDisposed();
		return this._workingSetObs;
	}

	get state(): IObservable<ChatEditingSessionState> {
		this._assertNotDisposed();
		return this._state;
	}

	private readonly _onDidChange = new Emitter<void>();
	get onDidChange() {
		this._assertNotDisposed();
		return this._onDidChange.event;
	}

	private readonly _onDidDispose = new Emitter<void>();
	get onDidDispose() {
		this._assertNotDisposed();
		return this._onDidDispose.event;
	}

	get isVisible(): boolean {
		this._assertNotDisposed();
		return Boolean(this.editorPane && this.editorPane.isVisible());
	}

	constructor(
		public readonly chatSessionId: string,
		private editorPane: MultiDiffEditor | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IBulkEditService public readonly _bulkEditService: IBulkEditService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
	}

	private _assertNotDisposed(): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			throw new BugIndicatingError(`Cannot access a disposed editing session`);
		}
	}

	async accept(...uris: URI[]): Promise<void> {
		this._assertNotDisposed();

		if (uris.length === 0) {
			await Promise.all(this._entries.map(entry => entry.accept(undefined)));
		}

		for (const uri of uris) {
			const entry = this._entries.find(e => e.modifiedURI.toString() === uri.toString());
			if (entry) {
				await entry.accept(undefined);
			}
		}

		this._onDidChange.fire();
	}

	async reject(...uris: URI[]): Promise<void> {
		this._assertNotDisposed();

		if (uris.length === 0) {
			await Promise.all(this._entries.map(entry => entry.reject(undefined)));
		}

		for (const uri of uris) {
			const entry = this._entries.find(e => e.modifiedURI.toString() === uri.toString());
			if (entry) {
				await entry.reject(undefined);
			}
		}

		this._onDidChange.fire();
	}

	async show(): Promise<void> {
		this._assertNotDisposed();

		if (this.editorPane?.isVisible()) {
			return;
		} else if (this.editorPane?.input) {
			await this._editorGroupsService.activeGroup.openEditor(this.editorPane.input, { pinned: true, activation: EditorActivation.ACTIVATE });
			return;
		}

		const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
			multiDiffSource: ChatEditingMultiDiffSourceResolver.getMultiDiffSourceUri(),
			label: localize('multiDiffEditorInput.name', "Suggested Edits")
		}, this._instantiationService);

		const editorPane = await this._editorGroupsService.activeGroup.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE }) as MultiDiffEditor | undefined;
		this.editorPane = editorPane;
	}

	async stop(): Promise<void> {
		this._assertNotDisposed();

		// Close out all open files
		await Promise.allSettled(this._editorGroupsService.groups.map(async (g) => {
			return Promise.allSettled(g.editors.map(async (e) => {
				if (e instanceof MultiDiffEditorInput || e instanceof DiffEditorInput && (e.original.resource?.scheme === ModifiedFileEntry.scheme || e.original.resource?.scheme === ChatEditingTextModelContentProvider.scheme)) {
					await g.closeEditor(e);
				}
			}));
		}));

		if (this._state.get() !== ChatEditingSessionState.Disposed) {
			// session got disposed while we were closing editors
			this.dispose();
		}

	}

	override dispose() {
		this._assertNotDisposed();

		super.dispose();
		this._state.set(ChatEditingSessionState.Disposed, undefined);
		this._onDidDispose.fire();
	}

	getVirtualModel(documentId: string): ITextModel | null {
		this._assertNotDisposed();

		const entry = this._entries.find(e => e.entryId === documentId);
		return entry?.docSnapshot ?? null;
	}

	acceptStreamingEditsStart(): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			// we don't throw in this case because there could be a builder still connected to a disposed session
			return;
		}

		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._acceptStreamingEditsStart());
	}

	acceptTextEdits(resource: URI, textEdits: TextEdit[]): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			// we don't throw in this case because there could be a builder still connected to a disposed session
			return;
		}

		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._acceptTextEdits(resource, textEdits));
	}

	resolve(): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			// we don't throw in this case because there could be a builder still connected to a disposed session
			return;
		}

		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._resolve());
	}

	addFileToWorkingSet(resource: URI) {
		this._workingSet = [...this._workingSet, resource];
		this._workingSetObs.set(this._workingSet, undefined);
		this._onDidChange.fire();
	}

	private async _acceptStreamingEditsStart(): Promise<void> {
		this._state.set(ChatEditingSessionState.StreamingEdits, undefined);
		this._onDidChange.fire();
	}

	private async _acceptTextEdits(resource: URI, textEdits: TextEdit[]): Promise<void> {
		const entry = await this._getOrCreateModifiedFileEntry(resource);
		entry.applyEdits(textEdits);
		await this.editorService.openEditor({ original: { resource: entry.originalURI }, modified: { resource: entry.modifiedURI }, options: { inactive: true } });
	}

	private async _resolve(): Promise<void> {
		this._state.set(ChatEditingSessionState.Idle, undefined);
		this._onDidChange.fire();
	}

	private async _getOrCreateModifiedFileEntry(resource: URI): Promise<ModifiedFileEntry> {
		const existingEntry = this._entries.find(e => e.resource.toString() === resource.toString());
		if (existingEntry) {
			return existingEntry;
		}

		const entry = await this._createModifiedFileEntry(resource);
		this._register(entry);
		this._entries = [...this._entries, entry];
		this._entriesObs.set(this._entries, undefined);
		this._onDidChange.fire();

		return entry;
	}

	private async _createModifiedFileEntry(resource: URI, mustExist = false): Promise<ModifiedFileEntry> {
		try {
			const ref = await this._textModelService.createModelReference(resource);
			return this._instantiationService.createInstance(ModifiedFileEntry, resource, ref, { collapse: (transaction: ITransaction | undefined) => this._collapse(resource, transaction) });
		} catch (err) {
			if (mustExist) {
				throw err;
			}
			// this file does not exist yet, create it and try again
			await this._bulkEditService.apply({ edits: [{ newResource: resource }] });
			return this._createModifiedFileEntry(resource, true);
		}
	}

	private _collapse(resource: URI, transaction: ITransaction | undefined) {
		const multiDiffItem = this.editorPane?.findDocumentDiffItem(resource);
		if (multiDiffItem) {
			this.editorPane?.viewModel?.items.get().find((documentDiffItem) => String(documentDiffItem.originalUri) === String(multiDiffItem.originalUri) && String(documentDiffItem.modifiedUri) === String(multiDiffItem.modifiedUri))?.collapsed.set(true, transaction);
		}
	}
}

class ModifiedFileEntry extends Disposable implements IModifiedFileEntry {

	public static readonly scheme = 'modified-file-entry';
	static lastEntryId = 0;
	public readonly entryId = `${ModifiedFileEntry.scheme}::${++ModifiedFileEntry.lastEntryId}`;

	public readonly docSnapshot: ITextModel;
	private readonly doc: ITextModel;

	get originalURI(): URI {
		return this.docSnapshot.uri;
	}

	get modifiedURI(): URI {
		return this.doc.uri;
	}

	private readonly _stateObs = observableValue<ModifiedFileEntryState>(this, ModifiedFileEntryState.Undecided);
	public get state(): IObservable<ModifiedFileEntryState> {
		return this._stateObs;
	}

	constructor(
		public readonly resource: URI,
		resourceRef: IReference<IResolvedTextEditorModel>,
		private readonly _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
		@IModelService modelService: IModelService,
		@ILanguageService languageService: ILanguageService,
		@IBulkEditService public readonly _bulkEditService: IBulkEditService,
	) {
		super();
		this.doc = resourceRef.object.textEditorModel;
		this.docSnapshot = this._register(
			modelService.createModel(
				createTextBufferFactoryFromSnapshot(this.doc.createSnapshot()),
				languageService.createById(this.doc.getLanguageId()),
				ChatEditingTextModelContentProvider.getFileURI(this.entryId, resource.path),
				false
			)
		);
		this._register(resourceRef);
	}

	applyEdits(textEdits: TextEdit[]): void {
		this.doc.applyEdits(textEdits);
		this._stateObs.set(ModifiedFileEntryState.Undecided, undefined);
	}

	async accept(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== ModifiedFileEntryState.Undecided) {
			// already accepted or rejected
			return;
		}
		this.docSnapshot.setValue(this.doc.createSnapshot());
		this._stateObs.set(ModifiedFileEntryState.Accepted, transaction);
		await this.collapse(transaction);
	}

	async reject(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== ModifiedFileEntryState.Undecided) {
			// already accepted or rejected
			return;
		}
		this.doc.setValue(this.docSnapshot.createSnapshot());
		this._stateObs.set(ModifiedFileEntryState.Rejected, transaction);
		await this.collapse(transaction);
	}

	async collapse(transaction: ITransaction | undefined): Promise<void> {
		this._multiDiffEntryDelegate.collapse(transaction);
	}
}
