/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IExtensionManagementService, ILocalExtension, IExtensionIdentifier, IGalleryExtension, IReportedExtension, IGalleryMetadata } from 'vs/platform/extensionManagement/common/extensionManagement';
import { URI } from 'vs/base/common/uri';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';

export class SimpleExtensionManagementService implements IExtensionManagementService {

	_serviceBrand: any;

	onInstallExtension = Event.None;
	onDidInstallExtension = Event.None;
	onUninstallExtension = Event.None;
	onDidUninstallExtension = Event.None;

	zip(extension: ILocalExtension): Promise<URI> {
		return Promise.resolve(undefined);
	}

	unzip(zipLocation: URI, type: ExtensionType): Promise<IExtensionIdentifier> {
		return Promise.resolve(undefined);
	}

	install(vsix: URI): Promise<IExtensionIdentifier> {
		return Promise.resolve(undefined);
	}

	installFromGallery(extension: IGalleryExtension): Promise<void> {
		return Promise.resolve(undefined);
	}

	uninstall(extension: ILocalExtension, force?: boolean): Promise<void> {
		return Promise.resolve(undefined);
	}

	reinstallFromGallery(extension: ILocalExtension): Promise<void> {
		return Promise.resolve(undefined);
	}

	getInstalled(type?: ExtensionType): Promise<ILocalExtension[]> {
		return Promise.resolve(undefined);
	}

	getExtensionsReport(): Promise<IReportedExtension[]> {
		return Promise.resolve(undefined);
	}

	updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> {
		return Promise.resolve(undefined);
	}
}