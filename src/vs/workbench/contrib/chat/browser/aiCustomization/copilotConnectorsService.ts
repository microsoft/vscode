/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../../../base/common/arrays.js';
import { raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { matchesFuzzy2 } from '../../../../../base/common/filters.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { equals } from '../../../../../base/common/objects.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { CopilotConnectorsError, CopilotConnectorsRequest, copilotConnectorsScope, ICopilotConnectorsRequestService } from '../../../../../platform/copilotConnectors/common/copilotConnectorsRequestService.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceEntry, ICustomizationMarketplaceProvider, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';

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

export interface ICopilotConnectorMcpServer {
	readonly name: string;
	readonly type: string;
	readonly url?: URI;
}

export type CopilotConnectorConnectionStatus = 'unknown' | 'not_connected' | 'pending' | 'connected' | 'error';
export type CopilotConnectorConnectionStatusDetail = 'sign_in_required' | 'reconnect_required' | 'review_required' | 'retryable_error' | 'unavailable';

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
	readonly agents: readonly string[];
	readonly commands: readonly string[];
	readonly skills: readonly string[];
	readonly connectionStatus: CopilotConnectorConnectionStatus;
	readonly connectionStatusDetail?: CopilotConnectorConnectionStatusDetail;
	readonly connectionErrorMessage?: string;
	readonly protectedResourceMetadataUrl?: string;
	readonly scopes: readonly string[];
	readonly mcpServers: readonly ICopilotConnectorMcpServer[];
}

export interface IConnectedCopilotConnectorMcpServer {
	readonly connector: ICopilotConnector;
	readonly serverName: string;
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
	readonly connectors: readonly ICopilotConnector[];
	readonly connectedMcpServers: readonly IConnectedCopilotConnectorMcpServer[];
	readonly authorizationRequired: boolean;
	readonly catalogMayRequireConsent: boolean;
	/** Signs in for catalog browsing without requesting connector permission. */
	signIn(token: CancellationToken): Promise<void>;
	/** Signs in if needed, then requests connector consent after an explicit user action. */
	authorize(token: CancellationToken): Promise<void>;
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
	private readonly catalogContext = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly authorizationCancellation = this._register(new MutableDisposable<CancellationTokenSource>());
	private authorizationPromise: Promise<void> | undefined;
	private enabled = false;
	private accountIdentity: string | undefined;
	private authenticationAccountId: string | undefined;
	private _authorizationRequired = false;
	private _catalogMayRequireConsent = false;
	private _connectors: readonly ICopilotConnector[] = [];
	private _lastRefreshTime = 0;

	constructor(
		@ICopilotConnectorsRequestService private readonly requestService: ICopilotConnectorsRequestService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IProductService private readonly productService: IProductService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();
		this.accountIdentity = getAccountIdentity(this.defaultAccountService.currentDefaultAccount);
		this.updateEnablement();
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled)) {
				this.updateEnablement();
			}
		}));
		this._register(this.defaultAccountService.onDidChangeDefaultAccount(account => this.updateAccountIdentity(account)));
		this._register(this.authenticationService.onDidChangeSessions(({ providerId, event }) => {
			const account = this.defaultAccountService.currentDefaultAccount;
			if (account?.authenticationProvider.id === providerId &&
				[event.added, event.changed, event.removed].some(sessions => sessions?.some(session =>
					session.id === account.sessionId || session.account.id === this.authenticationAccountId && hasConnectorScope(session, true)))) {
				this.resetCatalogContext();
			}
		}));
	}

	get connectors(): readonly ICopilotConnector[] {
		return this._connectors;
	}

	get authorizationRequired(): boolean {
		return this.isEnabled() && (this._authorizationRequired || this._catalogMayRequireConsent);
	}

	get catalogMayRequireConsent(): boolean {
		return this.isEnabled() && this._catalogMayRequireConsent;
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

	async authorize(token: CancellationToken): Promise<void> {
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
		await raceCancellationError(this.authorizationPromise, token);
	}

	private async doAuthorize(cancellation: CancellationTokenSource): Promise<void> {
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
		if (authentication.sessions.some(session => hasConnectorScope(session, false))) {
			this._authorizationRequired = false;
			return;
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
		} finally {
			store.dispose();
		}
	}

	get connectedMcpServers(): readonly IConnectedCopilotConnectorMcpServer[] {
		const result: IConnectedCopilotConnectorMcpServer[] = [];
		const serverNames = new Set<string>();
		for (const connector of this._connectors) {
			if (connector.connectionStatus !== 'connected') {
				continue;
			}
			for (const server of connector.mcpServers) {
				if (!serverNames.has(server.name)) {
					serverNames.add(server.name);
					result.push({ connector, serverName: server.name });
				}
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
		const operation = await this.createOperation(token);
		try {
			const { document, scoped } = await this.request({ type: 'query' }, operation.token);
			if (operation.token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (document === undefined) {
				this.setConnectors([]);
				return this._connectors;
			}
			const connectors = parseConnectors(document, scoped);
			if (operation.token.isCancellationRequested || !this.isEnabled()) {
				throw new CancellationError();
			}
			this._lastRefreshTime = Date.now();
			this.setConnectors(connectors);
			return this._connectors;
		} finally {
			operation.dispose();
		}
	}

	async connect(name: string, token: CancellationToken): Promise<void> {
		await this.authorize(token);
		const operation = await this.createOperation(token);
		try {
			const connectors = await this.refresh(operation.token);
			if (connectors.some(connector => connector.name === name && connector.connectionStatus === 'connected')) {
				return;
			}
			const { document } = await this.request({ type: 'connect', name }, operation.token, true);
			const consentLink = parseHttpsUri(asRecord(document)?.consent_link);
			if (consentLink && !await this.openerService.open(consentLink)) {
				throw new CopilotConnectorsError(localize('copilotConnectors.openConsentFailed', "The connector authorization page could not be opened."));
			}

			const deadline = Date.now() + connectionTimeout;
			while (Date.now() < deadline) {
				const refreshed = await this.refresh(operation.token);
				if (refreshed.some(connector => connector.name === name && connector.connectionStatus === 'connected')) {
					return;
				}
				await timeout(connectionPollInterval, operation.token);
			}
			throw new CopilotConnectorsError(localize('copilotConnectors.connectionTimedOut', "Connector authorization did not finish in time. Complete authorization in the browser, then try again."));
		} finally {
			operation.dispose();
		}
	}

	async checkConnection(token: CancellationToken): Promise<void> {
		await this.authorize(token);
		await this.refresh(token);
	}

	async disconnect(name: string, token: CancellationToken): Promise<void> {
		await this.authorize(token);
		const operation = await this.createOperation(token);
		try {
			await this.request({ type: 'disconnect', name }, operation.token, true);
			const deadline = Date.now() + connectionTimeout;
			while (Date.now() < deadline) {
				const connectors = await this.refresh(operation.token);
				if (!connectors.some(connector => connector.name === name && connector.connectionStatus === 'connected')) {
					return;
				}
				await timeout(connectionPollInterval, operation.token);
			}
			throw new CopilotConnectorsError(localize('copilotConnectors.disconnectionTimedOut', "The connector did not disconnect in time. Try again."));
		} finally {
			operation.dispose();
		}
	}

	private updateEnablement(): void {
		const enabled = this.isEnabled();
		if (enabled === this.enabled) {
			return;
		}
		this.enabled = enabled;
		if (!enabled) {
			this.authorizationCancellation.value?.cancel();
		}
		this.resetCatalogContext();
	}

	private resetCatalogContext(): void {
		this.catalogContext.value?.cancel();
		const cancellation = this.catalogContext.value = new CancellationTokenSource();
		if (!this.enabled) {
			cancellation.cancel();
		}
		this._authorizationRequired = false;
		this._catalogMayRequireConsent = false;
		this._lastRefreshTime = 0;
		this.setConnectors([]);
	}

	private updateAccountIdentity(account: IDefaultAccount | null): void {
		const identity = getAccountIdentity(account);
		if (identity !== this.accountIdentity) {
			this.accountIdentity = identity;
			this.authenticationAccountId = undefined;
			this.resetCatalogContext();
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

	private async request(request: CopilotConnectorsRequest, token: CancellationToken, requireAuthentication = false): Promise<{ readonly document: unknown; readonly scoped: boolean }> {
		const authentication = await this.getAuthentication(token, requireAuthentication);
		if (!authentication) {
			if (requireAuthentication) {
				throw connectorSignInRequired();
			}
			return { document: undefined, scoped: false };
		}
		const session = authentication.sessions.find(session => hasConnectorScope(session, request.type === 'query'));
		const selectedSession = session ?? (request.type === 'query' ? authentication.session : undefined);
		if (!selectedSession) {
			this._authorizationRequired = true;
			throw connectorSignInRequired();
		}
		this._authorizationRequired = false;
		try {
			const document = await this.requestService.request(request, selectedSession.accessToken, token);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			this._catalogMayRequireConsent = false;
			return { document, scoped: session !== undefined };
		} catch (error) {
			if (!token.isCancellationRequested && request.type === 'query' && !session && error instanceof CopilotConnectorsError && error.statusCode === 403) {
				this._catalogMayRequireConsent = true;
				throw new CopilotConnectorsError(localize('copilotConnectors.catalogScopeRollout', "The connector catalog is unavailable (HTTP 403). Browsing without connector authorization may not yet be available for this account."), 403);
			}
			throw error;
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
		return {
			account,
			session,
			sessions: [session, ...sessions.filter(candidate => candidate.id !== session.id && candidate.account.id === session.account.id)],
		};
	}

	private setConnectors(connectors: readonly ICopilotConnector[]): void {
		if (equals(this._connectors, connectors)) {
			return;
		}
		this._connectors = connectors;
		this._onDidChange.fire();
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
				return score === undefined ? [] : [{ ...toMarketplaceEntry(connector), score }];
			}).sort((a, b) => b.score - a.score) : connectors.map(connector => toMarketplaceEntry(connector));
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

function toMarketplaceEntry(connector: ICopilotConnector): ICustomizationMarketplaceEntry {
	return {
		identifier: connector.name,
		displayName: connector.displayName,
		description: connector.description,
		mediaType: CustomizationMarketplaceMediaType.McpServer,
		tags: connector.tags,
		capabilities: connector.capabilities,
		representativeQueries: connector.representativeQueries,
		url: connector.documentation,
		externalUrl: connector.documentation?.toString(true),
		icon: connector.icon,
		publisher: localize('copilotConnectors.publisher', "GitHub Copilot"),
		installation: { kind: 'copilotConnector', name: connector.name },
	};
}

function parseConnectors(value: unknown, scoped: boolean): readonly ICopilotConnector[] {
	const plugins = asRecord(value)?.plugins;
	if (!Array.isArray(plugins) || plugins.length > maxConnectors) {
		throw new CopilotConnectorsError(localize('copilotConnectors.invalidResponse', "Copilot connectors returned an invalid response."));
	}
	const connectors: ICopilotConnector[] = [];
	for (const value of plugins) {
		const plugin = asRecord(value);
		const name = text(plugin?.name, 512);
		if (!plugin || !name) {
			continue;
		}
		const metadata = asRecord(plugin.metadata);
		const connection = scoped ? asRecord(plugin.connection) : undefined;
		const displayName = text(metadata?.displayName) ?? name;
		const description = text(metadata?.description) ?? text(plugin.description) ?? localize('copilotConnectors.defaultDescription', "Connect {0} to GitHub Copilot.", displayName);
		const mcpServers = asRecord(asRecord(plugin.mcpServers)?.mcpServers);
		const mcpServerEntries = Object.entries(mcpServers ?? {});
		if (mcpServerEntries.length > maxMcpServersPerConnector) {
			throw new CopilotConnectorsError(localize('copilotConnectors.invalidResponse', "Copilot connectors returned an invalid response."));
		}
		connectors.push({
			name,
			displayName,
			description,
			icon: parseHttpsUri(metadata?.iconUrl ?? metadata?.icon),
			documentation: parseHttpsUri(metadata?.documentationUrl ?? metadata?.documentation),
			homepage: parseHttpsUri(metadata?.homepage),
			version: text(metadata?.version, 512),
			author: parseAuthor(metadata?.author),
			repository: parseHttpsUri(metadata?.repository),
			license: text(metadata?.license, 512),
			tags: strings(metadata?.tags),
			keywords: strings(metadata?.keywords),
			capabilities: strings(metadata?.capabilities),
			representativeQueries: strings(metadata?.representativeQueries),
			tier: text(metadata?.tier, 128),
			releaseTag: text(metadata?.releaseTag, 128),
			isExportSupported: typeof metadata?.isExportSupported === 'boolean' ? metadata.isExportSupported : undefined,
			agents: strings(plugin.agents),
			commands: strings(plugin.commands),
			skills: strings(plugin.skills),
			connectionStatus: scoped ? parseConnectionStatus(connection?.status) : 'unknown',
			connectionStatusDetail: parseConnectionStatusDetail(connection?.statusDetail),
			connectionErrorMessage: text(connection?.errorMessage) ?? text(asRecord(connection?.error)?.message),
			protectedResourceMetadataUrl: text(connection?.protectedResourceMetadataUrl),
			scopes: strings(connection?.scopes),
			mcpServers: mcpServerEntries.flatMap(([serverName, serverValue]) => {
				const server = asRecord(serverValue);
				return serverName.length <= 512 && server?.type === 'http' && typeof server.url === 'string' && isHttpsUrl(server.url)
					? [{ name: serverName, type: server.type, url: parseHttpsUri(server.url) }]
					: [];
			}),
		});
	}

	function parseAuthor(value: unknown): ICopilotConnectorAuthor | undefined {
		const name = text(value, 512);
		if (name) {
			return { name };
		}
		const author = asRecord(value);
		if (!author) {
			return undefined;
		}
		const result: ICopilotConnectorAuthor = {
			name: text(author.name, 512),
			email: text(author.email, 512),
			url: parseHttpsUri(author.url),
		};
		return result.name || result.email || result.url ? result : undefined;
	}

	function parseConnectionStatus(value: unknown): CopilotConnectorConnectionStatus {
		switch (value) {
			case 'connected':
			case 'error':
			case 'pending':
				return value;
			default:
				return 'not_connected';
		}
	}

	function parseConnectionStatusDetail(value: unknown): CopilotConnectorConnectionStatusDetail | undefined {
		switch (value) {
			case 'reconnect_required':
			case 'retryable_error':
			case 'review_required':
			case 'sign_in_required':
			case 'unavailable':
				return value;
			default:
				return undefined;
		}
	}
	return connectors;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
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
