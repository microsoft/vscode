/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

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

export const IFileChangesUtils = createDecorator<IFileChangesUtils>('fileChangesUtils');

export interface IFileChangesUtils {
	readonly _serviceBrand: undefined;

	setConversationManager(manager: any): void;
	recordFileCreation(filePath: string, content: string, messageId: number): Promise<void>;
	recordFileModification(filePath: string, oldContent: string, newContent: string, messageId: number, wasUnsaved?: boolean): Promise<void>;
	recordFileDeletion(filePath: string, originalContent: string, messageId: number): Promise<void>;
}
