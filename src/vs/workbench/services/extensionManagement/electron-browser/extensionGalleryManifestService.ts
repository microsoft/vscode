/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionGalleryManifestService, IExtensionGalleryManifest, ExtensionGalleryServiceUrlConfigKey, ExtensionGalleryAuthProviderConfigKey, ExtensionGalleryManifestStatus, CONTEXT_MARKETPLACE_AUTH_PROVIDER } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { ExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifestService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../host/browser/host.js';
import { ExtensionGalleryAccessProviderId, getEffectiveAuthProvider } from './extensionGalleryAccess.js';
import { ExtensionGalleryAccessKind, IExtensionGalleryAccessVerdict, IExtensionGalleryAccountService } from './extensionGalleryAccountService.js';

export class WorkbenchExtensionGalleryManifestService extends ExtensionGalleryManifestService implements IExtensionGalleryManifestService {

	private extensionGalleryManifest: IExtensionGalleryManifest | null = null;

	private _onDidChangeExtensionGalleryManifest = this._register(new Emitter<IExtensionGalleryManifest | null>());
	override readonly onDidChangeExtensionGalleryManifest = this._onDidChangeExtensionGalleryManifest.event;

	private currentStatus: ExtensionGalleryManifestStatus = ExtensionGalleryManifestStatus.Unavailable;
	override get extensionGalleryManifestStatus(): ExtensionGalleryManifestStatus { return this.currentStatus; }
	private _onDidChangeExtensionGalleryManifestStatus = this._register(new Emitter<ExtensionGalleryManifestStatus>());
	override readonly onDidChangeExtensionGalleryManifestStatus = this._onDidChangeExtensionGalleryManifestStatus.event;

	// Resolves which account may access the Private Marketplace and owns the durable verdict +
	// in-process service-index caches. Injected as a Delayed singleton, so the proxy only
	// instantiates the real service on first non-event access. It does not depend on
	// IAuthenticationService — that is connected post-startup by
	// ExtensionGalleryAccountAuthenticationContribution — so constructing it here cannot re-enter
	// this service.

	// Set once the private-marketplace path activates the account service; guards the config-change
	// handler below from instantiating it when no private marketplace was ever configured.
	private galleryAccountServiceActive = false;


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
		@IExtensionGalleryAccountService private readonly galleryAccountService: IExtensionGalleryAccountService,
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

		const configuredServiceUrl = this.configurationService.getValue<string>(ExtensionGalleryServiceUrlConfigKey);
		if (configuredServiceUrl) {
			this.logService.trace('[Marketplace] Private marketplace configured, checking access and fetching manifest', configuredServiceUrl);
			this.galleryAccountServiceActive = true;
			// Registered before the initial resolution below: that resolution may await a slow network
			// call, and a sign-out/switch during that window needs a live listener to supersede it.
			this._register(this.galleryAccountService.onDidChangeAccess(verdict => this.applyVerdict(verdict)));
			this.applyVerdict(await this.galleryAccountService.resolveAccess(configuredServiceUrl));
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
			if (this.galleryAccountServiceActive) {
				this.galleryAccountService.reset();
			}
			this.requestRestart();
		}));
	}

	// --- Status management ---

	/**
	 * Maps a resolved access verdict to manifest/status. An already-`Available` marketplace is never
	 * downgraded by a transient verdict.
	 */
	private applyVerdict(verdict: IExtensionGalleryAccessVerdict): void {
		switch (verdict.kind) {
			case ExtensionGalleryAccessKind.SignInRequired:
				this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
				return;
			case ExtensionGalleryAccessKind.Denied:
				this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
				return;
			case ExtensionGalleryAccessKind.Misconfigured:
				this.update(null, ExtensionGalleryManifestStatus.Misconfigured);
				return;
			case ExtensionGalleryAccessKind.Unreachable:
				if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
					this.update(null, ExtensionGalleryManifestStatus.Unreachable);
				}
				return;
			case ExtensionGalleryAccessKind.Available:
				if (this.currentStatus === ExtensionGalleryManifestStatus.Available) {
					return;
				}
				this.renderAvailable(verdict.manifest);
				return;
		}
	}

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
