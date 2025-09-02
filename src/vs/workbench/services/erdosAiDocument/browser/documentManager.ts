/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { EditorResourceAccessor } from '../../../common/editor.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IJupytextService, NotebookPreservationData } from '../../erdosAiIntegration/browser/jupytextService.js';
import { DocumentInfo, MatchOptions, MatchResult } from '../common/documentUtils.js';
import { IDocumentManager } from '../common/documentManager.js';

export class DocumentManager extends Disposable implements IDocumentManager {
	readonly _serviceBrand: undefined;
	
	private notebookPreservationData = new Map<string, NotebookPreservationData>();

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IJupytextService private readonly jupytextService: IJupytextService,
		@ICommonUtils private readonly commonUtils: ICommonUtils
	) {
		super();
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
			const isSaved = !textFileModel?.isDirty();
			
			let content = '';
			if (includeContent) {
				let rawContent = '';
				
				if (model) {
					try {
						rawContent = model.getValue();
					} catch (error) {
					}
				}
				
				if (!rawContent && textFileModel) {
					try {
						const textContent = textFileModel.textEditorModel?.getValue();
						if (textContent) {
							rawContent = textContent;
						}
					} catch (error) {
					}
				}
				
				if (!rawContent) {
					try {
						const fileContent = await this.fileService.readFile(resource);
						if (fileContent) {
							rawContent = fileContent.value.toString();
						}
					} catch (error) {
					}
				}
				
				if (rawContent) {
					try {
						if (this.isJupyterNotebook(resource)) {
							try {
								content = await this.jupytextService.notebookContentToText(rawContent, {
									extension: '.py',
									format_name: 'percent'
								});
							} catch (conversionError) {
								content = rawContent;
							}
						} else {
							content = rawContent;
						}
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

	async processContentForWriting(filePath: string, content: string, conversationDir?: string): Promise<string> {
		const uri = URI.file(filePath);
		
		if (this.isJupyterNotebook(uri)) {
			try {
				const preservationData = this.notebookPreservationData.get(filePath);
				
				if (preservationData) {
					const notebookJson = await this.jupytextService.textToNotebookWithPreservation(
						content, 
						preservationData, 
						{
							extension: '.py',
							format_name: 'percent'
						}
					);
					
					this.notebookPreservationData.delete(filePath);
					
					return notebookJson;
				} else {
					let tempFilePath: string;
					if (conversationDir) {
						const conversationDirFsPath = conversationDir.startsWith('file:') 
							? URI.parse(conversationDir).fsPath 
							: conversationDir;
						const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substring(2)}.py`;
						tempFilePath = `${conversationDirFsPath}/${tempFileName}`;
					} else {
						const storageLocation = this.workspaceContextService.getWorkspace().folders.length > 0 
							? this.workspaceContextService.getWorkspace().folders[0].uri.fsPath
							: process.cwd();
						const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substring(2)}.py`;
						tempFilePath = `${storageLocation}/.vscode/erdosAi/temp/${tempFileName}`;
					}
					
					await this.fileService.writeFile(URI.file(tempFilePath), VSBuffer.fromString(content));
					
					try {
						const notebookJson = await this.jupytextService.textToNotebook(tempFilePath, {
							extension: '.py',
							format_name: 'percent'
						});
						
						return notebookJson;
					} finally {
						try {
							await this.fileService.del(URI.file(tempFilePath));
						} catch (cleanupError) {
						}
					}
				}
			} catch (error) {
				const errorMsg = `Jupytext Python-to-notebook conversion failed for ${filePath}: ${error instanceof Error ? error.message : error}`;
				throw new Error(errorMsg);
			}
		}
		
		return content;
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
				const workspaces = this.workspaceContextService?.getWorkspace().folders;
				return workspaces && workspaces.length > 0 ? workspaces[0].uri.fsPath : process.cwd();
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

		if (this.isJupyterNotebook(result.uri)) {
			try {
				let conversionResult: any;
				
				if (result.isFromEditor && content) {
					conversionResult = await this.jupytextService.notebookContentToTextWithPreservation(content, {
						extension: '.ipynb',
						format_name: 'percent'
					});
				} else {
					conversionResult = await this.jupytextService.notebookToTextWithPreservation(result.uri.fsPath, {
						extension: '.ipynb',
						format_name: 'percent'
					});
				}
				
				conversionResult.preservationData.filePath = result.uri.fsPath;
				this.notebookPreservationData.set(result.uri.fsPath, conversionResult.preservationData);
				
				content = conversionResult.pythonText;
			} catch (error) {
				throw new Error(`Jupytext conversion failed for ${result.uri.fsPath}: ${error instanceof Error ? error.message : error}`);
			}
		}

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
				const workspaces = this.workspaceContextService?.getWorkspace().folders;
				return workspaces && workspaces.length > 0 ? workspaces[0].uri.fsPath : process.cwd();
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

	private isJupyterNotebook(uri: URI): boolean {
		return uri.path.endsWith('.ipynb');
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
}
