/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionType, IExtensionIdentifier, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { IExtensionManagementService, ILocalExtension, InstallExtensionEvent, DidInstallExtensionEvent, DidUninstallExtensionEvent, IGalleryExtension, IReportedExtension, IGalleryMetadata, InstallOperation, IExtensionGalleryService, ExtensionManagementError, INSTALL_ERROR_INCOMPATIBLE, InstallOptions } from 'vs/platform/extensionManagement/common/extensionManagement';
import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { areSameExtensions, getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IScannedExtension, IWebExtensionsScannerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IProductService } from 'vs/platform/product/common/productService';

type Metadata = {
	isMachineScoped?: boolean;
};

export class WebExtensionManagementService extends Disposable implements IExtensionManagementService {

	declare readonly _serviceBrand: undefined;

	private readonly _onInstallExtension = this._register(new Emitter<InstallExtensionEvent>());
	readonly onInstallExtension: Event<InstallExtensionEvent> = this._onInstallExtension.event;

	private readonly _onDidInstallExtension = this._register(new Emitter<DidInstallExtensionEvent>());
	readonly onDidInstallExtension: Event<DidInstallExtensionEvent> = this._onDidInstallExtension.event;

	private readonly _onUninstallExtension = this._register(new Emitter<IExtensionIdentifier>());
	readonly onUninstallExtension: Event<IExtensionIdentifier> = this._onUninstallExtension.event;

	private _onDidUninstallExtension = this._register(new Emitter<DidUninstallExtensionEvent>());
	onDidUninstallExtension: Event<DidUninstallExtensionEvent> = this._onDidUninstallExtension.event;

	constructor(
		@IWebExtensionsScannerService private readonly webExtensionsScannerService: IWebExtensionsScannerService,
		@ILogService private readonly logService: ILogService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IProductService private readonly productService: IProductService,
	) {
		super();
	}

	async getInstalled(type?: ExtensionType): Promise<ILocalExtension[]> {
		const extensions = [];
		if (type === undefined || type === ExtensionType.System) {
			const systemExtensions = await this.webExtensionsScannerService.scanSystemExtensions();
			extensions.push(...systemExtensions);
		}
		if (type === undefined || type === ExtensionType.User) {
			const userExtensions = await this.webExtensionsScannerService.scanUserExtensions();
			extensions.push(...userExtensions);
		}
		return Promise.all(extensions.map(e => this.toLocalExtension(e)));
	}

	async canInstall(gallery: IGalleryExtension): Promise<boolean> {
		const compatibleExtension = await this.extensionGalleryService.getCompatibleExtension(gallery);
		if (!compatibleExtension) {
			return false;
		}
		const manifest = await this.extensionGalleryService.getManifest(compatibleExtension, CancellationToken.None);
		if (!manifest) {
			return false;
		}
		if (!this.extensionManifestPropertiesService.canExecuteOnWeb(manifest)) {
			return false;
		}
		return true;
	}

	async install(location: URI, installOptions?: InstallOptions): Promise<ILocalExtension> {
		const manifest = await this.webExtensionsScannerService.scanExtensionManifest(location);
		if (!manifest) {
			throw new Error(`Cannot find packageJSON from the location ${location.toString()}`);
		}

		const identifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name) };
		this.logService.info('Installing extension:', identifier.id);
		this._onInstallExtension.fire({ identifier: identifier });

		try {
			const userExtensions = await this.webExtensionsScannerService.scanUserExtensions();
			const existingExtension = userExtensions.find(e => areSameExtensions(e.identifier, identifier));
			const metadata = this.getMetadata(installOptions, existingExtension);

			const extension = await this.webExtensionsScannerService.addExtension(location, metadata);
			const local = this.toLocalExtension(extension);
			this._onDidInstallExtension.fire({ local, identifier: extension.identifier, operation: InstallOperation.Install });
			return local;
		} catch (error) {
			this._onDidInstallExtension.fire({ error, identifier, operation: InstallOperation.Install });
			throw error;
		}
	}

	async installFromGallery(gallery: IGalleryExtension, installOptions?: InstallOptions): Promise<ILocalExtension> {
		this.logService.info('Installing extension:', gallery.identifier.id);
		this._onInstallExtension.fire({ identifier: gallery.identifier, gallery });
		try {
			const compatibleExtension = await this.extensionGalleryService.getCompatibleExtension(gallery);
			if (!compatibleExtension) {
				throw new ExtensionManagementError(localize('notFoundCompatibleDependency', "Unable to install '{0}' extension because it is not compatible with the current version of VS Code (version {1}).", gallery.identifier.id, this.productService.version), INSTALL_ERROR_INCOMPATIBLE);
			}
			const userExtensions = await this.webExtensionsScannerService.scanUserExtensions();
			const existingExtension = userExtensions.find(e => areSameExtensions(e.identifier, compatibleExtension.identifier));
			const metadata = this.getMetadata(installOptions, existingExtension);

			const scannedExtension = await this.webExtensionsScannerService.addExtensionFromGallery(compatibleExtension, metadata);
			const local = this.toLocalExtension(scannedExtension);
			this._onDidInstallExtension.fire({ local, identifier: compatibleExtension.identifier, operation: InstallOperation.Install, gallery: compatibleExtension });
			return local;
		} catch (error) {
			this._onDidInstallExtension.fire({ error, identifier: gallery.identifier, operation: InstallOperation.Install, gallery });
			throw error;
		}
	}

	async uninstall(extension: ILocalExtension): Promise<void> {
		this._onUninstallExtension.fire(extension.identifier);
		try {
			await this.webExtensionsScannerService.removeExtension(extension.identifier);
			this._onDidUninstallExtension.fire({ identifier: extension.identifier });
		} catch (error) {
			this.logService.error(error);
			this._onDidUninstallExtension.fire({ error, identifier: extension.identifier });
			throw error;
		}
	}

	async updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> {
		return local;
	}

	private toLocalExtension(extension: IScannedExtension): ILocalExtension {
		const metadata = this.getMetadata(undefined, extension);
		return {
			...extension,
			isMachineScoped: !!metadata.isMachineScoped,
			publisherId: null,
			publisherDisplayName: null,
		};
	}

	private getMetadata(options?: InstallOptions, existingExtension?: IScannedExtension): Metadata {
		const metadata: Metadata = {};
		const existingExtensionMetadata: Metadata = existingExtension?.metadata || {};
		metadata.isMachineScoped = options?.isMachineScoped || existingExtensionMetadata.isMachineScoped;
		return metadata;
	}

	zip(extension: ILocalExtension): Promise<URI> { throw new Error('unsupported'); }
	unzip(zipLocation: URI): Promise<IExtensionIdentifier> { throw new Error('unsupported'); }
	getManifest(vsix: URI): Promise<IExtensionManifest> { throw new Error('unsupported'); }
	reinstallFromGallery(extension: ILocalExtension): Promise<void> { throw new Error('unsupported'); }
	getExtensionsReport(): Promise<IReportedExtension[]> { throw new Error('unsupported'); }
	updateExtensionScope(): Promise<ILocalExtension> { throw new Error('unsupported'); }
}
