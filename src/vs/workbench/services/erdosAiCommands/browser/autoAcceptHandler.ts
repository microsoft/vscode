/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IAutoAcceptHandler, IWidgetDecisionSetter } from '../common/autoAcceptHandler.js';
import { IErdosAiSettingsService } from '../../erdosAiSettings/common/settingsService.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';

export class AutoAcceptHandler implements IAutoAcceptHandler {
	readonly _serviceBrand: undefined;
	
	private widgetDecisionSetter: IWidgetDecisionSetter | null = null;

	constructor(
		@IErdosAiSettingsService private readonly settingsService: IErdosAiSettingsService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IConversationManager private readonly conversationManager: IConversationManager,
		@ICommonUtils private readonly commonUtils: ICommonUtils
	) {}
	
	/**
	 * Set the widget decision setter (called by the service core to avoid circular dependency)
	 */
	setWidgetDecisionSetter(setter: IWidgetDecisionSetter): void {
		this.widgetDecisionSetter = setter;
	}

	/**
	 * Check for auto-accept conditions and automatically set widget decisions
	 */
	async checkAndHandleAutoAccept(specificBranch: any): Promise<boolean> {
		if (!this.widgetDecisionSetter) {
			return false;
		}

		if (!specificBranch) {
			return false;
		}

		// Check for auto-accept edits (search_replace)
		const autoAcceptEdits = await this.settingsService.getAutoAcceptEdits();
		
		if (autoAcceptEdits && specificBranch.functionCall.name === 'search_replace' && specificBranch.status === 'waiting_user') {
			// Track the auto-accept edit before applying it
			const args = JSON.parse(specificBranch.functionCall.arguments);
			const filePath = args.file_path || args.filename;
			
			if (filePath) {
				const currentConversation = this.conversationManager.getCurrentConversation();
				if (currentConversation) {
					await this.trackAutoAcceptEdit(filePath, currentConversation.info.id);
				}
			}

			this.widgetDecisionSetter.setWidgetDecision(
				'search_replace',
				specificBranch.messageId,
				'accept',
				'', // Content is not needed for search_replace acceptance
				specificBranch.requestId
			);
			
			return true;
		}

		// Check for auto-accept deletes (delete_file)
		const autoAcceptDeletes = await this.settingsService.getAutoAcceptDeletes();
		if (autoAcceptDeletes && specificBranch.functionCall.name === 'delete_file' && specificBranch.status === 'waiting_user') {
			this.widgetDecisionSetter.setWidgetDecision(
				'delete_file',
				specificBranch.messageId,
				'accept',
				'', // Content is not needed for delete_file acceptance
				specificBranch.requestId
			);
			
			return true;
		}

		return false;
	}
	
	async trackAutoAcceptEdit(filePath: string, conversationId: number): Promise<void> {
		// Get workspace root for path resolution
		const workspace = this.workspaceContextService.getWorkspace();
		const workspaceRoot = workspace.folders.length > 0 ? workspace.folders[0].uri.fsPath : undefined;
		
		// Use the proper erdosAiUtils CommonUtils service to resolve the file path
		const resolvedFilePath = this.commonUtils.resolvePath(filePath, workspaceRoot);
		
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		const workspaceId = workspace.id;
		
		const storageRoot = isEmptyWindow ?
			URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
			URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
		
		const trackingDir = URI.joinPath(storageRoot, 'auto-accept-tracking');
		const fileMapPath = URI.joinPath(trackingDir, 'file-map.json');
		const filesDir = URI.joinPath(trackingDir, 'files');
		
		// Ensure directories exist
		await this.fileService.createFolder(filesDir);
		
		// Load or create file map
		let fileMap: any = {};
		const fileMapExists = await this.fileService.exists(fileMapPath);
		if (fileMapExists) {
			const mapContent = await this.fileService.readFile(fileMapPath);
			fileMap = JSON.parse(mapContent.value.toString());
		}
		
		// Get or create hash for this file
		let fileHash = fileMap[resolvedFilePath];
		if (!fileHash) {
			fileHash = this.createFileHash(resolvedFilePath);
			fileMap[resolvedFilePath] = fileHash;
			await this.fileService.writeFile(fileMapPath, VSBuffer.fromString(JSON.stringify(fileMap, null, 2)));
		}
		
		const fileTrackingPath = URI.joinPath(filesDir, `${fileHash}.json`);
		
		// Load or create file tracking
		let fileTracking: any;
		const trackingFileExists = await this.fileService.exists(fileTrackingPath);
		if (trackingFileExists) {
			const trackingContent = await this.fileService.readFile(fileTrackingPath);
			fileTracking = JSON.parse(trackingContent.value.toString());
			if (!fileTracking.conversations.includes(conversationId)) {
				fileTracking.conversations.push(conversationId);
			}
		} else {
			// Create new tracking file
			const fileUri = URI.file(resolvedFilePath);
			let acceptedContent = '';
			
			const fileExists = await this.fileService.exists(fileUri);
			if (fileExists) {
				const currentContent = await this.fileService.readFile(fileUri);
				acceptedContent = currentContent.value.toString();
			}
			
			fileTracking = {
				file_path: resolvedFilePath,
				conversations: [conversationId],
				accepted_content: acceptedContent,
				created_at: new Date().toISOString()
			};
		}
		
		await this.fileService.writeFile(fileTrackingPath, VSBuffer.fromString(JSON.stringify(fileTracking, null, 2)));
	}

	private createFileHash(filePath: string): string {
		// Simple hash based on file path
		let hash = 0;
		for (let i = 0; i < filePath.length; i++) {
			const char = filePath.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash).toString(16).substring(0, 12);
	}
}
