/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { localize } from 'vs/nls';
import { FileOperationError, FileOperationResult, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IUserDataProfile, ProfileResourceType } from 'vs/platform/userDataProfile/common/userDataProfile';
import { API_OPEN_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { ITreeItemCheckboxState, TreeItemCollapsibleState } from 'vs/workbench/common/views';
import { IProfileResource, IProfileResourceChildTreeItem, IProfileResourceInitializer, IProfileResourceTreeItem, IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

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
	readonly label = { label: localize('tasks', "User Tasks") };
	readonly collapsibleState = TreeItemCollapsibleState.Expanded;
	checkbox: ITreeItemCheckboxState | undefined;

	constructor(
		private readonly profile: IUserDataProfile,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	async getChildren(): Promise<IProfileResourceChildTreeItem[]> {
		return [{
			handle: this.profile.tasksResource.toString(),
			resourceUri: this.profile.tasksResource,
			collapsibleState: TreeItemCollapsibleState.None,
			parent: this,
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
