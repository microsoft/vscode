/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { IDocumentManager } from '../../../services/erdosAiDocument/common/documentManager.js';
import { IRMarkdownParser } from '../../erdosAiUtils/common/rMarkdownParser.js';
import { IContentProcessor } from '../common/contentProcessor.js';

export class ContentProcessor extends Disposable implements IContentProcessor {
	readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IDocumentManager private readonly documentManager: IDocumentManager,
		@IRMarkdownParser private readonly rMarkdownParser: IRMarkdownParser,
		@ICommonUtils private readonly commonUtils: ICommonUtils
	) {
		super();
	}

	async extractFileContentForWidget(filename: string, startLine?: number, endLine?: number): Promise<string> {
		try {
			const fileContent = await this.documentManager.getEffectiveFileContent(filename);
			
			if (!fileContent && fileContent !== '') {
				return `Error: File does not exist: ${filename}`;
			}
			
			if (fileContent.trim().length === 0) {
				return 'Error: File is empty or unreadable.';
			}
			
			let lines = fileContent.split('\n');
			
			if (startLine !== undefined || endLine !== undefined) {
				const totalLines = lines.length;
				const start = startLine ? Math.max(1, startLine) : 1;
				const end = endLine ? Math.min(totalLines, endLine) : totalLines;
				
				if (start > totalLines) {
					return `Error: Start line ${start} exceeds file length (${totalLines} lines)`;
				}
				
				lines = lines.slice(start - 1, end);
			}
			
			const fileExt = this.commonUtils.getFileExtension(filename).toLowerCase();
			let command: string;
			
			if (fileExt === 'rmd' || fileExt === 'qmd') {
				const codeContent = this.rMarkdownParser.extractRCodeFromRmd(lines);
				
				if (codeContent.length === 0) {
					command = lines.join('\n');
				} else {
					command = codeContent.join('\n');
				}
			} else {
				command = lines.join('\n');
			}
			
			if (!command.trim()) {
				return 'Error: No executable code found in the specified file or range.';
			}
			
			return command;
			
		} catch (error) {
			this.logService.error('extractFileContentForWidget error:', error);
			return `Error: Cannot read file: ${error instanceof Error ? error.message : String(error)}`;
		}
	}
}
