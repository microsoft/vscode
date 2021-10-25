/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ToggleMenuAction, ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IAction, Separator } from 'vs/base/common/actions';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenu, IMenuService, MenuItemAction, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { toolbarActiveBackground } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { SELECT_KERNEL_ID } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { INotebookEditorDelegate, NOTEBOOK_EDITOR_ID } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebooKernelActionViewItem } from 'vs/workbench/contrib/notebook/browser/viewParts/notebookKernelActionViewItem';
import { ActionViewWithLabel } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellActionView';
import { GlobalToolbarShowLabel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITASExperimentService } from 'vs/workbench/services/experiment/common/experimentService';
import { NotebookOptions } from 'vs/workbench/contrib/notebook/common/notebookOptions';

interface IActionModel {
	action: IAction; size: number; visible: boolean;
}

const TOGGLE_MORE_ACTION_WIDTH = 21;
const ACTION_PADDING = 8;

export class NotebookEditorToolbar extends Disposable {
	// private _editorToolbarContainer!: HTMLElement;
	private _leftToolbarScrollable!: DomScrollableElement;
	private _notebookTopLeftToolbarContainer!: HTMLElement;
	private _notebookTopRightToolbarContainer!: HTMLElement;
	private _notebookGlobalActionsMenu!: IMenu;
	private _notebookLeftToolbar!: ToolBar;
	private _primaryActions: IActionModel[];
	private _secondaryActions: IAction[];
	private _notebookRightToolbar!: ToolBar;
	private _useGlobalToolbar: boolean = false;
	private _renderLabel: boolean = true;

	private readonly _onDidChangeState = this._register(new Emitter<void>());
	onDidChangeState: Event<void> = this._onDidChangeState.event;

	get useGlobalToolbar(): boolean {
		return this._useGlobalToolbar;
	}

	private _dimension: DOM.Dimension | null = null;
	private _pendingLayout: IDisposable | undefined;

	constructor(
		readonly notebookEditor: INotebookEditorDelegate,
		readonly contextKeyService: IContextKeyService,
		readonly notebookOptions: NotebookOptions,
		readonly domNode: HTMLElement,
		@IInstantiationService readonly instantiationService: IInstantiationService,
		@IConfigurationService readonly configurationService: IConfigurationService,
		@IContextMenuService readonly contextMenuService: IContextMenuService,
		@IMenuService readonly menuService: IMenuService,
		@IEditorService private readonly editorService: IEditorService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ITASExperimentService private readonly experimentService: ITASExperimentService
	) {
		super();

		this._primaryActions = [];
		this._secondaryActions = [];
		this._buildBody();

		this._register(this.editorService.onDidActiveEditorChange(() => {
			if (this.editorService.activeEditorPane?.getId() === NOTEBOOK_EDITOR_ID) {
				const notebookEditor = this.editorService.activeEditorPane.getControl() as INotebookEditorDelegate;
				if (notebookEditor === this.notebookEditor) {
					// this is the active editor
					this._showNotebookActionsinEditorToolbar();
					return;
				}
			}
		}));

		this._reigsterNotebookActionsToolbar();
	}

	private _buildBody() {
		this._notebookTopLeftToolbarContainer = document.createElement('div');
		this._notebookTopLeftToolbarContainer.classList.add('notebook-toolbar-left');
		this._leftToolbarScrollable = new DomScrollableElement(this._notebookTopLeftToolbarContainer, {
			vertical: ScrollbarVisibility.Hidden,
			horizontal: ScrollbarVisibility.Auto,
			horizontalScrollbarSize: 3,
			useShadows: false,
			scrollYToX: true
		});
		this._register(this._leftToolbarScrollable);

		DOM.append(this.domNode, this._leftToolbarScrollable.getDomNode());
		this._notebookTopRightToolbarContainer = document.createElement('div');
		this._notebookTopRightToolbarContainer.classList.add('notebook-toolbar-right');
		DOM.append(this.domNode, this._notebookTopRightToolbarContainer);
	}

	private _reigsterNotebookActionsToolbar() {
		this._notebookGlobalActionsMenu = this._register(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.notebookToolbar, this.contextKeyService));
		this._register(this._notebookGlobalActionsMenu);

		this._useGlobalToolbar = this.notebookOptions.getLayoutConfiguration().globalToolbar;
		this._renderLabel = this.configurationService.getValue<boolean>(GlobalToolbarShowLabel);

		const context = {
			ui: true,
			notebookEditor: this.notebookEditor
		};

		const actionProvider = (action: IAction) => {
			if (action.id === SELECT_KERNEL_ID) {
				// 	// this is being disposed by the consumer
				return this.instantiationService.createInstance(NotebooKernelActionViewItem, action, this.notebookEditor);
			}

			if (this._renderLabel) {
				return action instanceof MenuItemAction ? this.instantiationService.createInstance(ActionViewWithLabel, action) : undefined;
			} else {
				return action instanceof MenuItemAction ? this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined) : undefined;
			}
		};

		this._notebookLeftToolbar = new ToolBar(this._notebookTopLeftToolbarContainer, this.contextMenuService, {
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			actionViewItemProvider: actionProvider,
			renderDropdownAsChildElement: true
		});
		this._register(this._notebookLeftToolbar);
		this._notebookLeftToolbar.context = context;

		this._notebookRightToolbar = new ToolBar(this._notebookTopRightToolbarContainer, this.contextMenuService, {
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			actionViewItemProvider: actionProvider,
			renderDropdownAsChildElement: true
		});
		this._register(this._notebookRightToolbar);
		this._notebookRightToolbar.context = context;

		this._showNotebookActionsinEditorToolbar();
		let dropdownIsVisible = false;
		let deferredUpdate: (() => void) | undefined;

		this._register(this._notebookGlobalActionsMenu.onDidChange(() => {
			if (dropdownIsVisible) {
				deferredUpdate = () => this._showNotebookActionsinEditorToolbar();
				return;
			}

			this._showNotebookActionsinEditorToolbar();
		}));

		this._register(this._notebookLeftToolbar.onDidChangeDropdownVisibility(visible => {
			dropdownIsVisible = visible;

			if (deferredUpdate && !visible) {
				setTimeout(() => {
					if (deferredUpdate) {
						deferredUpdate();
					}
				}, 0);
				deferredUpdate = undefined;
			}
		}));

		this._register(this.notebookOptions.onDidChangeOptions(e => {
			if (e.globalToolbar !== undefined) {
				this._useGlobalToolbar = this.notebookOptions.getLayoutConfiguration().globalToolbar;
				this._showNotebookActionsinEditorToolbar();
			}
		}));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(GlobalToolbarShowLabel)) {
				this._renderLabel = this.configurationService.getValue<boolean>(GlobalToolbarShowLabel);
				const oldElement = this._notebookLeftToolbar.getElement();
				oldElement.parentElement?.removeChild(oldElement);
				this._notebookLeftToolbar.dispose();
				this._notebookLeftToolbar = new ToolBar(this._notebookTopLeftToolbarContainer, this.contextMenuService, {
					getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
					actionViewItemProvider: actionProvider,
					renderDropdownAsChildElement: true
				});
				this._register(this._notebookLeftToolbar);
				this._notebookLeftToolbar.context = context;
				this._showNotebookActionsinEditorToolbar();
				return;
			}
		}));

		if (this.experimentService) {
			this.experimentService.getTreatment<boolean>('nbtoolbarineditor').then(treatment => {
				if (treatment === undefined) {
					return;
				}
				if (this._useGlobalToolbar !== treatment) {
					this._useGlobalToolbar = treatment;
					this._showNotebookActionsinEditorToolbar();
				}
			});
		}
	}

	private _showNotebookActionsinEditorToolbar() {
		// when there is no view model, just ignore.
		if (!this.notebookEditor.hasModel()) {
			return;
		}

		if (!this._useGlobalToolbar) {
			this.domNode.style.display = 'none';
		} else {
			const groups = this._notebookGlobalActionsMenu.getActions({ shouldForwardArgs: true, renderShortTitle: true });
			this.domNode.style.display = 'flex';
			const primaryLeftGroups = groups.filter(group => /^navigation/.test(group[0]));
			let primaryActions: IAction[] = [];
			primaryLeftGroups.sort((a, b) => {
				if (a[0] === 'navigation') {
					return 1;
				}

				if (b[0] === 'navigation') {
					return -1;
				}

				return 0;
			}).forEach((group, index) => {
				primaryActions.push(...group[1]);
				if (index < primaryLeftGroups.length - 1) {
					primaryActions.push(new Separator());
				}
			});
			const primaryRightGroup = groups.find(group => /^status/.test(group[0]));
			const primaryRightActions = primaryRightGroup ? primaryRightGroup[1] : [];
			const secondaryActions = groups.filter(group => !/^navigation/.test(group[0]) && !/^status/.test(group[0])).reduce((prev: (MenuItemAction | SubmenuItemAction)[], curr) => { prev.push(...curr[1]); return prev; }, []);

			this._notebookLeftToolbar.setActions([], []);

			this._notebookLeftToolbar.setActions(primaryActions, secondaryActions);
			this._notebookRightToolbar.setActions(primaryRightActions, []);
			this._secondaryActions = secondaryActions;
			// flush to make sure it can be updated later
			this._primaryActions = [];

			if (this._dimension && this._dimension.width >= 0 && this._dimension.height >= 0) {
				this._cacheItemSizes(this._notebookLeftToolbar);
			}

			this._computeSizes();
		}

		this._onDidChangeState.fire();
	}

	private _cacheItemSizes(toolbar: ToolBar) {
		let actions: IActionModel[] = [];

		for (let i = 0; i < toolbar.getItemsLength(); i++) {
			const action = toolbar.getItemAction(i);
			actions.push({
				action: action,
				size: toolbar.getItemWidth(i),
				visible: true
			});
		}

		this._primaryActions = actions;
	}

	private _canBeVisible(width: number) {
		let w = 0;
		for (let i = 0; i < this._primaryActions.length; i++) {
			w += this._primaryActions[i].size + 8;
		}

		return w <= width;
	}

	private _computeSizes() {
		const toolbar = this._notebookLeftToolbar;
		const rightToolbar = this._notebookRightToolbar;
		if (toolbar && rightToolbar && this._dimension && this._dimension.height >= 0 && this._dimension.width >= 0) {
			// compute size only if it's visible
			if (this._primaryActions.length === 0 && toolbar.getItemsLength() !== this._primaryActions.length) {
				this._cacheItemSizes(this._notebookLeftToolbar);
			}

			if (this._primaryActions.length === 0) {
				return;
			}

			const kernelWidth = (rightToolbar.getItemsLength() ? rightToolbar.getItemWidth(0) : 0) + ACTION_PADDING;

			if (this._canBeVisible(this._dimension.width - kernelWidth - ACTION_PADDING /** left margin */)) {
				this._primaryActions.forEach(action => action.visible = true);
				toolbar.setActions(this._primaryActions.filter(action => action.action.id !== ToggleMenuAction.ID).map(model => model.action), this._secondaryActions);
				return;
			}

			const leftToolbarContainerMaxWidth = this._dimension.width - kernelWidth - (TOGGLE_MORE_ACTION_WIDTH + ACTION_PADDING) /** ... */ - ACTION_PADDING /** toolbar left margin */;
			const lastItemInLeft = this._primaryActions[this._primaryActions.length - 1];
			const hasToggleMoreAction = lastItemInLeft.action.id === ToggleMenuAction.ID;

			let size = 0;
			let actions: IActionModel[] = [];

			for (let i = 0; i < this._primaryActions.length - (hasToggleMoreAction ? 1 : 0); i++) {
				const actionModel = this._primaryActions[i];

				const itemSize = actionModel.size;
				if (size + itemSize <= leftToolbarContainerMaxWidth) {
					size += ACTION_PADDING + itemSize;
					actions.push(actionModel);
				} else {
					break;
				}
			}

			actions.forEach(action => action.visible = true);
			this._primaryActions.slice(actions.length).forEach(action => action.visible = false);

			toolbar.setActions(
				actions.filter(action => (action.visible && action.action.id !== ToggleMenuAction.ID)).map(action => action.action),
				[...this._primaryActions.slice(actions.length).filter(action => !action.visible && action.action.id !== ToggleMenuAction.ID).map(action => action.action), ...this._secondaryActions]);
		}
	}

	layout(dimension: DOM.Dimension) {
		this._dimension = dimension;

		if (!this._useGlobalToolbar) {
			this.domNode.style.display = 'none';
		} else {
			this.domNode.style.display = 'flex';
		}
		this._computeSizes();
	}

	override dispose() {
		this._pendingLayout?.dispose();
		super.dispose();
	}
}

registerThemingParticipant((theme, collector) => {
	const toolbarActiveBackgroundColor = theme.getColor(toolbarActiveBackground);
	if (toolbarActiveBackgroundColor) {
		collector.addRule(`
		.monaco-workbench .notebookOverlay .notebook-toolbar-container .monaco-action-bar:not(.vertical) .action-item.active {
			background-color: ${toolbarActiveBackgroundColor};
		}
		`);
	}
});
