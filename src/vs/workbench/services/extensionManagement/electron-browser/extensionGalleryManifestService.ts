/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../base/common/defaultAccount.js';
import { Emitter } from '../../../../base/common/event.js';
import { IHeaders } from '../../../../base/parts/request/common/request.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IExtensionGalleryManifestService, IExtensionGalleryManifest, ExtensionGalleryServiceUrlConfigKey, ExtensionGalleryAuthProviderConfigKey, ExtensionGalleryManifestStatus, ExtensionGalleryResourceType, getExtensionGalleryManifestResourceUri, PRIVATE_MARKETPLACE_SCOPE } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
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
import { IAuthenticationService } from '../../authentication/common/authentication.js';
import { CONTEXT_MARKETPLACE_AUTH_PROVIDER } from '../../../contrib/extensions/common/extensions.js';

interface ICachedAccess {
	authProvider: 'github' | 'microsoft';
	accountId: string;
	eligible: boolean;
	reason?: string;
}

interface IEligibilityResponse {
	readonly accountType?: 'Entra' | 'MSA';
	readonly eligible?: boolean;
	readonly reason?: string;
}

type MarketplaceAuthEvent = {
	authProvider: string;
	eligible: boolean;
	reason: string;
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
	reason: {
		classification: 'SystemMetaData';
		purpose: 'FeatureInsight';
		comment: 'The eligibility reason returned by the server.';
	};
	owner: 'sandy081';
	comment: 'Reports marketplace authentication results for enterprise marketplace access.';
};

export class WorkbenchExtensionGalleryManifestService extends ExtensionGalleryManifestService implements IExtensionGalleryManifestService {

	private static readonly MICROSOFT_AUTH_SCOPES = [PRIVATE_MARKETPLACE_SCOPE];
	private static readonly CACHED_ACCESS_KEY = 'marketplace.cachedAccess';

	private readonly commonHeadersPromise: Promise<IHeaders>;
	private extensionGalleryManifest: IExtensionGalleryManifest | null = null;

	private _onDidChangeExtensionGalleryManifest = this._register(new Emitter<IExtensionGalleryManifest | null>());
	override readonly onDidChangeExtensionGalleryManifest = this._onDidChangeExtensionGalleryManifest.event;

	private currentStatus: ExtensionGalleryManifestStatus = ExtensionGalleryManifestStatus.Unavailable;
	override get extensionGalleryManifestStatus(): ExtensionGalleryManifestStatus { return this.currentStatus; }
	private _onDidChangeExtensionGalleryManifestStatus = this._register(new Emitter<ExtensionGalleryManifestStatus>());
	override readonly onDidChangeExtensionGalleryManifestStatus = this._onDidChangeExtensionGalleryManifestStatus.event;

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

		// Set the auth provider context key for UX
		const authProvider = this.configurationService.getValue<string>(ExtensionGalleryAuthProviderConfigKey);
		CONTEXT_MARKETPLACE_AUTH_PROVIDER.bindTo(contextKeyService).set(authProvider || 'github');

		const channels = [sharedProcessService.getChannel('extensionGalleryManifest')];
		const remoteConnection = remoteAgentService.getConnection();
		if (remoteConnection) {
			channels.push(remoteConnection.getChannel('extensionGalleryManifest'));
		}
		const updateChannels = (manifest: IExtensionGalleryManifest | null) => {
			this.logService.trace(`[Marketplace] Updating channels with manifest ${manifest ? 'available' : 'unavailable'}`);
			channels.forEach(channel => channel.call('setExtensionGalleryManifest', [manifest]));
		};
		this.getExtensionGalleryManifest().then(manifest => {
			if (this._store.isDisposed) {
				this.logService.trace('[Marketplace] Store is already disposed, skipping channel initialization');
				return;
			}
			updateChannels(manifest);
			this._register(this.onDidChangeExtensionGalleryManifest(manifest => updateChannels(manifest)));
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

	private async doGetExtensionGalleryManifest(): Promise<void> {
		const defaultServiceUrl = this.productService.extensionsGallery?.serviceUrl;
		if (!defaultServiceUrl) {
			return;
		}

		const configuredServiceUrl = this.configurationService.getValue<string>(ExtensionGalleryServiceUrlConfigKey);
		if (configuredServiceUrl) {
		if (configuredServiceUrl) {
			this.logService.trace('[Marketplace] Private marketplace configured, checking access and fetching manifest', configuredServiceUrl);
			await this.initializePrivateMarketplace(configuredServiceUrl);
		} else {
			const defaultExtensionGalleryManifest = await super.getExtensionGalleryManifest();
			this.update(defaultExtensionGalleryManifest);
		}

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ExtensionGalleryServiceUrlConfigKey)
				|| e.affectsConfiguration(ExtensionGalleryAuthProviderConfigKey)) {
				this.clearCachedAccess();
				this.requestRestart();
			}
		}));
	}

	private async initializePrivateMarketplace(configuredServiceUrl: string): Promise<void> {
		// 1. Apply cache immediately before any auth calls
		const cached = this.getCachedAccess();
		if (cached) {
			this.logService.debug('[Marketplace] Applying cached access result on startup');
			await this.applyCachedAccess(cached, configuredServiceUrl);
		}

		// 2. Resolve auth strategy — sets up event subscriptions and returns the validate function
		const validateAccess = await this.resolveAccessStrategy(configuredServiceUrl);

		// 3. Validate (foreground if no cache, background if cache was applied)
		if (cached) {
			validateAccess();
		} else {
			await validateAccess();
		}
	}

	/**
	 * Resolves the effective auth provider, registers event subscriptions for
	 * re-validation, and returns a function that validates current access.
	 *
	 * When configured as 'microsoft', discovers the eligibility URL from the
	 * gallery manifest (ServiceIndex). Falls back to GitHub if the
	 * EligibilityService resource is not advertised.
	 */
	private async resolveAccessStrategy(configuredServiceUrl: string): Promise<() => Promise<void>> {
		const configuredAuthProvider = this.configurationService.getValue<string>(ExtensionGalleryAuthProviderConfigKey);

		if (configuredAuthProvider === 'microsoft') {
			const eligibilityUrl = await this.discoverEligibilityUrl(configuredServiceUrl);
			if (eligibilityUrl) {
				const validate = () => this.handleMicrosoftAccess(configuredServiceUrl, eligibilityUrl);
				this._register(this.authenticationService.onDidChangeSessions(e => {
					if (e.providerId === 'microsoft') {
						this.clearCachedAccess();
						validate();
					}
				}));
				return validate;
			}
			this.logService.info('[Marketplace] EligibilityService not advertised — falling back to GitHub auth');
		}

		// Default: GitHub
		const validate = () => this.handleGitHubAccess(configuredServiceUrl);
		this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => {
			this.clearCachedAccess();
			validate();
		}));
		return validate;
	}

	private async discoverEligibilityUrl(configuredServiceUrl: string): Promise<string | undefined> {
		try {
			const manifest = await this.getExtensionGalleryManifestFromServiceUrl(configuredServiceUrl);
			return getExtensionGalleryManifestResourceUri(manifest, ExtensionGalleryResourceType.EligibilityService);
		} catch (error) {
			this.logService.error('[Marketplace] Error fetching manifest for eligibility URL discovery', error);
			return undefined;
		}
	}

	// --- GitHub access (existing DefaultAccountService-based check) ---

	private async handleGitHubAccess(configuredServiceUrl: string): Promise<void> {
		try {
			const account = await this.defaultAccountService.getDefaultAccount();
			if (!account) {
				// Auth service responded: no account → invalidate cache
				this.clearCachedAccess();
				this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
			} else if (!this.checkAccess(account)) {
				// Auth service responded: account exists but ineligible → cache the result
				this.cacheAccess({ authProvider: 'github', accountId: account.accountName, eligible: false });
				this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
			} else if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
				const manifest = await this.getExtensionGalleryManifestFromServiceUrl(configuredServiceUrl);
				this.cacheAccess({ authProvider: 'github', accountId: account.accountName, eligible: true });
				this.update(manifest);
			}
		} catch (error) {
			this.logService.error('[Marketplace] Error in GitHub access check', error);
			// Network/transient error — never invalidate cache
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

	private async handleMicrosoftAccess(configuredServiceUrl: string, eligibilityUrl: string): Promise<void> {
		let sessions: ReadonlyArray<{ id: string; accessToken: string; account: { id: string; label: string }; scopes: ReadonlyArray<string> }>;
		try {
			sessions = await this.authenticationService.getSessions(
				'microsoft',
				WorkbenchExtensionGalleryManifestService.MICROSOFT_AUTH_SCOPES);
		} catch (error) {
			// Auth service unavailable — transient error, never invalidate cache
			this.logService.error('[Marketplace] Error getting Microsoft sessions', error);
			return;
		}

		if (sessions.length === 0) {
			// Auth service responded definitively: no sessions → invalidate cache
			this.clearCachedAccess();
			this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
			return;
		}

		// Check eligibility via server
		try {
			const result = await this.checkMicrosoftEligibility(eligibilityUrl, sessions[0].accessToken);
			// Server responded with 200 — this is a definitive result, cache it
			this.cacheAccess({
				authProvider: 'microsoft',
				accountId: sessions[0].account.id,
				eligible: result.eligible,
				reason: result.reason,
			});
			this.telemetryService.publicLog2<MarketplaceAuthEvent, MarketplaceAuthClassification>(
				'marketplace:auth:checked',
				{
					authProvider: 'microsoft',
					eligible: result.eligible,
					reason: result.reason || '',
				}
			);
			await this.applyEligibilityResult(result, configuredServiceUrl);
		} catch (error) {
			this.logService.error('[Marketplace] Error checking Microsoft eligibility', error);
			// Network/server error — never invalidate cache
		}
	}

	private async applyEligibilityResult(
		result: { eligible: boolean; reason?: string },
		configuredServiceUrl: string
	): Promise<void> {
		if (result.eligible && this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
			try {
				const manifest = await this.getExtensionGalleryManifestFromServiceUrl(configuredServiceUrl);
				this.update(manifest);
			} catch (error) {
				this.logService.error('[Marketplace] Error retrieving enterprise gallery manifest', error);
				this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
			}
		} else if (!result.eligible) {
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
		}, CancellationToken.None);

		if (context.res.statusCode !== 200) {
			// Non-200 is NOT a definitive eligibility result — throw so callers
			// know this is a transient/server error and don't cache it
			throw new Error(`Eligibility endpoint returned status ${context.res.statusCode}`);
		}

		const response = await asJson<IEligibilityResponse>(context);
		return { eligible: !!response?.eligible, reason: response?.reason };
	}

	// --- Access caching (provider-agnostic) ---

	private getCachedAccess(): ICachedAccess | null {
		const raw = this.storageService.get(
			WorkbenchExtensionGalleryManifestService.CACHED_ACCESS_KEY,
			StorageScope.APPLICATION);
		if (!raw) { return null; }
		try {
			return JSON.parse(raw);
		} catch {
			return null;
		}
	}

	private async applyCachedAccess(cached: ICachedAccess, configuredServiceUrl: string): Promise<void> {
		if (cached.eligible) {
			try {
				const manifest = await this.getExtensionGalleryManifestFromServiceUrl(configuredServiceUrl);
				this.update(manifest);
			} catch (error) {
				this.logService.error('[Marketplace] Error fetching manifest from cached access', error);
				// Network error fetching manifest — don't invalidate cache,
				// just skip the update. Background validation will retry.
			}
		} else {
			this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
		}
	}

	private cacheAccess(data: ICachedAccess): void {
		this.storageService.store(
			WorkbenchExtensionGalleryManifestService.CACHED_ACCESS_KEY,
			JSON.stringify(data),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE);
		this.logService.debug('[Marketplace] Cached access result:', data.authProvider, data.accountId, data.eligible);
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

	private async getExtensionGalleryManifestFromServiceUrl(url: string): Promise<IExtensionGalleryManifest> {
		const commonHeaders = await this.commonHeadersPromise;
		const headers = {
			...commonHeaders,
			'Content-Type': 'application/json',
			'Accept-Encoding': 'gzip',
		};

		try {
			const context = await this.requestService.request({
				type: 'GET',
				url,
				headers,
				callSite: 'extensionGalleryManifestService.fetchManifest'
			}, CancellationToken.None);

			const extensionGalleryManifest = await asJson<IExtensionGalleryManifest>(context);

			if (!extensionGalleryManifest) {
				throw new Error('Unable to retrieve extension gallery manifest.');
			}

			return extensionGalleryManifest;
		} catch (error) {
			this.logService.error('[Marketplace] Error retrieving extension gallery manifest', error);
			throw error;
		}
	}
}

registerSingleton(IExtensionGalleryManifestService, WorkbenchExtensionGalleryManifestService, InstantiationType.Eager);
