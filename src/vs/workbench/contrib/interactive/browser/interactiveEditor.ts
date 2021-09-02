/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/interactive';
import * as nls from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground, editorForeground, resolveColorValue } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { InteractiveEditorInput } from 'vs/workbench/contrib/interactive/browser/interactiveEditorInput';
import { IActiveNotebookEditor, ICellViewModel, INotebookEditorOptions } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorExtensionsRegistry } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { IBorrowValue, INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/notebookEditorService';
import { cellEditorBackground, NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ExecutionStateCellStatusBarContrib, TimerCellStatusBarContrib } from 'vs/workbench/contrib/notebook/browser/contrib/cellStatusBar/executionStatusBarItemController';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { PLAINTEXT_LANGUAGE_IDENTIFIER } from 'vs/editor/common/modes/modesRegistry';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INTERACTIVE_INPUT_CURSOR_BOUNDARY } from 'vs/workbench/contrib/interactive/browser/interactiveCommon';
import { IInteractiveHistoryService } from 'vs/workbench/contrib/interactive/browser/interactiveHistoryService';
import { ComplexNotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookEditorModel';
import { NotebookCellsChangeType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { NotebookOptions } from 'vs/workbench/contrib/notebook/common/notebookOptions';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { createActionViewItem, createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IAction } from 'vs/base/common/actions';

const DECORATION_KEY = 'interactiveInputDecoration';

const enum ScrollingState {
	Initial = 0,
	StickyToBottom = 1
}

const INPUT_CELL_VERTICAL_PADDING = 8;
const INPUT_CELL_HORIZONTAL_PADDING_RIGHT = 10;
const INPUT_EDITOR_PADDING = 8;

export class InteractiveEditor extends EditorPane {
	static readonly ID: string = 'workbench.editor.interactive';

	#rootElement!: HTMLElement;
	#styleElement!: HTMLStyleElement;
	#notebookEditorContainer!: HTMLElement;
	#notebookWidget: IBorrowValue<NotebookEditorWidget> = { value: undefined };
	#inputCellContainer!: HTMLElement;
	#inputFocusIndicator!: HTMLElement;
	#inputRunButtonContainer!: HTMLElement;
	#inputEditorContainer!: HTMLElement;
	#codeEditorWidget!: CodeEditorWidget;
	// #inputLineCount = 1;
	#notebookWidgetService: INotebookEditorService;
	#instantiationService: IInstantiationService;
	#modeService: IModeService;
	#contextKeyService: IContextKeyService;
	#notebookKernelService: INotebookKernelService;
	#keybindingService: IKeybindingService;
	#historyService: IInteractiveHistoryService;
	#menuService: IMenuService;
	#contextMenuService: IContextMenuService;
	#widgetDisposableStore: DisposableStore = this._register(new DisposableStore());
	#dimension?: DOM.Dimension;
	#notebookOptions: NotebookOptions;

	#onDidFocusWidget = this._register(new Emitter<void>());
	override get onDidFocus(): Event<void> { return this.#onDidFocusWidget.event; }

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotebookEditorService notebookWidgetService: INotebookEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@INotebookKernelService notebookKernelService: INotebookKernelService,
		@IModeService modeService: IModeService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInteractiveHistoryService historyService: IInteractiveHistoryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IMenuService menuService: IMenuService,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super(
			InteractiveEditor.ID,
			telemetryService,
			themeService,
			storageService
		);
		this.#instantiationService = instantiationService;
		this.#notebookWidgetService = notebookWidgetService;
		this.#contextKeyService = contextKeyService;
		this.#notebookKernelService = notebookKernelService;
		this.#modeService = modeService;
		this.#keybindingService = keybindingService;
		this.#historyService = historyService;
		this.#menuService = menuService;
		this.#contextMenuService = contextMenuService;

		this.#notebookOptions = new NotebookOptions(configurationService);

		codeEditorService.registerDecorationType('interactive-decoration', DECORATION_KEY, {});
		this._register(this.#keybindingService.onDidUpdateKeybindings(this.#updateInputDecoration, this));
	}

	private get _inputCellContainerHeight() {
		return 19 + 2 + INPUT_CELL_VERTICAL_PADDING * 2 + INPUT_EDITOR_PADDING * 2;
	}

	private get _inputCellEditorHeight() {
		return 19 + INPUT_EDITOR_PADDING * 2;
	}

	protected createEditor(parent: HTMLElement): void {
		this.#rootElement = DOM.append(parent, DOM.$('.interactive-editor'));
		this.#rootElement.style.position = 'relative';
		this.#notebookEditorContainer = DOM.append(this.#rootElement, DOM.$('.notebook-editor-container'));
		this.#inputCellContainer = DOM.append(this.#rootElement, DOM.$('.input-cell-container'));
		this.#inputCellContainer.style.position = 'absolute';
		this.#inputCellContainer.style.height = `${this._inputCellContainerHeight}px`;
		this.#inputFocusIndicator = DOM.append(this.#inputCellContainer, DOM.$('.input-focus-indicator'));
		this.#inputRunButtonContainer = DOM.append(this.#inputCellContainer, DOM.$('.run-button-container'));
		this.#setupRunButtonToolbar(this.#inputRunButtonContainer);
		this.#inputEditorContainer = DOM.append(this.#inputCellContainer, DOM.$('.input-editor-container'));
		this.#createLayoutStyles();
	}

	#setupRunButtonToolbar(runButtonContainer: HTMLElement) {
		const menu = this._register(this.#menuService.createMenu(MenuId.InteractiveInputExecute, this.#contextKeyService));
		const toolbar = this._register(new ToolBar(runButtonContainer, this.#contextMenuService, {
			getKeyBinding: action => this.#keybindingService.lookupKeybinding(action.id),
			actionViewItemProvider: action => {
				return createActionViewItem(this.#instantiationService, action);
			},
			renderDropdownAsChildElement: true
		}));

		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };

		createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, result);
		toolbar.setActions([...primary, ...secondary]);
	}

	#createLayoutStyles(): void {
		this.#styleElement = DOM.createStyleSheet(this.#rootElement);
		const styleSheets: string[] = [];

		const {
			focusIndicator,
			codeCellLeftMargin,
			cellRunGutter
		} = this.#notebookOptions.getLayoutConfiguration();
		const leftMargin = codeCellLeftMargin + cellRunGutter;

		styleSheets.push(`
			.interactive-editor .input-cell-container {
				padding: ${INPUT_CELL_VERTICAL_PADDING}px ${INPUT_CELL_HORIZONTAL_PADDING_RIGHT}px ${INPUT_CELL_VERTICAL_PADDING}px ${leftMargin}px;
			}
		`);
		if (focusIndicator === 'gutter') {
			styleSheets.push(`
				.interactive-editor .input-cell-container:focus-within .input-focus-indicator::before {
					border-color: var(--notebook-focused-cell-border-color) !important;
				}
				.interactive-editor .input-focus-indicator::before {
					border-color: var(--notebook-inactive-focused-cell-border-color) !important;
				}
				.interactive-editor .input-cell-container .input-focus-indicator {
					display: block;
					top: ${INPUT_CELL_VERTICAL_PADDING}px;
				}
				.interactive-editor .input-cell-container {
					border-top: 1px solid var(--notebook-inactive-focused-cell-border-color);
				}
			`);
		} else {
			// border
			styleSheets.push(`
				.interactive-editor .input-cell-container {
					border-top: 1px solid var(--notebook-inactive-focused-cell-border-color);
				}
				.interactive-editor .input-cell-container .input-focus-indicator {
					display: none;
				}
			`);
		}

		styleSheets.push(`
			.interactive-editor .input-cell-container .run-button-container {
				width: ${cellRunGutter}px;
				left: ${codeCellLeftMargin}px;
				margin-top: ${INPUT_EDITOR_PADDING - 2}px;
			}
		`);

		this.#styleElement.textContent = styleSheets.join('\n');
	}

	override async setInput(input: InteractiveEditorInput, options: INotebookEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		const group = this.group!;
		const notebookInput = input.notebookEditorInput;

		// there currently is a widget which we still own so
		// we need to hide it before getting a new widget
		if (this.#notebookWidget.value) {
			this.#notebookWidget.value.onWillHide();
		}

		if (this.#codeEditorWidget) {
			this.#codeEditorWidget.dispose();
		}

		this.#widgetDisposableStore.clear();

		this.#notebookWidget = this.#instantiationService.invokeFunction(this.#notebookWidgetService.retrieveWidget, group, notebookInput, {
			isEmbedded: true,
			isReadOnly: true,
			contributions: NotebookEditorExtensionsRegistry.getSomeEditorContributions([
				ExecutionStateCellStatusBarContrib.id,
				TimerCellStatusBarContrib.id
			]),
			menuIds: {
				notebookToolbar: MenuId.InteractiveToolbar,
				cellTitleToolbar: MenuId.InteractiveCellTitle,
				cellInsertToolbar: MenuId.NotebookCellBetween,
				cellTopInsertToolbar: MenuId.NotebookCellListTop,
				cellExecuteToolbar: MenuId.InteractiveCellExecute
			},
			cellEditorContributions: [],
			options: this.#notebookOptions
		});

		this.#codeEditorWidget = this.#instantiationService.createInstance(CodeEditorWidget, this.#inputEditorContainer, {
			...getSimpleEditorOptions(),
			...{
				glyphMargin: true,
				padding: {
					top: INPUT_EDITOR_PADDING,
					bottom: INPUT_EDITOR_PADDING
				},
			}
		}, {
			...getSimpleCodeEditorWidgetOptions(),
			...{
				isSimpleWidget: false,
			}
		});

		if (this.#dimension) {
			this.#notebookEditorContainer.style.height = `${this.#dimension.height - this._inputCellContainerHeight}px`;
			this.#notebookWidget.value!.layout(this.#dimension.with(this.#dimension.width, this.#dimension.height - this._inputCellContainerHeight), this.#notebookEditorContainer);
			const {
				codeCellLeftMargin,
				cellRunGutter
			} = this.#notebookOptions.getLayoutConfiguration();
			const leftMargin = codeCellLeftMargin + cellRunGutter;
			const maxHeight = Math.min(this.#dimension.height / 2, this._inputCellEditorHeight);
			this.#codeEditorWidget.layout(this.#validateDimension(this.#dimension.width - leftMargin - INPUT_CELL_HORIZONTAL_PADDING_RIGHT, maxHeight));
			this.#inputFocusIndicator.style.height = `${this._inputCellEditorHeight}px`;
			this.#inputCellContainer.style.top = `${this.#dimension.height - this._inputCellContainerHeight}px`;
			this.#inputCellContainer.style.width = `${this.#dimension.width}px`;
		}

		await super.setInput(input, options, context, token);
		const model = await input.resolve();

		if (model === null) {
			throw new Error('?');
		}

		this.#notebookWidget.value?.setParentContextKeyService(this.#contextKeyService);
		await this.#notebookWidget.value!.setModel(model.notebook, undefined);
		this.#notebookWidget.value!.setOptions({
			isReadOnly: true
		});
		this.#widgetDisposableStore.add(this.#notebookWidget.value!.onDidFocus(() => this.#onDidFocusWidget.fire()));
		this.#widgetDisposableStore.add(model.notebook.onDidChangeContent(() => {
			(model as ComplexNotebookEditorModel).setDirty(false);
		}));
		this.#widgetDisposableStore.add(this.#notebookOptions.onDidChangeOptions(e => {
			if (e.compactView || e.focusIndicator) {
				// update the styling
				this.#styleElement?.remove();
				this.#createLayoutStyles();
			}

			if (this.#dimension && this.isVisible()) {
				this.layout(this.#dimension);
			}
		}));

		const editorModel = input.resolveInput(this.#notebookWidget.value?.activeKernel?.supportedLanguages[0] ?? 'plaintext');
		this.#codeEditorWidget.setModel(editorModel);
		this.#widgetDisposableStore.add(this.#codeEditorWidget.onDidFocusEditorWidget(() => this.#onDidFocusWidget.fire()));
		this.#widgetDisposableStore.add(this.#codeEditorWidget.onDidContentSizeChange(e => {
			if (!e.contentHeightChanged) {
				return;
			}

			if (this.#dimension) {
				this.#layoutWidgets(this.#dimension);
			}
		}));

		this.#widgetDisposableStore.add(this.#notebookKernelService.onDidChangeNotebookAffinity(this.#updateInputEditorLanguage, this));
		this.#widgetDisposableStore.add(this.#notebookKernelService.onDidChangeSelectedNotebooks(this.#updateInputEditorLanguage, this));

		this.#widgetDisposableStore.add(this.themeService.onDidColorThemeChange(() => {
			if (this.isVisible()) {
				this.#updateInputDecoration();
			}
		}));

		this.#widgetDisposableStore.add(this.#codeEditorWidget.onDidChangeModelContent(() => {
			if (this.isVisible()) {
				this.#updateInputDecoration();
			}
		}));

		if (this.#notebookWidget.value?.hasModel()) {
			this.#registerExecutionScrollListener(this.#notebookWidget.value);
		}

		const cursorAtBoundaryContext = INTERACTIVE_INPUT_CURSOR_BOUNDARY.bindTo(this.#contextKeyService);
		cursorAtBoundaryContext.set('none');

		this.#widgetDisposableStore.add(this.#codeEditorWidget.onDidChangeCursorPosition(({ position }) => {
			const viewModel = this.#codeEditorWidget._getViewModel()!;
			const lastLineNumber = viewModel.getLineCount();
			const lastLineCol = viewModel.getLineContent(lastLineNumber).length + 1;
			const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
			const firstLine = viewPosition.lineNumber === 1 && viewPosition.column === 1;
			const lastLine = viewPosition.lineNumber === lastLineNumber && viewPosition.column === lastLineCol;

			if (firstLine) {
				if (lastLine) {
					cursorAtBoundaryContext.set('both');
				} else {
					cursorAtBoundaryContext.set('top');
				}
			} else {
				if (lastLine) {
					cursorAtBoundaryContext.set('bottom');
				} else {
					cursorAtBoundaryContext.set('none');
				}
			}
		}));

		this.#widgetDisposableStore.add(editorModel.onDidChangeContent(() => {
			const value = editorModel!.getValue();
			if (this.input?.resource && value !== '') {
				this.#historyService.replaceLast(this.input.resource, value);
			}
		}));

		this.#updateInputDecoration();
		this.#updateInputEditorLanguage();
	}

	#lastCell: ICellViewModel | undefined = undefined;
	#lastCellDisposable = new DisposableStore();
	#state: ScrollingState = ScrollingState.Initial;

	#cellAtBottom(widget: NotebookEditorWidget & IActiveNotebookEditor, cell: ICellViewModel): boolean {
		const visibleRanges = widget.visibleRanges;
		const cellIndex = widget.getCellIndex(cell);
		if (cellIndex === Math.max(...visibleRanges.map(range => range.end))) {
			return true;
		}
		return false;
	}

	/**
	 * - Init state: 0
	 * - Will cell insertion: check if the last cell is at the bottom, false, stay 0
	 * 						if true, state 1 (ready for auto reveal)
	 * - receive a scroll event (scroll even already happened). If the last cell is at bottom, false, 0, true, state 1
	 * - height change of the last cell, if state 0, do nothing, if state 1, scroll the last cell fully into view
	 */
	#registerExecutionScrollListener(widget: NotebookEditorWidget & IActiveNotebookEditor) {
		this.#widgetDisposableStore.add(widget.textModel.onWillAddRemoveCells(e => {
			const lastViewCell = widget.cellAt(widget.getLength() - 1);

			// check if the last cell is at the bottom
			if (lastViewCell && this.#cellAtBottom(widget, lastViewCell)) {
				this.#state = ScrollingState.StickyToBottom;
			} else {
				this.#state = ScrollingState.Initial;
			}
		}));

		this.#widgetDisposableStore.add(widget.onDidScroll(() => {
			const lastViewCell = widget.cellAt(widget.getLength() - 1);

			// check if the last cell is at the bottom
			if (lastViewCell && this.#cellAtBottom(widget, lastViewCell)) {
				this.#state = ScrollingState.StickyToBottom;
			} else {
				this.#state = ScrollingState.Initial;
			}
		}));

		this.#widgetDisposableStore.add(widget.textModel.onDidChangeContent(e => {
			for (let i = 0; i < e.rawEvents.length; i++) {
				const event = e.rawEvents[i];

				if (event.kind === NotebookCellsChangeType.ModelChange && this.#notebookWidget.value?.hasModel()) {
					const lastViewCell = this.#notebookWidget.value.cellAt(this.#notebookWidget.value.getLength() - 1);
					if (lastViewCell !== this.#lastCell) {
						this.#lastCellDisposable.clear();
						this.#lastCell = lastViewCell;
						this.#registerListenerForCell();
					}
				}
			}
		}));
	}

	#registerListenerForCell() {
		if (!this.#lastCell) {
			return;
		}

		this.#lastCellDisposable.add(this.#lastCell.onDidChangeLayout((e) => {
			if (e.totalHeight === undefined) {
				// not cell height change
				return;
			}

			if (this.#state !== ScrollingState.StickyToBottom) {
				return;
			}

			// scroll to bottom
			// postpone to next tick as the list view might not process the output height change yet
			// e.g., when we register this listener later than the list view
			this.#lastCellDisposable.add(DOM.scheduleAtNextAnimationFrame(() => {
				if (this.#state === ScrollingState.StickyToBottom) {
					this.#notebookWidget.value!.scrollToBottom();
				}
			}));
		}));
	}

	#updateInputEditorLanguage() {
		const notebook = this.#notebookWidget.value?.textModel;
		const textModel = this.#codeEditorWidget.getModel();

		if (!notebook || !textModel) {
			return;
		}

		const info = this.#notebookKernelService.getMatchingKernel(notebook);
		const selectedOrSuggested = info.selected ?? info.suggested;

		if (selectedOrSuggested) {
			const language = selectedOrSuggested.supportedLanguages[0];
			const newMode = language ? this.#modeService.create(language).languageIdentifier : PLAINTEXT_LANGUAGE_IDENTIFIER;
			textModel.setMode(newMode);
		}
	}

	layout(dimension: DOM.Dimension): void {
		this.#rootElement.classList.toggle('mid-width', dimension.width < 1000 && dimension.width >= 600);
		this.#rootElement.classList.toggle('narrow-width', dimension.width < 600);
		this.#dimension = dimension;

		if (!this.#notebookWidget.value) {
			return;
		}

		this.#notebookEditorContainer.style.height = `${this.#dimension.height - this._inputCellContainerHeight}px`;
		this.#layoutWidgets(dimension);
	}

	#layoutWidgets(dimension: DOM.Dimension) {
		const contentHeight = this.#codeEditorWidget.hasModel() ? this.#codeEditorWidget.getContentHeight() : this._inputCellEditorHeight;
		const maxHeight = Math.min(dimension.height / 2, contentHeight);
		const {
			codeCellLeftMargin,
			cellRunGutter
		} = this.#notebookOptions.getLayoutConfiguration();
		const leftMargin = codeCellLeftMargin + cellRunGutter;

		const inputCellContainerHeight = maxHeight + INPUT_CELL_VERTICAL_PADDING * 2;
		this.#notebookEditorContainer.style.height = `${dimension.height - inputCellContainerHeight}px`;

		this.#notebookWidget.value!.layout(dimension.with(dimension.width, dimension.height - inputCellContainerHeight), this.#notebookEditorContainer);
		this.#codeEditorWidget.layout(this.#validateDimension(dimension.width - leftMargin - INPUT_CELL_HORIZONTAL_PADDING_RIGHT, maxHeight));
		this.#inputFocusIndicator.style.height = `${contentHeight}px`;
		this.#inputCellContainer.style.top = `${dimension.height - inputCellContainerHeight}px`;
		this.#inputCellContainer.style.width = `${dimension.width}px`;
	}

	#validateDimension(width: number, height: number) {
		return new DOM.Dimension(Math.max(0, width), Math.max(0, height));
	}

	#updateInputDecoration(): void {
		if (!this.#codeEditorWidget) {
			return;
		}

		if (!this.#codeEditorWidget.hasModel()) {
			return;
		}

		const model = this.#codeEditorWidget.getModel();

		const decorations: IDecorationOptions[] = [];

		if (model?.getValueLength() === 0) {
			const transparentForeground = resolveColorValue(editorForeground, this.themeService.getColorTheme())?.transparent(0.4);
			const keybinding = this.#keybindingService.lookupKeybinding('interactive.execute')?.getLabel();
			const text = nls.localize('interactiveInputPlaceHolder', "Type code here and press {0} to run", keybinding ?? 'ctrl+enter');
			decorations.push({
				range: {
					startLineNumber: 0,
					endLineNumber: 0,
					startColumn: 0,
					endColumn: 1
				},
				renderOptions: {
					after: {
						contentText: text,
						color: transparentForeground ? transparentForeground.toString() : undefined
					}
				}
			});
		}

		this.#codeEditorWidget.setDecorations('interactive-decoration', DECORATION_KEY, decorations);
	}

	override focus() {
		this.#codeEditorWidget.focus();
	}

	override setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
		super.setEditorVisible(visible, group);

		if (!visible) {
			if (this.input && this.#notebookWidget.value) {
				this.#notebookWidget.value.onWillHide();
			}
		}
	}

	override clearInput() {
		if (this.#notebookWidget.value) {
			this.#notebookWidget.value.onWillHide();
		}

		if (this.#codeEditorWidget) {
			this.#codeEditorWidget.dispose();
		}

		this.#notebookWidget = { value: undefined };
		this.#widgetDisposableStore.clear();

		super.clearInput();
	}

	override getControl(): { notebookEditor: NotebookEditorWidget | undefined, codeEditor: CodeEditorWidget; } {
		return {
			notebookEditor: this.#notebookWidget.value,
			codeEditor: this.#codeEditorWidget
		};
	}
}

registerThemingParticipant((theme, collector) => {
	collector.addRule(`
	.interactive-editor .input-cell-container:focus-within .input-editor-container .monaco-editor {
		outline: solid 1px var(--notebook-focused-cell-border-color);
	}
	.interactive-editor .input-cell-container .input-editor-container .monaco-editor {
		outline: solid 1px var(--notebook-inactive-focused-cell-border-color);
	}
	.interactive-editor .input-cell-container .input-focus-indicator {
		top: ${INPUT_CELL_VERTICAL_PADDING}px;
	}
	`);

	const editorBackgroundColor = theme.getColor(cellEditorBackground) ?? theme.getColor(editorBackground);
	if (editorBackgroundColor) {
		collector.addRule(`.interactive-editor .input-cell-container .monaco-editor-background,
		.interactive-editor .input-cell-container .margin-view-overlays {
			background: ${editorBackgroundColor};
		}`);
	}
});
