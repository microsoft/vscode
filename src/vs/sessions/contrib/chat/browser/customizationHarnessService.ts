/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	CustomizationHarnessServiceBase,
} from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';

/**
 * Sessions-window override of the customization harness service.
 *
 * No static harnesses are registered. The Copilot CLI extension provides
 * its harness (with `itemProvider`) via `registerChatSessionCustomizationProvider()`,
 * and AHP remote servers register directly via `registerExternalHarness()`.
 */
export class SessionsCustomizationHarnessService extends CustomizationHarnessServiceBase {
	constructor() {
		super([], '');
	}
}
