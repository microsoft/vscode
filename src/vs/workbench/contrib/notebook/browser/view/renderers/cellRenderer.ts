/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getPixelRatio, getZoomLevel } from 'vs/base/browser/browser';
import * as DOM from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { Action, IAction } from 'vs/base/common/actions';
import { Codicon, CSSIcon } from 'vs/base/common/codicons';
import { Color } from 'vs/base/common/color';
import { combinedDisposable, Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { MarshalledId } from 'vs/base/common/marshalling';
import * as platform from 'vs/base/common/platform';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { EditorOption, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { Range } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ITextModel } from 'vs/editor/common/model';
import * as modes from 'vs/editor/common/modes';
import { tokenizeLineToHTML } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { localize } from 'vs/nls';
import { DropdownWithPrimaryActionViewItem } from 'vs/platform/actions/browser/dropdownWithPrimaryActionViewItem';
import { createActionViewItem, createAndFillInActionBarActions, MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenu, IMenuService, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext } from 'vs/platform/contextkey/common/contextkeys';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { DeleteCellAction, INotebookActionContext, INotebookCellActionContext, INotebookCellToolbarActionContext } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { BaseCellRenderTemplate, CodeCellLayoutInfo, CodeCellRenderTemplate, EXPAND_CELL_OUTPUT_COMMAND_ID, ICellViewModel, INotebookEditor, isCodeCellRenderTemplate, MarkdownCellRenderTemplate, NOTEBOOK_CELL_EXECUTION_STATE, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_TYPE, NOTEBOOK_EDITOR_FOCUSED } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CodiconActionViewItem } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellActionView';
import { CellContextKeyManager } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellContextKeys';
import { CellDragAndDropController, DRAGGING_CLASS } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellDnd';
import { CellEditorOptions } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellEditorOptions';
import { CellEditorStatusBar } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellWidgets';
import { CodeCell } from 'vs/workbench/contrib/notebook/browser/view/renderers/codeCell';
import { StatefulMarkdownCell } from 'vs/workbench/contrib/notebook/browser/view/renderers/markdownCell';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { CellEditType, CellKind, NotebookCellExecutionState, NotebookCellInternalMetadata, NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookOptions } from 'vs/workbench/contrib/notebook/common/notebookOptions';

const $ = DOM.$;

export class NotebookCellListDelegate extends Disposable implements IListVirtualDelegate<CellViewModel> {
	private readonly lineHeight: number;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
		this.lineHeight = BareFontInfo.createFromRawSettings(editorOptions, getZoomLevel(), getPixelRatio()).lineHeight;
	}

	getHeight(element: CellViewModel): number {
		return element.getHeight(this.lineHeight);
	}

	hasDynamicHeight(element: CellViewModel): boolean {
		return element.hasDynamicHeight();
	}

	getTemplateId(element: CellViewModel): string {
		if (element.cellKind === CellKind.Markup) {
			return MarkupCellRenderer.TEMPLATE_ID;
		} else {
			return CodeCellRenderer.TEMPLATE_ID;
		}
	}
}

abstract class AbstractCellRenderer {
	protected readonly editorOptions: CellEditorOptions;

	constructor(
		protected readonly instantiationService: IInstantiationService,
		protected readonly notebookEditor: INotebookEditor,
		protected readonly contextMenuService: IContextMenuService,
		protected readonly menuService: IMenuService,
		configurationService: IConfigurationService,
		protected readonly keybindingService: IKeybindingService,
		protected readonly notificationService: INotificationService,
		protected readonly contextKeyServiceProvider: (container: HTMLElement) => IContextKeyService,
		language: string,
		protected dndController: CellDragAndDropController | undefined
	) {
		this.editorOptions = new CellEditorOptions(notebookEditor, notebookEditor.notebookOptions, configurationService, language);
	}

	dispose() {
		this.editorOptions.dispose();
		this.dndController = undefined;
	}

	protected createBetweenCellToolbar(container: HTMLElement, disposables: DisposableStore, contextKeyService: IContextKeyService, notebookOptions: NotebookOptions): ToolBar {
		const toolbar = new ToolBar(container, this.contextMenuService, {
			actionViewItemProvider: action => {
				if (action instanceof MenuItemAction) {
					if (notebookOptions.getLayoutConfiguration().insertToolbarAlignment === 'center') {
						return this.instantiationService.createInstance(CodiconActionViewItem, action);
					} else {
						return this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined);
					}
				}

				return undefined;
			}
		});
		disposables.add(toolbar);

		const menu = disposables.add(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.cellInsertToolbar, contextKeyService));
		const updateActions = () => {
			const actions = this.getCellToolbarActions(menu);
			toolbar.setActions(actions.primary, actions.secondary);
		};

		disposables.add(menu.onDidChange(() => updateActions()));
		disposables.add(notebookOptions.onDidChangeOptions((e) => {
			if (e.insertToolbarAlignment) {
				updateActions();
			}
		}));
		updateActions();

		return toolbar;
	}

	protected setBetweenCellToolbarContext(templateData: BaseCellRenderTemplate, element: CodeCellViewModel | MarkupCellViewModel, context: INotebookCellActionContext): void {
		templateData.betweenCellToolbar.context = context;

		const container = templateData.bottomCellContainer;
		const bottomToolbarOffset = element.layoutInfo.bottomToolbarOffset;
		container.style.top = `${bottomToolbarOffset}px`;

		templateData.elementDisposables.add(element.onDidChangeLayout(() => {
			const bottomToolbarOffset = element.layoutInfo.bottomToolbarOffset;
			container.style.top = `${bottomToolbarOffset}px`;
		}));
	}

	protected createToolbar(container: HTMLElement, elementClass?: string): ToolBar {
		const toolbar = new ToolBar(container, this.contextMenuService, {
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			actionViewItemProvider: action => {
				return createActionViewItem(this.instantiationService, action);
			},
			renderDropdownAsChildElement: true
		});

		if (elementClass) {
			toolbar.getElement().classList.add(elementClass);
		}

		return toolbar;
	}

	protected getCellToolbarActions(menu: IMenu): { primary: IAction[], secondary: IAction[]; } {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };

		createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, result, g => /^inline/.test(g));

		return result;
	}

	protected setupCellToolbarActions(templateData: BaseCellRenderTemplate, disposables: DisposableStore): void {
		const updateActions = () => {
			const actions = this.getCellToolbarActions(templateData.titleMenu);

			const hadFocus = DOM.isAncestor(document.activeElement, templateData.toolbar.getElement());
			templateData.toolbar.setActions(actions.primary, actions.secondary);
			if (hadFocus) {
				this.notebookEditor.focus();
			}

			const layoutInfo = this.notebookEditor.notebookOptions.getLayoutConfiguration();
			if (actions.primary.length || actions.secondary.length) {
				templateData.container.classList.add('cell-has-toolbar-actions');
				if (isCodeCellRenderTemplate(templateData)) {
					templateData.focusIndicatorLeft.style.top = `${layoutInfo.editorToolbarHeight + layoutInfo.cellTopMargin}px`;
					templateData.focusIndicatorRight.style.top = `${layoutInfo.editorToolbarHeight + layoutInfo.cellTopMargin}px`;
				}
			} else {
				templateData.container.classList.remove('cell-has-toolbar-actions');
				if (isCodeCellRenderTemplate(templateData)) {
					templateData.focusIndicatorLeft.style.top = `${layoutInfo.cellTopMargin}px`;
					templateData.focusIndicatorRight.style.top = `${layoutInfo.cellTopMargin}px`;
				}
			}
		};

		// #103926
		let dropdownIsVisible = false;
		let deferredUpdate: (() => void) | undefined;

		updateActions();
		disposables.add(templateData.titleMenu.onDidChange(() => {
			if (this.notebookEditor.isDisposed) {
				return;
			}

			if (dropdownIsVisible) {
				deferredUpdate = () => updateActions();
				return;
			}

			updateActions();
		}));
		templateData.container.classList.toggle('cell-toolbar-dropdown-active', false);
		disposables.add(templateData.toolbar.onDidChangeDropdownVisibility(visible => {
			dropdownIsVisible = visible;
			templateData.container.classList.toggle('cell-toolbar-dropdown-active', visible);

			if (deferredUpdate && !visible) {
				setTimeout(() => {
					if (deferredUpdate) {
						deferredUpdate();
					}
				}, 0);
				deferredUpdate = undefined;
			}
		}));
	}

	protected commonRenderTemplate(templateData: BaseCellRenderTemplate): void {
		templateData.disposables.add(DOM.addDisposableListener(templateData.container, DOM.EventType.FOCUS, () => {
			if (templateData.currentRenderedCell) {
				this.notebookEditor.focusElement(templateData.currentRenderedCell);
			}
		}, true));
	}

	protected commonRenderElement(element: ICellViewModel, templateData: BaseCellRenderTemplate): void {
		if (element.dragging) {
			templateData.container.classList.add(DRAGGING_CLASS);
		} else {
			templateData.container.classList.remove(DRAGGING_CLASS);
		}
	}
}

export class MarkupCellRenderer extends AbstractCellRenderer implements IListRenderer<MarkupCellViewModel, MarkdownCellRenderTemplate> {
	static readonly TEMPLATE_ID = 'markdown_cell';

	constructor(
		notebookEditor: INotebookEditor,
		dndController: CellDragAndDropController,
		private renderedEditors: Map<ICellViewModel, ICodeEditor | undefined>,
		contextKeyServiceProvider: (container: HTMLElement) => IContextKeyService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IMenuService menuService: IMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
	) {
		super(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, 'markdown', dndController);
	}

	get templateId() {
		return MarkupCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(rootContainer: HTMLElement): MarkdownCellRenderTemplate {
		rootContainer.classList.add('markdown-cell-row');
		const container = DOM.append(rootContainer, DOM.$('.cell-inner-container'));
		const disposables = new DisposableStore();
		const contextKeyService = disposables.add(this.contextKeyServiceProvider(container));
		const decorationContainer = DOM.append(rootContainer, $('.cell-decoration'));
		const titleToolbarContainer = DOM.append(container, $('.cell-title-toolbar'));
		const toolbar = disposables.add(this.createToolbar(titleToolbarContainer));
		const deleteToolbar = disposables.add(this.createToolbar(titleToolbarContainer, 'cell-delete-toolbar'));
		if (!this.notebookEditor.creationOptions.isReadOnly) {
			deleteToolbar.setActions([this.instantiationService.createInstance(DeleteCellAction)]);
		}

		DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-top'));
		const focusIndicatorLeft = DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left'));
		const focusIndicatorRight = DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-right'));

		const codeInnerContent = DOM.append(container, $('.cell.code'));
		const editorPart = DOM.append(codeInnerContent, $('.cell-editor-part'));
		const cellInputCollapsedContainer = DOM.append(codeInnerContent, $('.input-collapse-container'));
		const editorContainer = DOM.append(editorPart, $('.cell-editor-container'));
		editorPart.style.display = 'none';

		const innerContent = DOM.append(container, $('.cell.markdown'));
		const foldingIndicator = DOM.append(focusIndicatorLeft, DOM.$('.notebook-folding-indicator'));

		const bottomCellContainer = DOM.append(container, $('.cell-bottom-toolbar-container'));
		const betweenCellToolbar = disposables.add(this.createBetweenCellToolbar(bottomCellContainer, disposables, contextKeyService, this.notebookEditor.notebookOptions));
		const focusIndicatorBottom = DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-bottom'));

		const statusBar = disposables.add(this.instantiationService.createInstance(CellEditorStatusBar, editorPart));

		const titleMenu = disposables.add(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.cellTitleToolbar, contextKeyService));

		const templateData: MarkdownCellRenderTemplate = {
			rootContainer,
			cellInputCollapsedContainer,
			contextKeyService,
			container,
			decorationContainer,
			cellContainer: innerContent,
			editorPart,
			editorContainer,
			focusIndicatorLeft,
			focusIndicatorBottom,
			focusIndicatorRight,
			foldingIndicator,
			disposables,
			elementDisposables: new DisposableStore(),
			toolbar,
			deleteToolbar,
			betweenCellToolbar,
			bottomCellContainer,
			titleMenu,
			statusBar,
			toJSON: () => { return {}; }
		};

		this.commonRenderTemplate(templateData);

		return templateData;
	}

	renderElement(element: MarkupCellViewModel, index: number, templateData: MarkdownCellRenderTemplate, height: number | undefined): void {
		if (!this.notebookEditor.hasModel()) {
			throw new Error('The notebook editor is not attached with view model yet.');
		}

		const removedClassNames: string[] = [];
		templateData.rootContainer.classList.forEach(className => {
			if (/^nb\-.*$/.test(className)) {
				removedClassNames.push(className);
			}
		});

		removedClassNames.forEach(className => {
			templateData.rootContainer.classList.remove(className);
		});

		templateData.decorationContainer.innerText = '';

		this.commonRenderElement(element, templateData);

		templateData.currentRenderedCell = element;
		templateData.currentEditor = undefined;
		templateData.editorPart.style.display = 'none';
		templateData.cellContainer.innerText = '';

		if (height === undefined) {
			return;
		}

		const elementDisposables = templateData.elementDisposables;

		const generateCellTopDecorations = () => {
			templateData.decorationContainer.innerText = '';

			element.getCellDecorations().filter(options => options.topClassName !== undefined).forEach(options => {
				templateData.decorationContainer.append(DOM.$(`.${options.topClassName!}`));
			});
		};

		elementDisposables.add(element.onCellDecorationsChanged((e) => {
			const modified = e.added.find(e => e.topClassName) || e.removed.find(e => e.topClassName);

			if (modified) {
				generateCellTopDecorations();
			}
		}));

		elementDisposables.add(new CellContextKeyManager(templateData.contextKeyService, this.notebookEditor, element));

		this.updateForLayout(element, templateData);
		elementDisposables.add(element.onDidChangeLayout(() => {
			this.updateForLayout(element, templateData);
		}));

		this.updateForHover(element, templateData);
		const cellEditorOptions = new CellEditorOptions(this.notebookEditor, this.notebookEditor.notebookOptions, this.configurationService, element.language);
		cellEditorOptions.setLineNumbers(element.lineNumbers);
		elementDisposables.add(cellEditorOptions);

		elementDisposables.add(element.onDidChangeState(e => {
			if (e.cellIsHoveredChanged) {
				this.updateForHover(element, templateData);
			}

			if (e.metadataChanged) {
				this.updateCollapsedState(element);
			}

			if (e.cellLineNumberChanged) {
				cellEditorOptions.setLineNumbers(element.lineNumbers);
			}
		}));

		// render toolbar first
		this.setupCellToolbarActions(templateData, elementDisposables);

		const toolbarContext = <INotebookCellToolbarActionContext>{
			ui: true,
			cell: element,
			notebookEditor: this.notebookEditor,
			$mid: MarshalledId.NotebookCellActionContext
		};
		templateData.toolbar.context = toolbarContext;
		templateData.deleteToolbar.context = toolbarContext;

		this.setBetweenCellToolbarContext(templateData, element, toolbarContext);

		const scopedInstaService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, templateData.contextKeyService]));
		const markdownCell = scopedInstaService.createInstance(StatefulMarkdownCell, this.notebookEditor, element, templateData, cellEditorOptions.getValue(element.internalMetadata), this.renderedEditors,);
		elementDisposables.add(markdownCell);
		elementDisposables.add(cellEditorOptions.onDidChange(newValue => markdownCell.updateEditorOptions(cellEditorOptions.getValue(element.internalMetadata))));

		templateData.statusBar.update(toolbarContext);
	}

	private updateForLayout(element: MarkupCellViewModel, templateData: MarkdownCellRenderTemplate): void {
		const indicatorPostion = this.notebookEditor.notebookOptions.computeIndicatorPosition(element.layoutInfo.totalHeight, this.notebookEditor.textModel?.viewType);
		templateData.focusIndicatorBottom.style.top = `${indicatorPostion.bottomIndicatorTop}px`;
		templateData.focusIndicatorLeft.style.height = `${indicatorPostion.verticalIndicatorHeight}px`;
		templateData.focusIndicatorRight.style.height = `${indicatorPostion.verticalIndicatorHeight}px`;

		templateData.container.classList.toggle('cell-statusbar-hidden', this.notebookEditor.notebookOptions.computeEditorStatusbarHeight(element.internalMetadata) === 0);
	}

	private updateForHover(element: MarkupCellViewModel, templateData: MarkdownCellRenderTemplate): void {
		templateData.container.classList.toggle('markdown-cell-hover', element.cellIsHovered);
	}

	private updateCollapsedState(element: MarkupCellViewModel) {
		if (element.metadata.inputCollapsed) {
			this.notebookEditor.hideMarkupPreviews([element]);
		} else {
			this.notebookEditor.unhideMarkupPreviews([element]);
		}
	}

	disposeTemplate(templateData: MarkdownCellRenderTemplate): void {
		templateData.disposables.clear();
	}

	disposeElement(element: ICellViewModel, _index: number, templateData: MarkdownCellRenderTemplate): void {
		templateData.elementDisposables.clear();
		element.getCellDecorations().forEach(e => {
			if (e.className) {
				templateData.container.classList.remove(e.className);
			}
		});
	}
}

class EditorTextRenderer {

	private static _ttPolicy = window.trustedTypes?.createPolicy('cellRendererEditorText', {
		createHTML(input) { return input; }
	});

	getRichText(editor: ICodeEditor, modelRange: Range): HTMLElement | null {
		const model = editor.getModel();
		if (!model) {
			return null;
		}

		const colorMap = this.getDefaultColorMap();
		const fontInfo = editor.getOptions().get(EditorOption.fontInfo);
		const fontFamilyVar = '--notebook-editor-font-family';
		const fontSizeVar = '--notebook-editor-font-size';
		const fontWeightVar = '--notebook-editor-font-weight';

		const style = ``
			+ `color: ${colorMap[modes.ColorId.DefaultForeground]};`
			+ `background-color: ${colorMap[modes.ColorId.DefaultBackground]};`
			+ `font-family: var(${fontFamilyVar});`
			+ `font-weight: var(${fontWeightVar});`
			+ `font-size: var(${fontSizeVar});`
			+ `line-height: ${fontInfo.lineHeight}px;`
			+ `white-space: pre;`;

		const element = DOM.$('div', { style });

		const fontSize = fontInfo.fontSize;
		const fontWeight = fontInfo.fontWeight;
		element.style.setProperty(fontFamilyVar, fontInfo.fontFamily);
		element.style.setProperty(fontSizeVar, `${fontSize}px`);
		element.style.setProperty(fontWeightVar, fontWeight);

		const linesHtml = this.getRichTextLinesAsHtml(model, modelRange, colorMap);
		element.innerHTML = linesHtml as string;
		return element;
	}

	private getRichTextLinesAsHtml(model: ITextModel, modelRange: Range, colorMap: string[]): string | TrustedHTML {
		const startLineNumber = modelRange.startLineNumber;
		const startColumn = modelRange.startColumn;
		const endLineNumber = modelRange.endLineNumber;
		const endColumn = modelRange.endColumn;

		const tabSize = model.getOptions().tabSize;

		let result = '';

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			const lineTokens = model.getLineTokens(lineNumber);
			const lineContent = lineTokens.getLineContent();
			const startOffset = (lineNumber === startLineNumber ? startColumn - 1 : 0);
			const endOffset = (lineNumber === endLineNumber ? endColumn - 1 : lineContent.length);

			if (lineContent === '') {
				result += '<br>';
			} else {
				result += tokenizeLineToHTML(lineContent, lineTokens.inflate(), colorMap, startOffset, endOffset, tabSize, platform.isWindows);
			}
		}

		return EditorTextRenderer._ttPolicy?.createHTML(result) ?? result;
	}

	private getDefaultColorMap(): string[] {
		const colorMap = modes.TokenizationRegistry.getColorMap();
		const result: string[] = ['#000000'];
		if (colorMap) {
			for (let i = 1, len = colorMap.length; i < len; i++) {
				result[i] = Color.Format.CSS.formatHex(colorMap[i]);
			}
		}
		return result;
	}
}

class CodeCellDragImageRenderer {
	getDragImage(templateData: BaseCellRenderTemplate, editor: ICodeEditor, type: 'code' | 'markdown'): HTMLElement {
		let dragImage = this.getDragImageImpl(templateData, editor, type);
		if (!dragImage) {
			// TODO@roblourens I don't think this can happen
			dragImage = document.createElement('div');
			dragImage.textContent = '1 cell';
		}

		return dragImage;
	}

	private getDragImageImpl(templateData: BaseCellRenderTemplate, editor: ICodeEditor, type: 'code' | 'markdown'): HTMLElement | null {
		const dragImageContainer = templateData.container.cloneNode(true) as HTMLElement;
		dragImageContainer.classList.forEach(c => dragImageContainer.classList.remove(c));
		dragImageContainer.classList.add('cell-drag-image', 'monaco-list-row', 'focused', `${type}-cell-row`);

		const editorContainer: HTMLElement | null = dragImageContainer.querySelector('.cell-editor-container');
		if (!editorContainer) {
			return null;
		}

		const richEditorText = new EditorTextRenderer().getRichText(editor, new Range(1, 1, 1, 1000));
		if (!richEditorText) {
			return null;
		}
		DOM.reset(editorContainer, richEditorText);

		return dragImageContainer;
	}
}

export class CodeCellRenderer extends AbstractCellRenderer implements IListRenderer<CodeCellViewModel, CodeCellRenderTemplate> {
	static readonly TEMPLATE_ID = 'code_cell';

	constructor(
		notebookEditor: INotebookEditor,
		private renderedEditors: Map<ICellViewModel, ICodeEditor | undefined>,
		dndController: CellDragAndDropController,
		contextKeyServiceProvider: (container: HTMLElement) => IContextKeyService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IMenuService menuService: IMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
	) {
		super(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, 'plaintext', dndController);
	}

	get templateId() {
		return CodeCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(rootContainer: HTMLElement): CodeCellRenderTemplate {
		rootContainer.classList.add('code-cell-row');
		const container = DOM.append(rootContainer, DOM.$('.cell-inner-container'));
		const disposables = new DisposableStore();
		const contextKeyService = disposables.add(this.contextKeyServiceProvider(container));
		const decorationContainer = DOM.append(rootContainer, $('.cell-decoration'));
		DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-top'));
		const titleToolbarContainer = DOM.append(container, $('.cell-title-toolbar'));
		const toolbar = disposables.add(this.createToolbar(titleToolbarContainer));
		const deleteToolbar = disposables.add(this.createToolbar(titleToolbarContainer, 'cell-delete-toolbar'));
		if (!this.notebookEditor.creationOptions.isReadOnly) {
			deleteToolbar.setActions([this.instantiationService.createInstance(DeleteCellAction)]);
		}
		const focusIndicator = DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left'));
		const dragHandle = DOM.append(container, DOM.$('.cell-drag-handle'));

		const cellContainer = DOM.append(container, $('.cell.code'));
		const runButtonContainer = DOM.append(cellContainer, $('.run-button-container'));
		const cellInputCollapsedContainer = DOM.append(cellContainer, $('.input-collapse-container'));

		const runToolbar = this.setupRunToolbar(runButtonContainer, container, contextKeyService, disposables);
		const executionOrderLabel = DOM.append(cellContainer, $('div.execution-count-label'));

		const editorPart = DOM.append(cellContainer, $('.cell-editor-part'));
		const editorContainer = DOM.append(editorPart, $('.cell-editor-container'));

		// create a special context key service that set the inCompositeEditor-contextkey
		const editorContextKeyService = disposables.add(this.contextKeyServiceProvider(editorPart));
		const editorInstaService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService]));
		EditorContextKeys.inCompositeEditor.bindTo(editorContextKeyService).set(true);

		const editor = editorInstaService.createInstance(CodeEditorWidget, editorContainer, {
			...this.editorOptions.getValue(),
			dimension: {
				width: 0,
				height: 0
			},
			// overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode()
		}, {
			contributions: this.notebookEditor.creationOptions.cellEditorContributions
		});

		disposables.add(editor);

		const progressBar = new ProgressBar(editorPart);
		progressBar.hide();
		disposables.add(progressBar);

		const collapsedProgressBar = new ProgressBar(cellInputCollapsedContainer);
		collapsedProgressBar.hide();
		disposables.add(collapsedProgressBar);

		const statusBar = disposables.add(this.instantiationService.createInstance(CellEditorStatusBar, editorPart));

		const outputContainer = DOM.append(container, $('.output'));
		const cellOutputCollapsedContainer = DOM.append(outputContainer, $('.output-collapse-container'));
		const outputShowMoreContainer = DOM.append(container, $('.output-show-more-container'));

		const focusIndicatorRight = DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-right'));

		const focusSinkElement = DOM.append(container, $('.cell-editor-focus-sink'));
		focusSinkElement.setAttribute('tabindex', '0');
		const bottomCellContainer = DOM.append(container, $('.cell-bottom-toolbar-container'));
		const focusIndicatorBottom = DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-bottom'));
		const betweenCellToolbar = this.createBetweenCellToolbar(bottomCellContainer, disposables, contextKeyService, this.notebookEditor.notebookOptions);

		const titleMenu = disposables.add(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.cellTitleToolbar, contextKeyService));

		const templateData: CodeCellRenderTemplate = {
			rootContainer,
			editorPart,
			cellInputCollapsedContainer,
			cellOutputCollapsedContainer,
			contextKeyService,
			container,
			decorationContainer,
			cellContainer,
			progressBar,
			collapsedProgressBar,
			statusBar,
			focusIndicatorLeft: focusIndicator,
			focusIndicatorRight,
			focusIndicatorBottom,
			toolbar,
			deleteToolbar,
			betweenCellToolbar,
			focusSinkElement,
			runToolbar,
			runButtonContainer,
			executionOrderLabel,
			outputContainer,
			outputShowMoreContainer,
			editor,
			disposables,
			elementDisposables: new DisposableStore(),
			bottomCellContainer,
			titleMenu,
			dragHandle,
			toJSON: () => { return {}; }
		};

		this.dndController?.registerDragHandle(templateData, rootContainer, dragHandle, () => new CodeCellDragImageRenderer().getDragImage(templateData, templateData.editor, 'code'));

		disposables.add(this.addCollapseClickCollapseHandler(templateData));
		disposables.add(DOM.addDisposableListener(focusSinkElement, DOM.EventType.FOCUS, () => {
			if (templateData.currentRenderedCell && (templateData.currentRenderedCell as CodeCellViewModel).outputsViewModels.length) {
				this.notebookEditor.focusNotebookCell(templateData.currentRenderedCell, 'output');
			}
		}));

		this.commonRenderTemplate(templateData);

		return templateData;
	}

	private setupOutputCollapsedPart(templateData: CodeCellRenderTemplate, cellOutputCollapseContainer: HTMLElement, element: CodeCellViewModel) {
		const placeholder = DOM.append(cellOutputCollapseContainer, $('span.expandOutputPlaceholder')) as HTMLElement;
		placeholder.textContent = 'Outputs are collapsed';
		const expandIcon = DOM.append(cellOutputCollapseContainer, $('span.expandOutputIcon'));
		expandIcon.classList.add(...CSSIcon.asClassNameArray(Codicon.more));

		const keybinding = this.keybindingService.lookupKeybinding(EXPAND_CELL_OUTPUT_COMMAND_ID);
		if (keybinding) {
			placeholder.title = localize('cellExpandOutputButtonLabelWithDoubleClick', "Double click to expand cell output ({0})", keybinding.getLabel());
			cellOutputCollapseContainer.title = localize('cellExpandOutputButtonLabel', "Expand Cell Output (${0})", keybinding.getLabel());
		}

		DOM.hide(cellOutputCollapseContainer);

		const expand = () => {
			if (!templateData.currentRenderedCell) {
				return;
			}

			const textModel = this.notebookEditor.textModel!;
			const index = textModel.cells.indexOf(templateData.currentRenderedCell.model);

			if (index < 0) {
				return;
			}

			textModel.applyEdits([
				{ editType: CellEditType.Metadata, index, metadata: { ...templateData.currentRenderedCell.metadata, outputCollapsed: !templateData.currentRenderedCell.metadata.outputCollapsed } }
			], true, undefined, () => undefined, undefined);
		};

		templateData.disposables.add(DOM.addDisposableListener(expandIcon, DOM.EventType.CLICK, () => {
			expand();
		}));

		templateData.disposables.add(DOM.addDisposableListener(cellOutputCollapseContainer, DOM.EventType.DBLCLICK, () => {
			expand();
		}));
	}

	private addCollapseClickCollapseHandler(templateData: CodeCellRenderTemplate): IDisposable {
		const dragHandleListener = DOM.addDisposableListener(templateData.dragHandle, DOM.EventType.DBLCLICK, e => {
			const cell = templateData.currentRenderedCell;
			if (!cell) {
				return;
			}

			const clickedOnInput = e.offsetY < (cell.layoutInfo as CodeCellLayoutInfo).outputContainerOffset;
			const viewModel = this.notebookEditor.viewModel!;
			const metadata: Partial<NotebookCellMetadata> = clickedOnInput ?
				{ inputCollapsed: !cell.metadata.inputCollapsed } :
				{ outputCollapsed: !cell.metadata.outputCollapsed };
			viewModel.notebookDocument.applyEdits([
				{
					editType: CellEditType.PartialMetadata,
					index: viewModel.getCellIndex(cell),
					metadata
				}
			], true, undefined, () => undefined, undefined);
		});

		const collapsedPartListener = DOM.addDisposableListener(templateData.cellInputCollapsedContainer, DOM.EventType.DBLCLICK, e => {
			const cell = templateData.currentRenderedCell;
			if (!cell) {
				return;
			}

			const metadata: Partial<NotebookCellMetadata> = cell.metadata.inputCollapsed ?
				{ inputCollapsed: false } :
				{ outputCollapsed: false };
			const viewModel = this.notebookEditor.viewModel!;
			viewModel.notebookDocument.applyEdits([
				{
					editType: CellEditType.PartialMetadata,
					index: viewModel.getCellIndex(cell),
					metadata
				}
			], true, undefined, () => undefined, undefined);
		});

		const clickHandler = DOM.addDisposableListener(templateData.cellInputCollapsedContainer, DOM.EventType.CLICK, e => {
			const cell = templateData.currentRenderedCell;
			if (!cell) {
				return;
			}

			const element = e.target as HTMLElement;

			if (element && element.classList && element.classList.contains('expandInputIcon')) {
				// clicked on the expand icon
				const viewModel = this.notebookEditor.viewModel!;
				viewModel.notebookDocument.applyEdits([
					{
						editType: CellEditType.PartialMetadata,
						index: viewModel.getCellIndex(cell),
						metadata: {
							inputCollapsed: false
						}
					}
				], true, undefined, () => undefined, undefined);
			}
		});

		return combinedDisposable(dragHandleListener, collapsedPartListener, clickHandler);
	}

	private createRunCellToolbar(container: HTMLElement, cellContainer: HTMLElement, contextKeyService: IContextKeyService, disposables: DisposableStore): ToolBar {
		const actionViewItemDisposables = disposables.add(new DisposableStore());
		const dropdownAction = disposables.add(new Action('notebook.moreRunActions', localize('notebook.moreRunActionsLabel', "More..."), 'codicon-chevron-down', true));

		const keybindingProvider = (action: IAction) => this.keybindingService.lookupKeybinding(action.id, executionContextKeyService);
		const executionContextKeyService = disposables.add(getCodeCellExecutionContextKeyService(contextKeyService));
		const toolbar = disposables.add(new ToolBar(container, this.contextMenuService, {
			getKeyBinding: keybindingProvider,
			actionViewItemProvider: _action => {
				actionViewItemDisposables.clear();

				const menu = actionViewItemDisposables.add(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.cellExecuteToolbar, contextKeyService));
				const actions = this.getCellToolbarActions(menu);
				const primary = actions.primary[0];
				if (!(primary instanceof MenuItemAction)) {
					return undefined;
				}

				if (!actions.secondary.length) {
					return undefined;
				}

				const item = this.instantiationService.createInstance(DropdownWithPrimaryActionViewItem,
					primary,
					dropdownAction,
					actions.secondary,
					'notebook-cell-run-toolbar',
					this.contextMenuService,
					{
						getKeyBinding: keybindingProvider
					});
				actionViewItemDisposables.add(item.onDidChangeDropdownVisibility(visible => {
					cellContainer.classList.toggle('cell-run-toolbar-dropdown-active', visible);
				}));

				return item;
			},
			renderDropdownAsChildElement: true
		}));

		return toolbar;
	}

	private setupRunToolbar(runButtonContainer: HTMLElement, cellContainer: HTMLElement, contextKeyService: IContextKeyService, disposables: DisposableStore): ToolBar {
		const menu = disposables.add(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.cellExecuteToolbar, contextKeyService));
		const runToolbar = this.createRunCellToolbar(runButtonContainer, cellContainer, contextKeyService, disposables);
		const updateActions = () => {
			const actions = this.getCellToolbarActions(menu);
			runToolbar.setActions(actions.primary);
		};
		updateActions();
		disposables.add(menu.onDidChange(updateActions));
		disposables.add(this.notebookEditor.notebookOptions.onDidChangeOptions(updateActions));
		return runToolbar;
	}

	private updateForOutputs(element: CodeCellViewModel, templateData: CodeCellRenderTemplate): void {
		if (element.outputsViewModels.length) {
			DOM.show(templateData.focusSinkElement);
		} else {
			DOM.hide(templateData.focusSinkElement);
		}
	}

	private updateForInternalMetadata(element: CodeCellViewModel, templateData: CodeCellRenderTemplate): void {
		if (!this.notebookEditor.hasModel()) {
			return;
		}

		const internalMetadata = element.internalMetadata;
		this.updateExecutionOrder(internalMetadata, templateData);

		if (element.metadata.inputCollapsed) {
			templateData.progressBar.hide();
		} else {
			templateData.collapsedProgressBar.hide();
		}

		const progressBar = element.metadata.inputCollapsed ? templateData.collapsedProgressBar : templateData.progressBar;

		if (internalMetadata.runState === NotebookCellExecutionState.Executing && !internalMetadata.isPaused) {
			progressBar.infinite().show(500);
		} else {
			progressBar.hide();
		}
	}

	private updateExecutionOrder(internalMetadata: NotebookCellInternalMetadata, templateData: CodeCellRenderTemplate): void {
		if (this.notebookEditor.activeKernel?.implementsExecutionOrder) {
			const executionOrderLabel = typeof internalMetadata.executionOrder === 'number' ?
				`[${internalMetadata.executionOrder}]` :
				'[ ]';
			templateData.executionOrderLabel.innerText = executionOrderLabel;
		} else {
			templateData.executionOrderLabel.innerText = '';
		}
	}

	private updateForHover(element: CodeCellViewModel, templateData: CodeCellRenderTemplate): void {
		templateData.container.classList.toggle('cell-output-hover', element.outputIsHovered);
	}

	private updateForFocus(element: CodeCellViewModel, templateData: CodeCellRenderTemplate): void {
		templateData.container.classList.toggle('cell-output-focus', element.outputIsFocused);
	}

	private updateForLayout(element: CodeCellViewModel, templateData: CodeCellRenderTemplate): void {
		const layoutInfo = this.notebookEditor.notebookOptions.getLayoutConfiguration();
		const bottomToolbarDimensions = this.notebookEditor.notebookOptions.computeBottomToolbarDimensions(this.notebookEditor.textModel?.viewType);

		templateData.focusIndicatorLeft.style.height = `${element.layoutInfo.indicatorHeight}px`;
		templateData.focusIndicatorRight.style.height = `${element.layoutInfo.indicatorHeight}px`;
		templateData.focusIndicatorBottom.style.top = `${element.layoutInfo.totalHeight - bottomToolbarDimensions.bottomToolbarGap - layoutInfo.cellBottomMargin}px`;
		templateData.outputContainer.style.top = `${element.layoutInfo.outputContainerOffset}px`;
		templateData.outputShowMoreContainer.style.top = `${element.layoutInfo.outputShowMoreContainerOffset}px`;
		templateData.dragHandle.style.height = `${element.layoutInfo.totalHeight - bottomToolbarDimensions.bottomToolbarGap}px`;

		templateData.container.classList.toggle('cell-statusbar-hidden', this.notebookEditor.notebookOptions.computeEditorStatusbarHeight(element.internalMetadata) === 0);
	}

	renderElement(element: CodeCellViewModel, index: number, templateData: CodeCellRenderTemplate, height: number | undefined): void {
		if (!this.notebookEditor.hasModel()) {
			throw new Error('The notebook editor is not attached with view model yet.');
		}

		const removedClassNames: string[] = [];
		templateData.rootContainer.classList.forEach(className => {
			if (/^nb\-.*$/.test(className)) {
				removedClassNames.push(className);
			}
		});

		removedClassNames.forEach(className => {
			templateData.rootContainer.classList.remove(className);
		});

		templateData.decorationContainer.innerText = '';

		this.commonRenderElement(element, templateData);

		templateData.currentRenderedCell = element;

		if (height === undefined) {
			return;
		}

		templateData.outputContainer.innerText = '';
		const cellOutputCollapsedContainer = DOM.append(templateData.outputContainer, $('.output-collapse-container'));
		templateData.cellOutputCollapsedContainer = cellOutputCollapsedContainer;
		this.setupOutputCollapsedPart(templateData, cellOutputCollapsedContainer, element);

		const elementDisposables = templateData.elementDisposables;

		const generateCellTopDecorations = () => {
			templateData.decorationContainer.innerText = '';

			element.getCellDecorations().filter(options => options.topClassName !== undefined).forEach(options => {
				templateData.decorationContainer.append(DOM.$(`.${options.topClassName!}`));
			});
		};

		elementDisposables.add(element.onCellDecorationsChanged((e) => {
			const modified = e.added.find(e => e.topClassName) || e.removed.find(e => e.topClassName);

			if (modified) {
				generateCellTopDecorations();
			}
		}));

		generateCellTopDecorations();

		const child = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, templateData.contextKeyService]));
		elementDisposables.add(child.createInstance(CodeCell, this.notebookEditor, element, templateData));
		this.renderedEditors.set(element, templateData.editor);

		const cellEditorOptions = new CellEditorOptions(this.notebookEditor, this.notebookEditor.notebookOptions, this.configurationService, element.language);
		elementDisposables.add(cellEditorOptions);
		elementDisposables.add(cellEditorOptions.onDidChange(() => templateData.editor.updateOptions(cellEditorOptions.getValue(element.internalMetadata))));
		templateData.editor.updateOptions(cellEditorOptions.getValue(element.internalMetadata));

		elementDisposables.add(new CellContextKeyManager(templateData.contextKeyService, this.notebookEditor, element));

		this.updateForLayout(element, templateData);
		elementDisposables.add(element.onDidChangeLayout(() => {
			this.updateForLayout(element, templateData);
		}));

		this.updateForInternalMetadata(element, templateData);
		this.updateForHover(element, templateData);
		this.updateForFocus(element, templateData);
		cellEditorOptions.setLineNumbers(element.lineNumbers);
		elementDisposables.add(element.onDidChangeState((e) => {
			if (e.metadataChanged || e.internalMetadataChanged) {
				this.updateForInternalMetadata(element, templateData);
				this.updateForLayout(element, templateData);
			}

			if (e.outputIsHoveredChanged) {
				this.updateForHover(element, templateData);
			}

			if (e.outputIsFocusedChanged) {
				this.updateForFocus(element, templateData);
			}

			if (e.cellLineNumberChanged) {
				cellEditorOptions.setLineNumbers(element.lineNumbers);
			}
		}));

		this.updateForOutputs(element, templateData);
		elementDisposables.add(element.onDidChangeOutputs(_e => this.updateForOutputs(element, templateData)));

		this.setupCellToolbarActions(templateData, elementDisposables);

		const toolbarContext = <INotebookCellActionContext>{
			ui: true,
			cell: element,
			cellTemplate: templateData,
			notebookEditor: this.notebookEditor,
			$mid: MarshalledId.NotebookCellActionContext
		};
		templateData.toolbar.context = toolbarContext;
		templateData.runToolbar.context = toolbarContext;
		templateData.deleteToolbar.context = toolbarContext;

		this.setBetweenCellToolbarContext(templateData, element, toolbarContext);

		templateData.statusBar.update(toolbarContext);
	}

	disposeTemplate(templateData: CodeCellRenderTemplate): void {
		templateData.disposables.clear();
	}

	disposeElement(element: ICellViewModel, index: number, templateData: CodeCellRenderTemplate, height: number | undefined): void {
		templateData.elementDisposables.clear();
		this.renderedEditors.delete(element);
	}
}

export function getCodeCellExecutionContextKeyService(contextKeyService: IContextKeyService): IContextKeyService {
	// Create a fake ContextKeyService, and look up the keybindings within this context.
	const executionContextKeyService = contextKeyService.createScoped(document.createElement('div'));
	InputFocusedContext.bindTo(executionContextKeyService).set(true);
	EditorContextKeys.editorTextFocus.bindTo(executionContextKeyService).set(true);
	EditorContextKeys.focus.bindTo(executionContextKeyService).set(true);
	EditorContextKeys.textInputFocus.bindTo(executionContextKeyService).set(true);
	NOTEBOOK_CELL_EXECUTION_STATE.bindTo(executionContextKeyService).set('idle');
	NOTEBOOK_CELL_LIST_FOCUSED.bindTo(executionContextKeyService).set(true);
	NOTEBOOK_EDITOR_FOCUSED.bindTo(executionContextKeyService).set(true);
	NOTEBOOK_CELL_TYPE.bindTo(executionContextKeyService).set('code');

	return executionContextKeyService;
}

export class ListTopCellToolbar extends Disposable {
	private topCellToolbar: HTMLElement;
	private menu: IMenu;
	private toolbar: ToolBar;
	private readonly _modelDisposables = this._register(new DisposableStore());
	constructor(
		protected readonly notebookEditor: INotebookEditor,

		contextKeyService: IContextKeyService,
		insertionIndicatorContainer: HTMLElement,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IContextMenuService protected readonly contextMenuService: IContextMenuService,
		@IMenuService protected readonly menuService: IMenuService
	) {
		super();

		this.topCellToolbar = DOM.append(insertionIndicatorContainer, $('.cell-list-top-cell-toolbar-container'));

		this.toolbar = this._register(new ToolBar(this.topCellToolbar, this.contextMenuService, {
			actionViewItemProvider: action => {
				if (action instanceof MenuItemAction) {
					const item = this.instantiationService.createInstance(CodiconActionViewItem, action);
					return item;
				}

				return undefined;
			}
		}));
		this.toolbar.context = <INotebookActionContext>{
			notebookEditor
		};

		this.menu = this._register(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.cellTopInsertToolbar, contextKeyService));
		this._register(this.menu.onDidChange(() => {
			this.updateActions();
		}));
		this.updateActions();

		// update toolbar container css based on cell list length
		this._register(this.notebookEditor.onDidChangeModel(() => {
			this._modelDisposables.clear();

			if (this.notebookEditor.viewModel) {
				this._modelDisposables.add(this.notebookEditor.viewModel.onDidChangeViewCells(() => {
					this.updateClass();
				}));

				this.updateClass();
			}
		}));

		this.updateClass();
	}

	private updateActions() {
		const actions = this.getCellToolbarActions(this.menu, false);
		this.toolbar.setActions(actions.primary, actions.secondary);
	}

	private updateClass() {
		if (this.notebookEditor.viewModel?.length === 0) {
			this.topCellToolbar.classList.add('emptyNotebook');
		} else {
			this.topCellToolbar.classList.remove('emptyNotebook');
		}
	}

	private getCellToolbarActions(menu: IMenu, alwaysFillSecondaryActions: boolean): { primary: IAction[], secondary: IAction[]; } {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };

		createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, result, g => /^inline/.test(g));

		return result;
	}
}
