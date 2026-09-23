/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { equals } from '../../../../../../base/common/objects.js';
import { getComparisonKey, isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { ICustomizationHarnessService, ICustomizationMcpServerMigrationProvider } from '../../../common/customizationHarnessService.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { CustomizationMigrationType, getCustomizationMigrationEnablementSetting, getMcpServerCustomizationMigrationCandidateKey, IMcpServerCustomizationMigrationCandidate, IMcpServerCustomizationMigrationFailure, IMcpServerCustomizationMigrationResult, McpServerCustomizationMigration, McpServerCustomizationMigrationFailureReason } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { isMcpServerMigrationDeliverable, McpServerCustomizationMigrator } from '../../aiCustomization/mcpServerCustomizationMigration.js';
import { IMcpService, WORKSPACE_DOT_MCP_COLLECTION_ID_PREFIX } from '../../../../mcp/common/mcpTypes.js';
import { IAgentHostActiveClientService } from './agentHostActiveClientService.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';
import { AgentHostMcpServerApplicability, AgentHostMcpServerDelivery, AgentHostMcpServerEnablementState, IAgentHostMcpServerSupport, IAgentHostMcpServerSupportSnapshot } from './agentHostMcpServerSupport.js';
import { getMcpCompatibilityDetail, IAgentHostMcpServerSupportScope } from './agentHostMcpServerSupportScope.js';

export class AgentHostMcpServerMigrationProvider extends Disposable implements ICustomizationMcpServerMigrationProvider {
	private readonly mcpServerMigration: McpServerCustomizationMigrator;
	private activeContextKey = '';
	private activeContextGeneration = 0;

	constructor(
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IAgentHostActiveClientService private readonly activeClientService: IAgentHostActiveClientService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@IFileService fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IConfigurationResolverService configurationResolverService: IConfigurationResolverService,
		@IMcpService private readonly mcpService: IMcpService,
	) {
		super();
		this.mcpServerMigration = new McpServerCustomizationMigrator(fileService, logService, configurationResolverService);
		this._register(autorun(reader => {
			const sessionResource = this.customizationHarnessService.activeSessionResource.read(reader);
			this.updateActiveContext(sessionResource);
		}));
		this._register(this.agentHostCustomizationService.onDidChangeCustomizations(() => {
			this.updateActiveContext(this.customizationHarnessService.activeSessionResource.get());
		}));
	}

	async computeMigration(sessionResource: URI, token = CancellationToken.None): Promise<McpServerCustomizationMigration> {
		if (!this.isMigrationEnabled()) {
			return this.emptyMigration();
		}
		const roots = this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource);
		const scope = this.activeClientService.acquireMcpServerSupportScope(getChatSessionType(sessionResource), roots);
		if (!scope) {
			return this.emptyMigration();
		}

		try {
			if (!await this.waitForMcpServerSupport(scope, token) || !this.areRootsEqual(roots, this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource))) {
				return this.emptyMigration();
			}
			const snapshot = scope.support.get();
			const plan = await this.mcpServerMigration.createPlan(snapshot, roots, token);
			const candidates = plan.candidates;
			if (!await this.waitForMcpServerSupport(scope, token)
				|| !this.areRootsEqual(roots, this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource))
				|| !equals(scope.support.get().servers, snapshot.servers)
				|| !this.isMcpSupportContextCurrent(scope.support.get(), snapshot, candidates)) {
				return this.emptyMigration();
			}
			const settledSnapshot = scope.support.get();
			return {
				type: CustomizationMigrationType.McpServers,
				servers: settledSnapshot.servers
					.filter(server => server.applicability !== AgentHostMcpServerApplicability.OutsideCurrentScope)
					.map(server => ({
						id: server.id,
						name: server.name,
						supported: server.compatibility.kind === 'supported',
					})),
				candidates,
				exclusions: plan.exclusions.map(exclusion => ({
					...exclusion,
					details: this.getExclusionDetails(
						settledSnapshot.servers.find(server => server.id === exclusion.id),
						exclusion.reason,
					),
				})),
				discoveryComplete: settledSnapshot.discoveryComplete,
				coverage: settledSnapshot.coverage,
			};
		} finally {
			scope.dispose();
		}
	}

	async migrate(sessionResource: URI, requestedCandidates: readonly IMcpServerCustomizationMigrationCandidate[]): Promise<IMcpServerCustomizationMigrationResult> {
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
			this.preserveMigratedEnablement(supportSnapshot, roots, eligibleCandidates, combined.failures);
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

	private emptyMigration(): McpServerCustomizationMigration {
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

	private getExclusionDetails(server: IAgentHostMcpServerSupport | undefined, reason: McpServerCustomizationMigrationFailureReason): readonly string[] {
		if (server && server.applicability !== AgentHostMcpServerApplicability.Applicable) {
			return [localize('mcpMigrationServerNotApplicable', "This server is not associated with the current workspace.")];
		}
		if (server && server.compatibility.kind !== 'supported') {
			return server.compatibility.reasons.map(getMcpCompatibilityDetail);
		}
		if (server && server.delivery !== AgentHostMcpServerDelivery.ClientForwarded) {
			return [localize('mcpMigrationServerNotForwarded', "This server is not forwarded from its current configuration to the active agent.")];
		}
		switch (reason) {
			case McpServerCustomizationMigrationFailureReason.SourceUnavailable:
				return [localize('mcpMigrationServerSourceUnavailable', "The source MCP configuration could not be read.")];
			case McpServerCustomizationMigrationFailureReason.InvalidSource:
				return [localize('mcpMigrationServerInvalidSource', "The source MCP configuration or server definition is invalid.")];
			case McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration:
				return [localize('mcpMigrationServerUnrepresentable', "The server configuration cannot be moved without changing its behavior.")];
			default:
				return [localize('mcpMigrationServerIneligible', "This server no longer meets the migration requirements.")];
		}
	}

	private preserveMigratedEnablement(
		snapshot: IAgentHostMcpServerSupportSnapshot,
		roots: readonly URI[],
		candidates: readonly IMcpServerCustomizationMigrationCandidate[],
		failures: readonly IMcpServerCustomizationMigrationFailure[],
	): void {
		const failedIds = new Set(failures.map(failure => failure.id));
		const servers = new Map(snapshot.servers.map(server => [server.id, server]));
		for (const candidate of candidates) {
			if (failedIds.has(candidate.id)) {
				continue;
			}
			const state = servers.get(candidate.id)?.enablement.state;
			const targetState = state === AgentHostMcpServerEnablementState.DisabledProfile
				? ContributionEnablementState.DisabledProfile
				: state === AgentHostMcpServerEnablementState.DisabledWorkspace
					? ContributionEnablementState.DisabledWorkspace
					: undefined;
			if (targetState === undefined) {
				continue;
			}
			const rootIndex = roots.findIndex(root => isEqual(candidate.targetUri, URI.joinPath(root, '.mcp.json')));
			if (rootIndex < 0) {
				continue;
			}
			this.mcpService.enablementModel.setEnabled(`${WORKSPACE_DOT_MCP_COLLECTION_ID_PREFIX}${rootIndex}.${candidate.name}`, targetState);
			this.mcpService.enablementModel.remove(candidate.id);
		}
	}

	private isExecutionContextCurrent(sessionResource: URI, roots: readonly URI[], generation: number): boolean {
		return this.isMigrationEnabled()
			&& isEqual(sessionResource, this.customizationHarnessService.activeSessionResource.get())
			&& generation === this.activeContextGeneration
			&& this.areRootsEqual(roots, this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource));
	}

	private isMigrationEnabled(): boolean {
		return this.configurationService.getValue<boolean>(getCustomizationMigrationEnablementSetting(CustomizationMigrationType.McpServers)) === true;
	}

	private async waitForMcpServerSupport(scope: IAgentHostMcpServerSupportScope, token = CancellationToken.None): Promise<boolean> {
		await raceCancellation(scope.whenResolved(), token);
		return !token.isCancellationRequested && scope.isResolved.get();
	}

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
