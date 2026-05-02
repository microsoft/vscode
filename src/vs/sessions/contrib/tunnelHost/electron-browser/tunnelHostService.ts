/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../base/common/resources.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILogger, ILoggerService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { localize } from '../../../../nls.js';
import {
	ITunnelAgentHostHostingService,
	TUNNEL_HOST_CHANNEL,
	TUNNEL_HOST_LOG_ID,
	type ITunnelHostInfo,
	type TunnelHostStatus,
} from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ITunnelHostService } from '../common/tunnelHost.js';

export const CONFIGURATION_KEY_MICROSOFT_AUTH = 'remote.tunnels.access.enableMicrosoftAuth';
export const SHOW_TUNNEL_HOST_OUTPUT_ID = 'sessions.tunnelHost.showOutput';

export class TunnelHostService extends Disposable implements ITunnelHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _mainService: ITunnelAgentHostHostingService;
	private readonly _logger: ILogger;

	private readonly _onDidChangeStatus = this._register(new Emitter<void>());
	readonly onDidChangeStatus: Event<void> = this._onDidChangeStatus.event;

	private _isSharing = false;
	private _isConnecting = false;
	private _sharingInfo: ITunnelHostInfo | undefined;

	/** Tracks which auth provider was last used successfully. */
	private _lastAuthProvider: 'github' | 'microsoft' | undefined;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IProductService private readonly _productService: IProductService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILoggerService loggerService: ILoggerService,
		@IEnvironmentService environmentService: IEnvironmentService,
	) {
		super();

		// Register a renderer-side logger so that the output channel
		// created in the shared process is visible in the workbench UI
		this._logger = this._register(loggerService.createLogger(
			joinPath(environmentService.logsHome, `${TUNNEL_HOST_LOG_ID}.log`),
			{ id: TUNNEL_HOST_LOG_ID, name: localize('tunnelHost.outputChannel', "Remote Connections") },
		));

		this._mainService = ProxyChannel.toService<ITunnelAgentHostHostingService>(
			sharedProcessService.getChannel(TUNNEL_HOST_CHANNEL),
		);

		// Listen for status changes from the shared process
		this._register(this._mainService.onDidChangeStatus((status: TunnelHostStatus) => {
			this._isSharing = status.active;
			this._sharingInfo = status.active ? status.info : undefined;
			this._onDidChangeStatus.fire();
		}));

		// Restore status on construction
		this._mainService.getStatus().then(status => {
			this._isSharing = status.active;
			this._sharingInfo = status.active ? status.info : undefined;
			if (status.active) {
				this._onDidChangeStatus.fire();
			}
		});
	}

	get isSharing(): boolean {
		return this._isSharing;
	}

	get isConnecting(): boolean {
		return this._isConnecting;
	}

	get sharingInfo(): ITunnelHostInfo | undefined {
		return this._sharingInfo;
	}

	async startSharing(): Promise<void> {
		this._isConnecting = true;
		this._onDidChangeStatus.fire();

		try {
			const auth = await this._getToken(false);
			if (!auth) {
				this._logger.warn(`No auth token available for tunnel hosting`);
				throw new Error(localize('tunnelHost.noAuth', "No authentication token available. Please sign in and try again."));
			}

			this._logger.info(`Starting tunnel hosting...`);

			const socketInfo = await this._agentHostService.startWebSocketServer();
			const info = await this._mainService.startHosting(auth.token, auth.provider, socketInfo);
			this._isSharing = true;
			this._sharingInfo = info;
		} finally {
			this._isConnecting = false;
			this._onDidChangeStatus.fire();
		}
	}

	async stopSharing(): Promise<void> {
		this._logger.info(`Stopping tunnel hosting...`);
		await this._mainService.stopHosting();
		this._isSharing = false;
		this._sharingInfo = undefined;
		this._onDidChangeStatus.fire();
	}

	// ---- Auth helpers (reused from TunnelAgentHostService) -------------------

	private _getEnabledProviders(): readonly ('github' | 'microsoft')[] {
		const microsoftEnabled = this._configurationService.getValue<boolean>(CONFIGURATION_KEY_MICROSOFT_AUTH);
		return microsoftEnabled ? ['microsoft', 'github'] : ['github'];
	}

	private async _getToken(silent: boolean): Promise<{ token: string; provider: 'github' | 'microsoft' } | undefined> {
		const enabledProviders = this._getEnabledProviders();

		// Try the last known provider first
		if (this._lastAuthProvider && enabledProviders.includes(this._lastAuthProvider)) {
			const result = await this._getTokenForProvider(this._lastAuthProvider, silent);
			if (result) {
				return result;
			}
		}

		// Try enabled providers silently
		for (const provider of enabledProviders) {
			if (provider === this._lastAuthProvider) {
				continue;
			}
			const result = await this._getTokenForProvider(provider, true);
			if (result) {
				return result;
			}
		}

		// If not silent, try interactively with each enabled provider
		if (!silent) {
			for (const provider of enabledProviders) {
				const result = await this._getTokenForProvider(provider, false);
				if (result) {
					return result;
				}
			}
		}

		return undefined;
	}

	private _getScopesForProvider(provider: 'github' | 'microsoft'): string[] {
		const config = this._productService.tunnelApplicationConfig?.authenticationProviders;
		return config?.[provider]?.scopes ?? [];
	}

	private async _getTokenForProvider(
		provider: 'github' | 'microsoft',
		silent: boolean,
	): Promise<{ token: string; provider: 'github' | 'microsoft' } | undefined> {
		const scopes = this._getScopesForProvider(provider);
		if (scopes.length === 0) {
			return undefined;
		}

		try {
			// Try exact scope match first
			let sessions = await this._authenticationService.getSessions(provider, scopes, {}, true);

			// Fall back: find any session whose scopes are a superset
			if (sessions.length === 0) {
				const allSessions = await this._authenticationService.getSessions(provider, undefined, {}, true);
				const requestedSet = new Set(scopes);
				let bestSession: typeof allSessions[number] | undefined;
				let bestExtra = Infinity;
				for (const session of allSessions) {
					const sessionScopes = new Set(session.scopes);
					let isSuperset = true;
					for (const scope of requestedSet) {
						if (!sessionScopes.has(scope)) {
							isSuperset = false;
							break;
						}
					}
					if (isSuperset) {
						const extra = sessionScopes.size - requestedSet.size;
						if (extra < bestExtra) {
							bestExtra = extra;
							bestSession = session;
						}
					}
				}
				if (bestSession) {
					sessions = [bestSession];
				}
			}

			// Interactive fallback: create a new session
			if (sessions.length === 0 && !silent) {
				const session = await this._authenticationService.createSession(provider, scopes, { activateImmediate: true });
				sessions = [session];
			}

			if (sessions.length > 0) {
				const token = sessions[0].accessToken;
				if (token) {
					this._lastAuthProvider = provider;
					return { token, provider };
				}
			}
		} catch (err) {
			this._logger.debug(`Failed to get ${provider} token: ${err}`);
		}
		return undefined;
	}

	override dispose(): void {
		// Best-effort cleanup — stop hosting when the window closes
		if (this._isSharing) {
			this.stopSharing().catch(() => { /* ignore */ });
		}
		super.dispose();
	}
}
