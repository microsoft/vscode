/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { revive } from '../../../base/common/marshalling.js';
import { URI } from '../../../base/common/uri.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ISharedProcessService } from '../../ipc/electron-browser/services.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { DidAddProfileExtensionsEvent, DidRemoveProfileExtensionsEvent, ExtensionsProfileScanningError, ExtensionsProfileScanningErrorCode, IExtensionsProfileScannerService, IProfileExtensionsScanOptions, IScannedProfileExtension, ProfileExtensionsEvent } from '../common/extensionsProfileScannerService.js';
import { Event } from '../../../base/common/event.js';
import { IExtension, IExtensionIdentifier } from '../../extensions/common/extensions.js';
import { Metadata } from '../common/extensionManagement.js';

/** Keep profile reads and their migration writes inside the coordinating native backend. */
export class ExtensionsProfileScannerService implements IExtensionsProfileScannerService {
	declare readonly _serviceBrand: undefined;
	private readonly service: Omit<IExtensionsProfileScannerService, 'scanProfileExtensions'> & {
		scanProfileExtensions(profileLocation: URI, options?: IProfileExtensionsScanOptions): Promise<IScannedProfileExtension[] | { error: { message: string; code: ExtensionsProfileScanningErrorCode } }>;
	};
	readonly onAddExtensions: Event<ProfileExtensionsEvent>;
	readonly onDidAddExtensions: Event<DidAddProfileExtensionsEvent>;
	readonly onRemoveExtensions: Event<ProfileExtensionsEvent>;
	readonly onDidRemoveExtensions: Event<DidRemoveProfileExtensionsEvent>;

	constructor(@ISharedProcessService sharedProcessService: ISharedProcessService) {
		this.service = ProxyChannel.toService(sharedProcessService.getChannel('extensionsProfileScanner'));
		this.onAddExtensions = Event.map(this.service.onAddExtensions, event => revive(event));
		this.onDidAddExtensions = Event.map(this.service.onDidAddExtensions, event => revive(event));
		this.onRemoveExtensions = Event.map(this.service.onRemoveExtensions, event => revive(event));
		this.onDidRemoveExtensions = Event.map(this.service.onDidRemoveExtensions, event => revive(event));
	}

	async scanProfileExtensions(profileLocation: URI, options?: IProfileExtensionsScanOptions): Promise<IScannedProfileExtension[]> {
		const result = await this.service.scanProfileExtensions(profileLocation, options);
		if (!Array.isArray(result)) {
			// Preserve the typed error used by default-profile initialization across IPC.
			throw new ExtensionsProfileScanningError(result.error.message, result.error.code);
		}
		return result;
	}

	addExtensionsToProfile(extensions: [IExtension, Metadata | undefined][], profileLocation: URI, keepExistingVersions?: boolean): Promise<IScannedProfileExtension[]> {
		return this.service.addExtensionsToProfile(extensions, profileLocation, keepExistingVersions);
	}

	updateMetadata(extensions: [IExtension, Metadata | undefined][], profileLocation: URI): Promise<IScannedProfileExtension[]> {
		return this.service.updateMetadata(extensions, profileLocation);
	}

	removeExtensionsFromProfile(extensions: IExtensionIdentifier[], profileLocation: URI): Promise<void> {
		return this.service.removeExtensionsFromProfile(extensions, profileLocation);
	}
}

registerSingleton(IExtensionsProfileScannerService, ExtensionsProfileScannerService, InstantiationType.Delayed);
