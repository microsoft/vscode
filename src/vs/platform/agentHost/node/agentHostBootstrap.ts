/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, type IDisposable } from '../../../base/common/lifecycle.js';
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
import { ILoggerService, ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IAgentEditAttributionService } from '../common/fileEditAttribution.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import type { IAgent } from '../common/agent.js';
import { IAgentHostProxyResolver } from './agentHostProxyResolver.js';
import { createAgentHostTelemetryService, IAgentHostTelemetryService } from './agentHostTelemetryService.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostCompletions } from './agentHostCompletions.js';
import { IAgentHostCustomizationEnablementService } from './agentHostCustomizationEnablementService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { AgentService, IAgentServiceOptions } from './agentService.js';
import { createAgentServiceComposition } from './agentServiceComposition.js';
import { createAgentServiceFoundation } from './agentServiceFoundation.js';
import { AgentHostServiceCollection, instantiateAgentHostServices, registerAgentHostCoreServices, registerAgentHostHostServices } from './agentHostServices.js';
import { INetworkDiagnosticsService } from './networkDiagnosticsService.js';
import { IAgentHostWorktreeIsolation, WorktreeIsolation } from './shared/worktreeIsolation.js';
import { IAgentSdkDownloader, type IAgentSdkDownloadProgress } from './agentSdkDownloader.js';
import { ClaudeProxyService, IClaudeProxyService } from './claude/claudeProxyService.js';
import { CodexProxyService, ICodexProxyService } from './codex/codexProxyService.js';
import { IByokLmBridgeRegistry, NullByokLmBridgeRegistry } from './byokLmBridgeRegistry.js';
import { registerPendingEditContentProvider } from './copilot/pendingEditContentStore.js';
import { SessionDataService } from './sessionDataService.js';
import { IAgentCustomizationSettingsRegistration } from '../common/agentCustomizationSettings.js';
import { AgentHostLaunchKind } from '../common/agentHostTelemetry.js';

export interface ICreateAgentHostRuntimeOptions {
	readonly environmentService: INativeEnvironmentService;
	readonly productService: IProductService;
	readonly logService: ILogService;
	readonly loggerService: ILoggerService | undefined;
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

export interface IAgentHostRuntime extends IDisposable {
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
	readonly agentSdkDownloader: IAgentSdkDownloader;
	readonly sdkDownloadProgress: Event<IAgentSdkDownloadProgress>;
}

class AgentHostRuntime extends Disposable implements IAgentHostRuntime {
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
	readonly agentSdkDownloader: IAgentSdkDownloader;
	readonly sdkDownloadProgress: Event<IAgentSdkDownloadProgress>;

	constructor(
		runtime: Omit<IAgentHostRuntime, 'dispose'>,
		infrastructure: DisposableStore,
	) {
		super();
		this.instantiationService = runtime.instantiationService;
		this.agentService = runtime.agentService;
		this.configurationService = runtime.configurationService;
		this.stateManager = runtime.stateManager;
		this.customizationEnablementService = runtime.customizationEnablementService;
		this.completions = runtime.completions;
		this.agents = runtime.agents;
		this.onDidStartTurn = runtime.onDidStartTurn;
		this.fileService = runtime.fileService;
		this.sessionDataService = runtime.sessionDataService;
		this.proxyResolver = runtime.proxyResolver;
		this.telemetryService = runtime.telemetryService;
		this.agentSdkDownloader = runtime.agentSdkDownloader;
		this.sdkDownloadProgress = runtime.sdkDownloadProgress;
		this._register(runtime.agentService);
		this._register(infrastructure);
		this._register(runtime.instantiationService);
	}
}

/**
 * Creates the complete Agent Host runtime.
 *
 * Add services directly to this bootstrap only when they require runtime or
 * environment values, asynchronous construction, an entry-point-selected
 * implementation, or must exist before the instantiation service. Shared,
 * synchronous session-orchestration services belong in
 * {@link createAgentServiceComposition}; process listeners, transports,
 * providers, and schedulers belong in the entry point that activates them.
 */
export async function createAgentHostRuntime(options: ICreateAgentHostRuntimeOptions): Promise<IAgentHostRuntime> {
	const { environmentService, productService, logService, loggerService } = options;
	const infrastructure = new DisposableStore();
	let instantiationService: InstantiationService | undefined;
	let agentService: AgentService | undefined;
	try {
		const fileService = infrastructure.add(new FileService(logService));
		infrastructure.add(fileService.registerProvider(Schemas.file, infrastructure.add(new DiskFileSystemProvider(logService))));
		infrastructure.add(registerPendingEditContentProvider(fileService));
		const sessionDataService = new SessionDataService(URI.file(environmentService.userDataPath), fileService, logService);
		const services = new AgentHostServiceCollection(
			[INativeEnvironmentService, environmentService],
			[ILogService, logService],
			[IFileService, fileService],
			[ISessionDataService, sessionDataService],
			[IProductService, productService],
		);
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
		const foundation = createAgentServiceFoundation({
			services,
			owned: infrastructure,
			logService,
			productService,
			rootConfigResource: agentServiceOptions.rootConfigResource,
			providerConfigurations: agentServiceOptions.providerConfigurations,
			transientProxyConfiguration: options.transientProxyConfiguration,
		});
		const { proxyResolver, fetchFn } = foundation;
		const telemetryService = await createAgentHostTelemetryService({
			environmentService,
			productService,
			fileService,
			loggerService,
			logService,
			disposables: infrastructure,
			disableTelemetry: options.disableTelemetry,
			fetchFn,
			requestService: foundation.requestService,
		});
		services.set(ITelemetryService, telemetryService);
		const byokBridgeRegistry = options.byok.kind === 'renderer' ? options.byok.bridgeRegistry : new NullByokLmBridgeRegistry();
		services.set(IByokLmBridgeRegistry, byokBridgeRegistry);
		const coreServiceIds = registerAgentHostCoreServices(services);
		const hostServiceIds = registerAgentHostHostServices(services, {
			userDataPath: URI.file(environmentService.userDataPath),
			fetchFn,
			byok: options.byok,
		});
		instantiationService = new InstantiationService(services, /*strict*/ true);
		instantiateAgentHostServices(instantiationService, [...coreServiceIds, ...hostServiceIds]);
		const agentServiceComposition = createAgentServiceComposition(agentServiceOptions, services, instantiationService, fetchFn, logService, sessionDataService, foundation);
		agentService = agentServiceComposition.agentService;
		const { configurationService } = agentServiceComposition;
		const networkDiagnosticsService = instantiationService.invokeFunction(accessor => accessor.get(INetworkDiagnosticsService));
		agentService.setNetworkDiagnosticsService(networkDiagnosticsService);
		const editAttributionService = instantiationService.invokeFunction(accessor => accessor.get(IAgentEditAttributionService));
		agentService.setEditAttributionService(editAttributionService);

		const worktreeIsolation = infrastructure.add(instantiationService.createInstance(WorktreeIsolation, undefined));
		services.set(IAgentHostWorktreeIsolation, worktreeIsolation);
		agentService.setWorktreeIsolation(worktreeIsolation);

		const agentSdkDownloader = instantiationService.invokeFunction(accessor => accessor.get(IAgentSdkDownloader));
		services.set(IClaudeProxyService, infrastructure.add(instantiationService.createInstance(ClaudeProxyService)));
		services.set(ICodexProxyService, infrastructure.add(instantiationService.createInstance(CodexProxyService)));

		return new AgentHostRuntime({
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
		}, infrastructure);
	} catch (error) {
		agentService?.dispose();
		infrastructure.dispose();
		instantiationService?.dispose();
		throw error;
	}
}
