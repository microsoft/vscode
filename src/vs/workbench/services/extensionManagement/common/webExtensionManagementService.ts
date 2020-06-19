/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionType, IExtensionIdentifier, IExtensionManifest, IScannedExtension } from 'vs/platform/extensions/common/extensions';
import { IExtensionManagementService, ILocalExtension, InstallExtensionEvent, DidInstallExtensionEvent, DidUninstallExtensionEvent, IGalleryExtension, IReportedExtension, IGalleryMetadata } from 'vs/platform/extensionManagement/common/extensionManagement';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IRequestService, isSuccess, asText } from 'vs/platform/request/common/request';
import { CancellationToken } from 'vs/base/common/cancellation';
import { localizeManifest } from 'vs/platform/extensionManagement/common/extensionNls';
import { getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IWebExtensionsScannerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';

export class WebExtensionManagementService implements IExtensionManagementService {

	declare readonly _serviceBrand: undefined;

	onInstallExtension: Event<InstallExtensionEvent> = Event.None;
	onDidInstallExtension: Event<DidInstallExtensionEvent> = Event.None;
	onUninstallExtension: Event<IExtensionIdentifier> = Event.None;
	onDidUninstallExtension: Event<DidUninstallExtensionEvent> = Event.None;

	constructor(
		@IWebExtensionsScannerService private readonly webExtensionsScannerService: IWebExtensionsScannerService,
		@IRequestService private readonly requestService: IRequestService,
	) {
	}

	async getInstalled(type?: ExtensionType): Promise<ILocalExtension[]> {
		const extensions = await this.webExtensionsScannerService.scanExtensions(type);
		return Promise.all(extensions.map(e => this.toLocalExtension(e)));
	}

	private async toLocalExtension(scannedExtension: IScannedExtension): Promise<ILocalExtension> {
		let manifest = scannedExtension.packageJSON;
		if (scannedExtension.packageNLSUrl) {
			try {
				const context = await this.requestService.request({ type: 'GET', url: scannedExtension.packageNLSUrl.toString() }, CancellationToken.None);
				if (isSuccess(context)) {
					const content = await asText(context);
					if (content) {
						manifest = localizeManifest(manifest, JSON.parse(content));
					}
				}
			} catch (error) { /* ignore */ }
		}
		return <ILocalExtension>{
			type: ExtensionType.System,
			identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name) },
			manifest,
			location: scannedExtension.location,
			isMachineScoped: false,
			publisherId: null,
			publisherDisplayName: null
		};
	}

	zip(extension: ILocalExtension): Promise<URI> { throw new Error('unsupported'); }
	unzip(zipLocation: URI): Promise<IExtensionIdentifier> { throw new Error('unsupported'); }
	getManifest(vsix: URI): Promise<IExtensionManifest> { throw new Error('unsupported'); }
	install(vsix: URI, isMachineScoped?: boolean): Promise<ILocalExtension> { throw new Error('unsupported'); }
	installFromGallery(extension: IGalleryExtension, isMachineScoped?: boolean): Promise<ILocalExtension> { throw new Error('unsupported'); }
	uninstall(extension: ILocalExtension, force?: boolean): Promise<void> { throw new Error('unsupported'); }
	reinstallFromGallery(extension: ILocalExtension): Promise<void> { throw new Error('unsupported'); }
	getExtensionsReport(): Promise<IReportedExtension[]> { throw new Error('unsupported'); }
	updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> { throw new Error('unsupported'); }

}
