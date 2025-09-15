/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IDocumentManager } from '../../erdosAiDocument/common/documentManager.js';
import { IFileContentService } from '../common/fileContentService.js';
import { IJupytextService } from '../../erdosAiIntegration/common/jupytextService.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { reads } from '../../erdosAiIntegration/browser/jupytext/jupytext.js';
import { CellNode } from '../../erdosAiIntegration/browser/jupytext/types.js';

export class FileContentService extends Disposable implements IFileContentService {
	readonly _serviceBrand: undefined;

	constructor(
		@IDocumentManager private readonly documentManager: IDocumentManager,
		@IJupytextService private readonly jupytextService: IJupytextService,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
	) {
		super();
	}

	async extractFileContentForWidgetDisplay(filename: string, startLine?: number, endLine?: number): Promise<string> {
		try {
			// Get the full file content first (without line range) for proper Jupytext conversion
			let fileContent = await this.documentManager.getEffectiveFileContent(filename);
			
			if (!fileContent && fileContent !== '') {
				return `Error: File does not exist: ${filename}`;
			}
			
			if (fileContent.trim().length === 0) {
				return 'Error: File is empty or unreadable.';
			}

			// Handle .ipynb files using notebook cell extraction (for widget display)
			const fileExt = this.commonUtils.getFileExtension(filename).toLowerCase();			
			if (fileExt === 'ipynb') {
				try {
					// Parse original notebook
					const notebook = JSON.parse(fileContent);
					
					// Convert to jupytext to get line mapping
					const jupytextContent = this.jupytextService.convertNotebookToText(
						fileContent, 
						{ extension: '.py', format_name: 'percent' }
					);
										
					// Parse jupytext back to cells with line tracking using enhanced reads function
					const parseResult = reads(jupytextContent, { extension: '.py', format_name: 'percent' }, 4, null, true);
					
					if (typeof parseResult === 'object' && 'cellLineMap' in parseResult) {
						// Find cells that intersect with the requested line range, or all cells if no range specified
						const relevantCells: CellNode[] = [];
						
						if (startLine !== undefined || endLine !== undefined) {
							// Line range specified - find intersecting cells
							const start = Math.max(1, startLine || 1);
							const end = endLine || Number.MAX_SAFE_INTEGER;
							
							parseResult.cellLineMap.forEach(mapping => {
								// Check if this cell intersects with the requested range
								if (mapping.startLine <= end && mapping.endLine >= start) {
									const cell = notebook.cells[mapping.cellIndex];
									if (cell) {
										relevantCells.push(cell);
									}
								}
							});
						} else {
							// No line range specified - return all cells for widget display
							relevantCells.push(...notebook.cells);
						}

						
						// Return structured data indicating this is notebook cell content
						const result = JSON.stringify({
							type: 'notebook_cells',
							cells: relevantCells.map(cell => ({
								cell_type: cell.cell_type,
								source: cell.source,
								metadata: cell.metadata
							}))
						});
						return result;
					} else {
						// If jupytext parsing failed but we have a valid notebook, return all cells directly
						const result = JSON.stringify({
							type: 'notebook_cells',
							cells: notebook.cells.map((cell: CellNode) => ({
								cell_type: cell.cell_type,
								source: cell.source,
								metadata: cell.metadata
							}))
						});
						return result;
					}
				} catch (error) {
					// Try to parse the notebook directly and return all cells
					try {
						const notebook = JSON.parse(fileContent);
						const result = JSON.stringify({
							type: 'notebook_cells',
							cells: notebook.cells.map((cell: CellNode) => ({
								cell_type: cell.cell_type,
								source: cell.source,
								metadata: cell.metadata
							}))
						});
						return result;
					} catch (parseError) {
						// If all else fails, fall back to regular jupytext processing
						const convertedContent = this.jupytextService.convertNotebookToText(
							fileContent, 
							{ extension: '.py', format_name: 'percent' }
						);
						fileContent = convertedContent;
					}
				}
			}
			
			// Convert .ipynb files to jupytext format before any line processing (fallback case)
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