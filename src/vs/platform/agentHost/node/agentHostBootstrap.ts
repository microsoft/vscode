/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { Event } from '../../../base/common/event.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ConfigurationService } from '../../configuration/common/configurationService.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ILoggerService, ILogService } from '../../log/common/log.js';
import { IPolicyService, NullPolicyService } from '../../policy/common/policy.js';
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
import { AgentHostFileMonitorService, IAgentHostFileMonitorService } from './agentHostFileMonitorService.js';
import { AgentHostGitService } from './agentHostGitService.js';
import { AgentHostOTelService } from './otel/agentHostOTelService.js';
import { AgentHostProxyResolver, IAgentHostProxyResolver } from './agentHostProxyResolver.js';
import { AgentHostRequestService } from './agentHostRequestService.js';
import { createAgentHostTelemetryService, IAgentHostTelemetryService } from './agentHostTelemetryService.js';
import { AgentService, IAgentServiceOptions } from './agentService.js';
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
import { IByokLmBridgeRegistry } from './byokLmBridgeRegistry.js';
import { ByokLmProxyService, IByokLmProxyService } from './copilot/byokLmProxyService.js';

export interface IAgentHostNetworkServices {
	readonly proxyResolver: IAgentHostProxyResolver;
	readonly requestService: IRequestService;
}

export interface ICreateAgentHostServicesOptions {
	readonly environmentService: INativeEnvironmentService;
	readonly productService: IProductService;
	readonly logService: ILogService;
	readonly loggerService: ILoggerService | undefined;
	readonly fileService: IFileService;
	readonly sessionDataService: ISessionDataService;
	readonly disposables: DisposableStore;
	readonly disableTelemetry?: boolean;
	readonly agentServiceOptions: IAgentServiceOptions;
}

export interface IAgentHostServices {
	readonly services: ServiceCollection;
	readonly instantiationService: IInstantiationService;
	readonly agentService: AgentService;
	readonly proxyResolver: IAgentHostProxyResolver;
	readonly telemetryService: IAgentHostTelemetryService;
	readonly fetchFn: typeof globalThis.fetch;
}

export interface IRegisterAgentHostProviderServicesOptions {
	readonly services: ServiceCollection;
	readonly instantiationService: IInstantiationService;
	readonly agentService: AgentService;
	readonly environmentService: INativeEnvironmentService;
	readonly fileService: IFileService;
	readonly logService: ILogService;
	readonly disposables: DisposableStore;
	readonly fetchFn: typeof globalThis.fetch;
	readonly byokBridgeRegistry: IByokLmBridgeRegistry;
	readonly byokLmProxyService?: IByokLmProxyService;
}

export interface IAgentHostProviderServices {
	readonly agentSdkDownloader: AgentSdkDownloader;
	readonly sdkDownloadProgress: Event<IAgentSdkDownloadProgress>;
}

/**
 * Register `IPolicyService`, `IConfigurationService`, `IAgentHostProxyResolver`,
 * and `IRequestService` into the agent host's DI container — the services that
 * `IAgentSdkDownloader` (and proxy-aware network diagnostics) depend on.
 *
 * Used by both entry points (`agentHostMain.ts` and `agentHostServerMain.ts`)
 * to avoid drift between them. The order of registration matters because
 * `RequestService` injects `IConfigurationService`; consumers (the downloader
 * itself, and through it `ClaudeAgentSdkService` / `CodexAgent`) must be
 * constructed AFTER this call.
 *
 * Reads the default profile's `settings.json` from `<appSettingsHome>` —
 * the same file the workbench writes user settings to. Initialization is
 * async because the settings file is read off disk.
 *
 * `NullPolicyService` matches the pattern used by sibling node-side processes
 * (server, CLI). Enterprise policy enforcement happens in the main process and
 * lands in `settings.json`; we don't re-resolve it here. `RequestService` runs
 * in `'local'` mode because the agent host runs on the user's machine.
 */
export async function registerAgentHostNetworkServices(
	services: ServiceCollection,
	fileService: IFileService,
	environmentService: INativeEnvironmentService,
	logService: ILogService,
	disposables: DisposableStore,
): Promise<IAgentHostNetworkServices> {
	const policyService = new NullPolicyService();
	services.set(IPolicyService, policyService);
	const settingsResource = joinPath(environmentService.appSettingsHome, 'settings.json');
	const configurationService = disposables.add(new ConfigurationService(settingsResource, fileService, policyService, logService));
	await configurationService.initialize();
	services.set(IConfigurationService, configurationService);
	const proxyResolver = disposables.add(new AgentHostProxyResolver(configurationService, logService));
	services.set(IAgentHostProxyResolver, proxyResolver);
	const requestService = disposables.add(new AgentHostRequestService(configurationService, environmentService, logService, proxyResolver));
	services.set(IRequestService, requestService);
	return { proxyResolver, requestService };
}

export async function createAgentHostServices(options: ICreateAgentHostServicesOptions): Promise<IAgentHostServices> {
	const { environmentService, productService, logService, loggerService, fileService, sessionDataService, disposables } = options;
	const services = new ServiceCollection(
		[INativeEnvironmentService, environmentService],
		[ILogService, logService],
		[IFileService, fileService],
		[ISessionDataService, sessionDataService],
		[IProductService, productService],
	);
	const networkServices = await registerAgentHostNetworkServices(services, fileService, environmentService, logService, disposables);
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
	try {
		const fileMonitorService = disposables.add(instantiationService.createInstance(AgentHostFileMonitorService));
		services.set(IAgentHostFileMonitorService, fileMonitorService);
		services.set(IWindowsMxcTerminalSandboxRuntime, instantiationService.createInstance(WindowsMxcTerminalSandboxRuntime));
		services.set(ISandboxHelperService, new SandboxHelperService());
		services.set(IAgentHostGitService, instantiationService.createInstance(AgentHostGitService));
		const agentService = instantiationService.createInstance(AgentService, options.agentServiceOptions, services);
		const networkDiagnosticsService = instantiationService.createInstance(NetworkDiagnosticsService);
		services.set(INetworkDiagnosticsService, networkDiagnosticsService);
		agentService.setNetworkDiagnosticsService(networkDiagnosticsService);
		return { services, instantiationService, agentService, proxyResolver, telemetryService, fetchFn };
	} catch (error) {
		instantiationService.dispose();
		throw error;
	}
}

export function registerAgentHostProviderServices(options: IRegisterAgentHostProviderServicesOptions): IAgentHostProviderServices {
	const { services, instantiationService, agentService, environmentService, fileService, logService, disposables, fetchFn } = options;
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

	services.set(IByokLmBridgeRegistry, options.byokBridgeRegistry);
	const byokLmProxyService = options.byokLmProxyService ?? disposables.add(instantiationService.createInstance(ByokLmProxyService));
	services.set(IByokLmProxyService, byokLmProxyService);

	return { agentSdkDownloader, sdkDownloadProgress: agentSdkDownloader.onDidDownloadProgress };
}
