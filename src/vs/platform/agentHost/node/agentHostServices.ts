/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../instantiation/common/descriptors.js';
import { IInstantiationService, ServiceIdentifier } from '../../instantiation/common/instantiation.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ISandboxHelperService } from '../../sandbox/common/sandboxHelperService.js';
import { SandboxHelperService } from '../../sandbox/node/sandboxHelper.js';
import { IWindowsMxcTerminalSandboxRuntime, WindowsMxcTerminalSandboxRuntime } from '../../sandbox/common/terminalSandboxMxcRuntime.js';
import { URI } from '../../../base/common/uri.js';
import { IAgentPluginManager } from '../common/agentPluginManager.js';
import { IDiffComputeService } from '../common/diffComputeService.js';
import { IAgentEditAttributionService } from '../common/fileEditAttribution.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { IAgentHostOTelService } from '../common/otel/agentHostOTelService.js';
import { AgentHostFileMonitorService, IAgentHostFileMonitorService } from './agentHostFileMonitorService.js';
import { AgentHostGitService } from './agentHostGitService.js';
import { AgentPluginManager } from './agentPluginManager.js';
import { AgentSdkDownloader, IAgentSdkDownloader } from './agentSdkDownloader.js';
import { IByokLmBridgeRegistry } from './byokLmBridgeRegistry.js';
import { ClaudeAgentSdkService, IClaudeAgentSdkService } from './claude/claudeAgentSdkService.js';
import { ByokLmProxyService, IByokLmProxyService, NullByokLmProxyService } from './copilot/byokLmProxyService.js';
import { NodeWorkerDiffComputeService } from './diffComputeService.js';
import { NetworkDiagnosticsService, INetworkDiagnosticsService } from './networkDiagnosticsService.js';
import { AgentHostOTelService } from './otel/agentHostOTelService.js';
import { AgentEditAttributionService } from './shared/agentEditAttributionService.js';
import { EditArcReporterService, IEditArcReporterService } from './shared/editArcReporter.js';
import { EditSurvivalReporterFactory, IEditSurvivalReporterFactory } from './shared/editSurvivalReporter.js';

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
			const isDescriptorResolution = current instanceof SyncDescriptor && !(instanceOrDescriptor instanceof SyncDescriptor);
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

export function registerAgentHostCoreServices(services: AgentHostServiceCollection): readonly ServiceIdentifier<unknown>[] {
	const ids: ServiceIdentifier<unknown>[] = [];
	registerService(services, ids, IAgentHostFileMonitorService, new SyncDescriptor(AgentHostFileMonitorService));
	registerService(services, ids, INetworkDiagnosticsService, new SyncDescriptor(NetworkDiagnosticsService));
	registerService(services, ids, IDiffComputeService, new SyncDescriptor(NodeWorkerDiffComputeService));
	registerService(services, ids, IAgentEditAttributionService, new SyncDescriptor(AgentEditAttributionService, [undefined, undefined]));
	registerService(services, ids, IEditSurvivalReporterFactory, new SyncDescriptor(EditSurvivalReporterFactory));
	registerService(services, ids, IEditArcReporterService, new SyncDescriptor(EditArcReporterService, [undefined]));
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
	registerService(services, ids, IAgentHostOTelService, new SyncDescriptor(AgentHostOTelService, [inputs.fetchFn]));
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
