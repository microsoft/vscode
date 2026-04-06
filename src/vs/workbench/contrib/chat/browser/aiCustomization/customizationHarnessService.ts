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
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';

/**
 * Core implementation of the customization harness service.
 *
 * When `chat.customizations.providerApi.enabled` is true, only the Local
 * harness is registered statically. All other harnesses are contributed by
 * extensions via the provider API, so the hardcoded CLI/Claude harnesses are
 * intentionally omitted.
 *
 * When the setting is false, the full set of built-in harnesses (Local, Copilot
 * CLI, Claude) is registered for backwards compat.
 */
class CustomizationHarnessService extends CustomizationHarnessServiceBase {
	constructor(
		@IPathService pathService: IPathService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		// The Local harness includes extension-contributed and built-in customizations.
		// Built-in items come from the default chat extension (productService.defaultChatAgent).
		const localExtras = [PromptsStorage.extension, BUILTIN_STORAGE];

		const providerApiEnabled = configurationService.getValue<boolean>(ChatConfiguration.CustomizationsProviderApi);

		let allHarnesses: readonly IHarnessDescriptor[];
		if (providerApiEnabled) {
			// When the provider API is enabled, only expose the Local harness.
			// CLI and Claude harnesses don't consume extension contributions.
			// Additional harnesses are contributed entirely via the provider API.
			allHarnesses = [createVSCodeHarnessDescriptor(localExtras)];
		} else {
			const userHome = pathService.userHome({ preferLocal: true });
			const restrictedExtras: readonly string[] = [];
			allHarnesses = [
				createVSCodeHarnessDescriptor(localExtras),
				createCliHarnessDescriptor(getCliUserRoots(userHome), restrictedExtras),
				createClaudeHarnessDescriptor(getClaudeUserRoots(userHome), restrictedExtras),
			];
		}

		super(
			allHarnesses,
			CustomizationHarness.VSCode,
		);
	}
}

registerSingleton(ICustomizationHarnessService, CustomizationHarnessService, InstantiationType.Delayed);

