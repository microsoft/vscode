/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { getClaimsFromJWT } from '../../../../base/common/oauth.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { ExtensionGalleryAuthProviderConfigKey, ExtensionGalleryMicrosoftSignInCommandId, IExtensionGalleryManifest, PRIVATE_MARKETPLACE_SCOPES } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSession, AuthenticationSessionAccount, IAuthenticationService } from '../../authentication/common/authentication.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ExtensionGalleryAccessProviderId, getEffectiveAuthProvider, ICachedAccess, isSafeTokenTarget, MarketplaceAuthRequiredError, MarketplaceClientRejectedError, MarketplaceMisconfiguredError } from './extensionGalleryAccess.js';
import { ExtensionGalleryServiceIndexFetcher } from './extensionGalleryServiceIndex.js';

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
 * Well-known Microsoft Account (MSA) tenant ids. Mirrors the account classification in
 * `extensions/microsoft-authentication/src/node/authProvider.ts`: a token whose `tid` claim is one
 * of these belongs to a personal Microsoft Account, not a work/school (Entra ID) tenant. Duplicated
 * here because that constant lives in the extension host and is not importable from the workbench.
 */
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

/** The outcome of resolving Private Marketplace access, ready to be mapped to a manifest status. */
export const enum ExtensionGalleryAccessKind {
	/** No usable account — the user must sign in. */
	SignInRequired,
	/** Signed in, but the account is not entitled to this marketplace. */
	Denied,
	/** Access granted; `manifest` carries the validated service index. */
	Available,
	/** The marketplace is configured in a way that cannot work (durable). */
	Misconfigured,
	/** Access could not be resolved right now (transient). */
	Unreachable
}

export type IExtensionGalleryAccessVerdict =
	| { readonly kind: ExtensionGalleryAccessKind.SignInRequired }
	| { readonly kind: ExtensionGalleryAccessKind.Denied }
	| { readonly kind: ExtensionGalleryAccessKind.Available; readonly manifest: IExtensionGalleryManifest }
	| { readonly kind: ExtensionGalleryAccessKind.Misconfigured }
	| { readonly kind: ExtensionGalleryAccessKind.Unreachable };

export const IExtensionGalleryAccountService = createDecorator<IExtensionGalleryAccountService>('extensionGalleryAccountService');

/**
 * Resolves "which account may access the Private Marketplace" and owns the durable access verdict
 * plus the in-process service-index cache. Registered as an {@link InstantiationType.Delayed}
 * singleton so the host manifest service can inject it. It does NOT inject {@link IAuthenticationService}
 * itself — that would form a service DI cycle (this service → auth → extensionService → gallery →
 * manifest → this service) which the instantiation graph walker detects and aborts startup on.
 * Instead the Microsoft session dependency is supplied post-startup via
 * {@link IExtensionGalleryAccountService.connectAuthentication}, wired by
 * {@link ExtensionGalleryAccountAuthenticationContribution}.
 */
export interface IExtensionGalleryAccountService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires whenever the resolved access verdict changes — because the underlying account changed,
	 * or because a background re-validation superseded the verdict returned by {@link resolveAccess}.
	 */
	readonly onDidChangeAccess: Event<IExtensionGalleryAccessVerdict>;

	/**
	 * Resolves whether the current account may use the Private Marketplace at `configuredServiceUrl`.
	 *
	 * Applies any durable cached verdict first so startup can render without a network round-trip,
	 * then re-validates. When the cache produced the returned verdict the re-validation runs in the
	 * background and any change is published via {@link onDidChangeAccess}; otherwise the returned
	 * promise already reflects live validation.
	 *
	 * Supersession, cancellation and cache lifetime are owned entirely by this service: callers never
	 * need to pass a {@link CancellationToken} or invalidate caches themselves.
	 */
	resolveAccess(configuredServiceUrl: string): Promise<IExtensionGalleryAccessVerdict>;

	/**
	 * Remembers `accountId` as the account the user settled on for the Private Marketplace, so
	 * session selection is grounded to it across restarts when the Microsoft provider has several
	 * signed-in accounts. Scoped to the effective auth provider; call after an explicit account
	 * choice during sign-in.
	 */
	setPreferredAccount(accountId: string): void;

	/**
	 * Cancels any in-flight validation and drops every cached verdict and memoized service index.
	 * Called when the marketplace configuration changes, so a late result from the previous
	 * configuration can never repopulate the cache or publish a stale verdict.
	 */
	reset(): void;

	/**
	 * Supplies the {@link IAuthenticationService} the Microsoft path needs to resolve sessions. This
	 * is an initialization API rather than a constructor dependency to avoid a service DI cycle
	 * (see the class doc): the authentication graph transitively depends on the extension gallery /
	 * manifest chain that depends back on this service. Called once, post-startup, by
	 * {@link ExtensionGalleryAccountAuthenticationContribution} (orchestrator wiring). Idempotent;
	 * before it runs the Microsoft path reports "no account", and connecting re-signals
	 * {@link onDidChangeAccount} so any verdict resolved in that window is re-validated.
	 */
	connectAuthentication(authenticationService: IAuthenticationService): void;
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
	private readonly serviceIndexFetcher: ExtensionGalleryServiceIndexFetcher;

	// Not an `@IAuthenticationService` constructor dependency: declaring it would introduce a service
	// DI cycle — this service → IAuthenticationService → extensionService → extensionGalleryService →
	// IExtensionGalleryManifestService → this service — which the instantiation graph walker detects
	// (a static walk over the `@IService` decorators, unaffected by `Delayed`) and aborts startup on.
	// Supplied post-startup via connectAuthentication (see the class doc); `undefined` until then, in
	// which case the Microsoft path reports "no account".
	private authenticationService: IAuthenticationService | undefined;

	private readonly _onDidChangeAccount = this._register(new Emitter<void>());
	/** Internal signal that the underlying account may have changed; drives re-validation. */
	private readonly onDidChangeAccount: Event<void> = this._onDidChangeAccount.event;

	private readonly _onDidChangeAccess = this._register(new Emitter<IExtensionGalleryAccessVerdict>());
	readonly onDidChangeAccess: Event<IExtensionGalleryAccessVerdict> = this._onDidChangeAccess.event;

	// Guards a time-of-check/time-of-use race: a stale in-flight validation must not publish a
	// verdict for an account that is no longer current (after sign-out, account switch, or config
	// change). `beginValidation` cancels the previous generation, so a superseded validation observes
	// `token.isCancellationRequested` and skips its cache/verdict mutation.
	private readonly validationTokenSource = this._register(new MutableDisposable<CancellationTokenSource>());

	// The serviceUrl currently being validated, so an account change can re-resolve without the host
	// having to hand it back.
	private activeServiceUrl: string | undefined;

	constructor(
		@IProductService private readonly productService: IProductService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.authProvider = getEffectiveAuthProvider(configurationService.getValue<string>(ExtensionGalleryAuthProviderConfigKey), !!productService.enableExtensionGalleryEntraAuth);
		this.serviceIndexFetcher = instantiationService.createInstance(ExtensionGalleryServiceIndexFetcher);

		// The GitHub/default path resolves through IDefaultAccountService, which does not re-enter this
		// service, so it can be wired here. The Microsoft path's change signal is wired later, once
		// authentication is connected (see connectAuthentication), to keep the cycle broken.
		if (this.authProvider !== 'microsoft') {
			this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this._onDidChangeAccount.fire()));
		}

		// Re-validate whenever the account changes. The previous verdict is revoked first: a transient
		// failure for the new (possibly ineligible) account must not leak the prior account's access.
		this._register(this.onDidChangeAccount(() => this.revalidateOnAccountChange()));
	}

	// --- Access resolution ---

	async resolveAccess(configuredServiceUrl: string): Promise<IExtensionGalleryAccessVerdict> {
		this.activeServiceUrl = configuredServiceUrl;
		const token = this.beginValidation();

		let cachedVerdict: IExtensionGalleryAccessVerdict | undefined;
		try {
			const cached = await this.getCachedAccess(configuredServiceUrl, token);
			if (!token.isCancellationRequested && cached) {
				cachedVerdict = this.toVerdict(cached);
			}
		} catch (error) {
			// A thrown cache read is a transient identity-resolution failure; fall through to a full
			// validation rather than treating it as "no account".
			this.logService.trace('[Marketplace] Cached access could not be validated', error);
		}

		if (cachedVerdict) {
			// Re-validate in the background so a stale cached verdict cannot linger, publishing any
			// change through `onDidChangeAccess`.
			this.validateAndPublish(configuredServiceUrl, token);
			return cachedVerdict;
		}

		return this.validateCurrentAccess(configuredServiceUrl, token);
	}

	reset(): void {
		this.validationTokenSource.value?.cancel();
		this.validationTokenSource.clear();
		this.activeServiceUrl = undefined;
		this.clearCache();
		this.serviceIndexFetcher.invalidate();
	}

	/** Resolves the live verdict for `configuredServiceUrl`, never throwing. */
	private async validateCurrentAccess(configuredServiceUrl: string, token: CancellationToken): Promise<IExtensionGalleryAccessVerdict> {
		try {
			const account = await this.getAccount(configuredServiceUrl, token);
			return this.toVerdict(account);
		} catch (error) {
			if (error instanceof MarketplaceMisconfiguredError) {
				return { kind: ExtensionGalleryAccessKind.Misconfigured };
			}
			this.logService.error('[Marketplace] Error validating marketplace access', error);
			return { kind: ExtensionGalleryAccessKind.Unreachable };
		}
	}

	/** Runs a validation generation and publishes the result unless it has been superseded. */
	private async validateAndPublish(configuredServiceUrl: string, token: CancellationToken): Promise<void> {
		const verdict = await this.validateCurrentAccess(configuredServiceUrl, token);
		if (!token.isCancellationRequested) {
			this._onDidChangeAccess.fire(verdict);
		}
	}

	private revalidateOnAccountChange(): void {
		const configuredServiceUrl = this.activeServiceUrl;
		if (!configuredServiceUrl) {
			return;
		}
		this.clearCache();
		this.validateAndPublish(configuredServiceUrl, this.beginValidation());
	}

	/** Maps a resolved account to a verdict. `undefined` means no usable account. */
	private toVerdict(account: IExtensionGalleryAccount | undefined): IExtensionGalleryAccessVerdict {
		if (!account) {
			this.logService.debug('[Marketplace] Private marketplace configured but user not signed in');
			return { kind: ExtensionGalleryAccessKind.SignInRequired };
		}
		if (!account.eligible) {
			this.logService.debug('[Marketplace] User signed in but lacks access to private marketplace');
			return { kind: ExtensionGalleryAccessKind.Denied };
		}
		if (!account.manifest) {
			// An eligible verdict always carries a materialized index; a missing one is a transient
			// fetch failure, not a blank marketplace.
			return { kind: ExtensionGalleryAccessKind.Unreachable };
		}
		return { kind: ExtensionGalleryAccessKind.Available, manifest: account.manifest };
	}

	/**
	 * Starts a new validation generation: cancels the previous one and drops the memoized index so
	 * the new generation re-fetches it. Callers MUST check `token.isCancellationRequested` before
	 * each cache/verdict mutation so a superseded validation cannot commit a stale result.
	 */
	private beginValidation(): CancellationToken {
		this.serviceIndexFetcher.invalidate();
		// MutableDisposable disposes the previous source on assignment, but dispose() does not cancel;
		// cancel explicitly so any in-flight continuation is superseded first.
		this.validationTokenSource.value?.cancel();
		const source = new CancellationTokenSource();
		this.validationTokenSource.value = source;
		return source.token;
	}

	connectAuthentication(authenticationService: IAuthenticationService): void {
		if (this.authenticationService) {
			return; // idempotent — the orchestrator wires this exactly once, but guard defensively
		}
		this.authenticationService = authenticationService;
		if (this.authProvider !== 'microsoft') {
			return;
		}
		// Re-fire the change signal only for the effective (Microsoft) provider so the host does not
		// re-validate on unrelated account activity.
		this._register(authenticationService.onDidChangeSessions(e => {
			if (e.providerId === 'microsoft') {
				this._onDidChangeAccount.fire();
			}
		}));
		// Authentication connected after startup: re-signal once so a verdict resolved during the
		// pre-connect window (when no Microsoft session was reachable) is re-validated now.
		this._onDidChangeAccount.fire();
	}

	/**
	 * Resolves the current account's access verdict for `configuredServiceUrl`. Returns `undefined`
	 * (sign-in required), `{ eligible: false }` (durable denial), or `{ eligible: true, manifest }`
	 * (granted). Eligibility is decided locally — from the account's entitlements (GitHub) or the
	 * ID-token tenant claim (Microsoft) — and the granted path then fetches the gallery index. Throws
	 * {@link MarketplaceMisconfiguredError} for a misconfigured deployment, and rethrows
	 * transient/network errors so the host can preserve an already-available marketplace instead of
	 * downgrading it.
	 *
	 * Contrast with {@link resolveCurrentAccount}: this is the heavier public verdict (fetches the
	 * index on the granted path), whereas `resolveCurrentAccount` only answers *who* the current
	 * account is (identity + token) for cache validation and never checks eligibility.
	 */
	private getAccount(configuredServiceUrl: string, token: CancellationToken): Promise<IExtensionGalleryAccount | undefined> {
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
		let manifest: IExtensionGalleryManifest;
		try {
			manifest = await this.serviceIndexFetcher.getServiceIndex(configuredServiceUrl, token);
		} catch (error) {
			if (error instanceof MarketplaceClientRejectedError) {
				// The marketplace refused this client outright — durable, so report a denial rather
				// than a transient failure. Not cached: it belongs to the client, not the account.
				return { eligible: false };
			}
			throw error;
		}
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

		// Client-side eligibility: a work/school (Entra) tenant is eligible; a personal Microsoft
		// Account (MSA) is not. Decided locally from the token's tenant claim — mirroring the GitHub
		// path, which also gates locally — and BEFORE any index fetch, so an ineligible account never
		// touches the (possibly auth-gated) index.
		if (!this.isEntraEligible(session)) {
			this.cacheAccess({ authProvider: 'microsoft', accountId: session.account.id, eligible: false, serviceUrl: configuredServiceUrl });
			return { eligible: false };
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
			manifest = await this.serviceIndexFetcher.getServiceIndex(configuredServiceUrl, token, session.accessToken);
		} catch (error) {
			if (error instanceof MarketplaceAuthRequiredError) {
				return this.denyFromAuthError(error, session, configuredServiceUrl, token);
			}
			if (error instanceof MarketplaceClientRejectedError) {
				// The marketplace refused this client outright (not an authorization decision).
				// Durable, so report a denial rather than a transient failure — but do not cache it:
				// the verdict belongs to the client, not the account, and may change on upgrade.
				return { eligible: false };
			}
			// Transient — propagate so the host surfaces "unreachable" while preserving cache.
			throw error;
		}
		if (token.isCancellationRequested) {
			return undefined;
		}

		// The account is eligible (checked above) and the index was fetched with its token — cache the
		// durable allow so later windows render `Available` without re-validating.
		this.cacheAccess({ authProvider: 'microsoft', accountId: session.account.id, eligible: true, serviceUrl: configuredServiceUrl });
		return { eligible: true, manifest };
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

	/**
	 * Client-side eligibility for the Microsoft (Entra ID) path. A work/school (Entra) tenant is
	 * eligible; a personal Microsoft Account (MSA) is not. The decision is read locally from the
	 * account's ID token `tid` (tenant) claim — no network call — mirroring the GitHub path's local
	 * gate.
	 *
	 * The ID token is preferred (it carries `tid` for Entra sign-ins); the access token is a fallback.
	 * A token that cannot be decoded, or that carries no `tid`, is treated as ineligible so an
	 * undecodable/opaque token can never wrongly grant access.
	 */
	private isEntraEligible(session: AuthenticationSession): boolean {
		const rawToken = session.idToken ?? session.accessToken;
		let tid: string | undefined;
		try {
			tid = getClaimsFromJWT(rawToken).tid;
		} catch (error) {
			this.logService.error('[Marketplace] Unable to decode the Microsoft token to determine account eligibility — treating as ineligible.', error);
			return false;
		}
		if (!tid) {
			// No tenant claim → cannot confirm a work/school account. Deny rather than guess.
			return false;
		}
		return tid !== MSA_TENANT_ID && tid !== MSA_PASSTHROUGH_TENANT_ID;
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
	private async getCachedAccess(configuredServiceUrl: string, token: CancellationToken): Promise<IExtensionGalleryAccount | undefined> {
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
			const manifest = await this.serviceIndexFetcher.getServiceIndex(configuredServiceUrl, token, current.token);
			if (token.isCancellationRequested) {
				return undefined;
			}
			return { eligible: true, manifest };
		} catch {
			return undefined;
		}
	}

	/**
	 * Silently resolves the current account for the effective provider, returning its identity (and
	 * bearer token, on the Microsoft path) for cache validation. Never prompts for sign-in. Returns
	 * `{ kind: 'error' }` on a transient failure so callers can distinguish it from "no account".
	 *
	 * Deliberately narrower than {@link getAccount}: it resolves identity only and performs no
	 * eligibility check or index fetch, so {@link getCachedAccess} can confirm the cached verdict
	 * still belongs to the current account without a full (potentially networked) re-validation.
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
		if (!this.authenticationService) {
			// Orchestrator wiring (connectAuthentication) has not run yet — treat as "no account".
			// connectAuthentication re-signals onDidChangeAccount once wired, driving re-validation.
			return undefined;
		}
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
	private clearCache(): void {
		this.storageService.remove(CACHED_ACCESS_KEY, StorageScope.APPLICATION);
	}

	setPreferredAccount(accountId: string): void {
		this.storePreferredAccountId(accountId);
	}
}

registerSingleton(IExtensionGalleryAccountService, ExtensionGalleryAccountService, InstantiationType.Delayed);

/**
 * Orchestrator wiring that hands {@link IAuthenticationService} to
 * {@link IExtensionGalleryAccountService} after startup. The account service cannot inject
 * authentication directly without forming a service DI cycle (see its class doc), so this
 * contribution — which is created outside the core service graph and therefore free to depend on
 * both — performs the one-time connection. Registered at {@link WorkbenchPhase.AfterRestored} so it
 * runs off the critical startup path; the account service reports "no account" until then and
 * re-validates once connected.
 */
export class ExtensionGalleryAccountAuthenticationContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.extensionGalleryAccountAuthentication';

	constructor(
		@IAuthenticationService authenticationService: IAuthenticationService,
		@IExtensionGalleryAccountService extensionGalleryAccountService: IExtensionGalleryAccountService,
	) {
		extensionGalleryAccountService.connectAuthentication(authenticationService);
	}
}

registerWorkbenchContribution2(ExtensionGalleryAccountAuthenticationContribution.ID, ExtensionGalleryAccountAuthenticationContribution, WorkbenchPhase.AfterRestored);

/**
 * Interactive Microsoft (Entra ID) sign-in for the Private Marketplace. When several Microsoft
 * accounts are already signed in, it prompts the user to choose which one to use (with an explicit
 * "different account" escape hatch), then remembers the choice via
 * {@link IExtensionGalleryAccountService.setPreferredAccount} so session selection stays grounded to
 * it across restarts. Invoked by id from the browser-layer sign-in action, which cannot reach this
 * Electron layer directly.
 */
CommandsRegistry.registerCommand(ExtensionGalleryMicrosoftSignInCommandId, async accessor => {
	const authenticationService = accessor.get(IAuthenticationService);
	const quickInputService = accessor.get(IQuickInputService);
	const accountService = accessor.get(IExtensionGalleryAccountService);

	// Establish a session for the marketplace scopes and remember the resulting account. Passing a
	// known account both binds to it without a fresh interactive login and lets the eventual
	// re-validation (driven by the new session) resolve to the intended account; a missing account
	// falls back to interactive sign-in, which is also how the user adds a different account.
	const chooseAccount = async (account: AuthenticationSessionAccount | undefined): Promise<void> => {
		// Persist a known choice before establishing the session so any re-validation the new session
		// triggers already sees the grounded account.
		if (account) {
			accountService.setPreferredAccount(account.id);
		}
		const session = await authenticationService.createSession('microsoft', PRIVATE_MARKETPLACE_SCOPES, account ? { account } : undefined);
		accountService.setPreferredAccount(session.account.id);
	};

	const accounts = await authenticationService.getAccounts('microsoft');
	if (accounts.length <= 1) {
		// Zero accounts means first-time sign-in; one means there is nothing to disambiguate.
		await chooseAccount(accounts.at(0));
		return;
	}

	interface IAccountPickItem extends IQuickPickItem {
		readonly account?: AuthenticationSessionAccount;
	}
	const picks: IAccountPickItem[] = accounts.map(account => ({ label: account.label, account }));
	picks.push({ label: localize('marketplace.signInDifferentAccount', "Sign in with a Different Account…") });

	const pick = await quickInputService.pick(picks, {
		placeHolder: localize('marketplace.pickAccount', "Select the account to use for the Extensions Marketplace")
	});
	if (!pick) {
		return; // cancelled
	}
	await chooseAccount(pick.account);
});
