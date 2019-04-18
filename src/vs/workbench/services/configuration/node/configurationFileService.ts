/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as pfs from 'vs/base/node/pfs';
import { IConfigurationFileService, ConfigurationFileService as FileServiceBasedConfigurationFileService } from 'vs/workbench/services/configuration/common/configuration';
import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { FileChangesEvent, IFileService } from 'vs/platform/files/common/files';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';

export class ConfigurationFileService extends Disposable implements IConfigurationFileService {

	private _fileServiceBasedConfigurationFileService: FileServiceBasedConfigurationFileService | null = null;
	private _fileServiceBasedConfigurationFileServiceCallback: (fileServiceBasedConfigurationFileService: FileServiceBasedConfigurationFileService) => void;
	private _whenFileServiceBasedConfigurationFileServiceAvailable: Promise<FileServiceBasedConfigurationFileService> = new Promise((c) => this._fileServiceBasedConfigurationFileServiceCallback = c);
	private _watchResources: { resource: URI, disposable: { disposable: IDisposable | null } }[] = [];
	readonly whenWatchingStarted: Promise<void> = this._whenFileServiceBasedConfigurationFileServiceAvailable.then(() => undefined);

	private readonly _onFileChanges: Emitter<FileChangesEvent> = this._register(new Emitter<FileChangesEvent>());
	readonly onFileChanges: Event<FileChangesEvent> = this._onFileChanges.event;

	get isWatching(): boolean {
		return this._fileServiceBasedConfigurationFileService ? this._fileServiceBasedConfigurationFileService.isWatching : false;
	}

	watch(resource: URI): IDisposable {
		if (this._fileServiceBasedConfigurationFileService) {
			return this._fileServiceBasedConfigurationFileService.watch(resource);
		}
		const disposable: { disposable: IDisposable | null } = { disposable: null };
		this._watchResources.push({ resource, disposable });
		return toDisposable(() => {
			if (disposable.disposable) {
				disposable.disposable.dispose();
			}
		});
	}

	whenProviderRegistered(scheme: string): Promise<void> {
		if (scheme === Schemas.file) {
			return Promise.resolve();
		}
		return this._whenFileServiceBasedConfigurationFileServiceAvailable
			.then(fileServiceBasedConfigurationFileService => fileServiceBasedConfigurationFileService.whenProviderRegistered(scheme));
	}

	exists(resource: URI): Promise<boolean> {
		return this._fileServiceBasedConfigurationFileService ? this._fileServiceBasedConfigurationFileService.exists(resource) : pfs.exists(resource.fsPath);
	}

	async readFile(resource: URI): Promise<string> {
		if (this._fileServiceBasedConfigurationFileService) {
			return this._fileServiceBasedConfigurationFileService.readFile(resource);
		} else {
			const contents = await pfs.readFile(resource.fsPath);
			return contents.toString();
		}
	}

	private _fileService: IFileService | null;
	get fileService(): IFileService | null {
		return this._fileService;
	}

	set fileService(fileService: IFileService | null) {
		if (fileService && !this._fileServiceBasedConfigurationFileService) {
			this._fileServiceBasedConfigurationFileService = new FileServiceBasedConfigurationFileService(fileService);
			this._fileService = fileService;
			this._register(this._fileServiceBasedConfigurationFileService.onFileChanges(e => this._onFileChanges.fire(e)));
			for (const { resource, disposable } of this._watchResources) {
				disposable.disposable = this._fileServiceBasedConfigurationFileService.watch(resource);
			}
			this._fileServiceBasedConfigurationFileServiceCallback(this._fileServiceBasedConfigurationFileService);
		}
	}
}
