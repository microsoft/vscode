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
import { IViewlet } from 'vs/workbench/common/viewlet';
import { Composite, CompositeDescriptor, CompositeRegistry } from 'vs/workbench/browser/composite';
import { IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';
import { ToggleSidebarVisibilityAction } from 'vs/workbench/browser/actions/toggleSidebarVisibility';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { URI } from 'vs/base/common/uri';

export abstract class Viewlet extends Composite implements IViewlet {

	constructor(id: string,
		private partService: IPartService,
		telemetryService: ITelemetryService,
		themeService: IThemeService
	) {
		super(id, telemetryService, themeService);
	}

	getOptimalWidth(): number {
		return null;
	}

	getContextMenuActions(): IAction[] {
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
		private _iconUrl?: URI
	) {
		super(ctor, id, name, cssClass, order, id);
	}

	get iconUrl(): URI {
		return this._iconUrl;
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
	registerViewlet(descriptor: ViewletDescriptor): void {
		super.registerComposite(descriptor);
	}

	/**
	 * Returns the viewlet descriptor for the given id or null if none.
	 */
	getViewlet(id: string): ViewletDescriptor {
		return this.getComposite(id) as ViewletDescriptor;
	}

	/**
	 * Returns an array of registered viewlets known to the platform.
	 */
	getViewlets(): ViewletDescriptor[] {
		return this.getComposites() as ViewletDescriptor[];
	}

	/**
	 * Sets the id of the viewlet that should open on startup by default.
	 */
	setDefaultViewletId(id: string): void {
		this.defaultViewletId = id;
	}

	/**
	 * Gets the id of the viewlet that should open on startup by default.
	 */
	getDefaultViewletId(): string {
		return this.defaultViewletId;
	}
}

Registry.add(Extensions.Viewlets, new ViewletRegistry());

/**
 * A reusable action to show a viewlet with a specific id.
 */
export class ShowViewletAction extends Action {
	private viewletId: string;

	constructor(
		id: string,
		name: string,
		viewletId: string,
		@IViewletService protected viewletService: IViewletService,
		@IEditorGroupsService private editorGroupService: IEditorGroupsService,
		@IPartService private partService: IPartService
	) {
		super(id, name);

		this.viewletId = viewletId;
		this.enabled = !!this.viewletService && !!this.editorGroupService;
	}

	run(): TPromise<any> {

		// Pass focus to viewlet if not open or focused
		if (this.otherViewletShowing() || !this.sidebarHasFocus()) {
			return this.viewletService.openViewlet(this.viewletId, true);
		}

		// Otherwise pass focus to editor group
		this.editorGroupService.activeGroup.focus();

		return TPromise.as(true);
	}

	private otherViewletShowing(): boolean {
		const activeViewlet = this.viewletService.getActiveViewlet();

		return !activeViewlet || activeViewlet.getId() !== this.viewletId;
	}

	private sidebarHasFocus(): boolean {
		const activeViewlet = this.viewletService.getActiveViewlet();
		const activeElement = document.activeElement;

		return activeViewlet && activeElement && DOM.isAncestor(activeElement, this.partService.getContainer(Parts.SIDEBAR_PART));
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
