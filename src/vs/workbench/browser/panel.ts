/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import {Registry} from 'vs/platform/platform';
import {TPromise} from 'vs/base/common/winjs.base';
import {IPanel} from 'vs/workbench/common/panel';
import {Composite, CompositeDescriptor, CompositeRegistry} from 'vs/workbench/browser/composite';
import { Action } from 'vs/base/common/actions';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';

export abstract class Panel extends Composite implements IPanel { }

/**
 * A panel descriptor is a leightweight descriptor of a panel in the workbench.
 */
export class PanelDescriptor extends CompositeDescriptor<Panel> {
	constructor(moduleId: string, ctorName: string, id: string, name: string, cssClass?: string) {
		super(moduleId, ctorName, id, name, cssClass);
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
		return this.getComposite(id);
	}

	/**
	 * Returns an array of registered panels known to the platform.
	 */
	public getPanels(): PanelDescriptor[] {
		return this.getComposits();
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
		private panelService: IPanelService,
		private editorService: IWorkbenchEditorService
	) {
		super(id, name);
		this.panelId = panelId;
	}

	public run(): TPromise<any> {
		// Pass focus to panel if not showing or not focussed
		if (!this.isPanelShowing() || !this.isPanelFocussed()) {
			return this.panelService.openPanel(this.panelId, true);
		}

		// Otherwise pass focus to editor if possible
		let editor = this.editorService.getActiveEditor();
		if (editor) {
			editor.focus();
		}

		return TPromise.as(true);
	}

	private isPanelShowing(): boolean {
		let panel= this.panelService.getActivePanel();
		return panel && panel.getId() === this.panelId;
	}

	private isPanelFocussed(): boolean {
		let activePanel = this.panelService.getActivePanel();
		let activeElement = document.activeElement;

		return activePanel && activeElement && DOM.isAncestor(activeElement, (<Panel>activePanel).getContainer().getHTMLElement());
	}
}

export const Extensions = {
	Panels: 'workbench.contributions.panels'
};

Registry.add(Extensions.Panels, new PanelRegistry());
