/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IThemable } from 'vs/platform/theme/common/styler';
import * as errors from 'vs/base/common/errors';
import { $ } from 'vs/base/browser/builder';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { IActionItem, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { prepareActions } from 'vs/workbench/browser/actions';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { DelayedDragHandler } from 'vs/base/browser/dnd';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IMessageService } from 'vs/platform/message/common/message';
import { CollapsibleView, CollapsibleState, FixedCollapsibleView, IView } from 'vs/base/browser/ui/splitview/splitview';

export interface IViewletView extends IView, IThemable {
	id?: string;
	create(): TPromise<void>;
	setVisible(visible: boolean): TPromise<void>;
	getActions(): IAction[];
	getSecondaryActions(): IAction[];
	getActionItem(action: IAction): IActionItem;
	showHeader(): boolean;
	hideHeader(): boolean;
	shutdown(): void;
	focusBody(): void;
	isExpanded(): boolean;
	expand(): void;
	collapse(): void;
}

/**
 * The AdaptiveCollapsibleViewletView can grow with the content inside dynamically.
 */
export abstract class AdaptiveCollapsibleViewletView extends FixedCollapsibleView implements IViewletView {
	protected treeContainer: HTMLElement;
	protected tree: ITree;
	protected toDispose: IDisposable[];
	protected isVisible: boolean;
	protected toolBar: ToolBar;
	protected actionRunner: IActionRunner;
	protected isDisposed: boolean;

	private dragHandler: DelayedDragHandler;

	constructor(
		actionRunner: IActionRunner,
		initialBodySize: number,
		collapsed: boolean,
		private viewName: string,
		protected keybindingService: IKeybindingService,
		protected contextMenuService: IContextMenuService
	) {
		super({
			expandedBodySize: initialBodySize,
			initialState: collapsed ? CollapsibleState.COLLAPSED : CollapsibleState.EXPANDED,
			ariaHeaderLabel: viewName,
			headerSize: 22,
		});

		this.actionRunner = actionRunner;
		this.toDispose = [];
	}

	protected changeState(state: CollapsibleState): void {
		updateTreeVisibility(this.tree, state === CollapsibleState.EXPANDED);

		super.changeState(state);
	}

	public create(): TPromise<void> {
		return TPromise.as(null);
	}

	public renderHeader(container: HTMLElement): void {

		// Tool bar
		this.toolBar = new ToolBar($('div.actions').appendTo(container).getHTMLElement(), this.contextMenuService, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionItemProvider: (action) => this.getActionItem(action),
			ariaLabel: nls.localize('viewToolbarAriaLabel', "{0} actions", this.viewName),
			getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id)
		});
		this.toolBar.actionRunner = this.actionRunner;
		this.updateActions();

		// Expand on drag over
		this.dragHandler = new DelayedDragHandler(container, () => {
			if (!this.isExpanded()) {
				this.expand();
			}
		});
	}

	protected updateActions(): void {
		this.toolBar.setActions(prepareActions(this.getActions()), prepareActions(this.getSecondaryActions()))();
	}

	protected renderViewTree(container: HTMLElement): HTMLElement {
		return renderViewTree(container);
	}

	public getViewer(): ITree {
		return this.tree;
	}

	public setVisible(visible: boolean): TPromise<void> {
		this.isVisible = visible;

		updateTreeVisibility(this.tree, visible && this.state === CollapsibleState.EXPANDED);

		return TPromise.as(null);
	}

	public focusBody(): void {
		focus(this.tree);
	}

	protected reveal(element: any, relativeTop?: number): TPromise<void> {
		return reveal(this.tree, element, relativeTop);
	}

	protected layoutBody(size: number): void {
		this.treeContainer.style.height = size + 'px';
		this.tree.layout(size);
	}

	public getActions(): IAction[] {
		return [];
	}

	public getSecondaryActions(): IAction[] {
		return [];
	}

	public getActionItem(action: IAction): IActionItem {
		return null;
	}

	public shutdown(): void {
		// Subclass to implement
	}

	public dispose(): void {
		this.isDisposed = true;
		this.treeContainer = null;
		this.tree.dispose();

		this.dragHandler.dispose();

		this.toDispose = dispose(this.toDispose);

		if (this.toolBar) {
			this.toolBar.dispose();
		}

		super.dispose();
	}
}

export abstract class CollapsibleViewletView extends CollapsibleView implements IViewletView {
	protected treeContainer: HTMLElement;
	protected tree: ITree;
	protected toDispose: IDisposable[];
	protected isVisible: boolean;
	protected toolBar: ToolBar;
	protected actionRunner: IActionRunner;
	protected isDisposed: boolean;

	private dragHandler: DelayedDragHandler;

	constructor(
		actionRunner: IActionRunner,
		collapsed: boolean,
		private viewName: string,
		protected messageService: IMessageService,
		protected keybindingService: IKeybindingService,
		protected contextMenuService: IContextMenuService,
		headerSize?: number,
		minimumSize?: number
	) {
		super({
			minimumSize: minimumSize === void 0 ? 5 * 22 : minimumSize,
			initialState: collapsed ? CollapsibleState.COLLAPSED : CollapsibleState.EXPANDED,
			ariaHeaderLabel: viewName,
			headerSize
		});

		this.actionRunner = actionRunner;
		this.toDispose = [];
	}

	protected changeState(state: CollapsibleState): void {
		updateTreeVisibility(this.tree, state === CollapsibleState.EXPANDED);

		super.changeState(state);
	}

	public create(): TPromise<void> {
		return TPromise.as(null);
	}

	public renderHeader(container: HTMLElement): void {

		// Tool bar
		this.toolBar = new ToolBar($('div.actions').appendTo(container).getHTMLElement(), this.contextMenuService, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionItemProvider: (action) => this.getActionItem(action),
			ariaLabel: nls.localize('viewToolbarAriaLabel', "{0} actions", this.viewName),
			getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id)
		});
		this.toolBar.actionRunner = this.actionRunner;
		this.updateActions();

		// Expand on drag over
		this.dragHandler = new DelayedDragHandler(container, () => {
			if (!this.isExpanded()) {
				this.expand();
			}
		});
	}

	protected updateActions(): void {
		this.toolBar.setActions(prepareActions(this.getActions()), prepareActions(this.getSecondaryActions()))();
	}

	protected renderViewTree(container: HTMLElement): HTMLElement {
		return renderViewTree(container);
	}

	public getViewer(): ITree {
		return this.tree;
	}

	public setVisible(visible: boolean): TPromise<void> {
		this.isVisible = visible;

		updateTreeVisibility(this.tree, visible && this.state === CollapsibleState.EXPANDED);

		return TPromise.as(null);
	}

	public focusBody(): void {
		focus(this.tree);
	}

	protected reveal(element: any, relativeTop?: number): TPromise<void> {
		return reveal(this.tree, element, relativeTop);
	}

	public layoutBody(size: number): void {
		this.treeContainer.style.height = size + 'px';
		this.tree.layout(size);
	}

	public getActions(): IAction[] {
		return [];
	}

	public getSecondaryActions(): IAction[] {
		return [];
	}

	public getActionItem(action: IAction): IActionItem {
		return null;
	}

	public shutdown(): void {
		// Subclass to implement
	}

	public dispose(): void {
		this.isDisposed = true;
		this.treeContainer = null;
		this.tree.dispose();

		if (this.dragHandler) {
			this.dragHandler.dispose();
		}

		this.toDispose = dispose(this.toDispose);

		if (this.toolBar) {
			this.toolBar.dispose();
		}

		super.dispose();
	}
}

function updateTreeVisibility(tree: ITree, isVisible: boolean): void {
	if (!tree) {
		return;
	}

	if (isVisible) {
		$(tree.getHTMLElement()).show();
	} else {
		$(tree.getHTMLElement()).hide(); // make sure the tree goes out of the tabindex world by hiding it
	}

	if (isVisible) {
		tree.onVisible();
	} else {
		tree.onHidden();
	}
}

function focus(tree: ITree): void {
	if (!tree) {
		return; // return early if viewlet has not yet been created
	}

	// Make sure the current selected element is revealed
	const selection = tree.getSelection();
	if (selection.length > 0) {
		reveal(tree, selection[0], 0.5).done(null, errors.onUnexpectedError);
	}

	// Pass Focus to Viewer
	tree.DOMFocus();
}

function renderViewTree(container: HTMLElement): HTMLElement {
	const treeContainer = document.createElement('div');
	container.appendChild(treeContainer);

	return treeContainer;
}

function reveal(tree: ITree, element: any, relativeTop?: number): TPromise<void> {
	if (!tree) {
		return TPromise.as(null); // return early if viewlet has not yet been created
	}

	return tree.reveal(element, relativeTop);
}