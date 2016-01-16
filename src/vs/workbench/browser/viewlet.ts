/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {Promise, TPromise} from 'vs/base/common/winjs.base';
import DOM = require('vs/base/browser/dom');
import errors = require('vs/base/common/errors');
import {IEventEmitter} from 'vs/base/common/eventEmitter';
import {Registry} from 'vs/platform/platform';
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import {IAction, IActionRunner, Action, ActionRunner} from 'vs/base/common/actions';
import {IActionItem, ActionsOrientation} from 'vs/base/browser/ui/actionbar/actionbar';
import {ITree, IFocusEvent, ISelectionEvent} from 'vs/base/parts/tree/browser/tree';
import {WorkbenchComponent} from 'vs/workbench/common/component';
import {ViewletEvent} from 'vs/workbench/common/events';
import {prepareActions} from 'vs/workbench/browser/actionBarRegistry';
import {ToolBar} from 'vs/base/browser/ui/toolbar/toolbar';
import {DelayedDragHandler} from 'vs/base/browser/dnd';
import {disposeAll, IDisposable} from 'vs/base/common/lifecycle';
import {CollapsibleView, CollapsibleState, FixedCollapsibleView} from 'vs/base/browser/ui/splitview/splitview';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IViewlet} from 'vs/workbench/common/viewlet';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {AsyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {ISelection, Selection, StructuredSelection} from 'vs/platform/selection/common/selection';
import {INullService} from 'vs/platform/instantiation/common/instantiation';
/**
 * Internal viewlet events to communicate with viewlet container.
 */
export const EventType = {
	INTERNAL_VIEWLET_TITLE_AREA_UPDATE: 'internalViewletTitleAreaUpdate'
};

/**
 * Viewlets are layed out in the sidebar part of the workbench. Only one viewlet can be open
 * at a time. Each viewlet has a minimized representation that is good enough to provide some
 * information about the state of the viewlet data.
 * The workbench will keep a viewlet alive after it has been created and show/hide it based on
 * user interaction. The lifecycle of a viewlet goes in the order create(), setVisible(true|false),
 * layout(), focus(), dispose(). During use of the workbench, a viewlet will often receive a setVisible,
 * layout and focus call, but only one create and dispose call.
 */
export abstract class Viewlet extends WorkbenchComponent implements IViewlet {
	private _telemetryData: any = {};
	private visible: boolean;
	private parent: Builder;

	protected actionRunner: IActionRunner;

	/**
	 * Create a new viewlet with the given ID and context.
	 */
	constructor(id: string, @ITelemetryService private _telemetryService: ITelemetryService) {
		super(id);

		this.visible = false;
	}

	public getTitle(): string {
		return null;
	}

	public get telemetryService(): ITelemetryService {
		return this._telemetryService;
	}

	public get telemetryData(): any {
		return this._telemetryData;
	}

	/**
	 * Note: Clients should not call this method, the monaco workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Called to create this viewlet on the provided builder. This method is only
	 * called once during the lifetime of the workbench.
	 * Note that DOM-dependent calculations should be performed from the setVisible()
	 * call. Only then the viewlet will be part of the DOM.
	 */
	public create(parent: Builder): TPromise<void> {
		this.parent = parent;

		return Promise.as(null);
	}

	/**
	 * Returns the container this viewlet is being build in.
	 */
	public getContainer(): Builder {
		return this.parent;
	}

	/**
	 * Note: Clients should not call this method, the monaco workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Called to indicate that the viewlet has become visible or hidden. This method
	 * is called more than once during workbench lifecycle depending on the user interaction.
	 * The viewlet will be on-DOM if visible is set to true and off-DOM otherwise.
	 *
	 * The returned promise is complete when the viewlet is visible. As such it is valid
	 * to do a long running operation from this call. Typically this operation should be
	 * fast though because setVisible might be called many times during a session.
	 */
	public setVisible(visible: boolean): TPromise<void> {
		this.visible = visible;

		// Reset telemetry data when viewlet becomes visible
		if (visible) {
			this._telemetryData = {};
			this._telemetryData.startTime = new Date();
		}

		// Send telemetry data when viewlet hides
		else {
			this._telemetryData.timeSpent = (Date.now() - this._telemetryData.startTime) / 1000;
			delete this._telemetryData.startTime;

			// Only submit telemetry data when not running from an integration test
			if (this._telemetryService && this._telemetryService.publicLog) {
				let eventName: string = 'viewletShown';
				this._telemetryData.viewlet = this.getId();
				this._telemetryService.publicLog(eventName, this._telemetryData);
			}
		}

		return TPromise.as(null);
	}

	/**
	 * Called when this viewlet should receive keyboard focus.
	 */
	public focus(): void {
		// Subclasses can implement
	}

	/**
	 * Layout the contents of this viewlet using the provided dimensions.
	 */
	public abstract layout(dimension: Dimension): void;

	/**
	 * Returns an array of actions to show in the action bar of the viewlet.
	 */
	public getActions(): IAction[] {
		return [];
	}

	/**
	 * Returns an array of actions to show in the action bar of the viewlet
	 * in a less prominent way then action from getActions.
	 */
	public getSecondaryActions(): IAction[] {
		return [];
	}

	/**
	 * For any of the actions returned by this viewlet, provide an IActionItem in
	 * cases where the implementor of the viewlet wants to override the presentation
	 * of an action. Returns null to indicate that the action is not rendered through
	 * an action item.
	 */
	public getActionItem(action: IAction): IActionItem {
		return null;
	}

	/**
	 * Returns the instance of IActionRunner to use with this viewlet for the viewlet
	 * tool bar.
	 */
	public getActionRunner(): IActionRunner {
		if (!this.actionRunner) {
			this.actionRunner = new ActionRunner();
		}

		return this.actionRunner;
	}

	/**
	 * Method for viewlet implementors to indicate to the viewlet container that the title or the actions
	 * of the viewlet have changed. Calling this method will cause the container to ask for title (getTitle())
	 * and actions (getActions(), getSecondaryActions()) if the viewlet is visible or the next time the viewlet
	 * gets visible.
	 */
	protected updateTitleArea(): void {
		this.emit(EventType.INTERNAL_VIEWLET_TITLE_AREA_UPDATE, new ViewletEvent(this.getId()));
	}

	/**
	 * Returns an array of elements that are selected in the viewlet.
	 */
	public getSelection(): ISelection {
		return Selection.EMPTY;
	}

	/**
	 * Returns true if this viewlet is currently visible and false otherwise.
	 */
	public isVisible(): boolean {
		return this.visible;
	}

	/**
	 * Returns the underlying viewlet control or null if it is not accessible.
	 */
	public getControl(): IEventEmitter {
		return null;
	}
}

/**
 * Helper subtype of viewlet for those that use a tree inside.
 */
export abstract class ViewerViewlet extends Viewlet {

	protected viewer: ITree;

	private viewerContainer: Builder;
	private wasLayouted: boolean;

	public create(parent: Builder): TPromise<void> {
		super.create(parent);

		// Container for Viewer
		this.viewerContainer = parent.div();

		// Viewer
		this.viewer = this.createViewer(this.viewerContainer);

		// Eventing
		this.toUnbind.push(this.viewer.addListener('selection', (e: ISelectionEvent) => this.onSelection(e)));
		this.toUnbind.push(this.viewer.addListener('focus', (e: IFocusEvent) => this.onFocus(e)));

		return Promise.as(null);
	}

	/**
	 * Called when an element in the viewer receives selection.
	 */
	public abstract onSelection(e: ISelectionEvent): void;

	/**
	 * Called when an element in the viewer receives focus.
	 */
	public abstract onFocus(e: IFocusEvent): void;

	/**
	 * Returns true if this viewlet is currently visible and false otherwise.
	 */
	public abstract createViewer(viewerContainer: Builder): ITree;

	/**
	 * Returns the viewer that is contained in this viewlet.
	 */
	public getViewer(): ITree {
		return this.viewer;
	}

	public setVisible(visible: boolean): TPromise<void> {
		let promise: TPromise<void>;

		if (visible) {
			promise = super.setVisible(visible);
			this.getViewer().onVisible();
		} else {
			this.getViewer().onHidden();
			promise = super.setVisible(visible);
		}

		return promise;
	}

	public focus(): void {
		if (!this.viewer) {
			return; // return early if viewlet has not yet been created
		}

		// Make sure the current selected element is revealed
		let selection = this.viewer.getSelection();
		if (selection.length > 0) {
			this.reveal(selection[0], 0.5).done(null, errors.onUnexpectedError);
		}

		// Pass Focus to Viewer
		this.viewer.DOMFocus();
	}

	public reveal(element: any, relativeTop?: number): TPromise<void> {
		if (!this.viewer) {
			return Promise.as(null); // return early if viewlet has not yet been created
		}

		// The viewer cannot properly reveal without being layed out, so force it if not yet done
		if (!this.wasLayouted) {
			this.viewer.layout();
		}

		// Now reveal
		return this.viewer.reveal(element, relativeTop);
	}

	public layout(dimension: Dimension): void {
		if (!this.viewer) {
			return; // return early if viewlet has not yet been created
		}

		// Pass on to Viewer
		this.wasLayouted = true;
		this.viewer.layout(dimension.height);
	}

	public getControl(): ITree {
		return this.viewer;
	}

	public getSelection(): StructuredSelection {
		if (!this.viewer) {
			return new StructuredSelection([]); // return early if viewlet has not yet been created
		}

		return new StructuredSelection(this.viewer.getSelection());
	}

	public dispose(): void {

		// Dispose Viewer
		if (this.viewer) {
			this.viewer.dispose();
		}

		super.dispose();
	}
}

/**
 * A viewlet descriptor is a leightweight descriptor of a viewlet in the monaco workbench.
 */
export class ViewletDescriptor extends AsyncDescriptor<Viewlet> {
	public id: string;
	public name: string;
	public cssClass: string;
	public order: number;

	constructor(moduleId: string, ctorName: string, id: string, name: string, cssClass?: string, order?: number) {
		super(moduleId, ctorName);

		this.id = id;
		this.name = name;
		this.cssClass = cssClass;
		this.order = order;
	}
}

export const Extensions = {
	Viewlets: 'workbench.contributions.viewlets'
};

export interface IViewletRegistry {

	/**
	 * Registers a viewlet to the platform.
	 */
	registerViewlet(descriptor: ViewletDescriptor): void;

	/**
	 * Returns the viewlet descriptor for the given id or null if none.
	 */
	getViewlet(id: string): ViewletDescriptor;

	/**
	 * Returns an array of registered viewlets known to the platform.
	 */
	getViewlets(): ViewletDescriptor[];

	/**
	 * Sets the id of the viewlet that should open on startup by default.
	 */
	setDefaultViewletId(id: string): void;

	/**
	 * Gets the id of the viewlet that should open on startup by default.
	 */
	getDefaultViewletId(): string;
}

class ViewletRegistry implements IViewletRegistry {
	private viewlets: ViewletDescriptor[];
	private defaultViewletId: string;

	constructor() {
		this.viewlets = [];
	}

	public registerViewlet(descriptor: ViewletDescriptor): void {
		if (this.viewletById(descriptor.id) !== null) {
			return;
		}

		this.viewlets.push(descriptor);
	}

	public getViewlet(id: string): ViewletDescriptor {
		return this.viewletById(id);
	}

	public getViewlets(): ViewletDescriptor[] {
		return this.viewlets.slice(0);
	}

	public setViewlets(viewletsToSet: ViewletDescriptor[]): void {
		this.viewlets = viewletsToSet;
	}

	private viewletById(id: string): ViewletDescriptor {
		for (let i = 0; i < this.viewlets.length; i++) {
			if (this.viewlets[i].id === id) {
				return this.viewlets[i];
			}
		}

		return null;
	}

	public setDefaultViewletId(id: string): void {
		this.defaultViewletId = id;
	}

	public getDefaultViewletId(): string {
		return this.defaultViewletId;
	}
}

Registry.add(Extensions.Viewlets, new ViewletRegistry());

/**
 * A reusable action to toggle a viewlet with a specific id.
 */
export class ToggleViewletAction extends Action {
	private viewletId: string;

	constructor(
		id: string,
		name: string,
		viewletId: string,
		@IViewletService private viewletService: IViewletService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, name);

		this.viewletId = viewletId;
		this.enabled = !!this.viewletService && !!this.editorService;
	}

	public run(): Promise {

		// Pass focus to viewlet if not open or focussed
		if (this.otherViewletShowing() || !this.sidebarHasFocus()) {
			return this.viewletService.openViewlet(this.viewletId, true);
		}

		// Otherwise pass focus to editor if possible
		let editor = this.editorService.getActiveEditor();
		if (editor) {
			editor.focus();
		}

		return Promise.as(true);
	}

	private otherViewletShowing(): boolean {
		let activeViewlet = this.viewletService.getActiveViewlet();

		return !activeViewlet || activeViewlet.getId() !== this.viewletId;
	}

	private sidebarHasFocus(): boolean {
		let activeViewlet = this.viewletService.getActiveViewlet();
		let activeElement = document.activeElement;

		return activeViewlet && activeElement && DOM.isAncestor(activeElement, (<Viewlet>activeViewlet).getContainer().getHTMLElement());
	}
}

// Collapse All action
export class CollapseAction extends Action {

	constructor(viewer: ITree, enabled: boolean, clazz: string, @INullService ns) {
		super('workbench.action.collapse', nls.localize('collapse', "Collapse"), clazz, enabled, (context: any) => {
			if (viewer.getHighlight()) {
				return Promise.as(null); // Global action disabled if user is in edit mode from another action
			}

			viewer.collapseAll();
			viewer.clearSelection(); // Chance is high that element is now hidden, so unselect all
			viewer.DOMFocus(); // Pass keyboard focus back from action link to tree

			return Promise.as(null);
		});
	}
}

export interface IViewletView {
	create(): TPromise<void>;
	refresh(focus: boolean, reveal: boolean, instantProgress?: boolean): TPromise<void>;
	setVisible(visible: boolean): TPromise<void>;
	getActions(): IAction[];
	getSecondaryActions(): IAction[];
	getActionItem(action: IAction): IActionItem;
	shutdown(): void;
}

/**
 * The AdaptiveCollapsibleViewletView can grow with the content inside dynamically.
 */
export class AdaptiveCollapsibleViewletView extends FixedCollapsibleView implements IViewletView {
	protected treeContainer: HTMLElement;
	protected tree: ITree;
	protected toDispose: IDisposable[];
	protected isVisible: boolean;
	protected toolBar: ToolBar;
	protected actionRunner: IActionRunner;
	protected isDisposed: boolean;

	constructor(
		actionRunner: IActionRunner,
		initialBodySize: number,
		collapsed: boolean,
		private viewName: string,
		@IMessageService private messageService: IMessageService,
		@IContextMenuService protected contextMenuService: IContextMenuService
	) {
		super({
			expandedBodySize: initialBodySize,
			headerSize: 22,
			initialState: collapsed ? CollapsibleState.COLLAPSED : CollapsibleState.EXPANDED
		});

		this.actionRunner = actionRunner;
		this.toDispose = [];
	}

	public create(): TPromise<void> {
		return Promise.as(null);
	}

	public renderHeader(container: HTMLElement): void {

		// Tool bar
		this.toolBar = new ToolBar($('div.actions').appendTo(container).getHTMLElement(), this.contextMenuService, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionItemProvider: (action) => { return this.getActionItem(action); }
		});
		this.toolBar.actionRunner = this.actionRunner;
		this.toolBar.setActions(prepareActions(this.getActions()), prepareActions(this.getSecondaryActions()))();

		// Expand on drag over
		new DelayedDragHandler(container, () => {
			if (!this.isExpanded()) {
				this.expand();
			}
		});
	}

	protected renderViewTree(container: HTMLElement): HTMLElement {
		return renderViewTree(container);
	}

	public getViewer(): ITree {
		return this.tree;
	}

	public refresh(focus: boolean, reveal: boolean, instantProgress?: boolean): TPromise<void> {
		return Promise.as(null);
	}

	public setVisible(visible: boolean): TPromise<void> {
		this.isVisible = visible;

		if (visible) {
			this.tree.onVisible();
		} else {
			this.tree.onHidden();
		}

		return Promise.as(null);
	}

	public focus(): void {
		focus(this.tree);
	}

	public getSelection(): StructuredSelection {
		return new StructuredSelection(this.tree.getSelection());
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

		this.toDispose = disposeAll(this.toDispose);

		if (this.toolBar) {
			this.toolBar.dispose();
		}

		super.dispose();
	}
}

export class CollapsibleViewletView extends CollapsibleView implements IViewletView {
	protected treeContainer: HTMLElement;
	protected tree: ITree;
	protected toDispose: IDisposable[];
	protected isVisible: boolean;
	protected toolBar: ToolBar;
	protected actionRunner: IActionRunner;
	protected isDisposed: boolean;

	constructor(
		actionRunner: IActionRunner,
		collapsed: boolean,
		private viewName: string,
		@IMessageService protected messageService: IMessageService,
		@IContextMenuService protected contextMenuService: IContextMenuService
	) {
		super({
			minimumSize: 2 * 22,
			initialState: collapsed ? CollapsibleState.COLLAPSED : CollapsibleState.EXPANDED
		});

		this.actionRunner = actionRunner;
		this.toDispose = [];
	}

	public create(): TPromise<void> {
		return Promise.as(null);
	}

	public renderHeader(container: HTMLElement): void {

		// Tool bar
		this.toolBar = new ToolBar($('div.actions').appendTo(container).getHTMLElement(), this.contextMenuService, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionItemProvider: (action) => { return this.getActionItem(action); }
		});
		this.toolBar.actionRunner = this.actionRunner;
		this.toolBar.setActions(prepareActions(this.getActions()), prepareActions(this.getSecondaryActions()))();

		// Expand on drag over
		new DelayedDragHandler(container, () => {
			if (!this.isExpanded()) {
				this.expand();
			}
		});
	}

	protected renderViewTree(container: HTMLElement): HTMLElement {
		return renderViewTree(container);
	}

	public getViewer(): ITree {
		return this.tree;
	}

	public refresh(focus: boolean, reveal: boolean, instantProgress?: boolean): TPromise<void> {
		return Promise.as(null);
	}

	public setVisible(visible: boolean): TPromise<void> {
		this.isVisible = visible;

		if (visible) {
			this.tree.onVisible();
		} else {
			this.tree.onHidden();
		}

		return Promise.as(null);
	}

	public focus(): void {
		focus(this.tree);
	}

	public getSelection(): StructuredSelection {
		return new StructuredSelection(this.tree.getSelection());
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

		this.toDispose = disposeAll(this.toDispose);

		if (this.toolBar) {
			this.toolBar.dispose();
		}

		super.dispose();
	}
}

function renderViewTree(container: HTMLElement): HTMLElement {
	let treeContainer = document.createElement('div');
	DOM.addClass(treeContainer, 'explorer-view-content');
	container.appendChild(treeContainer);

	return treeContainer;
}

function focus(tree: ITree): void {
	if (!tree) {
		return; // return early if viewlet has not yet been created
	}

	// Make sure the current selected element is revealed
	let selection = tree.getSelection();
	if (selection.length > 0) {
		reveal(tree, selection[0], 0.5);
	}

	// Pass Focus to Viewer
	tree.DOMFocus();
}

function reveal(tree: ITree, element: any, relativeTop?: number): TPromise<void> {
	if (!tree) {
		return Promise.as(null); // return early if viewlet has not yet been created
	}

	return tree.reveal(element, relativeTop);
}