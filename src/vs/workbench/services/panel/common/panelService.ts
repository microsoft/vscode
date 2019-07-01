/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IPanel } from 'vs/workbench/common/panel';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IBadge } from 'vs/workbench/services/activity/common/activity';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IProgressIndicator } from 'vs/platform/progress/common/progress';

export const IPanelService = createDecorator<IPanelService>('panelService');

export interface IPanelIdentifier {
	id: string;
	name: string;
	cssClass?: string;
}

export interface IPanelService {

	_serviceBrand: ServiceIdentifier<any>;

	readonly onDidPanelOpen: Event<{ panel: IPanel, focus: boolean }>;
	readonly onDidPanelClose: Event<IPanel>;

	/**
	 * Opens a panel with the given identifier and pass keyboard focus to it if specified.
	 */
	openPanel(id: string, focus?: boolean): IPanel | null;

	/**
	 * Returns the current active panel or null if none
	 */
	getActivePanel(): IPanel | null;

	/**
	 * Returns the panel by id.
	 */
	getPanel(id: string): IPanelIdentifier | undefined;

	/**
	 * Returns all built-in panels following the default order
	 */
	getPanels(): IPanelIdentifier[];

	/**
	 * Returns pinned panels following the visual order
	 */
	getPinnedPanels(): IPanelIdentifier[];

	/**
	 * Returns the progress indicator for the panel bar.
	 */
	getProgressIndicator(id: string): IProgressIndicator | null;

	/**
	 * Show an activity in a panel.
	 */
	showActivity(panelId: string, badge: IBadge, clazz?: string): IDisposable;

	/**
	 * Hide the currently active panel.
	 */
	hideActivePanel(): void;

	/**
	 * Get the last active panel ID.
	 */
	getLastActivePanelId(): string;
}
