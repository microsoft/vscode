/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Memento } from 'vs/workbench/common/memento';
import { updateContributedOpeners } from 'vs/workbench/contrib/externalUriOpener/common/configuration';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

interface RegisteredExternalOpener {
	readonly extensionId: string;
}

interface OpenersMemento {
	[id: string]: RegisteredExternalOpener;
}

/**
 */
export class ContributedExternalUriOpenersStore extends Disposable {

	private static readonly STORAGE_ID = 'externalUriOpeners';

	private readonly _openers = new Map<string, RegisteredExternalOpener>();
	private readonly _memento: Memento;
	private _mementoObject: OpenersMemento;

	constructor(
		@IStorageService storageService: IStorageService,
		@IExtensionService private readonly _extensionService: IExtensionService
	) {
		super();

		this._memento = new Memento(ContributedExternalUriOpenersStore.STORAGE_ID, storageService);
		this._mementoObject = this._memento.getMemento(StorageScope.GLOBAL, StorageTarget.MACHINE);
		for (const id of Object.keys(this._mementoObject || {})) {
			this.add(id, this._mementoObject[id].extensionId);
		}

		this.invalidateOpenersForUninstalledExtension();

		this._register(this._extensionService.onDidChangeExtensions(() => this.invalidateOpenersForUninstalledExtension()));
	}

	public add(id: string, extensionId: string): void {
		this._openers.set(id, { extensionId });

		this._mementoObject[id] = { extensionId };
		this._memento.saveMemento();

		this.updateSchema();
	}

	public delete(id: string): void {
		this._openers.delete(id);

		delete this._mementoObject[id];
		this._memento.saveMemento();

		this.updateSchema();
	}

	private async invalidateOpenersForUninstalledExtension() {
		const registeredExtensions = await this._extensionService.getExtensions();
		for (const [id, entry] of this._openers) {
			const isExtensionRegistered = registeredExtensions.some(r => r.identifier.value === entry.extensionId);
			if (!isExtensionRegistered) {
				this.delete(id);
			}
		}
	}

	private updateSchema() {
		const ids: string[] = [];
		const descriptions: string[] = [];

		for (const [id, entry] of this._openers) {
			ids.push(id);
			descriptions.push(entry.extensionId);
		}

		updateContributedOpeners(ids, descriptions);
	}
}
