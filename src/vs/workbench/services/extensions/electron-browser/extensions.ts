/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { distinct } from 'vs/base/common/arrays';
import { IWorkspaceContextService, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { IExtensionsRuntimeService } from 'vs/platform/extensions/common/extensions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IChoiceService, Severity } from 'vs/platform/message/common/message';

const DISABLED_EXTENSIONS_STORAGE_PATH = 'extensions/disabled';

export class ExtensionsRuntimeService implements IExtensionsRuntimeService {

	_serviceBrand: any;

	private workspace: IWorkspace;
	private allDisabledExtensions: string[];
	private globalDisabledExtensions: string[];
	private workspaceDisabledExtensions: string[];

	constructor(
		@IStorageService private storageService: IStorageService,
		@IChoiceService private choiceService: IChoiceService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		this.workspace = contextService.getWorkspace();
	}

	public setEnablement(identifier: string, enable: boolean, displayName: string): TPromise<boolean> {
		const disabled = this.getDisabledExtensionsFromStorage().indexOf(identifier) !== -1;

		if (!enable === disabled) {
			return TPromise.wrap(true);
		}

		if (!this.workspace) {
			return this.setGlobalEnablement(identifier, enable, displayName);
		}

		if (enable) {
			if (this.getDisabledExtensionsFromStorage(StorageScope.GLOBAL).indexOf(identifier) !== -1) {
				return this.choiceService.choose(Severity.Info, localize('enableExtensionGlobally', "Would you like to enable '{0}' extension globally?", displayName),
					[localize('yes', "Yes"), localize('no', "No")])
					.then((option) => {
						if (option === 0) {
							return TPromise.join([this.enableExtension(identifier, StorageScope.GLOBAL), this.enableExtension(identifier, StorageScope.WORKSPACE)]).then(() => true);
						}
						return TPromise.wrap(false);
					});
			}
			return this.choiceService.choose(Severity.Info, localize('enableExtensionForWorkspace', "Would you like to enable '{0}' extension for this workspace?", displayName),
				[localize('yes', "Yes"), localize('no', "No")])
				.then((option) => {
					if (option === 0) {
						return this.enableExtension(identifier, StorageScope.WORKSPACE).then(() => true);
					}
					return TPromise.wrap(false);
				});
		} else {
			return this.choiceService.choose(Severity.Info, localize('disableExtension', "Would you like to disable '{0}' extension for this workspace or globally?", displayName),
				[localize('workspace', "Workspace"), localize('globally', "Globally"), localize('cancel', "Cancel")])
				.then((option) => {
					switch (option) {
						case 0:
							return this.disableExtension(identifier, StorageScope.WORKSPACE);
						case 1:
							return this.disableExtension(identifier, StorageScope.GLOBAL);
						default: return TPromise.wrap(false);
					}
				});
		}
	}

	public getDisabledExtensions(workspace?: boolean): string[] {
		if (!this.allDisabledExtensions) {
			this.globalDisabledExtensions = this.getDisabledExtensionsFromStorage(StorageScope.GLOBAL);
			this.workspaceDisabledExtensions = this.getDisabledExtensionsFromStorage(StorageScope.WORKSPACE);
			this.allDisabledExtensions = distinct([...this.globalDisabledExtensions, ...this.workspaceDisabledExtensions]);
		}

		if (workspace === void 0) {
			return this.allDisabledExtensions;
		}

		if (workspace) {
			return this.workspaceDisabledExtensions;
		}

		return this.globalDisabledExtensions;
	}

	private getDisabledExtensionsFromStorage(scope?: StorageScope): string[] {
		if (scope !== void 0) {
			return this._getDisabledExtensions(scope);
		}

		const globallyDisabled = this._getDisabledExtensions(StorageScope.GLOBAL);
		const workspaceDisabled = this._getDisabledExtensions(StorageScope.WORKSPACE);
		return [...globallyDisabled, ...workspaceDisabled];
	}

	private setGlobalEnablement(identifier: string, enable: boolean, displayName: string): TPromise<boolean> {
		if (enable) {
			return this.choiceService.choose(Severity.Info, localize('enableExtensionGloballyNoWorkspace', "Would you like to enable '{0}' extension globally?", displayName),
				[localize('yes', "Yes"), localize('no', "No")])
				.then((option) => {
					if (option === 0) {
						return this.enableExtension(identifier, StorageScope.GLOBAL).then(() => true);
					}
					return TPromise.wrap(false);
				});
		} else {
			return this.choiceService.choose(Severity.Info, localize('disableExtensionGlobally', "Would you like to disable '{0}' extension globally?", displayName),
				[localize('yes', "Yes"), localize('no', "No")])
				.then((option) => {
					if (option === 0) {
						return this.disableExtension(identifier, StorageScope.GLOBAL).then(() => true);
					}
					return TPromise.wrap(false);
				});
		}
	}

	private disableExtension(identifier: string, scope: StorageScope): TPromise<boolean> {
		let disabledExtensions = this._getDisabledExtensions(scope);
		disabledExtensions.push(identifier);
		this._setDisabledExtensions(disabledExtensions, scope);
		return TPromise.wrap(true);
	}

	private enableExtension(identifier: string, scope: StorageScope): TPromise<boolean> {
		let disabledExtensions = this._getDisabledExtensions(scope);
		const index = disabledExtensions.indexOf(identifier);
		if (index !== -1) {
			disabledExtensions.splice(index, 1);
			this._setDisabledExtensions(disabledExtensions, scope);
			return TPromise.wrap(true);
		}
		return TPromise.wrap(false);
	}

	private _getDisabledExtensions(scope: StorageScope): string[] {
		const value = this.storageService.get(DISABLED_EXTENSIONS_STORAGE_PATH, scope, '');
		return value ? distinct(value.split(',')) : [];
	}

	private _setDisabledExtensions(disabledExtensions: string[], scope: StorageScope): void {
		if (disabledExtensions.length) {
			this.storageService.store(DISABLED_EXTENSIONS_STORAGE_PATH, disabledExtensions.join(','), scope);
		} else {
			this.storageService.remove(DISABLED_EXTENSIONS_STORAGE_PATH, scope);
		}
	}
}