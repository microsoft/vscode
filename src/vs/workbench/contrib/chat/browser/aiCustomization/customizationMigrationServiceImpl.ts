/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { isAgentHostSessionResource } from '../../common/chatSessionsService.js';
import { ICustomizationHarnessService, ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CustomizationMigration, CustomizationMigrationType, FileCustomizationMigration, FileCustomizationMigrationType, getCustomizationMigrationEnablementSetting, getCustomizationMigrationTargetType, ICustomizationMigrationHint, ICustomizationMigrationService, IMcpServerCustomizationMigrationCandidate, IMcpServerCustomizationMigrationResult, isConfiguredLocationMigrationCandidate, isPromptFileMigrationCandidate, isUserDataMigrationCandidate, McpServerCustomizationMigration, McpServerCustomizationMigrationFailureReason, MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';

export class CustomizationMigrationService extends Disposable implements ICustomizationMigrationService {
	declare readonly _serviceBrand: undefined;
	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
	}

	computeMigration(sessionResource: URI, type: FileCustomizationMigrationType, token?: CancellationToken): Promise<FileCustomizationMigration>;
	computeMigration(sessionResource: URI, type: CustomizationMigrationType.McpServers, token?: CancellationToken): Promise<McpServerCustomizationMigration>;
	async computeMigration(sessionResource: URI, type: CustomizationMigrationType, token = CancellationToken.None): Promise<CustomizationMigration> {
		if (!isAgentHostSessionResource(sessionResource)) {
			return type === CustomizationMigrationType.McpServers
				? this.emptyMcpServerMigration()
				: { type, files: [], candidates: [] };
		}
		if (!this.isMigrationEnabled(type)) {
			return type === CustomizationMigrationType.McpServers
				? this.emptyMcpServerMigration()
				: { type, files: [], candidates: [] };
		}

		switch (type) {
			case CustomizationMigrationType.UserData: {
				const customizations = (await Promise.all([
					this.promptsService.listPromptFiles(PromptsType.agent, token),
					this.promptsService.listPromptFiles(PromptsType.instructions, token),
				])).flat();
				return this.createFileMigration(sessionResource, type, customizations.filter(isUserDataMigrationCandidate), token);
			}
			case CustomizationMigrationType.PromptFiles: {
				const customizations = await this.promptsService.listPromptFiles(PromptsType.prompt, token);
				return this.createFileMigration(sessionResource, type, customizations.filter(isPromptFileMigrationCandidate), token);
			}
			case CustomizationMigrationType.ConfiguredLocations: {
				const customizations = (await Promise.all([
					this.promptsService.listPromptFiles(PromptsType.agent, token),
					this.promptsService.listPromptFiles(PromptsType.instructions, token),
					this.promptsService.listPromptFiles(PromptsType.skill, token),
				])).flat();
				return this.createFileMigration(sessionResource, type, customizations.filter(isConfiguredLocationMigrationCandidate), token, true);
			}
			case CustomizationMigrationType.McpServers: {
				const provider = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource))?.mcpServerMigrationProvider;
				return provider?.computeMigration(sessionResource, token) ?? this.emptyMcpServerMigration();
			}
		}
	}

	async computeMigrations(sessionResource: URI, token = CancellationToken.None): Promise<CustomizationMigration[]> {
		return Promise.all([
			this.computeMigration(sessionResource, CustomizationMigrationType.UserData, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.PromptFiles, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.ConfiguredLocations, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.McpServers, token),
		]);
	}

	async migrateMcpServers(sessionResource: URI, requestedCandidates: readonly IMcpServerCustomizationMigrationCandidate[]): Promise<IMcpServerCustomizationMigrationResult> {
		if (requestedCandidates.length === 0) {
			return { migratedCount: 0, failures: [] };
		}
		const provider = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource))?.mcpServerMigrationProvider;
		return provider?.migrate(sessionResource, requestedCandidates) ?? {
			migratedCount: 0,
			failures: requestedCandidates.map(candidate => ({
				id: candidate.id,
				name: candidate.name,
				sourceUri: candidate.sourceUri,
				targetUri: candidate.targetUri,
				reason: McpServerCustomizationMigrationFailureReason.NoLongerEligible,
			})),
		};
	}

	async computeMigrationHint(sessionResource: URI, token = CancellationToken.None): Promise<ICustomizationMigrationHint | undefined> {
		const harness = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource));
		if (!harness) {
			return undefined;
		}

		const mcpMigrationEnabled = this.isMigrationEnabled(CustomizationMigrationType.McpServers);
		const [userDataMigration, promptFilesMigration, configuredLocationsMigration, mcpServerMigration] = await Promise.all([
			this.computeMigration(sessionResource, CustomizationMigrationType.UserData, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.PromptFiles, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.ConfiguredLocations, token),
			mcpMigrationEnabled ? this.computeMigration(sessionResource, CustomizationMigrationType.McpServers, token) : Promise.resolve(this.emptyMcpServerMigration()),
		]);
		const fileCandidates = [userDataMigration, promptFilesMigration, configuredLocationsMigration]
			.filter(migration => this.isMigrationEnabled(migration.type))
			.flatMap(migration => migration.candidates);
		const migratableMcpServerCount = mcpServerMigration.candidates.length;
		const workspaceCount = fileCandidates.filter(candidate => candidate.storage === PromptsStorage.local).length
			+ migratableMcpServerCount;
		const userCount = fileCandidates.filter(candidate => candidate.storage === PromptsStorage.user).length;
		return workspaceCount + userCount > 0 ? {
			hintId: this.generateHintId(),
			message: localize('customizationMigrationHintCounts', "{0} workspace and {1} user customizations need an update to keep working.", workspaceCount, userCount),
			counts: [
				{ type: CustomizationMigrationType.UserData, count: userDataMigration.files.length },
				{ type: CustomizationMigrationType.PromptFiles, count: promptFilesMigration.files.length },
				{ type: CustomizationMigrationType.ConfiguredLocations, count: configuredLocationsMigration.files.length },
				{ type: CustomizationMigrationType.McpServers, count: migratableMcpServerCount },
			].filter(({ count }) => count > 0),
		} : undefined;
	}

	private async createFileMigration(sessionResource: URI, type: FileCustomizationMigrationType, candidates: readonly MigratableConfiguration[], token: CancellationToken, excludeSupportedLocations = false): Promise<FileCustomizationMigration> {
		const provider = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource))?.itemProvider;
		if (!provider?.provideSourceFolders) {
			return { type, files: [], candidates: [] };
		}

		const targetTypes = new Set(candidates.map(getCustomizationMigrationTargetType));
		const sourceFolders = new Map<PromptsType, readonly ICustomizationSourceFolder[]>();
		for (const targetType of targetTypes) {
			const folders = await provider.provideSourceFolders(sessionResource, targetType, token);
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

	private emptyMcpServerMigration(): McpServerCustomizationMigration {
		return {
			type: CustomizationMigrationType.McpServers,
			servers: [],
			candidates: [],
			exclusions: [],
			discoveryComplete: true,
			coverage: {
				restrictedByMcpAccess: false,
				restrictedByCustomizationPolicy: false,
			},
		};
	}

	private isMigrationEnabled(type: CustomizationMigrationType): boolean {
		return this.configurationService.getValue<boolean>(getCustomizationMigrationEnablementSetting(type)) === true;
	}

	protected generateHintId(): string {
		return generateUuid();
	}
}
