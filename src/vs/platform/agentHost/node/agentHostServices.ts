/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../instantiation/common/descriptors.js';
import { IInstantiationService, ServiceIdentifier } from '../../instantiation/common/instantiation.js';
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

/**
 * The process-local Agent Host service collection. Sealing is opt-in while the
 * existing imperative registrations migrate to descriptors.
 */
export class AgentHostServiceCollection extends ServiceCollection {
	private sealed = false;

	seal(): void {
		this.sealed = true;
	}

	override set<T>(id: ServiceIdentifier<T>, instanceOrDescriptor: T | SyncDescriptor<T>): T | SyncDescriptor<T> {
		if (this.sealed) {
			const current = this.get(id);
			const isDescriptorResolution = current instanceof SyncDescriptor && instanceOrDescriptor instanceof current.ctor;
			if (!isDescriptorResolution) {
				throw new Error(`Agent Host service collection is sealed: ${id}`);
			}
		}
		return super.set(id, instanceOrDescriptor);
	}
}

/**
 * Registers shared Agent Host services. This starts empty so descriptor
 * registrations can migrate atomically with their imperative construction.
 */
function registerService<T>(
	services: AgentHostServiceCollection,
	ids: ServiceIdentifier<unknown>[],
	id: ServiceIdentifier<T>,
	value: T | SyncDescriptor<T>,
): void {
	if (services.has(id)) {
		return;
	}
	services.set(id, value);
	ids.push(id);
}

export interface IAgentHostCoreServiceInputs {
	readonly storageResource: URI | undefined;
	readonly fetchFn: typeof globalThis.fetch;
	readonly gitHubServiceOptions: GitHubServiceOptions;
	readonly copilotApiService?: ICopilotApiService;
}

export function registerAgentHostCoreServices(services: AgentHostServiceCollection, inputs: IAgentHostCoreServiceInputs): readonly ServiceIdentifier<unknown>[] {
	const ids: ServiceIdentifier<unknown>[] = [];
	registerService(services, ids, IAgentHostFileMonitorService, new SyncDescriptor(AgentHostFileMonitorService));
	registerService(services, ids, INetworkDiagnosticsService, new SyncDescriptor(NetworkDiagnosticsService));
	registerService(services, ids, IDiffComputeService, new SyncDescriptor(NodeWorkerDiffComputeService));
	registerService(services, ids, IAgentEditAttributionService, new SyncDescriptor(AgentEditAttributionService, [undefined, undefined]));
	registerService(services, ids, IEditSurvivalReporterFactory, new SyncDescriptor(EditSurvivalReporterFactory));
	registerService(services, ids, IEditArcReporterService, new SyncDescriptor(EditArcReporterService, [undefined]));
	registerService(services, ids, IAgentHostStorageService, new SyncDescriptor(AgentHostStorageService, [inputs.storageResource]));
	registerService(services, ids, IAgentHostManagedSettingsService, new SyncDescriptor(AgentHostManagedSettingsService));
	registerService(services, ids, IAgentHostOctoKitService, new SyncDescriptor(AgentHostOctoKitService, [inputs.fetchFn]));
	registerService(services, ids, IGitHubService, new SyncDescriptor(GitHubService, [inputs.gitHubServiceOptions]));
	registerService(services, ids, ICopilotApiService, inputs.copilotApiService ?? new SyncDescriptor(CopilotApiService, [inputs.fetchFn]));
	registerService(services, ids, IAgentHostCustomizationEnablementService, new SyncDescriptor(AgentHostCustomizationEnablementService));
	registerService(services, ids, IAgentHostGitStateService, new SyncDescriptor(AgentHostGitStateService));
	registerService(services, ids, IAgentHostCheckpointService, new SyncDescriptor(AgentHostCheckpointService));
	registerService(services, ids, IAgentHostPromptCache, new SyncDescriptor(AgentHostPromptCache));
	registerService(services, ids, IAgentHostSessionTitleSignal, new SyncDescriptor(AgentHostSessionTitleSignal));
	registerService(services, ids, IAgentHostChangesetSubscriptionService, new SyncDescriptor(AgentHostChangesetSubscriptionService));
	registerService(services, ids, IAgentHostChangesetOperationService, new SyncDescriptor(AgentHostChangesetOperationService));
	registerService(services, ids, IAgentHostReviewService, new SyncDescriptor(AgentHostReviewService));
	registerService(services, ids, IAgentHostChangesetService, new SyncDescriptor(AgentHostChangesetService));
	registerService(services, ids, IAgentHostCompletions, new SyncDescriptor(AgentHostCompletions));
	registerService(services, ids, IAgentHostTerminalManager, new SyncDescriptor(AgentHostTerminalManager));
	return ids;
}

export interface IAgentHostHostServiceInputs {
	readonly userDataPath: URI;
	readonly fetchFn: typeof globalThis.fetch;
	readonly byok: { readonly kind: 'renderer'; readonly bridgeRegistry: IByokLmBridgeRegistry } | { readonly kind: 'unavailable' };
}

export function registerAgentHostHostServices(services: AgentHostServiceCollection, inputs: IAgentHostHostServiceInputs): readonly ServiceIdentifier<unknown>[] {
	const ids: ServiceIdentifier<unknown>[] = [];
	registerService(services, ids, IWindowsMxcTerminalSandboxRuntime, new SyncDescriptor(WindowsMxcTerminalSandboxRuntime));
	registerService(services, ids, ISandboxHelperService, new SyncDescriptor(SandboxHelperService));
	registerService(services, ids, IAgentHostGitService, new SyncDescriptor(AgentHostGitService));
	registerService(services, ids, IAgentPluginManager, new SyncDescriptor(AgentPluginManager, [inputs.userDataPath]));
	registerService(services, ids, IAgentSdkDownloader, new SyncDescriptor(AgentSdkDownloader));
	registerService(services, ids, IClaudeAgentSdkService, new SyncDescriptor(ClaudeAgentSdkService));
	registerService(services, ids, IClaudeProxyService, new SyncDescriptor(ClaudeProxyService));
	registerService(services, ids, ICodexProxyService, new SyncDescriptor(CodexProxyService));
	registerService(services, ids, IAgentHostOTelService, new SyncDescriptor(AgentHostOTelService, [inputs.fetchFn]));
	registerService(services, ids, IAgentHostWorktreeIsolation, new SyncDescriptor(WorktreeIsolation, [undefined]));
	registerService(
		services,
		ids,
		IByokLmProxyService,
		inputs.byok.kind === 'renderer' ? new SyncDescriptor(ByokLmProxyService) : new NullByokLmProxyService(),
	);
	return ids;
}

export function instantiateAgentHostServices(instantiationService: IInstantiationService, ids: readonly ServiceIdentifier<unknown>[]): void {
	instantiationService.invokeFunction(accessor => {
		for (const id of ids) {
			accessor.get(id);
		}
	});
}
