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
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InsertCodeCellAboveAction, INotebookCellActionContext, InsertCodeCellBelowAction, InsertMarkdownCellAboveAction, InsertMarkdownCellBelowAction, EditCellAction, SaveCellAction, DeleteCellAction, MoveCellUpAction, MoveCellDownAction } from 'vs/workbench/contrib/notebook/browser/contrib/notebookActions';
import { CellRenderTemplate, INotebookEditor, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CodeCell } from 'vs/workbench/contrib/notebook/browser/view/renderers/codeCell';
import { StatefullMarkdownCell } from 'vs/workbench/contrib/notebook/browser/view/renderers/markdownCell';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellViewModel } from '../../viewModel/notebookCellViewModel';
import { ContextAwareMenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuItemAction } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { EDITOR_TOOLBAR_HEIGHT, EDITOR_TOP_PADDING, EDITOR_BOTTOM_PADDING } from 'vs/workbench/contrib/notebook/browser/constants';

export class NotebookCellListDelegate implements IListVirtualDelegate<ICellViewModel> {
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

export class MarkdownCellRenderer extends AbstractCellRenderer implements IListRenderer<ICellViewModel, CellRenderTemplate> {
	static readonly TEMPLATE_ID = 'markdown_cell';
	private disposables: Map<ICellViewModel, DisposableStore> = new Map();

	constructor(
		notehookEditor: INotebookEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
	) {
		super(instantiationService, notehookEditor, contextMenuService, configurationService, keybindingService, notificationService, 'markdown');
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
		toolbar.setActions([
			this.instantiationService.createInstance(MoveCellUpAction),
			this.instantiationService.createInstance(MoveCellDownAction),
			this.instantiationService.createInstance(InsertCodeCellBelowAction),
			this.instantiationService.createInstance(EditCellAction),
			this.instantiationService.createInstance(SaveCellAction),
			this.instantiationService.createInstance(DeleteCellAction)
		])();
		disposables.add(toolbar);

		container.appendChild(codeInnerContent);

		const innerContent = document.createElement('div');
		DOM.addClasses(innerContent, 'cell', 'markdown');
		container.appendChild(innerContent);

		const action = document.createElement('div');
		DOM.addClasses(action, 'menu', 'codicon-settings-gear', 'codicon');
		container.appendChild(action);

		DOM.append(container, DOM.$('.notebook-cell-focus-indicator'));

		return {
			container: container,
			cellContainer: innerContent,
			menuContainer: action,
			editingContainer: codeInnerContent,
			disposables,
			toolbar
		};
	}

	renderElement(element: CellViewModel, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
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

			elementDisposable!.add(DOM.addStandardDisposableListener(templateData.menuContainer!, 'mousedown', e => {
				const { top, height } = DOM.getDomNodePagePosition(templateData.menuContainer!);
				e.preventDefault();

				const listIndexAttr = templateData.menuContainer?.parentElement?.getAttribute('data-index');
				const listIndex = listIndexAttr ? Number(listIndexAttr) : undefined;
				this.showContextMenu(listIndex, element, e.posx, top + height);
			}));

			elementDisposable!.add(DOM.addStandardDisposableListener(templateData.menuContainer!, DOM.EventType.MOUSE_LEAVE, e => {
				templateData.menuContainer?.classList.remove('mouseover');
			}));

			elementDisposable!.add(DOM.addStandardDisposableListener(templateData.menuContainer!, DOM.EventType.MOUSE_ENTER, e => {
				templateData.menuContainer?.classList.add('mouseover');
			}));

			elementDisposable!.add(new StatefullMarkdownCell(this.notebookEditor, element, templateData, this.editorOptions, this.instantiationService));
		}

		templateData.toolbar!.context = <INotebookCellActionContext>{
			cell: element,
			notebookEditor: this.notebookEditor
		};
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

export class CodeCellRenderer extends AbstractCellRenderer implements IListRenderer<ICellViewModel, CellRenderTemplate> {
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
	) {
		super(instantiationService, notebookEditor, contextMenuService, configurationService, keybindingService, notificationService, 'python');
	}

	get templateId() {
		return CodeCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): CellRenderTemplate {
		const disposables = new DisposableStore();
		const toolbarContainer = document.createElement('div');
		container.appendChild(toolbarContainer);
		DOM.addClasses(toolbarContainer, 'menu', 'codicon-settings-gear', 'codicon');
		const toolbar = this.createToolbar(container);
		toolbar.setActions([
			this.instantiationService.createInstance(MoveCellUpAction),
			this.instantiationService.createInstance(MoveCellDownAction),
			this.instantiationService.createInstance(InsertCodeCellBelowAction),
			this.instantiationService.createInstance(DeleteCellAction)
		])();
		disposables.add(toolbar);

		const cellContainer = document.createElement('div');
		DOM.addClasses(cellContainer, 'cell', 'code');
		container.appendChild(cellContainer);
		const editor = this.instantiationService.createInstance(CodeEditorWidget, cellContainer, {
			...this.editorOptions,
			dimension: {
				width: 0,
				height: 0
			}
		}, {});
		const menuContainer = document.createElement('div');
		DOM.addClasses(menuContainer, 'menu', 'codicon-settings-gear', 'codicon');
		container.appendChild(menuContainer);

		const focusIndicator = DOM.append(container, DOM.$('.notebook-cell-focus-indicator'));

		const outputContainer = document.createElement('div');
		DOM.addClasses(outputContainer, 'output');
		container.appendChild(outputContainer);

		return {
			container,
			cellContainer,
			menuContainer,
			focusIndicator,
			toolbar,
			outputContainer,
			editor,
			disposables
		};
	}

	renderElement(element: CellViewModel, index: number, templateData: CellRenderTemplate, height: number | undefined): void {
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

		elementDisposable?.add(DOM.addStandardDisposableListener(templateData.menuContainer!, 'mousedown', e => {
			let { top, height } = DOM.getDomNodePagePosition(templateData.menuContainer!);
			e.preventDefault();

			const listIndexAttr = templateData.menuContainer?.parentElement?.getAttribute('data-index');
			const listIndex = listIndexAttr ? Number(listIndexAttr) : undefined;

			this.showContextMenu(listIndex, element, e.posx, top + height);
		}));

		elementDisposable!.add(DOM.addStandardDisposableListener(templateData.menuContainer!, DOM.EventType.MOUSE_LEAVE, e => {
			templateData.menuContainer?.classList.remove('mouseover');
		}));

		elementDisposable!.add(DOM.addStandardDisposableListener(templateData.menuContainer!, DOM.EventType.MOUSE_ENTER, e => {
			templateData.menuContainer?.classList.add('mouseover');
		}));

		elementDisposable?.add(this.instantiationService.createInstance(CodeCell, this.notebookEditor, element, templateData));
		this.renderedEditors.set(element, templateData.editor);

		elementDisposable?.add(element.onDidChangeTotalHeight(() => {
			templateData.focusIndicator!.style.height = `${element.getIndicatorHeight()}px`;
		}));

		templateData.toolbar!.context = <INotebookCellActionContext>{
			cell: element,
			notebookEditor: this.notebookEditor
		};
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
