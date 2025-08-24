/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';

import { DocumentManager } from '../document/documentManager.js';

import { Event, Emitter } from '../../../../../base/common/event.js';
import { CommonUtils } from '../utils/commonUtils.js';


export interface ContextItem {
	path?: string;
	name: string;
	type: 'file' | 'directory' | 'lines' | 'chat' | 'docs';
	timestamp: Date;
	startLine?: number;
	endLine?: number;
	content?: string;
	id?: number;
	topic?: string;
}

export interface ContextData {
	directContext: ContextItem[];
	keywords: string[];
	environmentVariables: Record<string, string>;
	openFiles: Array<{
		path: string;
		language: string;
		content?: string;
	}>;
}



/**
 * Context manager for Erdos AI to handle file, directory, and symbol context
 */
export class ContextManager extends Disposable {

	private contextItems: Map<string, ContextItem> = new Map();
	private readonly _onDidChangeContext = new Emitter<ContextItem[]>();
	
	readonly onDidChangeContext: Event<ContextItem[]> = this._onDidChangeContext.event;

	constructor(
		@IFileService private readonly fileService: IFileService,
		private readonly documentManager: DocumentManager
	) {
		super();
	}

	/**
	 */
	async addFile(path: string): Promise<boolean> {
		if (!path || path.trim().length === 0) {
			return false;
		}

		const expandedPath = CommonUtils.expandPath(path);
		const contextKey = this.generateContextKey(expandedPath);
		
		// Check for exact duplicate
		if (this.contextItems.has(contextKey)) {
			return true; // Already exists
		}

		// Determine if this is a directory
		let isDirectory = false;
		try {
			const uri = this.resolvePathToUri(expandedPath);
			if (uri) {
				const stat = await this.fileService.stat(uri);
				isDirectory = stat.isDirectory;
			}
		} catch {
			// File might not exist on disk, check if it's open in editor
			isDirectory = false;
		}

		// Generate unique display name
		const allPaths = Array.from(this.contextItems.values())
			.map(item => item.path)
			.filter((path): path is string => path !== undefined);
		allPaths.push(expandedPath);
		const displayName = this.getUniqueDisplayName(expandedPath, allPaths);

		const contextItem: ContextItem = {
			path: expandedPath,
			name: displayName,
			type: isDirectory ? 'directory' : 'file',
			timestamp: new Date()
		};

		// For files, extract content only (no symbol extraction)
		if (!isDirectory) {
			try {
				contextItem.content = await this.documentManager.getEffectiveFileContent(expandedPath) || undefined;
			} catch (error) {
				console.error('Failed to load file content:', error);
				return false;
			}
		} else {
			// For directories, get file listing
			try {
				const files = await this.getDirectoryFiles(expandedPath);
				contextItem.content = `Directory containing ${files.length} files:\n${files.join('\n')}`;
			} catch (error) {
				console.error('Failed to list directory:', error);
				return false;
			}
		}

		this.contextItems.set(contextKey, contextItem);
		this._onDidChangeContext.fire(Array.from(this.contextItems.values()));
		
		return true;
	}

	/**
	 * Add a directory to the context with recursive option
	 */
	async addDirectory(path: string, recursive: boolean = false): Promise<boolean> {
		const success = await this.addFile(path);
		
		if (success && recursive) {
			try {
				const files = await this.getDirectoryFilesRecursive(path);
				for (const file of files) {
					await this.addFile(file);
				}
			} catch (error) {
				console.error('Failed to add directory recursively:', error);
				return false;
			}
		}
		
		return success;
	}

	/**
	 */
	async addLines(path: string, startLine: number, endLine: number): Promise<boolean> {
		if (!path || startLine < 1 || endLine < startLine) {
			return false;
		}

		const expandedPath = CommonUtils.expandPath(path);
		
		// Check if file exists (disk or open editor) and is not a directory
		const fileExists = await this.fileExists(expandedPath);
		const isOpenInEditor = this.documentManager.checkIfFileOpenInEditor(expandedPath);
		
		if (!fileExists && !isOpenInEditor) {
			return false;
		}

		// Validate line numbers against actual content
		const fileContent = await this.documentManager.getEffectiveFileContent(expandedPath);
		if (fileContent) {
			const lines = fileContent.split('\n');
			const totalLines = lines.length;
			if (startLine > totalLines || endLine > totalLines) {
				return false;
			}
		}

		const contextKey = this.generateContextKey(expandedPath, startLine, endLine);
		
		// Check for exact duplicate
		if (this.contextItems.has(contextKey)) {
			return true;
		}

		const fileName = CommonUtils.getBasename(expandedPath);
		const itemDescription = startLine === endLine 
			? `${fileName} (${startLine})`
			: `${fileName} (${startLine}-${endLine})`;

		// Extract the specific lines
		const lineContent = await this.documentManager.getEffectiveFileContent(expandedPath, startLine, endLine);

		const contextItem: ContextItem = {
			path: expandedPath,
			name: itemDescription,
			type: 'lines',
			startLine,
			endLine,
			content: lineContent || undefined,
			timestamp: new Date()
		};

		this.contextItems.set(contextKey, contextItem);
		this._onDidChangeContext.fire(Array.from(this.contextItems.values()));
		
		return true;
	}

	/**
	 */
	addDocumentation(topic: string, name?: string): boolean {
		if (!topic || topic.trim().length === 0) {
			return false;
		}

		// Default name if not provided
		const displayName = name && name.trim().length > 0 ? name : topic;

		// Check for duplicates (same topic)
		for (const [, item] of this.contextItems) {
			if (item.type === 'docs' && item.topic === topic) {
				return true; // Already exists
			}
		}

		const contextKey = `docs:${topic}`;
		
		const contextItem: ContextItem = {
			name: displayName,
			type: 'docs',
			topic,
			timestamp: new Date()
		};

		this.contextItems.set(contextKey, contextItem);
		this._onDidChangeContext.fire(Array.from(this.contextItems.values()));
		
		return true;
	}

	/**
	 */
	addConversation(conversationId: number, name?: string): boolean {
		if (!Number.isInteger(conversationId) || conversationId < 0) {
			return false;
		}

		// Default name if not provided
		const displayName = name && name.trim().length > 0 ? name : `Conversation ${conversationId}`;

		// Check for duplicates (same conversation ID)
		for (const [, item] of this.contextItems) {
			if (item.type === 'chat' && item.id === conversationId) {
				return true; // Already exists
			}
		}

		const contextKey = `chat:${conversationId}`;
		
		const contextItem: ContextItem = {
			name: displayName,
			type: 'chat',
			id: conversationId,
			timestamp: new Date()
		};

		this.contextItems.set(contextKey, contextItem);
		this._onDidChangeContext.fire(Array.from(this.contextItems.values()));
		
		return true;
	}

	/**
	 */
	async getContextForRequest(): Promise<ContextData> {
		const directContext: ContextItem[] = [];
		const keywords: string[] = [];
		const openFiles: Array<{ path: string; language: string; content?: string }> = [];

		// Process each context item
		for (const item of this.contextItems.values()) {
			if (item.type === 'file' || item.type === 'lines') {
				// For files and line ranges, include full content
				directContext.push({
					...item,
					content: item.content || (item.path ? await this.documentManager.getEffectiveFileContent(item.path, item.startLine, item.endLine) || undefined : undefined)
				});
			} else if (item.type === 'directory') {
				// For directories, include file listing only (no keywords)
				directContext.push(item);
			} else {
				// For documentation and conversation context
				directContext.push(item);
			}
		}

		// Get all open files for additional context
		const documents = await this.documentManager.getAllOpenDocuments(true);
		for (const doc of documents) {
			openFiles.push({
				path: doc.path,
				language: doc.metadata.language,
				content: doc.content
			});
		}

		// No keyword extraction from files

		// Get environment variables (simplified version)
		const environmentVariables = this.getCategorizedEnvironmentVariables();

		return {
			directContext,
			keywords: Array.from(new Set(keywords)), // Remove duplicates
			environmentVariables,
			openFiles
		};
	}

	/**
	 * Remove an item from context
	 */
	removeItem(pathOrId: string): boolean {
		const contextKey = this.findContextKey(pathOrId);
		if (contextKey && this.contextItems.has(contextKey)) {
			this.contextItems.delete(contextKey);
			this._onDidChangeContext.fire(Array.from(this.contextItems.values()));
			return true;
		}
		return false;
	}

	/**
	 * Clear all context items
	 */
	clear(): void {
		this.contextItems.clear();
		this._onDidChangeContext.fire([]);
	}

	/**
	 * Get all context items
	 */
	getContextItems(): ContextItem[] {
		return Array.from(this.contextItems.values());
	}

	// Private helper methods



	private generateContextKey(path: string, startLine?: number, endLine?: number): string {
		if (startLine !== undefined && endLine !== undefined) {
			return `${path}:${startLine}-${endLine}`;
		}
		return path;
	}

	private findContextKey(pathOrId: string): string | undefined {
		// Try exact match first
		if (this.contextItems.has(pathOrId)) {
			return pathOrId;
		}

		// Try to find by path
		for (const [key, item] of this.contextItems) {
			if (item.path === pathOrId) {
				return key;
			}
		}

		return undefined;
	}

	private getUniqueDisplayName(path: string, allPaths: string[]): string {
		const fileName = CommonUtils.getBasename(path);
		
		// Check if filename is unique
		const conflictingPaths = allPaths.filter(p => p !== path && CommonUtils.getBasename(p) === fileName);
		
		if (conflictingPaths.length === 0) {
			return fileName;
		}

		// If there are conflicts, include parent directory
		const parentDir = CommonUtils.getBasename(CommonUtils.getDirname(path));
		const displayName = `${parentDir}/${fileName}`;
		
		// Check if this is now unique
		const stillConflicting = allPaths.filter(p => 
			p !== path && 
			CommonUtils.getBasename(p) === fileName && 
			CommonUtils.getBasename(CommonUtils.getDirname(p)) === parentDir
		);

		if (stillConflicting.length === 0) {
			return displayName;
		}

		// If still conflicting, use full relative path
		return path;
	}

	private resolvePathToUri(path: string): URI | null {
		if (!path) {
			return null;
		}

		if (path.startsWith('__UNSAVED_')) {
			const match = path.match(/^__UNSAVED_(\w+)__\/(.+)$/);
			if (match) {
				const [, , fileName] = match;
				return URI.from({ scheme: 'untitled', path: fileName });
			}
		}

		// Handle regular file paths
		if (CommonUtils.isAbsolutePath(path)) {
			return URI.file(path);
		}

		// Handle untitled scheme
		if (path.startsWith('untitled:')) {
			return URI.parse(path);
		}

		return null;
	}

	private async fileExists(path: string): Promise<boolean> {
		try {
			const uri = this.resolvePathToUri(path);
			if (uri) {
				await this.fileService.stat(uri);
				return true;
			}
		} catch {
			// File doesn't exist or error accessing
		}
		return false;
	}

	private async getDirectoryFiles(dirPath: string): Promise<string[]> {
		const uri = this.resolvePathToUri(dirPath);
		if (!uri) {
			return [];
		}

		try {
			const stat = await this.fileService.resolve(uri);
			return stat.children?.map(child => child.name) || [];
		} catch {
			return [];
		}
	}

	private async getDirectoryFilesRecursive(dirPath: string): Promise<string[]> {
		const files: string[] = [];
		const uri = this.resolvePathToUri(dirPath);
		if (!uri) {
			return files;
		}

		try {
			const stat = await this.fileService.resolve(uri);
			
			if (stat.children) {
				for (const child of stat.children) {
					const childPath = `${dirPath}/${child.name}`;
					
					if (child.isFile) {
						files.push(childPath);
					} else if (child.isDirectory) {
						const subFiles = await this.getDirectoryFilesRecursive(childPath);
						files.push(...subFiles);
					}
				}
			}
		} catch {
			// Error reading directory
		}

		return files;
	}



	private getCategorizedEnvironmentVariables(): Record<string, string> {
		// In browser environment, we can only access limited environment-like data
		const envVars: Record<string, string> = {};
		
		// Add some basic browser/VS Code environment information
		envVars['USER_AGENT'] = navigator.userAgent;
		envVars['PLATFORM'] = navigator.platform;
		envVars['LANGUAGE'] = navigator.language;
		
		return envVars;
	}
}
