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
import { McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService, ICustomizationMcpServerMigrationProvider } from '../../../common/customizationHarnessService.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { CustomizationMigrationType, getMcpServerCustomizationMigrationCandidateKey, IMcpServerCustomizationMigrationCandidate, IMcpServerCustomizationMigrationFailure, IMcpServerCustomizationMigrationResult, McpServerCustomizationMigration, McpServerCustomizationMigrationFailureReason } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { isMcpServerMigrationDeliverable, McpServerCustomizationMigrator } from '../../aiCustomization/mcpServerCustomizationMigration.js';
import { IMcpService, WORKSPACE_DOT_MCP_COLLECTION_ID_PREFIX } from '../../../../mcp/common/mcpTypes.js';
import { IMcpCopilotGlobalConfigurationService } from '../../../../mcp/common/mcpCopilotGlobalConfigurationService.js';
import { IAgentHostActiveClientService } from './agentHostActiveClientService.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';
import { AgentHostMcpServerApplicability, AgentHostMcpServerDelivery, AgentHostMcpServerEnablementState, AgentHostMcpServerSourceKind, IAgentHostMcpServerSupport, IAgentHostMcpServerSupportSnapshot } from './agentHostMcpServerSupport.js';
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
		@IMcpCopilotGlobalConfigurationService private readonly copilotGlobalConfigurationService: IMcpCopilotGlobalConfigurationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
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
			const userTarget = await this.getUserTarget(sessionResource, snapshot);
			const plan = await this.mcpServerMigration.createPlan(snapshot, roots, token, userTarget);
			const candidates = plan.candidates;
			const userTargetCurrent = !userTarget || isEqual(userTarget, await this.getUserTarget(sessionResource, snapshot));
			if (!await this.waitForMcpServerSupport(scope, token)
				|| !this.areRootsEqual(roots, this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource))
				|| !equals(scope.support.get().servers, snapshot.servers)
				|| !userTargetCurrent
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
			const userTarget = await this.getUserTarget(sessionResource, supportSnapshot);
			const plan = await this.mcpServerMigration.createPlan(supportSnapshot, roots, CancellationToken.None, userTarget);
			const isExecutionCurrent = async (candidates: readonly IMcpServerCustomizationMigrationCandidate[]): Promise<boolean> => {
				if (userTarget && !isEqual(userTarget, await this.getUserTarget(sessionResource, supportSnapshot))) {
					return false;
				}
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
				if (!current || !equals(current.projectedConfiguration, requested.projectedConfiguration)
					|| !equals(current.removedProperties, requested.removedProperties)) {
					failures.push(this.noLongerEligible(requested));
				} else {
					eligibleCandidates.push(current);
				}
			}

			this.logService.info(`[MCP Customization Migration] Starting: selected=${requestedCandidates.length}, eligible=${eligibleCandidates.length}, stale=${failures.length}`);
			const result = await this.migrateKeepingPrecedence(supportSnapshot, eligibleCandidates, isExecutionCurrent, userTarget);
			const combined = { migratedCount: result.migratedCount, failures: [...failures, ...result.failures] };
			this.preserveMigratedEnablement(supportSnapshot, eligibleCandidates, combined.failures);
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

	/**
	 * Migrates candidates without changing which same-named workspace-folder server the session uses.
	 * The client registers one `.vscode/mcp.json` server per name and forwards it ahead of root `.mcp.json`
	 * servers. Moving that server while a server it shadows stays behind would let the shadowed one take over,
	 * so shadowed servers migrate first and the server shadowing them only migrates once they all have.
	 */
	private async migrateKeepingPrecedence(
		snapshot: IAgentHostMcpServerSupportSnapshot,
		candidates: readonly IMcpServerCustomizationMigrationCandidate[],
		isContextCurrent: (candidates: readonly IMcpServerCustomizationMigrationCandidate[]) => Promise<boolean>,
		userTarget: URI | undefined,
	): Promise<IMcpServerCustomizationMigrationResult> {
		const shadowedIds = new Map<string, string[]>();
		for (const server of snapshot.servers) {
			if (server.shadowedBy !== undefined && server.applicability === AgentHostMcpServerApplicability.Applicable) {
				shadowedIds.set(server.shadowedBy, [...shadowedIds.get(server.shadowedBy) ?? [], server.id]);
			}
		}
		const shadowing = candidates.filter(candidate => shadowedIds.has(candidate.id));
		const first = await this.mcpServerMigration.migrate(candidates.filter(candidate => !shadowedIds.has(candidate.id)), { isContextCurrent, userTarget });
		const failedIds = new Set(first.failures.map(failure => failure.id));
		const migratedIds = new Set(candidates.filter(candidate => !shadowedIds.has(candidate.id) && !failedIds.has(candidate.id)).map(candidate => candidate.id));
		const ready = shadowing.filter(candidate => shadowedIds.get(candidate.id)!.every(id => migratedIds.has(id)));
		const blocked = shadowing.filter(candidate => !ready.includes(candidate)).map((candidate): IMcpServerCustomizationMigrationFailure => ({
			storage: candidate.storage,
			id: candidate.id,
			name: candidate.name,
			sourceUri: candidate.sourceUri,
			targetUri: candidate.targetUri,
			reason: McpServerCustomizationMigrationFailureReason.ShadowedServerNotMigrated,
		}));
		const second = ready.length > 0
			? await this.mcpServerMigration.migrate(ready, { isContextCurrent, userTarget })
			: { migratedCount: 0, failures: [] };
		return {
			migratedCount: first.migratedCount + second.migratedCount,
			failures: [...first.failures, ...blocked, ...second.failures],
		};
	}

	private getUserTarget(sessionResource: URI, snapshot: IAgentHostMcpServerSupportSnapshot): Promise<URI | undefined> {
		if (getChatSessionType(sessionResource) !== SessionType.AgentHostCopilot
			|| !snapshot.servers.some(server => server.source.kind === AgentHostMcpServerSourceKind.UserProfile || server.source.kind === AgentHostMcpServerSourceKind.RemoteUser)) {
			return Promise.resolve(undefined);
		}
		return this.copilotGlobalConfigurationService.getConfigurationResource();
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
			case McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration: {
				const configuration = server?.projectedConfiguration;
				if (configuration?.type === McpServerType.LOCAL && configuration.env && Object.values(configuration.env).some(value => value === null)) {
					return [localize('mcpMigrationServerNullEnvironment', "Environment variables with null values are not supported in the destination MCP configuration. Remove or replace the null value to migrate this server.")];
				}
				return [localize('mcpMigrationServerUnrepresentable', "The server configuration cannot be moved without changing its behavior.")];
			}
			default:
				return [localize('mcpMigrationServerIneligible', "This server no longer meets the migration requirements.")];
		}
	}

	private preserveMigratedEnablement(
		snapshot: IAgentHostMcpServerSupportSnapshot,
		candidates: readonly IMcpServerCustomizationMigrationCandidate[],
		failures: readonly IMcpServerCustomizationMigrationFailure[],
	): void {
		const failedIds = new Set(failures.map(failure => failure.id));
		const servers = new Map(snapshot.servers.map(server => [server.id, server]));
		for (const candidate of candidates) {
			if (failedIds.has(candidate.id)) {
				continue;
			}
			const server = servers.get(candidate.id);
			const state = server?.enablement.state;
			const targetState = state === AgentHostMcpServerEnablementState.DisabledProfile
				? ContributionEnablementState.DisabledProfile
				: state === AgentHostMcpServerEnablementState.DisabledWorkspace
					? ContributionEnablementState.DisabledWorkspace
					: server?.shadowedBy !== undefined
						// Shadowed servers are unregistered, so their enablement is only recorded in the model.
						? this.getDisabledEnablementState(this.mcpService.enablementModel.readEnabled(candidate.id))
						: undefined;
			if (targetState === undefined) {
				continue;
			}
			// Root `.mcp.json` collections are keyed by workspace folder index, which can differ from the session's root order.
			const folder = this.workspaceContextService.getWorkspace().folders.find(folder => isEqual(candidate.targetUri, URI.joinPath(folder.uri, '.mcp.json')));
			if (!folder) {
				continue;
			}
			this.mcpService.enablementModel.setEnabled(`${WORKSPACE_DOT_MCP_COLLECTION_ID_PREFIX}${folder.index}.${candidate.name}`, targetState);
			this.mcpService.enablementModel.remove(candidate.id);
		}
	}

	private getDisabledEnablementState(state: ContributionEnablementState): ContributionEnablementState | undefined {
		return state === ContributionEnablementState.DisabledProfile || state === ContributionEnablementState.DisabledWorkspace ? state : undefined;
	}

	private isExecutionContextCurrent(sessionResource: URI, roots: readonly URI[], generation: number): boolean {
		return this.isMigrationEnabled()
			&& isEqual(sessionResource, this.customizationHarnessService.activeSessionResource.get())
			&& generation === this.activeContextGeneration
			&& this.areRootsEqual(roots, this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource));
	}

	private isMigrationEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsMigrationEnabled) === true;
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
			const plannedServer = planned.servers.find(server => server.id === candidate.id);
			return server !== undefined
				&& plannedServer !== undefined
				&& isMcpServerMigrationDeliverable(server)
				&& server.source.kind === plannedServer.source.kind
				&& server.source.remoteAuthority === plannedServer.source.remoteAuthority
				&& isEqual(server.source.collectionUri, plannedServer.source.collectionUri)
				&& equals(server.projectedConfiguration, candidate.projectedConfiguration);
		});
	}

	private areRootsEqual(first: readonly URI[], second: readonly URI[]): boolean {
		return first.length === second.length && first.every((root, index) => isEqual(root, second[index]));
	}

	private noLongerEligible(candidate: IMcpServerCustomizationMigrationCandidate): IMcpServerCustomizationMigrationFailure {
		return {
			storage: candidate.storage,
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
