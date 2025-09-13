/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { Event, Emitter } from '../../../../base/common/event.js';

import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IConversationSummarization } from '../../erdosAiConversation/common/conversationSummarization.js';
import { ConversationPaths } from '../../erdosAi/common/conversationTypes.js';
import { IDocumentManager } from '../../erdosAiDocument/common/documentManager.js';
import { IContextService as IContextServiceInterface, IContextItem, IDirectContextItem } from '../common/contextService.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { IFileResolverService } from '../../erdosAiUtils/common/fileResolverService.js';
import { IHelpContentService } from '../../erdosAiUtils/common/helpContentService.js';
import { IImageAttachmentService } from '../../erdosAiMedia/common/imageAttachmentService.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { joinPath } from '../../../../base/common/resources.js';

/**
 * Service for managing context attachments in Erdos AI
 */
export class ContextService extends Disposable implements IContextServiceInterface {
	readonly _serviceBrand: undefined;
	private readonly _onDidChangeContext = this._register(new Emitter<IContextItem[]>());
	public readonly onDidChangeContext: Event<IContextItem[]> = this._onDidChangeContext.event;

	private _contextItems: IContextItem[] = [];

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IConversationSummarization private readonly conversationSummarization: IConversationSummarization,
		@IDocumentManager private readonly documentManager: IDocumentManager,
		@IFileResolverService private readonly fileResolverService: IFileResolverService,
		@IHelpContentService private readonly helpContentService: IHelpContentService,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
		@IImageAttachmentService private readonly imageAttachmentService: IImageAttachmentService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService
	) {
		super();
	}

	async addFileContext(uri: URI, content?: string, startLine?: number, endLine?: number): Promise<boolean> {
		const path = uri.fsPath;

		const existingItem = this._contextItems.find(item => 
			item.path === path && 
			item.startLine === startLine && 
			item.endLine === endLine
		);
		
		if (existingItem) {
			return true;
		}

		try {
			const stat = await this.fileService.stat(uri);
			const isDirectory = stat.isDirectory;
			
			let displayName: string;
			if (startLine !== undefined && endLine !== undefined) {
				const fileName = this.commonUtils.getBasename(uri.path) || 'unknown';
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
				content: content,
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

	async generateDirectContextData(): Promise<IDirectContextItem[]> {
		const directContext: IDirectContextItem[] = [];

		for (const item of this._contextItems) {
			try {
				if (item.type === 'file' || item.type === 'directory') {
					if (!item.path) continue;

					const uri = URI.file(item.path);
					
					if (item.type === 'directory') {
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
						if (item.startLine !== undefined && item.endLine !== undefined) {
							// File contexts with line ranges must have pre-extracted content
							if (!item.content) {
								directContext.push({
									type: 'file',
									name: item.name,
									path: item.path,
									content: 'Error: File context missing content',
									start_line: item.startLine,
									end_line: item.endLine
								});
								continue;
							}
								
							directContext.push({
								type: 'file',
								name: item.name,
								path: item.path,
								content: item.content,
								start_line: item.startLine,
								end_line: item.endLine
							});
						} else {
							directContext.push({
								type: 'file',
								name: item.name,
								path: item.path
							});
						}
					}
				} else if (item.type === 'chat') {
					const summary = await this.generateConversationSummary(item);

					if (summary && summary.length > 0) {
						const contextItem: IDirectContextItem = {
							type: 'chat' as const,
							name: item.name,
							id: item.conversationId?.toString(),
							summary: summary
						};
						
						directContext.push(contextItem);
					}
				} else if (item.type === 'docs') {
					try {
						// Use the dedicated HelpContentService for proper help content
						const helpContent = await this.helpContentService.getHelpAsMarkdown(
							item.topic || '', 
							undefined, 
							item.language
						);
						
						if (helpContent && helpContent.length > 0) {
							const contextItem: IDirectContextItem = {
								type: 'docs' as const,
								name: item.name,
								topic: item.topic,
								markdown: helpContent
							};
							
							directContext.push(contextItem);
						} else {
							const langLabel = item.language || 'R';
							const fallbackItem: IDirectContextItem = {
								type: 'docs' as const,
								name: item.name,
								topic: item.topic,
								markdown: `${langLabel} Documentation for ${item.topic}: Help topic: ${item.topic}`
							};
							directContext.push(fallbackItem);
						}
					} catch (error) {
						this.logService.error('Failed to fetch help content for topic:', item.topic, error);
						const langLabel = item.language || 'R';
						const errorFallbackItem: IDirectContextItem = {
							type: 'docs' as const,
							name: item.name,
							topic: item.topic,
							markdown: `${langLabel} Documentation for ${item.topic}: Help topic: ${item.topic}`
						};
						directContext.push(errorFallbackItem);
					}
				}
			} catch (error) {
				this.logService.error('Failed to process context item:', item, error);
			}
		}
		
		return directContext;
	}

	private getUniqueDisplayName(path: string): string {
		const fileName = this.commonUtils.getBasename(path) || path;
		
		const existingNames = this._contextItems
			.map(item => item.name)
			.filter(name => name.startsWith(fileName));
		
		if (existingNames.length === 0) {
			return fileName;
		}
		
		let counter = 1;
		let uniqueName = fileName;
		while (existingNames.includes(uniqueName)) {
			uniqueName = `${fileName} (${counter})`;
			counter++;
		}
		
		return uniqueName;
	}

	getContextItems(): IContextItem[] {
		return [...this._contextItems];
	}

	private async getConversationSummaryForContext(conversationId: number): Promise<string | null> {

		try {
			// Build paths the same way the conversation manager does
			const workspace = this.workspaceContextService.getWorkspace();
			const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
			const workspaceId = this.workspaceContextService.getWorkspace().id;
			
			const storageRoot = isEmptyWindow ?
				joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
				joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
				
			const conversationsDir = joinPath(storageRoot, 'conversations');
			const conversationDir = joinPath(conversationsDir, `conversation_${conversationId}`);
			
			const conversationPaths: ConversationPaths = {
				conversationDir: conversationDir.toString(),
				conversationLogPath: joinPath(conversationDir, 'conversation_log.json').toString(),
				scriptHistoryPath: joinPath(conversationDir, 'script_history.tsv').toString(),
				diffLogPath: joinPath(conversationDir, 'file_changes.json').toString(),
				conversationDiffLogPath: joinPath(conversationDir, 'conversation_diffs.json').toString(),
				buttonsCsvPath: joinPath(conversationDir, 'message_buttons.csv').toString(),
				codeLinksPath: joinPath(conversationDir, 'code_links.json').toString(),
				attachmentsCsvPath: joinPath(conversationDir, 'attachments.csv').toString(),
				summariesPath: joinPath(conversationDir, 'summaries.json').toString(),
				plotsDir: joinPath(conversationDir, 'plots').toString()
			};


			const summaries = await this.conversationSummarization.loadConversationSummaries(conversationPaths);
			
			if (!summaries.summaries || Object.keys(summaries.summaries).length === 0) {
				return null;
			}

			const queryNumbers = Object.keys(summaries.summaries).map(k => parseInt(k));
			
			if (queryNumbers.length === 0) {
				return null;
			}

			const latestQuery = Math.max(...queryNumbers);
			const latestSummary = summaries.summaries[latestQuery.toString()];

			if (latestSummary && latestSummary.summary_text) {
				return latestSummary.summary_text;
			}

			return null;
		} catch (error) {
			this.logService.error('Error getting conversation summary for context:', error);
			return null;
		}
	}

	private async generateConversationSummary(item: IContextItem): Promise<string> {
		if (!item.conversationId) {
			return item.name || 'Unknown conversation';
		}

		const actualSummary = await this.getConversationSummaryForContext(item.conversationId);
		
		if (actualSummary && actualSummary.length > 0) {
			return actualSummary;
		}

		return '';
	}

	createResolverContext() {
		return this.fileResolverService.createResolverContext();
	}

	/**
	 * Get the image attachment service for the current conversation.
	 * Uses the singleton image attachment service.
	 */
	private getImageAttachmentService(): IImageAttachmentService | null {
		// Use the singleton image attachment service
		return this.imageAttachmentService;
	}

	async prepareContextForBackend(messages: any[], vscodeReferences?: any[]): Promise<any> {
		try {
			const userRules = await this.getUserRules();
			const environmentInfo = await this.gatherEnvironmentInfo();
			const symbolsNote = await this.createSymbolsNoteForContext();

			const finalContext = {
				symbols_note: symbolsNote,
				user_rules: userRules,
				...environmentInfo
			};
			
			return finalContext;
		} catch (error) {
			this.logService.error('Failed to prepare context for backend:', error);
			return {
				symbols_note: null,
				user_rules: []
			};
		}
	}

	private async getUserRules(): Promise<string[]> {
		return this.configurationService.getValue<string[]>('erdosAi.userRules') || [];
	}

	private async gatherEnvironmentInfo(): Promise<any> {
		try {
			const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
			const workspacePath = workspaceFolder?.uri.fsPath || '';
			
			// Generate project layout
			const projectLayout = await this.generateDirectoryTree(workspacePath);
			
			return {
				user_os_version: navigator.platform || 'unknown',
				user_workspace_path: workspacePath,
				user_shell: 'bash',
				project_layout: projectLayout,
				client_version: '0.3.0'
			};
		} catch (error) {
			this.logService.error('Failed to gather environment info:', error);
			return {
				user_os_version: 'unknown',
				user_workspace_path: '',
				user_shell: 'bash',
				project_layout: '',
				client_version: '0.3.0'
			};
		}
	}

	private async createSymbolsNoteForContext(): Promise<any> {
		const directContextItems = await this.generateDirectContextData();
		const openFiles = await this.getOpenFilesInfo();

		// Prepare attached images
		const imageService = this.getImageAttachmentService();
		const attachedImages: any[] = [];
		if (imageService) {
			const images = imageService.getAttachedImages();
			
			// Convert our image format to backend format
			for (const image of images) {
				attachedImages.push({
					filename: image.filename,
					original_path: image.originalPath,
					local_path: image.localPath,
					mime_type: image.mimeType,
					base64_data: image.base64Data,
					timestamp: image.timestamp
				});
			}
		}

		// Return null if no context to include (including images)
		if (directContextItems.length === 0 && openFiles.length === 0 && attachedImages.length === 0) {
			return null;
		}

		// Return minimal symbols_note structure with only user-added context (like backup)
		const symbolsNote = {
			direct_context: directContextItems,
			environment_variables: {
				Data: [],
				Function: [],
				Value: []
			},
			open_files: openFiles,
			attached_images: attachedImages
		};

		return symbolsNote;
	}

	private async getOpenFilesInfo(): Promise<any[]> {
		try {
			const docs = await this.documentManager.getAllOpenDocuments(true);
			const openFiles = [];
			for (const doc of docs) {
				const minutesSinceUpdate = await this.getMinutesSinceLastEdit(doc.path);
				
				const fileInfo = {
					id: doc.id,
					path: doc.path,
					type: doc.metadata?.language || 'text',
					dirty: !doc.isSaved,
					name: doc.path.split('/').pop() || doc.id,
					minutes_since_last_update: minutesSinceUpdate,
					is_active: doc.isActive
				};
				
				openFiles.push(fileInfo);
			}
			
			return openFiles;
		} catch (error) {
			this.logService.error('[ContextService] Failed to get open files info:', error);
			// Re-throw the error instead of returning empty array - no fallbacks
			throw error;
		}
	}

	private async getMinutesSinceLastEdit(filePath: string): Promise<number> {
		const uri = URI.file(filePath);
		
		// Use file system modification time only
		try {
			const stat = await this.fileService.stat(uri);			
			if (stat.mtime && stat.mtime > 0) {
				const minutesAgo = Math.floor((Date.now() - stat.mtime) / (1000 * 60));
				return minutesAgo;
			} else {
				throw new Error(`Invalid file modification time for: ${filePath}`);
			}
		} catch (error) {
			this.logService.error('[ContextService] FILE_SYSTEM_TIME: Error reading file stat for', filePath, ':', error);
			throw error;
		}
	}

	addChatContext(conversationId: number, name?: string): boolean {
		const existingItem = this._contextItems.find(item => 
			item.type === 'chat' && item.conversationId === conversationId
		);
		
		if (existingItem) {
			return true;
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

	addDocsContext(topic: string, name?: string, language?: 'R' | 'Python'): boolean {
		if (!topic || topic.trim().length === 0) {
			return false;
		}

		const existingItem = this._contextItems.find(item => 
			item.type === 'docs' && item.topic === topic && item.language === language
		);
		
		if (existingItem) {
			return true;
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

	removeContextItem(id: string): boolean {
		const index = this._contextItems.findIndex(item => item.id === id);
		if (index !== -1) {
			this._contextItems.splice(index, 1);
			this._onDidChangeContext.fire(this.getContextItems());
			return true;
		}
		return false;
	}

	private generateId(): string {
		return `context_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Generates a directory tree structure
	 */
	private async generateDirectoryTree(rootPath: string): Promise<string> {
		if (!rootPath) {
			return '';
		}

		try {
			const rootUri = URI.file(rootPath);
			const rootName = this.commonUtils.getBasename(rootPath) || 'workspace';
			
			const outputLines: string[] = [`${rootName}/`];
			await this.generateTreeRecursive(rootUri, 0, outputLines);
			
			return outputLines.join('\n');
		} catch (error) {
			this.logService.error('Error generating directory tree:', error);
			return `${this.commonUtils.getBasename(rootPath) || 'workspace'}/\n  - [Error generating directory tree: ${error}]`;
		}
	}

	/**
	 * Recursively generates tree structure
	 */
	private async generateTreeRecursive(directoryUri: URI, currentDepth: number, outputLines: string[]): Promise<void> {
		const MAX_DEPTH = 3;
		const INDENT_SIZE = 2;

		// Stop recursion if we've reached max depth
		if (currentDepth > MAX_DEPTH) {
			return;
		}

		try {
			// Get all entries (files and directories)
			const dirStat = await this.fileService.resolve(directoryUri);
			if (!dirStat.children) {
				return;
			}

			const allEntries = dirStat.children;

			// Filter out common ignore patterns
			const ignorePatterns = [
				/\.git$/,
				/\.DS_Store$/,
				/node_modules$/,
				/\.Rproj\.user$/,
				/target$/,
				/build$/,
				/dist$/,
				/\.idea$/,
				/\.vscode$/,
				/\.cursorignore$/,
				/\.gitignore$/
			];

			const filteredEntries = allEntries.filter(entry => {
				const name = entry.name;
				return !ignorePatterns.some(pattern => pattern.test(name));
			});

			if (filteredEntries.length === 0) {
				return;
			}

			// Separate files from directories
			const files = filteredEntries.filter(entry => !entry.isDirectory).map(entry => entry.name);
			const dirs = filteredEntries.filter(entry => entry.isDirectory).map(entry => entry.name);

			files.sort();
			dirs.sort();

			const contentDepth = currentDepth + 1;

			if (contentDepth > MAX_DEPTH) {
				// Summarize instead of showing individual items
				if (files.length > 0 || dirs.length > 0) {
					const summary = this.generateFileSummary(files, dirs.length);
					if (summary !== '') {
						const indent = ' '.repeat(contentDepth * INDENT_SIZE);
						outputLines.push(`${indent}- ${summary}`);
					}
				}
			} else {
				// Show individual files and recurse into subdirectories
				const indent = ' '.repeat(contentDepth * INDENT_SIZE);
				const MAX_INDIVIDUAL_FILES = 3;

				// Output files - either individually if few, or summarized if many
				if (files.length <= MAX_INDIVIDUAL_FILES) {
					// Show individual files when there are few
					for (const file of files) {
						outputLines.push(`${indent}- ${file}`);
					}
				} else {
					// Summarize files when there are many
					const summary = this.generateFileSummary(files, 0);
					if (summary !== '') {
						outputLines.push(`${indent}- ${summary}`);
					}
				}

				// Output all subdirectories and recurse into them
				for (const subdir of dirs) {
					outputLines.push(`${indent}- ${subdir}/`);
					const subdirUri = URI.joinPath(directoryUri, subdir);
					await this.generateTreeRecursive(subdirUri, contentDepth, outputLines);
				}
			}

		} catch (error) {
			// On error, return without adding anything
			return;
		}
	}

	/**
	 * Generates a file summary
	 */
	private generateFileSummary(files: string[], dirCount: number): string {
		const MAX_EXTENSIONS_IN_SUMMARY = 3;

		const parts: string[] = [];

		// Add files part if there are files
		if (files.length > 0) {
			const extensionCounts = this.countByExtension(files);
			const sortedExtensions = Object.keys(extensionCounts).sort((a, b) => extensionCounts[b] - extensionCounts[a]);

			// Build extension breakdown
			const breakdownParts: string[] = [];
			const maxToShow = Math.min(MAX_EXTENSIONS_IN_SUMMARY, sortedExtensions.length);

			for (let i = 0; i < maxToShow; i++) {
				const ext = sortedExtensions[i];
				const count = extensionCounts[ext];
				breakdownParts.push(`${count} *.${ext}`);
			}

			if (sortedExtensions.length > MAX_EXTENSIONS_IN_SUMMARY) {
				breakdownParts.push('...');
			}

			const breakdown = breakdownParts.join(', ');
			parts.push(`${files.length} files (${breakdown})`);
		}

		// Add dirs part if there are directories
		if (dirCount > 0) {
			parts.push(`${dirCount} dirs`);
		}

		// Return empty if nothing to show
		if (parts.length === 0) {
			return '';
		}

		return `[+${parts.join(' & ')}]`;
	}

	/**
	 * Counts files by extension
	 */
	private countByExtension(files: string[]): { [ext: string]: number } {
		const counts: { [ext: string]: number } = {};

		for (const file of files) {
			const extMatch = file.match(/\.(\w+)$/);
			const ext = extMatch ? extMatch[1] : 'txt'; // default for files without extension

			if (!counts[ext]) {
				counts[ext] = 0;
			}
			counts[ext]++;
		}

		return counts;
	}
}
