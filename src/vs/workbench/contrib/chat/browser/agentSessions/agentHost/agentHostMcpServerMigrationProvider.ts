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
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { ICustomizationHarnessService, ICustomizationMcpServerMigrationProvider } from '../../../common/customizationHarnessService.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { CustomizationMigrationType, getCustomizationMigrationEnablementSetting, getMcpServerCustomizationMigrationCandidateKey, IMcpServerCustomizationMigrationCandidate, IMcpServerCustomizationMigrationFailure, IMcpServerCustomizationMigrationResult, McpServerCustomizationMigration, McpServerCustomizationMigrationFailureReason } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { isMcpServerMigrationDeliverable, McpServerCustomizationMigrator } from '../../aiCustomization/mcpServerCustomizationMigration.js';
import { IAgentHostActiveClientService } from './agentHostActiveClientService.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';
import { AgentHostMcpServerApplicability, IAgentHostMcpServerSupportSnapshot } from './agentHostMcpServerSupport.js';
import { IAgentHostMcpServerSupportScope } from './agentHostMcpServerSupportScope.js';

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
			const candidates = this.isMigrationEnabled()
				? (await this.mcpServerMigration.createPlan(snapshot, roots, token)).candidates
				: [];
			if (!await this.waitForMcpServerSupport(scope, token)
				|| !this.areRootsEqual(roots, this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource))
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
				candidates: this.isMigrationEnabled() ? candidates : [],
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
			discoveryComplete: true,
			coverage: {
				restrictedByMcpAccess: false,
				restrictedByCustomizationPolicy: false,
			},
		};
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
