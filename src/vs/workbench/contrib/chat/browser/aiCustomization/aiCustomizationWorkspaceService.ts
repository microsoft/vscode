/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable, observableFromEventOpts } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import {
	GENERATE_AGENT_COMMAND_ID,
	GENERATE_HOOK_COMMAND_ID,
	GENERATE_INSTRUCTION_COMMAND_ID,
	GENERATE_PROMPT_COMMAND_ID,
	GENERATE_SKILL_COMMAND_ID,
} from '../actions/chatActions.js';

class AICustomizationWorkspaceService implements IAICustomizationWorkspaceService {
	declare readonly _serviceBrand: undefined;

	readonly activeProjectRoot: IObservable<URI | undefined>;

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		const workspaceFolders = observableFromEventOpts(
			{ owner: this },
			this.workspaceContextService.onDidChangeWorkspaceFolders,
			() => this.workspaceContextService.getWorkspace().folders
		);
		this.activeProjectRoot = derived(reader => {
			const folders = workspaceFolders.read(reader);
			return folders[0]?.uri;
		});
	}

	getActiveProjectRoot(): URI | undefined {
		const folders = this.workspaceContextService.getWorkspace().folders;
		return folders[0]?.uri;
	}

	readonly managementSections: readonly AICustomizationManagementSection[] = [
		AICustomizationManagementSection.Agents,
		AICustomizationManagementSection.Skills,
		AICustomizationManagementSection.Instructions,
		AICustomizationManagementSection.Prompts,
		AICustomizationManagementSection.Hooks,
	];

	readonly preferManualCreation = false;

	async commitFiles(_projectRoot: URI, _fileUris: URI[]): Promise<void> {
		// No-op in core VS Code.
	}

	async generateCustomization(type: PromptsType): Promise<void> {
		const commandIds: Partial<Record<PromptsType, string>> = {
			[PromptsType.agent]: GENERATE_AGENT_COMMAND_ID,
			[PromptsType.skill]: GENERATE_SKILL_COMMAND_ID,
			[PromptsType.instructions]: GENERATE_INSTRUCTION_COMMAND_ID,
			[PromptsType.prompt]: GENERATE_PROMPT_COMMAND_ID,
			[PromptsType.hook]: GENERATE_HOOK_COMMAND_ID,
		};
		const commandId = commandIds[type];
		if (commandId) {
			await this.commandService.executeCommand(commandId);
		}
	}
}

registerSingleton(IAICustomizationWorkspaceService, AICustomizationWorkspaceService, InstantiationType.Delayed);
