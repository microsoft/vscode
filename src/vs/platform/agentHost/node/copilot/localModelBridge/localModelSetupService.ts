/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ICopilotHomeService } from '../../../../environment/common/copilotHome.js';
import { INativeEnvironmentService } from '../../../../environment/common/environment.js';
import { createDecorator } from '../../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../../log/common/log.js';
import { IProductService } from '../../../../product/common/productService.js';
import { IRequestService } from '../../../../request/common/request.js';
import { ITelemetryService } from '../../../../telemetry/common/telemetry.js';
import { IAgentConfigurationService } from '../../agentConfigurationService.js';
import { IAgentHostAuthenticationService } from '../../agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from '../../agentHostGitHubEndpointService.js';
import { IAgentHostProxyResolver } from '../../agentHostProxyResolver.js';
import { IAgentHostStorageService } from '../../agentHostStorageService.js';
import { LocalModelSetupChannel } from '../../localModelSetupChannel.js';
import { ICopilotApiService } from '../../shared/copilotApiService.js';
import type { ILocalModelProvider, LocalModelProviderSelection } from './localModelProvider.js';
import { resolveLocalModelCapiBaseUrls } from './shim/requestRouter.js';
import { createNodeShimLocalModelProviderHost, ShimLocalModelProvider, type IShimLocalModelProviderHost } from './shim/shimLocalModelProvider.js';

export const ILocalModelSetupService = createDecorator<ILocalModelSetupService>('localModelSetupService');

/**
 * Owns the single {@link ILocalModelProvider} of this Agent Host process and its setup channel. Only the local
 * utility-process host gets {@link LocalModelSetupService}; every other host gets {@link NullLocalModelSetupService},
 * so remote hosts publish no status.
 */
export interface ILocalModelSetupService {
	readonly _serviceBrand: undefined;

	/** True only in the local utility-process Agent Host; an input to provider selection. */
	readonly isLocalAgentHost: boolean;

	/** The provider currently owned by this process, if any. */
	readonly provider: ILocalModelProvider | undefined;

	/** Applies the provider selection made at client start: `shim` creates the provider and channel once and keeps them across restarts; `none` disposes them. Returns the provider to install. */
	applySelection(selection: LocalModelProviderSelection): ILocalModelProvider | undefined;
}

/** {@link ILocalModelSetupService} for hosts without on-device model support. */
export class NullLocalModelSetupService implements ILocalModelSetupService {
	declare readonly _serviceBrand: undefined;
	readonly isLocalAgentHost = false;
	readonly provider = undefined;

	applySelection(_selection: LocalModelProviderSelection): undefined {
		return undefined;
	}
}

/** {@link ILocalModelSetupService} for the local utility-process Agent Host. */
export class LocalModelSetupService extends Disposable implements ILocalModelSetupService {
	declare readonly _serviceBrand: undefined;
	readonly isLocalAgentHost = true;

	private readonly _current = this._register(new MutableDisposable<DisposableStore>());
	private _provider: ILocalModelProvider | undefined;

	constructor(
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostProxyResolver private readonly _proxyResolver: IAgentHostProxyResolver,
		@IRequestService private readonly _requestService: IRequestService,
		@IAgentHostStorageService private readonly _storageService: IAgentHostStorageService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IAgentHostAuthenticationService private readonly _authenticationService: IAgentHostAuthenticationService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@IProductService private readonly _productService: IProductService,
		@ICopilotHomeService private readonly _copilotHomeService: ICopilotHomeService,
	) {
		super();
	}

	get provider(): ILocalModelProvider | undefined {
		return this._provider;
	}

	applySelection(selection: LocalModelProviderSelection): ILocalModelProvider | undefined {
		if (selection === 'none') {
			if (this._provider) {
				this._logService.info('[LocalModel] On-device models disabled; disposing the provider');
			}
			this._provider = undefined;
			this._current.clear();
			return undefined;
		}
		if (!this._provider) {
			this._logService.info('[LocalModel] Creating the request-handler bridge provider');
			const provider = new ShimLocalModelProvider(this._logService, this._proxyResolver, this._createHost());
			const store = new DisposableStore();
			// The channel is disposed first so the status is withdrawn before the provider goes away.
			store.add(new LocalModelSetupChannel(provider, this._configurationService, this._logService));
			store.add(provider);
			this._current.value = store;
			this._provider = provider;
		}
		return this._provider;
	}

	private _createHost(): IShimLocalModelProviderHost {
		const authentication = this._authenticationService;
		const endpoints = this._gitHubEndpointService;
		const environment = this._environmentService;
		const githubTokens = () => {
			const token = authentication.getAuthToken({ resource: endpoints.getCopilotResource().resource });
			return token ? [token] : [];
		};
		return createNodeShimLocalModelProviderHost({
			requestService: this._requestService,
			storage: this._storageService,
			telemetry: this._telemetryService,
			log: this._logService,
			copilotHome: this._copilotHomeService.home.fsPath,
			userDataPath: environment.userDataPath,
			homeDir: environment.userHome.fsPath,
			tempDir: environment.tmpDir.fsPath,
			resolveCapiBaseUrls: () => resolveLocalModelCapiBaseUrls(this._copilotApiService, githubTokens(), process.env['VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE']),
			onDidChangeCapiAccounts: Event.signal(Event.filter(authentication.onDidChangeAuthToken, event => event.resource === endpoints.getCopilotResource().resource)),
			productVersion: this._productService.version,
		});
	}

	override dispose(): void {
		this._provider = undefined;
		super.dispose();
	}
}
