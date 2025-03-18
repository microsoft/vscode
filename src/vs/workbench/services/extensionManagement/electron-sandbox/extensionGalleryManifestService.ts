/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IHeaders } from '../../../../base/parts/request/common/request.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IExtensionGalleryManifestService, IExtensionGalleryManifest } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
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
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';

export class WorkbenchExtensionGalleryManifestService extends ExtensionGalleryManifestService implements IExtensionGalleryManifestService {

	private readonly commonHeadersPromise: Promise<IHeaders>;

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

	private extensionGalleryManifestPromise: Promise<IExtensionGalleryManifest | null> | undefined;
	override getExtensionGalleryManifest(): Promise<IExtensionGalleryManifest | null> {
		if (!this.extensionGalleryManifestPromise) {
			if (this.productService.quality !== 'stable') {
				const configuredServiceUrl = this.configurationService.inspect<string>('extensions.gallery.serviceUrl').userLocalValue;
				if (configuredServiceUrl) {
					this.extensionGalleryManifestPromise = this.getExtensionGalleryManifestFromServiceUrl(configuredServiceUrl);
				}
			}
		}
		if (!this.extensionGalleryManifestPromise) {
			this.extensionGalleryManifestPromise = super.getExtensionGalleryManifest();
		}
		return this.extensionGalleryManifestPromise;
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
			this.logService.error(error);
			throw error;
		}
	}
}

registerSingleton(IExtensionGalleryManifestService, WorkbenchExtensionGalleryManifestService, InstantiationType.Delayed);
