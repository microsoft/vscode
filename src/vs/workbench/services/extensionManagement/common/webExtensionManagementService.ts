/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionType, IExtensionIdentifier, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { IExtensionManagementService, ILocalExtension, IGalleryExtension, IGalleryMetadata, InstallOperation, IExtensionGalleryService, InstallOptions, TargetPlatform } from 'vs/platform/extensionManagement/common/extensionManagement';
import { URI } from 'vs/base/common/uri';
import { areSameExtensions, getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IScannedExtension, IWebExtensionsScannerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';
import { AbstractExtensionManagementService, AbstractExtensionTask, IInstallExtensionTask, IUninstallExtensionTask, UninstallExtensionTaskOptions } from 'vs/platform/extensionManagement/common/abstractExtensionManagementService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IProductService } from 'vs/platform/product/common/productService';

type Metadata = Partial<IGalleryMetadata & { isMachineScoped: boolean; }>;

export class WebExtensionManagementService extends AbstractExtensionManagementService implements IExtensionManagementService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
		@IWebExtensionsScannerService private readonly webExtensionsScannerService: IWebExtensionsScannerService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IProductService productService: IProductService
	) {
		super(extensionGalleryService, telemetryService, logService, productService);
	}

	async getTargetPlatform(): Promise<TargetPlatform> {
		return TargetPlatform.WEB;
	}

	override async canInstall(gallery: IGalleryExtension): Promise<boolean> {
		if (await super.canInstall(gallery)) {
			return true;
		}
		if (this.isConfiguredToExecuteOnWeb(gallery)) {
			return true;
		}
		return false;
	}

	async getInstalled(type?: ExtensionType, donotIgnoreInvalidExtensions?: boolean): Promise<ILocalExtension[]> {
		const extensions = [];
		if (type === undefined || type === ExtensionType.System) {
			const systemExtensions = await this.webExtensionsScannerService.scanSystemExtensions();
			extensions.push(...systemExtensions);
		}
		if (type === undefined || type === ExtensionType.User) {
			const userExtensions = await this.webExtensionsScannerService.scanUserExtensions(donotIgnoreInvalidExtensions);
			extensions.push(...userExtensions);
		}
		return Promise.all(extensions.map(e => toLocalExtension(e)));
	}

	async install(location: URI, options: InstallOptions = {}): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#install', location.toString());
		const manifest = await this.webExtensionsScannerService.scanExtensionManifest(location);
		if (!manifest) {
			throw new Error(`Cannot find packageJSON from the location ${location.toString()}`);
		}
		return this.installExtension(manifest, location, options);
	}

	protected override async getCompatibleVersion(extension: IGalleryExtension, fetchCompatibleVersion: boolean): Promise<IGalleryExtension | null> {
		const compatibleExtension = await super.getCompatibleVersion(extension, fetchCompatibleVersion);
		if (compatibleExtension) {
			return compatibleExtension;
		}
		if (this.isConfiguredToExecuteOnWeb(extension)) {
			return extension;
		}
		return null;
	}

	private isConfiguredToExecuteOnWeb(gallery: IGalleryExtension): boolean {
		const configuredExtensionKind = this.extensionManifestPropertiesService.getUserConfiguredExtensionKind(gallery.identifier);
		return !!configuredExtensionKind && configuredExtensionKind.includes('web');
	}

	async updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> {
		return local;
	}

	protected createInstallExtensionTask(manifest: IExtensionManifest, extension: URI | IGalleryExtension, options: InstallOptions): IInstallExtensionTask {
		return new InstallExtensionTask(manifest, extension, options, this.webExtensionsScannerService);
	}

	protected createUninstallExtensionTask(extension: ILocalExtension, options: UninstallExtensionTaskOptions): IUninstallExtensionTask {
		return new UninstallExtensionTask(extension, options, this.webExtensionsScannerService);
	}

	zip(extension: ILocalExtension): Promise<URI> { throw new Error('unsupported'); }
	unzip(zipLocation: URI): Promise<IExtensionIdentifier> { throw new Error('unsupported'); }
	getManifest(vsix: URI): Promise<IExtensionManifest> { throw new Error('unsupported'); }
	updateExtensionScope(): Promise<ILocalExtension> { throw new Error('unsupported'); }
}

function toLocalExtension(extension: IScannedExtension): ILocalExtension {
	const metadata = getMetadata(undefined, extension);
	return {
		...extension,
		identifier: { id: extension.identifier.id, uuid: metadata.id },
		isMachineScoped: !!metadata.isMachineScoped,
		publisherId: metadata.publisherId || null,
		publisherDisplayName: metadata.publisherDisplayName || null,
	};
}

function getMetadata(options?: InstallOptions, existingExtension?: IScannedExtension): Metadata {
	const metadata: Metadata = { ...(existingExtension?.metadata || {}) };
	metadata.isMachineScoped = options?.isMachineScoped || metadata.isMachineScoped;
	return metadata;
}

class InstallExtensionTask extends AbstractExtensionTask<ILocalExtension> implements IInstallExtensionTask {

	readonly identifier: IExtensionIdentifier;
	readonly source: URI | IGalleryExtension;
	private _operation = InstallOperation.Install;
	get operation() { return this._operation; }

	constructor(
		manifest: IExtensionManifest,
		private readonly extension: URI | IGalleryExtension,
		private readonly options: InstallOptions,
		private readonly webExtensionsScannerService: IWebExtensionsScannerService,
	) {
		super();
		this.identifier = URI.isUri(extension) ? { id: getGalleryExtensionId(manifest.publisher, manifest.name) } : extension.identifier;
		this.source = extension;
	}

	protected async doRun(token: CancellationToken): Promise<ILocalExtension> {
		const userExtensions = await this.webExtensionsScannerService.scanUserExtensions();
		const existingExtension = userExtensions.find(e => areSameExtensions(e.identifier, this.identifier));
		if (existingExtension) {
			this._operation = InstallOperation.Update;
		}

		const metadata = getMetadata(this.options, existingExtension);
		if (!URI.isUri(this.extension)) {
			metadata.id = this.extension.identifier.uuid;
			metadata.publisherDisplayName = this.extension.publisherDisplayName;
			metadata.publisherId = this.extension.publisherId;
		}

		const scannedExtension = URI.isUri(this.extension) ? await this.webExtensionsScannerService.addExtension(this.extension, metadata)
			: await this.webExtensionsScannerService.addExtensionFromGallery(this.extension, metadata);
		return toLocalExtension(scannedExtension);
	}
}

class UninstallExtensionTask extends AbstractExtensionTask<void> implements IUninstallExtensionTask {

	constructor(
		readonly extension: ILocalExtension,
		options: UninstallExtensionTaskOptions,
		private readonly webExtensionsScannerService: IWebExtensionsScannerService,
	) {
		super();
	}

	protected doRun(token: CancellationToken): Promise<void> {
		return this.webExtensionsScannerService.removeExtension(this.extension.identifier);
	}
}
