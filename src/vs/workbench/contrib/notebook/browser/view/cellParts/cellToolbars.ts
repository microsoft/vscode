/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IAction } from 'vs/base/common/actions';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { MarshalledId } from 'vs/base/common/marshalling';
import { createActionViewItem, createAndFillInActionBarActions, MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenu, IMenuService, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotebookCellToolbarActionContext } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { DeleteCellAction } from 'vs/workbench/contrib/notebook/browser/controller/editActions';
import { INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { BaseCellRenderTemplate, ICellToolbars, isCodeCellRenderTemplate } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { CodiconActionViewItem } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellActionView';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';

export class CellToolbars extends Disposable implements ICellToolbars {
	toolbar: ToolBar;
	deleteToolbar: ToolBar;
	betweenCellToolbar!: ToolBar;
	titleMenu: IMenu;
	cellDisposable: Disposable | null = null;

	constructor(
		readonly notebookEditor: INotebookEditorDelegate,
		readonly contextKeyService: IContextKeyService,
		readonly titleToolbarContainer: HTMLElement,
		readonly bottomCellToolbarContainer: HTMLElement,
		@IInstantiationService readonly instantiationService: IInstantiationService,
		@IContextMenuService readonly contextMenuService: IContextMenuService,
		@IKeybindingService readonly keybindingService: IKeybindingService,
		@IMenuService readonly menuService: IMenuService
	) {
		super();

		this.toolbar = this._register(this.createToolbar(this.titleToolbarContainer));
		this.deleteToolbar = this._register(this.createToolbar(titleToolbarContainer, 'cell-delete-toolbar'));
		if (!this.notebookEditor.creationOptions.isReadOnly) {
			this.deleteToolbar.setActions([this.instantiationService.createInstance(DeleteCellAction)]);
		}

		this.createBetweenCellToolbar();
		this.titleMenu = this._register(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.cellTitleToolbar, contextKeyService));
	}

	createToolbar(container: HTMLElement, elementClass?: string): ToolBar {
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

	createBetweenCellToolbar() {
		this.betweenCellToolbar = this._register(new ToolBar(this.bottomCellToolbarContainer, this.contextMenuService, {
			actionViewItemProvider: action => {
				if (action instanceof MenuItemAction) {
					if (this.notebookEditor.notebookOptions.getLayoutConfiguration().insertToolbarAlignment === 'center') {
						return this.instantiationService.createInstance(CodiconActionViewItem, action);
					} else {
						return this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined);
					}
				}

				return undefined;
			}
		}));

		const menu = this._register(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.cellInsertToolbar, this.contextKeyService));
		const updateActions = () => {
			const actions = this.getCellToolbarActions(menu);
			this.betweenCellToolbar.setActions(actions.primary, actions.secondary);
		};

		this._register(menu.onDidChange(() => updateActions()));
		this._register(this.notebookEditor.notebookOptions.onDidChangeOptions((e) => {
			if (e.insertToolbarAlignment) {
				updateActions();
			}
		}));
		updateActions();
	}

	getCellToolbarActions(menu: IMenu): { primary: IAction[]; secondary: IAction[]; } {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };

		createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, result, g => /^inline/.test(g));

		return result;
	}

	updateContext(element: CodeCellViewModel | MarkupCellViewModel, elementDisposables: DisposableStore) {
		const toolbarContext = <INotebookCellToolbarActionContext>{
			ui: true,
			cell: element,
			notebookEditor: this.notebookEditor,
			$mid: MarshalledId.NotebookCellActionContext
		};

		this.toolbar.context = toolbarContext;
		this.deleteToolbar.context = toolbarContext;
		this.betweenCellToolbar.context = toolbarContext;

		const bottomToolbarOffset = element.layoutInfo.bottomToolbarOffset;
		this.bottomCellToolbarContainer.style.transform = `translateY(${bottomToolbarOffset}px)`;

		elementDisposables.add(element.onDidChangeLayout(() => {
			const bottomToolbarOffset = element.layoutInfo.bottomToolbarOffset;
			this.bottomCellToolbarContainer.style.transform = `translateY(${bottomToolbarOffset}px)`;
		}));
	}

	setupCellToolbarActions(templateData: BaseCellRenderTemplate, disposables: DisposableStore): void {
		const updateActions = () => {
			const actions = this.getCellToolbarActions(this.titleMenu);

			const hadFocus = DOM.isAncestor(document.activeElement, this.toolbar.getElement());
			this.toolbar.setActions(actions.primary, actions.secondary);
			if (hadFocus) {
				this.notebookEditor.focus();
			}

			const layoutInfo = this.notebookEditor.notebookOptions.getLayoutConfiguration();
			if (actions.primary.length || actions.secondary.length) {
				templateData.container.classList.add('cell-has-toolbar-actions');
				if (isCodeCellRenderTemplate(templateData)) {
					templateData.focusIndicatorLeft.domNode.style.transform = `translateY(${layoutInfo.editorToolbarHeight + layoutInfo.cellTopMargin}px)`;
					templateData.focusIndicatorRight.domNode.style.transform = `translateY(${layoutInfo.editorToolbarHeight + layoutInfo.cellTopMargin}px)`;
				}
			} else {
				templateData.container.classList.remove('cell-has-toolbar-actions');
				if (isCodeCellRenderTemplate(templateData)) {
					templateData.focusIndicatorLeft.domNode.style.transform = `translateY(${layoutInfo.cellTopMargin}px)`;
					templateData.focusIndicatorRight.domNode.style.transform = `translateY(${layoutInfo.cellTopMargin}px)`;
				}
			}
		};

		// #103926
		let dropdownIsVisible = false;
		let deferredUpdate: (() => void) | undefined;

		updateActions();
		disposables.add(this.titleMenu.onDidChange(() => {
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
		disposables.add(this.toolbar.onDidChangeDropdownVisibility(visible => {
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
}
