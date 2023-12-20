/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderMarkdownAsPlaintext } from 'vs/base/browser/markdownRenderer';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { Barrier, Queue, raceCancellation, raceCancellationError } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Lazy } from 'vs/base/common/lazy';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { MovingAverage } from 'vs/base/common/numbers';
import { StopWatch } from 'vs/base/common/stopwatch';
import { assertType } from 'vs/base/common/types';
import { generateUuid } from 'vs/base/common/uuid';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ISelection, Selection } from 'vs/editor/common/core/selection';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { TextEdit } from 'vs/editor/common/languages';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { Progress } from 'vs/platform/progress/common/progress';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IChatAccessibilityService, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { chatAgentLeader, chatSubcommandLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { EmptyResponse, ErrorResponse, ExpansionState, IInlineChatSessionService, ReplyResponse, Session, SessionExchange, SessionPrompt } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { EditModeStrategy, LivePreviewStrategy, LiveStrategy, PreviewStrategy, ProgressingEditsOptions } from 'vs/workbench/contrib/inlineChat/browser/inlineChatStrategies';
import { IInlineChatMessageAppender, InlineChatZoneWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { CTX_INLINE_CHAT_DID_EDIT, CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST, CTX_INLINE_CHAT_HAS_STASHED_SESSION, CTX_INLINE_CHAT_LAST_FEEDBACK, CTX_INLINE_CHAT_RESPONSE_TYPES, CTX_INLINE_CHAT_SUPPORT_ISSUE_REPORTING, CTX_INLINE_CHAT_USER_DID_EDIT, EditMode, IInlineChatProgressItem, IInlineChatRequest, IInlineChatResponse, INLINE_CHAT_ID, InlineChatConfigKeys, InlineChatResponseFeedbackKind, InlineChatResponseTypes } from 'vs/workbench/contrib/inlineChat/common/inlineChat';

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

export abstract class InlineChatRunOptions {
	initialSelection?: ISelection;
	initialRange?: IRange;
	message?: string;
	autoSend?: boolean;
	existingSession?: Session;
	isUnstashed?: boolean;
	position?: IPosition;

	static isInteractiveEditorOptions(options: any): options is InlineChatRunOptions {
		const { initialSelection, initialRange, message, autoSend, position } = options;
		if (
			typeof message !== 'undefined' && typeof message !== 'string'
			|| typeof autoSend !== 'undefined' && typeof autoSend !== 'boolean'
			|| typeof initialRange !== 'undefined' && !Range.isIRange(initialRange)
			|| typeof initialSelection !== 'undefined' && !Selection.isISelection(initialSelection)
			|| typeof position !== 'undefined' && !Position.isIPosition(position)) {
			return false;
		}
		return true;
	}
}

export class InlineChatController implements IEditorContribution {

	static get(editor: ICodeEditor) {
		return editor.getContribution<InlineChatController>(INLINE_CHAT_ID);
	}

	private static _storageKey = 'inline-chat-history';
	private static _promptHistory: string[] = [];
	private _historyOffset: number = -1;
	private _historyUpdate: (prompt: string) => void;

	private readonly _store = new DisposableStore();
	private readonly _zone: Lazy<InlineChatZoneWidget>;
	private readonly _ctxHasActiveRequest: IContextKey<boolean>;
	private readonly _ctxResponseTypes: IContextKey<undefined | InlineChatResponseTypes>;
	private readonly _ctxDidEdit: IContextKey<boolean>;
	private readonly _ctxUserDidEdit: IContextKey<boolean>;
	private readonly _ctxLastFeedbackKind: IContextKey<'helpful' | 'unhelpful' | ''>;
	private readonly _ctxSupportIssueReporting: IContextKey<boolean>;

	private _messages = this._store.add(new Emitter<Message>());

	private readonly _onWillStartSession = this._store.add(new Emitter<void>());
	readonly onWillStartSession = this._onWillStartSession.event;

	readonly onDidAcceptInput = Event.filter(this._messages.event, m => m === Message.ACCEPT_INPUT, this._store);
	readonly onDidCancelInput = Event.filter(this._messages.event, m => m === Message.CANCEL_INPUT || m === Message.CANCEL_SESSION, this._store);

	private readonly _sessionStore: DisposableStore = this._store.add(new DisposableStore());
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
		@IDialogService private readonly _dialogService: IDialogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IChatAccessibilityService private readonly _chatAccessibilityService: IChatAccessibilityService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		this._ctxHasActiveRequest = CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST.bindTo(contextKeyService);
		this._ctxDidEdit = CTX_INLINE_CHAT_DID_EDIT.bindTo(contextKeyService);
		this._ctxUserDidEdit = CTX_INLINE_CHAT_USER_DID_EDIT.bindTo(contextKeyService);
		this._ctxResponseTypes = CTX_INLINE_CHAT_RESPONSE_TYPES.bindTo(contextKeyService);
		this._ctxLastFeedbackKind = CTX_INLINE_CHAT_LAST_FEEDBACK.bindTo(contextKeyService);
		this._ctxSupportIssueReporting = CTX_INLINE_CHAT_SUPPORT_ISSUE_REPORTING.bindTo(contextKeyService);
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
			await this.run({ existingSession });
			this._log('session done or paused');
		}));
		this._log('NEW controller');

		InlineChatController._promptHistory = JSON.parse(_storageService.get(InlineChatController._storageKey, StorageScope.PROFILE, '[]'));
		this._historyUpdate = (prompt: string) => {
			const idx = InlineChatController._promptHistory.indexOf(prompt);
			if (idx >= 0) {
				InlineChatController._promptHistory.splice(idx, 1);
			}
			InlineChatController._promptHistory.unshift(prompt);
			this._historyOffset = -1;
			this._storageService.store(InlineChatController._storageKey, JSON.stringify(InlineChatController._promptHistory), StorageScope.PROFILE, StorageTarget.USER);
		};
	}

	dispose(): void {
		this._strategy?.dispose();
		this._stashedSession.clear();
		if (this._activeSession) {
			this._inlineChatSessionService.releaseSession(this._activeSession);
		}
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
		const editMode = this._configurationService.inspect<EditMode>(InlineChatConfigKeys.Mode);
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
		try {
			this.finishExistingSession();
			if (this._currentRun) {
				await this._currentRun;
			}
			this._stashedSession.clear();
			if (options.initialSelection) {
				this._editor.setSelection(options.initialSelection);
			}
			this._historyOffset = -1;
			this._onWillStartSession.fire();
			this._currentRun = this._nextState(State.CREATE_SESSION, options);
			await this._currentRun;

		} catch (error) {
			// this should not happen but when it does make sure to tear down the UI and everything
			onUnexpectedError(error);
			if (this._activeSession) {
				this._inlineChatSessionService.releaseSession(this._activeSession);
			}
			this[State.PAUSE]();

		} finally {
			this._currentRun = undefined;
		}
	}

	joinCurrentRun(): Promise<void> | undefined {
		return this._currentRun;
	}

	// ---- state machine

	private _showWidget(initialRender: boolean = false, position?: Position) {
		assertType(this._editor.hasModel());

		let widgetPosition: Position;
		if (position) {
			// explicit position wins
			widgetPosition = position;
		} else if (this._zone.value.position) {
			// already showing - special case of line 1
			if (this._zone.value.position.lineNumber === 1) {
				widgetPosition = this._zone.value.position.delta(-1);
			} else {
				widgetPosition = this._zone.value.position;
			}
		} else {
			// default to ABOVE the selection
			widgetPosition = this._editor.getSelection().getStartPosition().delta(-1);
		}

		if (initialRender) {
			this._zone.value.setContainerMargins();
		}

		if (this._activeSession && !position && (this._activeSession.hasChangedText || this._activeSession.lastExchange)) {
			widgetPosition = this._activeSession.wholeRange.value.getStartPosition().delta(-1);
		}
		if (this._activeSession) {
			this._zone.value.updateBackgroundColor(widgetPosition, this._activeSession.wholeRange.value);
		}
		if (!this._zone.value.position) {
			this._zone.value.setWidgetMargins(widgetPosition);
			this._zone.value.show(widgetPosition);
		} else {
			this._zone.value.updatePositionAndHeight(widgetPosition);
		}
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


		let initPosition: Position | undefined;
		if (options.position) {
			initPosition = Position.lift(options.position).delta(-1);
			delete options.position;
		}

		this._showWidget(true, initPosition);

		this._updatePlaceholder();

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
				this._strategy = this._instaService.createInstance(LiveStrategy, session, this._editor, this._zone.value);
				break;
			case EditMode.Preview:
				this._strategy = this._instaService.createInstance(PreviewStrategy, session, this._zone.value);
				break;
			case EditMode.LivePreview:
			default:
				this._strategy = this._instaService.createInstance(LivePreviewStrategy, session, this._editor, this._zone.value);
				break;
		}

		this._activeSession = session;
		return State.INIT_UI;
	}

	private async [State.INIT_UI](options: InlineChatRunOptions): Promise<State.WAIT_FOR_INPUT | State.SHOW_RESPONSE | State.APPLY_RESPONSE> {
		assertType(this._activeSession);
		assertType(this._strategy);

		// hide/cancel inline completions when invoking IE
		InlineCompletionsController.get(this._editor)?.hide();

		this._sessionStore.clear();

		const wholeRangeDecoration = this._editor.createDecorationsCollection();
		const updateWholeRangeDecoration = () => {
			const newDecorations = this._strategy?.getWholeRangeDecoration() ?? [];
			wholeRangeDecoration.set(newDecorations);
		};
		this._sessionStore.add(toDisposable(() => wholeRangeDecoration.clear()));
		this._sessionStore.add(this._activeSession.wholeRange.onDidChange(updateWholeRangeDecoration));
		updateWholeRangeDecoration();

		this._zone.value.widget.updateSlashCommands(this._activeSession.session.slashCommands ?? []);
		this._updatePlaceholder();
		this._zone.value.widget.updateInfo(this._activeSession.session.message ?? localize('welcome.1', "AI-generated code may be incorrect"));
		this._zone.value.widget.preferredExpansionState = this._activeSession.lastExpansionState;
		this._zone.value.widget.value = this._activeSession.session.input ?? this._activeSession.lastInput?.value ?? this._zone.value.widget.value;
		if (this._activeSession.session.input) {
			this._zone.value.widget.selectAll();
		}

		this._showWidget(true);

		this._sessionStore.add(this._editor.onDidChangeModel((e) => {
			const msg = this._activeSession?.lastExchange
				? Message.PAUSE_SESSION // pause when switching models/tabs and when having a previous exchange
				: Message.CANCEL_SESSION;
			this._log('model changed, pause or cancel session', msg, e);
			this._messages.fire(msg);
		}));

		const altVersionNow = this._editor.getModel()?.getAlternativeVersionId();

		this._sessionStore.add(this._editor.onDidChangeModelContent(e => {

			if (!this._ignoreModelContentChanged && this._strategy?.hasFocus()) {
				this._ctxUserDidEdit.set(altVersionNow !== this._editor.getModel()?.getAlternativeVersionId());
			}

			if (this._ignoreModelContentChanged || this._strategy?.hasFocus()) {
				return;
			}

			const wholeRange = this._activeSession!.wholeRange;
			let shouldFinishSession = false;
			if (this._configurationService.getValue<boolean>(InlineChatConfigKeys.FinishOnType)) {
				for (const { range } of e.changes) {
					shouldFinishSession = !Range.areIntersectingOrTouching(range, wholeRange.value);
				}
			}

			this._activeSession!.recordExternalEditOccurred(shouldFinishSession);

			if (shouldFinishSession) {
				this._log('text changed outside of whole range, FINISH session');
				this.finishExistingSession();
			}
		}));

		// Update context key
		this._ctxSupportIssueReporting.set(this._activeSession.provider.supportIssueReporting ?? false);

		if (!this._activeSession.lastExchange) {
			return State.WAIT_FOR_INPUT;
		} else if (options.isUnstashed) {
			delete options.isUnstashed;
			return State.APPLY_RESPONSE;
		} else {
			return State.SHOW_RESPONSE;
		}
	}

	private _forcedPlaceholder: string | undefined = undefined;
	setPlaceholder(text: string): void {
		this._forcedPlaceholder = text;
		this._updatePlaceholder();
	}

	resetPlaceholder(): void {
		this._forcedPlaceholder = undefined;
		this._updatePlaceholder();
	}

	private _updatePlaceholder(): void {
		this._zone.value.widget.placeholder = this._getPlaceholderText();
	}

	private _getPlaceholderText(): string {
		return this._forcedPlaceholder ?? this._activeSession?.session.placeholder ?? '';
	}


	private async [State.WAIT_FOR_INPUT](options: InlineChatRunOptions): Promise<State.ACCEPT | State.CANCEL | State.PAUSE | State.WAIT_FOR_INPUT | State.MAKE_REQUEST> {
		assertType(this._activeSession);
		assertType(this._strategy);

		this._updatePlaceholder();

		if (options.message) {
			this.updateInput(options.message);
			aria.alert(options.message);
			delete options.message;
		}

		let message = Message.NONE;
		if (options.autoSend) {
			message = Message.ACCEPT_INPUT;
			delete options.autoSend;

		} else {
			const barrier = new Barrier();
			const store = new DisposableStore();
			store.add(this._strategy.onDidAccept(() => this.acceptSession()));
			store.add(this._strategy.onDidDiscard(() => this.cancelSession()));
			store.add(Event.once(this._messages.event)(m => {
				this._log('state=_waitForInput) message received', m);
				message = m;
				barrier.open();
			}));
			await barrier.wait();
			store.dispose();
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
			if (lastExchange.response instanceof ReplyResponse) {
				try {
					this._ignoreModelContentChanged = true;
					await this._strategy.undoChanges(lastExchange.response.modelAltVersionId);
				} finally {
					this._ignoreModelContentChanged = false;
				}
			}
			return State.MAKE_REQUEST;
		}

		if (!this.getInput()) {
			return State.WAIT_FOR_INPUT;
		}

		const input = this.getInput();


		this._historyUpdate(input);

		const refer = this._activeSession.session.slashCommands?.some(value => value.refer && input!.startsWith(`/${value.command}`));
		if (refer) {
			this._log('[IE] seeing refer command, continuing outside editor', this._activeSession.provider.debugName);
			this._editor.setSelection(this._activeSession.wholeRange.value);
			let massagedInput = input;
			if (input.startsWith(chatSubcommandLeader)) {
				const withoutSubCommandLeader = input.slice(1);
				const cts = new CancellationTokenSource();
				this._sessionStore.add(cts);
				for (const agent of this._chatAgentService.getAgents()) {
					const commands = await agent.provideSlashCommands(cts.token);
					if (commands.find((command) => withoutSubCommandLeader.startsWith(command.name))) {
						massagedInput = `${chatAgentLeader}${agent.id} ${input}`;
						break;
					}
				}
			}
			// if agent has a refer command, massage the input to include the agent name
			this._instaService.invokeFunction(sendRequest, massagedInput);

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
		assertType(this._strategy);
		assertType(this._activeSession.lastInput);

		const requestCts = new CancellationTokenSource();

		let message = Message.NONE;
		const msgListener = Event.once(this._messages.event)(m => {
			this._log('state=_makeRequest) message received', m);
			message = m;
			requestCts.cancel();
		});

		const typeListener = this._zone.value.widget.onDidChangeInput(() => requestCts.cancel());

		const requestClock = StopWatch.create();
		const request: IInlineChatRequest = {
			requestId: generateUuid(),
			prompt: this._activeSession.lastInput.value,
			attempt: this._activeSession.lastInput.attempt,
			selection: this._editor.getSelection(),
			wholeRange: this._activeSession.wholeRange.trackedInitialRange,
			live: this._activeSession.editMode !== EditMode.Preview // TODO@jrieken let extension know what document is used for previewing
		};

		const modelAltVersionIdNow = this._activeSession.textModelN.getAlternativeVersionId();
		const progressEdits: TextEdit[][] = [];

		const progressiveEditsAvgDuration = new MovingAverage();
		const progressiveEditsCts = new CancellationTokenSource(requestCts.token);
		const progressiveEditsClock = StopWatch.create();
		const progressiveEditsQueue = new Queue();

		let progressiveChatResponse: IInlineChatMessageAppender | undefined;

		const progress = new Progress<IInlineChatProgressItem>(data => {
			this._log('received chunk', data, request);

			if (requestCts.token.isCancellationRequested) {
				return;
			}

			if (data.message) {
				this._zone.value.widget.updateToolbar(false);
				this._zone.value.widget.updateInfo(data.message);
			}
			if (data.slashCommand) {
				const valueNow = this.getInput();
				if (!valueNow.startsWith('/')) {
					this._zone.value.widget.updateSlashCommandUsed(data.slashCommand);
				}
			}
			if (data.edits?.length) {
				if (!request.live) {
					throw new Error('Progress in NOT supported in non-live mode');
				}
				progressEdits.push(data.edits);
				progressiveEditsAvgDuration.update(progressiveEditsClock.elapsed());
				progressiveEditsClock.reset();

				progressiveEditsQueue.queue(async () => {

					const startThen = this._activeSession!.wholeRange.value.getStartPosition();

					// making changes goes into a queue because otherwise the async-progress time will
					// influence the time it takes to receive the changes and progressive typing will
					// become infinitely fast
					await this._makeChanges(data.edits!, data.editsShouldBeInstant
						? undefined
						: { duration: progressiveEditsAvgDuration.value, token: progressiveEditsCts.token }
					);

					// reshow the widget if the start position changed or shows at the wrong position
					const startNow = this._activeSession!.wholeRange.value.getStartPosition();
					if (!startNow.equals(startThen) || !this._zone.value.position?.equals(startNow)) {
						this._showWidget(false, startNow.delta(-1));
					}
				});
			}
			if (data.markdownFragment) {
				if (!progressiveChatResponse) {
					const message = {
						message: new MarkdownString(data.markdownFragment, { supportThemeIcons: true, supportHtml: true, isTrusted: false }),
						providerId: this._activeSession!.provider.debugName,
						requestId: request.requestId,
					};
					progressiveChatResponse = this._zone.value.widget.updateChatMessage(message, true);
				} else {
					progressiveChatResponse.appendContent(data.markdownFragment);
				}
			}
		});

		let a11yResponse: string | undefined;
		const a11yVerboseInlineChat = this._configurationService.getValue<boolean>('accessibility.verbosity.inlineChat') === true;
		const requestId = this._chatAccessibilityService.acceptRequest();

		const task = this._activeSession.provider.provideResponse(this._activeSession.session, request, progress, requestCts.token);
		this._log('request started', this._activeSession.provider.debugName, this._activeSession.session, request);

		let response: ReplyResponse | ErrorResponse | EmptyResponse;
		let reply: IInlineChatResponse | null | undefined;
		try {
			this._zone.value.widget.updateChatMessage(undefined);
			this._zone.value.widget.updateFollowUps(undefined);
			this._zone.value.widget.updateProgress(true);
			this._zone.value.widget.updateInfo(!this._activeSession.lastExchange ? localize('thinking', "Thinking\u2026") : '');
			await this._strategy.start();
			this._ctxHasActiveRequest.set(true);
			reply = await raceCancellationError(Promise.resolve(task), requestCts.token);

			if (progressiveEditsQueue.size > 0) {
				// we must wait for all edits that came in via progress to complete
				await Event.toPromise(progressiveEditsQueue.onDrained);
			}
			if (progressiveChatResponse) {
				progressiveChatResponse.cancel();
			}

			if (!reply) {
				response = new EmptyResponse();
				a11yResponse = localize('empty', "No results, please refine your input and try again");
			} else {
				const markdownContents = reply.message ?? new MarkdownString('', { supportThemeIcons: true, supportHtml: true, isTrusted: false });
				const replyResponse = response = this._instaService.createInstance(ReplyResponse, reply, markdownContents, this._activeSession.textModelN.uri, modelAltVersionIdNow, progressEdits, request.requestId);

				for (let i = progressEdits.length; i < replyResponse.allLocalEdits.length; i++) {
					await this._makeChanges(replyResponse.allLocalEdits[i], undefined);
				}

				const a11yMessageResponse = renderMarkdownAsPlaintext(replyResponse.mdContent);

				a11yResponse = a11yVerboseInlineChat
					? a11yMessageResponse ? localize('editResponseMessage2', "{0}, also review proposed changes in the diff editor.", a11yMessageResponse) : localize('editResponseMessage', "Review proposed changes in the diff editor.")
					: a11yMessageResponse;
			}

		} catch (e) {
			response = new ErrorResponse(e);
			a11yResponse = (<ErrorResponse>response).message;

		} finally {
			this._ctxHasActiveRequest.set(false);
			this._zone.value.widget.updateProgress(false);
			this._zone.value.widget.updateInfo('');
			this._zone.value.widget.updateToolbar(true);
			this._log('request took', requestClock.elapsed(), this._activeSession.provider.debugName);
			this._chatAccessibilityService.acceptResponse(a11yResponse, requestId);
		}

		// todo@jrieken we can likely remove 'trackEdit'
		const diff = await this._editorWorkerService.computeDiff(this._activeSession.textModel0.uri, this._activeSession.textModelN.uri, { computeMoves: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER, ignoreTrimWhitespace: false }, 'advanced');
		this._activeSession.wholeRange.fixup(diff?.changes ?? []);

		progressiveEditsCts.dispose(true);
		requestCts.dispose();
		msgListener.dispose();
		typeListener.dispose();

		if (request.live && !(response instanceof ReplyResponse)) {
			this._strategy?.undoChanges(modelAltVersionIdNow);
		}

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

	private async[State.APPLY_RESPONSE](): Promise<State.SHOW_RESPONSE | State.CANCEL> {
		assertType(this._activeSession);
		assertType(this._strategy);

		const { response } = this._activeSession.lastExchange!;
		if (response instanceof ReplyResponse && response.workspaceEdit) {
			// this reply cannot be applied in the normal inline chat UI and needs to be handled off to workspace edit
			this._bulkEditService.apply(response.workspaceEdit, { showPreview: true });
			return State.CANCEL;
		}
		return State.SHOW_RESPONSE;
	}

	private async _makeChanges(edits: TextEdit[], opts: ProgressingEditsOptions | undefined) {
		assertType(this._activeSession);
		assertType(this._strategy);

		const moreMinimalEdits = await this._editorWorkerService.computeMoreMinimalEdits(this._activeSession.textModelN.uri, edits);
		this._log('edits from PROVIDER and after making them MORE MINIMAL', this._activeSession.provider.debugName, edits, moreMinimalEdits);

		if (moreMinimalEdits?.length === 0) {
			// nothing left to do
			return;
		}

		const actualEdits = !opts && moreMinimalEdits ? moreMinimalEdits : edits;
		const editOperations = actualEdits.map(TextEdit.asEditOperation);

		try {
			this._ignoreModelContentChanged = true;
			this._activeSession.wholeRange.trackEdits(editOperations);
			if (opts) {
				await this._strategy.makeProgressiveChanges(editOperations, opts);
			} else {
				await this._strategy.makeChanges(editOperations);
			}
			this._ctxDidEdit.set(this._activeSession.hasChangedText);
		} finally {
			this._ignoreModelContentChanged = false;
		}
	}

	private async[State.SHOW_RESPONSE](): Promise<State.WAIT_FOR_INPUT> {
		assertType(this._activeSession);
		assertType(this._strategy);

		const { response } = this._activeSession.lastExchange!;

		let responseTypes: InlineChatResponseTypes | undefined;
		for (const { response } of this._activeSession.exchanges) {

			const thisType = response instanceof ReplyResponse
				? response.responseType
				: undefined;

			if (responseTypes === undefined) {
				responseTypes = thisType;
			} else if (responseTypes !== thisType) {
				responseTypes = InlineChatResponseTypes.Mixed;
				break;
			}
		}
		this._ctxResponseTypes.set(responseTypes);
		this._ctxDidEdit.set(this._activeSession.hasChangedText);

		let newPosition: Position | undefined;

		if (response instanceof EmptyResponse) {
			// show status message
			const status = localize('empty', "No results, please refine your input and try again");
			this._zone.value.widget.updateStatus(status, { classes: ['warn'] });
			return State.WAIT_FOR_INPUT;

		} else if (response instanceof ErrorResponse) {
			// show error
			if (!response.isCancellation) {
				this._zone.value.widget.updateStatus(response.message, { classes: ['error'] });
			}

		} else if (response instanceof ReplyResponse) {
			// real response -> complex...
			this._zone.value.widget.updateStatus('');
			const message = { message: response.mdContent, providerId: this._activeSession.provider.debugName, requestId: response.requestId };
			this._zone.value.widget.updateChatMessage(message);

			//this._zone.value.widget.updateMarkdownMessage(response.mdContent);
			this._activeSession.lastExpansionState = this._zone.value.widget.expansionState;
			this._zone.value.widget.updateToolbar(true);

			newPosition = await this._strategy.renderChanges(response);

			if (this._activeSession.provider.provideFollowups) {
				const followupCts = new CancellationTokenSource();
				const msgListener = Event.once(this._messages.event)(() => {
					followupCts.cancel();
				});
				const followupTask = this._activeSession.provider.provideFollowups(this._activeSession.session, response.raw, followupCts.token);
				this._log('followup request started', this._activeSession.provider.debugName, this._activeSession.session, response.raw);
				raceCancellation(Promise.resolve(followupTask), followupCts.token).then(followupReply => {
					if (followupReply && this._activeSession) {
						this._log('followup request received', this._activeSession.provider.debugName, this._activeSession.session, followupReply);
						this._zone.value.widget.updateFollowUps(followupReply, followup => {
							this.updateInput(followup.message);
							this.acceptInput();
						});
					}
				}).finally(() => {
					msgListener.dispose();
					followupCts.dispose();
				});
			}
		}
		this._showWidget(false, newPosition);

		return State.WAIT_FOR_INPUT;
	}

	private async[State.PAUSE]() {

		this._ctxDidEdit.reset();
		this._ctxUserDidEdit.reset();
		this._ctxLastFeedbackKind.reset();
		this._ctxSupportIssueReporting.reset();

		this._zone.value.hide();

		// Return focus to the editor only if the current focus is within the editor widget
		if (this._editor.hasWidgetFocus()) {
			this._editor.focus();
		}


		this._strategy?.dispose();
		this._strategy = undefined;
		this._activeSession = undefined;
	}

	private async[State.ACCEPT]() {
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

	private async[State.CANCEL]() {
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

	// ---- controller API

	acceptInput(): void {
		this._messages.fire(Message.ACCEPT_INPUT);
	}

	updateInput(text: string, selectAll = true): void {
		this._zone.value.widget.value = text;
		if (selectAll) {
			this._zone.value.widget.selectAll();
		}
	}

	getInput(): string {
		return this._zone.value.widget.value;
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

	hasFocus(): boolean {
		return this._zone.value.widget.hasFocus();
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
		if (this._activeSession?.lastExchange?.response instanceof ReplyResponse) {
			this._instaService.invokeFunction(showMessageResponse, this._activeSession.lastExchange.prompt.value, this._activeSession.lastExchange.response.mdContent.value);
		}
	}

	updateExpansionState(expand: boolean) {
		if (this._activeSession) {
			const expansionState = expand ? ExpansionState.EXPANDED : ExpansionState.CROPPED;
			this._zone.value.widget.updateChatMessageExpansionState(expansionState);
			this._activeSession.lastExpansionState = expansionState;
		}
	}

	toggleDiff() {
		this._strategy?.toggleDiff?.();
	}

	feedbackLast(kind: InlineChatResponseFeedbackKind) {
		if (this._activeSession?.lastExchange && this._activeSession.lastExchange.response instanceof ReplyResponse) {
			this._activeSession.provider.handleInlineChatResponseFeedback?.(this._activeSession.session, this._activeSession.lastExchange.response.raw, kind);
			switch (kind) {
				case InlineChatResponseFeedbackKind.Helpful:
					this._ctxLastFeedbackKind.set('helpful');
					break;
				case InlineChatResponseFeedbackKind.Unhelpful:
					this._ctxLastFeedbackKind.set('unhelpful');
					break;
				default:
					break;
			}
			this._zone.value.widget.updateStatus('Thank you for your feedback!', { resetAfter: 1250 });
		}
	}

	createSnapshot(): void {
		if (this._activeSession && !this._activeSession.textModel0.equalsTextBuffer(this._activeSession.textModelN.getTextBuffer())) {
			this._activeSession.createSnapshot();
		}
	}

	acceptSession(): void {
		if (this._activeSession?.lastExchange && this._activeSession.lastExchange.response instanceof ReplyResponse) {
			this._activeSession.provider.handleInlineChatResponseFeedback?.(this._activeSession.session, this._activeSession.lastExchange.response.raw, InlineChatResponseFeedbackKind.Accepted);
		}
		this._messages.fire(Message.ACCEPT_SESSION);
	}

	async cancelSession() {

		let result: string | undefined;
		if (this._activeSession) {

			const diff = await this._editorWorkerService.computeDiff(this._activeSession.textModel0.uri, this._activeSession.textModelN.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: 5000, computeMoves: false }, 'advanced');
			result = this._activeSession.asChangedText(diff?.changes ?? []);

			if (this._activeSession.lastExchange && this._activeSession.lastExchange.response instanceof ReplyResponse) {
				this._activeSession.provider.handleInlineChatResponseFeedback?.(this._activeSession.session, this._activeSession.lastExchange.response.raw, InlineChatResponseFeedbackKind.Undone);
			}
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
