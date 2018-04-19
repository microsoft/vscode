/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IExtensionManagementService, DidUninstallExtensionEvent, IExtensionEnablementService, IExtensionIdentifier, EnablementState, ILocalExtension, isIExtensionIdentifier, LocalExtensionType } from 'vs/platform/extensionManagement/common/extensionManagement';
import { getIdFromLocalExtensionId, areSameExtensions, getGalleryExtensionIdFromLocal } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

const DISABLED_EXTENSIONS_STORAGE_PATH = 'extensionsIdentifiers/disabled';
const ENABLED_EXTENSIONS_STORAGE_PATH = 'extensionsIdentifiers/enabled';

export class ExtensionEnablementService implements IExtensionEnablementService {

	_serviceBrand: any;

	private disposables: IDisposable[] = [];

	private _onEnablementChanged = new Emitter<IExtensionIdentifier>();
	public readonly onEnablementChanged: Event<IExtensionIdentifier> = this._onEnablementChanged.event;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IExtensionManagementService extensionManagementService: IExtensionManagementService
	) {
		extensionManagementService.onDidUninstallExtension(this._onDidUninstallExtension, this, this.disposables);
	}

	private get hasWorkspace(): boolean {
		return this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
	}

	getDisabledExtensions(): TPromise<IExtensionIdentifier[]> {

		let result = this._getDisabledExtensions(StorageScope.GLOBAL);

		if (this.hasWorkspace) {
			for (const e of this._getDisabledExtensions(StorageScope.WORKSPACE)) {
				if (!result.some(r => areSameExtensions(r, e))) {
					result.push(e);
				}
			}
			const workspaceEnabledExtensions = this._getEnabledExtensions(StorageScope.WORKSPACE);
			if (workspaceEnabledExtensions.length) {
				result = result.filter(r => !workspaceEnabledExtensions.some(e => areSameExtensions(e, r)));
			}
		}

		return TPromise.as(result);
	}

	getEnablementState(extension: ILocalExtension): EnablementState {
		if (this.environmentService.disableExtensions && extension.type === LocalExtensionType.User) {
			return EnablementState.Disabled;
		}
		const identifier = this._getIdentifier(extension);
		if (this.hasWorkspace) {
			if (this._getEnabledExtensions(StorageScope.WORKSPACE).filter(e => areSameExtensions(e, identifier))[0]) {
				return EnablementState.WorkspaceEnabled;
			}

			if (this._getDisabledExtensions(StorageScope.WORKSPACE).filter(e => areSameExtensions(e, identifier))[0]) {
				return EnablementState.WorkspaceDisabled;
			}
		}
		if (this._getDisabledExtensions(StorageScope.GLOBAL).filter(e => areSameExtensions(e, identifier))[0]) {
			return EnablementState.Disabled;
		}
		return EnablementState.Enabled;
	}

	canChangeEnablement(extension: ILocalExtension): boolean {
		if (extension.manifest && extension.manifest.contributes && extension.manifest.contributes.localizations && extension.manifest.contributes.localizations.length) {
			return false;
		}
		if (extension.type === LocalExtensionType.User && this.environmentService.disableExtensions) {
			return false;
		}
		return true;
	}

	setEnablement(arg: ILocalExtension | IExtensionIdentifier, newState: EnablementState): TPromise<boolean> {
		let identifier: IExtensionIdentifier;
		if (isIExtensionIdentifier(arg)) {
			identifier = arg;
		} else {
			if (!this.canChangeEnablement(arg)) {
				return TPromise.wrap(false);
			}
			identifier = this._getIdentifier(arg);
		}

		const workspace = newState === EnablementState.WorkspaceDisabled || newState === EnablementState.WorkspaceEnabled;
		if (workspace && !this.hasWorkspace) {
			return TPromise.wrapError<boolean>(new Error(localize('noWorkspace', "No workspace.")));
		}

		const currentState = this._getEnablementState(identifier);

		if (currentState === newState) {
			return TPromise.as(false);
		}


		switch (newState) {
			case EnablementState.Enabled:
				this._enableExtension(identifier);
				break;
			case EnablementState.Disabled:
				this._disableExtension(identifier);
				break;
			case EnablementState.WorkspaceEnabled:
				this._enableExtensionInWorkspace(identifier);
				break;
			case EnablementState.WorkspaceDisabled:
				this._disableExtensionInWorkspace(identifier);
				break;
		}

		this._onEnablementChanged.fire(identifier);
		return TPromise.as(true);
	}

	isEnabled(extension: ILocalExtension): boolean {
		const enablementState = this.getEnablementState(extension);
		return enablementState === EnablementState.WorkspaceEnabled || enablementState === EnablementState.Enabled;
	}

	private _getEnablementState(identifier: IExtensionIdentifier): EnablementState {
		if (this.hasWorkspace) {
			if (this._getEnabledExtensions(StorageScope.WORKSPACE).filter(e => areSameExtensions(e, identifier))[0]) {
				return EnablementState.WorkspaceEnabled;
			}

			if (this._getDisabledExtensions(StorageScope.WORKSPACE).filter(e => areSameExtensions(e, identifier))[0]) {
				return EnablementState.WorkspaceDisabled;
			}
		}
		if (this._getDisabledExtensions(StorageScope.GLOBAL).filter(e => areSameExtensions(e, identifier))[0]) {
			return EnablementState.Disabled;
		}
		return EnablementState.Enabled;
	}

	private _getIdentifier(extension: ILocalExtension): IExtensionIdentifier {
		return { id: getGalleryExtensionIdFromLocal(extension), uuid: extension.identifier.uuid };
	}

	private _enableExtension(identifier: IExtensionIdentifier): void {
		this._removeFromDisabledExtensions(identifier, StorageScope.WORKSPACE);
		this._removeFromEnabledExtensions(identifier, StorageScope.WORKSPACE);
		this._removeFromDisabledExtensions(identifier, StorageScope.GLOBAL);
	}

	private _disableExtension(identifier: IExtensionIdentifier): void {
		this._removeFromDisabledExtensions(identifier, StorageScope.WORKSPACE);
		this._removeFromEnabledExtensions(identifier, StorageScope.WORKSPACE);
		this._addToDisabledExtensions(identifier, StorageScope.GLOBAL);
	}

	private _enableExtensionInWorkspace(identifier: IExtensionIdentifier): void {
		this._removeFromDisabledExtensions(identifier, StorageScope.WORKSPACE);
		this._addToEnabledExtensions(identifier, StorageScope.WORKSPACE);
	}

	private _disableExtensionInWorkspace(identifier: IExtensionIdentifier): void {
		this._addToDisabledExtensions(identifier, StorageScope.WORKSPACE);
		this._removeFromEnabledExtensions(identifier, StorageScope.WORKSPACE);
	}

	private _addToDisabledExtensions(identifier: IExtensionIdentifier, scope: StorageScope): TPromise<boolean> {
		if (scope === StorageScope.WORKSPACE && !this.hasWorkspace) {
			return TPromise.wrap(false);
		}
		let disabledExtensions = this._getDisabledExtensions(scope);
		if (disabledExtensions.every(e => !areSameExtensions(e, identifier))) {
			disabledExtensions.push(identifier);
			this._setDisabledExtensions(disabledExtensions, scope, identifier);
			return TPromise.wrap(true);
		}
		return TPromise.wrap(false);
	}

	private _removeFromDisabledExtensions(identifier: IExtensionIdentifier, scope: StorageScope): boolean {
		if (scope === StorageScope.WORKSPACE && !this.hasWorkspace) {
			return false;
		}
		let disabledExtensions = this._getDisabledExtensions(scope);
		for (let index = 0; index < disabledExtensions.length; index++) {
			const disabledExtension = disabledExtensions[index];
			if (areSameExtensions(disabledExtension, identifier)) {
				disabledExtensions.splice(index, 1);
				this._setDisabledExtensions(disabledExtensions, scope, identifier);
				return true;
			}
		}
		return false;
	}

	private _addToEnabledExtensions(identifier: IExtensionIdentifier, scope: StorageScope): boolean {
		if (scope === StorageScope.WORKSPACE && !this.hasWorkspace) {
			return false;
		}
		let enabledExtensions = this._getEnabledExtensions(scope);
		if (enabledExtensions.every(e => !areSameExtensions(e, identifier))) {
			enabledExtensions.push(identifier);
			this._setEnabledExtensions(enabledExtensions, scope, identifier);
			return true;
		}
		return false;
	}

	private _removeFromEnabledExtensions(identifier: IExtensionIdentifier, scope: StorageScope): boolean {
		if (scope === StorageScope.WORKSPACE && !this.hasWorkspace) {
			return false;
		}
		let enabledExtensions = this._getEnabledExtensions(scope);
		for (let index = 0; index < enabledExtensions.length; index++) {
			const disabledExtension = enabledExtensions[index];
			if (areSameExtensions(disabledExtension, identifier)) {
				enabledExtensions.splice(index, 1);
				this._setEnabledExtensions(enabledExtensions, scope, identifier);
				return true;
			}
		}
		return false;
	}

	private _getEnabledExtensions(scope: StorageScope): IExtensionIdentifier[] {
		return this._getExtensions(ENABLED_EXTENSIONS_STORAGE_PATH, scope);
	}

	private _setEnabledExtensions(enabledExtensions: IExtensionIdentifier[], scope: StorageScope, extension: IExtensionIdentifier): void {
		this._setExtensions(ENABLED_EXTENSIONS_STORAGE_PATH, enabledExtensions, scope, extension);
	}

	private _getDisabledExtensions(scope: StorageScope): IExtensionIdentifier[] {
		return this._getExtensions(DISABLED_EXTENSIONS_STORAGE_PATH, scope);
	}

	private _setDisabledExtensions(disabledExtensions: IExtensionIdentifier[], scope: StorageScope, extension: IExtensionIdentifier): void {
		this._setExtensions(DISABLED_EXTENSIONS_STORAGE_PATH, disabledExtensions, scope, extension);
	}

	private _getExtensions(storageId: string, scope: StorageScope): IExtensionIdentifier[] {
		if (scope === StorageScope.WORKSPACE && !this.hasWorkspace) {
			return [];
		}
		const value = this.storageService.get(storageId, scope, '');
		return value ? JSON.parse(value) : [];
	}

	private _setExtensions(storageId: string, extensions: IExtensionIdentifier[], scope: StorageScope, extension: IExtensionIdentifier): void {
		if (extensions.length) {
			this.storageService.store(storageId, JSON.stringify(extensions.map(({ id, uuid }) => (<IExtensionIdentifier>{ id, uuid }))), scope);
		} else {
			this.storageService.remove(storageId, scope);
		}
	}

	private _onDidUninstallExtension({ identifier, error }: DidUninstallExtensionEvent): void {
		if (!error) {
			const id = getIdFromLocalExtensionId(identifier.id);
			if (id) {
				const extension = { id, uuid: identifier.uuid };
				this._removeFromDisabledExtensions(extension, StorageScope.WORKSPACE);
				this._removeFromEnabledExtensions(extension, StorageScope.WORKSPACE);
				this._removeFromDisabledExtensions(extension, StorageScope.GLOBAL);
			}
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}