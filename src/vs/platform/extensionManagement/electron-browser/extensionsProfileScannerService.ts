/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { revive } from '../../../base/common/marshalling.js';
import { SerializedError, transformErrorFromSerialization } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ISharedProcessService } from '../../ipc/electron-browser/services.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IExtension, IExtensionIdentifier } from '../../extensions/common/extensions.js';
import { DidAddProfileExtensionsEvent, DidRemoveProfileExtensionsEvent, ExtensionsProfileScanningError, ExtensionsProfileScanningErrorCode, IExtensionsProfileScannerService, IProfileExtensionsScanOptions, IScannedProfileExtension, ProfileExtensionsEvent } from '../common/extensionsProfileScannerService.js';
import { Metadata } from '../common/extensionManagement.js';

type SerializedExtensionsProfileScannerService = Omit<IExtensionsProfileScannerService, 'scanProfileExtensions' | 'onDidAddExtensions' | 'onDidRemoveExtensions'> & {
	scanProfileExtensions(profileLocation: URI, options?: IProfileExtensionsScanOptions): Promise<IScannedProfileExtension[] | { error: { message: string; code: ExtensionsProfileScanningErrorCode } }>;
	onDidAddExtensions: Event<Omit<DidAddProfileExtensionsEvent, 'error'> & { error?: SerializedError }>;
	onDidRemoveExtensions: Event<Omit<DidRemoveProfileExtensionsEvent, 'error'> & { error?: SerializedError }>;
};

/** Keep profile reads and their migration writes inside the coordinating native backend. */
export class ExtensionsProfileScannerService implements IExtensionsProfileScannerService {
	declare readonly _serviceBrand: undefined;
	private readonly service: SerializedExtensionsProfileScannerService;
	readonly onAddExtensions: Event<ProfileExtensionsEvent>;
	readonly onDidAddExtensions: Event<DidAddProfileExtensionsEvent>;
	readonly onRemoveExtensions: Event<ProfileExtensionsEvent>;
	readonly onDidRemoveExtensions: Event<DidRemoveProfileExtensionsEvent>;

	constructor(@ISharedProcessService sharedProcessService: ISharedProcessService) {
		this.service = ProxyChannel.toService<SerializedExtensionsProfileScannerService>(sharedProcessService.getChannel('extensionsProfileScanner'));
		this.onAddExtensions = Event.map(this.service.onAddExtensions, event => revive(event));
		this.onDidAddExtensions = Event.map(this.service.onDidAddExtensions, event => ({
			...revive(event),
			error: event.error ? transformErrorFromSerialization(event.error) : undefined,
		}));
		this.onRemoveExtensions = Event.map(this.service.onRemoveExtensions, event => revive(event));
		this.onDidRemoveExtensions = Event.map(this.service.onDidRemoveExtensions, event => ({
			...revive(event),
			error: event.error ? transformErrorFromSerialization(event.error) : undefined,
		}));
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
