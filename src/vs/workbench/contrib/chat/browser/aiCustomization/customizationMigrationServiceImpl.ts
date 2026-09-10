/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { raceCancellation } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { equals } from '../../../../../base/common/objects.js';
import { extUriBiasedIgnorePathCase, getComparisonKey, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { isRemoteAgentHostSessionType, parseRemoteAgentHostHarness } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { isAgentHostSessionResource } from '../../common/chatSessionsService.js';
import { ICustomizationHarnessService, ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CustomizationMigration, CustomizationMigrationHintTarget, CustomizationMigrationType, FileCustomizationMigration, FileCustomizationMigrationType, getCustomizationMigrationEnablementSetting, getCustomizationMigrationTargetType, getMcpServerCustomizationMigrationCandidateKey, ICustomizationMigrationHint, ICustomizationMigrationService, IMcpServerCustomizationMigrationCandidate, IMcpServerCustomizationMigrationFailure, IMcpServerCustomizationMigrationResult, isConfiguredLocationMigrationCandidate, isPromptFileMigrationCandidate, isUserDataMigrationCandidate, McpServerCustomizationMigration, McpServerCustomizationMigrationFailureReason, MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { IAgentHostActiveClientService } from '../agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { AgentHostMcpServerApplicability, AgentHostMcpServerDelivery, IAgentHostMcpServerSupport, IAgentHostMcpServerSupportSnapshot } from '../agentSessions/agentHost/agentHostMcpServerSupport.js';
import { IAgentHostMcpServerSupportScope } from '../agentSessions/agentHost/agentHostMcpServerSupportScope.js';
import { isMcpServerMigrationDeliverable, McpServerCustomizationMigrator } from './mcpServerCustomizationMigration.js';

type CustomizationMigrationAssessmentCountProperty = 'nativeCount' | 'mappedCount' | 'unsupportedCount';
type CustomizationMigrationAssessmentType = PromptsType | CustomizationMigrationType.McpServers;
type CustomizationMigrationAssessmentSource = NonNullable<MigratableConfiguration['source']> | PromptsStorage | IAgentHostMcpServerSupport['source']['kind'];
type CustomizationMigrationAssessmentCount = {
	readonly customizationType: CustomizationMigrationAssessmentType;
	readonly source: CustomizationMigrationAssessmentSource;
	readonly nativeCount: number;
	readonly mappedCount: number;
	readonly unsupportedCount: number;
};
type CustomizationMigrationAssessment = {
	readonly hint: ICustomizationMigrationHint | undefined;
	readonly counts: readonly CustomizationMigrationAssessmentCount[];
};
type McpServerCustomizationMigrationResult = {
	readonly migration: McpServerCustomizationMigration;
	readonly assessmentCounts: readonly CustomizationMigrationAssessmentCount[];
};

type CustomizationMigrationAssessmentEvent = CustomizationMigrationAssessmentCount & { readonly target: string };

type CustomizationMigrationAssessmentClassification = {
	target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The target Agent Host harness for the assessment.' };
	customizationType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of customization in the assessment.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded source category of customizations in the assessment.' };
	nativeCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations consumed from a native location.' };
	mappedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations consumed through compatibility mapping.' };
	unsupportedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations not fully supported by the target.' };
	owner: 'digitarald';
	comment: 'Tracks aggregate customization migration assessments without collecting customization names, paths, IDs, or content.';
};

function incrementAssessmentCount(
	counts: Map<string, CustomizationMigrationAssessmentCount>,
	customizationType: CustomizationMigrationAssessmentType,
	source: CustomizationMigrationAssessmentSource,
	property: CustomizationMigrationAssessmentCountProperty,
): void {
	const key = `${customizationType}\0${source}`;
	const current = counts.get(key) ?? { customizationType, source, nativeCount: 0, mappedCount: 0, unsupportedCount: 0 };
	counts.set(key, { ...current, [property]: current[property] + 1 });
}

export class CustomizationMigrationService extends Disposable implements ICustomizationMigrationService {
	declare readonly _serviceBrand: undefined;
	private readonly mcpServerMigration: McpServerCustomizationMigrator;
	private activeContextKey = '';
	private activeContextGeneration = 0;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IAgentHostActiveClientService private readonly activeClientService: IAgentHostActiveClientService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@IFileService fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this.mcpServerMigration = new McpServerCustomizationMigrator(fileService, logService);
		this._register(autorun(reader => {
			const sessionResource = this.customizationHarnessService.activeSessionResource.read(reader);
			this.updateActiveContext(sessionResource);
		}));
		this._register(this.agentHostCustomizationService.onDidChangeCustomizations(() => {
			this.updateActiveContext(this.customizationHarnessService.activeSessionResource.get());
		}));
	}

	computeMigration(sessionResource: URI, type: FileCustomizationMigrationType, token?: CancellationToken): Promise<FileCustomizationMigration>;
	computeMigration(sessionResource: URI, type: CustomizationMigrationType.McpServers, token?: CancellationToken): Promise<McpServerCustomizationMigration>;
	async computeMigration(sessionResource: URI, type: CustomizationMigrationType, token = CancellationToken.None): Promise<CustomizationMigration> {
		if (!isAgentHostSessionResource(sessionResource)) {
			return type === CustomizationMigrationType.McpServers
				? this.emptyMcpServerMigration().migration
				: { type, files: [], candidates: [] };
		}
		if (type !== CustomizationMigrationType.McpServers && !this.isMigrationEnabled(type)) {
			return { type, files: [], candidates: [] };
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
			case CustomizationMigrationType.McpServers:
				return (await this.computeMcpServerMigration(sessionResource, token)).migration;
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

		const roots = this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource);
		const contextGeneration = this.activeContextGeneration;
		if (!this.isExecutionContextCurrent(sessionResource, roots, contextGeneration)) {
			return { migratedCount: 0, failures: requestedCandidates.map(candidate => this.noLongerEligible(candidate)) };
		}

		const scope = this.activeClientService.acquireMcpServerSupportScope(getChatSessionType(sessionResource), roots);
		if (!scope) {
			return { migratedCount: 0, failures: requestedCandidates.map(candidate => this.noLongerEligible(candidate)) };
		}

		try {
			if (!await this.waitForMcpServerSupport(scope)) {
				return { migratedCount: 0, failures: requestedCandidates.map(candidate => this.noLongerEligible(candidate)) };
			}
			if (!this.isExecutionContextCurrent(sessionResource, roots, contextGeneration)) {
				return { migratedCount: 0, failures: requestedCandidates.map(candidate => this.noLongerEligible(candidate)) };
			}

			const supportSnapshot = scope.support.get();
			const plan = await this.mcpServerMigration.createPlan(supportSnapshot, roots);
			const isExecutionCurrent = async (candidates: readonly IMcpServerCustomizationMigrationCandidate[]): Promise<boolean> => {
				if (!await this.waitForMcpServerSupport(scope)) {
					return false;
				}
				return this.isExecutionContextCurrent(sessionResource, roots, contextGeneration)
					&& scope.isResolved.get()
					&& this.isMcpSupportContextCurrent(scope.support.get(), supportSnapshot, candidates);
			};
			if (!await isExecutionCurrent(plan.candidates)) {
				return { migratedCount: 0, failures: requestedCandidates.map(candidate => this.noLongerEligible(candidate)) };
			}

			const currentCandidates = new Map(plan.candidates.map(candidate => [getMcpServerCustomizationMigrationCandidateKey(candidate), candidate]));
			const eligibleCandidates: IMcpServerCustomizationMigrationCandidate[] = [];
			const failures: IMcpServerCustomizationMigrationFailure[] = [];
			for (const requested of requestedCandidates) {
				const current = currentCandidates.get(getMcpServerCustomizationMigrationCandidateKey(requested));
				if (!current || !equals(current.projectedConfiguration, requested.projectedConfiguration)) {
					failures.push(this.noLongerEligible(requested));
				} else {
					eligibleCandidates.push(current);
				}
			}

			this.logService.info(`[MCP Customization Migration] Starting: selected=${requestedCandidates.length}, eligible=${eligibleCandidates.length}, stale=${failures.length}`);
			const result = await this.mcpServerMigration.migrate(eligibleCandidates, {
				isContextCurrent: isExecutionCurrent,
				roots,
			});
			const combined = { migratedCount: result.migratedCount, failures: [...failures, ...result.failures] };
			for (const failure of combined.failures) {
				if (failure.error) {
					this.logService.error(`[MCP Customization Migration] Failed: reason=${failure.reason}, server=${failure.name}`, failure.error);
				} else {
					this.logService.warn(`[MCP Customization Migration] Failed: reason=${failure.reason}, server=${failure.name}`);
				}
			}
			this.logService.info(`[MCP Customization Migration] Finished: migrated=${combined.migratedCount}, failed=${combined.failures.length}`);
			return combined;
		} finally {
			scope.dispose();
		}
	}

	private async collectMigrationAssessment(sessionResource: URI, token: CancellationToken): Promise<CustomizationMigrationAssessment | undefined> {
		const harness = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource));
		if (!harness) {
			return undefined;
		}

		const [agents, instructions, prompts, skills, hooks, mcpServerResult] = await Promise.all([
			this.promptsService.listPromptFiles(PromptsType.agent, token),
			this.promptsService.listPromptFiles(PromptsType.instructions, token),
			this.promptsService.listPromptFiles(PromptsType.prompt, token),
			this.promptsService.listPromptFiles(PromptsType.skill, token),
			this.promptsService.listPromptFiles(PromptsType.hook, token),
			this.computeMcpServerMigration(sessionResource, token),
		]);
		const mcpServerMigration = mcpServerResult.migration;
		const fileCustomizations = [...agents, ...instructions, ...prompts, ...skills, ...hooks]
			.filter(customization => customization.storage === PromptsStorage.local || customization.storage === PromptsStorage.user);
		const sourceFolders = await this.getSourceFolders(sessionResource, fileCustomizations, token);
		const userDataMigration = this.isMigrationEnabled(CustomizationMigrationType.UserData)
			? this.createFileMigrationFromSourceFolders(CustomizationMigrationType.UserData, fileCustomizations.filter(isUserDataMigrationCandidate), sourceFolders)
			: { type: CustomizationMigrationType.UserData, files: [], candidates: [] } satisfies FileCustomizationMigration;
		const promptFilesMigration = this.isMigrationEnabled(CustomizationMigrationType.PromptFiles)
			? this.createFileMigrationFromSourceFolders(CustomizationMigrationType.PromptFiles, fileCustomizations.filter(isPromptFileMigrationCandidate), sourceFolders)
			: { type: CustomizationMigrationType.PromptFiles, files: [], candidates: [] } satisfies FileCustomizationMigration;
		const configuredLocationsMigration = this.isMigrationEnabled(CustomizationMigrationType.ConfiguredLocations)
			? this.createFileMigrationFromSourceFolders(CustomizationMigrationType.ConfiguredLocations, fileCustomizations.filter(isConfiguredLocationMigrationCandidate), sourceFolders, true)
			: { type: CustomizationMigrationType.ConfiguredLocations, files: [], candidates: [] } satisfies FileCustomizationMigration;
		const fileCandidates = [userDataMigration, promptFilesMigration, configuredLocationsMigration]
			.flatMap(migration => migration.candidates);
		const workspaceFileCount = fileCandidates.filter(candidate => candidate.storage === PromptsStorage.local).length;
		const userFileCount = fileCandidates.filter(candidate => candidate.storage === PromptsStorage.user).length;
		const migratableMcpServerCount = this.isMigrationEnabled(CustomizationMigrationType.McpServers) ? mcpServerMigration.candidates.length : 0;
		const unsupportedMcpServerCount = mcpServerMigration.servers.filter(server => !server.supported).length;
		const fileHint = this.formatFileMigrationHint(workspaceFileCount, userFileCount, harness.label);
		const migratableMcpHint = migratableMcpServerCount === 0
			? undefined
			: migratableMcpServerCount === 1
				? localize('customizationMigrationHintMigratableMcpSingle', "Found 1 workspace MCP server that can be migrated for {0}.", harness.label)
				: localize('customizationMigrationHintMigratableMcpMultiple', "Found {0} workspace MCP servers that can be migrated for {1}.", migratableMcpServerCount, harness.label);
		const unsupportedMcpHint = unsupportedMcpServerCount === 0
			? undefined
			: unsupportedMcpServerCount === 1
				? localize('customizationMigrationHintMcpSingle', "Found 1 MCP server that is not fully supported by {0}.", harness.label)
				: localize('customizationMigrationHintMcpMultiple', "Found {0} MCP servers that are not fully supported by {1}.", unsupportedMcpServerCount, harness.label);
		let migrationHint: string | undefined;
		if (fileHint && migratableMcpHint && unsupportedMcpHint) {
			migrationHint = localize('customizationMigrationHintCombinedAll', "{0} {1} {2}", fileHint, migratableMcpHint, unsupportedMcpHint);
		} else {
			const firstHint = fileHint ?? migratableMcpHint;
			const secondHint = firstHint === fileHint ? migratableMcpHint ?? unsupportedMcpHint : unsupportedMcpHint;
			migrationHint = firstHint && secondHint
				? localize('customizationMigrationHintCombined', "{0} {1}", firstHint, secondHint)
				: firstHint ?? unsupportedMcpHint;
		}
		return {
			hint: migrationHint ? {
				message: migrationHint,
				target: fileHint || migratableMcpHint ? CustomizationMigrationHintTarget.FileMigrations : CustomizationMigrationHintTarget.McpServers,
			} : undefined,
			counts: [...this.computeFileAssessmentCounts(fileCustomizations, sourceFolders), ...mcpServerResult.assessmentCounts],
		};
	}

	async computeMigrationHint(sessionResource: URI, token = CancellationToken.None): Promise<ICustomizationMigrationHint | undefined> {
		const assessment = await this.collectMigrationAssessment(sessionResource, token);
		if (!assessment || token.isCancellationRequested) {
			return undefined;
		}

		const sessionType = getChatSessionType(sessionResource);
		const target = isRemoteAgentHostSessionType(sessionType) ? parseRemoteAgentHostHarness(sessionType) ?? 'unknown' : sessionType;
		for (const { customizationType, source, nativeCount, mappedCount, unsupportedCount } of assessment.counts) {
			this.telemetryService.publicLog2<CustomizationMigrationAssessmentEvent, CustomizationMigrationAssessmentClassification>('chat.customizationMigrationAssessment', {
				target,
				customizationType,
				source,
				nativeCount,
				mappedCount,
				unsupportedCount,
			});
		}
		return assessment.hint;
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

	private async createFileMigration(sessionResource: URI, type: FileCustomizationMigrationType, candidates: readonly MigratableConfiguration[], token: CancellationToken, excludeSupportedLocations = false): Promise<FileCustomizationMigration> {
		const sourceFolders = await this.getSourceFolders(sessionResource, candidates, token);
		return this.createFileMigrationFromSourceFolders(type, candidates, sourceFolders, excludeSupportedLocations);
	}

	private async getSourceFolders(sessionResource: URI, customizations: readonly MigratableConfiguration[], token: CancellationToken): Promise<Map<PromptsType, readonly ICustomizationSourceFolder[]>> {
		const provider = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource))?.itemProvider;
		const targetTypes = new Set(customizations.map(getCustomizationMigrationTargetType));
		const sourceFolders = new Map<PromptsType, readonly ICustomizationSourceFolder[]>();
		if (!provider?.provideSourceFolders) {
			return sourceFolders;
		}
		for (const targetType of targetTypes) {
			const folders = await provider.provideSourceFolders(sessionResource, targetType, token);
			sourceFolders.set(targetType, folders ?? []);
		}
		return sourceFolders;
	}

	private createFileMigrationFromSourceFolders(type: FileCustomizationMigrationType, candidates: readonly MigratableConfiguration[], sourceFolders: ReadonlyMap<PromptsType, readonly ICustomizationSourceFolder[]>, excludeSupportedLocations = false): FileCustomizationMigration {
		const filteredCandidates = candidates.filter(customization => {
			const targetType = getCustomizationMigrationTargetType(customization);
			const compatibleFolders = sourceFolders.get(targetType)?.filter(folder => folder.source === customization.storage) ?? [];
			return compatibleFolders.length > 0
				&& (!excludeSupportedLocations || !compatibleFolders.some(folder => extUriBiasedIgnorePathCase.isEqualOrParent(customization.uri, folder.uri)));
		});
		return { type, files: filteredCandidates.map(customization => customization.uri), candidates: filteredCandidates };
	}

	private computeFileAssessmentCounts(customizations: readonly MigratableConfiguration[], sourceFolders: ReadonlyMap<PromptsType, readonly ICustomizationSourceFolder[]>): readonly CustomizationMigrationAssessmentCount[] {
		const counts = new Map<string, CustomizationMigrationAssessmentCount>();
		for (const customization of customizations) {
			const targetType = getCustomizationMigrationTargetType(customization);
			const compatibleFolders = sourceFolders.get(targetType)?.filter(folder => folder.source === customization.storage) ?? [];
			const isNative = customization.type === targetType
				&& compatibleFolders.some(folder => extUriBiasedIgnorePathCase.isEqualOrParent(customization.uri, folder.uri));
			const property = isNative ? 'nativeCount' : compatibleFolders.length > 0 ? 'mappedCount' : 'unsupportedCount';
			incrementAssessmentCount(counts, customization.type, customization.source ?? customization.storage, property);
		}
		return [...counts.values()];
	}

	private async computeMcpServerMigration(sessionResource: URI, token = CancellationToken.None): Promise<McpServerCustomizationMigrationResult> {
		const roots = this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource);
		const scope = this.activeClientService.acquireMcpServerSupportScope(getChatSessionType(sessionResource), roots);
		if (!scope) {
			return this.emptyMcpServerMigration();
		}

		try {
			if (!await this.waitForMcpServerSupport(scope, token) || !this.areRootsEqual(roots, this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource))) {
				return this.emptyMcpServerMigration();
			}
			const snapshot = scope.support.get();
			const candidates = this.isMigrationEnabled(CustomizationMigrationType.McpServers)
				? (await this.mcpServerMigration.createPlan(snapshot, roots)).candidates
				: [];
			if (!await this.waitForMcpServerSupport(scope, token)
				|| !this.areRootsEqual(roots, this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource))
				|| !this.isMcpSupportContextCurrent(scope.support.get(), snapshot, candidates)) {
				return this.emptyMcpServerMigration();
			}
			const settledSnapshot = scope.support.get();
			const migration: McpServerCustomizationMigration = {
				type: CustomizationMigrationType.McpServers,
				servers: settledSnapshot.servers
					.filter(server => server.applicability !== AgentHostMcpServerApplicability.OutsideCurrentScope)
					.map(server => ({
						id: server.id,
						name: server.name,
						supported: server.compatibility.kind === 'supported',
					})),
				candidates: this.isMigrationEnabled(CustomizationMigrationType.McpServers) ? candidates : [],
				discoveryComplete: settledSnapshot.discoveryComplete,
				coverage: settledSnapshot.coverage,
			};
			return { migration, assessmentCounts: this.computeMcpServerAssessmentCounts(settledSnapshot.servers) };
		} finally {
			scope.dispose();
		}
	}

	private emptyMcpServerMigration(): McpServerCustomizationMigrationResult {
		const migration: McpServerCustomizationMigration = {
			type: CustomizationMigrationType.McpServers,
			servers: [],
			candidates: [],
			discoveryComplete: true,
			coverage: {
				restrictedByMcpAccess: false,
				restrictedByCustomizationPolicy: false,
			},
		};
		return { migration, assessmentCounts: [] };
	}

	private computeMcpServerAssessmentCounts(servers: readonly IAgentHostMcpServerSupport[]): readonly CustomizationMigrationAssessmentCount[] {
		const counts = new Map<string, CustomizationMigrationAssessmentCount>();
		for (const server of servers) {
			if (!server.enablement.enabled || server.applicability === AgentHostMcpServerApplicability.OutsideCurrentScope) {
				continue;
			}
			const property = server.compatibility.kind !== 'supported'
				|| server.delivery === AgentHostMcpServerDelivery.NotDelivered
				|| server.delivery === AgentHostMcpServerDelivery.Unknown
				? 'unsupportedCount'
				: server.delivery === AgentHostMcpServerDelivery.ClientForwarded
					? 'mappedCount'
					: 'nativeCount';
			incrementAssessmentCount(counts, CustomizationMigrationType.McpServers, server.source.kind, property);
		}
		return [...counts.values()];
	}

	private isExecutionContextCurrent(sessionResource: URI, roots: readonly URI[], generation: number): boolean {
		return this.isMigrationEnabled(CustomizationMigrationType.McpServers)
			&& isEqual(sessionResource, this.customizationHarnessService.activeSessionResource.get())
			&& generation === this.activeContextGeneration
			&& this.areRootsEqual(roots, this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource));
	}

	private isMigrationEnabled(type: CustomizationMigrationType): boolean {
		return this.configurationService.getValue<boolean>(getCustomizationMigrationEnablementSetting(type)) === true;
	}

	private async waitForMcpServerSupport(scope: IAgentHostMcpServerSupportScope, token = CancellationToken.None): Promise<boolean> {
		await raceCancellation(scope.whenResolved(), token);
		return !token.isCancellationRequested && scope.isResolved.get();
	}

	/**
	 * Compares only what policy and enablement control, because migrating republishes the snapshot itself.
	 */
	private isMcpSupportContextCurrent(
		current: IAgentHostMcpServerSupportSnapshot,
		planned: IAgentHostMcpServerSupportSnapshot,
		candidates: readonly IMcpServerCustomizationMigrationCandidate[],
	): boolean {
		if (!equals(current.coverage, planned.coverage)) {
			return false;
		}
		const currentServers = new Map(current.servers.map(server => [server.id, server]));
		return candidates.every(candidate => {
			const server = currentServers.get(candidate.id);
			return server !== undefined
				&& isMcpServerMigrationDeliverable(server)
				&& equals(server.projectedConfiguration, candidate.projectedConfiguration);
		});
	}

	private areRootsEqual(first: readonly URI[], second: readonly URI[]): boolean {
		return first.length === second.length && first.every((root, index) => isEqual(root, second[index]));
	}

	private noLongerEligible(candidate: IMcpServerCustomizationMigrationCandidate): IMcpServerCustomizationMigrationFailure {
		return {
			id: candidate.id,
			name: candidate.name,
			sourceUri: candidate.sourceUri,
			targetUri: candidate.targetUri,
			reason: McpServerCustomizationMigrationFailureReason.NoLongerEligible,
		};
	}

	private updateActiveContext(sessionResource: URI): void {
		const roots = this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource);
		const key = JSON.stringify([getComparisonKey(sessionResource), ...roots.map(root => getComparisonKey(root))]);
		if (key !== this.activeContextKey) {
			this.activeContextKey = key;
			this.activeContextGeneration++;
		}
	}
}
