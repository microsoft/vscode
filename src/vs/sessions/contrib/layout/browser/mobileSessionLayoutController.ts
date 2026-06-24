/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMobile, isWeb } from '../../../../base/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { BaseLayoutController } from './baseSessionLayoutController.js';

/**
 * Reduced layout controller used on the web phone layout. It keeps the shared
 * panel / working-set / state management of {@link BaseLayoutController} but
 * deliberately omits the auxiliary bar visibility management, which would cause
 * disruptive auto-expand on narrow viewports.
 *
 * Its behaviour is enumerated as rules **M1-M2** in
 * [mobileSessionLayoutController.md](./mobileSessionLayoutController.md).
 */
export class MobileLayoutController extends BaseLayoutController {

	static readonly ID = 'workbench.contrib.sessionsMobileLayoutController';

	// [M2] Intentionally does not override `_registerViewStateManagement`, so the
	// auxiliary bar is never auto-shown / hidden / captured on phone viewports.
}

// Registered only on the web phone layout.
if (isWeb && isMobile) {
	registerWorkbenchContribution2(MobileLayoutController.ID, MobileLayoutController, WorkbenchPhase.AfterRestored);
}
