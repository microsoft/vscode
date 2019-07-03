/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IUserDataProvider, FileChangeEvent, IUserDataContainerRegistry, Extensions } from 'vs/workbench/services/userData/common/userData';
import { IFileService, FileChangesEvent, FileChangeType } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { VSBuffer } from 'vs/base/common/buffer';
import { startsWith } from 'vs/base/common/strings';
import { BACKUPS } from 'vs/platform/environment/common/environment';
import { Registry } from 'vs/platform/registry/common/platform';

export class FileUserDataProvider extends Disposable implements IUserDataProvider {

	private _onDidChangeFile: Emitter<FileChangeEvent[]> = this._register(new Emitter<FileChangeEvent[]>());
	readonly onDidChangeFile: Event<FileChangeEvent[]> = this._onDidChangeFile.event;

	constructor(
		private readonly userDataHome: URI,
		@IFileService private readonly fileService: IFileService
	) {
		super();
		// Assumption: This path always exists
		this._register(this.fileService.watch(this.userDataHome));
		this._register(this.fileService.onFileChanges(e => this.handleFileChanges(e)));

		const userDataContainersRegistry = Registry.as<IUserDataContainerRegistry>(Extensions.UserDataContainers);
		userDataContainersRegistry.containers.forEach(c => this.watchContainer(c));
		this._register(userDataContainersRegistry.onDidRegisterContainer(c => this.watchContainer(c)));
	}

	private handleFileChanges(event: FileChangesEvent): void {
		const changedPaths: FileChangeEvent[] = [];
		const userDataContainersRegistry = Registry.as<IUserDataContainerRegistry>(Extensions.UserDataContainers);
		for (const change of event.changes) {
			if (change.resource.scheme === this.userDataHome.scheme) {
				const path = this.toPath(change.resource);
				if (path) {
					changedPaths.push({
						path,
						type: change.type
					});
					if (userDataContainersRegistry.isContainer(path)) {
						if (change.type === FileChangeType.ADDED) {
							this.watchContainer(path);
						}
					}
				}
			}
		}
		if (changedPaths.length) {
			this._onDidChangeFile.fire(changedPaths);
		}
	}

	private async watchContainer(container: string): Promise<void> {
		if (this.isBackUpsPath(container)) {
			return;
		}
		const resource = this.toResource(container);
		const exists = await this.fileService.exists(resource);
		if (exists) {
			this._register(this.fileService.watch(resource));
		}
	}

	async readFile(path: string): Promise<Uint8Array> {
		const resource = this.toResource(path);
		const content = await this.fileService.readFile(resource);
		return content.value.buffer;
	}

	writeFile(path: string, value: Uint8Array): Promise<void> {
		return this.fileService.writeFile(this.toResource(path), VSBuffer.wrap(value)).then(() => undefined);
	}

	async listFiles(path: string): Promise<string[]> {
		const resource = this.toResource(path);
		try {
			const result = await this.fileService.resolve(resource);
			return result.children ? result.children.map(c => this.toRelativePath(c.resource, resource)!) : [];
		} catch (error) {
		}
		return [];
	}

	deleteFile(path: string): Promise<void> {
		return this.fileService.del(this.toResource(path));
	}

	private toResource(path: string): URI {
		if (this.isBackUpsPath(path)) {
			return resources.joinPath(resources.dirname(this.userDataHome), path);
		}
		return resources.joinPath(this.userDataHome, path);
	}

	private isBackUpsPath(path: string): boolean {
		return path === BACKUPS || startsWith(path, `${BACKUPS}/`);
	}

	private toPath(resource: URI): string | undefined {
		let result = this.toRelativePath(resource, this.userDataHome);
		if (result === undefined) {
			result = this.toRelativePath(resource, resources.joinPath(resources.dirname(this.userDataHome), BACKUPS));
		}
		return result;
	}

	private toRelativePath(fromResource: URI, toResource: URI): string | undefined {
		const fromPath = fromResource.toString();
		const toPath = toResource.toString();
		return startsWith(fromPath, toPath) ? fromPath.substr(toPath.length + 1) : undefined;
	}
}