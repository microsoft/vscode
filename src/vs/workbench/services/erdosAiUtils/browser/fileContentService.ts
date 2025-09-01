/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IDocumentManager } from '../../erdosAiDocument/common/documentManager.js';
import { IFileContentService } from '../common/fileContentService.js';

export class FileContentService extends Disposable implements IFileContentService {
	readonly _serviceBrand: undefined;

	constructor(
		@IDocumentManager private readonly documentManager: IDocumentManager,
	) {
		super();
	}

	async extractFileContentForWidget(filename: string, startLine?: number, endLine?: number): Promise<string> {
		try {
			// Use the document manager's getEffectiveFileContent method
			// This handles both absolute and relative paths, workspace resolution, and open/unsaved files
			const fileContent = await this.documentManager.getEffectiveFileContent(filename);
			
			if (!fileContent && fileContent !== '') {
				return `Error: File does not exist: ${filename}`;
			}
			
			if (fileContent.trim().length === 0) {
				return 'Error: File is empty or unreadable.';
			}
			
			// Split content into lines for line range processing (like RAO)
			let lines = fileContent.split('\n');
			
			// Apply line range if specified (like RAO implementation)
			if (startLine !== undefined || endLine !== undefined) {
				const start = Math.max(1, startLine || 1);
				const end = endLine || lines.length;
				
				if (start > lines.length) {
					return `Error: Start line ${start} exceeds file length (${lines.length} lines).`;
				}
				
				const actualEnd = Math.min(end, lines.length);
				lines = lines.slice(start - 1, actualEnd); // Convert to 0-based indexing
			}
			
			let command = lines.join('\n');
			
			// Clean up the command like RAO does
			command = command.trim();
			
			if (!command.trim()) {
				return 'Error: No executable code found in the specified file or range.';
			}
			
			return command;
			
		} catch (error) {
			return `Error: Cannot read file: ${error instanceof Error ? error.message : String(error)}`;
		}
	}
}
