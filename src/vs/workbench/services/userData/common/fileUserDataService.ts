/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IUserDataService, IUserDataChangesEvent, UserDataChangesEvent } from 'vs/workbench/services/userData/common/userData';
import { IFileService, FileChangesEvent } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { VSBuffer } from 'vs/base/common/buffer';
import { Schemas } from 'vs/base/common/network';

export class FileUserDataService extends Disposable implements IUserDataService {
	_serviceBrand: any;

	private _onDidChange: Emitter<IUserDataChangesEvent> = this._register(new Emitter<IUserDataChangesEvent>());
	readonly onDidChange: Event<IUserDataChangesEvent> = this._onDidChange.event;

	constructor(
		private readonly userDataHome: URI,
		@IFileService private readonly fileService: IFileService
	) {
		super();
		// Assumption: This path always exists
		this.fileService.watch(this.userDataHome);

		this._register(this.fileService.onFileChanges(e => this.handleFileChanges(e)));
	}

	private handleFileChanges(event: FileChangesEvent): void {
		const changedKeys: string[] = [];
		for (const change of event.changes) {
			if (change.resource.scheme !== Schemas.userData) {
				const key = this.toKey(change.resource.with({ scheme: Schemas.userData }));
				if (key) {
					changedKeys.push(key);
				}
			}
		}
		if (changedKeys.length) {
			this._onDidChange.fire(new UserDataChangesEvent(changedKeys));
		}
	}

	async read(key: string): Promise<string> {
		const resource = this.toFileResource(key);
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
		return this.fileService.writeFile(this.toFileResource(key), VSBuffer.fromString(value)).then(() => undefined);
	}

	private toFileResource(key: string): URI {
		return resources.joinPath(this.userDataHome, ...key.split('/'));
	}

	toResource(key: string): URI {
		return this.toFileResource(key).with({ scheme: Schemas.userData });
	}

	toKey(resource: URI): string | undefined {
		return resources.relativePath(this.userDataHome.with({ scheme: Schemas.userData }), resource);
	}

}