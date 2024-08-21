/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PixelRatio } from 'vs/base/browser/pixelRatio';
import * as DOM from 'vs/base/browser/dom';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { localize } from 'vs/nls';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService, IScopedContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellPartsCollection } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { CellChatPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/chat/cellChatPart';
import { CellComments } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellComments';
import { CellContextKeyPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellContextKeys';
import { CellDecorations } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellDecorations';
import { CellDragAndDropController, CellDragAndDropPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellDnd';
import { CodeCellDragImageRenderer } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellDragRenderer';
import { CellEditorOptions } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellEditorOptions';
import { CellExecutionPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellExecution';
import { CellFocusPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellFocus';
import { CellFocusIndicator } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellFocusIndicator';
import { CellProgressBar } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellProgressBar';
import { CellEditorStatusBar } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellStatusPart';
import { BetweenCellToolbar, CellTitleToolbarPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellToolbars';
import { CodeCell } from 'vs/workbench/contrib/notebook/browser/view/cellParts/codeCell';
import { RunToolbar } from 'vs/workbench/contrib/notebook/browser/view/cellParts/codeCellRunToolbar';
import { CollapsedCellInput } from 'vs/workbench/contrib/notebook/browser/view/cellParts/collapsedCellInput';
import { CollapsedCellOutput } from 'vs/workbench/contrib/notebook/browser/view/cellParts/collapsedCellOutput';
import { FoldedCellHint } from 'vs/workbench/contrib/notebook/browser/view/cellParts/foldedCellHint';
import { MarkupCell } from 'vs/workbench/contrib/notebook/browser/view/cellParts/markupCell';
import { CodeCellRenderTemplate, MarkdownCellRenderTemplate } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { NotebookCellEditorPool } from 'vs/workbench/contrib/notebook/browser/view/notebookCellEditorPool';

const $ = DOM.$;

export class NotebookCellListDelegate extends Disposable implements IListVirtualDelegate<CellViewModel> {
	private readonly lineHeight: number;

	constructor(
		targetWindow: Window,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
		this.lineHeight = BareFontInfo.createFromRawSettings(editorOptions, PixelRatio.getInstance(targetWindow).value).lineHeight;
	}

	getHeight(element: CellViewModel): number {
		return element.getHeight(this.lineHeight);
	}

	getDynamicHeight(element: CellViewModel): number | null {
		return element.getDynamicHeight();
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
		protected readonly notebookEditor: INotebookEditorDelegate,
		protected readonly contextMenuService: IContextMenuService,
		protected readonly menuService: IMenuService,
		configurationService: IConfigurationService,
		protected readonly keybindingService: IKeybindingService,
		protected readonly notificationService: INotificationService,
		protected readonly contextKeyServiceProvider: (container: HTMLElement) => IScopedContextKeyService,
		language: string,
		protected dndController: CellDragAndDropController | undefined
	) {
		this.editorOptions = new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(language), this.notebookEditor.notebookOptions, configurationService);
	}

	dispose() {
		this.editorOptions.dispose();
		this.dndController = undefined;
	}
}

export class MarkupCellRenderer extends AbstractCellRenderer implements IListRenderer<MarkupCellViewModel, MarkdownCellRenderTemplate> {
	static readonly TEMPLATE_ID = 'markdown_cell';

	private _notebookExecutionStateService: INotebookExecutionStateService;

	constructor(
		notebookEditor: INotebookEditorDelegate,
		dndController: CellDragAndDropController,
		private renderedEditors: Map<ICellViewModel, ICodeEditor>,
		contextKeyServiceProvider: (container: HTMLElement) => IScopedContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IMenuService menuService: IMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@INotebookExecutionStateService notebookExecutionStateService: INotebookExecutionStateService
	) {
		super(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, 'markdown', dndController);
		this._notebookExecutionStateService = notebookExecutionStateService;
	}

	get templateId() {
		return MarkupCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(rootContainer: HTMLElement): MarkdownCellRenderTemplate {
		rootContainer.classList.add('markdown-cell-row');
		const container = DOM.append(rootContainer, DOM.$('.cell-inner-container'));
		const templateDisposables = new DisposableStore();
		const contextKeyService = templateDisposables.add(this.contextKeyServiceProvider(container));
		const decorationContainer = DOM.append(rootContainer, $('.cell-decoration'));
		const titleToolbarContainer = DOM.append(container, $('.cell-title-toolbar'));

		const focusIndicatorTop = new FastDomNode(DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-top')));
		const focusIndicatorLeft = new FastDomNode(DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left')));
		const foldingIndicator = DOM.append(focusIndicatorLeft.domNode, DOM.$('.notebook-folding-indicator'));
		const focusIndicatorRight = new FastDomNode(DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-right')));

		const codeInnerContent = DOM.append(container, $('.cell.code'));
		const editorPart = DOM.append(codeInnerContent, $('.cell-editor-part'));
		const cellChatPart = DOM.append(editorPart, $('.cell-chat-part'));
		const cellInputCollapsedContainer = DOM.append(codeInnerContent, $('.input-collapse-container'));
		cellInputCollapsedContainer.style.display = 'none';
		const editorContainer = DOM.append(editorPart, $('.cell-editor-container'));
		editorPart.style.display = 'none';
		const cellCommentPartContainer = DOM.append(container, $('.cell-comment-container'));
		const innerContent = DOM.append(container, $('.cell.markdown'));
		const bottomCellContainer = DOM.append(container, $('.cell-bottom-toolbar-container'));

		const scopedInstaService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		const rootClassDelegate = {
			toggle: (className: string, force?: boolean) => container.classList.toggle(className, force)
		};
		const titleToolbar = templateDisposables.add(scopedInstaService.createInstance(
			CellTitleToolbarPart,
			titleToolbarContainer,
			rootClassDelegate,
			this.notebookEditor.creationOptions.menuIds.cellTitleToolbar,
			this.notebookEditor.creationOptions.menuIds.cellDeleteToolbar,
			this.notebookEditor));
		const focusIndicatorBottom = new FastDomNode(DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-bottom')));

		const cellParts = new CellPartsCollection(DOM.getWindow(rootContainer), [
			templateDisposables.add(scopedInstaService.createInstance(CellChatPart, this.notebookEditor, cellChatPart)),
			templateDisposables.add(scopedInstaService.createInstance(CellEditorStatusBar, this.notebookEditor, container, editorPart, undefined)),
			templateDisposables.add(new CellFocusIndicator(this.notebookEditor, titleToolbar, focusIndicatorTop, focusIndicatorLeft, focusIndicatorRight, focusIndicatorBottom)),
			templateDisposables.add(new FoldedCellHint(this.notebookEditor, DOM.append(container, $('.notebook-folded-hint')), this._notebookExecutionStateService)),
			templateDisposables.add(new CellDecorations(rootContainer, decorationContainer)),
			templateDisposables.add(scopedInstaService.createInstance(CellComments, this.notebookEditor, cellCommentPartContainer)),
			templateDisposables.add(new CollapsedCellInput(this.notebookEditor, cellInputCollapsedContainer)),
			templateDisposables.add(new CellFocusPart(container, undefined, this.notebookEditor)),
			templateDisposables.add(new CellDragAndDropPart(container)),
			templateDisposables.add(scopedInstaService.createInstance(CellContextKeyPart, this.notebookEditor)),
		], [
			titleToolbar,
			templateDisposables.add(scopedInstaService.createInstance(BetweenCellToolbar, this.notebookEditor, titleToolbarContainer, bottomCellContainer))
		]);

		templateDisposables.add(cellParts);

		const templateData: MarkdownCellRenderTemplate = {
			rootContainer,
			cellInputCollapsedContainer,
			instantiationService: scopedInstaService,
			container,
			cellContainer: innerContent,
			editorPart,
			editorContainer,
			foldingIndicator,
			templateDisposables,
			elementDisposables: new DisposableStore(),
			cellParts,
			toJSON: () => { return {}; }
		};

		return templateData;
	}

	renderElement(element: MarkupCellViewModel, index: number, templateData: MarkdownCellRenderTemplate, height: number | undefined): void {
		if (!this.notebookEditor.hasModel()) {
			throw new Error('The notebook editor is not attached with view model yet.');
		}

		templateData.currentRenderedCell = element;
		templateData.currentEditor = undefined;
		templateData.editorPart.style.display = 'none';
		templateData.cellContainer.innerText = '';

		if (height === undefined) {
			return;
		}

		templateData.elementDisposables.add(templateData.instantiationService.createInstance(MarkupCell, this.notebookEditor, element, templateData, this.renderedEditors));
	}

	disposeTemplate(templateData: MarkdownCellRenderTemplate): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}

	disposeElement(_element: ICellViewModel, _index: number, templateData: MarkdownCellRenderTemplate): void {
		templateData.elementDisposables.clear();
	}
}

export class CodeCellRenderer extends AbstractCellRenderer implements IListRenderer<CodeCellViewModel, CodeCellRenderTemplate> {
	static readonly TEMPLATE_ID = 'code_cell';

	constructor(
		notebookEditor: INotebookEditorDelegate,
		private renderedEditors: Map<ICellViewModel, ICodeEditor>,
		private editorPool: NotebookCellEditorPool,
		dndController: CellDragAndDropController,
		contextKeyServiceProvider: (container: HTMLElement) => IScopedContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IMenuService menuService: IMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
	) {
		super(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, PLAINTEXT_LANGUAGE_ID, dndController);
	}

	get templateId() {
		return CodeCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(rootContainer: HTMLElement): CodeCellRenderTemplate {
		rootContainer.classList.add('code-cell-row');
		const container = DOM.append(rootContainer, DOM.$('.cell-inner-container'));
		const templateDisposables = new DisposableStore();
		const contextKeyService = templateDisposables.add(this.contextKeyServiceProvider(container));
		const decorationContainer = DOM.append(rootContainer, $('.cell-decoration'));
		const focusIndicatorTop = new FastDomNode(DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-top')));
		const titleToolbarContainer = DOM.append(container, $('.cell-title-toolbar'));

		// This is also the drag handle
		const focusIndicatorLeft = new FastDomNode(DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left')));
		const cellChatPart = DOM.append(container, $('.cell-chat-part'));
		const cellContainer = DOM.append(container, $('.cell.code'));
		const runButtonContainer = DOM.append(cellContainer, $('.run-button-container'));
		const cellInputCollapsedContainer = DOM.append(cellContainer, $('.input-collapse-container'));
		cellInputCollapsedContainer.style.display = 'none';
		const executionOrderLabel = DOM.append(focusIndicatorLeft.domNode, $('div.execution-count-label'));
		executionOrderLabel.title = localize('cellExecutionOrderCountLabel', 'Execution Order');
		const editorPart = DOM.append(cellContainer, $('.cell-editor-part'));
		const editorContainer = DOM.append(editorPart, $('.cell-editor-container'));
		const cellCommentPartContainer = DOM.append(container, $('.cell-comment-container'));

		// create a special context key service that set the inCompositeEditor-contextkey
		const editorContextKeyService = templateDisposables.add(this.contextKeyServiceProvider(editorPart));
		const editorInstaService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService])));
		EditorContextKeys.inCompositeEditor.bindTo(editorContextKeyService).set(true);

		const editor = editorInstaService.createInstance(CodeEditorWidget, editorContainer, {
			...this.editorOptions.getDefaultValue(),
			dimension: {
				width: 0,
				height: 0
			},
			scrollbar: {
				vertical: 'hidden',
				horizontal: 'auto',
				handleMouseWheel: false,
				useShadows: false,
			},
		}, {
			contributions: this.notebookEditor.creationOptions.cellEditorContributions
		});

		templateDisposables.add(editor);

		const outputContainer = new FastDomNode(DOM.append(container, $('.output')));
		const cellOutputCollapsedContainer = DOM.append(outputContainer.domNode, $('.output-collapse-container'));
		const outputShowMoreContainer = new FastDomNode(DOM.append(container, $('.output-show-more-container')));
		const focusIndicatorRight = new FastDomNode(DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-right')));
		const focusSinkElement = DOM.append(container, $('.cell-editor-focus-sink'));
		focusSinkElement.setAttribute('tabindex', '0');
		const bottomCellToolbarContainer = DOM.append(container, $('.cell-bottom-toolbar-container'));
		const focusIndicatorBottom = new FastDomNode(DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-bottom')));

		const scopedInstaService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		const rootClassDelegate = {
			toggle: (className: string, force?: boolean) => container.classList.toggle(className, force)
		};
		const titleToolbar = templateDisposables.add(scopedInstaService.createInstance(
			CellTitleToolbarPart,
			titleToolbarContainer,
			rootClassDelegate,
			this.notebookEditor.creationOptions.menuIds.cellTitleToolbar,
			this.notebookEditor.creationOptions.menuIds.cellDeleteToolbar,
			this.notebookEditor));

		const focusIndicatorPart = templateDisposables.add(new CellFocusIndicator(this.notebookEditor, titleToolbar, focusIndicatorTop, focusIndicatorLeft, focusIndicatorRight, focusIndicatorBottom));
		const cellParts = new CellPartsCollection(DOM.getWindow(rootContainer), [
			focusIndicatorPart,
			templateDisposables.add(scopedInstaService.createInstance(CellChatPart, this.notebookEditor, cellChatPart)),
			templateDisposables.add(scopedInstaService.createInstance(CellEditorStatusBar, this.notebookEditor, container, editorPart, editor)),
			templateDisposables.add(scopedInstaService.createInstance(CellProgressBar, editorPart, cellInputCollapsedContainer)),
			templateDisposables.add(scopedInstaService.createInstance(RunToolbar, this.notebookEditor, contextKeyService, container, runButtonContainer)),
			templateDisposables.add(new CellDecorations(rootContainer, decorationContainer)),
			templateDisposables.add(scopedInstaService.createInstance(CellComments, this.notebookEditor, cellCommentPartContainer)),
			templateDisposables.add(scopedInstaService.createInstance(CellExecutionPart, this.notebookEditor, executionOrderLabel)),
			templateDisposables.add(scopedInstaService.createInstance(CollapsedCellOutput, this.notebookEditor, cellOutputCollapsedContainer)),
			templateDisposables.add(new CollapsedCellInput(this.notebookEditor, cellInputCollapsedContainer)),
			templateDisposables.add(new CellFocusPart(container, focusSinkElement, this.notebookEditor)),
			templateDisposables.add(new CellDragAndDropPart(container)),
			templateDisposables.add(scopedInstaService.createInstance(CellContextKeyPart, this.notebookEditor)),
		], [
			titleToolbar,
			templateDisposables.add(scopedInstaService.createInstance(BetweenCellToolbar, this.notebookEditor, titleToolbarContainer, bottomCellToolbarContainer))
		]);

		templateDisposables.add(cellParts);

		const templateData: CodeCellRenderTemplate = {
			rootContainer,
			editorPart,
			cellInputCollapsedContainer,
			cellOutputCollapsedContainer,
			instantiationService: scopedInstaService,
			container,
			cellContainer,
			focusSinkElement,
			outputContainer,
			outputShowMoreContainer,
			editor,
			templateDisposables,
			elementDisposables: new DisposableStore(),
			cellParts,
			toJSON: () => { return {}; }
		};

		// focusIndicatorLeft covers the left margin area
		// code/outputFocusIndicator need to be registered as drag handlers so their click handlers don't take over
		const dragHandles = [focusIndicatorLeft.domNode, focusIndicatorPart.codeFocusIndicator.domNode, focusIndicatorPart.outputFocusIndicator.domNode];
		this.dndController?.registerDragHandle(templateData, rootContainer, dragHandles, () => new CodeCellDragImageRenderer().getDragImage(templateData, templateData.editor, 'code'));
		return templateData;
	}

	renderElement(element: CodeCellViewModel, index: number, templateData: CodeCellRenderTemplate, height: number | undefined): void {
		if (!this.notebookEditor.hasModel()) {
			throw new Error('The notebook editor is not attached with view model yet.');
		}

		templateData.currentRenderedCell = element;

		if (height === undefined) {
			return;
		}

		templateData.outputContainer.domNode.innerText = '';
		templateData.outputContainer.domNode.appendChild(templateData.cellOutputCollapsedContainer);

		templateData.elementDisposables.add(templateData.instantiationService.createInstance(CodeCell, this.notebookEditor, element, templateData, this.editorPool));
		this.renderedEditors.set(element, templateData.editor);
	}

	disposeTemplate(templateData: CodeCellRenderTemplate): void {
		templateData.templateDisposables.clear();
	}

	disposeElement(element: ICellViewModel, index: number, templateData: CodeCellRenderTemplate, height: number | undefined): void {
		templateData.elementDisposables.clear();
		this.renderedEditors.delete(element);
	}
}
