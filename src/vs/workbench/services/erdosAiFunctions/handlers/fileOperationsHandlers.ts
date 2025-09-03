/*
 * Copyright (C) 2025 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionCallArgs, FunctionResult, CallContext } from '../common/functionTypes.js';
import { BaseFunctionHandler } from './baseFunctionHandler.js';
import { computeLineDiff, diffStorage, filterDiffForDisplay } from '../../erdosAiUtils/browser/diffUtils.js';
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

		const resolverContext = {
			getAllOpenDocuments: () => context.documentManager.getAllOpenDocuments(true),
			getCurrentWorkingDirectory: () => context.fileSystemUtils.getCurrentWorkingDirectory(),
			fileExists: (path: string) => context.fileSystemUtils.fileExists(path),
			joinPath: (base: string, ...parts: string[]) => {
				if (parts.length === 1) {
					return context.commonUtils.joinPath(base, parts[0]);
				} else {
					return parts.reduce((acc, part) => context.commonUtils.joinPath(acc, part), base);
				}
			},
			getFileContent: async (uri: any) => {
				const filePath = uri.fsPath || uri.path;
				const fileContent = await context.documentManager.getEffectiveFileContent(filePath);
				return fileContent || '';
			}
		};

		const result = await context.commonUtils.resolveFile(filename, resolverContext);
		
		if (!result.found) {
			fileContent = `Error: File not found, try using your tools to look elsewhere for: ${filename}`;
			endLineToRead = startLine;
		} else {
			const effectiveContent = result.content ?? '';
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
			related_to: args.msg_id,
			start_line: startLine,
			end_line: endLineToRead
		};

		return {
			type: 'success',
			function_call_output: functionCallOutput,
			function_output_id: functionOutputId
		};
	}
}

// Arguments for search_replace function call
export interface SearchReplaceArgs extends FunctionCallArgs {
	file_path: string;
	old_string: string;
	new_string: string;
	replace_all?: boolean;
	explanation?: string;
}

// Handler for search_replace function calls
export class SearchReplaceHandler extends BaseFunctionHandler {
	async execute(args: SearchReplaceArgs, context: CallContext): Promise<FunctionResult> {

		try {
			const filePath = args.file_path;
			let oldString = args.old_string;
			let newString = args.new_string;


			if (oldString) {
				oldString = this.removeLineNumbers(oldString);
			}
			if (newString) {
				newString = this.removeLineNumbers(newString);
			}

			if (oldString && newString && oldString === newString) {
				return {
					type: 'error',
					error_message: 'Your old_string and new_string were the same. They must be different.',
					breakout_of_function_calls: true
				};
			}

			if (!filePath || oldString === null || oldString === undefined || newString === null || newString === undefined) {
				return {
					type: 'error',
					error_message: 'Error: Missing required arguments (file_path, old_string, or new_string)',
					breakout_of_function_calls: true
				};
			}

			if (oldString === '') {
				const effectiveContent = await context.documentManager.getEffectiveFileContent(filePath);
				const isNewFile = effectiveContent === null;
				
				
				let newContentForDiff: string;
				let finalFileContent: string;
				
				if (isNewFile) {
					newContentForDiff = newString;
					finalFileContent = newString;
				} else {
					const fileContent = effectiveContent || '';
					if (fileContent.length > 0 && !fileContent.endsWith('\n')) {
						finalFileContent = fileContent + '\n' + newString;
					} else {
						finalFileContent = fileContent + newString;
					}
					newContentForDiff = newString;
				}
				
				try {
					const oldLines: string[] = [];
					const newLines = newContentForDiff.split('\n');
					
					const diffResult = computeLineDiff(oldLines, newLines);
					
					if (!isNewFile) {
						const existingLineCount = (effectiveContent || '').split('\n').length;
						
						for (let i = 0; i < diffResult.diff.length; i++) {
							const diffItem = diffResult.diff[i];
							if (diffItem.new_line !== undefined && diffItem.new_line !== null) {
								diffItem.new_line = diffItem.new_line + existingLineCount;
							}
						}
					}
					
					filterDiffForDisplay(diffResult.diff);
					
					diffStorage.storeDiffData(
						context.functionCallMessageId?.toString() || '0',
						diffResult.diff,
						effectiveContent || '',
						finalFileContent,
						{ is_start_edit: false, is_end_edit: false },
						filePath,
						oldString,
						newString
					);
					
				} catch (error) {
					console.error(`[SEARCH_REPLACE_HANDLER] Error computing/storing create/append diff data:`, error);
				}
				
				const outputMessage = isNewFile 
					? `Ready to create new file: ${context.commonUtils.getBasename(filePath)}` 
					: `Ready to append to: ${context.commonUtils.getBasename(filePath)}`;

				const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
				if (functionOutputId === null) {
					throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
				}

				const functionCallOutput = {
					id: functionOutputId,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: outputMessage,
					related_to: context.functionCallMessageId || args.msg_id,
					success: true
				};

				return {
					type: 'success',
					function_call_output: functionCallOutput,
					function_output_id: functionOutputId,
					file_path: filePath,
					old_string: oldString,
					new_string: newString,
					is_create_append_mode: true,
					breakout_of_function_calls: true
				};
			}

			const effectiveContent = await context.documentManager.getEffectiveFileContent(filePath);
			
			if (effectiveContent === null) {
				const errorMessage = `File not found: ${filePath}. Please check the file path or read the current file structure.`;
				return {
					type: 'error',
					error_message: errorMessage,
					breakout_of_function_calls: true
				};
			}

			const flexiblePattern = this.createFlexibleWhitespacePattern(oldString);
			const regex = new RegExp(flexiblePattern, 'g');
			const oldStringMatches: RegExpExecArray[] = [];
			let match;
			while ((match = regex.exec(effectiveContent)) !== null) {
				oldStringMatches.push(match);
				if (!regex.global) break;
			}
			const matchCount = oldStringMatches.length;


			if (matchCount === 0) {
				const fileLines = effectiveContent.split('\n');
				const fuzzyResults = this.performFuzzySearchInContent(oldString, fileLines);
				
				let errorMessage: string;
				if (fuzzyResults.length > 0) {
					const matchDetails = fuzzyResults.map((result, i) => {
						return `Match ${i + 1} (${result.similarity}% similar, around line ${result.line}):\n\`\`\`\n${result.text}\n\`\`\``;
					});
					
					errorMessage = `The old_string was not found exactly in the file ${filePath}. However, here are similar content matches that might be what you're looking for. If this is what you wanted, please use the exact text from one of these matches:\n\n${matchDetails.join('\n\n')}`;
				} else {
					errorMessage = `The old_string does not exist in the file and no similar content was found. Read the content and try again with the exact text.`;
				}
				
				return {
					type: 'error',
					error_message: errorMessage,
					breakout_of_function_calls: true
				};
			}

			if (matchCount > 1) {
				const fileLines = effectiveContent.split('\n');
				
				const matchLineNums: number[] = [];
				for (let i = 0; i < matchCount; i++) {
					const matchPos = oldStringMatches[i].index!;
					let charCount = 0;
					let lineNum = 1;
					for (const line of fileLines) {
						charCount += line.length + 1;
						if (charCount >= matchPos) {
							break;
						}
						lineNum++;
					}
					matchLineNums[i] = lineNum;
				}
				
				const matchDetails = this.generateUniqueContexts(fileLines, matchLineNums);
				
				const errorMessage = `The old_string was found ${matchCount} times in the file ${filePath}. Please provide a more specific old_string that matches exactly one location. Here are all the matches with context:\n\n${matchDetails.join('\n\n')}`;
				
				return {
					type: 'error',
					error_message: errorMessage,
					breakout_of_function_calls: true
				};
			}

			const newContent = effectiveContent.replace(new RegExp(flexiblePattern), newString);
			
			try {
				const oldLines = effectiveContent.split('\n');
				const newLines = newContent.split('\n');
				
				const diffResult = computeLineDiff(oldLines, newLines);
				
				filterDiffForDisplay(diffResult.diff);
				
				diffStorage.storeDiffData(
					context.functionCallMessageId?.toString() || '0',
					diffResult.diff,
					effectiveContent,
					newContent,
					{ is_start_edit: false, is_end_edit: false },
					filePath,
					oldString,
					newString
				);
								
			} catch (error) {
				console.error(`[SEARCH_REPLACE_HANDLER] Error computing/storing diff data:`, error);
			}
			
			const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (functionOutputId === null) {
				throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
			}

			const functionCallOutput = {
				id: functionOutputId,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: 'Response pending...',
				related_to: context.functionCallMessageId || args.msg_id,
				procedural: true
			};

			return {
				type: 'success',
				function_call_output: functionCallOutput,
				function_output_id: functionOutputId,
				file_path: filePath,
				old_string: oldString,
				new_string: newString,
				breakout_of_function_calls: true
			};

		} catch (error) {
			console.error(`[SEARCH_REPLACE_HANDLER] Error processing search_replace:`, error);
			return {
				type: 'error',
				error_message: `Search and replace operation failed: ${error instanceof Error ? error.message : String(error)}`,
				breakout_of_function_calls: true
			};
		}
	}

	private removeLineNumbers(content: string): string {
		if (!content || content.trim() === '') {
			return content;
		}

		const lines = content.split('\n');
		const cleanedLines = lines.map(line => {
			line = line.replace(/\s*\/\/\s*\d+\s*$/, '');
			
			line = line.replace(/\s*#\s*\d+\s*$/, '');
			
			line = line.replace(/\s*<!--\s*\d+\s*$/, '');
			
			line = line.replace(/\s*%\s*\d+\s*$/, '');
			
			line = line.replace(/\s*--\s*\d+\s*$/, '');
			
			line = line.replace(/\s*\/\*\s*\d+\s*\*\/\s*$/, '');
			
			return line;
		});

		return cleanedLines.join('\n');
	}

	private performFuzzySearchInContent(searchString: string, fileLines: string[]): Array<{text: string, similarity: number, line: number}> {
		
		if (!searchString || searchString.trim().length === 0 || !fileLines || fileLines.length === 0) {
			return [];
		}
		
		searchString = searchString.trim();
		
		const fileText = fileLines.join('\n');
		
		const searchLen = searchString.length;
		const fileLen = fileText.length;
		
		if (searchLen < 3 || fileLen < searchLen) {
			return [];
		}
		
		const searchLines = searchString.split('\n');
		const seeds: string[] = [];
		const seedPositions: number[] = [];
		
		for (let i = 0; i < searchLines.length; i++) {
			const line = searchLines[i];
			const trimmedLine = line.trim();
			
			if (trimmedLine.length > 0) {
				const seedMatch = searchString.indexOf(trimmedLine);
				if (seedMatch !== -1) {
					seeds.push(trimmedLine);
					seedPositions.push(seedMatch);
				}
			}
		}
		
		const candidatePositions: Array<{filePos: number, seedMatchPos: number, seedInSearch: number}> = [];
		
		for (let j = 0; j < seeds.length; j++) {
			const seed = seeds[j];
			const seedPos = seedPositions[j];
			
			let searchStart = 0;
			while (true) {
				const matchPos = fileText.indexOf(seed, searchStart);
				if (matchPos === -1) break;
				
				const alignStart = matchPos - seedPos + 1;
				candidatePositions.push({
					filePos: alignStart,
					seedMatchPos: matchPos,
					seedInSearch: seedPos
				});
				
				searchStart = matchPos + 1;
			}
		}
		
		if (candidatePositions.length === 0) {
			return [];
		}
		
		candidatePositions.sort((a, b) => a.filePos - b.filePos);
		
		const alignments: Array<{text: string, similarity: number, line: number, distance: number, filePos: number}> = [];
		const processedPositions: number[] = [];
		
		for (const candidate of candidatePositions) {
			const filePos = candidate.filePos;
			
			if (processedPositions.some(pos => Math.abs(pos - filePos) < 10)) {
				continue;
			}
			
			const alignStart = Math.max(0, filePos - 1);
			const alignEnd = Math.min(fileLen, alignStart + searchLen);
			
			if (alignEnd > alignStart + 2) {
				const alignedText = fileText.substring(alignStart, alignEnd);
				const actualLen = alignedText.length;
				
				const compareLen = Math.min(searchLen, actualLen);
				if (compareLen >= 3) {
					const searchSubstr = searchString.substring(0, compareLen);
					const alignedSubstr = alignedText.substring(0, compareLen);
					
					const distance = this.editDistance(searchSubstr, alignedSubstr);
					const similarity = Math.round((1 - distance / compareLen) * 100 * 10) / 10;
					
					if (similarity >= 50) {
						const textBefore = fileText.substring(0, alignStart);
						const lineNum = textBefore.split('\n').length;
						
						alignments.push({
							text: alignedText,
							similarity: similarity,
							line: lineNum,
							distance: distance,
							filePos: alignStart
						});
						
						processedPositions.push(filePos);
					}
				}
			}
		}
		
		if (alignments.length === 0) {
			return [];
		}
		
		alignments.sort((a, b) => b.similarity - a.similarity);
		
		const results: Array<{text: string, similarity: number, line: number}> = [];
		const usedLineRanges: Array<{start: number, end: number}> = [];
		
		for (const alignment of alignments) {
			const startLine = alignment.line;
			const matchLines = alignment.text.split('\n');
			const endLine = startLine + matchLines.length - 1;
			
			const hasOverlap = usedLineRanges.some(usedRange => 
				!(endLine < usedRange.start || startLine > usedRange.end)
			);
			
			if (hasOverlap) {
				continue;
			}
			
			results.push({
				text: alignment.text,
				similarity: alignment.similarity,
				line: alignment.line
			});
			usedLineRanges.push({start: startLine, end: endLine});
			
			if (results.length >= 5) {
				break;
			}
		}
		
		return results;
	}

	private editDistance(str1: string, str2: string): number {
		const m = str1.length;
		const n = str2.length;
		
		const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
		
		for (let i = 0; i <= m; i++) {
			dp[i][0] = i;
		}
		for (let j = 0; j <= n; j++) {
			dp[0][j] = j;
		}
		
		for (let i = 1; i <= m; i++) {
			for (let j = 1; j <= n; j++) {
				if (str1[i - 1] === str2[j - 1]) {
					dp[i][j] = dp[i - 1][j - 1];
				} else {
					dp[i][j] = 1 + Math.min(
						dp[i - 1][j],
						dp[i][j - 1],
						dp[i - 1][j - 1]
					);
				}
			}
		}
		
		return dp[m][n];
	}

	private generateUniqueContexts(fileLines: string[], matchLineNums: number[]): string[] {
		
		if (matchLineNums.length <= 1) {
			return [];
		}
		
		const maxContext = 10;
		
		for (let contextSize = 1; contextSize <= maxContext; contextSize++) {
			const currentContexts: Array<{context: string, display: string}> = [];
			
			for (let i = 0; i < matchLineNums.length; i++) {
				const lineNum = matchLineNums[i];
				
				const startLine = Math.max(1, lineNum - contextSize);
				const endLine = Math.min(fileLines.length, lineNum + contextSize);
				const contextLines = fileLines.slice(startLine - 1, endLine);
				
				const contextStr = contextLines.join('\n');
				const display = `Match ${i + 1} (around line ${lineNum}):\n\`\`\`\n${contextStr}\n\`\`\``;
				
				currentContexts[i] = {
					context: contextStr,
					display: display
				};
			}
			
			const contextStrings = currentContexts.map(x => x.context);
			const uniqueContexts = [...new Set(contextStrings)];
			if (uniqueContexts.length === contextStrings.length) {
				return currentContexts.map(x => x.display);
			}
		}
		
		const finalContexts: string[] = [];
		for (let i = 0; i < matchLineNums.length; i++) {
			const lineNum = matchLineNums[i];
			const startLine = Math.max(1, lineNum - maxContext);
			const endLine = Math.min(fileLines.length, lineNum + maxContext);
			const contextLines = fileLines.slice(startLine - 1, endLine);
			
			finalContexts[i] = `Match ${i + 1} (around line ${lineNum}):\n\`\`\`\n${contextLines.join('\n')}\n\`\`\``;
		}
		
		return finalContexts;
	}

	private createFlexibleWhitespacePattern(text: string): string {
		if (!text || text === '') {
			return '';
		}
		
		let escapedText = text.replace(/([.\\^$*+?{}[\]|()\\])/g, '\\$1');
		
		const lines = escapedText.split('\n');
		
		const flexibleLines = lines.map(line => {
			const lineTrimmed = line.replace(/[ \t]*$/, '');
			return lineTrimmed + '[ \\t]*';
		});
		
		const flexiblePattern = flexibleLines.join('\n');
		
		return flexiblePattern;
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

			const resolverContext = {
				getAllOpenDocuments: () => context.documentManager.getAllOpenDocuments(false),
				getCurrentWorkingDirectory: () => context.fileSystemUtils.getCurrentWorkingDirectory(),
				fileExists: (path: string) => context.fileSystemUtils.fileExists(path),
				joinPath: (base: string, ...parts: string[]) => {
					if (parts.length === 1) {
						return context.commonUtils.joinPath(base, parts[0]);
					} else {
						return parts.reduce((acc, part) => context.commonUtils.joinPath(acc, part), base);
					}
				},
				getFileContent: async (uri: any) => ''
			};

			const result = await context.commonUtils.resolveFilePathToUri(filename, resolverContext);
			const foundInTabs = result.found && result.isFromEditor;
			const fileExists = result.found && !result.isFromEditor;
			
			if (!fileExists && !foundInTabs) {
				
				const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
				if (functionOutputId === null) {
					throw new Error(`Pre-allocated function call output ID not found for call_id: ${args.call_id}`);
				}

				const functionCallOutput = {
					id: functionOutputId,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: `${filename} could not be found.`,
					related_to: context.functionCallMessageId || args.msg_id,
					success: false,
					procedural: false
				};

				return {
					type: 'success',
					function_call_output: functionCallOutput,
					function_output_id: functionOutputId,
					breakout_of_function_calls: false
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
				related_to: context.functionCallMessageId || args.msg_id,
				procedural: true
			};

			return {
				type: 'success',
				function_call_output: functionCallOutput,
				function_output_id: functionOutputId,
				breakout_of_function_calls: true
			};

		} catch (error) {
			console.error(`Exception in delete_file processing:`, error);
			return {
				type: 'error',
				error_message: `Delete file operation failed: ${error instanceof Error ? error.message : String(error)}`,
				breakout_of_function_calls: true
			};
		}
	}
}
