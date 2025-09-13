/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IDocumentManager } from '../../erdosAiDocument/common/documentManager.js';
import { IFileContentService } from '../common/fileContentService.js';
import { IJupytextService } from '../../erdosAiIntegration/common/jupytextService.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';

export class FileContentService extends Disposable implements IFileContentService {
	readonly _serviceBrand: undefined;

	constructor(
		@IDocumentManager private readonly documentManager: IDocumentManager,
		@IJupytextService private readonly jupytextService: IJupytextService,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
	) {
		super();
	}

	async extractFileContentForWidget(filename: string, startLine?: number, endLine?: number): Promise<string> {
		try {
			// Get the full file content first (without line range) for proper Jupytext conversion
			let fileContent = await this.documentManager.getEffectiveFileContent(filename);
			
			if (!fileContent && fileContent !== '') {
				return `Error: File does not exist: ${filename}`;
			}
			
			if (fileContent.trim().length === 0) {
				return 'Error: File is empty or unreadable.';
			}

			// Convert .ipynb files to jupytext format before any line processing
			if (this.commonUtils.getFileExtension(filename).toLowerCase() === 'ipynb') {
				try {
					const convertedContent = this.jupytextService.convertNotebookToText(
						fileContent, 
						{ extension: '.py', format_name: 'percent' }
					);
					
					fileContent = convertedContent;
				} catch (error) {
					// If conversion fails, include error info but continue with raw content
					fileContent = `# Jupytext conversion failed: ${error instanceof Error ? error.message : error}\n\n${fileContent}`;
				}
			}
			
			// Split content into lines for line range processing
			let lines = fileContent.split('\n');
			
			// Apply line range if specified
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
			
			// Clean up the command
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