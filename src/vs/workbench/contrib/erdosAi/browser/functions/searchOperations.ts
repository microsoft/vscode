/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionCallArgs, FunctionResult, CallContext } from './types.js';
import { BaseFunctionHandler } from './baseFunctionHandler.js';
import { URI } from '../../../../../base/common/uri.js';
import { CommonUtils } from '../utils/commonUtils.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ITextQuery, IFileMatch, isFileMatch, QueryType, IPatternInfo, ITextSearchMatch, resultIsMatch, ExcludeGlobPattern } from '../../../../services/search/common/search.js';
import * as glob from '../../../../../base/common/glob.js';


/**
 */
export interface GrepSearchArgs extends FunctionCallArgs {
	query: string;
	case_sensitive: boolean; 
	include_pattern?: string;
	exclude_pattern?: string;
}

/**
 * Handler for grep_search function calls
 */
export class GrepSearchHandler extends BaseFunctionHandler {
	async execute(args: GrepSearchArgs, context: CallContext): Promise<FunctionResult> {
		const query = args.query;

		if (!query || query === "") {
			const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (function_output_id === null) {
				throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
			}
			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: "Error: query parameter is required for grep_search",
				related_to: args.msg_id // Point to function call message ID, not user message ID
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id
			};
		}

		if (args.case_sensitive === undefined || args.case_sensitive === null) {
			const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (function_output_id === null) {
				throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
			}
			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: "Error: case_sensitive parameter is required for grep_search",
				related_to: args.msg_id // Point to function call message ID, not user message ID
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id
			};
		}

		try {
			const cwd = await this.getCurrentWorkingDirectory(context);

			const rg_args = this.buildRipgrepArguments(query, args.case_sensitive, args.include_pattern, args.exclude_pattern, cwd);

			let open_doc_results: { [filePath: string]: MatchInfo[] } = {};
			try {
				open_doc_results = await this.grepInOpenDocuments(
					query, 
					args.case_sensitive, 
					this.parseIncludePatterns(args.include_pattern), 
					this.parseExcludePatterns(args.exclude_pattern),
					context
				);
			} catch (openDocError) {
				const error_message = `Grep search failed: ${openDocError instanceof Error ? openDocError.message : String(openDocError)}`;
				
				const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (function_output_id === null) {
				throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
			}
				const function_call_output = {
					id: function_output_id,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: error_message,
					related_to: args.msg_id, // Point to function call message ID, not user message ID
					success: false
				};

				return {
					type: 'success',
					function_call_output: function_call_output,
					function_output_id: function_output_id,
					breakout_of_function_calls: true,
					status: "continue_silent"
				} as any;
			}

			let ripgrep_results = "";
			try {
				ripgrep_results = await this.executeRipgrep(rg_args, context);
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
					related_to: args.msg_id, // Point to function call message ID, not user message ID
					success: false
				};

				return {
					type: 'success',
					function_call_output: function_call_output,
					function_output_id: function_output_id,
					breakout_of_function_calls: true,
					status: "continue_silent"
				} as any;
			}

			const grep_results = this.formatGrepResults(ripgrep_results, open_doc_results, query, cwd);

			const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (function_output_id === null) {
				throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
			}
			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: grep_results,
				related_to: args.msg_id // Point to function call message ID, not user message ID
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id
			};

		} catch (error) {
			const error_message = `Error processing grep_search: ${error instanceof Error ? error.message : String(error)}`;
			
			const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (function_output_id === null) {
				throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
			}
			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: error_message,
				related_to: args.msg_id // Point to function call message ID, not user message ID
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id
			};
		}
	}

	/**
	 */
	private buildRipgrepArguments(
		query: string, 
		case_sensitive: boolean, 
		include_pattern?: string, 
		exclude_pattern?: string, 
		cwd?: string
	): string[] {
		const args = ["-n"]; // Line numbers

		if (!case_sensitive) {
			args.push("-i");
		}

		if (include_pattern && include_pattern !== "") {
			const include_patterns = this.parseIncludePatterns(include_pattern);
			for (const pattern of include_patterns) {
				if (/^\*\.[a-zA-Z]+$/.test(pattern)) {
					const ext = pattern.substring(2); // Remove "*."
					// Add lowercase, uppercase, and first-letter-capitalized versions
					args.push("-g", `*.${ext.toLowerCase()}`);
					if (ext.toLowerCase() !== ext.toUpperCase()) {
						args.push("-g", `*.${ext.toUpperCase()}`);
					}
					// Add first-letter-capitalized version if different
					const first_cap = ext.charAt(0).toUpperCase() + ext.slice(1).toLowerCase();
					if (first_cap !== ext.toLowerCase() && first_cap !== ext.toUpperCase()) {
						args.push("-g", `*.${first_cap}`);
					}
				} else {
					args.push("-g", pattern);
				}
			}
		}

		if (exclude_pattern && exclude_pattern !== "") {
			const exclude_patterns = this.parseExcludePatterns(exclude_pattern);
			for (const pattern of exclude_patterns) {
				if (/^\*\.[a-zA-Z]+$/.test(pattern)) {
					const ext = pattern.substring(2); // Remove "*."
					// Add lowercase, uppercase, and first-letter-capitalized versions with ! prefix
					args.push("-g", `!*.${ext.toLowerCase()}`);
					if (ext.toLowerCase() !== ext.toUpperCase()) {
						args.push("-g", `!*.${ext.toUpperCase()}`);
					}
					// Add first-letter-capitalized version if different
					const first_cap = ext.charAt(0).toUpperCase() + ext.slice(1).toLowerCase();
					if (first_cap !== ext.toLowerCase() && first_cap !== ext.toUpperCase()) {
						args.push("-g", `!*.${first_cap}`);
					}
				} else {
					args.push("-g", `!${pattern}`);
				}
			}
		}

		args.push(query);
		if (cwd) {
			args.push(cwd);
		}

		return args;
	}

	/**
	 * Parse include patterns using [;,| ] separator (like Rao)
	 */
	private parseIncludePatterns(patterns?: string): string[] {
		if (!patterns || patterns === "") {
			return [];
		}

		const parsed = patterns.split(/[;,| ]/)
			.map(p => p.trim())
			.filter(p => p !== "");

		return parsed;
	}

	/**
	 * Parse exclude patterns using [;,] separator (like Rao)
	 */
	private parseExcludePatterns(patterns?: string): string[] {
		if (!patterns || patterns === "") {
			return [];
		}

		const parsed = patterns.split(/[;,]/)
			.map(p => p.trim())
			.filter(p => p !== "");

		return parsed;
	}

	/**
	 * Search in open documents (simplified implementation)
	 */
	private async grepInOpenDocuments(
		pattern: string,
		case_sensitive: boolean,
		include_patterns: string[],
		exclude_patterns: string[],
		context: CallContext
	): Promise<{ [filePath: string]: MatchInfo[] }> {
		const results: { [filePath: string]: MatchInfo[] } = {};
		
		try {
			const escaped_pattern = pattern.replace(/\\\\/g, '\\');
			
			const open_docs = await context.documentManager.getAllOpenDocuments();
			
			if (!open_docs || open_docs.length === 0) {
				return results; 
			}
			
			for (const doc of open_docs) {
				if (!doc.content || doc.content === "") {
					continue;
				}
				
				let display_path: string | null = null;
				
				if (doc.path && doc.path !== "") {
					const cwd = await this.getCurrentWorkingDirectory(context);
					display_path = doc.path.replace(new RegExp(`^${cwd}/`), '');
				} else {
					// Unsaved file - construct a simple path
					display_path = `__UNSAVED__/untitled`;
				}
				
				if (!display_path) {
					continue; 
				}
				
				// For simplicity, we'll do basic filtering for now
				if (include_patterns && include_patterns.length > 0) {
					const matches_include = include_patterns.some(p => display_path!.includes(p));
					if (!matches_include) continue;
				}
				
				if (exclude_patterns && exclude_patterns.length > 0) {
					const matches_exclude = exclude_patterns.some(p => display_path!.includes(p));
					if (matches_exclude) continue;
				}
				
				const content_lines = doc.content.split('\n');
				
				for (let line_num = 0; line_num < content_lines.length; line_num++) {
					const line_content = content_lines[line_num];
					
					let match_found = false;
					if (case_sensitive) {
						match_found = new RegExp(escaped_pattern).test(line_content);
					} else {
						match_found = new RegExp(escaped_pattern, 'i').test(line_content);
					}
					
					if (match_found) {
						if (!results[display_path]) {
							results[display_path] = [];
						}
						
						results[display_path].push({
							line: line_num + 1, 
							content: line_content
						});
					}
				}
			}
			
			return results;
		} catch (error) {
			return {};
		}
	}

	/**
	 * Execute ripgrep with the given arguments 
	 */
	private async executeRipgrep(args: string[], context: CallContext): Promise<string> {
		try {
			// Use VS Code's search service which internally uses ripgrep
			if (!context.searchService) {
				throw new Error('Search service not available');
			}

			// Parse ripgrep arguments to build VS Code search query
			// args format: ["-n", "-i"?, query, cwd, "-g", "pattern"?, ...]
			const query = args.find(arg => !arg.startsWith('-') && arg !== args[args.length - 1]) || '';
			const cwd = args[args.length - 1]; // Last argument is the working directory
			const case_sensitive = !args.includes('-i');
			
			// Build proper ITextQuery for VS Code's search service
			const contentPattern: IPatternInfo = {
				pattern: query,
				isRegExp: false,
				isCaseSensitive: case_sensitive,
				isWordMatch: false,
				isMultiline: false
			};

			// Parse include/exclude patterns from ripgrep args
			const include_patterns: string[] = [];
			const exclude_patterns: string[] = [];
			
			for (let i = 0; i < args.length - 1; i++) {
				if (args[i] === '-g' && i + 1 < args.length) {
					const pattern = args[i + 1];
					if (pattern.startsWith('!')) {
						exclude_patterns.push(pattern.substring(1));
					} else {
						include_patterns.push(pattern);
					}
				}
			}

			// Build folder query with include/exclude patterns
			const folderQuery = {
				folder: URI.file(cwd),
				excludePattern: exclude_patterns.length > 0 
					? exclude_patterns.map(p => ({ 
						pattern: { [p]: true } as glob.IExpression 
					})) as ExcludeGlobPattern<URI>[]
					: undefined,
				includePattern: include_patterns.length > 0 
					? include_patterns.reduce((acc, p) => ({ ...acc, [p]: true }), {} as glob.IExpression)
					: undefined
			};

			const textQuery: ITextQuery = {
				type: QueryType.Text,
				contentPattern: contentPattern,
				folderQueries: [folderQuery],
				maxResults: 10000 
			};

			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('timeout')), 5000);
			});

			const searchPromise = context.searchService.textSearch(textQuery, CancellationToken.None);
			const searchComplete = await Promise.race([searchPromise, timeoutPromise]);

			// Convert VS Code search results to ripgrep format: filepath:line_num:content
			const ripgrep_lines: string[] = [];
			
			for (const result of searchComplete.results) {
				if (isFileMatch(result)) {
					const fileMatch = result as IFileMatch;
					const filePath = fileMatch.resource.fsPath;
					const isNotebook = filePath.endsWith('.ipynb');
					
					// For .ipynb files, we need to convert the content and re-search
					if (isNotebook) {
						try {
							// Get the converted Python content
							const convertedContent = await context.documentManager.getEffectiveFileContent(filePath);
							if (convertedContent) {
								// Search the converted content for matches
								const lines = convertedContent.split('\n');
								const searchPattern = new RegExp(query, case_sensitive ? 'g' : 'gi');
								
								lines.forEach((line, index) => {
									if (searchPattern.test(line)) {
										// Format exactly like ripgrep: filepath:line_num:content
										ripgrep_lines.push(`${filePath}:${index + 1}:${line}`);
									}
								});
							}
						} catch (error) {
							// If conversion fails, fall back to original results
							for (const match of fileMatch.results || []) {
								if (resultIsMatch(match)) {
									const textMatch = match as ITextSearchMatch;
									const lineNumber = textMatch.rangeLocations.length > 0 ? 
										textMatch.rangeLocations[0].source.startLineNumber + 1 : 1;
									const lineText = textMatch.previewText || '';
									
									if (lineText.trim().length > 0 && lineNumber > 0) {
										ripgrep_lines.push(`${filePath}:${lineNumber}:${lineText}`);
									}
								}
							}
						}
					} else {
						// For non-notebook files, use original logic
						for (const match of fileMatch.results || []) {
							if (resultIsMatch(match)) {
								const textMatch = match as ITextSearchMatch;
								const lineNumber = textMatch.rangeLocations.length > 0 ? 
									textMatch.rangeLocations[0].source.startLineNumber + 1 : 1;
								
								const lineText = textMatch.previewText || '';
								
								if (lineText.trim().length > 0 && lineNumber > 0) {
									ripgrep_lines.push(`${filePath}:${lineNumber}:${lineText}`);
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



	/**
	 * Implements the exact same algorithm as SessionAiSearch.R lines 1502-1586
	 */
	private formatGrepResults(
		ripgrep_output: string,
		open_doc_results: { [filePath: string]: MatchInfo[] },
		query: string,
		cwd: string
	): string {
		if (ripgrep_output.length === 0 && Object.keys(open_doc_results).length === 0) {
			return "Results:\n\nNo matches";
		}

		const matches = ripgrep_output.split('\n').filter(line => line.trim() !== '');

		let match_count_note = "";
		let limited_matches = matches;
		if (matches.length > 50) {
			match_count_note = `\n(Showing 50 of ${matches.length} matches)`;
			limited_matches = matches.slice(0, 50);
		}

		const results: { [filePath: string]: string[] } = {};

		for (const file_path in open_doc_results) {
			for (const match_info of open_doc_results[file_path]) {
				if (!results[file_path]) {
					results[file_path] = [];
				}
				results[file_path].push(`Line ${match_info.line}: ${match_info.content} [EDITOR]`);
			}
		}

		for (const match of limited_matches) {
			if (match === "") continue;

			const parts = match.split(':');

			if (parts.length >= 3) {
				const filepath = parts[0];
				const line_num_str = parts[1];
				const content = parts.slice(2).join(':'); 

				// Parse and validate line number - skip if invalid
				const line_num = parseInt(line_num_str, 10);
				if (isNaN(line_num) || line_num < 1) {
					continue; // Skip invalid line numbers (ripgrep uses 1-based)
				}
				
				// Ripgrep already provides 1-based line numbers, use directly
				const final_line_num = line_num;

				const relative_path = filepath.replace(new RegExp(`^${cwd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`), '');

				if (open_doc_results[relative_path]) {
					continue;
				}

				if (/\.(png|jpg|jpeg|gif|bmp|ico|pdf|zip|tar|gz|rar|7z|exe|dll|so|dylib)$/i.test(relative_path)) {
					continue;
				}

				let processed_content = content;
				const content_len = content.length;
				if (content_len > 100) {
					// Use regex match position like Rao: regexpr(query, content, ignore.case = TRUE, perl = TRUE)[1]
					const match_regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
					const match_result = match_regex.exec(content);
					const match_pos = match_result ? match_result.index + 1 : -1; // Convert to 1-based like R
					
					if (match_pos > 0) {
						// Match Rao exactly: start_pos <- max(1, match_pos - 30)
						const start_pos = Math.max(1, match_pos - 30);
						// Match Rao exactly: end_pos <- min(content_len, match_pos + 30)
						const end_pos = Math.min(content_len, match_pos + 30);
						
						// Match Rao exactly: substr(content, 1, 20)
						const first_part = content.substring(0, 20);
						// Match Rao exactly: substr(content, start_pos, end_pos)
						const middle_part = content.substring(start_pos - 1, end_pos); // Convert back to 0-based for substring
						// Match Rao exactly: substr(content, content_len - 19, content_len)
						const last_part = content.substring(content_len - 20, content_len);
						
						processed_content = `${first_part}...${middle_part}...${last_part}`;
					}
				}

				if (!results[relative_path]) {
					results[relative_path] = [];
				}
				results[relative_path].push(`Line ${final_line_num}: ${processed_content}`);
			}
		}

		if (Object.keys(results).length > 0) {
			const result_lines = [`Results:${match_count_note}`];
			
			for (const file in results) {
				result_lines.push(`\nFile: ${file}`);
				result_lines.push(...results[file]);
			}
			
			return result_lines.join('\n');
		} else {
			return "Results:\n\nNo matches";
		}
	}
}

/**
 */
export interface SearchForFileArgs extends FunctionCallArgs {
	query: string;
}

/**
 * Handler for search_for_file function calls
 * This is a NON-INTERACTIVE function that returns file search results directly as function_call_output
 */
export class SearchForFileHandler extends BaseFunctionHandler {
	async execute(args: SearchForFileArgs, context: CallContext): Promise<FunctionResult> {
		const query = args.query;

		const cwd = await this.getCurrentWorkingDirectory(context);

		// list.files(cwd, recursive = TRUE, full.names = TRUE, all.files = FALSE, include.dirs = FALSE)
		const all_files = await this.listAllFiles(cwd, context);

		const relative_files = this.convertToRelativePaths(all_files, cwd);

		const filtered_files = this.filterFiles(relative_files);

		const scores = this.calculateFileScores(filtered_files, query);

		const min_allowed_score = 10;
		const valid_matches: string[] = [];
		const valid_scores: number[] = [];

		for (let i = 0; i < filtered_files.length; i++) {
			if (scores[i] > min_allowed_score) {
				valid_matches.push(filtered_files[i]);
				valid_scores.push(scores[i]);
			}
		}

		let search_results: string;

		if (valid_matches.length === 0) {
			search_results = `No files found matching: ${query}`;
		} else {
			const sorted_indices = valid_scores
				.map((score, index) => ({ score, index }))
				.sort((a, b) => b.score - a.score) // decreasing order
				.map(item => item.index);

			const top_matches = sorted_indices.slice(0, Math.min(10, sorted_indices.length)).map(i => valid_matches[i]);

			const result_lines = [`File search results for '${query}':`];

			for (let i = 0; i < top_matches.length; i++) {
				const file_path = top_matches[i];
				const full_path = this.joinPath(cwd, file_path);
				const file_info = await this.getFileInfo(full_path, context);

				let size_str: string;
				if (file_info.size !== undefined && !isNaN(file_info.size)) {
					size_str = this.formatFileSize(file_info.size);
				} else {
					size_str = "unknown size";
				}

				result_lines.push(`${i + 1}. ${file_path} (${size_str})`);
			}

			if (valid_matches.length > 10) {
				result_lines.push(`\n(Showing top 10 of ${valid_matches.length} matches)`);
			}

			search_results = result_lines.join('\n');
		}

		const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2) 
			|| context.conversationManager.getNextMessageId();

		if (search_results && search_results.length > 0) {
			const result_lines = search_results.split('\n');
			const limited_lines = this.limitOutputText(result_lines, context);
			search_results = limited_lines.join('\n');
		}

		// CRITICAL: related_to must point to function_call.msg_id, NOT user message ID
		const function_call_output = {
			id: function_output_id,
			type: 'function_call_output' as const,
			call_id: args.call_id || '',
			output: search_results,
			related_to: args.msg_id // Point to function call message ID, not user message ID
		};

			return {
				type: 'success',
			function_call_output: function_call_output,
			function_output_id: function_output_id
		};
	}

	/**
	 * List all files recursively using real FileSystemUtils
	 */
	private async listAllFiles(cwd: string, context: CallContext): Promise<string[]> {
		try {
			// Returns full paths (full.names = TRUE)
			// No hidden files (all.files = FALSE)
			// No directories (include.dirs = FALSE)
			// Recursive = TRUE
			return await context.fileSystemUtils.listAllFiles(cwd);
		} catch (error) {
			return [];
		}
	}

	/**
	 * Convert absolute paths to relative paths
	 */
	private convertToRelativePaths(all_files: string[], cwd: string): string[] {
		const cwd_prefix = `${cwd}/`;
		return all_files.map(file => {
			if (file.startsWith(cwd_prefix)) {
				return file.substring(cwd_prefix.length);
			}
			return file;
		});
	}

	/**
	 * Filter out hidden files and unwanted file types
	 */
	private filterFiles(relative_files: string[]): string[] {
		return relative_files.filter(file => {
			// Filter out files starting with . (line 1989)
			if (file.startsWith('.')) {
				return false;
			}
			
			// Filter out files in hidden directories (line 1990)
			if (file.includes('/.')) {
				return false;
			}
			
			// Filter out unwanted file extensions (line 1991)
			const unwanted_extensions = /\.(log|tmp|cache|bak)$/i;
			if (unwanted_extensions.test(file)) {
				return false;
			}
			
			return true;
		});
	}

	/**
	 * Calculate file scores based on query matching
	 */
	private calculateFileScores(relative_files: string[], query: string): number[] {
		return relative_files.map(filepath => {
			const lower_path = filepath.toLowerCase();
			const lower_query = query.toLowerCase();
			
			let score = 0;
			
			if (lower_path.includes(lower_query)) {
				score += 100;
				
				const filename = CommonUtils.getBasename(lower_path);
				if (filename.includes(lower_query)) {
					score += 50;
				}
				
				if (filename.startsWith(lower_query)) {
					score += 25;
				}
			}
			
			const query_chars = query.toLowerCase().split('');
			const path_chars = filepath.toLowerCase().split('');
			
			let query_index = 0;
			for (let i = 0; i < path_chars.length; i++) {
				if (query_index < query_chars.length && path_chars[i] === query_chars[query_index]) {
					score += 1;
					query_index++;
				}
			}
			
			if (query_index > query_chars.length) {
				score += 10;
			}
			
			const path_depth = filepath.split('/').length;
			score -= path_depth;
			
			const length_penalty = filepath.length / Math.max(1, query.length);
			score -= length_penalty;
			
			return score;
		});
	}



	/**
	 * Get file information using real FileSystemUtils
	 */
	private async getFileInfo(full_path: string, context: CallContext): Promise<{
		size?: number;
	}> {
		try {
			const stats = await context.fileSystemUtils.getFileStats(full_path);
			return {
				size: stats ? stats.size : undefined
			};
		} catch (error) {
			return {
				size: undefined
			};
		}
	}
}

/**
 */
export interface ListDirectoryArgs extends FunctionCallArgs {
	relative_workspace_path: string;
}

/**
 * Handler for list_dir function calls
 * This is a NON-INTERACTIVE function that returns directory content directly as function_call_output
 */
export class ListDirectoryHandler extends BaseFunctionHandler {
	async execute(args: ListDirectoryArgs, context: CallContext): Promise<FunctionResult> {
		const dir_path = args.relative_workspace_path;

		const cwd = await this.getCurrentWorkingDirectory(context);

		let full_path: string;
		if (dir_path === "." || dir_path === "") {
			full_path = cwd;
		} else {
			full_path = this.joinPath(cwd, dir_path);
		}

		full_path = this.normalizePath(full_path, context);

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
						// Directories first (decreasing=TRUE means directories come first)
						if (a.info.is_dir !== b.info.is_dir) {
							return a.info.is_dir ? -1 : 1;
						}
						// Then by name
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
							const size_str = this.formatFileSize(info.size);
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
				related_to: args.msg_id // Point to function call message ID, not user message ID
			};

			return {
				type: 'success',
			function_call_output: function_call_output,
			function_output_id: function_output_id
		};
	}




	/**
	 * Check if directory exists using real FileSystemUtils
	 */
	private async directoryExists(path: string, context: CallContext): Promise<boolean> {
		return await context.fileSystemUtils.directoryExists(path);
	}

	/**
	 * List files in directory using real FileSystemUtils
	 */
	private async listFiles(path: string, context: CallContext): Promise<string[]> {
		try {
			// Returns filenames only (full.names = FALSE)
			// Include hidden files (all.files = TRUE)  
			// Include directories (include.dirs = TRUE)
			return await context.fileSystemUtils.listFiles(path, {
				fullNames: false,
				allFiles: true,
				includeDirs: true
			});
		} catch (error) {
			return [];
		}
	}

	/**
	 * Get file information for list of files
	 */
	private async getFileInfo(dir_path: string, files: string[], context: CallContext): Promise<Array<{
		name: string;
		size?: number;
		isdir?: boolean;
		is_dir?: boolean;
	}>> {
		const result = [];
		
		for (const file of files) {
			const file_path = this.joinPath(dir_path, file);
			
			// Get file stats using real FileSystemUtils
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

	/**
	 * Get file stats using real FileSystemUtils
	 */
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

/**
 * Interface for match information from open documents
 * Used by GrepSearchHandler for open document search results
 */
interface MatchInfo {
	line: number;
	content: string;
}