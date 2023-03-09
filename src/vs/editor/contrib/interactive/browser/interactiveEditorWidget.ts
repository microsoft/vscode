/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./interactiveEditor';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorLayoutInfo, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { assertType } from 'vs/base/common/types';
import { IInteractiveEditorResponse, IInteractiveEditorService, CTX_INTERACTIVE_EDITOR_FOCUSED, CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST, CTX_INTERACTIVE_EDITOR_INNER_CURSOR_FIRST, CTX_INTERACTIVE_EDITOR_INNER_CURSOR_LAST, CTX_INTERACTIVE_EDITOR_EMPTY, CTX_INTERACTIVE_EDITOR_OUTER_CURSOR_POSITION, CTX_INTERACTIVE_EDITOR_PREVIEW, CTX_INTERACTIVE_EDITOR_VISIBLE, MENU_INTERACTIVE_EDITOR_WIDGET, CTX_INTERACTIVE_EDITOR_HISTORY_VISIBLE, MENU_INTERACTIVE_EDITOR_WIDGET_LHS, IInteractiveEditorRequest, IInteractiveEditorSession } from 'vs/editor/contrib/interactive/common/interactiveEditor';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Iterable } from 'vs/base/common/iterator';
import { ICursorStateComputer, IModelDeltaDecoration, ITextModel, IValidEditOperation } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { Dimension, addDisposableListener, getTotalHeight, getTotalWidth, h, reset } from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { IModelService } from 'vs/editor/common/services/model';
import { URI } from 'vs/base/common/uri';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { GhostTextController } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextController';
import { MenuWorkbenchToolBar, WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { raceCancellationError } from 'vs/base/common/async';
import { isCancellationError } from 'vs/base/common/errors';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { ILogService } from 'vs/platform/log/common/log';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { StopWatch } from 'vs/base/common/stopwatch';
import { Action, IAction } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { LRUCache } from 'vs/base/common/map';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';


interface IHistoryEntry {
	updateVisibility(visible: boolean): void;
	updateActions(actions: IAction[]): void;
	remove(): void;
}

class InteractiveEditorWidget {

	private static _modelPool: number = 1;

	private static _noop = () => { };

	private readonly _elements = h(
		'div.interactive-editor@root',
		[
			h('div.body', [
				h('div.toolbar@lhsToolbar'),
				h('div.content', [
					h('div.input@input', [
						h('div.editor-placeholder@placeholder'),
						h('div.editor-container@editor'),
					]),
					h('div.history.hidden@history'),
				]),
				h('div.toolbar@rhsToolbar'),
			]),
			h('div.progress@progress')
		]
	);

	private readonly _store = new DisposableStore();
	private readonly _historyStore = new DisposableStore();

	private readonly _inputEditor: ICodeEditor;
	private readonly _inputModel: ITextModel;
	private readonly _ctxInputEmpty: IContextKey<boolean>;
	private readonly _ctxHistoryVisible: IContextKey<boolean>;

	private readonly _progressBar: ProgressBar;

	private readonly _onDidChangeHeight = new Emitter<void>();
	readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private _isExpanded = false;
	private _editorDim: Dimension | undefined;

	public acceptInput: (preview: boolean) => void = InteractiveEditorWidget._noop;
	private _cancelInput: () => void = InteractiveEditorWidget._noop;

	constructor(
		parentEditor: ICodeEditor | undefined,
		@IModelService private readonly _modelService: IModelService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {

		this._ctxHistoryVisible = CTX_INTERACTIVE_EDITOR_HISTORY_VISIBLE.bindTo(this._contextKeyService);

		// editor logic
		const editorOptions: IEditorConstructionOptions = {
			ariaLabel: localize('aria-label', "Interactive Editor Input"),
			wordWrap: 'on',
			overviewRulerLanes: 0,
			glyphMargin: false,
			lineNumbers: 'off',
			folding: false,
			selectOnLineNumbers: false,
			hideCursorInOverviewRuler: true,
			selectionHighlight: false,
			scrollbar: {
				useShadows: false,
				vertical: 'hidden',
				horizontal: 'auto',
				// alwaysConsumeMouseWheel: false
			},
			lineDecorationsWidth: 0,
			overviewRulerBorder: false,
			scrollBeyondLastLine: false,
			renderLineHighlight: 'none',
			fixedOverflowWidgets: true,
			dragAndDrop: false,
			revealHorizontalRightPadding: 5,
			minimap: { enabled: false },
			guides: { indentation: false },
			cursorWidth: 2,
			wrappingStrategy: 'advanced',
			wrappingIndent: 'none',
			padding: { top: 3, bottom: 2 },
			renderWhitespace: 'none',
			dropIntoEditor: { enabled: true },

			quickSuggestions: false,
			suggest: {
				showIcons: false,
				showSnippets: false,
			}
		};

		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				SnippetController2.ID,
				GhostTextController.ID,
				SuggestController.ID
			])
		};

		this._inputEditor = parentEditor
			? this._instantiationService.createInstance(EmbeddedCodeEditorWidget, this._elements.editor, editorOptions, codeEditorWidgetOptions, parentEditor)
			: this._instantiationService.createInstance(CodeEditorWidget, this._elements.editor, editorOptions, codeEditorWidgetOptions);
		this._store.add(this._inputEditor);

		const uri = URI.from({ scheme: 'vscode', authority: 'interactive-editor', path: `/interactive-editor/model${InteractiveEditorWidget._modelPool++}.txt` });
		this._inputModel = this._modelService.getModel(uri) ?? this._modelService.createModel('', null, uri);
		this._inputEditor.setModel(this._inputModel);


		// show/hide placeholder depending on text model being empty
		// content height

		const currentContentHeight = 0;

		this._ctxInputEmpty = CTX_INTERACTIVE_EDITOR_EMPTY.bindTo(this._contextKeyService);
		const togglePlaceholder = () => {
			const hasText = this._inputModel.getValueLength() > 0;
			this._elements.placeholder.classList.toggle('hidden', hasText);
			this._ctxInputEmpty.set(!hasText);

			const contentHeight = this._inputEditor.getContentHeight();
			if (contentHeight !== currentContentHeight && this._editorDim) {
				this._editorDim = this._editorDim.with(undefined, contentHeight);
				this._inputEditor.layout(this._editorDim);
				this._onDidChangeHeight.fire();
			}
		};
		this._store.add(this._inputModel.onDidChangeContent(togglePlaceholder));
		togglePlaceholder();

		this._store.add(addDisposableListener(this._elements.placeholder, 'click', () => this._inputEditor.focus()));

		const lhsToolbar = this._instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.lhsToolbar, MENU_INTERACTIVE_EDITOR_WIDGET_LHS, {
			telemetrySource: 'interactiveEditorWidget-toolbar-lhs',
			toolbarOptions: { primaryGroup: 'main' }
		});
		this._store.add(lhsToolbar);

		const rhsToolbar = this._instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.rhsToolbar, MENU_INTERACTIVE_EDITOR_WIDGET, {
			telemetrySource: 'interactiveEditorWidget-toolbar-rhs',
			toolbarOptions: { primaryGroup: 'main' }
		});
		this._store.add(rhsToolbar);

		this._progressBar = new ProgressBar(this._elements.progress);
		this._store.add(this._progressBar);
	}

	dispose(): void {
		this._store.dispose();
		this._historyStore.dispose();
		this._ctxInputEmpty.reset();
		this._ctxHistoryVisible.reset();
	}

	get domNode(): HTMLElement {
		return this._elements.root;
	}

	layout(dim: Dimension) {

		const innerEditorWidth = Math.min(
			Number.MAX_SAFE_INTEGER, //  TODO@jrieken define max width?
			dim.width - (getTotalWidth(this._elements.lhsToolbar) + getTotalWidth(this._elements.rhsToolbar) + 12 /* L/R-padding */)
		);
		const newDim = new Dimension(innerEditorWidth, this._inputEditor.getContentHeight());
		if (!this._editorDim || !Dimension.equals(this._editorDim, newDim)) {
			this._editorDim = newDim;
			this._inputEditor.layout(this._editorDim);

			this._elements.placeholder.style.width = `${innerEditorWidth - 4 /* input-padding*/}px`;
		}
	}

	getHeight(): number {
		return this._inputEditor.getContentHeight() + getTotalHeight(this._elements.history);
	}

	updateProgress(show: boolean) {
		if (show) {
			this._progressBar.infinite();
		} else {
			this._progressBar.stop();
		}
	}

	getInput(placeholder: string, value: string, token: CancellationToken): Promise<{ value: string; preview: boolean } | undefined> {

		this._elements.placeholder.innerText = placeholder;
		this._elements.placeholder.style.fontSize = `${this._inputEditor.getOption(EditorOption.fontSize)}px`;
		this._elements.placeholder.style.lineHeight = `${this._inputEditor.getOption(EditorOption.lineHeight)}px`;

		this._inputModel.setValue(value);
		this._inputEditor.setSelection(this._inputModel.getFullModelRange());

		const disposeOnDone = new DisposableStore();

		disposeOnDone.add(this._inputEditor.onDidLayoutChange(() => this._onDidChangeHeight.fire()));

		const ctxInnerCursorFirst = CTX_INTERACTIVE_EDITOR_INNER_CURSOR_FIRST.bindTo(this._contextKeyService);
		const ctxInnerCursorLast = CTX_INTERACTIVE_EDITOR_INNER_CURSOR_LAST.bindTo(this._contextKeyService);
		const ctxInputEditorFocused = CTX_INTERACTIVE_EDITOR_FOCUSED.bindTo(this._contextKeyService);

		return new Promise<{ value: string; preview: boolean } | undefined>(resolve => {

			this._cancelInput = () => {
				this.acceptInput = InteractiveEditorWidget._noop;
				this._cancelInput = InteractiveEditorWidget._noop;
				resolve(undefined);
				return true;
			};

			this.acceptInput = (preview) => {
				const newValue = this._inputEditor.getModel()!.getValue();
				if (newValue.trim().length === 0) {
					// empty or whitespace only
					this._cancelInput();
					return;
				}

				this.acceptInput = InteractiveEditorWidget._noop;
				this._cancelInput = InteractiveEditorWidget._noop;
				resolve({ value: newValue, preview });
			};

			disposeOnDone.add(token.onCancellationRequested(() => this._cancelInput()));

			// CONTEXT KEYS

			// (1) inner cursor position (last/first line selected)
			const updateInnerCursorFirstLast = () => {
				if (!this._inputEditor.hasModel()) {
					return;
				}
				const { lineNumber } = this._inputEditor.getPosition();
				ctxInnerCursorFirst.set(lineNumber === 1);
				ctxInnerCursorLast.set(lineNumber === this._inputEditor.getModel().getLineCount());
			};
			disposeOnDone.add(this._inputEditor.onDidChangeCursorPosition(updateInnerCursorFirstLast));
			updateInnerCursorFirstLast();

			// (2) input editor focused or not
			const updateFocused = () => {
				const hasFocus = this._inputEditor.hasWidgetFocus();
				ctxInputEditorFocused.set(hasFocus);
				this._elements.input.classList.toggle('synthetic-focus', hasFocus);
			};
			disposeOnDone.add(this._inputEditor.onDidFocusEditorWidget(updateFocused));
			disposeOnDone.add(this._inputEditor.onDidBlurEditorWidget(updateFocused));
			updateFocused();

			this.focus();

		}).finally(() => {
			disposeOnDone.dispose();

			ctxInnerCursorFirst.reset();
			ctxInnerCursorLast.reset();
			ctxInputEditorFocused.reset();
		});
	}

	populateInputField(value: string) {
		this._inputModel.setValue(value.trim());
		this._inputEditor.setSelection(this._inputModel.getFullModelRange());
	}

	toggleHistory(): void {
		this._isExpanded = !this._isExpanded;
		this._elements.history.classList.toggle('hidden', !this._isExpanded);
		this._ctxHistoryVisible.set(this._isExpanded);
		this._onDidChangeHeight.fire();
	}

	createHistoryEntry(value: string): IHistoryEntry {

		const { root, label, actions } = h('div.history-entry@item', [
			h('div.label@label'),
			h('div.actions@actions'),
		]);

		label.innerText = value;

		const toolbar = this._instantiationService.createInstance(WorkbenchToolBar, actions, {});
		this._historyStore.add(toolbar);

		this._elements.history.insertBefore(root, this._elements.history.firstChild);
		if (this._isExpanded) {
			this._onDidChangeHeight.fire();
		}

		return {
			updateVisibility: (visible) => {
				root.classList.toggle('hidden', !visible);
				if (this._isExpanded) {
					this._onDidChangeHeight.fire();
				}
			},
			updateActions(actions: IAction[]) {
				toolbar.setActions(actions);
			},
			remove: () => {
				root.remove();
				if (this._isExpanded) {
					this._onDidChangeHeight.fire();
				}
			}
		};
	}

	clearHistory() {
		this._historyStore.clear();
		this._isExpanded = false;
		this._elements.history.classList.toggle('hidden', true);
		this._ctxHistoryVisible.reset();
		reset(this._elements.history);
	}

	reset() {
		this._ctxInputEmpty.reset();
		this.clearHistory();
	}

	focus() {
		this._inputEditor.focus();
	}
}

export class InteractiveEditorZoneWidget extends ZoneWidget {

	readonly widget: InteractiveEditorWidget;

	private readonly _ctxVisible: IContextKey<boolean>;
	private readonly _ctxCursorPosition: IContextKey<'above' | 'below' | ''>;

	constructor(
		editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(editor, { showFrame: false, showArrow: false, isAccessible: true, className: 'interactive-editor-widget', keepEditorSelection: true });

		this._ctxVisible = CTX_INTERACTIVE_EDITOR_VISIBLE.bindTo(contextKeyService);
		this._ctxCursorPosition = CTX_INTERACTIVE_EDITOR_OUTER_CURSOR_POSITION.bindTo(contextKeyService);

		this._disposables.add(toDisposable(() => {
			this._ctxVisible.reset();
			this._ctxCursorPosition.reset();
		}));

		this.widget = this._instaService.createInstance(InteractiveEditorWidget, this.editor);
		this._disposables.add(this.widget.onDidChangeHeight(() => this._relayout()));
		this._disposables.add(this.widget);
		this.create();


		// todo@jrieken listen ONLY when showing
		const updateCursorIsAboveContextKey = () => {
			if (!this.position || !this.editor.hasModel()) {
				this._ctxCursorPosition.reset();
			} else if (this.position.lineNumber === this.editor.getPosition().lineNumber) {
				this._ctxCursorPosition.set('above');
			} else if (this.position.lineNumber + 1 === this.editor.getPosition().lineNumber) {
				this._ctxCursorPosition.set('below');
			} else {
				this._ctxCursorPosition.reset();
			}
		};
		this._disposables.add(this.editor.onDidChangeCursorPosition(e => updateCursorIsAboveContextKey()));
		this._disposables.add(this.editor.onDidFocusEditorText(e => updateCursorIsAboveContextKey()));
		updateCursorIsAboveContextKey();
	}

	protected override _fillContainer(container: HTMLElement): void {
		container.appendChild(this.widget.domNode);
	}

	protected override _getWidth(info: EditorLayoutInfo): number {
		// TODO@jrieken
		// makes the zone widget wider than wanted but this aligns
		// it with wholeLine decorations that are added above
		return info.width;
	}

	private _dimension?: Dimension;

	protected override _onWidth(widthInPixel: number): void {
		if (this._dimension) {
			this._doLayout(this._dimension.height, widthInPixel);
		}
	}

	protected override _doLayout(heightInPixel: number, widthInPixel: number): void {

		const info = this.editor.getLayoutInfo();
		const spaceLeft = info.lineNumbersWidth + info.glyphMarginWidth + info.decorationsWidth;
		const spaceRight = info.minimap.minimapWidth + info.verticalScrollbarWidth;

		const width = widthInPixel - (spaceLeft + spaceRight);
		this._dimension = new Dimension(width, heightInPixel);
		this.widget.domNode.style.marginLeft = `${spaceLeft}px`;
		this.widget.domNode.style.marginRight = `${spaceRight}px`;
		this.widget.layout(this._dimension);
	}

	private _computeHeightInLines(): number {
		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		const contentHeightInLines = (this.widget.getHeight() / lineHeight);
		return 2 + contentHeightInLines;
	}

	protected override _relayout() {
		super._relayout(this._computeHeightInLines());
	}

	async getInput(where: IPosition, placeholder: string, value: string, token: CancellationToken): Promise<{ value: string; preview: boolean } | undefined> {
		assertType(this.editor.hasModel());
		super.show(where, this._computeHeightInLines());
		this._ctxVisible.set(true);

		const task = this.widget.getInput(placeholder, value, token);
		const result = await task;
		return result;
	}

	updatePosition(where: IPosition) {
		super.show(where, this._computeHeightInLines());
	}

	override hide(): void {
		this._ctxVisible.reset();
		this._ctxCursorPosition.reset();
		this.widget.reset();
		super.hide();
	}
}

class UndoStepAction extends Action {

	static all: UndoStepAction[] = [];

	static updateUndoSteps() {
		UndoStepAction.all.forEach(action => {
			const isMyAltId = action.myAlternativeVersionId === action.model.getAlternativeVersionId();
			action.enabled = isMyAltId;
		});
	}

	readonly myAlternativeVersionId: number;

	constructor(readonly model: ITextModel) {
		super(`undo@${model.getAlternativeVersionId()}`, localize('undoStep', "Undo This Step"), ThemeIcon.asClassName(Codicon.discard), false);
		this.myAlternativeVersionId = model.getAlternativeVersionId();
		UndoStepAction.all.push(this);
		UndoStepAction.updateUndoSteps();
	}

	override async run() {
		this.model.undo();
		UndoStepAction.updateUndoSteps();
	}
}

type Exchange = { req: IInteractiveEditorRequest; res: IInteractiveEditorResponse };
export type Recording = { when: Date; session: IInteractiveEditorSession; value: string; exchanges: Exchange[] };

class SessionRecorder {

	private readonly _data = new LRUCache<IInteractiveEditorSession, Recording>(3);

	add(session: IInteractiveEditorSession, model: ITextModel) {
		this._data.set(session, { when: new Date(), session, value: model.getValue(), exchanges: [] });
	}

	addExchange(session: IInteractiveEditorSession, req: IInteractiveEditorRequest, res: IInteractiveEditorResponse) {
		this._data.get(session)?.exchanges.push({ req, res });
	}

	getAll(): Recording[] {
		return [...this._data.values()];
	}
}

type TelemetryData = {
	extension: string;
	rounds: string;
	undos: string;
	edits: boolean;
	terminalEdits: boolean;
	startTime: string;
	endTime: string;
};

type TelemetryDataClassification = {
	owner: 'jrieken';
	comment: 'Data about an interaction editor session';
	extension: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension providing the data' };
	rounds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of request that were made' };
	undos: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Requests that have been undone' };
	edits: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Did edits happen while the session was active' };
	terminalEdits: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Did edits terminal the session' };
	startTime: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When the session started' };
	endTime: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When the session ended' };
};

export class InteractiveEditorController implements IEditorContribution {

	static ID = 'interactiveEditor';

	static get(editor: ICodeEditor) {
		return editor.getContribution<InteractiveEditorController>(InteractiveEditorController.ID);
	}

	private static _decoBlock = ModelDecorationOptions.register({
		description: 'interactive-editor',
		blockClassName: 'interactive-editor-block',
		blockDoesNotCollapse: true,
		blockPadding: [1, 0, 1, 4]
	});

	private static _promptHistory: string[] = [];
	private _historyOffset: number = -1;

	private readonly _store = new DisposableStore();
	private readonly _recorder = new SessionRecorder();
	private readonly _zone: InteractiveEditorZoneWidget;
	private readonly _ctxShowPreview: IContextKey<boolean>;
	private readonly _ctxHasActiveRequest: IContextKey<boolean>;

	private _ctsSession: CancellationTokenSource = new CancellationTokenSource();
	private _ctsRequest?: CancellationTokenSource;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService instaService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInteractiveEditorService private readonly _interactiveEditorService: IInteractiveEditorService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		this._zone = this._store.add(instaService.createInstance(InteractiveEditorZoneWidget, this._editor));
		this._ctxShowPreview = CTX_INTERACTIVE_EDITOR_PREVIEW.bindTo(contextKeyService);
		this._ctxHasActiveRequest = CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST.bindTo(contextKeyService);
	}

	dispose(): void {
		this._store.dispose();
		this._ctsSession.dispose(true);
		this._ctsSession.dispose();
	}

	getId(): string {
		return InteractiveEditorController.ID;
	}

	async run(initialRange?: Range): Promise<void> {

		this._ctsSession.dispose(true);

		if (!this._editor.hasModel()) {
			return;
		}

		const provider = Iterable.first(this._interactiveEditorService.getAll());
		if (!provider) {
			this._logService.trace('[IE] NO provider found');
			return;
		}

		const thisSession = this._ctsSession = new CancellationTokenSource();
		const textModel = this._editor.getModel();
		const session = await provider.prepareInteractiveEditorSession(textModel, this._editor.getSelection(), this._ctsSession.token);
		if (!session) {
			this._logService.trace('[IE] NO session', provider.debugName);
			return;
		}
		this._recorder.add(session, textModel);
		this._logService.trace('[IE] NEW session', provider.debugName);

		const data: TelemetryData = {
			extension: provider.debugName,
			startTime: new Date().toISOString(),
			endTime: new Date().toISOString(),
			edits: false,
			terminalEdits: false,
			rounds: '',
			undos: ''
		};

		const blockDecoration = this._editor.createDecorationsCollection();
		const inlineDiffDecorations = this._editor.createDecorationsCollection();

		const wholeRangeDecoration = this._editor.createDecorationsCollection();

		if (!initialRange) {
			initialRange = this._editor.getSelection();
		}
		if (initialRange.isEmpty()) {
			initialRange = new Range(
				initialRange.startLineNumber, 1,
				initialRange.startLineNumber, textModel.getLineMaxColumn(initialRange.startLineNumber)
			);
		}
		wholeRangeDecoration.set([{
			range: initialRange,
			options: { description: 'interactive-editor-marker' }
		}]);


		let placeholder = session.placeholder ?? '';
		let value = '';

		const listener = new DisposableStore();

		// CANCEL when input changes
		this._editor.onDidChangeModel(this._ctsSession.cancel, this._ctsSession, listener);

		// REposition the zone widget whenever the block decoration changes
		let lastPost: Position | undefined;
		wholeRangeDecoration.onDidChange(e => {
			const range = wholeRangeDecoration.getRange(0);
			if (range && (!lastPost || !lastPost.equals(range.getEndPosition()))) {
				lastPost = range.getEndPosition();
				this._zone.updatePosition(lastPost);
			}
		}, undefined, listener);

		let ignoreModelChanges = false;
		this._editor.onDidChangeModelContent(e => {

			// UPDATE undo actions based on alternative version id
			UndoStepAction.updateUndoSteps();

			data.edits = true;

			// CANCEL if the document has changed outside the current range
			if (!ignoreModelChanges) {
				const wholeRange = wholeRangeDecoration.getRange(0);
				if (!wholeRange) {
					this._ctsSession.cancel();
					this._logService.trace('[IE] ABORT wholeRange seems gone/collapsed');
					return;
				}
				for (const change of e.changes) {
					if (!Range.areIntersectingOrTouching(wholeRange, change.range)) {
						this._ctsSession.cancel();
						this._logService.trace('[IE] CANCEL because of model change OUTSIDE range');
						data.terminalEdits = true;
						break;
					}
				}
			}

		}, undefined, listener);

		let round = 0;

		do {

			round += 1;

			const wholeRange = wholeRangeDecoration.getRange(0);
			if (!wholeRange) {
				// nuked whole file contents?
				this._logService.trace('[IE] ABORT wholeRange seems gone/collapsed');
				break;
			}

			// visuals: add block decoration
			blockDecoration.set([{
				range: wholeRange,
				options: InteractiveEditorController._decoBlock
			}]);

			this._ctsRequest?.dispose(true);
			this._ctsRequest = new CancellationTokenSource(this._ctsSession.token);

			this._historyOffset = -1;
			const input = await this._zone.getInput(wholeRange.getEndPosition(), placeholder, value, this._ctsRequest.token);

			if (!input || !input.value) {
				continue;
			}

			const historyEntry = this._zone.widget.createHistoryEntry(input.value);

			const sw = StopWatch.create();
			const request: IInteractiveEditorRequest = {
				prompt: input.value,
				selection: this._editor.getSelection(),
				wholeRange
			};
			const task = provider.provideResponse(session, request, this._ctsRequest.token);
			this._logService.trace('[IE] request started', provider.debugName, session, request);

			let reply: IInteractiveEditorResponse | null | undefined;
			try {
				this._zone.widget.updateProgress(true);
				this._ctxHasActiveRequest.set(true);
				reply = await raceCancellationError(Promise.resolve(task), this._ctsRequest.token);

			} catch (e) {
				if (!isCancellationError(e)) {
					this._logService.error('[IE] ERROR during request', provider.debugName);
					this._logService.error(e);
				}
			} finally {
				this._ctxHasActiveRequest.set(false);
				this._zone.widget.updateProgress(false);
			}

			this._logService.trace('[IE] request took', sw.elapsed(), provider.debugName);

			if (this._ctsRequest.token.isCancellationRequested) {
				this._logService.trace('[IE] request CANCELED', provider.debugName);
				value = input.value;
				historyEntry.remove();
				continue;
			}

			if (!reply || isFalsyOrEmpty(reply.edits)) {
				this._logService.trace('[IE] NO reply or edits', provider.debugName);
				value = input.value;
				historyEntry.remove();
				continue;
			}

			// make edits more minimal
			const moreMinimalEdits = (await this._editorWorkerService.computeMoreMinimalEdits(textModel.uri, reply.edits, true));
			this._logService.trace('[IE] edits from PROVIDER and after making them MORE MINIMAL', provider.debugName, reply.edits, moreMinimalEdits);
			this._recorder.addExchange(session, request, reply);

			// inline diff
			inlineDiffDecorations.clear();
			const newInlineDiffDecorationsData: IModelDeltaDecoration[] = [];

			try {
				ignoreModelChanges = true;

				const cursorStateComputerAndInlineDiffCollection: ICursorStateComputer = (undoEdits) => {
					let last: Position | null = null;
					for (const edit of undoEdits) {
						last = !last || last.isBefore(edit.range.getEndPosition()) ? edit.range.getEndPosition() : last;
						newInlineDiffDecorationsData.push(InteractiveEditorController._asInlineDiffDecorationData(edit));
					}
					return last && [Selection.fromPositions(last)];
				};

				this._editor.pushUndoStop();
				this._editor.executeEdits(
					'interactive-editor',
					(moreMinimalEdits ?? reply.edits).map(edit => EditOperation.replace(Range.lift(edit.range), edit.text)),
					cursorStateComputerAndInlineDiffCollection
				);
				this._editor.pushUndoStop();

			} finally {
				ignoreModelChanges = false;
			}

			inlineDiffDecorations.set(input.preview ? newInlineDiffDecorationsData : []);

			const that = this;
			historyEntry.updateActions([new class extends UndoStepAction {
				constructor() {
					super(textModel);
				}
				override async run() {
					super.run();
					historyEntry.updateVisibility(false);
					value = input.value;
					that._ctsRequest?.cancel();
					data.undos += round + '|';
				}
			}]);

			if (!InteractiveEditorController._promptHistory.includes(input.value)) {
				InteractiveEditorController._promptHistory.unshift(input.value);
			}
			placeholder = reply.placeholder ?? session.placeholder ?? '';

			data.rounds += round + '|';

		} while (!thisSession.token.isCancellationRequested);

		// done, cleanup
		wholeRangeDecoration.clear();
		blockDecoration.clear();
		inlineDiffDecorations.clear();

		listener.dispose();
		session.dispose?.();

		dispose(UndoStepAction.all);

		this._zone.hide();
		this._editor.focus();

		this._logService.trace('[IE] session DONE', provider.debugName);
		data.endTime = new Date().toISOString();

		this._telemetryService.publicLog2<TelemetryData, TelemetryDataClassification>('interactiveEditor/session', data);
	}

	private static _asInlineDiffDecorationData(edit: IValidEditOperation): IModelDeltaDecoration {
		let content = edit.text;
		if (content.length > 12) {
			content = content.substring(0, 12) + '…';
		}
		return {
			range: edit.range,
			options: {
				description: 'interactive-editor-inline-diff',
				className: 'interactive-editor-lines-inserted-range',
				before: {
					content,
					inlineClassName: 'interactive-editor-lines-deleted-range-inline',
					attachedData: edit
				}
			}
		};
	}

	accept(preview: boolean = this._preview): void {
		this._zone.widget.acceptInput(preview);
	}

	private _preview: boolean = false; // TODO@jrieken persist this

	togglePreview(): void {
		this._preview = !this._preview;
		this._ctxShowPreview.set(this._preview);
	}

	cancelCurrentRequest(): void {
		this._ctsRequest?.cancel();
	}

	cancelSession() {
		this._ctsSession.cancel();
	}

	arrowOut(up: boolean): void {
		if (this._zone.position && this._editor.hasModel()) {
			const { column } = this._editor.getPosition();
			const { lineNumber } = this._zone.position;
			const newLine = up ? lineNumber : lineNumber + 1;
			this._editor.setPosition({ lineNumber: newLine, column });
			this._editor.focus();
		}
	}

	focus(): void {
		this._zone.widget.focus();
	}

	populateHistory(up: boolean) {
		const len = InteractiveEditorController._promptHistory.length;
		if (len === 0) {
			return;
		}
		const pos = (len + this._historyOffset + (up ? 1 : -1)) % len;
		const entry = InteractiveEditorController._promptHistory[pos];
		this._zone.widget.populateInputField(entry);
		this._historyOffset = pos;
	}

	toggleHistory(): void {
		this._zone.widget.toggleHistory();
	}

	recordings() {
		return this._recorder.getAll();
	}
}
