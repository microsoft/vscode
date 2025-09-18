/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ConversationMessage, Conversation } from '../../../../services/erdosAi/common/conversationTypes.js';
import { ICommonUtils } from '../../../../services/erdosAiUtils/common/commonUtils.js';

const WIDGET_FUNCTIONS = ['run_console_cmd', 'run_terminal_cmd', 'search_replace', 'delete_file', 'run_file'] as const;

export function parseFunctionArgs(functionCall: any, defaultValue: any = {}): any {
	if (!functionCall || typeof functionCall.arguments !== 'string') {
		return defaultValue;
	}
	
	try {
		const parsed = JSON.parse(functionCall.arguments || '{}');
		return parsed !== null && typeof parsed === 'object' ? parsed : defaultValue;
	} catch (error) {
		console.warn('Failed to parse function call arguments:', error);
		return defaultValue;
	}
}

export function extractCleanedCommand(functionName: string, args: any): string {
	if (!args || !args.command) return '';
	
	let command = args.command;
	
	if (functionName === 'run_console_cmd') {
		command = command.replace(/^```(?:[rR]?[mM]?[dD]?|python|py)?\s*\n?/g, '');
		command = command.replace(/\n?```\s*$/g, '');
		command = command.replace(/```\n/g, '');
		command = command.trim();
	} else if (functionName === 'run_terminal_cmd') {
		command = command.replace(/^```(?:shell|bash|sh)?\s*\n?/g, '');
		command = command.replace(/\n?```\s*$/g, '');
		command = command.replace(/```\n/g, '');
		command = command.trim();
	}
	
	return command;
}

export function formatSearchReplaceContent(args: any, commonUtils: ICommonUtils): string {
	const filename = args.file_path || '';
	const oldString = args.old_string || '';
	const newString = args.new_string || '';
	
	const commentSyntax = filename ? commonUtils.getCommentSyntax(filename) : '# ';
	
	let result = `${commentSyntax}Old content\n${oldString}`;
	result += `\n\n${commentSyntax}New content\n${newString}`;
	
	return result;
}

export function formatFunctionCallMessage(functionCall: any, commonUtils: ICommonUtils, currentConversation?: Conversation | null, success?: boolean): string {	
	const args = parseFunctionArgs(functionCall);
	
	switch (functionCall.name) {
		case 'read_file':
			const readFilename = args.filename ? commonUtils.getBasename(args.filename) : 'unknown';
			if (success === false) {
				return `Failed to read ${readFilename}`;
			}			
			let lineInfo = '';
			if (args.should_read_entire_file) {
				lineInfo = ' (1-end)';
			} else if (args.start_line_one_indexed && args.end_line_one_indexed_inclusive) {
				lineInfo = ` (${args.start_line_one_indexed}-${args.end_line_one_indexed_inclusive})`;
			} else if (args.start_line_one_indexed) {
				lineInfo = ` (${args.start_line_one_indexed}-end)`;
			} else if (args.end_line_one_indexed_inclusive) {
				lineInfo = ` (1-${args.end_line_one_indexed_inclusive})`;
			}
			return `Read ${readFilename}${lineInfo}`;
			
		case 'retrieve_documentation':
			const query = args.query || 'unknown';
			if (success === false) {
				return `Failed to retrieve documentation for ${query}`;
			}
			return `Retrieved documentation for ${query}`;
			
		case 'search_for_file':
			return `Searched for files matching "${args.query || 'unknown'}"`;
			
		case 'list_dir':
			const path = args.relative_workspace_path || '.';
			const displayPath = path === '.' ? 'the current directory' : path;
			return `Listed contents of ${displayPath}`;
			
		case 'view_image':
			if (success === false) {
				if (args.image_path) {
					const failImageName = commonUtils.getBasename(args.image_path);
					return `Failed to view ${failImageName}`;
				} else if (args.image_index !== undefined) {
					const index = args.image_index;
					if (index === 1) {
						return 'Failed to view the most recent plot';
					} else {
						const plotsAgo = index - 1;
						const plotWord = plotsAgo === 1 ? 'plot' : 'plots';
						return `Failed to view the plot ${plotsAgo} ${plotWord} ago`;
					}
				} else {
					return 'Failed to view image';
				}
			}
			
			if (args.image_path) {
				const imageName = commonUtils.getBasename(args.image_path);
				return `Viewed ${imageName}`;
			} else if (args.image_index !== undefined) {
				const index = args.image_index;
				if (index === 1) {
					return 'Viewed the most recent plot';
				} else {
					const plotsAgo = index - 1;
					const plotWord = plotsAgo === 1 ? 'plot' : 'plots';
					return `Viewed the plot ${plotsAgo} ${plotWord} ago`;
				}
			} else {
				return 'Viewed image';
			}
			
		case 'grep':
			const grepPattern = args.pattern || 'unknown';
			const displayGrepPattern = grepPattern.length > 50 ? grepPattern.substring(0, 50) + '...' : grepPattern;
			
			let grepInfo = '';
			const infoParts = [];
			if (args.glob) infoParts.push(`glob: ${args.glob}`);
			if (args.type) infoParts.push(`type: ${args.type}`);
			if (args.path && args.path !== '.') infoParts.push(`path: ${args.path}`);
			if (args.output_mode && args.output_mode !== 'content') infoParts.push(`mode: ${args.output_mode}`);
			if (args['-i']) infoParts.push('case-insensitive');
			if (args.multiline) infoParts.push('multiline');
			if (args['-A'] || args['-B'] || args['-C']) {
				const contextParts = [];
				if (args['-A']) contextParts.push(`+${args['-A']}`);
				if (args['-B']) contextParts.push(`-${args['-B']}`);
				if (args['-C']) contextParts.push(`±${args['-C']}`);
				infoParts.push(`context: ${contextParts.join(',')}`);
			}
			if (args.head_limit) infoParts.push(`limit: ${args.head_limit}`);
			
			if (infoParts.length > 0) {
				grepInfo = ` (${infoParts.join(', ')})`;
			}
			
			return `Searched pattern "${displayGrepPattern}"${grepInfo}`;
			
		case 'delete_file':
			return `Failed to delete ${args.filename || 'file'}`;
		
		case 'run_file':
			return `Failed to run ${args.filename || args.file_path || 'file'}`;

		case 'search_replace':
			const searchReplaceFilePath = args.file_path || args.filename || 'unknown';
			const searchReplaceFilename = searchReplaceFilePath ? commonUtils.getBasename(searchReplaceFilePath) : 'unknown';
			return `Model failed to edit ${searchReplaceFilename}`;

		default:
			return functionCall.name.replace(/_/g, ' ');
	}
}

// Utility functions for incremental message updates
export function smartMergeMessages(currentMessages: ConversationMessage[], newMessages: ConversationMessage[]): ConversationMessage[] {
	// Create a map of current messages by ID for fast lookup
	const currentMap = new Map(currentMessages.map(m => [m.id, m]));
	const result: ConversationMessage[] = [];
	
	// Add/update messages from newMessages
	for (const newMessage of newMessages) {
		result.push(newMessage);
		currentMap.delete(newMessage.id); // Remove from current map to avoid duplicates
	}
	
	// Add any remaining current messages that weren't in newMessages (shouldn't happen in normal flow)
	for (const [, currentMessage] of currentMap) {
		if (!result.some(m => m.id === currentMessage.id)) {
			result.push(currentMessage);
		}
	}
	
	// Sort by ID to maintain order
	return result.sort((a, b) => a.id - b.id);
}

export function updateSingleMessage(currentMessages: ConversationMessage[], updatedMessage: ConversationMessage): ConversationMessage[] {
	const exists = currentMessages.some(m => m.id === updatedMessage.id);
	
	if (exists) {
		// Update existing message
		return currentMessages.map(m => m.id === updatedMessage.id ? updatedMessage : m);
	} else {
		// Add new message and sort
		return [...currentMessages, updatedMessage].sort((a, b) => a.id - b.id);
	}
}

export function filterMessagesForDisplay(messagesToFilter: ConversationMessage[], allMessages?: ConversationMessage[]): ConversationMessage[] {
	
	const contextMessages = allMessages || messagesToFilter;
	
	const filtered = messagesToFilter.filter(message => {
		// CRITICAL FIX: Allow function_call_output messages with success: false to pass through
		// even if they are marked as procedural, because we need them for UI logic
		if (message.procedural && !(message.type === 'function_call_output' && (message as any).success === false)) {
			return false;
		}
		
		if (message.type === 'function_call_output') {
			const relatedMessage = contextMessages.find(m => m.id === message.related_to);
			
			if (relatedMessage && relatedMessage.function_call) {
				const functionName = relatedMessage.function_call.name;
				const failableFunctions = ['search_replace', 'run_file', 'delete_file', 'view_image'];
				
				if (failableFunctions.includes(functionName)) {
					const success = (message as any).success;
					const shouldInclude = success === false;
					return shouldInclude;
				}
			}
			return false;
		}
		
		if (message.role === 'user') {
			return true;
		}
		
		if (message.function_call && message.function_call.name) {
			const functionName = message.function_call.name;
			
			const nonWidgetFunctions = ['grep', 'read_file', 'view_image', 'search_for_file', 'list_dir', 'retrieve_documentation'];
			if (nonWidgetFunctions.includes(functionName)) {
				return true;
			}
			
			const allWidgetFunctions = [...WIDGET_FUNCTIONS, 'delete_file', 'run_file'];
			if (allWidgetFunctions.includes(functionName as any)) {
				return true;
			}
			
			return true;
		}
		
		if (message.role === 'assistant') {
			return true;
		}
		
		if (message.type === 'assistant' && (message as any).web_search_call) {
			return true;
		}
		
		return false;
	});
	
	return filtered;
}

