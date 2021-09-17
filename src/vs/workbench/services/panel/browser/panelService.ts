/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IBadge } from 'vs/workbench/services/activity/common/activity';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IProgressIndicator } from 'vs/platform/progress/common/progress';
import { IPaneComposite } from 'vs/workbench/common/panecomposite';
import { PaneCompositeDescriptor } from 'vs/workbench/browser/panecomposite';

export const IPanelService = createDecorator<IPanelService>('panelService');

export interface IPanelService {

	readonly _serviceBrand: undefined;

	readonly onDidPaneCompositeOpen: Event<{ readonly panel: IPaneComposite, readonly focus: boolean }>;
	readonly onDidPaneCompositeClose: Event<IPaneComposite>;

	/**
	 * Opens a panel with the given identifier and pass keyboard focus to it if specified.
	 */
	openPaneComposite(id?: string, focus?: boolean): Promise<IPaneComposite | undefined>;

	/**
	 * Returns the current active panel or null if none
	 */
	getActivePaneComposite(): IPaneComposite | undefined;

	/**
	 * Returns the panel by id.
	 */
	getPaneComposite(id: string): PaneCompositeDescriptor | undefined;

	/**
	 * Returns all built-in panels following the default order
	 */
	getPaneComposites(): PaneCompositeDescriptor[];

	/**
	 * Returns the progress indicator for the panel bar.
	 */
	getProgressIndicator(id: string): IProgressIndicator | undefined;

	/**
	 * Hide the currently active panel.
	 */
	hideActivePaneComposite(): void;

	/**
	 * Get the last active panel ID.
	 */
	getLastActivePaneCompositeId(): string;

	/**
	 * Returns pinned panels following the visual order
	 */
	getPinnedPaneComposites(): PaneCompositeDescriptor[];

	/**
	 * Show an activity in a panel.
	 */
	showActivity(panelId: string, badge: IBadge, clazz?: string): IDisposable;
}
