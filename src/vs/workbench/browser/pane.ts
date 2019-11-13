/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertIsDefined } from 'vs/base/common/types';
import { IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ViewExtensions, IViewsRegistry, IViewContainersRegistry, ViewContainer, IViewDescriptor } from 'vs/workbench/common/views';
import { Extensions as PanelExtensions, PanelRegistry, PanelDescriptor, Panel } from 'vs/workbench/browser/panel';
import { Extensions as ViewletExtensions, ViewletRegistry, ViewletDescriptor, Viewlet } from 'vs/workbench/browser/viewlet';
import { URI } from 'vs/base/common/uri';
import { find } from 'vs/base/common/arrays';

/**
 * A pane descriptor is a leightweight descriptor of a pane in the workbench.
 */
export class PaneDescriptor {
	readonly viewletDescriptor: ViewletDescriptor;
	readonly panelDescriptor: PanelDescriptor;
	readonly viewCtor: any;

	constructor(
		private readonly ctors: { viewlet: IConstructorSignature0<Viewlet>, panel: IConstructorSignature0<Panel>, view: any },
		readonly id: string,
		readonly name: string,
		readonly sidebarCssClass?: string,
		readonly panelCssClass?: string,
		readonly order?: number,
		readonly _iconUrl?: URI,
		readonly _commandId?: string) {
		this.viewletDescriptor = new ViewletDescriptor(this.ctors.viewlet, id, name, sidebarCssClass, order, _iconUrl);
		this.panelDescriptor = new PanelDescriptor(this.ctors.panel, id, name, panelCssClass, order, _commandId);

		this.viewCtor = ctors.view;
	}

	// instantiate(instantiationService: IInstantiationService): T {
	// 	return instantiationService.createInstance(this.ctor);
	// }
}

type PaneLocation = 'panel' | 'sidebar';

export class PaneRegistry {
	private defaultPaneId: string | undefined;
	private _registeredPanes: PaneDescriptor[] = [];
	private _panes: Map<PaneDescriptor, PaneLocation> = new Map<PaneDescriptor, PaneLocation>();
	private _viewContainers: Map<PaneDescriptor, ViewContainer> = new Map<PaneDescriptor, ViewContainer>();

	// For sidebar registration
	private readonly viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
	private readonly viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
	private readonly viewletRegistry = Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets);

	// For panel registration
	private readonly panelRegistry = Registry.as<PanelRegistry>(PanelExtensions.Panels);

	/**
	 * Registers a pane to the platform.
	 */
	registerPane(descriptor: PaneDescriptor): void {
		// Check if already registered
		if (this.paneById(descriptor.id)) {
			return;
		}

		// Add entry to registry
		this._registeredPanes.push(descriptor);

		// Register a view container that hides on empty
		const viewContainer = this.viewContainerRegistry.registerViewContainer(descriptor.id, true);
		this._viewContainers.set(descriptor, viewContainer);

		// Register a viewlet
		this.viewletRegistry.registerViewlet(descriptor.viewletDescriptor);

		// Add pane
		this.addPane(descriptor);
	}

	/**
	 * Deregisters a pane to the platform.
	 */
	deregisterPane(id: string): void {
		const descriptor = this.paneById(id);
		if (!descriptor) {
			return;
		}

		this._registeredPanes.splice(this._registeredPanes.indexOf(descriptor), 1);

		// Do removal first before unregistering view container and viewlet
		this.removePane(descriptor);

		// Remove the viewlet
		this.viewletRegistry.deregisterViewlet(descriptor.id);

		// Remove view container
		const viewContainer = this._viewContainers.get(descriptor);
		this.viewContainerRegistry.deregisterViewContainer(viewContainer!);
		this._viewContainers.delete(descriptor);
	}

	private getViewDescriptor(descriptor: PaneDescriptor): IViewDescriptor {
		return {
			ctorDescriptor: { ctor: descriptor.viewCtor },
			id: descriptor.id,
			name: descriptor.name,
			canToggleVisibility: false
		};
	}

	private addPane(descriptor: PaneDescriptor, location: PaneLocation = 'sidebar'): void {
		if (location === 'panel') {
			this.panelRegistry.registerPanel(descriptor.panelDescriptor);
		} else {
			const viewContainer = this._viewContainers.get(descriptor);
			const viewDescriptor = this.getViewDescriptor(descriptor);

			this.viewsRegistry.registerViews([viewDescriptor], viewContainer!);
		}

		this._panes.set(descriptor, location);
	}

	private removePane(descriptor: PaneDescriptor): void {
		if (this._panes.get(descriptor) === 'panel') {
			// Remove from panel
			this.panelRegistry.deregisterPanel(descriptor.id);
		} else {
			// De-register view and viewlet
			const viewContainer = this._viewContainers.get(descriptor);
			this.viewsRegistry.deregisterViews(this.viewsRegistry.getViews(viewContainer!), viewContainer!);
		}

		this._panes.delete(descriptor);
	}

	/**
	 * Sets the id of the pane that should open on startup by default.
	 */
	setDefaultPaneId(id: string): void {
		this.defaultPaneId = id;
	}

	/**
	 * Gets the id of the pane that should open on startup by default.
	 */
	getDefaultPaneId(): string {
		return assertIsDefined(this.defaultPaneId);
	}

	/**
	 * Find out if a pane exists with the provided ID.
	 */
	hasPane(id: string): boolean {
		return this._registeredPanes.some(pane => pane.id === id);
	}

	private paneById(id: string): PaneDescriptor | undefined {
		return find(this._registeredPanes, pane => pane.id === id);
	}

	/**
	 * Move pane from between the panel and sidebar
	 */
	movePane(paneToMove: string, location: PaneLocation): void {
		// If the pane is not registered, return
		const paneDescriptor = this.paneById(paneToMove);
		if (!paneDescriptor) {
			return;
		}

		// If the pane is already at this location, no-op
		if (this._panes.get(paneDescriptor) === location) {
			return;
		}

		// Remove the pane first
		this.removePane(paneDescriptor);

		// Add the pane to the new positon
		this.addPane(paneDescriptor, location);
	}
}

export const Extensions = {
	Panes: 'workbench.contributions.panes'
};

Registry.add(Extensions.Panes, new PaneRegistry());
