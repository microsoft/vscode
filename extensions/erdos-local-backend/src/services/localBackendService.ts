/*---------------------------------------------------------------------------------------------
 * Copyright (c) Lotas Inc. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { 
    IFunctionDefinitionService, 
    StreamData, 
    ConversationMessage,
    ILocalBackendService 
} from '../types.js';
import { StreamingService } from './streamingService.js';
import { OpenAiProxyService } from './openAiProxyService.js';
import { AnthropicProxyService } from './anthropicProxyService.js';

/**
 * Extended message type for API processing that can handle array content
 */
interface ApiMessage {
	id: number;
	role?: 'user' | 'assistant';
	content?: string | ContentItem[];
	timestamp: string;
	function_call?: any;
	type?: string;
	call_id?: string;
	output?: string;
	procedural?: boolean;
}

interface ContentItem {
	type?: string;
	text?: string;
	image_url?: string | { url: string };
	source?: { data: string };
}

/**
 * TypeScript equivalent of SessionAiApiService.java
 * Implements the exact functions found in the Java file for BYOK functionality
 */
export class LocalBackendService implements ILocalBackendService {

	// Constants for supported models
	private static readonly OPENAI_CHEAP_MODEL = 'gpt-4.1-mini';
	private static readonly ANTHROPIC_CHEAP_MODEL = 'claude-sonnet-4-20250514';

	private readonly streamingService: StreamingService;
	private readonly openAiProxyService: OpenAiProxyService;
	private readonly anthropicProxyService: AnthropicProxyService;

	constructor(
		private readonly functionDefinitionService: IFunctionDefinitionService
	) {
		this.streamingService = new StreamingService();
		this.openAiProxyService = new OpenAiProxyService();
		this.anthropicProxyService = new AnthropicProxyService();
	}

	/**
	 * Load developer instructions for VSCode
	 */
	private async loadDeveloperInstructions(model: string): Promise<string> {
		try {
			// Get developer instructions from function definition service
			let instructions = await this.functionDefinitionService.loadDeveloperInstructions(model);
			
			return instructions;
		} catch (e) {
			throw new Error(`Failed to load developer instructions from app-configs/vscode/developer-instructions.txt: ${e}`);
		}
	}

	/**
	 * Helper method to select appropriate cheap model for cost optimization
	 */
	private selectCheapModel(provider: string): string {
		switch (provider) {
			case 'openai':
				return LocalBackendService.OPENAI_CHEAP_MODEL;
			case 'anthropic':
				return LocalBackendService.ANTHROPIC_CHEAP_MODEL;
			default:
				throw new Error(`Unsupported provider: ${provider}. Supported providers: openai, anthropic`);
		}
	}


	/**
	 * Some OpenAI models do not accept the 'temperature' parameter
	 */
	private isOpenAiTemperatureSupported(model: string): boolean {
		if (!model) return false;
		// Keep an allow-list to be conservative
		switch (model) {
			case 'gpt-4o':
			case 'gpt-4o-mini':
			case 'gpt-4.1':
			case 'gpt-4.1-mini':
				return true;
			default:
				return false; // gpt-5, gpt-5-mini, gpt-5-nano and others default to no temperature
		}
	}

	/**
	 * Check if this is a reasoning model
	 */
	private isReasoningModel(model: string): boolean {
		if (!model) return false;
		return model.startsWith('o1') || model === 'o3' || model.startsWith('o3-') || model.startsWith('o4-');
	}

	/**
	 * Escape JSON special characters
	 */
	private escapeJson(value: string): string {
		if (!value) return '';
		return value.replace(/\\/g, '\\\\')
					.replace(/"/g, '\\"')
					.replace(/\n/g, '\\n')
					.replace(/\r/g, '\\r')
					.replace(/\t/g, '\\t');
	}


	/**
	 * Helper method for common request validation
	 */
	private validateBasicRequest(messages: ConversationMessage[]): string | null {
		if (!messages || messages.length === 0) {
			return 'The conversation received by the backend was empty. A conversation is required. Try opening a new conversation.';
		}
		
		return null; // No validation errors
	}


	/**
	 * Send a Server-Sent Event for streaming
	 */
	private sendSseEvent(outputStream: any, request_id: string, field: string, 
						value: string, delta?: string, isComplete: boolean = false): void {
		const eventData: any = {
			request_id: request_id,
			isComplete: isComplete
		};

		if (delta !== undefined) {
			eventData.delta = this.escapeJson(delta);
			eventData.field = field;
		} else {
			eventData[field] = this.escapeJson(value);
		}

		// Write SSE formatted data to outputStream
		outputStream.write(`data: ${JSON.stringify(eventData)}\n\n`);
	}

	/**
	 * Check if we need to add a reminder message for two consecutive assistant messages
	 */
	private needsEndTurnReminder(messages: ConversationMessage[]): boolean {
		if (messages.length < 2) {
			return false;
		}
		
		// Check last two messages from the end
		const lastMessage = messages[messages.length - 1];
		const secondToLastMessage = messages[messages.length - 2];
		
		// Both messages must be assistant messages without function calls
		return this.isAssistantMessageWithoutFunctionCall(lastMessage) && 
			   this.isAssistantMessageWithoutFunctionCall(secondToLastMessage);
	}

	/**
	 * Check if a message is an assistant message without function calls
	 */
	private isAssistantMessageWithoutFunctionCall(message: ConversationMessage): boolean {
		return message.role === 'assistant' && 
			   !message.function_call &&
			   message.content !== undefined;
	}
	
	/**
	 * Determines if this is the first user message in a conversation
	 */
	private isFirstMessageInConversation(messages: ConversationMessage[]): boolean {
		if (!messages || messages.length === 0) {
			return true; // Empty conversation = first message
		}
		
		let userMessageCount = 0;
		let hasAssistantResponse = false;
		
		for (const msg of messages) {
			if (msg.role) {
				// Count actual user messages (exclude procedural messages)
				if (msg.role === 'user' && msg.content !== undefined) {
					// Skip procedural messages
					const isProcedural = msg.procedural === true;
					if (!isProcedural) {
						userMessageCount++;
					}
				}
				
				// Check for any assistant responses
				if (msg.role === 'assistant') {
					hasAssistantResponse = true;
				}
			}
		}
		
		// First message if: only 1 user message AND no assistant responses
		return userMessageCount <= 1 && !hasAssistantResponse;
	}

	/**
	 * Main tools method - get API tools for conversation
	 */
	private getApiTools(conversation: ConversationMessage[], symbolsNote: string | null,
					   isConversationNameRequest: boolean,
					   provider: string, webSearchEnabled: boolean): any[] {
		
		const tools: any[] = [];
		
		// Special case: For conversation name requests, don't provide any tools
		if (isConversationNameRequest) {
			return tools;
		}
		
		// Add native web_search tool
		// Only add if not in edit state and web search is enabled
		if (webSearchEnabled) {
			let webSearchTool: any;
			
			// Use provider-specific tool type
			if (provider === 'anthropic') {
				webSearchTool = {
					type: 'web_search_20250305',
					name: 'web_search',
					max_uses: 5
				};
			} else if (provider === 'openai') {
				webSearchTool = {
					type: 'web_search'
				};
			}
			
			if (webSearchTool) {
				tools.push(webSearchTool);
			}
		}
				
		// Define the standard function names to include
		const standardFunctions = [
			'search_replace',  // Added for find-replace functionality
			'grep_search',
			'list_dir',        // Always included
			'search_for_file', // Always included (fuzzy file search)
			'run_terminal_cmd', // Always included
			'run_console_cmd', // Always included
			'read_file',      // Always included
			'delete_file',    // Always included  
			'run_file',       // Always included
			'retrieve_documentation' // Always included (documentation retrieval)
		];
		
		
		// Include end_turn function for OpenAI models only
		// Anthropic models use stop_reason: "end_turn" instead of function calls
		if (provider !== 'anthropic') {
			standardFunctions.push('end_turn');
		}
		
		// Add standard functions
		const standardTools = this.functionDefinitionService.getFunctionsByNames(standardFunctions);
		tools.push(...standardTools);
		
		// Add context-dependent tools based on specific conditions
		const conditionalFunctions: string[] = [];
		
		
		// 1. view_image: available if there are images in conversation or symbols
		if (this.hasImageFileInConversationOrSymbols(conversation, symbolsNote)) {
			conditionalFunctions.push('view_image');
		}
		
		if (conditionalFunctions.length > 0) {
			const conditionalTools = this.functionDefinitionService.getFunctionsByNames(conditionalFunctions);
			tools.push(...conditionalTools);
		}
		
		return tools;
	}


	/**
	 * Check if there's an image file mentioned in conversation history or symbols note
	 */
	private hasImageFileInConversationOrSymbols(conversation: ConversationMessage[], symbolsNote: string | null): boolean {
		// Check conversation messages for image files
		for (const message of conversation) {
			if (this.hasImageFileInMessage(message)) {
				return true;
			}
		}
		
		// Check symbols note for image files
		if (symbolsNote) {
			try {
				const parsedSymbolsNote = JSON.parse(symbolsNote);
				return this.hasImageFileInSymbolsNote(parsedSymbolsNote);
			} catch (e) {
				// If parsing fails, ignore symbols note check
			}
		}
		
		return false;
	}

	/**
	 * Check if a message contains references to image files
	 */
	private hasImageFileInMessage(message: ConversationMessage): boolean {
		if (message.content === undefined) {
			return false;
		}
		
		let contentText = '';
		
		if (typeof message.content === 'string') {
			contentText = message.content;
		} else {
			// Cast to ApiMessage to handle array content
			const apiMsg = message as ApiMessage;
			if (Array.isArray(apiMsg.content)) {
				const textParts: string[] = [];
				for (const item of apiMsg.content) {
					if (typeof item === 'object' && item !== null && 'text' in item && item.text) {
						textParts.push(item.text);
					}
				}
				contentText = textParts.join(' ');
			}
		}
		
		// Check for common image file extensions
		return /\.(png|jpg|jpeg|gif|bmp|svg|webp|tiff|tif)\b/i.test(contentText);
	}

	/**
	 * Check if symbols note contains image files
	 */
	private hasImageFileInSymbolsNote(symbolsNote: any): boolean {
		// Check open files
		if (symbolsNote.open_files) {
			for (const file of symbolsNote.open_files) {
				if (file.name && /\.(png|jpg|jpeg|gif|bmp|svg|webp|tiff|tif)\b/i.test(file.name)) {
					return true;
				}
			}
		}
		
		// Check direct context
		if (symbolsNote.direct_context) {
			for (const item of symbolsNote.direct_context) {
				if (item.path && /\.(png|jpg|jpeg|gif|bmp|svg|webp|tiff|tif)\b/i.test(item.path)) {
					return true;
				}
			}
		}
		
		// Check user-provided context (this is the same as direct_context)
		// Note: This check is redundant with the direct context check above, but keeping for safety
		if (symbolsNote.direct_context) {
			for (const item of symbolsNote.direct_context) {
				if (item.path && /\.(png|jpg|jpeg|gif|bmp|svg|webp|tiff|tif)\b/i.test(item.path)) {
					return true;
				}
			}
		}
		
		return false;
	}

	/**
	 * Add image context messages to the conversation
	 */
	private addImageContextMessages(conversation: ConversationMessage[], imageContext: any[]): void {
		if (!imageContext || imageContext.length === 0) {
			return;
		}
		
		// Find the user message with original_query = true (the main query message that gets context) to insert images BEFORE it
		let originalQueryMessageIndex = -1;
		
		for (let i = conversation.length - 1; i >= 0; i--) {
			const message = conversation[i];
			if (message.role === 'user' && 
				!message.function_call &&
				message.original_query === true) {
				
				originalQueryMessageIndex = i;
				break;
			}
		}
		
		if (originalQueryMessageIndex === -1) {
			console.warn('DEBUG IMAGE FLOW: No original_query user message found to insert images before');
			return;
		}
				
		// Add each image as a separate user message BEFORE the main user message
		for (let i = 0; i < imageContext.length; i++) {
			const imageData = imageContext[i];			
			const imageMessage: ConversationMessage = {
				id: Date.now() + i, // Ensure unique IDs
				role: 'user',
				timestamp: new Date().toISOString(),
				content: [
					{
						type: 'input_image',
						image_url: `data:${imageData.mime_type};base64,${imageData.base64_data}`
					}
				] as any
			};
			
			// Insert the image message before the original_query user message
			conversation.splice(originalQueryMessageIndex + i, 0, imageMessage);
		}
	}

	/**
	 * Add user rules as a separate user message before the original query message
	 */
	private addUserRulesMessage(conversation: ConversationMessage[], userRules: string[]): void {
		if (!userRules || userRules.length === 0) {
			return;
		}
		
		// Find the user message with original_query = true (the main query message that gets context) to insert rules BEFORE it
		let originalQueryMessageIndex = -1;
		
		for (let i = conversation.length - 1; i >= 0; i--) {
			const message = conversation[i];
			if (message.role === 'user' && 
				!message.function_call &&
				message.original_query === true) {
				
				originalQueryMessageIndex = i;
				break;
			}
		}
		
		if (originalQueryMessageIndex === -1) {
			console.warn('No original_query user message found to insert user rules before');
			return;
		}
		
		// Create the user rules message content
		const rulesContent = [
			'# USER_RULES',
			'User rules are provided instructions for the AI to follow to help work with the codebase.',
			'They may or may not be relevant to the task at hand.',
			'',
			...userRules
		].join('\n');
		
		// Create the user rules message
		const rulesMessage: ConversationMessage = {
			id: Date.now(),
			role: 'user',
			timestamp: new Date().toISOString(),
			content: rulesContent
		};
		
		// Insert the rules message before the original_query user message
		conversation.splice(originalQueryMessageIndex, 0, rulesMessage);
	}

	/**
	 * Add user environment info to the beginning of the original query message
	 */
	private addUserInfoToOriginalQuery(conversation: ConversationMessage[], 
									  userWorkspacePath: string | null, userShell: string | null, 
									  projectLayout: string | null): void {
		// Find the last user message with original_query = true
		for (let i = conversation.length - 1; i >= 0; i--) {
			const message = conversation[i];
			if (message.role === 'user' && 
				!message.function_call &&
				message.original_query === true) {
				
				// Extract the original user query content
				let originalUserQuery = '';
				if (typeof message.content === 'string') {
					originalUserQuery = message.content;
				} else {
					// Cast to ApiMessage to handle array content
					const apiMsg = message as ApiMessage;
					if (Array.isArray(apiMsg.content) && apiMsg.content.length > 0) {
						const firstItem = apiMsg.content[0];
						if (typeof firstItem === 'object' && firstItem !== null && 'type' in firstItem && firstItem.type === 'text') {
							originalUserQuery = (firstItem as any).text || '';
						}
					}
				}
				
				// Create user info section
				const userInfo = [
					'<user_info>',
					`The absolute path of the user's workspace is ${userWorkspacePath || '/home/byte/code/ai-dashboard'}. ` +
					`The user's shell is ${userShell || '/usr/bin/fish'}.`,
					'</user_info>',
					''
				].join('\n');
				
				// Create project layout section
				let projectLayoutSection = '';
				if (projectLayout && projectLayout.trim()) {
					projectLayoutSection = [
						'<project_layout>',
						'Below is a snapshot of the current workspace\'s file structure when the user made the most recent query. It skips over .gitignore patterns.',
						'',
						projectLayout,
						'</project_layout>',
						''
					].join('\n');
				}
				
				// Prepend user info and project layout to the original query
				const modifiedContent = userInfo + projectLayoutSection + originalUserQuery;
				
				// Update the message content with user info prepended
				if (typeof message.content === 'string') {
					// If content is a simple string, replace with modified content
					message.content = modifiedContent;
				} else {
					// Cast to ApiMessage to handle array content
					const apiMsg = message as ApiMessage;
					if (Array.isArray(apiMsg.content) && apiMsg.content.length > 0) {
						// If content is a list with text type, replace the first text element
						const firstItem = apiMsg.content[0];
						if (typeof firstItem === 'object' && firstItem !== null && 'type' in firstItem && firstItem.type === 'text') {
							(firstItem as any).text = modifiedContent;
						}
					}
				}
				
				break;
			}
		}
	}

	/**
	 * Modify the last user message with symbols note
	 */
	private modifyLastUserMessageWithSymbolsNote(conversation: ConversationMessage[], symbolsNoteJson: string): void {
		// Find the user message with original_query = true to modify with symbols note
		let foundOriginalQuery = false;
		
		for (let i = conversation.length - 1; i >= 0; i--) {
			const message = conversation[i];
			if (message.role === 'user' && 
				!message.function_call &&
				message.original_query === true) {
				
				// Extract the original user query from the message
				let originalUserQuery = '';
				if (typeof message.content === 'string') {
					originalUserQuery = message.content;
				} else {
					// Cast to ApiMessage to handle array content
					const apiMsg = message as ApiMessage;
					if (Array.isArray(apiMsg.content) && apiMsg.content.length > 0) {
						const firstItem = apiMsg.content[0];
						if (typeof firstItem === 'object' && firstItem !== null && 'type' in firstItem && firstItem.type === 'text') {
							originalUserQuery = (firstItem as any).text || '';
						}
					}
				}
				
				// Format the symbols note with the actual user query
				const formattedNote = this.formatSymbolsNote(JSON.parse(symbolsNoteJson), originalUserQuery);
				
				// Replace the message content with the formatted note
				if (typeof message.content === 'string') {
					// If content is a simple string, replace with formatted note
					message.content = formattedNote;
				} else {
					// Cast to ApiMessage to handle array content
					const apiMsg = message as ApiMessage;
					if (Array.isArray(apiMsg.content) && apiMsg.content.length > 0) {
						// If content is a list with text type, replace the first text element
						const firstItem = apiMsg.content[0];
						if (typeof firstItem === 'object' && firstItem !== null && 'type' in firstItem && firstItem.type === 'text') {
							(firstItem as any).text = formattedNote;
						}
					}
				}
				
				foundOriginalQuery = true;
				break;
			}
		}
		
		if (!foundOriginalQuery) {
			console.warn('No original_query user message found to modify with symbols note');
		}
	}

	/**
	 * Format symbols note with user query
	 */
	private formatSymbolsNote(symbolsNote: any, userQuery: string): string {
		const formatted: string[] = [];
		formatted.push('\n\n<context>\n');
		
		// Files
		if (symbolsNote.open_files && symbolsNote.open_files.length > 0) {
			formatted.push('\n# Files');
			formatted.push('The following files are open in the editor, last edited this many minutes ago:');
			for (const file of symbolsNote.open_files) {
				// Use path instead of name to preserve __UNSAVED__ patterns
				let displayName = file.path;
				if (!displayName) {
					// Fallback to name if path is missing
					displayName = file.name;
					if (!displayName) {
						// Skip these files
						continue;
					}
				}
				// Do not repeat "minutes ago" because this is already in the message
				const prefix = file.is_active ? 'Currently viewing: ' : '';
				formatted.push(`${prefix}${displayName} (${Math.round(file.minutes_since_last_update)})`);
			}
			formatted.push('');
		}
		
		
		// User-provided context
		if (symbolsNote.directContext && symbolsNote.directContext.length > 0) {
			formatted.push('\n# User-provided context');
			formatted.push('The user manually provided the following as context:\n');
			
			// Process each item: path immediately followed by its content
			for (const item of symbolsNote.directContext) {
				if (item.type === 'directory') {
					formatted.push(item.path);
					if (item.contents) {
						formatted.push('Contents:');
						for (const content of item.contents) {
							formatted.push(`  - ${content}`);
						}
					}
					formatted.push('');
				} else if (item.type === 'file') {
					if (item.content) {
						// File with line numbers - show content in code blocks
						if (item.startLine !== undefined && item.endLine !== undefined) {
							formatted.push(`${item.path} (lines ${item.startLine}-${item.endLine}):`);
						} else {
							formatted.push(`${item.path}:`);
						}
						
						// Determine if it's a markdown file that needs 4 backticks
						const fileName = item.name.toLowerCase();
						const isMarkdownFile = fileName.endsWith('.rmd') || fileName.endsWith('.md') || 
											  fileName.endsWith('.qmd') || fileName.endsWith('.markdown');
						const codeBlockMarker = isMarkdownFile ? '````' : '```';
						
						// Show the content in code blocks without line numbers
						formatted.push(codeBlockMarker);
						const lines = item.content.toString().split('\n');
						
						for (const line of lines) {
							formatted.push(line);
						}
						formatted.push(codeBlockMarker);
					} else {
						// File without content - show basic path info
						formatted.push(`${item.path}`);
					}
					formatted.push('');
				} else if (item.type === 'chat') {
					// Process chat context items (previous conversations)
					if (item.id && item.summary) {
						formatted.push(`Previous conversation ${item.id}:`);
						formatted.push('```');
						formatted.push(item.summary);
						formatted.push('```\n');
					}
				} else if (item.type === 'docs') {
					// Process docs context items (R documentation)
					if (item.topic && item.markdown) {
						formatted.push(`R Documentation for ${item.topic}:`);
						formatted.push(`${item.markdown}\n`);
					}
				}
			}
		}
		
		formatted.push('</context>\n\n');
		formatted.push('<user_query>');
		formatted.push(`${userQuery}\n`);
		formatted.push('</user_query>');
		
		return formatted.join('\n');
	}

	/**
	 * Build OpenAI request parameters
	 */
	private async buildOpenAIRequestParams(conversation: ConversationMessage[], model: string, 
										  request: any, symbolsNote: string | null,
										  webSearchEnabled: boolean): Promise<any> {
		// Check if this is a naming request that shouldn't have developer instructions
		const isConversationNameRequest = request.request_type === 'generate_conversation_name';
		const isNamingRequest = isConversationNameRequest;
		
		// Create apiConversationLog exactly like SessionAiAPI.R (lines 685-830)
		const apiConversationLog: any[] = [];
		
		// Add developer instructions as developer message for non-naming requests
		if (!isNamingRequest) {
			const developerMessage = {
				role: 'developer',
				content: await this.loadDeveloperInstructions(model)
			};
			apiConversationLog.push(developerMessage);
		}
		
		// Add previous summary if available
		if (request.previous_summary) {
			const summaryMessage = {
				role: 'system',
				content: `<previous_conversation_summary>\n(Query ${request.previous_summary.query_number} - ${request.previous_summary.timestamp}):\n\n${request.previous_summary.summary_text}\n</previous_conversation_summary>\n`
			};
			apiConversationLog.push(summaryMessage);
		}
		
		// Process conversation messages (same as existing logic)
		for (let msgIndex = 0; msgIndex < conversation.length; msgIndex++) {
			const msg = conversation[msgIndex];
			const processedMsg: any = {};
			
			// Check if this is a function_call_output message
			if (msg.type === 'function_call_output') {
				processedMsg.type = 'function_call_output';
				const callId = msg.call_id;
				processedMsg.call_id = callId;
				let output = msg.output || '';
				
				processedMsg.output = output;
				apiConversationLog.push(processedMsg);
				
				continue;
			}
			
			// Handle function call messages
			if (msg.function_call) {
				const functionCall = msg.function_call;
				const functionCallMessage: any = {
					type: 'function_call',
					name: functionCall.name
				};
				
				if (functionCall.call_id) {
					functionCallMessage.call_id = functionCall.call_id;
				}
				
				if (functionCall.arguments) {
					functionCallMessage.arguments = functionCall.arguments;
				}
				
				apiConversationLog.push(functionCallMessage);
				continue;
			}
			
			// Handle regular messages with content
			if (msg.content !== undefined && msg.role) {
				processedMsg.role = msg.role;
				
				if (typeof msg.content === 'string') {
					let textContent = msg.content;
					
					// Check if message was cancelled and append marker
					if (msg.cancelled) {
						textContent += '... (User cancelled)';
					}
					
					processedMsg.content = textContent;
				} else {
					// Process content array for images and complex content
					const apiMsg = msg as ApiMessage;
					if (Array.isArray(apiMsg.content)) {
						const formattedContent: any[] = [];
						
						for (const item of apiMsg.content) {
							if (typeof item === 'object' && item !== null && 'type' in item) {
								const contentItem: any = {};
								const itemType = item.type;
								
								if (itemType === 'input_text') {
									// Format input_text and preserve the type
									const textContent = (item as any).text;
									
									contentItem.type = 'input_text';
									contentItem.text = textContent;
									formattedContent.push(contentItem);
								} else if (itemType === 'input_image') {
									// Handle input_image format for OpenAI Responses API
									if ('image_url' in item && typeof item.image_url === 'string') {
										contentItem.type = 'input_image';
										contentItem.image_url = item.image_url;
										formattedContent.push(contentItem);
									}
								} else if (itemType === 'text') {
									// Format regular text - convert to input_text for OpenAI Responses API
									const textContent = (item as any).text;
									
									contentItem.type = 'input_text';
									contentItem.text = textContent;
									formattedContent.push(contentItem);
								} else if (itemType === 'image_url') {
									if ('image_url' in item) {
										contentItem.type = 'image_url';
										contentItem.image_url = item.image_url;
										formattedContent.push(contentItem);
									}
								}
							}
						}
						
						processedMsg.content = formattedContent;
					} else {
						// For other content types, convert directly
						processedMsg.content = msg.content;
					}
				}
				
				apiConversationLog.push(processedMsg);
			}
		}
		
		// Build the API parameters
		const apiParams: any = {
			input: apiConversationLog,
			model: model
		};

		// Add temperature only for OpenAI models that support it
		if (request.temperature !== undefined && this.isOpenAiTemperatureSupported(model)) {
			apiParams.temperature = request.temperature;
		}

		// Add previous_response_id for reasoning models to enable response chaining
		// BUT ONLY if this is NOT the first message in a conversation
		// This prevents response_id carryover between different conversations
		if (request.previous_response_id && this.isReasoningModel(model) && !this.isFirstMessageInConversation(conversation)) {
			apiParams.previous_response_id = request.previous_response_id;
		}
		
		// Add tools if needed
		const tools = this.getApiTools(conversation, symbolsNote, 
			isConversationNameRequest,
			'openai',  // Provider for OpenAI calls
			webSearchEnabled);
			
		if (tools.length > 0) {
			apiParams.tools = tools;
			
			// Enable parallel tool calling
			const enableParallelCalls = true;
			apiParams.parallel_tool_calls = enableParallelCalls;
		}        
		
		// Set reasoning and verbosity for specific models
		if (model === 'gpt-5-mini') {
			apiParams.reasoning = { effort: 'medium' };
			apiParams.text = { verbosity: 'medium' };
		}

		return apiParams;
	}

	/**
	 * Build Anthropic request parameters
	 */
	private async buildAnthropicRequestParams(conversation: ConversationMessage[], model: string, 
											 request: any, symbolsNote: string | null,
											 webSearchEnabled: boolean): Promise<any> {
		// Check if this is a naming request that shouldn't have developer instructions
		const isConversationNameRequest = request.request_type === 'generate_conversation_name';
		const isNamingRequest = isConversationNameRequest;
		
		// Check if this is a summarization request that shouldn't use caching
		const isSummarizationRequest = request.request_type === 'summarize_conversation';
		
		// Build the API parameters
		const apiParams: any = {
			model: model,
			max_tokens: 8192,
			stream: true // Enable streaming
		};
		
		// Add temperature only for OpenAI models that support it
		if (request.temperature !== undefined && this.isOpenAiTemperatureSupported(model)) {
			apiParams.temperature = request.temperature;
		}
		
		// Add system prompt if not a naming request
		if (!isNamingRequest) {
			let systemPrompt = await this.loadDeveloperInstructions(model);
			
			// Add previous summary to system prompt if available
			if (request.previous_summary) {
				systemPrompt += `\n\n<previous_conversation_summary>\n(Query ${request.previous_summary.query_number} - ${request.previous_summary.timestamp}):\n\n${request.previous_summary.summary_text}\n</previous_conversation_summary>\n`;
			}
			
			// For Anthropic models, add cache control to enable prompt caching after system prompt
			// SKIP caching for summarization requests
			if (model && model.startsWith('claude-') && !isSummarizationRequest) {
				// Create system prompt array with cache control for Anthropic caching
				const systemArray = [{
					type: 'text',
					text: systemPrompt,
					cache_control: { type: 'ephemeral' }
				}];
				apiParams.system = systemArray;
			} else {
				apiParams.system = systemPrompt;
			}
		}
		
		// Convert conversation to Anthropic messages format
		const messages: any[] = [];
		
		// Find the LAST original_query message index for caching
		let lastOriginalQueryIndex = -1;
		if (!isSummarizationRequest) {  // Skip caching logic for summarization requests
			for (let i = conversation.length - 1; i >= 0; i--) {
				const msg = conversation[i];
				if (msg.role === 'user' && msg.original_query === true) {
					lastOriginalQueryIndex = i;
					break;
				}
			}
		}
		
		for (let msgIndex = 0; msgIndex < conversation.length; msgIndex++) {
			const msg = conversation[msgIndex];
			// Handle function_call_output messages FIRST, before role check
			// These messages don't have a role but need to be converted to tool_result
			if (msg.type === 'function_call_output') {
				const callId = msg.call_id!;
				let output = msg.output || '';
				
				const message = {
					role: 'user',
					content: [{
						type: 'tool_result',
						tool_use_id: callId,
						content: output
					}]
				};
				
				messages.push(message);
				continue;
			}
			
			// Now check for role - skip messages without role (except function_call_output which we handled above)
			if (!msg.role) {
				continue;
			}
			
			// Handle assistant messages with function_call - convert to tool_use format for Anthropic
			if (msg.role === 'assistant' && msg.function_call) {
				const functionCall = msg.function_call;
				
				const toolName = functionCall.name;
				const toolCallId = functionCall.call_id!;
				
				const toolUse: any = {
					type: 'tool_use',
					id: toolCallId,
					name: toolName
				};
				
				// Parse arguments if present
				if (functionCall.arguments) {
					try {
						const args = JSON.parse(functionCall.arguments);
						toolUse.input = args;
					} catch (e) {
						// If parsing fails, use empty object
						toolUse.input = {};
					}
				} else {
					toolUse.input = {};
				}
				
				const message = {
					role: 'assistant',
					content: [toolUse]
				};
				
				messages.push(message);
				continue;
			}
			
			if (msg.role && msg.content !== undefined) {
				const message: any = {
					role: msg.role
				};
				
				// Check if this is the LAST original_query message that should be cached
				const isLastOriginalQuery = (msgIndex === lastOriginalQueryIndex) && msg.role === 'user';
				
				// Also check if this is the last user message in conversation (important for caching)
				const isLastUserMessage = (msgIndex === conversation.length - 1) && msg.role === 'user';
				
				// Only cache: last original_query message OR last user message (if not already the last original_query)
				// SKIP all caching for summarization requests
				const shouldCache = !isSummarizationRequest && (isLastOriginalQuery || (isLastUserMessage && !isLastOriginalQuery));
				
				if (typeof msg.content === 'string') {
					let textContent = msg.content;
					
					// Check if message was cancelled and append marker
					if (msg.cancelled) {
						textContent += '... (User cancelled)';
					}
					
					if (shouldCache) {
						// Convert to array format with cache control for original_query messages
						message.content = [{
							type: 'text',
							text: textContent,
							cache_control: { type: 'ephemeral' }
						}];
					} else {
						message.content = textContent;
					}
				} else {
					// Convert content array to Anthropic format
					const apiMsg = msg as ApiMessage;
					if (Array.isArray(apiMsg.content)) {
						const contentList: any[] = [];
						for (const item of apiMsg.content) {
							if (typeof item === 'object' && item !== null && 'type' in item) {
								const itemType = item.type;
								if (itemType === 'input_text' || itemType === 'text') {
									let textContent = (item as any).text;
																											
									// Check if message was cancelled and append marker to text content
									if (msg.cancelled) {
										textContent += '... (User cancelled)';
									}
									
									contentList.push({
										type: 'text',
										text: textContent
									});
								} else if (itemType === 'input_image') {
									// Handle image content conversion from OpenAI format to Anthropic format
									const imageItem = item as any;
									if (imageItem.image_url) {
										const imageUrl = imageItem.image_url;
										
										// Parse the data URL to extract base64 data and media type
										if (imageUrl && imageUrl.startsWith('data:')) {
											try {
												const commaIndex = imageUrl.indexOf(',');
												if (commaIndex !== -1) {
													const metadata = imageUrl.substring(5, commaIndex); // Skip "data:"
													const base64Data = imageUrl.substring(commaIndex + 1);
													
													// Extract media type
													const mediaType = metadata.split(';')[0];
													
													// Validate media type for Anthropic (same as AnthropicProxyService validation)
													if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
														// Create Anthropic image block
														contentList.push({
															type: 'image',
															source: {
																type: 'base64',
																media_type: mediaType,
																data: base64Data
															}
														});
													} else {
														throw new Error(`Unsupported image media type for Anthropic: ${mediaType}. Supported types: image/jpeg, image/png, image/gif, image/webp`);
													}
												}
											} catch (e) {
												throw new Error(`Failed to parse image for Anthropic: ${e}`);
											}
										} else {
											throw new Error(`Invalid image format for Anthropic: ${imageUrl}`);
										}
									}
								}
							}
						}
						
						// Apply cache control to the last text block if this is an original_query
						// SKIP caching for summarization requests
						if (shouldCache && contentList.length > 0) {
							// Find the last text block and add cache control
							for (let i = contentList.length - 1; i >= 0; i--) {
								const block = contentList[i];
								if (block.type === 'text') {
									block.cache_control = { type: 'ephemeral' };
									break;
								}
							}
						}
						
						message.content = contentList;
					} else {
						message.content = String(msg.content);
					}
				}
				messages.push(message);
			}
		}
		
		apiParams.messages = messages;
		
		// Add tools if not a naming request
		if (!isNamingRequest) {			
			const tools = this.getApiTools(
				conversation, 
				symbolsNote, 
				isConversationNameRequest,
				'anthropic',
				webSearchEnabled
			);
			
			// Convert tools to Anthropic format
			const toolsList: any[] = [];
			for (const tool of tools) {
				// Special handling for built-in Anthropic tools (web_search, file_search, etc.)
				if (tool.type) {
					const toolType = tool.type;
					if (['web_search_20250305', 'web_search', 'file_search'].includes(toolType)) {
						// Pass through built-in tools as-is without conversion
						toolsList.push(tool);
						continue;
					}
				}
				
				// Convert OpenAI tool format to Anthropic format for custom function tools
				const anthropicTool: any = {};
				if (tool.name) {
					anthropicTool.name = tool.name;
				}
				if (tool.description) {
					anthropicTool.description = tool.description;
				}
				
				// Convert 'parameters' to 'input_schema' and remove OpenAI-specific fields
				if (tool.parameters) {
					const inputSchema: any = {};
					
					if (tool.parameters.type) {
						inputSchema.type = tool.parameters.type;
					}
					if (tool.parameters.properties) {
						inputSchema.properties = tool.parameters.properties;
					}
					if (tool.parameters.required) {
						inputSchema.required = tool.parameters.required;
					}
					// Skip OpenAI-specific fields like 'additionalProperties', 'strict'
					
					anthropicTool.input_schema = inputSchema;
				}
				
				toolsList.push(anthropicTool);
			}
			
			if (toolsList.length > 0) {
				apiParams.tools = toolsList;
			}
		}
				
		return apiParams;
	}

	/**
	 * Main streaming method - entry point for all API calls
	 */
	async makeAiApiCallStreaming(request: any, request_id: string, outputStream: any,
								webSearchEnabled: boolean): Promise<void> {
		// Validate required fields using helper method
		const validationError = this.validateBasicRequest(request.conversation || []);
		if (validationError) {
			this.sendSseEvent(outputStream, request_id, 'error', validationError, undefined, true);
			return;
		}
			
			const conversation = request.conversation || [];
			const provider = request.provider;
			const model = request.model;
			
			// Check if we need to send synthetic end_turn instead of making API call
			if (this.needsEndTurnReminder(conversation)) {
				// Send synthetic end_turn completion event directly
				const event = {
					request_id: request_id,
					end_turn: true,
					isComplete: true
				};
				
				outputStream.write(`data: ${JSON.stringify(event)}\n\n`);
				return;
			}
			
			
			// Use the provider from the request (determined by workbench settings service)
			const actualProvider = provider;
			
			// Get the symbols note that was calculated by R and passed to us
			const symbolsNote = request.symbols_note;
						
			// Check if there are attached images in symbols_note and prepend them as context messages
			if (symbolsNote?.attached_images?.length > 0) {
				this.addImageContextMessages(conversation, symbolsNote.attached_images);
			}
			
			// Add user rules as a separate user message if any are provided
			if (request.user_rules?.length > 0) {
				this.addUserRulesMessage(conversation, request.user_rules);
			}
			
			// Convert structured symbolsNote to JSON string for downstream methods
			let symbolsNoteString: string | null = null;
			if (symbolsNote) {
				symbolsNoteString = JSON.stringify(symbolsNote);
				this.modifyLastUserMessageWithSymbolsNote(conversation, symbolsNoteString);
			}
			
			// Add user info to the beginning of the original query message for better caching
			this.addUserInfoToOriginalQuery(conversation, 
				request.user_workspace_path, request.user_shell, request.project_layout);
			
			// Use conversation as-is since we no longer process edit_file
			const updatedConversation = conversation;
			
			// Route to appropriate provider
			if (provider === 'openai') {
				await this.callOpenAIStreaming(updatedConversation, model, request, symbolsNoteString, request_id, outputStream, webSearchEnabled);
			} else if (provider === 'anthropic') {
				await this.callAnthropicStreaming(updatedConversation, model, request, symbolsNoteString, request_id, outputStream, webSearchEnabled);
			} else {
				this.sendSseEvent(outputStream, request_id, 'error', `Unsupported provider: ${provider} (actualProvider: ${actualProvider}). Supported providers: openai, anthropic`, undefined, true);
			}
	}

	/**
	 * Streaming version of callOpenAI
	 */
	private async callOpenAIStreaming(conversation: ConversationMessage[], model: string, request: any, 
									 symbolsNote: string | null, request_id: string, outputStream: any,
									 webSearchEnabled: boolean): Promise<void> {
			// Create request body in the same format as the non-streaming version
			const apiParams = await this.buildOpenAIRequestParams(conversation, model, request, symbolsNote, webSearchEnabled);
			
			// Add BYOK API key if provided in the original request
			if (request.byok_keys?.openai) {
				apiParams.byok_keys = request.byok_keys;
			}
			
			// Call OpenAI proxy service for streaming
			await this.openAiProxyService.processStreamingResponsesWithCallback(
				JSON.stringify(apiParams),
				null, // user
				{}, // originalHeaders
				request_id,
				outputStream,
				request // originalRequest
			);
	}

	/**
	 * Streaming version of callAnthropic
	 */
	private async callAnthropicStreaming(conversation: ConversationMessage[], model: string, request: any, 
										symbolsNote: string | null, request_id: string, outputStream: any,
										webSearchEnabled: boolean): Promise<void> {
		try {
			// Build Anthropic request parameters
			const apiParams = await this.buildAnthropicRequestParams(conversation, model, request, symbolsNote, webSearchEnabled);
			
			// Add BYOK API key if provided in the original request
			if (request.byok_keys?.anthropic) {
				apiParams.byok_keys = request.byok_keys;
			}
			
			// Call Anthropic proxy service for streaming - pass object, not JSON string
			// Call Anthropic proxy service for streaming - matches rao-backend SessionAiApiService.callAnthropicStreaming
			await this.anthropicProxyService.processStreamingMessagesWithCallback(
				JSON.stringify(apiParams),
				null, // user
				{}, // originalHeaders
				request_id,
				outputStream,
				request // originalRequest
			);
		} catch (e) {
			this.sendSseEvent(outputStream, request_id, 'error', `Error calling Anthropic: ${e}`, undefined, true);
		}
	}

    /**
	 * Generate conversation name
	 */
	async generateConversationName(request: any): Promise<any> {
		try {
			const conversation = request.conversation;
			
			// Validate conversation
			if (!conversation || conversation.length === 0) {
				return { error: "Conversation is required for conversation name generation" };
			}
			
			const conversationNamePrompt = "Based on our conversation so far, suggest a short, descriptive name for this conversation (4-6 words maximum). Write absolutely nothing else.";
			
			// Create a simple conversation with the conversation name prompt
			const nameConversation = [...conversation];
			const nameMessage: ConversationMessage = {
				id: Date.now(),
				timestamp: new Date().toISOString(),
				role: 'user',
				content: conversationNamePrompt
			};
			nameConversation.push(nameMessage);
			
			// Use the provider from the request (determined by workbench settings service) and use cheap model for cost optimization
			const actualProvider = request.provider;
			const cheapModel = this.selectCheapModel(actualProvider);
			
			// Create a new request for conversation name generation without tools
			const nameRequest: any = {
				request_type: 'generate_conversation_name',
				conversation: nameConversation,
				provider: actualProvider,
				model: cheapModel,
				request_id: request.request_id || `name_${Date.now()}`
			};
			
			// Add authentication
			if (request.byok_keys) {
				nameRequest.byok_keys = request.byok_keys;
			} else {
				return { error: "No authentication method available" };
			}
			
			// Use ByteArrayOutputStream equivalent to capture streaming output
			let streamOutput = '';
			const outputStream = {
				write: (data: string) => {
					streamOutput += data;
				}
			};
			
			// Call the streaming method
			await this.makeAiApiCallStreaming(nameRequest, nameRequest.request_id, outputStream, false);
			
			// Parse the output to extract the final result
			const lines = streamOutput.split('\n');
			
			// Find the final completion event
			for (let i = lines.length - 1; i >= 0; i--) {
				const line = lines[i];
				if (line.startsWith('data: ')) {
					try {
						const jsonData = line.substring(6); // Remove "data: "
						const eventData = JSON.parse(jsonData);
						
						if (eventData.response && eventData.isComplete) {
							const generatedName = eventData.response.trim();
							return { conversationName: generatedName };
						}
					} catch (e) {
						// Continue searching for valid JSON
					}
				}
			}
			
			// Fallback if no valid response found
			return { conversationName: "Untitled Conversation" };
			
		} catch (e) {
			return { error: `Error in generate_conversation_name: ${e}` };
		}
	}

	/**
	 * Process conversation summarization request
	 */
	async processSummarizationRequest(request: any, request_id: string, outputStream: any): Promise<void> {		
		// Use the model and provider from the request
		const model = request.model;
		const provider = request.provider;
		
		// Get target query number from request
		const targetQueryNumber = request.target_query_number;
		if (targetQueryNumber === undefined || targetQueryNumber === null) {
			this.sendSseEvent(outputStream, request_id, 'error', 'target_query_number is required for summarization', undefined, true);
			return;
		}
				
		const queryNConversation = request.conversation;
		
		if (!queryNConversation || queryNConversation.length === 0) {
			this.sendSseEvent(outputStream, request_id, 'error', `No conversation content found for target query ${targetQueryNumber}`, undefined, true);
			return;
		}
		
		// Create summarization messages
		const messages: any[] = [];
		
		// Add system message with summarization instructions
		const systemMessage = {
			role: 'system',
			content: 
				"You are a conversation summarizer for an AI coding assistant in RStudio. Your job is to analyze the provided conversation and create a detailed summary to inform future actions. In future steps, the assistant will have access to the user's new query (query N+1), the user's most recent query and its responses (query N), and this summary for everything before (queries 1 to N-1). Nothing else about these messages besides your summary will be provided, so you should be concise but comprehensive. If part of what you are summarizing is itself a summary, you must also summarize that since your summary of the previous summary will be the only record of the past messages.\n\n" +
				"Focus on:\n" +
				"- What the user's query was\n" +
				"- What tasks were completed successfully\n" +
				"- What files were created, modified, or analyzed\n" +
				"- What bugs or issues were resolved\n" +
				"- What problems remain unresolved\n" +
				"- Key decisions or insights made during the conversation\n" +
				"- Important context for continuing the work\n\n" +
				"Write a comprehensive summary that will help the assistant understand what happened in the conversation up through the messages you have access to. " +
				"You should structure your response as JSON with fields like 'summary_text', 'completed_tasks', 'open_issues', and 'file_changes' so that you can add to it in the future."
		};
		messages.push(systemMessage);
		
		// Build user message content with previous summary (if available) + query n
		const userMessage: any = {
			role: 'user'
		};
		
		// Format the conversation for summarization
		let conversationText = '';
		
		// Include previous summary S_{n-1} if available
		if (request.previous_summary) {
			conversationText += `<previous_summary>\n(Query ${request.previous_summary.query_number} - ${request.previous_summary.timestamp}):\n\n${request.previous_summary.summary_text}\n\n</previous_summary>\n\n`;
		}
		
		// Add the query n conversation (already extracted by R)
		conversationText += `<messages_since_summary>\n(Query ${targetQueryNumber}):\n\n`;
		
		for (const msg of queryNConversation) {
			if (msg.role && msg.content) {
				const role = msg.role;
				const content = this.extractTextFromMessage(msg);
				
				// Skip system messages in the summary
				if (role !== 'system' && content && content.trim() !== '') {
					conversationText += `${role.toUpperCase()}: ${content}\n\n`;
				}
			}
		}
		
		// Add summarization instruction as the final message
		conversationText += '</messages_since_summary>\n\n';
		conversationText += `Summarize this conversation for the assistant. Be concise but comprehensive and make sure to also summarize any prior summaries you see. `;
		conversationText += `Your summary should capture everything that happened in query ${targetQueryNumber}`;
		if (request.previous_summary) {
			conversationText += ' while also incorporating the context from the previous summary';
		}
		conversationText += '.\n\n';
		
		userMessage.content = conversationText;
		messages.push(userMessage);
		
		// Build API parameters for the selected provider
		let apiRequest: any;
		
		if (provider === 'openai') {
			// OpenAI format
			apiRequest = {
				model: model,
				input: messages
			};
		} else if (provider === 'anthropic') {
			// Anthropic format - convert messages to Anthropic format
			const anthropicMessages: any[] = [];
			let systemPrompt = '';
			
			for (const msg of messages) {
				if (msg.role === 'system') {
					systemPrompt = msg.content;
				} else if (msg.role === 'user' || msg.role === 'assistant') {
					anthropicMessages.push({
						role: msg.role,
						content: msg.content
					});
				}
			}
			
			apiRequest = {
				model: model,
				max_tokens: 8192,
				stream: true,
				messages: anthropicMessages
			};
			
			if (systemPrompt) {
				apiRequest.system = systemPrompt;
			}
		} else {
			console.error('  - ERROR: Unsupported provider for API request building:', provider);
			this.sendSseEvent(outputStream, request_id, 'error', `Unsupported provider for summarization: ${provider}`, undefined, true);
			return;
		}
		
		try {
			// Add BYOK API key if provided in the original request
			if (request.byok_keys && request.byok_keys[provider]) {
				apiRequest.byok_keys = request.byok_keys;
			}
			
			// Route to the appropriate provider service
			if (provider === 'openai') {
				await this.openAiProxyService.processStreamingResponsesWithCallback(
					JSON.stringify(apiRequest),
					null, // user
					{}, // originalHeaders
					request_id,
					outputStream,
					request // originalRequest
				);
			} else if (provider === 'anthropic') {
				await this.anthropicProxyService.processStreamingMessagesWithCallback(
					JSON.stringify(apiRequest),
					null, // user
					{}, // originalHeaders
					request_id,
					outputStream,
					request // originalRequest
				);
			}
		} catch (e) {
			this.sendSseEvent(outputStream, request_id, 'error', `Failed to generate summary: ${e}`, undefined, true);
		}
	}
    
	/**
	 * Extract text from message content
	 */
	private extractTextFromMessage(message: ConversationMessage): string | null {
		if (!message || !message.content) {
			return null;
		}
		
		if (typeof message.content === 'string') {
			return message.content;
		} else {
			// Cast to ApiMessage to handle array content
			const apiMsg = message as ApiMessage;
			if (Array.isArray(apiMsg.content)) {
				for (const item of apiMsg.content) {
					if (typeof item === 'string') {
						return item;
					} else if (typeof item === 'object' && item !== null && 'text' in item) {
						return (item as any).text;
					}
				}
			}
		}
		return null;
	}

	/**
	 * Main streaming method - entry point for all API calls
	 */
	async processStreamingQuery(
		messages: ConversationMessage[],
		provider: string,
		model: string,
		temperature: number,
		request_id: string,
		contextData: any,
		onData: (data: StreamData) => void,
		onError: (error: Error) => void,
		onComplete: () => void
	): Promise<void> {
		// Validate basic request
		const validationError = this.validateBasicRequest(messages);
		if (validationError) {
			this.streamingService.sendErrorEvent(onData, request_id, validationError);
			onError(new Error(validationError));
			return;
		}

		// Check if we need to send synthetic end_turn instead of making API call
		if (this.needsEndTurnReminder(messages)) {
			// Send synthetic end_turn completion event directly
			onData({
				type: 'end_turn',
				request_id: request_id,
				end_turn: true,
				isComplete: true
			});
			onComplete();
			return;
		}

		// Extract symbols_note and other context from contextData
		const symbols_note = contextData?.symbols_note || null;
		const user_rules = contextData?.user_rules || [];
		const user_workspace_path = contextData?.user_workspace_path || null;
		const user_shell = contextData?.user_shell || null;
		const project_layout = contextData?.project_layout || null;
					
		// Create a full request object similar to makeAiApiCallStreaming
		const fullRequest = {
			conversation: messages,
			provider: provider,
			model: model,
			temperature: temperature,
			request_id: request_id,
			symbols_note: symbols_note,
			user_rules: user_rules,
			user_workspace_path: user_workspace_path,
			user_shell: user_shell,
			project_layout: project_layout,
			byok_keys: contextData?.byok_keys
		};
		
		// Use the full makeAiApiCallStreaming method instead of the simplified proxy calls
		const outputStream = {
			write: (data: string) => {
				// Parse SSE data and convert to StreamData format
				if (data.startsWith('data: ')) {
					try {
						const jsonData = data.substring(6);
						const eventData = JSON.parse(jsonData);
						onData(eventData);
					} catch (e) {
						// Skip malformed JSON
					}
				}
			}
		};
		
		// Call the full processing method with context
		await this.makeAiApiCallStreaming(fullRequest, request_id, outputStream, false);
		
		// Complete the request
		onComplete();
	}
}