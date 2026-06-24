/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { localize } from '../../../../nls.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfile, ProfileResourceType } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { API_OPEN_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { ITreeItemCheckboxState, TreeItemCollapsibleState } from '../../../common/views.js';
import { IProfileResource, IProfileResourceChildTreeItem, IProfileResourceInitializer, IProfileResourceTreeItem, IUserDataProfileService } from '../common/userDataProfile.js';

interface ITasksResourceContent {
	tasks: string | null;
}

export class TasksResourceInitializer implements IProfileResourceInitializer {

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
	}

	async initialize(content: string): Promise<void> {
		const tasksContent: ITasksResourceContent = JSON.parse(content);
		if (!tasksContent.tasks) {
			this.logService.info(`Initializing Profile: No tasks to apply...`);
			return;
		}
		await this.fileService.writeFile(this.userDataProfileService.currentProfile.tasksResource, VSBuffer.fromString(tasksContent.tasks));
	}
}

export class TasksResource implements IProfileResource {

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
	}

	async getContent(profile: IUserDataProfile): Promise<string> {
		const tasksContent = await this.getTasksResourceContent(profile);
		return JSON.stringify(tasksContent);
	}

	async getTasksResourceContent(profile: IUserDataProfile): Promise<ITasksResourceContent> {
		const tasksContent = await this.getTasksContent(profile);
		return { tasks: tasksContent };
	}

	async apply(content: string, profile: IUserDataProfile): Promise<void> {
		const tasksContent: ITasksResourceContent = JSON.parse(content);
		if (!tasksContent.tasks) {
			this.logService.info(`Importing Profile (${profile.name}): No tasks to apply...`);
			return;
		}
		await this.fileService.writeFile(profile.tasksResource, VSBuffer.fromString(tasksContent.tasks));
	}

	private async getTasksContent(profile: IUserDataProfile): Promise<string | null> {
		try {
			const content = await this.fileService.readFile(profile.tasksResource);
			return content.value.toString();
		} catch (error) {
			// File not found
			if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return null;
			} else {
				throw error;
			}
		}
	}

}

export class TasksResourceTreeItem implements IProfileResourceTreeItem {

	readonly type = ProfileResourceType.Tasks;
	readonly handle = ProfileResourceType.Tasks;
	readonly label = { label: localize('tasks', "Tasks") };
	readonly collapsibleState = TreeItemCollapsibleState.Expanded;
	checkbox: ITreeItemCheckboxState | undefined;

	constructor(
		private readonly profile: IUserDataProfile,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	async getChildren(): Promise<IProfileResourceChildTreeItem[]> {
		return [{
			handle: this.profile.tasksResource.toString(),
			resourceUri: this.profile.tasksResource,
			collapsibleState: TreeItemCollapsibleState.None,
			parent: this,
			accessibilityInformation: {
				label: this.uriIdentityService.extUri.basename(this.profile.settingsResource)
			},
			command: {
				id: API_OPEN_EDITOR_COMMAND_ID,
				title: '',
				arguments: [this.profile.tasksResource, undefined, undefined]
			}
		}];
	}

	async hasContent(): Promise<boolean> {
		const tasksContent = await this.instantiationService.createInstance(TasksResource).getTasksResourceContent(this.profile);
		return tasksContent.tasks !== null;
	}

	async getContent(): Promise<string> {
		return this.instantiationService.createInstance(TasksResource).getContent(this.profile);
	}

	isFromDefaultProfile(): boolean {
		return !this.profile.isDefault && !!this.profile.useDefaultFlags?.tasks;
	}


}
