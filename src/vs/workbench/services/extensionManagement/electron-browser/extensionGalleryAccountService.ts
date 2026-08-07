/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { ExtensionGalleryResourceType, getExtensionGalleryManifestResourceUri, IExtensionGalleryManifest, PRIVATE_MARKETPLACE_SCOPES } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSession, IAuthenticationService } from '../../authentication/common/authentication.js';
import { ExtensionGalleryAccessProviderId, getEffectiveAuthProvider, ICachedAccess, isSafeTokenTarget, MarketplaceAuthRequiredError, MarketplaceMisconfiguredError } from './extensionGalleryAccess.js';
import { ExtensionGalleryServiceIndexService } from './extensionGalleryServiceIndex.js';

/**
 * Storage key under which the last durable access verdict ({@link ICachedAccess}) is persisted.
 * `APPLICATION` scope + `MACHINE` target so the verdict is shared across windows on the machine
 * but never roamed to other machines/profiles.
 */
const CACHED_ACCESS_KEY = 'marketplace.cachedAccess';

/**
 * The shape of the eligibility endpoint's JSON response. Only `eligible` is authoritative; the
 * optional `reason` is diagnostic and is deliberately never persisted (see {@link ExtensionGalleryAccountService.getMicrosoftAccount}).
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
 * The current signed-in identity for the effective provider, as resolved silently (no prompt).
 * `token` is only carried for the Microsoft path (the GitHub/default path has no bearer token).
 */
type AccountResolution =
	| { readonly kind: 'account'; readonly accountId: string; readonly token?: string }
	| { readonly kind: 'none' }
	| { readonly kind: 'error' };

/**
 * The resolved access verdict for the current account against a marketplace. `undefined` (returned
 * from {@link IExtensionGalleryAccountService.getAccount}/{@link IExtensionGalleryAccountService.getCachedAccess})
 * means "no account / sign-in required". A present value with `eligible: false` is a denial; with
 * `eligible: true` the account may use the marketplace. `manifest` is the validated service index
 * when it was already fetched during the check (so the host need not re-fetch), and `accessToken`
 * is the bearer the host must present to (re-)fetch a gated index.
 */
export interface IExtensionGalleryAccount {
	readonly eligible: boolean;
	readonly manifest?: IExtensionGalleryManifest;
	readonly accessToken?: string;
}

/**
 * Abstracts "which account may access the Private Marketplace" behind an API deliberately shaped
 * like {@link IDefaultAccountService}: a silent `getAccount()` resolver plus an `onDidChangeAccount`
 * signal. It selects the effective auth provider (GitHub default account vs a Microsoft/Entra
 * session), performs the eligibility check for that provider, and owns the durable verdict cache —
 * so the host manifest service stays close to its upstream shape and only maps verdicts to status.
 */
export class ExtensionGalleryAccountService extends Disposable {

	private readonly authProvider: ExtensionGalleryAccessProviderId;

	private readonly _onDidChangeAccount = this._register(new Emitter<void>());
	/**
	 * Fires when the underlying account may have changed (Microsoft session added/removed/changed,
	 * or the GitHub default account changed), so the host can re-run validation.
	 */
	readonly onDidChangeAccount: Event<void> = this._onDidChangeAccount.event;

	constructor(
		private readonly indexService: ExtensionGalleryServiceIndexService,
		@IProductService private readonly productService: IProductService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.authProvider = getEffectiveAuthProvider(configurationService, productService);

		// Relay only the change signal that is relevant to the effective provider so the host does
		// not re-validate on unrelated account activity.
		const source = this.authProvider === 'microsoft'
			? Event.map(Event.filter(this.authenticationService.onDidChangeSessions, e => e.providerId === 'microsoft', this._store), () => undefined, this._store)
			: Event.map(this.defaultAccountService.onDidChangeDefaultAccount, () => undefined, this._store);
		this._register(source(() => this._onDidChangeAccount.fire()));
	}

	/**
	 * Resolves the current account's access verdict for `configuredServiceUrl`, performing a live
	 * eligibility check for the effective provider. Returns `undefined` when no account is signed in
	 * (sign-in required), `{ eligible: false }` for a durable denial, and `{ eligible: true, ... }`
	 * when access is granted. Throws {@link MarketplaceMisconfiguredError} when the deployment is
	 * misconfigured for the effective provider, and rethrows transient/network errors so the host
	 * can preserve an already-available marketplace instead of downgrading it.
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
			// Account exists but is not entitled → durable denial, cache it.
			this.cacheAccess({ authProvider: 'github', accountId: account.accountName, eligible: false, serviceUrl: configuredServiceUrl });
			return { eligible: false };
		}
		// Entitled → confirm the marketplace is reachable by fetching its service index. A transient
		// failure here propagates (no cache write) so the host surfaces "unreachable".
		const manifest = await this.indexService.getServiceIndex(configuredServiceUrl, token);
		if (token.isCancellationRequested) {
			return undefined;
		}
		this.cacheAccess({ authProvider: 'github', accountId: account.accountName, eligible: true, serviceUrl: configuredServiceUrl });
		return { eligible: true, manifest };
	}

	private checkGitHubAccess(account: IDefaultAccount): boolean {
		if (account.entitlementsData?.access_type_sku
			&& this.productService.extensionsGallery?.accessSKUs?.includes(account.entitlementsData.access_type_sku)) {
			return true;
		}
		return account.enterprise;
	}

	private async getMicrosoftAccount(configuredServiceUrl: string, token: CancellationToken): Promise<IExtensionGalleryAccount | undefined> {
		// Acquire an existing Microsoft session silently — `getSessions` never prompts for sign-in.
		// A throw here is a transient auth-service failure: propagate so the host preserves cache.
		const sessions = await this.authenticationService.getSessions('microsoft', PRIVATE_MARKETPLACE_SCOPES);
		if (token.isCancellationRequested) {
			return undefined;
		}
		const session = sessions[0];
		if (!session) {
			// No token. When 'microsoft' is configured the service index MAY itself be auth-gated
			// (admin's discretion), so an anonymous probe would at best return a guaranteed 401.
			// Go straight to sign-in; there is deliberately NO fallback to GitHub.
			this.clearCache();
			return undefined;
		}

		if (!isSafeTokenTarget(configuredServiceUrl, configuredServiceUrl)) {
			// We will not attach a bearer token to a non-HTTPS service index. Without a token a
			// gated index is unreadable, so this deployment is misconfigured for Entra auth.
			this.logService.error('[Marketplace] Refusing to send the Microsoft token to a non-HTTPS service index URL — the marketplace is misconfigured for Entra auth.');
			this.clearCache();
			throw new MarketplaceMisconfiguredError('The service index URL is not HTTPS.');
		}

		let manifest: IExtensionGalleryManifest;
		try {
			manifest = await this.indexService.getServiceIndex(configuredServiceUrl, token, session.accessToken);
		} catch (error) {
			if (error instanceof MarketplaceAuthRequiredError) {
				return this.denyFromAuthError(error, session, configuredServiceUrl);
			}
			// Transient error fetching the index — propagate so the host surfaces "unreachable"
			// while preserving any cached verdict.
			throw error;
		}
		if (token.isCancellationRequested) {
			return undefined;
		}

		const eligibilityUrl = getExtensionGalleryManifestResourceUri(manifest, ExtensionGalleryResourceType.EligibilityService);
		if (!eligibilityUrl) {
			// The manifest was fetched but advertises no EligibilityService — misconfigured for Entra.
			this.logService.error('[Marketplace] authProvider is "microsoft" but the gallery manifest does not advertise an EligibilityService resource — the marketplace is misconfigured for Entra auth.');
			this.clearCache();
			throw new MarketplaceMisconfiguredError('The gallery manifest does not advertise an EligibilityService.');
		}
		if (!isSafeTokenTarget(eligibilityUrl, configuredServiceUrl)) {
			// The advertised eligibility endpoint is not same-origin HTTPS with the configured index.
			// Sending the token there would risk leaking it to a foreign/cleartext origin.
			this.logService.error('[Marketplace] The EligibilityService URL is not same-origin HTTPS with the configured service index — refusing to transmit the Microsoft token. The marketplace is misconfigured for Entra auth.');
			this.clearCache();
			throw new MarketplaceMisconfiguredError('The EligibilityService URL is not same-origin HTTPS with the service index.');
		}

		let result: { eligible: boolean; reason?: string };
		try {
			result = await this.checkMicrosoftEligibility(eligibilityUrl, session.accessToken, token);
		} catch (error) {
			if (error instanceof MarketplaceAuthRequiredError) {
				return this.denyFromAuthError(error, session, configuredServiceUrl);
			}
			// Network/5xx/malformed response — not a definitive verdict. Propagate so the host
			// surfaces "unreachable" and never caches it.
			throw error;
		}
		if (token.isCancellationRequested) {
			return undefined;
		}

		// A 200 is definitive — cache it. The server-provided `reason` is NOT persisted: it is not
		// used for any UI/gating decision and could carry account/tenant diagnostic text.
		this.cacheAccess({ authProvider: 'microsoft', accountId: session.account.id, eligible: result.eligible, serviceUrl: configuredServiceUrl });
		this.telemetryService.publicLog2<MarketplaceAuthEvent, MarketplaceAuthClassification>('marketplace:auth:checked', {
			authProvider: 'microsoft',
			eligible: result.eligible,
		});
		return { eligible: result.eligible, manifest, accessToken: session.accessToken };
	}

	/**
	 * Maps a {@link MarketplaceAuthRequiredError} raised while presenting a Microsoft token into a
	 * denial verdict. A 403 (token accepted, identity forbidden) is a durable denial and is cached;
	 * a 401 (token rejected) is not durable, so the cache is cleared and nothing negative is written.
	 * Either way the caller surfaces AccessDenied rather than looping the already-signed-in user
	 * back to sign-in on the same rejected token.
	 */
	private denyFromAuthError(error: MarketplaceAuthRequiredError, session: AuthenticationSession, configuredServiceUrl: string): IExtensionGalleryAccount {
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
			// A bearer token is attached, so never follow redirects: the request service would
			// forward the Authorization header to the (possibly cross-origin) redirect target and
			// leak the token. A 3xx is treated as a non-200 error below.
			followRedirects: 0,
		}, cancellationToken);

		if (context.res.statusCode !== 200) {
			if (context.res.statusCode === 401 || context.res.statusCode === 403) {
				// Auth-specific outcome at the eligibility endpoint. Surface the status code so the
				// caller can distinguish 401 (token missing/expired/wrong-audience — re-auth may fix
				// it) from 403 (token accepted but identity forbidden — a durable denial), mirroring
				// the service-index fetch classification.
				throw new MarketplaceAuthRequiredError(context.res.statusCode);
			}
			// Any other non-200 is NOT a definitive eligibility result — throw a generic error so
			// callers treat it as transient/server error and don't cache it.
			throw new Error(`Eligibility endpoint returned status ${context.res.statusCode}`);
		}

		const response = await asJson<IEligibilityResponse>(context);
		if (!response || typeof response.eligible !== 'boolean') {
			// A 200 with a missing/non-boolean `eligible` is not a definitive verdict — a server
			// contract drift must not be coerced into a durable allow/deny. Throw so the caller
			// treats it as transient and never caches it.
			throw new Error('Eligibility endpoint returned a malformed response');
		}
		return { eligible: response.eligible, reason: response.reason };
	}

	/**
	 * Reads the persisted verdict and, if it is still trustworthy for the current identity, returns
	 * it for immediate application on startup (the fast-path that avoids a sign-in flash). The cached
	 * verdict is an authorization input: it is honored only when the currently signed-in account
	 * matches the account the verdict was written for. Returns `undefined` when there is no usable
	 * cache; throws on a transient identity-resolution failure so the host preserves an available
	 * marketplace instead of downgrading it. Never returns a manifest — the host (re-)fetches the
	 * index itself when rendering Available.
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
			// host to keep any current state rather than treating this as "no account".
			throw new Error('Unable to resolve the current account for cache validation.');
		}
		if (current.kind === 'none' || current.accountId !== cached.accountId) {
			// The verdict was written for a different (or no longer present) account — drop it.
			this.clearCache();
			return undefined;
		}
		if (!cached.eligible) {
			return { eligible: false };
		}
		return { eligible: true, accessToken: current.token };
	}

	/**
	 * Silently resolves the current account for the effective provider, returning its identity (and
	 * bearer token, on the Microsoft path) for cache validation. Never prompts for sign-in. Returns
	 * `{ kind: 'error' }` on a transient failure so callers can distinguish it from "no account".
	 */
	private async resolveCurrentAccount(): Promise<AccountResolution> {
		try {
			if (this.authProvider === 'microsoft') {
				const sessions = await this.authenticationService.getSessions('microsoft', PRIVATE_MARKETPLACE_SCOPES);
				const session = sessions[0];
				return session ? { kind: 'account', accountId: session.account.id, token: session.accessToken } : { kind: 'none' };
			}
			const account = await this.defaultAccountService.getDefaultAccount();
			return account ? { kind: 'account', accountId: account.accountName } : { kind: 'none' };
		} catch {
			return { kind: 'error' };
		}
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

	/** Persists a durable verdict. Only ever called for definitive (durable) allow/deny outcomes. */
	private cacheAccess(access: ICachedAccess): void {
		this.storageService.store(CACHED_ACCESS_KEY, JSON.stringify(access), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	/** Drops the persisted verdict (on sign-out, account/provider/serviceUrl change, or 401). */
	clearCache(): void {
		this.storageService.remove(CACHED_ACCESS_KEY, StorageScope.APPLICATION);
	}
}
