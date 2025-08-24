/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { URI } from '../../../../../base/common/uri.js';
import { Event, Emitter } from '../../../../../base/common/event.js';

import { ILogService } from '../../../../../platform/log/common/log.js';
import { ConversationSummarization } from '../conversation/conversationSummarization.js';
import { ConversationPaths } from '../conversation/conversationTypes.js';
import { IErdosAiService } from '../../common/erdosAiService.js';
import { CommonUtils } from '../utils/commonUtils.js';

/**
 * Interface for context items stored in the context system
 */
export interface IContextItem {
	/** Unique identifier for the item */
	id: string;
	/** Display name shown to user */
	name: string;
	/** Type of context item */
	type: 'file' | 'directory' | 'chat' | 'docs';
	/** File path (for file/directory items) */
	path?: string;
	/** Line range for partial file context */
	startLine?: number;
	endLine?: number;
	/** Conversation ID (for chat items) */
	conversationId?: number;
	/** Help topic (for docs items) */
	topic?: string;
	/** Language for help documentation (R or Python) */
	language?: 'R' | 'Python';
	/** Timestamp when added */
	timestamp: Date;
}

/**
 * Data structure sent to rao-backend for direct_context
 */
export interface IDirectContextItem {
	type: 'file' | 'directory' | 'chat' | 'docs';
	name: string;
	path?: string;
	content?: string | string[];
	start_line?: number;
	end_line?: number;

	// For chat context
	id?: string;
	summary?: string;
	// For docs context  
	topic?: string;
	language?: 'R' | 'Python';
	markdown?: string;
}

/**
 * Service for managing context attachments in Erdos AI
 * Replicates the exact behavior of RAO's context system
 */
export class ContextService extends Disposable {
	private readonly _onDidChangeContext = this._register(new Emitter<IContextItem[]>());
	public readonly onDidChangeContext: Event<IContextItem[]> = this._onDidChangeContext.event;

	private _contextItems: IContextItem[] = [];

	constructor(
		private readonly fileService: IFileService,
		private readonly logService: ILogService,
		private readonly conversationSummarization?: ConversationSummarization,
		private readonly erdosAiService?: IErdosAiService
	) {
		super();
	}

	/**
	 * Get all current context items
	 */
	getContextItems(): IContextItem[] {
		return [...this._contextItems];
	}

	/**
	 * Add a file or directory to context
	 */
	async addFileContext(uri: URI, startLine?: number, endLine?: number): Promise<boolean> {
		const path = uri.fsPath;

		
		// Check for exact duplicate
		const existingItem = this._contextItems.find(item => 
			item.path === path && 
			item.startLine === startLine && 
			item.endLine === endLine
		);
		
		if (existingItem) {

			return true; // Already exists
		}

		try {
			// Check if it's a directory
			const stat = await this.fileService.stat(uri);
			const isDirectory = stat.isDirectory;
			
			// Generate display name
			let displayName: string;
			if (startLine !== undefined && endLine !== undefined) {
				const fileName = CommonUtils.getBasename(uri.path) || 'unknown';
				displayName = startLine === endLine 
					? `${fileName} (${startLine})`
					: `${fileName} (${startLine}-${endLine})`;
			} else {
				displayName = this.getUniqueDisplayName(path);
			}

			const newItem: IContextItem = {
				id: this.generateId(),
				name: displayName,
				type: isDirectory ? 'directory' : 'file',
				path: path,
				startLine: startLine,
				endLine: endLine,
				timestamp: new Date()
			};

			this._contextItems.push(newItem);
			
			this._onDidChangeContext.fire(this.getContextItems());
			return true;
		} catch (error) {

			this.logService.error('Failed to add file context:', error);
			return false;
		}
	}

	/**
	 * Add a chat conversation to context
	 */
	addChatContext(conversationId: number, name?: string): boolean {
		// Check for duplicate
		const existingItem = this._contextItems.find(item => 
			item.type === 'chat' && item.conversationId === conversationId
		);
		
		if (existingItem) {
			return true; // Already exists
		}

		const displayName = name || `Conversation ${conversationId}`;
		
		const newItem: IContextItem = {
			id: this.generateId(),
			name: displayName,
			type: 'chat',
			conversationId: conversationId,
			timestamp: new Date()
		};

		this._contextItems.push(newItem);
		this._onDidChangeContext.fire(this.getContextItems());
		return true;
	}

	/**
	 * Add documentation to context
	 */
	addDocsContext(topic: string, name?: string, language?: 'R' | 'Python'): boolean {
		if (!topic || topic.trim().length === 0) {
			return false;
		}

		// Check for duplicate (same topic and language)
		const existingItem = this._contextItems.find(item => 
			item.type === 'docs' && item.topic === topic && item.language === language
		);
		
		if (existingItem) {
			return true; // Already exists
		}

		const displayName = name || topic;
		
		const newItem: IContextItem = {
			id: this.generateId(),
			name: displayName,
			type: 'docs',
			topic: topic,
			language: language,
			timestamp: new Date()
		};

		this._contextItems.push(newItem);
		this._onDidChangeContext.fire(this.getContextItems());
		return true;
	}

	/**
	 * Remove a context item by ID
	 */
	removeContextItem(id: string): boolean {
		const index = this._contextItems.findIndex(item => item.id === id);
		if (index !== -1) {
			this._contextItems.splice(index, 1);
			this._onDidChangeContext.fire(this.getContextItems());
			return true;
		}
		return false;
	}

	/**
	 * Clear all context items
	 */
	clearContextItems(): void {
		this._contextItems = [];
		this._onDidChangeContext.fire(this.getContextItems());
	}

	/**
	 * Generate direct context data for rao-backend API calls
	 * This replicates the exact format from RAO's check_message_for_symbols function
	 */
	async generateDirectContextData(): Promise<IDirectContextItem[]> {
		const directContext: IDirectContextItem[] = [];

		for (const item of this._contextItems) {
			try {
				if (item.type === 'file' || item.type === 'directory') {
					if (!item.path) continue;

					const uri = URI.file(item.path);
					
					if (item.type === 'directory') {
						// For directories, list content only (no symbol extraction)
						try {
							const dirStat = await this.fileService.resolve(uri);
							const content = dirStat.children?.map(child => child.name) || [];

							directContext.push({
								type: 'directory',
								name: item.name,
								path: item.path,
								content: content
							});
						} catch (error) {
							this.logService.warn('Failed to read directory:', item.path, error);
						}
					} else {
						// For files
						if (item.startLine !== undefined && item.endLine !== undefined) {
							// File with line range - use ErdosAiService for .ipynb conversion
							try {
								let fileContent = '';
								if (this.erdosAiService) {
									// Use ErdosAiService method which handles .ipynb conversion
									fileContent = await this.erdosAiService.extractFileContentForWidget(
										item.path, 
										item.startLine, 
										item.endLine
									);
								} else {
									// Fallback to direct file reading if service not available
									const fileData = await this.fileService.readFile(uri);
									const lines = fileData.value.toString().split('\n');
									const selectedLines = lines.slice(item.startLine - 1, item.endLine);
									fileContent = selectedLines.join('\n');
								}
								
								directContext.push({
									type: 'file',
									name: item.name,
									path: item.path,
									content: fileContent,
									start_line: item.startLine,
									end_line: item.endLine
								});
							} catch (error) {
								directContext.push({
									type: 'file',
									name: item.name,
									path: item.path,
									content: `Error reading file: ${error}`,
									start_line: item.startLine,
									end_line: item.endLine
								});
							}
						} else {
							// Full file - send basic file info only (no content, no symbols)
							directContext.push({
								type: 'file',
								name: item.name,
								path: item.path
							});
						}
					}
				} else if (item.type === 'chat') {
					// Chat context - get actual conversation summary exactly like rao
					const summary = await this.generateConversationSummary(item);

					// Only include if we have a valid summary (exactly like rao does)
					if (summary && summary.length > 0) {
						directContext.push({
							type: 'chat',
							name: item.name,
							id: item.conversationId?.toString(),
							summary: summary
						});
					}
				} else if (item.type === 'docs') {
					// Documentation context - fetch actual help content like RAO
					if (this.erdosAiService) {
						try {
							
							// Get the full help documentation content with language support
							const helpContent = await this.erdosAiService.getHelpAsMarkdown(item.topic || '', undefined, item.language);
							
							
							if (helpContent && helpContent.length > 0) {
								const contextItem: IDirectContextItem = {
									type: 'docs' as const,
									name: item.name,
									topic: item.topic,
									language: item.language,
									markdown: helpContent
								};
								
								directContext.push(contextItem);
							} else {
								// Fallback if help content couldn't be retrieved
								const langLabel = item.language || 'R';
								const fallbackItem: IDirectContextItem = {
									type: 'docs' as const,
									name: item.name,
									topic: item.topic,
									language: item.language,
									markdown: `${langLabel} Documentation for ${item.topic}: Help topic: ${item.topic}`
								};
								directContext.push(fallbackItem);
							}
						} catch (error) {
							this.logService.error('Failed to fetch help content for topic:', item.topic, error);
							// Fallback with error info
							const langLabel = item.language || 'R';
							directContext.push({
								type: 'docs' as const,
								name: item.name,
								topic: item.topic,
								language: item.language,
								markdown: `${langLabel} Documentation for ${item.topic}: Help topic: ${item.topic}`
							});
						}
					} else {
						// No erdosAiService available, use fallback
						const langLabel = item.language || 'R';
						directContext.push({
							type: 'docs' as const,
							name: item.name,
							topic: item.topic,
							language: item.language,
							markdown: `${langLabel} Documentation for ${item.topic}: Help topic: ${item.topic}`
						});
					}
				}
			} catch (error) {
				this.logService.error('Failed to process context item:', item, error);
			}
		}

		
		return directContext;
	}

	/**
	 * Generate unique display name for a file path
	 */
	private getUniqueDisplayName(path: string): string {
		const fileName = CommonUtils.getBasename(path) || path;
		
		// Check for conflicts with existing items
		const existingNames = this._contextItems
			.map(item => item.name)
			.filter(name => name.startsWith(fileName));
		
		if (existingNames.length === 0) {
			return fileName;
		}
		
		// Find a unique name by appending numbers
		let counter = 1;
		let uniqueName = fileName;
		while (existingNames.includes(uniqueName)) {
			uniqueName = `${fileName} (${counter})`;
			counter++;
		}
		
		return uniqueName;
	}

	/**
	 * Generate unique ID for context items
	 */
	private generateId(): string {
		return `context_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}



	/**
	 * Get conversation summary for context exactly like rao's get_conversation_summary_for_context
	 */
	private async getConversationSummaryForContext(conversationId: number): Promise<string | null> {
		if (!this.conversationSummarization) {
			return null;
		}

		try {
			// Build conversation paths for the target conversation (exactly like rao does)
			const conversationDir = `conversation_${conversationId}`;
			
			// Create paths object for the target conversation - use same structure as ConversationManager
			const conversationPaths: ConversationPaths = {
				conversationDir: `conversations/${conversationDir}`,
				conversationLogPath: `conversations/${conversationDir}/conversation_log.json`,
				scriptHistoryPath: `conversations/${conversationDir}/script_history.tsv`,
				diffLogPath: `conversations/${conversationDir}/file_changes.json`,
				conversationDiffLogPath: `conversations/${conversationDir}/conversation_diffs.json`,
				buttonsCsvPath: `conversations/${conversationDir}/message_buttons.csv`,
				attachmentsCsvPath: `conversations/${conversationDir}/attachments.csv`,
				summariesPath: `conversations/${conversationDir}/summaries.json`,
				backgroundSummarizationStatePath: `conversations/${conversationDir}/background_summarization.json`,
				plotsDir: `conversations/${conversationDir}/plots`
			};

			// Load summaries exactly like rao does
			const summaries = await this.conversationSummarization.loadConversationSummaries(conversationPaths);
			
			if (!summaries.summaries || Object.keys(summaries.summaries).length === 0) {
				return null;
			}

			// Get the most recent summary (highest query number) exactly like rao does
			const queryNumbers = Object.keys(summaries.summaries).map(k => parseInt(k));
			
			if (queryNumbers.length === 0) {
				return null;
			}

			const latestQuery = Math.max(...queryNumbers);
			const latestSummary = summaries.summaries[latestQuery.toString()];

			if (latestSummary && latestSummary.summary_text) {
				// Return the summary text directly, exactly like rao does
				return latestSummary.summary_text;
			}

			return null;
		} catch (error) {
			this.logService.error('Error getting conversation summary for context:', error);
			return null;
		}
	}

	/**
	 * Generate a meaningful conversation summary or use actual summary if available
	 */
	private async generateConversationSummary(item: IContextItem): Promise<string> {
		if (!item.conversationId) {
			return item.name || 'Unknown conversation';
		}

		// Try to get actual conversation summary first (exactly like rao)
		const actualSummary = await this.getConversationSummaryForContext(item.conversationId);
		
		if (actualSummary && actualSummary.length > 0) {
			return actualSummary;
		}

		// Fallback to metadata-based summary if no actual summary available
		const timestamp = item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '';
		const idInfo = `(ID: ${item.conversationId})`;
		
		if (timestamp) {
			return `${item.name} from ${timestamp} ${idInfo}`;
		} else {
			return `${item.name} ${idInfo}`;
		}
	}
}
