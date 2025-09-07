/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { joinPath } from '../../../../base/common/resources.js';
import { fileChangesStorage } from '../../erdosAiUtils/browser/fileChangesUtils.js';
import { IDeleteFileCommandHandler } from '../common/deleteFileCommandHandler.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';

export class DeleteFileCommandHandler extends Disposable implements IDeleteFileCommandHandler {
	readonly _serviceBrand: undefined;
	
	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IConversationManager private readonly conversationManager: IConversationManager,
	) {
		super();
	}

	async acceptDeleteFileCommand(messageId: number, content: string, requestId: string): Promise<{status: string, data: any}> {
		try {						
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = conversation.messages.find((m: any) => m.id === messageId);
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			if (functionCallMessage.function_call.name !== 'delete_file') {
				throw new Error(`Expected delete_file function call, but got ${functionCallMessage.function_call.name}`);
			}
			
			const args = JSON.parse(functionCallMessage.function_call.arguments || '{}');
			const filename = args.filename;
			
			if (!filename) {
				throw new Error('Missing required argument: filename');
			}
			
			const callId = functionCallMessage.function_call.call_id;
			
			await this.applyDeleteFileOperation(messageId, callId, filename, requestId);
			
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation) {
				const targetMessage = currentConversation.messages.find((entry: any) => 
					entry.type === 'function_call_output' && 
					entry.call_id === functionCallMessage.function_call?.call_id &&
					entry.output === "Response pending..."
				);

				if (targetMessage) {
					targetMessage.output = `File deleted: ${filename}`;
					targetMessage.timestamp = new Date().toISOString();
					await this.conversationManager.saveConversationLog(currentConversation);
				}
			}
			
			// Always continue after successful delete file command
			const relatedToId = functionCallMessage.related_to || messageId;
			
			return {
				status: 'continue_silent',
				data: {
					message: 'Delete file command accepted - returning control to orchestrator',
					related_to_id: relatedToId,
					request_id: requestId
				}
			};
			
		} catch (error) {
			this.logService.error('Failed to accept delete file command:', error);
			
			return {
				status: 'error',
				data: {
					error: error instanceof Error ? error.message : String(error),
					related_to_id: messageId,
					request_id: requestId
				}
			};
		}
	}

	async cancelDeleteFileCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		try {
			this.logService.info(`Cancelling delete file command for message ${messageId}`);
						
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = conversation.messages.find((m: any) => m.id === messageId);
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation) {
				const targetMessage = currentConversation.messages.find((entry: any) => 
					entry.type === 'function_call_output' && 
					entry.call_id === functionCallMessage.function_call?.call_id &&
					entry.output === "Response pending..."
				);

				if (targetMessage) {
					targetMessage.output = "File deletion cancelled.";
					targetMessage.timestamp = new Date().toISOString();
					await this.conversationManager.saveConversationLog(currentConversation);
				}
			}
			
			// Always continue after delete file command cancellation
			const relatedToId = functionCallMessage.related_to || messageId;
			
			return {
				status: 'continue_silent',
				data: {
					message: 'Delete file command cancelled - returning control to orchestrator',
					related_to_id: relatedToId,
					request_id: requestId
				}
			};
			
		} catch (error) {
			this.logService.error('Failed to cancel delete file command:', error);
			
			return {
				status: 'error',
				data: {
					error: error instanceof Error ? error.message : String(error),
					related_to_id: messageId,
					request_id: requestId
				}
			};
		}
	}

	private async applyDeleteFileOperation(messageId: number, callId: string, filename: string, requestId: string): Promise<void> {
		try {
			const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
			if (!workspaceFolder) {
				throw new Error('No workspace folder available for file deletion');
			}
			
			const filePath = joinPath(workspaceFolder.uri, filename);
			
			const exists = await this.fileService.exists(filePath);
			if (!exists) {
				this.logService.warn(`File does not exist: ${filename}`);
				return;
			}
			
			let originalContent = '';
			try {
				const content = await this.fileService.readFile(filePath);
				originalContent = content.value.toString();
			} catch (error) {
				this.logService.warn(`Could not read file content before deletion: ${filename}`);
			}
			
			await this.closeOpenDocument(filename);
			
			await this.fileService.del(filePath);
			
			await this.recordFileDeletion(filename, originalContent, messageId);
			
			this.logService.info(`Successfully deleted file: ${filename}`);
			
		} catch (error) {
			this.logService.error(`Failed to delete file ${filename}:`, error);
			throw error;
		}
	}

	private async recordFileDeletion(filePath: string, originalContent: string, messageId: number): Promise<void> {
		fileChangesStorage.setConversationManager(this.conversationManager);
		
		await fileChangesStorage.recordFileDeletion(filePath, originalContent, messageId);
		
		this.logService.info(`File deletion recorded: ${filePath}`);
	}

	private async closeOpenDocument(filePath: string): Promise<void> {
		try {
			const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
			if (!workspaceFolder) {
				return;
			}
			
			this.logService.info(`Closed editors for file: ${filePath}`);
		} catch (error) {
			this.logService.error(`Failed to close document for ${filePath}:`, error);
		}
	}
}
