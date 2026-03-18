/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import {
	CustomizationHarness,
	CustomizationHarnessServiceBase,
	ICustomizationHarnessService,
	createCliHarnessDescriptor,
	createClaudeHarnessDescriptor,
	createVSCodeHarnessDescriptor,
	getCliUserRoots,
	getClaudeUserRoots,
} from '../../common/customizationHarnessService.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';

/**
 * Core implementation of the customization harness service.
 * Exposes VS Code, CLI, and Claude harnesses for filtering customizations.
 */
class CustomizationHarnessService extends CustomizationHarnessServiceBase {
	constructor(
		@IPathService pathService: IPathService,
	) {
		const userHome = pathService.userHome({ preferLocal: true });
		const extras = [PromptsStorage.extension];
		super(
			[
				createVSCodeHarnessDescriptor(extras),
				createCliHarnessDescriptor(getCliUserRoots(userHome), extras),
				createClaudeHarnessDescriptor(getClaudeUserRoots(userHome), extras),
			],
			CustomizationHarness.VSCode,
		);
	}
}

registerSingleton(ICustomizationHarnessService, CustomizationHarnessService, InstantiationType.Delayed);

