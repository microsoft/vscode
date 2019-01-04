/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IExtensionManagementService, DidUninstallExtensionEvent, IExtensionEnablementService, IExtensionIdentifier, EnablementState, ILocalExtension, isIExtensionIdentifier, LocalExtensionType, DidInstallExtensionEvent, InstallOperation } from 'vs/platform/extensionManagement/common/extensionManagement';
import { getIdFromLocalExtensionId, areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IStorageService, StorageScope, IWorkspaceStorageChangeEvent } from 'vs/platform/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { isUndefinedOrNull } from 'vs/base/common/types';

const DISABLED_EXTENSIONS_STORAGE_PATH = 'extensionsIdentifiers/disabled';
const ENABLED_EXTENSIONS_STORAGE_PATH = 'extensionsIdentifiers/enabled';

export class ExtensionEnablementService extends Disposable implements IExtensionEnablementService {

	_serviceBrand: any;

	private _onEnablementChanged = new Emitter<IExtensionIdentifier>();
	public readonly onEnablementChanged: Event<IExtensionIdentifier> = this._onEnablementChanged.event;

	private readonly storageManger: StorageManager;

	constructor(
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService
	) {
		super();
		this.storageManger = this._register(new StorageManager(storageService));
		this._register(this.storageManger.onDidChange(extensions => this.onDidChangeStorage(extensions)));
		this._register(extensionManagementService.onDidInstallExtension(this._onDidInstallExtension, this));
		this._register(extensionManagementService.onDidUninstallExtension(this._onDidUninstallExtension, this));
	}

	private get hasWorkspace(): boolean {
		return this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
	}

	get allUserExtensionsDisabled(): boolean {
		return this.environmentService.disableExtensions === true;
	}

	async getDisabledExtensions(): Promise<IExtensionIdentifier[]> {

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

		if (this.environmentService.disableExtensions) {
			const allInstalledExtensions = await this.extensionManagementService.getInstalled();
			for (const installedExtension of allInstalledExtensions) {
				if (this._isExtensionDisabledInEnvironment(installedExtension)) {
					if (!result.some(r => areSameExtensions(r, installedExtension.galleryIdentifier))) {
						result.push(installedExtension.galleryIdentifier);
					}
				}
			}
		}

		return result;
	}

	getEnablementState(extension: ILocalExtension): EnablementState {
		if (this._isExtensionDisabledInEnvironment(extension)) {
			return EnablementState.Disabled;
		}
		const identifier = extension.galleryIdentifier;
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

	setEnablement(arg: ILocalExtension | IExtensionIdentifier, newState: EnablementState): Promise<boolean> {
		let identifier: IExtensionIdentifier;
		if (isIExtensionIdentifier(arg)) {
			identifier = arg;
		} else {
			if (!this.canChangeEnablement(arg)) {
				return Promise.resolve(false);
			}
			identifier = arg.galleryIdentifier;
		}

		const workspace = newState === EnablementState.WorkspaceDisabled || newState === EnablementState.WorkspaceEnabled;
		if (workspace && !this.hasWorkspace) {
			return Promise.reject(new Error(localize('noWorkspace', "No workspace.")));
		}

		const currentState = this._getEnablementState(identifier);

		if (currentState === newState) {
			return Promise.resolve(false);
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
		return Promise.resolve(true);
	}

	isEnabled(extension: ILocalExtension): boolean {
		const enablementState = this.getEnablementState(extension);
		return enablementState === EnablementState.WorkspaceEnabled || enablementState === EnablementState.Enabled;
	}

	private _isExtensionDisabledInEnvironment(extension: ILocalExtension): boolean {
		if (this.allUserExtensionsDisabled) {
			return extension.type === LocalExtensionType.User;
		}
		const disabledExtensions = this.environmentService.disableExtensions;
		if (Array.isArray(disabledExtensions)) {
			return disabledExtensions.some(id => areSameExtensions({ id }, extension.galleryIdentifier));
		}
		return false;
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

	private _addToDisabledExtensions(identifier: IExtensionIdentifier, scope: StorageScope): Promise<boolean> {
		if (scope === StorageScope.WORKSPACE && !this.hasWorkspace) {
			return Promise.resolve(false);
		}
		let disabledExtensions = this._getDisabledExtensions(scope);
		if (disabledExtensions.every(e => !areSameExtensions(e, identifier))) {
			disabledExtensions.push(identifier);
			this._setDisabledExtensions(disabledExtensions, scope);
			return Promise.resolve(true);
		}
		return Promise.resolve(false);
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
				this._setDisabledExtensions(disabledExtensions, scope);
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
			this._setEnabledExtensions(enabledExtensions, scope);
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
				this._setEnabledExtensions(enabledExtensions, scope);
				return true;
			}
		}
		return false;
	}

	private _getEnabledExtensions(scope: StorageScope): IExtensionIdentifier[] {
		return this._getExtensions(ENABLED_EXTENSIONS_STORAGE_PATH, scope);
	}

	private _setEnabledExtensions(enabledExtensions: IExtensionIdentifier[], scope: StorageScope): void {
		this._setExtensions(ENABLED_EXTENSIONS_STORAGE_PATH, enabledExtensions, scope);
	}

	private _getDisabledExtensions(scope: StorageScope): IExtensionIdentifier[] {
		return this._getExtensions(DISABLED_EXTENSIONS_STORAGE_PATH, scope);
	}

	private _setDisabledExtensions(disabledExtensions: IExtensionIdentifier[], scope: StorageScope): void {
		this._setExtensions(DISABLED_EXTENSIONS_STORAGE_PATH, disabledExtensions, scope);
	}

	private _getExtensions(storageId: string, scope: StorageScope): IExtensionIdentifier[] {
		if (scope === StorageScope.WORKSPACE && !this.hasWorkspace) {
			return [];
		}
		return this.storageManger.get(storageId, scope);
	}

	private _setExtensions(storageId: string, extensions: IExtensionIdentifier[], scope: StorageScope): void {
		this.storageManger.set(storageId, extensions, scope);
	}

	private onDidChangeStorage(extensions: IExtensionIdentifier[]): void {
		for (const extension of extensions) {
			this._onEnablementChanged.fire(extension);
		}
	}

	private _onDidInstallExtension(event: DidInstallExtensionEvent): void {
		if (event.local && event.operation === InstallOperation.Install) {
			const wasDisabled = !this.isEnabled(event.local);
			this._reset(event.local.galleryIdentifier);
			if (wasDisabled) {
				this._onEnablementChanged.fire(event.local.galleryIdentifier);
			}
		}
	}

	private _onDidUninstallExtension({ identifier, error }: DidUninstallExtensionEvent): void {
		if (!error) {
			const id = getIdFromLocalExtensionId(identifier.id);
			if (id) {
				const extension = { id, uuid: identifier.uuid };
				this._reset(extension);
			}
		}
	}

	private _reset(extension: IExtensionIdentifier) {
		this._removeFromDisabledExtensions(extension, StorageScope.WORKSPACE);
		this._removeFromEnabledExtensions(extension, StorageScope.WORKSPACE);
		this._removeFromDisabledExtensions(extension, StorageScope.GLOBAL);
	}
}

class StorageManager extends Disposable {

	private storage: { [key: string]: string } = Object.create(null);

	private _onDidChange: Emitter<IExtensionIdentifier[]> = this._register(new Emitter<IExtensionIdentifier[]>());
	readonly onDidChange: Event<IExtensionIdentifier[]> = this._onDidChange.event;

	constructor(private storageService: IStorageService) {
		super();
		this._register(storageService.onDidChangeStorage(e => this.onDidStorageChange(e)));
	}

	get(key: string, scope: StorageScope): IExtensionIdentifier[] {
		let value: string;
		if (scope === StorageScope.GLOBAL) {
			if (isUndefinedOrNull(this.storage[key])) {
				this.storage[key] = this._get(key, scope);
			}
			value = this.storage[key];
		} else {
			value = this._get(key, scope);
		}
		return JSON.parse(value);
	}

	set(key: string, value: IExtensionIdentifier[], scope: StorageScope): void {
		let newValue: string = JSON.stringify(value.map(({ id, uuid }) => (<IExtensionIdentifier>{ id, uuid })));
		const oldValue = this._get(key, scope);
		if (oldValue !== newValue) {
			if (scope === StorageScope.GLOBAL) {
				if (value.length) {
					this.storage[key] = newValue;
				} else {
					delete this.storage[key];
				}
			}
			this._set(key, value.length ? newValue : undefined, scope);
		}
	}

	private onDidStorageChange(workspaceStorageChangeEvent: IWorkspaceStorageChangeEvent): void {
		if (workspaceStorageChangeEvent.scope === StorageScope.GLOBAL) {
			if (!isUndefinedOrNull(this.storage[workspaceStorageChangeEvent.key])) {
				const newValue = this._get(workspaceStorageChangeEvent.key, workspaceStorageChangeEvent.scope);
				if (newValue !== this.storage[workspaceStorageChangeEvent.key]) {
					const oldValues = this.get(workspaceStorageChangeEvent.key, workspaceStorageChangeEvent.scope);
					delete this.storage[workspaceStorageChangeEvent.key];
					const newValues = this.get(workspaceStorageChangeEvent.key, workspaceStorageChangeEvent.scope);
					const added = oldValues.filter(oldValue => !newValues.some(newValue => areSameExtensions(oldValue, newValue)));
					const removed = newValues.filter(newValue => !oldValues.some(oldValue => areSameExtensions(oldValue, newValue)));
					if (added.length || removed.length) {
						this._onDidChange.fire([...added, ...removed]);
					}
				}
			}
		}
	}

	private _get(key: string, scope: StorageScope): string {
		return this.storageService.get(key, scope, '[]');
	}

	private _set(key: string, value: string | undefined, scope: StorageScope): void {
		if (value) {
			this.storageService.store(key, value, scope);
		} else {
			this.storageService.remove(key, scope);
		}
	}

}