/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IHeaders } from '../../../../base/parts/request/common/request.js';
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
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../host/browser/host.js';
import { ExtensionGalleryAccountStatus, IExtensionGalleryAccountService } from '../common/extensionGalleryAccount.js';

type ExtensionGalleryManifestResponse = Omit<IExtensionGalleryManifest, 'version' | 'capabilities'> & {
	readonly version?: string;
	readonly capabilities: Pick<IExtensionGalleryManifest['capabilities'], 'extensionQuery'>;
};

type ExtensionQueryCapabilityValue = NonNullable<IExtensionGalleryManifest['capabilities']['extensionQuery']['filtering']>[number];

function isExtensionQueryCapabilityValue(candidate: unknown): candidate is ExtensionQueryCapabilityValue {
	const value = candidate as Partial<ExtensionQueryCapabilityValue> | null;
	return typeof value?.name === 'string' && typeof value.value === 'number';
}

function isExtensionQueryCapabilityValues(candidate: unknown): candidate is readonly ExtensionQueryCapabilityValue[] | undefined {
	return candidate === undefined || (Array.isArray(candidate) && candidate.every(isExtensionQueryCapabilityValue));
}

function isExtensionGalleryManifestResponse(candidate: unknown): candidate is ExtensionGalleryManifestResponse {
	const manifest = candidate as Partial<ExtensionGalleryManifestResponse> | null;
	const extensionQuery = manifest?.capabilities?.extensionQuery;

	return (manifest?.version === undefined || typeof manifest.version === 'string')
		&& Array.isArray(manifest?.resources)
		&& manifest.resources.every(resource => resource && typeof resource.id === 'string' && typeof resource.type === 'string')
		&& typeof extensionQuery === 'object'
		&& extensionQuery !== null
		&& isExtensionQueryCapabilityValues(extensionQuery.filtering)
		&& isExtensionQueryCapabilityValues(extensionQuery.sorting)
		&& isExtensionQueryCapabilityValues(extensionQuery.flags);
}

class MarketplaceAuthRequiredError extends Error {
	constructor() {
		super('Marketplace requires authentication.');
	}
}

export class WorkbenchExtensionGalleryManifestService extends ExtensionGalleryManifestService implements IExtensionGalleryManifestService {

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
		@IStorageService storageService: IStorageService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
		@IExtensionGalleryAccountService private readonly galleryAccountService: IExtensionGalleryAccountService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
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

		const channels = [{ name: 'shared process', channel: sharedProcessService.getChannel('extensionGalleryManifest') }];
		const remoteConnection = remoteAgentService.getConnection();
		if (remoteConnection) {
			channels.push({ name: 'remote server', channel: remoteConnection.getChannel('extensionGalleryManifest') });
		}
		const updateChannels = (manifest: IExtensionGalleryManifest | null) => {
			this.logService.trace(`[Marketplace] Updating channels with manifest ${manifest ? 'available' : 'unavailable'}`);
			for (const { name, channel } of channels) {
				try {
					channel.call('setExtensionGalleryManifest', [manifest, this.extensionGalleryAccessToken, this.extensionGalleryServiceIndexUrl])
						.catch(error => this.logService.error(`[Marketplace] Unable to update marketplace manifest in the ${name}`, error));
				} catch (error) {
					this.logService.error(`[Marketplace] Unable to update marketplace manifest in the ${name}`, error);
				}
			}
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
			this._register(this.galleryAccountService.onDidChangeAccount(() => this.handleMarketplaceAccountAccess(configuredServiceUrl)));
			await this.handleMarketplaceAccountAccess(configuredServiceUrl);
		} else {
			const defaultExtensionGalleryManifest = await super.getExtensionGalleryManifest();
			this.update(defaultExtensionGalleryManifest);
		}

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ExtensionGalleryServiceUrlConfigKey)) {
				this.requestRestart(localize('extensionGalleryManifestService.accountChange', "{0} is now configured to a different Marketplace. Please restart to apply the changes.", this.productService.nameLong));
			} else if (e.affectsConfiguration(ExtensionGalleryAuthProviderConfigKey)) {
				this.requestRestart(localize('extensionGalleryManifestService.configurationChange', "The Extensions Marketplace configuration has changed. Please restart to apply the changes."));
			}
		}));
	}

	private readonly resolutionTokenSource = this._register(new MutableDisposable<CancellationTokenSource>());
	private beginResolution(): CancellationToken {
		this.resolutionTokenSource.value?.cancel();
		const source = new CancellationTokenSource();
		this.resolutionTokenSource.value = source;
		return source.token;
	}

	private async handleMarketplaceAccountAccess(configuredServiceUrl: string): Promise<void> {
		const token = this.beginResolution();
		try {
			const account = await this.galleryAccountService.getAccount(configuredServiceUrl);
			if (token.isCancellationRequested) {
				return;
			}
			const accountStatus = this.galleryAccountService.accountStatus;
			if (accountStatus === ExtensionGalleryAccountStatus.Unknown
				&& this.currentStatus === ExtensionGalleryManifestStatus.Available) {
				return;
			}

			switch (accountStatus) {
				case ExtensionGalleryAccountStatus.Unknown:
					this.logService.debug('[Marketplace] User signed in but account status is unknown');
					this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
					return;
				case ExtensionGalleryAccountStatus.Ineligible:
					this.logService.debug('[Marketplace] User signed in but lacks access to private marketplace');
					this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
					return;
				case ExtensionGalleryAccountStatus.SignedOut:
					this.logService.debug('[Marketplace] User signed out');
					this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
					return;
				case ExtensionGalleryAccountStatus.Eligible:
					try {
						const manifest = await this.getExtensionGalleryManifestFromServiceUrl(configuredServiceUrl, account?.accessToken, token);
						if (token.isCancellationRequested) {
							return;
						}
						this.update(manifest, undefined, account?.accessToken, configuredServiceUrl);
						this.telemetryService.publicLog2<
							{},
							{
								owner: 'sandy081';
								comment: 'Reports when a user successfully accesses a custom marketplace';
							}>('galleryservice:custom:marketplace');
					} catch (error) {
						if (token.isCancellationRequested) {
							return;
						}
						if (error instanceof MarketplaceAuthRequiredError) {
							this.logService.debug('[Marketplace] Marketplace still requires authentication for the resolved account');
							this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
							return;
						}
						this.logService.error('[Marketplace] Error fetching manifest from custom marketplace', error);
						this.update(null, ExtensionGalleryManifestStatus.AccessDenied);
					}
					return;
			}
		} catch (error) {
			if (token.isCancellationRequested) {
				return;
			}
			this.logService.error('[Marketplace] Error handling marketplace account access', error);
			this.update(null, ExtensionGalleryManifestStatus.RequiresSignIn);
		}
	}

	private update(manifest: IExtensionGalleryManifest | null, status?: ExtensionGalleryManifestStatus, accessToken?: string, serviceIndexUrl?: string): void {
		this.logService.debug(`[Marketplace] Updating manifest ${manifest ? 'available' : 'unavailable'}`);
		this.setAuthorization(manifest ? accessToken : undefined, manifest ? serviceIndexUrl : undefined);
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

	private async requestRestart(message: string): Promise<void> {
		const confirmation = await this.dialogService.confirm({
			message,
			primaryButton: localize({ key: 'restart', comment: ['&& denotes a mnemonic'] }, "&&Restart")
		});
		if (confirmation.confirmed) {
			return this.hostService.restart();
		}
	}

	private async getExtensionGalleryManifestFromServiceUrl(url: string, accessToken: string | undefined, token: CancellationToken): Promise<IExtensionGalleryManifest> {
		const commonHeaders = await this.commonHeadersPromise;
		const headers: IHeaders = {
			...commonHeaders,
			...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
			'Content-Type': 'application/json',
			'Accept-Encoding': 'gzip',
		};

		try {
			const context = await this.requestService.request({
				type: 'GET',
				url,
				headers,
				callSite: 'extensionGalleryManifestService.fetchManifest'
			}, token);

			// The expected first exchange with a gated marketplace, not a failure.
			const statusCode = context.res.statusCode;
			if (statusCode === 401 || statusCode === 403) {
				throw new MarketplaceAuthRequiredError();
			}

			const extensionGalleryManifest = await asJson<unknown>(context);

			if (!extensionGalleryManifest) {
				throw new Error('Unable to retrieve extension gallery manifest.');
			}

			if (!isExtensionGalleryManifestResponse(extensionGalleryManifest)) {
				throw new Error('Service index response is not a valid extension gallery manifest.');
			}

			return {
				...extensionGalleryManifest,
				version: extensionGalleryManifest.version ?? '',
			};
		} catch (error) {
			if (error instanceof MarketplaceAuthRequiredError) {
				throw error;
			}
			this.logService.error('[Marketplace] Error retrieving extension gallery manifest', error);
			throw error;
		}
	}
}

registerSingleton(IExtensionGalleryManifestService, WorkbenchExtensionGalleryManifestService, InstantiationType.Eager);
