/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileCommandHandler } from '../common/fileCommandHandler.js';

import { ILogService } from '../../../../platform/log/common/log.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { ConversationMessage } from '../../erdosAi/common/conversationTypes.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { IDocumentManager } from '../../erdosAiDocument/common/documentManager.js';
import { IFileResolverService } from '../../erdosAiUtils/common/fileResolverService.js';
import { IConsoleCommandHandler } from '../common/consoleCommandHandler.js';
import { IJupytextService } from '../../erdosAiIntegration/common/jupytextService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { INotebookExecutionService } from '../../../contrib/notebook/common/notebookExecutionService.js';
import { getNotebookEditorFromEditorPane } from '../../../contrib/notebook/browser/notebookBrowser.js';
import { URI } from '../../../../base/common/uri.js';
import { CellKind } from '../../../contrib/notebook/common/notebookCommon.js';
import { reads } from '../../erdosAiIntegration/browser/jupytext/jupytext.js';
import { getOutputText, TEXT_BASED_MIMETYPES } from '../../../contrib/notebook/browser/viewModel/cellOutputTextHelper.js';

export class FileCommandHandler extends Disposable implements IFileCommandHandler {
	readonly _serviceBrand: undefined;
	
	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IConversationManager private readonly conversationManager: IConversationManager,
		@IDocumentManager private readonly documentManager: IDocumentManager,
		@IFileResolverService private readonly fileResolverService: IFileResolverService,
		@IConsoleCommandHandler private readonly consoleCommandHandler: IConsoleCommandHandler,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
		@IJupytextService private readonly jupytextService: IJupytextService,
		@IEditorService private readonly editorService: IEditorService,
		@INotebookExecutionService private readonly notebookExecutionService: INotebookExecutionService,
	) {
		super();
	}

	async acceptFileCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}> {
		try {
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (!currentConversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = currentConversation.messages.find((m: ConversationMessage) => m.id === messageId);
			
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			const callId = functionCallMessage.function_call.call_id;
			const relatedToId = functionCallMessage.related_to || messageId;
			
			// Parse arguments and determine language
			let language = 'r';
			let filename: string | undefined;
			if (functionCallMessage.function_call.arguments) {
				try {
					const args = JSON.parse(functionCallMessage.function_call.arguments);
					filename = args.filename;
					
					if (filename) {
						const fileExt = this.commonUtils.getFileExtension(filename).toLowerCase();
						
						if (fileExt === 'py' || fileExt === 'ipynb') {
							language = 'python';
						} else if (fileExt === 'r' || fileExt === 'rmd' || fileExt === 'qmd') {
							language = 'r';
						}
					}
				} catch (error) {
					this.logService.warn('Failed to parse function arguments for language detection, defaulting to R:', error);
					language = 'r';
				}
			}
			
			// Execute based on file type
			let executionResult: string;
			let successMessage: string;
			
			if (filename && this.commonUtils.getFileExtension(filename).toLowerCase() === 'ipynb') {
				// Execute notebook cells
				executionResult = await this.executeNotebookCells(functionCallMessage.function_call, callId);
				successMessage = 'Notebook cells executed successfully - returning control to orchestrator';
			} else {
				// Execute regular file
				const executableCommand = await this.processFileForExecution(functionCallMessage.function_call, callId);
				
				if (executableCommand.startsWith('Error:')) {
					return await this.handleExecutionResult(callId, executableCommand, false, relatedToId, requestId);
				}
				
				// Focus the console before executing the command
				try {
					await this.consoleCommandHandler.focusConsoleForLanguage(language);
				} catch (focusError) {
					// Continue with execution even if focusing fails
				}
				
				executionResult = await this.consoleCommandHandler.executeConsoleCommandWithOutputCapture(executableCommand, callId, language);
				successMessage = 'File execution completed - returning control to orchestrator';
			}
			
			// Handle execution result
			return await this.handleExecutionResult(callId, executionResult, true, relatedToId, requestId, successMessage);
			
		} catch (error) {
			this.logService.error('Failed to accept file command:', error);
			
			// Even setup errors should continue_silent so AI can respond
			return {
				status: 'continue_silent',
				data: {
					error: error instanceof Error ? error.message : String(error),
					related_to_id: messageId,
					request_id: requestId
				}
			};
		}
	}

	private async handleExecutionResult(
		callId: string, 
		result: string, 
		isSuccess: boolean, 
		relatedToId: number, 
		requestId: string,
		successMessage?: string
	): Promise<{status: string, data: any}> {
		// Update conversation with result
		await this.conversationManager.replacePendingFunctionCallOutput(callId, result, isSuccess);
		await this.conversationManager.updateConversationDisplay();
		
		// Python/R code errors should ALWAYS continue_silent so AI can respond
		// The error output has already been saved to function_call_output above
		return {
			status: 'continue_silent',
			data: {
				message: successMessage || 'Execution completed - returning control to orchestrator',
				related_to_id: relatedToId,
				request_id: requestId
			}
		};
	}

	async cancelFileCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		this.logService.info(`[CANCEL FILE] Starting cancelFileCommand for messageId: ${messageId}, requestId: ${requestId}`);
		
		try {
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (!currentConversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = currentConversation.messages.find((m: any) => m.id === messageId);
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			const callId = functionCallMessage.function_call.call_id;
			
			// Update with cancellation message
			const outputMessage = {
				id: this.conversationManager.getNextMessageId(),
				type: 'function_call_output',
				call_id: callId,
				output: 'File execution was cancelled',
				related_to: messageId,
				procedural: true
			};
			
			await this.conversationManager.addFunctionCallOutput(outputMessage);
			
			// Always continue after file execution cancellation
			const relatedToId = functionCallMessage.related_to || messageId;
			
			return {
				status: 'continue_silent',
				data: {
					message: 'File execution cancelled - returning control to orchestrator',
					related_to_id: relatedToId,
					request_id: requestId
				}
			};
			
		} catch (error) {
			this.logService.error('Failed to cancel file command:', error);
			
			// Even cancellation errors should continue_silent so AI can respond
			return {
				status: 'continue_silent',
				data: {
					error: error instanceof Error ? error.message : String(error),
					related_to_id: messageId,
					request_id: requestId
				}
			};
		}
	}

	async processFileForExecution(functionCall: any, callId: string): Promise<string> {
		try {
			const args = JSON.parse(functionCall.arguments || '{}');
			const filename = args.filename;
			const startLine = args.start_line_one_indexed;
			const endLine = args.end_line_one_indexed_inclusive;
			
			if (!filename) {
				return 'Error: No filename provided';
			}
			
			const resolverContext = this.fileResolverService.createResolverContext();
			const fileResult = await this.commonUtils.resolveFile(filename, resolverContext);
			if (!fileResult.found || !fileResult.uri) {
				return `Error: File does not exist: ${filename}`;
			}

			const fileUri = fileResult.uri;
			
			const stat = await this.fileService.resolve(fileUri);
			if (stat.isDirectory) {
				return 'Error: Cannot run directories. Specify a file instead.';
			}
			
			const fileContent = await this.documentManager.getEffectiveFileContent(filename);
			
			if (fileContent === null) {
				return 'Error: File does not exist or is unreadable.';
			}
			
			if (fileContent.trim().length === 0) {
				return 'Error: File is empty.';
			}
			
			// Use the existing widget execution method
			return await this.extractFileContentForWidgetExecution(filename, startLine, endLine);
			
		} catch (error) {
			return `Error: Cannot read file: ${error instanceof Error ? error.message : String(error)}`;
		}
	}


	async extractFileContentForWidgetExecution(filename: string, startLine?: number, endLine?: number): Promise<string> {
		try {
			// Get the full file content first (without line range) for proper Jupytext conversion
			let fileContent = await this.documentManager.getEffectiveFileContent(filename);
			
			if (!fileContent && fileContent !== '') {
				return `Error: File does not exist: ${filename}`;
			}
			
			if (fileContent.trim().length === 0) {
				return 'Error: File is empty or unreadable.';
			}

			// Handle .ipynb files - for execution, skip structured JSON and convert directly to jupytext
			// (This is identical to the display function but skips the cell extraction part)
			const fileExt = this.commonUtils.getFileExtension(filename).toLowerCase();			
			if (fileExt === 'ipynb') {
				// For execution, we skip the cell extraction logic and go straight to jupytext conversion
				// This is equivalent to the "fallback" path in the display function
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

	async executeNotebookCells(functionCall: any, callId: string): Promise<string> {
		try {
			const args = JSON.parse(functionCall.arguments || '{}');
			const filename = args.filename;
			const startLine = args.start_line_one_indexed;
			const endLine = args.end_line_one_indexed_inclusive;

			if (!filename) {
				return 'Error: No filename provided';
			}
			
			// Resolve the file URI
			const resolverContext = this.fileResolverService.createResolverContext();
			const fileResult = await this.commonUtils.resolveFile(filename, resolverContext);
			if (!fileResult.found || !fileResult.uri) {
				return `Error: File does not exist: ${filename}`;
			}

			const fileUri = fileResult.uri;
			
			// Check if file is a directory
			const stat = await this.fileService.resolve(fileUri);
			if (stat.isDirectory) {
				return 'Error: Cannot run directories. Specify a file instead.';
			}
			
			// Get the file content to parse the notebook
			const fileContent = await this.documentManager.getEffectiveFileContent(filename);

			if (fileContent === null) {
				return 'Error: File does not exist or is unreadable.';
			}

			if (fileContent.trim().length === 0) {
				return 'Error: File is empty.';
			}
			
			// Parse the notebook JSON
			let notebookData: any;
			try {
				notebookData = JSON.parse(fileContent);
			} catch (parseError) {
				return `Error: Invalid notebook file format: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`;
			}

			if (!notebookData.cells || !Array.isArray(notebookData.cells)) {
				return 'Error: Notebook does not contain valid cells';
			}
			
			// Use the proper line-to-cell mapping from the existing codebase
			let cellIndicesToExecute: number[] = [];

			if (startLine !== undefined || endLine !== undefined) {
				const mappingResult = await this.mapLinesToNotebookCells(filename, startLine, endLine);
				if (typeof mappingResult === 'string' && mappingResult.startsWith('Error:')) {
					return mappingResult;
				}
				cellIndicesToExecute = mappingResult as number[];
			} else {
				// No line range specified - execute all code cells
				cellIndicesToExecute = notebookData.cells
					.map((cell: any, index: number) => cell.cell_type === 'code' ? index : -1)
					.filter((index: number) => index !== -1);
			}

			if (cellIndicesToExecute.length === 0) {
				return 'Error: No code cells found in the specified range.';
			}
			
			// Open the notebook if it's not already open
			const notebookEditor = await this.openNotebook(fileUri);
			if (!notebookEditor) {
				return 'Error: Failed to open notebook editor';
			}

			// Execute the cells
			const result = await this.executeCellsInNotebook(notebookEditor, cellIndicesToExecute);
			return result;
			
		} catch (error) {
			return `Error: Cannot execute notebook cells: ${error instanceof Error ? error.message : String(error)}`;
		}
	}
	
	private async mapLinesToNotebookCells(filename: string, startLine?: number, endLine?: number): Promise<number[] | string> {
		try {
			// Get the original notebook file content
			const fileContent = await this.documentManager.getEffectiveFileContent(filename);
			if (!fileContent) {
				return 'Error: Could not read notebook file';
			}
			
			// Parse the original notebook
			const originalNotebook = JSON.parse(fileContent);
			
			// Convert notebook to jupytext format to get the line mapping
			const jupytextContent = this.jupytextService.convertNotebookToText(
				fileContent,
				{ extension: '.py', format_name: 'percent' }
			);
			
			// Use the reads function with line tracking to get the proper mapping
			// This is the EXACT same logic that the display uses
			const parseResult = reads(jupytextContent, { extension: '.py', format_name: 'percent' }, 4, null, true);

			if (typeof parseResult === 'object' && 'cellLineMap' in parseResult && parseResult.cellLineMap) {
				
				// Find cells that intersect with the requested line range
				const relevantCellIndices: number[] = [];
				const start = Math.max(1, startLine || 1);
				const end = endLine || Number.MAX_SAFE_INTEGER;

				for (const mapping of parseResult.cellLineMap) {
					// Check if this cell intersects with the requested range
					if (mapping.startLine <= end && mapping.endLine >= start) {
						// Only include code cells from the original notebook
						const originalCell = originalNotebook.cells[mapping.cellIndex];
						if (originalCell && originalCell.cell_type === 'code') {
							relevantCellIndices.push(mapping.cellIndex);
						}
					}
				}

				return relevantCellIndices;
			} else {
				// If jupytext parsing failed, fall back to all code cells
				const allCodeCellIndices = originalNotebook.cells
					.map((cell: any, index: number) => cell.cell_type === 'code' ? index : -1)
					.filter((index: number) => index !== -1);

				return allCodeCellIndices;
			}
			
		} catch (error) {
			return `Error: Failed to map lines to cells: ${error instanceof Error ? error.message : String(error)}`;
		}
	}
	
	
	private async openNotebook(fileUri: URI): Promise<any> {
		try {
			// Open the notebook using the editor service
			const editorPane = await this.editorService.openEditor({
				resource: fileUri,
				options: {
					revealIfOpened: true,
					preserveFocus: false
				}
			});

			// Get the notebook editor from the editor pane
			const notebookEditor = getNotebookEditorFromEditorPane(editorPane);

			if (!notebookEditor) {
				throw new Error('Failed to get notebook editor from editor pane');
			}

			// Wait for the notebook to be ready
			if (!notebookEditor.hasModel()) {
				// Wait a bit for the model to load
				await new Promise(resolve => setTimeout(resolve, 100));

				if (!notebookEditor.hasModel()) {
					throw new Error('Notebook model failed to load');
				}
			}

			return notebookEditor;
		} catch (error) {
			this.logService.error('Failed to open notebook:', error);
			return null;
		}
	}
	
	private async executeCellsInNotebook(notebookEditor: any, cellIndicesToExecute: number[]): Promise<string> {
		try {
			if (!notebookEditor.textModel) {
				return 'Error: Notebook model not available';
			}

			const textModel = notebookEditor.textModel;
			
			// Get the actual cell models from the notebook based on the indices
			const notebookCells = [];

			for (const cellIndex of cellIndicesToExecute) {
				if (cellIndex >= 0 && cellIndex < textModel.cells.length) {
					const cell = textModel.cells[cellIndex];

					if (cell.cellKind === CellKind.Code) {
						notebookCells.push(cell);
					}
				}
			}

			if (notebookCells.length === 0) {
				return 'Error: No executable code cells found in notebook';
			}
			
			// Execute the cells using the notebook execution service
			await this.notebookExecutionService.executeNotebookCells(
				textModel,
				notebookCells,
				notebookEditor.scopedContextKeyService || notebookEditor.contextKeyService
			);

			// Collect the outputs from all executed cells
			const cellOutputs: string[] = [];

			for (let i = 0; i < notebookCells.length; i++) {
				const cell = notebookCells[i];
				const cellIndex = cellIndicesToExecute[i];

				if (cell.outputs.length === 0) {
					continue;
				}
				
				const cellOutputTexts: string[] = [];
				
				for (const output of cell.outputs) {
					for (const outputItem of output.outputs) {
						// Use the existing proven output extraction function from the codebase
						if (TEXT_BASED_MIMETYPES.includes(outputItem.mime)) {
							const outputText = getOutputText(outputItem.mime, outputItem, false);
							if (outputText.trim()) {
								cellOutputTexts.push(outputText);
							}
						} else if (outputItem.mime.startsWith('image/')) {
							cellOutputTexts.push(`[Image output: ${outputItem.mime}]`);
						}
					}
				}
				
				if (cellOutputTexts.length > 0) {
					const combinedOutput = cellOutputTexts.join('\n');
					cellOutputs.push(`Cell ${cellIndex + 1} output:\n${combinedOutput}`);
				} else {
					cellOutputs.push(`Cell ${cellIndex + 1}: (no text output)`);
				}
			}
			
			if (cellOutputs.length === 0) {
				const message = `Executed ${notebookCells.length} notebook cell${notebookCells.length === 1 ? '' : 's'} successfully, but no outputs were produced.`;
				return message;
			}

			const finalOutput = cellOutputs.join('\n\n');
			return finalOutput;
			
		} catch (error) {
			this.logService.error('Failed to execute notebook cells:', error);
			return `Error: Failed to execute notebook cells: ${error instanceof Error ? error.message : 'Unknown error'}`;
		}
	}

}
