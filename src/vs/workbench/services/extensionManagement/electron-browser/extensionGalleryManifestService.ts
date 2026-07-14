/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../base/common/defaultAccount.js';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IHeaders } from '../../../../base/parts/request/common/request.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IExtensionGalleryManifestService, IExtensionGalleryManifest, ExtensionGalleryServiceUrlConfigKey, ExtensionGalleryAuthProviderConfigKey, ExtensionGalleryManifestStatus, ExtensionGalleryResourceType, getExtensionGalleryManifestResourceUri, PRIVATE_MARKETPLACE_SCOPES, CONTEXT_MARKETPLACE_AUTH_PROVIDER, discoverMarketplaceProtectedResource } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { ExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifestService.js';
import { resolveMarketplaceHeaders } from '../../../../platform/externalServices/common/marketplace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../host/browser/host.js';
import { AuthenticationSession, IAuthenticationService } from '../../authentication/common/authentication.js';

interface ICachedAccess {
	authProvider: 'github' | 'microsoft';
	accountId: string;
	eligible: boolean;
	/**
	 * The `extensions.gallery.serviceUrl` the verdict was computed against. A verdict is scoped
	 * to a specific marketplace (the eligibility endpoint is discovered per-marketplace), so a
	 * cache written for one service URL must never be applied after the admin points the client
	 * at a different marketplace.
	 */
	serviceUrl: string;
}

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
 * Thrown by the service-index (gallery manifest) fetch when the request is rejected for
 * authentication/authorization reasons (HTTP 401/403). The service index MAY be protected
 * at the administrator's discretion, so this is kept distinct from transient/network
 * failures: callers on the Entra path use it to decide whether to prompt for sign-in
 * (no token was presented) or to treat the identity as denied (a token was rejected),
 * rather than mislabeling an auth-gated index as "unreachable".
 */
class MarketplaceAuthRequiredError extends Error {
	constructor(
		readonly statusCode: number,
		/**
		 * The raw `WWW-Authenticate` challenge header returned alongside a 401, when present.
		 * RFC 9728 negotiation reads the `resource_metadata` (and optionally `scope`) parameters
		 * from this challenge to discover the marketplace's Protected Resource Metadata and the
		 * resource-scoped token to acquire. Absent on 403 (the identity is refused, not
		 * un-authenticated) and on servers that omit the header.
		 */
		readonly wwwAuthenticate?: string,
	) {
		super(`Extension gallery request requires authentication (status ${statusCode}).`);
	}
}

/**
 * Reads a response header case-insensitively. HTTP header names are case-insensitive
 * (RFC 7230 §3.2) and different transports normalize casing differently (Node lowercases,
 * others preserve the wire casing), so a fixed-case lookup on `WWW-Authenticate` is unsafe.
 */
function getResponseHeader(headers: IHeaders | undefined, name: string): string | undefined {
	if (!headers) {
		return undefined;
	}
	const lowerName = name.toLowerCase();
	for (const key of Object.keys(headers)) {
		if (key.toLowerCase() === lowerName) {
			const value = headers[key];
			// A header may be delivered as a single string or, if repeated, an array of values.
			// RFC 7235 permits multiple challenges in a single `WWW-Authenticate` value, so join
			// repeated headers with commas to reconstruct the full challenge list for the parser.
			return Array.isArray(value) ? value.join(', ') : value;
		}
	}
	return undefined;
}

export class WorkbenchExtensionGalleryManifestService extends ExtensionGalleryManifestService implements IExtensionGalleryManifestService {

	private static readonly MICROSOFT_AUTH_SCOPES = PRIVATE_MARKETPLACE_SCOPES;
	private static readonly CACHED_ACCESS_KEY = 'marketplace.cachedAccess';

	private readonly commonHeadersPromise: Promise<IHeaders>;
	private extensionGalleryManifest: IExtensionGalleryManifest | null = null;

	private _onDidChangeExtensionGalleryManifest = this._register(new Emitter<IExtensionGalleryManifest | null>());
	override readonly onDidChangeExtensionGalleryManifest = this._onDidChangeExtensionGalleryManifest.event;

	private currentStatus: ExtensionGalleryManifestStatus = ExtensionGalleryManifestStatus.Unavailable;
	override get extensionGalleryManifestStatus(): ExtensionGalleryManifestStatus { return this.currentStatus; }
	private _onDidChangeExtensionGalleryManifestStatus = this._register(new Emitter<ExtensionGalleryManifestStatus>());
	override readonly onDidChangeExtensionGalleryManifestStatus = this._onDidChangeExtensionGalleryManifestStatus.event;

	// Monotonic counter used to discard results from superseded validations. Each call to a
	// `validate` closure captures the current epoch (via ++this.validationEpoch); any async
	// continuation that later finds the epoch has advanced MUST NOT mutate status/cache/
	// manifest, because a newer validation (e.g. triggered by sign-out, an account switch, or
	// a config change) has taken over. This closes a time-of-check/time-of-use window where a
	// stale in-flight eligibility check could restore access for an account that is no longer
	// current.
	private validationEpoch = 0;

	// The resource-scoped bearer token negotiated (RFC 9728) when the marketplace service index
	// is `[Authorize]`-gated. It is set only when access was actually negotiated via a
	// `WWW-Authenticate` challenge AND the user is eligible/Available, and is exposed via
	// `getAccessToken()` so the gallery service can authenticate protected marketplace requests
	// (extensionquery, asset download). It is cleared whenever access is revoked — every
	// non-Available transition routes through `update(null, …)`, which resets it — so a stale
	// token can never survive a sign-out, account switch, or config change.
	private negotiatedAccessToken: string | undefined;

	constructor(
		@IProductService productService: IProductService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(productService);
		this.commonHeadersPromise = resolveMarketplaceHeaders(
			productService.version,
			productService,
			environmentService,
			configurationService,
			fileService,
			storageService,
			telemetryService);

		// Set the auth provider context key for UX. The Entra (microsoft) path is gated
		// behind a product flag; when it is off, coerce to the GitHub/default provider so
		// the UI never advertises Microsoft sign-in.
		CONTEXT_MARKETPLACE_AUTH_PROVIDER.bindTo(contextKeyService).set(this.getEffectiveAuthProvider());

		const channels = [sharedProcessService.getChannel('extensionGalleryManifest')];
		const remoteConnection = remoteAgentService.getConnection();
		if (remoteConnection) {
			channels.push(remoteConnection.getChannel('extensionGalleryManifest'));
		}
		const updateChannels = (manifest: IExtensionGalleryManifest | null) => {
			this.logService.trace(`[Marketplace] Updating channels with manifest ${manifest ? 'available' : 'unavailable'}`);
			// Push the negotiated resource token alongside the manifest so the shared process and
			// remote server (which never negotiate it themselves) can authenticate the protected
			// marketplace requests they initiate — extension getManifest and VSIX download. The
			// token is coherent with the manifest here: it is set before the eligible→Available
			// transition and cleared on every non-Available transition, so a null manifest always
			// carries an undefined token.
			channels.forEach(channel => channel.call('setExtensionGalleryManifest', [manifest, this.negotiatedAccessToken]));
		};
		// Defer the initial manifest bootstrap to a microtask so this service is fully
		// constructed and cached in the DI container before it runs. The Entra (microsoft)
		// access path resolves IAuthenticationService, whose dependency graph transitively
		// re-enters this service; kicking the bootstrap off synchronously from the
		// constructor would resolve IAuthenticationService mid-construction and throw
		// "RECURSIVELY instantiating service 'IAuthenticationService'", corrupting the
		// container and breaking workbench startup.
		Promise.resolve().then(() => this.getExtensionGalleryManifest()).then(manifest => {
			if (this._store.isDisposed) {
				this.logService.trace('[Marketplace] Store is already disposed, skipping channel initialization');
				return;
			}
			updateChannels(manifest);
			this._register(this.onDidChangeExtensionGalleryManifest(manifest => updateChannels(manifest)));
		}).catch(error => {
			// The deferred bootstrap must never surface as an unhandled rejection — any
			// failure here already results in an appropriate manifest status, so just log.
			this.logService.error('[Marketplace] Error during initial gallery manifest bootstrap', error);
		});
	}

	// Lazily resolved to break a service dependency cycle: eager construction of this
	// service must not pull in IAuthenticationService (-> IExtensionService -> gallery),
	// so it is resolved on first asynchronous use instead of via constructor injection.
	private _authenticationService: IAuthenticationService | undefined;
	private get authenticationService(): IAuthenticationService {
		return this._authenticationService ??= this.instantiationService.invokeFunction(accessor => accessor.get(IAuthenticationService));
	}

	private extensionGalleryManifestPromise: Promise<void> | undefined;
	override async getExtensionGalleryManifest(): Promise<IExtensionGalleryManifest | null> {
		if (!this.extensionGalleryManifestPromise) {
			this.extensionGalleryManifestPromise = this.doGetExtensionGalleryManifest();
		}
		await this.extensionGalleryManifestPromise;
		return this.extensionGalleryManifest;
	}

	/**
	 * Returns the resource-scoped bearer token negotiated for a `[Authorize]`-gated marketplace,
	 * or `undefined` for an open marketplace. Ensures the manifest resolution has completed first
	 * so the token reflects the current access state.
	 */
	override async getAccessToken(): Promise<string | undefined> {
		await this.getExtensionGalleryManifest();
		return this.negotiatedAccessToken;
	}

	private async doGetExtensionGalleryManifest(): Promise<void> {
		const defaultServiceUrl = this.productService.extensionsGallery?.serviceUrl;
		if (!defaultServiceUrl) {
			return;
		}

		// Register the configuration listener BEFORE running the initial validation so a
		// serviceUrl/provider change that lands during a slow startup validation is observed
		// (it bumps the epoch to supersede the in-flight result and clears the cache) rather
		// than being missed while we await initialization.
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ExtensionGalleryServiceUrlConfigKey)
				|| e.affectsConfiguration(ExtensionGalleryAuthProviderConfigKey)) {
				// Supersede any in-flight background validation for the previous
				// marketplace/provider so its late-arriving result cannot re-populate the
				// cache we are about to clear (the restart prompt is dismissable, so the
				// process may keep running).
				this.validationEpoch++;
				this.clearCachedAccess();
				this.requestRestart();
			}
		}));

		const configuredServiceUrl = this.configurationService.getValue<string>(ExtensionGalleryServiceUrlConfigKey);
		if (configuredServiceUrl) {
			this.logService.trace('[Marketplace] Private marketplace configured, checking access and fetching manifest', configuredServiceUrl);
			await this.initializePrivateMarketplace(configuredServiceUrl);
		} else {
			const defaultExtensionGalleryManifest = await super.getExtensionGalleryManifest();
			this.update(defaultExtensionGalleryManifest);
		}
	}

	private async initializePrivateMarketplace(configuredServiceUrl: string): Promise<void> {
		// 1. Resolve the auth strategy FIRST so provider/session change listeners are active
		//    before we apply any cached verdict. This lets a mid-application account/session
		//    switch supersede the cache via the validationEpoch guard in applyCachedAccess,
		//    rather than racing an unguarded cache application. resolveAccessStrategy only
		//    registers listeners and returns the validate function — it performs no auth calls
		//    itself, so this reordering does not change when the network is first touched.
		const validateAccess = await this.resolveAccessStrategy(configuredServiceUrl);

		// 2. Apply cache immediately (epoch-guarded) before awaiting foreground validation.
		const cached = this.getCachedAccess(configuredServiceUrl);
		if (cached) {
			this.logService.debug('[Marketplace] Applying cached access result on startup');
			await this.applyCachedAccess(cached, configuredServiceUrl, ++this.validationEpoch);
		}

		// 3. Validate (foreground if no cache, background if cache was applied)
		if (cached) {
			validateAccess();
		} else {
			await validateAccess();
		}
	}

	/**
	 * Resolves the effective marketplace auth provider, applying the Entra (microsoft)
	 * product gate. When `product.enableExtensionGalleryEntraAuth` is falsy, a configured
	 * `microsoft` provider is downgraded to the GitHub/default provider so the Entra path
	 * stays dormant until the Private Marketplace is publicly released.
	 */
	private getEffectiveAuthProvider(): string {
		const configuredAuthProvider = this.configurationService.getValue<string>(ExtensionGalleryAuthProviderConfigKey);
		if (configuredAuthProvider === 'microsoft' && !this.productService.enableExtensionGalleryEntraAuth) {
			return 'github';
		}
		return configuredAuthProvider || 'github';
	}

	/**
	 * Resolves the effective auth provider, registers event subscriptions for
	 * re-validation, and returns a function that validates current access.
	 *
	 * When the effective provider is 'microsoft', eligibility discovery and
	 * validation happen inside {@link handleMicrosoftAccess}. There is deliberately
	 * NO fallback to GitHub: once an administrator has explicitly configured
	 * 'microsoft', a server that does not advertise an EligibilityService is treated
	 * as misconfigured rather than silently downgraded.
	 */
	private async resolveAccessStrategy(configuredServiceUrl: string): Promise<() => Promise<void>> {
		const configuredAuthProvider = this.getEffectiveAuthProvider();

		if (configuredAuthProvider === 'microsoft') {
			const validate = () => this.handleMicrosoftAccess(configuredServiceUrl, ++this.validationEpoch);
			this._register(this.authenticationService.onDidChangeSessions(e => {
				if (e.providerId === 'microsoft') {
					this.clearCachedAccess();
					// Revoke the manifest that was authorized for the previous session before
					// revalidating. Without this, the active status stays `Available`, and if the
					// new session's validation hits a transient index/eligibility failure the catch
					// paths preserve `Available` — leaking the prior account's authorization to the
					// new (possibly ineligible) account.
					this.update(null);
					validate();
				}
			}));
			return validate;
		}

		// Default: GitHub
		const validate = () => this.handleGitHubAccess(configuredServiceUrl, ++this.validationEpoch);
		this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => {
			this.clearCachedAccess();
			// Revoke the previously authorized manifest before revalidating (see the Microsoft
			// path above) so a transient failure resolving the new account cannot preserve the
			// old account's `Available` status.
			this.update(null);
			validate();
		}));
		return validate;
	}

	// --- GitHub access (existing DefaultAccountService-based check) ---

	private async handleGitHubAccess(configuredServiceUrl: string, epoch: number): Promise<void> {
		try {
			const account = await this.defaultAccountService.getDefaultAccount();
			if (this.validationEpoch !== epoch) {
				// A newer validation superseded this one while we awaited — discard.
				return;
			}
			if (!account) {
				// Auth service responded: no account → invalidate cache
				this.clearCachedAccess();
				this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
			} else if (!this.checkAccess(account)) {
				// Auth service responded: account exists but ineligible → cache the result
				this.cacheAccess({ authProvider: 'github', accountId: account.accountName, eligible: false, serviceUrl: configuredServiceUrl });
				this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
			} else if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
				try {
					const manifest = await this.getExtensionGalleryManifestFromServiceUrl(configuredServiceUrl);
					if (this.validationEpoch !== epoch) {
						return;
					}
					this.cacheAccess({ authProvider: 'github', accountId: account.accountName, eligible: true, serviceUrl: configuredServiceUrl });
					this.update(manifest);
					this.telemetryService.publicLog2<
						{},
						{
							owner: 'sandy081';
							comment: 'Reports when a user successfully accesses a custom marketplace';
						}>('galleryservice:custom:marketplace');
				} catch (error) {
					if (this.validationEpoch !== epoch) {
						return;
					}
					// Eligible, but the marketplace manifest could not be fetched — the
					// marketplace is currently unreachable. Preserve cache; surface a message.
					this.logService.error('[Marketplace] Failed to fetch gallery manifest (GitHub path)', error);
					this.update(null, ExtensionGalleryManifestStatus.Unreachable);
				}
			}
		} catch (error) {
			if (this.validationEpoch !== epoch) {
				return;
			}
			this.logService.error('[Marketplace] Error in GitHub access check', error);
			// Network/transient error resolving the account — never invalidate cache. Unless we
			// already have a working manifest to keep showing, surface an "unreachable" message so
			// a configured marketplace isn't left on a blank (Unavailable) view with no explanation.
			if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
				this.update(null, ExtensionGalleryManifestStatus.Unreachable);
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

	// --- Microsoft access (new Entra ID / VSS eligibility check) ---

	private async handleMicrosoftAccess(configuredServiceUrl: string, epoch: number): Promise<void> {
		// Acquire an existing Microsoft session first. `getSessions` reads existing sessions
		// silently and never prompts for sign-in.
		let sessions: readonly AuthenticationSession[];
		try {
			sessions = await this.authenticationService.getSessions(
				'microsoft',
				WorkbenchExtensionGalleryManifestService.MICROSOFT_AUTH_SCOPES);
		} catch (error) {
			if (this.validationEpoch !== epoch) {
				return;
			}
			// Auth service unavailable — transient error, never invalidate cache. Unless we
			// already have a working manifest to keep showing, surface an "unreachable" message so
			// a configured marketplace isn't left on a blank (Unavailable) view with no explanation.
			this.logService.error('[Marketplace] Error getting Microsoft sessions', error);
			if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
				this.update(null, ExtensionGalleryManifestStatus.Unreachable);
			}
			return;
		}
		if (this.validationEpoch !== epoch) {
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
			this.clearCachedAccess();
			this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
			return;
		}

		// We have a token — fetch the service index (presenting the token so a gated index is
		// readable), then discover the eligibility endpoint from it. The manifest is carried
		// forward to `applyEligibilityResult` so it is fetched exactly once: this keeps the
		// 401/403 vs transient classification below the single source of truth for the index
		// fetch outcome.
		if (!WorkbenchExtensionGalleryManifestService.isSafeTokenTarget(configuredServiceUrl, configuredServiceUrl)) {
			// We will not attach a bearer token to a non-HTTPS service index. Without a token
			// a gated index is unreadable, so this deployment is misconfigured for Entra auth.
			this.logService.error('[Marketplace] Refusing to send the Microsoft token to a non-HTTPS service index URL — the marketplace is misconfigured for Entra auth.');
			this.clearCachedAccess();
			this.update(null, ExtensionGalleryManifestStatus.Misconfigured);
			return;
		}
		let manifest: IExtensionGalleryManifest;
		// The token that successfully reads the service index. Starts as the initially-acquired
		// (OpenID) session token; if the index is auth-gated and returns an RFC 9728 challenge,
		// `fetchServiceIndexNegotiated` upgrades this to a resource-scoped token, which is then
		// reused for the protected eligibility POST below.
		let indexToken: string = session.accessToken;
		// Whether the index was actually behind an RFC 9728 challenge (i.e. `indexToken` is a
		// resource-scoped token that protected marketplace API requests must present), as opposed
		// to an open index read with the plain sign-in token.
		let indexWasNegotiated = false;
		try {
			const negotiated = await this.fetchServiceIndexNegotiated(
				configuredServiceUrl,
				'microsoft',
				session.accessToken,
				WorkbenchExtensionGalleryManifestService.MICROSOFT_AUTH_SCOPES,
			);
			manifest = negotiated.manifest;
			// `negotiated.token` is only undefined when the initial token was undefined; on the
			// Microsoft path we always start with the signed-in session token, so fall back to it.
			indexToken = negotiated.token ?? session.accessToken;
			indexWasNegotiated = negotiated.negotiated;
		} catch (error) {
			if (this.validationEpoch !== epoch) {
				return;
			}
			if (error instanceof MarketplaceAuthRequiredError) {
				if (error.statusCode === 403) {
					// 403: the token is accepted but this identity is forbidden from reading
					// the service index — a durable denial. Cache it so we don't re-probe.
					this.cacheAccess({ authProvider: 'microsoft', accountId: session.account.id, eligible: false, serviceUrl: configuredServiceUrl });
					this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
				} else {
					// 401: the token was missing/expired/invalid (e.g. wrong audience). This
					// is NOT a durable "ineligible" verdict — re-authentication may fix it —
					// so do not cache a negative result; ask the user to (re-)sign in. A fresh
					// sign-in fires onDidChangeSessions and re-runs this check with a new token.
					this.clearCachedAccess();
					this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
				}
				return;
			}
			// Transient error fetching the manifest — the marketplace is currently
			// unreachable. Preserve cache and, unless we already have a working manifest
			// to keep showing, surface an "unreachable" message.
			this.logService.error('[Marketplace] Error fetching the service index', error);
			if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
				this.update(null, ExtensionGalleryManifestStatus.Unreachable);
			}
			return;
		}

		if (this.validationEpoch !== epoch) {
			return;
		}

		const eligibilityUrl = getExtensionGalleryManifestResourceUri(manifest, ExtensionGalleryResourceType.EligibilityService);
		if (!eligibilityUrl) {
			// Definitive: the manifest was fetched but advertises no EligibilityService.
			this.logService.error('[Marketplace] authProvider is "microsoft" but the gallery manifest does not advertise an EligibilityService resource — the marketplace is misconfigured for Entra auth.');
			this.clearCachedAccess();
			this.update(null, ExtensionGalleryManifestStatus.Misconfigured);
			return;
		}

		if (!WorkbenchExtensionGalleryManifestService.isSafeTokenTarget(eligibilityUrl, configuredServiceUrl)) {
			// The manifest-advertised eligibility endpoint is not same-origin HTTPS with the
			// admin-configured service index. Sending the Microsoft token there would risk
			// leaking it to a foreign or cleartext origin (e.g. a compromised/misconfigured
			// manifest), so refuse and treat the deployment as misconfigured.
			this.logService.error('[Marketplace] The EligibilityService URL is not same-origin HTTPS with the configured service index — refusing to transmit the Microsoft token. The marketplace is misconfigured for Entra auth.');
			this.clearCachedAccess();
			this.update(null, ExtensionGalleryManifestStatus.Misconfigured);
			return;
		}

		// Check eligibility via server
		try {
			const result = await this.checkMicrosoftEligibility(eligibilityUrl, indexToken);
			if (this.validationEpoch !== epoch) {
				return;
			}
			// Server responded with 200 — this is a definitive result, cache it. Note we do NOT
			// persist the server-provided `reason` string: it is not used for any UI/gating
			// decision and could carry account/tenant diagnostic text, so keeping it out of
			// application storage avoids persisting unnecessary PII at rest.
			this.cacheAccess({
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
			// The index was gated and we negotiated a resource-scoped token for it: expose that
			// token (via getAccessToken) for protected marketplace API requests when the user is
			// eligible. On the open-index path (indexWasNegotiated === false) the marketplace
			// needs no bearer, so leave the token cleared. Any later non-Available transition
			// routes through update(null, …) and clears it.
			if (indexWasNegotiated && result.eligible) {
				this.negotiatedAccessToken = indexToken;
			}
			this.applyEligibilityResult(result, manifest);
		} catch (error) {
			if (this.validationEpoch !== epoch) {
				// A newer validation superseded this one while we awaited — discard.
				return;
			}
			if (error instanceof MarketplaceAuthRequiredError) {
				if (error.statusCode === 403) {
					// 403: the token is accepted but this identity is forbidden by the
					// eligibility service — a durable denial. Cache it so we don't re-probe.
					this.cacheAccess({ authProvider: 'microsoft', accountId: session.account.id, eligible: false, serviceUrl: configuredServiceUrl });
					this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
				} else {
					// 401: the token was missing/expired/invalid (e.g. wrong audience) at the
					// eligibility endpoint. This is NOT a durable "ineligible" verdict —
					// re-authentication may fix it — so do not cache a negative result; ask
					// the user to (re-)sign in. A fresh sign-in re-runs this check.
					this.clearCachedAccess();
					this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
				}
				return;
			}
			this.logService.error('[Marketplace] Error checking Microsoft eligibility', error);
			// Network/5xx/malformed response at the eligibility endpoint — never invalidate the
			// cache. We could not obtain a definitive verdict, so unless we already have a working
			// manifest to keep showing, surface an "unreachable" message rather than leaving the
			// user on a blank (Unavailable) marketplace with no explanation.
			if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
				this.update(null, ExtensionGalleryManifestStatus.Unreachable);
			}
		}
	}

	/**
	 * Fetches the service index, negotiating a resource-scoped bearer token if the marketplace's
	 * index is protected (RFC 9728). It first presents `initialToken`; if the marketplace responds
	 * `401`, the marketplace's Protected Resource Metadata is discovered via its well-known endpoint
	 * (RFC 9728) and a token bound to the advertised authorization server + resource scopes is
	 * acquired silently (RFC 8707), then the index fetch is retried once with that token.
	 *
	 * Discovery deliberately does NOT depend on the `WWW-Authenticate` challenge header: that header
	 * is not CORS-safelisted, so the renderer's cross-origin index fetch usually cannot read it. The
	 * challenge is passed only as a best-effort hint for the explicit metadata URL.
	 *
	 * Returns the manifest together with the token that successfully read the index, so callers can
	 * reuse it for subsequent protected requests (e.g. the Microsoft eligibility POST). Any auth
	 * failure that negotiation cannot resolve (no metadata, no session obtainable, or a `401`/`403`
	 * on the retry) propagates as a {@link MarketplaceAuthRequiredError} for the caller to classify.
	 */
	private async fetchServiceIndexNegotiated(
		configuredServiceUrl: string,
		providerId: string,
		initialToken: string | undefined,
		fallbackScopes: readonly string[],
	): Promise<{ manifest: IExtensionGalleryManifest; token: string | undefined; negotiated: boolean }> {
		try {
			const manifest = await this.getExtensionGalleryManifestFromServiceUrl(configuredServiceUrl, initialToken);
			return { manifest, token: initialToken, negotiated: false };
		} catch (error) {
			// Only a 401 (index is auth-gated) is negotiable. A 403 (identity refused) or any other
			// error is not — let it propagate so the caller applies its existing classification.
			if (!(error instanceof MarketplaceAuthRequiredError) || error.statusCode !== 401) {
				throw error;
			}
			const protectedResource = await discoverMarketplaceProtectedResource(
				this.requestService,
				configuredServiceUrl,
				error.wwwAuthenticate,
				CancellationToken.None,
			);
			if (!protectedResource) {
				// The index is gated but exposes no Protected Resource Metadata we can act on —
				// re-throw the original 401 so the caller prompts for sign-in.
				throw error;
			}
			const session = await this.acquireResourceToken(providerId, protectedResource, fallbackScopes);
			if (!session) {
				// No resource-scoped session could be obtained silently (e.g. consent not yet
				// granted) — re-throw the original 401 so the caller prompts for sign-in rather
				// than mislabeling it.
				throw error;
			}
			const manifest = await this.getExtensionGalleryManifestFromServiceUrl(configuredServiceUrl, session.accessToken);
			return { manifest, token: session.accessToken, negotiated: true };
		}
	}

	/**
	 * Silently acquires a resource-scoped bearer token bound to the marketplace's advertised
	 * authorization server (RFC 8707). `getSessions` never prompts, so this returns `undefined`
	 * when no consented session exists yet, leaving interactive acquisition to the sign-in action.
	 * The advertised authorization server is validated against the provider's configured globs by
	 * the authentication service; a mismatch throws, which we treat as "no session".
	 */
	private async acquireResourceToken(
		providerId: string,
		protectedResource: { authorizationServer: string; scopes: readonly string[] },
		fallbackScopes: readonly string[],
	): Promise<AuthenticationSession | undefined> {
		const scopes = protectedResource.scopes.length ? protectedResource.scopes : fallbackScopes;
		try {
			const sessions = await this.authenticationService.getSessions(
				providerId,
				[...scopes],
				{ authorizationServer: URI.parse(protectedResource.authorizationServer) },
			);
			return sessions[0];
		} catch (error) {
			this.logService.error('[Marketplace] Error acquiring resource-scoped marketplace token', error);
			return undefined;
		}
	}

	/**
	 * Applies a definitive (200) eligibility verdict using the already-fetched service index
	 * manifest. No further network request is made here — the manifest was validated during
	 * discovery, so an eligible user is taken straight to `Available`.
	 */
	private applyEligibilityResult(result: { eligible: boolean; reason?: string }, manifest: IExtensionGalleryManifest): void {
		if (result.eligible) {
			if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
				this.update(manifest);
			}
		} else {
			this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
		}
	}

	private async checkMicrosoftEligibility(
		url: string, token: string
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
		}, CancellationToken.None);

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

	/**
	 * Guards bearer-token transport. A Microsoft token must only ever be attached to a request
	 * whose target is (a) HTTPS and (b) same-origin as the admin-configured service index URL.
	 * This prevents a compromised or misconfigured gallery manifest from redirecting a resource
	 * URL (e.g. the EligibilityService) at a foreign or cleartext endpoint and exfiltrating the
	 * token. Returns false on any parse failure so callers fail closed.
	 */
	private static isSafeTokenTarget(targetUrl: string, baseUrl: string): boolean {
		let target: URI;
		let base: URI;
		try {
			target = URI.parse(targetUrl, true);
			base = URI.parse(baseUrl, true);
		} catch {
			return false;
		}
		if (target.scheme !== 'https') {
			return false;
		}
		// Same-origin: scheme + authority (host:port) must match exactly.
		return target.scheme === base.scheme && target.authority.toLowerCase() === base.authority.toLowerCase();
	}

	// --- Access caching (provider-agnostic) ---

	private getCachedAccess(configuredServiceUrl: string): ICachedAccess | null {
		const raw = this.storageService.get(
			WorkbenchExtensionGalleryManifestService.CACHED_ACCESS_KEY,
			StorageScope.APPLICATION);
		if (!raw) { return null; }
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			// Corrupt cache entry — drop it so a bad value can't wedge startup.
			this.clearCachedAccess();
			return null;
		}
		if (!this.isValidCachedAccess(parsed)) {
			// Unexpected shape (e.g. written by an incompatible/older build that predates a
			// cache-schema field) — don't trust it.
			this.clearCachedAccess();
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
			this.clearCachedAccess();
			return null;
		}
		// The verdict is also scoped to the marketplace it was computed against. If the admin
		// has pointed the client at a different `extensions.gallery.serviceUrl` since the cache
		// was written, the eligibility verdict for the previous marketplace does not apply —
		// drop it so a stale verdict can't briefly grant access to a different marketplace.
		if (parsed.serviceUrl !== configuredServiceUrl) {
			this.clearCachedAccess();
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

	/**
	 * Resolves the account currently signed in for the given provider, WITHOUT prompting.
	 * Returns `'account'` (with the account id, plus the session token for microsoft) when an
	 * account is present, `'none'` when the provider responded but there is no account (durable),
	 * and `'error'` when the lookup failed (transient — callers must not invalidate the cache).
	 */
	private async resolveCurrentAccount(authProvider: string): Promise<{ kind: 'account'; accountId: string; token?: string } | { kind: 'none' } | { kind: 'error' }> {
		if (authProvider === 'microsoft') {
			try {
				const sessions = await this.authenticationService.getSessions(
					'microsoft',
					WorkbenchExtensionGalleryManifestService.MICROSOFT_AUTH_SCOPES);
				const session = sessions[0];
				return session
					? { kind: 'account', accountId: session.account.id, token: session.accessToken }
					: { kind: 'none' };
			} catch {
				return { kind: 'error' };
			}
		}
		try {
			const account = await this.defaultAccountService.getDefaultAccount();
			return account ? { kind: 'account', accountId: account.accountName } : { kind: 'none' };
		} catch {
			return { kind: 'error' };
		}
	}

	private async applyCachedAccess(cached: ICachedAccess, configuredServiceUrl: string, epoch: number): Promise<void> {
		// A cached verdict is an authorization input, so only trust it for the account it was
		// written for. Resolve the current account (silently) and require it to match before
		// applying an eligible cache — otherwise a stale cross-account entry could briefly grant
		// access at cold start before background validation corrects it.
		const current = await this.resolveCurrentAccount(cached.authProvider);
		if (this.validationEpoch !== epoch) {
			// A newer validation (e.g. an account/session change that fired while we resolved the
			// account) superseded this cache application — let it own the outcome and don't touch
			// status or cache here.
			return;
		}
		if (current.kind === 'error') {
			// Could not determine the current account (transient auth failure). Don't grant access
			// from an unverifiable cache, but don't invalidate it either — background validation
			// will retry. Surface "unreachable" so the marketplace isn't left blank.
			if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
				this.update(null, ExtensionGalleryManifestStatus.Unreachable);
			}
			return;
		}
		if (current.kind === 'none' || current.accountId !== cached.accountId) {
			// No account, or a different account than the cache was written for — drop it and let
			// foreground/background validation re-establish access for the current identity.
			this.clearCachedAccess();
			return;
		}

		if (!cached.eligible) {
			this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
			return;
		}

		// Eligible for the current account — fetch the manifest to render Available. On the
		// Microsoft path present the session token so a gated index is readable, applying the
		// same-origin token-transport guard first.
		let accessToken: string | undefined;
		if (cached.authProvider === 'microsoft') {
			if (!WorkbenchExtensionGalleryManifestService.isSafeTokenTarget(configuredServiceUrl, configuredServiceUrl)) {
				this.update(null, ExtensionGalleryManifestStatus.Misconfigured);
				return;
			}
			accessToken = current.token;
		}
		try {
			const manifest = await this.getExtensionGalleryManifestFromServiceUrl(configuredServiceUrl, accessToken);
			if (this.validationEpoch !== epoch) {
				// A newer validation superseded this cache application while we fetched the
				// manifest — do not apply a manifest for a possibly-stale account.
				return;
			}
			this.update(manifest);
		} catch (error) {
			if (this.validationEpoch !== epoch) {
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
			if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
				this.update(null, ExtensionGalleryManifestStatus.Unreachable);
			}
		}
	}

	private cacheAccess(data: ICachedAccess): void {
		this.storageService.store(
			WorkbenchExtensionGalleryManifestService.CACHED_ACCESS_KEY,
			JSON.stringify(data),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE);
		this.logService.debug('[Marketplace] Cached access result:', data.authProvider, data.eligible);
	}

	private clearCachedAccess(): void {
		this.storageService.remove(
			WorkbenchExtensionGalleryManifestService.CACHED_ACCESS_KEY,
			StorageScope.APPLICATION);
		this.logService.debug('[Marketplace] Cleared cached access');
	}

	// --- Status management ---

	private update(manifest: IExtensionGalleryManifest | null, status?: ExtensionGalleryManifestStatus): void {
		this.logService.debug(`[Marketplace] Updating manifest ${manifest ? 'available' : 'unavailable'}`);
		if (!manifest) {
			// Any transition to a non-Available state (sign-out, account switch, config change,
			// access denied, unreachable, …) routes through here with a null manifest. Drop the
			// negotiated resource token so it can never outlive the access that produced it; the
			// eligible→Available path re-sets it after a successful negotiation.
			this.negotiatedAccessToken = undefined;
		}
		if (this.extensionGalleryManifest !== manifest) {
			this.extensionGalleryManifest = manifest;
			this._onDidChangeExtensionGalleryManifest.fire(manifest);
		}
		this.updateStatus(status ?? (this.extensionGalleryManifest ? ExtensionGalleryManifestStatus.Available : ExtensionGalleryManifestStatus.Unavailable));
	}

	private updateStatus(status: ExtensionGalleryManifestStatus): void {
		if (this.currentStatus !== status) {
			this.currentStatus = status;
			this._onDidChangeExtensionGalleryManifestStatus.fire(status);
		}
	}

	private async requestRestart(): Promise<void> {
		const confirmation = await this.dialogService.confirm({
			message: localize('extensionGalleryManifestService.accountChange', "{0} is now configured to a different Marketplace. Please restart to apply the changes.", this.productService.nameLong),
			primaryButton: localize({ key: 'restart', comment: ['&& denotes a mnemonic'] }, "&&Restart")
		});
		if (confirmation.confirmed) {
			return this.hostService.restart();
		}
	}

	private async getExtensionGalleryManifestFromServiceUrl(url: string, accessToken?: string): Promise<IExtensionGalleryManifest> {
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
			}, CancellationToken.None);

			if (context.res.statusCode === 401 || context.res.statusCode === 403) {
				// The service index is auth-gated and this request was not authorized.
				// Surface a typed error so the Entra path can prompt for sign-in (or treat a
				// rejected token as denied) rather than mislabeling it as unreachable. Capture
				// the `WWW-Authenticate` challenge (present on a 401) so RFC 9728 negotiation
				// can discover the Protected Resource Metadata and resource-scoped token.
				throw new MarketplaceAuthRequiredError(
					context.res.statusCode,
					getResponseHeader(context.res.headers, 'WWW-Authenticate'),
				);
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
			this.logService.error('[Marketplace] Error retrieving extension gallery manifest', error);
			throw error;
		}
	}
}

registerSingleton(IExtensionGalleryManifestService, WorkbenchExtensionGalleryManifestService, InstantiationType.Eager);
