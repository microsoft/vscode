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
import { IMessageService } from 'vs/platform/message/common/message';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

const DISABLED_EXTENSIONS_STORAGE_PATH = 'extensions/disabled';

export class ExtensionEnablementService implements IExtensionEnablementService {

	_serviceBrand: any;

	private workspace: IWorkspace;
	private disposables: IDisposable[] = [];

	private _onEnablementChanged = new Emitter<string>();
	public onEnablementChanged: Event<string> = this._onEnablementChanged.event;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IMessageService private messageService: IMessageService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService
	) {
		this.workspace = contextService.getWorkspace();
		extensionManagementService.onDidUninstallExtension(this.onDidUninstallExtension, this, this.disposables);
	}

	public getGloballyDisabledExtensions(): string[] {
		return this.getDisabledExtensionsFromStorage(StorageScope.GLOBAL);
	}

	public getWorkspaceDisabledExtensions(): string[] {
		return this.getDisabledExtensionsFromStorage(StorageScope.WORKSPACE);
	}

	public canEnable(identifier: string): boolean {
		return !this.environmentService.disableExtensions && this.isDisabled(identifier);
	}

	public setEnablement(identifier: string, enable: boolean, workspace: boolean = false): TPromise<boolean> {
		if (workspace && !this.workspace) {
			return TPromise.wrapError(localize('noWorkspace', "No workspace."));
		}

		if (this.environmentService.disableExtensions) {
			return TPromise.wrap(false);
		}

		if (this.isDisabled(identifier) === !enable) {
			return TPromise.wrap(false);
		}

		if (enable) {
			if (workspace) {
				this.enableExtension(identifier, StorageScope.WORKSPACE);
			} else {
				this.enableExtension(identifier, StorageScope.GLOBAL);
			}
		} else {
			if (workspace) {
				this.disableExtension(identifier, StorageScope.WORKSPACE);
			} else {
				this.disableExtension(identifier, StorageScope.GLOBAL);
			}
		}

		return TPromise.wrap(true);
	}

	private getDisabledExtensions(): string[] {
		const globalDisabledExtensions = this.getGloballyDisabledExtensions();
		const workspaceDisabledExtensions = this.getWorkspaceDisabledExtensions();
		return distinct([...workspaceDisabledExtensions, ...globalDisabledExtensions]);
	}

	private isDisabled(identifier: string): boolean {
		return this.getDisabledExtensions().indexOf(identifier) !== -1;
	}

	private getDisabledExtensionsFromStorage(scope?: StorageScope): string[] {
		if (scope !== void 0) {
			return this._getDisabledExtensions(scope);
		}

		const globallyDisabled = this._getDisabledExtensions(StorageScope.GLOBAL);
		const workspaceDisabled = this._getDisabledExtensions(StorageScope.WORKSPACE);
		return [...globallyDisabled, ...workspaceDisabled];
	}

	private disableExtension(identifier: string, scope: StorageScope): TPromise<boolean> {
		let disabledExtensions = this._getDisabledExtensions(scope);
		disabledExtensions.push(identifier);
		this._setDisabledExtensions(disabledExtensions, scope, identifier);
		return TPromise.wrap(true);
	}

	private enableExtension(identifier: string, scope: StorageScope): TPromise<boolean> {
		let disabledExtensions = this._getDisabledExtensions(scope);
		const index = disabledExtensions.indexOf(identifier);
		if (index !== -1) {
			disabledExtensions.splice(index, 1);
			this._setDisabledExtensions(disabledExtensions, scope, identifier);
		}
		return TPromise.wrap(true);
	}

	private _getDisabledExtensions(scope: StorageScope): string[] {
		const value = this.storageService.get(DISABLED_EXTENSIONS_STORAGE_PATH, scope, '');
		return value ? distinct(value.split(',')) : [];
	}

	private _setDisabledExtensions(disabledExtensions: string[], scope: StorageScope, extension: string): void {
		if (disabledExtensions.length) {
			this.storageService.store(DISABLED_EXTENSIONS_STORAGE_PATH, disabledExtensions.join(','), scope);
		} else {
			this.storageService.remove(DISABLED_EXTENSIONS_STORAGE_PATH, scope);
		}
		this._onEnablementChanged.fire(extension);
	}

	private onDidUninstallExtension({id, error}: DidUninstallExtensionEvent): void {
		if (!error) {
			id = stripVersion(id);
			this.enableExtension(id, StorageScope.WORKSPACE);
			this.enableExtension(id, StorageScope.GLOBAL);
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

function stripVersion(id: string): string {
	return id.replace(/-\d+\.\d+\.\d+$/, '');
}