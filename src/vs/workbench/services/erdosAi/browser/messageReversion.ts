/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { IMessageReversion } from '../common/messageReversion.js';
import { ConversationMessage } from '../common/conversationTypes.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { IDocumentManager } from '../../erdosAiDocument/common/documentManager.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

export class MessageReversion extends Disposable implements IMessageReversion {
	readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IDocumentManager private readonly documentManager: IDocumentManager,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IConversationManager private readonly conversationManager: IConversationManager,
		@ICommonUtils private readonly commonUtils: ICommonUtils
	) {
		super();
	}

	async revertToMessage(messageId: number): Promise<{status: string, data: any}> {
		try {
			this.logService.info(`Reverting conversation to message ${messageId}`);
			
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				throw new Error('No active conversation');
			}

			const targetMessage = conversation.messages.find((m: ConversationMessage) => m.id === messageId);
			if (!targetMessage || targetMessage.role !== 'user') {
				throw new Error(`User message with ID ${messageId} not found`);
			}

			const messagesToRemove = conversation.messages.filter((m: ConversationMessage) => m.id >= messageId);
			
			if (messagesToRemove.length === 0) {
				this.logService.info('No messages to remove - message not found');
				return { status: 'success', data: { removedCount: 0 } };
			}

			conversation.messages = conversation.messages.filter((m: ConversationMessage) => m.id < messageId);

			for (const message of messagesToRemove) {
				const messageStore = (this.conversationManager as any).messageStore;
				if (messageStore) {
					messageStore.deleteMessage(message.id);
				}
			}

			await this.conversationManager.saveConversationLog(conversation);

			await this.revertFileChanges(messageId, conversation.info.id);

			this.logService.info(`Successfully reverted conversation, removed ${messagesToRemove.length} messages`);
			
			return { 
				status: 'success', 
				data: { 
					removedCount: messagesToRemove.length,
					lastMessageId: messageId
				} 
			};
		} catch (error) {
			this.logService.error('Failed to revert conversation:', error);
			return { 
				status: 'error', 
				data: { error: error instanceof Error ? error.message : 'Unknown error' } 
			};
		}
	}

	private async revertFileChanges(messageId: number, conversationId: number): Promise<void> {
		try {
			this.logService.info(`Reverting file changes after message ${messageId} for conversation ${conversationId}`);
			
			const fileChanges = await this.loadFileChangesForConversation(conversationId);
			if (!fileChanges || !fileChanges.changes) {
				this.logService.info('No file changes to revert');
				return;
			}

			const changesToRevert = fileChanges.changes.filter((change: any) => 
				change.message_id >= messageId
			);

			if (changesToRevert.length === 0) {
				this.logService.info('No file changes to revert after message', messageId);
				return;
			}

			changesToRevert.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

			for (const change of changesToRevert) {
				try {
					await this.revertSingleFileChange(change, conversationId);
				} catch (error) {
					this.logService.error(`Failed to revert file change for ${change.file_path}:`, error);
				}
			}

			const remainingChanges = fileChanges.changes.filter((change: any) => 
				change.message_id < messageId
			);

			const updatedFileChanges = {
				...fileChanges,
				changes: remainingChanges
			};

			await this.saveFileChangesForConversation(conversationId, updatedFileChanges);

			this.logService.info(`Successfully reverted ${changesToRevert.length} file changes`);

		} catch (error) {
			this.logService.error('Failed to revert file changes:', error);
		}
	}

	private async revertSingleFileChange(change: any, conversationId: number): Promise<void> {
		try {
			const filePath = change.file_path;
			if (!filePath) {
				return;
			}

			const uri = await this.resolveFileUri(filePath);
			if (!uri) {
				this.logService.warn(`Could not resolve URI for file: ${filePath}`);
				return;
			}

			if (change.action === 'create') {
				const exists = await this.fileService.exists(uri);
				if (exists) {
					await this.fileService.del(uri);
					this.logService.info(`Deleted created file: ${filePath}`);
				}

			} else if (change.action === 'modify') {
				if (change.previous_content !== undefined) {
					await this.fileService.writeFile(uri, VSBuffer.fromString(change.previous_content));
					this.logService.info(`Restored previous content for: ${filePath}`);
				}

			} else if (change.action === 'remove') {
				if (change.previous_content !== undefined) {
					await this.fileService.writeFile(uri, VSBuffer.fromString(change.previous_content));
					this.logService.info(`Restored deleted file: ${filePath}`);
				}
			}

		} catch (error) {
			this.logService.error(`Failed to revert single file change for ${change.file_path}:`, error);
			throw error;
		}
	}

	private async loadFileChangesForConversation(conversationId: number): Promise<any> {
		try {
			const conversationPaths = this.conversationManager.getConversationPaths(conversationId);
			const fileChangesPath = URI.parse(conversationPaths.diffLogPath);
			
			const exists = await this.fileService.exists(fileChangesPath);
			if (!exists) {
				return { changes: [] };
			}

			const content = await this.fileService.readFile(fileChangesPath);
			return JSON.parse(content.value.toString());

		} catch (error) {
			this.logService.error(`Failed to load file changes for conversation ${conversationId}:`, error);
			return { changes: [] };
		}
	}

	private async saveFileChangesForConversation(conversationId: number, fileChanges: any): Promise<void> {
		try {
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation || conversation.info.id !== conversationId) {
				this.logService.warn(`Cannot save file changes for conversation ${conversationId} - not current conversation`);
				return;
			}

			const paths = this.conversationManager.getConversationPaths(conversationId);
			const fileChangesPath = URI.parse(paths.diffLogPath);
			
			await this.fileService.writeFile(fileChangesPath, VSBuffer.fromString(JSON.stringify(fileChanges, null, 2)));
			
		} catch (error) {
			this.logService.error(`Failed to save file changes for conversation ${conversationId}:`, error);
			throw error;
		}
	}

	private async resolveFileUri(filePath: string): Promise<URI | null> {
		try {
			const resolverContext = this.createResolverContext();
			const pathResult = await this.commonUtils.resolveFilePathToUri(filePath, resolverContext);
			return pathResult.found ? pathResult.uri || null : null;
		} catch (error) {
			this.logService.error(`Failed to resolve file URI for ${filePath}:`, error);
			return null;
		}
	}

	private createResolverContext() {
		return {
			getAllOpenDocuments: async () => {
				const docs = await this.documentManager.getAllOpenDocuments(true);
				return docs.map(doc => ({
					path: doc.path,
					content: doc.content,
					isDirty: !doc.isSaved,
					isActive: doc.isActive,
					isSaved: doc.isSaved
				}));
			},
			getCurrentWorkingDirectory: async () => {
				const workspaces = this.workspaceContextService.getWorkspace().folders;
				return workspaces && workspaces.length > 0 ? workspaces[0].uri.fsPath : process.cwd();
			},
			fileExists: async (path: string) => {
				try {
					const uri = URI.file(path);
					return await this.fileService.exists(uri);
				} catch {
					return false;
				}
			},
			joinPath: (base: string, ...parts: string[]) => {
				return parts.reduce((acc, part) => acc + '/' + part, base);
			},
			getFileContent: async (uri: URI) => {
				const fileContent = await this.documentManager.getEffectiveFileContent(uri.fsPath);
				return fileContent || '';
			}
		};
	}
}
