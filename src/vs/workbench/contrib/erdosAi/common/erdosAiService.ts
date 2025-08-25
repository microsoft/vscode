/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { Conversation, ConversationInfo, ConversationMessage } from '../browser/conversation/conversationTypes.js';
import { StreamData } from '../browser/api/streamingParser.js';
import { IErdosAiWidgetInfo } from '../browser/widgets/widgetTypes.js';
import { ErdosAiOrchestrator } from '../browser/orchestrator/erdosAiOrchestrator.js';
import { ContextService } from '../browser/context/contextService.js';

export const POISSON_AI_VIEW_ID = 'workbench.panel.erdosAi';

export const IErdosAiService = createDecorator<IErdosAiService>('erdosAiService');

export interface IErdosAiService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when a conversation is created
	 */
	readonly onConversationCreated: Event<Conversation>;

	/**
	 * Event fired when a conversation is loaded/switched
	 */
	readonly onConversationLoaded: Event<Conversation>;

	/**
	 * Event fired when a message is added
	 */
	readonly onMessageAdded: Event<ConversationMessage>;

	/**
	 * Event fired when streaming data is received
	 */
	readonly onStreamingData: Event<StreamData>;

	/**
	 * Event fired when streaming completes
	 */
	readonly onStreamingComplete: Event<void>;

	/**
	 * Event fired when streaming error occurs (for in-conversation display)
	 */
	readonly onStreamingError: Event<{ errorId: string; message: string }>;

	/**
	 * Event fired when thinking message should be updated
	 */
	readonly onThinkingMessage: Event<{ message: string; hideCancel?: boolean }>;

	/**
	 * Event fired when orchestrator processing state changes
	 */
	readonly onOrchestratorStateChange: Event<{isProcessing: boolean}>;

	/**
	 * Event fired when conversation history should be shown
	 */
	readonly onShowConversationHistory: Event<void>;

	/**
	 * Event fired when settings should be shown
	 */
	readonly onShowSettings: Event<void>;

	/**
	 */
	readonly onFunctionCallDisplayMessage: Event<{ id: number; content: string; timestamp: string }>;

	/**
	 * Event fired when a widget is requested
	 */
	readonly onWidgetRequested: Event<IErdosAiWidgetInfo>;

	/**
	 * Event fired when widget content is being streamed
	 */
	readonly onWidgetStreamingUpdate: Event<{ 
		messageId: number; 
		delta: string; 
		isComplete: boolean; 
		replaceContent?: boolean;
		isSearchReplace?: boolean;
		field?: string;
		filename?: string;
		requestId?: string;
		diffData?: {
			diff: any[];
			added: number;
			deleted: number;
			clean_filename?: string;
		};
	}>;

	/**
	 * The orchestrator that manages the flat architecture conversation flow
	 */
	readonly orchestrator: ErdosAiOrchestrator;

	/**
	 * Create a new conversation
	 */
	newConversation(name?: string): Promise<Conversation>;

	/**
	 * Send a message in the current conversation
	 */
	sendMessage(content: string): Promise<void>;

	/**
	 * Load an existing conversation
	 */
	loadConversation(id: number): Promise<Conversation | null>;

	/**
	 * Get diff data for a specific message ID
	 */
	getDiffDataForMessage(messageId: string): Promise<any>;

	/**
	 * Cancel current streaming request
	 */
	cancelStreaming(): void;

	/**
	 * Show thinking message
	 */
	showThinkingMessage(message?: string): void;

	/**
	 * Hide thinking message
	 */
	hideThinkingMessage(): void;

	/**
	 * Get the current conversation
	 */
	getCurrentConversation(): Conversation | null;

	/**
	 * Get all conversation info
	 */
	listConversations(): Promise<ConversationInfo[]>;

	/**
	 * Delete a conversation
	 */
	deleteConversation(id: number): Promise<boolean>;

	/**
	 * Delete all conversations
	 */
	deleteAllConversations(): Promise<boolean>;

	/**
	 * Rename a conversation
	 */
	renameConversation(id: number, name: string): Promise<boolean>;

	/**
	 * Generate conversation name using AI
	 */
	generateConversationName(conversationId: number): Promise<string | null>;

	/**
	 * Check if conversation should get an AI-generated name
	 */
	shouldPromptForName(conversationId: number): Promise<boolean>;

	/**
	 * Check backend health
	 */
	checkBackendHealth(): Promise<boolean>;

	/**
	 * Get backend environment info
	 */
	getBackendEnvironment(): Promise<string>;

	/**
	 * Save API key
	 */
	saveApiKey(provider: string, key: string): Promise<{ success: boolean; message: string }>;

	/**
	 * Delete API key
	 */
	deleteApiKey(provider: string): Promise<{ success: boolean; message: string }>;

	/**
	 * Check if API key is configured
	 */
	getApiKeyStatus(): Promise<boolean>;

	/**
	 * Start OAuth authentication flow
	 */
	startOAuthFlow(provider?: string): Promise<string>;

	/**
	 * Get user profile information
	 */
	getUserProfile(): Promise<any>;

	/**
	 * Get subscription status
	 */
	getSubscriptionStatus(): Promise<any>;

	/**
	 * Check if user is fully authenticated (has both API key and profile)
	 */
	isUserAuthenticated(): Promise<boolean>;

	/**
	 * Sign out user (clear API key and profile)
	 */
	signOut(): Promise<void>;

	// Model Settings
	/**
	 * Get available models
	 */
	getAvailableModels(): Promise<string[]>;

	/**
	 * Get selected model
	 */
	getSelectedModel(): Promise<string | null>;

	/**
	 * Set selected model
	 */
	setSelectedModel(model: string): Promise<boolean>;

	/**
	 * Get temperature setting
	 */
	getTemperature(): Promise<number>;

	/**
	 * Set temperature (0.0 to 1.0)
	 */
	setTemperature(temperature: number): Promise<boolean>;

	// Working Directory
	/**
	 * Get current working directory
	 */
	getWorkingDirectory(): Promise<string>;

	/**
	 * Set working directory
	 */
	setWorkingDirectory(path: string): Promise<boolean>;

	// Context Management
	/**
	 * Get the context service for managing context attachments
	 */
	getContextService(): ContextService;

	// Security Settings
	/**
	 * Check if this is a first-time user (no settings configured yet)
	 */
	isFirstTimeUser(): Promise<boolean>;

	/**
	 * Get security mode
	 */
	getSecurityMode(): Promise<'secure' | 'improve'>;

	/**
	 * Set security mode
	 */
	setSecurityMode(mode: 'secure' | 'improve'): Promise<boolean>;

	/**
	 * Get web search enabled status
	 */
	getWebSearchEnabled(): Promise<boolean>;

	/**
	 * Set web search enabled
	 */
	setWebSearchEnabled(enabled: boolean): Promise<boolean>;

	// User Rules
	/**
	 * Get user rules
	 */
	getUserRules(): Promise<string[]>;

	/**
	 * Add user rule
	 */
	addUserRule(rule: string): Promise<boolean>;

	/**
	 * Edit user rule
	 */
	editUserRule(index: number, rule: string): Promise<boolean>;

	/**
	 * Delete user rule
	 */
	deleteUserRule(index: number): Promise<boolean>;

	// Automation Settings
	/**
	 * Get auto-accept edits setting
	 */
	getAutoAcceptEdits(): Promise<boolean>;

	/**
	 * Set auto-accept edits
	 */
	setAutoAcceptEdits(enabled: boolean): Promise<boolean>;

	/**
	 * Set auto-delete files
	 */
	setAutoDeleteFiles(enabled: boolean): Promise<boolean>;
	
	/**
	 * Get auto-accept console setting
	 */
	getAutoAcceptConsole(): Promise<boolean>;
	
	/**
	 * Set auto-accept console
	 */
	setAutoAcceptConsole(enabled: boolean): Promise<boolean>;
	
	/**
	 * Get auto-run files setting
	 */
	getAutoRunFiles(): Promise<boolean>;
	
	/**
	 * Set auto-run files
	 */
	setAutoRunFiles(enabled: boolean): Promise<boolean>;
	
	/**
	 * Get auto-delete files setting
	 */
	getAutoDeleteFiles(): Promise<boolean>;
	
	/**
	 * Get auto-run files allow anything setting
	 */
	getAutoRunFilesAllowAnything(): Promise<boolean>;
	
	/**
	 * Set auto-run files allow anything
	 */
	setAutoRunFilesAllowAnything(enabled: boolean): Promise<boolean>;
	
	/**
	 * Get auto-delete files allow anything setting
	 */
	getAutoDeleteFilesAllowAnything(): Promise<boolean>;
	
	/**
	 * Set auto-delete files allow anything
	 */
	setAutoDeleteFilesAllowAnything(enabled: boolean): Promise<boolean>;
	
	/**
	 * Get run files automation list
	 */
	getRunFilesAutomationList(): Promise<string[]>;
	
	/**
	 * Set run files automation list
	 */
	setRunFilesAutomationList(files: string[]): Promise<boolean>;
	
	/**
	 * Get delete files automation list
	 */
	getDeleteFilesAutomationList(): Promise<string[]>;
	
	/**
	 * Set delete files automation list
	 */
	setDeleteFilesAutomationList(files: string[]): Promise<boolean>;

	// Document Operations (Phase 4)

	/**
	 * Get all currently open documents
	 */
	getAllOpenDocuments(includeContent?: boolean): Promise<any[]>;

	/**
	 * Get the currently active document
	 */
	getActiveDocument(): Promise<any>;

	/**
	 * Search for text in all open documents
	 */
	matchTextInOpenDocuments(searchText: string, options?: any): Promise<any[]>;

	/**
	 * Update the content of an open document
	 */
	updateOpenDocumentContent(documentIdOrPath: string, newContent: string, markClean?: boolean): Promise<boolean>;

	/**
	 * Get effective file content (handles both saved and unsaved files)
	 */
	getEffectiveFileContent(filePath: string, startLine?: number, endLine?: number): Promise<string | null>;

	/**
	 * Check if a file is currently open in the editor
	 */
	checkIfFileOpenInEditor(filePath: string): boolean;

	// Context Management (Phase 4)

	/**
	 * Add a file to the AI context
	 */
	addContextFile(path: string): Promise<boolean>;

	/**
	 * Add a directory to the AI context
	 */
	addContextDirectory(path: string, recursive?: boolean): Promise<boolean>;

	/**
	 * Add specific lines from a file to context
	 */
	addContextLines(path: string, startLine: number, endLine: number): Promise<boolean>;

	/**
	 * Add documentation to context
	 */
	addContextDocumentation(topic: string, content: string): boolean;

	/**
	 * Add conversation reference to context
	 */
	addContextConversation(conversationId: number, name?: string): boolean;

	/**
	 * Get all context data for AI request
	 */
	getContextForRequest(): Promise<any>;

	/**
	 * Remove an item from context
	 */
	removeContextItem(pathOrId: string): boolean;

	/**
	 * Clear all context items
	 */
	clearContext(): void;

	/**
	 * Get all context items
	 */
	getContextItems(): any[];



	// Function Extraction Methods (Missing from Phase 4)







	/**
	 * Get service instance by name (for accessing injected services)
	 */
	getService(serviceName: string): any;

	// File Browsing Methods (Missing from Phase 4)

	/**
	 * Browse for a directory
	 */
	browseDirectory(): Promise<any>;

	/**
	 * Browse for a file
	 */
	browseForFile(): Promise<any>;

	/**
	 * List files in a directory
	 */
	listDirectory(directoryPath: string): Promise<any[]>;

	/**
	 * Get current workspace directory
	 */
	getCurrentWorkspaceDirectory(): string | null;

	/**
	 * Check if a path exists
	 */
	pathExists(path: string): Promise<boolean>;

	/**
	 * Get file information
	 */
	getFileInfo(path: string): Promise<any>;

	/**
	 * Get open document content by path
	 */
	getOpenDocumentContent(filePath: string): Promise<string | null>;

	/**
	 * Check if pasted text matches content in open documents using RAO's algorithm
	 */
	checkPastedTextInOpenDocuments(pastedText: string): Promise<{ filePath: string; startLine: number; endLine: number } | null>;

	/**
	 * Get markdown renderer instance (for UI components)
	 */
	getMarkdownRenderer(): any;

	/**
	 * Widget button action events
	 */
	readonly onWidgetButtonAction: Event<{ messageId: number; action: string }>;

	/**
	 * Accept console command - returns status to orchestrator like Rao's pattern
	 */
	acceptConsoleCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}>;

	/**
	 * Cancel console command - returns status to orchestrator
	 */
	cancelConsoleCommand(messageId: number, requestId: string): Promise<{status: string, data: any}>;

	/**
	 * Accept terminal command - returns status to orchestrator like Rao's pattern
	 */
	acceptTerminalCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}>;

	/**
	 * Cancel terminal command - returns status to orchestrator
	 */
	cancelTerminalCommand(messageId: number, requestId: string): Promise<{status: string, data: any}>;



	/**
	 * Accept search replace command - mirrors RAO's acceptSearchReplaceCommand
	 */
	acceptSearchReplaceCommand(messageId: number, content: string, requestId: string): Promise<{status: string, data: any}>;

	/**
	 * Cancel search replace command - mirrors RAO's cancelSearchReplaceCommand
	 */
	cancelSearchReplaceCommand(messageId: number, requestId: string): Promise<{status: string, data: any}>;

	/**
	 * Get the current active request ID for widget operations
	 */
	getCurrentRequestId(): string | undefined;

	/**
	 * Suggest help topics based on a query string from both R and Python runtimes
	 */
	suggestTopics(query: string): Promise<Array<{name: string, topic: string, language: 'R' | 'Python'}>>;

	/**
	 * Get help content as markdown for AI context from both R and Python runtimes
	 */
	getHelpAsMarkdown(topic: string, packageName?: string, language?: 'R' | 'Python'): Promise<string>;

	/**
	 * Get the image attachment service for the current conversation
	 */
	getImageAttachmentService(): any; // Use any for now to avoid circular dependency

	/**
	 * Revert conversation to a specific user message, removing all messages after it
	 * Similar to rao's revert functionality
	 */
	revertToMessage(messageId: number): Promise<{status: string, data: any}>;

	/**
	 * Set file highlighting enabled/disabled for the current conversation
	 * Similar to Rao's highlighting toggle functionality
	 */
	setFileHighlightingEnabled(conversationId: number, enabled: boolean): void;

	/**
	 * Check if file highlighting is enabled for the current conversation
	 */
	isFileHighlightingEnabled(conversationId: number): boolean;

	/**
	 * Extract file content for widget display, handling .ipynb conversion
	 */
	extractFileContentForWidget(filename: string, startLine?: number, endLine?: number): Promise<string>;

	/**
	 * Show conversation history dialog
	 */
	showConversationHistory(): Promise<void>;

	/**
	 * Show settings panel
	 */
	showSettings(): Promise<void>;
}
