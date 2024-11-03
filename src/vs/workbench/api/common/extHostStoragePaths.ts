/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IEnvironment, IStaticWorkspaceData } from '../../services/extensions/common/extensionHostProtocol.js';
import { IExtHostConsumerFileSystem } from './extHostFileSystemConsumer.js';
import { URI } from '../../../base/common/uri.js';

export const IExtensionStoragePaths = createDecorator<IExtensionStoragePaths>('IExtensionStoragePaths');

export interface IExtensionStoragePaths {
	readonly _serviceBrand: undefined;
	whenReady: Promise<any>;
	workspaceValue(extension: IExtensionDescription): URI | undefined;
	globalValue(extension: IExtensionDescription): URI;
	onWillDeactivateAll(): void;
}

export class ExtensionStoragePaths implements IExtensionStoragePaths {

	readonly _serviceBrand: undefined;

	private readonly _workspace?: IStaticWorkspaceData;
	protected readonly _environment: IEnvironment;

	readonly whenReady: Promise<URI | undefined>;
	private _value?: URI;

	constructor(
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@ILogService protected readonly _logService: ILogService,
		@IExtHostConsumerFileSystem private readonly _extHostFileSystem: IExtHostConsumerFileSystem
	) {
		this._workspace = initData.workspace ?? undefined;
		this._environment = initData.environment;
		this.whenReady = this._getOrCreateWorkspaceStoragePath().then(value => this._value = value);
	}

	protected async _getWorkspaceStorageURI(storageName: string): Promise<URI> {
		return URI.joinPath(this._environment.workspaceStorageHome, storageName);
	}

	private async _getOrCreateWorkspaceStoragePath(): Promise<URI | undefined> {
		if (!this._workspace) {
			return Promise.resolve(undefined);
		}
		const storageName = this._workspace.id;
		const storageUri = await this._getWorkspaceStorageURI(storageName);

		try {
			await this._extHostFileSystem.value.stat(storageUri);
			this._logService.trace('[ExtHostStorage] storage dir already exists', storageUri);
			return storageUri;
		} catch {
			// doesn't exist, that's OK
		}

		try {
			this._logService.trace('[ExtHostStorage] creating dir and metadata-file', storageUri);
			await this._extHostFileSystem.value.createDirectory(storageUri);
			await this._extHostFileSystem.value.writeFile(
				URI.joinPath(storageUri, 'meta.json'),
				new TextEncoder().encode(JSON.stringify({
					id: this._workspace.id,
					configuration: URI.revive(this._workspace.configuration)?.toString(),
					name: this._workspace.name
				}, undefined, 2))
			);
			return storageUri;

		} catch (e) {
			this._logService.error('[ExtHostStorage]', e);
			return undefined;
		}
	}

	workspaceValue(extension: IExtensionDescription): URI | undefined {
		if (this._value) {
			return URI.joinPath(this._value, extension.identifier.value);
		}
		return undefined;
	}

	globalValue(extension: IExtensionDescription): URI {
		return URI.joinPath(this._environment.globalStorageHome, extension.identifier.value.toLowerCase());
	}

	onWillDeactivateAll(): void {
	}
}
