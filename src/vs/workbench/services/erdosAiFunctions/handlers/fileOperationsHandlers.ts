/*
 * Copyright (C) 2025 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionCallArgs, FunctionResult, CallContext } from '../common/functionTypes.js';
import { BaseFunctionHandler } from './baseFunctionHandler.js';
// CommonUtils is accessed through context.commonUtils

// Arguments for read_file function call
export interface ReadFileArgs extends FunctionCallArgs {
	filename: string;
	should_read_entire_file?: boolean;
	start_line_one_indexed?: number;
	end_line_one_indexed_inclusive?: number;
	explanation?: string;
}

// Handler for read_file function calls
export class ReadFileHandler extends BaseFunctionHandler {
	async execute(args: ReadFileArgs, context: CallContext): Promise<FunctionResult> {
		const filename = args.filename;
		const shouldReadEntireFile = args.should_read_entire_file;
		let startLine = args.start_line_one_indexed;
		let endLine = args.end_line_one_indexed_inclusive;

		if (!startLine) {
			startLine = 1;
		}
		if (!endLine) {
			endLine = startLine + 199;
		}

		const baseMaxLines = 50;
		const baseMaxChars = 5000;
		const absoluteMaxLines = 250;
		const absoluteMaxChars = 25000;

		let maxLines = baseMaxLines;
		let maxChars = baseMaxChars;

		let prevReadSameFile = false;
		let prevMaxLines = baseMaxLines;

		if (context.conversationUtilities) {
			try {
				const currentLog = await context.conversationUtilities.readConversationLog();
				const analysisResult = await context.conversationUtilities.analyzeConversationHistory(filename, currentLog);
				prevReadSameFile = analysisResult.prevReadSameFile;
				prevMaxLines = analysisResult.prevMaxLines;
			} catch (error) {
			}
		}

		if (prevReadSameFile) {
			maxLines = prevMaxLines * 2;
			maxChars = baseMaxChars * (maxLines / baseMaxLines);

			if (maxLines > absoluteMaxLines) {
				maxLines = absoluteMaxLines;
				maxChars = absoluteMaxChars;
			}
		}

		let fileContent: string;
		let endLineToRead: number;

		const resolverContext = context.fileResolverService.createResolverContext();

		const result = await context.commonUtils.resolveFile(filename, resolverContext);
		
		if (!result.found) {
			fileContent = `Error: File not found, try using your tools to look elsewhere for: ${filename}`;
			endLineToRead = startLine;
		} else {
			let effectiveContent = result.content ?? '';
			
			// Convert .ipynb files to jupytext format before any line processing
			if (context.commonUtils.getFileExtension(filename).toLowerCase() === 'ipynb') {
				try {
					const convertedContent = context.jupytextService.convertNotebookToText(
						effectiveContent, 
						{ extension: '.py', format_name: 'percent' }
					);
					
					effectiveContent = convertedContent;
				} catch (error) {
					// If conversion fails, include error info but continue with raw content
					effectiveContent = `# Jupytext conversion failed: ${error instanceof Error ? error.message : error}\n\n${effectiveContent}`;
				}
			}
			
			const allLines = effectiveContent.split('\n');

			if (shouldReadEntireFile) {
				const result = allLines.join('\n');
				const header = `File: ${filename}\nEntire file content (${allLines.length} total lines):\n\n`;
				fileContent = header + result;
				startLine = 1;
				endLineToRead = allLines.length;
			} else {
				if (startLine < 1) {
					startLine = 1;
				}
				if (endLine > allLines.length) {
					endLine = allLines.length;
				}
				if (startLine > endLine!) {
					fileContent = `Error: Invalid line range. Start line (${startLine}) is greater than end line (${endLine!}).`;
					endLineToRead = startLine;
				} else {
					const userRequestedRange = endLine! - startLine + 1;
					const shouldRespectExactRange = userRequestedRange <= 50;

					if (shouldRespectExactRange) {
						endLineToRead = endLine!;
						const requestedLines = allLines.slice(startLine - 1, endLine!);
						const result = requestedLines.join('\n');
						const header = `File: ${filename}\nLines ${startLine}-${endLineToRead} (of ${allLines.length} total lines):\n\n`;
						fileContent = header + result;
					} else {
						let linesToRead = Math.min(endLine! - startLine + 1, maxLines);

						if ((endLine! - startLine + 1) >= 200 && linesToRead < 200) {
							linesToRead = 200;
						}

						endLineToRead = startLine + linesToRead - 1;
						const requestedLines = allLines.slice(startLine - 1, endLineToRead);
						const totalChars = requestedLines.reduce((sum: number, line: string) => sum + line.length + 1, 0);

						let result = requestedLines.join('\n');

						if (endLineToRead < endLine! || totalChars > maxChars) {
							if (totalChars > maxChars) {
								let charsCount = 0;
								let linesIncluded = 0;
								for (let i = 0; i < requestedLines.length; i++) {
									const lineLen = requestedLines[i].length + 1;
									if (charsCount + lineLen <= maxChars) {
										charsCount += lineLen;
										linesIncluded = i + 1;
									} else {
										break;
									}
								}

								if (linesIncluded === 0) {
									linesIncluded = 1;
								}
								const truncatedLines = requestedLines.slice(0, linesIncluded);
								result = truncatedLines.join('\n');
								const truncatedLine = startLine + linesIncluded;
								result += `\n\n...[Truncated due to length at line ${truncatedLine}. If more lines are needed, start reading from here. The number of lines you can read doubles on each call.]`;
							} else {
								const truncatedLine = endLineToRead + 1;
								result += `\n\n...[Truncated due to length at line ${truncatedLine}. If more lines are needed, start reading from here. The number of lines you can read doubles on each call.]`;
							}
						}

						const header = `File: ${filename}\nLines ${startLine}-${endLineToRead} (of ${allLines.length} total lines):\n\n`;
						fileContent = header + result;
					}
				}
			}
		}

		if (fileContent) {
			const fileLines = fileContent.split('\n');
			
			let headerEnd = 0;
			for (let i = 0; i < fileLines.length; i++) {
				if (fileLines[i] === '' && i > 0) {
					headerEnd = i;
					break;
				}
			}

			if (headerEnd > 0 && headerEnd < fileLines.length - 1) {
				const headerPart = fileLines.slice(0, headerEnd + 1);
				const contentPart = fileLines.slice(headerEnd + 1);
				
				const limitedContent = this.limitOutputText(contentPart, context, 50000, 250, 200);
				
				fileContent = [...headerPart, ...limitedContent].join('\n');
			} else {
				const limitedLines = this.limitOutputText(fileLines, context, 50000, 250, 200);
				fileContent = limitedLines.join('\n');
			}
		}

		const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2) 
			|| context.conversationManager.getNextMessageId();

		const functionCallOutput = {
			id: functionOutputId,
			type: 'function_call_output' as const,
			call_id: args.call_id || '',
			output: fileContent,
			related_to: context.functionCallMessageId!,
			start_line: startLine,
			end_line: endLineToRead,
			success: result.found,
			procedural: false
		};

		return {
			type: 'success',
			function_call_output: functionCallOutput,
			function_output_id: functionOutputId
		};
	}
}


// Arguments for delete_file function call
export interface DeleteFileArgs extends FunctionCallArgs {
	filename: string;
	explanation?: string;
}

// Handler for delete_file function calls
export class DeleteFileHandler extends BaseFunctionHandler {
	async execute(args: DeleteFileArgs, context: CallContext): Promise<FunctionResult> {
		try {
			const filename = args.filename;

			const resolverContext = context.fileResolverService.createResolverContext();

			const result = await context.commonUtils.resolveFilePathToUri(filename, resolverContext);
			const foundInTabs = result.found && result.isFromEditor;
			const fileExists = result.found && !result.isFromEditor;
			
			if (!fileExists && !foundInTabs) {
				// CORRECTED: Add the error message to conversation, then return error to complete branch
				const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
				if (functionOutputId === null) {
					throw new Error(`Pre-allocated function call output ID not found for call_id: ${args.call_id}`);
				}

				const functionCallOutput = {
					id: functionOutputId,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: `${filename} could not be found.`,
					related_to: context.functionCallMessageId!,
					success: false,
					procedural: false
				};

				return {
					type: 'success',
					function_call_output: functionCallOutput,
					function_output_id: functionOutputId,
					status: 'continue_silent'  // This tells the orchestrator to continue without waiting
				};
			}
			

			const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (functionOutputId === null) {
				throw new Error(`Pre-allocated function call output ID not found for call_id: ${args.call_id}`);
			}

			const functionCallOutput = {
				id: functionOutputId,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: 'Response pending...',
				related_to: context.functionCallMessageId!,
				procedural: true
			};

			return {
				type: 'success',
				function_call_output: functionCallOutput,
				function_output_id: functionOutputId,
			};

		} catch (error) {
			console.error(`Exception in delete_file processing:`, error);
			return {
				type: 'error',
				error_message: `Delete file operation failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
}

// Arguments for run_file function call
export interface RunFileArgs extends FunctionCallArgs {
	filename?: string;
	file_path?: string;
	start_line_one_indexed?: number;
	end_line_one_indexed_inclusive?: number;
	command?: string;
	explanation?: string;
}

// Handler for run_file function calls
export class RunFileHandler extends BaseFunctionHandler {
	async execute(args: RunFileArgs, context: CallContext): Promise<FunctionResult> {
		try {
			const filename = args.filename || args.file_path;
			
			if (!filename) {
				// CORRECTED: Add the error message to conversation, then return success to complete branch
				const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
				if (functionOutputId === null) {
					throw new Error(`Pre-allocated function call output ID not found for call_id: ${args.call_id}`);
				}

				const functionCallOutput = {
					id: functionOutputId,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: `No filename provided for run_file.`,
					related_to: context.functionCallMessageId!,
					success: false,
					procedural: false
				};

				return {
					type: 'success',
					function_call_output: functionCallOutput,
					function_output_id: functionOutputId,
					status: 'continue_silent'  // This tells the orchestrator to continue without waiting
				};
			}

			const resolverContext = context.fileResolverService.createResolverContext();

			const result = await context.commonUtils.resolveFilePathToUri(filename, resolverContext);
			const foundInTabs = result.found && result.isFromEditor;
			const fileExists = result.found && !result.isFromEditor;
			
			if (!fileExists && !foundInTabs) {
				// CORRECTED: Add the error message to conversation, then return success to complete branch
				const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
				if (functionOutputId === null) {
					throw new Error(`Pre-allocated function call output ID not found for call_id: ${args.call_id}`);
				}

				const functionCallOutput = {
					id: functionOutputId,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: `${filename} could not be found.`,
					related_to: context.functionCallMessageId!,
					success: false,
					procedural: false
				};

				return {
					type: 'success',
					function_call_output: functionCallOutput,
					function_output_id: functionOutputId,
					status: 'continue_silent'  // This tells the orchestrator to continue without waiting
				};
			}
			
			// File exists, create pending response for user interaction
			const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (functionOutputId === null) {
				throw new Error(`Pre-allocated function call output ID not found for call_id: ${args.call_id}`);
			}

			const functionCallOutput = {
				id: functionOutputId,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: 'Response pending...',
				related_to: context.functionCallMessageId!,
				procedural: true
			};

			return {
				type: 'success',
				function_call_output: functionCallOutput,
				function_output_id: functionOutputId,
			};

		} catch (error) {
			console.error(`Exception in run_file processing:`, error);
			return {
				type: 'error',
				error_message: `Run file operation failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
}
