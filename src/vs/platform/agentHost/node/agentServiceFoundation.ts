/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import type { GitHubServiceOptions } from '../../github/common/githubTypes.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IRequestService } from '../../request/common/request.js';
import type { IAgentCustomizationSettingsRegistration } from '../common/agentCustomizationSettings.js';
import { AgentHostProxyConfigKey } from '../common/agentHostSchema.js';
import type { IAgentServiceCallbacks, IAgentServiceCallbackBinder } from './agentService.js';
import type { IAgentHostAutomationExecution } from './agentHostAutomationService.js';
import { AgentConfigurationService, IAgentConfigurationService } from './agentConfigurationService.js';
import { AgentHostAuthenticationService, IAgentHostAuthenticationController, IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { AgentHostGitHubEndpointService, IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { AgentHostProxyResolver, IAgentHostProxyResolver } from './agentHostProxyResolver.js';
import { AgentHostRequestService } from './agentHostRequestService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import type { IArtifactServerToolAccessor } from './shared/artifactServerTools.js';
import type { ISessionServerToolAccessor } from './shared/sessionServerTools.js';
import { hostBuildInfoFromProduct } from '../common/state/sessionState.js';

export class AgentServiceCallbackAdapter implements IAgentServiceCallbackBinder {
	private callbacks: IAgentServiceCallbacks | undefined;

	readonly automationExecution: IAgentHostAutomationExecution = {
		isSessionTemplateAvailable: template => this.value.automationExecution.isSessionTemplateAvailable(template),
		createSession: (template, run) => this.value.automationExecution.createSession(template, run),
		startSession: (session, message) => this.value.automationExecution.startSession(session, message),
		cancelSession: session => this.value.automationExecution.cancelSession(session),
	};

	readonly sessionServerToolAccessor: ISessionServerToolAccessor = {
		isActiveAgentTitleGenerationEnabled: () => this.value.sessionServerToolAccessor.isActiveAgentTitleGenerationEnabled(),
		listSessions: () => this.value.sessionServerToolAccessor.listSessions(),
		getSession: session => this.value.sessionServerToolAccessor.getSession(session),
		createSession: config => this.value.sessionServerToolAccessor.createSession(config),
		getModels: () => this.value.sessionServerToolAccessor.getModels(),
		getCreationDefaults: source => this.value.sessionServerToolAccessor.getCreationDefaults(source),
		startPrompt: (session, chat, prompt, delegation) => this.value.sessionServerToolAccessor.startPrompt(session, chat, prompt, delegation),
		createChat: (session, chat, options) => this.value.sessionServerToolAccessor.createChat(session, chat, options),
		renameChat: (session, chat, title) => this.value.sessionServerToolAccessor.renameChat(session, chat, title),
		reportToolError: (toolName, error) => this.value.sessionServerToolAccessor.reportToolError(toolName, error),
		deleteSession: session => this.value.sessionServerToolAccessor.deleteSession(session),
		getChatContext: (session, chatId) => this.value.sessionServerToolAccessor.getChatContext(session, chatId),
		getSessionSpawnDepth: session => this.value.sessionServerToolAccessor.getSessionSpawnDepth(session),
		setSessionSpawnDepth: (session, depth) => this.value.sessionServerToolAccessor.setSessionSpawnDepth(session, depth),
	};

	readonly artifactServerToolAccessor: IArtifactServerToolAccessor = {
		isEnabled: () => this.value.artifactServerToolAccessor.isEnabled(),
		persist: (session, artifacts) => this.value.artifactServerToolAccessor.persist(session, artifacts),
	};

	bind(callbacks: IAgentServiceCallbacks): void {
		if (this.callbacks) {
			throw new Error('AgentService callbacks have already been bound');
		}
		this.callbacks = callbacks;
	}

	canEvictChangeset(changeset: string): boolean {
		return this.callbacks?.canEvictChangeset(changeset) ?? false;
	}

	get value(): IAgentServiceCallbacks {
		if (!this.callbacks) {
			throw new Error('AgentService callbacks have not been bound');
		}
		return this.callbacks;
	}
}

export interface IAgentServiceFoundation {
	readonly callbackAdapter: AgentServiceCallbackAdapter;
	readonly stateManager: AgentHostStateManager;
	readonly configurationService: AgentConfigurationService;
	readonly authenticationService: AgentHostAuthenticationService;
	readonly gitHubEndpointService: AgentHostGitHubEndpointService;
	readonly proxyResolver: IAgentHostProxyResolver;
	readonly requestService: IRequestService;
	readonly fetchFn: typeof globalThis.fetch;
	readonly gitHubServiceOptions: GitHubServiceOptions;
}

export interface ICreateAgentServiceFoundationOptions {
	readonly services: ServiceCollection;
	readonly owned: DisposableStore;
	readonly logService: ILogService;
	readonly productService: IProductService;
	readonly rootConfigResource?: URI;
	readonly providerConfigurations?: readonly IAgentCustomizationSettingsRegistration[];
	readonly transientProxyConfiguration: boolean;
	readonly proxyResolver?: IAgentHostProxyResolver;
	readonly fetchFn?: typeof globalThis.fetch;
}

export function createAgentServiceFoundation(options: ICreateAgentServiceFoundationOptions): IAgentServiceFoundation {
	const callbackAdapter = new AgentServiceCallbackAdapter();
	const stateManager = options.owned.add(new AgentHostStateManager(options.logService, {
		hostBuildInfo: hostBuildInfoFromProduct(options.productService),
		changesetStateRetention: {
			canEvict: changeset => callbackAdapter.canEvictChangeset(changeset),
		},
	}));
	const configurationService = options.owned.add(new AgentConfigurationService(
		stateManager,
		options.logService,
		options.rootConfigResource,
		options.providerConfigurations ?? [],
	));
	if (options.transientProxyConfiguration) {
		configurationService.publishRootTransientValues(Object.fromEntries(
			Object.values(AgentHostProxyConfigKey).map(key => [key, undefined])
		));
	}
	const authenticationService = options.owned.add(new AgentHostAuthenticationService(options.logService));
	const gitHubEndpointService = options.owned.add(new AgentHostGitHubEndpointService(configurationService, options.logService));
	const proxyResolver = options.proxyResolver ?? options.owned.add(new AgentHostProxyResolver(configurationService, options.logService));
	const requestService = options.owned.add(new AgentHostRequestService(options.logService, proxyResolver));
	const fetchFn = options.fetchFn ?? proxyResolver.fetch.bind(proxyResolver);

	options.services.set(IAgentHostStateManager, stateManager);
	options.services.set(IAgentConfigurationService, configurationService);
	options.services.set(IAgentHostAuthenticationService, authenticationService);
	options.services.set(IAgentHostAuthenticationController, authenticationService);
	options.services.set(IAgentHostGitHubEndpointService, gitHubEndpointService);
	options.services.set(IAgentHostProxyResolver, proxyResolver);
	options.services.set(IRequestService, requestService);

	return {
		callbackAdapter,
		stateManager,
		configurationService,
		authenticationService,
		gitHubEndpointService,
		proxyResolver,
		requestService,
		fetchFn,
		gitHubServiceOptions: {
			endpoint: gitHubEndpointService,
			tokenProvider: {
				getToken: () => {
					const resource = gitHubEndpointService.getRepoResource();
					return authenticationService.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported });
				},
			},
			fetch: fetchFn,
		},
	};
}
