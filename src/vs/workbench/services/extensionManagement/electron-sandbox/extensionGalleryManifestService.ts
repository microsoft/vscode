/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { IHeaders } from '../../../../base/parts/request/common/request.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IExtensionGalleryManifestService, IExtensionGalleryManifest, ExtensionGalleryServiceUrlConfigKey } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { ExtensionGalleryManifestService as ExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifestService.js';
import { resolveMarketplaceHeaders } from '../../../../platform/externalServices/common/marketplace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-sandbox/services.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IDefaultAccount, IDefaultAccountService } from '../../accounts/common/defaultAccount.js';
import { IHostService } from '../../host/browser/host.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';

export class WorkbenchExtensionGalleryManifestService extends ExtensionGalleryManifestService implements IExtensionGalleryManifestService {

	private readonly commonHeadersPromise: Promise<IHeaders>;
	private extensionGalleryManifest: [string, IExtensionGalleryManifest] | null = null;

	private _onDidChangeExtensionGalleryManifest = this._register(new Emitter<IExtensionGalleryManifest | null>());
	override readonly onDidChangeExtensionGalleryManifest = this._onDidChangeExtensionGalleryManifest.event;

	constructor(
		@IProductService productService: IProductService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
		@ILogService private readonly logService: ILogService,
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
		this.getExtensionGalleryManifest().then(manifest => {
			channels.forEach(channel => channel.call('setExtensionGalleryManifest', [manifest]));
			this._register(this.onDidChangeExtensionGalleryManifest(manifest => channels.forEach(channel => channel.call('setExtensionGalleryManifest', [manifest]))));
		});
	}

	private extensionGalleryManifestPromise: Promise<void> | undefined;
	override async getExtensionGalleryManifest(): Promise<IExtensionGalleryManifest | null> {
		if (!this.extensionGalleryManifestPromise) {
			this.extensionGalleryManifestPromise = this.doGetExtensionGalleryManifest();
		}
		await this.extensionGalleryManifestPromise;
		return this.extensionGalleryManifest ? this.extensionGalleryManifest[1] : null;
	}

	private async doGetExtensionGalleryManifest(): Promise<void> {
		const defaultServiceUrl = this.productService.extensionsGallery?.serviceUrl;
		if (!defaultServiceUrl) {
			this.extensionGalleryManifest = null;
			return;
		}

		const configuredServiceUrl = this.configurationService.getValue<string>(ExtensionGalleryServiceUrlConfigKey);
		if (configuredServiceUrl && this.checkAccess(await this.defaultAccountService.getDefaultAccount())) {
			this.extensionGalleryManifest = [configuredServiceUrl, await this.getExtensionGalleryManifestFromServiceUrl(configuredServiceUrl)];
		}

		if (!this.extensionGalleryManifest) {
			const defaultExtensionGalleryManifest = await super.getExtensionGalleryManifest();
			if (defaultExtensionGalleryManifest) {
				this.extensionGalleryManifest = [defaultServiceUrl, defaultExtensionGalleryManifest];
			}
		}

		this._register(this.defaultAccountService.onDidChangeDefaultAccount(account => {
			if (!configuredServiceUrl) {
				return;
			}
			const canAccess = this.checkAccess(account);
			if (canAccess && this.extensionGalleryManifest?.[0] === configuredServiceUrl) {
				return;
			}
			if (!canAccess && this.extensionGalleryManifest?.[0] === defaultServiceUrl) {
				return;
			}
			this.extensionGalleryManifest = null;
			this._onDidChangeExtensionGalleryManifest.fire(null);
			this.requestRestart();
		}));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration(ExtensionGalleryServiceUrlConfigKey)) {
				return;
			}
			const configuredServiceUrl = this.configurationService.getValue<string>(ExtensionGalleryServiceUrlConfigKey);
			if (!configuredServiceUrl && this.extensionGalleryManifest?.[0] === defaultServiceUrl) {
				return;
			}
			if (configuredServiceUrl && this.extensionGalleryManifest?.[0] === configuredServiceUrl) {
				return;
			}
			this.extensionGalleryManifest = null;
			this._onDidChangeExtensionGalleryManifest.fire(null);
			this.requestRestart();
		}));
	}

	private checkAccess(account: IDefaultAccount | null): boolean {
		if (!account) {
			this.logService.debug('[Marketplace] Checking account access for configured gallery: No account found');
			return false;
		}
		this.logService.debug('[Marketplace] Checking Account SKU access for configured gallery', account.access_type_sku);
		if (account.access_type_sku && this.productService.extensionsGallery?.accessSKUs?.includes(account.access_type_sku)) {
			this.logService.debug('[Marketplace] Account has access to configured gallery');
			return true;
		}
		this.logService.debug('[Marketplace] Checking enterprise account access for configured gallery', account.enterprise);
		return account.enterprise;
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
