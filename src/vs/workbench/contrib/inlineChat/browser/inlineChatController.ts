/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { Barrier, raceCancellationError } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { assertType } from 'vs/base/common/types';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { ModelDecorationOptions, createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { IModelService } from 'vs/editor/common/services/model';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { EditResponse, EmptyResponse, ErrorResponse, ExpansionState, IInlineChatSessionService, MarkdownResponse, Session, SessionExchange, SessionPrompt } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { EditModeStrategy, LivePreviewStrategy, LiveStrategy, PreviewStrategy } from 'vs/workbench/contrib/inlineChat/browser/inlineChatStrategies';
import { InlineChatZoneWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST, CTX_INLINE_CHAT_LAST_FEEDBACK, IInlineChatRequest, IInlineChatResponse, INLINE_CHAT_ID, EditMode, InlineChatResponseFeedbackKind, CTX_INLINE_CHAT_LAST_RESPONSE_TYPE, InlineChatResponseType, CTX_INLINE_CHAT_DID_EDIT, CTX_INLINE_CHAT_HAS_STASHED_SESSION, InlineChateResponseTypes, CTX_INLINE_CHAT_RESPONSE_TYPES, CTX_INLINE_CHAT_USER_DID_EDIT, IInlineChatProgressItem } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { IChatAccessibilityService, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Lazy } from 'vs/base/common/lazy';
import { Progress } from 'vs/platform/progress/common/progress';
import { generateUuid } from 'vs/base/common/uuid';
import { TextEdit } from 'vs/editor/common/languages';
import { ISelection } from 'vs/editor/common/core/selection';

export const enum State {
	CREATE_SESSION = 'CREATE_SESSION',
	INIT_UI = 'INIT_UI',
	WAIT_FOR_INPUT = 'WAIT_FOR_INPUT',
	MAKE_REQUEST = 'MAKE_REQUEST',
	APPLY_RESPONSE = 'APPLY_RESPONSE',
	SHOW_RESPONSE = 'SHOW_RESPONSE',
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
	RERUN_INPUT = 1 << 6,
}

export interface InlineChatRunOptions {
	initialSelection?: ISelection;
	initialRange?: IRange;
	message?: string;
	autoSend?: boolean;
	existingSession?: Session;
	isUnstashed?: boolean;
	position?: IPosition;
}

export class InlineChatController implements IEditorContribution {

	static get(editor: ICodeEditor) {
		return editor.getContribution<InlineChatController>(INLINE_CHAT_ID);
	}

	private static _decoBlock = ModelDecorationOptions.register({
		description: 'inline-chat',
		showIfCollapsed: false,
		isWholeLine: true,
		className: 'inline-chat-block-selection',
	});

	private static _promptHistory: string[] = [];
	private _historyOffset: number = -1;

	private readonly _store = new DisposableStore();
	private readonly _zone: Lazy<InlineChatZoneWidget>;
	private readonly _ctxHasActiveRequest: IContextKey<boolean>;
	private readonly _ctxLastResponseType: IContextKey<undefined | InlineChatResponseType>;
	private readonly _ctxResponseTypes: IContextKey<undefined | InlineChateResponseTypes>;
	private readonly _ctxDidEdit: IContextKey<boolean>;
	private readonly _ctxUserDidEdit: IContextKey<boolean>;
	private readonly _ctxLastFeedbackKind: IContextKey<'helpful' | 'unhelpful' | ''>;

	private _messages = this._store.add(new Emitter<Message>());

	private readonly _sessionStore: DisposableStore = new DisposableStore();
	private readonly _stashedSession: MutableDisposable<StashedSession> = this._store.add(new MutableDisposable());
	private _activeSession?: Session;
	private _strategy?: EditModeStrategy;
	private _ignoreModelContentChanged = false;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IInlineChatSessionService private readonly _inlineChatSessionService: IInlineChatSessionService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IModelService private readonly _modelService: IModelService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IChatAccessibilityService private readonly _chatAccessibilityService: IChatAccessibilityService
	) {
		this._ctxHasActiveRequest = CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST.bindTo(contextKeyService);
		this._ctxDidEdit = CTX_INLINE_CHAT_DID_EDIT.bindTo(contextKeyService);
		this._ctxUserDidEdit = CTX_INLINE_CHAT_USER_DID_EDIT.bindTo(contextKeyService);
		this._ctxResponseTypes = CTX_INLINE_CHAT_RESPONSE_TYPES.bindTo(contextKeyService);
		this._ctxLastResponseType = CTX_INLINE_CHAT_LAST_RESPONSE_TYPE.bindTo(contextKeyService);
		this._ctxLastFeedbackKind = CTX_INLINE_CHAT_LAST_FEEDBACK.bindTo(contextKeyService);
		this._zone = new Lazy(() => this._store.add(_instaService.createInstance(InlineChatZoneWidget, this._editor)));

		this._store.add(this._editor.onDidChangeModel(async e => {
			if (this._activeSession || !e.newModelUrl) {
				return;
			}

			const existingSession = this._inlineChatSessionService.getSession(this._editor, e.newModelUrl);
			if (!existingSession) {
				return;
			}

			this._log('session RESUMING', e);
			await this._nextState(State.CREATE_SESSION, { existingSession });
			this._log('session done or paused');
		}));
		this._log('NEW controller');
	}

	dispose(): void {
		this._stashedSession.clear();
		this.finishExistingSession();
		this._store.dispose();
		this._log('controller disposed');
	}

	private _log(message: string | Error, ...more: any[]): void {
		if (message instanceof Error) {
			this._logService.error(message, ...more);
		} else {
			this._logService.trace(`[IE] (editor:${this._editor.getId()})${message}`, ...more);
		}
	}

	getMessage(): string | undefined {
		return this._zone.value.widget.responseContent;
	}

	getId(): string {
		return INLINE_CHAT_ID;
	}

	private _getMode(): EditMode {
		const editMode = this._configurationService.inspect<EditMode>('inlineChat.mode');
		let editModeValue = editMode.value;
		if (this._accessibilityService.isScreenReaderOptimized() && editModeValue === editMode.defaultValue) {
			// By default, use preview mode for screen reader users
			editModeValue = EditMode.Preview;
		}
		return editModeValue!;
	}

	getWidgetPosition(): Position | undefined {
		return this._zone.value.position;
	}

	private _currentRun?: Promise<void>;

	async run(options: InlineChatRunOptions | undefined = {}): Promise<void> {
		this.finishExistingSession();
		if (this._currentRun) {
			await this._currentRun;
		}
		this._stashedSession.clear();
		if (options.initialSelection) {
			this._editor.setSelection(options.initialSelection);
		}
		this._currentRun = this._nextState(State.CREATE_SESSION, options);
		await this._currentRun;
		this._currentRun = undefined;
	}

	// ---- state machine

	private _showWidget(initialRender: boolean = false, position?: IPosition) {
		assertType(this._editor.hasModel());

		let widgetPosition: Position;
		if (initialRender) {
			widgetPosition = position ? Position.lift(position) : this._editor.getSelection().getEndPosition();
			this._zone.value.setContainerMargins();
			this._zone.value.setWidgetMargins(widgetPosition);
		} else {
			assertType(this._activeSession);
			assertType(this._strategy);
			widgetPosition = this._strategy.getWidgetPosition() ?? this._zone.value.position ?? this._activeSession.wholeRange.value.getEndPosition();
			const needsMargin = this._strategy.needsMargin();
			if (!needsMargin) {
				this._zone.value.setWidgetMargins(widgetPosition, 0);
			}
			this._zone.value.updateBackgroundColor(widgetPosition, this._activeSession.wholeRange.value);
		}
		this._zone.value.show(widgetPosition);
	}

	protected async _nextState(state: State, options: InlineChatRunOptions): Promise<void> {
		let nextState: State | void = state;
		while (nextState) {
			this._log('setState to ', nextState);
			nextState = await this[nextState](options);
		}
	}

	private async [State.CREATE_SESSION](options: InlineChatRunOptions): Promise<State.CANCEL | State.INIT_UI | State.PAUSE> {
		assertType(this._activeSession === undefined);
		assertType(this._editor.hasModel());

		let session: Session | undefined = options.existingSession;

		this._showWidget(true, options.position);
		this._zone.value.widget.updateInfo(localize('welcome.1', "AI-generated code may be incorrect"));
		this._zone.value.widget.placeholder = this._getPlaceholderText();

		if (!session) {
			const createSessionCts = new CancellationTokenSource();
			const msgListener = Event.once(this._messages.event)(m => {
				this._log('state=_createSession) message received', m);
				if (m === Message.ACCEPT_INPUT) {
					// user accepted the input before having a session
					options.autoSend = true;
					this._zone.value.widget.updateProgress(true);
					this._zone.value.widget.updateInfo(localize('welcome.2', "Getting ready..."));
				} else {
					createSessionCts.cancel();
				}
			});

			session = await this._inlineChatSessionService.createSession(
				this._editor,
				{ editMode: this._getMode(), wholeRange: options.initialRange },
				createSessionCts.token
			);

			createSessionCts.dispose();
			msgListener.dispose();

			if (createSessionCts.token.isCancellationRequested) {
				return State.PAUSE;
			}
		}

		delete options.initialRange;
		delete options.existingSession;

		if (!session) {
			this._dialogService.info(localize('create.fail', "Failed to start editor chat"), localize('create.fail.detail', "Please consult the error log and try again later."));
			return State.CANCEL;
		}

		switch (session.editMode) {
			case EditMode.Live:
				this._strategy = this._instaService.createInstance(LiveStrategy, session, this._editor, this._zone.value.widget);
				break;
			case EditMode.Preview:
				this._strategy = this._instaService.createInstance(PreviewStrategy, session, this._zone.value.widget);
				break;
			case EditMode.LivePreview:
			default:
				this._strategy = this._instaService.createInstance(LivePreviewStrategy, session, this._editor, this._zone.value.widget);
				break;
		}

		this._activeSession = session;
		return State.INIT_UI;
	}

	private async [State.INIT_UI](options: InlineChatRunOptions): Promise<State.WAIT_FOR_INPUT | State.SHOW_RESPONSE | State.APPLY_RESPONSE> {
		assertType(this._activeSession);

		// hide/cancel inline completions when invoking IE
		InlineCompletionsController.get(this._editor)?.hide();

		this._sessionStore.clear();

		const wholeRangeDecoration = this._editor.createDecorationsCollection();
		const updateWholeRangeDecoration = () => {
			wholeRangeDecoration.set([{
				range: this._activeSession!.wholeRange.value,
				options: InlineChatController._decoBlock
			}]);
		};
		this._sessionStore.add(toDisposable(() => wholeRangeDecoration.clear()));
		this._sessionStore.add(this._activeSession.wholeRange.onDidChange(updateWholeRangeDecoration));
		updateWholeRangeDecoration();

		this._zone.value.widget.updateSlashCommands(this._activeSession.session.slashCommands ?? []);
		this._zone.value.widget.placeholder = this._getPlaceholderText();
		this._zone.value.widget.updateInfo(this._activeSession.session.message ?? localize('welcome.1', "AI-generated code may be incorrect"));
		this._zone.value.widget.preferredExpansionState = this._activeSession.lastExpansionState;
		this._zone.value.widget.value = this._activeSession.lastInput?.value ?? this._zone.value.widget.value;
		this._sessionStore.add(this._zone.value.widget.onDidChangeInput(_ => {
			const start = this._zone.value.position;
			if (!start || !this._zone.value.widget.hasFocus() || !this._zone.value.widget.value || !this._editor.hasModel()) {
				return;
			}
			const nextLine = start.lineNumber + 1;
			if (nextLine >= this._editor.getModel().getLineCount()) {
				// last line isn't supported
				return;
			}
			this._editor.revealLine(nextLine, ScrollType.Smooth);
		}));

		this._showWidget(true, options.position);

		this._sessionStore.add(this._editor.onDidChangeModel((e) => {
			const msg = this._activeSession?.lastExchange
				? Message.PAUSE_SESSION // pause when switching models/tabs and when having a previous exchange
				: Message.CANCEL_SESSION;
			this._log('model changed, pause or cancel session', msg, e);
			this._messages.fire(msg);
		}));

		this._sessionStore.add(this._editor.onDidChangeModelContent(e => {

			if (!this._ignoreModelContentChanged && this._strategy?.hasFocus()) {
				this._ctxUserDidEdit.set(true);
			}

			if (this._ignoreModelContentChanged || this._strategy?.hasFocus()) {
				return;
			}

			const wholeRange = this._activeSession!.wholeRange;
			let editIsOutsideOfWholeRange = false;
			for (const { range } of e.changes) {
				editIsOutsideOfWholeRange = !Range.areIntersectingOrTouching(range, wholeRange.value);
			}

			this._activeSession!.recordExternalEditOccurred(editIsOutsideOfWholeRange);

			if (editIsOutsideOfWholeRange) {
				this._log('text changed outside of whole range, FINISH session');
				this.finishExistingSession();
			}
		}));

		if (!this._activeSession.lastExchange) {
			return State.WAIT_FOR_INPUT;
		} else if (options.isUnstashed) {
			delete options.isUnstashed;
			return State.APPLY_RESPONSE;
		} else {
			return State.SHOW_RESPONSE;
		}
	}

	private _getPlaceholderText(): string {
		let result = this._activeSession?.session.placeholder ?? localize('default.placeholder', "Ask a question");
		if (InlineChatController._promptHistory.length > 0) {
			const kb1 = this._keybindingService.lookupKeybinding('inlineChat.previousFromHistory')?.getLabel();
			const kb2 = this._keybindingService.lookupKeybinding('inlineChat.nextFromHistory')?.getLabel();

			if (kb1 && kb2) {
				result = localize('default.placeholder.history', "{0} ({1}, {2} for history)", result, kb1, kb2);
			}
		}
		return result;
	}


	private async [State.WAIT_FOR_INPUT](options: InlineChatRunOptions): Promise<State.ACCEPT | State.CANCEL | State.PAUSE | State.WAIT_FOR_INPUT | State.MAKE_REQUEST> {
		assertType(this._activeSession);
		assertType(this._strategy);

		this._zone.value.widget.placeholder = this._getPlaceholderText();

		if (options.message) {
			this._zone.value.widget.value = options.message;
			this._zone.value.widget.selectAll();
			aria.alert(options.message);
			delete options.message;
		}

		let message = Message.NONE;
		if (options.autoSend) {
			message = Message.ACCEPT_INPUT;
			delete options.autoSend;

		} else {
			const barrier = new Barrier();
			const msgListener = Event.once(this._messages.event)(m => {
				this._log('state=_waitForInput) message received', m);
				message = m;
				barrier.open();
			});
			await barrier.wait();
			msgListener.dispose();
		}

		this._zone.value.widget.selectAll(false);

		if (message & (Message.CANCEL_INPUT | Message.CANCEL_SESSION)) {
			return State.CANCEL;
		}

		if (message & Message.ACCEPT_SESSION) {
			return State.ACCEPT;
		}

		if (message & Message.PAUSE_SESSION) {
			return State.PAUSE;
		}

		if (message & Message.RERUN_INPUT && this._activeSession.lastExchange) {
			const { lastExchange } = this._activeSession;
			this._activeSession.addInput(lastExchange.prompt.retry());
			if (lastExchange.response instanceof EditResponse) {
				await this._strategy.undoChanges(lastExchange.response);
			}
			return State.MAKE_REQUEST;
		}

		if (!this._zone.value.widget.value) {
			return State.WAIT_FOR_INPUT;
		}

		const input = this._zone.value.widget.value;

		if (!InlineChatController._promptHistory.includes(input)) {
			InlineChatController._promptHistory.unshift(input);
		}

		const refer = this._activeSession.session.slashCommands?.some(value => value.refer && input!.startsWith(`/${value.command}`));
		if (refer) {
			this._log('[IE] seeing refer command, continuing outside editor', this._activeSession.provider.debugName);
			this._editor.setSelection(this._activeSession.wholeRange.value);
			this._instaService.invokeFunction(sendRequest, input);

			if (!this._activeSession.lastExchange) {
				// DONE when there wasn't any exchange yet. We used the inline chat only as trampoline
				return State.ACCEPT;
			}
			return State.WAIT_FOR_INPUT;
		}

		this._activeSession.addInput(new SessionPrompt(input));
		return State.MAKE_REQUEST;
	}

	private async [State.MAKE_REQUEST](): Promise<State.APPLY_RESPONSE | State.PAUSE | State.CANCEL | State.ACCEPT> {
		assertType(this._editor.hasModel());
		assertType(this._activeSession);
		assertType(this._activeSession.lastInput);

		const requestCts = new CancellationTokenSource();

		let message = Message.NONE;
		const msgListener = Event.once(this._messages.event)(m => {
			this._log('state=_makeRequest) message received', m);
			message = m;
			requestCts.cancel();
		});

		const typeListener = this._zone.value.widget.onDidChangeInput(() => {
			requestCts.cancel();
		});

		const sw = StopWatch.create();
		const request: IInlineChatRequest = {
			requestId: generateUuid(),
			prompt: this._activeSession.lastInput.value,
			attempt: this._activeSession.lastInput.attempt,
			selection: this._editor.getSelection(),
			wholeRange: this._activeSession.wholeRange.value,
			live: this._activeSession.editMode !== EditMode.Preview // TODO@jrieken let extension know what document is used for previewing
		};
		this._chatAccessibilityService.acceptRequest();

		const progressEdits: TextEdit[][] = [];
		const progress = new Progress<IInlineChatProgressItem>(async data => {
			this._log('received chunk', data, request);
			if (!request.live) {
				throw new Error('Progress in NOT supported in non-live mode');
			}
			if (data.message) {
				this._zone.value.widget.updateToolbar(false);
				this._zone.value.widget.updateInfo(data.message);
			}
			if (data.edits) {
				progressEdits.push(data.edits);
				await this._makeChanges(progressEdits);
			}
		}, { async: true });
		const task = this._activeSession.provider.provideResponse(this._activeSession.session, request, progress, requestCts.token);
		this._log('request started', this._activeSession.provider.debugName, this._activeSession.session, request);

		let response: EditResponse | MarkdownResponse | ErrorResponse | EmptyResponse;
		let reply: IInlineChatResponse | null | undefined;
		try {
			this._zone.value.widget.updateProgress(true);
			this._zone.value.widget.updateInfo(!this._activeSession.lastExchange ? localize('thinking', "Thinking\u2026") : '');
			this._ctxHasActiveRequest.set(true);
			reply = await raceCancellationError(Promise.resolve(task), requestCts.token);

			if (reply?.type === InlineChatResponseType.Message) {
				response = new MarkdownResponse(this._activeSession.textModelN.uri, reply);
			} else if (reply) {
				const editResponse = new EditResponse(this._activeSession.textModelN.uri, this._activeSession.textModelN.getAlternativeVersionId(), reply, progressEdits);
				if (editResponse.allLocalEdits.length > progressEdits.length) {
					await this._makeChanges(editResponse.allLocalEdits);
				}
				response = editResponse;
			} else {
				response = new EmptyResponse();
			}

		} catch (e) {
			response = new ErrorResponse(e);

		} finally {
			this._ctxHasActiveRequest.set(false);
			this._zone.value.widget.updateProgress(false);
			this._zone.value.widget.updateInfo('');
			this._log('request took', sw.elapsed(), this._activeSession.provider.debugName);

		}

		requestCts.dispose();
		msgListener.dispose();
		typeListener.dispose();

		this._activeSession.addExchange(new SessionExchange(this._activeSession.lastInput, response));

		if (message & Message.CANCEL_SESSION) {
			return State.CANCEL;
		} else if (message & Message.PAUSE_SESSION) {
			return State.PAUSE;
		} else if (message & Message.ACCEPT_SESSION) {
			return State.ACCEPT;
		} else {
			return State.APPLY_RESPONSE;
		}
	}

	private async [State.APPLY_RESPONSE](): Promise<State.SHOW_RESPONSE | State.ACCEPT> {
		assertType(this._activeSession);
		assertType(this._strategy);

		const { response } = this._activeSession.lastExchange!;
		if (response instanceof EditResponse) {
			// edit response -> complex...
			this._zone.value.widget.updateMarkdownMessage(undefined);

			const canContinue = this._strategy.checkChanges(response);
			if (!canContinue) {
				return State.ACCEPT;
			}
		}
		return State.SHOW_RESPONSE;
	}

	private async _makeChanges(allEdits: TextEdit[][]) {
		assertType(this._activeSession);
		assertType(this._strategy);

		if (allEdits.length === 0) {
			return;
		}

		// diff-changes from model0 -> modelN+1
		for (const edits of allEdits) {
			const textModelNplus1 = this._modelService.createModel(createTextBufferFactoryFromSnapshot(this._activeSession.textModelN.createSnapshot()), null, undefined, true);
			textModelNplus1.applyEdits(edits.map(TextEdit.asEditOperation));
			const diff = await this._editorWorkerService.computeDiff(this._activeSession.textModel0.uri, textModelNplus1.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: 5000, computeMoves: false }, 'advanced');
			this._activeSession.lastTextModelChanges = diff?.changes ?? [];
			textModelNplus1.dispose();
		}

		// make changes from modelN -> modelN+1
		const lastEdits = allEdits[allEdits.length - 1];
		const moreMinimalEdits = await this._editorWorkerService.computeHumanReadableDiff(this._activeSession.textModelN.uri, lastEdits);
		const editOperations = (moreMinimalEdits ?? lastEdits).map(TextEdit.asEditOperation);
		this._log('edits from PROVIDER and after making them MORE MINIMAL', this._activeSession.provider.debugName, lastEdits, moreMinimalEdits);

		try {
			this._ignoreModelContentChanged = true;
			this._activeSession.wholeRange.trackEdits(editOperations);
			await this._strategy.makeChanges(editOperations);
			this._ctxDidEdit.set(this._activeSession.hasChangedText);
		} finally {
			this._ignoreModelContentChanged = false;
		}
	}

	private async [State.SHOW_RESPONSE](): Promise<State.WAIT_FOR_INPUT | State.ACCEPT> {
		assertType(this._activeSession);
		assertType(this._strategy);

		const { response } = this._activeSession.lastExchange!;
		this._showWidget(false);

		let status: string | undefined;

		this._ctxLastResponseType.set(response instanceof EditResponse || response instanceof MarkdownResponse
			? response.raw.type
			: undefined);

		let responseTypes: InlineChateResponseTypes | undefined;
		for (const { response } of this._activeSession.exchanges) {

			const thisType = response instanceof MarkdownResponse
				? InlineChateResponseTypes.OnlyMessages : response instanceof EditResponse
					? InlineChateResponseTypes.OnlyEdits : undefined;

			if (responseTypes === undefined) {
				responseTypes = thisType;
			} else if (responseTypes !== thisType) {
				responseTypes = InlineChateResponseTypes.Mixed;
				break;
			}
		}
		this._ctxResponseTypes.set(responseTypes);
		this._ctxDidEdit.set(this._activeSession.hasChangedText);

		if (response instanceof EmptyResponse) {
			// show status message
			status = localize('empty', "No results, please refine your input and try again");
			this._zone.value.widget.updateStatus(status, { classes: ['warn'] });
			return State.WAIT_FOR_INPUT;

		} else if (response instanceof ErrorResponse) {
			// show error
			if (!response.isCancellation) {
				status = response.message;
				this._zone.value.widget.updateStatus(status, { classes: ['error'] });
			}

		} else if (response instanceof MarkdownResponse) {
			// clear status, show MD message
			const renderedMarkdown = renderMarkdown(response.raw.message, { inline: true });
			this._zone.value.widget.updateStatus('');
			this._zone.value.widget.updateMarkdownMessage(renderedMarkdown.element);
			this._zone.value.widget.updateToolbar(true);
			const content = renderedMarkdown.element.textContent;
			if (content) {
				status = localize('markdownResponseMessage', "{0}", content);
			}
			this._activeSession.lastExpansionState = this._zone.value.widget.expansionState;

		} else if (response instanceof EditResponse) {
			// edit response -> complex...
			this._zone.value.widget.updateMarkdownMessage(undefined);
			this._zone.value.widget.updateToolbar(true);

			const canContinue = this._strategy.checkChanges(response);
			if (!canContinue) {
				return State.ACCEPT;
			}
			status = this._configurationService.getValue('accessibility.verbosity.inlineChat') === true ? localize('editResponseMessage', "Use tab to navigate to the diff editor and review proposed changes.") : '';
			await this._strategy.renderChanges(response);
		}
		this._chatAccessibilityService.acceptResponse(status);

		return State.WAIT_FOR_INPUT;
	}

	private async [State.PAUSE]() {

		this._ctxDidEdit.reset();
		this._ctxUserDidEdit.reset();
		this._ctxLastResponseType.reset();
		this._ctxLastFeedbackKind.reset();

		this._zone.value.hide();

		// Return focus to the editor only if the current focus is within the editor widget
		if (this._editor.hasWidgetFocus()) {
			this._editor.focus();
		}


		this._strategy?.dispose();
		this._strategy = undefined;
		this._activeSession = undefined;
	}

	private async [State.ACCEPT]() {
		assertType(this._activeSession);
		assertType(this._strategy);
		this._sessionStore.clear();

		try {
			await this._strategy.apply();
		} catch (err) {
			this._dialogService.error(localize('err.apply', "Failed to apply changes.", toErrorMessage(err)));
			this._log('FAILED to apply changes');
			this._log(err);
		}

		this._inlineChatSessionService.releaseSession(this._activeSession);

		this[State.PAUSE]();
	}

	private async [State.CANCEL]() {
		assertType(this._activeSession);
		assertType(this._strategy);
		this._sessionStore.clear();

		const mySession = this._activeSession;

		try {
			await this._strategy.cancel();
		} catch (err) {
			this._dialogService.error(localize('err.discard', "Failed to discard changes.", toErrorMessage(err)));
			this._log('FAILED to discard changes');
			this._log(err);
		}

		this[State.PAUSE]();

		this._stashedSession.clear();
		if (!mySession.isUnstashed && mySession.lastExchange) {
			// only stash sessions that had edits
			this._stashedSession.value = this._instaService.createInstance(StashedSession, this._editor, mySession);
		} else {
			this._inlineChatSessionService.releaseSession(mySession);
		}
	}

	private static isEditOrMarkdownResponse(response: EditResponse | MarkdownResponse | EmptyResponse | ErrorResponse | undefined): response is EditResponse | MarkdownResponse {
		return response instanceof EditResponse || response instanceof MarkdownResponse;
	}

	// ---- controller API

	acceptInput(): void {
		this._messages.fire(Message.ACCEPT_INPUT);
	}

	regenerate(): void {
		this._messages.fire(Message.RERUN_INPUT);
	}

	cancelCurrentRequest(): void {
		this._messages.fire(Message.CANCEL_INPUT | Message.CANCEL_REQUEST);
	}

	arrowOut(up: boolean): void {
		if (this._zone.value.position && this._editor.hasModel()) {
			const { column } = this._editor.getPosition();
			const { lineNumber } = this._zone.value.position;
			const newLine = up ? lineNumber : lineNumber + 1;
			this._editor.setPosition({ lineNumber: newLine, column });
			this._editor.focus();
		}
	}

	focus(): void {
		this._zone.value.widget.focus();
	}

	populateHistory(up: boolean) {
		const len = InlineChatController._promptHistory.length;
		if (len === 0) {
			return;
		}
		const pos = (len + this._historyOffset + (up ? 1 : -1)) % len;
		const entry = InlineChatController._promptHistory[pos];

		this._zone.value.widget.value = entry;
		this._zone.value.widget.selectAll();
		this._historyOffset = pos;
	}

	viewInChat() {
		if (this._activeSession?.lastExchange?.response instanceof MarkdownResponse) {
			this._instaService.invokeFunction(showMessageResponse, this._activeSession.lastExchange.prompt.value, this._activeSession.lastExchange.response.raw.message.value);
		}
	}

	updateExpansionState(expand: boolean) {
		if (this._activeSession) {
			const expansionState = expand ? ExpansionState.EXPANDED : ExpansionState.CROPPED;
			this._zone.value.widget.updateMarkdownMessageExpansionState(expansionState);
			this._activeSession.lastExpansionState = expansionState;
		}
	}

	feedbackLast(helpful: boolean) {
		if (this._activeSession?.lastExchange && InlineChatController.isEditOrMarkdownResponse(this._activeSession.lastExchange.response)) {
			const kind = helpful ? InlineChatResponseFeedbackKind.Helpful : InlineChatResponseFeedbackKind.Unhelpful;
			this._activeSession.provider.handleInlineChatResponseFeedback?.(this._activeSession.session, this._activeSession.lastExchange.response.raw, kind);
			this._ctxLastFeedbackKind.set(helpful ? 'helpful' : 'unhelpful');
			this._zone.value.widget.updateStatus('Thank you for your feedback!', { resetAfter: 1250 });
		}
	}

	createSnapshot(): void {
		if (this._activeSession && !this._activeSession.textModel0.equalsTextBuffer(this._activeSession.textModelN.getTextBuffer())) {
			this._activeSession.createSnapshot();
		}
	}

	acceptSession(): void {
		if (this._activeSession?.lastExchange && InlineChatController.isEditOrMarkdownResponse(this._activeSession.lastExchange.response)) {
			this._activeSession.provider.handleInlineChatResponseFeedback?.(this._activeSession.session, this._activeSession.lastExchange.response.raw, InlineChatResponseFeedbackKind.Accepted);
		}
		this._messages.fire(Message.ACCEPT_SESSION);
	}

	cancelSession() {
		const result = this._activeSession?.asChangedText();
		if (this._activeSession?.lastExchange && InlineChatController.isEditOrMarkdownResponse(this._activeSession.lastExchange.response)) {
			this._activeSession.provider.handleInlineChatResponseFeedback?.(this._activeSession.session, this._activeSession.lastExchange.response.raw, InlineChatResponseFeedbackKind.Undone);
		}
		this._messages.fire(Message.CANCEL_SESSION);
		return result;
	}

	finishExistingSession(): void {
		if (this._activeSession) {
			if (this._activeSession.editMode === EditMode.Preview) {
				this._log('finishing existing session, using CANCEL', this._activeSession.editMode);
				this.cancelSession();
			} else {
				this._log('finishing existing session, using APPLY', this._activeSession.editMode);
				this.acceptSession();
			}
		}
	}

	unstashLastSession(): Session | undefined {
		return this._stashedSession.value?.unstash();
	}
}


class StashedSession {

	private readonly _listener: IDisposable;
	private readonly _ctxHasStashedSession: IContextKey<boolean>;
	private _session: Session | undefined;

	constructor(
		editor: ICodeEditor,
		session: Session,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInlineChatSessionService private readonly _sessionService: IInlineChatSessionService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._ctxHasStashedSession = CTX_INLINE_CHAT_HAS_STASHED_SESSION.bindTo(contextKeyService);

		// keep session for a little bit, only release when user continues to work (type, move cursor, etc.)
		this._session = session;
		this._ctxHasStashedSession.set(true);
		this._listener = Event.once(Event.any(editor.onDidChangeCursorSelection, editor.onDidChangeModelContent, editor.onDidChangeModel))(() => {
			this._session = undefined;
			this._sessionService.releaseSession(session);
			this._ctxHasStashedSession.reset();
		});
	}

	dispose() {
		this._listener.dispose();
		this._ctxHasStashedSession.reset();
		if (this._session) {
			this._sessionService.releaseSession(this._session);
		}
	}

	unstash(): Session | undefined {
		if (!this._session) {
			return undefined;
		}
		this._listener.dispose();
		const result = this._session;
		result.markUnstashed();
		this._session = undefined;
		this._logService.debug('[IE] Unstashed session');
		return result;
	}

}

async function showMessageResponse(accessor: ServicesAccessor, query: string, response: string) {
	const chatService = accessor.get(IChatService);
	const providerId = chatService.getProviderInfos()[0]?.id;

	const chatWidgetService = accessor.get(IChatWidgetService);
	const widget = await chatWidgetService.revealViewForProvider(providerId);
	if (widget && widget.viewModel) {
		chatService.addCompleteRequest(widget.viewModel.sessionId, query, { message: response });
		widget.focusLastMessage();
	}
}

async function sendRequest(accessor: ServicesAccessor, query: string) {
	const chatService = accessor.get(IChatService);
	const widgetService = accessor.get(IChatWidgetService);

	const providerId = chatService.getProviderInfos()[0]?.id;
	const widget = await widgetService.revealViewForProvider(providerId);
	if (!widget) {
		return;
	}

	widget.acceptInput(query);
}
