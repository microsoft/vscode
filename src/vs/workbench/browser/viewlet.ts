/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import DOM = require('vs/base/browser/dom');
import errors = require('vs/base/common/errors');
import { Registry } from 'vs/platform/registry/common/platform';
import { Dimension, Builder } from 'vs/base/browser/builder';
import { Action } from 'vs/base/common/actions';
import { ITree, IFocusEvent, ISelectionEvent } from 'vs/base/parts/tree/browser/tree';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { Composite, CompositeDescriptor, CompositeRegistry } from 'vs/workbench/browser/composite';

export abstract class Viewlet extends Composite implements IViewlet {

	public getOptimalWidth(): number {
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

		return TPromise.as(null);
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
		const selection = this.viewer.getSelection();
		if (selection.length > 0) {
			this.reveal(selection[0], 0.5).done(null, errors.onUnexpectedError);
		}

		// Pass Focus to Viewer
		this.viewer.DOMFocus();
	}

	public reveal(element: any, relativeTop?: number): TPromise<void> {
		if (!this.viewer) {
			return TPromise.as(null); // return early if viewlet has not yet been created
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

	public dispose(): void {

		// Dispose Viewer
		if (this.viewer) {
			this.viewer.dispose();
		}

		super.dispose();
	}
}

/**
 * A viewlet descriptor is a leightweight descriptor of a viewlet in the workbench.
 */
export class ViewletDescriptor extends CompositeDescriptor<Viewlet> {

	constructor(
		moduleId: string,
		ctorName: string,
		id: string,
		name: string,
		cssClass?: string,
		order?: number,
		private _extensionId?: string
	) {
		super(moduleId, ctorName, id, name, cssClass, order);

		if (_extensionId) {
			this.appendStaticArguments([id]); // Pass viewletId to external viewlet, which doesn't know its id until runtime.
		}
	}

	public get extensionId(): string {
		return this._extensionId;
	}
}

export const Extensions = {
	Viewlets: 'workbench.contributions.viewlets'
};

export class ViewletRegistry extends CompositeRegistry<Viewlet> {
	private defaultViewletId: string;

	/**
	 * Registers a viewlet to the platform.
	 */
	public registerViewlet(descriptor: ViewletDescriptor): void {
		super.registerComposite(descriptor);
	}

	/**
	 * Returns the viewlet descriptor for the given id or null if none.
	 */
	public getViewlet(id: string): ViewletDescriptor {
		return this.getComposite(id) as ViewletDescriptor;
	}

	/**
	 * Returns an array of registered viewlets known to the platform.
	 */
	public getViewlets(): ViewletDescriptor[] {
		return this.getComposites() as ViewletDescriptor[];
	}

	/**
	 * Sets the id of the viewlet that should open on startup by default.
	 */
	public setDefaultViewletId(id: string): void {
		this.defaultViewletId = id;
	}

	/**
	 * Gets the id of the viewlet that should open on startup by default.
	 */
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
		@IViewletService protected viewletService: IViewletService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, name);

		this.viewletId = viewletId;
		this.enabled = !!this.viewletService && !!this.editorService;
	}

	public run(): TPromise<any> {

		// Pass focus to viewlet if not open or focused
		if (this.otherViewletShowing() || !this.sidebarHasFocus()) {
			return this.viewletService.openViewlet(this.viewletId, true);
		}

		// Otherwise pass focus to editor if possible
		const editor = this.editorService.getActiveEditor();
		if (editor) {
			editor.focus();
		}

		return TPromise.as(true);
	}

	private otherViewletShowing(): boolean {
		const activeViewlet = this.viewletService.getActiveViewlet();

		return !activeViewlet || activeViewlet.getId() !== this.viewletId;
	}

	private sidebarHasFocus(): boolean {
		const activeViewlet = this.viewletService.getActiveViewlet();
		const activeElement = document.activeElement;

		return activeViewlet && activeElement && DOM.isAncestor(activeElement, (<Viewlet>activeViewlet).getContainer().getHTMLElement());
	}
}

// Collapse All action
export class CollapseAction extends Action {

	constructor(viewer: ITree, enabled: boolean, clazz: string) {
		super('workbench.action.collapse', nls.localize('collapse', "Collapse All"), clazz, enabled, (context: any) => {
			if (viewer.getHighlight()) {
				return TPromise.as(null); // Global action disabled if user is in edit mode from another action
			}

			viewer.collapseAll();
			viewer.clearSelection();
			viewer.clearFocus();
			viewer.DOMFocus();
			viewer.focusFirst();

			return TPromise.as(null);
		});
	}
}