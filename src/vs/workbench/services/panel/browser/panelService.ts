/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IBadge } from 'vs/workbench/services/activity/common/activity';
import { IDisposable } from 'vs/base/common/lifecycle';
import { PaneCompositeDescriptor } from 'vs/workbench/browser/panecomposite';
import { IPaneCompositeService } from 'vs/workbench/services/panecomposite/browser/panecomposite';

export const IPanelService = createDecorator<IPanelService>('panelService');

export interface IPanelService extends IPaneCompositeService {
	/**
	 * Returns pinned panels following the visual order
	 */
	getPinnedPaneComposites(): PaneCompositeDescriptor[];

	/**
	 * Show an activity in a panel.
	 */
	showActivity(panelId: string, badge: IBadge, clazz?: string): IDisposable;
}
