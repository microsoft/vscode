/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { IPanel } from 'vs/workbench/common/panel';
import { Composite, CompositeDescriptor, CompositeRegistry } from 'vs/workbench/browser/composite';
import { Action } from 'vs/base/common/actions';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService } from 'vs/workbench/services/part/common/partService';

export abstract class Panel extends Composite implements IPanel { }

/**
 * A panel descriptor is a leightweight descriptor of a panel in the workbench.
 */
export class PanelDescriptor extends CompositeDescriptor<Panel> {

	constructor(moduleId: string, ctorName: string, id: string, name: string, cssClass?: string, order?: number, private _commandId?: string) {
		super(moduleId, ctorName, id, name, cssClass, order);
	}

	public get commandId(): string {
		return this._commandId;
	}
}

export class PanelRegistry extends CompositeRegistry<Panel> {
	private defaultPanelId: string;

	/**
	 * Registers a panel to the platform.
	 */
	public registerPanel(descriptor: PanelDescriptor): void {
		super.registerComposite(descriptor);
	}

	/**
	 * Returns the panel descriptor for the given id or null if none.
	 */
	public getPanel(id: string): PanelDescriptor {
		return this.getComposite(id) as PanelDescriptor;
	}

	/**
	 * Returns an array of registered panels known to the platform.
	 */
	public getPanels(): PanelDescriptor[] {
		return this.getComposites() as PanelDescriptor[];
	}

	/**
	 * Sets the id of the panel that should open on startup by default.
	 */
	public setDefaultPanelId(id: string): void {
		this.defaultPanelId = id;
	}

	/**
	 * Gets the id of the panel that should open on startup by default.
	 */
	public getDefaultPanelId(): string {
		return this.defaultPanelId;
	}
}

/**
 * A reusable action to toggle a panel with a specific id.
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

	public run(): TPromise<any> {

		if (this.isPanelShowing()) {
			return this.partService.setPanelHidden(true);
		}

		return this.panelService.openPanel(this.panelId, true);
	}

	private isPanelShowing(): boolean {
		const panel = this.panelService.getActivePanel();

		return panel && panel.getId() === this.panelId;
	}

	protected isPanelFocussed(): boolean {
		const activePanel = this.panelService.getActivePanel();
		const activeElement = document.activeElement;

		return activePanel && activeElement && DOM.isAncestor(activeElement, (<Panel>activePanel).getContainer().getHTMLElement());
	}
}

export const Extensions = {
	Panels: 'workbench.contributions.panels'
};

Registry.add(Extensions.Panels, new PanelRegistry());
