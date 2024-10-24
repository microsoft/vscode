/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { FileOperationError, FileOperationResult, IFileService, IFileStat } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfile, ProfileResourceType } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { API_OPEN_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { ITreeItemCheckboxState, TreeItemCollapsibleState } from '../../../common/views.js';
import { IProfileResource, IProfileResourceChildTreeItem, IProfileResourceInitializer, IProfileResourceTreeItem, IUserDataProfileService } from '../common/userDataProfile.js';

interface ISnippetsContent {
	snippets: IStringDictionary<string>;
}

export class SnippetsResourceInitializer implements IProfileResourceInitializer {

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IFileService private readonly fileService: IFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
	}

	async initialize(content: string): Promise<void> {
		const snippetsContent: ISnippetsContent = JSON.parse(content);
		for (const key in snippetsContent.snippets) {
			const resource = this.uriIdentityService.extUri.joinPath(this.userDataProfileService.currentProfile.snippetsHome, key);
			await this.fileService.writeFile(resource, VSBuffer.fromString(snippetsContent.snippets[key]));
		}
	}
}

export class SnippetsResource implements IProfileResource {

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
	}

	async getContent(profile: IUserDataProfile, excluded?: ResourceSet): Promise<string> {
		const snippets = await this.getSnippets(profile, excluded);
		return JSON.stringify({ snippets });
	}

	async apply(content: string, profile: IUserDataProfile): Promise<void> {
		const snippetsContent: ISnippetsContent = JSON.parse(content);
		for (const key in snippetsContent.snippets) {
			const resource = this.uriIdentityService.extUri.joinPath(profile.snippetsHome, key);
			await this.fileService.writeFile(resource, VSBuffer.fromString(snippetsContent.snippets[key]));
		}
	}

	private async getSnippets(profile: IUserDataProfile, excluded?: ResourceSet): Promise<IStringDictionary<string>> {
		const snippets: IStringDictionary<string> = {};
		const snippetsResources = await this.getSnippetsResources(profile, excluded);
		for (const resource of snippetsResources) {
			const key = this.uriIdentityService.extUri.relativePath(profile.snippetsHome, resource)!;
			const content = await this.fileService.readFile(resource);
			snippets[key] = content.value.toString();
		}
		return snippets;
	}

	async getSnippetsResources(profile: IUserDataProfile, excluded?: ResourceSet): Promise<URI[]> {
		const snippets: URI[] = [];
		let stat: IFileStat;
		try {
			stat = await this.fileService.resolve(profile.snippetsHome);
		} catch (e) {
			// No snippets
			if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return snippets;
			} else {
				throw e;
			}
		}
		for (const { resource } of stat.children || []) {
			if (excluded?.has(resource)) {
				continue;
			}
			const extension = this.uriIdentityService.extUri.extname(resource);
			if (extension === '.json' || extension === '.code-snippets') {
				snippets.push(resource);
			}
		}
		return snippets;
	}
}

export class SnippetsResourceTreeItem implements IProfileResourceTreeItem {

	readonly type = ProfileResourceType.Snippets;
	readonly handle = this.profile.snippetsHome.toString();
	readonly label = { label: localize('snippets', "Snippets") };
	readonly collapsibleState = TreeItemCollapsibleState.Collapsed;
	checkbox: ITreeItemCheckboxState | undefined;

	private readonly excludedSnippets = new ResourceSet();

	constructor(
		private readonly profile: IUserDataProfile,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) { }

	async getChildren(): Promise<IProfileResourceChildTreeItem[] | undefined> {
		const snippetsResources = await this.instantiationService.createInstance(SnippetsResource).getSnippetsResources(this.profile);
		const that = this;
		return snippetsResources.map<IProfileResourceChildTreeItem>(resource => ({
			handle: resource.toString(),
			parent: that,
			resourceUri: resource,
			collapsibleState: TreeItemCollapsibleState.None,
			accessibilityInformation: {
				label: this.uriIdentityService.extUri.basename(resource),
			},
			checkbox: that.checkbox ? {
				get isChecked() { return !that.excludedSnippets.has(resource); },
				set isChecked(value: boolean) {
					if (value) {
						that.excludedSnippets.delete(resource);
					} else {
						that.excludedSnippets.add(resource);
					}
				},
				accessibilityInformation: {
					label: localize('exclude', "Select Snippet {0}", this.uriIdentityService.extUri.basename(resource)),
				}
			} : undefined,
			command: {
				id: API_OPEN_EDITOR_COMMAND_ID,
				title: '',
				arguments: [resource, undefined, undefined]
			}
		}));
	}

	async hasContent(): Promise<boolean> {
		const snippetsResources = await this.instantiationService.createInstance(SnippetsResource).getSnippetsResources(this.profile);
		return snippetsResources.length > 0;
	}

	async getContent(): Promise<string> {
		return this.instantiationService.createInstance(SnippetsResource).getContent(this.profile, this.excludedSnippets);
	}

	isFromDefaultProfile(): boolean {
		return !this.profile.isDefault && !!this.profile.useDefaultFlags?.snippets;
	}


}

