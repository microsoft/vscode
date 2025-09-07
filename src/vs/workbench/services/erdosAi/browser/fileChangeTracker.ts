/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ICodeEditor, MouseTargetType } from '../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { IPathService } from '../../path/common/pathService.js';
import { IFileChangeTracker } from '../common/fileChangeTracker.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { ZoneWidget } from '../../../../editor/contrib/zoneWidget/browser/zoneWidget.js';
import * as dom from '../../../../base/browser/dom.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Zone widget for displaying deleted content, using Debug Exception Widget approach
 */
class DeletedContentZoneWidget extends ZoneWidget {
	private _deletedLines: string[];

	constructor(
		editor: ICodeEditor,
		private lineNumber: number,
		deletedLines: string[],
		@IThemeService _themeService: IThemeService
	) {
		super(editor, {
			showFrame: false, // #4: No frame/border
			showArrow: false, // #1: Remove arrow to eliminate spacing
			className: 'erdos-ai-deleted-content-zone-widget'
		});
		
		this._deletedLines = deletedLines;
		this.create();
	}

	protected override _fillContainer(container: HTMLElement): void {
		const fontInfo = this.editor.getOption(EditorOption.fontInfo);
		container.style.fontSize = `${fontInfo.fontSize}px`;
		container.style.lineHeight = `${fontInfo.lineHeight}px`;
		container.style.fontFamily = fontInfo.fontFamily;
		container.style.height = `${fontInfo.lineHeight * this._deletedLines.length}px`;
		container.style.overflow = 'hidden';
		container.style.padding = '0';
		container.style.margin = '0';
		container.style.border = 'none';
		container.style.backgroundColor = 'transparent';

		// Get editor layout info for proper alignment
		const layoutInfo = this.editor.getLayoutInfo();
		
		// Create content for all deleted lines
		this._deletedLines.forEach((deletedLine, index) => {
			const lineElement = dom.$('.deleted-line-content');
			lineElement.textContent = deletedLine;
			lineElement.style.whiteSpace = 'pre'; // Preserve whitespace like regular code
			lineElement.style.color = '#ff6666';
			lineElement.style.fontStyle = 'normal';
			lineElement.style.padding = '0';
			lineElement.style.margin = '0';
			lineElement.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
			lineElement.style.border = 'none';
			lineElement.style.height = `${fontInfo.lineHeight}px`;
			lineElement.style.display = 'block';
			lineElement.style.overflow = 'hidden';
			lineElement.style.textOverflow = 'ellipsis';
			lineElement.style.paddingLeft = `${layoutInfo.contentLeft}px`;
			lineElement.style.lineHeight = `${fontInfo.lineHeight}px`;

			container.appendChild(lineElement);
		});

		// Set ARIA label for accessibility
		const ariaLabel = `Deleted lines (${this._deletedLines.length}): ${this._deletedLines.join(', ')}`;
		container.setAttribute('aria-label', ariaLabel);
	}

	protected override _doLayout(_heightInPixel: number | undefined, _widthInPixel: number | undefined): void {
		// Set height for all deleted lines
		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		const totalHeight = lineHeight * this._deletedLines.length;
		this.container!.style.height = `${totalHeight}px`;
		
		// Relayout to accommodate all deleted lines
		this._relayout(this._deletedLines.length);
	}

	public showWidget(): void {
		// Show at the line position with height for all deleted lines
		this.show({ lineNumber: this.lineNumber, column: 1 }, this._deletedLines.length);
	}
}

export class FileChangeTracker extends Disposable implements IFileChangeTracker {
	readonly _serviceBrand: undefined;
	private readonly conversationFileHighlighting = new Map<number, boolean>();
	private readonly fileDecorations = new Map<string, string[]>();
	private readonly fileDeletedContentZones = new Map<string, Map<number, DeletedContentZoneWidget>>();
	private readonly fileDeletedLinesByPosition = new Map<string, Map<number, string[]>>();
	private readonly editorClickHandlers = new Map<string, IDisposable>();
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
		@IConversationManager private readonly conversationManager: IConversationManager,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPathService private readonly pathService: IPathService
	) {
		super();
	}

	setDocumentManager(documentManager: any): void {
		this.documentManager = documentManager;
	}

	async initializeFileChangeTracking(conversationId: number): Promise<void> {
		try {
			this.conversationFileHighlighting.set(conversationId, true);
			this.setupFileChangeListeners();
			await this.applyHighlightingFromFileChanges(conversationId);
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

	private createDeletedContentZone(editor: ICodeEditor, lineNumber: number, deletedLines: string[]): DeletedContentZoneWidget {
		const widget = this.instantiationService.createInstance(DeletedContentZoneWidget, editor, lineNumber, deletedLines);
		widget.showWidget();
		return widget;
	}

	private updateGlyphMarginArrow(uri: URI, lineNumber: number, isExpanded: boolean): void {
		const model = this.modelService.getModel(uri);
		if (!model) {
			return;
		}
		
		const decorationIds = this.fileDecorations.get(uri.toString());
		if (!decorationIds) {
			return;
		}
		
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
			
			// Dispose all click handlers
			for (const [, disposable] of this.editorClickHandlers.entries()) {
				disposable.dispose();
			}
			
			this.fileDecorations.clear();
			this.fileDeletedContentZones.clear();
			this.fileDeletedLinesByPosition.clear();
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
			this.handleEditorVisibilityChange();
		}));

		this._register(this.editorService.onDidVisibleEditorsChange(() => {
			this.handleEditorVisibilityChange();
		}));

		// Listen for editor close events to clean up zones
		this._register(this.editorService.onDidCloseEditor(e => {
			if (e.editor.resource) {
				this.clearFileHighlighting(e.editor.resource);
			}
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

			// Clear ALL existing decorations and zone widgets first to prevent legacy glyph issues
			const uriString = uri.toString();
			const existingDecorationIds = this.fileDecorations.get(uriString);
			if (existingDecorationIds) {
				model.deltaDecorations(existingDecorationIds, []);
				this.fileDecorations.delete(uriString);
			}

			// Get existing zone widgets and deleted lines data for comparison
			const existingZoneMap = this.fileDeletedContentZones.get(uriString);
			const existingDeletedLines = this.fileDeletedLinesByPosition.get(uriString);

			const addedLines = new Set<number>();
			const deletedLinesByPosition = new Map<number, string[]>();

			// Process diff entries to find added lines and group deleted lines by position
			for (const diffEntry of diffEntries) {
				if (diffEntry.type === 'added' && diffEntry.newLine > 0) {
					addedLines.add(diffEntry.newLine);
				}
			}

			// Group deleted lines by their display position
			for (let i = 0; i < diffEntries.length; i++) {
				const diffEntry = diffEntries[i];
				
				if (diffEntry.type === 'deleted') {
					let nextUnchangedLine: typeof diffEntry | null = null;
					let minOldLineAfterDeletion = Number.MAX_VALUE;
					
					// Find the next unchanged line to determine where to show deleted content
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

			// Selectively clear only zone widgets with changed content
			if (existingZoneMap && existingDeletedLines) {
				for (const [lineNumber, zone] of existingZoneMap.entries()) {
					const oldContent = existingDeletedLines.get(lineNumber);
					const newContent = deletedLinesByPosition.get(lineNumber);
					
					// Check if content has changed (different arrays or different content)
					const contentChanged = !oldContent || !newContent || 
						oldContent.length !== newContent.length ||
						oldContent.some((line, i) => line !== newContent[i]);
					
					if (contentChanged) {
						try {
							zone.dispose();
							existingZoneMap.delete(lineNumber);
						} catch (error) {
							console.warn(`Failed to dispose zone at line ${lineNumber}:`, error);
						}
					}
				}
			}

			// Update stored deleted lines data with new content
			this.fileDeletedLinesByPosition.set(uriString, new Map(deletedLinesByPosition));

			// Create decorations for added lines
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

			// Create decorations for deleted content indicators
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
								value: `Click to view ${deletedLines.length} deleted line(s)`
							},
							overviewRuler: {
								color: 'rgba(255, 0, 0, 0.6)',
								position: 7
							}
						}
					});
				}
			}

			// Apply new decorations
			if (decorations.length > 0) {
				const decorationIds = model.deltaDecorations([], decorations);
				this.fileDecorations.set(uriString, decorationIds);
			}

			// Set up zone widgets for deleted content (preserve existing zones)
			const activeTextEditor = this.codeEditorService.getActiveCodeEditor();
			if (activeTextEditor && activeTextEditor.getModel()?.uri.toString() === uri.toString() && deletedLinesByPosition.size > 0) {
				// Initialize zone map for this file if it doesn't exist
				if (!this.fileDeletedContentZones.has(uriString)) {
					this.fileDeletedContentZones.set(uriString, new Map<number, DeletedContentZoneWidget>());
				}

				// Set up click handler for glyph margin if not already set
				const editorId = activeTextEditor.getId();
				if (!this.editorClickHandlers.has(editorId)) {
					const clickDisposable = activeTextEditor.onMouseDown((e) => {
						if (e.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
							const clickedLine = e.target.position?.lineNumber;
							const currentUriString = uri.toString();
							const storedDeletedLines = this.fileDeletedLinesByPosition.get(currentUriString);
							const hasDeletedLines = clickedLine && storedDeletedLines && storedDeletedLines.has(clickedLine);
							
							if (hasDeletedLines) {
								this.toggleDeletedContentZone(activeTextEditor, uri, clickedLine, storedDeletedLines.get(clickedLine)!);
							}
						}
					});
					
					this.editorClickHandlers.set(editorId, clickDisposable);
				}
			}

		} catch (error) {
			this.logService.error(`Failed to apply diff decorations for ${uri.toString()}:`, error);
		}
	}



	private toggleDeletedContentZone(editor: ICodeEditor, uri: URI, lineNumber: number, deletedLines: string[]): void {
		const uriString = uri.toString();
		const zoneMap = this.fileDeletedContentZones.get(uriString);
		
		if (!zoneMap) {
			return;
		}

		const existingZone = zoneMap.get(lineNumber);
		
		if (existingZone) {
			// Zone exists, dispose it
			existingZone.dispose();
			zoneMap.delete(lineNumber);
			this.updateGlyphMarginArrow(uri, lineNumber, false);
		} else {
			// Create new zone
			const newZone = this.createDeletedContentZone(editor, lineNumber, deletedLines);
			zoneMap.set(lineNumber, newZone);
			this.updateGlyphMarginArrow(uri, lineNumber, true);
		}
	}


	/**
	 * Remove all highlighting for a file - disposes decorations, ViewZones, OverlayWidgets, everything
	 */
	private clearFileHighlighting(uri: URI): void {
		try {
			const uriString = uri.toString();
			
			// Clear decorations
			const decorationIds = this.fileDecorations.get(uriString);
			if (decorationIds) {
				const model = this.modelService.getModel(uri);
				if (model) {
					model.deltaDecorations(decorationIds, []);
				}
				this.fileDecorations.delete(uriString);
			}
			
			// Clear zone widgets and reset glyph states
			const zoneMap = this.fileDeletedContentZones.get(uriString);
			if (zoneMap) {
				for (const [lineNumber, zone] of zoneMap.entries()) {
					try {
						zone.dispose(); // This handles ViewZone and OverlayWidget cleanup
						this.updateGlyphMarginArrow(uri, lineNumber, false); // Reset glyph to collapsed
					} catch (error) {
						console.warn(`Failed to dispose zone at line ${lineNumber}:`, error);
					}
				}
				this.fileDeletedContentZones.delete(uriString);
			}
			
			// Clear stored deleted lines data
			this.fileDeletedLinesByPosition.delete(uriString);
			
		} catch (error) {
			this.logService.error(`Failed to clear file highlighting for ${uri.toString()}:`, error);
		}
	}

	private async onFilesChanged(): Promise<void> {
		try {
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation && this.isFileHighlightingEnabled(currentConversation.info.id)) {
				await this.applyHighlightingFromFileChanges(currentConversation.info.id);
			}
		} catch (error) {
			this.logService.error('Failed to handle file changes:', error);
		}
	}

	private async handleEditorVisibilityChange(): Promise<void> {
		try {
			const currentConversation = this.conversationManager.getCurrentConversation();
			
			if (!currentConversation) {
				return;
			}

			const conversationId = currentConversation.info.id;
			const isHighlightingEnabled = this.isFileHighlightingEnabled(conversationId);
			
			if (!isHighlightingEnabled) {
				return;
			}

			// Get all currently visible editors
			const visibleEditors = this.editorService.visibleEditorPanes;
			const visibleUris = new Set<string>();
			
			for (const editorPane of visibleEditors) {
				const resource = editorPane.input?.resource;
				if (resource) {
					visibleUris.add(resource.toString());
				}
			}

			// Remove zone widgets for files that are no longer visible
			for (const [uriString, zoneMap] of this.fileDeletedContentZones.entries()) {
				if (!visibleUris.has(uriString) && zoneMap.size > 0) {
					this.clearFileHighlighting(URI.parse(uriString));
				}
			}

			// Recreate diff views for all currently visible files using the consolidated function
			await this.applyHighlightingFromFileChanges(conversationId);
			
		} catch (error) {
			this.logService.error('Failed to handle editor visibility change:', error);
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

				await this.applyHighlightingFromFileChanges(currentConversation.info.id);
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

			const firstChangeByFile = new Map<string, any>();
			for (const change of fileChanges.changes) {
				if ((change.action === 'modify' || change.action === 'create') && change.file_path) {
					if (!firstChangeByFile.has(change.file_path)) {
						firstChangeByFile.set(change.file_path, change);
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

	private createResolverContext() {
		return {
			getAllOpenDocuments: async () => {
				if (!this.documentManager) {
					throw new Error('DocumentManager is undefined');
				}
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
				const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
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
