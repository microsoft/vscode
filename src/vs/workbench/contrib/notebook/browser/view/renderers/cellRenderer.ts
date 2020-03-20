/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel } from 'vs/base/browser/browser';
import * as DOM from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IAction } from 'vs/base/common/actions';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { deepClone } from 'vs/base/common/objects';
import 'vs/css!vs/workbench/contrib/notebook/browser/notebook';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { ContextAwareMenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuItemAction } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { EDITOR_BOTTOM_PADDING, EDITOR_TOOLBAR_HEIGHT, EDITOR_TOP_PADDING, NOTEBOOK_CELL_TYPE_CONTEXT_KEY } from 'vs/workbench/contrib/notebook/browser/constants';
import { DeleteCellAction, EditCellAction, ExecuteCellAction, INotebookCellActionContext, InsertCodeCellBelowAction, MoveCellDownAction, MoveCellUpAction, SaveCellAction, InsertCodeCellAboveAction, InsertMarkdownCellAboveAction, InsertMarkdownCellBelowAction } from 'vs/workbench/contrib/notebook/browser/contrib/notebookActions';
import { CellRenderTemplate, ICellViewModel, INotebookEditor, CellRunState } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CodeCell } from 'vs/workbench/contrib/notebook/browser/view/renderers/codeCell';
import { StatefullMarkdownCell } from 'vs/workbench/contrib/notebook/browser/view/renderers/markdownCell';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CellMenus } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellMenus';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { MarkdownCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markdownCellViewModel';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';

const $ = DOM.$;

export class NotebookCellListDelegate implements IListVirtualDelegate<CellViewModel> {
	private _lineHeight: number;
	private _toolbarHeight = EDITOR_TOOLBAR_HEIGHT;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
		this._lineHeight = BareFontInfo.createFromRawSettings(editorOptions, getZoomLevel()).lineHeight;
	}

	getHeight(element: CellViewModel): number {
		return element.getHeight(this._lineHeight) + this._toolbarHeight;
	}

	hasDynamicHeight(element: CellViewModel): boolean {
		return element.hasDynamicHeight();
	}

	getTemplateId(element: CellViewModel): string {
		if (element.cellKind === CellKind.Markdown) {
			return MarkdownCellRenderer.TEMPLATE_ID;
		} else {
			return CodeCellRenderer.TEMPLATE_ID;
		}
	}
}

abstract class AbstractCellRenderer {
	protected editorOptions: IEditorOptions;

	constructor(
		protected readonly instantiationService: IInstantiationService,
		protected readonly notebookEditor: INotebookEditor,
		protected readonly contextMenuService: IContextMenuService,
		private readonly configurationService: IConfigurationService,
		private readonly keybindingService: IKeybindingService,
		private readonly notificationService: INotificationService,
		protected readonly contextKeyService: IContextKeyService,
		language: string,
	) {
		const editorOptions = deepClone(this.configurationService.getValue<IEditorOptions>('editor', { overrideIdentifier: language }));
		this.editorOptions = {
			...editorOptions,
			padding: {
				top: EDITOR_TOP_PADDING,
				bottom: EDITOR_BOTTOM_PADDING
			},
			scrollBeyondLastLine: false,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false,
				alwaysConsumeMouseWheel: false
			},
			overviewRulerLanes: 3,
			fixedOverflowWidgets: false,
			lineNumbersMinChars: 1,
			minimap: { enabled: false },
		};
	}

	protected createToolbar(container: HTMLElement): ToolBar {
		const toolbar = new ToolBar(container, this.contextMenuService, {
			actionViewItemProvider: action => {
				if (action instanceof MenuItemAction) {
					const item = new ContextAwareMenuEntryActionViewItem(action, this.keybindingService, this.notificationService, this.contextMenuService);
					return item;
				}

				return undefined;
			}
		});

		return toolbar;
	}

	protected createMenu(): CellMenus {
		const menu = this.instantiationService.createInstance(CellMenus);
		return menu;
	}

	abstract getCellToolbarActions(element: CellViewModel): IAction[];

	showContextMenu(listIndex: number | undefined, element: CellViewModel, x: number, y: number) {
		const actions: IAction[] = [
			this.instantiationService.createInstance(InsertCodeCellAboveAction),
			this.instantiationService.createInstance(InsertCodeCellBelowAction),
			this.instantiationService.createInstance(InsertMarkdownCellAboveAction),
			this.instantiationService.createInstance(InsertMarkdownCellBelowAction),
		];
		actions.push(...this.getAdditionalContextMenuActions());
		actions.push(...[
			this.instantiationService.createInstance(DeleteCellAction)
		]);

		this.contextMenuService.showContextMenu({
			getAnchor: () => {
				return {
					x,
					y
				};
			},
			getActions: () => actions,
			getActionsContext: () => <INotebookCellActionContext>{
				cell: element,
				notebookEditor: this.notebookEditor
			},
			autoSelectFirstItem: false
		});
	}

	abstract getAdditionalContextMenuActions(): IAction[];
}

export class MarkdownCellRenderer extends AbstractCellRenderer implements IListRenderer<MarkdownCellViewModel, CellRenderTemplate> {
	static readonly TEMPLATE_ID = 'markdown_cell';
	private disposables: Map<ICellViewModel, DisposableStore> = new Map();

	constructor(
		notehookEditor: INotebookEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(instantiationService, notehookEditor, contextMenuService, configurationService, keybindingService, notificationService, contextKeyService, 'markdown');
	}

	get templateId() {
		return MarkdownCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): CellRenderTemplate {
		const codeInnerContent = document.createElement('div');
		DOM.addClasses(codeInnerContent, 'cell', 'code');
		codeInnerContent.style.display = 'none';

		const disposables = new DisposableStore();
		const toolbar = this.createToolbar(container);
		disposables.add(toolbar);

		container.appendChild(codeInnerContent);

		const innerContent = document.createElement('div');
		DOM.addClasses(innerContent, 'cell', 'markdown');
		container.appendChild(innerContent);

		DOM.append(container, DOM.$('.notebook-cell-focus-indicator'));

		return {
			container: container,
			cellContainer: innerContent,
			editingContainer: codeInnerContent,
			disposables,
			toolbar
		};
	}

	renderElement(element: MarkdownCellViewModel, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
		templateData.editingContainer!.style.display = 'none';
		templateData.cellContainer.innerHTML = '';
		let renderedHTML = element.getHTML();
		if (renderedHTML) {
			templateData.cellContainer.appendChild(renderedHTML);
		}

		if (height) {
			this.disposables.get(element)?.clear();
			if (!this.disposables.has(element)) {
				this.disposables.set(element, new DisposableStore());
			}
			let elementDisposable = this.disposables.get(element);

			elementDisposable!.add(new StatefullMarkdownCell(this.notebookEditor, element, templateData, this.editorOptions, this.instantiationService));

			const contextKeyService = this.contextKeyService.createScoped(templateData.container);
			contextKeyService.createKey(NOTEBOOK_CELL_TYPE_CONTEXT_KEY, 'markdown');
			const toolbarActions = this.getCellToolbarActions(element);
			templateData.toolbar!.setActions(toolbarActions)();

			if (templateData.focusIndicator) {
				if (!toolbarActions.length) {
					templateData.focusIndicator.style.top = `8px`;
				} else {
					templateData.focusIndicator.style.top = `24px`;
				}
			}
		}

		templateData.toolbar!.context = <INotebookCellActionContext>{
			cell: element,
			notebookEditor: this.notebookEditor,
			$mid: 12
		};
	}

	getCellToolbarActions(element: MarkdownCellViewModel): IAction[] {
		const viewModel = this.notebookEditor.viewModel;

		if (!viewModel) {
			return [];
		}

		const menu = this.createMenu().getCellTitleActions(this.contextKeyService);
		const actions: IAction[] = [];
		for (let [, actions] of menu.getActions({ shouldForwardArgs: true })) {
			actions.push(...actions);
		}

		const metadata = viewModel.metadata;

		if (!metadata || metadata.editable) {
			actions.push(
				this.instantiationService.createInstance(MoveCellUpAction),
				this.instantiationService.createInstance(MoveCellDownAction),
				this.instantiationService.createInstance(InsertCodeCellBelowAction)
			);
		}

		const cellMetadata = element.metadata;
		if (!cellMetadata || cellMetadata.editable) {
			actions.push(
				this.instantiationService.createInstance(EditCellAction),
				this.instantiationService.createInstance(SaveCellAction)
			);
		}

		if (!metadata || metadata.editable) {
			this.instantiationService.createInstance(DeleteCellAction);
		}

		return actions;
	}

	getAdditionalContextMenuActions(): IAction[] {
		return [
			this.instantiationService.createInstance(EditCellAction),
			this.instantiationService.createInstance(SaveCellAction),
		];
	}

	disposeTemplate(templateData: CellRenderTemplate): void {
		// throw nerendererw Error('Method not implemented.');

	}

	disposeElement(element: ICellViewModel, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
		if (height) {
			this.disposables.get(element)?.clear();
		}
	}
}

export class CodeCellRenderer extends AbstractCellRenderer implements IListRenderer<CodeCellViewModel, CellRenderTemplate> {
	static readonly TEMPLATE_ID = 'code_cell';
	private disposables: Map<ICellViewModel, DisposableStore> = new Map();

	constructor(
		protected notebookEditor: INotebookEditor,
		private renderedEditors: Map<ICellViewModel, ICodeEditor | undefined>,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(instantiationService, notebookEditor, contextMenuService, configurationService, keybindingService, notificationService, contextKeyService, 'python');
	}

	get templateId() {
		return CodeCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): CellRenderTemplate {
		const disposables = new DisposableStore();
		const toolbar = this.createToolbar(container);
		toolbar.setActions([
			this.instantiationService.createInstance(MoveCellUpAction),
			this.instantiationService.createInstance(MoveCellDownAction),
			this.instantiationService.createInstance(InsertCodeCellBelowAction),
			this.instantiationService.createInstance(DeleteCellAction)
		])();
		disposables.add(toolbar);

		const cellContainer = DOM.append(container, $('.cell.code'));
		const runButtonContainer = DOM.append(cellContainer, $('.run-button-container'));
		const runToolbar = this.createToolbar(runButtonContainer);
		runToolbar.setActions([
			this.instantiationService.createInstance(ExecuteCellAction)
		])();
		disposables.add(runToolbar);

		const editorContainer = DOM.append(cellContainer, $('.cell-editor-container'));
		const editor = this.instantiationService.createInstance(CodeEditorWidget, editorContainer, {
			...this.editorOptions,
			dimension: {
				width: 0,
				height: 0
			}
		}, {});

		const focusIndicator = DOM.append(container, DOM.$('.notebook-cell-focus-indicator'));

		const outputContainer = document.createElement('div');
		DOM.addClasses(outputContainer, 'output');
		container.appendChild(outputContainer);

		const progressBar = new ProgressBar(editorContainer);
		progressBar.hide();
		disposables.add(progressBar);

		return {
			container,
			cellContainer,
			editorContainer,
			progressBar,
			focusIndicator,
			toolbar,
			runToolbar,
			outputContainer,
			editor,
			disposables
		};
	}

	renderElement(element: CodeCellViewModel, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
		if (height === undefined) {
			return;
		}

		if (templateData.outputContainer) {
			templateData.outputContainer!.innerHTML = '';
		}

		this.disposables.get(element)?.clear();
		if (!this.disposables.has(element)) {
			this.disposables.set(element, new DisposableStore());
		}

		const elementDisposable = this.disposables.get(element);

		elementDisposable?.add(this.instantiationService.createInstance(CodeCell, this.notebookEditor, element, templateData));
		this.renderedEditors.set(element, templateData.editor);

		elementDisposable?.add(element.onDidChangeLayout(() => {
			templateData.focusIndicator!.style.height = `${element.layoutInfo.indicatorHeight}px`;
		}));

		elementDisposable?.add(element.onDidChangeCellRunState(() => {
			if (element.runState === CellRunState.Running) {
				templateData.progressBar?.infinite().show();
			} else {
				templateData.progressBar?.hide();
			}
		}));

		const toolbarContext = <INotebookCellActionContext>{
			cell: element,
			cellTemplate: templateData,
			notebookEditor: this.notebookEditor,
			$mid: 12
		};

		const contextKeyService = this.contextKeyService.createScoped(templateData.container);
		contextKeyService.createKey(NOTEBOOK_CELL_TYPE_CONTEXT_KEY, 'code');
		const toolbarActions = this.getCellToolbarActions(element);
		templateData.toolbar!.setActions(toolbarActions)();
		templateData.toolbar!.context = toolbarContext;
		templateData.runToolbar!.context = toolbarContext;

		if (templateData.focusIndicator) {
			if (!toolbarActions.length) {
				templateData.focusIndicator.style.top = `8px`;
			} else {
				templateData.focusIndicator.style.top = `24px`;
			}
		}
	}


	getCellToolbarActions(element: CodeCellViewModel): IAction[] {
		const viewModel = this.notebookEditor.viewModel;

		if (!viewModel) {
			return [];
		}

		const menu = this.createMenu().getCellTitleActions(this.contextKeyService);
		const actions: IAction[] = [];
		for (let [, actions] of menu.getActions({ shouldForwardArgs: true })) {
			actions.push(...actions);
		}

		const metadata = viewModel.metadata;

		if (!metadata || metadata.editable) {
			actions.push(
				this.instantiationService.createInstance(MoveCellUpAction),
				this.instantiationService.createInstance(MoveCellDownAction),
				this.instantiationService.createInstance(InsertCodeCellBelowAction),
				this.instantiationService.createInstance(DeleteCellAction)
			);
		}

		return actions;
	}


	getAdditionalContextMenuActions(): IAction[] {
		return [];
	}

	disposeTemplate(templateData: CellRenderTemplate): void {
		templateData.disposables.clear();
	}

	disposeElement(element: ICellViewModel, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
		this.disposables.get(element)?.clear();
		this.renderedEditors.delete(element);
		templateData.focusIndicator!.style.height = 'initial';
	}
}
