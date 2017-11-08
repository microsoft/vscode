/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { distinct, coalesce } from 'vs/base/common/arrays';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IExtensionManagementService, DidUninstallExtensionEvent, IExtensionEnablementService, IExtensionIdentifier } from 'vs/platform/extensionManagement/common/extensionManagement';
import { adoptToGalleryExtensionId, getIdAndVersionFromLocalExtensionId, areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

const DISABLED_EXTENSIONS_STORAGE_PATH = 'extensionsIdentifiers/disabled';

export class ExtensionEnablementService implements IExtensionEnablementService {

	_serviceBrand: any;

	private disposables: IDisposable[] = [];

	private _onEnablementChanged = new Emitter<IExtensionIdentifier>();
	public onEnablementChanged: Event<IExtensionIdentifier> = this._onEnablementChanged.event;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		// @ts-ignore unused injected service
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService
	) {
		extensionManagementService.onDidUninstallExtension(this.onDidUninstallExtension, this, this.disposables);
	}

	private get hasWorkspace(): boolean {
		return this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
	}

	getGloballyDisabledExtensions(): IExtensionIdentifier[] {
		return this.getDisabledExtensions(StorageScope.GLOBAL);
	}

	getWorkspaceDisabledExtensions(): IExtensionIdentifier[] {
		return this.getDisabledExtensions(StorageScope.WORKSPACE);
	}

	canEnable(identifier: IExtensionIdentifier): boolean {
		if (this.environmentService.disableExtensions) {
			return false;
		}
		return !this.isEnabled(identifier);
	}

	isEnabled(identifier: IExtensionIdentifier): boolean {
		if (this.environmentService.disableExtensions) {
			return false;
		}
		if (this.getGloballyDisabledExtensions().some(d => areSameExtensions(d, identifier))) {
			return false;
		}
		if (this.getWorkspaceDisabledExtensions().some(d => areSameExtensions(d, identifier))) {
			return false;
		}
		return true;
	}

	setEnablement(identifier: IExtensionIdentifier, enable: boolean, workspace: boolean = false): TPromise<boolean> {
		if (workspace && !this.hasWorkspace) {
			return TPromise.wrapError<boolean>(new Error(localize('noWorkspace', "No workspace.")));
		}

		if (this.environmentService.disableExtensions) {
			return TPromise.wrap(false);
		}

		if (enable) {
			if (workspace) {
				return this.enableExtension(identifier, StorageScope.WORKSPACE);
			} else {
				return this.enableExtension(identifier, StorageScope.GLOBAL);
			}
		} else {
			if (workspace) {
				return this.disableExtension(identifier, StorageScope.WORKSPACE);
			} else {
				return this.disableExtension(identifier, StorageScope.GLOBAL);
			}
		}
	}

	migrateToIdentifiers(installed: IExtensionIdentifier[]): void {
		this.migrateDisabledExtensions(installed, StorageScope.GLOBAL);
		if (this.hasWorkspace) {
			this.migrateDisabledExtensions(installed, StorageScope.WORKSPACE);
		}
	}

	private disableExtension(identifier: IExtensionIdentifier, scope: StorageScope): TPromise<boolean> {
		let disabledExtensions = this.getDisabledExtensions(scope);
		if (disabledExtensions.every(e => !areSameExtensions(e, identifier))) {
			disabledExtensions.push(identifier);
			this.setDisabledExtensions(disabledExtensions, scope, identifier);
			return TPromise.wrap(true);
		}
		return TPromise.wrap(false);
	}

	private enableExtension(identifier: IExtensionIdentifier, scope: StorageScope, fireEvent = true): TPromise<boolean> {
		let disabledExtensions = this.getDisabledExtensions(scope);
		for (let index = 0; index < disabledExtensions.length; index++) {
			const disabledExtension = disabledExtensions[index];
			if (areSameExtensions(disabledExtension, identifier)) {
				disabledExtensions.splice(index, 1);
				this.setDisabledExtensions(disabledExtensions, scope, identifier, fireEvent);
				return TPromise.wrap(true);
			}
		}
		return TPromise.wrap(false);
	}

	private getDisabledExtensions(scope: StorageScope): IExtensionIdentifier[] {
		if (scope === StorageScope.WORKSPACE && !this.hasWorkspace) {
			return [];
		}
		const value = this.storageService.get(DISABLED_EXTENSIONS_STORAGE_PATH, scope, '');
		return value ? JSON.parse(value) : [];
	}

	private setDisabledExtensions(disabledExtensions: IExtensionIdentifier[], scope: StorageScope, extension: IExtensionIdentifier, fireEvent = true): void {
		if (disabledExtensions.length) {
			this.storageService.store(DISABLED_EXTENSIONS_STORAGE_PATH, JSON.stringify(disabledExtensions.map(({ id, uuid }) => (<IExtensionIdentifier>{ id, uuid }))), scope);
		} else {
			this.storageService.remove(DISABLED_EXTENSIONS_STORAGE_PATH, scope);
		}
		if (fireEvent) {
			this._onEnablementChanged.fire(extension);
		}
	}

	private migrateDisabledExtensions(installedExtensions: IExtensionIdentifier[], scope: StorageScope): void {
		const oldValue = this.storageService.get('extensions/disabled', scope, '');
		if (oldValue) {
			const extensionIdentifiers = coalesce(distinct(oldValue.split(',')).map(id => {
				id = adoptToGalleryExtensionId(id);
				const matched = installedExtensions.filter(installed => areSameExtensions({ id }, { id: installed.id }))[0];
				return matched ? { id: matched.id, uuid: matched.uuid } : null;
			}));
			if (extensionIdentifiers.length) {
				this.storageService.store(DISABLED_EXTENSIONS_STORAGE_PATH, JSON.stringify(extensionIdentifiers), scope);
			}
		}
		this.storageService.remove('extensions/disabled', scope);
	}

	private onDidUninstallExtension({ identifier, error }: DidUninstallExtensionEvent): void {
		if (!error) {
			const id = getIdAndVersionFromLocalExtensionId(identifier.id).id;
			if (id) {
				const extension = { id, uuid: identifier.uuid };
				this.enableExtension(extension, StorageScope.WORKSPACE, false);
				this.enableExtension(extension, StorageScope.GLOBAL, false);
			}
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}