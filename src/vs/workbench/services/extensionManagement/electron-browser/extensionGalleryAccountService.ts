/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDefaultAccount } from '../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getClaimsFromJWT } from '../../../../base/common/oauth.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { ExtensionGalleryAuthProviderConfigKey, ExtensionGalleryMicrosoftSignInCommandId, CONTEXT_MARKETPLACE_AUTH_PROVIDER, PRIVATE_MARKETPLACE_SCOPES } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSession, AuthenticationSessionAccount, IAuthenticationService } from '../../authentication/common/authentication.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ExtensionGalleryAccessProviderId, getEffectiveAuthProvider } from './extensionGalleryAccess.js';


/** Storage key for the account the user chose ({@link IPreferredAccount}), remembered across windows. */
const PREFERRED_ACCOUNT_KEY = 'marketplace.account';

/**
 * Well-known Microsoft Account (MSA) tenant ids — a token with one of these `tid` claims is a
 * personal account, not work/school. Duplicated from the microsoft-authentication extension, which
 * lives in the extension host and is not importable here.
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
 * The account the user settled on for the Private Marketplace, persisted so a remembered choice
 * survives restarts. `authProvider` scopes the preference so it is ignored after a provider switch;
 * `id` is the stable account id (never a display label).
 */
interface IPreferredAccount {
	readonly authProvider: string;
	readonly id: string;
}

/**
 * An account that may be used for the Private Marketplace. `accessToken` is only carried on the
 * Microsoft path (the GitHub/default path has no bearer).
 */
export interface IExtensionGalleryAccount {
	readonly id: string;
	readonly accessToken?: string;
}

/** Whether an account usable for the Private Marketplace is available, and if not, why. */
export const enum ExtensionGalleryAccountStatus {
	/** No account is signed in, or several are and none has been chosen. */
	SignedOut = 'signedOut',
	/** An account is signed in but is not entitled to a Private Marketplace. */
	Ineligible = 'ineligible',
	/** An entitled account is available; {@link IExtensionGalleryAccountService.getAccount} returns it. */
	Eligible = 'eligible',
	/** The account could not be resolved (transient auth-service failure). */
	Unknown = 'unknown'
}

export const IExtensionGalleryAccountService = createDecorator<IExtensionGalleryAccountService>('extensionGalleryAccountService');

/**
 * Answers "is there an account we may use for the Private Marketplace, and is it entitled?".
 * Knows nothing about marketplace URLs, the service index or HTTP — that belongs to the manifest
 * service. Authentication is supplied post-startup via {@link connectAuthentication} rather than
 * injected, to avoid a service DI cycle.
 */
export interface IExtensionGalleryAccountService {
	readonly _serviceBrand: undefined;

	/** Whether a usable account is available, and if not, why. */
	readonly accountStatus: ExtensionGalleryAccountStatus;

	/** Fires when {@link accountStatus} changes. */
	readonly onDidChangeAccountStatus: Event<ExtensionGalleryAccountStatus>;

	/**
	 * The signed-in account, or `undefined` when there is none. Never prompts. Check
	 * {@link accountStatus} for whether it may actually be used.
	 */
	getAccount(): Promise<IExtensionGalleryAccount | undefined>;

	/** Fires when the underlying account may have changed, so callers can re-resolve. */
	readonly onDidChangeAccount: Event<void>;

	/**
	 * Remembers the account the user chose, so selection stays grounded across restarts when several
	 * Microsoft accounts are signed in. Call after an explicit choice during sign-in.
	 */
	setPreferredAccount(accountId: string): void;

	/**
	 * Supplies the {@link IAuthenticationService} the Microsoft path needs. An initialization API
	 * rather than a constructor dependency because auth transitively depends back on this service.
	 * Idempotent; until it runs the Microsoft path reports "no account".
	 */
	connectAuthentication(authenticationService: IAuthenticationService): void;
}

export class ExtensionGalleryAccountService extends Disposable implements IExtensionGalleryAccountService {

	declare readonly _serviceBrand: undefined;

	private readonly authProvider: ExtensionGalleryAccessProviderId;

	// Not an `@IAuthenticationService` constructor dependency: that would form a DI cycle (this
	// service → auth → extensionService → gallery → manifest → this service) which the instantiation
	// graph walker detects and aborts startup on. Supplied later via connectAuthentication.
	private authenticationService: IAuthenticationService | undefined;

	private readonly _onDidChangeAccount = this._register(new Emitter<void>());
	readonly onDidChangeAccount: Event<void> = this._onDidChangeAccount.event;

	private _accountStatus = ExtensionGalleryAccountStatus.Unknown;
	get accountStatus(): ExtensionGalleryAccountStatus { return this._accountStatus; }
	private readonly _onDidChangeAccountStatus = this._register(new Emitter<ExtensionGalleryAccountStatus>());
	readonly onDidChangeAccountStatus: Event<ExtensionGalleryAccountStatus> = this._onDidChangeAccountStatus.event;

	constructor(
		@IProductService private readonly productService: IProductService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		// Entra (microsoft) is gated behind a product flag; when off, the effective provider coerces
		// to github so the UI never advertises Microsoft sign-in.
		this.authProvider = getEffectiveAuthProvider(configurationService.getValue<string>(ExtensionGalleryAuthProviderConfigKey), !!productService.enableExtensionGalleryEntraAuth);
		CONTEXT_MARKETPLACE_AUTH_PROVIDER.bindTo(contextKeyService).set(this.authProvider);

		// The GitHub/default path resolves through IDefaultAccountService, which does not re-enter this
		// service, so it can be wired here. The Microsoft path's change signal is wired later, once
		// authentication is connected (see connectAuthentication), to keep the cycle broken.
		if (this.authProvider !== 'microsoft') {
			this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this._onDidChangeAccount.fire()));
		}
	}

	// --- Account resolution ---

	async getAccount(): Promise<IExtensionGalleryAccount | undefined> {
		try {
			const account = this.authProvider === 'microsoft'
				? await this.getMicrosoftAccount()
				: await this.getGitHubAccount();
			return account;
		} catch (error) {
			// Transient auth-service failure — distinct from "no account" so the caller can preserve
			// whatever it is already showing instead of demanding sign-in.
			this.logService.error('[Marketplace] Unable to resolve the marketplace account', error);
			this.setAccountStatus(ExtensionGalleryAccountStatus.Unknown);
			return undefined;
		}
	}

	private setAccountStatus(status: ExtensionGalleryAccountStatus): void {
		if (this._accountStatus !== status) {
			this._accountStatus = status;
			this._onDidChangeAccountStatus.fire(status);
		}
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
	 * The GitHub/default path: entitlement comes from the account's SKU or enterprise flag. No
	 * bearer is carried — the default gallery is read anonymously.
	 */
	private async getGitHubAccount(): Promise<IExtensionGalleryAccount | undefined> {
		// May throw on a transient auth-service failure — propagated to getAccount, which reports
		// `Unknown` rather than demanding sign-in.
		const account = await this.defaultAccountService.getDefaultAccount();
		if (!account) {
			this.setAccountStatus(ExtensionGalleryAccountStatus.SignedOut);
			return undefined;
		}
		const eligible = this.checkGitHubAccess(account);
		this.reportEligibility(eligible);
		this.setAccountStatus(eligible ? ExtensionGalleryAccountStatus.Eligible : ExtensionGalleryAccountStatus.Ineligible);
		// Returned even when ineligible so the caller can scope a durable denial to this account;
		// `accountStatus` is what says whether it may be used.
		return { id: account.accountName };
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

	/**
	 * The Microsoft (Entra ID) path: the grounded session is resolved silently and entitlement is
	 * decided locally from its tenant claim. The access token travels with the account so the
	 * caller can read an auth-gated service index.
	 */
	private async getMicrosoftAccount(): Promise<IExtensionGalleryAccount | undefined> {
		// Never prompts. A throw is a transient auth-service failure and is propagated to getAccount.
		const session = await this.getMicrosoftSession();
		if (!session) {
			// No usable account: none signed in, or several with no remembered choice.
			this.setAccountStatus(ExtensionGalleryAccountStatus.SignedOut);
			return undefined;
		}
		const eligible = this.isEntraEligible(session);
		this.reportEligibility(eligible);
		this.setAccountStatus(eligible ? ExtensionGalleryAccountStatus.Eligible : ExtensionGalleryAccountStatus.Ineligible);
		// Returned even when ineligible so the caller can scope a durable denial to this account, but
		// the bearer is withheld: an ineligible identity must never reach the marketplace.
		return { id: session.account.id, accessToken: eligible ? session.accessToken : undefined };
	}

	/** Reports the eligibility outcome for the effective auth provider. */
	private reportEligibility(eligible: boolean): void {
		this.telemetryService.publicLog2<MarketplaceAuthEvent, MarketplaceAuthClassification>('marketplace:auth:checked', {
			authProvider: this.authProvider,
			eligible
		});
	}

	/**
	 * Client-side eligibility for the Microsoft (Entra ID) path: a work/school tenant is eligible, a
	 * personal Microsoft Account is not, read locally from the token's `tid` claim. An undecodable
	 * token, or one without `tid`, is treated as ineligible so it can never wrongly grant access.
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
	 * Selects the effective Microsoft session. Several accounts may be signed in, so selection is
	 * anchored to the persisted {@link IPreferredAccount} rather than an arbitrary `sessions[0]`:
	 * remembered account if still signed in; a single account is adopted and persisted; several with no
	 * preference returns `undefined` rather than guessing. Never prompts.
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
