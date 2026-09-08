/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { isAgentHostSessionResource } from '../../common/chatSessionsService.js';
import { ICustomizationHarnessService, ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { PromptHeaderAttributes } from '../../common/promptSyntax/promptFileParser.js';
import { CustomizationMigration, CustomizationMigrationType, FileCustomizationMigration, FileCustomizationMigrationType, getCustomizationMigrationTargetType, ICustomizationMigrationService, isPromptFileMigrationCandidate, isUserDataMigrationCandidate, McpServerCustomizationMigration, MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
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
			case CustomizationMigrationType.AgentFiles: {
				const agentFiles = await this.promptsService.listPromptFiles(PromptsType.agent, CancellationToken.None);
				const candidates = (await Promise.all(agentFiles
					.filter(file => file.storage === PromptsStorage.local || file.storage === PromptsStorage.user)
					.map(async file => ({
						file,
						parsed: await this.promptsService.parseNew(file.uri, CancellationToken.None),
					}))))
					.filter(({ parsed }) => parsed.header?.getAttribute(PromptHeaderAttributes.handOffs) !== undefined)
					.map(({ file }) => ({ ...file, hasLocalHandoffs: true }));
				return { type, files: candidates.map(candidate => candidate.uri), candidates };
			}
			case CustomizationMigrationType.McpServers:
				return this.computeMcpServerMigration(sessionResource);
		}
	}

	async computeMigrations(sessionResource: URI): Promise<CustomizationMigration[]> {
		return Promise.all([
			this.computeMigration(sessionResource, CustomizationMigrationType.UserData),
			this.computeMigration(sessionResource, CustomizationMigrationType.PromptFiles),
			this.computeMigration(sessionResource, CustomizationMigrationType.AgentFiles),
			this.computeMigration(sessionResource, CustomizationMigrationType.McpServers),
		]);
	}

	async computeMigrationHint(sessionResource: URI): Promise<string | undefined> {
		const harness = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource));
		if (!harness) {
			return undefined;
		}

		const [userDataMigration, promptFilesMigration, agentFilesMigration, mcpServerMigration] = await Promise.all([
			this.computeMigration(sessionResource, CustomizationMigrationType.UserData),
			this.computeMigration(sessionResource, CustomizationMigrationType.PromptFiles),
			this.computeMigration(sessionResource, CustomizationMigrationType.AgentFiles),
			this.computeMigration(sessionResource, CustomizationMigrationType.McpServers),
		]);
		const fileCount = userDataMigration.files.length + promptFilesMigration.files.length;
		const unsupportedMcpServerCount = mcpServerMigration.servers.filter(server => !server.supported).length;
		const fileHint = fileCount === 0
			? undefined
			: fileCount === 1
				? localize('customizationMigrationHintSingle', "Found 1 customization file that is present but not used by {0} and could be migrated.", harness.label)
				: localize('customizationMigrationHintMultiple', "Found {0} customization files that are present but not used by {1} and could be migrated.", fileCount, harness.label);
		const mcpHint = unsupportedMcpServerCount === 0
			? undefined
			: unsupportedMcpServerCount === 1
				? localize('customizationMigrationHintMcpSingle', "Found 1 MCP server that is not fully supported by {0}.", harness.label)
				: localize('customizationMigrationHintMcpMultiple', "Found {0} MCP servers that are not fully supported by {1}.", unsupportedMcpServerCount, harness.label);
		const agentFileHint = agentFilesMigration.files.length === 0
			? undefined
			: agentFilesMigration.files.length === 1
				? localize('customizationMigrationHintAgentFileSingle', "Found 1 agent file with a handoff that {0} ignores and could be updated.", harness.label)
				: localize('customizationMigrationHintAgentFileMultiple', "Found {0} agent files with handoffs that {1} ignores and could be updated.", agentFilesMigration.files.length, harness.label);
		const hints = [fileHint, agentFileHint, mcpHint].filter(hint => hint !== undefined);
		return hints.length > 1
			? localize('customizationMigrationHintCombined', "{0}", hints.join(' '))
			: hints[0];
	}

	private async createFileMigration(sessionResource: URI, type: FileCustomizationMigrationType, candidates: readonly MigratableConfiguration[]): Promise<FileCustomizationMigration> {
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
			return sourceFolders.get(targetType)?.some(folder => folder.source === customization.storage) === true;
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
