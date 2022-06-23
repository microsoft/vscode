/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { Disposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ILocalExtension, Metadata } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { FileOperationError, FileOperationResult, IFileService } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';

interface IStoredProfileExtension {
	readonly identifier: IExtensionIdentifier;
	readonly location: UriComponents;
	readonly metadata?: Metadata;
}

export interface IScannedProfileExtension {
	readonly identifier: IExtensionIdentifier;
	readonly location: URI;
	readonly metadata?: Metadata;
}

export const IExtensionsProfileScannerService = createDecorator<IExtensionsProfileScannerService>('IExtensionsProfileScannerService');
export interface IExtensionsProfileScannerService {
	readonly _serviceBrand: undefined;

	scanProfileExtensions(profileLocation: URI): Promise<IScannedProfileExtension[]>;
	addExtensionsToProfile(extensions: [ILocalExtension, Metadata | undefined][], profileLocation: URI): Promise<IScannedProfileExtension[]>;
	removeExtensionFromProfile(identifier: IExtensionIdentifier, profileLocation: URI): Promise<IScannedProfileExtension[]>;
}

export class ExtensionsProfileScannerService extends Disposable implements IExtensionsProfileScannerService {
	readonly _serviceBrand: undefined;

	private readonly resourcesAccessQueueMap = new ResourceMap<Queue<IScannedProfileExtension[]>>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	scanProfileExtensions(profileLocation: URI): Promise<IScannedProfileExtension[]> {
		return this.withProfileExtensions(profileLocation);
	}

	addExtensionsToProfile(extensions: [ILocalExtension, Metadata][], profileLocation: URI): Promise<IScannedProfileExtension[]> {
		return this.withProfileExtensions(profileLocation, profileExtensions => {
			// Remove the existing extension to avoid duplicates
			profileExtensions = profileExtensions.filter(e => extensions.some(([extension]) => !areSameExtensions(e.identifier, extension.identifier)));
			profileExtensions.push(...extensions.map(([extension, metadata]) => ({ identifier: extension.identifier, location: extension.location, metadata })));
			return profileExtensions;
		});
	}

	removeExtensionFromProfile(identifier: IExtensionIdentifier, profileLocation: URI): Promise<IScannedProfileExtension[]> {
		return this.withProfileExtensions(profileLocation, profileExtensions => profileExtensions.filter(extension => !(areSameExtensions(extension.identifier, identifier))));
	}

	private async withProfileExtensions(file: URI, updateFn?: (extensions: IScannedProfileExtension[]) => IScannedProfileExtension[]): Promise<IScannedProfileExtension[]> {
		return this.getResourceAccessQueue(file).queue(async () => {
			let extensions: IScannedProfileExtension[] = [];

			// Read
			try {
				const content = await this.fileService.readFile(file);
				const storedWebExtensions: IStoredProfileExtension[] = JSON.parse(content.value.toString());
				for (const e of storedWebExtensions) {
					if (!e.location || !e.identifier) {
						this.logService.info('Ignoring invalid extension while scanning', storedWebExtensions);
						continue;
					}
					extensions.push({
						identifier: e.identifier,
						location: URI.revive(e.location),
						metadata: e.metadata,
					});
				}
			} catch (error) {
				/* Ignore */
				if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
					this.logService.error(error);
				}
			}

			// Update
			if (updateFn) {
				extensions = updateFn(extensions);
				const storedProfileExtensions: IStoredProfileExtension[] = extensions.map(e => ({
					identifier: e.identifier,
					location: e.location.toJSON(),
					metadata: e.metadata
				}));
				await this.fileService.writeFile(file, VSBuffer.fromString(JSON.stringify(storedProfileExtensions)));
			}

			return extensions;
		});
	}

	private getResourceAccessQueue(file: URI): Queue<IScannedProfileExtension[]> {
		let resourceQueue = this.resourcesAccessQueueMap.get(file);
		if (!resourceQueue) {
			resourceQueue = new Queue<IScannedProfileExtension[]>();
			this.resourcesAccessQueueMap.set(file, resourceQueue);
		}
		return resourceQueue;
	}
}
