/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../base/common/defaultAccount.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { ExtensionGalleryAuthProviderConfigKey, ExtensionGalleryResourceType, getExtensionGalleryManifestResourceUri, IExtensionGalleryManifest, PRIVATE_MARKETPLACE_SCOPES } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSession, IAuthenticationService } from '../../authentication/common/authentication.js';
import { ExtensionGalleryAccessProviderId, getEffectiveAuthProvider, ICachedAccess, isSafeTokenTarget, MarketplaceAuthRequiredError, MarketplaceMisconfiguredError } from './extensionGalleryAccess.js';
import { ExtensionGalleryServiceIndexService } from './extensionGalleryServiceIndex.js';

/**
 * Storage key for the last durable access verdict ({@link ICachedAccess}). `APPLICATION` scope +
 * `MACHINE` target so the verdict is shared across windows but never roamed to other machines.
 */
const CACHED_ACCESS_KEY = 'marketplace.cachedAccess';

/**
 * Storage key for the account the user settled on for the Private Marketplace
 * ({@link IPreferredAccount}). Shares the `APPLICATION`/`MACHINE` lifecycle of the verdict cache so
 * the choice is remembered across windows. Grounds session selection when the Microsoft provider has
 * several signed-in accounts, so a specific remembered account — not an arbitrary `sessions[0]` — is
 * used across restarts.
 */
const PREFERRED_ACCOUNT_KEY = 'marketplace.account';

/**
 * The eligibility endpoint's JSON response. Only `eligible` is authoritative; `reason` is diagnostic
 * and deliberately never persisted (it could carry account/tenant text) — see {@link ExtensionGalleryAccountService.getMicrosoftAccount}.
 */
interface IEligibilityResponse {
	readonly accountType?: 'Entra' | 'MSA';
	readonly eligible?: boolean;
	readonly reason?: string;
}

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

/**
 * The current signed-in identity for the effective provider, resolved silently. `token` is only
 * carried on the Microsoft path (the GitHub/default path has no bearer).
 */
type AccountResolution =
	| { readonly kind: 'account'; readonly accountId: string; readonly token?: string }
	| { readonly kind: 'none' }
	| { readonly kind: 'error' };

/**
 * The account the user settled on for the Private Marketplace, persisted so a remembered choice
 * survives restarts. `authProvider` scopes the preference so it is ignored after a provider switch;
 * `id` is the stable account id (never a display label).
 */
interface IPreferredAccount {
	readonly authProvider: string;
	readonly id: string;
}

/**
 * A resolved access verdict. `undefined` from {@link ExtensionGalleryAccountService.getAccount}/
 * {@link ExtensionGalleryAccountService.getCachedAccess} means sign-in required; `eligible: false`
 * is a denial; `eligible: true` grants access and `manifest` carries the validated index to render.
 */
export interface IExtensionGalleryAccount {
	readonly eligible: boolean;
	readonly manifest?: IExtensionGalleryManifest;
}

export const IExtensionGalleryAccountService = createDecorator<IExtensionGalleryAccountService>('extensionGalleryAccountService');

/**
 * Resolves "which account may access the Private Marketplace" and owns the durable access verdict
 * plus the in-process service-index cache. Registered as an {@link InstantiationType.Delayed}
 * singleton so the host manifest service can inject it without eagerly pulling in the
 * {@link IAuthenticationService} graph, which transitively re-enters the manifest service.
 */
export interface IExtensionGalleryAccountService {
	readonly _serviceBrand: undefined;

	/** Fires when the effective account may have changed, so the host can re-run validation. */
	readonly onDidChangeAccount: Event<void>;

	/** Live eligibility verdict for the current account; `undefined` means sign-in required. */
	getAccount(configuredServiceUrl: string, token: CancellationToken): Promise<IExtensionGalleryAccount | undefined>;

	/** Durable (cached) verdict for the current account without a live network round-trip. */
	getCachedAccess(configuredServiceUrl: string, token: CancellationToken): Promise<IExtensionGalleryAccount | undefined>;

	/** Drops the memoized service index so the next validation generation re-fetches it. */
	invalidateServiceIndexCache(): void;

	/** Drops the durable access verdict. */
	clearCache(): void;
}

/**
 * Abstracts "which account may access the Private Marketplace" behind an API deliberately shaped
 * like {@link IDefaultAccountService} (a silent `getAccount()` plus `onDidChangeAccount`) so the
 * host manifest service stays close to its upstream shape. Selects the effective provider (GitHub
 * default account vs Microsoft/Entra session), runs the eligibility check, and owns the verdict cache.
 */
export class ExtensionGalleryAccountService extends Disposable implements IExtensionGalleryAccountService {

	declare readonly _serviceBrand: undefined;

	private readonly authProvider: ExtensionGalleryAccessProviderId;

	// Fetches and memoizes the service index. Fully owned by this service — both the live probe and
	// the cached-verdict fast-path materialize the index through it, so a validation generation never
	// re-requests the same index.
	private readonly indexService: ExtensionGalleryServiceIndexService;

	/** Fires when the underlying account may have changed, so the host can re-run validation. */
	readonly onDidChangeAccount: Event<void>;

	constructor(
		@IProductService private readonly productService: IProductService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.authProvider = getEffectiveAuthProvider(configurationService.getValue<string>(ExtensionGalleryAuthProviderConfigKey), !!productService.enableExtensionGalleryEntraAuth);
		this.indexService = instantiationService.createInstance(ExtensionGalleryServiceIndexService);

		// Signal only the change relevant to the effective provider so the host does not re-validate on
		// unrelated account activity.
		this.onDidChangeAccount = this.authProvider === 'microsoft'
			? Event.signal(Event.filter(this.authenticationService.onDidChangeSessions, e => e.providerId === 'microsoft', this._store))
			: Event.signal(this.defaultAccountService.onDidChangeDefaultAccount);
	}

	/**
	 * Resolves the current account's access verdict for `configuredServiceUrl` via a live eligibility
	 * check. Returns `undefined` (sign-in required), `{ eligible: false }` (durable denial), or
	 * `{ eligible: true, manifest }` (granted). Throws {@link MarketplaceMisconfiguredError} for a
	 * misconfigured deployment, and rethrows transient/network errors so the host can preserve an
	 * already-available marketplace instead of downgrading it.
	 */
	getAccount(configuredServiceUrl: string, token: CancellationToken): Promise<IExtensionGalleryAccount | undefined> {
		return this.authProvider === 'microsoft'
			? this.getMicrosoftAccount(configuredServiceUrl, token)
			: this.getGitHubAccount(configuredServiceUrl, token);
	}

	private async getGitHubAccount(configuredServiceUrl: string, token: CancellationToken): Promise<IExtensionGalleryAccount | undefined> {
		// May throw on a transient auth-service failure — propagate so the host preserves cache and
		// surfaces "unreachable" rather than clearing a durable verdict.
		const account = await this.defaultAccountService.getDefaultAccount();
		if (token.isCancellationRequested) {
			return undefined;
		}
		if (!account) {
			// Auth service responded: no account → drop any cached verdict and require sign-in.
			this.clearCache();
			return undefined;
		}
		if (!this.checkGitHubAccess(account)) {
			this.cacheAccess({ authProvider: 'github', accountId: account.accountName, eligible: false, serviceUrl: configuredServiceUrl });
			return { eligible: false };
		}
		// Entitled → confirm reachability by fetching the index. A transient failure here propagates
		// (no cache write) so the host surfaces "unreachable".
		const manifest = await this.indexService.getServiceIndex(configuredServiceUrl, token);
		if (token.isCancellationRequested) {
			return undefined;
		}
		this.cacheAccess({ authProvider: 'github', accountId: account.accountName, eligible: true, serviceUrl: configuredServiceUrl });
		return { eligible: true, manifest };
	}

	private checkGitHubAccess(account: IDefaultAccount): boolean {
		this.logService.debug('[Marketplace] Checking Account SKU access for configured gallery', account.entitlementsData?.access_type_sku);
		if (account.entitlementsData?.access_type_sku
			&& this.productService.extensionsGallery?.accessSKUs?.includes(account.entitlementsData.access_type_sku)) {
			this.logService.debug('[Marketplace] Account has access to configured gallery');
			return true;
		}
		this.logService.debug('[Marketplace] Checking enterprise account access for configured gallery', account.enterprise);
		return account.enterprise;
	}

	private async getMicrosoftAccount(configuredServiceUrl: string, token: CancellationToken): Promise<IExtensionGalleryAccount | undefined> {
		// Resolve the remembered account silently — never prompts. A throw is a transient auth-service
		// failure: propagate so the host preserves cache.
		const session = await this.getMicrosoftSession();
		if (token.isCancellationRequested) {
			return undefined;
		}
		if (!session) {
			// No usable account (none signed in, or several signed in with no remembered choice). A
			// 'microsoft'-configured index MAY itself be auth-gated, so an anonymous probe would at best
			// return a guaranteed 401. Go straight to sign-in; there is deliberately NO fallback to
			// GitHub.
			this.clearCache();
			return undefined;
		}

		if (!isSafeTokenTarget(configuredServiceUrl, configuredServiceUrl)) {
			// Won't attach a bearer to a non-HTTPS index. Without a token a gated index is unreadable,
			// so this deployment is misconfigured for Entra auth.
			this.logService.error('[Marketplace] Refusing to send the Microsoft token to a non-HTTPS service index URL — the marketplace is misconfigured for Entra auth.');
			this.clearCache();
			throw new MarketplaceMisconfiguredError('The service index URL is not HTTPS.');
		}

		let manifest: IExtensionGalleryManifest;
		try {
			manifest = await this.indexService.getServiceIndex(configuredServiceUrl, token, session.accessToken);
		} catch (error) {
			if (error instanceof MarketplaceAuthRequiredError) {
				return this.denyFromAuthError(error, session, configuredServiceUrl, token);
			}
			// Transient — propagate so the host surfaces "unreachable" while preserving cache.
			throw error;
		}
		if (token.isCancellationRequested) {
			return undefined;
		}

		const eligibilityUrl = getExtensionGalleryManifestResourceUri(manifest, ExtensionGalleryResourceType.EligibilityService);
		if (!eligibilityUrl) {
			// Manifest fetched but advertises no EligibilityService — misconfigured for Entra.
			this.logService.error('[Marketplace] authProvider is "microsoft" but the gallery manifest does not advertise an EligibilityService resource — the marketplace is misconfigured for Entra auth.');
			this.clearCache();
			throw new MarketplaceMisconfiguredError('The gallery manifest does not advertise an EligibilityService.');
		}
		if (!isSafeTokenTarget(eligibilityUrl, configuredServiceUrl)) {
			// Eligibility endpoint is not same-origin HTTPS with the index — sending the token there
			// would risk leaking it to a foreign/cleartext origin.
			this.logService.error('[Marketplace] The EligibilityService URL is not same-origin HTTPS with the configured service index — refusing to transmit the Microsoft token. The marketplace is misconfigured for Entra auth.');
			this.clearCache();
			throw new MarketplaceMisconfiguredError('The EligibilityService URL is not same-origin HTTPS with the service index.');
		}

		let result: { eligible: boolean; reason?: string };
		try {
			result = await this.checkMicrosoftEligibility(eligibilityUrl, session.accessToken, token);
		} catch (error) {
			if (error instanceof MarketplaceAuthRequiredError) {
				return this.denyFromAuthError(error, session, configuredServiceUrl, token);
			}
			// Not a definitive verdict — propagate so the host surfaces "unreachable" and never caches.
			throw error;
		}
		if (token.isCancellationRequested) {
			return undefined;
		}

		// A 200 is definitive — cache it. The server `reason` is NOT persisted: unused for any
		// UI/gating decision and could carry account/tenant diagnostic text.
		this.cacheAccess({ authProvider: 'microsoft', accountId: session.account.id, eligible: result.eligible, serviceUrl: configuredServiceUrl });
		return { eligible: result.eligible, manifest };
	}

	/**
	 * Maps a {@link MarketplaceAuthRequiredError} raised while presenting a Microsoft token into a
	 * denial. A 403 (token accepted, identity forbidden) is a durable denial and is cached; a 401
	 * (token rejected) is not durable, so the cache is cleared. Either way the caller surfaces
	 * AccessDenied rather than looping the signed-in user back to sign-in on the same rejected token.
	 *
	 * Guarded by `token.isCancellationRequested`: a superseded validation must never write the shared
	 * cache — a stale 403 could persist a denial for an account that is no longer current, and a
	 * stale 401 could clear a newer generation's verdict.
	 */
	private denyFromAuthError(error: MarketplaceAuthRequiredError, session: AuthenticationSession, configuredServiceUrl: string, token: CancellationToken): IExtensionGalleryAccount {
		if (token.isCancellationRequested) {
			return { eligible: false };
		}
		if (error.statusCode === 403) {
			this.cacheAccess({ authProvider: 'microsoft', accountId: session.account.id, eligible: false, serviceUrl: configuredServiceUrl });
		} else {
			this.clearCache();
		}
		return { eligible: false };
	}

	private async checkMicrosoftEligibility(url: string, token: string, cancellationToken: CancellationToken): Promise<{ eligible: boolean; reason?: string }> {
		const context = await this.requestService.request({
			type: 'POST',
			url,
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			callSite: 'extensionGalleryManifestService.checkMicrosoftEligibility',
			// A bearer is attached, so never follow redirects: the request service would forward the
			// Authorization header to the (possibly cross-origin) target and leak the token. A 3xx is
			// treated as a non-200 error below.
			followRedirects: 0,
		}, cancellationToken);

		if (context.res.statusCode !== 200) {
			if (context.res.statusCode === 401 || context.res.statusCode === 403) {
				// Surface the status so the caller can distinguish 401 (token missing/expired/wrong-
				// audience — re-auth may fix it) from 403 (identity forbidden — durable denial),
				// mirroring the service-index fetch classification.
				throw new MarketplaceAuthRequiredError(context.res.statusCode);
			}
			// Any other non-200 is not a definitive result — generic error so callers treat it as
			// transient and don't cache it.
			throw new Error(`Eligibility endpoint returned status ${context.res.statusCode}`);
		}

		const response = await asJson<IEligibilityResponse>(context);
		if (!response || typeof response.eligible !== 'boolean') {
			// A 200 with a missing/non-boolean `eligible` is server contract drift — must not be
			// coerced into a durable allow/deny. Throw so the caller treats it as transient.
			throw new Error('Eligibility endpoint returned a malformed response');
		}
		return { eligible: response.eligible, reason: response.reason };
	}

	/**
	 * Startup fast-path that avoids a sign-in flash: reads the persisted verdict and, if still
	 * trustworthy, returns a usable result. The cached verdict is an authorization input — honored
	 * only when the currently signed-in account matches the account it was written for. For an
	 * eligible verdict the index is materialized (presenting the cached identity's bearer only to a
	 * safe HTTPS same-origin target) so the host can render `Available` directly. Returns `undefined`
	 * when there is no usable cache — including when the index cannot be materialized (auth now
	 * required, misconfigured, or transient) — so the host falls through to a full validation. Throws
	 * on a transient identity-resolution failure so the host preserves an available marketplace.
	 */
	async getCachedAccess(configuredServiceUrl: string, token: CancellationToken): Promise<IExtensionGalleryAccount | undefined> {
		const cached = this.readValidCache(configuredServiceUrl);
		if (!cached) {
			return undefined;
		}
		const current = await this.resolveCurrentAccount();
		if (token.isCancellationRequested) {
			return undefined;
		}
		if (current.kind === 'error') {
			// Transient identity-resolution failure — do not trust or clear the cache; signal the
			// host to keep current state rather than treating this as "no account".
			throw new Error('Unable to resolve the current account for cache validation.');
		}
		if (current.kind === 'none' || current.accountId !== cached.accountId) {
			// Verdict was written for a different (or absent) account — drop it.
			this.clearCache();
			return undefined;
		}
		if (!cached.eligible) {
			return { eligible: false };
		}
		// Trust the eligible verdict but materialize the index so the host renders `Available` without
		// further fetching. A bearer is only presented to an HTTPS same-origin target; if that is
		// unsafe or the fetch fails, the cache is not a usable fast-path — return `undefined` so a full
		// validation surfaces the correct status.
		if (current.token && !isSafeTokenTarget(configuredServiceUrl, configuredServiceUrl)) {
			return undefined;
		}
		try {
			const manifest = await this.indexService.getServiceIndex(configuredServiceUrl, token, current.token);
			if (token.isCancellationRequested) {
				return undefined;
			}
			return { eligible: true, manifest };
		} catch {
			return undefined;
		}
	}

	/**
	 * Drops the in-process service-index cache so the next validation generation re-fetches the
	 * index rather than serving one memoized under a superseded account/marketplace. Called by the
	 * host at the start of each validation generation and on config change.
	 */
	invalidateServiceIndexCache(): void {
		this.indexService.invalidate();
	}

	/**
	 * Silently resolves the current account for the effective provider, returning its identity (and
	 * bearer token, on the Microsoft path) for cache validation. Never prompts for sign-in. Returns
	 * `{ kind: 'error' }` on a transient failure so callers can distinguish it from "no account".
	 */
	private async resolveCurrentAccount(): Promise<AccountResolution> {
		try {
			if (this.authProvider === 'microsoft') {
				const session = await this.getMicrosoftSession();
				return session ? { kind: 'account', accountId: session.account.id, token: session.accessToken } : { kind: 'none' };
			}
			const account = await this.defaultAccountService.getDefaultAccount();
			return account ? { kind: 'account', accountId: account.accountName } : { kind: 'none' };
		} catch {
			return { kind: 'error' };
		}
	}

	/**
	 * The single grounded selector for the effective Microsoft session, shared by the live check
	 * ({@link getMicrosoftAccount}) and cache validation ({@link resolveCurrentAccount}) so neither
	 * picks an arbitrary `sessions[0]`. The Microsoft provider can have several accounts signed in, so
	 * selection is anchored to the persisted {@link IPreferredAccount}:
	 * - remembered account still signed in → use it;
	 * - no usable preference and exactly one account → adopt and persist it (unambiguous);
	 * - no usable preference and several accounts → return `undefined` (require an explicit choice)
	 *   rather than guessing.
	 * Returns `undefined` when no account can be grounded. Never prompts; `getSessions` throws only on
	 * a transient auth-service failure, which propagates to the caller.
	 */
	private async getMicrosoftSession(): Promise<AuthenticationSession | undefined> {
		const sessions = await this.authenticationService.getSessions('microsoft', PRIVATE_MARKETPLACE_SCOPES);
		if (sessions.length === 0) {
			return undefined;
		}
		const preferredId = this.readPreferredAccountId();
		if (preferredId) {
			const remembered = sessions.find(session => session.account.id === preferredId);
			// If the remembered account is no longer signed in, fall through rather than silently
			// switching to a different account.
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

	/** Reads the remembered account id, scoped to the effective provider; `undefined` if none/other. */
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
		// Scoped to the effective provider so a provider switch ignores a stale preference.
		if (candidate.authProvider !== this.authProvider || typeof candidate.id !== 'string') {
			return undefined;
		}
		return candidate.id;
	}

	/** Remembers `accountId` as the chosen account for the effective provider. */
	private storePreferredAccountId(accountId: string): void {
		const preferred: IPreferredAccount = { authProvider: this.authProvider, id: accountId };
		this.storageService.store(PREFERRED_ACCOUNT_KEY, JSON.stringify(preferred), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	/**
	 * Reads and validates the persisted {@link ICachedAccess}. A verdict is only usable when it is
	 * well-formed, was written for the effective auth provider, and was computed against the current
	 * `configuredServiceUrl`. Any malformed/mismatched entry is dropped (and cleared) so it can
	 * never be applied to a different provider or marketplace.
	 */
	private readValidCache(configuredServiceUrl: string): ICachedAccess | undefined {
		const raw = this.storageService.get(CACHED_ACCESS_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return undefined;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			// Corrupt/truncated storage — discard rather than crash startup on a parse error.
			this.clearCache();
			return undefined;
		}
		if (!this.isValidCachedAccess(parsed)) {
			this.clearCache();
			return undefined;
		}
		if (parsed.authProvider !== this.authProvider || parsed.serviceUrl !== configuredServiceUrl) {
			// Scoped to a different provider or marketplace — must not be trusted here.
			this.clearCache();
			return undefined;
		}
		return parsed;
	}

	private isValidCachedAccess(value: unknown): value is ICachedAccess {
		if (!value || typeof value !== 'object') {
			return false;
		}
		const candidate = value as Partial<ICachedAccess>;
		return (candidate.authProvider === 'github' || candidate.authProvider === 'microsoft')
			&& typeof candidate.accountId === 'string'
			&& typeof candidate.eligible === 'boolean'
			&& typeof candidate.serviceUrl === 'string';
	}

	/**
	 * Persists a durable verdict and reports the eligibility check. Only ever called for definitive
	 * (durable) allow/deny outcomes, so it is the single point that emits `marketplace:auth:checked`
	 * for both providers — capturing the github vs microsoft distinction and the eligibility result.
	 */
	private cacheAccess(access: ICachedAccess): void {
		this.storageService.store(CACHED_ACCESS_KEY, JSON.stringify(access), StorageScope.APPLICATION, StorageTarget.MACHINE);
		this.telemetryService.publicLog2<MarketplaceAuthEvent, MarketplaceAuthClassification>('marketplace:auth:checked', {
			authProvider: access.authProvider,
			eligible: access.eligible,
		});
	}

	/** Drops the persisted verdict (on sign-out, account/provider/serviceUrl change, or 401). */
	clearCache(): void {
		this.storageService.remove(CACHED_ACCESS_KEY, StorageScope.APPLICATION);
	}
}

registerSingleton(IExtensionGalleryAccountService, ExtensionGalleryAccountService, InstantiationType.Delayed);
