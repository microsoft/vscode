/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./interactiveEditor';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorLayoutInfo, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution, IEditorDecorationsCollection, ScrollType } from 'vs/editor/common/editorCommon';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { assertType } from 'vs/base/common/types';
import { IInteractiveEditorResponse, IInteractiveEditorService, CTX_INTERACTIVE_EDITOR_FOCUSED, CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST, CTX_INTERACTIVE_EDITOR_INNER_CURSOR_FIRST, CTX_INTERACTIVE_EDITOR_INNER_CURSOR_LAST, CTX_INTERACTIVE_EDITOR_EMPTY, CTX_INTERACTIVE_EDITOR_OUTER_CURSOR_POSITION, CTX_INTERACTIVE_EDITOR_VISIBLE, MENU_INTERACTIVE_EDITOR_WIDGET, IInteractiveEditorRequest, IInteractiveEditorSession, IInteractiveEditorSlashCommand, IInteractiveEditorSessionProvider, InteractiveEditorResponseFeedbackKind } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Iterable } from 'vs/base/common/iterator';
import { ICursorStateComputer, IModelDecorationOptions, IModelDeltaDecoration, ITextModel, IValidEditOperation } from 'vs/editor/common/model';
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
import { StopWatch } from 'vs/base/common/stopwatch';
import { Action, IAction, Separator } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { LRUCache } from 'vs/base/common/map';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { IInteractiveSessionWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';
import { IViewsService } from 'vs/workbench/common/views';
import { IInteractiveSessionContributionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContributionService';
import { InteractiveSessionViewPane } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionSidebar';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CompletionContext, CompletionItem, CompletionItemInsertTextRule, CompletionItemKind, CompletionItemProvider, CompletionList, ProviderResult } from 'vs/editor/common/languages';
import { LanguageSelector } from 'vs/editor/common/languageSelector';
import { DEFAULT_FONT_FAMILY } from 'vs/workbench/browser/style';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { renderFormattedText } from 'vs/base/browser/formattedTextRenderer';

class InteractiveEditorWidget {

	private static _modelPool: number = 1;

	private static _noop = () => { };

	private readonly _elements = h(
		'div.interactive-editor@root',
		[
			h('div.body', [
				h('div.content@content', [
					h('div.input@input', [
						h('div.editor-placeholder@placeholder'),
						h('div.editor-container@editor'),
					]),
					h('div.toolbar@rhsToolbar'),
				]),
			]),
			h('div.progress@progress'),
			h('div.status.hidden@status'),
		]
	);

	private readonly _store = new DisposableStore();
	private readonly _historyStore = new DisposableStore();

	readonly inputEditor: ICodeEditor;
	private readonly _inputModel: ITextModel;
	private readonly _ctxInputEmpty: IContextKey<boolean>;

	private readonly _progressBar: ProgressBar;

	private readonly _onDidChangeHeight = new Emitter<void>();
	readonly onDidChangeHeight: Event<void> = Event.filter(this._onDidChangeHeight.event, _ => !this._isLayouting);

	private _editorDim: Dimension | undefined;
	private _isLayouting: boolean = false;

	public acceptInput: () => void = InteractiveEditorWidget._noop;
	private _cancelInput: () => void = InteractiveEditorWidget._noop;

	constructor(
		parentEditor: ICodeEditor | undefined,
		@IModelService private readonly _modelService: IModelService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {

		// editor logic
		const editorOptions: IEditorConstructionOptions = {
			ariaLabel: localize('aria-label', "Interactive Editor Input"),
			fontFamily: DEFAULT_FONT_FAMILY,
			fontSize: 13,
			lineHeight: 20,
			padding: { top: 3, bottom: 2 },
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
				alwaysConsumeMouseWheel: false
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
			rulers: [],
			cursorWidth: 1,
			wrappingStrategy: 'advanced',
			wrappingIndent: 'none',
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

		this.inputEditor = parentEditor
			? this._instantiationService.createInstance(EmbeddedCodeEditorWidget, this._elements.editor, editorOptions, codeEditorWidgetOptions, parentEditor)
			: this._instantiationService.createInstance(CodeEditorWidget, this._elements.editor, editorOptions, codeEditorWidgetOptions);
		this._store.add(this.inputEditor);

		const uri = URI.from({ scheme: 'vscode', authority: 'interactive-editor', path: `/interactive-editor/model${InteractiveEditorWidget._modelPool++}.txt` });
		this._inputModel = this._modelService.getModel(uri) ?? this._modelService.createModel('', null, uri);
		this.inputEditor.setModel(this._inputModel);

		// show/hide placeholder depending on text model being empty
		// content height

		const currentContentHeight = 0;

		this._ctxInputEmpty = CTX_INTERACTIVE_EDITOR_EMPTY.bindTo(this._contextKeyService);
		const togglePlaceholder = () => {
			const hasText = this._inputModel.getValueLength() > 0;
			this._elements.placeholder.classList.toggle('hidden', hasText);
			this._ctxInputEmpty.set(!hasText);

			const contentHeight = this.inputEditor.getContentHeight();
			if (contentHeight !== currentContentHeight && this._editorDim) {
				this._editorDim = this._editorDim.with(undefined, contentHeight);
				this.inputEditor.layout(this._editorDim);
				this._onDidChangeHeight.fire();
			}
		};
		this._store.add(this._inputModel.onDidChangeContent(togglePlaceholder));
		togglePlaceholder();

		this._store.add(addDisposableListener(this._elements.placeholder, 'click', () => this.inputEditor.focus()));


		const toolbar = this._instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.rhsToolbar, MENU_INTERACTIVE_EDITOR_WIDGET, {
			telemetrySource: 'interactiveEditorWidget-toolbar',
			toolbarOptions: { primaryGroup: 'main' }
		});
		this._store.add(toolbar);

		this._progressBar = new ProgressBar(this._elements.progress);
		this._store.add(this._progressBar);
	}

	dispose(): void {
		this._store.dispose();
		this._historyStore.dispose();
		this._ctxInputEmpty.reset();
	}

	get domNode(): HTMLElement {
		return this._elements.root;
	}

	layout(dim: Dimension) {
		this._isLayouting = true;
		try {
			const innerEditorWidth = Math.min(
				Number.MAX_SAFE_INTEGER, //  TODO@jrieken define max width?
				dim.width - (getTotalWidth(this._elements.rhsToolbar) + 12 /* L/R-padding */)
			);
			const newDim = new Dimension(innerEditorWidth, this.inputEditor.getContentHeight());
			if (!this._editorDim || !Dimension.equals(this._editorDim, newDim)) {
				this._editorDim = newDim;
				this.inputEditor.layout(this._editorDim);

				this._elements.placeholder.style.width = `${innerEditorWidth - 4 /* input-padding*/}px`;
			}
		} finally {
			this._isLayouting = false;
		}
	}

	getHeight(): number {
		const base = getTotalHeight(this._elements.progress) + getTotalHeight(this._elements.status);
		const editorHeight = this.inputEditor.getContentHeight() + 6 /* padding and border */;
		return base + editorHeight + 12 /* padding */;
	}

	updateProgress(show: boolean) {
		if (show) {
			this._progressBar.infinite();
		} else {
			this._progressBar.stop();
		}
	}

	getInput(placeholder: string, value: string, token: CancellationToken): Promise<string | undefined> {

		this._elements.placeholder.innerText = placeholder;
		this._elements.placeholder.style.fontSize = `${this.inputEditor.getOption(EditorOption.fontSize)}px`;
		this._elements.placeholder.style.lineHeight = `${this.inputEditor.getOption(EditorOption.lineHeight)}px`;

		this._inputModel.setValue(value);
		this.inputEditor.setSelection(this._inputModel.getFullModelRange());
		this.inputEditor.updateOptions({ ariaLabel: localize('aria-label.N', "Interactive Editor Input: {0}", placeholder) });

		const disposeOnDone = new DisposableStore();

		disposeOnDone.add(this.inputEditor.onDidLayoutChange(() => this._onDidChangeHeight.fire()));
		disposeOnDone.add(this.inputEditor.onDidContentSizeChange(() => this._onDidChangeHeight.fire()));

		const ctxInnerCursorFirst = CTX_INTERACTIVE_EDITOR_INNER_CURSOR_FIRST.bindTo(this._contextKeyService);
		const ctxInnerCursorLast = CTX_INTERACTIVE_EDITOR_INNER_CURSOR_LAST.bindTo(this._contextKeyService);
		const ctxInputEditorFocused = CTX_INTERACTIVE_EDITOR_FOCUSED.bindTo(this._contextKeyService);

		return new Promise<string | undefined>(resolve => {

			this._cancelInput = () => {
				this.acceptInput = InteractiveEditorWidget._noop;
				this._cancelInput = InteractiveEditorWidget._noop;
				resolve(undefined);
				return true;
			};

			this.acceptInput = () => {
				const newValue = this.inputEditor.getModel()!.getValue();
				if (newValue.trim().length === 0) {
					// empty or whitespace only
					this._cancelInput();
					return;
				}

				this.acceptInput = InteractiveEditorWidget._noop;
				this._cancelInput = InteractiveEditorWidget._noop;
				resolve(newValue);
			};

			disposeOnDone.add(token.onCancellationRequested(() => this._cancelInput()));

			// CONTEXT KEYS

			// (1) inner cursor position (last/first line selected)
			const updateInnerCursorFirstLast = () => {
				if (!this.inputEditor.hasModel()) {
					return;
				}
				const { lineNumber } = this.inputEditor.getPosition();
				ctxInnerCursorFirst.set(lineNumber === 1);
				ctxInnerCursorLast.set(lineNumber === this.inputEditor.getModel().getLineCount());
			};
			disposeOnDone.add(this.inputEditor.onDidChangeCursorPosition(updateInnerCursorFirstLast));
			updateInnerCursorFirstLast();

			// (2) input editor focused or not
			const updateFocused = () => {
				const hasFocus = this.inputEditor.hasWidgetFocus();
				ctxInputEditorFocused.set(hasFocus);
				this._elements.content.classList.toggle('synthetic-focus', hasFocus);
			};
			disposeOnDone.add(this.inputEditor.onDidFocusEditorWidget(updateFocused));
			disposeOnDone.add(this.inputEditor.onDidBlurEditorWidget(updateFocused));
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
		this.inputEditor.setSelection(this._inputModel.getFullModelRange());
	}

	createStatusEntry() {
		const { root, label, actions } = h('div.status-item@item', [
			h('div.label@label'),
			h('div.actions@actions'),
		]);

		const toolbar = this._instantiationService.createInstance(WorkbenchToolBar, actions, {});
		this._historyStore.add(toolbar);

		reset(this._elements.status, root);
		this._onDidChangeHeight.fire();

		let oldClasses: string[] = [];

		return {
			update: (update: { message?: HTMLElement | string; actions?: IAction[]; classes?: string[] }) => {
				if (update.message) {
					reset(label, update.message);
					this._elements.status.classList.remove('hidden');
				}
				if (update.actions) {
					toolbar.setActions(update.actions);
				}
				if (update.classes) {
					oldClasses.forEach(value => root.classList.remove(value));
					oldClasses = update.classes.slice();
					root.classList.add(...update.classes);
				}
			},
			updateMessage(message: string) {
				label.innerText = message;
			},
			updateActions(actions: IAction[]) {
				toolbar.setActions(actions);
			},
			updateClasses: (classes: string[]) => {
				root.classList.add(...classes);
			},
			remove: () => {
				root.remove();
				toolbar.dispose();
				this._elements.status.classList.add('hidden');
				this._onDidChangeHeight.fire();
			}
		};
	}

	reset() {
		this._ctxInputEmpty.reset();
		reset(this._elements.status);
	}

	focus() {
		this.inputEditor.focus();
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
		const inputLeftPadding = 4;
		const inputRightPadding = 4;

		const width = widthInPixel - (spaceLeft + spaceRight + inputLeftPadding + inputRightPadding);
		this._dimension = new Dimension(width, heightInPixel);
		this.widget.domNode.style.marginLeft = `${spaceLeft + inputLeftPadding}px`;
		this.widget.domNode.style.marginRight = `${spaceRight + inputRightPadding}px`;
		this.widget.layout(this._dimension);
	}

	private _computeHeightInLines(): number {
		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		return this.widget.getHeight() / lineHeight;
	}

	protected override _relayout() {
		super._relayout(this._computeHeightInLines());
	}

	async getInput(where: IPosition, placeholder: string, value: string, token: CancellationToken): Promise<string | undefined> {
		assertType(this.editor.hasModel());
		super.show(where, this._computeHeightInLines());
		this._ctxVisible.set(true);

		const task = this.widget.getInput(placeholder, value, token);
		const result = await task;
		return result;
	}

	updatePosition(where: IPosition) {
		// todo@jrieken
		// UGYLY: we need to restore focus because showing the zone removes and adds it and that
		// means we loose focus for a bit
		const hasFocusNow = this.widget.inputEditor.hasWidgetFocus();
		super.show(where, this._computeHeightInLines());
		if (hasFocusNow) {
			this.widget.inputEditor.focus();
		}
	}

	protected override revealRange(_range: Range, _isLastLine: boolean) {
		// disabled
	}

	override hide(): void {
		this._ctxVisible.reset();
		this._ctxCursorPosition.reset();
		this.widget.reset();
		super.hide();
	}
}

class ToggleInlineDiff extends Action {

	constructor(private readonly _inlineDiff: InlineDiffDecorations) {
		super('diff', '', ThemeIcon.asClassName(Codicon.diff), true);
		this.checked = _inlineDiff.visible;
		this.tooltip = localize('toggleInlineDiff', "Toggle Inline Diff");
		this.label = _inlineDiff.visible ? localize('hideInlineDiff', "Hide") : localize('showInlineDiff', "Show");
	}

	override async run(): Promise<void> {
		this._inlineDiff.visible = !this._inlineDiff.visible;
		this.checked = this._inlineDiff.visible;
		this.label = this._inlineDiff.visible ? localize('hideInlineDiff', "Hide") : localize('showInlineDiff', "Show");
	}
}

class UndoAction extends Action {

	private readonly _myAlternativeVersionId: number;

	constructor(private readonly _model: ITextModel, private readonly _provider: IInteractiveEditorSessionProvider, private readonly _session: IInteractiveEditorSession, private readonly _response: IInteractiveEditorResponse) {
		super('undo', localize('undo', "Undo"), ThemeIcon.asClassName(Codicon.discard), false);
		this._myAlternativeVersionId = _model.getAlternativeVersionId();

		const update = () => {
			this.enabled = this._myAlternativeVersionId === this._model.getAlternativeVersionId();
		};
		this._store.add(_model.onDidChangeContent(() => update()));
		update();
	}

	override async run(): Promise<void> {
		if (this._myAlternativeVersionId === this._model.getAlternativeVersionId()) {
			this._model.undo();

			if (this._provider.handleInteractiveEditorResponseFeedback) {
				this._provider.handleInteractiveEditorResponseFeedback(this._session, this._response, InteractiveEditorResponseFeedbackKind.Undone);
			}
		}
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

class InlineDiffDecorations {

	private readonly _collection: IEditorDecorationsCollection;

	private _data: { tracking: IModelDeltaDecoration; decorating: IModelDecorationOptions }[] = [];
	private _visible: boolean = false;

	constructor(editor: ICodeEditor, visible: boolean = false) {
		this._collection = editor.createDecorationsCollection();
		this._visible = visible;
	}

	get visible() {
		return this._visible;
	}

	set visible(value: boolean) {
		this._visible = value;
		this.update();
	}

	clear() {
		this._collection.clear();
		this._data.length = 0;
	}

	collectEditOperation(op: IValidEditOperation) {
		this._data.push(InlineDiffDecorations._asDecorationData(op));
	}

	update() {
		this._collection.set(this._data.map(d => {
			const res = { ...d.tracking };
			if (this._visible) {
				res.options = { ...res.options, ...d.decorating };
			}
			return res;
		}));
	}

	private static _asDecorationData(edit: IValidEditOperation): { tracking: IModelDeltaDecoration; decorating: IModelDecorationOptions } {
		let content = edit.text;
		if (content.length > 12) {
			content = content.substring(0, 12) + '…';
		}
		const tracking: IModelDeltaDecoration = {
			range: edit.range,
			options: {
				description: 'interactive-editor-inline-diff',
			}
		};

		const decorating: IModelDecorationOptions = {
			description: 'interactive-editor-inline-diff',
			className: !edit.range.isEmpty() ? 'interactive-editor-lines-inserted-range' : undefined,
			showIfCollapsed: true,
			before: {
				content,
				inlineClassName: 'interactive-editor-lines-deleted-range-inline',
				attachedData: edit,
			}
		};

		return { tracking, decorating };
	}
}

class FeedbackToggles {

	private readonly _onDidChange = new Emitter<this>();
	readonly onDidChange: Event<this> = this._onDidChange.event;

	private readonly _helpful: Action;
	private readonly _unHelpful: Action;

	constructor(provider: IInteractiveEditorSessionProvider, session: IInteractiveEditorSession, response: IInteractiveEditorResponse) {

		const supportsFeedback = typeof provider.handleInteractiveEditorResponseFeedback === 'function';

		const update = (kind: InteractiveEditorResponseFeedbackKind) => {
			if (supportsFeedback) {
				provider.handleInteractiveEditorResponseFeedback!(session, response, kind);

				if (kind === InteractiveEditorResponseFeedbackKind.Helpful) {
					this._helpful.tooltip = localize('thanks', "Thanks for your feedback!");
					this._helpful.checked = true;
					this._helpful.enabled = false;
					this._unHelpful.tooltip = localize('thanks', "Thanks for your feedback!");
					this._unHelpful.enabled = false;
				} else {
					this._unHelpful.tooltip = localize('thanks', "Thanks for your feedback!");
					this._unHelpful.checked = true;
					this._unHelpful.enabled = false;
					this._helpful.tooltip = localize('thanks', "Thanks for your feedback!");
					this._helpful.enabled = false;
				}

				this._onDidChange.fire(this);
			}
		};

		this._helpful = new Action('interactiveEditor.helpful', localize('helpful', "Vote Up"), ThemeIcon.asClassName(Codicon.thumbsup), supportsFeedback, () => update(InteractiveEditorResponseFeedbackKind.Helpful));
		this._unHelpful = new Action('interactiveEditor.unHelpful', localize('unhelpful', "Vote Down"), ThemeIcon.asClassName(Codicon.thumbsdown), supportsFeedback, () => update(InteractiveEditorResponseFeedbackKind.Unhelpful));

		this._helpful.tooltip = this._helpful.label;
		this._unHelpful.tooltip = this._unHelpful.label;
	}

	dispose() {
		this._onDidChange.dispose();
		this._helpful.dispose();
		this._unHelpful.dispose();
	}

	get actions() {
		// const result: IAction[] = [];
		// if (this._helpful.enabled || this._helpful.checked) {
		// 	result.push(this._helpful);
		// }
		// if (this._unHelpful.enabled || this._unHelpful.checked) {
		// 	result.push(this._unHelpful);
		// }
		// return result;
		return [this._helpful, this._unHelpful];
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
		blockPadding: [4, 0, 1, 4]
	});

	private static _decoWholeRange = ModelDecorationOptions.register({
		description: 'interactive-editor-marker'
	});

	private static _promptHistory: string[] = [];
	private _historyOffset: number = -1;

	private readonly _store = new DisposableStore();
	private readonly _recorder = new SessionRecorder();
	private readonly _zone: InteractiveEditorZoneWidget;
	private readonly _ctxHasActiveRequest: IContextKey<boolean>;
	private _inlineDiffEnabled: boolean = false;

	private _ctsSession: CancellationTokenSource = new CancellationTokenSource();
	private _ctsRequest?: CancellationTokenSource;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInteractiveEditorService private readonly _interactiveEditorService: IInteractiveEditorService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		this._zone = this._store.add(_instaService.createInstance(InteractiveEditorZoneWidget, this._editor));
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

		const provider = Iterable.first(this._interactiveEditorService.getAllProvider());
		if (!provider) {
			this._logService.trace('[IE] NO provider found');
			return;
		}

		const thisSession = this._ctsSession = new CancellationTokenSource();
		const textModel = this._editor.getModel();
		const selection = this._editor.getSelection();
		const session = await provider.prepareInteractiveEditorSession(textModel, selection, this._ctsSession.token);
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

		const statusWidget = this._zone.widget.createStatusEntry();
		const inlineDiffDecorations = new InlineDiffDecorations(this._editor, this._inlineDiffEnabled);

		const blockDecoration = this._editor.createDecorationsCollection();
		const wholeRangeDecoration = this._editor.createDecorationsCollection();

		if (!initialRange) {
			initialRange = session.wholeRange ? Range.lift(session.wholeRange) : selection;
		}
		if (initialRange.isEmpty()) {
			initialRange = new Range(
				initialRange.startLineNumber, 1,
				initialRange.startLineNumber, textModel.getLineMaxColumn(initialRange.startLineNumber)
			);
		}
		wholeRangeDecoration.set([{
			range: initialRange,
			options: InteractiveEditorController._decoWholeRange
		}]);


		let placeholder = session.placeholder ?? '';
		let value = '';

		const store = new DisposableStore();

		if (session.slashCommands) {
			store.add(this._instaService.invokeFunction(installSlashCommandSupport, this._zone.widget.inputEditor as IActiveCodeEditor, session.slashCommands));
		}

		// CANCEL when input changes
		this._editor.onDidChangeModel(this._ctsSession.cancel, this._ctsSession, store);

		// REposition the zone widget whenever the block decoration changes
		let lastPost: Position | undefined;
		wholeRangeDecoration.onDidChange(e => {
			const range = wholeRangeDecoration.getRange(0);
			if (range && (!lastPost || !lastPost.equals(range.getEndPosition()))) {
				lastPost = range.getEndPosition();
				this._zone.updatePosition(lastPost);
			}
		}, undefined, store);

		let ignoreModelChanges = false;
		this._editor.onDidChangeModelContent(e => {
			if (!ignoreModelChanges) {

				// remove inline diff when the model changes
				inlineDiffDecorations.clear();

				// note when "other" edits happen
				data.edits = true;

				// CANCEL if the document has changed outside the current range
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

		}, undefined, store);

		let round = 0;
		const roundStore = new DisposableStore();
		store.add(roundStore);

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
			const inputPromise = this._zone.getInput(wholeRange.getEndPosition(), placeholder, value, this._ctsRequest.token);

			// reveal the line after the whole range to ensure that the input box is visible
			this._editor.revealPosition({ lineNumber: wholeRange.endLineNumber + 1, column: 1 }, ScrollType.Smooth);

			const input = await inputPromise;
			roundStore.clear();

			if (!input) {
				continue;
			}

			const refer = session.slashCommands?.some(value => value.refer && input.startsWith(`/${value.command}`));
			if (refer) {
				this._logService.info('[IE] seeing refer command, continuing outside editor', provider.debugName);
				this._editor.setSelection(wholeRange);
				this._instaService.invokeFunction(sendRequest, input);
				continue;
			}

			const sw = StopWatch.create();
			const request: IInteractiveEditorRequest = {
				prompt: input,
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
					// this._zone.widget.showMessage(toErrorMessage(e));
					statusWidget.update({ message: toErrorMessage(e), classes: ['error'], actions: [] });
					// statusWidget
					continue;
				}
			} finally {
				this._ctxHasActiveRequest.set(false);
				this._zone.widget.updateProgress(false);
				this._logService.trace('[IE] request took', sw.elapsed(), provider.debugName);
			}

			if (this._ctsRequest.token.isCancellationRequested) {
				this._logService.trace('[IE] request CANCELED', provider.debugName);
				value = input;
				continue;
			}

			if (!reply) {
				this._logService.trace('[IE] NO reply or edits', provider.debugName);
				value = input;
				statusWidget.update({ message: localize('empty', "No results, please refine your input and try again."), classes: ['warn'], actions: [] });
				continue;
			}

			if (reply.type === 'bulkEdit') {
				this._logService.info('[IE] performaing a BULK EDIT, exiting interactive editor', provider.debugName);
				this._bulkEditService.apply(reply.edits, { editor: this._editor, label: localize('ie', "{0}", input), showPreview: true });
				// todo@jrieken preview bulk edit?
				// todo@jrieken keep interactive editor?
				break;
			}

			if (reply.type === 'message') {
				this._logService.info('[IE] received a MESSAGE, continuing outside editor', provider.debugName);
				this._instaService.invokeFunction(showMessageResponse, request.prompt, reply.message.value);

				continue;
			}

			// make edits more minimal
			const moreMinimalEdits = (await this._editorWorkerService.computeHumanReadableDiff(textModel.uri, reply.edits));
			this._logService.trace('[IE] edits from PROVIDER and after making them MORE MINIMAL', provider.debugName, reply.edits, moreMinimalEdits);
			this._recorder.addExchange(session, request, reply);

			// inline diff
			inlineDiffDecorations.clear();

			// use whole range from reply
			if (reply.wholeRange) {
				wholeRangeDecoration.set([{
					range: reply.wholeRange,
					options: InteractiveEditorController._decoWholeRange
				}]);
			}

			try {
				ignoreModelChanges = true;

				const cursorStateComputerAndInlineDiffCollection: ICursorStateComputer = (undoEdits) => {
					let last: Position | null = null;
					for (const edit of undoEdits) {
						last = !last || last.isBefore(edit.range.getEndPosition()) ? edit.range.getEndPosition() : last;
						inlineDiffDecorations.collectEditOperation(edit);
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

			inlineDiffDecorations.update();

			const toggleAction = new ToggleInlineDiff(inlineDiffDecorations);
			const fixedActions: Action[] = [new UndoAction(textModel, provider, session, reply), toggleAction];
			roundStore.add(combinedDisposable(...fixedActions));

			const feedback = new FeedbackToggles(provider, session, reply);
			roundStore.add(feedback);
			roundStore.add(feedback.onDidChange(() => { statusWidget.update({ actions: Separator.join(feedback.actions, fixedActions) }); }));

			const editsCount = (moreMinimalEdits ?? reply.edits).length;

			const message = renderFormattedText(
				editsCount === 1
					? localize({ key: 'edit.1', comment: ['[[ and ]] are markdown must not be removed'] }, "Done, made [[1 change]]")
					: localize({ key: 'edit.N', comment: ['[[ and ]] are markdown must not be removed'] }, "Done, made [[{0} changes]]", editsCount),
				{
					actionHandler: {
						disposables: roundStore,
						callback: () => toggleAction.run(),
					}
				});

			statusWidget.update({
				message,
				classes: [],
				actions: Separator.join(feedback.actions, fixedActions),
			});

			if (!InteractiveEditorController._promptHistory.includes(input)) {
				InteractiveEditorController._promptHistory.unshift(input);
			}
			placeholder = reply.placeholder ?? session.placeholder ?? '';
			value = '';
			data.rounds += round + '|';

		} while (!thisSession.token.isCancellationRequested);

		this._inlineDiffEnabled = inlineDiffDecorations.visible;

		// done, cleanup
		wholeRangeDecoration.clear();
		blockDecoration.clear();
		inlineDiffDecorations.clear();

		store.dispose();
		session.dispose?.();


		this._zone.hide();
		this._editor.focus();

		this._logService.trace('[IE] session DONE', provider.debugName);
		data.endTime = new Date().toISOString();

		this._telemetryService.publicLog2<TelemetryData, TelemetryDataClassification>('interactiveEditor/session', data);
	}

	accept(): void {
		this._zone.widget.acceptInput();
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

	recordings() {
		return this._recorder.getAll();
	}
}

function installSlashCommandSupport(accessor: ServicesAccessor, editor: IActiveCodeEditor, commands: IInteractiveEditorSlashCommand[]) {

	const languageFeaturesService = accessor.get(ILanguageFeaturesService);

	const store = new DisposableStore();
	const selector: LanguageSelector = { scheme: editor.getModel().uri.scheme, pattern: editor.getModel().uri.path, language: editor.getModel().getLanguageId() };
	store.add(languageFeaturesService.completionProvider.register(selector, new class implements CompletionItemProvider {

		_debugDisplayName?: string = 'InteractiveEditorSlashCommandProvider';

		readonly triggerCharacters?: string[] = ['/'];

		provideCompletionItems(model: ITextModel, position: Position, context: CompletionContext, token: CancellationToken): ProviderResult<CompletionList> {
			if (position.lineNumber !== 1 && position.column !== 1) {
				return undefined;
			}

			const suggestions: CompletionItem[] = commands.map(command => {

				const withSlash = `/${command.command}`;

				return {
					label: withSlash,
					insertText: `${withSlash} $0`,
					insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
					kind: CompletionItemKind.Text,
					range: new Range(1, 1, 1, 1),
					detail: command.detail
				};
			});

			return { suggestions };
		}
	}));

	const decorations = editor.createDecorationsCollection();

	const updateSlashDecorations = () => {
		const newDecorations: IModelDeltaDecoration[] = [];
		for (const command of commands) {
			const withSlash = `/${command.command}`;
			const firstLine = editor.getModel().getLineContent(1);
			if (firstLine.startsWith(withSlash)) {
				newDecorations.push({
					range: new Range(1, 1, 1, withSlash.length + 1),
					options: {
						description: 'interactive-editor-slash-command',
						inlineClassName: 'interactive-editor-slash-command',
					}
				});

				// inject detail when otherwise empty
				if (firstLine === `/${command.command} `) {
					newDecorations.push({
						range: new Range(1, withSlash.length + 1, 1, withSlash.length + 2),
						options: {
							description: 'interactive-editor-slash-command-detail',
							after: {
								content: `${command.detail}`,
								inlineClassName: 'interactive-editor-slash-command-detail'
							}
						}
					});
				}
				break;
			}
		}
		decorations.set(newDecorations);
	};

	store.add(editor.onDidChangeModelContent(updateSlashDecorations));
	updateSlashDecorations();

	return store;
}

async function showMessageResponse(accessor: ServicesAccessor, query: string, response: string) {
	const interactiveSessionService = accessor.get(IInteractiveSessionService);
	interactiveSessionService.addCompleteRequest(query, { message: response });
}

async function sendRequest(accessor: ServicesAccessor, query: string) {

	const widgetService = accessor.get(IInteractiveSessionWidgetService);
	const viewsService = accessor.get(IViewsService);
	const interactiveSessionContributionService = accessor.get(IInteractiveSessionContributionService);

	if (widgetService.lastFocusedWidget && widgetService.lastFocusedWidget.viewId) {
		// option 1 - take the most recent view
		viewsService.openView(widgetService.lastFocusedWidget.viewId, true);
		widgetService.lastFocusedWidget.acceptInput(query);

	} else {
		// fallback - take the first view that's openable
		for (const { id } of interactiveSessionContributionService.registeredProviders) {
			const viewId = interactiveSessionContributionService.getViewIdForProvider(id);
			const view = await viewsService.openView<InteractiveSessionViewPane>(viewId, true);
			if (view) {
				view.acceptInput(query);
				break;
			}
		}
	}
}
