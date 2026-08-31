/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { isAgentHostSessionResource } from '../../common/chatSessionsService.js';
import { ICustomizationHarnessService, ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CustomizationMigration, CustomizationMigrationType, FileCustomizationMigration, FileCustomizationMigrationType, getCustomizationMigrationTargetType, ICustomizationMigrationService, IMcpServerCustomizationMigrationCandidate, IMcpServerMigrationFailure, IMcpServerMigrationResult, isPromptFileMigrationCandidate, isUserDataMigrationCandidate, McpServerCustomizationMigration, McpServerMigrationFailureReason, MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { IAgentHostActiveClientService } from '../agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { AgentHostMcpServerApplicability } from '../agentSessions/agentHost/agentHostMcpServerSupport.js';
import { McpServerMigration } from './customizationMigration.js';

export class CustomizationMigrationService implements ICustomizationMigrationService {
	declare readonly _serviceBrand: undefined;
	private readonly mcpServerMigration: McpServerMigration;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IAgentHostActiveClientService private readonly activeClientService: IAgentHostActiveClientService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@IFileService fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		this.mcpServerMigration = new McpServerMigration(fileService);
	}

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
			case CustomizationMigrationType.McpServers:
				return this.computeMcpServerMigration(sessionResource);
		}
	}

	async computeMigrations(sessionResource: URI): Promise<CustomizationMigration[]> {
		return Promise.all([
			this.computeMigration(sessionResource, CustomizationMigrationType.UserData),
			this.computeMigration(sessionResource, CustomizationMigrationType.PromptFiles),
			this.computeMigration(sessionResource, CustomizationMigrationType.McpServers),
		]);
	}

	async migrateMcpServers(sessionResource: URI, requestedCandidates: readonly IMcpServerCustomizationMigrationCandidate[]): Promise<IMcpServerMigrationResult> {
		const currentMigration = await this.computeMigration(sessionResource, CustomizationMigrationType.McpServers);
		const requestedIds = new Set(requestedCandidates.map(candidate => candidate.id));
		const currentCandidates = currentMigration.candidates.filter(candidate => requestedIds.has(candidate.id));
		const currentIds = new Set(currentCandidates.map(candidate => candidate.id));
		const failures: IMcpServerMigrationFailure[] = requestedCandidates
			.filter(candidate => !currentIds.has(candidate.id))
			.map(candidate => ({
				id: candidate.id,
				name: candidate.name,
				sourceUri: candidate.sourceUri,
				targetUri: candidate.targetUri,
				reason: McpServerMigrationFailureReason.NoLongerEligible,
			}));

		this.logService.info(`[MCP Migration] Starting migration: selected=${requestedCandidates.length}, eligible=${currentCandidates.length}, noLongerEligible=${failures.length}`);
		const result = await this.mcpServerMigration.migrate(currentCandidates);
		const combined = { migratedCount: result.migratedCount, failures: [...failures, ...result.failures] };
		for (const failure of combined.failures) {
			if (failure.error) {
				this.logService.error(`[MCP Migration] Failed server: reason=${failure.reason}, name=${failure.name}`, failure.error);
			} else {
				this.logService.warn(`[MCP Migration] Failed server: reason=${failure.reason}, name=${failure.name}`);
			}
		}
		this.logService.info(`[MCP Migration] Finished migration: migrated=${combined.migratedCount}, failed=${combined.failures.length}`);
		return combined;
	}

	async computeMigrationHint(sessionResource: URI): Promise<string | undefined> {
		const harness = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource));
		if (!harness) {
			return undefined;
		}

		const [userDataMigration, promptFilesMigration, mcpServerMigration] = await Promise.all([
			this.computeMigration(sessionResource, CustomizationMigrationType.UserData),
			this.computeMigration(sessionResource, CustomizationMigrationType.PromptFiles),
			this.computeMigration(sessionResource, CustomizationMigrationType.McpServers),
		]);
		const fileCount = userDataMigration.files.length + promptFilesMigration.files.length;
		const migratableMcpServerCount = mcpServerMigration.candidates.length;
		const unsupportedMcpServerCount = mcpServerMigration.servers.filter(server => !server.supported).length;
		const fileHint = fileCount === 0
			? undefined
			: fileCount === 1
				? localize('customizationMigrationHintSingle', "Found 1 customization file that is present but not used by {0} and could be migrated.", harness.label)
				: localize('customizationMigrationHintMultiple', "Found {0} customization files that are present but not used by {1} and could be migrated.", fileCount, harness.label);
		const mcpMigrationHint = migratableMcpServerCount === 0
			? undefined
			: migratableMcpServerCount === 1
				? localize('customizationMigrationHintMigratableMcpSingle', "Found 1 workspace MCP server that can be migrated for {0}.", harness.label)
				: localize('customizationMigrationHintMigratableMcpMultiple', "Found {0} workspace MCP servers that can be migrated for {1}.", migratableMcpServerCount, harness.label);
		const unsupportedMcpHint = unsupportedMcpServerCount === 0
			? undefined
			: unsupportedMcpServerCount === 1
				? localize('customizationMigrationHintUnsupportedMcpSingle', "Found 1 MCP server that is not fully supported by {0}.", harness.label)
				: localize('customizationMigrationHintUnsupportedMcpMultiple', "Found {0} MCP servers that are not fully supported by {1}.", unsupportedMcpServerCount, harness.label);
		const hints: string[] = [];
		if (fileHint) {
			hints.push(fileHint);
		}
		if (mcpMigrationHint) {
			hints.push(mcpMigrationHint);
		}
		if (unsupportedMcpHint) {
			hints.push(unsupportedMcpHint);
		}
		let hint = hints.shift();
		for (const nextHint of hints) {
			hint = localize('customizationMigrationHintCombined', "{0} {1}", hint, nextHint);
		}
		return hint;
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
		const roots = this.agentHostCustomizationService.getWorkingDirectories(sessionResource).map(path => URI.parse(path));
		const scope = this.activeClientService.acquireMcpServerSupportScope(getChatSessionType(sessionResource), roots);
		if (!scope) {
			return this.emptyMcpServerMigration();
		}

		try {
			await scope.whenResolved();
			const snapshot = scope.support.get();
			const plan = await this.mcpServerMigration.createPlan(snapshot);
			if (plan.exclusions.length > 0) {
				const exclusionsByReason = Object.groupBy(plan.exclusions, exclusion => exclusion.reason);
				this.logService.debug(`[MCP Migration] Excluded candidates: ${Object.entries(exclusionsByReason).map(([reason, exclusions]) => `${reason}=${exclusions?.length ?? 0}`).join(', ')}`);
			}
			return {
				type: CustomizationMigrationType.McpServers,
				servers: snapshot.servers
					.filter(server => server.applicability !== AgentHostMcpServerApplicability.OutsideCurrentScope)
					.map(server => ({
						id: server.id,
						name: server.name,
						supported: server.compatibility.kind === 'supported',
					})),
				candidates: plan.candidates,
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
			candidates: [],
			discoveryComplete: true,
			coverage: {
				restrictedByMcpAccess: false,
				restrictedByCustomizationPolicy: false,
			},
		};
	}
}
