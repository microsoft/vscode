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
import { IExtensionIdentifier, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { FileOperationError, FileOperationResult, IFileService } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

interface IStoredProfileExtension {
	identifier: IExtensionIdentifier;
	location: UriComponents;
	version: string;
	metadata?: Metadata;
}

export interface IScannedProfileExtension {
	readonly identifier: IExtensionIdentifier;
	readonly version: string;
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

	private readonly migratePromise: Promise<void>;
	private readonly resourcesAccessQueueMap = new ResourceMap<Queue<IScannedProfileExtension[]>>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.migratePromise = this.migrate();
	}

	// TODO: @sandy081 remove it in a month
	private async migrate(): Promise<void> {
		await Promise.all(this.userDataProfilesService.profiles.map(async e => {
			if (!e.extensionsResource) {
				return;
			}
			try {
				let needsMigrating: boolean = false;
				const storedWebExtensions: IStoredProfileExtension[] = JSON.parse((await this.fileService.readFile(e.extensionsResource)).value.toString());
				for (const e of storedWebExtensions) {
					if (!e.location) {
						continue;
					}
					if (!e.version) {
						try {
							const content = (await this.fileService.readFile(this.uriIdentityService.extUri.joinPath(URI.revive(e.location), 'package.json'))).value.toString();
							e.version = (<IExtensionManifest>JSON.parse(content)).version;
							needsMigrating = true;
						} catch (error) { /* ignore */ }
					}
				}
				if (needsMigrating) {
					await this.fileService.writeFile(e.extensionsResource, VSBuffer.fromString(JSON.stringify(storedWebExtensions)));
				}
			} catch (error) { /* Ignore */ }
		}));
	}

	scanProfileExtensions(profileLocation: URI): Promise<IScannedProfileExtension[]> {
		return this.withProfileExtensions(profileLocation);
	}

	addExtensionsToProfile(extensions: [ILocalExtension, Metadata][], profileLocation: URI): Promise<IScannedProfileExtension[]> {
		return this.withProfileExtensions(profileLocation, profileExtensions => {
			// Remove the existing extension to avoid duplicates
			profileExtensions = profileExtensions.filter(e => extensions.some(([extension]) => !areSameExtensions(e.identifier, extension.identifier)));
			profileExtensions.push(...extensions.map(([extension, metadata]) => ({ identifier: extension.identifier, version: extension.manifest.version, location: extension.location, metadata })));
			return profileExtensions;
		});
	}

	removeExtensionFromProfile(identifier: IExtensionIdentifier, profileLocation: URI): Promise<IScannedProfileExtension[]> {
		return this.withProfileExtensions(profileLocation, profileExtensions => profileExtensions.filter(extension => !(areSameExtensions(extension.identifier, identifier))));
	}

	private async withProfileExtensions(file: URI, updateFn?: (extensions: IScannedProfileExtension[]) => IScannedProfileExtension[]): Promise<IScannedProfileExtension[]> {
		await this.migratePromise;
		return this.getResourceAccessQueue(file).queue(async () => {
			let extensions: IScannedProfileExtension[] = [];

			// Read
			try {
				const content = await this.fileService.readFile(file);
				const storedWebExtensions: IStoredProfileExtension[] = JSON.parse(content.value.toString());
				for (const e of storedWebExtensions) {
					if (!e.identifier) {
						this.logService.info('Ignoring invalid extension while scanning. Identifier does not exist.', e);
						continue;
					}
					if (!e.location) {
						this.logService.info('Ignoring invalid extension while scanning. Location does not exist.', e);
						continue;
					}
					if (!e.version) {
						this.logService.info('Ignoring invalid extension while scanning. Version does not exist.', e);
						continue;
					}
					extensions.push({
						identifier: e.identifier,
						location: URI.revive(e.location),
						version: e.version,
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
					version: e.version,
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
