/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/registry/common/platform';
import { Action, IAction } from 'vs/base/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { Composite, CompositeDescriptor, CompositeRegistry } from 'vs/workbench/browser/composite';
import { IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';
import { ToggleSidebarVisibilityAction, ToggleSidebarPositionAction } from 'vs/workbench/browser/actions/layoutActions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { AsyncDataTree } from 'vs/base/browser/ui/tree/asyncDataTree';
import { AbstractTree } from 'vs/base/browser/ui/tree/abstractTree';

export abstract class Viewlet extends Composite implements IViewlet {

	constructor(id: string,
		protected configurationService: IConfigurationService,
		private layoutService: IWorkbenchLayoutService,
		telemetryService: ITelemetryService,
		themeService: IThemeService,
		storageService: IStorageService
	) {
		super(id, telemetryService, themeService, storageService);
	}

	getOptimalWidth(): number | null {
		return null;
	}

	getContextMenuActions(): IAction[] {
		const toggleSidebarPositionAction = new ToggleSidebarPositionAction(ToggleSidebarPositionAction.ID, ToggleSidebarPositionAction.getLabel(this.layoutService), this.layoutService, this.configurationService);
		return [toggleSidebarPositionAction,
			<IAction>{
				id: ToggleSidebarVisibilityAction.ID,
				label: nls.localize('compositePart.hideSideBarLabel', "Hide Side Bar"),
				enabled: true,
				run: () => this.layoutService.setSideBarHidden(true)
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

	get iconUrl(): URI | undefined {
		return this._iconUrl;
	}
}

export const Extensions = {
	Viewlets: 'workbench.contributions.viewlets'
};

export class ViewletRegistry extends CompositeRegistry<Viewlet> {
	private defaultViewletId!: string;

	/**
	 * Registers a viewlet to the platform.
	 */
	registerViewlet(descriptor: ViewletDescriptor): void {
		super.registerComposite(descriptor);
	}

	/**
	 * Deregisters a viewlet to the platform.
	 */
	deregisterViewlet(id: string): void {
		if (id === this.defaultViewletId) {
			throw new Error('Cannot deregister default viewlet');
		}
		super.deregisterComposite(id);
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

	constructor(
		id: string,
		name: string,
		private readonly viewletId: string,
		@IViewletService protected viewletService: IViewletService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, name);

		this.enabled = !!this.viewletService && !!this.editorGroupService;
	}

	run(): Promise<any> {

		// Pass focus to viewlet if not open or focused
		if (this.otherViewletShowing() || !this.sidebarHasFocus()) {
			return this.viewletService.openViewlet(this.viewletId, true);
		}

		// Otherwise pass focus to editor group
		this.editorGroupService.activeGroup.focus();

		return Promise.resolve(true);
	}

	private otherViewletShowing(): boolean {
		const activeViewlet = this.viewletService.getActiveViewlet();

		return !activeViewlet || activeViewlet.getId() !== this.viewletId;
	}

	private sidebarHasFocus(): boolean {
		const activeViewlet = this.viewletService.getActiveViewlet();
		const activeElement = document.activeElement;

		return !!(activeViewlet && activeElement && DOM.isAncestor(activeElement, this.layoutService.getContainer(Parts.SIDEBAR_PART)));
	}
}

export class CollapseAction extends Action {
	constructor(tree: AsyncDataTree<any, any, any> | AbstractTree<any, any, any>, enabled: boolean, clazz?: string) {
		super('workbench.action.collapse', nls.localize('collapse', "Collapse All"), clazz, enabled, () => {
			tree.collapseAll();

			return Promise.resolve(undefined);
		});
	}
}
