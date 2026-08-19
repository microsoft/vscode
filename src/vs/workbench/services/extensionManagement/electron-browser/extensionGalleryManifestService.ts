/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IHeaders, IRequestContext } from '../../../../base/parts/request/common/request.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IExtensionGalleryManifestService, IExtensionGalleryManifest, ExtensionGalleryServiceUrlConfigKey, ExtensionGalleryAuthProviderConfigKey, ExtensionGalleryManifestStatus } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { ExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifestService.js';
import { resolveMarketplaceHeaders } from '../../../../platform/externalServices/common/marketplace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, asText, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../host/browser/host.js';
import { MarketplaceAuthRequiredError, MarketplaceClientRejectedError } from './extensionGalleryAccess.js';
import { ExtensionGalleryAccountStatus, IExtensionGalleryAccountService } from './extensionGalleryAccountService.js';

export class WorkbenchExtensionGalleryManifestService extends ExtensionGalleryManifestService implements IExtensionGalleryManifestService {

	private readonly commonHeadersPromise: Promise<IHeaders>;
	private extensionGalleryManifest: IExtensionGalleryManifest | null = null;

	private _onDidChangeExtensionGalleryManifest = this._register(new Emitter<IExtensionGalleryManifest | null>());
	override readonly onDidChangeExtensionGalleryManifest = this._onDidChangeExtensionGalleryManifest.event;

	private currentStatus: ExtensionGalleryManifestStatus = ExtensionGalleryManifestStatus.Unavailable;
	override get extensionGalleryManifestStatus(): ExtensionGalleryManifestStatus { return this.currentStatus; }
	private _onDidChangeExtensionGalleryManifestStatus = this._register(new Emitter<ExtensionGalleryManifestStatus>());
	override readonly onDidChangeExtensionGalleryManifestStatus = this._onDidChangeExtensionGalleryManifestStatus.event;

	private readonly resolutionTokenSource = this._register(new MutableDisposable<CancellationTokenSource>());

	constructor(
		@IProductService productService: IProductService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
		@IExtensionGalleryAccountService private readonly galleryAccountService: IExtensionGalleryAccountService,
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
			// Registered before the first resolution: it may await a slow index fetch, and a sign-out
			// during that window still has to supersede it.
			this._register(this.galleryAccountService.onDidChangeAccount(() => this.resolve(configuredServiceUrl)));
			await this.resolve(configuredServiceUrl);
		} else {
			const defaultExtensionGalleryManifest = await super.getExtensionGalleryManifest();
			this.update(defaultExtensionGalleryManifest);
		}

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration(ExtensionGalleryServiceUrlConfigKey)
				&& !e.affectsConfiguration(ExtensionGalleryAuthProviderConfigKey)) {
				return;
			}
			this.requestRestart();
		}));
	}

	private async resolve(configuredServiceUrl: string): Promise<void> {
		const token = this.beginResolution();
		try {
			const account = await this.galleryAccountService.getAccount();
			if (token.isCancellationRequested) {
				return;
			}
			if (!account) {
				this.applyNoAccount();
				return;
			}
			if (this.galleryAccountService.accountStatus === ExtensionGalleryAccountStatus.Ineligible) {
				this.logService.debug('[Marketplace] User signed in but lacks access to private marketplace');
				this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
				return;
			}
			if (account.accessToken && !isHttpsUrl(configuredServiceUrl)) {
				this.logService.error('[Marketplace] Refusing to send the Microsoft token to a non-HTTPS service index URL.');
				this.update(null, ExtensionGalleryManifestStatus.Misconfigured);
				return;
			}
			const manifest = await this.getExtensionGalleryManifestFromServiceUrl(configuredServiceUrl, token, account.accessToken);
			if (token.isCancellationRequested) {
				return;
			}
			this.setAvailable(manifest);
		} catch (error) {
			if (!token.isCancellationRequested) {
				this.applyFetchError(error);
			}
		}
	}

	private applyNoAccount(): void {
		// A transient auth failure is not a sign-out, so it must not demand sign-in.
		if (this.galleryAccountService.accountStatus === ExtensionGalleryAccountStatus.Unknown) {
			if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
				this.update(null, ExtensionGalleryManifestStatus.Unreachable);
			}
			return;
		}
		this.logService.debug('[Marketplace] Private marketplace configured but user not signed in');
		this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
	}

	private applyFetchError(error: unknown): void {
		// A rejection by the server is durable, so retrying cannot help. Anything else is transient and
		// must not downgrade a marketplace that is already available.
		if (error instanceof MarketplaceAuthRequiredError || error instanceof MarketplaceClientRejectedError) {
			this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
			return;
		}
		this.logService.error('[Marketplace] Error validating marketplace access', error);
		if (this.currentStatus !== ExtensionGalleryManifestStatus.Available) {
			this.update(null, ExtensionGalleryManifestStatus.Unreachable);
		}
	}

	// Cancels the previous generation so a superseded result can never publish a stale manifest.
	private beginResolution(): CancellationToken {
		this.resolutionTokenSource.value?.cancel();
		const source = new CancellationTokenSource();
		this.resolutionTokenSource.value = source;
		return source.token;
	}

	private setAvailable(manifest: IExtensionGalleryManifest): void {
		// Published unconditionally: the catalog is account-scoped, so switching to a different
		// eligible account has to replace it rather than keep the previous account's.
		const wasAvailable = this.currentStatus === ExtensionGalleryManifestStatus.Available;
		this.update(manifest);
		if (wasAvailable) {
			return;
		}
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

	private async getExtensionGalleryManifestFromServiceUrl(url: string, token: CancellationToken, accessToken?: string): Promise<IExtensionGalleryManifest> {
		const commonHeaders = await this.commonHeadersPromise;
		const headers: IHeaders = {
			...commonHeaders,
			'Content-Type': 'application/json',
			'Accept-Encoding': 'gzip',
		};
		if (accessToken) {
			headers['Authorization'] = `Bearer ${accessToken}`;
		}

		try {
			const context = await this.requestService.request({
				type: 'GET',
				url,
				headers,
				// Never follow a redirect while a bearer is attached: the request service would forward
				// the Authorization header to the target, possibly a different origin.
				followRedirects: accessToken ? 0 : undefined,
				callSite: 'extensionGalleryManifestService.fetchManifest'
			}, token);

			const statusCode = context.res.statusCode;
			if (statusCode === 401 || statusCode === 403) {
				throw new MarketplaceAuthRequiredError(statusCode);
			}
			if (statusCode && (statusCode < 200 || statusCode >= 300)) {
				const detail = await this.readErrorDetail(context);
				const message = `Service index returned status ${statusCode}${detail ? `: ${detail}` : ''}`;
				if (statusCode >= 400 && statusCode < 500) {
					throw new MarketplaceClientRejectedError(statusCode, message);
				}
				throw new Error(message);
			}

			const extensionGalleryManifest = await asJson<IExtensionGalleryManifest>(context);

			if (!extensionGalleryManifest) {
				throw new Error('Unable to retrieve extension gallery manifest.');
			}

			// Valid JSON is not necessarily a service index (a captive-portal page parses fine). Reject
			// here so it counts as a failed fetch instead of throwing later during endpoint discovery.
			if (!Array.isArray(extensionGalleryManifest.resources)
				|| !extensionGalleryManifest.resources.every(resource => resource && typeof resource.id === 'string' && typeof resource.type === 'string')) {
				throw new Error('Service index response is not a valid extension gallery manifest.');
			}

			return extensionGalleryManifest;
		} catch (error) {
			if (error instanceof MarketplaceAuthRequiredError) {
				this.logService.trace('[Marketplace] Extension gallery manifest requires authentication', error.statusCode);
			} else {
				this.logService.error('[Marketplace] Error retrieving extension gallery manifest', error);
			}
			throw error;
		}
	}

	private async readErrorDetail(context: IRequestContext): Promise<string | undefined> {
		try {
			const text = await asText(context);
			const trimmed = text?.trim();
			if (!trimmed) {
				return undefined;
			}
			return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
		} catch {
			return undefined;
		}
	}
}

function isHttpsUrl(url: string): boolean {
	try {
		return URI.parse(url, true).scheme === 'https';
	} catch {
		return false;
	}
}

registerSingleton(IExtensionGalleryManifestService, WorkbenchExtensionGalleryManifestService, InstantiationType.Eager);