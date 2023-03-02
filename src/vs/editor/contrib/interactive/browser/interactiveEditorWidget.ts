/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./interactiveEditor';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorLayoutInfo, EditorOption } from 'vs/editor/common/config/editorOptions';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { assertType } from 'vs/base/common/types';
import { IInteractiveEditorResponse, IInteractiveEditorService, CTX_INTERACTIVE_EDITOR_FOCUSED, CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST, CTX_INTERACTIVE_EDITOR_INNER_CURSOR_FIRST, CTX_INTERACTIVE_EDITOR_INNER_CURSOR_LAST, CTX_INTERACTIVE_EDITOR_EMPTY, CTX_INTERACTIVE_EDITOR_OUTER_CURSOR_POSITION, CTX_INTERACTIVE_EDITOR_PREVIEW, CTX_INTERACTIVE_EDITOR_VISIBLE, MENU_INTERACTIVE_EDITOR_WIDGET, CTX_INTERACTIVE_EDITOR_HISTORY_VISIBLE, MENU_INTERACTIVE_EDITOR_WIDGET_LHS } from 'vs/editor/contrib/interactive/common/interactiveEditor';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Iterable } from 'vs/base/common/iterator';
import { IModelDeltaDecoration, ITextModel, IValidEditOperation } from 'vs/editor/common/model';
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
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { raceCancellationError } from 'vs/base/common/async';
import { isCancellationError } from 'vs/base/common/errors';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { ILogService } from 'vs/platform/log/common/log';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { StopWatch } from 'vs/base/common/stopwatch';


class InteractiveEditorWidget {

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
					h('ol.history.hidden@history'),
				]),
				h('div.toolbar@rhsToolbar'),
			]),
			h('div.progress@progress')
		]
	);

	private readonly _store = new DisposableStore();

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

		const uri = URI.from({ scheme: 'vscode', authority: 'interactive-editor', path: `/interactive-editor/model.txt` });
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
		this._ctxInputEmpty.reset();
		this._ctxHistoryVisible.reset();
	}

	getDomNode(): HTMLElement {
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

				const entry = document.createElement('li');
				entry.classList.add('history-entry');
				entry.innerText = newValue;

				this._elements.history.insertBefore(entry, this._elements.history.firstChild);
				this._onDidChangeHeight.fire();
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

	reset() {
		this._ctxInputEmpty.reset();

		// empty history
		this._isExpanded = false;
		this._elements.history.classList.toggle('hidden', true);
		this._ctxHistoryVisible.reset();
		reset(this._elements.history);
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
		container.appendChild(this.widget.getDomNode());
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
		this.widget.getDomNode().style.marginLeft = `${spaceLeft}px`;
		this.widget.getDomNode().style.marginRight = `${spaceRight}px`;
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

	async getInput(where: IRange, placeholder: string, value: string, token: CancellationToken): Promise<{ value: string; preview: boolean } | undefined> {
		assertType(this.editor.hasModel());
		super.show(where, this._computeHeightInLines());
		this._ctxVisible.set(true);

		const task = this.widget.getInput(placeholder, value, token);
		const result = await task;
		return result;
	}

	override hide(): void {
		this._ctxVisible.reset();
		this._ctxCursorPosition.reset();
		this.widget.reset();
		super.hide();
	}

}

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

	async run(): Promise<void> {

		this._ctsSession.dispose(true);

		if (!this._editor.hasModel()) {
			return;
		}

		const provider = Iterable.first(this._interactiveEditorService.getAll());
		if (!provider) {
			this._logService.trace('[IE] NO provider found');
			return;
		}


		this._ctsSession = new CancellationTokenSource();

		const session = await provider.prepareInteractiveEditorSession(this._editor.getModel(), this._editor.getSelection(), this._ctsSession.token);
		if (!session) {
			this._logService.trace('[IE] NO session', provider.debugName);
			return;
		}

		this._logService.trace('[IE] NEW session', provider.debugName);

		const decoBackground = this._editor.createDecorationsCollection();
		const decoPreview = this._editor.createDecorationsCollection();

		const decoWholeRange = this._editor.createDecorationsCollection();
		decoWholeRange.set([{
			range: this._editor.getSelection(),
			options: { description: 'interactive-editor-marker' }
		}]);

		let placeholder = session.placeholder ?? '';
		let value = '';

		const listener = new DisposableStore();
		this._editor.onDidChangeModel(this._ctsSession.cancel, this._ctsSession, listener);

		// CANCEL if the document has changed outside the current range
		this._editor.onDidChangeModelContent(e => {

			let cancel = false;
			const wholeRange = decoWholeRange.getRange(0);
			if (!wholeRange) {
				cancel = true;
			} else {
				for (const change of e.changes) {
					if (!Range.areIntersectingOrTouching(wholeRange, change.range)) {
						cancel = true;
						break;
					}
				}
			}

			if (cancel) {
				this._ctsSession.cancel();
				this._logService.trace('[IE] CANCEL because of model change OUTSIDE range');
			}

		}, undefined, listener);



		do {

			const wholeRange = decoWholeRange.getRange(0);
			if (!wholeRange) {
				// nuked whole file contents?
				break;
			}

			const newDecorations: IModelDeltaDecoration[] = [{
				range: wholeRange,
				options: InteractiveEditorController._decoBlock
			}];

			decoBackground.set(newDecorations);

			this._historyOffset = -1;
			const input = await this._zone.getInput(wholeRange.collapseToEnd(), placeholder, value, this._ctsSession.token);

			if (!input || !input.value) {
				continue;
			}

			this._ctsRequest?.dispose(true);
			this._ctsRequest = new CancellationTokenSource(this._ctsSession.token);

			const sw = StopWatch.create();
			const task = provider.provideResponse(
				session,
				{
					session,
					prompt: input.value,
					selection: this._editor.getSelection(),
					wholeRange: wholeRange
				},
				this._ctsRequest.token
			);

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
				value = input.value;
				continue;
			}

			if (!reply || isFalsyOrEmpty(reply.edits)) {
				this._logService.trace('[IE] NO reply or edits', provider.debugName);
				reply = { edits: [] };
				placeholder = '';
				continue;
			}

			// make edits more minimal
			const moreMinimalEdits = (await this._editorWorkerService.computeMoreMinimalEdits(this._editor.getModel().uri, reply.edits, true)) ?? reply.edits;

			// clear old preview
			decoPreview.clear();

			const undoEdits: IValidEditOperation[] = [];
			this._editor.pushUndoStop();
			this._editor.executeEdits(
				'interactive-editor',
				moreMinimalEdits.map(edit => {
					// return EditOperation.replaceMove(Range.lift(edit.range), edit.text); ???
					return EditOperation.replace(Range.lift(edit.range), edit.text);
				}),
				_undoEdits => {
					let last: Position | null = null;
					for (const undoEdit of _undoEdits) {
						undoEdits.push(undoEdit);
						last = !last || last.isBefore(undoEdit.range.getEndPosition()) ? undoEdit.range.getEndPosition() : last;
					}
					return last && [Selection.fromPositions(last)];
				}
			);
			this._editor.pushUndoStop();

			if (input.preview) {
				const decorations: IModelDeltaDecoration[] = [];
				for (const edit of undoEdits) {

					let content = edit.text;
					if (content.length > 12) {
						content = content.substring(0, 12) + '…';
					}
					decorations.push({
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
					});
				}
				decoPreview.set(decorations);
			}

			if (!InteractiveEditorController._promptHistory.includes(input.value)) {
				InteractiveEditorController._promptHistory.unshift(input.value);
			}
			placeholder = reply.placeholder ?? session.placeholder ?? '';

		} while (!this._ctsSession.token.isCancellationRequested);

		// done, cleanup
		decoWholeRange.clear();
		decoBackground.clear();
		decoPreview.clear();

		listener.dispose();
		session.dispose?.();

		this._zone.hide();
		this._editor.focus();

		this._logService.trace('[IE] session DONE', provider.debugName);
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
}
