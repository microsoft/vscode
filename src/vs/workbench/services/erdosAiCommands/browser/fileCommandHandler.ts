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
import { IRMarkdownParser } from '../../erdosAiUtils/common/rMarkdownParser.js';
import { INotebookExecutionService } from '../../../contrib/notebook/common/notebookExecutionService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { INotebookEditor } from '../../../contrib/notebook/browser/notebookBrowser.js';
import { CellKind, NOTEBOOK_EDITOR_ID } from '../../../contrib/notebook/common/notebookCommon.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IJupytextService } from '../../erdosAiIntegration/common/jupytextService.js';
import { IConsoleCommandHandler } from '../common/consoleCommandHandler.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export class FileCommandHandler extends Disposable implements IFileCommandHandler {
	readonly _serviceBrand: undefined;
	
	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IConversationManager private readonly conversationManager: IConversationManager,
		@IDocumentManager private readonly documentManager: IDocumentManager,
		@IFileResolverService private readonly fileResolverService: IFileResolverService,
		@IRMarkdownParser private readonly rMarkdownParser: IRMarkdownParser,
		@INotebookExecutionService private readonly notebookExecutionService: INotebookExecutionService,
		@IEditorService private readonly editorService: IEditorService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IJupytextService private readonly jupytextService: IJupytextService,
		@IConsoleCommandHandler private readonly consoleCommandHandler: IConsoleCommandHandler,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
	) {
		super();
	}

	async acceptFileCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}> {
		this.logService.info(`[ACCEPT FILE] Starting acceptFileCommand for messageId: ${messageId}, requestId: ${requestId}`);
		
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
						
						this.logService.info(`[RUN FILE] File extension: ${fileExt}, detected language: ${language}`);
					}
				} catch (error) {
					this.logService.warn('Failed to parse function arguments for language detection, defaulting to R:', error);
					language = 'r';
				}
			}
			
			const executableCommand = await this.processFileForExecution(functionCallMessage.function_call, callId);
			
			if (executableCommand.startsWith('Error:')) {
				await this.conversationManager.replacePendingFunctionCallOutput(callId, executableCommand, false);
				await this.conversationManager.updateConversationDisplay();
				
				return {
					status: 'error',
					data: {
						error: executableCommand,
						related_to_id: functionCallMessage.related_to || messageId,
						request_id: requestId
					}
				};
			}
			
			try {
				let consoleOutput: string;
				
				if (language === 'python' && filename && this.isJupyterNotebook(filename)) {
					consoleOutput = await this.executeNotebookFile(filename, callId, executableCommand);
				} else {
					// Focus the console before executing the command
					try {
						await this.consoleCommandHandler.focusConsoleForLanguage(language);
					} catch (focusError) {
						// Continue with execution even if focusing fails
					}
					
					consoleOutput = await this.consoleCommandHandler.executeConsoleCommandWithOutputCapture(executableCommand, callId, language);
				}
				
				await this.conversationManager.replacePendingFunctionCallOutput(callId, consoleOutput, true);
				await this.conversationManager.updateConversationDisplay();
				
				// Always continue after successful file execution
				const relatedToId = functionCallMessage.related_to || messageId;
				
				return {
					status: 'continue_silent',
					data: {
						message: 'File execution completed - returning control to orchestrator',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
				
			} catch (executionError) {
				const errorOutput = `Error executing file: ${executionError instanceof Error ? executionError.message : 'Unknown error'}`;
				await this.conversationManager.replacePendingFunctionCallOutput(callId, errorOutput, false);
				await this.conversationManager.updateConversationDisplay();
				
				return {
					status: 'error',
					data: {
						error: executionError instanceof Error ? executionError.message : String(executionError),
						related_to_id: functionCallMessage.related_to || messageId,
						request_id: requestId
					}
				};
			}
			
		} catch (error) {
			this.logService.error('Failed to accept file command:', error);
			
			return {
				status: 'error',
				data: {
					error: error instanceof Error ? error.message : String(error),
					related_to_id: messageId,
					request_id: requestId
				}
			};
		}
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
			
			return {
				status: 'error',
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
			return `Error: Cannot read file: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	private isJupyterNotebook(filename: string): boolean {
		return filename.toLowerCase().endsWith('.ipynb');
	}

	private async executeNotebookFile(filename: string, callId: string, selectedJupytextContent: string): Promise<string> {
		try {
			
			const resolverContext = this.fileResolverService.createResolverContext();
			const fileResult = await this.commonUtils.resolveFile(filename, resolverContext);
			if (!fileResult.found || !fileResult.uri) {
				throw new Error(`Could not resolve notebook file: ${filename}`);
			}

			const fileUri = fileResult.uri;
			
			await this.editorService.openEditor({
				resource: fileUri,
				options: { revealIfOpened: true }
			});
			
			const notebookEditor = this.getActiveNotebookEditor();
			if (!notebookEditor) {
				throw new Error(`Could not find active notebook editor for ${filename}`);
			}
			
			if (!notebookEditor.hasModel()) {
				throw new Error(`Notebook editor has no model for ${filename}`);
			}
			
			const notebookModel = notebookEditor.textModel;
			if (!notebookModel) {
				throw new Error(`Could not get notebook model for ${filename}`);
			}
			
			const fullJupytextContent = await this.documentManager.getEffectiveFileContent(fileUri.fsPath);
			if (!fullJupytextContent) {
				throw new Error(`Could not get jupytext content for ${fileUri.fsPath}`);
			}
			
			const cellsToExecute = await this.mapSelectedContentToCells(selectedJupytextContent, fullJupytextContent, notebookModel);
			
			if (cellsToExecute.length === 0) {
				return `# No executable cells found in the selected content from ${filename}`;
			}
			
			await this.notebookExecutionService.executeNotebookCells(notebookModel, cellsToExecute, this.contextKeyService);
			
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			let aggregatedOutput = '';
			
			for (let i = 0; i < cellsToExecute.length; i++) {
				const cell = cellsToExecute[i];
				
				if (cell.outputs && cell.outputs.length > 0) {
					for (const output of cell.outputs) {
						if (output.outputs && output.outputs.length > 0) {
							for (const outputItem of output.outputs) {
								if (outputItem.mime === 'application/vnd.code.notebook.stdout' || 
									outputItem.mime === 'application/vnd.code.notebook.stderr' ||
									outputItem.mime === 'text/plain') {
									const outputText = outputItem.data.toString();
									aggregatedOutput += outputText;
								}
							}
						}
					}
				}
			}
			
			return aggregatedOutput;
			
		} catch (error) {
			const errorMsg = `Failed to execute notebook ${filename}: ${error instanceof Error ? error.message : error}`;
			this.logService.error(`[NOTEBOOK EXECUTION] ${errorMsg}`);
			throw new Error(errorMsg);
		}
	}

	private async mapSelectedContentToCells(selectedContent: string, fullJupytextContent: string, notebookModel: any): Promise<any[]> {
		const cellsToExecute: any[] = [];
		
		this.logService.info(`[CELL MAPPING] Selected content length: ${selectedContent.length}`);
		this.logService.info(`[CELL MAPPING] Full jupytext length: ${fullJupytextContent.length}`);
		
		try {
			const selectedNotebookJson = await this.jupytextService.pythonTextToNotebook(selectedContent, {
				extension: '.py',
				format_name: 'percent'
			});
			
			const selectedNotebook = JSON.parse(selectedNotebookJson);
			this.logService.info(`[CELL MAPPING] Selected content contains ${selectedNotebook.cells?.length || 0} cells`);
			
			const fullNotebookJson = await this.jupytextService.pythonTextToNotebook(fullJupytextContent, {
				extension: '.py',
				format_name: 'percent'
			});
			
			const fullNotebook = JSON.parse(fullNotebookJson);
			this.logService.info(`[CELL MAPPING] Full notebook contains ${fullNotebook.cells?.length || 0} cells`);
			
			if (!selectedNotebook.cells || !fullNotebook.cells) {
				this.logService.warn(`[CELL MAPPING] Could not parse cells from jupytext content`);
				return cellsToExecute;
			}
			
			const selectedCells = selectedNotebook.cells.filter((cell: any) => cell.cell_type === 'code');
			const fullCells = fullNotebook.cells.filter((cell: any) => cell.cell_type === 'code');
			
			for (const selectedCell of selectedCells) {
				const selectedSource = Array.isArray(selectedCell.source) ? selectedCell.source.join('') : selectedCell.source;
				
				for (let i = 0; i < fullCells.length; i++) {
					const fullCell = fullCells[i];
					const fullSource = Array.isArray(fullCell.source) ? fullCell.source.join('') : fullCell.source;
					
					if (selectedSource.trim() === fullSource.trim()) {
						const allCodeCells = notebookModel.cells.filter((cell: any) => cell.cellKind === CellKind.Code);
						if (i < allCodeCells.length) {
							cellsToExecute.push(allCodeCells[i]);
							this.logService.info(`[CELL MAPPING] Matched selected cell to notebook cell ${i}`);
						}
						break;
					}
				}
			}
			
			this.logService.info(`[CELL MAPPING] Mapped ${cellsToExecute.length} cells for execution using jupytext`);
			return cellsToExecute;
			
		} catch (error) {
			this.logService.error(`[CELL MAPPING] Error using jupytext to map cells:`, error);
			return cellsToExecute;
		}
	}

	extractFileContentForWidget(filename: string, startLine?: number, endLine?: number): string {
		try {
			// Use the document manager's synchronous method
			const fileContent = this.documentManager.getEffectiveFileContentSync(filename, startLine, endLine);
			
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
				const totalLines = lines.length;
				const start = startLine ? Math.max(1, startLine) : 1;
				const end = endLine ? Math.min(totalLines, endLine) : totalLines;
				
				if (start > totalLines) {
					return `Error: Start line ${start} exceeds file length (${totalLines} lines)`;
				}
				
				// Extract the specified range (convert to 0-based indexing)
				lines = lines.slice(start - 1, end);
			}
			
			// For R Markdown files, extract only R code chunks (like Rao's behavior)
			const fileExt = this.commonUtils.getFileExtension(filename).toLowerCase();
			let command: string;
			
			if (fileExt === 'rmd' || fileExt === 'qmd') {
				// Extract R code from R Markdown chunks
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

	private getActiveNotebookEditor(): INotebookEditor | undefined {
		const activeEditorPane = this.editorService.activeEditorPane;
		if (activeEditorPane && activeEditorPane.getId() === NOTEBOOK_EDITOR_ID) {
			const notebookEditor = activeEditorPane.getControl() as INotebookEditor;
			if (notebookEditor.hasModel()) {
				return notebookEditor;
			}
		}
		return undefined;
	}
}
