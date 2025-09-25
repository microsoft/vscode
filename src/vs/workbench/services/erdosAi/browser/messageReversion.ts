/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
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
import { IFileResolverService } from '../../erdosAiUtils/common/fileResolverService.js';
import { IFileChangeTracker } from '../common/fileChangeTracker.js';

export class MessageReversion extends Disposable implements IMessageReversion {
	readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IConversationManager private readonly conversationManager: IConversationManager,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
		@IFileResolverService private readonly fileResolverService: IFileResolverService,
		@IFileChangeTracker private readonly fileChangeTracker: IFileChangeTracker
	) {
		super();
	}

	async revertToMessage(messageId: number): Promise<{status: string, data: any}> {
		try {
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

			await this.revertAllConversationData(messageId, conversation.info.id, messagesToRemove);

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

	/**
	 * Comprehensive revert function that handles all conversation data:
	 * - File changes (create/modify/delete operations)
	 * - Code links mappings
	 * - Conversation diffs
	 * - Summaries
	 */
	private async revertAllConversationData(messageId: number, conversationId: number, messagesToRemove: ConversationMessage[]): Promise<void> {
		const conversationPaths = this.conversationManager.getConversationPaths(conversationId);
		
		try {
			// Run all reversion operations in parallel for better performance
			await Promise.all([
				this.revertFileChangesData(messageId, conversationId, conversationPaths),
				this.revertCodeLinksData(messageId, conversationPaths),
				this.revertConversationDiffsData(messageId, conversationPaths),
				this.revertSummariesData(messageId, conversationPaths)
			]);
		} catch (error) {
			this.logService.error('Failed to revert conversation data:', error);
			throw error;
		}
	}

	private async revertFileChangesData(messageId: number, conversationId: number, conversationPaths: any): Promise<void> {
		try {
			const fileChangesPath = URI.parse(conversationPaths.diffLogPath);
			const exists = await this.fileService.exists(fileChangesPath);
			if (!exists) {
				return;
			}

			const content = await this.fileService.readFile(fileChangesPath);
			const fileChanges = JSON.parse(content.value.toString());
			
			if (!fileChanges || !fileChanges.changes) {
				return;
			}

			const changesToRevert = fileChanges.changes.filter((change: any) => 
				change.message_id >= messageId
			);

			if (changesToRevert.length > 0) {
				// Sort by messageId (highest first) to revert in correct chronological order
				changesToRevert.sort((a: any, b: any) => b.message_id - a.message_id);

				// Revert each file change
				for (const change of changesToRevert) {
					try {
						await this.revertSingleFileChange(change);
					} catch (error) {
						this.logService.error(`Failed to revert file change for ${change.file_path}:`, error);
					}
				}

				// Update file changes log to remove reverted entries
				const remainingChanges = fileChanges.changes.filter((change: any) => 
					change.message_id < messageId
				);

				const updatedFileChanges = {
					...fileChanges,
					changes: remainingChanges
				};

				await this.fileService.writeFile(fileChangesPath, VSBuffer.fromString(JSON.stringify(updatedFileChanges, null, 2)));
			}
		} catch (error) {
			this.logService.error('Failed to revert file changes:', error);
			throw error;
		}
	}

	private async revertSingleFileChange(change: any): Promise<void> {
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
			}
		} else if (change.action === 'modify' && change.previous_content !== undefined) {
			await this.fileService.writeFile(uri, VSBuffer.fromString(change.previous_content));
		} else if (change.action === 'remove' && change.previous_content !== undefined) {
			await this.fileService.writeFile(uri, VSBuffer.fromString(change.previous_content));
		}

		try {
			await this.fileChangeTracker.applyAutoAcceptHighlighting(uri);
		} catch (error) {
		}
	}

	private async revertCodeLinksData(messageId: number, conversationPaths: any): Promise<void> {
		try {
			const codeLinksPath = URI.parse(conversationPaths.codeLinksPath);
			const exists = await this.fileService.exists(codeLinksPath);
			if (!exists) {
				return;
			}

			const content = await this.fileService.readFile(codeLinksPath);
			const codeLinks = JSON.parse(content.value.toString());

			// Remove entries for messages being reverted (messageId and later)
			const filteredCodeLinks: any = {};
			for (const [msgId, links] of Object.entries(codeLinks)) {
				if (parseInt(msgId) < messageId) {
					filteredCodeLinks[msgId] = links;
				}
			}

			await this.fileService.writeFile(codeLinksPath, VSBuffer.fromString(JSON.stringify(filteredCodeLinks, null, 2)));
		} catch (error) {
			this.logService.error('Failed to revert code links:', error);
			throw error;
		}
	}

	private async revertConversationDiffsData(messageId: number, conversationPaths: any): Promise<void> {
		try {
			const diffsPath = URI.parse(conversationPaths.conversationDiffLogPath);
			const exists = await this.fileService.exists(diffsPath);
			if (!exists) {
				return;
			}

			const content = await this.fileService.readFile(diffsPath);
			const diffsData = JSON.parse(content.value.toString());

			// Remove entries for messages being reverted (messageId and later)
			const filteredDiffs: any = {};
			for (const [msgId, diffEntry] of Object.entries(diffsData)) {
				if (parseInt(msgId) < messageId) {
					filteredDiffs[msgId] = diffEntry;
				}
			}

			await this.fileService.writeFile(diffsPath, VSBuffer.fromString(JSON.stringify(filteredDiffs, null, 2)));
		} catch (error) {
			this.logService.error('Failed to revert conversation diffs:', error);
			throw error;
		}
	}

	private async revertSummariesData(messageId: number, conversationPaths: any): Promise<void> {
		try {
			const summariesPath = URI.parse(conversationPaths.summariesPath);
			const exists = await this.fileService.exists(summariesPath);
			if (!exists) {
				return;
			}

			const content = await this.fileService.readFile(summariesPath);
			const summariesData = JSON.parse(content.value.toString());

			if (!summariesData.summaries) {
				return;
			}

			// Count original queries before the revert point
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				return;
			}

			let originalQueriesBeforeRevert = 0;
			for (const message of conversation.messages) {
				if (message.id < messageId &&
					message.role === 'user' &&
					message.original_query === true) {
					originalQueriesBeforeRevert++;
				}
			}

			// Keep only summaries for queries before/at the revert point
			const filteredSummaries: any = {};
			for (const [queryNum, summary] of Object.entries(summariesData.summaries)) {
				if (parseInt(queryNum) <= originalQueriesBeforeRevert) {
					filteredSummaries[queryNum] = summary;
				}
			}

			const updatedSummariesData = {
				...summariesData,
				summaries: filteredSummaries
			};

			await this.fileService.writeFile(summariesPath, VSBuffer.fromString(JSON.stringify(updatedSummariesData, null, 2)));
		} catch (error) {
			this.logService.error('Failed to revert summaries:', error);
			throw error;
		}
	}

	private async resolveFileUri(filePath: string): Promise<URI | null> {
		try {
			const resolverContext = this.fileResolverService.createResolverContext();
			const pathResult = await this.commonUtils.resolveFilePathToUri(filePath, resolverContext);
			return pathResult.found ? pathResult.uri || null : null;
		} catch (error) {
			this.logService.error(`Failed to resolve file URI for ${filePath}:`, error);
			return null;
		}
	}

}
