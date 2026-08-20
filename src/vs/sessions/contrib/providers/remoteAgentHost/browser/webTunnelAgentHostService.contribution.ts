/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IRemoteAgentHostLocationPreferenceService } from '../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ITunnelAgentHostService, type ICachedTunnel, type ITunnelInfo, type TunnelAutoConnectMode } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/browser/environmentService.js';
import { BrowserTunnelAgentHostService } from './browserTunnelAgentHostService.js';
import { WebTunnelAgentHostService } from './webTunnelAgentHostService.js';

/**
 * Selects the embedder proxy when provided and otherwise connects directly from the browser.
 */
class BrowserTunnelAgentHostServiceSelector extends Disposable implements ITunnelAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _delegate: ITunnelAgentHostService;
	readonly onDidChangeTunnels: Event<void>;

	constructor(
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAuthenticationService authenticationService: IAuthenticationService,
		@IProductService productService: IProductService,
		@IStorageService storageService: IStorageService,
		@IRemoteAgentHostLocationPreferenceService locationPreferenceService: IRemoteAgentHostLocationPreferenceService,
		@IDialogService dialogService: IDialogService,
	) {
		super();
		this._delegate = this._register(environmentService.options?.tunnelDiscoveryProvider
			? new WebTunnelAgentHostService(
				remoteAgentHostService,
				environmentService,
				logService,
				instantiationService,
				configurationService,
				authenticationService,
				storageService,
			)
			: new BrowserTunnelAgentHostService(
				remoteAgentHostService,
				logService,
				instantiationService,
				configurationService,
				authenticationService,
				productService,
				storageService,
				locationPreferenceService,
				dialogService,
			));
		this.onDidChangeTunnels = this._delegate.onDidChangeTunnels;
	}

	listTunnels(options?: { silent?: boolean }): Promise<ITunnelInfo[]> {
		return this._delegate.listTunnels(options);
	}

	getAutoConnectMode(tunnel: ITunnelInfo): TunnelAutoConnectMode {
		return this._delegate.getAutoConnectMode(tunnel);
	}

	connect(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft', options?: { readonly userInitiated?: boolean }): Promise<void> {
		return this._delegate.connect(tunnel, authProvider, options);
	}

	get canDeleteTunnels(): boolean {
		return this._delegate.canDeleteTunnels;
	}

	deleteTunnel(tunnel: ITunnelInfo): Promise<void> {
		return this._delegate.deleteTunnel(tunnel);
	}

	disconnect(address: string): Promise<void> {
		return this._delegate.disconnect(address);
	}

	getCachedTunnels(): ICachedTunnel[] {
		return this._delegate.getCachedTunnels();
	}

	cacheTunnel(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft'): void {
		this._delegate.cacheTunnel(tunnel, authProvider);
	}

	removeCachedTunnel(tunnelId: string): void {
		this._delegate.removeCachedTunnel(tunnelId);
	}

	isAutoConnectSuppressed(tunnelId: string): boolean {
		return this._delegate.isAutoConnectSuppressed(tunnelId);
	}

	suppressAutoConnect(tunnelId: string): void {
		this._delegate.suppressAutoConnect(tunnelId);
	}

	clearAutoConnectSuppression(tunnelId: string): void {
		this._delegate.clearAutoConnectSuppression(tunnelId);
	}

	getAuthProvider(options?: { silent?: boolean }): Promise<'github' | 'microsoft' | undefined> {
		return this._delegate.getAuthProvider(options);
	}
}

registerSingleton(ITunnelAgentHostService, BrowserTunnelAgentHostServiceSelector, InstantiationType.Delayed);
