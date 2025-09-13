/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { IPathService } from '../../path/common/pathService.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { EditorResourceAccessor } from '../../../common/editor.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { DocumentInfo, MatchOptions, MatchResult } from '../common/documentUtils.js';
import { IDocumentManager } from '../common/documentManager.js';
import { INotebookService } from '../../../contrib/notebook/common/notebookService.js';
import { CellKind } from '../../../contrib/notebook/common/notebookCommon.js';
import { SnapshotContext } from '../../../services/workingCopy/common/fileWorkingCopy.js';
import { IJupytextService } from '../../erdosAiIntegration/common/jupytextService.js';

export class DocumentManager extends Disposable implements IDocumentManager {
	readonly _serviceBrand: undefined;
	

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
		@IPathService private readonly pathService: IPathService,
		@INotebookService private readonly notebookService: INotebookService,
		@IJupytextService private readonly jupytextService: IJupytextService
	) {
		super();
	}

	private convertNotebookContentIfNeeded(content: string, filePath: string): string {
		const fileExtension = this.commonUtils.getFileExtension(filePath).toLowerCase();
		
		if (fileExtension === 'ipynb') {
			try {
				const convertedContent = this.jupytextService.convertNotebookToText(
					content, 
					{ extension: '.py', format_name: 'percent' }
				);
				
				return convertedContent;
			} catch (error) {
				// If conversion fails, include error info but continue with raw content
				return `# Jupytext conversion failed: ${error instanceof Error ? error.message : error}\n\n${content}`;
			}
		}
		
		return content;
	}

	private createMarkdownSearchVariant(searchText: string): string {
		// Convert pasted markdown to how it would appear in Jupytext
		// Each line gets prefixed with "# " in Jupytext markdown cells
		// BUT empty lines become just "#" (no space)
		const lines = searchText.split('\n');
		const jupytextLines = lines.map(line => {
			if (line.trim() === '') {
				return '#';  // Empty lines become just "#"
			} else {
				return `# ${line}`;  // Non-empty lines get "# " prefix
			}
		});
		return jupytextLines.join('\n');
	}

	private searchInContent(content: string, searchText: string, isJupyterNotebook: boolean = false): { pos: number; actualSearchText: string } {
		// First try exact match
		let pos = content.indexOf(searchText);
		if (pos !== -1) {
			return { pos, actualSearchText: searchText };
		}

		// For Jupyter notebooks, always try markdown variant (for markdown cells)
		// This handles cases where user copied raw markdown but it appears prefixed in Jupytext
		if (isJupyterNotebook) {
			const markdownVariant = this.createMarkdownSearchVariant(searchText);
			pos = content.indexOf(markdownVariant);
			if (pos !== -1) {
				return { pos, actualSearchText: markdownVariant };
			}
		}

		return { pos: -1, actualSearchText: searchText };
	}

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
			
			const model = this.modelService.getModel(resource);
			
			const isActive = activeResource?.toString() === uriString;
			const textFileModel = this.textFileService.files.get(resource);
			
			// Check if file is dirty
			let isSaved = !textFileModel?.isDirty();
			
			let content = '';
			if (includeContent) {
				let rawContent = '';				
				// For notebook files, use notebook service to get unsaved content
				if (this.commonUtils.getFileExtension(resource.fsPath).toLowerCase() === 'ipynb') {
					try {
						const notebookModel = this.notebookService.getNotebookTextModel(resource);
						if (notebookModel) {
							// Create snapshot and convert to JSON
							const snapshot = notebookModel.createSnapshot({ 
								context: SnapshotContext.Backup, 
								outputSizeLimit: Number.MAX_SAFE_INTEGER 
							});
							
							// Convert to JSON format (same as .ipynb file format)
							const notebookJson = {
								cells: snapshot.cells.map(cell => ({
									cell_type: cell.cellKind === CellKind.Markup ? 'markdown' : 'code',
									metadata: cell.metadata || {},
									source: Array.isArray(cell.source) ? cell.source : [cell.source],
									...(cell.cellKind === CellKind.Code && { // Only for code cells
										execution_count: null,
										outputs: cell.outputs || []
									})
								})),
								metadata: snapshot.metadata || {},
								nbformat: 4,
								nbformat_minor: 5
							};
							
							rawContent = JSON.stringify(notebookJson, null, 2);
						}
					} catch (error) {
						// If notebook model fails, fall back to file system
						try {
							const fileContent = await this.fileService.readFile(resource);
							if (fileContent) {
								rawContent = fileContent.value.toString();
							}
						} catch (fileError) {
							// File not found or other error
						}
					}
				} else {
					// For regular files, try text model first, then file system
					if (model) {
						try {
							rawContent = model.getValue();
						} catch (error) {
							// Continue to next fallback
						}
					}
					
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
					
					if (!rawContent) {
						try {
							const fileContent = await this.fileService.readFile(resource);
							if (fileContent) {
								rawContent = fileContent.value.toString();
							}
						} catch (error) {
							// File not found or other error
						}
					}
				}
				
				if (rawContent) {
					try {
						content = rawContent;
					} catch (error) {
						content = rawContent;
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

	async updateOpenDocumentContent(documentIdOrPath: string, newContent: string, markClean: boolean = true): Promise<boolean> {
		try {
			const document = await this.findDocumentByIdOrPath(documentIdOrPath);
			if (!document) {
				return false;
			}

			const uri = URI.parse(document.uri);
			const model = this.modelService.getModel(uri);
			if (!model) {
				return false;
			}

			const textFileModel = this.textFileService.files.get(uri);
			
			if (textFileModel) {
				(textFileModel as any).ignoreDirtyOnModelContentChange = true;
				
				model.setValue(newContent);
				
				(textFileModel as any).ignoreDirtyOnModelContentChange = false;
				
				if (markClean && textFileModel.isDirty()) {
					(textFileModel as any).setDirty(false);
				}
			} else {
				model.setValue(newContent);
			}

			return true;
		} catch (error) {
			console.error('Failed to update document content:', error);
			return false;
		}
	}

	async getEffectiveFileContent(filePath: string, startLine?: number, endLine?: number): Promise<string | null> {
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
				const workspaceFolder = this.workspaceContextService?.getWorkspace().folders[0];
				if (workspaceFolder) {
					return workspaceFolder.uri.fsPath;
				}
				
				// Follow VSCode's pattern: fall back to user home directory when no workspace
				const userHome = await this.pathService.userHome();
				return userHome.fsPath;
			},
			fileExists: async (path: string) => {
				try {
					const uri = URI.file(path);
					
					if (!this.fileService) {
						return false;
					}
					
					const exists = await this.fileService.exists(uri);
					return exists || false;
				} catch (error) {
					return false;
				}
			},
			joinPath: (base: string, ...parts: string[]) => {
				return parts.reduce((acc, part) => acc + '/' + part, base);
			},
			getFileContent: async (uri: URI) => {
				try {
					if (uri.scheme === 'file') {
						
						const fileModel = await this.textModelService.createModelReference(uri);
						const content = fileModel.object.textEditorModel.getValue();
						fileModel.dispose();
						
						return content;
					}
					return '';
				} catch (error) {
					return '';
				}
			}
		};

		const result = await this.commonUtils.resolveFile(filePath, context);
		
		if (!result.found || !result.uri) {
			return null;
		}

		let content = result.content || '';

		// Note: Jupytext conversion removed - notebook files return raw JSON content

		if (startLine !== undefined && endLine !== undefined) {
			content = this.extractLines(content, startLine, endLine);
		}
		
		return content;
	}


	async isFileOpenInEditor(filePath: string): Promise<boolean> {
		const documents = await this.getAllOpenDocuments(false);
		return documents.some(doc => doc.path === filePath || this.commonUtils.getBasename(doc.path) === this.commonUtils.getBasename(filePath));
	}

	async getOpenDocumentContent(filePath: string): Promise<string | null> {
		if (!filePath || filePath.trim().length === 0) {
			return null;
		}

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
				const workspaceFolder = this.workspaceContextService?.getWorkspace().folders[0];
				if (workspaceFolder) {
					return workspaceFolder.uri.fsPath;
				}
				
				// Follow VSCode's pattern: fall back to user home directory when no workspace
				const userHome = await this.pathService.userHome();
				return userHome.fsPath;
			},
			fileExists: async () => false,
			joinPath: (base: string, ...parts: string[]) => {
				return parts.reduce((acc, part) => acc + '/' + part, base);
			},
			getFileContent: async () => ''
		};

		const result = await this.commonUtils.resolveFile(filePath, context);
		return result.found && result.isFromEditor ? result.content || null : null;
	}


	private generateDocumentId(uri: URI): string {
		return uri.toString().replace(/[^a-zA-Z0-9]/g, '_').substring(0, 16);
	}

	private getEffectivePath(uri: URI, model?: ITextModel): string {
		if (uri.scheme === 'untitled') {
			const fileName = this.commonUtils.getBasename(uri.path) || 'Untitled';
			const docId = this.generateDocumentId(uri);
			return `__UNSAVED_${docId.substring(0, 4)}__/${fileName}`;
		}
		
		return uri.fsPath;
	}

	private async findDocumentByIdOrPath(documentIdOrPath: string): Promise<{ uri: string } | null> {
		const documents = await this.getAllOpenDocuments(false);
		
		let document = documents.find(doc => doc.id === documentIdOrPath);
		if (document) {
			const uri = this.commonUtils.isAbsolutePath(document.path) ? URI.file(document.path) : URI.parse(document.path);
			return { uri: uri.toString() };
		}

		document = documents.find(doc => 
			doc.path === documentIdOrPath || 
			this.normalizePathForComparison(doc.path) === this.normalizePathForComparison(documentIdOrPath)
		);
		if (document) {
			const uri = this.commonUtils.isAbsolutePath(document.path) ? URI.file(document.path) : URI.parse(document.path);
			return { uri: uri.toString() };
		}

		return null;
	}

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
					line: lineIndex + 1,
					column: match.column + 1,
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
		const start = Math.max(0, startLine - 1);
		const end = Math.min(lines.length, endLine);
		return lines.slice(start, end).join('\n');
	}

	private normalizePathForComparison(path: string): string {
		return path.replace(/\\/g, '/').toLowerCase();
	}

	async checkPastedTextInOpenDocuments(pastedText: string): Promise<{filePath: string; startLine: number; endLine: number; content: string} | null> {
		
		if (!pastedText || pastedText.trim().length === 0) {
			return null;
		}

		let searchText = pastedText.trim();
		searchText = searchText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

		const hasLineBreak = searchText.includes('\n');
		let isCompleteLine = false;

		if (!hasLineBreak) {
			const documents = await this.getAllOpenDocuments(true);
			
			for (const doc of documents) {
				if (!doc.content || doc.content.length === 0) {
					continue;
				}

				let content = doc.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
				
				// Convert Jupyter notebooks to Jupytext format before searching
				content = this.convertNotebookContentIfNeeded(content, doc.path);
				
				const lines = content.split('\n');
				
				const isJupyterNotebook = this.commonUtils.getFileExtension(doc.path).toLowerCase() === 'ipynb';
				
				for (const line of lines) {
					const trimmedLine = line.trim();
					const trimmedSearch = searchText.trim();
					if (trimmedLine.length > 0 && trimmedLine === trimmedSearch) {
						isCompleteLine = true;
						break;
					}
					
					// Second check: For Jupyter notebooks, always check markdown prefixed variant
					if (isJupyterNotebook) {
						const markdownPrefixed = `# ${trimmedSearch}`;
						if (trimmedLine === markdownPrefixed) {
							isCompleteLine = true;
							break;
						}
					}
				}
				
				if (isCompleteLine) {
					break;
				}
			}
		}

		const hasLine = hasLineBreak || isCompleteLine;

		if (!hasLine) {
			return null;
		}

		const documents = await this.getAllOpenDocuments(true);

		for (const doc of documents) {
			if (!doc.content || doc.content.length === 0) {
				continue;
			}

			let content = doc.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
			
			// Convert Jupyter notebooks to Jupytext format before searching
			content = this.convertNotebookContentIfNeeded(content, doc.path);
						
			const isJupyterNotebook = this.commonUtils.getFileExtension(doc.path).toLowerCase() === 'ipynb';
			const searchResult = this.searchInContent(content, searchText, isJupyterNotebook);
			if (searchResult.pos !== -1) {
				
				const lines = content.split('\n');
				
				let currentPos = 0;
				let startLine = 1;
				let endLine = 1;
				
				for (let lineNum = 0; lineNum < lines.length; lineNum++) {
					const lineLength = lines[lineNum].length + 1;
					
					if (currentPos <= searchResult.pos && searchResult.pos < currentPos + lineLength) {
						startLine = lineNum + 1;
						break;
					}
					currentPos += lineLength;
				}
				
				const matchEnd = searchResult.pos + searchResult.actualSearchText.length;
				currentPos = 0;
				
				for (let lineNum = 0; lineNum < lines.length; lineNum++) {
					const lineLength = lines[lineNum].length + 1;
					
					if (currentPos <= matchEnd && matchEnd <= currentPos + lineLength) {
						endLine = lineNum + 1;
						break;
					}
					currentPos += lineLength;
				}
				
				// Extract the actual content that was found
				const foundContent = searchResult.actualSearchText;

				return {
					filePath: doc.path,
					startLine: startLine,
					endLine: endLine,
					content: foundContent
				};
			}
		}

		return null;
	}
}
