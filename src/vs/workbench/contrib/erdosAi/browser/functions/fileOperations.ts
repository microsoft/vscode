/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionCallArgs, FunctionResult, CallContext } from './types.js';
import { BaseFunctionHandler } from './baseFunctionHandler.js';
import { computeLineDiff, diffStorage, filterDiffForDisplay } from '../utils/diffUtils.js';
import { CommonUtils } from '../utils/commonUtils.js';

/**
 * Arguments for read_file function call
 */
export interface ReadFileArgs extends FunctionCallArgs {
	filename: string;
	should_read_entire_file?: boolean;
	start_line_one_indexed?: number;
	end_line_one_indexed_inclusive?: number;
	explanation?: string;
}

/**
 * Handler for read_file function calls
 * Based on Rao's handle_read_file implementation in SessionAiSearch.R
 */
export class ReadFileHandler extends BaseFunctionHandler {
	async execute(args: ReadFileArgs, context: CallContext): Promise<FunctionResult> {
		const filename = args.filename;
		const shouldReadEntireFile = args.should_read_entire_file;
		let startLine = args.start_line_one_indexed;
		let endLine = args.end_line_one_indexed_inclusive;

		// Validate parameters (based on Rao lines 1617-1625)
		if (!startLine) {
			startLine = 1; // Default to line 1 if startLine is missing
		}
		if (!endLine) {
			endLine = startLine + 199; // Default to reading 200 lines if endLine is missing
		}

		// Set limits (based on Rao lines 1627-1634)
		const baseMaxLines = 50;
		const baseMaxChars = 5000;
		const absoluteMaxLines = 250;
		const absoluteMaxChars = 25000;

		let maxLines = baseMaxLines;
		let maxChars = baseMaxChars;

		// Check conversation history for previous reads of same file (Rao lines 1636-1703)
		// Note: This is simplified for now - could be enhanced later with full conversation analysis
		let prevReadSameFile = false;
		let prevMaxLines = baseMaxLines;

		// For now, use simplified conversation analysis
		if (context.conversationUtilities) {
			try {
				const currentLog = await context.conversationUtilities.readConversationLog();
				const analysisResult = await context.conversationUtilities.analyzeConversationHistory(filename, currentLog);
				prevReadSameFile = analysisResult.prevReadSameFile;
				prevMaxLines = analysisResult.prevMaxLines;
			} catch (error) {
				// Continue with default values if analysis fails
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

		// Use unified file resolution system
		const resolverContext = {
			getAllOpenDocuments: () => context.documentManager.getAllOpenDocuments(true),
			getCurrentWorkingDirectory: () => context.fileSystemUtils.getCurrentWorkingDirectory(),
			fileExists: (path: string) => context.fileSystemUtils.fileExists(path),
			joinPath: (base: string, ...parts: string[]) => {
				if (parts.length === 1) {
					return context.fileSystemUtils.joinPath(base, parts[0]);
				} else {
					return parts.reduce((acc, part) => context.fileSystemUtils.joinPath(acc, part), base);
				}
			},
			getFileContent: async (uri: any) => {
				// Use DocumentManager to handle .ipynb conversion properly
				const filePath = uri.fsPath || uri.path;
				const fileContent = await context.documentManager.getEffectiveFileContent(filePath);
				return fileContent || '';
			}
		};

		const result = await CommonUtils.resolveFile(filename, resolverContext);
		
		if (!result.found) {
			fileContent = `Error: File not found, try using your tools to look elsewhere for: ${filename}`;
			endLineToRead = startLine;
		} else {
			// File was found, get content (might be empty string which is valid)
			const effectiveContent = result.content ?? '';
			const allLines = effectiveContent.split('\n');

			if (shouldReadEntireFile) {
				// Read entire file (Rao lines 1753-1759)
				const result = allLines.join('\n');
				const header = `File: ${filename}\nEntire file content (${allLines.length} total lines):\n\n`;
				fileContent = header + result;
				startLine = 1;
				endLineToRead = allLines.length;
			} else {
				// Validate line range (Rao lines 1761-1770)
				if (startLine < 1) {
					startLine = 1;
				}
				if (endLine > allLines.length) {
					endLine = allLines.length;
				}
				if (startLine > endLine) {
					fileContent = `Error: Invalid line range. Start line (${startLine}) is greater than end line (${endLine}).`;
					endLineToRead = startLine;
				} else {
					// Handle line range reading (Rao lines 1772-1835)
					const userRequestedRange = endLine - startLine + 1;
					const shouldRespectExactRange = userRequestedRange <= 50;

					if (shouldRespectExactRange) {
						// User requested a small specific range - give them exactly what they asked for
						endLineToRead = endLine;
						const requestedLines = allLines.slice(startLine - 1, endLine);
						const result = requestedLines.join('\n');
						const header = `File: ${filename}\nLines ${startLine}-${endLineToRead} (of ${allLines.length} total lines):\n\n`;
						fileContent = header + result;
					} else {
						// Apply truncation logic for larger ranges
						let linesToRead = Math.min(endLine - startLine + 1, maxLines);

						if ((endLine - startLine + 1) >= 200 && linesToRead < 200) {
							linesToRead = 200;
						}

						endLineToRead = startLine + linesToRead - 1;
						const requestedLines = allLines.slice(startLine - 1, endLineToRead);
						const totalChars = requestedLines.reduce((sum, line) => sum + line.length + 1, 0);

						let result = requestedLines.join('\n');

						// Apply character truncation if needed (Rao lines 1804-1829)
						if (endLineToRead < endLine || totalChars > maxChars) {
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

		// Apply output limiting (Rao lines 1839-1868)
		if (fileContent) {
			const fileLines = fileContent.split('\n');
			
			// Find where the header ends
			let headerEnd = 0;
			for (let i = 0; i < fileLines.length; i++) {
				if (fileLines[i] === '' && i > 0) {
					headerEnd = i;
					break;
				}
			}

			// If we found a header, preserve it and limit the content part
			if (headerEnd > 0 && headerEnd < fileLines.length - 1) {
				const headerPart = fileLines.slice(0, headerEnd + 1);
				const contentPart = fileLines.slice(headerEnd + 1);
				
				// Apply file-specific limiting: 250 lines max, 50,000 chars total, 200 chars per line
				const limitedContent = this.limitOutputText(contentPart, context, 50000, 250, 200);
				
				// Recombine header and limited content
				fileContent = [...headerPart, ...limitedContent].join('\n');
			} else {
				// No clear header found, limit the entire content
				const limitedLines = this.limitOutputText(fileLines, context, 50000, 250, 200);
				fileContent = limitedLines.join('\n');
			}
		}

		// Create function call output (Rao lines 1870-1884)
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

/**
 * Arguments for search_replace function call
 */
export interface SearchReplaceArgs extends FunctionCallArgs {
	file_path: string;
	old_string: string;
	new_string: string;
	replace_all?: boolean;
	explanation?: string;
}

/**
 * Handler for search_replace function calls
 * Based on Rao's handle_search_replace implementation
 */
export class SearchReplaceHandler extends BaseFunctionHandler {
	async execute(args: SearchReplaceArgs, context: CallContext): Promise<FunctionResult> {

		try {
			// Parse arguments using safe parsing approach like Rao (line 853)
			// In TypeScript/Erdos AI, args are already parsed, but let's extract them safely
			const filePath = args.file_path;
			let oldString = args.old_string;
			let newString = args.new_string;


			// Remove line numbers from old_string and new_string before validation (like Rao lines 859-866)
			if (oldString) {
				oldString = this.removeLineNumbers(oldString);
			}
			if (newString) {
				newString = this.removeLineNumbers(newString);
			}

			// Validate that old_string and new_string are different (like Rao lines 868-891)
			if (oldString && newString && oldString === newString) {
				return {
					type: 'error',
					error_message: 'Your old_string and new_string were the same. They must be different.',
					breakout_of_function_calls: true
				};
			}

			// Validate required arguments exactly like Rao (lines 894-917)
			// Check for null/undefined like Rao's is.null checks
			// Note: oldString can be empty string for file creation, so check for null/undefined only
			if (!filePath || oldString === null || oldString === undefined || newString === null || newString === undefined) {
				return {
					type: 'error',
					error_message: 'Error: Missing required arguments (file_path, old_string, or new_string)',
					breakout_of_function_calls: true
				};
			}

			// Handle special case: empty old_string means create/append to file (like Rao lines 919-1066)
			if (oldString === '') {
				const effectiveContent = await context.documentManager.getEffectiveFileContent(filePath);
				const isNewFile = effectiveContent === null;
				
				
				// For create/append mode, the new content is just the new_string (for new file) or existing + new_string (for append)
				let newContentForDiff: string;
				let finalFileContent: string;
				
				if (isNewFile) {
					newContentForDiff = newString;
					finalFileContent = newString;
				} else {
					// Append with newline if file doesn't end with newline (like Rao lines 938-943)
					const fileContent = effectiveContent || '';
					if (fileContent.length > 0 && !fileContent.endsWith('\n')) {
						finalFileContent = fileContent + '\n' + newString;
					} else {
						finalFileContent = fileContent + newString;
					}
					// For diff display, only show the new content being added
					newContentForDiff = newString;
				}
				
				// Get diff data for create/append operation (like Rao lines 948-971)
				try {
					// For create/append operations, old_content should always be empty so everything shows as "added"
					const oldLines: string[] = [];
					const newLines = newContentForDiff.split('\n');
					
					const diffResult = computeLineDiff(oldLines, newLines);
					
					// For append operations only (not new file creation), adjust line numbers to start from current file length + 1
					if (!isNewFile) {
						const existingLineCount = (effectiveContent || '').split('\n').length;
						
						// Adjust new_line numbers in the diff data
						for (let i = 0; i < diffResult.diff.length; i++) {
							const diffItem = diffResult.diff[i];
							if (diffItem.new_line !== undefined && diffItem.new_line !== null) {
								diffItem.new_line = diffItem.new_line + existingLineCount;
							}
						}
					}
					
					// Filter diff for display (like Rao line 986)
					filterDiffForDisplay(diffResult.diff);
					
					// Store diff data for search_replace (like Rao's store_diff_data call)
					diffStorage.storeDiffData(
						context.functionCallMessageId?.toString() || '0', // Use the function call message ID
						diffResult.diff,
						effectiveContent || '', // Original content (might be empty for new files)
						finalFileContent, // Final content after create/append
						{ is_start_edit: false, is_end_edit: false },
						filePath,
						oldString, // Empty string for create/append
						newString
					);
					
				} catch (error) {
					console.error(`[SEARCH_REPLACE_HANDLER] Error computing/storing create/append diff data:`, error);
					// Continue with success even if diff computation fails
				}
				
				const outputMessage = isNewFile 
					? `Ready to create new file: ${this.getBasename(filePath)}` 
					: `Ready to append to: ${this.getBasename(filePath)}`;

				// Create function_call_output with preallocated ID (like Rao lines 1017-1026)
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

				// Return success with preallocated IDs (like Rao lines 1050-1065)
				return {
					type: 'success',
					function_call_output: functionCallOutput,
					function_output_id: functionOutputId,
					// Additional data for widget creation (like Rao's return values)
					file_path: filePath,
					old_string: oldString,
					new_string: newString,
					is_create_append_mode: true,
					breakout_of_function_calls: true
				};
			}

			// Normal search_replace mode: get effective file content (like Rao line 1068-1069)
			const effectiveContent = await context.documentManager.getEffectiveFileContent(filePath);
			
			if (effectiveContent === null) {
				// File doesn't exist - return error message and continue (like Rao lines 1071-1094)
				const errorMessage = `File not found: ${filePath}. Please check the file path or read the current file structure.`;
				return {
					type: 'error',
					error_message: errorMessage,
					breakout_of_function_calls: true
				};
			}

			// CRITICAL: Do match counting validation immediately (like Rao lines 1096-1100)
			// Count occurrences of old_string in the file, allowing flexible trailing whitespace
			const flexiblePattern = this.createFlexibleWhitespacePattern(oldString);
			const regex = new RegExp(flexiblePattern, 'g');
			const oldStringMatches: RegExpExecArray[] = [];
			let match;
			while ((match = regex.exec(effectiveContent)) !== null) {
				oldStringMatches.push(match);
				if (!regex.global) break; // Prevent infinite loop if regex isn't global
			}
			const matchCount = oldStringMatches.length;


			// Handle different match scenarios - return errors that trigger continue (like Rao lines 1102-1192)
			if (matchCount === 0) {
				// Perform fuzzy search when no exact matches are found (like Rao lines 1104-1143)
				const fileLines = effectiveContent.split('\n');
				const fuzzyResults = this.performFuzzySearchInContent(oldString, fileLines);
				
				let errorMessage: string;
				if (fuzzyResults.length > 0) {
					// Create match details directly from fuzzy results (like Rao lines 1109-1114)
					const matchDetails = fuzzyResults.map((result, i) => {
						return `Match ${i + 1} (${result.similarity}% similar, around line ${result.line}):\n\`\`\`\n${result.text}\n\`\`\``;
					});
					
					// Exact error message from Rao (lines 1116-1119)
					errorMessage = `The old_string was not found exactly in the file ${filePath}. However, here are similar content matches that might be what you're looking for. If this is what you wanted, please use the exact text from one of these matches:\n\n${matchDetails.join('\n\n')}`;
				} else {
					// Exact error message from Rao (line 1121)
					errorMessage = `The old_string does not exist in the file and no similar content was found. Read the content and try again with the exact text.`;
				}
				
				return {
					type: 'error',
					error_message: errorMessage,
					breakout_of_function_calls: true
				};
			}

			if (matchCount > 1) {
				// Multiple matches found - provide unique context for each match (like Rao lines 1145-1191)
				const fileLines = effectiveContent.split('\n');
				
				// Find line numbers for each match (like Rao lines 1149-1163)
				const matchLineNums: number[] = [];
				for (let i = 0; i < matchCount; i++) {
					const matchPos = oldStringMatches[i].index!;
					let charCount = 0;
					let lineNum = 1;
					for (const line of fileLines) {
						charCount += line.length + 1; // +1 for newline
						if (charCount >= matchPos) {
							break;
						}
						lineNum++;
					}
					matchLineNums[i] = lineNum;
				}
				
				// Generate unique context for each match (like Rao line 1166)
				const matchDetails = this.generateUniqueContexts(fileLines, matchLineNums);
				
				// Create error message exactly like Rao (lines 1168-1170)
				const errorMessage = `The old_string was found ${matchCount} times in the file ${filePath}. Please provide a more specific old_string that matches exactly one location. Here are all the matches with context:\n\n${matchDetails.join('\n\n')}`;
				
				return {
					type: 'error',
					error_message: errorMessage,
					breakout_of_function_calls: true
				};
			}

			// SUCCESS CASE: Exactly one match found (like Rao lines 1193-1270)
			
			// Simulate the replacement to get new content for widget display (like Rao line 1198-1200)
			// Use the same flexible whitespace pattern as validation
			const newContent = effectiveContent.replace(new RegExp(flexiblePattern), newString);
			
			// Get diff data for the proposed replacement (like Rao lines 1202-1215)
			try {
				const oldLines = effectiveContent.split('\n');
				const newLines = newContent.split('\n');
				
				const diffResult = computeLineDiff(oldLines, newLines);
				
				// Filter diff for display (like Rao line 1230)
				filterDiffForDisplay(diffResult.diff);
				
				// Store diff data for search_replace (like Rao line 1209-1210)
				diffStorage.storeDiffData(
					context.functionCallMessageId?.toString() || '0', // Use the function call message ID
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
				// Continue with success even if diff computation fails
			}
			
			// Create function_call_output with preallocated ID (like Rao lines 1261-1270)
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

			// Return success with preallocated IDs (like Rao lines 1296-1310)
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

	/**
	 * Remove line numbers from content (like Rao's remove_line_numbers function)
	 */
	private removeLineNumbers(content: string): string {
		if (!content || content.trim() === '') {
			return content;
		}

		// Split into lines and remove line number patterns (like Rao lines 1742-1773)
		const lines = content.split('\n');
		const cleanedLines = lines.map(line => {
			// Remove all possible line number patterns at the end of lines
			// Pattern: [space] [comment_prefix] [space] [digits] [optional_space] at end of line
			
			// Handle // comments (Java, JavaScript, C/C++, etc.)
			line = line.replace(/\s*\/\/\s*\d+\s*$/, '');
			
			// Handle # comments (Python, R, Ruby, Bash, etc.)
			line = line.replace(/\s*#\s*\d+\s*$/, '');
			
			// Handle <!-- comments (HTML, XML, SVG)
			line = line.replace(/\s*<!--\s*\d+\s*$/, '');
			
			// Handle % comments (LaTeX)
			line = line.replace(/\s*%\s*\d+\s*$/, '');
			
			// Handle -- comments (SQL, Haskell, Lua)
			line = line.replace(/\s*--\s*\d+\s*$/, '');
			
			// Handle /* */ comments (CSS, some C-style languages)
			line = line.replace(/\s*\/\*\s*\d+\s*\*\/\s*$/, '');
			
			return line;
		});

		// Join lines back together
		return cleanedLines.join('\n');
	}

	/**
	 * Perform fuzzy search in content (like Rao's perform_fuzzy_search_in_content function)
	 */
	private performFuzzySearchInContent(searchString: string, fileLines: string[]): Array<{text: string, similarity: number, line: number}> {
		// Implementation of Rao's fuzzy search algorithm (lines 674-842)
		
		if (!searchString || searchString.trim().length === 0 || !fileLines || fileLines.length === 0) {
			return [];
		}
		
		// Clean up the search string
		searchString = searchString.trim();
		
		// Convert file to single text string
		const fileText = fileLines.join('\n');
		
		const searchLen = searchString.length;
		const fileLen = fileText.length;
		
		if (searchLen < 3 || fileLen < searchLen) {
			return [];
		}
		
		// Step 1: Generate seeds from trimmed lines of the search string (like Rao lines 695-716)
		const searchLines = searchString.split('\n');
		const seeds: string[] = [];
		const seedPositions: number[] = [];
		
		// Use entire lines as seeds, with leading/trailing whitespace removed
		for (let i = 0; i < searchLines.length; i++) {
			const line = searchLines[i];
			const trimmedLine = line.trim();
			
			// Only use non-empty trimmed lines as seeds
			if (trimmedLine.length > 0) {
				// Find the actual position of this trimmed seed in the original search string
				const seedMatch = searchString.indexOf(trimmedLine);
				if (seedMatch !== -1) {
					seeds.push(trimmedLine);
					seedPositions.push(seedMatch);
				}
			}
		}
		
		// Step 2: Find all exact matches of seeds in the text (like Rao lines 718-738)
		const candidatePositions: Array<{filePos: number, seedMatchPos: number, seedInSearch: number}> = [];
		
		for (let j = 0; j < seeds.length; j++) {
			const seed = seeds[j];
			const seedPos = seedPositions[j];
			
			// Find all matches of this seed in the file text
			let searchStart = 0;
			while (true) {
				const matchPos = fileText.indexOf(seed, searchStart);
				if (matchPos === -1) break;
				
				// Calculate where the full search string would align
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
		
		// Step 3: Group nearby candidates and evaluate alignments (like Rao lines 743-797)
		// Sort candidates by file position
		candidatePositions.sort((a, b) => a.filePos - b.filePos);
		
		const alignments: Array<{text: string, similarity: number, line: number, distance: number, filePos: number}> = [];
		const processedPositions: number[] = [];
		
		for (const candidate of candidatePositions) {
			const filePos = candidate.filePos;
			
			// Skip if we've already processed a nearby position (within 10 chars)
			if (processedPositions.some(pos => Math.abs(pos - filePos) < 10)) {
				continue;
			}
			
			// Calculate alignment boundaries
			const alignStart = Math.max(0, filePos - 1); // -1 because filePos is 1-based in Rao but we're 0-based
			const alignEnd = Math.min(fileLen, alignStart + searchLen);
			
			if (alignEnd > alignStart + 2) { // Need at least 3 chars
				// Extract aligned region from file
				const alignedText = fileText.substring(alignStart, alignEnd);
				const actualLen = alignedText.length;
				
				// Use the shorter of the two lengths for fair comparison
				const compareLen = Math.min(searchLen, actualLen);
				if (compareLen >= 3) {
					const searchSubstr = searchString.substring(0, compareLen);
					const alignedSubstr = alignedText.substring(0, compareLen);
					
					// Calculate edit distance (simplified Levenshtein distance)
					const distance = this.editDistance(searchSubstr, alignedSubstr);
					const similarity = Math.round((1 - distance / compareLen) * 100 * 10) / 10;
					
					// Only keep reasonably good matches (>= 50% similarity)
					if (similarity >= 50) {
						// Find line number for display
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
		
		// Step 4: Sort by similarity and return top matches (like Rao lines 803-841)
		alignments.sort((a, b) => b.similarity - a.similarity);
		
		const results: Array<{text: string, similarity: number, line: number}> = [];
		const usedLineRanges: Array<{start: number, end: number}> = [];
		
		for (const alignment of alignments) {
			// Calculate line range for this match
			const startLine = alignment.line;
			const matchLines = alignment.text.split('\n');
			const endLine = startLine + matchLines.length - 1;
			
			// Check for overlap with any previously used line ranges
			const hasOverlap = usedLineRanges.some(usedRange => 
				!(endLine < usedRange.start || startLine > usedRange.end)
			);
			
			// Skip if overlaps with previous result
			if (hasOverlap) {
				continue;
			}
			
			results.push({
				text: alignment.text,
				similarity: alignment.similarity,
				line: alignment.line
			});
			usedLineRanges.push({start: startLine, end: endLine});
			
			// Limit to 5 best distinct matches
			if (results.length >= 5) {
				break;
			}
		}
		
		return results;
	}

	/**
	 * Calculate edit distance (simplified Levenshtein distance)
	 */
	private editDistance(str1: string, str2: string): number {
		const m = str1.length;
		const n = str2.length;
		
		// Create a 2D array for dynamic programming
		const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
		
		// Initialize base cases
		for (let i = 0; i <= m; i++) {
			dp[i][0] = i;
		}
		for (let j = 0; j <= n; j++) {
			dp[0][j] = j;
		}
		
		// Fill the DP table
		for (let i = 1; i <= m; i++) {
			for (let j = 1; j <= n; j++) {
				if (str1[i - 1] === str2[j - 1]) {
					dp[i][j] = dp[i - 1][j - 1];
				} else {
					dp[i][j] = 1 + Math.min(
						dp[i - 1][j],     // deletion
						dp[i][j - 1],     // insertion
						dp[i - 1][j - 1]  // substitution
					);
				}
			}
		}
		
		return dp[m][n];
	}



	/**
	 * Generate unique contexts for multiple matches (like Rao's generate_unique_contexts function)
	 */
	private generateUniqueContexts(fileLines: string[], matchLineNums: number[]): string[] {
		// Generate the minimum context needed to make each match unique (like Rao lines 3667-3720)
		
		if (matchLineNums.length <= 1) {
			return [];
		}
		
		const maxContext = 10; // Maximum context lines to prevent huge outputs
		
		// Try increasing context sizes until all contexts are unique
		for (let contextSize = 1; contextSize <= maxContext; contextSize++) {
			const currentContexts: Array<{context: string, display: string}> = [];
			
			for (let i = 0; i < matchLineNums.length; i++) {
				const lineNum = matchLineNums[i];
				
				// Get context window
				const startLine = Math.max(1, lineNum - contextSize);
				const endLine = Math.min(fileLines.length, lineNum + contextSize);
				const contextLines = fileLines.slice(startLine - 1, endLine); // -1 because array is 0-indexed
				
				// Create context string
				const contextStr = contextLines.join('\n');
				const display = `Match ${i + 1} (around line ${lineNum}):\n\`\`\`\n${contextStr}\n\`\`\``;
				
				currentContexts[i] = {
					context: contextStr,
					display: display
				};
			}
			
			// Check if all contexts are unique
			const contextStrings = currentContexts.map(x => x.context);
			const uniqueContexts = [...new Set(contextStrings)];
			if (uniqueContexts.length === contextStrings.length) {
				// All contexts are unique, return them
				return currentContexts.map(x => x.display);
			}
		}
		
		// If we couldn't make them unique even with max context, just return what we have
		// This shouldn't happen often, but provides a fallback
		const finalContexts: string[] = [];
		for (let i = 0; i < matchLineNums.length; i++) {
			const lineNum = matchLineNums[i];
			const startLine = Math.max(1, lineNum - maxContext);
			const endLine = Math.min(fileLines.length, lineNum + maxContext);
			const contextLines = fileLines.slice(startLine - 1, endLine); // -1 because array is 0-indexed
			
			finalContexts[i] = `Match ${i + 1} (around line ${lineNum}):\n\`\`\`\n${contextLines.join('\n')}\n\`\`\``;
		}
		
		return finalContexts;
	}

	/**
	 * Create flexible whitespace pattern for search_replace (like Rao lines 47-71)
	 */
	private createFlexibleWhitespacePattern(text: string): string {
		if (!text || text === '') {
			return '';
		}
		
		// Escape special regex characters first (like Rao line 53)
		let escapedText = text.replace(/([.\\^$*+?{}[\]|()\\])/g, '\\$1');
		
		// Split into lines (like Rao line 56)
		const lines = escapedText.split('\n');
		
		// For each line, make trailing whitespace optional (like Rao lines 58-65)
		const flexibleLines = lines.map(line => {
			// Remove any existing trailing whitespace and add optional whitespace pattern
			const lineTrimmed = line.replace(/[ \t]*$/, '');
			return lineTrimmed + '[ \\t]*';
		});
		
		// Join lines back with newline pattern (like Rao lines 67-68)
		const flexiblePattern = flexibleLines.join('\n');
		
		return flexiblePattern;
	}
}

/**
 * Arguments for delete_file function call
 */
export interface DeleteFileArgs extends FunctionCallArgs {
	filename: string;
	explanation?: string;
}

/**
 * Handler for delete_file function calls
 * Based on Rao's handle_delete_file implementation in SessionAiSearch.R
 */
export class DeleteFileHandler extends BaseFunctionHandler {
	async execute(args: DeleteFileArgs, context: CallContext): Promise<FunctionResult> {
		try {
			const filename = args.filename;
			console.log(`[DELETE_FILE_HANDLER] Starting delete_file for filename: ${filename}`);

			// Use unified file resolution system
			const resolverContext = {
				getAllOpenDocuments: () => context.documentManager.getAllOpenDocuments(false),
				getCurrentWorkingDirectory: () => context.fileSystemUtils.getCurrentWorkingDirectory(),
				fileExists: (path: string) => context.fileSystemUtils.fileExists(path),
				joinPath: (base: string, ...parts: string[]) => {
					if (parts.length === 1) {
						return context.fileSystemUtils.joinPath(base, parts[0]);
					} else {
						return parts.reduce((acc, part) => context.fileSystemUtils.joinPath(acc, part), base);
					}
				},
				getFileContent: async (uri: any) => ''
			};

			console.log(`[DELETE_FILE_HANDLER] Calling CommonUtils.resolveFile for: ${filename}`);
			const result = await CommonUtils.resolveFile(filename, resolverContext);
			console.log(`[DELETE_FILE_HANDLER] resolveFile result:`, result);
			
			const foundInTabs = result.found && result.isFromEditor;
			const fileExists = result.found && !result.isFromEditor;
			console.log(`[DELETE_FILE_HANDLER] foundInTabs: ${foundInTabs}, fileExists: ${fileExists}`);
			
			// If file doesn't exist anywhere, create failure function_call_output with continue_and_display
			if (!fileExists && !foundInTabs) {
				console.log(`[DELETE_FILE_HANDLER] File not found: ${filename}, creating failure function_call_output`);
				
				// Create function_call_output with failure (same pattern as search_replace does)
				const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
				if (functionOutputId === null) {
					throw new Error(`Pre-allocated function call output ID not found for call_id: ${args.call_id}`);
				}
				console.log(`[DELETE_FILE_HANDLER] File not found - function_output_id: ${functionOutputId}`);

				const functionCallOutput = {
					id: functionOutputId,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: `${filename} could not be found.`,
					related_to: context.functionCallMessageId || args.msg_id,
					success: false, // CRITICAL: Mark as failed so UI shows failure message
					procedural: false // Show in conversation like search_replace failures
				};

				console.log(`[DELETE_FILE_HANDLER] Returning file not found function_call_output:`, functionCallOutput);
				// Return success with failed function_call_output and continue_and_display behavior
				return {
					type: 'success',
					function_call_output: functionCallOutput,
					function_output_id: functionOutputId,
					breakout_of_function_calls: false
				};
			}
			
			// File exists - we'll use the filename directly for deletion
			// The actual URI resolution will happen in the service layer (like search_replace does)

			// Create function_call_output with "Response pending..." (like Rao)
			const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (functionOutputId === null) {
				throw new Error(`Pre-allocated function call output ID not found for call_id: ${args.call_id}`);
			}
			console.log(`[DELETE_FILE_HANDLER] File exists - creating pending function_call_output, function_output_id: ${functionOutputId}`);

			const functionCallOutput = {
				id: functionOutputId,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: 'Response pending...', // This will be replaced when user accepts/rejects
				related_to: context.functionCallMessageId || args.msg_id,
				procedural: true
			};

			console.log(`[DELETE_FILE_HANDLER] Returning success with pending function_call_output:`, functionCallOutput);
			// Return success to trigger widget creation (like Rao)
			return {
				type: 'success',
				function_call_output: functionCallOutput,
				function_output_id: functionOutputId,
				breakout_of_function_calls: true
			};

		} catch (error) {
			console.error(`[DELETE_FILE_HANDLER] Exception in delete_file processing:`, error);
			console.log(`[DELETE_FILE_HANDLER] Exception - returning error with breakout_of_function_calls: true`);
			return {
				type: 'error',
				error_message: `Delete file operation failed: ${error instanceof Error ? error.message : String(error)}`,
				breakout_of_function_calls: true
			};
		}
	}
}