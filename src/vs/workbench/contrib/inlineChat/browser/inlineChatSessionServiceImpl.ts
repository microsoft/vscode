/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IActiveCodeEditor, ICodeEditor, isCodeEditor, isCompositeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IValidEditOperation } from '../../../../editor/common/model.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../editor/common/model/textModel.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { UntitledTextEditorInput } from '../../../services/untitled/common/untitledTextEditorInput.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { IChatAgentService } from '../../chat/common/chatAgents.js';
import { ModifiedFileEntryState } from '../../chat/common/chatEditingService.js';
import { IChatService } from '../../chat/common/chatService.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { ILanguageModelToolsService, ToolDataSource, IToolData } from '../../chat/common/languageModelToolsService.js';
import { CTX_INLINE_CHAT_HAS_AGENT, CTX_INLINE_CHAT_HAS_AGENT2, CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT, CTX_INLINE_CHAT_HAS_NOTEBOOK_INLINE, CTX_INLINE_CHAT_POSSIBLE, InlineChatConfigKeys } from '../common/inlineChat.js';
import { HunkData, Session, SessionWholeRange, StashedSession, TelemetryData, TelemetryDataClassification } from './inlineChatSession.js';
import { askInPanelChat, IInlineChatSession2, IInlineChatSessionEndEvent, IInlineChatSessionEvent, IInlineChatSessionService, ISessionKeyComputer } from './inlineChatSessionService.js';


type SessionData = {
	editor: ICodeEditor;
	session: Session;
	store: IDisposable;
};

export class InlineChatError extends Error {
	static readonly code = 'InlineChatError';
	constructor(message: string) {
		super(message);
		this.name = InlineChatError.code;
	}
}


export class InlineChatSessionServiceImpl implements IInlineChatSessionService {

	declare _serviceBrand: undefined;

	private readonly _store = new DisposableStore();

	private readonly _onWillStartSession = this._store.add(new Emitter<IActiveCodeEditor>());
	readonly onWillStartSession: Event<IActiveCodeEditor> = this._onWillStartSession.event;

	private readonly _onDidMoveSession = this._store.add(new Emitter<IInlineChatSessionEvent>());
	readonly onDidMoveSession: Event<IInlineChatSessionEvent> = this._onDidMoveSession.event;

	private readonly _onDidEndSession = this._store.add(new Emitter<IInlineChatSessionEndEvent>());
	readonly onDidEndSession: Event<IInlineChatSessionEndEvent> = this._onDidEndSession.event;

	private readonly _onDidStashSession = this._store.add(new Emitter<IInlineChatSessionEvent>());
	readonly onDidStashSession: Event<IInlineChatSessionEvent> = this._onDidStashSession.event;

	private readonly _sessions = new Map<string, SessionData>();
	private readonly _keyComputers = new Map<string, ISessionKeyComputer>();

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IChatService private readonly _chatService: IChatService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
	) {

	}

	dispose() {
		this._store.dispose();
		this._sessions.forEach(x => x.store.dispose());
		this._sessions.clear();
	}

	async createSession(editor: IActiveCodeEditor, options: { headless?: boolean; wholeRange?: Range; session?: Session }, token: CancellationToken): Promise<Session | undefined> {

		const agent = this._chatAgentService.getDefaultAgent(ChatAgentLocation.EditorInline);

		if (!agent) {
			this._logService.trace('[IE] NO agent found');
			return undefined;
		}

		this._onWillStartSession.fire(editor);

		const textModel = editor.getModel();
		const selection = editor.getSelection();

		const store = new DisposableStore();
		this._logService.trace(`[IE] creating NEW session for ${editor.getId()}, ${agent.extensionId}`);

		const chatModel = options.session?.chatModel ?? this._chatService.startSession(ChatAgentLocation.EditorInline, token);
		if (!chatModel) {
			this._logService.trace('[IE] NO chatModel found');
			return undefined;
		}

		store.add(toDisposable(() => {
			const doesOtherSessionUseChatModel = [...this._sessions.values()].some(data => data.session !== session && data.session.chatModel === chatModel);

			if (!doesOtherSessionUseChatModel) {
				this._chatService.clearSession(chatModel.sessionResource);
				chatModel.dispose();
			}
		}));

		const lastResponseListener = store.add(new MutableDisposable());
		store.add(chatModel.onDidChange(e => {
			if (e.kind !== 'addRequest' || !e.request.response) {
				return;
			}

			const { response } = e.request;

			session.markModelVersion(e.request);
			lastResponseListener.value = response.onDidChange(() => {

				if (!response.isComplete) {
					return;
				}

				lastResponseListener.clear(); // ONCE

				// special handling for untitled files
				for (const part of response.response.value) {
					if (part.kind !== 'textEditGroup' || part.uri.scheme !== Schemas.untitled || isEqual(part.uri, session.textModelN.uri)) {
						continue;
					}
					const langSelection = this._languageService.createByFilepathOrFirstLine(part.uri, undefined);
					const untitledTextModel = this._textFileService.untitled.create({
						associatedResource: part.uri,
						languageId: langSelection.languageId
					});
					untitledTextModel.resolve();
					this._textModelService.createModelReference(part.uri).then(ref => {
						store.add(ref);
					});
				}

			});
		}));

		store.add(this._chatAgentService.onDidChangeAgents(e => {
			if (e === undefined && (!this._chatAgentService.getAgent(agent.id) || !this._chatAgentService.getActivatedAgents().map(agent => agent.id).includes(agent.id))) {
				this._logService.trace(`[IE] provider GONE for ${editor.getId()}, ${agent.extensionId}`);
				this._releaseSession(session, true);
			}
		}));

		const id = generateUuid();
		const targetUri = textModel.uri;

		// AI edits happen in the actual model, keep a reference but make no copy
		store.add((await this._textModelService.createModelReference(textModel.uri)));
		const textModelN = textModel;

		// create: keep a snapshot of the "actual" model
		const textModel0 = store.add(this._modelService.createModel(
			createTextBufferFactoryFromSnapshot(textModel.createSnapshot()),
			{ languageId: textModel.getLanguageId(), onDidChange: Event.None },
			targetUri.with({ scheme: Schemas.vscode, authority: 'inline-chat', path: '', query: new URLSearchParams({ id, 'textModel0': '' }).toString() }), true
		));

		// untitled documents are special and we are releasing their session when their last editor closes
		if (targetUri.scheme === Schemas.untitled) {
			store.add(this._editorService.onDidCloseEditor(() => {
				if (!this._editorService.isOpened({ resource: targetUri, typeId: UntitledTextEditorInput.ID, editorId: DEFAULT_EDITOR_ASSOCIATION.id })) {
					this._releaseSession(session, true);
				}
			}));
		}

		let wholeRange = options.wholeRange;
		if (!wholeRange) {
			wholeRange = new Range(selection.selectionStartLineNumber, selection.selectionStartColumn, selection.positionLineNumber, selection.positionColumn);
		}

		if (token.isCancellationRequested) {
			store.dispose();
			return undefined;
		}

		const session = new Session(
			options.headless ?? false,
			targetUri,
			textModel0,
			textModelN,
			agent,
			store.add(new SessionWholeRange(textModelN, wholeRange)),
			store.add(new HunkData(this._editorWorkerService, textModel0, textModelN)),
			chatModel,
			options.session?.versionsByRequest,
		);

		// store: key -> session
		const key = this._key(editor, session.targetUri);
		if (this._sessions.has(key)) {
			store.dispose();
			throw new Error(`Session already stored for ${key}`);
		}
		this._sessions.set(key, { session, editor, store });
		return session;
	}

	moveSession(session: Session, target: ICodeEditor): void {
		const newKey = this._key(target, session.targetUri);
		const existing = this._sessions.get(newKey);
		if (existing) {
			if (existing.session !== session) {
				throw new Error(`Cannot move session because the target editor already/still has one`);
			} else {
				// noop
				return;
			}
		}

		let found = false;
		for (const [oldKey, data] of this._sessions) {
			if (data.session === session) {
				found = true;
				this._sessions.delete(oldKey);
				this._sessions.set(newKey, { ...data, editor: target });
				this._logService.trace(`[IE] did MOVE session for ${data.editor.getId()} to NEW EDITOR ${target.getId()}, ${session.agent.extensionId}`);
				this._onDidMoveSession.fire({ session, editor: target });
				break;
			}
		}
		if (!found) {
			throw new Error(`Cannot move session because it is not stored`);
		}
	}

	releaseSession(session: Session): void {
		this._releaseSession(session, false);
	}

	private _releaseSession(session: Session, byServer: boolean): void {

		let tuple: [string, SessionData] | undefined;

		// cleanup
		for (const candidate of this._sessions) {
			if (candidate[1].session === session) {
				// if (value.session === session) {
				tuple = candidate;
				break;
			}
		}

		if (!tuple) {
			// double remove
			return;
		}

		this._telemetryService.publicLog2<TelemetryData, TelemetryDataClassification>('interactiveEditor/session', session.asTelemetryData());

		const [key, value] = tuple;
		this._sessions.delete(key);
		this._logService.trace(`[IE] did RELEASED session for ${value.editor.getId()}, ${session.agent.extensionId}`);

		this._onDidEndSession.fire({ editor: value.editor, session, endedByExternalCause: byServer });
		value.store.dispose();
	}

	stashSession(session: Session, editor: ICodeEditor, undoCancelEdits: IValidEditOperation[]): StashedSession {
		const result = this._instaService.createInstance(StashedSession, editor, session, undoCancelEdits);
		this._onDidStashSession.fire({ editor, session });
		this._logService.trace(`[IE] did STASH session for ${editor.getId()}, ${session.agent.extensionId}`);
		return result;
	}

	getCodeEditor(session: Session): ICodeEditor {
		for (const [, data] of this._sessions) {
			if (data.session === session) {
				return data.editor;
			}
		}
		throw new Error('session not found');
	}

	getSession(editor: ICodeEditor, uri: URI): Session | undefined {
		const key = this._key(editor, uri);
		return this._sessions.get(key)?.session;
	}

	private _key(editor: ICodeEditor, uri: URI): string {
		const item = this._keyComputers.get(uri.scheme);
		return item
			? item.getComparisonKey(editor, uri)
			: `${editor.getId()}@${uri.toString()}`;

	}

	registerSessionKeyComputer(scheme: string, value: ISessionKeyComputer): IDisposable {
		this._keyComputers.set(scheme, value);
		return toDisposable(() => this._keyComputers.delete(scheme));
	}

	// ---- NEW

	private readonly _sessions2 = new ResourceMap<IInlineChatSession2>();

	private readonly _onDidChangeSessions = this._store.add(new Emitter<this>());
	readonly onDidChangeSessions: Event<this> = this._onDidChangeSessions.event;


	async createSession2(editor: ICodeEditor, uri: URI, token: CancellationToken): Promise<IInlineChatSession2> {

		assertType(editor.hasModel());

		if (this._sessions2.has(uri)) {
			throw new Error('Session already exists');
		}

		this._onWillStartSession.fire(editor as IActiveCodeEditor);

		const chatModel = this._chatService.startSession(ChatAgentLocation.Chat, token, false);

		const editingSession = await chatModel.editingSessionObs?.promise!;
		const widget = this._chatWidgetService.getWidgetBySessionResource(chatModel.sessionResource);
		await widget?.attachmentModel.addFile(uri);

		const store = new DisposableStore();
		store.add(toDisposable(() => {
			this._chatService.cancelCurrentRequestForSession(chatModel.sessionResource);
			editingSession.reject();
			this._sessions2.delete(uri);
			this._onDidChangeSessions.fire(this);
		}));
		store.add(chatModel);

		store.add(autorun(r => {

			const entries = editingSession.entries.read(r);
			if (entries.length === 0) {
				return;
			}

			const allSettled = entries.every(entry => {
				const state = entry.state.read(r);
				return (state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected)
					&& !entry.isCurrentlyBeingModifiedBy.read(r);
			});

			if (allSettled && !chatModel.requestInProgress) {
				// self terminate
				store.dispose();
			}
		}));

		const result: IInlineChatSession2 = {
			uri,
			initialPosition: editor.getSelection().getStartPosition().delta(-1), /* one line above selection start */
			chatModel,
			editingSession,
			dispose: store.dispose.bind(store)
		};
		this._sessions2.set(uri, result);
		this._onDidChangeSessions.fire(this);
		return result;
	}

	getSession2(uriOrSessionId: URI | string): IInlineChatSession2 | undefined {
		if (URI.isUri(uriOrSessionId)) {

			let result = this._sessions2.get(uriOrSessionId);
			if (!result) {
				// no direct session, try to find an editing session which has a file entry for the uri
				for (const [_, candidate] of this._sessions2) {
					const entry = candidate.editingSession.getEntry(uriOrSessionId);
					if (entry) {
						result = candidate;
						break;
					}
				}
			}
			return result;
		} else {
			for (const session of this._sessions2.values()) {
				if (session.chatModel.sessionId === uriOrSessionId) {
					return session;
				}
			}
		}
		return undefined;
	}
}

export class InlineChatEnabler {

	static Id = 'inlineChat.enabler';

	private readonly _ctxHasProvider: IContextKey<boolean>;
	private readonly _ctxHasProvider2: IContextKey<boolean>;
	private readonly _ctxHasNotebookInline: IContextKey<boolean>;
	private readonly _ctxHasNotebookProvider: IContextKey<boolean>;
	private readonly _ctxPossible: IContextKey<boolean>;

	private readonly _store = new DisposableStore();

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IEditorService editorService: IEditorService,
		@IConfigurationService configService: IConfigurationService,
	) {
		this._ctxHasProvider = CTX_INLINE_CHAT_HAS_AGENT.bindTo(contextKeyService);
		this._ctxHasProvider2 = CTX_INLINE_CHAT_HAS_AGENT2.bindTo(contextKeyService);
		this._ctxHasNotebookInline = CTX_INLINE_CHAT_HAS_NOTEBOOK_INLINE.bindTo(contextKeyService);
		this._ctxHasNotebookProvider = CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT.bindTo(contextKeyService);
		this._ctxPossible = CTX_INLINE_CHAT_POSSIBLE.bindTo(contextKeyService);

		const agentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.EditorInline));
		const inlineChat2Obs = observableConfigValue(InlineChatConfigKeys.EnableV2, false, configService);
		const notebookAgentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.Notebook));
		const notebookAgentConfigObs = observableConfigValue(InlineChatConfigKeys.notebookAgent, false, configService);

		this._store.add(autorun(r => {
			const v2 = inlineChat2Obs.read(r);
			const agent = agentObs.read(r);
			if (!agent) {
				this._ctxHasProvider.reset();
				this._ctxHasProvider2.reset();
			} else if (v2) {
				this._ctxHasProvider.reset();
				this._ctxHasProvider2.set(true);
			} else {
				this._ctxHasProvider.set(true);
				this._ctxHasProvider2.reset();
			}
		}));

		this._store.add(autorun(r => {
			this._ctxHasNotebookInline.set(!notebookAgentConfigObs.read(r) && !!agentObs.read(r));
			this._ctxHasNotebookProvider.set(notebookAgentConfigObs.read(r) && !!notebookAgentObs.read(r));
		}));

		const updateEditor = () => {
			const ctrl = editorService.activeEditorPane?.getControl();
			const isCodeEditorLike = isCodeEditor(ctrl) || isDiffEditor(ctrl) || isCompositeEditor(ctrl);
			this._ctxPossible.set(isCodeEditorLike);
		};

		this._store.add(editorService.onDidActiveEditorChange(updateEditor));
		updateEditor();
	}

	dispose() {
		this._ctxPossible.reset();
		this._ctxHasProvider.reset();
		this._store.dispose();
	}
}


export class InlineChatEscapeToolContribution extends Disposable {

	static readonly Id = 'inlineChat.escapeTool';

	static readonly DONT_ASK_AGAIN_KEY = 'inlineChat.dontAskMoveToPanelChat';

	private static readonly _data: IToolData = {
		id: 'inline_chat_exit',
		source: ToolDataSource.Internal,
		canBeReferencedInPrompt: false,
		alwaysDisplayInputOutput: false,
		displayName: localize('name', "Inline Chat to Panel Chat"),
		modelDescription: 'Moves the inline chat session to the richer panel chat which supports edits across files, creating and deleting files, multi-turn conversations between the user and the assistant, and access to more IDE tools, like retrieve problems, interact with source control, run terminal commands etc.',
	};

	constructor(
		@ILanguageModelToolsService lmTools: ILanguageModelToolsService,
		@IInlineChatSessionService inlineChatSessionService: IInlineChatSessionService,
		@IDialogService dialogService: IDialogService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IChatService chatService: IChatService,
		@ILogService logService: ILogService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instaService: IInstantiationService,
	) {

		super();

		this._store.add(lmTools.registerTool(InlineChatEscapeToolContribution._data, {
			invoke: async (invocation, _tokenCountFn, _progress, _token) => {

				const sessionId = invocation.context?.sessionId;

				if (!sessionId) {
					logService.warn('InlineChatEscapeToolContribution: no sessionId in tool invocation context');
					return { content: [{ kind: 'text', value: 'Cancel' }] };
				}

				const session = inlineChatSessionService.getSession2(sessionId);

				if (!session) {
					logService.warn(`InlineChatEscapeToolContribution: no session found for id ${sessionId}`);
					return { content: [{ kind: 'text', value: 'Cancel' }] };
				}

				const dontAskAgain = storageService.getBoolean(InlineChatEscapeToolContribution.DONT_ASK_AGAIN_KEY, StorageScope.PROFILE);

				let result: { confirmed: boolean; checkboxChecked?: boolean };
				if (dontAskAgain !== undefined) {
					// Use previously stored user preference: true = 'Continue in Chat', false = 'Rephrase' (Cancel)
					result = { confirmed: dontAskAgain, checkboxChecked: false };
				} else {
					result = await dialogService.confirm({
						type: 'question',
						title: localize('confirm.title', "Continue in Panel Chat?"),
						message: localize('confirm', "Do you want to continue in panel chat or rephrase your prompt?"),
						detail: localize('confirm.detail', "Inline Chat is designed for single file code changes. This task is either too complex or requires a text response. You can rephrase your prompt or continue in panel chat."),
						primaryButton: localize('confirm.yes', "Continue in Chat"),
						cancelButton: localize('confirm.cancel', "Cancel"),
						checkbox: { label: localize('chat.remove.confirmation.checkbox', "Don't ask again"), checked: false },
					});
				}

				const editor = codeEditorService.getFocusedCodeEditor();

				if (!editor || result.confirmed) {
					logService.trace('InlineChatEscapeToolContribution: moving session to panel chat');
					await instaService.invokeFunction(askInPanelChat, session.chatModel.getRequests().at(-1)!);
					session.dispose();

				} else {
					logService.trace('InlineChatEscapeToolContribution: rephrase prompt');
					chatService.removeRequest(session.chatModel.sessionResource, session.chatModel.getRequests().at(-1)!.id);
				}

				if (result.checkboxChecked) {
					storageService.store(InlineChatEscapeToolContribution.DONT_ASK_AGAIN_KEY, result.confirmed, StorageScope.PROFILE, StorageTarget.USER);
					logService.trace('InlineChatEscapeToolContribution: stored don\'t ask again preference');
				}

				return { content: [{ kind: 'text', value: 'Success' }] };
			}
		}));
	}
}

registerAction2(class ResetMoveToPanelChatChoice extends Action2 {
	constructor() {
		super({
			id: 'inlineChat.resetMoveToPanelChatChoice',
			precondition: ContextKeyExpr.has('config.chat.disableAIFeatures').negate(),
			title: localize2('resetChoice.label', "Reset Choice for 'Move Inline Chat to Panel Chat'"),
			f1: true
		});
	}
	run(accessor: ServicesAccessor) {
		accessor.get(IStorageService).remove(InlineChatEscapeToolContribution.DONT_ASK_AGAIN_KEY, StorageScope.PROFILE);
	}
});
