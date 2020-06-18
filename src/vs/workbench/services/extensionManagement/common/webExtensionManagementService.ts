/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionType, IExtensionIdentifier, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { IExtensionManagementService, ILocalExtension, InstallExtensionEvent, DidInstallExtensionEvent, DidUninstallExtensionEvent, IGalleryExtension, IReportedExtension, IGalleryMetadata } from 'vs/platform/extensionManagement/common/extensionManagement';
import builtinExtensions from 'vs/platform/extensions/common/builtinExtensions';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

export class WebExtensionManagementService implements IExtensionManagementService {

	declare readonly _serviceBrand: undefined;

	onInstallExtension: Event<InstallExtensionEvent> = Event.None;
	onDidInstallExtension: Event<DidInstallExtensionEvent> = Event.None;
	onUninstallExtension: Event<IExtensionIdentifier> = Event.None;
	onDidUninstallExtension: Event<DidUninstallExtensionEvent> = Event.None;

	private readonly systemExtensions: ILocalExtension[];
	private readonly staticExtensions: ILocalExtension[];

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
	) {
		this.systemExtensions = builtinExtensions.map(e => ({ ...e, type: ExtensionType.System, isMachineScoped: false, publisherId: null, publisherDisplayName: null }));
		const staticExtensions = environmentService.options && Array.isArray(environmentService.options.staticExtensions) ? environmentService.options.staticExtensions : [];

		this.staticExtensions = staticExtensions.map(data => <ILocalExtension>{
			type: ExtensionType.User,
			identifier: { id: `${data.packageJSON.publisher}.${data.packageJSON.name}` },
			manifest: data.packageJSON,
			location: data.extensionLocation,
			isMachineScoped: false,
			publisherId: null,
			publisherDisplayName: null
		});
	}

	async getInstalled(type?: ExtensionType): Promise<ILocalExtension[]> {
		const extensions = [];
		if (type === undefined || type === ExtensionType.System) {
			extensions.push(...this.systemExtensions);
		}
		if (type === undefined || type === ExtensionType.User) {
			extensions.push(...this.staticExtensions);
		}
		return extensions;
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
