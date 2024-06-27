/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, IFocusTracker, WindowIntervalTimer, getWindow, scheduleAtNextAnimationFrame, trackFocus } from 'vs/base/browser/dom';
import { CancelablePromise, DeferredPromise, Queue, createCancelablePromise, disposableTimeout } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LRUCache } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { MovingAverage } from 'vs/base/common/numbers';
import { isEqual } from 'vs/base/common/resources';
import { StopWatch } from 'vs/base/common/stopwatch';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { TextEdit } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ICursorStateComputer, ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { IModelService } from 'vs/editor/common/services/model';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatModel, IChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { countWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';
import { ProgressingEditsOptions } from 'vs/workbench/contrib/inlineChat/browser/inlineChatStrategies';
import { InlineChatWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { asProgressiveEdit, performAsyncTextEdit } from 'vs/workbench/contrib/inlineChat/browser/utils';
import { insertCell, runDeleteAction } from 'vs/workbench/contrib/notebook/browser/controller/cellOperations';
import { CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST, CTX_NOTEBOOK_CHAT_OUTER_FOCUS_POSITION, CTX_NOTEBOOK_CHAT_USER_DID_EDIT, MENU_CELL_CHAT_WIDGET_STATUS } from 'vs/workbench/contrib/notebook/browser/controller/chat/notebookChatContext';
import { ICellViewModel, INotebookEditor, INotebookEditorContribution, INotebookViewZone } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

class NotebookChatWidget extends Disposable implements INotebookViewZone {
	set afterModelPosition(afterModelPosition: number) {
		this.notebookViewZone.afterModelPosition = afterModelPosition;
	}

	get afterModelPosition(): number {
		return this.notebookViewZone.afterModelPosition;
	}

	set heightInPx(heightInPx: number) {
		this.notebookViewZone.heightInPx = heightInPx;
	}

	get heightInPx(): number {
		return this.notebookViewZone.heightInPx;
	}

	private _editingCell: ICellViewModel | null = null;

	get editingCell() {
		return this._editingCell;
	}

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		readonly id: string,
		readonly notebookViewZone: INotebookViewZone,
		readonly domNode: HTMLElement,
		readonly widgetContainer: HTMLElement,
		readonly inlineChatWidget: InlineChatWidget,
		readonly parentEditor: CodeEditorWidget,
		private readonly _languageService: ILanguageService,
	) {
		super();

		const updateHeight = () => {
			if (this.heightInPx === inlineChatWidget.contentHeight) {
				return;
			}

			this.heightInPx = inlineChatWidget.contentHeight;
			this._notebookEditor.changeViewZones(accessor => {
				accessor.layoutZone(id);
			});
			this._layoutWidget(inlineChatWidget, widgetContainer);
		};

		this._register(inlineChatWidget.onDidChangeHeight(() => {
			updateHeight();
		}));

		this._register(inlineChatWidget.chatWidget.onDidChangeHeight(() => {
			updateHeight();
		}));

		this.heightInPx = inlineChatWidget.contentHeight;
		this._layoutWidget(inlineChatWidget, widgetContainer);
	}

	layout() {
		this._layoutWidget(this.inlineChatWidget, this.widgetContainer);
	}

	restoreEditingCell(initEditingCell: ICellViewModel) {
		this._editingCell = initEditingCell;

		const decorationIds = this._notebookEditor.deltaCellDecorations([], [{
			handle: this._editingCell.handle,
			options: { className: 'nb-chatGenerationHighlight', outputClassName: 'nb-chatGenerationHighlight' }
		}]);

		this._register(toDisposable(() => {
			this._notebookEditor.deltaCellDecorations(decorationIds, []);
		}));
	}

	hasFocus() {
		return this.inlineChatWidget.hasFocus();
	}

	focus() {
		this.updateNotebookEditorFocusNSelections();
		this.inlineChatWidget.focus();
	}

	updateNotebookEditorFocusNSelections() {
		this._notebookEditor.focusContainer(true);
		this._notebookEditor.setFocus({ start: this.afterModelPosition, end: this.afterModelPosition });
		this._notebookEditor.setSelections([{
			start: this.afterModelPosition,
			end: this.afterModelPosition
		}]);
	}

	getEditingCell() {
		return this._editingCell;
	}

	async getOrCreateEditingCell(): Promise<{ cell: ICellViewModel; editor: IActiveCodeEditor } | undefined> {
		if (this._editingCell) {
			const codeEditor = this._notebookEditor.codeEditors.find(ce => ce[0] === this._editingCell)?.[1];
			if (codeEditor?.hasModel()) {
				return {
					cell: this._editingCell,
					editor: codeEditor
				};
			} else {
				return undefined;
			}
		}

		if (!this._notebookEditor.hasModel()) {
			return undefined;
		}

		const widgetHasFocus = this.inlineChatWidget.hasFocus();

		this._editingCell = insertCell(this._languageService, this._notebookEditor, this.afterModelPosition, CellKind.Code, 'above');

		if (!this._editingCell) {
			return undefined;
		}

		await this._notebookEditor.revealFirstLineIfOutsideViewport(this._editingCell);

		// update decoration
		const decorationIds = this._notebookEditor.deltaCellDecorations([], [{
			handle: this._editingCell.handle,
			options: { className: 'nb-chatGenerationHighlight', outputClassName: 'nb-chatGenerationHighlight' }
		}]);

		this._register(toDisposable(() => {
			this._notebookEditor.deltaCellDecorations(decorationIds, []);
		}));

		if (widgetHasFocus) {
			this.focus();
		}

		const codeEditor = this._notebookEditor.codeEditors.find(ce => ce[0] === this._editingCell)?.[1];
		if (codeEditor?.hasModel()) {
			return {
				cell: this._editingCell,
				editor: codeEditor
			};
		}

		return undefined;
	}

	async discardChange() {
		if (this._notebookEditor.hasModel() && this._editingCell) {
			// remove the cell from the notebook
			runDeleteAction(this._notebookEditor, this._editingCell);
		}
	}

	private _layoutWidget(inlineChatWidget: InlineChatWidget, widgetContainer: HTMLElement) {
		const layoutConfiguration = this._notebookEditor.notebookOptions.getLayoutConfiguration();
		const rightMargin = layoutConfiguration.cellRightMargin;
		const leftMargin = this._notebookEditor.notebookOptions.getCellEditorContainerLeftMargin();
		const maxWidth = 640;
		const width = Math.min(maxWidth, this._notebookEditor.getLayoutInfo().width - leftMargin - rightMargin);

		inlineChatWidget.layout(new Dimension(width, this.heightInPx));
		inlineChatWidget.domNode.style.width = `${width}px`;
		widgetContainer.style.left = `${leftMargin}px`;
	}

	override dispose() {
		this._notebookEditor.changeViewZones(accessor => {
			accessor.removeZone(this.id);
		});
		this.domNode.remove();
		super.dispose();
	}
}

export interface INotebookCellTextModelLike { uri: URI; viewType: string }
class NotebookCellTextModelLikeId {
	static str(k: INotebookCellTextModelLike): string {
		return `${k.viewType}/${k.uri.toString()}`;
	}
	static obj(s: string): INotebookCellTextModelLike {
		const idx = s.indexOf('/');
		return {
			viewType: s.substring(0, idx),
			uri: URI.parse(s.substring(idx + 1))
		};
	}
}

export class NotebookChatController extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.chatController';
	static counter: number = 0;

	public static get(editor: INotebookEditor): NotebookChatController | null {
		return editor.getContribution<NotebookChatController>(NotebookChatController.id);
	}

	// History
	private static _storageKey = 'inline-chat-history';
	private static _promptHistory: string[] = [];
	private _historyOffset: number = -1;
	private _historyCandidate: string = '';
	private _historyUpdate: (prompt: string) => void;
	private _promptCache = new LRUCache<string, string>(1000, 0.7);
	private readonly _onDidChangePromptCache = this._register(new Emitter<{ cell: URI }>());
	readonly onDidChangePromptCache = this._onDidChangePromptCache.event;

	private _strategy: EditStrategy | undefined;
	private _sessionCtor: CancelablePromise<void> | undefined;
	private _warmupRequestCts?: CancellationTokenSource;
	private _activeRequestCts?: CancellationTokenSource;
	private readonly _ctxHasActiveRequest: IContextKey<boolean>;
	private readonly _ctxCellWidgetFocused: IContextKey<boolean>;
	private readonly _ctxUserDidEdit: IContextKey<boolean>;
	private readonly _ctxOuterFocusPosition: IContextKey<'above' | 'below' | ''>;
	private readonly _userEditingDisposables = this._register(new DisposableStore());
	private readonly _widgetDisposableStore = this._register(new DisposableStore());
	private _focusTracker: IFocusTracker | undefined;
	private _widget: NotebookChatWidget | undefined;

	private readonly _model: MutableDisposable<ChatModel> = this._register(new MutableDisposable());
	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@INotebookExecutionStateService private _executionStateService: INotebookExecutionStateService,
		@IStorageService private readonly _storageService: IStorageService,
		@IChatService private readonly _chatService: IChatService
	) {
		super();
		this._ctxHasActiveRequest = CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST.bindTo(this._contextKeyService);
		this._ctxCellWidgetFocused = CTX_NOTEBOOK_CELL_CHAT_FOCUSED.bindTo(this._contextKeyService);
		this._ctxUserDidEdit = CTX_NOTEBOOK_CHAT_USER_DID_EDIT.bindTo(this._contextKeyService);
		this._ctxOuterFocusPosition = CTX_NOTEBOOK_CHAT_OUTER_FOCUS_POSITION.bindTo(this._contextKeyService);

		this._registerFocusTracker();

		NotebookChatController._promptHistory = JSON.parse(this._storageService.get(NotebookChatController._storageKey, StorageScope.PROFILE, '[]'));
		this._historyUpdate = (prompt: string) => {
			const idx = NotebookChatController._promptHistory.indexOf(prompt);
			if (idx >= 0) {
				NotebookChatController._promptHistory.splice(idx, 1);
			}
			NotebookChatController._promptHistory.unshift(prompt);
			this._historyOffset = -1;
			this._historyCandidate = '';
			this._storageService.store(NotebookChatController._storageKey, JSON.stringify(NotebookChatController._promptHistory), StorageScope.PROFILE, StorageTarget.USER);
		};
	}

	private _registerFocusTracker() {
		this._register(this._notebookEditor.onDidChangeFocus(() => {
			if (!this._widget) {
				this._ctxOuterFocusPosition.set('');
				return;
			}

			const widgetIndex = this._widget.afterModelPosition;
			const focus = this._notebookEditor.getFocus().start;

			if (focus + 1 === widgetIndex) {
				this._ctxOuterFocusPosition.set('above');
			} else if (focus === widgetIndex) {
				this._ctxOuterFocusPosition.set('below');
			} else {
				this._ctxOuterFocusPosition.set('');
			}
		}));
	}

	run(index: number, input: string | undefined, autoSend: boolean | undefined): void {
		if (this._widget) {
			if (this._widget.afterModelPosition !== index) {
				const window = getWindow(this._widget.domNode);
				this._disposeWidget();

				scheduleAtNextAnimationFrame(window, () => {
					this._createWidget(index, input, autoSend, undefined);
				});
			}

			return;
		}

		this._createWidget(index, input, autoSend, undefined);
		// TODO: reveal widget to the center if it's out of the viewport
	}

	restore(editingCell: ICellViewModel, input: string) {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		const index = this._notebookEditor.textModel.cells.indexOf(editingCell.model);

		if (index < 0) {
			return;
		}

		if (this._widget) {
			if (this._widget.afterModelPosition !== index) {
				this._disposeWidget();
				const window = getWindow(this._widget.domNode);

				scheduleAtNextAnimationFrame(window, () => {
					this._createWidget(index, input, false, editingCell);
				});
			}

			return;
		}

		this._createWidget(index, input, false, editingCell);
	}

	private _disposeWidget() {
		this._widget?.dispose();
		this._widget = undefined;
		this._widgetDisposableStore.clear();

		this._historyOffset = -1;
		this._historyCandidate = '';
	}


	private _createWidget(index: number, input: string | undefined, autoSend: boolean | undefined, initEditingCell: ICellViewModel | undefined) {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		// Clear the widget if it's already there
		this._widgetDisposableStore.clear();

		const viewZoneContainer = document.createElement('div');
		viewZoneContainer.classList.add('monaco-editor');
		const widgetContainer = document.createElement('div');
		widgetContainer.style.position = 'absolute';
		viewZoneContainer.appendChild(widgetContainer);

		this._focusTracker = this._widgetDisposableStore.add(trackFocus(viewZoneContainer));
		this._widgetDisposableStore.add(this._focusTracker.onDidFocus(() => {
			this._updateNotebookEditorFocusNSelections();
		}));

		const fakeParentEditorElement = document.createElement('div');

		const fakeParentEditor = this._widgetDisposableStore.add(this._instantiationService.createInstance(
			CodeEditorWidget,
			fakeParentEditorElement,
			{
			},
			{ isSimpleWidget: true }
		));

		const inputBoxFragment = `notebook-chat-input-${NotebookChatController.counter++}`;
		const notebookUri = this._notebookEditor.textModel.uri;
		const inputUri = notebookUri.with({ scheme: Schemas.untitled, fragment: inputBoxFragment });
		const result: ITextModel = this._modelService.createModel('', null, inputUri, false);
		fakeParentEditor.setModel(result);

		const inlineChatWidget = this._widgetDisposableStore.add(this._instantiationService.createInstance(
			InlineChatWidget,
			ChatAgentLocation.Notebook,
			{
				statusMenuId: MENU_CELL_CHAT_WIDGET_STATUS,
				chatWidgetViewOptions: {
					rendererOptions: {
						renderTextEditsAsSummary: (uri) => {
							return isEqual(uri, this._widget?.parentEditor.getModel()?.uri)
								|| isEqual(uri, this._notebookEditor.textModel?.uri);
						}
					},
					menus: {
						telemetrySource: 'notebook-generate-cell'
					}
				}
			}
		));
		inlineChatWidget.placeholder = localize('default.placeholder', "Ask a question");
		inlineChatWidget.updateInfo(localize('welcome.1', "AI-generated code may be incorrect"));
		widgetContainer.appendChild(inlineChatWidget.domNode);
		this._widgetDisposableStore.add(inlineChatWidget.onDidChangeInput(() => {
			this._warmupRequestCts?.dispose(true);
			this._warmupRequestCts = undefined;
		}));

		this._notebookEditor.changeViewZones(accessor => {
			const notebookViewZone = {
				afterModelPosition: index,
				heightInPx: 80,
				domNode: viewZoneContainer
			};

			const id = accessor.addZone(notebookViewZone);
			this._scrollWidgetIntoView(index);

			this._widget = new NotebookChatWidget(
				this._notebookEditor,
				id,
				notebookViewZone,
				viewZoneContainer,
				widgetContainer,
				inlineChatWidget,
				fakeParentEditor,
				this._languageService
			);

			if (initEditingCell) {
				this._widget.restoreEditingCell(initEditingCell);
				this._updateUserEditingState();
			}

			this._ctxCellWidgetFocused.set(true);

			disposableTimeout(() => {
				this._focusWidget();
			}, 0, this._store);

			this._sessionCtor = createCancelablePromise<void>(async token => {
				await this._startSession(token);
				assertType(this._model.value);
				const model = this._model.value;
				this._widget?.inlineChatWidget.setChatModel(model);

				if (fakeParentEditor.hasModel()) {

					if (this._widget) {
						this._focusWidget();
					}

					if (this._widget && input) {
						this._widget.inlineChatWidget.value = input;

						if (autoSend) {
							this.acceptInput();
						}
					}
				}
			});
		});
	}

	private async _startSession(token: CancellationToken) {
		if (!this._model.value) {
			this._model.value = this._chatService.startSession(ChatAgentLocation.Editor, token);

			if (!this._model.value) {
				throw new Error('Failed to start chat session');
			}
		}

		this._strategy = new EditStrategy();
	}

	private _scrollWidgetIntoView(index: number) {
		if (index === 0 || this._notebookEditor.getLength() === 0) {
			// the cell is at the beginning of the notebook
			this._notebookEditor.revealOffsetInCenterIfOutsideViewport(0);
		} else {
			// the cell is at the end of the notebook
			const previousCell = this._notebookEditor.cellAt(Math.min(index - 1, this._notebookEditor.getLength() - 1));
			if (previousCell) {
				const cellTop = this._notebookEditor.getAbsoluteTopOfElement(previousCell);
				const cellHeight = this._notebookEditor.getHeightOfElement(previousCell);

				this._notebookEditor.revealOffsetInCenterIfOutsideViewport(cellTop + cellHeight + 48 /** center of the dialog */);
			}
		}
	}

	private _focusWidget() {
		if (!this._widget) {
			return;
		}

		this._updateNotebookEditorFocusNSelections();
		this._widget.focus();
	}

	private _updateNotebookEditorFocusNSelections() {
		if (!this._widget) {
			return;
		}

		this._widget.updateNotebookEditorFocusNSelections();
	}

	hasSession(chatModel: IChatModel) {
		return this._model.value === chatModel;
	}

	getSessionInputUri() {
		return this._widget?.parentEditor.getModel()?.uri;
	}

	async acceptInput() {
		assertType(this._widget);
		await this._sessionCtor;
		assertType(this._model.value);
		assertType(this._strategy);

		const lastInput = this._widget.inlineChatWidget.value;
		this._historyUpdate(lastInput);

		const editor = this._widget.parentEditor;
		const textModel = editor.getModel();

		if (!editor.hasModel() || !textModel) {
			return;
		}

		if (this._widget.editingCell && this._widget.editingCell.textBuffer.getLength() > 0) {
			// it already contains some text, clear it
			const ref = await this._widget.editingCell.resolveTextModel();
			ref.setValue('');
		}

		const editingCellIndex = this._widget.editingCell ? this._notebookEditor.getCellIndex(this._widget.editingCell) : undefined;
		if (editingCellIndex !== undefined) {
			this._notebookEditor.setSelections([{
				start: editingCellIndex,
				end: editingCellIndex + 1
			}]);
		} else {
			// Update selection to the widget index
			this._notebookEditor.setSelections([{
				start: this._widget.afterModelPosition,
				end: this._widget.afterModelPosition
			}]);
		}

		this._ctxHasActiveRequest.set(true);

		this._activeRequestCts?.cancel();
		this._activeRequestCts = new CancellationTokenSource();

		const store = new DisposableStore();

		try {
			this._ctxHasActiveRequest.set(true);

			const progressiveEditsQueue = new Queue();
			const progressiveEditsClock = StopWatch.create();
			const progressiveEditsAvgDuration = new MovingAverage();
			const progressiveEditsCts = new CancellationTokenSource(this._activeRequestCts.token);

			const responsePromise = new DeferredPromise<void>();
			const response = await this._widget.inlineChatWidget.chatWidget.acceptInput();
			if (response) {
				let lastLength = 0;

				store.add(response.onDidChange(e => {
					if (response.isCanceled) {
						progressiveEditsCts.cancel();
						responsePromise.complete();
						return;
					}

					if (response.isComplete) {
						responsePromise.complete();
						return;
					}

					const edits = response.response.value.map(part => {
						if (part.kind === 'textEditGroup'
							// && isEqual(part.uri, this._session?.textModelN.uri)
						) {
							return part.edits;
						} else {
							return [];
						}
					}).flat();

					const newEdits = edits.slice(lastLength);
					// console.log('NEW edits', newEdits, edits);
					if (newEdits.length === 0) {
						return; // NO change
					}
					lastLength = edits.length;
					progressiveEditsAvgDuration.update(progressiveEditsClock.elapsed());
					progressiveEditsClock.reset();

					progressiveEditsQueue.queue(async () => {
						for (const edits of newEdits) {
							await this._makeChanges(edits, {
								duration: progressiveEditsAvgDuration.value,
								token: progressiveEditsCts.token
							});
						}
					});
				}));
			}

			await responsePromise.p;
			await progressiveEditsQueue.whenIdle();

			this._userEditingDisposables.clear();
			// monitor user edits
			const editingCell = this._widget.getEditingCell();
			if (editingCell) {
				this._userEditingDisposables.add(editingCell.model.onDidChangeContent(() => this._updateUserEditingState()));
				this._userEditingDisposables.add(editingCell.model.onDidChangeLanguage(() => this._updateUserEditingState()));
				this._userEditingDisposables.add(editingCell.model.onDidChangeMetadata(() => this._updateUserEditingState()));
				this._userEditingDisposables.add(editingCell.model.onDidChangeInternalMetadata(() => this._updateUserEditingState()));
				this._userEditingDisposables.add(editingCell.model.onDidChangeOutputs(() => this._updateUserEditingState()));
				this._userEditingDisposables.add(this._executionStateService.onDidChangeExecution(e => {
					if (e.type === NotebookExecutionType.cell && e.affectsCell(editingCell.uri)) {
						this._updateUserEditingState();
					}
				}));
			}
		} catch (e) {
		} finally {
			store.dispose();

			this._ctxHasActiveRequest.set(false);
			this._widget.inlineChatWidget.updateProgress(false);
			this._widget.inlineChatWidget.updateInfo('');
			this._widget.inlineChatWidget.updateToolbar(true);
		}
	}

	private async _makeChanges(edits: TextEdit[], opts: ProgressingEditsOptions | undefined) {
		assertType(this._strategy);
		assertType(this._widget);

		const editingCell = await this._widget.getOrCreateEditingCell();

		if (!editingCell) {
			return;
		}

		const editor = editingCell.editor;

		const moreMinimalEdits = await this._editorWorkerService.computeMoreMinimalEdits(editor.getModel().uri, edits);
		// this._log('edits from PROVIDER and after making them MORE MINIMAL', this._activeSession.provider.debugName, edits, moreMinimalEdits);

		if (moreMinimalEdits?.length === 0) {
			// nothing left to do
			return;
		}

		const actualEdits = !opts && moreMinimalEdits ? moreMinimalEdits : edits;
		const editOperations = actualEdits.map(TextEdit.asEditOperation);

		try {
			if (opts) {
				await this._strategy.makeProgressiveChanges(editor, editOperations, opts);
			} else {
				await this._strategy.makeChanges(editor, editOperations);
			}
		} finally {
		}
	}

	private _updateUserEditingState() {
		this._ctxUserDidEdit.set(true);
	}

	async acceptSession() {
		assertType(this._model);
		assertType(this._strategy);

		const editor = this._widget?.parentEditor;
		if (!editor?.hasModel()) {
			return;
		}

		const editingCell = this._widget?.getEditingCell();

		if (editingCell && this._notebookEditor.hasModel()) {
			const cellId = NotebookCellTextModelLikeId.str({ uri: editingCell.uri, viewType: this._notebookEditor.textModel.viewType });
			if (this._widget?.inlineChatWidget.value) {
				this._promptCache.set(cellId, this._widget.inlineChatWidget.value);
			}
			this._onDidChangePromptCache.fire({ cell: editingCell.uri });
		}

		try {
			this._model.clear();
		} catch (_err) { }

		this.dismiss(false);
	}

	async focusAbove() {
		if (!this._widget) {
			return;
		}

		const index = this._widget.afterModelPosition;
		const prev = index - 1;
		if (prev < 0) {
			return;
		}

		const cell = this._notebookEditor.cellAt(prev);
		if (!cell) {
			return;
		}

		await this._notebookEditor.focusNotebookCell(cell, 'editor');
	}

	async focusNext() {
		if (!this._widget) {
			return;
		}

		const index = this._widget.afterModelPosition;
		const cell = this._notebookEditor.cellAt(index);
		if (!cell) {
			return;
		}

		await this._notebookEditor.focusNotebookCell(cell, 'editor');
	}

	hasFocus() {
		return this._widget?.hasFocus() ?? false;
	}

	focus() {
		this._focusWidget();
	}

	focusNearestWidget(index: number, direction: 'above' | 'below') {
		switch (direction) {
			case 'above':
				if (this._widget?.afterModelPosition === index) {
					this._focusWidget();
				}
				break;
			case 'below':
				if (this._widget?.afterModelPosition === index + 1) {
					this._focusWidget();
				}
				break;
			default:
				break;
		}
	}

	populateHistory(up: boolean) {
		if (!this._widget) {
			return;
		}

		const len = NotebookChatController._promptHistory.length;
		if (len === 0) {
			return;
		}

		if (this._historyOffset === -1) {
			// remember the current value
			this._historyCandidate = this._widget.inlineChatWidget.value;
		}

		const newIdx = this._historyOffset + (up ? 1 : -1);
		if (newIdx >= len) {
			// reached the end
			return;
		}

		let entry: string;
		if (newIdx < 0) {
			entry = this._historyCandidate;
			this._historyOffset = -1;
		} else {
			entry = NotebookChatController._promptHistory[newIdx];
			this._historyOffset = newIdx;
		}

		this._widget.inlineChatWidget.value = entry;
		this._widget.inlineChatWidget.selectAll();
	}

	async cancelCurrentRequest(discard: boolean) {
		this._activeRequestCts?.cancel();
	}

	getEditingCell() {
		return this._widget?.getEditingCell();
	}

	discard() {
		this._activeRequestCts?.cancel();
		this._widget?.discardChange();
		this.dismiss(true);
	}

	dismiss(discard: boolean) {
		const widget = this._widget;
		const widgetIndex = widget?.afterModelPosition;
		const currentFocus = this._notebookEditor.getFocus();
		const isWidgetFocused = currentFocus.start === widgetIndex && currentFocus.end === widgetIndex;

		if (widget && isWidgetFocused) {
			// change focus only when the widget is focused
			const editingCell = widget.getEditingCell();
			const shouldFocusEditingCell = editingCell && !discard;
			const shouldFocusTopCell = widgetIndex === 0 && this._notebookEditor.getLength() > 0;
			const shouldFocusAboveCell = widgetIndex !== 0 && this._notebookEditor.cellAt(widgetIndex - 1);

			if (shouldFocusEditingCell) {
				this._notebookEditor.focusNotebookCell(editingCell, 'container');
			} else if (shouldFocusTopCell) {
				this._notebookEditor.focusNotebookCell(this._notebookEditor.cellAt(0)!, 'container');
			} else if (shouldFocusAboveCell) {
				this._notebookEditor.focusNotebookCell(this._notebookEditor.cellAt(widgetIndex - 1)!, 'container');
			}
		}

		this._ctxCellWidgetFocused.set(false);
		this._ctxUserDidEdit.set(false);
		this._sessionCtor?.cancel();
		this._sessionCtor = undefined;
		this._model.clear();
		this._widget?.dispose();
		this._widget = undefined;
		this._widgetDisposableStore.clear();
	}

	// check if a cell is generated by prompt by checking prompt cache
	isCellGeneratedByChat(cell: ICellViewModel) {
		if (!this._notebookEditor.hasModel()) {
			// no model attached yet
			return false;
		}

		const cellId = NotebookCellTextModelLikeId.str({ uri: cell.uri, viewType: this._notebookEditor.textModel.viewType });
		return this._promptCache.has(cellId);
	}

	// get prompt from cache
	getPromptFromCache(cell: ICellViewModel) {
		if (!this._notebookEditor.hasModel()) {
			// no model attached yet
			return undefined;
		}

		const cellId = NotebookCellTextModelLikeId.str({ uri: cell.uri, viewType: this._notebookEditor.textModel.viewType });
		return this._promptCache.get(cellId);
	}
	public override dispose(): void {
		this.dismiss(false);
		super.dispose();
	}
}

export class EditStrategy {
	private _editCount: number = 0;

	constructor() {
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
}


registerNotebookContribution(NotebookChatController.id, NotebookChatController);
