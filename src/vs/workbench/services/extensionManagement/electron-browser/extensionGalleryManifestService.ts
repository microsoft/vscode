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
import { getEffectiveAuthProvider, isSafeTokenTarget, MarketplaceAuthRequiredError, MarketplaceMisconfiguredError } from './extensionGalleryAccess.js';
import { ExtensionGalleryServiceIndexService } from './extensionGalleryServiceIndex.js';
import { ExtensionGalleryAccountService, IExtensionGalleryAccount } from './extensionGalleryAccountService.js';

export class WorkbenchExtensionGalleryManifestService extends ExtensionGalleryManifestService implements IExtensionGalleryManifestService {

	private extensionGalleryManifest: IExtensionGalleryManifest | null = null;

	private _onDidChangeExtensionGalleryManifest = this._register(new Emitter<IExtensionGalleryManifest | null>());
	override readonly onDidChangeExtensionGalleryManifest = this._onDidChangeExtensionGalleryManifest.event;

	private currentStatus: ExtensionGalleryManifestStatus = ExtensionGalleryManifestStatus.Unavailable;
	override get extensionGalleryManifestStatus(): ExtensionGalleryManifestStatus { return this.currentStatus; }
	private _onDidChangeExtensionGalleryManifestStatus = this._register(new Emitter<ExtensionGalleryManifestStatus>());
	override readonly onDidChangeExtensionGalleryManifestStatus = this._onDidChangeExtensionGalleryManifestStatus.event;

	// Fetches and memoizes the marketplace service index (gallery manifest). Shared between the
	// account service (its eligibility probe) and this service (rendering `Available`) so a single
	// validation generation never re-requests the same index.
	private readonly indexService: ExtensionGalleryServiceIndexService;

	// Resolves "which account may access the Private Marketplace" and owns the durable verdict
	// cache. Created lazily from `doGetExtensionGalleryManifest` (post-construction) because it
	// injects IAuthenticationService, whose graph transitively re-enters this service.
	private galleryAccountService: ExtensionGalleryAccountService | undefined;

	// Cancellation source for the in-flight access validation. Starting a new validation (via
	// `beginValidation`) cancels the previous one, so a superseded validation's late-arriving async
	// continuation observes `token.isCancellationRequested` and does not mutate status/cache/
	// manifest. This closes a time-of-check/time-of-use window where a stale in-flight eligibility
	// check could restore access for an account that is no longer current (after sign-out, an
	// account switch, or a config change).
	private readonly _validationTokenSource = this._register(new MutableDisposable<CancellationTokenSource>());

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

		this.indexService = instantiationService.createInstance(ExtensionGalleryServiceIndexService);

		// Set the auth provider context key for UX. The Entra (microsoft) path is gated behind a
		// product flag; when it is off, `getEffectiveAuthProvider` coerces to the GitHub/default
		// provider so the UI never advertises Microsoft sign-in.
		CONTEXT_MARKETPLACE_AUTH_PROVIDER.bindTo(contextKeyService).set(getEffectiveAuthProvider(configurationService, productService));

		const channels = [sharedProcessService.getChannel('extensionGalleryManifest')];
		const remoteConnection = remoteAgentService.getConnection();
		if (remoteConnection) {
			channels.push(remoteConnection.getChannel('extensionGalleryManifest'));
		}
		const updateChannels = (manifest: IExtensionGalleryManifest | null) => {
			this.logService.trace(`[Marketplace] Updating channels with manifest ${manifest ? 'available' : 'unavailable'}`);
			channels.forEach(channel => channel.call('setExtensionGalleryManifest', [manifest]));
		};
		// Defer the initial manifest bootstrap to a microtask so this service is fully constructed
		// and cached in the DI container before it runs. The Entra (microsoft) access path resolves
		// IAuthenticationService, whose dependency graph transitively re-enters this service;
		// kicking the bootstrap off synchronously from the constructor would resolve
		// IAuthenticationService mid-construction and throw "RECURSIVELY instantiating service
		// 'IAuthenticationService'", corrupting the container and breaking workbench startup.
		Promise.resolve().then(() => this.getExtensionGalleryManifest()).then(manifest => {
			if (this._store.isDisposed) {
				this.logService.trace('[Marketplace] Store is already disposed, skipping channel initialization');
				return;
			}
			updateChannels(manifest);
			this._register(this.onDidChangeExtensionGalleryManifest(manifest => updateChannels(manifest)));
		}).catch(error => {
			// The deferred bootstrap must never surface as an unhandled rejection — any failure here
			// already results in an appropriate manifest status, so just log.
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
			this.galleryAccountService = this._register(this.instantiationService.createInstance(ExtensionGalleryAccountService, this.indexService));
			// Re-validate whenever the underlying account may have changed (Microsoft session
			// added/removed/changed, or the GitHub default account changed). Revoke the manifest
			// authorized for the previous account BEFORE revalidating so a transient failure for the
			// new (possibly ineligible) account cannot leak the prior account's `Available` state.
			// Registered BEFORE the initial validation below: that validation may await a slow
			// network call, and a sign-out/switch during that window must already have a live listener
			// to supersede the in-flight validation (via a fresh cancellation token).
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
			// Supersede any in-flight background validation for the previous marketplace/provider so
			// its late-arriving result cannot re-populate the cache we are about to clear (the
			// restart prompt is dismissable, so the process may keep running).
			this.cancel();
			this.galleryAccountService?.clearCache();
			this.indexService.invalidate();
			this.requestRestart();
		}));
	}

	// --- Access validation ---

	/**
	 * Establishes access for the configured Private Marketplace: applies any cancellation-guarded
	 * cached verdict for a fast startup, then validates the current account (foreground when there
	 * was no usable cache, background otherwise).
	 */
	private async handleMarketplaceAccess(configuredServiceUrl: string): Promise<void> {
		const token = this.beginValidation();
		let appliedFromCache = false;
		try {
			const cached = await this.galleryAccountService!.getCachedAccess(configuredServiceUrl, token);
			if (!token.isCancellationRequested && cached) {
				await this.applyAccess(cached, configuredServiceUrl, token);
				appliedFromCache = true;
			}
		} catch (error) {
			// A thrown cache read is a transient identity-resolution failure: surface it via
			// `applyError` (which preserves an already-`Available` marketplace) and fall through to a
			// foreground validation.
			this.applyError(error, token);
		}

		if (appliedFromCache) {
			// The cache already rendered a verdict; re-validate in the background so a stale cached
			// state cannot linger, but do not block startup on the network round-trip.
			this.validateCurrentAccess(configuredServiceUrl, token);
		} else {
			await this.validateCurrentAccess(configuredServiceUrl, token);
		}
	}

	/**
	 * Resolves the current account's live access verdict and applies it. All status/manifest
	 * mutations are guarded by `token.isCancellationRequested` so a superseded validation cannot
	 * commit a stale verdict.
	 */
	private async validateCurrentAccess(configuredServiceUrl: string, token: CancellationToken): Promise<void> {
		try {
			const account = await this.galleryAccountService!.getAccount(configuredServiceUrl, token);
			if (!token.isCancellationRequested) {
				await this.applyAccess(account, configuredServiceUrl, token);
			}
		} catch (error) {
			this.applyError(error, token);
		}
	}

	/**
	 * Maps a resolved access verdict to a manifest/status. `undefined` means sign-in is required;
	 * `{ eligible: false }` is a denial; `{ eligible: true }` renders the marketplace available,
	 * fetching the service index when the verdict did not already carry one. Never throws — its own
	 * index fetch is guarded so a transient failure degrades to `Unreachable` (preserving an
	 * already-`Available` marketplace) rather than rejecting.
	 */
	private async applyAccess(account: IExtensionGalleryAccount | undefined, configuredServiceUrl: string, token: CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			return;
		}
		if (!account) {
			this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
			return;
		}
		if (!account.eligible) {
			this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
			return;
		}
		if (this.currentStatus === ExtensionGalleryManifestStatus.Available) {
			return;
		}
		if (account.manifest) {
			this.renderAvailable(account.manifest);
			return;
		}
		// Eligible verdict without a manifest (e.g. applied from cache): (re-)fetch the service
		// index to render `Available`. A bearer must only be presented to an HTTPS same-origin
		// target, so bail to `Misconfigured` if the configured URL is unsafe.
		if (account.accessToken && !isSafeTokenTarget(configuredServiceUrl, configuredServiceUrl)) {
			this.update(null, ExtensionGalleryManifestStatus.Misconfigured);
			return;
		}
		try {
			const manifest = await this.indexService.getServiceIndex(configuredServiceUrl, token, account.accessToken);
			if (token.isCancellationRequested) {
				return;
			}
			this.renderAvailable(manifest);
		} catch (error) {
			if (token.isCancellationRequested) {
				return;
			}
			if (error instanceof MarketplaceAuthRequiredError) {
				// The cached verdict said eligible but the index now needs auth we cannot satisfy from
				// a bare cache application; leave it to the full validation already in flight.
				return;
			}
			this.logService.error('[Marketplace] Error retrieving gallery manifest for eligible account', error);
			// `applyAccess` already returned early when the marketplace was `Available` (and the only
			// writer to `Available`, `renderAvailable`, never ran because the fetch above threw), so the
			// status here is never `Available` — degrading to `Unreachable` cannot clobber a good state.
			this.update(null, ExtensionGalleryManifestStatus.Unreachable);
		}
	}

	/**
	 * Publishes an available manifest and, for the GitHub/default path, reports the custom
	 * marketplace access telemetry (matching upstream behavior).
	 */
	private renderAvailable(manifest: IExtensionGalleryManifest): void {
		this.update(manifest);
		if (getEffectiveAuthProvider(this.configurationService, this.productService) === 'github') {
			this.telemetryService.publicLog2<
				{},
				{
					owner: 'sandy081';
					comment: 'Reports when a user successfully accesses a custom marketplace';
				}>('galleryservice:custom:marketplace');
		}
	}

	/**
	 * Maps a validation error to a status: a misconfiguration is durable (`Misconfigured`), any
	 * other error is transient (`Unreachable`) and never downgrades an already-`Available`
	 * marketplace. Guarded so a superseded validation's error is ignored.
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
	 * Begins a new access-validation generation and returns its cancellation token, cancelling any
	 * previously started validation and dropping the memoized service index so the new generation
	 * re-fetches it. Long-running validations MUST check `token.isCancellationRequested` immediately
	 * before every mutation of status/cache/manifest and bail when it is set, so a superseded
	 * validation cannot commit a stale verdict.
	 */
	private beginValidation(): CancellationToken {
		this.indexService.invalidate();
		// `MutableDisposable` disposes the previous source on assignment, but
		// `CancellationTokenSource.dispose()` does not cancel — cancel explicitly so any in-flight
		// continuation (and threaded request) is superseded before the old source is disposed.
		this._validationTokenSource.value?.cancel();
		const source = new CancellationTokenSource();
		this._validationTokenSource.value = source;
		return source.token;
	}

	/**
	 * Cancels any in-flight validation without starting a new one, so a late-arriving result cannot
	 * mutate status/cache/manifest. Used when a config change supersedes the current marketplace/
	 * provider (the restart prompt is dismissable, so the process may keep running).
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
