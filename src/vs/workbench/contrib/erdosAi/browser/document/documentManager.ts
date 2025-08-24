/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { CommonUtils } from '../utils/commonUtils.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { EditorResourceAccessor } from '../../../../common/editor.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IJupytextService, NotebookPreservationData } from '../services/jupytextService.js';

export interface DocumentInfo {
	id: string;
	path: string;
	content: string;
	isActive: boolean;
	isSaved: boolean;
	metadata: {
		timestamp: string;
		lineCount: number;
		language: string;
		encoding?: string;
		dirty?: boolean;
		created?: number;
		lastContentUpdate?: number;
		lastKnownWriteTime?: number;
	};
}

export interface MatchOptions {
	caseSensitive?: boolean;
	wholeWord?: boolean;
	regex?: boolean;
}

export interface MatchResult {
	documentId: string;
	documentPath: string;
	line: number;
	column: number;
	matchText: string;
	contextBefore: string;
	contextAfter: string;
}

/**
 * Document manager for Erdos AI to access and manipulate open documents
 */
export class DocumentManager extends Disposable {
	
	// Storage for notebook preservation data
	private notebookPreservationData = new Map<string, NotebookPreservationData>();

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IJupytextService private readonly jupytextService: IJupytextService
	) {
		super();
	}

	/**
	 * Get all currently open documents with their content
	 */
	async getAllOpenDocuments(includeContent: boolean = true): Promise<DocumentInfo[]> {
		const documents: DocumentInfo[] = [];
		const activeEditorPane = this.editorService.activeEditorPane;
		const activeResource = activeEditorPane?.input ? EditorResourceAccessor.getOriginalUri(activeEditorPane.input) : undefined;
		const allEditors = this.editorService.editors;
		const processedUris = new Set<string>();
		for (const editor of allEditors) {
			const resource = EditorResourceAccessor.getOriginalUri(editor);
			if (!resource || (resource.scheme !== 'file' && resource.scheme !== 'untitled')) {
				continue;
			}
			
			const uriString = resource.toString();
			if (processedUris.has(uriString)) {
				continue;
			}
			processedUris.add(uriString);
			
			// Try to get the model for this editor
			const model = this.modelService.getModel(resource);
			
			const isActive = activeResource?.toString() === uriString;
			const textFileModel = this.textFileService.files.get(resource);
			const isSaved = !textFileModel?.isDirty();
			
			let content = '';
			if (includeContent) {
				let rawContent = '';
				
				if (model) {
					try {
						rawContent = model.getValue();
					} catch (error) {
						// Continue to fallback
					}
				}
				
				// If no model or no content from model, try textFileService
				if (!rawContent && textFileModel) {
					try {
						const textContent = textFileModel.textEditorModel?.getValue();
						if (textContent) {
							rawContent = textContent;
						}
					} catch (error) {
						// Continue to next fallback
					}
				}
				
				// If still no content, try reading from file system
				if (!rawContent) {
					try {
						const fileContent = await this.fileService.readFile(resource);
						if (fileContent) {
							rawContent = fileContent.value.toString();
						}
					} catch (error) {
						// Use empty content as final fallback
					}
				}
				
				// Process the content (Jupyter conversion if needed)
				if (rawContent) {
					try {
						// Check if this is a Jupyter notebook and convert to Python format
						if (this.isJupyterNotebook(resource)) {
							try {
								const notebook = JSON.parse(rawContent);
								content = await this.jupytextService.notebookToText(notebook, {
									extension: '.py',
									format_name: 'percent'
								});
							} catch (conversionError) {
								// Fall back to raw content if conversion fails
								content = rawContent;
							}
						} else {
							content = rawContent;
						}
					} catch (error) {
						content = rawContent; // Use raw content as fallback
					}
				}
			}

			const documentInfo: DocumentInfo = {
				id: this.generateDocumentId(resource),
				path: this.getEffectivePath(resource, model || undefined),
				content: content,
				isActive,
				isSaved,
				metadata: {
					timestamp: new Date().toISOString(),
					lineCount: model ? model.getLineCount() : 0,
					language: model ? model.getLanguageId() : 'unknown',
					encoding: textFileModel?.getEncoding(),
					dirty: textFileModel?.isDirty(),
					created: undefined,
					lastContentUpdate: Date.now(),
					lastKnownWriteTime: undefined
				}
			};

			documents.push(documentInfo);
		}

		return documents;
	}

	/**
	 * Get the active document (currently focused editor)
	 */
	async getActiveDocument(): Promise<DocumentInfo | null> {
		const activeEditorPane = this.editorService.activeEditorPane;
		if (!activeEditorPane?.input) {
			return null;
		}

		const resource = EditorResourceAccessor.getOriginalUri(activeEditorPane.input);
		if (!resource) {
			return null;
		}

		const model = this.modelService.getModel(resource);
		if (!model) {
			return null;
		}

		const textFileModel = this.textFileService.files.get(resource);
		
		return {
			id: this.generateDocumentId(resource),
			path: this.getEffectivePath(resource, model),
			content: model.getValue(),
			isActive: true,
			isSaved: !textFileModel?.isDirty(),
			metadata: {
				timestamp: new Date().toISOString(),
				lineCount: model.getLineCount(),
				language: model.getLanguageId(),
				encoding: textFileModel?.getEncoding(),
				dirty: textFileModel?.isDirty(),
				created: undefined,
				lastContentUpdate: Date.now(),
				lastKnownWriteTime: undefined
			}
		};
	}

	/**
	 * Search for text matches in all open documents
	 */
	async matchTextInOpenDocuments(searchText: string, options?: MatchOptions): Promise<MatchResult[]> {
		const results: MatchResult[] = [];
		
		if (!searchText || searchText.trim().length === 0) {
			return results;
		}

		const documents = await this.getAllOpenDocuments(true);
		
		for (const doc of documents) {
			const matches = this.findTextMatches(doc, searchText, options);
			results.push(...matches);
		}

		return results;
	}

	/**
	 * Update the content of an open document
	 */
	async updateOpenDocumentContent(documentIdOrPath: string, newContent: string, markClean: boolean = true): Promise<boolean> {
		try {
			// Find the document by ID or path
			const document = await this.findDocumentByIdOrPath(documentIdOrPath);
			if (!document) {
				return false;
			}

			const uri = URI.parse(document.uri);
			const model = this.modelService.getModel(uri);
			if (!model) {
				return false;
			}

			// Handle dirty state properly when updating content
			const textFileModel = this.textFileService.files.get(uri);
			
			if (textFileModel) {
				// Set the ignore dirty flag to prevent marking as dirty when updating content
				(textFileModel as any).ignoreDirtyOnModelContentChange = true;
				
				// Update the model content
				model.setValue(newContent);
				
				// Clear the ignore dirty flag
				(textFileModel as any).ignoreDirtyOnModelContentChange = false;
				
				// Handle dirty state if requested
				if (markClean && textFileModel.isDirty()) {
					// Mark as saved to clear dirty state
					(textFileModel as any).setDirty(false);
				}
			} else {
				// Fallback: just update the model content
				model.setValue(newContent);
			}

			return true;
		} catch (error) {
			console.error('Failed to update document content:', error);
			return false;
		}
	}

	/**
	 * Check if a document is saved (not dirty)
	 */
	isDocumentSaved(documentIdOrPath: string): boolean {
		const uri = this.resolveDocumentUri(documentIdOrPath);
		if (!uri) {
			return false;
		}

		const textFileModel = this.textFileService.files.get(uri);
		return !textFileModel?.isDirty();
	}

	/**
	 * Get the file path for a document
	 */
	getDocumentPath(documentIdOrPath: string): string {
		const uri = this.resolveDocumentUri(documentIdOrPath);
		if (!uri) {
			return '';
		}

		const model = this.modelService.getModel(uri);
		return this.getEffectivePath(uri, model || undefined);
	}

	/**
	 */
	createSyntheticPath(document: DocumentInfo): string {
		if (document.path && !document.path.startsWith('untitled:')) {
			return document.path;
		}

		const docIdShort = document.id.substring(0, 4);
		const fileName = this.extractFileNameFromPath(document.path) || 'Untitled';
		
		return `__UNSAVED_${docIdShort}__/${fileName}`;
	}

	/**
	 * Check if a file is a Jupyter notebook
	 */
	private isJupyterNotebook(uri: URI): boolean {
		return uri.path.endsWith('.ipynb');
	}

	/**
	 * Process content for writing to file, converting Python back to .ipynb format if needed
	 * Uses smart merging to preserve outputs for unchanged cells
	 */
	async processContentForWriting(filePath: string, content: string, conversationDir?: string): Promise<string> {
		const uri = URI.file(filePath);
		
		// Check if this is a jupyter notebook file
		if (this.isJupyterNotebook(uri)) {
			try {
				// Check if we have preservation data for this file
				const preservationData = this.notebookPreservationData.get(filePath);
				
				if (preservationData) {
					// Use smart merging to preserve outputs for unchanged cells
					const notebookJson = await this.jupytextService.textToNotebookWithPreservation(
						content, 
						preservationData, 
						{
							extension: '.py',
							format_name: 'percent'
						}
					);
					
					// Clean up the preservation data
					this.notebookPreservationData.delete(filePath);
					
					return notebookJson;
				} else {
					// Fallback to regular conversion if no preservation data available
					// This happens for new files or files read without preservation
					
					// Use conversation folder for temporary files (alongside conversation_log.json)
					let tempFilePath: string;
					if (conversationDir) {
						// Use the specific conversation directory provided
						const conversationDirFsPath = conversationDir.startsWith('file:') 
							? URI.parse(conversationDir).fsPath 
							: conversationDir;
						const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substring(2)}.py`;
						tempFilePath = `${conversationDirFsPath}/${tempFileName}`;
					} else {
						// Fallback to workspace-based temp directory
						const storageLocation = this.workspaceContextService.getWorkspace().folders.length > 0 
							? this.workspaceContextService.getWorkspace().folders[0].uri.fsPath
							: process.cwd();
						const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substring(2)}.py`;
						tempFilePath = `${storageLocation}/.vscode/erdosAi/temp/${tempFileName}`;
					}
					
					// Write content to temporary file
					await this.fileService.writeFile(URI.file(tempFilePath), VSBuffer.fromString(content));
					
					try {
						// Convert Python file to notebook format
						const notebookJson = await this.jupytextService.textToNotebook(tempFilePath, {
							extension: '.py',
							format_name: 'percent'
						});
						
						return notebookJson;
					} finally {
						// Clean up temporary file
						try {
							await this.fileService.del(URI.file(tempFilePath));
						} catch (cleanupError) {
							// Ignore cleanup errors
						}
					}
				}
			} catch (error) {
				// CRITICAL: Don't fall back - this masks conversion issues
				const errorMsg = `Jupytext Python-to-notebook conversion failed for ${filePath}: ${error instanceof Error ? error.message : error}`;
				throw new Error(errorMsg);
			}
		}
		
		// Return original content for non-notebook files
		return content;
	}

	/**
	 * Get effective file content, handling both saved and unsaved files
	 * For .ipynb files, automatically converts to Python format using jupytext
	 */
	async getEffectiveFileContent(filePath: string, startLine?: number, endLine?: number): Promise<string | null> {
		// Use unified file resolution system
		const context = {
			getAllOpenDocuments: async () => {
				const docs = await this.getAllOpenDocuments(true);
				return docs.map(doc => ({
					path: doc.path,
					content: doc.content,
					isDirty: !doc.isSaved,
					isActive: doc.isActive,
					isSaved: doc.isSaved
				}));
			},
			getCurrentWorkingDirectory: async () => {
				const workspaces = this.workspaceContextService?.getWorkspace().folders;
				return workspaces && workspaces.length > 0 ? workspaces[0].uri.fsPath : process.cwd();
			},
			fileExists: async (path: string) => {
				try {
					const uri = URI.file(path);
					// Removed debug:.fileExists] Created URI: ${uri.toString()}`);
					// Removed debug:.fileExists] URI scheme: ${uri.scheme}, fsPath: "${uri.fsPath}"`);
					
					if (!this.fileService) {
						// Removed debug:.fileExists] fileService is null/undefined!`);
						return false;
					}
					
					const exists = await this.fileService.exists(uri);
					// Removed debug:.fileExists] fileService.exists returned: ${exists}`);
					return exists || false;
				} catch (error) {
					// Removed debug:.fileExists] Error checking file existence: ${error}`);
					return false;
				}
			},
			joinPath: (base: string, ...parts: string[]) => {
				return parts.reduce((acc, part) => acc + '/' + part, base);
			},
			getFileContent: async (uri: URI) => {
				// Removed debug:.getFileContent] Reading content from URI: ${uri.toString()}`);
				try {
					if (uri.scheme === 'file') {
						// Removed debug:.getFileContent] File scheme detected, creating model reference...`);
						const fileModel = await this.textModelService.createModelReference(uri);
						// Removed debug:.getFileContent] Model reference created successfully`);
						const content = fileModel.object.textEditorModel.getValue();
						// Removed debug:.getFileContent] Content retrieved, length: ${content.length}`);
						fileModel.dispose();
						return content;
					}
					// Removed debug:.getFileContent] Non-file scheme (${uri.scheme}), returning empty string`);
					return '';
				} catch (error) {
					// Removed debug:.getFileContent] Failed to read file content: ${error}`);
					return '';
				}
			}
		};

		const result = await CommonUtils.resolveFile(filePath, context);
		
		if (!result.found || !result.uri) {
			return null;
		}

		let content = result.content || '';

		// Check if this is a jupyter notebook and convert using jupytext service
		if (this.isJupyterNotebook(result.uri)) {
			try {
				let conversionResult: any;
				
				// If content came from editor (unsaved changes), use content-based conversion
				if (result.isFromEditor && content) {
					// Convert from raw notebook content to preserve unsaved outputs
					conversionResult = await this.jupytextService.notebookContentToTextWithPreservation(content, {
						extension: '.ipynb',
						format_name: 'percent'
					});
				} else {
					// Convert from file path for saved files
					conversionResult = await this.jupytextService.notebookToTextWithPreservation(result.uri.fsPath, {
						extension: '.ipynb',
						format_name: 'percent'
					});
				}
				
				// Set the file path in preservation data and store for later use in writing
				conversionResult.preservationData.filePath = result.uri.fsPath;
				this.notebookPreservationData.set(result.uri.fsPath, conversionResult.preservationData);
				
				content = conversionResult.pythonText;
			} catch (error) {
				// CRITICAL: Don't fall back - this masks conversion issues
				throw new Error(`Jupytext conversion failed for ${result.uri.fsPath}: ${error instanceof Error ? error.message : error}`);
			}
		}

		// Apply line range extraction if specified
		if (startLine !== undefined && endLine !== undefined) {
			content = this.extractLines(content, startLine, endLine);
		}
		
		return content;
	}

	/**
	 * Check if a file is currently open in the editor
	 */
	checkIfFileOpenInEditor(filePath: string): boolean {
		// Use simplified check with getAllOpenDocuments
		try {
			// For synchronous check, use async version in background
			this.getAllOpenDocuments(false).then(docs => {
				return docs.some(doc => doc.path === filePath || CommonUtils.getBasename(doc.path) === CommonUtils.getBasename(filePath));
			});
			return false; // Return false for synchronous call since we can't wait
		} catch {
			return false;
		}
	}

	/**
	 * Check if a file is currently open in the editor (async version for external API compatibility)
	 */
	async isFileOpenInEditor(filePath: string): Promise<boolean> {
		const documents = await this.getAllOpenDocuments(false);
		return documents.some(doc => doc.path === filePath || CommonUtils.getBasename(doc.path) === CommonUtils.getBasename(filePath));
	}

	/**
	 */
	async getOpenDocumentContent(filePath: string): Promise<string | null> {
		if (!filePath || filePath.trim().length === 0) {
			return null;
		}

		// Use unified file resolution system for open document content
		const context = {
			getAllOpenDocuments: async () => {
				const docs = await this.getAllOpenDocuments(true);
				return docs.map(doc => ({
					path: doc.path,
					content: doc.content,
					isDirty: !doc.isSaved,
					isActive: doc.isActive,
					isSaved: doc.isSaved
				}));
			},
			getCurrentWorkingDirectory: async () => {
				const workspaces = this.workspaceContextService?.getWorkspace().folders;
				return workspaces && workspaces.length > 0 ? workspaces[0].uri.fsPath : process.cwd();
			},
			fileExists: async () => false, // Only check open documents
			joinPath: (base: string, ...parts: string[]) => {
				return parts.reduce((acc, part) => acc + '/' + part, base);
			},
			getFileContent: async () => '' // Not used for open document lookup
		};

		const result = await CommonUtils.resolveFile(filePath, context);
		return result.found && result.isFromEditor ? result.content || null : null;
	}

	// Private helper methods

	private generateDocumentId(uri: URI): string {
		// Generate a consistent ID based on the URI
		// This ensures the same document always gets the same ID
		return uri.toString().replace(/[^a-zA-Z0-9]/g, '_').substring(0, 16);
	}

	private getEffectivePath(uri: URI, model?: ITextModel): string {
		if (uri.scheme === 'untitled') {
			// Handle untitled documents with synthetic paths
			const fileName = CommonUtils.getBasename(uri.path) || 'Untitled';
			const docId = this.generateDocumentId(uri);
			return `__UNSAVED_${docId.substring(0, 4)}__/${fileName}`;
		}
		
		return uri.fsPath;
	}

	private async findDocumentByIdOrPath(documentIdOrPath: string): Promise<{ uri: string } | null> {
		const documents = await this.getAllOpenDocuments(false);
		
		// Try to find by ID first
		let document = documents.find(doc => doc.id === documentIdOrPath);
		if (document) {
			const uri = CommonUtils.isAbsolutePath(document.path) ? URI.file(document.path) : URI.parse(document.path);
			return { uri: uri.toString() };
		}

		// Try to find by path
		document = documents.find(doc => 
			doc.path === documentIdOrPath || 
			this.normalizePathForComparison(doc.path) === this.normalizePathForComparison(documentIdOrPath)
		);
		if (document) {
			const uri = CommonUtils.isAbsolutePath(document.path) ? URI.file(document.path) : URI.parse(document.path);
			return { uri: uri.toString() };
		}

		return null;
	}

	private resolveDocumentUri(documentIdOrPath: string): URI | null {
		// Try parsing as URI first
		try {
			return URI.parse(documentIdOrPath);
		} catch {
			// For simple cases, create URI directly
			if (CommonUtils.isAbsolutePath(documentIdOrPath)) {
				return URI.file(documentIdOrPath);
			}
			return null;
		}
	}

	// REMOVED: Old path resolution methods replaced with CommonUtils.resolveFile

	private findTextMatches(document: DocumentInfo, searchText: string, options?: MatchOptions): MatchResult[] {
		const results: MatchResult[] = [];
		const lines = document.content.split('\n');
		
		for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
			const line = lines[lineIndex];
			const matches = this.findLineMatches(line, searchText, options);
			
			for (const match of matches) {
				results.push({
					documentId: document.id,
					documentPath: document.path,
					line: lineIndex + 1, // 1-based line numbers
					column: match.column + 1, // 1-based column numbers
					matchText: match.text,
					contextBefore: this.getContextBefore(lines, lineIndex, match.column),
					contextAfter: this.getContextAfter(lines, lineIndex, match.column + match.text.length)
				});
			}
		}

		return results;
	}

	private findLineMatches(line: string, searchText: string, options?: MatchOptions): Array<{ column: number; text: string }> {
		const matches: Array<{ column: number; text: string }> = [];
		
		if (options?.regex) {
			try {
				const flags = options.caseSensitive ? 'g' : 'gi';
				const regex = new RegExp(searchText, flags);
				let match;
				
				while ((match = regex.exec(line)) !== null) {
					matches.push({
						column: match.index,
						text: match[0]
					});
				}
			} catch {
				// Invalid regex, fall back to literal search
				return this.findLiteralMatches(line, searchText, options);
			}
		} else {
			return this.findLiteralMatches(line, searchText, options);
		}

		return matches;
	}

	private findLiteralMatches(line: string, searchText: string, options?: MatchOptions): Array<{ column: number; text: string }> {
		const matches: Array<{ column: number; text: string }> = [];
		const searchLine = options?.caseSensitive ? line : line.toLowerCase();
		const searchTerm = options?.caseSensitive ? searchText : searchText.toLowerCase();
		
		let startIndex = 0;
		while (true) {
			const index = searchLine.indexOf(searchTerm, startIndex);
			if (index === -1) {
				break;
			}

			// Check for whole word match if requested
			if (options?.wholeWord) {
				const beforeChar = index > 0 ? line[index - 1] : ' ';
				const afterChar = index + searchText.length < line.length ? line[index + searchText.length] : ' ';
				
				if (!/\W/.test(beforeChar) || !/\W/.test(afterChar)) {
					startIndex = index + 1;
					continue;
				}
			}

			matches.push({
				column: index,
				text: line.substring(index, index + searchText.length)
			});
			
			startIndex = index + 1;
		}

		return matches;
	}

	private getContextBefore(lines: string[], lineIndex: number, column: number): string {
		const line = lines[lineIndex];
		const beforeText = line.substring(Math.max(0, column - 50), column);
		return beforeText;
	}

	private getContextAfter(lines: string[], lineIndex: number, column: number): string {
		const line = lines[lineIndex];
		const afterText = line.substring(column, Math.min(line.length, column + 50));
		return afterText;
	}

	private extractLines(content: string, startLine: number, endLine: number): string {
		const lines = content.split('\n');
		const start = Math.max(0, startLine - 1); // Convert to 0-based
		const end = Math.min(lines.length, endLine); // endLine is inclusive
		return lines.slice(start, end).join('\n');
	}

	private normalizePathForComparison(path: string): string {
		// Normalize paths for comparison (handle different separators, etc.)
		return path.replace(/\\/g, '/').toLowerCase();
	}

	private extractFileNameFromPath(path: string): string {
		if (!path) {
			return 'Untitled';
		}
		
		return CommonUtils.getBasename(path) || 'Untitled';
	}
}
