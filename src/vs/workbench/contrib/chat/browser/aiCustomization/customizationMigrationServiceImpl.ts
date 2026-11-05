/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { isAgentHostSessionResource } from '../../common/chatSessionsService.js';
import { ICustomizationHarnessService, ICustomizationMarketplaceManagementProvider, ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CustomizationMigration, CustomizationMigrationType, FileCustomizationMigration, FileCustomizationMigrationType, getCustomizationMigrationTargetType, GuidanceCustomizationMigration, GuidanceCustomizationMigrationType, ICustomizationMigrationHint, ICustomizationMigrationIgnoredGroup, ICustomizationMigrationService, IMcpServerCustomizationMigrationCandidate, IMcpServerCustomizationMigrationResult, IPluginMarketplaceCustomizationMigrationCandidate, IPluginMarketplaceCustomizationMigrationResult, isConfiguredLocationMigrationCandidate, isPromptFileMigrationCandidate, isUserDataMigrationCandidate, McpServerCustomizationMigration, McpServerCustomizationMigrationFailureReason, MigratableConfiguration, PluginMarketplaceCustomizationMigration, PluginMarketplaceCustomizationMigrationFailureReason } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';
import { parseMarketplaceReferences } from '../../common/plugins/marketplaceReference.js';
import { IChatAgentService } from '../../common/participants/chatAgents.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { isChatExtensionItem } from './aiCustomizationItemSource.js';

export class CustomizationMigrationService extends Disposable implements ICustomizationMigrationService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeCustomizations: Event<void>;
	private readonly _onDidChangeMarketplaceInventory = this._register(new Emitter<void>());
	readonly onDidChangePluginMarketplaces = this._onDidChangeMarketplaceInventory.event;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMcpService mcpService: IMcpService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IProductService private readonly productService: IProductService,
	) {
		super();
		const marketplaceProviderListeners = this._register(new DisposableStore());
		this._register(autorun(reader => {
			const providers = new Set(customizationHarnessService.availableHarnesses.read(reader)
				.flatMap(harness => harness.marketplaceManagementProvider ? [harness.marketplaceManagementProvider] : []));
			marketplaceProviderListeners.clear();
			for (const provider of providers) {
				marketplaceProviderListeners.add(provider.onDidChange(() => this._onDidChangeMarketplaceInventory.fire()));
			}
		}));
		this.onDidChangeCustomizations = Event.any(
			promptsService.onDidChangeSlashCommands,
			promptsService.onDidChangeInstructions,
			promptsService.onDidChangeAgentInstructions,
			promptsService.onDidChangeSkills,
			customizationHarnessService.onDidChangeCustomAgents,
			Event.fromObservableLight(customizationHarnessService.availableHarnesses),
			Event.fromObservableLight(mcpService.servers),
			Event.filter(configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(ChatConfiguration.PluginMarketplaces)),
			this.onDidChangePluginMarketplaces,
			Event.map(chatAgentService.onDidChangeAgents, () => undefined),
			Event.fromObservableLight(toolsService.toolSets),
		);
	}

	computeMigration(sessionResource: URI, type: FileCustomizationMigrationType, token?: CancellationToken): Promise<FileCustomizationMigration>;
	computeMigration(sessionResource: URI, type: CustomizationMigrationType.McpServers, token?: CancellationToken): Promise<McpServerCustomizationMigration>;
	computeMigration(sessionResource: URI, type: CustomizationMigrationType.PluginMarketplaces, token?: CancellationToken): Promise<PluginMarketplaceCustomizationMigration>;
	computeMigration(sessionResource: URI, type: GuidanceCustomizationMigrationType, token?: CancellationToken): Promise<GuidanceCustomizationMigration>;
	async computeMigration(sessionResource: URI, type: CustomizationMigrationType, token = CancellationToken.None): Promise<CustomizationMigration> {
		if (!isAgentHostSessionResource(sessionResource)) {
			return this.emptyMigration(type);
		}
		if (!this.isMigrationEnabled()) {
			return this.emptyMigration(type);
		}

		switch (type) {
			case CustomizationMigrationType.ChatParticipants:
				return {
					type,
					items: this.chatAgentService.getAgents()
						.filter(agent => !agent.isCore && !agent.isDefault && !agent.isDynamic && agent.extensionId.value && !isChatExtensionItem(agent.extensionId, this.productService))
						.map(agent => ({
							id: agent.id,
							name: `@${agent.name}`,
							sourceLabel: agent.extensionDisplayName || agent.extensionId.value,
							storage: PromptsStorage.extension,
							extensionId: agent.extensionId.value,
						})),
				};
			case CustomizationMigrationType.ToolSets:
				return {
					type,
					items: [...this.toolsService.toolSets.get()]
						.filter(toolSet => toolSet.source.type === 'user'
							|| toolSet.source.type === 'extension' && !toolSet.hiddenInToolsPicker && !isChatExtensionItem(toolSet.source.extensionId, this.productService))
						.map(toolSet => ({
							id: toolSet.id,
							name: toolSet.referenceName,
							sourceLabel: toolSet.source.label,
							sourceUri: toolSet.source.type === 'user' ? toolSet.source.file : undefined,
							storage: toolSet.source.type === 'user' ? PromptsStorage.user : PromptsStorage.extension,
							extensionId: toolSet.source.type === 'extension' ? toolSet.source.extensionId.value : undefined,
						})),
				};
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
			case CustomizationMigrationType.PluginMarketplaces: {
				const marketplaceManagementProvider = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource))?.marketplaceManagementProvider;
				return marketplaceManagementProvider
					? this.computePluginMarketplaceMigration(sessionResource, marketplaceManagementProvider)
					: { type, candidates: [] };
			}
		}
	}

	async computeMigrations(sessionResource: URI, token = CancellationToken.None): Promise<CustomizationMigration[]> {
		return Promise.all([
			this.computeMigration(sessionResource, CustomizationMigrationType.UserData, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.PromptFiles, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.ConfiguredLocations, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.McpServers, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.PluginMarketplaces, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.ChatParticipants, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.ToolSets, token),
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
				storage: candidate.storage,
				id: candidate.id,
				name: candidate.name,
				sourceUri: candidate.sourceUri,
				targetUri: candidate.targetUri,
				reason: McpServerCustomizationMigrationFailureReason.NoLongerEligible,
			})),
		};
	}

	async migratePluginMarketplaces(sessionResource: URI, requestedCandidates: readonly IPluginMarketplaceCustomizationMigrationCandidate[]): Promise<IPluginMarketplaceCustomizationMigrationResult> {
		if (requestedCandidates.length === 0) {
			return { migratedCount: 0, failures: [] };
		}
		const provider = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource))?.marketplaceManagementProvider;
		if (!provider) {
			return {
				migratedCount: 0,
				failures: requestedCandidates.map(candidate => ({
					...candidate,
					reason: PluginMarketplaceCustomizationMigrationFailureReason.ProviderUnavailable,
				})),
			};
		}

		const migration = await this.computePluginMarketplaceMigration(sessionResource, provider);
		if (migration.discoveryError) {
			return {
				migratedCount: 0,
				failures: requestedCandidates.map(candidate => ({
					...candidate,
					reason: PluginMarketplaceCustomizationMigrationFailureReason.ProviderUnavailable,
					error: migration.discoveryError,
				})),
			};
		}
		const configuredCandidates = new Map(migration.candidates.map(candidate => [candidate.canonicalId, candidate]));
		const failures: IPluginMarketplaceCustomizationMigrationResult['failures'][number][] = [];
		let copiedCount = 0;
		for (const requestedCandidate of requestedCandidates) {
			const candidate = configuredCandidates.get(requestedCandidate.canonicalId);
			if (!candidate) {
				if (this.getConfiguredPluginMarketplaceCandidates().some(configured => configured.canonicalId === requestedCandidate.canonicalId)) {
					copiedCount++;
				} else {
					failures.push({
						...requestedCandidate,
						reason: PluginMarketplaceCustomizationMigrationFailureReason.NoLongerConfigured,
					});
				}
				continue;
			}
			try {
				await provider.add(sessionResource, candidate.source);
				copiedCount++;
			} catch (error) {
				failures.push({
					...candidate,
					reason: PluginMarketplaceCustomizationMigrationFailureReason.AddFailed,
					error: error instanceof Error ? error : new Error(String(error)),
				});
			}
		}

		return { migratedCount: copiedCount, failures };
	}

	async computeMigrationHint(sessionResource: URI, token = CancellationToken.None, ignoredGroups: readonly ICustomizationMigrationIgnoredGroup[] = []): Promise<ICustomizationMigrationHint | undefined> {
		const harness = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource));
		if (!harness) {
			return undefined;
		}

		const mcpMigrationEnabled = this.isMigrationEnabled();
		const [userDataMigration, promptFilesMigration, configuredLocationsMigration, mcpServerMigration, pluginMarketplacesMigration, chatParticipantsMigration, toolSetsMigration] = await Promise.all([
			this.computeMigration(sessionResource, CustomizationMigrationType.UserData, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.PromptFiles, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.ConfiguredLocations, token),
			mcpMigrationEnabled ? this.computeMigration(sessionResource, CustomizationMigrationType.McpServers, token) : Promise.resolve(this.emptyMcpServerMigration()),
			this.computeMigration(sessionResource, CustomizationMigrationType.PluginMarketplaces, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.ChatParticipants, token),
			this.computeMigration(sessionResource, CustomizationMigrationType.ToolSets, token),
		]);
		const isIgnored = (type: CustomizationMigrationType, storage: PromptsStorage) =>
			ignoredGroups.some(group => group.type === type && group.storage === storage);
		const userDataCandidates = userDataMigration.candidates.filter(candidate => !isIgnored(CustomizationMigrationType.UserData, candidate.storage));
		const promptFileCandidates = promptFilesMigration.candidates.filter(candidate => !isIgnored(CustomizationMigrationType.PromptFiles, candidate.storage));
		const configuredLocationCandidates = configuredLocationsMigration.candidates.filter(candidate => !isIgnored(CustomizationMigrationType.ConfiguredLocations, candidate.storage));
		const mcpServerCandidates = mcpServerMigration.candidates.filter(candidate => !isIgnored(CustomizationMigrationType.McpServers, candidate.storage));
		const pluginMarketplaceCandidates = pluginMarketplacesMigration.candidates.filter(candidate => !isIgnored(CustomizationMigrationType.PluginMarketplaces, candidate.storage));
		const fileCandidates = this.isMigrationEnabled()
			? [...userDataCandidates, ...promptFileCandidates, ...configuredLocationCandidates]
			: [];
		const migratableMcpServerCount = mcpServerCandidates.length;
		const workspaceCount = fileCandidates.filter(candidate => candidate.storage === PromptsStorage.local).length
			+ mcpServerCandidates.filter(candidate => candidate.storage === PromptsStorage.local).length;
		const chatParticipantItems = chatParticipantsMigration.items.filter(item => !isIgnored(CustomizationMigrationType.ChatParticipants, item.storage));
		const toolSetItems = toolSetsMigration.items.filter(item => !isIgnored(CustomizationMigrationType.ToolSets, item.storage));
		const userGuidanceCount = toolSetItems.filter(item => item.storage === PromptsStorage.user).length;
		const extensionGuidanceCount = chatParticipantItems.length
			+ toolSetItems.filter(item => item.storage === PromptsStorage.extension).length;
		const userCount = fileCandidates.filter(candidate => candidate.storage === PromptsStorage.user).length
			+ mcpServerCandidates.filter(candidate => candidate.storage === PromptsStorage.user).length
			+ pluginMarketplaceCandidates.length
			+ userGuidanceCount;
		const totalCount = workspaceCount + userCount + extensionGuidanceCount;
		return totalCount > 0 ? {
			migrationFlowId: this.generateMigrationFlowId(),
			message: extensionGuidanceCount > 0
				? this.getGenericMigrationHintMessage(totalCount)
				: this.getMigrationHintMessage(workspaceCount, userCount),
			counts: [
				{ type: CustomizationMigrationType.UserData, count: userDataCandidates.length },
				{ type: CustomizationMigrationType.PromptFiles, count: promptFileCandidates.length },
				{ type: CustomizationMigrationType.ConfiguredLocations, count: configuredLocationCandidates.length },
				{ type: CustomizationMigrationType.McpServers, count: migratableMcpServerCount },
				{ type: CustomizationMigrationType.PluginMarketplaces, count: pluginMarketplaceCandidates.length },
				{ type: CustomizationMigrationType.ChatParticipants, count: chatParticipantItems.length },
				{ type: CustomizationMigrationType.ToolSets, count: toolSetItems.length },
			].filter(({ count }) => count > 0),
		} : undefined;
	}

	private getGenericMigrationHintMessage(count: number): string {
		return count === 1
			? localize('customizationMigrationHintCountSingular', "{0} customization needs an update to keep working.", count)
			: localize('customizationMigrationHintCountPlural', "{0} customizations need an update to keep working.", count);
	}

	private getMigrationHintMessage(workspaceCount: number, userCount: number): string {
		if (userCount === 0) {
			return workspaceCount === 1
				? localize('customizationMigrationHintWorkspaceCountSingular', "{0} workspace customization needs an update to keep working.", workspaceCount)
				: localize('customizationMigrationHintWorkspaceCountPlural', "{0} workspace customizations need an update to keep working.", workspaceCount);
		}
		if (workspaceCount === 0) {
			return userCount === 1
				? localize('customizationMigrationHintUserCountSingular', "{0} user customization needs an update to keep working.", userCount)
				: localize('customizationMigrationHintUserCountPlural', "{0} user customizations need an update to keep working.", userCount);
		}
		return localize('customizationMigrationHintCounts', "{0} workspace and {1} user customizations need an update to keep working.", workspaceCount, userCount);
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
		const filteredCandidates = candidates.flatMap(customization => {
			const targetType = getCustomizationMigrationTargetType(customization);
			const compatibleFolders = sourceFolders.get(targetType)?.filter(folder => folder.source === customization.storage) ?? [];
			if (compatibleFolders.length === 0
				|| excludeSupportedLocations && compatibleFolders.some(folder => extUriBiasedIgnorePathCase.isEqualOrParent(customization.uri, folder.uri))
			) {
				return [];
			}
			return [{
				...customization,
				workspaceGroupId: provider.getWorkspaceGroupId?.(sessionResource, customization.uri),
			}];
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

	private emptyMigration(type: CustomizationMigrationType): CustomizationMigration {
		if (type === CustomizationMigrationType.ChatParticipants || type === CustomizationMigrationType.ToolSets) {
			return { type, items: [] };
		}
		if (type === CustomizationMigrationType.McpServers) {
			return this.emptyMcpServerMigration();
		}
		if (type === CustomizationMigrationType.PluginMarketplaces) {
			return { type, candidates: [] };
		}
		return { type, files: [], candidates: [] };
	}

	private getConfiguredPluginMarketplaceCandidates(): IPluginMarketplaceCustomizationMigrationCandidate[] {
		const defaultCanonicalIds = new Set(parseMarketplaceReferences(
			this.configurationService.inspect<readonly unknown[]>(ChatConfiguration.PluginMarketplaces)?.defaultValue ?? []
		).map(reference => reference.canonicalId));
		return parseMarketplaceReferences(this.getPluginMarketplaceUserValues())
			.filter(reference => !defaultCanonicalIds.has(reference.canonicalId))
			.map(reference => ({
				type: CustomizationMigrationType.PluginMarketplaces,
				storage: PromptsStorage.user,
				name: reference.displayLabel,
				source: reference.rawValue,
				canonicalId: reference.canonicalId,
			}));
	}

	private async computePluginMarketplaceMigration(sessionResource: URI, provider: ICustomizationMarketplaceManagementProvider): Promise<PluginMarketplaceCustomizationMigration> {
		const configuredCandidates = this.getConfiguredPluginMarketplaceCandidates();
		if (configuredCandidates.length === 0) {
			return { type: CustomizationMigrationType.PluginMarketplaces, candidates: [] };
		}
		try {
			const providerCanonicalIds = new Set((await provider.list(sessionResource)).flatMap(marketplace => {
				const canonicalId = this.getProviderMarketplaceCanonicalId(marketplace.source);
				return canonicalId ? [canonicalId] : [];
			}));
			return {
				type: CustomizationMigrationType.PluginMarketplaces,
				candidates: configuredCandidates.filter(candidate => !providerCanonicalIds.has(candidate.canonicalId)),
			};
		} catch (error) {
			return {
				type: CustomizationMigrationType.PluginMarketplaces,
				candidates: [],
				discoveryError: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private getProviderMarketplaceCanonicalId(source: string): string | undefined {
		const directReference = parseMarketplaceReferences([source])[0];
		if (directReference) {
			return directReference.canonicalId;
		}
		const separator = source.indexOf(': ');
		if (separator === -1) {
			return undefined;
		}
		const kind = source.slice(0, separator).toLowerCase();
		const value = source.slice(separator + 2);
		const reference = parseMarketplaceReferences([value])[0]
			?? (kind === 'directory' ? parseMarketplaceReferences([URI.file(value).toString()])[0] : undefined);
		return reference?.canonicalId;
	}

	private getPluginMarketplaceUserValues(): readonly unknown[] {
		const inspected = this.configurationService.inspect<readonly unknown[]>(ChatConfiguration.PluginMarketplaces);
		const configuredValue = inspected?.applicationValue ?? inspected?.userValue;
		return Array.isArray(configuredValue) ? configuredValue : [];
	}

	private isMigrationEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsMigrationEnabled) === true;
	}

	protected generateMigrationFlowId(): string {
		return generateUuid();
	}
}
