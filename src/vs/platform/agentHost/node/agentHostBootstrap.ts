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
import { IAgentService } from '../common/agentService.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import type { IAgent } from '../common/agent.js';
import { AgentHostActiveAgentTitleGenerationConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { createAgentHostTelemetryService } from './agentHostTelemetryService.js';
import { AgentService, IAgentServiceOptions } from './agentService.js';
import { createAgentServiceComposition } from './agentServiceComposition.js';
import { activateAgentHostContributions } from './agentHostContributions.js';
import { createAgentServiceFoundation } from './agentServiceFoundation.js';
import { registerAgentHostCoreServices, registerAgentHostHostServices } from './agentHostServices.js';
import { StrictServiceCollection } from '../../instantiation/common/strictServiceCollection.js';
import { IAgentSdkDownloader, type IAgentSdkDownloadProgress } from './agentSdkDownloader.js';
import { IByokLmBridgeRegistry, NullByokLmBridgeRegistry } from './byokLmBridgeRegistry.js';
import { registerPendingEditContentProvider } from './copilot/pendingEditContentStore.js';
import { SessionDataService } from './sessionDataService.js';
import { IAgentCustomizationSettingsRegistration } from '../common/agentCustomizationSettings.js';
import { AgentHostLaunchKind } from '../common/agentHostTelemetry.js';
import { AgentHostClientConnectionService, IAgentHostClientConnectionService } from './agentHostClientConnectionService.js';
import { AgentHostSessionTitleController, IAgentHostSessionTitleController } from './agentHostSessionTitleController.js';
import { AgentHostLocalTurns, IAgentHostLocalTurns } from './agentHostLocalTurns.js';
import { AgentHostLocalCommands, IAgentHostLocalCommands } from './localCommands/localChatCommand.js';
import { IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import { ICopilotApiService } from './shared/copilotApiService.js';

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
	readonly agents: IObservable<readonly IAgent[]>;
	readonly onDidStartTurn: Event<string>;
	readonly sdkDownloadProgress: Event<IAgentSdkDownloadProgress>;
}

class AgentHostRuntime extends Disposable implements IAgentHostRuntime {
	readonly instantiationService: IInstantiationService;
	readonly agentService: AgentService;
	readonly agents: IObservable<readonly IAgent[]>;
	readonly onDidStartTurn: Event<string>;
	readonly sdkDownloadProgress: Event<IAgentSdkDownloadProgress>;

	constructor(
		runtime: Omit<IAgentHostRuntime, 'dispose'>,
		infrastructure: DisposableStore,
	) {
		super();
		this.instantiationService = runtime.instantiationService;
		this.agentService = runtime.agentService;
		this.agents = runtime.agents;
		this.onDidStartTurn = runtime.onDidStartTurn;
		this.sdkDownloadProgress = runtime.sdkDownloadProgress;
		this._register(runtime.agentService);
		this._register(runtime.instantiationService);
		this._register(infrastructure);
	}
}

/**
 * Creates the complete Agent Host runtime.
 *
 * Add services directly to this bootstrap only when they require runtime or
 * environment values, asynchronous construction, an entry-point-selected
 * implementation, or must exist before the instantiation service. Shared
 * synchronous services belong in `agentHostServices.ts`; callback-bound roots
 * belong in {@link createAgentServiceComposition}; process listeners,
 * transports, providers, and schedulers belong in the activating entry point.
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
		const services = new StrictServiceCollection(
			[INativeEnvironmentService, environmentService],
			[ILogService, logService],
			[IFileService, fileService],
			[ISessionDataService, sessionDataService],
			[IProductService, productService],
		);
		services.set(IAgentHostClientConnectionService, infrastructure.add(new AgentHostClientConnectionService()));
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
		const { fetchFn } = foundation;
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
		registerAgentHostCoreServices(services, {
			storageResource: agentServiceOptions.storageResource,
			fetchFn,
			gitHubServiceOptions: foundation.gitHubServiceOptions,
		});
		registerAgentHostHostServices(services, {
			userDataPath: URI.file(environmentService.userDataPath),
			fetchFn,
			byok: options.byok,
		});
		instantiationService = new InstantiationService(services, /*strict*/ true);
		const octoKitService = instantiationService.invokeFunction(accessor => accessor.get(IAgentHostOctoKitService));
		const copilotApiService = instantiationService.invokeFunction(accessor => accessor.get(ICopilotApiService));
		services.set(IAgentHostSessionTitleController, infrastructure.add(instantiationService.createInstance(AgentHostSessionTitleController, foundation.stateManager, {
			sessionDataService,
			getGitHubCopilotToken: () => {
				const resource = foundation.gitHubEndpointService.getCopilotResource();
				return foundation.authenticationService.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported });
			},
			getGitHubToken: () => {
				const resource = foundation.gitHubEndpointService.getRepoResource();
				return foundation.authenticationService.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported });
			},
			getGitHubHost: () => foundation.gitHubEndpointService.getEnterpriseHost() ?? 'github.com',
			octoKitService,
			copilotApiService,
			isActiveAgentTitleGenerationEnabled: () => foundation.configurationService.getRootValue(platformRootSchema, AgentHostActiveAgentTitleGenerationConfigKey) === true,
		})));
		const localTurns = new AgentHostLocalTurns(sessionDataService, logService);
		services.set(IAgentHostLocalTurns, localTurns);
		services.set(IAgentHostLocalCommands, infrastructure.add(instantiationService.createInstance(AgentHostLocalCommands)));
		const agentServiceComposition = instantiationService.invokeFunction(accessor => createAgentServiceComposition(
			agentServiceOptions,
			accessor,
			instantiationService!,
			logService,
			sessionDataService,
			foundation,
			localTurns,
		));
		agentService = agentServiceComposition.agentService;
		services.set(IAgentService, agentService);
		// Freeze the migrate-legacy gate at host startup, before a setting toggled
		// without a full restart can be live-propagated into the shared host.
		agentService.primeMigrateLegacyGate();
		agentServiceComposition.setContributions(instantiationService.invokeFunction(accessor => activateAgentHostContributions(accessor, instantiationService!)));

		const agentSdkDownloader = instantiationService.invokeFunction(accessor => accessor.get(IAgentSdkDownloader));

		return new AgentHostRuntime({
			instantiationService,
			agentService,
			agents: agentServiceComposition.agents,
			onDidStartTurn: agentServiceComposition.onDidStartTurn,
			sdkDownloadProgress: agentSdkDownloader.onDidDownloadProgress,
		}, infrastructure);
	} catch (error) {
		agentService?.dispose();
		instantiationService?.dispose();
		infrastructure.dispose();
		throw error;
	}
}
