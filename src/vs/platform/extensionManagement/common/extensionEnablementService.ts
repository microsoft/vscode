/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { distinct } from 'vs/base/common/arrays';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IExtensionManagementService, DidUninstallExtensionEvent, IExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkspaceContextService, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

const DISABLED_EXTENSIONS_STORAGE_PATH = 'extensions/disabled';

export class ExtensionEnablementService implements IExtensionEnablementService {

	_serviceBrand: any;

	private disposables: IDisposable[] = [];

	private _onEnablementChanged = new Emitter<string>();
	public onEnablementChanged: Event<string> = this._onEnablementChanged.event;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService
	) {
		extensionManagementService.onDidUninstallExtension(this.onDidUninstallExtension, this, this.disposables);
	}

	private get workspace(): IWorkspace {
		return this.contextService.getWorkspace();
	}

	public getGloballyDisabledExtensions(): string[] {
		return this.getDisabledExtensions(StorageScope.GLOBAL);
	}

	public getWorkspaceDisabledExtensions(): string[] {
		return this.getDisabledExtensions(StorageScope.WORKSPACE);
	}

	public canEnable(identifier: string): boolean {
		if (this.environmentService.disableExtensions) {
			return false;
		}
		if (this.getGloballyDisabledExtensions().indexOf(identifier) !== -1) {
			return true;
		}
		if (this.getWorkspaceDisabledExtensions().indexOf(identifier) !== -1) {
			return true;
		}
		return false;
	}

	public setEnablement(identifier: string, enable: boolean, workspace: boolean = false): TPromise<boolean> {
		if (workspace && !this.workspace) {
			return TPromise.wrapError(localize('noWorkspace', "No workspace."));
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

	private disableExtension(identifier: string, scope: StorageScope): TPromise<boolean> {
		let disabledExtensions = this.getDisabledExtensions(scope);
		const index = disabledExtensions.indexOf(identifier);
		if (index === -1) {
			disabledExtensions.push(identifier);
			this.setDisabledExtensions(disabledExtensions, scope, identifier);
			return TPromise.wrap(true);
		}
		return TPromise.wrap(false);
	}

	private enableExtension(identifier: string, scope: StorageScope, fireEvent = true): TPromise<boolean> {
		let disabledExtensions = this.getDisabledExtensions(scope);
		const index = disabledExtensions.indexOf(identifier);
		if (index !== -1) {
			disabledExtensions.splice(index, 1);
			this.setDisabledExtensions(disabledExtensions, scope, identifier, fireEvent);
			return TPromise.wrap(true);
		}
		return TPromise.wrap(false);
	}

	private getDisabledExtensions(scope: StorageScope): string[] {
		if (scope === StorageScope.WORKSPACE && !this.workspace) {
			return [];
		}
		const value = this.storageService.get(DISABLED_EXTENSIONS_STORAGE_PATH, scope, '');
		return value ? distinct(value.split(',')) : [];
	}

	private setDisabledExtensions(disabledExtensions: string[], scope: StorageScope, extension: string, fireEvent = true): void {
		if (disabledExtensions.length) {
			this.storageService.store(DISABLED_EXTENSIONS_STORAGE_PATH, disabledExtensions.join(','), scope);
		} else {
			this.storageService.remove(DISABLED_EXTENSIONS_STORAGE_PATH, scope);
		}
		if (fireEvent) {
			this._onEnablementChanged.fire(extension);
		}
	}

	private onDidUninstallExtension({id, error}: DidUninstallExtensionEvent): void {
		if (!error) {
			id = stripVersion(id);
			this.enableExtension(id, StorageScope.WORKSPACE, false);
			this.enableExtension(id, StorageScope.GLOBAL, false);
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

function stripVersion(id: string): string {
	return id.replace(/-\d+\.\d+\.\d+$/, '');
}