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
import { IMenu, IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { SELECT_KERNEL_ID } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { NOTEBOOK_EDITOR_ID, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebooKernelActionViewItem } from 'vs/workbench/contrib/notebook/browser/viewParts/notebookKernelView';
import { ActionViewWithLabel } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellActionView';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchAssignmentService } from 'vs/workbench/services/assignment/common/assignmentService';
import { NotebookOptions } from 'vs/workbench/contrib/notebook/browser/notebookOptions';
import { IActionViewItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { disposableTimeout } from 'vs/base/common/async';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { HiddenItemStrategy, IWorkbenchToolBarOptions, WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';

interface IActionModel {
	action: IAction;
	size: number;
	visible: boolean;
	renderLabel: boolean;
}

export enum RenderLabel {
	Always = 0,
	Never = 1,
	Dynamic = 2
}

export type RenderLabelWithFallback = true | false | 'always' | 'never' | 'dynamic';

export function convertConfiguration(value: RenderLabelWithFallback): RenderLabel {
	switch (value) {
		case true:
			return RenderLabel.Always;
		case false:
			return RenderLabel.Never;
		case 'always':
			return RenderLabel.Always;
		case 'never':
			return RenderLabel.Never;
		case 'dynamic':
			return RenderLabel.Dynamic;
	}
}

const ICON_ONLY_ACTION_WIDTH = 21;
const TOGGLE_MORE_ACTION_WIDTH = 21;
const ACTION_PADDING = 8;

interface IActionLayoutStrategy {
	actionProvider: IActionViewItemProvider;
	calculateActions(leftToolbarContainerMaxWidth: number): { primaryActions: IAction[]; secondaryActions: IAction[] };
}

class FixedLabelStrategy implements IActionLayoutStrategy {
	constructor(
		readonly notebookEditor: INotebookEditorDelegate,
		readonly editorToolbar: NotebookEditorToolbar,
		readonly instantiationService: IInstantiationService) {

	}

	actionProvider(action: IAction): ActionViewItem | undefined {
		if (action.id === SELECT_KERNEL_ID) {
			// 	// this is being disposed by the consumer
			return this.instantiationService.createInstance(NotebooKernelActionViewItem, action, this.notebookEditor);
		}

		return action instanceof MenuItemAction ? this.instantiationService.createInstance(ActionViewWithLabel, action, undefined) : undefined;
	}

	protected _calculateFixedActions(leftToolbarContainerMaxWidth: number) {
		const primaryActions = this.editorToolbar.primaryActions;
		const lastItemInLeft = primaryActions[primaryActions.length - 1];
		const hasToggleMoreAction = lastItemInLeft.action.id === ToggleMenuAction.ID;

		let size = 0;
		const actions: IActionModel[] = [];

		for (let i = 0; i < primaryActions.length - (hasToggleMoreAction ? 1 : 0); i++) {
			const actionModel = primaryActions[i];

			const itemSize = actionModel.size;
			if (size + itemSize <= leftToolbarContainerMaxWidth) {
				size += ACTION_PADDING + itemSize;
				actions.push(actionModel);
			} else {
				break;
			}
		}

		actions.forEach(action => action.visible = true);
		primaryActions.slice(actions.length).forEach(action => action.visible = false);

		return {
			primaryActions: actions.filter(action => (action.visible && action.action.id !== ToggleMenuAction.ID)).map(action => action.action),
			secondaryActions: [...primaryActions.slice(actions.length).filter(action => !action.visible && action.action.id !== ToggleMenuAction.ID).map(action => action.action), ...this.editorToolbar.secondaryActions]
		};
	}

	calculateActions(leftToolbarContainerMaxWidth: number) {
		return this._calculateFixedActions(leftToolbarContainerMaxWidth);
	}
}

class FixedLabellessStrategy extends FixedLabelStrategy {
	constructor(
		notebookEditor: INotebookEditorDelegate,
		editorToolbar: NotebookEditorToolbar,
		instantiationService: IInstantiationService) {
		super(notebookEditor, editorToolbar, instantiationService);
	}

	override actionProvider(action: IAction) {
		if (action.id === SELECT_KERNEL_ID) {
			// 	// this is being disposed by the consumer
			return this.instantiationService.createInstance(NotebooKernelActionViewItem, action, this.notebookEditor);
		}

		return action instanceof MenuItemAction ? this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined) : undefined;
	}
}

class DynamicLabelStrategy implements IActionLayoutStrategy {

	constructor(
		readonly notebookEditor: INotebookEditorDelegate,
		readonly editorToolbar: NotebookEditorToolbar,
		readonly instantiationService: IInstantiationService) {
	}

	actionProvider(action: IAction) {
		if (action.id === SELECT_KERNEL_ID) {
			// 	// this is being disposed by the consumer
			return this.instantiationService.createInstance(NotebooKernelActionViewItem, action, this.notebookEditor);
		}

		const a = this.editorToolbar.primaryActions.find(a => a.action.id === action.id);
		if (!a || a.renderLabel) {
			// render new action with label to get a correct full width.
			return action instanceof MenuItemAction ? this.instantiationService.createInstance(ActionViewWithLabel, action, undefined) : undefined;
		} else {
			return action instanceof MenuItemAction ? this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined) : undefined;
		}
	}

	calculateActions(leftToolbarContainerMaxWidth: number) {
		const primaryActions = this.editorToolbar.primaryActions;
		const secondaryActions = this.editorToolbar.secondaryActions;

		const lastItemInLeft = primaryActions[primaryActions.length - 1];
		const hasToggleMoreAction = lastItemInLeft.action.id === ToggleMenuAction.ID;
		const actions = primaryActions.slice(0, primaryActions.length - (hasToggleMoreAction ? 1 : 0));

		if (actions.length === 0) {
			return {
				primaryActions: primaryActions.filter(action => (action.visible && action.action.id !== ToggleMenuAction.ID)).map(action => action.action),
				secondaryActions
			};
		}

		const totalWidthWithLabels = actions.map(action => action.size).reduce((a, b) => a + b, 0) + (actions.length - 1) * ACTION_PADDING;
		if (totalWidthWithLabels <= leftToolbarContainerMaxWidth) {
			primaryActions.forEach(action => {
				action.visible = true;
				action.renderLabel = true;
			});
			return {
				primaryActions: primaryActions.filter(action => (action.visible && action.action.id !== ToggleMenuAction.ID)).map(action => action.action),
				secondaryActions
			};
		}

		// too narrow, we need to hide some labels

		if ((actions.length * ICON_ONLY_ACTION_WIDTH + (actions.length - 1) * ACTION_PADDING) > leftToolbarContainerMaxWidth) {
			return this._calcuateWithAlllabelsHidden(actions, leftToolbarContainerMaxWidth);
		}

		const sums = [];
		let sum = 0;
		let lastActionWithLabel = -1;
		for (let i = 0; i < actions.length; i++) {
			sum += actions[i].size + ACTION_PADDING;
			sums.push(sum);

			if (actions[i].action instanceof Separator) {
				// find group separator
				const remainingItems = actions.slice(i + 1);
				const newTotalSum = sum + (remainingItems.length === 0 ? 0 : (remainingItems.length * ICON_ONLY_ACTION_WIDTH + (remainingItems.length - 1) * ACTION_PADDING));
				if (newTotalSum <= leftToolbarContainerMaxWidth) {
					lastActionWithLabel = i;
				}
			} else {
				continue;
			}
		}

		if (lastActionWithLabel < 0) {
			return this._calcuateWithAlllabelsHidden(actions, leftToolbarContainerMaxWidth);
		}

		const visibleActions = actions.slice(0, lastActionWithLabel + 1);
		visibleActions.forEach(action => { action.visible = true; action.renderLabel = true; });
		primaryActions.slice(visibleActions.length).forEach(action => { action.visible = true; action.renderLabel = false; });
		return {
			primaryActions: primaryActions.filter(action => (action.visible && action.action.id !== ToggleMenuAction.ID)).map(action => action.action),
			secondaryActions
		};
	}

	private _calcuateWithAlllabelsHidden(actions: IActionModel[], leftToolbarContainerMaxWidth: number) {
		const primaryActions = this.editorToolbar.primaryActions;
		const secondaryActions = this.editorToolbar.secondaryActions;

		// all actions hidden labels
		primaryActions.forEach(action => { action.renderLabel = false; });
		let size = 0;
		const renderActions: IActionModel[] = [];

		for (let i = 0; i < actions.length; i++) {
			const actionModel = actions[i];

			if (actionModel.action.id === 'notebook.cell.insertMarkdownCellBelow') {
				renderActions.push(actionModel);
				continue;
			}

			const itemSize = ICON_ONLY_ACTION_WIDTH;
			if (size + itemSize <= leftToolbarContainerMaxWidth) {
				size += ACTION_PADDING + itemSize;
				renderActions.push(actionModel);
			} else {
				break;
			}
		}

		renderActions.forEach(action => {
			if (action.action.id === 'notebook.cell.insertMarkdownCellBelow') {
				action.visible = false;
			} else {
				action.visible = true;
			}
		});
		primaryActions.slice(renderActions.length).forEach(action => action.visible = false);

		return {
			primaryActions: renderActions.filter(action => (action.visible && action.action.id !== ToggleMenuAction.ID)).map(action => action.action),
			secondaryActions: [...primaryActions.slice(actions.length).filter(action => !action.visible && action.action.id !== ToggleMenuAction.ID).map(action => action.action), ...secondaryActions]
		};
	}

}

export class NotebookEditorToolbar extends Disposable {
	// private _editorToolbarContainer!: HTMLElement;
	private _leftToolbarScrollable!: DomScrollableElement;
	private _notebookTopLeftToolbarContainer!: HTMLElement;
	private _notebookTopRightToolbarContainer!: HTMLElement;
	private _notebookGlobalActionsMenu!: IMenu;
	private _notebookLeftToolbar!: ToolBar;
	private _primaryActions: IActionModel[];
	get primaryActions(): IActionModel[] {
		return this._primaryActions;
	}
	private _secondaryActions: IAction[];
	get secondaryActions(): IAction[] {
		return this._secondaryActions;
	}
	private _notebookRightToolbar!: ToolBar;
	private _useGlobalToolbar: boolean = false;
	private _strategy!: IActionLayoutStrategy;
	private _renderLabel: RenderLabel = RenderLabel.Always;

	private _visible: boolean = false;
	set visible(visible: boolean) {
		if (this._visible !== visible) {
			this._visible = visible;
			this._onDidChangeVisibility.fire(visible);
		}
	}
	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	get useGlobalToolbar(): boolean {
		return this._useGlobalToolbar;
	}

	private _dimension: DOM.Dimension | null = null;

	private _deferredActionUpdate: IDisposable | undefined;

	constructor(
		readonly notebookEditor: INotebookEditorDelegate,
		readonly contextKeyService: IContextKeyService,
		readonly notebookOptions: NotebookOptions,
		readonly domNode: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IEditorService private readonly editorService: IEditorService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkbenchAssignmentService private readonly experimentService: IWorkbenchAssignmentService
	) {
		super();

		this._primaryActions = [];
		this._secondaryActions = [];
		this._buildBody();

		this._register(Event.debounce<void, void>(
			this.editorService.onDidActiveEditorChange,
			(last, _current) => last,
			200
		)(this._updatePerEditorChange, this));

		this._registerNotebookActionsToolbar();
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

	private _updatePerEditorChange() {
		if (this.editorService.activeEditorPane?.getId() === NOTEBOOK_EDITOR_ID) {
			const notebookEditor = this.editorService.activeEditorPane.getControl() as INotebookEditorDelegate;
			if (notebookEditor === this.notebookEditor) {
				// this is the active editor
				this._showNotebookActionsinEditorToolbar();
				return;
			}
		}
	}

	private _registerNotebookActionsToolbar() {
		this._notebookGlobalActionsMenu = this._register(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.notebookToolbar, this.contextKeyService));
		this._register(this._notebookGlobalActionsMenu);

		this._useGlobalToolbar = this.notebookOptions.getLayoutConfiguration().globalToolbar;
		this._renderLabel = convertConfiguration(this.configurationService.getValue<RenderLabelWithFallback>(NotebookSetting.globalToolbarShowLabel));
		this._updateStrategy();

		const context = {
			ui: true,
			notebookEditor: this.notebookEditor
		};

		const actionProvider = (action: IAction) => {
			if (action.id === SELECT_KERNEL_ID) {
				// 	// this is being disposed by the consumer
				return this.instantiationService.createInstance(NotebooKernelActionViewItem, action, this.notebookEditor);
			}

			if (this._renderLabel !== RenderLabel.Never) {
				const a = this._primaryActions.find(a => a.action.id === action.id);
				if (a && a.renderLabel) {
					return action instanceof MenuItemAction ? this.instantiationService.createInstance(ActionViewWithLabel, action, undefined) : undefined;
				} else {
					return action instanceof MenuItemAction ? this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined) : undefined;
				}
			} else {
				return action instanceof MenuItemAction ? this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined) : undefined;
			}
		};

		this._notebookLeftToolbar = new ToolBar(this._notebookTopLeftToolbarContainer, this.contextMenuService, {
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			actionViewItemProvider: (action, options) => {
				return this._strategy.actionProvider(action, options);
			},
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

			if (this.notebookEditor.isVisible) {
				this._showNotebookActionsinEditorToolbar();
			}
		}));

		this._register(this._notebookLeftToolbar.onDidChangeDropdownVisibility(visible => {
			dropdownIsVisible = visible;

			if (deferredUpdate && !visible) {
				setTimeout(() => {
					deferredUpdate?.();
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
			if (e.affectsConfiguration(NotebookSetting.globalToolbarShowLabel)) {
				this._renderLabel = convertConfiguration(this.configurationService.getValue<RenderLabelWithFallback>(NotebookSetting.globalToolbarShowLabel));
				this._updateStrategy();
				const oldElement = this._notebookLeftToolbar.getElement();
				oldElement.parentElement?.removeChild(oldElement);
				this._notebookLeftToolbar.dispose();
				this._notebookLeftToolbar = new ToolBar(this._notebookTopLeftToolbarContainer, this.contextMenuService, {
					getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
					actionViewItemProvider: (action, options) => {
						return this._strategy.actionProvider(action, options);
					},
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

	private _updateStrategy() {
		switch (this._renderLabel) {
			case RenderLabel.Always:
				this._strategy = new FixedLabelStrategy(this.notebookEditor, this, this.instantiationService);
				break;
			case RenderLabel.Never:
				this._strategy = new FixedLabellessStrategy(this.notebookEditor, this, this.instantiationService);
				break;
			case RenderLabel.Dynamic:
				this._strategy = new DynamicLabelStrategy(this.notebookEditor, this, this.instantiationService);
				break;
		}
	}

	private _showNotebookActionsinEditorToolbar() {
		// when there is no view model, just ignore.
		if (!this.notebookEditor.hasModel()) {
			this._deferredActionUpdate?.dispose();
			this._deferredActionUpdate = undefined;
			this.visible = false;
			return;
		}

		if (this._deferredActionUpdate) {
			return;
		}

		if (!this._useGlobalToolbar) {
			this.domNode.style.display = 'none';
			this._deferredActionUpdate = undefined;
			this.visible = false;
		} else {
			this._deferredActionUpdate = disposableTimeout(async () => {
				await this._setNotebookActions();
				this.visible = true;
				this._deferredActionUpdate = undefined;
			}, 50);
		}
	}

	private async _setNotebookActions() {
		const groups = this._notebookGlobalActionsMenu.getActions({ shouldForwardArgs: true, renderShortTitle: true });
		this.domNode.style.display = 'flex';
		const primaryLeftGroups = groups.filter(group => /^navigation/.test(group[0]));
		const primaryActions: IAction[] = [];
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

		this._primaryActions.forEach(action => action.renderLabel = true);
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

	private _cacheItemSizes(toolbar: ToolBar) {
		const actions: IActionModel[] = [];

		for (let i = 0; i < toolbar.getItemsLength(); i++) {
			const action = toolbar.getItemAction(i);
			if (action) {
				actions.push({
					action: action,
					size: toolbar.getItemWidth(i),
					visible: true,
					renderLabel: true
				});
			}
		}

		this._primaryActions = actions;
	}

	private _canBeVisible(width: number) {
		let w = 0;
		for (let i = 0; i < this._primaryActions.length; i++) {
			w += this._primaryActions[i].size + ACTION_PADDING;
		}

		return w - ACTION_PADDING <= width;
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
				this._primaryActions.forEach(action => {
					action.visible = true;
					action.renderLabel = true;
				});
				toolbar.setActions(this._primaryActions.filter(action => action.action.id !== ToggleMenuAction.ID).map(model => model.action), this._secondaryActions);
				return;
			}

			const leftToolbarContainerMaxWidth = this._dimension.width - kernelWidth - (TOGGLE_MORE_ACTION_WIDTH + ACTION_PADDING) /** ... */ - ACTION_PADDING /** toolbar left margin */;
			const calculatedActions = this._strategy.calculateActions(leftToolbarContainerMaxWidth);
			this._notebookLeftToolbar.setActions(calculatedActions.primaryActions, calculatedActions.secondaryActions);
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
		this._notebookLeftToolbar.context = undefined;
		this._notebookRightToolbar.context = undefined;
		this._notebookLeftToolbar.dispose();
		this._notebookRightToolbar.dispose();
		this._notebookLeftToolbar = null!;
		this._notebookRightToolbar = null!;
		this._deferredActionUpdate?.dispose();
		this._deferredActionUpdate = undefined;

		super.dispose();
	}
}

class WorkbenchAlwaysLabelStrategy implements IActionLayoutStrategy {
	constructor(
		readonly notebookEditor: INotebookEditorDelegate,
		readonly editorToolbar: NotebookEditorWorkbenchToolbar,
		readonly instantiationService: IInstantiationService) { }

	actionProvider(action: IAction): ActionViewItem | undefined {
		if (action.id === SELECT_KERNEL_ID) {
			//	this is being disposed by the consumer
			return this.instantiationService.createInstance(NotebooKernelActionViewItem, action, this.notebookEditor);
		}

		return action instanceof MenuItemAction ? this.instantiationService.createInstance(ActionViewWithLabel, action, undefined) : undefined;
	}

	calculateActions(leftToolbarContainerMaxWidth: number): { primaryActions: IAction[]; secondaryActions: IAction[] } {
		const initialPrimaryActions = this.editorToolbar.primaryActions;
		const initialSecondaryActions = this.editorToolbar.secondaryActions;

		return workbenchCalculateActions(initialPrimaryActions, initialSecondaryActions, leftToolbarContainerMaxWidth);
	}
}

class WorkbenchNeverLabelStrategy implements IActionLayoutStrategy {
	constructor(
		readonly notebookEditor: INotebookEditorDelegate,
		readonly editorToolbar: NotebookEditorWorkbenchToolbar,
		readonly instantiationService: IInstantiationService) { }

	actionProvider(action: IAction): ActionViewItem | undefined {
		if (action.id === SELECT_KERNEL_ID) {
			//	this is being disposed by the consumer
			return this.instantiationService.createInstance(NotebooKernelActionViewItem, action, this.notebookEditor);
		}

		return action instanceof MenuItemAction ? this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined) : undefined;
	}

	calculateActions(leftToolbarContainerMaxWidth: number): { primaryActions: IAction[]; secondaryActions: IAction[] } {
		const initialPrimaryActions = this.editorToolbar.primaryActions;
		const initialSecondaryActions = this.editorToolbar.secondaryActions;

		return workbenchCalculateActions(initialPrimaryActions, initialSecondaryActions, leftToolbarContainerMaxWidth);
	}
}

// class WorkbenchDynamicLabelStrategy implements IActionLayoutStrategy {

// 	constructor(
// 		readonly notebookEditor: INotebookEditorDelegate,
// 		readonly editorToolbar: NotebookEditorToolbar,
// 		readonly instantiationService: IInstantiationService) {
// 	}

// 	actionProvider(action: IAction) {
// 		if (action.id === SELECT_KERNEL_ID) {
// 			// 	// this is being disposed by the consumer
// 			return this.instantiationService.createInstance(NotebooKernelActionViewItem, action, this.notebookEditor);
// 		}

// 		const a = this.editorToolbar.primaryActions.find(a => a.action.id === action.id);
// 		if (!a || a.renderLabel) {
// 			// render new action with label to get a correct full width.
// 			return action instanceof MenuItemAction ? this.instantiationService.createInstance(ActionViewWithLabel, action, undefined) : undefined;
// 		} else {
// 			return action instanceof MenuItemAction ? this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined) : undefined;
// 		}
// 	}

// 	calculateActions(leftToolbarContainerMaxWidth: number) {
// 	}

// }

export class NotebookEditorWorkbenchToolbar extends Disposable {
	private _leftToolbarScrollable!: DomScrollableElement;
	private _notebookTopLeftToolbarContainer!: HTMLElement;
	private _notebookTopRightToolbarContainer!: HTMLElement;
	private _notebookGlobalActionsMenu!: IMenu;
	private _notebookLeftToolbar!: WorkbenchToolBar;
	private _primaryActions: IActionModel[];
	get primaryActions(): IActionModel[] {
		return this._primaryActions;
	}
	private _secondaryActions: IAction[];
	get secondaryActions(): IAction[] {
		return this._secondaryActions;
	}
	private _notebookRightToolbar!: ToolBar;
	private _useGlobalToolbar: boolean = false;
	private _strategy!: IActionLayoutStrategy;
	private _renderLabel: RenderLabel = RenderLabel.Always;

	private _visible: boolean = false;
	set visible(visible: boolean) {
		if (this._visible !== visible) {
			this._visible = visible;
			this._onDidChangeVisibility.fire(visible);
		}
	}
	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	get useGlobalToolbar(): boolean {
		return this._useGlobalToolbar;
	}

	private _dimension: DOM.Dimension | null = null;

	private _deferredActionUpdate: IDisposable | undefined;

	constructor(
		readonly notebookEditor: INotebookEditorDelegate,
		readonly contextKeyService: IContextKeyService,
		readonly notebookOptions: NotebookOptions,
		readonly domNode: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IEditorService private readonly editorService: IEditorService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkbenchAssignmentService private readonly experimentService: IWorkbenchAssignmentService,
	) {
		super();

		this._primaryActions = [];
		this._secondaryActions = [];
		this._buildBody();

		this._register(Event.debounce<void, void>(
			this.editorService.onDidActiveEditorChange,
			(last, _current) => last,
			200
		)(this._updatePerEditorChange, this));

		this._registerNotebookActionsToolbar();
	}

	private _buildBody() {
		this._notebookTopLeftToolbarContainer = document.createElement('div');
		this._notebookTopLeftToolbarContainer.classList.add('notebook-toolbar-left');
		this._leftToolbarScrollable = new DomScrollableElement(this._notebookTopLeftToolbarContainer, {
			vertical: ScrollbarVisibility.Hidden,
			horizontal: ScrollbarVisibility.Visible,
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

	private _updatePerEditorChange() {
		if (this.editorService.activeEditorPane?.getId() === NOTEBOOK_EDITOR_ID) {
			const notebookEditor = this.editorService.activeEditorPane.getControl() as INotebookEditorDelegate;
			if (notebookEditor === this.notebookEditor) {
				// this is the active editor
				this._showNotebookActionsinEditorToolbar();
				return;
			}
		}
	}

	private _registerNotebookActionsToolbar() {
		this._notebookGlobalActionsMenu = this._register(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.notebookToolbar, this.contextKeyService));
		this._register(this._notebookGlobalActionsMenu);

		this._useGlobalToolbar = this.notebookOptions.getLayoutConfiguration().globalToolbar;
		this._renderLabel = this._convertConfiguration(this.configurationService.getValue(NotebookSetting.globalToolbarShowLabel));
		this._updateStrategy();

		const context = {
			ui: true,
			notebookEditor: this.notebookEditor
		};

		const actionProvider = (action: IAction) => {
			if (action.id === SELECT_KERNEL_ID) {
				// this is being disposed by the consumer
				return this.instantiationService.createInstance(NotebooKernelActionViewItem, action, this.notebookEditor);
			}

			if (this._renderLabel !== RenderLabel.Never) {
				const a = this._primaryActions.find(a => a.action.id === action.id);
				// if (a && a.renderLabel) {
				if (a) {
					return action instanceof MenuItemAction ? this.instantiationService.createInstance(ActionViewWithLabel, action, undefined) : undefined;
				} else {
					return action instanceof MenuItemAction ? this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined) : undefined;
				}
			} else {
				return action instanceof MenuItemAction ? this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined) : undefined;
			}
		};

		const leftToolbarOptions: IWorkbenchToolBarOptions = {
			hiddenItemStrategy: HiddenItemStrategy.RenderInSecondaryGroup,
			resetMenu: MenuId.NotebookToolbar,
			actionViewItemProvider: (action, options) => {
				return this._strategy.actionProvider(action, options);
			},
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			renderDropdownAsChildElement: true,
		};

		this._notebookLeftToolbar = this.instantiationService.createInstance(
			WorkbenchToolBar,
			this._notebookTopLeftToolbarContainer,
			leftToolbarOptions
		);



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

			if (this.notebookEditor.isVisible) {
				this._showNotebookActionsinEditorToolbar();
			}
		}));

		this._register(this._notebookLeftToolbar.onDidChangeDropdownVisibility(visible => {
			dropdownIsVisible = visible;

			if (deferredUpdate && !visible) {
				setTimeout(() => {
					deferredUpdate?.();
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
			if (e.affectsConfiguration(NotebookSetting.globalToolbarShowLabel)) {
				this._renderLabel = this._convertConfiguration(this.configurationService.getValue<RenderLabelWithFallback>(NotebookSetting.globalToolbarShowLabel));
				this._updateStrategy();
				const oldElement = this._notebookLeftToolbar.getElement();
				oldElement.parentElement?.removeChild(oldElement);
				this._notebookLeftToolbar.dispose();

				this._notebookLeftToolbar = this.instantiationService.createInstance(
					WorkbenchToolBar,
					this._notebookTopLeftToolbarContainer,
					leftToolbarOptions
				);

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

	private _updateStrategy() {
		switch (this._renderLabel) {
			case RenderLabel.Always:
				this._strategy = new WorkbenchAlwaysLabelStrategy(this.notebookEditor, this, this.instantiationService);
				break;
			case RenderLabel.Never:
				this._strategy = new WorkbenchNeverLabelStrategy(this.notebookEditor, this, this.instantiationService);
				break;
			case RenderLabel.Dynamic:
				this._strategy = new WorkbenchAlwaysLabelStrategy(this.notebookEditor, this, this.instantiationService); // todo: defer to always, incorrect
				break;
		}
	}

	private _convertConfiguration(value: RenderLabelWithFallback): RenderLabel {
		switch (value) {
			case true:
				return RenderLabel.Always;
			case false:
				return RenderLabel.Never;
			case 'always':
				return RenderLabel.Always;
			case 'never':
				return RenderLabel.Never;
			case 'dynamic':
				return RenderLabel.Dynamic;
		}
	}

	private _showNotebookActionsinEditorToolbar() {
		// when there is no view model, just ignore.
		if (!this.notebookEditor.hasModel()) {
			this._deferredActionUpdate?.dispose();
			this._deferredActionUpdate = undefined;
			this.visible = false;
			return;
		}

		if (this._deferredActionUpdate) {
			return;
		}

		if (!this._useGlobalToolbar) {
			this.domNode.style.display = 'none';
			this._deferredActionUpdate = undefined;
			this.visible = false;
		} else {
			this._deferredActionUpdate = disposableTimeout(async () => {
				await this._setNotebookActions();
				this.visible = true;
				this._deferredActionUpdate = undefined;
			}, 50);
		}
	}

	private async _setNotebookActions() {
		const groups = this._notebookGlobalActionsMenu.getActions({ shouldForwardArgs: true, renderShortTitle: true });
		this.domNode.style.display = 'flex';
		const primaryLeftGroups = groups.filter(group => /^navigation/.test(group[0]));
		const primaryActions: IAction[] = [];
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

		// this._primaryActions.forEach(action => action.renderLabel = true);
		this._notebookLeftToolbar.setActions(primaryActions, secondaryActions);
		this._primaryActions = primaryActions.map(action => ({
			action: action,
			size: 0,
			renderLabel: true,
			visible: true
		}));
		this._secondaryActions = secondaryActions;

		this._notebookRightToolbar.setActions(primaryRightActions, []);
		this._secondaryActions = secondaryActions;
		// flush to make sure it can be updated later
		// this._primaryActions = [];

		if (this._dimension && this._dimension.width >= 0 && this._dimension.height >= 0) {
			this._cacheItemSizes(this._notebookLeftToolbar);
		}

		this._computeSizes();
	}

	private _cacheItemSizes(toolbar: WorkbenchToolBar) {
		for (let i = 0; i < toolbar.getItemsLength(); i++) {
			const action = toolbar.getItemAction(i);
			if (action && action.id !== 'toolbar.toggle.more') {
				const existing = this._primaryActions.find(a => a.action.id === action.id);
				if (existing) {
					existing.size = toolbar.getItemWidth(i);
					existing.renderLabel = true;
				}
			}
		}
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
			const leftToolbarContainerMaxWidth = this._dimension.width - kernelWidth - (ACTION_PADDING + TOGGLE_MORE_ACTION_WIDTH) - (/** toolbar left margin */ACTION_PADDING) - (/** toolbar right margin */ACTION_PADDING);
			const calculatedActions = this._strategy.calculateActions(leftToolbarContainerMaxWidth);
			this._notebookLeftToolbar.setActions(calculatedActions.primaryActions, calculatedActions.secondaryActions);
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
		this._notebookLeftToolbar.context = undefined;
		this._notebookRightToolbar.context = undefined;
		this._notebookLeftToolbar.dispose();
		this._notebookRightToolbar.dispose();
		this._notebookLeftToolbar = null!;
		this._notebookRightToolbar = null!;
		this._deferredActionUpdate?.dispose();
		this._deferredActionUpdate = undefined;

		super.dispose();
	}
}

export function workbenchCalculateActions(initialPrimaryActions: IActionModel[], initialSecondaryActions: IAction[], leftToolbarContainerMaxWidth: number): { primaryActions: IAction[]; secondaryActions: IAction[] } {
	let currentSize = 0;
	const renderActions: IActionModel[] = [];
	const overflow: IAction[] = [];
	let containerFull = false;
	let nonZeroAction = false;

	if (initialPrimaryActions.length === 0) {
		return { primaryActions: [], secondaryActions: initialSecondaryActions };
	}

	for (let i = 0; i < initialPrimaryActions.length; i++) {
		const actionModel = initialPrimaryActions[i];
		const itemSize = actionModel.size;

		// if two separators in a row, ignore the second
		if (actionModel.action instanceof Separator && renderActions.length > 0 && renderActions[renderActions.length - 1].action instanceof Separator) {
			continue;
		}

		// if a separator is the first nonZero action, ignore it
		if (actionModel.action instanceof Separator && !nonZeroAction) {
			continue;
		}

		if (currentSize + itemSize <= leftToolbarContainerMaxWidth && !containerFull) { // if next item fits within left container width, push to rendered actions
			currentSize += ACTION_PADDING + itemSize;
			renderActions.push(actionModel);
			if (itemSize !== 0) {
				nonZeroAction = true;
			}
			if (actionModel.action instanceof Separator) {
				nonZeroAction = false;
			}
		} else {
			containerFull = true;
			if (itemSize === 0) { // size 0 implies a hidden item, keep in primary to allow for Workbench to handle visibility
				renderActions.push(actionModel);
			} else {
				if (actionModel.action instanceof Separator) { // never push a separator to overflow
					continue;
				}
				overflow.push(actionModel.action);
			}
		}
	}

	for (let i = (renderActions.length - 1); i !== 0; i--) {
		const temp = renderActions[i];
		if (temp.size === 0) {
			continue;
		}
		if (temp.action instanceof Separator) {
			renderActions.splice(i, 1);
		}
		break;
	}


	if (renderActions.length && renderActions[renderActions.length - 1].action instanceof Separator) {
		renderActions.pop();
	}

	if (overflow.length !== 0) {
		overflow.push(new Separator());
	}

	return {
		primaryActions: renderActions.map(action => action.action),
		secondaryActions: [...overflow, ...initialSecondaryActions]
	};
}

