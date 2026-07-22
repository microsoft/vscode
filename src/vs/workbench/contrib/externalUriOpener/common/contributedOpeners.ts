/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';
import { updateContributedOpeners } from './configuration.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';

interface RegisteredExternalOpener {
	readonly extensionId: string;

	isCurrentlyRegistered: boolean;
}

interface OpenersMemento {
	[id: string]: RegisteredExternalOpener | undefined;
}

export class ContributedExternalUriOpenersStore extends Disposable {

	private static readonly STORAGE_ID = 'externalUriOpeners';

	private readonly _openers = new Map<string, RegisteredExternalOpener>();
	private readonly _memento: Memento<OpenersMemento>;
	private _mementoObject: OpenersMemento;

	constructor(
		@IStorageService storageService: IStorageService,
		@IExtensionService private readonly _extensionService: IExtensionService
	) {
		super();

		this._memento = new Memento(ContributedExternalUriOpenersStore.STORAGE_ID, storageService);
		this._mementoObject = this._memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
		for (const [id, value] of Object.entries(this._mementoObject || {})) {
			if (value) {
				this.add(id, value.extensionId, { isCurrentlyRegistered: false });
			}
		}

		this.invalidateOpenersOnExtensionsChanged();

		this._register(this._extensionService.onDidChangeExtensions(() => this.invalidateOpenersOnExtensionsChanged()));
		this._register(this._extensionService.onDidChangeExtensionsStatus(() => this.invalidateOpenersOnExtensionsChanged()));
	}

	public didRegisterOpener(id: string, extensionId: string): void {
		this.add(id, extensionId, {
			isCurrentlyRegistered: true
		});
	}

	private add(id: string, extensionId: string, options: { isCurrentlyRegistered: boolean }): void {
		const existing = this._openers.get(id);
		if (existing) {
			existing.isCurrentlyRegistered = existing.isCurrentlyRegistered || options.isCurrentlyRegistered;
			return;
		}

		const entry = {
			extensionId,
			isCurrentlyRegistered: options.isCurrentlyRegistered
		};
		this._openers.set(id, entry);

		this._mementoObject[id] = entry;
		this._memento.saveMemento();

		this.updateSchema();
	}

	public delete(id: string): void {
		this._openers.delete(id);

		delete this._mementoObject[id];
		this._memento.saveMemento();

		this.updateSchema();
	}

	private async invalidateOpenersOnExtensionsChanged() {
		await this._extensionService.whenInstalledExtensionsRegistered();
		const registeredExtensions = this._extensionService.extensions;

		for (const [id, entry] of this._openers) {
			const extension = registeredExtensions.find(r => r.identifier.value === entry.extensionId);
			if (extension) {
				if (!this._extensionService.canRemoveExtension(extension)) {
					// The extension is running. We should have registered openers at this point
					if (!entry.isCurrentlyRegistered) {
						this.delete(id);
					}
				}
			} else {
				// The opener came from an extension that is no longer enabled/installed
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
