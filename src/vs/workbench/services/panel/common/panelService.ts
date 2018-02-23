/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { IPanel } from 'vs/workbench/common/panel';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export const IPanelService = createDecorator<IPanelService>('panelService');

export interface IPanelIdentifier {
	id: string;
	name: string;
	cssClass: string;
}

export interface IPanelService {
	_serviceBrand: ServiceIdentifier<any>;

	onDidPanelOpen: Event<IPanel>;

	onDidPanelClose: Event<IPanel>;

	/**
	 * Opens a panel with the given identifier and pass keyboard focus to it if specified.
	 */
	openPanel(id: string, focus?: boolean): TPromise<IPanel>;

	/**
	 * Returns the current active panel or null if none
	 */
	getActivePanel(): IPanel;

	/**
	 * Returns all enabled panels
	 */
	getPanels(): IPanelIdentifier[];

	/**
	 * Enables or disables a panel. Disabled panels are completly hidden from UI.
	 * By default all panels are enabled.
	 */
	enablePanel(id: string, enabled: boolean): void;
}
