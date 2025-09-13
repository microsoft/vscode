/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ISearchService, ITextQuery, IFileQuery, QueryType, IFileMatch, IPatternInfo } from '../../../services/search/common/search.js';
import { ICommonUtils } from '../../../services/erdosAiUtils/common/commonUtils.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import * as glob from '../../../../base/common/glob.js';

export interface CodeLinkMapping {
	messageId: number;
	links: Array<{
		identifier: string;
		text: string;
		filePath: string;
	}>;
}

export interface CodeLinkStorage {
	[messageId: string]: CodeLinkMapping['links'];
}

export class CodeLinkProcessor {
	private static fileService: IFileService;
	private static workspaceService: IWorkspaceContextService;
	private static editorService: IEditorService;
	private static searchService: ISearchService;
	private static commonUtils: ICommonUtils;
	private static modelService: IModelService;
	private static conversationDir: string;

	public static initialize(
		fileService: IFileService,
		workspaceService: IWorkspaceContextService,
		editorService: IEditorService,
		searchService: ISearchService,
		commonUtils: ICommonUtils,
		modelService: IModelService,
		conversationDir: string
	) {
		this.fileService = fileService;
		this.workspaceService = workspaceService;
		this.editorService = editorService;
		this.searchService = searchService;
		this.commonUtils = commonUtils;
		this.modelService = modelService;
		this.conversationDir = conversationDir;
	}

	/**
	 * Process code links in markdown content and return link mappings
	 */
	/**
	 * Load existing code links for a message from storage
	 */
	public static async loadExistingLinks(messageId: number): Promise<Array<{ text: string; filePath: string }>> {
		if (!this.fileService || !this.conversationDir) {
			return [];
		}

		try {
			const conversationDirUri = URI.parse(this.conversationDir);
			const codeLinksPath = URI.joinPath(conversationDirUri, 'code_links.json');			
			const existingContent = await this.fileService.readFile(codeLinksPath);
			const storage = JSON.parse(existingContent.value.toString());

			const messageLinks = storage[messageId.toString()] || [];
			
			return messageLinks.map((link: any) => ({
				text: link.text,
				filePath: link.filePath
			}));
		} catch (error) {
			return [];
		}
	}

	public static async processCodeLinks(content: string, messageId?: number): Promise<Array<{ text: string; filePath: string }>> {
		if (!this.fileService || !this.workspaceService || !this.editorService || !this.searchService || !this.commonUtils || !this.modelService) {
			return [];
		}

		// Find all backtick patterns in the content - no filtering
		const backtickPattern = /`([^`]+)`/g;
		const matches: Array<{ text: string; identifier: string }> = [];
		let match;

		while ((match = backtickPattern.exec(content)) !== null) {
			const text = match[1];
			matches.push({
				text,
				identifier: `code_${matches.length}`
			});
		}

		if (matches.length === 0) {
			return [];
		}

		// Load existing cached links for this message
		const existingLinks = messageId ? await this.loadExistingLinks(messageId) : [];
		const existingLinksMap = new Map<string, string>();
		existingLinks.forEach(link => existingLinksMap.set(link.text, link.filePath));
		
		// Process each backtick text: use cache if available, otherwise search
		const allLinkMappings: Array<{ text: string; filePath: string }> = [];
		const newLinksToCache: Array<{ text: string; filePath: string }> = [];
		
		for (const matchItem of matches) {
			// Check if this text already has a cached link
			if (existingLinksMap.has(matchItem.text)) {
				const cachedFilePath = existingLinksMap.get(matchItem.text)!;
				allLinkMappings.push({
					text: matchItem.text,
					filePath: cachedFilePath
				});
			} else {
				// Search for this text since it's not cached
				const filePath = await this.findFileForText(matchItem.text);
				if (filePath) {
					const newLink = {
						text: matchItem.text,
						filePath
					};
					allLinkMappings.push(newLink);
					newLinksToCache.push(newLink);
				}
			}
		}

		// Store any new mappings to cache
		if (messageId && this.conversationDir && newLinksToCache.length > 0) {
			// Merge with existing links
			const allLinksForStorage = [...existingLinks, ...newLinksToCache];
			const storeMappings = allLinksForStorage.map((mapping, index) => ({
				identifier: `code_${index}`,
				text: mapping.text,
				filePath: mapping.filePath
			}));
			await this.storeLinkMappings(messageId, storeMappings);
		}

		return allLinkMappings;
	}

	/**
	 * Search for a file that matches the given text using 3-tier priority:
	 * 1. Files open in the browser
	 * 2. File name matches in the current working directory  
	 * 3. Most recently edited file if the text is found in a file
	 */
	private static async findFileForText(text: string): Promise<string | null> {
		
		// Priority 0: Check if text is already an absolute path to an existing file
		if (text.startsWith('/') || text.match(/^[A-Za-z]:/)) { // Unix absolute path or Windows drive path
			try {
				const stat = await this.fileService.stat(URI.file(text));
				if (stat && !stat.isDirectory) {
					return text;
				}
			} catch (error) {
				// File doesn't exist, continue with other searches
			}
		}

		// Priority 1: Check currently open editor names first
		const openEditors = this.editorService.editors;
		
		for (const editor of openEditors) {
			if (editor.resource) {
				const path = editor.resource.path;
				if (this.matchesFileName(text, path)) {
					return path;
				}
			}
		}

		// Priority 2: Search workspace files by filename
		const fileNameMatch = await this.searchFilesByName(text);
		if (fileNameMatch) {
			return fileNameMatch;
		}

		// Priority 3: Search file content and return most recently edited
		const contentMatch = await this.searchFileContent(text);
		if (contentMatch) {
			return contentMatch;
		}

		return null;
	}

	/**
	 * Check if text matches a file path/name using CommonUtils
	 */
	/**
	 * Get file edit priority: editor model time first, then file system time
	 */
	private static async getFileEditPriority(filePath: string): Promise<number> {
		const uri = URI.file(filePath);
		
		// Check if file has editor model (open and potentially edited)
		const model = this.modelService.getModel(uri);
		
		if (model) {
			const versionId = model.getAlternativeVersionId();
			
			if (versionId > 1) {
				// Model has been edited, give it highest priority (current time)
				const priority = Date.now();
				return priority;
			}
		}
		
		// Get file system modification time
		const stat = await this.fileService.stat(uri);
		return stat.mtime;
	}

	private static matchesFileName(text: string, filePath: string): boolean {
		const fileName = this.commonUtils.getBasename(filePath);
		const { name: baseName } = this.commonUtils.splitNameAndExtension(fileName);
		
		// Exact filename match
		if (fileName === text) {
			return true;
		}
		
		// Base name match
		if (baseName === text) {
			return true;
		}
		
		// Path contains text
		if (filePath.toLowerCase().includes(text.toLowerCase())) {
			return true;
		}
		
		return false;
	}

	/**
	 * Search files by name using VSCode's search service
	 */
	private static async searchFilesByName(text: string): Promise<string | null> {
		try {
			const workspaceFolders = this.workspaceService.getWorkspace().folders;
			if (workspaceFolders.length === 0) {
				return null;
			}

			// Priority 2: Search for filename matches in current working directory first
			const filePattern = `**/*${text}*`;
			
			const fileQuery: IFileQuery = {
				type: QueryType.File,
				filePattern: filePattern,
				folderQueries: workspaceFolders.map(folder => ({ folder: folder.uri })),
				maxResults: 100,
				sortByScore: true,
				shouldGlobMatchFilePattern: true, // Use glob matching instead of fuzzy matching
				excludePattern: {
					'**/node_modules/**': true,
					'**/.git/**': true,
					'**/.*': true,
					'**/*.log': true,
					'**/*.tmp': true,
					'**/*.cache': true
				} as glob.IExpression
			};

			const searchResult = await this.searchService.fileSearch(fileQuery, CancellationToken.None);
			
			if (searchResult.results && searchResult.results.length > 0) {
				// Filter and get edit priorities for all results
				const resultsWithPriority = await Promise.all(searchResult.results.map(async (result) => {
					const editPriority = await this.getFileEditPriority(result.resource.path);
					return { result, editPriority };
				}));
				
				// Sort by edit priority (higher = more recently edited)
				resultsWithPriority.sort((a, b) => b.editPriority - a.editPriority);

				// Return the most recently edited match
				return resultsWithPriority[0].result.resource.path;
			}

		} catch (error) {
			console.error('Error searching files by name:', error);
		}
		
		return null;
	}

	/**
	 * Search file content using VSCode's search service
	 */
	private static async searchFileContent(text: string): Promise<string | null> {
		try {
			const workspaceFolders = this.workspaceService.getWorkspace().folders;
			
			if (workspaceFolders.length === 0) {
				return null;
			}

			// Priority 3: Search for content matches and return most recently edited
			// Escape newlines and other special characters to prevent regex errors
			const escapedText = text.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
			const contentPattern: IPatternInfo = {
				pattern: escapedText,
				isRegExp: false,
				isCaseSensitive: false,
				isWordMatch: false,
				isMultiline: false
			};

			const textQuery: ITextQuery = {
				type: QueryType.Text,
				contentPattern: contentPattern,
				folderQueries: workspaceFolders.map(folder => ({ folder: folder.uri })),
				maxResults: 50,
				excludePattern: {
					'**/node_modules/**': true,
					'**/.git/**': true,
					'**/.*': true,
					'**/*.log': true,
					'**/*.tmp': true,
					'**/*.cache': true,
					'**/*.min.js': true,
					'**/*.min.css': true,
					'**/dist/**': true,
					'**/build/**': true
				} as glob.IExpression
			};

			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('Content search timed out')), 5000);
			});

			const searchPromise = this.searchService.textSearch(textQuery, CancellationToken.None);
			const searchResult = await Promise.race([searchPromise, timeoutPromise]);
			
			if (searchResult.results && searchResult.results.length > 0) {
				// Get edit priorities for all results
				const resultsWithPriority = await Promise.all(searchResult.results.map(async (result) => {
					const fileMatch = result as IFileMatch;
					const editPriority = await this.getFileEditPriority(fileMatch.resource.path);
					return { result: fileMatch, editPriority };
				}));

				// Sort by edit priority only (most recently edited first)
				resultsWithPriority.sort((a, b) => b.editPriority - a.editPriority);
				
				// Return the most recently edited file with content match
				return resultsWithPriority[0].result.resource.path;
			}
		} catch (error) {
			if (error instanceof Error && error.message.includes('timeout')) {
				console.warn('[CodeLinkProcessor] SEARCH: Content search timed out');
			} else {
				console.error('Error searching file content:', error);
			}
		}
		
		return null;
	}

	/**
	 * Store link mappings to conversation directory
	 */
	private static async storeLinkMappings(messageId: number, mappings: Array<{ identifier: string; text: string; filePath: string }>): Promise<void> {
		try {
			// Convert string path to URI properly
			const conversationDirUri = URI.parse(this.conversationDir);
			const codeLinksPath = URI.joinPath(conversationDirUri, 'code_links.json');
			
			// Read existing mappings
			let storage: CodeLinkStorage = {};
			try {
				const existing = await this.fileService.readFile(codeLinksPath);
				storage = JSON.parse(existing.value.toString());
			} catch (readError) {
				// File doesn't exist yet, start with empty storage
			}
			
			// Add new mappings
			storage[messageId.toString()] = mappings;
			
			// Write back to file
			await this.fileService.writeFile(codeLinksPath, VSBuffer.fromString(JSON.stringify(storage, null, 2)));
		} catch (error) {
			console.error('[CodeLinkProcessor] CACHE: Error storing link mappings:', error);
		}
	}

	/**
	 * Open a file in the editor (static method for use by React components)
	 */
	public static async openFile(filePath: string): Promise<void> {
		try {
			const uri = URI.file(filePath);
			await this.editorService.openEditor({
				resource: uri,
				options: {
					pinned: false,
					revealIfOpened: true,
					preserveFocus: false
				}
			});
		} catch (error) {
			console.error(`[CodeLinkProcessor] Failed to open file: ${filePath}`, error);
		}
	}

}
