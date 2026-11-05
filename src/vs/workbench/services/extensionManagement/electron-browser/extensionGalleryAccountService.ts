/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDefaultAccount } from '../../../../base/common/defaultAccount.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { getExpirationTime, isExpired } from '../../../../base/common/date.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { AUTH_SCOPE_SEPARATOR, fetchAuthorizationServerMetadata, fetchResourceMetadata, getClaimsFromJWT, GRANT_TYPE_TOKEN_EXCHANGE, IAuthorizationTokenResponse, isAuthorizationTokenResponse, TOKEN_TYPE_ACCESS_TOKEN } from '../../../../base/common/oauth.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { ExtensionGalleryAuthProviderConfigKey } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { asJson, asText, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSession, AuthenticationSessionAccount, IAuthenticationService } from '../../authentication/common/authentication.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ExtensionGalleryAccountStatus, IExtensionGalleryAccount, IExtensionGalleryAccountProvider, IExtensionGalleryAccountService } from '../common/extensionGalleryAccount.js';

/** The authentication provider that gates Private Marketplace access. */
type ExtensionGalleryAccessProviderId = 'github' | 'microsoft';

const PREFERRED_ACCOUNT_KEY = 'marketplace.account';
const PROTECTED_RESOURCE_CACHE_TTL_SECONDS = 5 * 60;
const PROTECTED_RESOURCE_ABSENCE_TTL_SECONDS = 30;

// Well-known MSA (personal account) tenant ids. Duplicated from the microsoft-authentication
// extension, which lives in the extension host and is not importable here.
const MSA_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';
const MSA_PASSTHROUGH_TENANT_ID = 'f8cdef31-a31e-4b4a-93e4-5f571e91255a';

type MarketplaceAuthEvent = {
	authProvider: string;
	eligible: boolean;
};

type MarketplaceAuthClassification = {
	authProvider: {
		classification: 'SystemMetaData';
		purpose: 'FeatureInsight';
		comment: 'The auth provider used (github, microsoft).';
	};
	eligible: {
		classification: 'SystemMetaData';
		purpose: 'FeatureInsight';
		isMeasurement: true;
		comment: 'Whether the user was granted marketplace access.';
	};
	owner: 'sandy081';
	comment: 'Reports marketplace authentication results for enterprise marketplace access.';
};

/** The remembered account choice. `authProvider` scopes it so a provider switch ignores it. */
interface IPreferredAccount {
	readonly authProvider: string;
	readonly id: string;
}

interface IMarketplaceProtectedResource {
	readonly authorizationServer: string;
	readonly scopes: readonly string[];
	readonly invalidScopes?: boolean;
}

interface IGitHubMarketplaceProtectedResource extends IMarketplaceProtectedResource {
	readonly resource: string;
}

interface IMarketplaceProtectedResourceCache {
	readonly serviceIndexUrl: string;
	/** `null` represents confirmed absence, not a discovery failure. */
	value?: IMarketplaceProtectedResource | null;
	expiresAt?: number;
	request?: Promise<IMarketplaceProtectedResource | null | undefined>;
}

type MarketplaceExchangeResult =
	| { readonly kind: 'success'; readonly accessToken: string; readonly expiresInSeconds?: number }
	| { readonly kind: 'transient' }
	| { readonly kind: 'rejected' };

function isTransientStatus(status: number): boolean {
	return status === 0 || status === 408 || status === 429 || status >= 500;
}

function isSameSecureOrigin(targetUrl: string, baseUrl: string): boolean {
	try {
		const target = URI.parse(targetUrl, true);
		const base = URI.parse(baseUrl, true);
		return target.scheme === 'https' && base.scheme === 'https' && target.authority.toLowerCase() === base.authority.toLowerCase();
	} catch {
		return false;
	}
}

function createRequestFetcher(requestService: IRequestService, callSite: string) {
	return async (input: string, init: { method: string; headers: Record<string, string> }) => {
		const context = await requestService.request({ type: init.method, url: input, headers: init.headers, callSite }, CancellationToken.None);
		return {
			status: context.res.statusCode ?? 0,
			statusText: '',
			json: async (): Promise<unknown> => await asJson(context),
			text: async (): Promise<string> => (await asText(context)) ?? '',
		};
	};
}

/** Discovers the marketplace's Protected Resource Metadata (RFC 9728) from the service index origin. */
async function discoverMarketplaceProtectedResource(requestService: IRequestService, serviceIndexUrl: string, onTransientFailure?: () => void): Promise<IGitHubMarketplaceProtectedResource | undefined> {
	let transient = false;
	let definitive = false;
	const fetcher = createRequestFetcher(requestService, 'extensionGalleryAccountService.discoverProtectedResource');
	try {
		const { metadata } = await fetchResourceMetadata(serviceIndexUrl, undefined, {
			fetch: async (url, init) => {
				try {
					const response = await fetcher(url, init);
					transient ||= isTransientStatus(response.status);
					definitive ||= response.status !== 404 && response.status !== 410 && !isTransientStatus(response.status);
					return response;
				} catch (error) {
					transient = true;
					throw error;
				}
			}
		});
		const authorizationServer = metadata.authorization_servers?.[0];
		if (!authorizationServer) {
			return undefined;
		}
		return { authorizationServer, scopes: metadata.scopes_supported ?? [], resource: metadata.resource };
	} catch {
		if (transient && !definitive) {
			onTransientFailure?.();
		}
		return undefined;
	}
}

/**
 * Exchanges a GitHub session token for a marketplace-audience token with the RFC 8693 token-exchange
 * grant. The subject token is sent only to the advertised authorization server's token endpoint, and
 * only when both that server and the endpoint are same-origin HTTPS with the service index.
 */
async function exchangeMarketplaceResourceToken(requestService: IRequestService, serviceIndexUrl: string, protectedResource: IGitHubMarketplaceProtectedResource, subjectToken: string): Promise<MarketplaceExchangeResult> {
	if (!isSameSecureOrigin(protectedResource.authorizationServer, serviceIndexUrl)) {
		return { kind: 'rejected' };
	}
	let transient = false;
	let definitive = false;
	let exchanging = false;
	const fetcher = createRequestFetcher(requestService, 'extensionGalleryAccountService.exchangeMarketplaceResourceToken');
	try {
		const { metadata } = await fetchAuthorizationServerMetadata(protectedResource.authorizationServer, {
			fetch: async (url, init) => {
				try {
					const response = await fetcher(url, init);
					transient ||= isTransientStatus(response.status);
					definitive ||= response.status !== 404 && response.status !== 410 && !isTransientStatus(response.status);
					return response;
				} catch (error) {
					transient = true;
					throw error;
				}
			},
			validateIssuer: true,
		});
		transient = false;
		definitive = false;
		const tokenEndpoint = metadata.token_endpoint;
		if (!tokenEndpoint || !isSameSecureOrigin(tokenEndpoint, serviceIndexUrl)) {
			return { kind: 'rejected' };
		}
		const body = new URLSearchParams();
		body.append('grant_type', GRANT_TYPE_TOKEN_EXCHANGE);
		body.append('subject_token', subjectToken);
		body.append('subject_token_type', TOKEN_TYPE_ACCESS_TOKEN);
		body.append('resource', protectedResource.resource);
		if (protectedResource.scopes.length) {
			body.append('scope', protectedResource.scopes.join(AUTH_SCOPE_SEPARATOR));
		}
		exchanging = true;
		const context = await requestService.request({
			type: 'POST',
			url: tokenEndpoint,
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			data: body.toString(),
			callSite: 'extensionGalleryAccountService.exchangeMarketplaceResourceToken',
			// The subject token is in the body; a followed redirect would replay it to another origin.
			followRedirects: 0,
		}, CancellationToken.None);
		if (context.res.statusCode !== 200) {
			return { kind: isTransientStatus(context.res.statusCode ?? 0) ? 'transient' : 'rejected' };
		}
		const response = await asJson<IAuthorizationTokenResponse>(context);
		exchanging = false;
		return response && isAuthorizationTokenResponse(response) && response.access_token
			? { kind: 'success', accessToken: response.access_token, expiresInSeconds: response.expires_in }
			: { kind: 'rejected' };
	} catch (error) {
		return { kind: (exchanging && !(error instanceof SyntaxError)) || (transient && !definitive) ? 'transient' : 'rejected' };
	}
}

/** Status bookkeeping and eligibility reporting shared by the provider implementations. */
abstract class AbstractGalleryAccountProvider extends Disposable implements IExtensionGalleryAccountProvider {

	protected readonly _onDidChangeAccount = this._register(new Emitter<void>());
	readonly onDidChangeAccount: Event<void> = this._onDidChangeAccount.event;

	private _accountStatus = ExtensionGalleryAccountStatus.Unknown;
	get accountStatus(): ExtensionGalleryAccountStatus { return this._accountStatus; }
	private readonly _onDidChangeAccountStatus = this._register(new Emitter<ExtensionGalleryAccountStatus>());
	readonly onDidChangeAccountStatus: Event<ExtensionGalleryAccountStatus> = this._onDidChangeAccountStatus.event;

	constructor(
		protected readonly authProviderId: ExtensionGalleryAccessProviderId,
		private readonly telemetryService: ITelemetryService,
		protected readonly logService: ILogService,
	) {
		super();
	}

	async getAccount(serviceIndexUrl: string): Promise<IExtensionGalleryAccount | undefined> {
		try {
			return await this.doGetAccount(serviceIndexUrl);
		} catch (error) {
			// Distinct from "no account" so the caller does not demand sign-in for a transient failure.
			this.logService.error('[Marketplace] Unable to resolve the marketplace account', error);
			this.setAccountStatus(ExtensionGalleryAccountStatus.Unknown);
			return undefined;
		}
	}

	protected abstract doGetAccount(serviceIndexUrl: string): Promise<IExtensionGalleryAccount | undefined>;

	abstract signIn(): Promise<void>;

	protected setAccountStatus(status: ExtensionGalleryAccountStatus): void {
		if (this._accountStatus !== status) {
			this._accountStatus = status;
			this._onDidChangeAccountStatus.fire(status);
		}
	}

	protected reportEligibility(eligible: boolean): void {
		this.telemetryService.publicLog2<MarketplaceAuthEvent, MarketplaceAuthClassification>('marketplace:auth:checked', {
			authProvider: this.authProviderId,
			eligible
		});
	}
}

const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;
const TOKEN_REFRESH_FRACTION = 0.75;
const MIN_TOKEN_REFRESH_MS = 30_000;
const MAX_TOKEN_REFRESH_MS = 6 * 60 * 60 * 1000;
const INITIAL_TOKEN_RETRY_MS = 5_000;
const MAX_TOKEN_RETRY_MS = 2 * 60_000;

/** Entitlement from the default account's SKU or enterprise flag. The bearer, if the marketplace is gated, is exchanged from the session token. */
export class GitHubGalleryAccountProvider extends AbstractGalleryAccountProvider {

	private readonly refreshTimer = this._register(new MutableDisposable());
	private cachedToken: { readonly accessToken: string; readonly expiresAt: number; readonly serviceIndexUrl: string; readonly sessionId: string; readonly providerId: string } | undefined;
	private generation = 0;
	private retryDelay = INITIAL_TOKEN_RETRY_MS;

	constructor(
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IRequestService private readonly requestService: IRequestService,
		@IProductService private readonly productService: IProductService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
	) {
		super('github', telemetryService, logService);
		this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.invalidateAccount()));
		this._register(this.authenticationService.onDidChangeSessions(e => {
			// The marketplace token is minted from the GitHub session token, so a rotated or
			// re-consented session can leave a previously negotiated token stale.
			if (e.providerId === 'github' || e.providerId === 'github-enterprise') {
				this.invalidateAccount();
			}
		}));
	}

	protected override async doGetAccount(serviceIndexUrl: string): Promise<IExtensionGalleryAccount | undefined> {
		const generation = ++this.generation;
		// Entitlement here is the account's SKU, decided without any bearer.
		const account = await this.defaultAccountService.getDefaultAccount();
		if (generation !== this.generation) {
			return undefined;
		}
		if (!account) {
			this.clearToken();
			this.setAccountStatus(ExtensionGalleryAccountStatus.SignedOut);
			return undefined;
		}
		const eligible = this.checkAccess(account);
		this.reportEligibility(eligible);
		this.setAccountStatus(eligible ? ExtensionGalleryAccountStatus.Eligible : ExtensionGalleryAccountStatus.Ineligible);
		// A result is returned even when ineligible, so the caller can tell "signed in but denied"
		// apart from "no account" — the two map to different statuses.
		if (!eligible) {
			this.clearToken();
			return {};
		}
		return { accessToken: await this.getMarketplaceAccessToken(serviceIndexUrl, account, generation) };
	}

	/**
	 * VS Code's GitHub provider cannot mint resource-scoped tokens, so a gated marketplace's own
	 * authorization server exchanges the account's GitHub session token for one (RFC 8693). A
	 * marketplace that publishes no protected resource needs no bearer.
	 */
	private async getMarketplaceAccessToken(serviceIndexUrl: string, account: IDefaultAccount, generation: number): Promise<string | undefined> {
		if (this.cachedToken && (this.cachedToken.serviceIndexUrl !== serviceIndexUrl || this.cachedToken.sessionId !== account.sessionId || this.cachedToken.providerId !== account.authenticationProvider.id)) {
			this.clearToken();
		}
		let transient = false;
		const protectedResource = await discoverMarketplaceProtectedResource(this.requestService, serviceIndexUrl, () => { transient = true; });
		if (generation !== this.generation) {
			return undefined;
		}
		if (!protectedResource) {
			return transient ? this.retryRenewal() : this.clearToken();
		}
		let sessions: readonly AuthenticationSession[];
		try {
			sessions = await this.authenticationService.getSessions(account.authenticationProvider.id);
		} catch (error) {
			this.logService.error('[Marketplace] Unable to resolve the GitHub session token for the marketplace token exchange', error);
			return generation === this.generation ? this.retryRenewal() : undefined;
		}
		if (generation !== this.generation) {
			return undefined;
		}
		const subjectToken = sessions.find(session => session.id === account.sessionId)?.accessToken;
		if (!subjectToken) {
			return this.clearToken();
		}
		const exchangeStartedAt = Date.now();
		const exchanged = await exchangeMarketplaceResourceToken(this.requestService, serviceIndexUrl, protectedResource, subjectToken);
		if (generation !== this.generation) {
			return undefined;
		}
		if (exchanged.kind === 'transient') {
			return this.retryRenewal();
		}
		if (exchanged.kind === 'rejected') {
			return this.clearToken();
		}
		const lifetime = exchanged.expiresInSeconds;
		this.cachedToken = lifetime !== undefined && Number.isFinite(lifetime) && lifetime > 0
			? { accessToken: exchanged.accessToken, expiresAt: exchangeStartedAt + lifetime * 1000, serviceIndexUrl, sessionId: account.sessionId, providerId: account.authenticationProvider.id }
			: undefined;
		if (this.cachedToken && this.cachedToken.expiresAt <= Date.now()) {
			return this.retryRenewal();
		}
		this.retryDelay = INITIAL_TOKEN_RETRY_MS;
		this.scheduleRefresh(this.cachedToken ? (this.cachedToken.expiresAt - Date.now()) / 1000 : lifetime);
		return exchanged.accessToken;
	}

	private invalidateAccount(): void {
		this.generation++;
		this.clearToken();
		this._onDidChangeAccount.fire();
	}

	private clearToken(): undefined {
		this.cachedToken = undefined;
		this.refreshTimer.clear();
		this.retryDelay = INITIAL_TOKEN_RETRY_MS;
		return undefined;
	}

	private retryRenewal(): string | undefined {
		this.logService.warn('[Marketplace] Marketplace token renewal failed temporarily; scheduling a retry');
		const remaining = (this.cachedToken?.expiresAt ?? 0) - Date.now();
		const token = remaining > 0 ? this.cachedToken?.accessToken : undefined;
		if (!token) {
			this.cachedToken = undefined;
		}
		const delay = token ? Math.min(this.retryDelay, remaining) : this.retryDelay;
		this.refreshTimer.value = disposableTimeout(() => this._onDidChangeAccount.fire(), delay);
		this.retryDelay = Math.min(this.retryDelay * 2, MAX_TOKEN_RETRY_MS);
		return token;
	}

	/**
	 * Nothing else notifies when the exchanged token lapses, so re-resolve the account (which
	 * re-exchanges) before it does.
	 */
	private scheduleRefresh(expiresInSeconds: number | undefined): void {
		const lifetimeMs = (expiresInSeconds && expiresInSeconds > 0 ? expiresInSeconds : DEFAULT_TOKEN_LIFETIME_SECONDS) * 1000;
		const delay = Math.min(Math.max(lifetimeMs * TOKEN_REFRESH_FRACTION, MIN_TOKEN_REFRESH_MS), lifetimeMs * 0.9, MAX_TOKEN_REFRESH_MS);
		this.refreshTimer.value = disposableTimeout(() => this._onDidChangeAccount.fire(), delay);
	}

	override async signIn(): Promise<void> {
		await this.defaultAccountService.signIn();
	}

	private checkAccess(account: IDefaultAccount): boolean {
		this.logService.debug('[Marketplace] Checking Account SKU access for configured gallery', account.entitlementsData?.access_type_sku);
		if (account.entitlementsData?.access_type_sku
			&& this.productService.extensionsGallery?.accessSKUs?.includes(account.entitlementsData.access_type_sku)) {
			this.logService.debug('[Marketplace] Account has access to configured gallery');
			return true;
		}
		this.logService.debug('[Marketplace] Checking enterprise account access for configured gallery', account.enterprise);
		return account.enterprise;
	}
}

/** Entitlement decided locally from the token's tenant claim. The bearer travels with it. */
export class MicrosoftGalleryAccountProvider extends AbstractGalleryAccountProvider {

	constructor(
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IRequestService private readonly requestService: IRequestService,
		@IProductService private readonly productService: IProductService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
	) {
		super('microsoft', telemetryService, logService);
		this._register(this.authenticationService.onDidChangeSessions(e => {
			if (e.providerId === 'microsoft') {
				this._onDidChangeAccount.fire();
			}
		}));
	}

	/**
	 * Session lookup and interactive sign-in must request the same scopes, or the session created
	 * by one is invisible to the other. Absent when the deployment did not configure them.
	 */
	private get scopes(): string[] | undefined {
		return this.productService.extensionsGallery?.accessScopes;
	}

	private protectedResourceCache: IMarketplaceProtectedResourceCache | undefined;

	protected override async doGetAccount(serviceIndexUrl: string): Promise<IExtensionGalleryAccount | undefined> {
		if (!this.protectedResourceCache || this.protectedResourceCache.serviceIndexUrl !== serviceIndexUrl) {
			this.protectedResourceCache = { serviceIndexUrl };
		}
		const cache = this.protectedResourceCache;
		const session = await this.getSession();
		if (!session) {
			this.setAccountStatus(ExtensionGalleryAccountStatus.SignedOut);
			return undefined;
		}
		const eligible = this.isEligible(session);
		this.reportEligibility(eligible);
		this.setAccountStatus(eligible ? ExtensionGalleryAccountStatus.Eligible : ExtensionGalleryAccountStatus.Ineligible);
		if (!eligible) {
			return {};
		}
		const protectedResource = await this.getProtectedResource(cache);
		if (!protectedResource || protectedResource.invalidScopes) {
			return { accessToken: session.accessToken };
		}
		return { accessToken: (await this.getResourceSession(session, protectedResource))?.accessToken ?? session.accessToken };
	}

	/** Work/school tenant is eligible, personal is not. Fails closed on an unreadable token. */
	private isEligible(session: AuthenticationSession): boolean {
		const rawToken = session.idToken ?? session.accessToken;
		let tid: string | undefined;
		try {
			tid = getClaimsFromJWT(rawToken).tid;
		} catch (error) {
			this.logService.error('[Marketplace] Unable to decode the Microsoft token to determine account eligibility — treating as ineligible.', error);
			return false;
		}
		if (!tid) {
			return false;
		}
		return tid !== MSA_TENANT_ID && tid !== MSA_PASSTHROUGH_TENANT_ID;
	}

	/**
	 * Anchored to the remembered account rather than an arbitrary `sessions[0]`. Several accounts
	 * with no preference returns `undefined` rather than guessing. Never prompts.
	 */
	private async getSession(): Promise<AuthenticationSession | undefined> {
		const scopes = this.scopes;
		if (!scopes) {
			this.logService.error('[Marketplace] extensionsGallery.accessScopes is not configured — the Microsoft marketplace path cannot request a session.');
			return undefined;
		}
		const sessions = await this.authenticationService.getSessions('microsoft', scopes);
		if (sessions.length === 0) {
			return undefined;
		}
		const session = this.pickSession(sessions);
		return session;
	}

	/**
	 * Requests the resource-scoped session (RFC 8707) for the already-chosen account. The
	 * marketplace names its own authorization server, so it is the authentication provider that
	 * decides whether that server is one it will mint for — an unsupported one throws, and is
	 * treated here as simply having no session.
	 */
	private async getResourceSession(session: AuthenticationSession, protectedResource: IMarketplaceProtectedResource): Promise<AuthenticationSession | undefined> {
		const resourceScopes = protectedResource.scopes.length ? [...protectedResource.scopes] : this.scopes;
		if (!resourceScopes) {
			return undefined;
		}
		try {
			const sessions = await this.authenticationService.getSessions('microsoft', resourceScopes, {
				account: session.account,
				authorizationServer: URI.parse(protectedResource.authorizationServer)
			});
			return sessions.at(0);
		} catch (error) {
			this.logService.error('[Marketplace] Unable to acquire a resource-scoped marketplace token', error);
			return undefined;
		}
	}

	private async getProtectedResource(cache: IMarketplaceProtectedResourceCache, bypassNegativeCache = false): Promise<IMarketplaceProtectedResource | undefined> {
		if (this._store.isDisposed || this.protectedResourceCache !== cache) {
			return undefined;
		}
		if (cache.value !== undefined && !isExpired(cache.expiresAt) && !(bypassNegativeCache && cache.value === null)) {
			return cache.value ?? undefined;
		}
		if (!cache.request) {
			cache.value = undefined;
			cache.expiresAt = undefined;
			cache.request = this.discoverProtectedResource(cache.serviceIndexUrl);
		}
		const request = cache.request;
		const protectedResource = await request;
		if (this._store.isDisposed || this.protectedResourceCache !== cache) {
			return undefined;
		}
		if (cache.request === request) {
			cache.request = undefined;
			if (protectedResource !== undefined && !protectedResource?.invalidScopes) {
				cache.value = protectedResource;
				cache.expiresAt = getExpirationTime(protectedResource ? PROTECTED_RESOURCE_CACHE_TTL_SECONDS : PROTECTED_RESOURCE_ABSENCE_TTL_SECONDS);
			}
		}
		return protectedResource ?? undefined;
	}

	private async discoverProtectedResource(serviceIndexUrl: string): Promise<IMarketplaceProtectedResource | null | undefined> {
		const attempts: { status?: number }[] = [];
		const fetcher = async (input: string, init: { method: string; headers: Record<string, string> }) => {
			const attempt: { status?: number } = {};
			attempts.push(attempt);
			const context = await this.requestService.request({ type: init.method, url: input, headers: init.headers, callSite: 'extensionGalleryAccountService.discoverProtectedResource' }, CancellationToken.None);
			attempt.status = context.res.statusCode;
			return {
				status: context.res.statusCode ?? 0,
				statusText: '',
				json: async (): Promise<unknown> => await asJson(context),
				text: async (): Promise<string> => (await asText(context)) ?? '',
			};
		};
		try {
			const { metadata } = await fetchResourceMetadata(serviceIndexUrl, undefined, { fetch: fetcher });
			const authorizationServers = metadata.authorization_servers;
			if (authorizationServers === undefined) {
				return undefined;
			}
			if (!Array.isArray(authorizationServers) || !authorizationServers.every(server => {
				if (typeof server !== 'string' || !/^https:\/\/[^/]/i.test(server) || /[\s\\]/.test(server) || !URL.canParse(server)) {
					return false;
				}
				const url = new URL(server);
				return !!url.hostname && !url.username && !url.password && !url.search && !url.hash;
			})) {
				this.logService.warn('[Marketplace] Ignoring invalid protected resource authorization servers');
				return undefined;
			}
			const authorizationServer = authorizationServers[0];
			if (!authorizationServer) {
				return undefined;
			}
			const scopes = metadata.scopes_supported ?? [];
			// RFC 6749 section 3.3 defines the allowed characters of a scope token.
			if (!Array.isArray(scopes) || !scopes.every(scope => typeof scope === 'string' && scope.length > 0 && !/[^\x21\x23-\x5B\x5D-\x7E]/.test(scope))) {
				this.logService.warn('[Marketplace] Ignoring invalid protected resource scopes');
				return { authorizationServer, scopes: [], invalidScopes: true };
			}
			return { authorizationServer, scopes };
		} catch {
			return attempts.length > 0 && attempts.every(attempt => attempt.status === 404 || attempt.status === 410) ? null : undefined;
		}
	}

	private pickSession(sessions: readonly AuthenticationSession[]): AuthenticationSession | undefined {
		const preferredId = this.readPreferredAccountId();
		if (preferredId) {
			const remembered = sessions.find(session => session.account.id === preferredId);
			// Fall through rather than silently switching accounts.
			if (remembered) {
				return remembered;
			}
		}
		if (sessions.length === 1) {
			this.storePreferredAccountId(sessions[0].account.id);
			return sessions[0];
		}
		return undefined;
	}

	override async signIn(): Promise<void> {
		const scopes = this.scopes;
		if (!scopes) {
			this.logService.error('[Marketplace] extensionsGallery.accessScopes is not configured — cannot sign in to the Microsoft marketplace path.');
			return;
		}
		const cache = this.protectedResourceCache;

		// Passing a known account binds to it without a fresh interactive login; omitting it falls
		// back to interactive sign-in, which is also how the user adds a different account.
		const chooseAccount = async (account: AuthenticationSessionAccount | undefined): Promise<void> => {
			// Persist before creating the session so re-validation already sees the grounded account.
			if (account) {
				this.storePreferredAccountId(account.id);
			}
			const session = await this.authenticationService.createSession('microsoft', scopes, account ? { account } : undefined);
			this.storePreferredAccountId(session.account.id);
			await this.consentToProtectedResource(session, cache);
		};

		const accounts = await this.authenticationService.getAccounts('microsoft');
		if (accounts.length <= 1) {
			await chooseAccount(accounts.at(0));
			return;
		}

		interface IAccountPickItem extends IQuickPickItem {
			readonly account?: AuthenticationSessionAccount;
		}
		const picks: IAccountPickItem[] = accounts.map(account => ({ label: account.label, account }));
		picks.push({ label: localize('marketplace.signInDifferentAccount', "Sign in with a Different Account…") });

		const pick = await this.quickInputService.pick(picks, {
			placeHolder: localize('marketplace.pickAccount', "Select the account to use for the Extensions Marketplace")
		});
		if (!pick) {
			return; // cancelled
		}
		await chooseAccount(pick.account);
	}

	/**
	 * Consents to the marketplace's resource while the user is already signing in. The access check
	 * cannot prompt, so without this a user whose tenant has not pre-consented would authenticate
	 * and still be sent back to the sign-in prompt. Tries silently first; failure is not fatal.
	 */
	private async consentToProtectedResource(session: AuthenticationSession, cache: IMarketplaceProtectedResourceCache | undefined): Promise<void> {
		if (!cache) {
			return;
		}
		const protectedResource = await this.getProtectedResource(cache, true);
		if (!protectedResource || protectedResource.invalidScopes) {
			return;
		}
		if (await this.getResourceSession(session, protectedResource)) {
			return;
		}
		if (this._store.isDisposed || this.protectedResourceCache !== cache || cache.value !== protectedResource || isExpired(cache.expiresAt)) {
			return;
		}
		const resourceScopes = protectedResource.scopes.length ? [...protectedResource.scopes] : this.scopes;
		if (!resourceScopes) {
			return;
		}
		try {
			await this.authenticationService.createSession('microsoft', resourceScopes, {
				account: session.account,
				authorizationServer: URI.parse(protectedResource.authorizationServer)
			});
		} catch (error) {
			this.logService.error('[Marketplace] Unable to consent to the marketplace resource during sign-in', error);
		}
	}

	private readPreferredAccountId(): string | undefined {
		const raw = this.storageService.get(PREFERRED_ACCOUNT_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return undefined;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			this.storageService.remove(PREFERRED_ACCOUNT_KEY, StorageScope.APPLICATION);
			return undefined;
		}
		if (!parsed || typeof parsed !== 'object') {
			return undefined;
		}
		const candidate = parsed as Partial<IPreferredAccount>;
		if (candidate.authProvider !== this.authProviderId || typeof candidate.id !== 'string') {
			return undefined;
		}
		return candidate.id;
	}

	private storePreferredAccountId(accountId: string): void {
		const preferred: IPreferredAccount = { authProvider: this.authProviderId, id: accountId };
		this.storageService.store(PREFERRED_ACCOUNT_KEY, JSON.stringify(preferred), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}

/** Owns the account verdict and token derived from the configured provider. */
export class ExtensionGalleryAccountService extends Disposable implements IExtensionGalleryAccountService {

	declare readonly _serviceBrand: undefined;

	private provider: IExtensionGalleryAccountProvider | undefined;
	private readonly providerListeners = this._register(new MutableDisposable<DisposableStore>());
	private accountGeneration = 0;

	private readonly _onDidChangeAccount = this._register(new Emitter<void>());
	readonly onDidChangeAccount: Event<void> = this._onDidChangeAccount.event;

	private readonly _onDidChangeAccountStatus = this._register(new Emitter<ExtensionGalleryAccountStatus>());
	readonly onDidChangeAccountStatus: Event<ExtensionGalleryAccountStatus> = this._onDidChangeAccountStatus.event;

	get accountStatus(): ExtensionGalleryAccountStatus {
		return this.provider?.accountStatus ?? ExtensionGalleryAccountStatus.Unknown;
	}

	setAccountProvider(provider: IExtensionGalleryAccountProvider): void {
		this.provider = provider;
		const listeners = new DisposableStore();
		listeners.add(provider.onDidChangeAccount(() => this.handleAccountChange()));
		listeners.add(provider.onDidChangeAccountStatus(status => this._onDidChangeAccountStatus.fire(status)));
		this.providerListeners.value = listeners;
		// Anything that resolved before the provider arrived saw no account; let it try again.
		this.handleAccountChange();
	}

	async getAccount(serviceIndexUrl: string): Promise<IExtensionGalleryAccount | undefined> {
		const provider = this.provider;
		if (!provider) {
			return undefined;
		}
		const generation = this.accountGeneration;
		const account = await provider.getAccount(serviceIndexUrl);
		return generation === this.accountGeneration ? account : undefined;
	}

	async signIn(): Promise<void> {
		await this.provider?.signIn();
	}

	private handleAccountChange(): void {
		this.accountGeneration++;
		this._onDidChangeAccount.fire();
	}
}

registerSingleton(IExtensionGalleryAccountService, ExtensionGalleryAccountService, InstantiationType.Delayed);

/**
 * Creates the configured provider and hands it to the service. Lives outside the core service
 * graph, so it can depend on authentication without forming the cycle the service must avoid.
 */
export class ExtensionGalleryAccountProviderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.extensionGalleryAccountProvider';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IExtensionGalleryAccountService accountService: IExtensionGalleryAccountService,
	) {
		super();
		const authProvider: ExtensionGalleryAccessProviderId = configurationService.getValue<string>(ExtensionGalleryAuthProviderConfigKey) === 'microsoft' ? 'microsoft' : 'github';
		const provider = this._register(authProvider === 'microsoft'
			? instantiationService.createInstance(MicrosoftGalleryAccountProvider)
			: instantiationService.createInstance(GitHubGalleryAccountProvider));
		accountService.setAccountProvider(provider);
	}
}

registerWorkbenchContribution2(ExtensionGalleryAccountProviderContribution.ID, ExtensionGalleryAccountProviderContribution, WorkbenchPhase.BlockStartup);
