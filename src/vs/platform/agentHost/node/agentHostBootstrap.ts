/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import type { Event } from '../../../base/common/event.js';
import type { IObservable } from '../../../base/common/observable.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { Schemas } from '../../../base/common/network.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { FileService } from '../../files/common/fileService.js';
import { DiskFileSystemProvider } from '../../files/node/diskFileSystemProvider.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ILoggerService, ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IRequestService } from '../../request/common/request.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { ISandboxHelperService } from '../../sandbox/common/sandboxHelperService.js';
import { SandboxHelperService } from '../../sandbox/node/sandboxHelper.js';
import { IWindowsMxcTerminalSandboxRuntime, WindowsMxcTerminalSandboxRuntime } from '../../sandbox/common/terminalSandboxMxcRuntime.js';
import { IAgentPluginManager } from '../common/agentPluginManager.js';
import { IDiffComputeService } from '../common/diffComputeService.js';
import { IAgentEditAttributionService } from '../common/fileEditAttribution.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { IAgentHostOTelService } from '../common/otel/agentHostOTelService.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import type { IAgent } from '../common/agent.js';
import { AgentHostFileMonitorService, IAgentHostFileMonitorService } from './agentHostFileMonitorService.js';
import { AgentHostGitService } from './agentHostGitService.js';
import { AgentHostOTelService } from './otel/agentHostOTelService.js';
import { AgentHostProxyResolver, IAgentHostProxyResolver } from './agentHostProxyResolver.js';
import { AgentHostRequestService } from './agentHostRequestService.js';
import { createAgentHostTelemetryService, IAgentHostTelemetryService } from './agentHostTelemetryService.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostCompletions } from './agentHostCompletions.js';
import { IAgentHostCustomizationEnablementService } from './agentHostCustomizationEnablementService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { AgentService, IAgentServiceOptions } from './agentService.js';
import { createAgentServiceComposition } from './agentServiceComposition.js';
import { INetworkDiagnosticsService, NetworkDiagnosticsService } from './networkDiagnosticsService.js';
import { AgentPluginManager } from './agentPluginManager.js';
import { NodeWorkerDiffComputeService } from './diffComputeService.js';
import { AgentEditAttributionService } from './shared/agentEditAttributionService.js';
import { EditArcReporterService, IEditArcReporterService } from './shared/editArcReporter.js';
import { EditSurvivalReporterFactory, IEditSurvivalReporterFactory } from './shared/editSurvivalReporter.js';
import { IAgentHostWorktreeIsolation, WorktreeIsolation } from './shared/worktreeIsolation.js';
import { AgentSdkDownloader, IAgentSdkDownloader, type IAgentSdkDownloadProgress } from './agentSdkDownloader.js';
import { IClaudeAgentSdkService, ClaudeAgentSdkService } from './claude/claudeAgentSdkService.js';
import { ClaudeProxyService, IClaudeProxyService } from './claude/claudeProxyService.js';
import { CodexProxyService, ICodexProxyService } from './codex/codexProxyService.js';
import { IByokLmBridgeRegistry, NullByokLmBridgeRegistry } from './byokLmBridgeRegistry.js';
import { ByokLmProxyService, IByokLmProxyService, NullByokLmProxyService } from './copilot/byokLmProxyService.js';
import { registerPendingEditContentProvider } from './copilot/pendingEditContentStore.js';
import { SessionDataService } from './sessionDataService.js';
import { IAgentCustomizationSettingsRegistration } from '../common/agentCustomizationSettings.js';
import { AgentHostLaunchKind } from '../common/agentHostTelemetry.js';

export interface IAgentHostNetworkServices {
	readonly proxyResolver: IAgentHostProxyResolver;
	readonly requestService: IRequestService;
}

export interface ICreateAgentHostRuntimeOptions {
	readonly environmentService: INativeEnvironmentService;
	readonly productService: IProductService;
	readonly logService: ILogService;
	readonly loggerService: ILoggerService | undefined;
	readonly disposables: DisposableStore;
	readonly disableTelemetry?: boolean;
	readonly transientProxyConfiguration: boolean;
	readonly hostLaunchKind: AgentHostLaunchKind;
	readonly providerConfigurations: readonly IAgentCustomizationSettingsRegistration[];
	/**
	 * The utility-process host has a renderer bridge; standalone hosts use the
	 * unavailable variant but still register the same complete service graph.
	 */
	readonly byok: { readonly kind: 'renderer'; readonly bridgeRegistry: IByokLmBridgeRegistry } | { readonly kind: 'unavailable' };
}

export interface IAgentHostRuntime {
	readonly instantiationService: IInstantiationService;
	readonly agentService: AgentService;
	readonly configurationService: IAgentConfigurationService;
	readonly stateManager: AgentHostStateManager;
	readonly customizationEnablementService: IAgentHostCustomizationEnablementService;
	readonly completions: IAgentHostCompletions;
	readonly agents: IObservable<readonly IAgent[]>;
	readonly onDidStartTurn: Event<string>;
	readonly fileService: IFileService;
	readonly sessionDataService: ISessionDataService;
	readonly proxyResolver: IAgentHostProxyResolver;
	readonly telemetryService: IAgentHostTelemetryService;
	readonly agentSdkDownloader: AgentSdkDownloader;
	readonly sdkDownloadProgress: Event<IAgentSdkDownloadProgress>;
}

/**
 * Register `IAgentHostProxyResolver` and `IRequestService` into the agent host's
 * DI container — the services that `IAgentSdkDownloader` (and proxy-aware
 * network diagnostics) depend on.
 *
 * Used by both entry points (`agentHostMain.ts` and `agentHostServerMain.ts`)
 * to avoid drift between them. The order of registration matters because
 * Consumers (the downloader itself, and through it `ClaudeAgentSdkService` /
 * `CodexAgent`) must be constructed AFTER this call. The resolver is bound to
 * `IAgentConfigurationService` after `AgentService` creates the host-owned
 * configuration service.
 */
export function registerAgentHostNetworkServices(
	services: ServiceCollection,
	logService: ILogService,
	disposables: DisposableStore,
): IAgentHostNetworkServices {
	const proxyResolver = disposables.add(new AgentHostProxyResolver(logService));
	services.set(IAgentHostProxyResolver, proxyResolver);
	const requestService = disposables.add(new AgentHostRequestService(logService, proxyResolver));
	services.set(IRequestService, requestService);
	return { proxyResolver, requestService };
}

export async function createAgentHostRuntime(options: ICreateAgentHostRuntimeOptions): Promise<IAgentHostRuntime> {
	const { environmentService, productService, logService, loggerService, disposables } = options;
	const fileService = disposables.add(new FileService(logService));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
	disposables.add(registerPendingEditContentProvider(fileService));
	const sessionDataService = new SessionDataService(URI.file(environmentService.userDataPath), fileService, logService);
	const services = new ServiceCollection(
		[INativeEnvironmentService, environmentService],
		[ILogService, logService],
		[IFileService, fileService],
		[ISessionDataService, sessionDataService],
		[IProductService, productService],
	);
	const networkServices = registerAgentHostNetworkServices(services, logService, disposables);
	const proxyResolver = networkServices.proxyResolver;
	const fetchFn = proxyResolver.fetch.bind(proxyResolver);
	const telemetryService = await createAgentHostTelemetryService({
		environmentService,
		productService,
		fileService,
		loggerService,
		logService,
		disposables,
		disableTelemetry: options.disableTelemetry,
		fetchFn,
		requestService: networkServices.requestService,
	});
	services.set(ITelemetryService, telemetryService);
	const instantiationService = new InstantiationService(services, /*strict*/ true);
	let agentService: AgentService | undefined;
	try {
		const fileMonitorService = disposables.add(instantiationService.createInstance(AgentHostFileMonitorService));
		services.set(IAgentHostFileMonitorService, fileMonitorService);
		services.set(IWindowsMxcTerminalSandboxRuntime, instantiationService.createInstance(WindowsMxcTerminalSandboxRuntime));
		services.set(ISandboxHelperService, new SandboxHelperService());
		services.set(IAgentHostGitService, instantiationService.createInstance(AgentHostGitService));
		const agentServiceOptions: IAgentServiceOptions = {
			rootConfigResource: joinPath(environmentService.appSettingsHome, 'globalStorage', 'agent-host-config.json'),
			providerConfigurations: options.providerConfigurations,
			hostLaunchKind: options.hostLaunchKind,
			storageResource: joinPath(environmentService.appSettingsHome, 'globalStorage', 'agent-host-storage.json'),
			debugLogsEnvironment: {
				logsHome: environmentService.logsHome,
				tmpDir: environmentService.tmpDir,
			},
		};
		const agentServiceComposition = createAgentServiceComposition(agentServiceOptions, services, instantiationService, fetchFn, logService, productService, sessionDataService);
		agentService = agentServiceComposition.agentService;
		const { configurationService } = agentServiceComposition;
		proxyResolver.bindConfigurationService(configurationService, options.transientProxyConfiguration);
		const networkDiagnosticsService = instantiationService.createInstance(NetworkDiagnosticsService);
		services.set(INetworkDiagnosticsService, networkDiagnosticsService);
		agentService.setNetworkDiagnosticsService(networkDiagnosticsService);
		services.set(IAgentPluginManager, new AgentPluginManager(URI.file(environmentService.userDataPath), fileService, logService));
		services.set(IDiffComputeService, disposables.add(instantiationService.createInstance(NodeWorkerDiffComputeService)));
		const editAttributionService = disposables.add(instantiationService.createInstance(AgentEditAttributionService, undefined, undefined));
		services.set(IAgentEditAttributionService, editAttributionService);
		agentService.setEditAttributionService(editAttributionService);
		services.set(IEditSurvivalReporterFactory, instantiationService.createInstance(EditSurvivalReporterFactory));
		services.set(IEditArcReporterService, disposables.add(instantiationService.createInstance(EditArcReporterService, undefined)));

		const worktreeIsolation = disposables.add(instantiationService.createInstance(WorktreeIsolation, undefined));
		services.set(IAgentHostWorktreeIsolation, worktreeIsolation);
		agentService.setWorktreeIsolation(worktreeIsolation);

		const agentSdkDownloader = disposables.add(instantiationService.createInstance(AgentSdkDownloader));
		services.set(IAgentSdkDownloader, agentSdkDownloader);
		services.set(IClaudeProxyService, disposables.add(instantiationService.createInstance(ClaudeProxyService)));
		services.set(IClaudeAgentSdkService, instantiationService.createInstance(ClaudeAgentSdkService));
		services.set(ICodexProxyService, disposables.add(instantiationService.createInstance(CodexProxyService)));
		services.set(IAgentHostOTelService, disposables.add(instantiationService.createInstance(AgentHostOTelService, fetchFn)));
		const byokBridgeRegistry = options.byok.kind === 'renderer' ? options.byok.bridgeRegistry : new NullByokLmBridgeRegistry();
		services.set(IByokLmBridgeRegistry, byokBridgeRegistry);
		const byokLmProxyService: IByokLmProxyService = options.byok.kind === 'renderer'
			? disposables.add(instantiationService.createInstance(ByokLmProxyService))
			: new NullByokLmProxyService();
		services.set(IByokLmProxyService, byokLmProxyService);

		return {
			instantiationService,
			agentService,
			configurationService,
			stateManager: agentServiceComposition.stateManager,
			customizationEnablementService: agentServiceComposition.customizationEnablementService,
			completions: agentServiceComposition.completions,
			agents: agentServiceComposition.agents,
			onDidStartTurn: agentServiceComposition.onDidStartTurn,
			fileService,
			sessionDataService,
			proxyResolver,
			telemetryService,
			agentSdkDownloader,
			sdkDownloadProgress: agentSdkDownloader.onDidDownloadProgress,
		};
	} catch (error) {
		agentService?.dispose();
		instantiationService.dispose();
		throw error;
	}
}
