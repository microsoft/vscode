/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { ResourceMap } from 'vs/base/common/map';
import { URI, UriComponents } from 'vs/base/common/uri';
import { Metadata } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtension, IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { FileOperationError, FileOperationResult, IFileService } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';

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

export interface ProfileExtensionsEvent {
	readonly extensions: readonly IExtension[];
	readonly profileLocation: URI;
}

export interface DidAddProfileExtensionsEvent extends ProfileExtensionsEvent {
	readonly error?: Error;
}

export interface DidRemoveProfileExtensionsEvent extends ProfileExtensionsEvent {
	readonly error?: Error;
}

export const IExtensionsProfileScannerService = createDecorator<IExtensionsProfileScannerService>('IExtensionsProfileScannerService');
export interface IExtensionsProfileScannerService {
	readonly _serviceBrand: undefined;

	readonly onAddExtensions: Event<ProfileExtensionsEvent>;
	readonly onDidAddExtensions: Event<DidAddProfileExtensionsEvent>;
	readonly onRemoveExtensions: Event<ProfileExtensionsEvent>;
	readonly onDidRemoveExtensions: Event<DidRemoveProfileExtensionsEvent>;

	scanProfileExtensions(profileLocation: URI): Promise<IScannedProfileExtension[]>;
	addExtensionsToProfile(extensions: [IExtension, Metadata | undefined][], profileLocation: URI): Promise<IScannedProfileExtension[]>;
	removeExtensionFromProfile(extension: IExtension, profileLocation: URI): Promise<void>;
}

export class ExtensionsProfileScannerService extends Disposable implements IExtensionsProfileScannerService {
	readonly _serviceBrand: undefined;

	private readonly _onAddExtensions = this._register(new Emitter<ProfileExtensionsEvent>());
	readonly onAddExtensions = this._onAddExtensions.event;

	private readonly _onDidAddExtensions = this._register(new Emitter<DidAddProfileExtensionsEvent>());
	readonly onDidAddExtensions = this._onDidAddExtensions.event;

	private readonly _onRemoveExtensions = this._register(new Emitter<ProfileExtensionsEvent>());
	readonly onRemoveExtensions = this._onRemoveExtensions.event;

	private readonly _onDidRemoveExtensions = this._register(new Emitter<DidRemoveProfileExtensionsEvent>());
	readonly onDidRemoveExtensions = this._onDidRemoveExtensions.event;

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

	async addExtensionsToProfile(extensions: [IExtension, Metadata | undefined][], profileLocation: URI): Promise<IScannedProfileExtension[]> {
		this._onAddExtensions.fire({ extensions: extensions.map(e => e[0]), profileLocation });
		try {
			const allExtensions = await this.withProfileExtensions(profileLocation, profileExtensions => {
				// Remove the existing extension to avoid duplicates
				profileExtensions = profileExtensions.filter(e => extensions.some(([extension]) => !areSameExtensions(e.identifier, extension.identifier)));
				profileExtensions.push(...extensions.map(([extension, metadata]) => ({ identifier: extension.identifier, version: extension.manifest.version, location: extension.location, metadata })));
				return profileExtensions;
			});
			const addedExtensions = allExtensions.filter(e => extensions.some(([extension]) => areSameExtensions(e.identifier, extension.identifier)));
			this._onDidAddExtensions.fire({ extensions: extensions.map(e => e[0]), profileLocation });
			return addedExtensions;
		} catch (error) {
			this._onDidAddExtensions.fire({ extensions: extensions.map(e => e[0]), error, profileLocation });
			throw error;
		}
	}

	async removeExtensionFromProfile(extension: IExtension, profileLocation: URI): Promise<void> {
		this._onRemoveExtensions.fire({ extensions: [extension], profileLocation });
		try {
			await this.withProfileExtensions(profileLocation, profileExtensions => profileExtensions.filter(e => !(areSameExtensions(e.identifier, extension.identifier))));
			this._onDidRemoveExtensions.fire({ extensions: [extension], profileLocation });
		} catch (error) {
			this._onDidRemoveExtensions.fire({ extensions: [extension], error, profileLocation });
			throw error;
		}
	}

	private async withProfileExtensions(file: URI, updateFn?: (extensions: IScannedProfileExtension[]) => IScannedProfileExtension[]): Promise<IScannedProfileExtension[]> {
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
