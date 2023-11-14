/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension, addDisposableListener, append, getTotalWidth, h } from 'vs/base/browser/dom';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { Queue, raceCancellationError } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable } from 'vs/base/common/lifecycle';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { MovingAverage } from 'vs/base/common/numbers';
import { StopWatch } from 'vs/base/common/stopwatch';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { TextEdit } from 'vs/editor/common/languages';
import { ICursorStateComputer, ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { IModelService } from 'vs/editor/common/services/model';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { localize } from 'vs/nls';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { AsyncProgress } from 'vs/platform/progress/common/progress';
import { countWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';
import { IInlineChatSessionService, ReplyResponse, Session, SessionPrompt } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { ProgressingEditsOptions, asProgressiveEdit, performAsyncTextEdit } from 'vs/workbench/contrib/inlineChat/browser/inlineChatStrategies';
import { _inputEditorOptions } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { CTX_INLINE_CHAT_HAS_PROVIDER, EditMode, IInlineChatProgressItem, IInlineChatRequest } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { CELL_TITLE_CELL_GROUP_ID, INotebookCellActionContext, NotebookCellAction } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { CellFocusMode, ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellContentPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';

const CTX_NOTEBOOK_CELL_CHAT_FOCUSED = new RawContextKey<boolean>('notebookCellChatFocused', false, localize('notebookCellChatFocused', "Whether the cell chat editor is focused"));
const CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST = new RawContextKey<boolean>('notebookChatHasActiveRequest', false, localize('notebookChatHasActiveRequest', "Whether the cell chat editor has an active request"));
export const MENU_NOTEBOOK_CELL_CHAT_WIDGET = MenuId.for('notebookCellChatWidget');

export class CellChatPart extends CellContentPart {
	private readonly _elements = h(
		'div.cell-chat-container@root',
		[
			h('div.body', [
				h('div.content@content', [
					h('div.input@input', [
						h('div.editor-placeholder@placeholder'),
						h('div.editor-container@editor'),
					]),
					h('div.toolbar@editorToolbar'),
				]),
			]),
			h('div.progress@progress'),
			h('div.status@status')
		]
	);

	private _controller: NotebookCellChatController | undefined;

	get activeCell() {
		return this.currentCell;
	}

	private _widget: Lazy<CellChatWidget>;

	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		partContainer: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._widget = new Lazy(() => this._instantiationService.createInstance(CellChatWidget, this._notebookEditor, partContainer));
	}

	getWidget() {
		return this._widget.value;
	}

	override didRenderCell(element: ICellViewModel): void {
		this._controller?.dispose();
		this._controller = this._instantiationService.createInstance(NotebookCellChatController, this._notebookEditor, this, element);

		super.didRenderCell(element);
	}

	override unrenderCell(element: ICellViewModel): void {
		this._controller?.dispose();
		this._controller = undefined;
		super.unrenderCell(element);
	}

	override updateInternalLayoutNow(element: ICellViewModel): void {
		this._elements.root.style.width = `${element.layoutInfo.editorWidth}px`;
		this._controller?.layout();
	}

	override dispose() {
		super.dispose();
	}
}

class CellChatWidget extends Disposable {
	private static _modelPool: number = 1;

	private readonly _elements = h(
		'div.cell-chat-container@root',
		[
			h('div.body', [
				h('div.content@content', [
					h('div.input@input', [
						h('div.editor-placeholder@placeholder'),
						h('div.editor-container@editor'),
					]),
					h('div.toolbar@editorToolbar'),
				]),
			]),
			h('div.progress@progress'),
			h('div.status@status')
		]
	);
	private readonly _progressBar: ProgressBar;
	private readonly _toolbar: MenuWorkbenchToolBar;

	private readonly _inputEditor: IActiveCodeEditor;
	private readonly _inputModel: ITextModel;
	private readonly _ctxInputEditorFocused: IContextKey<boolean>;

	private _activeCell: ICellViewModel | undefined;

	set placeholder(value: string) {
		this._elements.placeholder.innerText = value;
	}


	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		_partContainer: HTMLElement,
		@IModelService private readonly _modelService: IModelService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();
		append(_partContainer, this._elements.root);
		this._elements.input.style.height = '24px';

		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				SnippetController2.ID,
				SuggestController.ID
			])
		};

		this._inputEditor = <IActiveCodeEditor>this._instantiationService.createInstance(CodeEditorWidget, this._elements.editor, {
			..._inputEditorOptions,
			ariaLabel: localize('cell-chat-aria-label', "Cell Chat Input"),
		}, codeEditorWidgetOptions);
		this._register(this._inputEditor);
		const uri = URI.from({ scheme: 'vscode', authority: 'inline-chat', path: `/notebook-cell-chat/model${CellChatWidget._modelPool++}.txt` });
		this._inputModel = this._register(this._modelService.getModel(uri) ?? this._modelService.createModel('', null, uri));
		this._inputEditor.setModel(this._inputModel);

		// placeholder
		this._elements.placeholder.style.fontSize = `${this._inputEditor.getOption(EditorOption.fontSize)}px`;
		this._elements.placeholder.style.lineHeight = `${this._inputEditor.getOption(EditorOption.lineHeight)}px`;
		this._register(addDisposableListener(this._elements.placeholder, 'click', () => this._inputEditor.focus()));

		const togglePlaceholder = () => {
			const hasText = this._inputModel.getValueLength() > 0;
			this._elements.placeholder.classList.toggle('hidden', hasText);
		};
		this._store.add(this._inputModel.onDidChangeContent(togglePlaceholder));
		togglePlaceholder();

		// toolbar
		this._toolbar = this._register(this._instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.editorToolbar, MENU_NOTEBOOK_CELL_CHAT_WIDGET, {
			telemetrySource: 'interactiveEditorWidget-toolbar',
			toolbarOptions: { primaryGroup: 'main' }
		}));

		// Create chat response div
		const copilotGeneratedCodeSpan = $('span.copilot-generated-code', {}, 'Copilot generated code may be incorrect');
		this._elements.status.appendChild(copilotGeneratedCodeSpan);

		this._register(this._inputEditor.onDidFocusEditorWidget(() => {
			if (this._activeCell) {
				this._activeCell.focusMode = CellFocusMode.ChatInput;
			}
		}));

		this._ctxInputEditorFocused = CTX_NOTEBOOK_CELL_CHAT_FOCUSED.bindTo(this._contextKeyService);
		this._register(this._inputEditor.onDidFocusEditorWidget(() => {
			this._ctxInputEditorFocused.set(true);
		}));
		this._register(this._inputEditor.onDidBlurEditorWidget(() => {
			this._ctxInputEditorFocused.set(false);
		}));

		this._progressBar = new ProgressBar(this._elements.progress);
		this._register(this._progressBar);
	}

	show(element: ICellViewModel) {
		this._elements.root.style.display = 'block';

		this._activeCell = element;

		this._toolbar.context = <INotebookCellActionContext>{
			ui: true,
			cell: element,
			notebookEditor: this._notebookEditor,
			$mid: MarshalledId.NotebookCellActionContext
		};

		this.layout();
		this._inputEditor.focus();
		this._activeCell.chatHeight = 62;
	}

	hide() {
		this._elements.root.style.display = 'none';
		if (this._activeCell) {
			this._activeCell.chatHeight = 0;
		}
	}

	getInput() {
		return this._inputEditor.getValue();
	}

	updateProgress(show: boolean) {
		if (show) {
			this._progressBar.infinite();
		} else {
			this._progressBar.stop();
		}
	}

	layout() {
		if (this._activeCell) {
			const innerEditorWidth = this._activeCell.layoutInfo.editorWidth - (getTotalWidth(this._elements.editorToolbar) + 8 /* L/R-padding */);
			this._inputEditor.layout(new Dimension(innerEditorWidth, this._inputEditor.getContentHeight()));
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

class NotebookCellChatController extends Disposable {
	private static _cellChatControllers = new WeakMap<ICellViewModel, NotebookCellChatController>();

	static get(cell: ICellViewModel): NotebookCellChatController | undefined {
		return NotebookCellChatController._cellChatControllers.get(cell);
	}

	private _activeSession?: Session;
	private readonly _ctxHasActiveRequest: IContextKey<boolean>;
	private _isVisible: boolean = false;
	private _strategy: EditStrategy = new EditStrategy();

	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		private readonly _chatPart: CellChatPart,
		private readonly _cell: ICellViewModel,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInlineChatSessionService private readonly _inlineChatSessionService: IInlineChatSessionService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
	) {
		super();

		NotebookCellChatController._cellChatControllers.set(this._cell, this);
		this._ctxHasActiveRequest = CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST.bindTo(this._contextKeyService);
	}

	public override dispose(): void {
		this._ctxHasActiveRequest.reset();
		NotebookCellChatController._cellChatControllers.delete(this._cell);
		super.dispose();
	}

	layout() {
		if (this._isVisible) {
			this._chatPart.getWidget().layout();
		}
	}

	async startSession() {
		this._isVisible = true;
		if (this._activeSession) {
			this._inlineChatSessionService.releaseSession(this._activeSession);
		}

		const editors = this._notebookEditor.codeEditors.find(editor => editor[0] === this._chatPart.activeCell);
		if (!editors || !editors[1].hasModel()) {
			return;
		}

		this._chatPart.getWidget().show(this._cell);
		this._activeSession = await this._createSession(editors[1]);
		this._chatPart.getWidget().placeholder = this._activeSession?.session.placeholder ?? localize('default.placeholder', "Ask a question");
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
		const replyResponse = new ReplyResponse(reply, markdownContents, this._activeSession.textModelN.uri, this._activeSession.textModelN.getAlternativeVersionId(), progressEdits);
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

	private async _createSession(editor: IActiveCodeEditor) {
		const createSessionCts = new CancellationTokenSource();
		const session = await this._inlineChatSessionService.createSession(
			editor,
			{ editMode: EditMode.LivePreview },
			createSessionCts.token
		);

		createSessionCts.dispose();

		return session;
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

		ctrl.startSession();
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
