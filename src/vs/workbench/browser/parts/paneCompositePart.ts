/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { assertIsDefined } from 'vs/base/common/types';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressIndicator } from 'vs/platform/progress/common/progress';
import { PaneCompositeDescriptor } from 'vs/workbench/browser/panecomposite';
import { AuxiliaryBarPart } from 'vs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart';
import { PanelPart } from 'vs/workbench/browser/parts/panel/panelPart';
import { SidebarPart } from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import { IPaneComposite } from 'vs/workbench/common/panecomposite';
import { ViewContainerLocation, ViewContainerLocations } from 'vs/workbench/common/views';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';

export interface IPaneCompositePart {

	readonly onDidPaneCompositeOpen: Event<IPaneComposite>;
	readonly onDidPaneCompositeClose: Event<IPaneComposite>;

	/**
	 * Opens a viewlet with the given identifier and pass keyboard focus to it if specified.
	 */
	openPaneComposite(id: string | undefined, focus?: boolean): Promise<IPaneComposite | undefined>;

	/**
	 * Returns the current active viewlet if any.
	 */
	getActivePaneComposite(): IPaneComposite | undefined;

	/**
	 * Returns the viewlet by id.
	 */
	getPaneComposite(id: string): PaneCompositeDescriptor | undefined;

	/**
	 * Returns all enabled viewlets
	 */
	getPaneComposites(): PaneCompositeDescriptor[];

	/**
	 * Returns the progress indicator for the side bar.
	 */
	getProgressIndicator(id: string): IProgressIndicator | undefined;

	/**
	 * Hide the active viewlet.
	 */
	hideActivePaneComposite(): void;

	/**
	 * Return the last active viewlet id.
	 */
	getLastActivePaneCompositeId(): string;
}

export class PaneCompositePartService implements IPaneCompositePartService {
	declare readonly _serviceBrand: undefined;

	onDidPaneCompositeOpen: Event<{ composite: IPaneComposite; viewContainerLocation: ViewContainerLocation; }>;
	onDidPaneCompositeClose: Event<{ composite: IPaneComposite; viewContainerLocation: ViewContainerLocation; }>;

	private parts = new Map<ViewContainerLocation, IPaneCompositePart>();

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		this.parts.set(ViewContainerLocation.Panel, instantiationService.createInstance(PanelPart));
		this.parts.set(ViewContainerLocation.Sidebar, instantiationService.createInstance(SidebarPart));
		this.parts.set(ViewContainerLocation.AuxiliaryBar, instantiationService.createInstance(AuxiliaryBarPart));

		this.onDidPaneCompositeOpen = Event.any(...ViewContainerLocations.map(loc => Event.map(this.parts.get(loc)!.onDidPaneCompositeOpen, composite => { return { composite, viewContainerLocation: loc }; })));
		this.onDidPaneCompositeClose = Event.any(...ViewContainerLocations.map(loc => Event.map(this.parts.get(loc)!.onDidPaneCompositeClose, composite => { return { composite, viewContainerLocation: loc }; })));
	}

	openPaneComposite(id: string | undefined, viewContainerLocation: ViewContainerLocation, focus?: boolean): Promise<IPaneComposite | undefined> {
		return this.getPartByLocation(viewContainerLocation).openPaneComposite(id, focus);
	}
	getActivePaneComposite(viewContainerLocation: ViewContainerLocation): IPaneComposite | undefined {
		return this.getPartByLocation(viewContainerLocation).getActivePaneComposite();
	}
	getPaneComposite(id: string, viewContainerLocation: ViewContainerLocation): PaneCompositeDescriptor | undefined {
		return this.getPartByLocation(viewContainerLocation).getPaneComposite(id);
	}
	getPaneComposites(viewContainerLocation: ViewContainerLocation): PaneCompositeDescriptor[] {
		return this.getPartByLocation(viewContainerLocation).getPaneComposites();
	}
	getProgressIndicator(id: string, viewContainerLocation: ViewContainerLocation): IProgressIndicator | undefined {
		return this.getPartByLocation(viewContainerLocation).getProgressIndicator(id);
	}
	hideActivePaneComposite(viewContainerLocation: ViewContainerLocation): void {
		this.getPartByLocation(viewContainerLocation).hideActivePaneComposite();
	}
	getLastActivePaneCompositeId(viewContainerLocation: ViewContainerLocation): string {
		return this.getPartByLocation(viewContainerLocation).getLastActivePaneCompositeId();
	}

	getPartByLocation(viewContainerLocation: ViewContainerLocation): IPaneCompositePart {
		return assertIsDefined(this.parts.get(viewContainerLocation));
	}
}

registerSingleton(IPaneCompositePartService, PaneCompositePartService);
