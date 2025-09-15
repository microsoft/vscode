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
			
			const executableCommand = await this.processFileForExecution(functionCallMessage.function_call, callId);
			
			if (executableCommand.startsWith('Error:')) {
				await this.conversationManager.replacePendingFunctionCallOutput(callId, executableCommand, false);
				await this.conversationManager.updateConversationDisplay();
				
				const errorResult = {
					status: 'error',
					data: {
						error: executableCommand,
						related_to_id: functionCallMessage.related_to || messageId,
						request_id: requestId
					}
				};
				
				return errorResult;
			}
			
			try {
				// Focus the console before executing the command
				try {
					await this.consoleCommandHandler.focusConsoleForLanguage(language);
				} catch (focusError) {
					// Continue with execution even if focusing fails
				}
				
				const consoleOutput = await this.consoleCommandHandler.executeConsoleCommandWithOutputCapture(executableCommand, callId, language);
				
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

}
