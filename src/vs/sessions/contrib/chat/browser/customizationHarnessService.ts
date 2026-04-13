/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	CustomizationHarness,
	CustomizationHarnessServiceBase,
	createCliHarnessDescriptor,
	getCliUserRoots,
} from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { BUILTIN_STORAGE } from '../common/builtinPromptsStorage.js';

/**
 * Sessions-window override of the customization harness service.
 *
 * Only the CLI harness is registered because sessions always run via
 * the Copilot CLI. With a single harness the toggle bar is hidden.
 */
export class SessionsCustomizationHarnessService extends CustomizationHarnessServiceBase {
	constructor(
		@IPathService pathService: IPathService,
	) {
		const userHome = pathService.userHome({ preferLocal: true });
		const extras = [BUILTIN_STORAGE];
		super(
			[createCliHarnessDescriptor(getCliUserRoots(userHome), extras)],
			CustomizationHarness.CLI,
		);
	}
}
