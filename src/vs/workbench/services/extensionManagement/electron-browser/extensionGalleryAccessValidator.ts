/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IHeaders } from '../../../../base/parts/request/common/request.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IExtensionGalleryManifest, ExtensionGalleryAuthProviderConfigKey, ExtensionGalleryManifestStatus } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { resolveMarketplaceHeaders } from '../../../../platform/externalServices/common/marketplace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IExtensionGalleryAccessCore, IExtensionGalleryAccessProvider, IExtensionGalleryAccessSink, ICachedAccess, isSafeTokenTarget, MarketplaceAuthRequiredError } from './extensionGalleryAccess.js';
import { ExtensionGalleryGitHubAccessProvider, ExtensionGalleryMicrosoftAccessProvider } from './extensionGalleryAccessProviders.js';

/**
 * Validates Private Marketplace access for the current account and drives the resulting
 * manifest/status through an {@link IExtensionGalleryAccessSink}.
 *
 * Supersession (sign-out, account/session switch, or a marketplace/provider config change)
 * is handled with a per-validation {@link CancellationTokenSource} held in a
 * {@link MutableDisposable}: starting a new validation cancels the previous one, so a stale
 * in-flight eligibility check observes `token.isCancellationRequested` and does not mutate
 * status/cache/manifest. This closes a time-of-check/time-of-use window where a superseded
 * validation could restore access for an account that is no longer current.
 */
export class ExtensionGalleryAccessValidator extends Disposable implements IExtensionGalleryAccessCore {

	private static readonly CACHED_ACCESS_KEY = 'marketplace.cachedAccess';

	private readonly commonHeadersPromise: Promise<IHeaders>;

	// Cancellation source for the in-flight access validation. Starting a new validation (via
	// `beginValidation`) cancels the previous one, so a superseded validation's late-arriving
	// async continuation observes `token.isCancellationRequested` and does not mutate status/
	// cache/manifest. This closes a time-of-check/time-of-use window where a stale in-flight
	// eligibility check could restore access for an account that is no longer current (after
	// sign-out, an account switch, or a config change).
	private readonly _validationTokenSource = this._register(new MutableDisposable<CancellationTokenSource>());

	// The access-provider strategy for the effective auth provider, created lazily by
	// `resolveAccessStrategy` (post-construction) so injecting IAuthenticationService into the
	// Microsoft provider does not reintroduce the host-service construction cycle.
	private _provider: IExtensionGalleryAccessProvider | undefined;

	constructor(
		private readonly _sink: IExtensionGalleryAccessSink,
		@IProductService private readonly productService: IProductService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.commonHeadersPromise = resolveMarketplaceHeaders(
			this.productService.version,
			this.productService,
			environmentService,
			this.configurationService,
			fileService,
			this.storageService,
			this.telemetryService);
	}

	get sink(): IExtensionGalleryAccessSink {
		return this._sink;
	}

	/**
	 * Resolves the effective marketplace auth provider, applying the Entra (microsoft)
	 * product gate. When `product.enableExtensionGalleryEntraAuth` is falsy, a configured
	 * `microsoft` provider is downgraded to the GitHub/default provider so the Entra path
	 * stays dormant until the Private Marketplace is publicly released.
	 */
	getEffectiveAuthProvider(): string {
		const configuredAuthProvider = this.configurationService.getValue<string>(ExtensionGalleryAuthProviderConfigKey);
		if (configuredAuthProvider === 'microsoft' && !this.productService.enableExtensionGalleryEntraAuth) {
			return 'github';
		}
		return configuredAuthProvider || 'github';
	}

	/**
	 * Establishes access for the configured Private Marketplace: registers provider/session
	 * change listeners, applies any cancellation-guarded cached verdict for a fast startup, then
	 * validates the current account (foreground when there was no cache, background otherwise).
	 */
	async initialize(configuredServiceUrl: string): Promise<void> {
		// 1. Resolve the auth strategy FIRST so provider/session change listeners are active
		//    before we apply any cached verdict. This lets a mid-application account/session
		//    switch supersede the cache via the cancellation-token guard in applyCachedAccess,
		//    rather than racing an unguarded cache application. resolveAccessStrategy only
		//    registers listeners and returns the validate function — it performs no auth calls
		//    itself, so this reordering does not change when the network is first touched.
		const validateAccess = await this.resolveAccessStrategy(configuredServiceUrl);

		// 2. Apply cache immediately (cancellation-guarded) before awaiting foreground validation.
		const cached = this.getCachedAccess(configuredServiceUrl);
		if (cached) {
			this.logService.debug('[Marketplace] Applying cached access result on startup');
			await this.applyCachedAccess(cached, configuredServiceUrl, this.beginValidation());
		}

		// 3. Validate (foreground if no cache, background if cache was applied)
		if (cached) {
			validateAccess();
		} else {
			await validateAccess();
		}
	}

	/**
	 * Selects the access-provider strategy for the effective auth provider, subscribes to its
	 * account/session changes for re-validation, and returns a function that validates current
	 * access. There is deliberately NO fallback between providers: once an administrator has
	 * configured 'microsoft', a server that does not advertise an EligibilityService is treated
	 * as misconfigured rather than silently downgraded to GitHub.
	 */
	private async resolveAccessStrategy(configuredServiceUrl: string): Promise<() => Promise<void>> {
		const provider = this._provider = this.createProvider(this.getEffectiveAuthProvider());
		const validate = () => provider.validate(configuredServiceUrl, this.beginValidation());
		this._register(provider.onDidChangeAccount(() => {
			this.clearCache();
			// Revoke the manifest that was authorized for the previous account/session before
			// revalidating. Without this, the active status stays `Available`, and if the new
			// account's validation hits a transient index/eligibility failure the catch paths
			// preserve `Available` — leaking the prior account's authorization to the new
			// (possibly ineligible) account.
			this._sink.update(null);
			validate();
		}));
		return validate;
	}

	/**
	 * Instantiates the access-provider strategy for the effective auth provider, passing `this`
	 * as the shared {@link IExtensionGalleryAccessCore}. Created lazily (post-construction, from
	 * `initialize`) so injecting IAuthenticationService into the Microsoft provider does not
	 * reintroduce the host-service construction cycle that eager DI would.
	 */
	private createProvider(authProvider: string): IExtensionGalleryAccessProvider {
		const provider = authProvider === 'microsoft'
			? this.instantiationService.createInstance(ExtensionGalleryMicrosoftAccessProvider, this)
			: this.instantiationService.createInstance(ExtensionGalleryGitHubAccessProvider, this);
		return this._register(provider);
	}

	/**
	 * Begins a new access-validation generation and returns its cancellation token, cancelling
	 * any previously started validation. Long-running validations MUST check
	 * `token.isCancellationRequested` immediately before every mutation of status/cache/manifest
	 * and bail when it is set, so a superseded validation cannot commit a stale verdict.
	 */
	private beginValidation(): CancellationToken {
		// `MutableDisposable` disposes the previous source on assignment, but
		// `CancellationTokenSource.dispose()` does not cancel — cancel explicitly so any in-flight
		// continuation (and threaded request) is superseded before the old source is disposed.
		this._validationTokenSource.value?.cancel();
		const source = new CancellationTokenSource();
		this._validationTokenSource.value = source;
		return source.token;
	}

	/**
	 * Cancels any in-flight validation without starting a new one, so a late-arriving result
	 * cannot mutate status/cache/manifest. Used when a config change supersedes the current
	 * marketplace/provider (the restart prompt is dismissable, so the process may keep running).
	 */
	cancel(): void {
		this._validationTokenSource.value?.cancel();
		this._validationTokenSource.clear();
	}

	// --- Access caching (provider-agnostic) ---

	private getCachedAccess(configuredServiceUrl: string): ICachedAccess | null {
		const raw = this.storageService.get(
			ExtensionGalleryAccessValidator.CACHED_ACCESS_KEY,
			StorageScope.APPLICATION);
		if (!raw) { return null; }
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			// Corrupt cache entry — drop it so a bad value can't wedge startup.
			this.clearCache();
			return null;
		}
		if (!this.isValidCachedAccess(parsed)) {
			// Unexpected shape (e.g. written by an incompatible/older build that predates a
			// cache-schema field) — don't trust it.
			this.clearCache();
			return null;
		}
		// The cached verdict is an authorization input, so only trust it for the provider
		// that is currently in effect. A cache written under a different provider (e.g. the
		// admin switched `extensions.gallery.authProvider`, or the Entra product gate flipped)
		// must not grant access here; drop it and let foreground validation re-establish
		// access for the effective provider. Cross-account staleness within the same provider
		// is corrected by the background re-validation that runs on every startup and by the
		// onDidChangeSessions/onDidChangeDefaultAccount handlers which clear the cache.
		if (parsed.authProvider !== this.getEffectiveAuthProvider()) {
			this.clearCache();
			return null;
		}
		// The verdict is also scoped to the marketplace it was computed against. If the admin
		// has pointed the client at a different `extensions.gallery.serviceUrl` since the cache
		// was written, the eligibility verdict for the previous marketplace does not apply —
		// drop it so a stale verdict can't briefly grant access to a different marketplace.
		if (parsed.serviceUrl !== configuredServiceUrl) {
			this.clearCache();
			return null;
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

	private async applyCachedAccess(cached: ICachedAccess, configuredServiceUrl: string, token: CancellationToken): Promise<void> {
		// A cached verdict is an authorization input, so only trust it for the account it was
		// written for. Resolve the current account (silently) and require it to match before
		// applying an eligible cache — otherwise a stale cross-account entry could briefly grant
		// access at cold start before background validation corrects it.
		const current = await this._provider!.resolveCurrentAccount();
		if (token.isCancellationRequested) {
			// A newer validation (e.g. an account/session change that fired while we resolved the
			// account) superseded this cache application — let it own the outcome and don't touch
			// status or cache here.
			return;
		}
		if (current.kind === 'error') {
			// Could not determine the current account (transient auth failure). Don't grant access
			// from an unverifiable cache, but don't invalidate it either — background validation
			// will retry. Surface "unreachable" so the marketplace isn't left blank.
			if (this._sink.getStatus() !== ExtensionGalleryManifestStatus.Available) {
				this._sink.update(null, ExtensionGalleryManifestStatus.Unreachable);
			}
			return;
		}
		if (current.kind === 'none' || current.accountId !== cached.accountId) {
			// No account, or a different account than the cache was written for — drop it and let
			// foreground/background validation re-establish access for the current identity.
			this.clearCache();
			return;
		}

		if (!cached.eligible) {
			this._sink.update(null, ExtensionGalleryManifestStatus.AccessDenied);
			return;
		}

		// Eligible for the current account — fetch the manifest to render Available. If the
		// provider resolved a session token (Microsoft), attach it so a gated index is readable,
		// applying the same-origin token-transport guard first; providers that resolve no token
		// (GitHub) fetch anonymously.
		let accessToken: string | undefined;
		if (current.token) {
			if (!isSafeTokenTarget(configuredServiceUrl, configuredServiceUrl)) {
				this._sink.update(null, ExtensionGalleryManifestStatus.Misconfigured);
				return;
			}
			accessToken = current.token;
		}
		try {
			const manifest = await this.fetchServiceIndex(configuredServiceUrl, token, accessToken);
			if (token.isCancellationRequested) {
				// A newer validation superseded this cache application while we fetched the
				// manifest — do not apply a manifest for a possibly-stale account.
				return;
			}
			this._sink.update(manifest);
		} catch (error) {
			if (token.isCancellationRequested) {
				return;
			}
			if (error instanceof MarketplaceAuthRequiredError) {
				// The cached token was rejected/expired at cold start. Leave the definitive
				// classification (RequiresSignIn vs AccessDenied) to the background validation that
				// runs right after; don't flash a misleading Unreachable.
				return;
			}
			this.logService.error('[Marketplace] Error fetching manifest from cached access', error);
			// Transient failure fetching the manifest — don't invalidate cache. Background
			// validation will retry; surface an "unreachable" message in the meantime unless we
			// already have a working manifest to keep showing.
			if (this._sink.getStatus() !== ExtensionGalleryManifestStatus.Available) {
				this._sink.update(null, ExtensionGalleryManifestStatus.Unreachable);
			}
		}
	}

	cacheAccess(data: ICachedAccess): void {
		this.storageService.store(
			ExtensionGalleryAccessValidator.CACHED_ACCESS_KEY,
			JSON.stringify(data),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE);
		this.logService.debug('[Marketplace] Cached access result:', data.authProvider, data.eligible);
	}

	/**
	 * Clears any persisted access verdict. Exposed so a marketplace/provider config change can
	 * drop a now-irrelevant cache while it supersedes the in-flight validation.
	 */
	clearCache(): void {
		this.storageService.remove(
			ExtensionGalleryAccessValidator.CACHED_ACCESS_KEY,
			StorageScope.APPLICATION);
		this.logService.debug('[Marketplace] Cleared cached access');
	}

	async fetchServiceIndex(url: string, token: CancellationToken, accessToken?: string): Promise<IExtensionGalleryManifest> {
		const commonHeaders = await this.commonHeadersPromise;
		const headers: IHeaders = {
			...commonHeaders,
			'Content-Type': 'application/json',
			'Accept-Encoding': 'gzip',
		};
		// The service index MAY be protected (admin's discretion). Present a bearer token
		// when we have one; it is harmless on a public index and required on a gated one.
		if (accessToken) {
			headers['Authorization'] = `Bearer ${accessToken}`;
		}

		try {
			const context = await this.requestService.request({
				type: 'GET',
				url,
				headers,
				// When a bearer token is attached, never follow redirects — the request service
				// would forward the Authorization header to the redirect target (possibly a
				// different origin) and leak the token. Anonymous fetches may still redirect.
				followRedirects: accessToken ? 0 : undefined,
				callSite: 'extensionGalleryManifestService.fetchManifest'
			}, token);

			if (context.res.statusCode === 401 || context.res.statusCode === 403) {
				// The service index is auth-gated and this request was not authorized.
				// Surface a typed error so the Entra path can prompt for sign-in (or treat a
				// rejected token as denied) rather than mislabeling it as unreachable.
				throw new MarketplaceAuthRequiredError(context.res.statusCode);
			}

			if (context.res.statusCode && (context.res.statusCode < 200 || context.res.statusCode >= 300)) {
				// Any other non-2xx (404/5xx/…) is an error, not a manifest. Reject before
				// parsing so a JSON error body can never be mistaken for a valid service index.
				throw new Error(`Service index returned status ${context.res.statusCode}`);
			}

			const extensionGalleryManifest = await asJson<IExtensionGalleryManifest>(context);

			if (!extensionGalleryManifest) {
				throw new Error('Unable to retrieve extension gallery manifest.');
			}

			if (!Array.isArray(extensionGalleryManifest.resources)) {
				// A 200 whose body is valid JSON but not a service index (e.g. a server error
				// object, or an HTML/JSON captive-portal page) must not be treated as a
				// manifest — `resources` is required to discover gallery endpoints (including
				// the EligibilityService). Reject here so callers classify it as a failed
				// fetch, rather than letting resource-URI discovery throw on a non-iterable
				// `resources` outside this try/catch.
				throw new Error('Service index response is not a valid extension gallery manifest.');
			}

			if (!extensionGalleryManifest.resources.every(resource => resource && typeof resource.id === 'string' && typeof resource.type === 'string')) {
				// `resources` is an array but at least one entry is malformed (missing/non-string
				// `id` or `type`). `getExtensionGalleryManifestResourceUri` calls `resource.type.split()`
				// outside this fetch's try/catch during endpoint discovery, so an undefined `type`
				// would throw there and reject initialization instead of being classified as a failed
				// fetch. Reject here so the caller surfaces `Unreachable`.
				throw new Error('Service index response contains malformed extension gallery resources.');
			}

			return extensionGalleryManifest;
		} catch (error) {
			if (error instanceof MarketplaceAuthRequiredError) {
				// Not a failure: an auth-gated service index rejected an unauthenticated (or
				// stale-token) request. Callers translate this into a RequiresSignIn/AccessDenied
				// state and the workbench surfaces the corresponding sign-in affordance, so logging
				// it at `error` would misrepresent the normal "not signed in yet" flow as a fault.
				this.logService.trace('[Marketplace] Extension gallery manifest requires authentication', error.statusCode);
			} else {
				this.logService.error('[Marketplace] Error retrieving extension gallery manifest', error);
			}
			throw error;
		}
	}
}
