/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { isValidBasename } from '../../../../base/common/extpath.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { basename, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUserDataProfile, ProfileResourceType } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { getWorkflowFileKind, WORKFLOW_MAX_FILE_SIZE } from '../../../../platform/workflow/common/workflowFiles.js';
import { API_OPEN_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { ITreeItemCheckboxState, TreeItemCollapsibleState } from '../../../common/views.js';
import { IProfileResource, IProfileResourceChildTreeItem, IProfileResourceInitializer, IProfileResourceTreeItem, IUserDataProfileService } from '../common/userDataProfile.js';

export class WorkflowsResource implements IProfileResource {
	constructor(@IFileService private readonly fileService: IFileService) { }

	async getContent(profile: IUserDataProfile, excluded?: ResourceSet): Promise<string> {
		const files: Record<string, string> = {};
		for (const resource of await this.getResources(profile)) {
			if (!excluded?.has(resource)) {
				files[basename(resource)] = (await this.fileService.readFile(resource, { limits: { size: WORKFLOW_MAX_FILE_SIZE } })).value.toString();
			}
		}
		return JSON.stringify({ files });
	}

	async apply(content: string, profile: IUserDataProfile): Promise<void> {
		const value: { readonly files?: unknown } | null = JSON.parse(content);
		if (!value || typeof value !== 'object' || Array.isArray(value)
			|| !value.files || typeof value.files !== 'object' || Array.isArray(value.files)) {
			throw new Error(localize('workflows.invalidProfileContent', "The profile's workflow definitions are not valid."));
		}
		const files = Object.entries(value.files).map(([name, text]) => {
			if (!getWorkflowFileKind(name) || !isValidBasename(name, true) || [...name].some(character => character.charCodeAt(0) < 32) || typeof text !== 'string') {
				throw new Error(localize('workflows.invalidProfileFile', "Invalid workflow definition in profile: {0}", name));
			}
			const data = VSBuffer.fromString(text);
			if (data.byteLength > WORKFLOW_MAX_FILE_SIZE) {
				throw new Error(localize('workflows.profileFileTooLarge', "Workflow definition '{0}' exceeds the file size limit.", name));
			}
			return { resource: joinPath(profile.workflowsHome, name), data };
		});
		for (const { resource, data } of files) {
			await this.fileService.writeFile(resource, data);
		}
	}

	async getResources(profile: IUserDataProfile): Promise<URI[]> {
		try {
			const stat = await this.fileService.resolve(profile.workflowsHome);
			return (stat.children ?? [])
				.filter(child => !child.isDirectory && getWorkflowFileKind(child.name))
				.sort((a, b) => a.name.localeCompare(b.name))
				.map(child => child.resource);
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return [];
			}
			throw error;
		}
	}
}

export class WorkflowsResourceInitializer implements IProfileResourceInitializer {
	constructor(
		@IUserDataProfileService private readonly profileService: IUserDataProfileService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async initialize(content: string): Promise<void> {
		await this.instantiationService.createInstance(WorkflowsResource).apply(content, this.profileService.currentProfile);
	}
}

export class WorkflowsResourceTreeItem implements IProfileResourceTreeItem {
	readonly type = ProfileResourceType.Workflows;
	readonly label = { label: localize('workflows.profileResource', "Workflows") };
	readonly collapsibleState = TreeItemCollapsibleState.Collapsed;
	readonly handle: string;
	checkbox: ITreeItemCheckboxState | undefined;
	private readonly excluded = new ResourceSet();

	constructor(
		private readonly profile: IUserDataProfile,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		this.handle = profile.workflowsHome.toString();
	}

	async getChildren(): Promise<IProfileResourceChildTreeItem[]> {
		const parent = this;
		return (await this.instantiationService.createInstance(WorkflowsResource).getResources(this.profile)).map(resource => ({
			handle: resource.toString(),
			parent,
			resourceUri: resource,
			collapsibleState: TreeItemCollapsibleState.None,
			accessibilityInformation: { label: basename(resource) },
			checkbox: this.checkbox ? {
				get isChecked() { return !parent.excluded.has(resource); },
				set isChecked(value: boolean) {
					if (value) {
						parent.excluded.delete(resource);
					} else {
						parent.excluded.add(resource);
					}
				},
				accessibilityInformation: { label: localize('workflows.selectProfileFile', "Select Workflow Definition {0}", basename(resource)) },
			} : undefined,
			command: { id: API_OPEN_EDITOR_COMMAND_ID, title: '', arguments: [resource, undefined, undefined] },
		}));
	}

	async hasContent(): Promise<boolean> {
		return (await this.instantiationService.createInstance(WorkflowsResource).getResources(this.profile)).length > 0;
	}

	async getContent(): Promise<string> {
		return this.instantiationService.createInstance(WorkflowsResource).getContent(this.profile, this.excluded);
	}

	isFromDefaultProfile(): boolean {
		return !this.profile.isDefault && !!this.profile.useDefaultFlags?.workflows;
	}
}
