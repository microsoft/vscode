/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IPanel } from 'vs/workbench/common/panel';
import { Composite, CompositeDescriptor, CompositeRegistry } from 'vs/workbench/browser/composite';
import { Action } from 'vs/base/common/actions';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';
import { isAncestor } from 'vs/base/browser/dom';

export abstract class Panel extends Composite implements IPanel { }

/**
 * A panel descriptor is a leightweight descriptor of a panel in the workbench.
 */
export class PanelDescriptor extends CompositeDescriptor<Panel> {

	constructor(ctor: IConstructorSignature0<Panel>, id: string, name: string, cssClass?: string, order?: number, _commandId?: string) {
		super(ctor, id, name, cssClass, order, _commandId);
	}
}

export class PanelRegistry extends CompositeRegistry<Panel> {
	private defaultPanelId: string;

	/**
	 * Registers a panel to the platform.
	 */
	registerPanel(descriptor: PanelDescriptor): void {
		super.registerComposite(descriptor);
	}

	/**
	 * Returns an array of registered panels known to the platform.
	 */
	getPanels(): PanelDescriptor[] {
		return this.getComposites() as PanelDescriptor[];
	}

	/**
	 * Sets the id of the panel that should open on startup by default.
	 */
	setDefaultPanelId(id: string): void {
		this.defaultPanelId = id;
	}

	/**
	 * Gets the id of the panel that should open on startup by default.
	 */
	getDefaultPanelId(): string {
		return this.defaultPanelId;
	}
}

/**
 * A reusable action to toggle a panel with a specific id depending on focus.
 */
export abstract class TogglePanelAction extends Action {

	private panelId: string;

	constructor(
		id: string,
		label: string,
		panelId: string,
		protected panelService: IPanelService,
		private partService: IPartService,
		cssClass?: string
	) {
		super(id, label, cssClass);
		this.panelId = panelId;
	}

	run(): Promise<any> {
		if (this.isPanelFocused()) {
			this.partService.setPanelHidden(true);
		} else {
			this.panelService.openPanel(this.panelId, true);
		}

		return Promise.resolve(null);
	}

	private isPanelActive(): boolean {
		const activePanel = this.panelService.getActivePanel();

		return activePanel && activePanel.getId() === this.panelId;
	}

	private isPanelFocused(): boolean {
		const activeElement = document.activeElement;

		return !!(this.isPanelActive() && activeElement && isAncestor(activeElement, this.partService.getContainer(Parts.PANEL_PART)));
	}
}

export const Extensions = {
	Panels: 'workbench.contributions.panels'
};

Registry.add(Extensions.Panels, new PanelRegistry());
