/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../instantiation/common/descriptors.js';
import { ServiceIdentifier, _util } from '../../instantiation/common/instantiation.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { GitHubService, IGitHubService } from '../../github/common/githubService.js';
import type { GitHubServiceOptions } from '../../github/common/githubTypes.js';
import { ISandboxHelperService } from '../../sandbox/common/sandboxHelperService.js';
import { SandboxHelperService } from '../../sandbox/node/sandboxHelper.js';
import { IWindowsMxcTerminalSandboxRuntime, WindowsMxcTerminalSandboxRuntime } from '../../sandbox/common/terminalSandboxMxcRuntime.js';
import { URI } from '../../../base/common/uri.js';
import { IAgentPluginManager } from '../common/agentPluginManager.js';
import { IDiffComputeService } from '../common/diffComputeService.js';
import { IAgentEditAttributionService } from '../common/fileEditAttribution.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { IAgentHostOTelService } from '../common/otel/agentHostOTelService.js';
import { IAgentHostChangesetOperationService } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostChangesetService } from '../common/agentHostChangesetService.js';
import { IAgentHostChangesetSubscriptionService } from '../common/agentHostChangesetSubscriptionService.js';
import { IAgentHostCheckpointService } from '../common/agentHostCheckpointService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { IAgentHostReviewService } from '../common/agentHostReviewService.js';
import { CopilotApiService, ICopilotApiService } from './shared/copilotApiService.js';
import { AgentHostFileMonitorService, IAgentHostFileMonitorService } from './agentHostFileMonitorService.js';
import { AgentHostGitService } from './agentHostGitService.js';
import { AgentPluginManager } from './agentPluginManager.js';
import { AgentSdkDownloader, IAgentSdkDownloader } from './agentSdkDownloader.js';
import { IByokLmBridgeRegistry } from './byokLmBridgeRegistry.js';
import { ClaudeAgentSdkService, IClaudeAgentSdkService } from './claude/claudeAgentSdkService.js';
import { ClaudeProxyService, IClaudeProxyService } from './claude/claudeProxyService.js';
import { ByokLmProxyService, IByokLmProxyService, NullByokLmProxyService } from './copilot/byokLmProxyService.js';
import { CodexProxyService, ICodexProxyService } from './codex/codexProxyService.js';
import { NodeWorkerDiffComputeService } from './diffComputeService.js';
import { NetworkDiagnosticsService, INetworkDiagnosticsService } from './networkDiagnosticsService.js';
import { AgentHostOTelService } from './otel/agentHostOTelService.js';
import { AgentHostChangesetOperationService } from './agentHostChangesetOperationService.js';
import { AgentHostChangesetService } from './agentHostChangesetService.js';
import { AgentHostChangesetSubscriptionService } from './agentHostChangesetSubscriptionService.js';
import { AgentHostCheckpointService } from './agentHostCheckpointService.js';
import { AgentHostCompletions, IAgentHostCompletions } from './agentHostCompletions.js';
import { AgentHostCustomizationEnablementService, IAgentHostCustomizationEnablementService } from './agentHostCustomizationEnablementService.js';
import { AgentHostGitStateService } from './agentHostGitStateService.js';
import { AgentHostManagedSettingsService, IAgentHostManagedSettingsService } from './agentHostManagedSettingsService.js';
import { AgentHostPromptCache, IAgentHostPromptCache } from './agentHostPromptCache.js';
import { AgentHostReviewService } from './agentHostReviewService.js';
import { AgentHostSessionTitleSignal, IAgentHostSessionTitleSignal } from './agentHostSessionTitleSignal.js';
import { AgentHostStorageService, IAgentHostStorageService } from './agentHostStorageService.js';
import { AgentHostTerminalManager, IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { AgentEditAttributionService } from './shared/agentEditAttributionService.js';
import { AgentHostOctoKitService, IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import { EditArcReporterService, IEditArcReporterService } from './shared/editArcReporter.js';
import { EditSurvivalReporterFactory, IEditSurvivalReporterFactory } from './shared/editSurvivalReporter.js';
import { IAgentHostWorktreeIsolation, WorktreeIsolation } from './shared/worktreeIsolation.js';
import { AgentBranchNameGenerator, IAgentBranchNameGenerator } from './shared/agentBranchNameGenerator.js';

/**
 * Process-local collection that rejects descriptor static-argument shapes which
 * `InstantiationService` would otherwise silently pad or truncate.
 */
export class AgentHostServiceCollection extends ServiceCollection {
	override set<T>(id: ServiceIdentifier<T>, instanceOrDescriptor: T | SyncDescriptor<T>): T | SyncDescriptor<T> {
		if (instanceOrDescriptor instanceof SyncDescriptor) {
			assertExactStaticArguments(instanceOrDescriptor);
		}
		return super.set(id, instanceOrDescriptor);
	}
}

function assertExactStaticArguments(descriptor: SyncDescriptor<unknown>): void {
	const dependencies = _util.getServiceDependencies(descriptor.ctor).sort((a, b) => a.index - b.index);
	if (dependencies.length > 0) {
		const expected = dependencies[0].index;
		const actual = descriptor.staticArguments.length;
		if (actual !== expected) {
			throw new Error(`Agent Host descriptor ${descriptor.ctor.name} must pass exactly ${expected} leading static arguments (got ${actual})`);
		}
		return;
	}

	// DI does not pad or truncate constructors without service dependencies. This
	// heuristic still catches omitted required static arguments; default and rest
	// parameters are intentionally excluded from Function.length.
	const required = descriptor.ctor.length;
	const actual = descriptor.staticArguments.length;
	if (actual < required) {
		throw new Error(`Agent Host descriptor ${descriptor.ctor.name} must pass at least ${required} required static arguments (got ${actual})`);
	}
}

function registerService<T>(
	services: AgentHostServiceCollection,
	id: ServiceIdentifier<T>,
	value: T | SyncDescriptor<T>,
): void {
	if (services.has(id)) {
		return;
	}
	services.set(id, value);
}

export interface IAgentHostCoreServiceInputs {
	readonly storageResource: URI | undefined;
	readonly fetchFn: typeof globalThis.fetch;
	readonly gitHubServiceOptions: GitHubServiceOptions;
	readonly copilotApiService?: ICopilotApiService;
}

/** Registers services shared by production and the AgentService test graph. */
export function registerAgentHostCoreServices(services: AgentHostServiceCollection, inputs: IAgentHostCoreServiceInputs): void {
	registerService(services, IAgentHostFileMonitorService, new SyncDescriptor(AgentHostFileMonitorService));
	registerService(services, INetworkDiagnosticsService, new SyncDescriptor(NetworkDiagnosticsService));
	registerService(services, IDiffComputeService, new SyncDescriptor(NodeWorkerDiffComputeService));
	registerService(services, IAgentEditAttributionService, new SyncDescriptor(AgentEditAttributionService, [undefined, undefined]));
	registerService(services, IEditSurvivalReporterFactory, new SyncDescriptor(EditSurvivalReporterFactory));
	registerService(services, IEditArcReporterService, new SyncDescriptor(EditArcReporterService, [undefined]));
	registerService(services, IAgentHostStorageService, new SyncDescriptor(AgentHostStorageService, [inputs.storageResource]));
	registerService(services, IAgentHostManagedSettingsService, new SyncDescriptor(AgentHostManagedSettingsService));
	registerService(services, IAgentHostOctoKitService, new SyncDescriptor(AgentHostOctoKitService, [inputs.fetchFn]));
	registerService(services, IGitHubService, new SyncDescriptor(GitHubService, [inputs.gitHubServiceOptions]));
	registerService(services, ICopilotApiService, inputs.copilotApiService ?? new SyncDescriptor(CopilotApiService, [inputs.fetchFn]));
	registerService(services, IAgentHostCustomizationEnablementService, new SyncDescriptor(AgentHostCustomizationEnablementService));
	registerService(services, IAgentHostGitStateService, new SyncDescriptor(AgentHostGitStateService));
	registerService(services, IAgentHostCheckpointService, new SyncDescriptor(AgentHostCheckpointService));
	registerService(services, IAgentHostPromptCache, new SyncDescriptor(AgentHostPromptCache));
	registerService(services, IAgentHostSessionTitleSignal, new SyncDescriptor(AgentHostSessionTitleSignal));
	registerService(services, IAgentHostChangesetSubscriptionService, new SyncDescriptor(AgentHostChangesetSubscriptionService));
	registerService(services, IAgentHostChangesetOperationService, new SyncDescriptor(AgentHostChangesetOperationService));
	registerService(services, IAgentHostReviewService, new SyncDescriptor(AgentHostReviewService));
	registerService(services, IAgentHostChangesetService, new SyncDescriptor(AgentHostChangesetService));
	registerService(services, IAgentHostCompletions, new SyncDescriptor(AgentHostCompletions));
	registerService(services, IAgentHostTerminalManager, new SyncDescriptor(AgentHostTerminalManager));
	registerService(services, IAgentBranchNameGenerator, new SyncDescriptor(AgentBranchNameGenerator));
	registerService(services, IAgentHostWorktreeIsolation, new SyncDescriptor(WorktreeIsolation));
}

export interface IAgentHostHostServiceInputs {
	readonly userDataPath: URI;
	readonly fetchFn: typeof globalThis.fetch;
	readonly byok: { readonly kind: 'renderer'; readonly bridgeRegistry: IByokLmBridgeRegistry } | { readonly kind: 'unavailable' };
}

export function registerAgentHostHostServices(services: AgentHostServiceCollection, inputs: IAgentHostHostServiceInputs): void {
	registerService(services, IWindowsMxcTerminalSandboxRuntime, new SyncDescriptor(WindowsMxcTerminalSandboxRuntime));
	registerService(services, ISandboxHelperService, new SyncDescriptor(SandboxHelperService));
	registerService(services, IAgentHostGitService, new SyncDescriptor(AgentHostGitService));
	registerService(services, IAgentPluginManager, new SyncDescriptor(AgentPluginManager, [inputs.userDataPath]));
	registerService(services, IAgentSdkDownloader, new SyncDescriptor(AgentSdkDownloader));
	registerService(services, IClaudeAgentSdkService, new SyncDescriptor(ClaudeAgentSdkService));
	registerService(services, IClaudeProxyService, new SyncDescriptor(ClaudeProxyService));
	registerService(services, ICodexProxyService, new SyncDescriptor(CodexProxyService));
	registerService(services, IAgentHostOTelService, new SyncDescriptor(AgentHostOTelService, [inputs.fetchFn]));
	registerService(
		services,
		IByokLmProxyService,
		inputs.byok.kind === 'renderer' ? new SyncDescriptor(ByokLmProxyService) : new NullByokLmProxyService(),
	);
}
