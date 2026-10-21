/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../../../base/common/arrays.js';
import { disposableTimeout, raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { matchesFuzzy2 } from '../../../../../base/common/filters.js';
import { Disposable, DisposableStore, IReference, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { equals } from '../../../../../base/common/objects.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { IGitHubAccountClient } from '../../../../../platform/github/common/account/account.js';
import { ConnectorCatalog, ConnectorPlugin, copilotConnectorsScope } from '../../../../../platform/github/common/connectors/connectors.js';
import { GitHubAuthorizationContext, GitHubRequestError, isEqualAuthorization } from '../../../../../platform/github/common/githubTypes.js';
import { SchemaError } from '../../../../../platform/github/common/client/schema.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceEntry, ICustomizationMarketplaceProvider, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';

const maxSearchQueryLength = 256;
const maxSearchWords = 16;
const fuzzyWindowSize = 128;
const maxTextLength = 4096;
const maxMetadataEntries = 32;
const maxConnectors = 1000;
const maxMcpServersPerConnector = 64;
const refreshInterval = 60_000;
const connectionPollInterval = 2_000;
const connectionTimeout = 5 * 60_000;
const requestTimeout = 30_000;

export class CopilotConnectorsError extends Error {
	constructor(message: string, readonly statusCode?: number) {
		super(message);
	}
}

export interface ICopilotConnectorMcpServer {
	readonly name: string;
	readonly type: string;
	readonly url?: URI;
}

export type CopilotConnectorConnectionStatus = 'unknown' | 'not_connected' | 'pending' | 'connected' | 'error';
export type CopilotConnectorConnectionStatusDetail = 'sign_in_required' | 'reconnect_required' | 'review_required' | 'retryable_error' | 'unavailable';

type CopilotConnectorsCatalogAccess = 'scoped' | 'unscoped' | 'unavailable';

type CopilotConnectorsCatalogSnapshotEvent = {
	catalogAccess: CopilotConnectorsCatalogAccess;
	connectorCount: number;
	connectedConnectorCount: number;
	notConnectedConnectorCount: number;
	pendingConnectorCount: number;
	errorConnectorCount: number;
	unknownConnectorCount: number;
	mcpServerCount: number;
	connectedMcpServerCount: number;
};

type CopilotConnectorsCatalogSnapshotClassification = {
	owner: 'pwang347';
	comment: 'Tracks distinct Copilot connector catalog states so rollout exposure, adoption, and connected MCP server inventory can be measured without connector content.';
	catalogAccess: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the catalog response used connector-scoped authorization, unscoped authorization, or was unavailable before a catalog request.' };
	connectorCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of connectors in the catalog snapshot.' };
	connectedConnectorCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of connected connectors in the catalog snapshot.' };
	notConnectedConnectorCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of connectors reported as not connected.' };
	pendingConnectorCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of connectors with a pending connection.' };
	errorConnectorCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of connectors reporting an error state.' };
	unknownConnectorCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of connectors whose connection state is unavailable to the client.' };
	mcpServerCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of MCP servers advertised by all connectors in the catalog snapshot.' };
	connectedMcpServerCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of MCP servers advertised by connected connectors.' };
};

type CopilotConnectorConnectionActionEvent = {
	action: 'connect' | 'disconnect';
	outcome: 'success' | 'error' | 'cancelled';
	connectionStatusBefore: CopilotConnectorConnectionStatus | 'not_loaded';
	connectionStatusAfter: CopilotConnectorConnectionStatus | 'not_loaded';
	durationMs: number;
	connectorMcpServerCount?: number;
	httpStatusCode?: number;
};

type CopilotConnectorConnectionActionClassification = {
	owner: 'pwang347';
	comment: 'Tracks explicit Copilot connector connection actions and outcomes for rollout and comparison with MCP server installation and usage.';
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the user attempted to connect or disconnect a connector.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the connection action succeeded, failed, or was cancelled.' };
	connectionStatusBefore: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Last known connector connection status before the action.' };
	connectionStatusAfter: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Last known connector connection status after the action.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Duration of the connection action in milliseconds, including authorization and polling.' };
	connectorMcpServerCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of MCP servers advertised by the connector when known.' };
	httpStatusCode?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'HTTP status code returned for a failed connector request when available.' };
};

export interface ICopilotConnectorAuthor {
	readonly name?: string;
	readonly email?: string;
	readonly url?: URI;
}

export interface ICopilotConnector {
	readonly name: string;
	readonly displayName: string;
	readonly description: string;
	readonly icon?: URI;
	readonly documentation?: URI;
	readonly homepage?: URI;
	readonly version?: string;
	readonly author?: ICopilotConnectorAuthor;
	readonly repository?: URI;
	readonly license?: string;
	readonly tags: readonly string[];
	readonly keywords: readonly string[];
	readonly capabilities: readonly string[];
	readonly representativeQueries: readonly string[];
	readonly tier?: string;
	readonly releaseTag?: string;
	readonly isExportSupported?: boolean;
	readonly connectionStatus: CopilotConnectorConnectionStatus;
	readonly connectionStatusDetail?: CopilotConnectorConnectionStatusDetail;
	readonly connectionErrorMessage?: string;
	readonly protectedResourceMetadataUrl?: string;
	readonly scopes: readonly string[];
	readonly mcpServers: readonly ICopilotConnectorMcpServer[];
}

export interface IConnectedCopilotConnectorMcpServer {
	readonly id: string;
	readonly connector: ICopilotConnector;
	readonly serverName: string;
}

export interface ICopilotConnectorAccount {
	readonly providerId: string;
	readonly accountName: string;
	readonly enterprise: boolean;
}

function getConnectedMcpServerId(connectorName: string, serverName: string): string {
	return `${encodeURIComponent(connectorName)}:${encodeURIComponent(serverName)}`;
}

interface ICopilotConnectorsSnapshot {
	readonly connectors: readonly ICopilotConnector[];
	readonly cacheToken: CancellationToken;
}

interface ICopilotConnectorsAuthentication {
	readonly account: IDefaultAccount;
	readonly session: AuthenticationSession;
	readonly sessions: readonly AuthenticationSession[];
}

export const ICopilotConnectorsService = createDecorator<ICopilotConnectorsService>('copilotConnectorsService');

export interface ICopilotConnectorsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly onDidChangeAccount: Event<void>;
	readonly onDidDisconnect: Event<string>;
	readonly account: ICopilotConnectorAccount | undefined;
	readonly connectors: readonly ICopilotConnector[];
	readonly connectionStateKnown: boolean;
	readonly connectedMcpServers: readonly IConnectedCopilotConnectorMcpServer[];
	readonly authorizationRequired: boolean;
	/** Signs in for catalog browsing without requesting connector permission. */
	signIn(token: CancellationToken): Promise<void>;
	/** Signs in if needed, then requests connector consent after an explicit user action. */
	/**
	 * Ensures the active account has a session that authorizes Copilot connectors while keeping its default
	 * scopes, requesting consent for that account when needed, and resolves to that session.
	 */
	authorize(token: CancellationToken): Promise<AuthenticationSession>;
	/**
	 * Reconciles live Agent Host sessions with the current Connector authorization. A named Connector also
	 * restarts its servers, so they use the session credential rebound by {@link authorize}.
	 */
	refreshAgentHostSessions(forceConnectorName?: string): Promise<void>;
	getConnectors(token: CancellationToken): Promise<readonly ICopilotConnector[]>;
	/** Reads the catalog and its source/account validity token atomically. */
	getConnectorsSnapshot(token: CancellationToken): Promise<ICopilotConnectorsSnapshot>;
	refresh(token: CancellationToken): Promise<readonly ICopilotConnector[]>;
	checkConnection(token: CancellationToken): Promise<void>;
	connect(name: string, token: CancellationToken): Promise<void>;
	disconnect(name: string, token: CancellationToken): Promise<void>;
}

export class CopilotConnectorsService extends Disposable implements ICopilotConnectorsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _onDidChangeAccount = this._register(new Emitter<void>());
	readonly onDidChangeAccount = this._onDidChangeAccount.event;
	private readonly _onDidDisconnect = this._register(new Emitter<string>());
	readonly onDidDisconnect = this._onDidDisconnect.event;
	private readonly catalogContext = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly authorizationCancellation = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly enabledListeners = this._register(new MutableDisposable<DisposableStore>());
	private readonly apiClient = this._register(new MutableDisposable<IReference<IGitHubAccountClient>>());
	private authorizationPromise: Promise<AuthenticationSession> | undefined;
	private enabled = false;
	private accountIdentity: string | undefined;
	private authenticationAccountId: string | undefined;
	private readonly connectorAuthorizationSessionIds = new Set<string>();
	private _authorizationRequired = false;
	private _connectors: readonly ICopilotConnector[] = [];
	private _connectionStateKnown = false;
	private _connectionStateAuthorized = false;
	private _lastRefreshTime = 0;
	private refreshGeneration = 0;
	private lastReportedCatalogSnapshot: string | undefined;

	constructor(
		@IWorkbenchGitHubService private readonly gitHubService: IWorkbenchGitHubService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IProductService private readonly productService: IProductService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IAgentHostService private readonly agentHostService: IAgentHostService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.accountIdentity = getAccountIdentity(this.defaultAccountService.currentDefaultAccount);
		this.updateEnablement();
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled)) {
				this.updateEnablement();
			}
		}));
	}

	get connectors(): readonly ICopilotConnector[] {
		return this._connectors;
	}

	get connectionStateKnown(): boolean {
		return this._connectionStateKnown;
	}

	get account(): ICopilotConnectorAccount | undefined {
		const account = this.defaultAccountService.currentDefaultAccount;
		return account ? {
			providerId: account.authenticationProvider.id,
			accountName: account.accountName,
			enterprise: account.enterprise,
		} : undefined;
	}

	get authorizationRequired(): boolean {
		return this.isEnabled() && this._authorizationRequired;
	}

	async signIn(token: CancellationToken): Promise<void> {
		if (!this.isEnabled() || token.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
		const account = await raceCancellationError(this.defaultAccountService.signIn(), token);
		if (!account || !this.isEnabled() || token.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
	}

	async authorize(token: CancellationToken): Promise<AuthenticationSession> {
		if (!this.isEnabled() || token.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
		if (!this.authorizationPromise) {
			const cancellation = this.authorizationCancellation.value = new CancellationTokenSource(token);
			this.authorizationPromise = this.doAuthorize(cancellation).finally(() => {
				this.authorizationPromise = undefined;
				this.authorizationCancellation.clear();
			});
		}
		return raceCancellationError(this.authorizationPromise, token);
	}

	private async doAuthorize(cancellation: CancellationTokenSource): Promise<AuthenticationSession> {
		let authentication = await this.getAuthentication(cancellation.token, true);
		if (!authentication) {
			const account = await raceCancellationError(this.defaultAccountService.signIn(), cancellation.token);
			if (!account) {
				throw new CancellationError();
			}
			authentication = await this.getAuthentication(cancellation.token, true);
			if (authentication && getAccountIdentity(authentication.account) !== getAccountIdentity(account)) {
				throw new CancellationError();
			}
		}
		if (!authentication) {
			throw connectorSignInRequired();
		}
		// Connector-owned Agent Host servers use the Copilot session credential, so only a session that also keeps
		// the default session's scopes authorizes them; a narrow Connector-only session is not enough.
		const authorized = authentication.sessions.find(session => hasConnectorScope(session, false) && authentication.session.scopes.every(scope => session.scopes.includes(scope)));
		if (authorized) {
			this._authorizationRequired = false;
			return authorized;
		}
		const store = new DisposableStore();
		store.add(this.defaultAccountService.onDidChangeDefaultAccount(account => {
			if (account?.authenticationProvider.id !== authentication.account.authenticationProvider.id || account?.accountName !== authentication.account.accountName) {
				cancellation.cancel();
			}
		}));
		try {
			const session = await raceCancellationError(this.authenticationService.createSession(
				authentication.account.authenticationProvider.id,
				distinct([...authentication.session.scopes, copilotConnectorsScope]),
				{ account: authentication.session.account },
			), cancellation.token);
			const account = this.defaultAccountService.currentDefaultAccount;
			if (cancellation.token.isCancellationRequested || !this.isEnabled() || this._store.isDisposed ||
				account?.authenticationProvider.id !== authentication.account.authenticationProvider.id || account?.accountName !== authentication.account.accountName) {
				throw new CancellationError();
			}
			if (session.account.id !== authentication.session.account.id) {
				throw new CopilotConnectorsError(localize('copilotConnectors.wrongAccount', "Authorize connectors with the same GitHub account that you use for GitHub Copilot."));
			}
			if (!hasConnectorScope(session, false)) {
				throw new CopilotConnectorsError(localize('copilotConnectors.permissionNotGranted', "GitHub did not grant permission to manage Copilot connectors. Try authorizing connectors again."));
			}
			this.resetCatalogContext();
			return session;
		} finally {
			store.dispose();
		}
	}

	get connectedMcpServers(): readonly IConnectedCopilotConnectorMcpServer[] {
		const result: IConnectedCopilotConnectorMcpServer[] = [];
		for (const connector of this._connectors) {
			if (connector.connectionStatus !== 'connected') {
				continue;
			}
			for (const server of connector.mcpServers) {
				result.push({ id: getConnectedMcpServerId(connector.name, server.name), connector, serverName: server.name });
			}
		}
		return result;
	}

	async getConnectors(token: CancellationToken): Promise<readonly ICopilotConnector[]> {
		if (this._lastRefreshTime > 0 && Date.now() - this._lastRefreshTime < refreshInterval) {
			return this._connectors;
		}
		return this.refresh(token);
	}

	async getConnectorsSnapshot(token: CancellationToken): Promise<ICopilotConnectorsSnapshot> {
		const operation = await this.createOperation(token);
		try {
			const connectors = await this.getConnectors(operation.token);
			if (operation.token.isCancellationRequested) {
				throw new CancellationError();
			}
			return { connectors, cacheToken: operation.cacheToken };
		} catch (error) {
			if (operation.cacheToken.isCancellationRequested && !token.isCancellationRequested) {
				throw invalidConnectorPage();
			}
			throw error;
		} finally {
			operation.dispose();
		}
	}

	async refresh(token: CancellationToken): Promise<readonly ICopilotConnector[]> {
		if (!this.isEnabled()) {
			return [];
		}
		const generation = ++this.refreshGeneration;
		const operation = await this.createOperation(token);
		try {
			const { document, scoped } = await this.query(operation.token);
			if (operation.token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (document === undefined) {
				if (generation === this.refreshGeneration) {
					this.setConnectors([], false);
					this.reportCatalogSnapshot([], 'unavailable');
				}
				return this._connectors;
			}
			const connectors = parseConnectors(document);
			if (operation.token.isCancellationRequested || !this.isEnabled()) {
				throw new CancellationError();
			}
			if (generation !== this.refreshGeneration) {
				return this._connectors;
			}
			this._lastRefreshTime = Date.now();
			const connectedMembershipChanged = this.setConnectors(connectors, true, scoped);
			this.reportCatalogSnapshot(this._connectors, scoped ? 'scoped' : 'unscoped');
			if (connectedMembershipChanged) {
				await this.refreshAgentHostConnectorSessions();
			}
			return this._connectors;
		} finally {
			operation.dispose();
		}
	}

	async connect(name: string, token: CancellationToken): Promise<void> {
		await this.trackConnectionAction('connect', name, async () => {
			await this.authorize(token);
			const operation = await this.createOperation(token);
			try {
				const connectors = await this.refresh(operation.token);
				if (operation.token.isCancellationRequested) {
					throw new CancellationError();
				}
				const initialStatus = connectors.find(connector => connector.name === name)?.connectionStatus;
				if (initialStatus === 'connected') {
					await this.refreshAgentHostConnectorSessions(name);
					return;
				}
				const document = await this.withClient(
					await this.getAuthentication(operation.token, true),
					operation.token,
					(client, signal, deadline) => client.connectors.connect(name, signal, { caller: 'copilotConnectors.connect', deadline })
				);
				const consentLink = parseHttpsUri(document.consent_link);
				if (consentLink && !await this.openerService.open(consentLink)) {
					throw new CopilotConnectorsError(localize('copilotConnectors.openConsentFailed', "The connector authorization page could not be opened."));
				}

				// The catalog may briefly report the pre-connect state after the PUT, and the user may
				// legitimately take a long time on the consent page. So `not_connected` (and an `error`
				// that was already present before connecting) is only treated as terminal once this
				// connect has been observed as `pending`; a new `error` is terminal immediately.
				let observedPending = false;
				const deadline = Date.now() + connectionTimeout;
				while (Date.now() < deadline) {
					const refreshed = await this.refresh(operation.token);
					const connector = refreshed.find(connector => connector.name === name);
					switch (connector?.connectionStatus) {
						case 'connected':
							return;
						case 'pending':
							observedPending = true;
							break;
						case 'error':
							if (observedPending || initialStatus !== 'error') {
								throw createConnectionFailedError(connector);
							}
							break;
						case 'not_connected':
							if (observedPending) {
								throw createConnectionFailedError(connector);
							}
							break;
					}
					await timeout(connectionPollInterval, operation.token);
				}
				throw new CopilotConnectorsError(localize('copilotConnectors.connectionTimedOut', "Connector authorization did not finish in time. Complete authorization in the browser, then try again."));
			} finally {
				operation.dispose();
			}
		});
	}

	async checkConnection(token: CancellationToken): Promise<void> {
		await this.refresh(token);
	}

	async disconnect(name: string, token: CancellationToken): Promise<void> {
		await this.trackConnectionAction('disconnect', name, async () => {
			await this.authorize(token);
			const operation = await this.createOperation(token);
			try {
				await this.withClient(
					await this.getAuthentication(operation.token, true),
					operation.token,
					(client, signal, deadline) => client.connectors.disconnect(
						name,
						signal,
						{ caller: 'copilotConnectors.disconnect', deadline }
					)
				);
				const deadline = Date.now() + connectionTimeout;
				while (Date.now() < deadline) {
					const connectors = await this.refresh(operation.token);
					if (!connectors.some(connector => connector.name === name && connector.connectionStatus === 'connected')) {
						this._onDidDisconnect.fire(name);
						return;
					}
					await timeout(connectionPollInterval, operation.token);
				}
				throw new CopilotConnectorsError(localize('copilotConnectors.disconnectionTimedOut', "The connector did not disconnect in time. Try again."));
			} finally {
				operation.dispose();
			}
		});
	}

	private async trackConnectionAction(action: 'connect' | 'disconnect', name: string, operation: () => Promise<void>): Promise<void> {
		const startTime = Date.now();
		const connectionStatusBefore = this.getConnectionStatus(name);
		try {
			await operation();
			this.reportConnectionAction(action, name, 'success', connectionStatusBefore, Date.now() - startTime);
		} catch (error) {
			this.reportConnectionAction(action, name, isCancellationError(error) ? 'cancelled' : 'error', connectionStatusBefore, Date.now() - startTime, error);
			throw error;
		}
	}

	private reportConnectionAction(
		action: 'connect' | 'disconnect',
		name: string,
		outcome: 'success' | 'error' | 'cancelled',
		connectionStatusBefore: CopilotConnectorConnectionStatus | 'not_loaded',
		durationMs: number,
		error?: unknown,
	): void {
		const connector = this._connectors.find(connector => connector.name === name);
		this.telemetryService.publicLog2<CopilotConnectorConnectionActionEvent, CopilotConnectorConnectionActionClassification>('copilotConnectors.connectionAction', {
			action,
			outcome,
			connectionStatusBefore,
			connectionStatusAfter: connector?.connectionStatus ?? 'not_loaded',
			durationMs,
			connectorMcpServerCount: connector?.mcpServers.length,
			httpStatusCode: error instanceof CopilotConnectorsError ? error.statusCode : undefined,
		});
	}

	private getConnectionStatus(name: string): CopilotConnectorConnectionStatus | 'not_loaded' {
		return this._connectors.find(connector => connector.name === name)?.connectionStatus ?? 'not_loaded';
	}

	private reportCatalogSnapshot(connectors: readonly ICopilotConnector[], catalogAccess: CopilotConnectorsCatalogAccess): void {
		const data: CopilotConnectorsCatalogSnapshotEvent = {
			catalogAccess,
			connectorCount: connectors.length,
			connectedConnectorCount: connectors.filter(connector => connector.connectionStatus === 'connected').length,
			notConnectedConnectorCount: connectors.filter(connector => connector.connectionStatus === 'not_connected').length,
			pendingConnectorCount: connectors.filter(connector => connector.connectionStatus === 'pending').length,
			errorConnectorCount: connectors.filter(connector => connector.connectionStatus === 'error').length,
			unknownConnectorCount: connectors.filter(connector => connector.connectionStatus === 'unknown').length,
			mcpServerCount: connectors.reduce((total, connector) => total + connector.mcpServers.length, 0),
			connectedMcpServerCount: connectors.reduce((total, connector) => total + (connector.connectionStatus === 'connected' ? connector.mcpServers.length : 0), 0),
		};
		const snapshot = JSON.stringify(data);
		if (snapshot === this.lastReportedCatalogSnapshot) {
			return;
		}
		this.lastReportedCatalogSnapshot = snapshot;
		this.telemetryService.publicLog2<CopilotConnectorsCatalogSnapshotEvent, CopilotConnectorsCatalogSnapshotClassification>('copilotConnectors.catalogSnapshot', data);
	}

	private updateEnablement(): void {
		const enabled = this.isEnabled();
		if (enabled === this.enabled) {
			return;
		}
		this.enabled = enabled;
		if (enabled) {
			const listeners = new DisposableStore();
			this.enabledListeners.value = listeners;
			listeners.add(this.defaultAccountService.onDidChangeDefaultAccount(account => this.updateAccountIdentity(account)));
			listeners.add(this.authenticationService.onDidChangeSessions(({ providerId, event }) => this.handleAuthenticationSessionsChanged(providerId, event)));
			this.updateAccountIdentity(this.defaultAccountService.currentDefaultAccount);
		} else {
			this.enabledListeners.clear();
			this.authorizationCancellation.value?.cancel();
		}
		this.resetCatalogContext();
	}

	private resetCatalogContext(): void {
		this.catalogContext.value?.cancel();
		this.apiClient.clear();
		const cancellation = this.catalogContext.value = new CancellationTokenSource();
		if (!this.enabled) {
			cancellation.cancel();
		}
		this._authorizationRequired = false;
		this._lastRefreshTime = 0;
		this.lastReportedCatalogSnapshot = undefined;
		this.setConnectors([], false);
	}

	private handleAuthenticationSessionsChanged(providerId: string, event: AuthenticationSessionsChangeEvent): void {
		const account = this.defaultAccountService.currentDefaultAccount;
		if (!account || account.authenticationProvider.id !== providerId) {
			return;
		}
		const affectedSessions = [...event.added ?? [], ...event.changed ?? [], ...event.removed ?? []];
		const authenticationAccountId = this.authenticationAccountId
			?? affectedSessions.find(session => session.id === account.sessionId || session.account.label === account.accountName)?.account.id;
		if (!authenticationAccountId || !affectedSessions.some(session =>
			session.id === account.sessionId ||
			session.account.id === authenticationAccountId && (hasConnectorScope(session, true) || this.connectorAuthorizationSessionIds.has(session.id)))) {
			return;
		}
		this.authenticationAccountId = authenticationAccountId;
		const connectorAuthorizationChanged = this.updateConnectorAuthorizationSessions(event, authenticationAccountId);
		this.resetCatalogContext();
		if (connectorAuthorizationChanged) {
			void this.refreshAgentHostConnectorSessions();
		}
	}

	private updateConnectorAuthorizationSessions(event: AuthenticationSessionsChangeEvent, accountId: string): boolean {
		const wasAuthorized = this.connectorAuthorizationSessionIds.size > 0;
		for (const session of event.removed ?? []) {
			this.connectorAuthorizationSessionIds.delete(session.id);
		}
		for (const session of [...event.changed ?? [], ...event.added ?? []]) {
			if (session.account.id === accountId && hasConnectorScope(session, false)) {
				this.connectorAuthorizationSessionIds.add(session.id);
			} else {
				this.connectorAuthorizationSessionIds.delete(session.id);
			}
		}
		return wasAuthorized !== (this.connectorAuthorizationSessionIds.size > 0);
	}

	private replaceConnectorAuthorizationSessions(sessions: readonly AuthenticationSession[], accountId: string): void {
		this.connectorAuthorizationSessionIds.clear();
		for (const session of sessions) {
			if (session.account.id === accountId && hasConnectorScope(session, false)) {
				this.connectorAuthorizationSessionIds.add(session.id);
			}
		}
	}

	private updateAccountIdentity(account: IDefaultAccount | null): void {
		const identity = getAccountIdentity(account);
		if (identity !== this.accountIdentity) {
			this.accountIdentity = identity;
			this.authenticationAccountId = undefined;
			this.connectorAuthorizationSessionIds.clear();
			this.resetCatalogContext();
			this._onDidChangeAccount.fire();
		}
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled) === true;
	}

	private async createOperation(token: CancellationToken): Promise<{ readonly token: CancellationToken; readonly cacheToken: CancellationToken; dispose(): void }> {
		if (!this.isEnabled() || token.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
		if (!this.defaultAccountService.currentDefaultAccount) {
			await raceCancellationError(this.defaultAccountService.getDefaultAccount(), token);
		}
		this.updateEnablement();
		this.updateAccountIdentity(this.defaultAccountService.currentDefaultAccount);
		const cacheToken = this.catalogContext.value?.token ?? CancellationToken.Cancelled;
		if (!this.isEnabled() || token.isCancellationRequested || cacheToken.isCancellationRequested) {
			throw new CancellationError();
		}
		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(token));
		store.add(cacheToken.onCancellationRequested(() => cancellation.cancel()));
		return {
			token: cancellation.token,
			cacheToken,
			dispose: () => store.dispose(),
		};
	}

	private async query(token: CancellationToken): Promise<{ readonly document: ConnectorCatalog | undefined; readonly scoped: boolean }> {
		const authentication = await this.getAuthentication(token, false);
		if (!authentication) {
			return { document: undefined, scoped: false };
		}
		const scoped = authentication.sessions.some(session => hasConnectorScope(session, true));
		try {
			const document = await this.withClient(
				authentication,
				token,
				(client, signal, deadline) => client.connectors.getCatalog(
					signal,
					{ caller: 'copilotConnectors.query', deadline }
				),
				true
			);
			return { document, scoped };
		} catch (error) {
			if (!token.isCancellationRequested && !scoped && error instanceof CopilotConnectorsError && error.statusCode === 403) {
				throw new CopilotConnectorsError(localize('copilotConnectors.catalogScopeRollout', "The connector catalog is unavailable for this account (HTTP 403)."), 403);
			}
			throw error;
		}
	}

	private async withClient<T>(
		authentication: ICopilotConnectorsAuthentication | undefined,
		token: CancellationToken,
		task: (client: IGitHubAccountClient, signal: AbortSignal, deadline: number) => Promise<T>,
		readOnly = false,
	): Promise<T> {
		if (!authentication) {
			throw connectorSignInRequired();
		}
		const session = authentication.sessions.find(session => hasConnectorScope(session, readOnly));
		const selectedSession = session ?? (readOnly ? authentication.session : undefined);
		if (!selectedSession) {
			this._authorizationRequired = true;
			throw connectorSignInRequired();
		}
		this._authorizationRequired = false;
		const authorization: GitHubAuthorizationContext = {
			providerId: authentication.account.authenticationProvider.id,
			sessionId: selectedSession.id, accountId: selectedSession.account.id, scopes: selectedSession.scopes,
			authorizationServer: selectedSession.authorizationServer?.toString(),
		};
		const lifetime = new DisposableStore();
		const cancellation = lifetime.add(new CancellationTokenSource(token));
		const deadline = Date.now() + requestTimeout;
		lifetime.add(disposableTimeout(() => cancellation.cancel(), requestTimeout));
		const signal = CancellationToken.toAbortSignal(cancellation.token, lifetime);
		const run = async () => {
			signal.throwIfAborted();
			let client = this.apiClient.value?.object;
			if (!client || !isEqualAuthorization(client.authorization, authorization)) {
				const clientLifetime = new DisposableStore();
				try {
					const acquired = clientLifetime.add(await this.gitHubService.acquireAccountApiClient(authorization, signal));
					signal.throwIfAborted();
					const existing = this.apiClient.value?.object;
					if (existing && isEqualAuthorization(existing.authorization, authorization)) {
						clientLifetime.dispose();
						client = existing;
					} else {
						clientLifetime.add(Event.once(acquired.onDidInvalidate)(() => this.resetCatalogContext()));
						this.apiClient.value = { object: acquired, dispose: () => clientLifetime.dispose() };
						client = acquired;
					}
				} catch (error) {
					clientLifetime.dispose();
					throw error;
				}
			}
			return task(client, signal, deadline);
		};
		try {
			const result = await raceCancellationError(run(), cancellation.token);
			signal.throwIfAborted();
			return result;
		} catch (error) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			this.logService.error('[CopilotConnectorsService] Request failed', error);
			throw toCopilotConnectorsError(error, cancellation.token.isCancellationRequested);
		} finally {
			lifetime.dispose();
		}
	}

	private async getAuthentication(token: CancellationToken, requireAuthentication: boolean): Promise<ICopilotConnectorsAuthentication | undefined> {
		if (!this.isEnabled() || token.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
		const endpoint = this.productService.defaultChatAgent?.mcpConnectorsUrl;
		if (!endpoint || !isHttpsUrl(endpoint)) {
			if (requireAuthentication) {
				throw new CopilotConnectorsError(localize('copilotConnectors.unavailable', "Copilot connectors are not available in this product."));
			}
			return undefined;
		}
		const provider = this.defaultAccountService.getDefaultAccountAuthenticationProvider();
		if (provider.enterprise) {
			if (requireAuthentication) {
				throw new CopilotConnectorsError(localize('copilotConnectors.enterpriseUnavailable', "Copilot connectors are not available for this GitHub Enterprise account."));
			}
			return undefined;
		}
		const account = this.defaultAccountService.currentDefaultAccount ?? await raceCancellationError(this.defaultAccountService.getDefaultAccount(), token);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const sessions = await raceCancellationError(this.authenticationService.getSessions(provider.id, [], { silent: true }, true), token);
		if (token.isCancellationRequested || !this.isEnabled() || this._store.isDisposed || getAccountIdentity(account) !== getAccountIdentity(this.defaultAccountService.currentDefaultAccount)) {
			throw new CancellationError();
		}
		const session = account ? sessions.find(candidate => candidate.id === account.sessionId) : undefined;
		if (!account || !session) {
			this._authorizationRequired = true;
			return undefined;
		}
		this.authenticationAccountId = session.account.id;
		this.replaceConnectorAuthorizationSessions(sessions, session.account.id);
		return {
			account,
			session,
			sessions: [session, ...sessions.filter(candidate => candidate.id !== session.id && candidate.account.id === session.account.id)],
		};
	}

	private setConnectors(connectors: readonly ICopilotConnector[], connectionStateKnown: boolean, connectionStateAuthorized = false): boolean {
		const previousConnected = this._connectionStateAuthorized ? connectedConnectorConfigurations(this._connectors) : [];
		const nextConnected = connectionStateAuthorized ? connectedConnectorConfigurations(connectors) : [];
		const connectedMembershipChanged = connectionStateAuthorized && (!this._connectionStateAuthorized || !equals(previousConnected, nextConnected));
		if (equals(this._connectors, connectors) && this._connectionStateKnown === connectionStateKnown && this._connectionStateAuthorized === connectionStateAuthorized) {
			return false;
		}
		this._connectors = connectors;
		this._connectionStateKnown = connectionStateKnown;
		this._connectionStateAuthorized = connectionStateAuthorized;
		this._onDidChange.fire();
		return connectedMembershipChanged;
	}

	refreshAgentHostSessions(forceConnectorName?: string): Promise<void> {
		return this.refreshAgentHostConnectorSessions(forceConnectorName);
	}

	private async refreshAgentHostConnectorSessions(forceConnectorName?: string): Promise<void> {
		if (!this.isEnabled() || this._store.isDisposed || !this.agentHostService.refreshCopilotConnectorSessions) {
			return;
		}
		try {
			await this.agentHostService.refreshCopilotConnectorSessions(forceConnectorName);
		} catch (error) {
			this.logService.warn('[CopilotConnectorsService] Unable to refresh live Agent Host sessions', error);
		}
	}

	override dispose(): void {
		this.catalogContext.value?.cancel();
		this.authorizationCancellation.value?.cancel();
		super.dispose();
	}
}

function hasConnectorScope(session: AuthenticationSession, readOnly: boolean): boolean {
	return session.scopes.includes(copilotConnectorsScope) || readOnly && session.scopes.includes('read:plugin_gateway_connections');
}

interface IConnectorContinuation {
	readonly query: string;
	readonly mediaType?: CustomizationMarketplaceMediaType;
	readonly pageSize: number;
	readonly entries: readonly ICustomizationMarketplaceEntry[];
	readonly offset: number;
	readonly expiresAt: number;
	readonly cacheToken: CancellationToken;
}

export class CopilotConnectorsMarketplaceProvider implements ICustomizationMarketplaceProvider {
	readonly id = CustomizationMarketplaceSources.CopilotConnectors.id;
	private readonly continuations = new LRUCache<string, IConnectorContinuation>(32);

	constructor(
		private readonly service: ICopilotConnectorsService,
		private readonly configurationService: IConfigurationService,
	) { }

	async query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled) !== true ||
			(options.mediaType !== undefined && options.mediaType !== CustomizationMarketplaceMediaType.McpServer)) {
			if (options.cursor !== undefined) {
				throw invalidConnectorPage();
			}
			return { items: [], total: 0 };
		}
		const text = options.query?.trim() ?? '';
		const words = text ? text.toLowerCase().split(/\s+/) : [];
		const requestedPageSize = options.pageSize ?? 30;
		if (text.length > maxSearchQueryLength || words.length > maxSearchWords || !Number.isSafeInteger(requestedPageSize) || requestedPageSize <= 0) {
			throw new CopilotConnectorsError(localize('copilotConnectors.invalidQuery', "Use a positive page size and at most {0} characters and {1} words to search Copilot connectors.", maxSearchQueryLength, maxSearchWords));
		}
		const pageSize = Math.min(requestedPageSize, 100);
		for (const [key, value] of [...this.continuations]) {
			if (value.expiresAt <= Date.now() || value.cacheToken.isCancellationRequested) {
				this.continuations.delete(key);
			}
		}
		let continuation = options.cursor === undefined ? undefined : this.continuations.get(options.cursor);
		if (options.cursor !== undefined && (!continuation || continuation.query !== text || continuation.mediaType !== options.mediaType || continuation.pageSize !== pageSize)) {
			throw invalidConnectorPage();
		}
		if (!continuation) {
			const { connectors, cacheToken } = await raceCancellationError(this.service.getConnectorsSnapshot(token), token);
			if (this.service.authorizationRequired) {
				throw connectorSignInRequired();
			}
			const entries = words.length ? connectors.flatMap(connector => {
				const score = scoreConnector(connector, words);
				return score === undefined ? [] : [{ ...toCopilotConnectorMarketplaceEntry(connector), score }];
			}).sort((a, b) => b.score - a.score) : connectors.map(connector => toCopilotConnectorMarketplaceEntry(connector));
			continuation = { query: text, mediaType: options.mediaType, pageSize, entries, offset: 0, cacheToken, expiresAt: Date.now() + 30 * 60_000 };
		}
		if (continuation.cacheToken.isCancellationRequested) {
			throw invalidConnectorPage();
		}
		const page = continuation.entries.slice(continuation.offset, continuation.offset + pageSize);
		const offset = continuation.offset + page.length;
		const nextCursor = offset < continuation.entries.length ? generateUuid() : undefined;
		if (nextCursor) {
			this.continuations.set(nextCursor, { ...continuation, offset });
		}
		return {
			items: page,
			total: continuation.entries.length,
			nextCursor,
			cacheToken: continuation.cacheToken,
		};
	}
}

function getAccountIdentity(account: IDefaultAccount | null): string | undefined {
	return account ? JSON.stringify([account.authenticationProvider.id, account.authenticationProvider.enterprise, account.accountName, account.sessionId]) : undefined;
}

function connectedConnectorConfigurations(connectors: readonly ICopilotConnector[]): string[] {
	return connectors
		.filter(connector => connector.connectionStatus === 'connected')
		.map(connector => JSON.stringify([connector.name, connector.displayName, connector.mcpServers.map(server => [server.name, server.type, server.url?.toString()]).sort()]))
		.sort();
}

function toCopilotConnectorsError(error: unknown, timedOut: boolean): CopilotConnectorsError {
	if (timedOut || error instanceof GitHubRequestError && error.kind === 'timeout') {
		return new CopilotConnectorsError(localize('copilotConnectors.timeout', "The Copilot connectors request timed out. Try again."));
	}
	if (error instanceof SchemaError || error instanceof GitHubRequestError && error.kind === 'malformedResponse' && error.statusCode !== undefined && error.statusCode >= 200 && error.statusCode < 300) {
		return new CopilotConnectorsError(localize('copilotConnectors.invalidJson', "Copilot connectors returned an invalid response."));
	}
	if (error instanceof GitHubRequestError) {
		if (error.kind === 'responseTooLarge') {
			return new CopilotConnectorsError(localize('copilotConnectors.responseTooLarge', "The Copilot connectors response is too large."));
		}
		if (error.statusCode !== undefined) {
			return new CopilotConnectorsError(localize('copilotConnectors.httpError', "Copilot connectors could not complete the request (HTTP {0}).", error.statusCode), error.statusCode);
		}
		if (error.kind === 'validation') {
			return new CopilotConnectorsError(localize('copilotConnectors.unavailable', "Copilot connectors are not available in this product."));
		}
	}
	return new CopilotConnectorsError(localize('copilotConnectors.requestFailed', "Copilot connectors could not be reached. Check your connection and try again."));
}

function invalidConnectorPage(): CopilotConnectorsError {
	return new CopilotConnectorsError(localize('copilotConnectors.invalidCursor', "The Copilot connectors page is invalid. Start a new search."));
}

function connectorSignInRequired(): CopilotConnectorsError {
	return new CopilotConnectorsError(localize('copilotConnectors.signInRequired', "Sign in to view connectors."));
}

/** Exact names score 100; otherwise average each word's best name (70-95), keyword (40-65), or descriptive (10-35) match. */
function scoreConnector(connector: ICopilotConnector, words: readonly string[]): number | undefined {
	const names = [connector.name, connector.displayName];
	if (names.some(name => name.toLowerCase().replace(/\s+/g, ' ') === words.join(' '))) {
		return 100;
	}
	const fields = [
		{ values: names, weight: 70 },
		{ values: [...connector.keywords, ...connector.capabilities, ...connector.tags], weight: 40 },
		{ values: [connector.description, ...connector.representativeQueries], weight: 10 },
	];
	let total = 0;
	for (const word of words) {
		let best: number | undefined;
		for (const { values, weight } of fields) {
			for (const value of values) {
				const score = scoreConnectorField(word, value);
				if (score !== undefined) {
					best = Math.max(best ?? 0, weight + score);
				}
			}
			if (best !== undefined) {
				break;
			}
		}
		if (best === undefined) {
			return undefined;
		}
		total += best;
	}
	return Math.round(total / words.length);
}

function scoreConnectorField(word: string, value: string): number | undefined {
	const index = value.toLowerCase().indexOf(word);
	if (index >= 0) {
		return value.length === word.length ? 25 : index === 0 ? 20 : 15;
	}
	// The fuzzy helper truncates at 128 characters; longer words must match contiguously, never by a truncated prefix.
	if (word.length > fuzzyWindowSize) {
		return undefined;
	}
	let best: number | undefined;
	for (let start = 0; start < value.length; start += fuzzyWindowSize / 2) {
		const matches = matchesFuzzy2(word, value.slice(start, start + fuzzyWindowSize));
		if (matches?.length) {
			const span = matches[matches.length - 1].end - matches[0].start;
			best = Math.max(best ?? 0, Math.round(10 * word.length / span));
		}
	}
	return best;
}

export function toCopilotConnectorMarketplaceEntry(connector: ICopilotConnector): ICustomizationMarketplaceEntry {
	const publisherUrl = connector.homepage ?? connector.author?.url;
	return {
		identifier: connector.name,
		displayName: connector.displayName,
		description: connector.description,
		mediaType: CustomizationMarketplaceMediaType.McpServer,
		tags: connector.tags,
		capabilities: connector.capabilities,
		representativeQueries: connector.representativeQueries,
		connectorIds: [...new Set([connector.name, ...connector.mcpServers.map(server => server.name)])],
		url: connector.documentation,
		externalUrl: connector.documentation?.toString(true),
		icon: connector.icon,
		publisher: localize('copilotConnectors.publisher', "GitHub Copilot"),
		...(publisherUrl ? { publisherUrl } : {}),
		installation: { kind: 'copilotConnector', name: connector.name },
	};
}

/**
 * Describes why a connect attempt ended in a terminal, non-connected state, using the same
 * vocabulary as the connector status labels.
 */
function createConnectionFailedError(connector: ICopilotConnector): CopilotConnectorsError {
	const displayName = connector.displayName;
	if (connector.connectionStatus === 'not_connected') {
		return new CopilotConnectorsError(localize('copilotConnectors.connectionDeclined', "Authorization for {0} was declined.", displayName));
	}
	let message: string;
	switch (connector.connectionStatusDetail) {
		case 'review_required':
			message = localize('copilotConnectors.connectionReviewRequired', "Review required: {0} needs to be reviewed before it can be connected.", displayName);
			break;
		case 'reconnect_required':
			message = localize('copilotConnectors.connectionReconnectRequired', "Reconnect required: authorization for {0} did not complete. Reconnect to try again.", displayName);
			break;
		case 'sign_in_required':
			message = localize('copilotConnectors.connectionSignInRequired', "Sign in required: sign in to {0}, then try again.", displayName);
			break;
		case 'unavailable':
			message = localize('copilotConnectors.connectionUnavailable', "{0} is currently unavailable.", displayName);
			break;
		case 'retryable_error':
			message = localize('copilotConnectors.connectionRetryableError', "Connection to {0} failed. Try again.", displayName);
			break;
		default:
			message = localize('copilotConnectors.connectionError', "{0} reported an error.", displayName);
			break;
	}
	return new CopilotConnectorsError(connector.connectionErrorMessage
		? localize('copilotConnectors.connectionErrorWithMessage', "{0} {1}", message, connector.connectionErrorMessage)
		: message);
}

function parseConnectors({ plugins }: ConnectorCatalog): readonly ICopilotConnector[] {
	if (plugins.length > maxConnectors) {
		throw new CopilotConnectorsError(localize('copilotConnectors.invalidResponse', "Copilot connectors returned an invalid response."));
	}
	const connectors: ICopilotConnector[] = [];
	for (const plugin of plugins) {
		const name = text(plugin.name, 512);
		if (!name) {
			continue;
		}
		const { metadata, connection } = plugin;
		const displayName = text(metadata.displayName) ?? name;
		const description = text(plugin.description) ?? localize('copilotConnectors.defaultDescription', "Connect {0} to GitHub Copilot.", displayName);
		const mcpServerEntries = Object.entries(plugin.mcpServers.mcpServers);
		if (mcpServerEntries.length > maxMcpServersPerConnector) {
			throw new CopilotConnectorsError(localize('copilotConnectors.invalidResponse', "Copilot connectors returned an invalid response."));
		}
		connectors.push({
			name,
			displayName,
			description,
			icon: parseHttpsUri(plugin.logo),
			documentation: parseHttpsUri(plugin.homepage),
			homepage: parseHttpsUri(plugin.homepage),
			version: text(plugin.version, 512),
			author: parseAuthor(plugin.author),
			repository: parseHttpsUri(plugin.repository),
			license: text(plugin.license, 512),
			tags: [],
			keywords: strings(plugin.keywords),
			capabilities: strings(metadata.capabilities),
			representativeQueries: [],
			tier: text(metadata.tier, 128),
			releaseTag: text(metadata.releaseTag, 128),
			isExportSupported: metadata.isExportSupported,
			connectionStatus: connection.status,
			protectedResourceMetadataUrl: text(connection.protectedResourceMetadataUrl),
			scopes: strings(connection.scopes),
			mcpServers: mcpServerEntries.flatMap(([serverName, server]) => {
				const url = parseHttpsUri(server.url);
				return serverName.length <= 512 && server.type === 'http' && url
					? [{ name: serverName, type: server.type, url }]
					: [];
			}),
		});
	}

	function parseAuthor(author: ConnectorPlugin['author']): ICopilotConnectorAuthor | undefined {
		const result: ICopilotConnectorAuthor = {
			name: text(author.name, 512),
			email: text(author.email, 512),
			url: parseHttpsUri(author.url),
		};
		return result.name || result.email || result.url ? result : undefined;
	}

	return connectors;
}

function text(value: unknown, maxLength = maxTextLength): string | undefined {
	if (typeof value !== 'string' || value.length > maxLength) {
		return undefined;
	}
	return value.trim() || undefined;
}

function strings(value: unknown): readonly string[] {
	if (!Array.isArray(value) || value.length > maxMetadataEntries) {
		return [];
	}
	return value.map(item => text(item, 512)).filter((item): item is string => item !== undefined);
}

function parseHttpsUri(value: unknown): URI | undefined {
	const raw = text(value, 8192);
	if (!raw || !isHttpsUrl(raw)) {
		return undefined;
	}
	try {
		return URI.parse(raw, true);
	} catch {
		return undefined;
	}
}

function isHttpsUrl(value: string): boolean {
	if (!value || value.trim() !== value) {
		return false;
	}
	try {
		const url = new URL(value);
		return url.protocol === `${Schemas.https}:` && !!url.hostname;
	} catch {
		return false;
	}
}
