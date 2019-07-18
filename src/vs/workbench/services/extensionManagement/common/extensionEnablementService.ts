/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IExtensionManagementService, DidUninstallExtensionEvent, IExtensionIdentifier, DidInstallExtensionEvent, InstallOperation } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionEnablementService, EnablementState, IExtensionManagementServerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IStorageService, StorageScope, IWorkspaceStorageChangeEvent } from 'vs/platform/storage/common/storage';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { ExtensionType, IExtension } from 'vs/platform/extensions/common/extensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { isUIExtension } from 'vs/workbench/services/extensions/common/extensionsUtil';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IProductService } from 'vs/platform/product/common/product';

const DISABLED_EXTENSIONS_STORAGE_PATH = 'extensionsIdentifiers/disabled';
const ENABLED_EXTENSIONS_STORAGE_PATH = 'extensionsIdentifiers/enabled';

export class ExtensionEnablementService extends Disposable implements IExtensionEnablementService {

	_serviceBrand: any;

	private _onEnablementChanged = new Emitter<IExtension[]>();
	public readonly onEnablementChanged: Event<IExtension[]> = this._onEnablementChanged.event;

	private readonly storageManger: StorageManager;

	constructor(
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IProductService private readonly productService: IProductService,
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

	getEnablementState(extension: IExtension): EnablementState {
		if (this._isDisabledInEnv(extension)) {
			return EnablementState.DisabledByEnvironemt;
		}
		if (this._isDisabledByExtensionKind(extension)) {
			return EnablementState.DisabledByExtensionKind;
		}
		const identifier = extension.identifier;
		if (this.hasWorkspace) {
			if (this._getEnabledExtensions(StorageScope.WORKSPACE).filter(e => areSameExtensions(e, identifier))[0]) {
				return EnablementState.EnabledWorkspace;
			}

			if (this._getDisabledExtensions(StorageScope.WORKSPACE).filter(e => areSameExtensions(e, identifier))[0]) {
				return EnablementState.DisabledWorkspace;
			}
		}
		if (this._getDisabledExtensions(StorageScope.GLOBAL).filter(e => areSameExtensions(e, identifier))[0]) {
			return EnablementState.DisabledGlobally;
		}
		return EnablementState.EnabledGlobally;
	}

	canChangeEnablement(extension: IExtension): boolean {
		if (extension.manifest && extension.manifest.contributes && extension.manifest.contributes.localizations && extension.manifest.contributes.localizations.length) {
			return false;
		}
		const enablementState = this.getEnablementState(extension);
		if (enablementState === EnablementState.DisabledByEnvironemt || enablementState === EnablementState.DisabledByExtensionKind) {
			return false;
		}
		return true;
	}

	async setEnablement(extensions: IExtension[], newState: EnablementState): Promise<boolean[]> {

		const workspace = newState === EnablementState.DisabledWorkspace || newState === EnablementState.EnabledWorkspace;
		if (workspace && !this.hasWorkspace) {
			return Promise.reject(new Error(localize('noWorkspace', "No workspace.")));
		}

		const result = await Promise.all(extensions.map(e => this._setEnablement(e, newState)));
		const changedExtensions = extensions.filter((e, index) => result[index]);
		if (changedExtensions.length) {
			this._onEnablementChanged.fire(changedExtensions);
		}
		return result;
	}

	private _setEnablement(extension: IExtension, newState: EnablementState): Promise<boolean> {

		const currentState = this._getEnablementState(extension.identifier);

		if (currentState === newState) {
			return Promise.resolve(false);
		}

		switch (newState) {
			case EnablementState.EnabledGlobally:
				this._enableExtension(extension.identifier);
				break;
			case EnablementState.DisabledGlobally:
				this._disableExtension(extension.identifier);
				break;
			case EnablementState.EnabledWorkspace:
				this._enableExtensionInWorkspace(extension.identifier);
				break;
			case EnablementState.DisabledWorkspace:
				this._disableExtensionInWorkspace(extension.identifier);
				break;
		}

		return Promise.resolve(true);
	}

	isEnabled(extension: IExtension): boolean {
		const enablementState = this.getEnablementState(extension);
		return enablementState === EnablementState.EnabledWorkspace || enablementState === EnablementState.EnabledGlobally;
	}

	private _isDisabledInEnv(extension: IExtension): boolean {
		if (this.allUserExtensionsDisabled) {
			return extension.type === ExtensionType.User;
		}
		const disabledExtensions = this.environmentService.disableExtensions;
		if (Array.isArray(disabledExtensions)) {
			return disabledExtensions.some(id => areSameExtensions({ id }, extension.identifier));
		}
		return false;
	}

	private _isDisabledByExtensionKind(extension: IExtension): boolean {
		if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
			const server = isUIExtension(extension.manifest, this.productService, this.configurationService) ? this.extensionManagementServerService.localExtensionManagementServer : this.extensionManagementServerService.remoteExtensionManagementServer;
			return this.extensionManagementServerService.getExtensionManagementServer(extension.location) !== server;
		}
		return false;
	}

	private _getEnablementState(identifier: IExtensionIdentifier): EnablementState {
		if (this.hasWorkspace) {
			if (this._getEnabledExtensions(StorageScope.WORKSPACE).filter(e => areSameExtensions(e, identifier))[0]) {
				return EnablementState.EnabledWorkspace;
			}

			if (this._getDisabledExtensions(StorageScope.WORKSPACE).filter(e => areSameExtensions(e, identifier))[0]) {
				return EnablementState.DisabledWorkspace;
			}
		}
		if (this._getDisabledExtensions(StorageScope.GLOBAL).filter(e => areSameExtensions(e, identifier))[0]) {
			return EnablementState.DisabledGlobally;
		}
		return EnablementState.EnabledGlobally;
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

	protected _getEnabledExtensions(scope: StorageScope): IExtensionIdentifier[] {
		return this._getExtensions(ENABLED_EXTENSIONS_STORAGE_PATH, scope);
	}

	private _setEnabledExtensions(enabledExtensions: IExtensionIdentifier[], scope: StorageScope): void {
		this._setExtensions(ENABLED_EXTENSIONS_STORAGE_PATH, enabledExtensions, scope);
	}

	protected _getDisabledExtensions(scope: StorageScope): IExtensionIdentifier[] {
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

	private async onDidChangeStorage(extensionIdentifiers: IExtensionIdentifier[]): Promise<void> {
		const installedExtensions = await this.extensionManagementService.getInstalled();
		const extensions = installedExtensions.filter(installedExtension => extensionIdentifiers.some(identifier => areSameExtensions(identifier, installedExtension.identifier)));
		this._onEnablementChanged.fire(extensions);
	}

	private _onDidInstallExtension(event: DidInstallExtensionEvent): void {
		if (event.local && event.operation === InstallOperation.Install) {
			const wasDisabled = !this.isEnabled(event.local);
			this._reset(event.local.identifier);
			if (wasDisabled) {
				this._onEnablementChanged.fire([event.local]);
			}
		}
	}

	private _onDidUninstallExtension({ identifier, error }: DidUninstallExtensionEvent): void {
		if (!error) {
			this._reset(identifier);
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

registerSingleton(IExtensionEnablementService, ExtensionEnablementService, true);