/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IUserDataService, IUserDataChangesEvent } from './userDataService';
import { IFileService, FileChangesEvent } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { TernarySearchTree } from 'vs/base/common/map';
import { VSBuffer } from 'vs/base/common/buffer';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export class FileUserDataService extends Disposable implements IUserDataService {
	_serviceBrand: any;

	private readonly settingsHome: URI;

	private _onDidChange: Emitter<IUserDataChangesEvent> = this._register(new Emitter<IUserDataChangesEvent>());
	readonly onDidChange: Event<IUserDataChangesEvent> = this._onDidChange.event;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService private readonly fileService: IFileService
	) {
		super();
		// Assumption: This path always exists
		this.settingsHome = environmentService.appSettingsHome;
		this.fileService.watch(this.settingsHome);

		this._register(this.fileService.onFileChanges(e => this.handleFileChanges(e)));
	}

	private handleFileChanges(event: FileChangesEvent): void {
		const changedKeys: string[] = [];
		for (const change of event.changes) {
			const key = resources.relativePath(this.settingsHome, change.resource);
			if (key) {
				changedKeys.push(key);
			}
		}
		if (changedKeys.length) {
			this._onDidChange.fire(new UserDataChangesEvent(changedKeys));
		}
	}

	async read(key: string): Promise<string> {
		const resource = this.toResource(key);
		try {
			const content = await this.fileService.readFile(resource);
			return content.value.toString();
		} catch (e) {
			const exists = await this.fileService.exists(resource);
			if (exists) {
				throw e;
			}
		}
		return '';
	}

	write(key: string, value: string): Promise<void> {
		return this.fileService.writeFile(this.toResource(key), VSBuffer.fromString(value)).then(() => undefined);
	}

	private toResource(key: string): URI {
		return resources.joinPath(this.settingsHome, ...key.split('/'));
	}

}

class UserDataChangesEvent implements IUserDataChangesEvent {

	private _keysTree: TernarySearchTree<string> | undefined = undefined;

	constructor(readonly keys: string[]) { }

	private get keysTree(): TernarySearchTree<string> {
		if (!this._keysTree) {
			this._keysTree = TernarySearchTree.forPaths<string>();
			for (const key of this.keys) {
				this._keysTree.set(key, key);
			}
		}
		return this._keysTree;
	}

	contains(keyOrSegment: string): boolean {
		return this.keysTree.findSubstr(keyOrSegment) !== undefined;
	}

}