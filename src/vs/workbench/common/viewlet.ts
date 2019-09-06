/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IComposite } from 'vs/workbench/common/composite';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const SideBarVisibleContext = new RawContextKey<boolean>('sideBarVisible', false);
export const SidebarFocusContext = new RawContextKey<boolean>('sideBarFocus', false);
export const ActiveViewletContext = new RawContextKey<string>('activeViewlet', '');

export interface IViewlet extends IComposite {

	/**
	 * Returns the minimal width needed to avoid any content horizontal truncation
	 */
	getOptimalWidth(): number | null;
}
