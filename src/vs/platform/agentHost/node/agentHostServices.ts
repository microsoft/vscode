/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../instantiation/common/descriptors.js';
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
import { IAgentHostChatContributions } from '../common/agentHostChatContributionsService.js';
import { IAgentHostCheckpointService } from '../common/agentHostCheckpointService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { IAgentHostReviewService } from '../common/agentHostReviewService.js';
import { IAgentHostSubscriptionService } from '../common/agentHostSubscriptionService.js';
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
import { AgentHostChatContributions } from './agentHostChatContributionsService.js';
import { AgentHostCheckpointService } from './agentHostCheckpointService.js';
import { AgentHostCompletions, IAgentHostCompletions } from './agentHostCompletions.js';
import { AgentHostCustomizationEnablementService, IAgentHostCustomizationEnablementService } from './agentHostCustomizationEnablementService.js';
import { AgentHostGitStateService } from './agentHostGitStateService.js';
import { AgentHostManagedSettingsService, IAgentHostManagedSettingsService } from './agentHostManagedSettingsService.js';
import { AgentHostPromptCache, IAgentHostPromptCache } from './agentHostPromptCache.js';
import { AgentHostPullRequestStatusService, IAgentHostPullRequestStatusService } from './agentHostPullRequestStatusService.js';
import { AgentHostReviewService } from './agentHostReviewService.js';
import { AgentHostSubscriptionService } from './agentHostSubscriptionService.js';
import { AgentHostSessionTitleSignal, IAgentHostSessionTitleSignal } from './agentHostSessionTitleSignal.js';
import { AgentHostSessionOpenTelemetry, IAgentHostSessionOpenTelemetry } from './agentHostSessionOpenTelemetry.js';
import { AgentHostStorageService, IAgentHostStorageService } from './agentHostStorageService.js';
import { AgentHostTerminalManager, IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { AgentHostTelemetryReporter, IAgentHostTelemetryReporter } from './agentHostTelemetryReporter.js';
import { AgentHostToolCallTracker, IAgentHostToolCallTracker } from './agentHostToolCallTracker.js';
import { AgentHostTurnTracker, IAgentHostTurnTracker } from './agentHostTurnTracker.js';
import { AgentHostProviderService, IAgentHostProviderService } from './agentHostProviderService.js';
import { AgentEditAttributionService } from './shared/agentEditAttributionService.js';
import { AgentHostOctoKitService, IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import { EditArcReporterService, IEditArcReporterService } from './shared/editArcReporter.js';
import { EditSurvivalReporterFactory, IEditSurvivalReporterFactory } from './shared/editSurvivalReporter.js';
import { IAgentHostWorktreeIsolation, WorktreeIsolation } from './shared/worktreeIsolation.js';
import { AgentBranchNameGenerator, IAgentBranchNameGenerator } from './shared/agentBranchNameGenerator.js';

export interface IAgentHostCoreServiceInputs {
	readonly storageResource: URI | undefined;
	readonly fetchFn: typeof globalThis.fetch;
	readonly gitHubServiceOptions: GitHubServiceOptions;
	readonly copilotApiService?: ICopilotApiService;
}

export function registerAgentHostCoreServices(services: ServiceCollection, inputs: IAgentHostCoreServiceInputs): void {
	services.set(IAgentHostFileMonitorService, new SyncDescriptor(AgentHostFileMonitorService));
	services.set(INetworkDiagnosticsService, new SyncDescriptor(NetworkDiagnosticsService));
	services.set(IDiffComputeService, new SyncDescriptor(NodeWorkerDiffComputeService));
	services.set(IAgentEditAttributionService, new SyncDescriptor(AgentEditAttributionService, [undefined, undefined]));
	services.set(IEditSurvivalReporterFactory, new SyncDescriptor(EditSurvivalReporterFactory));
	services.set(IEditArcReporterService, new SyncDescriptor(EditArcReporterService, [undefined]));
	services.set(IAgentHostStorageService, new SyncDescriptor(AgentHostStorageService, [inputs.storageResource]));
	services.set(IAgentHostManagedSettingsService, new SyncDescriptor(AgentHostManagedSettingsService));
	services.set(IAgentHostOctoKitService, new SyncDescriptor(AgentHostOctoKitService, [inputs.fetchFn]));
	services.set(IGitHubService, new SyncDescriptor(GitHubService, [inputs.gitHubServiceOptions]));
	services.set(ICopilotApiService, inputs.copilotApiService ?? new SyncDescriptor(CopilotApiService, [inputs.fetchFn]));
	services.set(IAgentHostCustomizationEnablementService, new SyncDescriptor(AgentHostCustomizationEnablementService));
	services.set(IAgentHostGitStateService, new SyncDescriptor(AgentHostGitStateService));
	services.set(IAgentHostCheckpointService, new SyncDescriptor(AgentHostCheckpointService));
	services.set(IAgentHostPromptCache, new SyncDescriptor(AgentHostPromptCache));
	services.set(IAgentHostSessionTitleSignal, new SyncDescriptor(AgentHostSessionTitleSignal));
	services.set(IAgentHostSessionOpenTelemetry, new SyncDescriptor(AgentHostSessionOpenTelemetry));
	services.set(IAgentHostChangesetSubscriptionService, new SyncDescriptor(AgentHostChangesetSubscriptionService));
	services.set(IAgentHostPullRequestStatusService, new SyncDescriptor(AgentHostPullRequestStatusService));
	services.set(IAgentHostSubscriptionService, new SyncDescriptor(AgentHostSubscriptionService));
	services.set(IAgentHostChangesetOperationService, new SyncDescriptor(AgentHostChangesetOperationService));
	services.set(IAgentHostReviewService, new SyncDescriptor(AgentHostReviewService));
	services.set(IAgentHostChangesetService, new SyncDescriptor(AgentHostChangesetService));
	services.set(IAgentHostCompletions, new SyncDescriptor(AgentHostCompletions));
	services.set(IAgentHostTerminalManager, new SyncDescriptor(AgentHostTerminalManager));
	services.set(IAgentHostChatContributions, new SyncDescriptor(AgentHostChatContributions));
	services.set(IAgentHostTelemetryReporter, new SyncDescriptor(AgentHostTelemetryReporter));
	services.set(IAgentHostTurnTracker, new SyncDescriptor(AgentHostTurnTracker));
	services.set(IAgentHostToolCallTracker, new SyncDescriptor(AgentHostToolCallTracker));
	services.set(IAgentHostProviderService, new SyncDescriptor(AgentHostProviderService));
	services.set(IAgentBranchNameGenerator, new SyncDescriptor(AgentBranchNameGenerator));
	services.set(IAgentHostWorktreeIsolation, new SyncDescriptor(WorktreeIsolation));
}

export interface IAgentHostHostServiceInputs {
	readonly userDataPath: URI;
	readonly fetchFn: typeof globalThis.fetch;
	readonly byok: { readonly kind: 'renderer'; readonly bridgeRegistry: IByokLmBridgeRegistry } | { readonly kind: 'unavailable' };
}

export function registerAgentHostHostServices(services: ServiceCollection, inputs: IAgentHostHostServiceInputs): void {
	services.set(IWindowsMxcTerminalSandboxRuntime, new SyncDescriptor(WindowsMxcTerminalSandboxRuntime));
	services.set(ISandboxHelperService, new SyncDescriptor(SandboxHelperService));
	services.set(IAgentHostGitService, new SyncDescriptor(AgentHostGitService));
	services.set(IAgentPluginManager, new SyncDescriptor(AgentPluginManager, [inputs.userDataPath]));
	services.set(IAgentSdkDownloader, new SyncDescriptor(AgentSdkDownloader));
	services.set(IClaudeAgentSdkService, new SyncDescriptor(ClaudeAgentSdkService));
	services.set(IClaudeProxyService, new SyncDescriptor(ClaudeProxyService));
	services.set(ICodexProxyService, new SyncDescriptor(CodexProxyService));
	services.set(IAgentHostOTelService, new SyncDescriptor(AgentHostOTelService, [inputs.fetchFn]));
	services.set(
		IByokLmProxyService,
		inputs.byok.kind === 'renderer' ? new SyncDescriptor(ByokLmProxyService) : new NullByokLmProxyService(),
	);
}
