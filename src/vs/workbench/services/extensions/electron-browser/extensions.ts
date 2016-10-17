/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from 'vs/base/common/arrays';
import { IWorkspaceContextService, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { IExtensionsRuntimeService } from 'vs/platform/extensions/common/extensions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IChoiceService } from 'vs/platform/message/common/message';

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

	public getDisabledExtensions(scope?: StorageScope): string[] {
		if (!this.allDisabledExtensions) {
			this.globalDisabledExtensions = this.getDisabledExtensionsFromStorage(StorageScope.GLOBAL);
			this.workspaceDisabledExtensions = this.getDisabledExtensionsFromStorage(StorageScope.WORKSPACE);
			this.allDisabledExtensions = distinct([...this.globalDisabledExtensions, ...this.workspaceDisabledExtensions]);
		}

		switch (scope) {
			case StorageScope.GLOBAL: return this.globalDisabledExtensions;
			case StorageScope.WORKSPACE: return this.workspaceDisabledExtensions;
		}
		return this.allDisabledExtensions;
	}

	private getDisabledExtensionsFromStorage(scope?: StorageScope): string[] {
		if (scope !== void 0) {
			return this._getDisabledExtensions(scope);
		}

		const globallyDisabled = this._getDisabledExtensions(StorageScope.GLOBAL);
		const workspaceDisabled = this._getDisabledExtensions(StorageScope.WORKSPACE);
		return [...globallyDisabled, ...workspaceDisabled];
	}

	private _getDisabledExtensions(scope: StorageScope): string[] {
		const value = this.storageService.get(DISABLED_EXTENSIONS_STORAGE_PATH, scope, '');
		return value ? distinct(value.split(',')) : [];
	}
}