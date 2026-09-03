/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { isAgentHostSessionResource } from '../../common/chatSessionsService.js';
import { ICustomizationHarnessService, ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CustomizationMigration, CustomizationMigrationType, FileCustomizationMigration, FileCustomizationMigrationType, getCustomizationMigrationTargetType, ICustomizationMigrationService, isConfiguredLocationMigrationCandidate, isPromptFileMigrationCandidate, isUserDataMigrationCandidate, McpServerCustomizationMigration, MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { IAgentHostActiveClientService } from '../agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { AgentHostMcpServerApplicability } from '../agentSessions/agentHost/agentHostMcpServerSupport.js';

export class CustomizationMigrationService implements ICustomizationMigrationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IAgentHostActiveClientService private readonly activeClientService: IAgentHostActiveClientService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
	) { }

	computeMigration(sessionResource: URI, type: FileCustomizationMigrationType): Promise<FileCustomizationMigration>;
	computeMigration(sessionResource: URI, type: CustomizationMigrationType.McpServers): Promise<McpServerCustomizationMigration>;
	async computeMigration(sessionResource: URI, type: CustomizationMigrationType): Promise<CustomizationMigration> {
		if (!isAgentHostSessionResource(sessionResource)) {
			return type === CustomizationMigrationType.McpServers
				? this.emptyMcpServerMigration()
				: { type, files: [], candidates: [] };
		}

		switch (type) {
			case CustomizationMigrationType.UserData: {
				const customizations = (await Promise.all([
					this.promptsService.listPromptFiles(PromptsType.agent, CancellationToken.None),
					this.promptsService.listPromptFiles(PromptsType.instructions, CancellationToken.None),
				])).flat();
				return this.createFileMigration(sessionResource, type, customizations.filter(isUserDataMigrationCandidate));
			}
			case CustomizationMigrationType.PromptFiles: {
				const customizations = await this.promptsService.listPromptFiles(PromptsType.prompt, CancellationToken.None);
				return this.createFileMigration(sessionResource, type, customizations.filter(isPromptFileMigrationCandidate));
			}
			case CustomizationMigrationType.ConfiguredLocations: {
				const customizations = (await Promise.all([
					this.promptsService.listPromptFiles(PromptsType.agent, CancellationToken.None),
					this.promptsService.listPromptFiles(PromptsType.instructions, CancellationToken.None),
					this.promptsService.listPromptFiles(PromptsType.skill, CancellationToken.None),
				])).flat();
				return this.createFileMigration(sessionResource, type, customizations.filter(isConfiguredLocationMigrationCandidate), true);
			}
			case CustomizationMigrationType.McpServers:
				return this.computeMcpServerMigration(sessionResource);
		}
	}

	async computeMigrations(sessionResource: URI): Promise<CustomizationMigration[]> {
		return Promise.all([
			this.computeMigration(sessionResource, CustomizationMigrationType.UserData),
			this.computeMigration(sessionResource, CustomizationMigrationType.PromptFiles),
			this.computeMigration(sessionResource, CustomizationMigrationType.ConfiguredLocations),
			this.computeMigration(sessionResource, CustomizationMigrationType.McpServers),
		]);
	}

	async computeMigrationHint(sessionResource: URI, includeCustomizationSummary = false): Promise<string | undefined> {
		const harness = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource));
		if (!harness) {
			return undefined;
		}

		const [userDataMigration, promptFilesMigration, configuredLocationsMigration, mcpServerMigration, customizations] = await Promise.all([
			this.computeMigration(sessionResource, CustomizationMigrationType.UserData),
			this.computeMigration(sessionResource, CustomizationMigrationType.PromptFiles),
			this.computeMigration(sessionResource, CustomizationMigrationType.ConfiguredLocations),
			this.computeMigration(sessionResource, CustomizationMigrationType.McpServers),
			includeCustomizationSummary
				? harness.itemProvider?.provideChatSessionCustomizations(sessionResource, CancellationToken.None)
				: undefined,
		]);
		const fileCandidates = [...userDataMigration.candidates, ...promptFilesMigration.candidates, ...configuredLocationsMigration.candidates];
		const workspaceFileCount = fileCandidates.filter(candidate => candidate.storage === PromptsStorage.local).length;
		const userFileCount = fileCandidates.filter(candidate => candidate.storage === PromptsStorage.user).length;
		const unsupportedMcpServerCount = mcpServerMigration.servers.filter(server => !server.supported).length;
		const fileHint = this.formatFileMigrationHint(workspaceFileCount, userFileCount, harness.label);
		const mcpHint = unsupportedMcpServerCount === 0
			? undefined
			: unsupportedMcpServerCount === 1
				? localize('customizationMigrationHintMcpSingle', "Found 1 MCP server that is not fully supported by {0}.", harness.label)
				: localize('customizationMigrationHintMcpMultiple', "Found {0} MCP servers that are not fully supported by {1}.", unsupportedMcpServerCount, harness.label);
		const migrationHint = fileHint && mcpHint
			? localize('customizationMigrationHintCombined', "{0} {1}", fileHint, mcpHint)
			: fileHint ?? mcpHint;
		if (!includeCustomizationSummary) {
			return migrationHint;
		}

		const enabledCustomizations = customizations?.filter(customization => customization.enabled !== false) ?? [];
		const instructionCount = enabledCustomizations.filter(customization => customization.type === PromptsType.instructions).length;
		const skillCount = enabledCustomizations.filter(customization => customization.type === PromptsType.skill).length;
		const agentCount = enabledCustomizations.filter(customization => customization.type === PromptsType.agent).length;
		const summary = localize(
			'customizationAvailabilitySummary',
			"{0}, {1}, and {2} available to the agent.",
			this.formatCustomizationCount(instructionCount, localize('instructionSingle', "instruction"), localize('instructionPlural', "instructions")),
			this.formatCustomizationCount(skillCount, localize('skillSingle', "skill"), localize('skillPlural', "skills")),
			this.formatCustomizationCount(agentCount, localize('agentSingle', "agent"), localize('agentPlural', "agents")),
		);
		return migrationHint
			? localize('customizationSummaryWithMigrationHint', "{0} {1}", summary, migrationHint)
			: summary;
	}

	private formatFileMigrationHint(workspaceCount: number, userCount: number, harnessLabel: string): string | undefined {
		const fileCount = workspaceCount + userCount;
		if (fileCount === 0) {
			return undefined;
		}

		const sourceCounts = workspaceCount > 0 && userCount > 0
			? localize('customizationMigrationHintWorkspaceAndUser', "{0} workspace and {1} user", workspaceCount, userCount)
			: workspaceCount > 0
				? localize('customizationMigrationHintWorkspace', "{0} workspace", workspaceCount)
				: localize('customizationMigrationHintUser', "{0} user", userCount);
		return fileCount === 1
			? localize('customizationMigrationHintSingle', "Found {0} customization file that is present but not used by {1} and could be migrated.", sourceCounts, harnessLabel)
			: localize('customizationMigrationHintMultiple', "Found {0} customizations that are present but not used by {1} and could be migrated.", sourceCounts, harnessLabel);
	}

	private formatCustomizationCount(count: number, singular: string, plural: string): string {
		return localize('customizationCount', "{0} {1}", count, count === 1 ? singular : plural);
	}

	private async createFileMigration(sessionResource: URI, type: FileCustomizationMigrationType, candidates: readonly MigratableConfiguration[], excludeSupportedLocations = false): Promise<FileCustomizationMigration> {
		const provider = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource))?.itemProvider;
		if (!provider?.provideSourceFolders) {
			return { type, files: [], candidates: [] };
		}

		const targetTypes = new Set(candidates.map(getCustomizationMigrationTargetType));
		const sourceFolders = new Map<PromptsType, readonly ICustomizationSourceFolder[]>();
		for (const targetType of targetTypes) {
			const folders = await provider.provideSourceFolders(sessionResource, targetType, CancellationToken.None);
			sourceFolders.set(targetType, folders ?? []);
		}
		const filteredCandidates = candidates.filter(customization => {
			const targetType = getCustomizationMigrationTargetType(customization);
			const compatibleFolders = sourceFolders.get(targetType)?.filter(folder => folder.source === customization.storage) ?? [];
			return compatibleFolders.length > 0
				&& (!excludeSupportedLocations || !compatibleFolders.some(folder => extUriBiasedIgnorePathCase.isEqualOrParent(customization.uri, folder.uri)));
		});
		return { type, files: filteredCandidates.map(customization => customization.uri), candidates: filteredCandidates };
	}

	private async computeMcpServerMigration(sessionResource: URI): Promise<McpServerCustomizationMigration> {
		const roots = this.agentHostCustomizationService.getWorkingDirectories(sessionResource).map(path => URI.file(path));
		const scope = this.activeClientService.acquireMcpServerSupportScope(getChatSessionType(sessionResource), roots);
		if (!scope) {
			return this.emptyMcpServerMigration();
		}

		try {
			await scope.whenResolved();
			const snapshot = scope.support.get();
			return {
				type: CustomizationMigrationType.McpServers,
				servers: snapshot.servers
					.filter(server => server.applicability !== AgentHostMcpServerApplicability.OutsideCurrentScope)
					.map(server => ({
						id: server.id,
						name: server.name,
						supported: server.compatibility.kind === 'supported',
					})),
				discoveryComplete: snapshot.discoveryComplete,
				coverage: snapshot.coverage,
			};
		} finally {
			scope.dispose();
		}
	}

	private emptyMcpServerMigration(): McpServerCustomizationMigration {
		return {
			type: CustomizationMigrationType.McpServers,
			servers: [],
			discoveryComplete: true,
			coverage: {
				restrictedByMcpAccess: false,
				restrictedByCustomizationPolicy: false,
			},
		};
	}
}
