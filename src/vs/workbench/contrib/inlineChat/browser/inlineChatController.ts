/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { Barrier, DeferredPromise, Queue, raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { MovingAverage } from '../../../../base/common/numbers.js';
import { autorun, derived, IObservable, observableFromEvent, observableSignalFromEvent, observableValue, waitForState } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ICodeEditor, isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { IPosition, Position } from '../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { ISelection, Selection, SelectionDirection } from '../../../../editor/common/core/selection.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { TextEdit, VersionedExtensionId } from '../../../../editor/common/languages.js';
import { IValidEditOperation } from '../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IMarkerDecorationsService } from '../../../../editor/common/services/markerDecorations.js';
import { DefaultModelSHA1Computer } from '../../../../editor/common/services/modelService.js';
import { EditSuggestionId } from '../../../../editor/common/textModelEditSource.js';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import { MessageController } from '../../../../editor/contrib/message/browser/messageController.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ISharedWebContentExtractorService } from '../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IChatAttachmentResolveService } from '../../chat/browser/chatAttachmentResolveService.js';
import { IChatWidgetLocationOptions } from '../../chat/browser/chatWidget.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';
import { IChatEditingSession, ModifiedFileEntryState } from '../../chat/common/chatEditingService.js';
import { ChatModel, ChatRequestRemovalReason, IChatRequestModel, IChatTextEditGroup, IChatTextEditGroupState, IResponse } from '../../chat/common/chatModel.js';
import { ChatMode } from '../../chat/common/chatModes.js';
import { IChatService } from '../../chat/common/chatService.js';
import { IChatRequestVariableEntry, IDiagnosticVariableEntryFilterData } from '../../chat/common/chatVariableEntries.js';
import { isResponseVM } from '../../chat/common/chatViewModel.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { isNotebookContainingCellEditor as isNotebookWithCellEditor } from '../../notebook/browser/notebookEditor.js';
import { INotebookEditorService } from '../../notebook/browser/services/notebookEditorService.js';
import { ICellEditOperation } from '../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { CTX_INLINE_CHAT_EDITING, CTX_INLINE_CHAT_REQUEST_IN_PROGRESS, CTX_INLINE_CHAT_RESPONSE_TYPE, CTX_INLINE_CHAT_VISIBLE, INLINE_CHAT_ID, InlineChatConfigKeys, InlineChatResponseType } from '../common/inlineChat.js';
import { HunkInformation, Session, StashedSession } from './inlineChatSession.js';
import { IInlineChatSession2, IInlineChatSessionService, moveToPanelChat } from './inlineChatSessionService.js';
import { InlineChatError } from './inlineChatSessionServiceImpl.js';
import { HunkAction, IEditObserver, IInlineChatMetadata, LiveStrategy, ProgressingEditsOptions } from './inlineChatStrategies.js';
import { EditorBasedInlineChatWidget } from './inlineChatWidget.js';
import { InlineChatZoneWidget } from './inlineChatZoneWidget.js';

export const enum State {
	CREATE_SESSION = 'CREATE_SESSION',
	INIT_UI = 'INIT_UI',
	WAIT_FOR_INPUT = 'WAIT_FOR_INPUT',
	SHOW_REQUEST = 'SHOW_REQUEST',
	PAUSE = 'PAUSE',
	CANCEL = 'CANCEL',
	ACCEPT = 'DONE',
}

const enum Message {
	NONE = 0,
	ACCEPT_SESSION = 1 << 0,
	CANCEL_SESSION = 1 << 1,
	PAUSE_SESSION = 1 << 2,
	CANCEL_REQUEST = 1 << 3,
	CANCEL_INPUT = 1 << 4,
	ACCEPT_INPUT = 1 << 5,
}

export abstract class InlineChatRunOptions {
	initialSelection?: ISelection;
	initialRange?: IRange;
	message?: string;
	attachments?: URI[];
	autoSend?: boolean;
	existingSession?: Session;
	position?: IPosition;

	static isInlineChatRunOptions(options: any): options is InlineChatRunOptions {
		const { initialSelection, initialRange, message, autoSend, position, existingSession, attachments: attachments } = <InlineChatRunOptions>options;
		if (
			typeof message !== 'undefined' && typeof message !== 'string'
			|| typeof autoSend !== 'undefined' && typeof autoSend !== 'boolean'
			|| typeof initialRange !== 'undefined' && !Range.isIRange(initialRange)
			|| typeof initialSelection !== 'undefined' && !Selection.isISelection(initialSelection)
			|| typeof position !== 'undefined' && !Position.isIPosition(position)
			|| typeof existingSession !== 'undefined' && !(existingSession instanceof Session)
			|| typeof attachments !== 'undefined' && (!Array.isArray(attachments) || !attachments.every(item => item instanceof URI))
		) {
			return false;
		}
		return true;
	}
}

export class InlineChatController implements IEditorContribution {

	static ID = 'editor.contrib.inlineChatController';

	static get(editor: ICodeEditor) {
		return editor.getContribution<InlineChatController>(InlineChatController.ID);
	}

	private readonly _delegate: IObservable<InlineChatController1 | InlineChatController2>;

	constructor(
		editor: ICodeEditor,
		@IConfigurationService configurationService: IConfigurationService,
		@INotebookEditorService private readonly _notebookEditorService: INotebookEditorService
	) {
		const notebookAgent = observableConfigValue(InlineChatConfigKeys.notebookAgent, false, configurationService);

		this._delegate = derived(r => {
			const isNotebookCell = !!this._notebookEditorService.getNotebookForPossibleCell(editor);
			if (!isNotebookCell || notebookAgent.read(r)) {
				return InlineChatController2.get(editor)!;
			} else {
				return InlineChatController1.get(editor)!;
			}
		});
	}

	dispose(): void {

	}

	get isActive(): boolean {
		return this._delegate.get().isActive;
	}

	async run(arg?: InlineChatRunOptions): Promise<boolean> {
		return this._delegate.get().run(arg);
	}

	focus() {
		return this._delegate.get().focus();
	}

	get widget(): EditorBasedInlineChatWidget {
		return this._delegate.get().widget;
	}

	getWidgetPosition() {
		return this._delegate.get().getWidgetPosition();
	}

	acceptSession() {
		return this._delegate.get().acceptSession();
	}
}

/**
 * @deprecated
 */
export class InlineChatController1 implements IEditorContribution {

	static get(editor: ICodeEditor) {
		return editor.getContribution<InlineChatController1>(INLINE_CHAT_ID);
	}

	private _isDisposed: boolean = false;
	private readonly _store = new DisposableStore();

	private readonly _ui: Lazy<InlineChatZoneWidget>;

	private readonly _ctxVisible: IContextKey<boolean>;
	private readonly _ctxEditing: IContextKey<boolean>;
	private readonly _ctxResponseType: IContextKey<undefined | InlineChatResponseType>;
	private readonly _ctxRequestInProgress: IContextKey<boolean>;

	private readonly _ctxResponse: IContextKey<boolean>;

	private readonly _messages = this._store.add(new Emitter<Message>());
	protected readonly _onDidEnterState = this._store.add(new Emitter<State>());

	get chatWidget() {
		return this._ui.value.widget.chatWidget;
	}

	private readonly _sessionStore = this._store.add(new DisposableStore());
	private readonly _stashedSession = this._store.add(new MutableDisposable<StashedSession>());
	private _delegateSession?: IChatEditingSession;

	private _session?: Session;
	private _strategy?: LiveStrategy;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IInlineChatSessionService private readonly _inlineChatSessionService: IInlineChatSessionService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService private readonly _chatService: IChatService,
		@IEditorService private readonly _editorService: IEditorService,
		@INotebookEditorService notebookEditorService: INotebookEditorService,
		@ISharedWebContentExtractorService private readonly _webContentExtractorService: ISharedWebContentExtractorService,
		@IFileService private readonly _fileService: IFileService,
		@IChatAttachmentResolveService private readonly _chatAttachmentResolveService: IChatAttachmentResolveService
	) {
		this._ctxVisible = CTX_INLINE_CHAT_VISIBLE.bindTo(contextKeyService);
		this._ctxEditing = CTX_INLINE_CHAT_EDITING.bindTo(contextKeyService);
		this._ctxResponseType = CTX_INLINE_CHAT_RESPONSE_TYPE.bindTo(contextKeyService);
		this._ctxRequestInProgress = CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.bindTo(contextKeyService);

		this._ctxResponse = ChatContextKeys.isResponse.bindTo(contextKeyService);
		ChatContextKeys.responseHasError.bindTo(contextKeyService);

		this._ui = new Lazy(() => {

			const location: IChatWidgetLocationOptions = {
				location: ChatAgentLocation.EditorInline,
				resolveData: () => {
					assertType(this._editor.hasModel());
					assertType(this._session);
					return {
						type: ChatAgentLocation.EditorInline,
						selection: this._editor.getSelection(),
						document: this._session.textModelN.uri,
						wholeRange: this._session?.wholeRange.trackedInitialRange,
						close: () => this.cancelSession(),
						delegateSessionResource: this._delegateSession?.chatSessionResource,
					};
				}
			};

			// inline chat in notebooks
			// check if this editor is part of a notebook editor
			// and iff so, use the notebook location but keep the resolveData
			// talk about editor data
			const notebookEditor = notebookEditorService.getNotebookForPossibleCell(this._editor);
			if (!!notebookEditor) {
				location.location = ChatAgentLocation.Notebook;
			}

			const clear = async () => {
				const r = this.joinCurrentRun();
				this.cancelSession();
				await r;
				this.run();
			};
			const zone = _instaService.createInstance(InlineChatZoneWidget, location, undefined, { editor: this._editor, notebookEditor }, clear);
			this._store.add(zone);

			return zone;
		});

		this._store.add(this._editor.onDidChangeModel(async e => {
			if (this._session || !e.newModelUrl) {
				return;
			}

			const existingSession = this._inlineChatSessionService.getSession(this._editor, e.newModelUrl);
			if (!existingSession) {
				return;
			}

			this._log('session RESUMING after model change', e);
			await this.run({ existingSession });
		}));

		this._store.add(this._inlineChatSessionService.onDidEndSession(e => {
			if (e.session === this._session && e.endedByExternalCause) {
				this._log('session ENDED by external cause');
				this.acceptSession();
			}
		}));

		this._store.add(this._inlineChatSessionService.onDidMoveSession(async e => {
			if (e.editor === this._editor) {
				this._log('session RESUMING after move', e);
				await this.run({ existingSession: e.session });
			}
		}));

		this._log(`NEW controller`);
	}

	dispose(): void {
		if (this._currentRun) {
			this._messages.fire(this._session?.chatModel.hasRequests
				? Message.PAUSE_SESSION
				: Message.CANCEL_SESSION);
		}
		this._store.dispose();
		this._isDisposed = true;
		this._log('DISPOSED controller');
	}

	private _log(message: string | Error, ...more: unknown[]): void {
		if (message instanceof Error) {
			this._logService.error(message, ...more);
		} else {
			this._logService.trace(`[IE] (editor:${this._editor.getId()}) ${message}`, ...more);
		}
	}

	get widget(): EditorBasedInlineChatWidget {
		return this._ui.value.widget;
	}

	getId(): string {
		return INLINE_CHAT_ID;
	}

	getWidgetPosition(): Position | undefined {
		return this._ui.value.position;
	}

	private _currentRun?: Promise<void>;

	async run(options: InlineChatRunOptions | undefined = {}): Promise<boolean> {

		let lastState: State | undefined;
		const d = this._onDidEnterState.event(e => lastState = e);

		try {
			this.acceptSession();
			if (this._currentRun) {
				await this._currentRun;
			}
			if (options.initialSelection) {
				this._editor.setSelection(options.initialSelection);
			}
			this._stashedSession.clear();
			this._currentRun = this._nextState(State.CREATE_SESSION, options);
			await this._currentRun;

		} catch (error) {
			// this should not happen but when it does make sure to tear down the UI and everything
			this._log('error during run', error);
			onUnexpectedError(error);
			if (this._session) {
				this._inlineChatSessionService.releaseSession(this._session);
			}
			this[State.PAUSE]();

		} finally {
			this._currentRun = undefined;
			d.dispose();
		}

		return lastState !== State.CANCEL;
	}

	// ---- state machine

	protected async _nextState(state: State, options: InlineChatRunOptions): Promise<void> {
		let nextState: State | void = state;
		while (nextState && !this._isDisposed) {
			this._log('setState to ', nextState);
			const p: State | Promise<State> | Promise<void> = this[nextState](options);
			this._onDidEnterState.fire(nextState);
			nextState = await p;
		}
	}

	private async [State.CREATE_SESSION](options: InlineChatRunOptions): Promise<State.CANCEL | State.INIT_UI> {
		assertType(this._session === undefined);
		assertType(this._editor.hasModel());

		let session: Session | undefined = options.existingSession;

		let initPosition: Position | undefined;
		if (options.position) {
			initPosition = Position.lift(options.position).delta(-1);
			delete options.position;
		}

		const widgetPosition = this._showWidget(session?.headless, true, initPosition);

		// this._updatePlaceholder();
		let errorMessage = localize('create.fail', "Failed to start editor chat");

		if (!session) {
			const createSessionCts = new CancellationTokenSource();
			const msgListener = Event.once(this._messages.event)(m => {
				this._log('state=_createSession) message received', m);
				if (m === Message.ACCEPT_INPUT) {
					// user accepted the input before having a session
					options.autoSend = true;
					this._ui.value.widget.updateInfo(localize('welcome.2', "Getting ready..."));
				} else {
					createSessionCts.cancel();
				}
			});

			try {
				session = await this._inlineChatSessionService.createSession(
					this._editor,
					{ wholeRange: options.initialRange },
					createSessionCts.token
				);
			} catch (error) {
				// Inline chat errors are from the provider and have their error messages shown to the user
				if (error instanceof InlineChatError || error?.name === InlineChatError.code) {
					errorMessage = error.message;
				}
			}

			createSessionCts.dispose();
			msgListener.dispose();

			if (createSessionCts.token.isCancellationRequested) {
				if (session) {
					this._inlineChatSessionService.releaseSession(session);
				}
				return State.CANCEL;
			}
		}

		delete options.initialRange;
		delete options.existingSession;

		if (!session) {
			MessageController.get(this._editor)?.showMessage(errorMessage, widgetPosition);
			this._log('Failed to start editor chat');
			return State.CANCEL;
		}

		// create a new strategy
		this._strategy = this._instaService.createInstance(LiveStrategy, session, this._editor, this._ui.value, session.headless);

		this._session = session;
		return State.INIT_UI;
	}

	private async [State.INIT_UI](options: InlineChatRunOptions): Promise<State.WAIT_FOR_INPUT | State.SHOW_REQUEST> {
		assertType(this._session);
		assertType(this._strategy);

		// hide/cancel inline completions when invoking IE
		InlineCompletionsController.get(this._editor)?.reject();

		this._sessionStore.clear();

		const wholeRangeDecoration = this._editor.createDecorationsCollection();
		const handleWholeRangeChange = () => {
			const newDecorations = this._strategy?.getWholeRangeDecoration() ?? [];
			wholeRangeDecoration.set(newDecorations);

			this._ctxEditing.set(!this._session?.wholeRange.trackedInitialRange.isEmpty());
		};
		this._sessionStore.add(toDisposable(() => {
			wholeRangeDecoration.clear();
			this._ctxEditing.reset();
		}));
		this._sessionStore.add(this._session.wholeRange.onDidChange(handleWholeRangeChange));
		handleWholeRangeChange();

		this._ui.value.widget.setChatModel(this._session.chatModel);
		this._updatePlaceholder();

		const isModelEmpty = !this._session.chatModel.hasRequests;
		this._ui.value.widget.updateToolbar(true);
		this._ui.value.widget.toggleStatus(!isModelEmpty);
		this._showWidget(this._session.headless, isModelEmpty);

		this._sessionStore.add(this._editor.onDidChangeModel((e) => {
			const msg = this._session?.chatModel.hasRequests
				? Message.PAUSE_SESSION // pause when switching models/tabs and when having a previous exchange
				: Message.CANCEL_SESSION;
			this._log('model changed, pause or cancel session', msg, e);
			this._messages.fire(msg);
		}));

		const filePartOfEditSessions = this._chatService.editingSessions.filter(session =>
			session.entries.get().some(e => e.state.get() === ModifiedFileEntryState.Modified && e.modifiedURI.toString() === this._session!.textModelN.uri.toString())
		);

		const withinEditSession = filePartOfEditSessions.find(session =>
			session.entries.get().some(e => e.state.get() === ModifiedFileEntryState.Modified && e.hasModificationAt({
				range: this._session!.wholeRange.trackedInitialRange,
				uri: this._session!.textModelN.uri
			}))
		);

		const chatWidget = this._ui.value.widget.chatWidget;
		this._delegateSession = withinEditSession || filePartOfEditSessions[0];
		chatWidget.input.setIsWithinEditSession(!!withinEditSession, filePartOfEditSessions.length > 0);

		this._sessionStore.add(this._editor.onDidChangeModelContent(e => {


			if (this._session?.hunkData.ignoreTextModelNChanges || this._ui.value.widget.hasFocus()) {
				return;
			}

			const wholeRange = this._session!.wholeRange;
			let shouldFinishSession = false;
			if (this._configurationService.getValue<boolean>(InlineChatConfigKeys.FinishOnType)) {
				for (const { range } of e.changes) {
					shouldFinishSession = !Range.areIntersectingOrTouching(range, wholeRange.value);
				}
			}

			this._session!.recordExternalEditOccurred(shouldFinishSession);

			if (shouldFinishSession) {
				this._log('text changed outside of whole range, FINISH session');
				this.acceptSession();
			}
		}));

		this._sessionStore.add(this._session.chatModel.onDidChange(async e => {
			if (e.kind === 'removeRequest') {
				// TODO@jrieken there is still some work left for when a request "in the middle"
				// is removed. We will undo all changes till that point but not remove those
				// later request
				await this._session!.undoChangesUntil(e.requestId);
			}
		}));

		// apply edits from completed requests that haven't been applied yet
		const editState = this._createChatTextEditGroupState();
		let didEdit = false;
		for (const request of this._session.chatModel.getRequests()) {
			if (!request.response || request.response.result?.errorDetails) {
				// done when seeing the first request that is still pending (no response).
				break;
			}
			for (const part of request.response.response.value) {
				if (part.kind !== 'textEditGroup' || !isEqual(part.uri, this._session.textModelN.uri)) {
					continue;
				}
				if (part.state?.applied) {
					continue;
				}
				for (const edit of part.edits) {
					this._makeChanges(edit, undefined, !didEdit);
					didEdit = true;
				}
				part.state ??= editState;
			}
		}
		if (didEdit) {
			const diff = await this._editorWorkerService.computeDiff(this._session.textModel0.uri, this._session.textModelN.uri, { computeMoves: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER, ignoreTrimWhitespace: false }, 'advanced');
			this._session.wholeRange.fixup(diff?.changes ?? []);
			await this._session.hunkData.recompute(editState, diff);

			this._updateCtxResponseType();
		}
		options.position = await this._strategy.renderChanges();

		if (this._session.chatModel.requestInProgress.get()) {
			return State.SHOW_REQUEST;
		} else {
			return State.WAIT_FOR_INPUT;
		}
	}

	private async [State.WAIT_FOR_INPUT](options: InlineChatRunOptions): Promise<State.ACCEPT | State.CANCEL | State.PAUSE | State.WAIT_FOR_INPUT | State.SHOW_REQUEST> {
		assertType(this._session);
		assertType(this._strategy);

		this._updatePlaceholder();

		if (options.message) {
			this._updateInput(options.message);
			aria.alert(options.message);
			delete options.message;
			this._showWidget(this._session.headless, false);
		}

		let message = Message.NONE;
		let request: IChatRequestModel | undefined;

		const barrier = new Barrier();
		const store = new DisposableStore();
		store.add(this._session.chatModel.onDidChange(e => {
			if (e.kind === 'addRequest') {
				request = e.request;
				message = Message.ACCEPT_INPUT;
				barrier.open();
			}
		}));
		store.add(this._strategy.onDidAccept(() => this.acceptSession()));
		store.add(this._strategy.onDidDiscard(() => this.cancelSession()));
		store.add(this.chatWidget.onDidHide(() => this.cancelSession()));
		store.add(Event.once(this._messages.event)(m => {
			this._log('state=_waitForInput) message received', m);
			message = m;
			barrier.open();
		}));

		if (options.attachments) {
			await Promise.all(options.attachments.map(async attachment => {
				await this._ui.value.widget.chatWidget.attachmentModel.addFile(attachment);
			}));
			delete options.attachments;
		}
		if (options.autoSend) {
			delete options.autoSend;
			this._showWidget(this._session.headless, false);
			this._ui.value.widget.chatWidget.acceptInput();
		}

		await barrier.wait();
		store.dispose();


		if (message & (Message.CANCEL_INPUT | Message.CANCEL_SESSION)) {
			return State.CANCEL;
		}

		if (message & Message.PAUSE_SESSION) {
			return State.PAUSE;
		}

		if (message & Message.ACCEPT_SESSION) {
			this._ui.value.widget.selectAll();
			return State.ACCEPT;
		}

		if (!request?.message.text) {
			return State.WAIT_FOR_INPUT;
		}


		return State.SHOW_REQUEST;
	}


	private async [State.SHOW_REQUEST](options: InlineChatRunOptions): Promise<State.WAIT_FOR_INPUT | State.CANCEL | State.PAUSE | State.ACCEPT> {
		assertType(this._session);
		assertType(this._strategy);
		assertType(this._session.chatModel.requestInProgress.get());

		this._ctxRequestInProgress.set(true);

		const { chatModel } = this._session;
		const request = chatModel.lastRequest;

		assertType(request);
		assertType(request.response);

		this._showWidget(this._session.headless, false);
		this._ui.value.widget.selectAll();
		this._ui.value.widget.updateInfo('');
		this._ui.value.widget.toggleStatus(true);

		const { response } = request;
		const responsePromise = new DeferredPromise<void>();

		const store = new DisposableStore();

		const progressiveEditsCts = store.add(new CancellationTokenSource());
		const progressiveEditsAvgDuration = new MovingAverage();
		const progressiveEditsClock = StopWatch.create();
		const progressiveEditsQueue = new Queue();

		// disable typing and squiggles while streaming a reply
		const origDeco = this._editor.getOption(EditorOption.renderValidationDecorations);
		this._editor.updateOptions({
			renderValidationDecorations: 'off'
		});
		store.add(toDisposable(() => {
			this._editor.updateOptions({
				renderValidationDecorations: origDeco
			});
		}));


		let next: State.WAIT_FOR_INPUT | State.SHOW_REQUEST | State.CANCEL | State.PAUSE | State.ACCEPT = State.WAIT_FOR_INPUT;
		store.add(Event.once(this._messages.event)(message => {
			this._log('state=_makeRequest) message received', message);
			this._chatService.cancelCurrentRequestForSession(chatModel.sessionResource);
			if (message & Message.CANCEL_SESSION) {
				next = State.CANCEL;
			} else if (message & Message.PAUSE_SESSION) {
				next = State.PAUSE;
			} else if (message & Message.ACCEPT_SESSION) {
				next = State.ACCEPT;
			}
		}));

		store.add(chatModel.onDidChange(async e => {
			if (e.kind === 'removeRequest' && e.requestId === request.id) {
				progressiveEditsCts.cancel();
				responsePromise.complete();
				if (e.reason === ChatRequestRemovalReason.Resend) {
					next = State.SHOW_REQUEST;
				} else {
					next = State.CANCEL;
				}
				return;
			}
			if (e.kind === 'move') {
				assertType(this._session);
				const log: typeof this._log = (msg: string, ...args: unknown[]) => this._log('state=_showRequest) moving inline chat', msg, ...args);

				log('move was requested', e.target, e.range);

				// if there's already a tab open for targetUri, show it and move inline chat to that tab
				// otherwise, open the tab to the side
				const initialSelection = Selection.fromRange(Range.lift(e.range), SelectionDirection.LTR);
				const editorPane = await this._editorService.openEditor({ resource: e.target, options: { selection: initialSelection } }, SIDE_GROUP);

				if (!editorPane) {
					log('opening editor failed');
					return;
				}

				const newEditor = editorPane.getControl();
				if (!isCodeEditor(newEditor) || !newEditor.hasModel()) {
					log('new editor is either missing or not a code editor or does not have a model');
					return;
				}

				if (this._inlineChatSessionService.getSession(newEditor, e.target)) {
					log('new editor ALREADY has a session');
					return;
				}

				const newSession = await this._inlineChatSessionService.createSession(
					newEditor,
					{
						session: this._session,
					},
					CancellationToken.None); // TODO@ulugbekna: add proper cancellation?


				InlineChatController1.get(newEditor)?.run({ existingSession: newSession });

				next = State.CANCEL;
				responsePromise.complete();

				return;
			}
		}));

		// cancel the request when the user types
		store.add(this._ui.value.widget.chatWidget.inputEditor.onDidChangeModelContent(() => {
			this._chatService.cancelCurrentRequestForSession(chatModel.sessionResource);
		}));

		let lastLength = 0;
		let isFirstChange = true;

		const editState = this._createChatTextEditGroupState();
		let localEditGroup: IChatTextEditGroup | undefined;

		// apply edits
		const handleResponse = () => {

			this._updateCtxResponseType();

			if (!localEditGroup) {
				localEditGroup = <IChatTextEditGroup | undefined>response.response.value.find(part => part.kind === 'textEditGroup' && isEqual(part.uri, this._session?.textModelN.uri));
			}

			if (localEditGroup) {

				localEditGroup.state ??= editState;

				const edits = localEditGroup.edits;
				const newEdits = edits.slice(lastLength);
				if (newEdits.length > 0) {

					this._log(`${this._session?.textModelN.uri.toString()} received ${newEdits.length} edits`);

					// NEW changes
					lastLength = edits.length;
					progressiveEditsAvgDuration.update(progressiveEditsClock.elapsed());
					progressiveEditsClock.reset();

					progressiveEditsQueue.queue(async () => {

						const startThen = this._session!.wholeRange.value.getStartPosition();

						// making changes goes into a queue because otherwise the async-progress time will
						// influence the time it takes to receive the changes and progressive typing will
						// become infinitely fast
						for (const edits of newEdits) {
							await this._makeChanges(edits, {
								duration: progressiveEditsAvgDuration.value,
								token: progressiveEditsCts.token
							}, isFirstChange);

							isFirstChange = false;
						}

						// reshow the widget if the start position changed or shows at the wrong position
						const startNow = this._session!.wholeRange.value.getStartPosition();
						if (!startNow.equals(startThen) || !this._ui.value.position?.equals(startNow)) {
							this._showWidget(this._session!.headless, false, startNow.delta(-1));
						}
					});
				}
			}

			if (response.isCanceled) {
				progressiveEditsCts.cancel();
				responsePromise.complete();

			} else if (response.isComplete) {
				responsePromise.complete();
			}
		};
		store.add(response.onDidChange(handleResponse));
		handleResponse();

		// (1) we must wait for the request to finish
		// (2) we must wait for all edits that came in via progress to complete
		await responsePromise.p;
		await progressiveEditsQueue.whenIdle();

		if (response.result?.errorDetails && !response.result.errorDetails.responseIsFiltered) {
			await this._session.undoChangesUntil(response.requestId);
		}

		store.dispose();

		const diff = await this._editorWorkerService.computeDiff(this._session.textModel0.uri, this._session.textModelN.uri, { computeMoves: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER, ignoreTrimWhitespace: false }, 'advanced');
		this._session.wholeRange.fixup(diff?.changes ?? []);
		await this._session.hunkData.recompute(editState, diff);

		this._ctxRequestInProgress.set(false);


		let newPosition: Position | undefined;

		if (response.result?.errorDetails) {
			// error -> no message, errors are shown with the request
			alert(response.result.errorDetails.message);
		} else if (response.response.value.length === 0) {
			// empty -> show message
			const status = localize('empty', "No results, please refine your input and try again");
			this._ui.value.widget.updateStatus(status, { classes: ['warn'] });
			alert(status);
		} else {
			// real response -> no message
			this._ui.value.widget.updateStatus('');
			alert(localize('responseWasEmpty', "Response was empty"));
		}

		const position = await this._strategy.renderChanges();
		if (position) {
			// if the selection doesn't start far off we keep the widget at its current position
			// because it makes reading this nicer
			const selection = this._editor.getSelection();
			if (selection?.containsPosition(position)) {
				if (position.lineNumber - selection.startLineNumber > 8) {
					newPosition = position;
				}
			} else {
				newPosition = position;
			}
		}
		this._showWidget(this._session.headless, false, newPosition);

		return next;
	}

	private async[State.PAUSE]() {

		this._resetWidget();

		this._strategy?.dispose?.();
		this._session = undefined;
	}

	private async[State.ACCEPT]() {
		assertType(this._session);
		assertType(this._strategy);
		this._sessionStore.clear();

		try {
			await this._strategy.apply();
		} catch (err) {
			this._dialogService.error(localize('err.apply', "Failed to apply changes.", toErrorMessage(err)));
			this._log('FAILED to apply changes');
			this._log(err);
		}

		this._resetWidget();
		this._inlineChatSessionService.releaseSession(this._session);


		this._strategy?.dispose();
		this._strategy = undefined;
		this._session = undefined;
	}

	private async[State.CANCEL]() {

		this._resetWidget();

		if (this._session) {
			// assertType(this._session);
			assertType(this._strategy);
			this._sessionStore.clear();

			// only stash sessions that were not unstashed, not "empty", and not interacted with
			const shouldStash = !this._session.isUnstashed && this._session.chatModel.hasRequests && this._session.hunkData.size === this._session.hunkData.pending;
			let undoCancelEdits: IValidEditOperation[] = [];
			try {
				undoCancelEdits = this._strategy.cancel();
			} catch (err) {
				this._dialogService.error(localize('err.discard', "Failed to discard changes.", toErrorMessage(err)));
				this._log('FAILED to discard changes');
				this._log(err);
			}

			this._stashedSession.clear();
			if (shouldStash) {
				this._stashedSession.value = this._inlineChatSessionService.stashSession(this._session, this._editor, undoCancelEdits);
			} else {
				this._inlineChatSessionService.releaseSession(this._session);
			}
		}


		this._strategy?.dispose();
		this._strategy = undefined;
		this._session = undefined;
	}

	// ----

	private _showWidget(headless: boolean = false, initialRender: boolean = false, position?: Position) {
		assertType(this._editor.hasModel());
		this._ctxVisible.set(true);

		let widgetPosition: Position;
		if (position) {
			// explicit position wins
			widgetPosition = position;
		} else if (this._ui.rawValue?.position) {
			// already showing - special case of line 1
			if (this._ui.rawValue?.position.lineNumber === 1) {
				widgetPosition = this._ui.rawValue?.position.delta(-1);
			} else {
				widgetPosition = this._ui.rawValue?.position;
			}
		} else {
			// default to ABOVE the selection
			widgetPosition = this._editor.getSelection().getStartPosition().delta(-1);
		}

		if (this._session && !position && (this._session.hasChangedText || this._session.chatModel.hasRequests)) {
			widgetPosition = this._session.wholeRange.trackedInitialRange.getStartPosition().delta(-1);
		}

		if (initialRender && (this._editor.getOption(EditorOption.stickyScroll)).enabled) {
			this._editor.revealLine(widgetPosition.lineNumber); // do NOT substract `this._editor.getOption(EditorOption.stickyScroll).maxLineCount` because the editor already does that
		}

		if (!headless) {
			if (this._ui.rawValue?.position) {
				this._ui.value.updatePositionAndHeight(widgetPosition);
			} else {
				this._ui.value.show(widgetPosition);
			}
		}

		return widgetPosition;
	}

	private _resetWidget() {

		this._sessionStore.clear();
		this._ctxVisible.reset();

		this._ui.rawValue?.hide();

		// Return focus to the editor only if the current focus is within the editor widget
		if (this._editor.hasWidgetFocus()) {
			this._editor.focus();
		}
	}

	private _updateCtxResponseType(): void {

		if (!this._session) {
			this._ctxResponseType.set(InlineChatResponseType.None);
			return;
		}

		const hasLocalEdit = (response: IResponse): boolean => {
			return response.value.some(part => part.kind === 'textEditGroup' && isEqual(part.uri, this._session?.textModelN.uri));
		};

		let responseType = InlineChatResponseType.None;
		for (const request of this._session.chatModel.getRequests()) {
			if (!request.response) {
				continue;
			}
			responseType = InlineChatResponseType.Messages;
			if (hasLocalEdit(request.response.response)) {
				responseType = InlineChatResponseType.MessagesAndEdits;
				break; // no need to check further
			}
		}
		this._ctxResponseType.set(responseType);
		this._ctxResponse.set(responseType !== InlineChatResponseType.None);
	}

	private _createChatTextEditGroupState(): IChatTextEditGroupState {
		assertType(this._session);

		const sha1 = new DefaultModelSHA1Computer();
		const textModel0Sha1 = sha1.canComputeSHA1(this._session.textModel0)
			? sha1.computeSHA1(this._session.textModel0)
			: generateUuid();

		return {
			sha1: textModel0Sha1,
			applied: 0
		};
	}

	private async _makeChanges(edits: TextEdit[], opts: ProgressingEditsOptions | undefined, undoStopBefore: boolean) {
		assertType(this._session);
		assertType(this._strategy);

		const moreMinimalEdits = await raceCancellation(this._editorWorkerService.computeMoreMinimalEdits(this._session.textModelN.uri, edits), opts?.token || CancellationToken.None);
		this._log('edits from PROVIDER and after making them MORE MINIMAL', this._session.agent.extensionId, edits, moreMinimalEdits);

		if (moreMinimalEdits?.length === 0) {
			// nothing left to do
			return;
		}

		const actualEdits = !opts && moreMinimalEdits ? moreMinimalEdits : edits;
		const editOperations = actualEdits.map(TextEdit.asEditOperation);

		const editsObserver: IEditObserver = {
			start: () => this._session!.hunkData.ignoreTextModelNChanges = true,
			stop: () => this._session!.hunkData.ignoreTextModelNChanges = false,
		};

		const metadata = this._getMetadata();
		if (opts) {
			await this._strategy.makeProgressiveChanges(editOperations, editsObserver, opts, undoStopBefore, metadata);
		} else {
			await this._strategy.makeChanges(editOperations, editsObserver, undoStopBefore, metadata);
		}
	}

	private _getMetadata(): IInlineChatMetadata {
		const lastRequest = this._session?.chatModel.lastRequest;
		return {
			extensionId: VersionedExtensionId.tryCreate(this._session?.agent.extensionId.value, this._session?.agent.extensionVersion),
			modelId: lastRequest?.modelId,
			requestId: lastRequest?.id,
		};
	}

	private _updatePlaceholder(): void {
		this._ui.value.widget.placeholder = this._session?.agent.description ?? localize('askOrEditInContext', 'Ask or edit in context');
	}

	private _updateInput(text: string, selectAll = true): void {

		this._ui.value.widget.chatWidget.setInput(text);
		if (selectAll) {
			const newSelection = new Selection(1, 1, Number.MAX_SAFE_INTEGER, 1);
			this._ui.value.widget.chatWidget.inputEditor.setSelection(newSelection);
		}
	}

	// ---- controller API

	arrowOut(up: boolean): void {
		if (this._ui.value.position && this._editor.hasModel()) {
			const { column } = this._editor.getPosition();
			const { lineNumber } = this._ui.value.position;
			const newLine = up ? lineNumber : lineNumber + 1;
			this._editor.setPosition({ lineNumber: newLine, column });
			this._editor.focus();
		}
	}

	focus(): void {
		this._ui.value.widget.focus();
	}

	async viewInChat() {
		if (!this._strategy || !this._session) {
			return;
		}

		let someApplied = false;
		let lastEdit: IChatTextEditGroup | undefined;

		const uri = this._editor.getModel()?.uri;
		const requests = this._session.chatModel.getRequests();
		for (const request of requests) {
			if (!request.response) {
				continue;
			}
			for (const part of request.response.response.value) {
				if (part.kind === 'textEditGroup' && isEqual(part.uri, uri)) {
					// fully or partially applied edits
					someApplied = someApplied || Boolean(part.state?.applied);
					lastEdit = part;
					part.edits = [];
					part.state = undefined;
				}
			}
		}

		const doEdits = this._strategy.cancel();

		if (someApplied) {
			assertType(lastEdit);
			lastEdit.edits = [doEdits];
		}

		await this._instaService.invokeFunction(moveToPanelChat, this._session?.chatModel, false);

		this.cancelSession();
	}

	acceptSession(): void {
		const response = this._session?.chatModel.getRequests().at(-1)?.response;
		if (response) {
			this._chatService.notifyUserAction({
				sessionResource: response.session.sessionResource,
				requestId: response.requestId,
				agentId: response.agent?.id,
				command: response.slashCommand?.name,
				result: response.result,
				action: {
					kind: 'inlineChat',
					action: 'accepted'
				}
			});
		}
		this._messages.fire(Message.ACCEPT_SESSION);
	}

	acceptHunk(hunkInfo?: HunkInformation) {
		return this._strategy?.performHunkAction(hunkInfo, HunkAction.Accept);
	}

	discardHunk(hunkInfo?: HunkInformation) {
		return this._strategy?.performHunkAction(hunkInfo, HunkAction.Discard);
	}

	toggleDiff(hunkInfo?: HunkInformation) {
		return this._strategy?.performHunkAction(hunkInfo, HunkAction.ToggleDiff);
	}

	moveHunk(next: boolean) {
		this.focus();
		this._strategy?.performHunkAction(undefined, next ? HunkAction.MoveNext : HunkAction.MovePrev);
	}

	async cancelSession() {
		const response = this._session?.chatModel.lastRequest?.response;
		if (response) {
			this._chatService.notifyUserAction({
				sessionResource: response.session.sessionResource,
				requestId: response.requestId,
				agentId: response.agent?.id,
				command: response.slashCommand?.name,
				result: response.result,
				action: {
					kind: 'inlineChat',
					action: 'discarded'
				}
			});
		}

		this._resetWidget();
		this._messages.fire(Message.CANCEL_SESSION);
	}

	reportIssue() {
		const response = this._session?.chatModel.lastRequest?.response;
		if (response) {
			this._chatService.notifyUserAction({
				sessionResource: response.session.sessionResource,
				requestId: response.requestId,
				agentId: response.agent?.id,
				command: response.slashCommand?.name,
				result: response.result,
				action: { kind: 'bug' }
			});
		}
	}

	unstashLastSession(): Session | undefined {
		const result = this._stashedSession.value?.unstash();
		return result;
	}

	joinCurrentRun(): Promise<void> | undefined {
		return this._currentRun;
	}

	get isActive() {
		return Boolean(this._currentRun);
	}

	async createImageAttachment(attachment: URI): Promise<IChatRequestVariableEntry | undefined> {
		if (attachment.scheme === Schemas.file) {
			if (await this._fileService.canHandleResource(attachment)) {
				return await this._chatAttachmentResolveService.resolveImageEditorAttachContext(attachment);
			}
		} else if (attachment.scheme === Schemas.http || attachment.scheme === Schemas.https) {
			const extractedImages = await this._webContentExtractorService.readImage(attachment, CancellationToken.None);
			if (extractedImages) {
				return await this._chatAttachmentResolveService.resolveImageEditorAttachContext(attachment, extractedImages);
			}
		}

		return undefined;
	}
}

export class InlineChatController2 implements IEditorContribution {

	static readonly ID = 'editor.contrib.inlineChatController2';

	static get(editor: ICodeEditor): InlineChatController2 | undefined {
		return editor.getContribution<InlineChatController2>(InlineChatController2.ID) ?? undefined;
	}

	private readonly _store = new DisposableStore();
	private readonly _isActiveController = observableValue(this, false);
	private readonly _zone: Lazy<InlineChatZoneWidget>;

	private readonly _currentSession: IObservable<IInlineChatSession2 | undefined>;

	get widget(): EditorBasedInlineChatWidget {
		return this._zone.value.widget;
	}

	get isActive() {
		return Boolean(this._currentSession.get());
	}

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@INotebookEditorService private readonly _notebookEditorService: INotebookEditorService,
		@IInlineChatSessionService private readonly _inlineChatSessions: IInlineChatSessionService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISharedWebContentExtractorService private readonly _webContentExtractorService: ISharedWebContentExtractorService,
		@IFileService private readonly _fileService: IFileService,
		@IChatAttachmentResolveService private readonly _chatAttachmentResolveService: IChatAttachmentResolveService,
		@IEditorService private readonly _editorService: IEditorService,
		@IMarkerDecorationsService private readonly _markerDecorationsService: IMarkerDecorationsService,
		@IChatService chatService: IChatService,
	) {

		const ctxInlineChatVisible = CTX_INLINE_CHAT_VISIBLE.bindTo(contextKeyService);

		this._zone = new Lazy<InlineChatZoneWidget>(() => {


			const location: IChatWidgetLocationOptions = {
				location: ChatAgentLocation.EditorInline,
				resolveData: () => {
					assertType(this._editor.hasModel());
					const wholeRange = this._editor.getSelection();
					const document = this._editor.getModel().uri;

					return {
						type: ChatAgentLocation.EditorInline,
						selection: this._editor.getSelection(),
						document,
						wholeRange,
						close: () => { /* TODO@jrieken */ },
						delegateSessionResource: chatService.editingSessions.find(session =>
							session.entries.get().some(e => e.hasModificationAt({
								range: wholeRange,
								uri: document
							}))
						)?.chatSessionResource,
					};
				}
			};

			// inline chat in notebooks
			// check if this editor is part of a notebook editor
			// if so, update the location and use the notebook specific widget
			const notebookEditor = this._notebookEditorService.getNotebookForPossibleCell(this._editor);
			if (!!notebookEditor) {
				location.location = ChatAgentLocation.Notebook;
				location.resolveData = () => {
					assertType(this._editor.hasModel());

					return {
						type: ChatAgentLocation.Notebook,
						sessionInputUri: this._editor.getModel().uri,
					};
				};
			}

			const result = this._instaService.createInstance(InlineChatZoneWidget,
				location,
				{
					enableWorkingSet: 'implicit',
					enableImplicitContext: false,
					renderInputOnTop: false,
					renderInputToolbarBelowInput: true,
					filter: item => {
						if (!isResponseVM(item)) {
							return false;
						}
						return !!item.model.isPendingConfirmation.get();
					},
					menus: {
						telemetrySource: 'inlineChatWidget',
						executeToolbar: MenuId.ChatEditorInlineExecute,
						inputSideToolbar: MenuId.ChatEditorInlineInputSide
					},
					defaultMode: ChatMode.Ask
				},
				{ editor: this._editor, notebookEditor },
				() => Promise.resolve(),
			);

			result.domNode.classList.add('inline-chat-2');

			return result;
		});


		const editorObs = observableCodeEditor(_editor);

		const sessionsSignal = observableSignalFromEvent(this, _inlineChatSessions.onDidChangeSessions);

		this._currentSession = derived(r => {
			sessionsSignal.read(r);
			const model = editorObs.model.read(r);
			const value = model && _inlineChatSessions.getSession2(model.uri);
			return value ?? undefined;
		});


		this._store.add(autorun(r => {
			const session = this._currentSession.read(r);
			if (!session) {
				this._isActiveController.set(false, undefined);
				return;
			}
			let foundOne = false;
			for (const editor of codeEditorService.listCodeEditors()) {
				if (Boolean(InlineChatController2.get(editor)?._isActiveController.read(undefined))) {
					foundOne = true;
					break;
				}
			}
			if (!foundOne && editorObs.isFocused.read(r)) {
				this._isActiveController.set(true, undefined);
			}
		}));

		const visibleSessionObs = observableValue<IInlineChatSession2 | undefined>(this, undefined);

		this._store.add(autorun(r => {

			const model = editorObs.model.read(r);
			const session = this._currentSession.read(r);
			const isActive = this._isActiveController.read(r);

			if (!session || !isActive || !model) {
				visibleSessionObs.set(undefined, undefined);
			} else {
				visibleSessionObs.set(session, undefined);
			}
		}));

		this._store.add(autorun(r => {

			// HIDE/SHOW
			const session = visibleSessionObs.read(r);
			if (!session) {
				this._zone.rawValue?.hide();
				_editor.focus();
				ctxInlineChatVisible.reset();
			} else {
				ctxInlineChatVisible.set(true);
				this._zone.value.widget.setChatModel(session.chatModel);
				if (!this._zone.value.position) {
					this._zone.value.widget.chatWidget.input.renderAttachedContext(); // TODO - fights layout bug
					this._zone.value.show(session.initialPosition);
				}
				this._zone.value.reveal(this._zone.value.position!);
				this._zone.value.widget.focus();
			}
		}));

		this._store.add(autorun(r => {
			const session = visibleSessionObs.read(r);
			if (session) {
				const entries = session.editingSession.entries.read(r);
				const otherEntries = entries.filter(entry => !isEqual(entry.modifiedURI, session.uri));
				for (const entry of otherEntries) {
					// OPEN other modified files in side group. This is a workaround, temp-solution until we have no more backend
					// that modifies other files
					this._editorService.openEditor({ resource: entry.modifiedURI }, SIDE_GROUP).catch(onUnexpectedError);
				}
			}
		}));

		const lastResponseObs = visibleSessionObs.map((session, r) => {
			if (!session) {
				return;
			}
			const lastRequest = observableFromEvent(this, session.chatModel.onDidChange, () => session.chatModel.getRequests().at(-1)).read(r);
			return lastRequest?.response;
		});

		const lastResponseProgressObs = lastResponseObs.map((response, r) => {
			if (!response) {
				return;
			}
			return observableFromEvent(this, response.onDidChange, () => response.response.value.findLast(part => part.kind === 'progressMessage')).read(r);
		});

		this._store.add(autorun(r => {
			const response = lastResponseObs.read(r);

			if (!response?.isInProgress.read(r)) {
				// no response or not in progress
				this._zone.value.widget.domNode.classList.toggle('request-in-progress', false);
				this._zone.value.widget.chatWidget.setInputPlaceholder(localize('placeholder', "Edit, refactor, and generate code"));
				return;
			}

			this._zone.value.widget.domNode.classList.toggle('request-in-progress', true);
			let placeholder = response.request?.message.text;

			const lastProgress = lastResponseProgressObs.read(r);
			if (lastProgress) {
				placeholder = renderAsPlaintext(lastProgress.content);
			}
			this._zone.value.widget.chatWidget.setInputPlaceholder(placeholder || localize('loading', "Working..."));

		}));

		this._store.add(autorun(r => {
			const session = visibleSessionObs.read(r);
			if (!session) {
				return;
			}

			const entry = session.editingSession.readEntry(session.uri, r);
			if (entry?.state.read(r) === ModifiedFileEntryState.Modified) {
				entry?.enableReviewModeUntilSettled();
			}
		}));


		this._store.add(autorun(r => {

			const session = visibleSessionObs.read(r);
			const entry = session?.editingSession.readEntry(session.uri, r);

			// make sure there is an editor integration
			const pane = this._editorService.visibleEditorPanes.find(candidate => candidate.getControl() === this._editor || isNotebookWithCellEditor(candidate, this._editor));
			if (pane && entry) {
				entry?.getEditorIntegration(pane);
			}

			// make sure the ZONE isn't inbetween a diff and move above if so
			if (entry?.diffInfo && this._zone.value.position) {
				const { position } = this._zone.value;
				const diff = entry.diffInfo.read(r);

				for (const change of diff.changes) {
					if (change.modified.contains(position.lineNumber)) {
						this._zone.value.updatePositionAndHeight(new Position(change.modified.startLineNumber - 1, 1));
						break;
					}
				}
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
	}

	getWidgetPosition(): Position | undefined {
		return this._zone.rawValue?.position;
	}

	focus() {
		this._zone.rawValue?.widget.focus();
	}

	markActiveController() {
		this._isActiveController.set(true, undefined);
	}

	async run(arg?: InlineChatRunOptions): Promise<boolean> {
		assertType(this._editor.hasModel());


		const uri = this._editor.getModel().uri;

		const existingSession = this._inlineChatSessions.getSession2(uri);
		if (existingSession) {
			await existingSession.editingSession.accept();
			existingSession.dispose();
		}

		this.markActiveController();

		const session = await this._inlineChatSessions.createSession2(this._editor, uri, CancellationToken.None);

		// ADD diagnostics
		const entries: IChatRequestVariableEntry[] = [];
		for (const [range, marker] of this._markerDecorationsService.getLiveMarkers(uri)) {
			if (range.intersectRanges(this._editor.getSelection())) {
				const filter = IDiagnosticVariableEntryFilterData.fromMarker(marker);
				entries.push(IDiagnosticVariableEntryFilterData.toEntry(filter));
			}
		}
		if (entries.length > 0) {
			this._zone.value.widget.chatWidget.attachmentModel.addContext(...entries);
			this._zone.value.widget.chatWidget.input.setValue(entries.length > 1
				? localize('fixN', "Fix the attached problems")
				: localize('fix1', "Fix the attached problem"),
				true
			);
			this._zone.value.widget.chatWidget.inputEditor.setSelection(new Selection(1, 1, Number.MAX_SAFE_INTEGER, 1));
		}

		// Check args
		if (arg && InlineChatRunOptions.isInlineChatRunOptions(arg)) {
			if (arg.initialRange) {
				this._editor.revealRange(arg.initialRange);
			}
			if (arg.initialSelection) {
				this._editor.setSelection(arg.initialSelection);
			}
			if (arg.attachments) {
				await Promise.all(arg.attachments.map(async attachment => {
					await this._zone.value.widget.chatWidget.attachmentModel.addFile(attachment);
				}));
				delete arg.attachments;
			}
			if (arg.message) {
				this._zone.value.widget.chatWidget.setInput(arg.message);
				if (arg.autoSend) {
					await this._zone.value.widget.chatWidget.acceptInput();
				}
			}
		}

		await Event.toPromise(session.editingSession.onDidDispose);

		const rejected = session.editingSession.getEntry(uri)?.state.get() === ModifiedFileEntryState.Rejected;
		return !rejected;
	}

	async acceptSession() {
		const session = this._currentSession.get();
		if (!session) {
			return;
		}
		await session.editingSession.accept();
		session.dispose();
	}

	async rejectSession() {
		const session = this._currentSession.get();
		if (!session) {
			return;
		}
		await session.editingSession.reject();
		session.dispose();
	}

	async createImageAttachment(attachment: URI): Promise<IChatRequestVariableEntry | undefined> {
		const value = this._currentSession.get();
		if (!value) {
			return undefined;
		}
		if (attachment.scheme === Schemas.file) {
			if (await this._fileService.canHandleResource(attachment)) {
				return await this._chatAttachmentResolveService.resolveImageEditorAttachContext(attachment);
			}
		} else if (attachment.scheme === Schemas.http || attachment.scheme === Schemas.https) {
			const extractedImages = await this._webContentExtractorService.readImage(attachment, CancellationToken.None);
			if (extractedImages) {
				return await this._chatAttachmentResolveService.resolveImageEditorAttachContext(attachment, extractedImages);
			}
		}
		return undefined;
	}
}

export async function reviewEdits(accessor: ServicesAccessor, editor: ICodeEditor, stream: AsyncIterable<TextEdit[]>, token: CancellationToken, applyCodeBlockSuggestionId: EditSuggestionId | undefined): Promise<boolean> {
	if (!editor.hasModel()) {
		return false;
	}

	const chatService = accessor.get(IChatService);
	const uri = editor.getModel().uri;
	const chatModelRef = chatService.startSession(ChatAgentLocation.EditorInline, token);
	const chatModel = chatModelRef.object as ChatModel;

	chatModel.startEditingSession(true);

	const store = new DisposableStore();
	store.add(chatModelRef);

	// STREAM
	const chatRequest = chatModel?.addRequest({ text: '', parts: [] }, { variables: [] }, 0, {
		kind: undefined,
		modeId: 'applyCodeBlock',
		modeInstructions: undefined,
		isBuiltin: true,
		applyCodeBlockSuggestionId,
	});
	assertType(chatRequest.response);
	chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: false });
	for await (const chunk of stream) {

		if (token.isCancellationRequested) {
			chatRequest.response.cancel();
			break;
		}

		chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: chunk, done: false });
	}
	chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: true });

	if (!token.isCancellationRequested) {
		chatRequest.response.complete();
	}

	const isSettled = derived(r => {
		const entry = chatModel.editingSession?.readEntry(uri, r);
		if (!entry) {
			return false;
		}
		const state = entry.state.read(r);
		return state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected;
	});
	const whenDecided = waitForState(isSettled, Boolean);
	await raceCancellation(whenDecided, token);
	store.dispose();
	return true;
}

export async function reviewNotebookEdits(accessor: ServicesAccessor, uri: URI, stream: AsyncIterable<[URI, TextEdit[]] | ICellEditOperation[]>, token: CancellationToken): Promise<boolean> {

	const chatService = accessor.get(IChatService);
	const notebookService = accessor.get(INotebookService);
	const isNotebook = notebookService.hasSupportedNotebooks(uri);
	const chatModelRef = chatService.startSession(ChatAgentLocation.EditorInline, token);
	const chatModel = chatModelRef.object as ChatModel;

	chatModel.startEditingSession(true);

	const store = new DisposableStore();
	store.add(chatModelRef);

	// STREAM
	const chatRequest = chatModel?.addRequest({ text: '', parts: [] }, { variables: [] }, 0);
	assertType(chatRequest.response);
	if (isNotebook) {
		chatRequest.response.updateContent({ kind: 'notebookEdit', uri, edits: [], done: false });
	} else {
		chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: false });
	}
	for await (const chunk of stream) {

		if (token.isCancellationRequested) {
			chatRequest.response.cancel();
			break;
		}
		if (chunk.every(isCellEditOperation)) {
			chatRequest.response.updateContent({ kind: 'notebookEdit', uri, edits: chunk, done: false });
		} else {
			chatRequest.response.updateContent({ kind: 'textEdit', uri: chunk[0], edits: chunk[1], done: false });
		}
	}
	if (isNotebook) {
		chatRequest.response.updateContent({ kind: 'notebookEdit', uri, edits: [], done: true });
	} else {
		chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: true });
	}

	if (!token.isCancellationRequested) {
		chatRequest.response.complete();
	}

	const isSettled = derived(r => {
		const entry = chatModel.editingSession?.readEntry(uri, r);
		if (!entry) {
			return false;
		}
		const state = entry.state.read(r);
		return state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected;
	});

	const whenDecided = waitForState(isSettled, Boolean);

	await raceCancellation(whenDecided, token);

	store.dispose();

	return true;
}

function isCellEditOperation(edit: URI | TextEdit[] | ICellEditOperation): edit is ICellEditOperation {
	if (URI.isUri(edit)) {
		return false;
	}
	if (Array.isArray(edit)) {
		return false;
	}
	return true;
}
