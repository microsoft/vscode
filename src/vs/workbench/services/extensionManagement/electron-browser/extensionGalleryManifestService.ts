/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IExtensionGalleryManifestService, IExtensionGalleryManifest, ExtensionGalleryServiceUrlConfigKey, ExtensionGalleryAuthProviderConfigKey, ExtensionGalleryManifestStatus } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { ExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifestService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../host/browser/host.js';
import { isSafeTokenTarget, MarketplaceAuthRequiredError, MarketplaceClientRejectedError } from './extensionGalleryAccess.js';
import { ExtensionGalleryAccountStatus, IExtensionGalleryAccountService } from './extensionGalleryAccountService.js';
import { ExtensionGalleryAccessCache } from './extensionGalleryAccessCache.js';
import { ExtensionGalleryServiceIndexFetcher } from './extensionGalleryServiceIndex.js';

export class WorkbenchExtensionGalleryManifestService extends ExtensionGalleryManifestService implements IExtensionGalleryManifestService {

	private extensionGalleryManifest: IExtensionGalleryManifest | null = null;

	private _onDidChangeExtensionGalleryManifest = this._register(new Emitter<IExtensionGalleryManifest | null>());
	override readonly onDidChangeExtensionGalleryManifest = this._onDidChangeExtensionGalleryManifest.event;

	private currentStatus: ExtensionGalleryManifestStatus = ExtensionGalleryManifestStatus.Unavailable;
	override get extensionGalleryManifestStatus(): ExtensionGalleryManifestStatus { return this.currentStatus; }
	private _onDidChangeExtensionGalleryManifestStatus = this._register(new Emitter<ExtensionGalleryManifestStatus>());
	override readonly onDidChangeExtensionGalleryManifestStatus = this._onDidChangeExtensionGalleryManifestStatus.event;


	// Fetches and memoizes the service index for the configured marketplace.
	private readonly serviceIndexFetcher: ExtensionGalleryServiceIndexFetcher;

	// Durable "was this account allowed here?" verdicts, scoped to account + marketplace.
	private readonly accessCache: ExtensionGalleryAccessCache;

	// Supersedes an in-flight resolution after a sign-out, account switch or configuration change.
	private readonly resolutionTokenSource = this._register(new MutableDisposable<CancellationTokenSource>());

	constructor(
		@IProductService productService: IProductService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
		@IExtensionGalleryAccountService private readonly galleryAccountService: IExtensionGalleryAccountService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(productService);

		this.serviceIndexFetcher = instantiationService.createInstance(ExtensionGalleryServiceIndexFetcher);
		this.accessCache = instantiationService.createInstance(ExtensionGalleryAccessCache);

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

		// Registered before any resolution below: resolving may await a slow network call, and a
		// configuration change during that window still has to supersede it.
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration(ExtensionGalleryServiceUrlConfigKey)
				&& !e.affectsConfiguration(ExtensionGalleryAuthProviderConfigKey)) {
				return;
			}
			// The restart prompt is dismissable, so the process may keep running under the old
			// configuration. Supersede any in-flight resolution, drop the memoized index, and discard
			// the durable verdict so nothing written for the previous marketplace survives.
			this.beginResolution();
			this.serviceIndexFetcher.invalidate();
			this.accessCache.clear();
			this.requestRestart();
		}));

		const configuredServiceUrl = this.configurationService.getValue<string>(ExtensionGalleryServiceUrlConfigKey);
		if (configuredServiceUrl) {
			this.logService.trace('[Marketplace] Private marketplace configured, checking access and fetching manifest', configuredServiceUrl);
			// Registered before the initial resolution for the same reason: a sign-out or account
			// switch mid-flight needs a live listener to supersede it.
			this._register(this.galleryAccountService.onDidChangeAccount(() => this.resolve(configuredServiceUrl)));
			await this.resolve(configuredServiceUrl);
		} else {
			const defaultExtensionGalleryManifest = await super.getExtensionGalleryManifest();
			this.update(defaultExtensionGalleryManifest);
		}
	}

	// --- Access resolution ---

	/** Resolves the account, then fetches the marketplace's service index with it. */
	private async resolve(configuredServiceUrl: string): Promise<void> {
		const token = this.beginResolution();
		this.serviceIndexFetcher.invalidate();
		let accountId: string | undefined;
		try {
			const account = await this.galleryAccountService.getAccount();
			accountId = account?.id;
			if (token.isCancellationRequested) {
				return;
			}
			if (!account) {
				this.applyNoAccount();
				return;
			}
			if (this.galleryAccountService.accountStatus === ExtensionGalleryAccountStatus.Ineligible) {
				// Entitlement is decided client-side, so this is durable for as long as the account is
				// current — record it against this marketplace and never probe with it.
				this.logService.debug('[Marketplace] User signed in but lacks access to private marketplace');
				this.accessCache.write(configuredServiceUrl, account.id, false);
				this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
				return;
			}
			if (account.accessToken && !isSafeTokenTarget(configuredServiceUrl, configuredServiceUrl)) {
				// Won't attach a bearer to a non-HTTPS index; without it an auth-gated index is
				// unreadable, so this deployment cannot work.
				this.logService.error('[Marketplace] Refusing to send the Microsoft token to a non-HTTPS service index URL — the marketplace is misconfigured for Entra auth.');
				this.accessCache.clear();
				this.update(null, ExtensionGalleryManifestStatus.Misconfigured);
				return;
			}
			// A cached denial for this exact account and marketplace is durable — surface it without
			// touching a marketplace that has already refused this identity.
			if (this.accessCache.read(configuredServiceUrl, account.id) === false) {
				this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
				return;
			}
			const manifest = await this.serviceIndexFetcher.getServiceIndex(configuredServiceUrl, token, account.accessToken);
			if (token.isCancellationRequested) {
				return;
			}
			this.accessCache.write(configuredServiceUrl, account.id, true);
			if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
				this.renderAvailable(manifest);
			}
		} catch (error) {
			if (!token.isCancellationRequested) {
				this.applyFetchError(error, configuredServiceUrl, accountId);
			}
		}
	}

	/** Maps "no usable account" to a status, distinguishing signed-out from a transient failure. */
	private applyNoAccount(): void {
		if (this.galleryAccountService.accountStatus === ExtensionGalleryAccountStatus.Unknown) {
			// The account could not be resolved. Do not demand sign-in, and deliberately keep any
			// cached verdict: it cannot be checked against the current identity right now, but it may
			// still be valid once the auth service recovers.
			if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
				this.update(null, ExtensionGalleryManifestStatus.Unreachable);
			}
			return;
		}
		// Definitively signed out — a verdict written for the previous account must not survive.
		this.accessCache.clear();
		this.logService.debug('[Marketplace] Private marketplace configured but user not signed in');
		this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
	}

	/**
	 * A rejection by the server (401/403, or another 4xx) is durable and reported as a denial;
	 * anything else is transient and never downgrades an available marketplace.
	 */
	private applyFetchError(error: unknown, configuredServiceUrl: string, accountId: string | undefined): void {
		if (error instanceof MarketplaceAuthRequiredError) {
			// Only a 403 is persisted: the token was accepted and the identity refused, so the verdict
			// belongs to the account. A 401 means the token itself was rejected (it may simply have
			// expired), which must not outlive this run.
			if (error.statusCode === 403 && accountId) {
				this.accessCache.write(configuredServiceUrl, accountId, false);
			} else {
				this.accessCache.clear();
			}
			this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
			return;
		}
		if (error instanceof MarketplaceClientRejectedError) {
			// Belongs to the client, not the account, so it is not persisted.
			this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
			return;
		}
		this.logService.error('[Marketplace] Error validating marketplace access', error);
		if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
			this.update(null, ExtensionGalleryManifestStatus.Unreachable);
		}
	}

	/**
	 * Starts a new resolution generation, cancelling the previous one so a superseded result — after
	 * a sign-out, account switch or configuration change — can never publish a stale manifest.
	 */
	private beginResolution(): CancellationToken {
		// MutableDisposable disposes the previous source on assignment, but dispose() does not cancel;
		// cancel explicitly so any in-flight continuation is superseded first.
		this.resolutionTokenSource.value?.cancel();
		const source = new CancellationTokenSource();
		this.resolutionTokenSource.value = source;
		return source.token;
	}

	// --- Status management ---

	/** Publishes the manifest and reports successful custom-marketplace access (any auth provider). */
	private renderAvailable(manifest: IExtensionGalleryManifest): void {
		this.update(manifest);
		// Fired for every successfully accessed serviceUrl-configured marketplace regardless of auth
		// provider; the github/microsoft distinction is tracked separately by 'marketplace:auth:checked'.
		this.telemetryService.publicLog2<
			{},
			{
				owner: 'sandy081';
				comment: 'Reports when a user successfully accesses a custom marketplace';
			}>('galleryservice:custom:marketplace');
	}

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
