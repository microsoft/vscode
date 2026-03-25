/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, observableFromEvent } from '../../../../../base/common/observable.js';
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
import { IChatAgentService } from '../../common/participants/chatAgents.js';

/**
 * Core implementation of the customization harness service.
 * Exposes VS Code, CLI, and Claude harnesses for filtering customizations.
 * CLI and Claude harnesses are only shown when their respective agents are registered.
 */
class CustomizationHarnessService extends CustomizationHarnessServiceBase {
	constructor(
		@IPathService pathService: IPathService,
		@IChatAgentService chatAgentService: IChatAgentService,
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

		// Track agent registration changes as an observable.
		// Return the agent count so the value changes on each event
		// (observableFromEvent uses strictEquals to decide whether to notify).
		const agentCount = observableFromEvent(chatAgentService.onDidChangeAgents, () => chatAgentService.getAgents().length);

		// Derive available harnesses from agent registration state
		const available = derived(reader => {
			agentCount.read(reader);
			return allHarnesses.filter(h => {
				if (!h.requiredAgentId) {
					return true;
				}
				return !!chatAgentService.getAgent(h.requiredAgentId);
			});
		});

		super(
			allHarnesses,
			CustomizationHarness.VSCode,
			available,
		);
	}
}

registerSingleton(ICustomizationHarnessService, CustomizationHarnessService, InstantiationType.Delayed);

