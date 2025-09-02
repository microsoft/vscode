/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { FileChangeEntry, FileChangesLog } from '../common/fileChangesUtils.js';

export class FileChangesStorage {
	private conversationManager: any = null;

	setConversationManager(manager: any): void {
		this.conversationManager = manager;
	}

	private async readFileChangesLog(): Promise<FileChangesLog> {
		if (!this.conversationManager) {
			return { changes: [] };
		}

		try {
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				return { changes: [] };
			}

			const paths = this.conversationManager.getConversationPaths(conversation.info.id);
			const fileService = this.conversationManager.fileService;
			
			const changesContent = await fileService.readFile(URI.parse(paths.diffLogPath));
			const changesData = JSON.parse(changesContent.value.toString());
			
			if (!changesData || !changesData.changes) {
				return { changes: [] };
			}
			
			return changesData;
		} catch (error) {
			const initialLog: FileChangesLog = { changes: [] };
			await this.writeFileChangesLog(initialLog);
			return initialLog;
		}
	}

	private async writeFileChangesLog(changesLog: FileChangesLog): Promise<void> {
		if (!this.conversationManager) {
			throw new Error(`[FILE_CHANGES] No conversation manager - cannot write file changes`);
		}

		const conversation = this.conversationManager.getCurrentConversation();
		if (!conversation) {
			throw new Error(`[FILE_CHANGES] No current conversation - cannot write file changes`);
		}

		const paths = this.conversationManager.getConversationPaths(conversation.info.id);
		const fileService = this.conversationManager.fileService;
		
		const jsonContent = JSON.stringify(changesLog, null, 2);
		await fileService.writeFile(URI.parse(paths.diffLogPath), VSBuffer.fromString(jsonContent));
	}

	async recordFileCreation(filePath: string, content: string, messageId: number): Promise<void> {
		const changesLog = await this.readFileChangesLog();
		
		if (!changesLog.changes) {
			changesLog.changes = [];
		}
		
		const conversation = this.conversationManager?.getCurrentConversation();
		const conversationId = conversation?.info?.id || 1;
		
		const newChange: FileChangeEntry = {
			id: changesLog.changes.length + 1,
			message_id: messageId,
			conversation_id: conversationId,
			timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
			action: 'create',
			file_path: filePath,
			content: content,
			was_unsaved: false
		};

		changesLog.changes.push(newChange);
		await this.writeFileChangesLog(changesLog);
	}

	async recordFileModification(
		filePath: string, 
		oldContent: string, 
		newContent: string, 
		messageId: number,
		wasUnsaved: boolean = false
	): Promise<void> {
		const changesLog = await this.readFileChangesLog();
		
		if (!changesLog.changes) {
			changesLog.changes = [];
		}
		
		const conversation = this.conversationManager?.getCurrentConversation();
		const conversationId = conversation?.info?.id || 1;
		
		const newChange: FileChangeEntry = {
			id: changesLog.changes.length + 1,
			message_id: messageId,
			conversation_id: conversationId,
			timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
			action: 'modify',
			file_path: filePath,
			content: newContent,
			previous_content: oldContent,
			diff_type: 'modify',
			was_unsaved: wasUnsaved
		};

		changesLog.changes.push(newChange);
		await this.writeFileChangesLog(changesLog);
	}

	async recordFileDeletion(filePath: string, originalContent: string, messageId: number): Promise<void> {
		const changesLog = await this.readFileChangesLog();
		
		if (!changesLog.changes) {
			changesLog.changes = [];
		}
		
		const conversation = this.conversationManager?.getCurrentConversation();
		const conversationId = conversation?.info?.id || 1;
		
		const newChange: FileChangeEntry = {
			id: changesLog.changes.length + 1,
			message_id: messageId,
			conversation_id: conversationId,
			timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
			action: 'remove',
			file_path: filePath,
			content: '',
			previous_content: originalContent,
			diff_type: 'delete',
			was_unsaved: false
		};

		changesLog.changes.push(newChange);
		await this.writeFileChangesLog(changesLog);
	}
}

export const fileChangesStorage = new FileChangesStorage();
