/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	CustomizationHarness,
	CustomizationHarnessServiceBase,
	createCliHarnessDescriptor,
	createClaudeHarnessDescriptor,
	getCliUserRoots,
	getClaudeUserRoots,
} from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { BUILTIN_STORAGE } from '../common/builtinPromptsStorage.js';

/**
 * Sessions-window override of the customization harness service.
 *
 * Exposes CLI and Claude harnesses with restricted user-root filters
 * so the customizations UI only shows items accessible to each harness.
 */
export class SessionsCustomizationHarnessService extends CustomizationHarnessServiceBase {
	constructor(
		@IPathService pathService: IPathService,
	) {
		const userHome = pathService.userHome({ preferLocal: true });
		const extras = [BUILTIN_STORAGE];
		super(
			[
				createCliHarnessDescriptor(getCliUserRoots(userHome), extras),
				createClaudeHarnessDescriptor(getClaudeUserRoots(userHome), extras),
			],
			CustomizationHarness.CLI,
		);
	}
}
