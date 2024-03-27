/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, IFocusTracker, WindowIntervalTimer, getWindow, scheduleAtNextAnimationFrame, trackFocus } from 'vs/base/browser/dom';
import { CancelablePromise, Queue, createCancelablePromise, disposableTimeout, raceCancellationError } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { LRUCache } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { MovingAverage } from 'vs/base/common/numbers';
import { StopWatch } from 'vs/base/common/stopwatch';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
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
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AsyncProgress } from 'vs/platform/progress/common/progress';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { SaveReason } from 'vs/workbench/common/editor';
import { GeneratingPhrase } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';
import { countWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';
import { IInlineChatSavingService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSavingService';
import { EmptyResponse, ErrorResponse, ReplyResponse, Session, SessionExchange, SessionPrompt } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { IInlineChatSessionService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionService';
import { ProgressingEditsOptions } from 'vs/workbench/contrib/inlineChat/browser/inlineChatStrategies';
import { IInlineChatMessageAppender, InlineChatWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { asProgressiveEdit, performAsyncTextEdit } from 'vs/workbench/contrib/inlineChat/browser/utils';
import { CTX_INLINE_CHAT_LAST_RESPONSE_TYPE, EditMode, IInlineChatProgressItem, IInlineChatRequest, InlineChatResponseFeedbackKind, InlineChatResponseType } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { insertCell, runDeleteAction } from 'vs/workbench/contrib/notebook/browser/controller/cellOperations';
import { CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST, CTX_NOTEBOOK_CHAT_OUTER_FOCUS_POSITION, CTX_NOTEBOOK_CHAT_USER_DID_EDIT, MENU_CELL_CHAT_INPUT, MENU_CELL_CHAT_WIDGET, MENU_CELL_CHAT_WIDGET_FEEDBACK, MENU_CELL_CHAT_WIDGET_STATUS } from 'vs/workbench/contrib/notebook/browser/controller/chat/notebookChatContext';
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

		this._register(inlineChatWidget.onDidChangeHeight(() => {
			this.heightInPx = inlineChatWidget.contentHeight;
			this._notebookEditor.changeViewZones(accessor => {
				accessor.layoutZone(id);
			});
			this._layoutWidget(inlineChatWidget, widgetContainer);
		}));

		this._layoutWidget(inlineChatWidget, widgetContainer);
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
	private _activeSession?: Session;
	private _warmupRequestCts?: CancellationTokenSource;
	private _activeRequestCts?: CancellationTokenSource;
	private readonly _ctxHasActiveRequest: IContextKey<boolean>;
	private readonly _ctxCellWidgetFocused: IContextKey<boolean>;
	private readonly _ctxUserDidEdit: IContextKey<boolean>;
	private readonly _ctxOuterFocusPosition: IContextKey<'above' | 'below' | ''>;
	private readonly _userEditingDisposables = this._register(new DisposableStore());
	private readonly _ctxLastResponseType: IContextKey<undefined | InlineChatResponseType>;
	private _widget: NotebookChatWidget | undefined;
	private _widgetDisposableStore = this._register(new DisposableStore());
	private _focusTracker: IFocusTracker | undefined;
	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IInlineChatSessionService private readonly _inlineChatSessionService: IInlineChatSessionService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ICommandService private readonly _commandService: ICommandService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IInlineChatSavingService private readonly _inlineChatSavingService: IInlineChatSavingService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@INotebookExecutionStateService private _executionStateService: INotebookExecutionStateService,
		@IStorageService private readonly _storageService: IStorageService,

	) {
		super();
		this._ctxHasActiveRequest = CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST.bindTo(this._contextKeyService);
		this._ctxCellWidgetFocused = CTX_NOTEBOOK_CELL_CHAT_FOCUSED.bindTo(this._contextKeyService);
		this._ctxLastResponseType = CTX_INLINE_CHAT_LAST_RESPONSE_TYPE.bindTo(this._contextKeyService);
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
				telemetrySource: 'notebook-generate-cell',
				inputMenuId: MENU_CELL_CHAT_INPUT,
				widgetMenuId: MENU_CELL_CHAT_WIDGET,
				statusMenuId: MENU_CELL_CHAT_WIDGET_STATUS,
				feedbackMenuId: MENU_CELL_CHAT_WIDGET_FEEDBACK
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

				if (fakeParentEditor.hasModel()) {
					await this._startSession(fakeParentEditor, token);
					this._warmupRequestCts = new CancellationTokenSource();
					this._startInitialFolowups(fakeParentEditor, this._warmupRequestCts.token);

					if (this._widget) {
						this._widget.inlineChatWidget.placeholder = this._activeSession?.session.placeholder ?? localize('default.placeholder', "Ask a question");
						this._widget.inlineChatWidget.updateInfo(this._activeSession?.session.message ?? localize('welcome.1', "AI-generated code may be incorrect"));
						this._widget.inlineChatWidget.updateSlashCommands(this._activeSession?.session.slashCommands ?? []);
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

	async acceptInput() {
		assertType(this._widget);
		await this._sessionCtor;
		assertType(this._activeSession);
		this._warmupRequestCts?.dispose(true);
		this._warmupRequestCts = undefined;
		this._activeSession.addInput(new SessionPrompt(this._widget.inlineChatWidget.value, 0, true));

		assertType(this._activeSession.lastInput);
		const value = this._activeSession.lastInput.value;

		this._historyUpdate(value);

		const editor = this._widget.parentEditor;
		const model = editor.getModel();

		if (!editor.hasModel() || !model) {
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
		this._widget.inlineChatWidget.updateSlashCommands(this._activeSession.session.slashCommands ?? []);
		this._widget?.inlineChatWidget.updateProgress(true);

		const request: IInlineChatRequest = {
			requestId: generateUuid(),
			prompt: value,
			attempt: this._activeSession.lastInput.attempt,
			selection: { selectionStartLineNumber: 1, selectionStartColumn: 1, positionLineNumber: 1, positionColumn: 1 },
			wholeRange: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
			live: true,
			previewDocument: model.uri,
			withIntentDetection: true, // TODO: don't hard code but allow in corresponding UI to run without intent detection?
		};

		//TODO: update progress in a newly inserted cell below the widget instead of the fake editor

		this._activeRequestCts?.cancel();
		this._activeRequestCts = new CancellationTokenSource();
		const progressEdits: TextEdit[][] = [];

		const progressiveEditsQueue = new Queue();
		const progressiveEditsClock = StopWatch.create();
		const progressiveEditsAvgDuration = new MovingAverage();
		const progressiveEditsCts = new CancellationTokenSource(this._activeRequestCts.token);
		let progressiveChatResponse: IInlineChatMessageAppender | undefined;
		const progress = new AsyncProgress<IInlineChatProgressItem>(async data => {
			// console.log('received chunk', data, request);

			if (this._activeRequestCts?.token.isCancellationRequested) {
				return;
			}

			if (data.message) {
				this._widget?.inlineChatWidget.updateToolbar(false);
				this._widget?.inlineChatWidget.updateInfo(data.message);
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
					await this._makeChanges(data.edits!, data.editsShouldBeInstant
						? undefined
						: { duration: progressiveEditsAvgDuration.value, token: progressiveEditsCts.token }
					);
				});
			}

			if (data.markdownFragment) {
				if (!progressiveChatResponse) {
					const message = {
						message: new MarkdownString(data.markdownFragment, { supportThemeIcons: true, supportHtml: true, isTrusted: false }),
						providerId: this._activeSession!.provider.label,
						requestId: request.requestId,
					};
					progressiveChatResponse = this._widget?.inlineChatWidget.updateChatMessage(message, true);
				} else {
					progressiveChatResponse.appendContent(data.markdownFragment);
				}
			}
		});

		const task = this._activeSession.provider.provideResponse(this._activeSession.session, request, progress, this._activeRequestCts.token);
		let response: ReplyResponse | ErrorResponse | EmptyResponse;

		try {
			this._widget?.inlineChatWidget.updateChatMessage(undefined);
			this._widget?.inlineChatWidget.updateFollowUps(undefined);
			this._widget?.inlineChatWidget.updateProgress(true);
			this._widget?.inlineChatWidget.updateInfo(!this._activeSession.lastExchange ? GeneratingPhrase + '\u2026' : '');
			this._ctxHasActiveRequest.set(true);

			const reply = await raceCancellationError(Promise.resolve(task), this._activeRequestCts.token);
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
					await this._makeChanges(replyResponse.allLocalEdits[i], undefined);
				}

				if (this._activeSession?.provider.provideFollowups) {
					const followupCts = new CancellationTokenSource();
					const followups = await this._activeSession.provider.provideFollowups(this._activeSession.session, replyResponse.raw, followupCts.token);
					if (followups && this._widget) {
						const widget = this._widget;
						widget.inlineChatWidget.updateFollowUps(followups, async followup => {
							if (followup.kind === 'reply') {
								widget.inlineChatWidget.value = followup.message;
								this.acceptInput();
							} else {
								await this.acceptSession();
								this._commandService.executeCommand(followup.commandId, ...(followup.args ?? []));
							}
						});
					}
				}

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
			}
		} catch (e) {
			response = new ErrorResponse(e);
		} finally {
			this._ctxHasActiveRequest.set(false);
			this._widget?.inlineChatWidget.updateProgress(false);
			this._widget?.inlineChatWidget.updateInfo('');
			this._widget?.inlineChatWidget.updateToolbar(true);
		}

		this._ctxHasActiveRequest.set(false);
		this._widget?.inlineChatWidget.updateProgress(false);
		this._widget?.inlineChatWidget.updateInfo('');
		this._widget?.inlineChatWidget.updateToolbar(true);

		this._activeSession?.addExchange(new SessionExchange(this._activeSession.lastInput, response));
		this._ctxLastResponseType.set(response instanceof ReplyResponse ? response.raw.type : undefined);
	}

	private async _startSession(editor: IActiveCodeEditor, token: CancellationToken) {
		if (this._activeSession) {
			this._inlineChatSessionService.releaseSession(this._activeSession);
		}

		const session = await this._inlineChatSessionService.createSession(
			editor,
			{ editMode: EditMode.Live },
			token
		);

		if (!session) {
			return;
		}

		this._activeSession = session;
		this._strategy = new EditStrategy(session);
	}

	private async _startInitialFolowups(editor: IActiveCodeEditor, token: CancellationToken) {
		if (!this._activeSession || !this._activeSession.provider.provideFollowups) {
			return;
		}

		const request: IInlineChatRequest = {
			requestId: generateUuid(),
			prompt: '',
			attempt: 0,
			selection: { selectionStartLineNumber: 1, selectionStartColumn: 1, positionLineNumber: 1, positionColumn: 1 },
			wholeRange: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
			live: true,
			previewDocument: editor.getModel().uri,
			withIntentDetection: true
		};

		const progress = new AsyncProgress<IInlineChatProgressItem>(async data => { });
		const task = this._activeSession.provider.provideResponse(this._activeSession.session, request, progress, token);
		const reply = await raceCancellationError(Promise.resolve(task), token);
		if (token.isCancellationRequested) {
			return;
		}

		if (!reply) {
			return;
		}

		const markdownContents = new MarkdownString('', { supportThemeIcons: true, supportHtml: true, isTrusted: false });
		const response = this._instantiationService.createInstance(ReplyResponse, reply, markdownContents, this._activeSession.textModelN.uri, this._activeSession.textModelN.getAlternativeVersionId(), [], request.requestId);
		const followups = await this._activeSession.provider.provideFollowups(this._activeSession.session, response.raw, token);
		if (followups && this._widget) {
			const widget = this._widget;
			widget.inlineChatWidget.updateFollowUps(followups, async followup => {
				if (followup.kind === 'reply') {
					widget.inlineChatWidget.value = followup.message;
					this.acceptInput();
				} else {
					await this.acceptSession();
					this._commandService.executeCommand(followup.commandId, ...(followup.args ?? []));
				}
			});
		}
	}

	private async _makeChanges(edits: TextEdit[], opts: ProgressingEditsOptions | undefined) {
		assertType(this._activeSession);
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

		this._inlineChatSavingService.markChanged(this._activeSession);
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

	private _updateUserEditingState() {
		this._ctxUserDidEdit.set(true);
	}

	async acceptSession() {
		assertType(this._activeSession);
		assertType(this._strategy);

		const editor = this._widget?.parentEditor;
		if (!editor?.hasModel()) {
			return;
		}

		const editingCell = this._widget?.getEditingCell();

		if (editingCell && this._notebookEditor.hasModel() && this._activeSession.lastInput) {
			const cellId = NotebookCellTextModelLikeId.str({ uri: editingCell.uri, viewType: this._notebookEditor.textModel.viewType });
			const prompt = this._activeSession.lastInput.value;
			this._promptCache.set(cellId, prompt);
			this._onDidChangePromptCache.fire({ cell: editingCell.uri });
		}

		try {
			await this._strategy.apply(editor);
			this._inlineChatSessionService.releaseSession(this._activeSession);
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
		if (discard) {
			this._strategy?.cancel();
		}

		this._activeRequestCts?.cancel();
	}

	getEditingCell() {
		return this._widget?.getEditingCell();
	}

	discard() {
		this._strategy?.cancel();
		this._activeRequestCts?.cancel();
		this._widget?.discardChange();
		this.dismiss(true);
	}

	async feedbackLast(kind: InlineChatResponseFeedbackKind) {
		if (this._activeSession?.lastExchange && this._activeSession.lastExchange.response instanceof ReplyResponse) {
			this._activeSession.provider.handleInlineChatResponseFeedback?.(this._activeSession.session, this._activeSession.lastExchange.response.raw, kind);
			this._widget?.inlineChatWidget.updateStatus('Thank you for your feedback!', { resetAfter: 1250 });
		}
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


registerNotebookContribution(NotebookChatController.id, NotebookChatController);
