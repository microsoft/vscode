/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { StrictServiceCollection } from '../../../instantiation/common/strictServiceCollection.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { type IAgentCustomizationSettingsRegistration } from '../../common/agentCustomizationSettings.js';
import { AgentHostActiveAgentTitleGenerationConfigKey, platformRootSchema } from '../../common/agentHostSchema.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { IAgentEditAttributionService, NullAgentEditAttributionService } from '../../common/fileEditAttribution.js';
import { AgentHostLaunchKind } from '../../common/agentHostTelemetry.js';
import { IAgentService } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { IAgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostFileMonitorService, IAgentHostFileMonitorService } from '../../node/agentHostFileMonitorService.js';
import { IAgentHostProxyResolver } from '../../node/agentHostProxyResolver.js';
import { AgentService } from '../../node/agentService.js';
import { createAgentServiceComposition, type IAgentServiceComposition } from '../../node/agentServiceComposition.js';
import { activateAgentHostContributions } from '../../node/agentHostContributions.js';
import { createAgentServiceFoundation } from '../../node/agentServiceFoundation.js';
import { registerAgentHostCoreServices } from '../../node/agentHostServices.js';
import { ICopilotApiService } from '../../node/shared/copilotApiService.js';
import { AgentHostClientConnectionService, IAgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostProviderLocator, IAgentHostProviderLocator } from '../../node/agentHostProviderLocator.js';
import { AgentHostSessionTitleController, IAgentHostSessionTitleController } from '../../node/agentHostSessionTitleController.js';
import { AgentHostLocalTurns, IAgentHostLocalTurns } from '../../node/agentHostLocalTurns.js';
import { AgentHostLocalCommands, IAgentHostLocalCommands } from '../../node/localCommands/localChatCommand.js';
import { IAgentHostOctoKitService } from '../../node/shared/agentHostOctoKitService.js';
import { IAgentHostWorktreeIsolation, NullAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';

const compositions = new WeakMap<AgentService, IAgentServiceComposition>();
const worktreeIsolations = new WeakMap<AgentService, MutableTestAgentHostWorktreeIsolation>();

class MutableTestAgentHostWorktreeIsolation extends Disposable {
	private _delegate: IAgentHostWorktreeIsolation = new NullAgentHostWorktreeIsolation();
	private readonly _onDidChangeWorkingDirectoryPending = this._register(new Emitter<string>());
	private readonly _delegateListener = this._register(new MutableDisposable());
	private delegateSet = false;
	readonly service: IAgentHostWorktreeIsolation;

	constructor() {
		super();
		this.service = new Proxy(this._delegate, {
			get: (_target, property) => {
				if (property === 'onDidChangeWorkingDirectoryPending') {
					return this._onDidChangeWorkingDirectoryPending.event;
				}
				const value = Reflect.get(this._delegate, property, this._delegate);
				return typeof value === 'function' ? value.bind(this._delegate) : value;
			},
		});
	}

	setDelegate(delegate: IAgentHostWorktreeIsolation): void {
		if (this.delegateSet) {
			throw new Error('Agent Host worktree isolation test delegate has already been set');
		}
		this.delegateSet = true;
		this._delegate = delegate;
		this._delegateListener.value = delegate.onDidChangeWorkingDirectoryPending(sessionId => this._onDidChangeWorkingDirectoryPending.fire(sessionId));
	}
}

export function getTestAgentServiceComposition(agentService: AgentService): IAgentServiceComposition {
	const composition = compositions.get(agentService);
	if (!composition) {
		throw new Error('AgentService was not created by createTestAgentService');
	}
	return composition;
}

export function getTestAgentStateManager(agentService: AgentService): AgentHostStateManager {
	return getTestAgentServiceComposition(agentService).stateManager;
}

export function getTestAgentHostWorktreeIsolation(agentService: AgentService): IAgentHostWorktreeIsolation {
	const worktreeIsolation = worktreeIsolations.get(agentService);
	if (!worktreeIsolation) {
		throw new Error('AgentService was not created by createTestAgentService');
	}
	return worktreeIsolation.service;
}

export function setTestAgentHostWorktreeIsolation(agentService: AgentService, worktreeIsolation: IAgentHostWorktreeIsolation): void {
	const mutableWorktreeIsolation = worktreeIsolations.get(agentService);
	if (!mutableWorktreeIsolation) {
		throw new Error('AgentService was not created by createTestAgentService');
	}
	mutableWorktreeIsolation.setDelegate(worktreeIsolation);
}

export function createTestAgentHostWorktreeIsolation(overrides: Partial<IAgentHostWorktreeIsolation>): IAgentHostWorktreeIsolation {
	return new Proxy(new NullAgentHostWorktreeIsolation(), {
		get: (target, property) => {
			const source = Object.hasOwn(overrides, property) ? overrides : target;
			const value = Reflect.get(source, property, source);
			return typeof value === 'function' ? value.bind(source) : value;
		},
	});
}

export function createTestAgentHostProxyResolver(fetchFn: typeof globalThis.fetch = globalThis.fetch): IAgentHostProxyResolver {
	return {
		_serviceBrand: undefined,
		onDidRegisterConnection: Event.None,
		onDidChangeConfiguration: Event.None,
		register: () => Disposable.None,
		getConfigurationValue: () => undefined,
		resolveProxy: async () => undefined,
		fetch: fetchFn,
	};
}

export function createTestAgentService(
	logService: ILogService,
	fileService: IFileService,
	sessionDataService: ISessionDataService,
	productService: IProductService,
	gitService: IAgentHostGitService,
	rootConfigResource?: URI,
	telemetryService: ITelemetryService = NullTelemetryService,
	fileMonitorService?: IAgentHostFileMonitorService,
	copilotApiService?: ICopilotApiService,
	fetchFn: typeof globalThis.fetch = globalThis.fetch,
	providerConfigurations: readonly IAgentCustomizationSettingsRegistration[] = [],
	hostLaunchKind = AgentHostLaunchKind.Unknown,
	storageResource?: URI,
	orchestratorDatabase?: IAgentHostDatabase,
	sessionResidencyLimit?: number,
	sessionReleaseRetryMs?: number,
): AgentService {
	const effectiveFileMonitorService = fileMonitorService ?? new AgentHostFileMonitorService(fileService, logService);
	const clientConnectionService = new AgentHostClientConnectionService();
	const proxyResolver = createTestAgentHostProxyResolver(fetchFn);
	const foundationDisposables = new DisposableStore();
	const worktreeIsolation = foundationDisposables.add(new MutableTestAgentHostWorktreeIsolation());
	const services = new StrictServiceCollection(
		[ILogService, logService],
		[IFileService, fileService],
		[ISessionDataService, sessionDataService],
		[IProductService, productService],
		[IAgentHostGitService, gitService],
		[ITelemetryService, telemetryService],
		[IAgentHostFileMonitorService, effectiveFileMonitorService],
		[IAgentEditAttributionService, new NullAgentEditAttributionService()],
		[IAgentHostClientConnectionService, clientConnectionService],
		[IAgentHostWorktreeIsolation, worktreeIsolation.service],
	);
	const options = {
		rootConfigResource,
		copilotApiService,
		providerConfigurations,
		hostLaunchKind,
		storageResource,
		orchestratorDatabase,
		sessionResidencyLimit,
		sessionReleaseRetryMs,
	};
	const foundation = createAgentServiceFoundation({
		services,
		owned: foundationDisposables,
		logService,
		productService,
		rootConfigResource,
		providerConfigurations,
		transientProxyConfiguration: false,
		proxyResolver,
		fetchFn,
	});
	registerAgentHostCoreServices(services, {
		storageResource,
		fetchFn,
		gitHubServiceOptions: foundation.gitHubServiceOptions,
		copilotApiService,
	});
	const instantiationService = new InstantiationService(services, /*strict*/ true);
	services.set(IAgentHostProviderLocator, new AgentHostProviderLocator(session => foundation.callbackAdapter.value.getAgent(typeof session === 'string' ? session : session.toString())));
	const octoKitService = instantiationService.invokeFunction(accessor => accessor.get(IAgentHostOctoKitService));
	const effectiveCopilotApiService = instantiationService.invokeFunction(accessor => accessor.get(ICopilotApiService));
	services.set(IAgentHostSessionTitleController, foundationDisposables.add(instantiationService.createInstance(AgentHostSessionTitleController, foundation.stateManager, {
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
		copilotApiService: effectiveCopilotApiService,
		isActiveAgentTitleGenerationEnabled: () => foundation.configurationService.getRootValue(platformRootSchema, AgentHostActiveAgentTitleGenerationConfigKey) === true,
	})));
	const localTurns = new AgentHostLocalTurns(sessionDataService, logService);
	services.set(IAgentHostLocalTurns, localTurns);
	services.set(IAgentHostLocalCommands, foundationDisposables.add(instantiationService.createInstance(AgentHostLocalCommands)));
	const composition = instantiationService.invokeFunction(accessor => createAgentServiceComposition(
		options,
		accessor,
		instantiationService,
		logService,
		sessionDataService,
		foundation,
		localTurns,
		fileMonitorService
			? [clientConnectionService, instantiationService, foundationDisposables]
			: [effectiveFileMonitorService, clientConnectionService, instantiationService, foundationDisposables],
	));
	try {
		services.set(IAgentService, composition.agentService);
		composition.setContributions(instantiationService.invokeFunction(accessor => activateAgentHostContributions(accessor, instantiationService)));
		compositions.set(composition.agentService, composition);
		worktreeIsolations.set(composition.agentService, worktreeIsolation);
		return composition.agentService;
	} catch (error) {
		composition.agentService.dispose();
		throw error;
	}
}
