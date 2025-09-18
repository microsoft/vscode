/*
 * Copyright (C) 2025 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionCallArgs, FunctionResult, CallContext } from '../common/functionTypes.js';
import { BaseFunctionHandler } from './baseFunctionHandler.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ITextQuery, IFileQuery, IFileMatch, isFileMatch, QueryType, IPatternInfo, ITextSearchMatch, ITextSearchContext, resultIsMatch, ExcludeGlobPattern } from '../../../services/search/common/search.js';
import * as glob from '../../../../base/common/glob.js';


// Arguments for grep function call
export interface GrepArgs extends FunctionCallArgs {
	pattern: string;
	path?: string;
	'-A'?: number;
	'-B'?: number;
	'-C'?: number;
	'-i'?: boolean;
	glob?: string;
	head_limit?: number;
	multiline?: boolean;
	output_mode?: 'content' | 'files_with_matches' | 'count';
	type?: string;
}

// Match info interface for grep results
interface GrepMatchInfo {
	lineNumber: number;
	text: string;
}

// Handler for grep function calls
export class GrepHandler extends BaseFunctionHandler {
	private static readonly MAX_RESULTS = 50;
	async execute(args: GrepArgs, context: CallContext): Promise<FunctionResult> {
		const pattern = args.pattern;

		if (!pattern || pattern === "") {
			const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (function_output_id === null) {
				throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
			}
			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: "Error: pattern parameter is required for grep",
				related_to: args.msg_id,
				success: false
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id
			};
		}

		try {
			const cwd = await context.fileSystemUtils.getCurrentWorkingDirectory();
			
			// Search open documents first
			const open_doc_results = await this.searchOpenDocuments(pattern, args['-i'] || false, args, context);

			
			// Search file system with ripgrep
			let ripgrep_results = "";
			try {
				ripgrep_results = await this.executeRipgrep(args, cwd, context);
			} catch (ripgrepError) {
				const error_message = `Grep search failed: ${ripgrepError instanceof Error ? ripgrepError.message : String(ripgrepError)}`;
				
				const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
				if (function_output_id === null) {
					throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
				}
				const function_call_output = {
					id: function_output_id,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: error_message,
					related_to: args.msg_id,
					success: false
				};

				return {
					type: 'success',
					function_call_output: function_call_output,
					function_output_id: function_output_id,
					status: "continue_silent"
				} as any;
			}

			const grep_results = this.formatGrepResults(ripgrep_results, open_doc_results, pattern, cwd, args.output_mode, args.head_limit);

			const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (function_output_id === null) {
				throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
			}
			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: grep_results,
				related_to: args.msg_id
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id
			};

		} catch (error) {
			const error_message = `Error processing grep: ${error instanceof Error ? error.message : String(error)}`;
			
			const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (function_output_id === null) {
				throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
			}
			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: error_message,
				related_to: args.msg_id,
				success: false
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id
			};
		}
	}


	private formatGrepResults(
		ripgrep_output: string,
		open_doc_results: { [filePath: string]: GrepMatchInfo[] },
		pattern: string,
		cwd: string,
		output_mode?: 'content' | 'files_with_matches' | 'count',
		head_limit?: number
	): string {
		
		if (output_mode === 'files_with_matches') {
			return this.formatFilesWithMatchesOutput(ripgrep_output, open_doc_results, head_limit);
		} else if (output_mode === 'count') {
			return this.formatCountOutput(ripgrep_output, open_doc_results, head_limit);
		} else {
			// Default content mode
			return this.formatContentOutput(ripgrep_output, open_doc_results, pattern, cwd, head_limit);
		}
	}
	
	private formatFilesWithMatchesOutput(
		ripgrep_output: string,
		open_doc_results: { [filePath: string]: GrepMatchInfo[] },
		head_limit?: number
	): string {
		const files = new Set<string>();
		
		// Add files from open documents
		for (const filePath in open_doc_results) {
			if (open_doc_results[filePath].length > 0) {
				files.add(filePath);
			}
		}
		
		// Add files from ripgrep output (keep absolute paths and deduplicate)
		const lines = ripgrep_output.trim().split('\n').filter(line => line.trim() !== '');
		for (const line of lines) {
			const colonIndex = line.indexOf(':');
			if (colonIndex > 0) {
				const absolutePath = line.substring(0, colonIndex);
				
				// Skip if this file is already in open documents
				if (!open_doc_results[absolutePath]) {
					files.add(absolutePath);
				}
			}
		}
		
		const fileList = Array.from(files);
		// Respect head_limit but cap at MAX_RESULTS
		const effectiveLimit = head_limit ? Math.min(head_limit, GrepHandler.MAX_RESULTS) : GrepHandler.MAX_RESULTS;
		const limitedFiles = fileList.slice(0, effectiveLimit);
		
		if (limitedFiles.length === 0) {
			return "No files with matches found.";
		}
		
		let result = `Files with matches:${fileList.length > effectiveLimit ? ` (showing first ${effectiveLimit} of ${fileList.length})` : ''}`;
		for (const file of limitedFiles) {
			result += `\n${file}`;
		}
		
		return result;
	}
	
	private formatCountOutput(
		ripgrep_output: string,
		open_doc_results: { [filePath: string]: GrepMatchInfo[] },
		head_limit?: number
	): string {
		const counts: { [filePath: string]: number } = {};
		
		// Add counts from open documents
		for (const filePath in open_doc_results) {
			const matchCount = open_doc_results[filePath].length;
			if (matchCount > 0) {
				counts[filePath] = matchCount;
			}
		}
		
		// Add counts from ripgrep output (but avoid double-counting open documents)
		const lines = ripgrep_output.trim().split('\n').filter(line => line.trim() !== '');
		for (const line of lines) {
			const colonIndex = line.indexOf(':');
			if (colonIndex > 0) {
				const absolutePath = line.substring(0, colonIndex);
				const countStr = line.substring(colonIndex + 1);
				const count = parseInt(countStr, 10);
				if (!isNaN(count)) {
					// Skip if this file is already counted from open documents
					if (open_doc_results[absolutePath]) {
						continue;
					}
					counts[absolutePath] = (counts[absolutePath] || 0) + count;
				}
			}
		}
		
		const countEntries = Object.entries(counts);
		// Respect head_limit but cap at MAX_RESULTS
		const effectiveLimit = head_limit ? Math.min(head_limit, GrepHandler.MAX_RESULTS) : GrepHandler.MAX_RESULTS;
		const limitedEntries = countEntries.slice(0, effectiveLimit);
		
		if (limitedEntries.length === 0) {
			return "No matches found.";
		}
		
		let result = `Match counts:${countEntries.length > effectiveLimit ? ` (showing first ${effectiveLimit} of ${countEntries.length})` : ''}`;
		for (const [file, count] of limitedEntries) {
			result += `\n${file}:${count}`;
		}
		
		return result;
	}

	private async searchOpenDocuments(pattern: string, case_insensitive: boolean, grepArgs: GrepArgs, context: CallContext): Promise<{ [filePath: string]: GrepMatchInfo[] }> {
		const results: { [filePath: string]: GrepMatchInfo[] } = {};
		
		try {
			const escaped_pattern = pattern.replace(/\\\\/g, '\\');
			
			// Use documentManager to get all open documents (this handles .ipynb files properly)
			const open_docs = await context.documentManager.getAllOpenDocuments(true);
			
			if (!open_docs || open_docs.length === 0) {
				return results; 
			}
			
			const cwd = await context.fileSystemUtils.getCurrentWorkingDirectory();
			
			for (const doc of open_docs) {
				if (!doc.content || doc.content === "") {
					continue;
				}
				
				let display_path: string | null = null;
				
				if (doc.path && doc.path !== "") {
					display_path = doc.path; // Keep absolute path
				} else {
					display_path = `__UNSAVED__/untitled`;
				}
				
				if (!display_path) {
					continue; 
				}
				
				// Check path restriction for open documents
				if (grepArgs.path && grepArgs.path !== cwd) {
					const searchPath = grepArgs.path;
					const fullDocPath = doc.path || '';
					// Skip if document is not within the specified search path
					if (!fullDocPath.startsWith(searchPath)) {
						continue;
					}
				}
				
				// Check type patterns for open documents
				if (grepArgs.type) {
					const typeGlobs: { [key: string]: string } = {
						'js': '*.{js,jsx}',
						'ts': '*.{ts,tsx}',
						'py': '*.py',
						'java': '*.java',
						'cpp': '*.{cpp,cxx,cc,c++}',
						'c': '*.{c,h}',
						'html': '*.{html,htm}',
						'css': '*.css',
						'json': '*.json',
						'xml': '*.xml',
						'md': '*.{md,markdown}',
						'txt': '*.txt'
					};
					if (typeGlobs[grepArgs.type]) {
						if (!this.matchesGlobPattern(display_path, typeGlobs[grepArgs.type])) {
							continue; // Skip files that don't match the type
						}
					}
				}
				
				// Check glob patterns for open documents
				if (grepArgs.glob) {
					const globPattern = grepArgs.glob;
					if (globPattern.startsWith('!')) {
						// Exclude pattern - skip if file matches the exclude pattern
						const excludePattern = globPattern.substring(1);
						if (this.matchesGlobPattern(display_path, excludePattern)) {
							continue; // Skip this file
						}
					} else {
						// Include pattern - skip if file doesn't match the include pattern
						if (!this.matchesGlobPattern(display_path, globPattern)) {
							continue; // Skip this file
						}
					}
				}
				
				// For .ipynb files, convert to jupytext format before searching (same as read_file)
				let searchContent = doc.content;
				if (context.commonUtils.getFileExtension(display_path).toLowerCase() === 'ipynb') {
					try {
						searchContent = context.jupytextService.convertNotebookToText(
							doc.content, 
							{ extension: '.py', format_name: 'percent' }
						);
					} catch (error) {
						// Fall back to original content if conversion fails
						searchContent = doc.content;
					}
				}
				
				const content_lines = searchContent.split('\n');
				
				// Calculate context settings
				let contextBefore = 0;
				let contextAfter = 0;
				
				if (grepArgs['-C'] !== undefined) {
					contextBefore = contextAfter = grepArgs['-C'];
				} else {
					contextBefore = grepArgs['-B'] || 0;
					contextAfter = grepArgs['-A'] || 0;
				}
				
				// First pass: find all matching lines
				const matchingLines: number[] = [];
				for (let line_num = 0; line_num < content_lines.length; line_num++) {
					const line_content = content_lines[line_num];
					
					let match_found = false;
					const regexFlags = case_insensitive ? 'i' : '';
					const multilineFlags = grepArgs.multiline ? 'm' : '';
					const combinedFlags = regexFlags + multilineFlags;
					
					if (grepArgs.multiline) {
						// For multiline mode, test against the entire content
						const multilineRegex = new RegExp(escaped_pattern, combinedFlags + 's');
						match_found = multilineRegex.test(searchContent);
						// If we find a multiline match, we need to determine which lines it spans
						// For simplicity, we'll mark this line as a match if the pattern appears anywhere in the content
						if (match_found) {
							const lineRegex = new RegExp(escaped_pattern, combinedFlags);
							match_found = lineRegex.test(line_content);
						}
					} else {
						// Single-line mode (default)
						match_found = new RegExp(escaped_pattern, combinedFlags).test(line_content);
					}
					
					if (match_found) {
						matchingLines.push(line_num);
					}
				}
				
				if (matchingLines.length > 0) {
					if (!results[display_path]) {
						results[display_path] = [];
					}
					
					// Collect all lines to include (matches + context)
					const linesToInclude = new Set<number>();
					
					for (const matchLine of matchingLines) {
						// Add the match line
						linesToInclude.add(matchLine);
						
						// Add context before
						for (let i = Math.max(0, matchLine - contextBefore); i < matchLine; i++) {
							linesToInclude.add(i);
						}
						
						// Add context after
						for (let i = matchLine + 1; i <= Math.min(content_lines.length - 1, matchLine + contextAfter); i++) {
							linesToInclude.add(i);
						}
					}
					
					// Convert to sorted array and add to results
					const sortedLines = Array.from(linesToInclude).sort((a, b) => a - b);
					for (const lineNum of sortedLines) {
						const isMatch = matchingLines.includes(lineNum);
						results[display_path].push({
							lineNumber: lineNum + 1,
							text: isMatch ? content_lines[lineNum] : `--${content_lines[lineNum]}` // Mark context lines
						});
					}
				}
			}
			
			return results;
		} catch (error) {
			return {};
		}
	}

	private async executeRipgrep(grepArgs: GrepArgs, cwd: string, context: CallContext): Promise<string> {
		try {
			if (!context.searchService) {
				throw new Error('Search service not available');
			}

			const pattern = grepArgs.pattern;
			const case_sensitive = !grepArgs['-i'];
			const isMultiline = grepArgs.multiline || false;
			const searchPath = grepArgs.path || cwd;
			
			
			const contentPattern: IPatternInfo = {
				pattern: pattern,
				isRegExp: true,
				isCaseSensitive: case_sensitive,
				isWordMatch: false,
				isMultiline: isMultiline
			};

			const include_patterns: string[] = [];
			const exclude_patterns: string[] = [];
			
			// Handle glob patterns
			if (grepArgs.glob) {
				if (grepArgs.glob.startsWith('!')) {
					exclude_patterns.push(grepArgs.glob.substring(1));
				} else {
					include_patterns.push(grepArgs.glob);
				}
			}
			
			// Handle file type patterns
			if (grepArgs.type) {
				const typeGlobs: { [key: string]: string } = {
					'js': '*.{js,jsx}',
					'ts': '*.{ts,tsx}',
					'py': '*.py',
					'java': '*.java',
					'cpp': '*.{cpp,cxx,cc,c++}',
					'c': '*.{c,h}',
					'html': '*.{html,htm}',
					'css': '*.css',
					'json': '*.json',
					'xml': '*.xml',
					'md': '*.{md,markdown}',
					'txt': '*.txt'
				};
				if (typeGlobs[grepArgs.type]) {
					include_patterns.push(typeGlobs[grepArgs.type]);
				}
			}

			const folderQuery = {
				folder: URI.file(searchPath),
				excludePattern: exclude_patterns.length > 0 
					? exclude_patterns.map(p => ({ 
						pattern: { [p]: true } as glob.IExpression 
					})) as ExcludeGlobPattern<URI>[]
					: undefined,
				includePattern: include_patterns.length > 0 
					? include_patterns.reduce((acc, p) => ({ ...acc, [p]: true }), {} as glob.IExpression)
					: undefined
			};

			// Calculate surrounding context from ripgrep-style flags
			let surroundingContext = 0;
			if (grepArgs['-C'] !== undefined) {
				// -C shows lines before and after
				surroundingContext = grepArgs['-C'];
			} else {
				// For -A and -B, use the maximum to show context in both directions
				const afterLines = grepArgs['-A'] || 0;
				const beforeLines = grepArgs['-B'] || 0;
				surroundingContext = Math.max(afterLines, beforeLines);
			}
			

			const textQuery: ITextQuery = {
				type: QueryType.Text,
				contentPattern: contentPattern,
				folderQueries: [folderQuery],
				maxResults: GrepHandler.MAX_RESULTS * 2,  // Limit at source, final display limited to MAX_RESULTS
				surroundingContext: surroundingContext
			};
			

			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('timeout')), 5000);
			});

			const searchPromise = context.searchService.textSearch(textQuery, CancellationToken.None);
			const searchComplete = await Promise.race([searchPromise, timeoutPromise]);

			const ripgrep_lines: string[] = [];
			
			for (const result of searchComplete.results) {
				if (isFileMatch(result)) {
					const fileMatch = result as IFileMatch;
					const filePath = fileMatch.resource.fsPath;
					const isNotebook = filePath.endsWith('.ipynb');
					
					if (isNotebook) {
						try {
							const convertedContent = await context.documentManager.getEffectiveFileContent(filePath);
							if (convertedContent) {
								const lines = convertedContent.split('\n');
								const searchPattern = new RegExp(pattern, case_sensitive ? 'g' : 'gi');
								
								lines.forEach((line, index) => {
									if (searchPattern.test(line)) {
										ripgrep_lines.push(`${filePath}:${index + 1}:${line}`);
									}
								});
							}
						} catch (error) {
							for (const match of fileMatch.results || []) {
								if (resultIsMatch(match)) {
									const textMatch = match as ITextSearchMatch;
									const lineNumber = textMatch.rangeLocations.length > 0 ? 
										textMatch.rangeLocations[0].source.startLineNumber + 1 : 1;
									const lineText = textMatch.previewText || '';
									
									if (lineText.trim().length > 0 && lineNumber > 0) {
										ripgrep_lines.push(`${filePath}:${lineNumber}:${lineText}`);
									}
								} else {
									// This is a context line
									const contextMatch = match as ITextSearchContext;
									const lineNumber = contextMatch.lineNumber;
									const lineText = contextMatch.text;
									
									if (lineText.trim().length > 0 && lineNumber > 0) {
										ripgrep_lines.push(`${filePath}-${lineNumber}-${lineText}`);
									}
								}
							}
						}
					} else {
						for (const match of fileMatch.results || []) {
							if (resultIsMatch(match)) {
								// This is an actual match
								const textMatch = match as ITextSearchMatch;
								const lineNumber = textMatch.rangeLocations.length > 0 ? 
									textMatch.rangeLocations[0].source.startLineNumber + 1 : 1;
								
								const lineText = textMatch.previewText || '';
								
								if (lineText.trim().length > 0 && lineNumber > 0) {
									ripgrep_lines.push(`${filePath}:${lineNumber}:${lineText}`);
								}
							} else {
								// This is a context line
								const contextMatch = match as ITextSearchContext;
								const lineNumber = contextMatch.lineNumber;
								const lineText = contextMatch.text;
								
								if (lineText.trim().length > 0 && lineNumber > 0) {
									// Use '-' prefix for context lines (like ripgrep does)
									ripgrep_lines.push(`${filePath}-${lineNumber}-${lineText}`);
								}
							}
						}
					}
				}
			}
			
			return ripgrep_lines.join('\n');
		} catch (error) {
			if (error instanceof Error && error.message.includes('timeout')) {
				throw new Error('Ripgrep execution timed out');
			}
			throw new Error(`Ripgrep execution failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private formatContentOutput(
		ripgrep_output: string,
		open_doc_results: { [filePath: string]: GrepMatchInfo[] },
		pattern: string,
		cwd: string,
		head_limit?: number
	): string {
		const results: { [filePath: string]: string[] } = {};
		let total_matches = 0;
		
		// Add results from open documents
		for (const filePath in open_doc_results) {
			const matches = open_doc_results[filePath];
			if (matches.length > 0) {
				for (const match of matches) {
					if (!results[filePath]) {
						results[filePath] = [];
					}
					
					// Check if this is a context line (marked with --)
					if (match.text.startsWith('--')) {
						const contextText = match.text.substring(2); // Remove -- prefix
						results[filePath].push(`Line ${match.lineNumber}: ${contextText} [EDITOR]`);
					} else {
						// This is an actual match
						results[filePath].push(`Line ${match.lineNumber}: ${match.text} [EDITOR]`);
						total_matches++;
					}
				}
			}
		}
		
		// Process ripgrep output
		const lines = ripgrep_output.trim().split('\n').filter(line => line.trim() !== '');
		// Respect head_limit but cap at MAX_RESULTS
		const effectiveLimit = head_limit ? Math.min(head_limit, GrepHandler.MAX_RESULTS) : GrepHandler.MAX_RESULTS;
		const limited_lines = lines.slice(0, effectiveLimit);
		
		for (const match of limited_lines) {
			if (match === "") continue;

			// Handle both match lines (:) and context lines (-)
			let parts: string[];
			let isContextLine = false;
			let separator = '';
			
			if (match.includes(':')) {
				parts = match.split(':');
				separator = ':';
				isContextLine = false;
			} else if (match.includes('-')) {
				parts = match.split('-');
				separator = '-';
				isContextLine = true;
			} else {
				continue; // Skip lines that don't match expected format
			}

			if (parts.length >= 3) {
				const filepath = parts[0];
				const line_num_str = parts[1];
				const content = parts.slice(2).join(separator);

				const line_num = parseInt(line_num_str, 10);
				if (isNaN(line_num) || line_num < 1) {
					continue;
				}

				if (open_doc_results[filepath]) {
					continue;
				}

				if (/\.(png|jpg|jpeg|gif|bmp|ico|pdf|zip|tar|gz|rar|7z|exe|dll|so|dylib)$/i.test(filepath)) {
					continue;
				}

				let processed_content = content;
				
				// Only do content processing for actual matches, not context lines
				if (!isContextLine) {
					const content_len = content.length;
					if (content_len > 100) {
						const match_regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
						const match_result = match_regex.exec(content);
						const match_pos = match_result ? match_result.index + 1 : -1;
						
						if (match_pos > 0) {
							const start_pos = Math.max(1, match_pos - 30);
							const end_pos = Math.min(content_len, match_pos + 30);
							
							const first_part = content.substring(0, 20);
							const middle_part = content.substring(start_pos - 1, end_pos);
							const last_part = content.substring(content_len - 20, content_len);
							
							processed_content = `${first_part}...${middle_part}...${last_part}`;
						}
					}
				}

				if (!results[filepath]) {
					results[filepath] = [];
				}
				
				// All lines use consistent "Line X:" format
				results[filepath].push(`Line ${line_num}: ${processed_content}`);
				if (!isContextLine) {
					total_matches++;
				}
			}
		}

		if (Object.keys(results).length > 0) {
			const match_count_note = lines.length > effectiveLimit ? ` (showing first ${effectiveLimit} of ${lines.length} matches)` : '';
			const result_lines = [`Results:${match_count_note}`];
			
			for (const file in results) {
				result_lines.push(`\nFile: ${file}`);
				result_lines.push(...results[file]);
			}
			
			return result_lines.join('\n');
		} else {
			return "Results:\n\nNo matches found";
		}
	}

	private matchesGlobPattern(filePath: string, globPattern: string): boolean {
		// Simple glob pattern matching - convert glob to regex
		// Handle common patterns like *.py, *.{js,ts}, etc.
		
		// Escape special regex characters except * and ?
		let regexPattern = globPattern
			.replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
			.replace(/\*/g, '.*')                   // Convert * to .*
			.replace(/\?/g, '.');                   // Convert ? to .
		
		// Handle brace expansion like *.{js,ts} -> *.js|*.ts
		regexPattern = regexPattern.replace(/\\\{([^}]+)\\\}/g, (match, options) => {
			const alternatives = options.split(',').map((opt: string) => opt.trim());
			return `(${alternatives.join('|')})`;
		});
		
		// Make it match the entire filename (not just a substring)
		regexPattern = `^${regexPattern}$`;
		
		const regex = new RegExp(regexPattern, 'i'); // Case insensitive
		return regex.test(filePath);
	}
}

// Arguments for search_for_file function call
export interface SearchForFileArgs extends FunctionCallArgs {
	query: string;
}

// Handler for search_for_file function calls
export class SearchForFileHandler extends BaseFunctionHandler {
	async execute(args: SearchForFileArgs, context: CallContext): Promise<FunctionResult> {
		const query = args.query;

		if (!query || query.trim() === "") {
			const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (function_output_id === null) {
				throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
			}
			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: "Error: query parameter is required for file search",
				related_to: args.msg_id
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id
			};
		}

		try {
			const cwd = await context.fileSystemUtils.getCurrentWorkingDirectory();
			
			const search_results = await this.searchFilesWithVSCodeService(query, cwd, context);

			const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2) 
				|| context.conversationManager.getNextMessageId();

			let formatted_results = search_results;
			if (formatted_results && formatted_results.length > 0) {
				const result_lines = formatted_results.split('\n');
				const limited_lines = this.limitOutputText(result_lines, context);
				formatted_results = limited_lines.join('\n');
			}

			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: formatted_results,
				related_to: args.msg_id
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id
			};
		} catch (error) {
			const error_message = `File search failed: ${error instanceof Error ? error.message : String(error)}`;
			
			const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2) 
				|| context.conversationManager.getNextMessageId();

			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: error_message,
				related_to: args.msg_id
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id
			};
		}
	}

	private async searchFilesWithVSCodeService(query: string, cwd: string, context: CallContext): Promise<string> {
		try {
			if (!context.searchService) {
				throw new Error('Search service not available');
			}

			// Simple file search for filenames containing the query
			const filePattern = `**/*${query}*`;
			
			const fileQuery: IFileQuery = {
				type: QueryType.File,
				filePattern: filePattern,
				folderQueries: [{ folder: URI.file(cwd) }],
				maxResults: 50,
				shouldGlobMatchFilePattern: true, // Use glob matching instead of fuzzy matching
				excludePattern: {
					'**/node_modules/**': true,
					'**/.git/**': true,
					'**/.*': true,
					'**/*.log': true,
					'**/*.tmp': true,
					'**/*.cache': true,
					'**/*.bak': true
				} as glob.IExpression
			};

			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('File search timed out')), 5000);
			});

			const searchPromise = context.searchService.fileSearch(fileQuery, CancellationToken.None);
			const searchComplete = await Promise.race([searchPromise, timeoutPromise]);

			if (!searchComplete.results || searchComplete.results.length === 0) {
				return `No files found matching: ${query}`;
			}

			// Simply return all results as full paths (up to 50)
			const result_lines = [`File search results for '${query}':`];

			for (let i = 0; i < searchComplete.results.length; i++) {
				const result = searchComplete.results[i] as IFileMatch;
				const fullPath = result.resource.path;
				
				try {
					const stats = await context.fileSystemUtils.getFileStats(fullPath);
					const size_str = stats && stats.size !== undefined ? 
						context.commonUtils.formatFileSize(stats.size) : 'unknown size';
					
					result_lines.push(`${i + 1}. ${fullPath} (${size_str})`);
				} catch (error) {
					result_lines.push(`${i + 1}. ${fullPath}`);
				}
			}

			if (searchComplete.results.length >= 50) {
				result_lines.push(`\n(Showing first 50 matches)`);
			}

			return result_lines.join('\n');

		} catch (error) {
			if (error instanceof Error && error.message.includes('timeout')) {
				throw new Error('File search timed out');
			}
			throw new Error(`File search failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}

// Arguments for list_dir function call
export interface ListDirectoryArgs extends FunctionCallArgs {
	relative_workspace_path: string;
}

// Handler for list_dir function calls
export class ListDirectoryHandler extends BaseFunctionHandler {
	async execute(args: ListDirectoryArgs, context: CallContext): Promise<FunctionResult> {
		const dir_path = args.relative_workspace_path;

		const cwd = await context.fileSystemUtils.getCurrentWorkingDirectory();

		let full_path: string;
		if (dir_path === "." || dir_path === "") {
			full_path = cwd;
		} else {
			full_path = context.commonUtils.joinPath(cwd, dir_path);
		}

		full_path = context.commonUtils.normalizePath(full_path);

		let dirListing: string;

		if (!(await this.directoryExists(full_path, context))) {
			dirListing = `Error: Directory not found: ${dir_path}`;
		} else {
			const files = await this.listFiles(full_path, context);

			if (files.length === 0) {
				dirListing = `Directory: ${dir_path}\n\n(empty directory)`;
			} else {
				const file_info_list = await this.getFileInfo(full_path, files, context);
				
				const result_lines = [`Directory: ${dir_path}\n`];

				for (const info of file_info_list) {
					info.is_dir = info.isdir || false;
				}

				const ordered = file_info_list
					.map((info, index) => ({ info, index }))
					.sort((a, b) => {
						if (a.info.is_dir !== b.info.is_dir) {
							return a.info.is_dir ? -1 : 1;
						}
						return a.info.name.localeCompare(b.info.name);
					});

				for (const { info } of ordered) {
					const file_name = info.name;

					if (file_name === "." || file_name === "..") {
						continue;
					}

					if (info.is_dir) {
						result_lines.push(`  ${file_name}/`);
					} else {
						if (info.size !== undefined && !isNaN(info.size)) {
							const size_str = context.commonUtils.formatFileSize(info.size);
							result_lines.push(`  ${file_name} (${size_str})`);
						} else {
							result_lines.push(`  ${file_name}`);
						}
					}
				}

				dirListing = result_lines.join('\n');
			}
		}

		const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2) 
			|| context.conversationManager.getNextMessageId();

		if (dirListing && dirListing.length > 0) {
			const result_lines = dirListing.split('\n');
			const limited_lines = this.limitOutputText(result_lines, context);
			dirListing = limited_lines.join('\n');
		}

		const function_call_output = {
			id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
			output: dirListing,
				related_to: args.msg_id
			};

			return {
				type: 'success',
			function_call_output: function_call_output,
			function_output_id: function_output_id
		};
	}

	private async directoryExists(path: string, context: CallContext): Promise<boolean> {
		return await context.fileSystemUtils.directoryExists(path);
	}

	private async listFiles(path: string, context: CallContext): Promise<string[]> {
		try {
			return await context.fileSystemUtils.listFiles(path, {
				fullNames: false,
				allFiles: true,
				includeDirs: true
			});
		} catch (error) {
			return [];
		}
	}

	private async getFileInfo(dir_path: string, files: string[], context: CallContext): Promise<Array<{
		name: string;
		size?: number;
		isdir?: boolean;
		is_dir?: boolean;
	}>> {
		const result = [];
		
		for (const file of files) {
			const file_path = context.commonUtils.joinPath(dir_path, file);
			
			const stats = await this.getFileStats(file_path, context);
			
			result.push({
				name: file,
				size: stats.size,
				isdir: stats.isDirectory,
				is_dir: stats.isDirectory
			});
		}

		return result;
	}

	private async getFileStats(path: string, context: CallContext): Promise<{
		size?: number;
		isDirectory: boolean;
	}> {
		try {
			const stats = await context.fileSystemUtils.getFileStats(path);
			return {
				size: stats ? stats.size : undefined,
				isDirectory: stats ? stats.isDirectory : false
			};
		} catch (error) {
			return {
				size: undefined,
				isDirectory: false
			};
		}
	}

}
