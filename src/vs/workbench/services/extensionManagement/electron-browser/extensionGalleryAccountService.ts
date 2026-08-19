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


const PREFERRED_ACCOUNT_KEY = 'marketplace.account';

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

/** `accessToken` is only carried on the Microsoft path; the GitHub path has no bearer. */
export interface IExtensionGalleryAccount {
	readonly accessToken?: string;
}

export const enum ExtensionGalleryAccountStatus {
	/** None signed in, or several with no choice made. */
	SignedOut = 'signedOut',
	Ineligible = 'ineligible',
	Eligible = 'eligible',
	/** Could not be resolved — a transient auth failure, not a sign-out. */
	Unknown = 'unknown'
}

export const IExtensionGalleryAccountService = createDecorator<IExtensionGalleryAccountService>('extensionGalleryAccountService');

/** Identity and entitlement for the Private Marketplace. Knows nothing about URLs or HTTP. */
export interface IExtensionGalleryAccountService {
	readonly _serviceBrand: undefined;

	readonly accountStatus: ExtensionGalleryAccountStatus;

	readonly onDidChangeAccountStatus: Event<ExtensionGalleryAccountStatus>;

	/** Never prompts. Check {@link accountStatus} for whether the account may actually be used. */
	getAccount(): Promise<IExtensionGalleryAccount | undefined>;

	readonly onDidChangeAccount: Event<void>;

	/** Remembers an explicit choice so selection stays grounded across restarts. */
	setPreferredAccount(accountId: string): void;

	/**
	 * Not a constructor dependency: auth transitively depends back on this service. Idempotent;
	 * until it runs the Microsoft path reports "no account".
	 */
	connectAuthentication(authenticationService: IAuthenticationService): void;
}

export class ExtensionGalleryAccountService extends Disposable implements IExtensionGalleryAccountService {

	declare readonly _serviceBrand: undefined;

	private readonly authProvider: ExtensionGalleryAccessProviderId;

	// A constructor dependency here would form a DI cycle: this → auth → extensionService → gallery
	// → manifest → this, which aborts startup.
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
		this.authProvider = getEffectiveAuthProvider(configurationService.getValue<string>(ExtensionGalleryAuthProviderConfigKey), !!productService.enableExtensionGalleryEntraAuth);
		CONTEXT_MARKETPLACE_AUTH_PROVIDER.bindTo(contextKeyService).set(this.authProvider);

		// The Microsoft path's change signal is wired in connectAuthentication instead, to keep the DI
		// cycle broken.
		if (this.authProvider !== 'microsoft') {
			this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this._onDidChangeAccount.fire()));
		}
	}

	async getAccount(): Promise<IExtensionGalleryAccount | undefined> {
		try {
			const account = this.authProvider === 'microsoft'
				? await this.getMicrosoftAccount()
				: await this.getGitHubAccount();
			return account;
		} catch (error) {
			// Distinct from "no account" so the caller does not demand sign-in for a transient failure.
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
		this._register(authenticationService.onDidChangeSessions(e => {
			if (e.providerId === 'microsoft') {
				this._onDidChangeAccount.fire();
			}
		}));
		// Re-signal once: anything resolved before auth was connected saw no Microsoft session.
		this._onDidChangeAccount.fire();
	}

	/** Entitlement from the account's SKU or enterprise flag. No bearer is carried. */
	private async getGitHubAccount(): Promise<IExtensionGalleryAccount | undefined> {
		const account = await this.defaultAccountService.getDefaultAccount();
		if (!account) {
			this.setAccountStatus(ExtensionGalleryAccountStatus.SignedOut);
			return undefined;
		}
		const eligible = this.checkGitHubAccess(account);
		this.reportEligibility(eligible);
		this.setAccountStatus(eligible ? ExtensionGalleryAccountStatus.Eligible : ExtensionGalleryAccountStatus.Ineligible);
		// A result is returned even when ineligible, so the caller can tell "signed in but denied"
		// apart from "no account" — the two map to different statuses.
		return {};
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

	/** Entitlement decided locally from the token's tenant claim. The bearer travels with it. */
	private async getMicrosoftAccount(): Promise<IExtensionGalleryAccount | undefined> {
		const session = await this.getMicrosoftSession();
		if (!session) {
			this.setAccountStatus(ExtensionGalleryAccountStatus.SignedOut);
			return undefined;
		}
		const eligible = this.isEntraEligible(session);
		this.reportEligibility(eligible);
		this.setAccountStatus(eligible ? ExtensionGalleryAccountStatus.Eligible : ExtensionGalleryAccountStatus.Ineligible);
		// The bearer is withheld when ineligible: that identity must never reach the marketplace.
		return { accessToken: eligible ? session.accessToken : undefined };
	}

	private reportEligibility(eligible: boolean): void {
		this.telemetryService.publicLog2<MarketplaceAuthEvent, MarketplaceAuthClassification>('marketplace:auth:checked', {
			authProvider: this.authProvider,
			eligible
		});
	}

	/** Work/school tenant is eligible, personal is not. Fails closed on an unreadable token. */
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
			return false;
		}
		return tid !== MSA_TENANT_ID && tid !== MSA_PASSTHROUGH_TENANT_ID;
	}

	/**
	 * Anchored to the remembered account rather than an arbitrary `sessions[0]`. Several accounts
	 * with no preference returns `undefined` rather than guessing. Never prompts.
	 */
	private async getMicrosoftSession(): Promise<AuthenticationSession | undefined> {
		if (!this.authenticationService) {
			// connectAuthentication has not run yet; it re-signals once wired.
			return undefined;
		}
		const sessions = await this.authenticationService.getSessions('microsoft', PRIVATE_MARKETPLACE_SCOPES);
		if (sessions.length === 0) {
			return undefined;
		}
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
		if (candidate.authProvider !== this.authProvider || typeof candidate.id !== 'string') {
			return undefined;
		}
		return candidate.id;
	}

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
 * Hands authentication to the account service after startup. Lives outside the core service graph,
 * so it can depend on both without forming the DI cycle the account service must avoid.
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
 * Interactive Microsoft sign-in. Invoked by id from the browser-layer action, which cannot reach
 * this Electron layer directly.
 */
CommandsRegistry.registerCommand(ExtensionGalleryMicrosoftSignInCommandId, async accessor => {
	const authenticationService = accessor.get(IAuthenticationService);
	const quickInputService = accessor.get(IQuickInputService);
	const accountService = accessor.get(IExtensionGalleryAccountService);

	// Passing a known account binds to it without a fresh interactive login; omitting it falls back
	// to interactive sign-in, which is also how the user adds a different account.
	const chooseAccount = async (account: AuthenticationSessionAccount | undefined): Promise<void> => {
		// Persist before creating the session so re-validation already sees the grounded account.
		if (account) {
			accountService.setPreferredAccount(account.id);
		}
		const session = await authenticationService.createSession('microsoft', PRIVATE_MARKETPLACE_SCOPES, account ? { account } : undefined);
		accountService.setPreferredAccount(session.account.id);
	};

	const accounts = await authenticationService.getAccounts('microsoft');
	if (accounts.length <= 1) {
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
