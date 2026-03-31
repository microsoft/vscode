/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import {
	CustomizationHarness,
	CustomizationHarnessServiceBase,
	ICustomizationHarnessService,
	IHarnessDescriptor,
	createCliHarnessDescriptor,
	createClaudeHarnessDescriptor,
	createVSCodeHarnessDescriptor,
	getCliUserRoots,
	getClaudeUserRoots,
} from '../../common/customizationHarnessService.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { BUILTIN_STORAGE } from '../../common/aiCustomizationWorkspaceService.js';
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
		// The Local harness includes extension-contributed and built-in customizations.
		// Built-in items come from the default chat extension (productService.defaultChatAgent).
		// CLI and Claude harnesses don't consume extension contributions.
		const localExtras = [PromptsStorage.extension, BUILTIN_STORAGE];
		const restrictedExtras: readonly string[] = [];
		const allHarnesses: readonly IHarnessDescriptor[] = [
			createVSCodeHarnessDescriptor(localExtras),
			createCliHarnessDescriptor(getCliUserRoots(userHome), restrictedExtras),
			createClaudeHarnessDescriptor(getClaudeUserRoots(userHome), restrictedExtras),
		];

		super(
			allHarnesses,
			CustomizationHarness.VSCode,
		);
	}
}

registerSingleton(ICustomizationHarnessService, CustomizationHarnessService, InstantiationType.Delayed);

