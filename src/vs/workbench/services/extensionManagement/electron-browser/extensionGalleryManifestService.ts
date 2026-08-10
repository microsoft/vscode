/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionGalleryManifestService, IExtensionGalleryManifest, ExtensionGalleryServiceUrlConfigKey, ExtensionGalleryAuthProviderConfigKey, ExtensionGalleryManifestStatus, CONTEXT_MARKETPLACE_AUTH_PROVIDER } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { ExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifestService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../host/browser/host.js';
import { ExtensionGalleryAccessProviderId, getEffectiveAuthProvider, MarketplaceMisconfiguredError } from './extensionGalleryAccess.js';
import { ExtensionGalleryAccountService, IExtensionGalleryAccount } from './extensionGalleryAccountService.js';

export class WorkbenchExtensionGalleryManifestService extends ExtensionGalleryManifestService implements IExtensionGalleryManifestService {

	private extensionGalleryManifest: IExtensionGalleryManifest | null = null;

	private _onDidChangeExtensionGalleryManifest = this._register(new Emitter<IExtensionGalleryManifest | null>());
	override readonly onDidChangeExtensionGalleryManifest = this._onDidChangeExtensionGalleryManifest.event;

	private currentStatus: ExtensionGalleryManifestStatus = ExtensionGalleryManifestStatus.Unavailable;
	override get extensionGalleryManifestStatus(): ExtensionGalleryManifestStatus { return this.currentStatus; }
	private _onDidChangeExtensionGalleryManifestStatus = this._register(new Emitter<ExtensionGalleryManifestStatus>());
	override readonly onDidChangeExtensionGalleryManifestStatus = this._onDidChangeExtensionGalleryManifestStatus.event;

	// Resolves which account may access the Private Marketplace and owns the durable verdict +
	// in-process service-index caches. Created lazily (not in the ctor) because it injects
	// IAuthenticationService, whose graph transitively re-enters this service.
	private galleryAccountService: ExtensionGalleryAccountService | undefined;

	// Guards a time-of-check/time-of-use race: a stale in-flight eligibility check must not restore
	// access for an account that is no longer current (after sign-out, account switch, or config
	// change). `beginValidation` cancels the previous source, so a superseded validation observes
	// `token.isCancellationRequested` and skips its status/cache/manifest mutation.
	private readonly _validationTokenSource = this._register(new MutableDisposable<CancellationTokenSource>());

	// Effective marketplace auth provider (microsoft/github), resolved once with the product gate applied.
	private readonly authProvider: ExtensionGalleryAccessProviderId;

	constructor(
		@IProductService productService: IProductService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(productService);

		// Entra (microsoft) is gated behind a product flag; when off, the effective provider
		// coerces to github so the UI never advertises Microsoft sign-in.
		this.authProvider = getEffectiveAuthProvider(configurationService.getValue<string>(ExtensionGalleryAuthProviderConfigKey), !!productService.enableExtensionGalleryEntraAuth);
		CONTEXT_MARKETPLACE_AUTH_PROVIDER.bindTo(contextKeyService).set(this.authProvider);

		const channels = [sharedProcessService.getChannel('extensionGalleryManifest')];
		const remoteConnection = remoteAgentService.getConnection();
		if (remoteConnection) {
			channels.push(remoteConnection.getChannel('extensionGalleryManifest'));
		}
		const updateChannels = (manifest: IExtensionGalleryManifest | null) => {
			this.logService.trace(`[Marketplace] Updating channels with manifest ${manifest ? 'available' : 'unavailable'}`);
			channels.forEach(channel => channel.call('setExtensionGalleryManifest', [manifest]));
		};
		// Defer to a microtask so this service is cached in the DI container before the Entra path
		// resolves IAuthenticationService: resolving it mid-construction throws "RECURSIVELY
		// instantiating service 'IAuthenticationService'" and breaks workbench startup.
		Promise.resolve().then(() => this.getExtensionGalleryManifest()).then(manifest => {
			if (this._store.isDisposed) {
				this.logService.trace('[Marketplace] Store is already disposed, skipping channel initialization');
				return;
			}
			updateChannels(manifest);
			this._register(this.onDidChangeExtensionGalleryManifest(manifest => updateChannels(manifest)));
		}).catch(error => {
			this.logService.error('[Marketplace] Error during initial gallery manifest bootstrap', error);
		});
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
			this.logService.trace('[Marketplace] Private marketplace configured, checking access and fetching manifest', configuredServiceUrl);
			this.galleryAccountService = this._register(this.instantiationService.createInstance(ExtensionGalleryAccountService));
			// Registered before the initial validation below: that validation may await a slow network
			// call, and a sign-out/switch during that window needs a live listener to supersede it.
			// Revoke the current manifest before revalidating so a transient failure for the new
			// (possibly ineligible) account cannot leak the prior account's Available state.
			this._register(this.galleryAccountService.onDidChangeAccount(() => {
				this.galleryAccountService?.clearCache();
				this.update(null);
				this.validateCurrentAccess(configuredServiceUrl, this.beginValidation());
			}));
			await this.handleMarketplaceAccess(configuredServiceUrl);
		} else {
			const defaultExtensionGalleryManifest = await super.getExtensionGalleryManifest();
			this.update(defaultExtensionGalleryManifest);
		}

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration(ExtensionGalleryServiceUrlConfigKey)
				&& !e.affectsConfiguration(ExtensionGalleryAuthProviderConfigKey)) {
				return;
			}
			// Supersede any in-flight validation so its late result cannot repopulate the cache we
			// clear here (the restart prompt is dismissable, so the process may keep running).
			this.cancel();
			this.galleryAccountService?.clearCache();
			this.galleryAccountService?.invalidateServiceIndexCache();
			this.requestRestart();
		}));
	}

	// --- Access validation ---

	/**
	 * Applies any cached verdict for a fast startup, then validates the current account — in the
	 * background when the cache already rendered a verdict, otherwise foreground.
	 */
	private async handleMarketplaceAccess(configuredServiceUrl: string): Promise<void> {
		const token = this.beginValidation();
		let appliedFromCache = false;
		try {
			const cached = await this.galleryAccountService!.getCachedAccess(configuredServiceUrl, token);
			if (!token.isCancellationRequested && cached) {
				this.applyAccess(cached, token);
				appliedFromCache = true;
			}
		} catch (error) {
			// A thrown cache read is a transient identity-resolution failure — preserve any Available
			// state and fall through to foreground validation.
			this.applyError(error, token);
		}

		if (appliedFromCache) {
			// Re-validate in the background so a stale cached state cannot linger.
			this.validateCurrentAccess(configuredServiceUrl, token);
		} else {
			await this.validateCurrentAccess(configuredServiceUrl, token);
		}
	}

	/**
	 * Resolves and applies the current account's live verdict. Guarded by cancellation so a
	 * superseded validation cannot commit a stale verdict.
	 */
	private async validateCurrentAccess(configuredServiceUrl: string, token: CancellationToken): Promise<void> {
		try {
			const account = await this.galleryAccountService!.getAccount(configuredServiceUrl, token);
			if (!token.isCancellationRequested) {
				this.applyAccess(account, token);
			}
		} catch (error) {
			this.applyError(error, token);
		}
	}

	/** Maps a resolved verdict to manifest/status. Guarded by cancellation; never throws. */
	private applyAccess(account: IExtensionGalleryAccount | undefined, token: CancellationToken): void {
		if (token.isCancellationRequested) {
			return;
		}
		if (!account) {
			this.logService.debug('[Marketplace] Private marketplace configured but user not signed in');
			this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
			return;
		}
		if (!account.eligible) {
			this.logService.debug('[Marketplace] User signed in but lacks access to private marketplace');
			this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
			return;
		}
		if (this.currentStatus === ExtensionGalleryManifestStatus.Available) {
			return;
		}
		if (!account.manifest) {
			// An eligible verdict always carries a materialized index; a missing one is a transient
			// fetch failure, not a blank marketplace.
			this.update(null, ExtensionGalleryManifestStatus.Unreachable);
			return;
		}
		this.renderAvailable(account.manifest);
	}

	/** Publishes the manifest; the github path also reports the custom-marketplace telemetry. */
	private renderAvailable(manifest: IExtensionGalleryManifest): void {
		this.update(manifest);
		if (this.authProvider === 'github') {
			this.telemetryService.publicLog2<
				{},
				{
					owner: 'sandy081';
					comment: 'Reports when a user successfully accesses a custom marketplace';
				}>('galleryservice:custom:marketplace');
		}
	}

	/**
	 * Misconfiguration is durable (`Misconfigured`); any other error is transient (`Unreachable`)
	 * and never downgrades an already-Available marketplace. Guarded against superseded validations.
	 */
	private applyError(error: unknown, token: CancellationToken): void {
		if (token.isCancellationRequested) {
			return;
		}
		if (error instanceof MarketplaceMisconfiguredError) {
			this.update(null, ExtensionGalleryManifestStatus.Misconfigured);
			return;
		}
		this.logService.error('[Marketplace] Error validating marketplace access', error);
		if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
			this.update(null, ExtensionGalleryManifestStatus.Unreachable);
		}
	}

	/**
	 * Starts a new validation generation: cancels the previous one and drops the memoized index so
	 * the new generation re-fetches it. Callers MUST check `token.isCancellationRequested` before
	 * each status/cache/manifest mutation so a superseded validation cannot commit a stale verdict.
	 */
	private beginValidation(): CancellationToken {
		this.galleryAccountService?.invalidateServiceIndexCache();
		// MutableDisposable disposes the previous source on assignment, but dispose() does not cancel;
		// cancel explicitly so any in-flight continuation is superseded first.
		this._validationTokenSource.value?.cancel();
		const source = new CancellationTokenSource();
		this._validationTokenSource.value = source;
		return source.token;
	}

	/**
	 * Cancels the in-flight validation without starting a new one, so a late result cannot mutate
	 * status/cache/manifest. Used on config change (the restart prompt is dismissable).
	 */
	private cancel(): void {
		this._validationTokenSource.value?.cancel();
		this._validationTokenSource.clear();
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
}

registerSingleton(IExtensionGalleryManifestService, WorkbenchExtensionGalleryManifestService, InstantiationType.Eager);
