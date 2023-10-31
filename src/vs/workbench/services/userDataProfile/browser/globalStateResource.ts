/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from 'vs/base/common/collections';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageEntry, IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfile, ProfileResourceType } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IUserDataProfileStorageService } from 'vs/platform/userDataProfile/common/userDataProfileStorageService';
import { API_OPEN_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { ITreeItemCheckboxState, TreeItemCollapsibleState } from 'vs/workbench/common/views';
import { IProfileResource, IProfileResourceChildTreeItem, IProfileResourceInitializer, IProfileResourceTreeItem } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

interface IGlobalState {
	storage: IStringDictionary<string>;
}

export class GlobalStateResourceInitializer implements IProfileResourceInitializer {

	constructor(@IStorageService private readonly storageService: IStorageService) {
	}

	async initialize(content: string): Promise<void> {
		const globalState: IGlobalState = JSON.parse(content);
		const storageKeys = Object.keys(globalState.storage);
		if (storageKeys.length) {
			const storageEntries: Array<IStorageEntry> = [];
			for (const key of storageKeys) {
				storageEntries.push({ key, value: globalState.storage[key], scope: StorageScope.PROFILE, target: StorageTarget.USER });
			}
			this.storageService.storeAll(storageEntries, true);
		}
	}
}

export class GlobalStateResource implements IProfileResource {

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IUserDataProfileStorageService private readonly userDataProfileStorageService: IUserDataProfileStorageService,
		@ILogService private readonly logService: ILogService,
	) {
	}

	async getContent(profile: IUserDataProfile): Promise<string> {
		const globalState = await this.getGlobalState(profile);
		return JSON.stringify(globalState);
	}

	async apply(content: string, profile: IUserDataProfile): Promise<void> {
		const globalState: IGlobalState = JSON.parse(content);
		await this.writeGlobalState(globalState, profile);
	}

	async getGlobalState(profile: IUserDataProfile): Promise<IGlobalState> {
		const storage: IStringDictionary<string> = {};
		const storageData = await this.userDataProfileStorageService.readStorageData(profile);
		for (const [key, value] of storageData) {
			if (value.value !== undefined && value.target === StorageTarget.USER) {
				storage[key] = value.value;
			}
		}
		return { storage };
	}

	private async writeGlobalState(globalState: IGlobalState, profile: IUserDataProfile): Promise<void> {
		const storageKeys = Object.keys(globalState.storage);
		if (storageKeys.length) {
			const updatedStorage = new Map<string, string | undefined>();
			const nonProfileKeys = [
				// Do not include application scope user target keys because they also include default profile user target keys
				...this.storageService.keys(StorageScope.APPLICATION, StorageTarget.MACHINE),
				...this.storageService.keys(StorageScope.WORKSPACE, StorageTarget.USER),
				...this.storageService.keys(StorageScope.WORKSPACE, StorageTarget.MACHINE),
			];
			for (const key of storageKeys) {
				if (nonProfileKeys.includes(key)) {
					this.logService.info(`Importing Profile (${profile.name}): Ignoring global state key '${key}' because it is not a profile key.`);
				} else {
					updatedStorage.set(key, globalState.storage[key]);
				}
			}
			await this.userDataProfileStorageService.updateStorageData(profile, updatedStorage, StorageTarget.USER);
		}
	}
}

export abstract class GlobalStateResourceTreeItem implements IProfileResourceTreeItem {

	readonly type = ProfileResourceType.GlobalState;
	readonly handle = ProfileResourceType.GlobalState;
	readonly label = { label: localize('globalState', "UI State") };
	readonly collapsibleState = TreeItemCollapsibleState.Collapsed;
	checkbox: ITreeItemCheckboxState | undefined;

	constructor(
		private readonly resource: URI,
		private readonly uriIdentityService: IUriIdentityService
	) { }

	async getChildren(): Promise<IProfileResourceChildTreeItem[]> {
		return [{
			handle: this.resource.toString(),
			resourceUri: this.resource,
			collapsibleState: TreeItemCollapsibleState.None,
			accessibilityInformation: {
				label: this.uriIdentityService.extUri.basename(this.resource)
			},
			parent: this,
			command: {
				id: API_OPEN_EDITOR_COMMAND_ID,
				title: '',
				arguments: [this.resource, undefined, undefined]
			}
		}];
	}

	abstract getContent(): Promise<string>;
	abstract isFromDefaultProfile(): boolean;
}

export class GlobalStateResourceExportTreeItem extends GlobalStateResourceTreeItem {

	constructor(
		private readonly profile: IUserDataProfile,
		resource: URI,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(resource, uriIdentityService);
	}

	async hasContent(): Promise<boolean> {
		const globalState = await this.instantiationService.createInstance(GlobalStateResource).getGlobalState(this.profile);
		return Object.keys(globalState.storage).length > 0;
	}

	async getContent(): Promise<string> {
		return this.instantiationService.createInstance(GlobalStateResource).getContent(this.profile);
	}

	isFromDefaultProfile(): boolean {
		return !this.profile.isDefault && !!this.profile.useDefaultFlags?.globalState;
	}

}

export class GlobalStateResourceImportTreeItem extends GlobalStateResourceTreeItem {

	constructor(
		private readonly content: string,
		resource: URI,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super(resource, uriIdentityService);
	}

	async getContent(): Promise<string> {
		return this.content;
	}

	isFromDefaultProfile(): boolean {
		return false;
	}

}
