/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../base/common/defaultAccount.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IExtensionGalleryManifest, ExtensionGalleryManifestStatus, ExtensionGalleryResourceType, getExtensionGalleryManifestResourceUri, PRIVATE_MARKETPLACE_SCOPES } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { AuthenticationSession, IAuthenticationService } from '../../authentication/common/authentication.js';
import { AccountResolution, IExtensionGalleryAccessCore, IExtensionGalleryAccessProvider, isSafeTokenTarget, MarketplaceAuthRequiredError } from './extensionGalleryAccess.js';

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
 * GitHub access strategy: validates Private Marketplace access from the ambient
 * {@link IDefaultAccountService} account and its entitlement/enterprise flags. This is the default
 * provider when `extensions.gallery.authProvider` is unset or `github`.
 */
export class ExtensionGalleryGitHubAccessProvider extends Disposable implements IExtensionGalleryAccessProvider {

	readonly id = 'github' as const;
	readonly onDidChangeAccount: Event<void>;

	constructor(
		private readonly _core: IExtensionGalleryAccessCore,
		@IProductService private readonly productService: IProductService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.onDidChangeAccount = Event.map(this.defaultAccountService.onDidChangeDefaultAccount, () => undefined, this._store);
	}

	async resolveCurrentAccount(): Promise<AccountResolution> {
		try {
			const account = await this.defaultAccountService.getDefaultAccount();
			return account ? { kind: 'account', accountId: account.accountName } : { kind: 'none' };
		} catch {
			return { kind: 'error' };
		}
	}

	async validate(configuredServiceUrl: string, token: CancellationToken): Promise<void> {
		try {
			const account = await this.defaultAccountService.getDefaultAccount();
			if (token.isCancellationRequested) {
				// A newer validation superseded this one while we awaited — discard.
				return;
			}
			if (!account) {
				// Auth service responded: no account → invalidate cache
				this._core.clearCache();
				this._core.sink.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
			} else if (!this.checkAccess(account)) {
				// Auth service responded: account exists but ineligible → cache the result
				this._core.cacheAccess({ authProvider: 'github', accountId: account.accountName, eligible: false, serviceUrl: configuredServiceUrl });
				this._core.sink.update(null, ExtensionGalleryManifestStatus.AccessDenied);
			} else if (this._core.sink.getStatus() !== ExtensionGalleryManifestStatus.Available) {
				try {
					const manifest = await this._core.fetchServiceIndex(configuredServiceUrl, token);
					if (token.isCancellationRequested) {
						return;
					}
					this._core.cacheAccess({ authProvider: 'github', accountId: account.accountName, eligible: true, serviceUrl: configuredServiceUrl });
					this._core.sink.update(manifest);
					this.telemetryService.publicLog2<
						{},
						{
							owner: 'sandy081';
							comment: 'Reports when a user successfully accesses a custom marketplace';
						}>('galleryservice:custom:marketplace');
				} catch (error) {
					if (token.isCancellationRequested) {
						return;
					}
					// Eligible, but the marketplace manifest could not be fetched — the
					// marketplace is currently unreachable. Preserve cache; surface a message.
					this.logService.error('[Marketplace] Failed to fetch gallery manifest (GitHub path)', error);
					this._core.sink.update(null, ExtensionGalleryManifestStatus.Unreachable);
				}
			}
		} catch (error) {
			if (token.isCancellationRequested) {
				return;
			}
			this.logService.error('[Marketplace] Error in GitHub access check', error);
			// Network/transient error resolving the account — never invalidate cache. Unless we
			// already have a working manifest to keep showing, surface an "unreachable" message so
			// a configured marketplace isn't left on a blank (Unavailable) view with no explanation.
			if (this._core.sink.getStatus() !== ExtensionGalleryManifestStatus.Available) {
				this._core.sink.update(null, ExtensionGalleryManifestStatus.Unreachable);
			}
		}
	}

	private checkAccess(account: IDefaultAccount): boolean {
		if (account.entitlementsData?.access_type_sku
			&& this.productService.extensionsGallery?.accessSKUs?.includes(
				account.entitlementsData.access_type_sku)) {
			return true;
		}
		return account.enterprise;
	}
}

/**
 * Microsoft (Entra ID / VSS) access strategy: acquires an existing Microsoft session silently,
 * fetches the (possibly auth-gated) service index presenting the token, discovers the marketplace's
 * EligibilityService, and checks eligibility there. There is deliberately NO fallback to GitHub:
 * once an administrator configures `microsoft`, a server that does not advertise an
 * EligibilityService is treated as misconfigured rather than silently downgraded.
 */
export class ExtensionGalleryMicrosoftAccessProvider extends Disposable implements IExtensionGalleryAccessProvider {

	static readonly MICROSOFT_AUTH_SCOPES = PRIVATE_MARKETPLACE_SCOPES;

	readonly id = 'microsoft' as const;
	readonly onDidChangeAccount: Event<void>;

	constructor(
		private readonly _core: IExtensionGalleryAccessCore,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IRequestService private readonly requestService: IRequestService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.onDidChangeAccount = Event.map(
			Event.filter(this.authenticationService.onDidChangeSessions, e => e.providerId === 'microsoft', this._store),
			() => undefined,
			this._store);
	}

	async resolveCurrentAccount(): Promise<AccountResolution> {
		try {
			const sessions = await this.authenticationService.getSessions(
				'microsoft',
				ExtensionGalleryMicrosoftAccessProvider.MICROSOFT_AUTH_SCOPES);
			const session = sessions[0];
			return session
				? { kind: 'account', accountId: session.account.id, token: session.accessToken }
				: { kind: 'none' };
		} catch {
			return { kind: 'error' };
		}
	}

	async validate(configuredServiceUrl: string, token: CancellationToken): Promise<void> {
		// Acquire an existing Microsoft session first. `getSessions` reads existing sessions
		// silently and never prompts for sign-in.
		let sessions: readonly AuthenticationSession[];
		try {
			sessions = await this.authenticationService.getSessions(
				'microsoft',
				ExtensionGalleryMicrosoftAccessProvider.MICROSOFT_AUTH_SCOPES);
		} catch (error) {
			if (token.isCancellationRequested) {
				return;
			}
			// Auth service unavailable — transient error, never invalidate cache. Unless we
			// already have a working manifest to keep showing, surface an "unreachable" message so
			// a configured marketplace isn't left on a blank (Unavailable) view with no explanation.
			this.logService.error('[Marketplace] Error getting Microsoft sessions', error);
			if (this._core.sink.getStatus() !== ExtensionGalleryManifestStatus.Available) {
				this._core.sink.update(null, ExtensionGalleryManifestStatus.Unreachable);
			}
			return;
		}
		if (token.isCancellationRequested) {
			// A newer validation superseded this one while we awaited — discard.
			return;
		}
		const session = sessions[0];

		if (!session) {
			// No token. When 'microsoft' is configured the service index MAY itself be
			// auth-gated (admin's discretion), so an anonymous probe would, at best, return
			// a guaranteed 401. Rather than issue that certain-to-fail request, go straight
			// to sign-in. Eligibility and any misconfiguration/unreachable state are only
			// evaluated once we can present a token (on the post-sign-in re-validation
			// triggered by onDidChangeSessions). There is deliberately NO fallback to GitHub.
			this._core.clearCache();
			this._core.sink.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
			return;
		}

		// We have a token — fetch the service index (presenting the token so a gated index is
		// readable), then discover the eligibility endpoint from it. The manifest is carried
		// forward to `applyEligibilityResult` so it is fetched exactly once: this keeps the
		// 401/403 vs transient classification below the single source of truth for the index
		// fetch outcome.
		if (!isSafeTokenTarget(configuredServiceUrl, configuredServiceUrl)) {
			// We will not attach a bearer token to a non-HTTPS service index. Without a token
			// a gated index is unreadable, so this deployment is misconfigured for Entra auth.
			this.logService.error('[Marketplace] Refusing to send the Microsoft token to a non-HTTPS service index URL — the marketplace is misconfigured for Entra auth.');
			this._core.clearCache();
			this._core.sink.update(null, ExtensionGalleryManifestStatus.Misconfigured);
			return;
		}
		let manifest: IExtensionGalleryManifest;
		try {
			manifest = await this._core.fetchServiceIndex(configuredServiceUrl, token, session.accessToken);
		} catch (error) {
			if (token.isCancellationRequested) {
				return;
			}
			if (error instanceof MarketplaceAuthRequiredError) {
				if (error.statusCode === 403) {
					// 403: the token is accepted but this identity is forbidden from reading
					// the service index — a durable denial. Cache it so we don't re-probe.
					this._core.cacheAccess({ authProvider: 'microsoft', accountId: session.account.id, eligible: false, serviceUrl: configuredServiceUrl });
					this._core.sink.update(null, ExtensionGalleryManifestStatus.AccessDenied);
				} else {
					// 401: the token was missing/expired/invalid (e.g. wrong audience). This
					// is NOT a durable "ineligible" verdict — re-authentication may fix it —
					// so do not cache a negative result; ask the user to (re-)sign in. A fresh
					// sign-in fires onDidChangeSessions and re-runs this check with a new token.
					this._core.clearCache();
					this._core.sink.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
				}
				return;
			}
			// Transient error fetching the manifest — the marketplace is currently
			// unreachable. Preserve cache and, unless we already have a working manifest
			// to keep showing, surface an "unreachable" message.
			this.logService.error('[Marketplace] Error fetching the service index', error);
			if (this._core.sink.getStatus() !== ExtensionGalleryManifestStatus.Available) {
				this._core.sink.update(null, ExtensionGalleryManifestStatus.Unreachable);
			}
			return;
		}

		if (token.isCancellationRequested) {
			return;
		}

		const eligibilityUrl = getExtensionGalleryManifestResourceUri(manifest, ExtensionGalleryResourceType.EligibilityService);
		if (!eligibilityUrl) {
			// Definitive: the manifest was fetched but advertises no EligibilityService.
			this.logService.error('[Marketplace] authProvider is "microsoft" but the gallery manifest does not advertise an EligibilityService resource — the marketplace is misconfigured for Entra auth.');
			this._core.clearCache();
			this._core.sink.update(null, ExtensionGalleryManifestStatus.Misconfigured);
			return;
		}

		if (!isSafeTokenTarget(eligibilityUrl, configuredServiceUrl)) {
			// The manifest-advertised eligibility endpoint is not same-origin HTTPS with the
			// admin-configured service index. Sending the Microsoft token there would risk
			// leaking it to a foreign or cleartext origin (e.g. a compromised/misconfigured
			// manifest), so refuse and treat the deployment as misconfigured.
			this.logService.error('[Marketplace] The EligibilityService URL is not same-origin HTTPS with the configured service index — refusing to transmit the Microsoft token. The marketplace is misconfigured for Entra auth.');
			this._core.clearCache();
			this._core.sink.update(null, ExtensionGalleryManifestStatus.Misconfigured);
			return;
		}

		// Check eligibility via server
		try {
			const result = await this.checkMicrosoftEligibility(eligibilityUrl, session.accessToken, token);
			if (token.isCancellationRequested) {
				return;
			}
			// Server responded with 200 — this is a definitive result, cache it. Note we do NOT
			// persist the server-provided `reason` string: it is not used for any UI/gating
			// decision and could carry account/tenant diagnostic text, so keeping it out of
			// application storage avoids persisting unnecessary PII at rest.
			this._core.cacheAccess({
				authProvider: 'microsoft',
				accountId: session.account.id,
				eligible: result.eligible,
				serviceUrl: configuredServiceUrl,
			});
			this.telemetryService.publicLog2<MarketplaceAuthEvent, MarketplaceAuthClassification>(
				'marketplace:auth:checked',
				{
					authProvider: 'microsoft',
					eligible: result.eligible,
				}
			);
			this.applyEligibilityResult(result, manifest);
		} catch (error) {
			if (token.isCancellationRequested) {
				// A newer validation superseded this one while we awaited — discard.
				return;
			}
			if (error instanceof MarketplaceAuthRequiredError) {
				if (error.statusCode === 403) {
					// 403: the token is accepted but this identity is forbidden by the
					// eligibility service — a durable denial. Cache it so we don't re-probe.
					this._core.cacheAccess({ authProvider: 'microsoft', accountId: session.account.id, eligible: false, serviceUrl: configuredServiceUrl });
					this._core.sink.update(null, ExtensionGalleryManifestStatus.AccessDenied);
				} else {
					// 401: the token was missing/expired/invalid (e.g. wrong audience) at the
					// eligibility endpoint. This is NOT a durable "ineligible" verdict —
					// re-authentication may fix it — so do not cache a negative result; ask
					// the user to (re-)sign in. A fresh sign-in re-runs this check.
					this._core.clearCache();
					this._core.sink.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
				}
				return;
			}
			this.logService.error('[Marketplace] Error checking Microsoft eligibility', error);
			// Network/5xx/malformed response at the eligibility endpoint — never invalidate the
			// cache. We could not obtain a definitive verdict, so unless we already have a working
			// manifest to keep showing, surface an "unreachable" message rather than leaving the
			// user on a blank (Unavailable) marketplace with no explanation.
			if (this._core.sink.getStatus() !== ExtensionGalleryManifestStatus.Available) {
				this._core.sink.update(null, ExtensionGalleryManifestStatus.Unreachable);
			}
		}
	}

	/**
	 * Applies a definitive (200) eligibility verdict using the already-fetched service index
	 * manifest. No further network request is made here — the manifest was validated during
	 * discovery, so an eligible user is taken straight to `Available`.
	 */
	private applyEligibilityResult(result: { eligible: boolean; reason?: string }, manifest: IExtensionGalleryManifest): void {
		if (result.eligible) {
			if (this._core.sink.getStatus() !== ExtensionGalleryManifestStatus.Available) {
				this._core.sink.update(manifest);
			}
		} else {
			this._core.sink.update(null, ExtensionGalleryManifestStatus.AccessDenied);
		}
	}

	private async checkMicrosoftEligibility(
		url: string, token: string, cancellationToken: CancellationToken
	): Promise<{ eligible: boolean; reason?: string }> {
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
				// Auth-specific outcome at the eligibility endpoint. Surface the status code
				// so the caller can distinguish 401 (token missing/expired/wrong-audience —
				// re-auth may fix it) from 403 (token accepted but identity forbidden — a
				// durable denial), mirroring the service-index fetch classification.
				throw new MarketplaceAuthRequiredError(context.res.statusCode);
			}
			// Any other non-200 is NOT a definitive eligibility result — throw a generic
			// error so callers treat it as transient/server error and don't cache it.
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
}
