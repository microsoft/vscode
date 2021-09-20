/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBadge } from 'vs/workbench/services/activity/common/activity';
import { IDisposable } from 'vs/base/common/lifecycle';
import { PaneCompositeDescriptor } from 'vs/workbench/browser/panecomposite';
import { IPaneCompositePart } from 'vs/workbench/browser/parts/paneCompositePart';

export interface IPanelPart extends IPaneCompositePart {
	/**
	 * Returns pinned panels following the visual order
	 */
	getPinnedPaneComposites(): PaneCompositeDescriptor[];

	/**
	 * Show an activity in a panel.
	 */
	showActivity(panelId: string, badge: IBadge, clazz?: string): IDisposable;
}
