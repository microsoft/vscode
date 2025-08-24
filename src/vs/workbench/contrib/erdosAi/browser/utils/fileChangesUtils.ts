/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';

/**
 * File changes tracking utilities - matches Rao's file_changes.json structure
 */

export interface FileChangeEntry {
	id: number;
	message_id: number;
	conversation_id: number;
	timestamp: string;
	action: 'create' | 'modify' | 'remove';
	file_path: string;
	content: string;
	previous_content?: string;
	diff_type?: 'modify' | 'delete';
	was_unsaved: boolean;
}

export interface FileChangesLog {
	changes: FileChangeEntry[];
}

/**
 * File changes storage class - matches Rao's file_changes.json management
 */
export class FileChangesStorage {
	private conversationManager: any = null;

	setConversationManager(manager: any): void {
		this.conversationManager = manager;
	}

	/**
	 * Read file_changes.json (like Rao's read_file_changes_log)
	 */
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
			
			// Ensure we always return an object with changes array
			if (!changesData || !changesData.changes) {
				return { changes: [] };
			}
			
			return changesData;
		} catch (error) {
			// Create initial structure like Rao does
			const initialLog: FileChangesLog = { changes: [] };
			await this.writeFileChangesLog(initialLog);
			return initialLog;
		}
	}

	/**
	 * Write file_changes.json (like Rao's write_file_changes_log)
	 */
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
		
		// Successfully wrote file_changes.json
	}

	/**
	 * Record file creation (like Rao's record_file_creation)
	 */
	async recordFileCreation(filePath: string, content: string, messageId: number): Promise<void> {
		const changesLog = await this.readFileChangesLog();
		
		// Ensure changes array exists
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

	/**
	 * Record file modification (like Rao's record_file_modification_with_diff_with_state)
	 */
	async recordFileModification(
		filePath: string, 
		oldContent: string, 
		newContent: string, 
		messageId: number,
		wasUnsaved: boolean = false
	): Promise<void> {
		const changesLog = await this.readFileChangesLog();
		
		// Ensure changes array exists
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

	/**
	 * Record file deletion (like Rao's record_file_deletion)
	 */
	async recordFileDeletion(filePath: string, originalContent: string, messageId: number): Promise<void> {
		const changesLog = await this.readFileChangesLog();
		
		// Ensure changes array exists
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

// Export singleton instance
export const fileChangesStorage = new FileChangesStorage();
