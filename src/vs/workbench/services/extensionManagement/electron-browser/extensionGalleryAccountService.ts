/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDefaultAccount } from '../../../../base/common/defaultAccount.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { fetchResourceMetadata, getClaimsFromJWT, parseWWWAuthenticateHeader } from '../../../../base/common/oauth.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { ExtensionGalleryAuthorizationService } from '../../../../platform/extensionManagement/common/extensionGalleryAuthorization.js';
import { ExtensionGalleryAuthProviderConfigKey } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { asJson, asText, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSession, AuthenticationSessionAccount, IAuthenticationService } from '../../authentication/common/authentication.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ExtensionGalleryAccountStatus, IExtensionGalleryAccessResult, IExtensionGalleryAccount, IExtensionGalleryAccountProvider, IExtensionGalleryAccountService } from '../common/extensionGalleryAccount.js';

/** The authentication provider that gates Private Marketplace access. */
type ExtensionGalleryAccessProviderId = 'github' | 'microsoft';

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

interface IMarketplaceProtectedResource {
	readonly authorizationServer: string;
	readonly scopes: readonly string[];
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

	async getAccount(): Promise<IExtensionGalleryAccount | undefined> {
		try {
			return await this.doGetAccount();
		} catch (error) {
			// Distinct from "no account" so the caller does not demand sign-in for a transient failure.
			this.logService.error('[Marketplace] Unable to resolve the marketplace account', error);
			this.setAccountStatus(ExtensionGalleryAccountStatus.Unknown);
			return undefined;
		}
	}

	protected abstract doGetAccount(): Promise<IExtensionGalleryAccount | undefined>;

	async getMarketplaceAccessToken(_serviceIndexUrl: string, _wwwAuthenticate: string | undefined): Promise<string | undefined> {
		return undefined;
	}

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

/** Entitlement from the default account's SKU or enterprise flag. No bearer is carried. */
export class GitHubGalleryAccountProvider extends AbstractGalleryAccountProvider {

	constructor(
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IProductService private readonly productService: IProductService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
	) {
		super('github', telemetryService, logService);
		this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this._onDidChangeAccount.fire()));
	}

	protected override async doGetAccount(): Promise<IExtensionGalleryAccount | undefined> {
		// Entitlement here is the account's SKU, and this path carries no bearer to scope.
		const account = await this.defaultAccountService.getDefaultAccount();
		if (!account) {
			this.setAccountStatus(ExtensionGalleryAccountStatus.SignedOut);
			return undefined;
		}
		const eligible = this.checkAccess(account);
		this.reportEligibility(eligible);
		this.setAccountStatus(eligible ? ExtensionGalleryAccountStatus.Eligible : ExtensionGalleryAccountStatus.Ineligible);
		// A result is returned even when ineligible, so the caller can tell "signed in but denied"
		// apart from "no account" — the two map to different statuses.
		return {};
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

	/** The resource the marketplace last advertised, if it gates its requests at all. */
	private protectedResource: IMarketplaceProtectedResource | undefined;

	protected override async doGetAccount(): Promise<IExtensionGalleryAccount | undefined> {
		const session = await this.getSession();
		if (!session) {
			this.setAccountStatus(ExtensionGalleryAccountStatus.SignedOut);
			return undefined;
		}
		const eligible = this.isEligible(session);
		this.reportEligibility(eligible);
		this.setAccountStatus(eligible ? ExtensionGalleryAccountStatus.Eligible : ExtensionGalleryAccountStatus.Ineligible);
		// The bearer is withheld when ineligible: that identity must never reach the marketplace.
		return { accessToken: eligible ? session.accessToken : undefined };
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

	override async getMarketplaceAccessToken(serviceIndexUrl: string, wwwAuthenticate: string | undefined): Promise<string | undefined> {
		const protectedResource = await this.discoverProtectedResource(serviceIndexUrl, wwwAuthenticate);
		if (!protectedResource) {
			return undefined;
		}
		this.protectedResource = protectedResource;
		const session = await this.getSession();
		if (!session || !this.isEligible(session)) {
			return undefined;
		}
		return (await this.getResourceSession(session, protectedResource))?.accessToken;
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

	private async discoverProtectedResource(serviceIndexUrl: string, wwwAuthenticate: string | undefined): Promise<IMarketplaceProtectedResource | undefined> {
		let resourceMetadataUrl: string | undefined;
		if (wwwAuthenticate) {
			for (const challenge of parseWWWAuthenticateHeader(wwwAuthenticate)) {
				if (challenge.scheme.toLowerCase() === 'bearer' && challenge.params.resource_metadata) {
					resourceMetadataUrl = challenge.params.resource_metadata;
					break;
				}
			}
		}
		const fetcher = async (input: string, init: { method: string; headers: Record<string, string> }) => {
			const context = await this.requestService.request({ type: init.method, url: input, headers: init.headers, callSite: 'extensionGalleryAccountService.discoverProtectedResource' }, CancellationToken.None);
			return {
				status: context.res.statusCode ?? 0,
				statusText: '',
				json: async (): Promise<unknown> => await asJson(context),
				text: async (): Promise<string> => (await asText(context)) ?? '',
			};
		};
		try {
			const { metadata } = await fetchResourceMetadata(serviceIndexUrl, resourceMetadataUrl, { fetch: fetcher });
			const authorizationServer = metadata.authorization_servers?.[0];
			if (!authorizationServer) {
				return undefined;
			}
			return { authorizationServer, scopes: metadata.scopes_supported ?? [] };
		} catch {
			return undefined;
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

		// Passing a known account binds to it without a fresh interactive login; omitting it falls
		// back to interactive sign-in, which is also how the user adds a different account.
		const chooseAccount = async (account: AuthenticationSessionAccount | undefined): Promise<void> => {
			// Persist before creating the session so re-validation already sees the grounded account.
			if (account) {
				this.storePreferredAccountId(account.id);
			}
			const session = await this.authenticationService.createSession('microsoft', scopes, account ? { account } : undefined);
			this.storePreferredAccountId(session.account.id);
			await this.consentToProtectedResource(session);
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
	private async consentToProtectedResource(session: AuthenticationSession): Promise<void> {
		const protectedResource = this.protectedResource;
		if (!protectedResource) {
			return;
		}
		if (await this.getResourceSession(session, protectedResource)) {
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

/** Owns the account verdict and the authorization derived from the configured provider. */
export class ExtensionGalleryAccountService extends ExtensionGalleryAuthorizationService implements IExtensionGalleryAccountService {

	declare readonly _serviceBrand: undefined;

	private provider: IExtensionGalleryAccountProvider | undefined;
	private readonly providerListeners = this._register(new MutableDisposable<DisposableStore>());
	private authorizationGeneration = 0;
	private authorizationUpdatePromise = Promise.resolve();
	private readonly setAuthorizationInOtherProcesses: (accessToken: string | undefined, serviceIndexUrl: string | undefined) => Promise<void>;

	private readonly _onDidChangeAccount = this._register(new Emitter<void>());
	readonly onDidChangeAccount: Event<void> = this._onDidChangeAccount.event;

	private readonly _onDidChangeAccountStatus = this._register(new Emitter<ExtensionGalleryAccountStatus>());
	readonly onDidChangeAccountStatus: Event<ExtensionGalleryAccountStatus> = this._onDidChangeAccountStatus.event;

	get accountStatus(): ExtensionGalleryAccountStatus {
		return this.provider?.accountStatus ?? ExtensionGalleryAccountStatus.Unknown;
	}

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ILogService private readonly accountLogService: ILogService,
	) {
		super();
		const channels = [{ name: 'shared process', channel: sharedProcessService.getChannel('extensionGalleryAuthorization') }];
		const remoteConnection = remoteAgentService.getConnection();
		if (remoteConnection) {
			channels.push({ name: 'remote server', channel: remoteConnection.getChannel('extensionGalleryAuthorization') });
		}
		this.setAuthorizationInOtherProcesses = async (accessToken, serviceIndexUrl) => {
			await Promise.all(channels.map(async ({ name, channel }) => {
				try {
					await channel.call('setAuthorization', [accessToken, serviceIndexUrl]);
				} catch (error) {
					this.accountLogService.error(`[Marketplace] Unable to update marketplace authorization in the ${name}`, error);
				}
			}));
		};
		this.publishAuthorization(undefined, undefined).catch(error => this.accountLogService.error('[Marketplace] Unable to initialize marketplace authorization', error));
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

	async resolveMarketplaceAccess(serviceIndexUrl: string): Promise<IExtensionGalleryAccessResult> {
		const provider = this.provider;
		if (!provider) {
			return { status: ExtensionGalleryAccountStatus.Unknown };
		}

		const generation = this.authorizationGeneration;
		const account = await provider.getAccount();
		if (generation !== this.authorizationGeneration) {
			return { status: provider.accountStatus };
		}
		if (provider.accountStatus === ExtensionGalleryAccountStatus.Eligible && account) {
			const authorizationRevision = await this.publishAuthorization(account.accessToken, serviceIndexUrl);
			if (generation !== this.authorizationGeneration) {
				return { status: provider.accountStatus };
			}
			return { status: provider.accountStatus, authorizationRevision };
		}
		if (provider.accountStatus !== ExtensionGalleryAccountStatus.Unknown) {
			await this.publishAuthorization(undefined, undefined);
		}
		return { status: provider.accountStatus };
	}

	async negotiateMarketplaceAccess(serviceIndexUrl: string, wwwAuthenticate?: string): Promise<number | undefined> {
		const provider = this.provider;
		if (!provider || provider.accountStatus !== ExtensionGalleryAccountStatus.Eligible) {
			return undefined;
		}
		const generation = this.authorizationGeneration;
		const accessToken = await provider.getMarketplaceAccessToken(serviceIndexUrl, wwwAuthenticate);
		if (generation !== this.authorizationGeneration) {
			return undefined;
		}
		if (!accessToken || (accessToken === this.authorization.accessToken && serviceIndexUrl === this.authorization.serviceIndexUrl)) {
			await this.publishAuthorization(undefined, undefined);
			return undefined;
		}
		const revision = await this.publishAuthorization(accessToken, serviceIndexUrl);
		return generation === this.authorizationGeneration ? revision : undefined;
	}

	async clearMarketplaceAuthorization(serviceIndexUrl: string, authorizationRevision: number): Promise<void> {
		if (authorizationRevision !== this.authorization.revision || serviceIndexUrl !== this.authorization.serviceIndexUrl) {
			return;
		}
		await this.publishAuthorization(undefined, undefined);
	}

	async signIn(): Promise<void> {
		await this.provider?.signIn();
	}

	private handleAccountChange(): void {
		this.authorizationGeneration++;
		this._onDidChangeAccount.fire();
	}

	private async publishAuthorization(accessToken: string | undefined, serviceIndexUrl: string | undefined): Promise<number> {
		const authorizationRevision = this.setAuthorization(accessToken, serviceIndexUrl);
		const update = () => this.setAuthorizationInOtherProcesses(accessToken, serviceIndexUrl);
		this.authorizationUpdatePromise = this.authorizationUpdatePromise.then(update, update);
		await this.authorizationUpdatePromise;
		return authorizationRevision;
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
