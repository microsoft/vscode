/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, WindowIntervalTimer } from 'vs/base/browser/dom';
import { CancelablePromise, Queue, createCancelablePromise, raceCancellationError } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { MovingAverage } from 'vs/base/common/numbers';
import { StopWatch } from 'vs/base/common/stopwatch';
import { assertType } from 'vs/base/common/types';
import { generateUuid } from 'vs/base/common/uuid';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { TextEdit } from 'vs/editor/common/languages';
import { ICursorStateComputer } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { localize } from 'vs/nls';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AsyncProgress } from 'vs/platform/progress/common/progress';
import { SaveReason } from 'vs/workbench/common/editor';
import { countWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { EmptyResponse, ErrorResponse, ReplyResponse, Session, SessionExchange, SessionPrompt } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { IInlineChatSessionService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionService';
import { ProgressingEditsOptions, asProgressiveEdit, performAsyncTextEdit } from 'vs/workbench/contrib/inlineChat/browser/inlineChatStrategies';
import { InlineChatWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { CTX_INLINE_CHAT_LAST_RESPONSE_TYPE, CTX_INLINE_CHAT_VISIBLE, EditMode, IInlineChatProgressItem, IInlineChatRequest, InlineChatResponseFeedbackKind, InlineChatResponseType } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

export const CTX_NOTEBOOK_CELL_CHAT_FOCUSED = new RawContextKey<boolean>('notebookCellChatFocused', false, localize('notebookCellChatFocused', "Whether the cell chat editor is focused"));
export const CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST = new RawContextKey<boolean>('notebookChatHasActiveRequest', false, localize('notebookChatHasActiveRequest', "Whether the cell chat editor has an active request"));
export const MENU_CELL_CHAT_INPUT = MenuId.for('cellChatInput');
export const MENU_CELL_CHAT_WIDGET = MenuId.for('cellChatWidget');
export const MENU_CELL_CHAT_WIDGET_STATUS = MenuId.for('cellChatWidget.status');
export const MENU_CELL_CHAT_WIDGET_FEEDBACK = MenuId.for('cellChatWidget.feedback');
export const MENU_CELL_CHAT_WIDGET_TOOLBAR = MenuId.for('cellChatWidget.toolbar');

interface ICellChatPart {
	activeCell: ICellViewModel | undefined;
}

export class NotebookCellChatController extends Disposable {
	private static _cellChatControllers = new WeakMap<ICellViewModel, NotebookCellChatController>();

	static get(cell: ICellViewModel): NotebookCellChatController | undefined {
		return NotebookCellChatController._cellChatControllers.get(cell);
	}

	private _sessionCtor: CancelablePromise<void> | undefined;
	private _activeSession?: Session;
	private readonly _ctxHasActiveRequest: IContextKey<boolean>;
	private _isVisible: boolean = false;
	private _strategy: EditStrategy | undefined;

	private _inlineChatListener: IDisposable | undefined;
	private _widget: InlineChatWidget | undefined;
	private _toolbar: MenuWorkbenchToolBar | undefined;
	private readonly _ctxVisible: IContextKey<boolean>;
	private readonly _ctxCellWidgetFocused: IContextKey<boolean>;
	private readonly _ctxLastResponseType: IContextKey<undefined | InlineChatResponseType>;
	private _widgetDisposableStore: DisposableStore = this._register(new DisposableStore());
	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		private readonly _chatPart: ICellChatPart,
		private readonly _cell: ICellViewModel,
		private readonly _partContainer: HTMLElement,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInlineChatSessionService private readonly _inlineChatSessionService: IInlineChatSessionService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService,
	) {
		super();

		NotebookCellChatController._cellChatControllers.set(this._cell, this);
		this._ctxHasActiveRequest = CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST.bindTo(this._contextKeyService);
		this._ctxVisible = CTX_INLINE_CHAT_VISIBLE.bindTo(_contextKeyService);
		this._ctxCellWidgetFocused = CTX_NOTEBOOK_CELL_CHAT_FOCUSED.bindTo(this._contextKeyService);
		this._ctxLastResponseType = CTX_INLINE_CHAT_LAST_RESPONSE_TYPE.bindTo(this._contextKeyService);

		this._register(this._cell.onDidChangeEditorAttachState(() => {
			const editor = this._getCellEditor();
			this._inlineChatListener?.dispose();

			if (!editor) {
				return;
			}

			if (!this._widget && this._isVisible) {
				this._initialize(editor);
			}

			const inlineChatController = InlineChatController.get(editor);
			if (inlineChatController) {
				this._inlineChatListener = inlineChatController.onWillStartSession(() => {
					this.dismiss(false);
				});
			}
		}));
	}

	private _initialize(editor: IActiveCodeEditor) {
		this._widget = this._instantiationService.createInstance(InlineChatWidget, editor, {
			menuId: MENU_CELL_CHAT_INPUT,
			widgetMenuId: MENU_CELL_CHAT_WIDGET,
			statusMenuId: MENU_CELL_CHAT_WIDGET_STATUS,
			feedbackMenuId: MENU_CELL_CHAT_WIDGET_FEEDBACK
		});

		this._widgetDisposableStore.add(this._widget.onDidChangeHeight(() => {
			this._updateHeight();
		}));

		this._widgetDisposableStore.add(this._notebookExecutionStateService.onDidChangeExecution(e => {
			if (e.notebook.toString() !== this._notebookEditor.textModel?.uri.toString()) {
				return;
			}

			if (e.type === NotebookExecutionType.cell && e.affectsCell(this._cell.uri) && e.changed === undefined /** complete */) {
				// check if execution is successfull
				const { lastRunSuccess } = this._cell.internalMetadata;
				if (lastRunSuccess) {
					this._strategy?.createSnapshot();
				}
			}
		}));


		this._partContainer.appendChild(this._widget.domNode);
	}

	public override dispose(): void {
		if (this._isVisible) {
			// detach the chat widget
			this._widget?.reset();
			this._sessionCtor?.cancel();
			this._sessionCtor = undefined;
		}

		try {
			if (this._widget) {
				this._partContainer.removeChild(this._widget.domNode);
			}

		} catch (_ex) {
			// might not be attached
		}

		// dismiss since we can't restore  the widget properly now
		this.dismiss(false);
		this._widget?.dispose();
		this._inlineChatListener?.dispose();
		this._toolbar?.dispose();
		this._inlineChatListener = undefined;
		this._ctxHasActiveRequest.reset();
		this._ctxVisible.reset();
		NotebookCellChatController._cellChatControllers.delete(this._cell);
		super.dispose();
	}

	isWidgetVisible() {
		return this._isVisible;
	}

	layout() {
		if (this._isVisible && this._widget) {
			const width = this._notebookEditor.getLayoutInfo().width - (/** margin */ 16 + 6) - (/** padding */ 6 * 2);
			const height = this._widget.getHeight();
			this._widget.layout(new Dimension(width, height));
		}
	}

	private _updateHeight() {
		const surrounding = 6 * 2 /** padding */ + 6 /** cell chat widget margin bottom */ + 2 /** border */;
		const heightWithPadding = this._isVisible && this._widget
			? (this._widget.getHeight() - 8 /** shadow */ - 18 /** padding */ - 6 /** widget's internal margin top */ + surrounding)
			: 0;

		if (this._cell.chatHeight === heightWithPadding) {
			return;
		}

		this._cell.chatHeight = heightWithPadding;
		this._partContainer.style.height = `${heightWithPadding - surrounding}px`;
	}

	async show(input?: string, autoSend?: boolean) {
		this._isVisible = true;
		if (!this._widget) {
			const editor = this._getCellEditor();
			if (editor) {
				this._initialize(editor);
			}
		}

		this._partContainer.style.display = 'flex';
		this._widget?.focus();
		this._widget?.updateInfo(localize('welcome.1', "AI-generated code may be incorrect"));
		this._ctxVisible.set(true);
		this._ctxCellWidgetFocused.set(true);
		this._updateHeight();

		this._sessionCtor = createCancelablePromise<void>(async token => {
			if (this._cell.editorAttached) {
				const editor = this._getCellEditor();
				if (editor) {
					await this._startSession(editor, token);
				}
			} else {
				await Event.toPromise(Event.once(this._cell.onDidChangeEditorAttachState));
				if (token.isCancellationRequested) {
					return;
				}

				const editor = this._getCellEditor();
				if (editor) {
					await this._startSession(editor, token);
				}
			}

			if (this._widget) {
				this._widget.placeholder = this._activeSession?.session.placeholder ?? localize('default.placeholder', "Ask a question");
				this._widget.updateInfo(this._activeSession?.session.message ?? localize('welcome.1', "AI-generated code may be incorrect"));
				this._widget.focus();
			}

			if (this._widget && input) {
				this._widget.value = input;

				if (autoSend) {
					this.acceptInput();
				}
			}
		});
	}

	async focusWidget() {
		this._widget?.focus();
	}

	private _getCellEditor() {
		const editors = this._notebookEditor.codeEditors.find(editor => editor[0] === this._chatPart.activeCell);
		if (!editors || !editors[1].hasModel()) {
			return;
		}

		const editor = editors[1];
		return editor;
	}

	private async _startSession(editor: IActiveCodeEditor, token: CancellationToken) {
		if (this._activeSession) {
			this._inlineChatSessionService.releaseSession(this._activeSession);
		}

		const session = await this._inlineChatSessionService.createSession(
			editor,
			{ editMode: EditMode.LivePreview },
			token
		);

		if (!session) {
			return;
		}

		this._activeSession = session;
		this._strategy = new EditStrategy(session);
	}

	async acceptInput() {
		assertType(this._activeSession);
		assertType(this._widget);
		this._activeSession.addInput(new SessionPrompt(this._widget.value));

		assertType(this._activeSession.lastInput);

		const value = this._activeSession.lastInput.value;
		const editors = this._notebookEditor.codeEditors.find(editor => editor[0] === this._chatPart.activeCell);
		if (!editors || !editors[1].hasModel()) {
			return;
		}

		const editor = editors[1];

		this._ctxHasActiveRequest.set(true);
		this._widget?.updateProgress(true);

		const request: IInlineChatRequest = {
			requestId: generateUuid(),
			prompt: value,
			attempt: 0,
			selection: { selectionStartLineNumber: 1, selectionStartColumn: 1, positionLineNumber: 1, positionColumn: 1 },
			wholeRange: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
			live: true,
			withIntentDetection: true, // TODO: don't hard code but allow in corresponding UI to run without intent detection?
		};

		const requestCts = new CancellationTokenSource();
		const progressEdits: TextEdit[][] = [];
		const progressiveEditsQueue = new Queue();
		const progressiveEditsClock = StopWatch.create();
		const progressiveEditsAvgDuration = new MovingAverage();
		const progressiveEditsCts = new CancellationTokenSource(requestCts.token);
		const progress = new AsyncProgress<IInlineChatProgressItem>(async data => {
			// console.log('received chunk', data, request);

			if (requestCts.token.isCancellationRequested) {
				return;
			}

			if (data.message) {
				this._widget?.updateToolbar(false);
				this._widget?.updateInfo(data.message);
			}

			if (data.edits?.length) {
				if (!request.live) {
					throw new Error('Progress in NOT supported in non-live mode');
				}
				progressEdits.push(data.edits);
				progressiveEditsAvgDuration.update(progressiveEditsClock.elapsed());
				progressiveEditsClock.reset();

				progressiveEditsQueue.queue(async () => {
					// making changes goes into a queue because otherwise the async-progress time will
					// influence the time it takes to receive the changes and progressive typing will
					// become infinitely fast
					await this._makeChanges(editor, data.edits!, data.editsShouldBeInstant
						? undefined
						: { duration: progressiveEditsAvgDuration.value, token: progressiveEditsCts.token }
					);
				});
			}
		});

		const task = this._activeSession.provider.provideResponse(this._activeSession.session, request, progress, requestCts.token);
		let response: ReplyResponse | ErrorResponse | EmptyResponse;

		try {
			this._widget?.updateChatMessage(undefined);
			this._widget?.updateFollowUps(undefined);
			this._widget?.updateProgress(true);
			this._widget?.updateInfo(!this._activeSession.lastExchange ? localize('thinking', "Thinking\u2026") : '');
			this._ctxHasActiveRequest.set(true);

			const reply = await raceCancellationError(Promise.resolve(task), requestCts.token);
			if (progressiveEditsQueue.size > 0) {
				// we must wait for all edits that came in via progress to complete
				await Event.toPromise(progressiveEditsQueue.onDrained);
			}
			await progress.drain();

			if (!reply) {
				response = new EmptyResponse();
			} else {
				const markdownContents = new MarkdownString('', { supportThemeIcons: true, supportHtml: true, isTrusted: false });
				const replyResponse = response = this._instantiationService.createInstance(ReplyResponse, reply, markdownContents, this._activeSession.textModelN.uri, this._activeSession.textModelN.getAlternativeVersionId(), progressEdits, request.requestId);
				for (let i = progressEdits.length; i < replyResponse.allLocalEdits.length; i++) {
					await this._makeChanges(editor, replyResponse.allLocalEdits[i], undefined);
				}
			}
		} catch (e) {
			response = new ErrorResponse(e);
		} finally {
			this._ctxHasActiveRequest.set(false);
			this._widget?.updateProgress(false);
			this._widget?.updateInfo('');
			this._widget?.updateToolbar(true);
		}

		this._ctxHasActiveRequest.set(false);
		this._widget?.updateProgress(false);
		this._widget?.updateInfo('');
		this._widget?.updateToolbar(true);

		this._activeSession.addExchange(new SessionExchange(this._activeSession.lastInput, response));
		this._ctxLastResponseType.set(response instanceof ReplyResponse ? response.raw.type : undefined);
	}

	async cancelCurrentRequest(discard: boolean) {
		if (discard) {
			this._strategy?.cancel();
		}

		if (this._activeSession) {
			this._inlineChatSessionService.releaseSession(this._activeSession);
		}

		this._activeSession = undefined;
	}

	async acceptSession() {
		assertType(this._activeSession);
		assertType(this._strategy);

		const editor = this._getCellEditor();
		assertType(editor);

		try {
			await this._strategy.apply(editor);
		} catch (_err) { }

		this._inlineChatSessionService.releaseSession(this._activeSession);
		this.dismiss(false);
	}

	async dismiss(discard: boolean) {
		this._isVisible = false;
		this._partContainer.style.display = 'none';
		this.cancelCurrentRequest(discard);
		this._ctxCellWidgetFocused.set(false);
		this._ctxVisible.set(false);
		this._ctxLastResponseType.reset();
		this._widget?.reset();
		this._updateHeight();
	}

	async feedbackLast(kind: InlineChatResponseFeedbackKind) {
		if (this._activeSession?.lastExchange && this._activeSession.lastExchange.response instanceof ReplyResponse) {
			this._activeSession.provider.handleInlineChatResponseFeedback?.(this._activeSession.session, this._activeSession.lastExchange.response.raw, kind);
			this._widget?.updateStatus('Thank you for your feedback!', { resetAfter: 1250 });
		}
	}

	private async _makeChanges(editor: IActiveCodeEditor, edits: TextEdit[], opts: ProgressingEditsOptions | undefined) {
		assertType(this._activeSession);
		assertType(this._strategy);

		const moreMinimalEdits = await this._editorWorkerService.computeMoreMinimalEdits(this._activeSession.textModelN.uri, edits);
		// this._log('edits from PROVIDER and after making them MORE MINIMAL', this._activeSession.provider.debugName, edits, moreMinimalEdits);

		if (moreMinimalEdits?.length === 0) {
			// nothing left to do
			return;
		}

		const actualEdits = !opts && moreMinimalEdits ? moreMinimalEdits : edits;
		const editOperations = actualEdits.map(TextEdit.asEditOperation);

		try {
			// this._ignoreModelContentChanged = true;
			this._activeSession.wholeRange.trackEdits(editOperations);
			if (opts) {
				await this._strategy.makeProgressiveChanges(editor, editOperations, opts);
			} else {
				await this._strategy.makeChanges(editor, editOperations);
			}
			// this._ctxDidEdit.set(this._activeSession.hasChangedText);
		} finally {
			// this._ignoreModelContentChanged = false;
		}
	}
}

class EditStrategy {
	private _editCount: number = 0;

	constructor(
		protected readonly _session: Session,
	) {

	}

	async makeProgressiveChanges(editor: IActiveCodeEditor, edits: ISingleEditOperation[], opts: ProgressingEditsOptions): Promise<void> {
		// push undo stop before first edit
		if (++this._editCount === 1) {
			editor.pushUndoStop();
		}

		const durationInSec = opts.duration / 1000;
		for (const edit of edits) {
			const wordCount = countWords(edit.text ?? '');
			const speed = wordCount / durationInSec;
			// console.log({ durationInSec, wordCount, speed: wordCount / durationInSec });
			await performAsyncTextEdit(editor.getModel(), asProgressiveEdit(new WindowIntervalTimer(), edit, speed, opts.token));
		}
	}

	async makeChanges(editor: IActiveCodeEditor, edits: ISingleEditOperation[]): Promise<void> {
		const cursorStateComputerAndInlineDiffCollection: ICursorStateComputer = (undoEdits) => {
			let last: Position | null = null;
			for (const edit of undoEdits) {
				last = !last || last.isBefore(edit.range.getEndPosition()) ? edit.range.getEndPosition() : last;
				// this._inlineDiffDecorations.collectEditOperation(edit);
			}
			return last && [Selection.fromPositions(last)];
		};

		// push undo stop before first edit
		if (++this._editCount === 1) {
			editor.pushUndoStop();
		}
		editor.executeEdits('inline-chat-live', edits, cursorStateComputerAndInlineDiffCollection);
	}

	async apply(editor: IActiveCodeEditor) {
		if (this._editCount > 0) {
			editor.pushUndoStop();
		}
		if (!(this._session.lastExchange?.response instanceof ReplyResponse)) {
			return;
		}
		const { untitledTextModel } = this._session.lastExchange.response;
		if (untitledTextModel && !untitledTextModel.isDisposed() && untitledTextModel.isDirty()) {
			await untitledTextModel.save({ reason: SaveReason.EXPLICIT });
		}
	}

	async cancel() {
		const { textModelN: modelN, textModelNAltVersion, textModelNSnapshotAltVersion } = this._session;
		if (modelN.isDisposed()) {
			return;
		}

		const targetAltVersion = textModelNSnapshotAltVersion ?? textModelNAltVersion;
		while (targetAltVersion < modelN.getAlternativeVersionId() && modelN.canUndo()) {
			modelN.undo();
		}
	}

	createSnapshot(): void {
		if (this._session && !this._session.textModel0.equalsTextBuffer(this._session.textModelN.getTextBuffer())) {
			this._session.createSnapshot();
		}
	}
}
