/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import * as DOM from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/registry/common/platform';
import { Action, IAction } from 'vs/base/common/actions';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { Composite, CompositeDescriptor, CompositeRegistry } from 'vs/workbench/browser/composite';
import { IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';
import { ToggleSidebarVisibilityAction } from 'vs/workbench/browser/actions/toggleSidebarVisibility';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export abstract class Viewlet extends Composite implements IViewlet {

	constructor(id: string,
		private partService: IPartService,
		telemetryService: ITelemetryService,
		themeService: IThemeService
	) {
		super(id, telemetryService, themeService);
	}

	public getOptimalWidth(): number {
		return null;
	}

	public getContextMenuActions(): IAction[] {
		return [<IAction>{
			id: ToggleSidebarVisibilityAction.ID,
			label: nls.localize('compositePart.hideSideBarLabel', "Hide Side Bar"),
			enabled: true,
			run: () => this.partService.setSideBarHidden(true)
		}];
	}
}

/**
 * A viewlet descriptor is a leightweight descriptor of a viewlet in the workbench.
 */
export class ViewletDescriptor extends CompositeDescriptor<Viewlet> {

	constructor(
		ctor: IConstructorSignature0<Viewlet>,
		id: string,
		name: string,
		cssClass?: string,
		order?: number,
		private _extensionId?: string
	) {
		super(ctor, id, name, cssClass, order, id);
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

		return activeViewlet && activeElement && DOM.isAncestor(activeElement, (<Viewlet>activeViewlet).getContainer());
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
			viewer.domFocus();
			viewer.focusFirst();

			return TPromise.as(null);
		});
	}
}