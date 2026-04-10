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

interface IMcpResourceContent {
	readonly mcp: string | null;
}

export class McpResourceInitializer implements IProfileResourceInitializer {

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
	}

	async initialize(content: string): Promise<void> {
		const mcpContent: IMcpResourceContent = JSON.parse(content);
		if (!mcpContent.mcp) {
			this.logService.info(`Initializing Profile: No MCP servers to apply...`);
			return;
		}
		await this.fileService.writeFile(this.userDataProfileService.currentProfile.mcpResource, VSBuffer.fromString(mcpContent.mcp));
	}
}

export class McpProfileResource implements IProfileResource {

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
	}

	async getContent(profile: IUserDataProfile): Promise<string> {
		const mcpContent = await this.getMcpResourceContent(profile);
		return JSON.stringify(mcpContent);
	}

	async getMcpResourceContent(profile: IUserDataProfile): Promise<IMcpResourceContent> {
		const mcpContent = await this.getMcpContent(profile);
		return { mcp: mcpContent };
	}

	async apply(content: string, profile: IUserDataProfile): Promise<void> {
		const mcpContent: IMcpResourceContent = JSON.parse(content);
		if (!mcpContent.mcp) {
			this.logService.info(`Importing Profile (${profile.name}): No MCP servers to apply...`);
			return;
		}
		await this.fileService.writeFile(profile.mcpResource, VSBuffer.fromString(mcpContent.mcp));
	}

	private async getMcpContent(profile: IUserDataProfile): Promise<string | null> {
		try {
			const content = await this.fileService.readFile(profile.mcpResource);
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

export class McpResourceTreeItem implements IProfileResourceTreeItem {

	readonly type = ProfileResourceType.Mcp;
	readonly handle = ProfileResourceType.Mcp;
	readonly label = { label: localize('mcp', "MCP Servers") };
	readonly collapsibleState = TreeItemCollapsibleState.Expanded;
	checkbox: ITreeItemCheckboxState | undefined;

	constructor(
		private readonly profile: IUserDataProfile,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	async getChildren(): Promise<IProfileResourceChildTreeItem[]> {
		return [{
			handle: this.profile.mcpResource.toString(),
			resourceUri: this.profile.mcpResource,
			collapsibleState: TreeItemCollapsibleState.None,
			parent: this,
			accessibilityInformation: {
				label: this.uriIdentityService.extUri.basename(this.profile.mcpResource)
			},
			command: {
				id: API_OPEN_EDITOR_COMMAND_ID,
				title: '',
				arguments: [this.profile.mcpResource, undefined, undefined]
			}
		}];
	}

	async hasContent(): Promise<boolean> {
		const mcpContent = await this.instantiationService.createInstance(McpProfileResource).getMcpResourceContent(this.profile);
		return mcpContent.mcp !== null;
	}

	async getContent(): Promise<string> {
		return this.instantiationService.createInstance(McpProfileResource).getContent(this.profile);
	}

	isFromDefaultProfile(): boolean {
		return !this.profile.isDefault && !!this.profile.useDefaultFlags?.mcp;
	}
}
