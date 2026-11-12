/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, derived, IObservable, observableFromEventOpts, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IChatPromptSlashCommand, IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { isAgentHostSessionResource } from '../../common/chatSessionsService.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import {
	GENERATE_AGENT_COMMAND_ID,
	GENERATE_HOOK_COMMAND_ID,
	GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID,
	GENERATE_PROMPT_COMMAND_ID,
	GENERATE_SKILL_COMMAND_ID,
} from '../actions/chatActions.js';

export class AICustomizationWorkspaceService implements IAICustomizationWorkspaceService {
	declare readonly _serviceBrand: undefined;

	readonly activeProjectRoot: IObservable<URI | undefined>;
	readonly activeProjectLabel: IObservable<string | undefined>;

	private readonly activeSessionResource = observableValue<URI | undefined>(this, undefined);

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ICommandService private readonly commandService: ICommandService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
	) {
		const workspaceFolders = observableFromEventOpts(
			{ owner: this },
			this.workspaceContextService.onDidChangeWorkspaceFolders,
			() => this.workspaceContextService.getWorkspace().folders
		);
		const customizationChanges = observableSignalFromEvent(this, this.agentHostCustomizationService.onDidChangeCustomizations);
		this.activeProjectRoot = derived(this, reader => {
			const resource = this.activeSessionResource.read(reader);
			if (resource && isAgentHostSessionResource(resource)) {
				customizationChanges.read(reader);
				return this.agentHostCustomizationService.getClientWorkingDirectoryUris(resource)[0];
			}
			return workspaceFolders.read(reader)[0]?.uri;
		});
		this.activeProjectLabel = derived(this, reader => {
			const root = this.activeProjectRoot.read(reader);
			const folders = workspaceFolders.read(reader);
			return root ? folders.find(folder => isEqual(folder.uri, root))?.name ?? basename(root) : undefined;
		});
	}

	getActiveProjectRoot(): URI | undefined {
		return this.activeProjectRoot.get();
	}

	setActiveSessionResource(resource: URI | undefined): void {
		this.activeSessionResource.set(resource, undefined);
	}

	readonly managementSections: readonly AICustomizationManagementSection[] = [
		AICustomizationManagementSection.Plugins,
		AICustomizationManagementSection.Canvases,
		AICustomizationManagementSection.McpServers,
		AICustomizationManagementSection.Skills,
		AICustomizationManagementSection.Instructions,
		AICustomizationManagementSection.Agents,
		AICustomizationManagementSection.Hooks,
		AICustomizationManagementSection.Tools,
		AICustomizationManagementSection.Prompts,
		AICustomizationManagementSection.HarnessSettings,
	];

	readonly isSessionsWindow = false;

	readonly welcomePageFeatures = {
		showGettingStartedBanner: true,
	};

	readonly hasOverrideProjectRoot = constObservable(false);
	setOverrideProjectRoot(_root: URI): void { }
	clearOverrideProjectRoot(): void { }

	async commitFiles(_projectRoot: URI, _fileUris: URI[]): Promise<boolean> {
		// No-op in core VS Code.
		return true;
	}

	async deleteFiles(_projectRoot: URI, _fileUris: URI[]): Promise<boolean> {
		// No-op in core VS Code.
		return true;
	}

	async generateCustomization(type: PromptsType, workspaceFolder?: URI): Promise<void> {
		const commandIds: Partial<Record<PromptsType, string>> = {
			[PromptsType.agent]: GENERATE_AGENT_COMMAND_ID,
			[PromptsType.skill]: GENERATE_SKILL_COMMAND_ID,
			[PromptsType.instructions]: GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID,
			[PromptsType.prompt]: GENERATE_PROMPT_COMMAND_ID,
			[PromptsType.hook]: GENERATE_HOOK_COMMAND_ID,
		};
		const commandId = commandIds[type];
		if (commandId) {
			await this.commandService.executeCommand(commandId, workspaceFolder);
		}
	}

	async getFilteredPromptSlashCommands(token: CancellationToken): Promise<readonly IChatPromptSlashCommand[]> {
		return this.promptsService.getPromptSlashCommands(token);
	}

	private static readonly _emptyIntegrations: ReadonlyMap<string, string> = new Map();

	getSkillUIIntegrations(): ReadonlyMap<string, string> {
		return AICustomizationWorkspaceService._emptyIntegrations;
	}
}

registerSingleton(IAICustomizationWorkspaceService, AICustomizationWorkspaceService, InstantiationType.Delayed);
