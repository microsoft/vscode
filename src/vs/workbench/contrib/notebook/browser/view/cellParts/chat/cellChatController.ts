/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, Queue, createCancelablePromise, raceCancellationError } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { MovingAverage } from 'vs/base/common/numbers';
import { StopWatch } from 'vs/base/common/stopwatch';
import { assertType } from 'vs/base/common/types';
import { generateUuid } from 'vs/base/common/uuid';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { TextEdit } from 'vs/editor/common/languages';
import { ICursorStateComputer } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { localize } from 'vs/nls';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { AsyncProgress } from 'vs/platform/progress/common/progress';
import { countWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { IInlineChatSessionService, ReplyResponse, Session, SessionPrompt } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { ProgressingEditsOptions, asProgressiveEdit, performAsyncTextEdit } from 'vs/workbench/contrib/inlineChat/browser/inlineChatStrategies';
import { CTX_INLINE_CHAT_HAS_PROVIDER, EditMode, IInlineChatProgressItem, IInlineChatRequest } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { CELL_TITLE_CELL_GROUP_ID, INotebookCellActionContext, NotebookCellAction } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { insertNewCell } from 'vs/workbench/contrib/notebook/browser/controller/insertCellActions';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CellChatWidget, MENU_NOTEBOOK_CELL_CHAT_WIDGET } from 'vs/workbench/contrib/notebook/browser/view/cellParts/chat/cellChatWidget';
import { CellKind, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NOTEBOOK_EDITOR_EDITABLE } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';

const CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST = new RawContextKey<boolean>('notebookChatHasActiveRequest', false, localize('notebookChatHasActiveRequest', "Whether the cell chat editor has an active request"));

interface ICellChatPart {
	activeCell: ICellViewModel | undefined;
	getWidget(): CellChatWidget;
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
	private _strategy: EditStrategy = new EditStrategy();

	private _inlineChatListener: IDisposable | undefined;

	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		private readonly _chatPart: ICellChatPart,
		private readonly _cell: ICellViewModel,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInlineChatSessionService private readonly _inlineChatSessionService: IInlineChatSessionService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) {
		super();

		NotebookCellChatController._cellChatControllers.set(this._cell, this);
		this._ctxHasActiveRequest = CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST.bindTo(this._contextKeyService);

		this._register(this._cell.onDidChangeEditorAttachState(() => {
			const editor = this._getCellEditor();
			this._inlineChatListener?.dispose();

			if (!editor) {
				return;
			}

			const inlineChatController = InlineChatController.get(editor);
			if (inlineChatController) {
				this._inlineChatListener = inlineChatController.onWillStartSession(() => {
					this.dismiss();
				});
			}
		}));
	}

	public override dispose(): void {
		if (this._isVisible) {
			// detach the chat widget
			this._chatPart.getWidget().hide();
			this._sessionCtor?.cancel();
			this._sessionCtor = undefined;
		}

		this._inlineChatListener?.dispose();
		this._inlineChatListener = undefined;
		this._ctxHasActiveRequest.reset();
		NotebookCellChatController._cellChatControllers.delete(this._cell);
		super.dispose();
	}

	layout() {
		if (this._isVisible) {
			this._chatPart.getWidget().layout();
		}
	}

	async show() {
		this._isVisible = true;
		this._chatPart.getWidget().show(this._cell);
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

			this._chatPart.getWidget().placeholder = this._activeSession?.session.placeholder ?? localize('default.placeholder', "Ask a question");
		});
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

		this._activeSession = session;
	}

	async acceptInput() {
		assertType(this._activeSession);
		this._activeSession.addInput(new SessionPrompt(this._getInput()));

		assertType(this._activeSession.lastInput);

		const value = this._activeSession.lastInput.value;
		const editors = this._notebookEditor.codeEditors.find(editor => editor[0] === this._chatPart.activeCell);
		if (!editors || !editors[1].hasModel()) {
			return;
		}

		const editor = editors[1];

		this._ctxHasActiveRequest.set(true);
		this._chatPart.getWidget().updateProgress(true);

		const request: IInlineChatRequest = {
			requestId: generateUuid(),
			prompt: value,
			attempt: 0,
			selection: { selectionStartLineNumber: 1, selectionStartColumn: 1, positionLineNumber: 1, positionColumn: 1 },
			wholeRange: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
			live: true
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
		const reply = await raceCancellationError(Promise.resolve(task), requestCts.token);

		if (progressiveEditsQueue.size > 0) {
			// we must wait for all edits that came in via progress to complete
			await Event.toPromise(progressiveEditsQueue.onDrained);
		}
		await progress.drain();

		if (!reply) {
			this._ctxHasActiveRequest.set(false);
			this._chatPart.getWidget().updateProgress(false);
			return;
		}

		const markdownContents = new MarkdownString('', { supportThemeIcons: true, supportHtml: true, isTrusted: false });
		const replyResponse = this._instaService.createInstance(ReplyResponse, reply, markdownContents, this._activeSession.textModelN.uri, this._activeSession.textModelN.getAlternativeVersionId(), progressEdits);
		for (let i = progressEdits.length; i < replyResponse.allLocalEdits.length; i++) {
			await this._makeChanges(editor, replyResponse.allLocalEdits[i], undefined);
		}
		this._ctxHasActiveRequest.set(false);
		this._chatPart.getWidget().updateProgress(false);
	}

	async cancelCurrentRequest() {
		if (this._activeSession) {
			this._inlineChatSessionService.releaseSession(this._activeSession);
		}

		this._activeSession = undefined;
	}

	async dismiss() {
		this._isVisible = false;
		this.cancelCurrentRequest();
		this._chatPart.getWidget().hide();
	}

	private _getInput() {
		return this._chatPart.getWidget().getInput();
	}

	private async _makeChanges(editor: IActiveCodeEditor, edits: TextEdit[], opts: ProgressingEditsOptions | undefined) {
		assertType(this._activeSession);

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
			await performAsyncTextEdit(editor.getModel(), asProgressiveEdit(edit, speed, opts.token));
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
}

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.start',
				title: {
					value: localize('notebook.cell.chat.start', "Start Chat"),
					original: 'Start Chat'
				},
				icon: Codicon.sparkle,
				menu: {
					id: MenuId.NotebookCellTitle,
					group: CELL_TITLE_CELL_GROUP_ID,
					order: 0,
					when: ContextKeyExpr.and(CTX_INLINE_CHAT_HAS_PROVIDER, EditorContextKeys.writable, ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true))
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const ctrl = NotebookCellChatController.get(context.cell);
		if (!ctrl) {
			return;
		}

		await ctrl.show();
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.accept',
				title: {
					value: localize('notebook.cell.chat.accept', "Make Request"),
					original: 'Make Request'
				},
				icon: Codicon.send,
				keybinding: {
					when: CTX_NOTEBOOK_CELL_CHAT_FOCUSED,
					weight: KeybindingWeight.EditorCore + 7,
					primary: KeyCode.Enter
				},
				menu: {
					id: MENU_NOTEBOOK_CELL_CHAT_WIDGET,
					group: 'main',
					order: 1,
					when: CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST.negate()
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const ctrl = NotebookCellChatController.get(context.cell);
		if (!ctrl) {
			return;
		}

		ctrl.acceptInput();
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.stop',
				title: {
					value: localize('notebook.cell.chat.stop', "Stop Request"),
					original: 'Make Request'
				},
				icon: Codicon.debugStop,
				menu: {
					id: MENU_NOTEBOOK_CELL_CHAT_WIDGET,
					group: 'main',
					order: 1,
					when: CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const ctrl = NotebookCellChatController.get(context.cell);
		if (!ctrl) {
			return;
		}

		ctrl.cancelCurrentRequest();
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.chat.close',
				title: {
					value: localize('notebook.cell.chat.close', "Close Chat"),
					original: 'Close Chat'
				},
				icon: Codicon.close,
				menu: {
					id: MENU_NOTEBOOK_CELL_CHAT_WIDGET,
					group: 'main',
					order: 2
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const ctrl = NotebookCellChatController.get(context.cell);
		if (!ctrl) {
			return;
		}

		ctrl.dismiss();
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.insertCodeCellWithChat',
				title: {
					value: '$(sparkle) ' + localize('notebookActions.menu.insertCodeCellWithChat', "Generate"),
					original: '$(sparkle) Generate',
				},
				tooltip: localize('notebookActions.menu.insertCodeCellWithChat.tooltip', "Generate Code Cell with Chat"),
				menu: [
					{
						id: MenuId.NotebookCellBetween,
						group: 'inline',
						order: -1,
						when: ContextKeyExpr.and(
							NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
							CTX_INLINE_CHAT_HAS_PROVIDER,
							ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true)
						)
					},
					{
						id: MenuId.NotebookCellListTop,
						group: 'inline',
						order: -1,
						when: ContextKeyExpr.and(
							NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
							CTX_INLINE_CHAT_HAS_PROVIDER,
							ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true)
						)
					},
				]
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const newCell = await insertNewCell(accessor, context, CellKind.Code, 'below', true);

		if (!newCell) {
			return;
		}
		await context.notebookEditor.focusNotebookCell(newCell, 'container');
		const ctrl = NotebookCellChatController.get(newCell);
		if (!ctrl) {
			return;
		}
		ctrl.show();
	}
});
