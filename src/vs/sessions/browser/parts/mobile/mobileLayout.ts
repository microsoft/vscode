/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';

/**
 * CSS class applied to the sessions workbench main container when the
 * viewport is classified as phone. Must stay in sync with
 * `LayoutClasses.PHONE_LAYOUT` in `workbench.ts`.
 */
const PHONE_LAYOUT_CLASS = 'phone-layout';

/**
 * Returns true when the sessions workbench currently has the phone
 * layout class on its main container.
 *
 * Mobile Part subclasses are chosen once at construction time, but the
 * viewport class can change at runtime (e.g., device rotation crossing
 * the phone breakpoint). Parts use this to decide whether to apply
 * mobile-specific layout math or defer to the desktop implementation.
 */
export function isPhoneLayout(layoutService: IWorkbenchLayoutService): boolean {
	return layoutService.mainContainer.classList.contains(PHONE_LAYOUT_CLASS);
}
