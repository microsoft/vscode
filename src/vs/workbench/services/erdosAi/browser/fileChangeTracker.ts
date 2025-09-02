/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IViewZoneChangeAccessor, MouseTargetType, IViewZone } from '../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { IFileChangeTracker } from '../common/fileChangeTracker.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';

export class FileChangeTracker extends Disposable implements IFileChangeTracker {
	readonly _serviceBrand: undefined;
	private readonly conversationFileHighlighting = new Map<number, boolean>();
	private readonly fileDecorations = new Map<string, string[]>();
	private readonly fileDeletedContent = new Map<string, Map<number, string[]>>();
	private readonly fileViewZones = new Map<string, string[]>();
	private readonly fileViewZonesByLine = new Map<string, Map<number, string>>();
	private readonly fileViewZoneDomNodes = new Map<string, Map<number, HTMLElement>>();
	private readonly fileExpandedStates = new Map<string, Map<number, boolean>>();
	private readonly editorClickHandlers = new Set<string>();
	private modelContentChangeTimeout: any;
	private documentManager: any;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IModelService private readonly modelService: IModelService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
		@IConversationManager private readonly conversationManager: IConversationManager
	) {
		super();
	}

	setDocumentManager(documentManager: any): void {
		this.documentManager = documentManager;
	}

	async initializeFileChangeTracking(conversationId: number): Promise<void> {
		try {
			this.logService.info(`Initializing file change tracking for conversation ${conversationId}`);
			
			this.conversationFileHighlighting.set(conversationId, true);
			
			this.setupFileChangeListeners();
			
			await this.applyExistingFileHighlighting(conversationId);
			
			this.logService.info(`File change tracking initialized for conversation ${conversationId}`);
			
		} catch (error) {
			this.logService.error(`Failed to initialize file change tracking for conversation ${conversationId}:`, error);
		}
	}

	async getOriginalFileContent(filePath: string, conversationId: number): Promise<string | undefined> {
		try {
			const fileChanges = await this.loadFileChangesForConversation(conversationId);
			if (!fileChanges || !fileChanges.changes) {
				return undefined;
			}

			const change = fileChanges.changes
				.filter((c: any) => c.file_path === filePath)
				.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

			return change?.previous_content;
		} catch (error) {
			this.logService.error(`Failed to get original file content for ${filePath}:`, error);
			return undefined;
		}
	}

	async computeLineDiff(oldContent: string, newContent: string): Promise<Array<{
		type: 'added' | 'deleted' | 'unchanged';
		content: string;
		oldLine: number;
		newLine: number;
	}>> {
		const { computeLineDiff } = await import('../../erdosAiUtils/browser/diffUtils.js');
		
		const oldLines = oldContent ? oldContent.split('\n') : [];
		const newLines = newContent ? newContent.split('\n') : [];
		
		const diffResult = computeLineDiff(oldLines, newLines);
		
		return diffResult.diff.map(item => ({
			type: item.type as 'added' | 'deleted' | 'unchanged',
			content: item.content,
			oldLine: item.old_line || -1,
			newLine: item.new_line || -1
		}));
	}

	async applyFileChangeHighlighting(uri: URI, fileChange: any): Promise<void> {
		try {
			const conversationId = fileChange.conversation_id;
			
			if (!this.conversationFileHighlighting.get(conversationId)) {
				return;
			}

			const originalContent = fileChange.previous_content || '';

			let currentContent: string;
			const model = this.modelService.getModel(uri);
			if (model) {
				currentContent = model.getValue();
			} else {
				try {
					const fileContent = await this.fileService.readFile(uri);
					currentContent = fileContent.value.toString();
				} catch {
					currentContent = '';
				}
			}

			this.logService.debug(`Computing diff for: ${uri.toString()}`);
			this.logService.debug(`Original content from first file_changes.json entry has ${originalContent.split('\n').length} lines`);
			this.logService.debug(`Current content has ${currentContent.split('\n').length} lines`);
			
			const originalLines = originalContent.split('\n');
			const currentLines = currentContent.split('\n');
			this.logService.debug('First 5 original lines:', originalLines.slice(0, 5).map((line: string, i: number) => `${i+1}: "${line}"`));
			this.logService.debug('First 5 current lines:', currentLines.slice(0, 5).map((line: string, i: number) => `${i+1}: "${line}"`));

			if (originalContent === currentContent) {
				this.clearFileHighlighting(uri);
				return;
			}

			const diffEntries = await this.computeLineDiff(originalContent, currentContent);

			await this.applyDiffDecorations(uri, diffEntries);

		} catch (error) {
			this.logService.error(`Failed to apply file change highlighting for ${uri.toString()}:`, error);
		}
	}

	private updateGlyphMarginArrow(uri: URI, lineNumber: number, isExpanded: boolean): void {
		const model = this.modelService.getModel(uri);
		if (!model) return;
		
		const decorationIds = this.fileDecorations.get(uri.toString());
		if (!decorationIds) return;
		
		const decorations = model.getAllDecorations();
		
		for (const decoration of decorations) {
			if (decoration.range.startLineNumber === lineNumber && 
				decoration.options.glyphMarginClassName?.includes('erdos-ai-diff-deleted-arrow')) {
				
				const newClassName = isExpanded ? 'erdos-ai-diff-deleted-arrow-expanded' : 'erdos-ai-diff-deleted-arrow';
				
				const newDecoration = {
					range: decoration.range,
					options: {
						...decoration.options,
						glyphMarginClassName: newClassName,
						glyphMarginHoverMessage: {
							value: isExpanded ? 'Click to collapse deleted content' : 'Click to expand deleted content'
						}
					}
				};
				
				model.deltaDecorations([decoration.id], [newDecoration]);
				break;
			}
		}
	}

	clearAllFileHighlighting(): void {
		try {
			for (const uriString of this.fileDecorations.keys()) {
				const uri = URI.parse(uriString);
				this.clearFileHighlighting(uri);
			}
			
			this.fileDecorations.clear();
			this.fileViewZones.clear();
			this.fileViewZonesByLine.clear();
			this.fileDeletedContent.clear();
			this.fileExpandedStates.clear();
			this.fileViewZoneDomNodes.clear();
			this.editorClickHandlers.clear();
			
		} catch (error) {
			this.logService.error('Failed to clear all file highlighting:', error);
		}
	}

	private setupFileChangeListeners(): void {
		this._register(this.fileService.onDidFilesChange(e => {
			this.onFilesChanged();
		}));

		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.onActiveEditorChanged();
		}));

		this._register(this.modelService.onModelAdded((model) => {
			this._register(model.onDidChangeContent(() => {
				this.onModelContentChanged(model.uri);
			}));
		}));

		this.modelService.getModels().forEach(model => {
			this._register(model.onDidChangeContent(() => {
				this.onModelContentChanged(model.uri);
			}));
		});
	}

	private async applyExistingFileHighlighting(conversationId: number): Promise<void> {
		try {
			await this.applyHighlightingFromFileChanges(conversationId);
		} catch (error) {
			this.logService.error('Failed to apply existing file highlighting:', error);
		}
	}

	private async applyDiffDecorations(uri: URI, diffEntries: Array<{
		type: 'added' | 'deleted' | 'unchanged';
		content: string;
		oldLine: number;
		newLine: number;
	}>): Promise<void> {
		try {
			const model = this.modelService.getModel(uri);
			if (!model) {
				return;
			}

			this.clearFileHighlighting(uri);

			const addedLines = new Set<number>();
			const deletedLinesByPosition = new Map<number, string[]>();

		for (const diffEntry of diffEntries) {
			if (diffEntry.type === 'added' && diffEntry.newLine > 0) {
				addedLines.add(diffEntry.newLine);
			}
		}

			for (let i = 0; i < diffEntries.length; i++) {
				const diffEntry = diffEntries[i];
				
				if (diffEntry.type === 'deleted') {
					let nextUnchangedLine: typeof diffEntry | null = null;
					let minOldLineAfterDeletion = Number.MAX_VALUE;
					
					for (const otherEntry of diffEntries) {
						if (otherEntry.type === 'unchanged' && 
							otherEntry.oldLine > 0 && 
							otherEntry.oldLine > diffEntry.oldLine && 
							otherEntry.oldLine < minOldLineAfterDeletion &&
							otherEntry.newLine > 0) {
							minOldLineAfterDeletion = otherEntry.oldLine;
							nextUnchangedLine = otherEntry;
						}
					}
					
					let showAtLine: number;
					if (nextUnchangedLine) {
						showAtLine = Math.max(1, nextUnchangedLine.newLine - 1);
					} else {
						showAtLine = Math.max(1, model.getLineCount());
					}
					
					if (!deletedLinesByPosition.has(showAtLine)) {
						deletedLinesByPosition.set(showAtLine, []);
					}
					deletedLinesByPosition.get(showAtLine)!.push(diffEntry.content);
				}
			}

			const decorations: Array<{
				range: any;
				options: any;
			}> = [];

			for (const lineNumber of addedLines) {
				if (lineNumber <= model.getLineCount()) {
					decorations.push({
						range: {
							startLineNumber: lineNumber,
							startColumn: 1,
							endLineNumber: lineNumber,
							endColumn: model.getLineLength(lineNumber) + 1
						},
						options: {
							isWholeLine: true,
							linesDecorationsClassName: 'erdos-ai-diff-added-gutter',
							overviewRuler: {
								color: 'rgba(0, 255, 0, 0.6)',
								position: 7
							}
						}
					});
				}
			}

			for (const [lineNumber, deletedLines] of deletedLinesByPosition) {
				if (lineNumber <= model.getLineCount()) {
					decorations.push({
						range: {
							startLineNumber: lineNumber,
							startColumn: 1,
							endLineNumber: lineNumber,
							endColumn: 1
						},
						options: {
							glyphMarginClassName: 'erdos-ai-diff-deleted-arrow',
							glyphMarginHoverMessage: {
								value: `Click to expand ${deletedLines.length} deleted line(s)`
							},
							overviewRuler: {
								color: 'rgba(255, 0, 0, 0.6)',
								position: 7
							}
						}
					});
				}
			}

			if (decorations.length > 0) {
				const decorationIds = model.deltaDecorations([], decorations);
				this.fileDecorations.set(uri.toString(), decorationIds);
						}

		const activeTextEditor = this.codeEditorService.getActiveCodeEditor();
		if (activeTextEditor && activeTextEditor.getModel()?.uri.toString() === uri.toString() && deletedLinesByPosition.size > 0) {
			this.fileDeletedContent.set(uri.toString(), deletedLinesByPosition);
			
			const uriString = uri.toString();
			if (!this.fileViewZonesByLine.has(uriString)) {
				this.fileViewZonesByLine.set(uriString, new Map<number, string>());
			}
			if (!this.fileExpandedStates.has(uriString)) {
				this.fileExpandedStates.set(uriString, new Map<number, boolean>());
			}
			const viewZoneIdsByLine = this.fileViewZonesByLine.get(uriString)!;
			
			const editorId = activeTextEditor.getId();
			if (!this.editorClickHandlers.has(editorId)) {
				this.editorClickHandlers.add(editorId);
				activeTextEditor.onMouseDown((e) => {
				if (e.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
					const clickedLine = e.target.position?.lineNumber;
					if (clickedLine) {
						const currentUri = activeTextEditor.getModel()?.uri.toString();
						const currentDeletedContent = currentUri ? this.fileDeletedContent.get(currentUri) : null;
						
						if (currentDeletedContent && currentDeletedContent.has(clickedLine)) {
							const deletedLines = currentDeletedContent.get(clickedLine)!;
							
							const currentExpandedStates = currentUri ? this.fileExpandedStates.get(currentUri) : null;
							if (!currentExpandedStates) return;
							
							const isCurrentlyExpanded = currentExpandedStates.get(clickedLine) || false;
							const newExpandedState = !isCurrentlyExpanded;
							
							currentExpandedStates.set(clickedLine, newExpandedState);
						
							const currentViewZonesByLine = currentUri ? this.fileViewZonesByLine.get(currentUri) : null;
							if (!currentViewZonesByLine) return;
							
							activeTextEditor.changeViewZones((viewZoneChangeAccessor) => {
								const existingZoneId = currentViewZonesByLine.get(clickedLine);
								if (existingZoneId) {
									viewZoneChangeAccessor.removeZone(existingZoneId);
									currentViewZonesByLine.delete(clickedLine);
								}
							
							if (newExpandedState) {
								const domNode = document.createElement('div');
								domNode.className = 'erdos-ai-deleted-content-zone';
								
								domNode.style.margin = '0';
								domNode.style.padding = '0';
								domNode.style.border = 'none';
								domNode.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
								domNode.style.color = '#ff6666';
								domNode.style.fontStyle = 'italic';
								domNode.style.fontFamily = activeTextEditor.getOption(EditorOption.fontFamily);
								domNode.style.fontSize = activeTextEditor.getOption(EditorOption.fontSize) + 'px';
								domNode.style.lineHeight = activeTextEditor.getOption(EditorOption.lineHeight) + 'px';
								domNode.style.position = 'relative';
																
								deletedLines.forEach((line, index) => {
									const lineDiv = document.createElement('div');
									lineDiv.textContent = line;
									lineDiv.style.margin = '0';
									lineDiv.style.padding = '0';
									lineDiv.style.border = 'none';
									lineDiv.style.whiteSpace = 'pre';
									lineDiv.style.height = activeTextEditor.getOption(EditorOption.lineHeight) + 'px';
									lineDiv.style.lineHeight = activeTextEditor.getOption(EditorOption.lineHeight) + 'px';
																		
									domNode.appendChild(lineDiv);
								});
								
								domNode.addEventListener('mousedown', (e) => {
									e.stopPropagation();
								});
								domNode.addEventListener('selectstart', (e) => {
									e.stopPropagation();
								});
								
								const viewZoneData: IViewZone = {
									afterLineNumber: clickedLine,
									heightInLines: deletedLines.length,
									domNode,
									ordinal: 50000 + clickedLine,
									suppressMouseDown: false
								};
								
								const newZoneId = viewZoneChangeAccessor.addZone(viewZoneData);
								currentViewZonesByLine.set(clickedLine, newZoneId);
							}
							});
							
							const uri = URI.parse(currentUri!);
							this.updateGlyphMarginArrow(uri, clickedLine, newExpandedState);
						}
					}
				}
			});
			}
			
			const allViewZoneIds = Array.from(viewZoneIdsByLine.values());
			this.fileViewZones.set(uri.toString(), allViewZoneIds);
		}

		} catch (error) {
			this.logService.error(`Failed to apply diff decorations for ${uri.toString()}:`, error);
		}
	}

	private clearFileHighlighting(uri: URI): void {
		try {
			const uriString = uri.toString();
			
			const decorationIds = this.fileDecorations.get(uriString);
			if (decorationIds) {
				const model = this.modelService.getModel(uri);
				if (model) {
					model.deltaDecorations(decorationIds, []);
				}
				this.fileDecorations.delete(uriString);
			}
			
			const viewZoneIds = this.fileViewZones.get(uriString);
			const viewZonesByLine = this.fileViewZonesByLine.get(uriString);
			const allViewZoneIds = new Set([
				...(viewZoneIds || []),
				...(viewZonesByLine ? Array.from(viewZonesByLine.values()) : [])
			]);
			
			if (allViewZoneIds.size > 0) {
				const activeTextEditor = this.codeEditorService.getActiveCodeEditor();
				const activeEditorUri = activeTextEditor?.getModel()?.uri.toString();
				
				if (activeTextEditor && activeEditorUri === uriString) {
					activeTextEditor.changeViewZones((accessor: IViewZoneChangeAccessor) => {
						for (const zoneId of allViewZoneIds) {
							accessor.removeZone(zoneId);
						}
					});
				}
				
				this.fileViewZones.delete(uriString);
				this.fileViewZonesByLine.delete(uriString);
			}
			
			this.fileDeletedContent.delete(uriString);
			
			this.fileViewZonesByLine.delete(uriString);
			
			this.fileExpandedStates.delete(uriString);
			
			this.fileViewZoneDomNodes.delete(uriString);
		} catch (error) {
			this.logService.error(`Failed to clear file highlighting for ${uri.toString()}:`, error);
		}
	}

	private async onFilesChanged(): Promise<void> {
		try {
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation && this.isFileHighlightingEnabled(currentConversation.info.id)) {
				await this.updateHighlightingForConversation(currentConversation.info.id);
			}
		} catch (error) {
			this.logService.error('Failed to handle file changes:', error);
		}
	}

	private async onActiveEditorChanged(): Promise<void> {
		try {
			const activeEditor = this.editorService.activeTextEditorControl;
			if (!activeEditor) {
				return;
			}

			let model: any;
			try {
				model = (activeEditor as any).getModel();
				if (!model) {
					return;
				}
			} catch {
				return;
			}

			const uri = model.uri;
			const currentConversation = this.conversationManager.getCurrentConversation();
			
			if (currentConversation) {
				const conversationId = currentConversation.info.id;
				
				const fileChanges = await this.loadFileChangesForConversation(conversationId);
				if (fileChanges && fileChanges.changes) {
					const filePath = this.uriToRelativePath(uri);
					const change = fileChanges.changes.find((c: any) => c.file_path === filePath);
					
					if (change && this.isFileHighlightingEnabled(conversationId)) {
						const uriString = uri.toString();
						const hasExistingDecorations = this.fileDecorations.has(uriString);
						const hasExistingViewZones = this.fileViewZonesByLine.has(uriString);
						
						if (!hasExistingDecorations && !hasExistingViewZones) {
							await this.applyFileChangeHighlighting(uri, change);
						}
					}
				}
			}
		} catch (error) {
			this.logService.error('Failed to handle active editor change:', error);
		}
	}

	private async onModelContentChanged(uri: URI): Promise<void> {
		try {
			if (this.modelContentChangeTimeout) {
				clearTimeout(this.modelContentChangeTimeout);
			}
			
			this.modelContentChangeTimeout = setTimeout(async () => {
				const currentConversation = this.conversationManager.getCurrentConversation();
				if (!currentConversation || !this.isFileHighlightingEnabled(currentConversation.info.id)) {
					return;
				}

				const fileChanges = await this.loadFileChangesForConversation(currentConversation.info.id);
				if (fileChanges && fileChanges.changes) {
					const filePath = this.uriToRelativePath(uri);
					const change = fileChanges.changes.find((c: any) => c.file_path === filePath);
					
					if (change) {
						await this.applyFileChangeHighlighting(uri, change);
					}
				}
			}, 500);
			
		} catch (error) {
			this.logService.error('Failed to handle model content change:', error);
		}
	}

	private async applyHighlightingFromFileChanges(conversationId: number): Promise<void> {
		try {
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation || conversation.info.id !== conversationId) {
				return;
			}

			const fileChanges = await this.loadFileChangesForConversation(conversationId);
			if (!fileChanges || !fileChanges.changes) {
				return;
			}

			this.logService.debug(`file_changes.json has ${fileChanges.changes.length} entries`);
			
			const firstChangeByFile = new Map<string, any>();
			for (const change of fileChanges.changes) {
				if (change.action === 'modify' && change.file_path) {
					if (!firstChangeByFile.has(change.file_path)) {
						firstChangeByFile.set(change.file_path, change);
						this.logService.debug(`Using first instance for file: ${change.file_path}, message_id: ${change.message_id}`);
					}
				}
			}
			
					for (const [filePath, change] of firstChangeByFile) {
			const uri = await this.resolveFileUri(filePath);
			if (uri) {
				await this.applyFileChangeHighlighting(uri, change);
			}
		}

		} catch (error) {
			this.logService.error(`Failed to apply highlighting from file changes:`, error);
		}
	}

	private async loadFileChangesForConversation(conversationId: number): Promise<any> {
		try {
			const conversationPaths = this.conversationManager.getConversationPaths(conversationId);
			const fileChangesPath = URI.parse(conversationPaths.diffLogPath);
			
			const exists = await this.fileService.exists(fileChangesPath);
			if (!exists) {
				return { changes: [] };
			}

			const content = await this.fileService.readFile(fileChangesPath);
			return JSON.parse(content.value.toString());

		} catch (error) {
			this.logService.error(`Failed to load file changes for conversation ${conversationId}:`, error);
			return { changes: [] };
		}
	}

	private isFileHighlightingEnabled(conversationId: number): boolean {
		return this.conversationFileHighlighting.get(conversationId) ?? false;
	}

	private async updateHighlightingForConversation(conversationId: number): Promise<void> {
		try {
			await this.applyHighlightingFromFileChanges(conversationId);
		} catch (error) {
			this.logService.error(`Failed to update highlighting for conversation ${conversationId}:`, error);
		}
	}

	private async resolveFileUri(filePath: string): Promise<URI | null> {
		try {
			const resolverContext = this.createResolverContext();
			const pathResult = await this.commonUtils.resolveFilePathToUri(filePath, resolverContext);
			return pathResult.found ? pathResult.uri || null : null;
		} catch (error) {
			this.logService.error(`Failed to resolve file URI for ${filePath}:`, error);
			return null;
		}
	}

	private uriToRelativePath(uri: URI): string {
		try {
			const workspaces = this.workspaceContextService.getWorkspace().folders;
			if (!workspaces || workspaces.length === 0) {
				return uri.fsPath;
			}
			
			const workspaceUri = workspaces[0].uri;
			const workspacePath = workspaceUri.fsPath;
			const filePath = uri.fsPath;
			
			if (filePath.startsWith(workspacePath)) {
				return filePath.substring(workspacePath.length + 1);
			}
			
			return filePath;
		} catch (error) {
			return uri.fsPath;
		}
	}

	private createResolverContext() {
		return {
			getAllOpenDocuments: async () => {
				const docs = await this.documentManager.getAllOpenDocuments(true);
				return docs.map((doc: any) => ({
					path: doc.path,
					content: doc.content,
					isDirty: !doc.isSaved,
					isActive: doc.isActive,
					isSaved: doc.isSaved
				}));
			},
			getCurrentWorkingDirectory: async () => {
				const workspaces = this.workspaceContextService.getWorkspace().folders;
				return workspaces && workspaces.length > 0 ? workspaces[0].uri.fsPath : process.cwd();
			},
			fileExists: async (path: string) => {
				try {
					const uri = URI.file(path);
					return await this.fileService.exists(uri);
				} catch {
					return false;
				}
			},
			joinPath: (base: string, ...parts: string[]) => {
				return parts.reduce((acc, part) => acc + '/' + part, base);
			},
			getFileContent: async (uri: URI) => {
				const fileContent = await this.documentManager.getEffectiveFileContent(uri.fsPath);
				return fileContent || '';
			}
		};
	}
}
