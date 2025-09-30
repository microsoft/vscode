/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ICodeEditor, MouseTargetType } from '../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { CellMetadata } from '../common/cellMetadata.js';
import { IModelDeltaDecoration, IModelDecorationOptions } from '../../../../editor/common/model.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { IFileChangeTracker } from '../common/fileChangeTracker.js';
import { IFileResolverService } from '../../erdosAiUtils/common/fileResolverService.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { INotebookZoneManager } from '../common/notebookZoneManager.js';
import { ZoneWidget } from '../../../../editor/contrib/zoneWidget/browser/zoneWidget.js';
import * as dom from '../../../../base/browser/dom.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { INotebookDiffService, ICellDiffData } from './notebookDiffService.js';
import { INotebookService } from '../../../contrib/notebook/common/notebookService.js';
import { INotebookEditor } from '../../../contrib/notebook/browser/notebookBrowser.js';
import { NotebookAutoAcceptDiffZoneWidget } from '../../../contrib/notebook/browser/contrib/diff/notebookDiffHighlight.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { SnapshotContext } from '../../../services/workingCopy/common/fileWorkingCopy.js';
import { streamToBuffer } from '../../../../base/common/buffer.js';
import { CellUri } from '../../../contrib/notebook/common/notebookCommon.js';

/**
 * Zone widget for displaying deleted content (original diff system)
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
			showFrame: false,
			showArrow: false,
			className: 'erdos-ai-deleted-content-zone-widget',
			keepEditorSelection: true
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

		const layoutInfo = this.editor.getLayoutInfo();
		
		this._deletedLines.forEach((deletedLine, index) => {
			const lineElement = dom.$('.deleted-line-content');
			lineElement.textContent = deletedLine;
			lineElement.style.whiteSpace = 'pre';
			lineElement.style.fontStyle = 'normal';
			lineElement.style.padding = '0';
			lineElement.style.margin = '0';
			lineElement.style.border = 'none';
			lineElement.style.height = `${fontInfo.lineHeight}px`;
			lineElement.style.display = 'block';
			lineElement.style.overflow = 'hidden';
			lineElement.style.textOverflow = 'ellipsis';
			lineElement.style.lineHeight = `${fontInfo.lineHeight}px`;
			lineElement.style.position = 'relative';
			lineElement.style.paddingLeft = `${layoutInfo.contentLeft}px`;
			
			const backgroundElement = dom.$('.deleted-line-background');
			backgroundElement.style.position = 'absolute';
			backgroundElement.style.top = '0';
			backgroundElement.style.left = `${layoutInfo.contentLeft}px`;
			backgroundElement.style.right = '0';
			backgroundElement.style.height = '100%';
			backgroundElement.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
			backgroundElement.style.pointerEvents = 'none';
			backgroundElement.style.zIndex = '-1';
			
			lineElement.appendChild(backgroundElement);
			container.appendChild(lineElement);
		});

		const ariaLabel = `Deleted lines (${this._deletedLines.length}): ${this._deletedLines.join(', ')}`;
		container.setAttribute('aria-label', ariaLabel);
	}

	protected override _doLayout(_heightInPixel: number | undefined, _widthInPixel: number | undefined): void {
		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		const totalHeight = lineHeight * this._deletedLines.length;
		this.container!.style.height = `${totalHeight}px`;
		this._relayout(this._deletedLines.length);
	}

	public showWidget(): void {
		this.show({ lineNumber: this.lineNumber, column: 1 }, this._deletedLines.length);
	}
}

/**
 * Zone widget for displaying auto-accept diff sections with Accept/Reject buttons
 */
class AutoAcceptDiffZoneWidget extends ZoneWidget {
	public _deletedLines: string[];
	public _diffSectionId: string;
	private _fileChangeTracker: FileChangeTracker;

	constructor(
		editor: ICodeEditor,
		public lineNumber: number,
		deletedLines: string[],
		diffSectionId: string,
		fileChangeTracker: FileChangeTracker,
		@IThemeService _themeService: IThemeService
	) {
		super(editor, {
			showFrame: false, // #4: No frame/border
			showArrow: false, // #1: Remove arrow to eliminate spacing
			showSash: false, // # Remove blue resize bar completely
			className: 'erdos-ai-auto-accept-diff-zone-widget',
			keepEditorSelection: true, // Prevents cursor jumping when showing zone widget
			isResizeable: false, // Disable resizing to remove resize handles
			ordinal: 10000 // Ensure it appears above other zone widgets
		});
		
		this._deletedLines = deletedLines;
		this._diffSectionId = diffSectionId;
		this._fileChangeTracker = fileChangeTracker;
		this.create();
	}

	protected override _fillContainer(container: HTMLElement): void {
		const fontInfo = this.editor.getOption(EditorOption.fontInfo);
		const layoutInfo = this.editor.getLayoutInfo();
		
		// Calculate content height - no content for added-only sections
		const contentLineCount = this._deletedLines.length > 0 ? this._deletedLines.length : 0;
		container.style.fontSize = `${fontInfo.fontSize}px`;
		container.style.lineHeight = `${fontInfo.lineHeight}px`;
		container.style.fontFamily = fontInfo.fontFamily;
		container.style.height = `${fontInfo.lineHeight * contentLineCount + Math.round(fontInfo.lineHeight * 0.7)}px`;
		container.style.overflow = 'hidden';
		container.style.padding = '0';
		container.style.margin = '0';
		container.style.border = 'none';
		container.style.backgroundColor = 'transparent';

		// Only show content if there are deleted lines
		if (this._deletedLines.length > 0) {
			// Show deleted lines content
			this._deletedLines.forEach((deletedLine, index) => {
				const lineElement = dom.$('.deleted-line-content');
				lineElement.textContent = deletedLine;
				lineElement.style.whiteSpace = 'pre'; // Preserve whitespace like regular code
				// Use default font color instead of red
				lineElement.style.fontStyle = 'normal';
				lineElement.style.padding = '0';
				lineElement.style.margin = '0';
				lineElement.style.border = 'none';
				lineElement.style.height = `${fontInfo.lineHeight}px`;
				lineElement.style.display = 'block';
				lineElement.style.overflow = 'hidden';
				lineElement.style.textOverflow = 'ellipsis';
				lineElement.style.lineHeight = `${fontInfo.lineHeight}px`;
				
				// Create background that starts after the gutter (like added lines)
				lineElement.style.position = 'relative';
				lineElement.style.paddingLeft = `${layoutInfo.contentLeft}px`;
				
				// Add red background that only covers the content area (after gutter)
				const backgroundElement = dom.$('.deleted-line-background');
				backgroundElement.style.position = 'absolute';
				backgroundElement.style.top = '0';
				backgroundElement.style.left = `${layoutInfo.contentLeft}px`;
				backgroundElement.style.right = '0';
				backgroundElement.style.height = '100%';
				backgroundElement.style.backgroundColor = 'rgba(255, 0, 0, 0.15)'; // Lighter red
				backgroundElement.style.pointerEvents = 'none';
				backgroundElement.style.zIndex = '-1';
				
				lineElement.appendChild(backgroundElement);
				container.appendChild(lineElement);
			});
		}
		// Note: For added-only sections, we don't show any content above buttons

		// Add Accept/Reject buttons at the bottom - compact design
		const buttonContainer = dom.$('.auto-accept-buttons');
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '0'; // No gap - buttons touch
		buttonContainer.style.padding = '0';
		buttonContainer.style.margin = '0';
		buttonContainer.style.paddingLeft = `${layoutInfo.contentLeft}px`;
		buttonContainer.style.backgroundColor = 'var(--vscode-editor-background)';
		
		// Button height is 70% of line height
		const buttonHeight = Math.round(fontInfo.lineHeight * 0.7);
		const buttonFontSize = Math.round(fontInfo.fontSize * 0.7);
		buttonContainer.style.height = `${buttonHeight}px`;

		const acceptButton = dom.$('button.auto-accept-button.accept');
		acceptButton.textContent = 'Accept';
		acceptButton.style.padding = '0';
		acceptButton.style.margin = '0';
		acceptButton.style.fontSize = `${buttonFontSize}px`; // 70% of code font size
		acceptButton.style.fontFamily = 'var(--vscode-font-family), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'; // VSCode UI font
		acceptButton.style.fontWeight = '400'; // Normal weight
		acceptButton.style.lineHeight = `${buttonHeight}px`;
		acceptButton.style.height = `${buttonHeight}px`;
		acceptButton.style.backgroundColor = '#4CAF50'; // Lighter green
		acceptButton.style.color = '#ffffff';
		acceptButton.style.border = 'none';
		acceptButton.style.borderRadius = '0 0 0 4px'; // Bottom left corner rounded
		acceptButton.style.cursor = 'pointer';
		acceptButton.style.minWidth = '50px';
		
		const rejectButton = dom.$('button.auto-accept-button.reject');
		rejectButton.textContent = 'Reject';
		rejectButton.style.padding = '0';
		rejectButton.style.margin = '0';
		rejectButton.style.fontSize = `${buttonFontSize}px`; // 70% of code font size
		rejectButton.style.fontFamily = 'var(--vscode-font-family), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'; // VSCode UI font
		rejectButton.style.fontWeight = '400'; // Normal weight
		rejectButton.style.lineHeight = `${buttonHeight}px`;
		rejectButton.style.height = `${buttonHeight}px`;
		rejectButton.style.backgroundColor = '#f44336'; // Lighter red
		rejectButton.style.color = '#ffffff';
		rejectButton.style.border = 'none';
		rejectButton.style.borderRadius = '0 0 4px 0'; // Bottom right corner rounded
		rejectButton.style.cursor = 'pointer';
		rejectButton.style.minWidth = '50px';

		// Add click handlers
		acceptButton.addEventListener('click', () => this._handleAccept());
		rejectButton.addEventListener('click', () => this._handleReject());

		buttonContainer.appendChild(acceptButton);
		buttonContainer.appendChild(rejectButton);
		container.appendChild(buttonContainer);

		// Set ARIA label for accessibility
		const ariaLabel = `Auto-accept diff section: ${this._deletedLines.length} deleted lines`;
		container.setAttribute('aria-label', ariaLabel);
	}

	protected override _doLayout(_heightInPixel: number | undefined, _widthInPixel: number | undefined): void {
		// Set height for content lines plus smaller button height
		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		const contentLineCount = this._deletedLines.length > 0 ? this._deletedLines.length : 0; // No content for added-only
		const contentHeight = lineHeight * contentLineCount;
		const buttonHeight = Math.round(lineHeight * 0.7); // 70% height for buttons
		const totalHeight = contentHeight + buttonHeight;
		this.container!.style.height = `${totalHeight}px`;
		
		// Calculate total height in line units for zone widget
		const totalHeightInLines = contentLineCount + 0.7; // Content lines + 0.7 for button
		this._relayout(totalHeightInLines);
	}

	public showWidget(): void {
		// Show at the line position with height for content lines plus smaller button
		const contentLineCount = this._deletedLines.length > 0 ? this._deletedLines.length : 0;
		const totalHeightInLines = contentLineCount + 0.7; // Content lines + 0.7 for button
		this.show({ lineNumber: this.lineNumber, column: 1 }, totalHeightInLines);
	}

	public isVisible(): boolean {
		return this.position !== null;
	}

	private _handleAccept(): void {
		// Handle accepting this diff section
		this._fileChangeTracker.acceptDiffSection(this.editor.getModel()!.uri, this._diffSectionId);
	}

	private _handleReject(): void {
		// Handle rejecting this diff section
		this._fileChangeTracker.rejectDiffSection(this.editor.getModel()!.uri, this._diffSectionId);
	}
}

interface StoredSectionInfo {
	type: 'added-only' | 'deleted-only' | 'combined';
	addedLines?: Array<{
		lineNumber: number;
		content: string;
		acceptedPosition: number; // Pre-calculated position in accepted_content
	}>;
	deletedLines?: Array<{
		content: string;
		acceptedPosition: number; // Position in accepted_content for accept operation
		insertPosition: number; // Pre-calculated position for reject operation
	}>;
}

interface NotebookStoredSectionInfo {
	type: 'added-only' | 'deleted-only' | 'combined';
	addedLines?: Array<{
		currentCellLineNumber: number;   // Line in current cell
		currentCellNumber: number;       // Cell in current notebook
		content: string;
		acceptedCellLineNumber: number;  // Line in accepted cell
		acceptedCellNumber: number;      // Cell in accepted notebook
	}>;
	deletedLines?: Array<{
		content: string;
		acceptedCellLineNumber: number;  // Where it was in accepted
		acceptedCellNumber: number;
		currentCellLineNumber: number;   // Where to reinsert in current
		currentCellNumber: number;
	}>;
}

export class FileChangeTracker extends Disposable implements IFileChangeTracker {
	readonly _serviceBrand: undefined;
	private readonly _onDiffSectionChanged = new Emitter<{ uri: URI; action: 'accept' | 'reject'; sectionId: string }>();
	readonly onDiffSectionChanged = this._onDiffSectionChanged.event;
	private readonly _onDiffSectionsCreated = new Emitter<{ uri: URI; sectionIds: string[] }>();
	readonly onDiffSectionsCreated = this._onDiffSectionsCreated.event;
	private readonly conversationFileHighlighting = new Map<number, boolean>();
	private readonly fileDecorations = new Map<string, string[]>();
	private readonly fileDeletedContentZones = new Map<string, Map<number, DeletedContentZoneWidget>>();
	private readonly fileDeletedLinesByPosition = new Map<string, Map<number, string[]>>();
	private readonly editorClickHandlers = new Map<string, IDisposable>();
	private readonly autoAcceptDecorations = new Map<string, string[]>();
	private readonly autoAcceptZones = new Map<string, Map<number, AutoAcceptDiffZoneWidget>>();
	private readonly notebookAutoAcceptZones = new Map<string, Map<string, NotebookAutoAcceptDiffZoneWidget>>(); // notebook zones with cell-based keys
	private readonly storedSectionInfo = new Map<string, StoredSectionInfo>(); // sectionId -> info
	private readonly notebookStoredSectionInfo = new Map<string, NotebookStoredSectionInfo>(); // sectionId -> notebook info
	private modelContentChangeTimeout: any;
	private currentActiveEditor: string | null = null;
	private readonly notebookOperationsInProgress = new Map<string, number>(); // Track notebook URIs with operation start timestamps

	/**
	 * Check if a notebook operation can proceed, allowing operations after 1 second timeout
	 */
	private canProceedWithNotebookOperation(uri: string): boolean {
		const existingTimestamp = this.notebookOperationsInProgress.get(uri);
		if (!existingTimestamp) {
			return true; // No operation in progress
		}
		
		const now = Date.now();
		const elapsed = now - existingTimestamp;
		
		if (elapsed > 1000) { // 1 second timeout
			this.notebookOperationsInProgress.delete(uri); // Clean up old entry
			return true;
		}
		
		return false;
	}

	/**
	 * Mark a notebook operation as started
	 */
	private startNotebookOperation(uri: string): void {
		this.notebookOperationsInProgress.set(uri, Date.now());
	}

	/**
	 * Mark a notebook operation as completed
	 */
	private completeNotebookOperation(uri: string): void {
		this.notebookOperationsInProgress.delete(uri);
	}

	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IModelService private readonly modelService: IModelService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IEditorService private readonly editorService: IEditorService,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
		@IConversationManager private readonly conversationManager: IConversationManager,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileResolverService private readonly fileResolverService: IFileResolverService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IThemeService private readonly themeService: IThemeService,
		@INotebookDiffService private readonly notebookDiffService: INotebookDiffService,
		@INotebookService private readonly notebookService: INotebookService,
		@INotebookZoneManager private readonly notebookZoneManager: INotebookZoneManager
	) {
		super();
		
		this._register(this.conversationManager.onConversationSwitch(async (conversationId) => {
			await this.acceptAllExceptConversation(conversationId);
		}));
	}

	/**
	 * Helper method to convert notebook cell URIs to notebook file URIs
	 */
	private convertCellUriToFileUri(uri: URI): URI {
		if (uri.scheme === 'vscode-notebook-cell') {
			const cellData = CellUri.parse(uri);
			if (cellData) {
				return cellData.notebook;
			} else {
				this.logService.warn(`Failed to parse notebook cell URI: ${uri.toString()}`);
				return uri; // Return original if parsing fails
			}
		}
		return uri; // Return as-is if not a cell URI
	}

	async initializeFileChangeTracking(conversationId: number): Promise<void> {
		this.conversationFileHighlighting.set(conversationId, true);
		this.setupFileChangeListeners();
		await this.applyHighlightingFromFileChanges(conversationId);
		
		// Initialize current active editor
		const activeEditor = this.editorService.activeEditor;
		this.currentActiveEditor = activeEditor?.resource?.toString() || null;
		
		// Apply highlighting to all currently open file models
		this.modelService.getModels().forEach(async model => {
			// Convert notebook cell URIs to notebook file URIs for tracking lookup
			const fileUri = this.convertCellUriToFileUri(model.uri);
			
			if (fileUri.scheme === 'file') {
				const hasAutoAcceptTracking = await this.hasAutoAcceptTracking(model.uri);
				
				if (hasAutoAcceptTracking) {
					await this.applyAutoAcceptHighlighting(fileUri); // Use converted fileUri
				}
			}
		});
	}

	async getOriginalFileContent(filePath: string, conversationId: number): Promise<string | undefined> {
		const fileChanges = await this.loadFileChangesForConversation(conversationId);
		if (!fileChanges || !fileChanges.changes) {
			return undefined;
		}

		const change = fileChanges.changes
			.filter((c: any) => c.file_path === filePath)
			.sort((a: any, b: any) => b.message_id - a.message_id)[0];

		return change?.previous_content;
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
		const conversationId = fileChange.conversation_id;
		
		if (!this.conversationFileHighlighting.get(conversationId)) {
			return;
		}

		// For notebooks, default to valid empty JSON if previous_content is missing (new file creation)
		const isNotebook = this.commonUtils.getFileExtension(uri.fsPath).toLowerCase() === 'ipynb';
		const originalContent = fileChange.previous_content || (isNotebook ? '{"cells": []}' : '');

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

	if (isNotebook) {
		// For notebooks, use VSCode's REAL serialization process for current content
		let notebookCurrentContent: string;
		try {
			const snapshotStream = await this.notebookService.createNotebookTextDocumentSnapshot(
				uri, 
				SnapshotContext.Save,
				new CancellationTokenSource().token
			);
			
			const buffer = await streamToBuffer(snapshotStream);
			notebookCurrentContent = buffer.toString();
		} catch (error) {
			return;
		}
		
		// Handle notebook files with consolidated diff processing
		await this.notebookApplyDiffDecorations(uri, originalContent, notebookCurrentContent);
		return;
	}

		const diffEntries = await this.computeLineDiff(originalContent, currentContent);

		await this.applyDiffDecorations(uri, diffEntries);
	}

	private createDeletedContentZone(editor: ICodeEditor, lineNumber: number, deletedLines: string[]): DeletedContentZoneWidget {
		const widget = this.instantiationService.createInstance(DeletedContentZoneWidget, editor, lineNumber, deletedLines);
		widget.showWidget();
		return widget;
	}

	/**
	 * Extract all lines from notebook cells into a flat list with mapping info
	 */
	private notebookExtractLines(notebookJson: string): {
		lines: string[];
		lineMapping: Array<{
			cellIndex: number;
			lineInCell: number;
			originalLine: string;
		}>;
	} {
		const notebook = JSON.parse(notebookJson);
		
		const lines: string[] = [];
		const lineMapping: Array<{ cellIndex: number; lineInCell: number; originalLine: string; }> = [];

		if (!notebook.cells || !Array.isArray(notebook.cells)) {
			return { lines, lineMapping };
		}

		notebook.cells.forEach((cell: any, cellIndex: number) => {
			// Only process code and markdown cells
			if (cell.cell_type === 'code' || cell.cell_type === 'markdown') {
				const source = cell.source || [];
				const sourceLines = Array.isArray(source) ? source : [source];
				
				sourceLines.forEach((line: string, lineInCell: number) => {
					// Remove trailing newlines for consistent comparison
					const cleanLine = typeof line === 'string' ? line.replace(/\n$/, '') : String(line).replace(/\n$/, '');
					lines.push(cleanLine);
					lineMapping.push({ cellIndex, lineInCell, originalLine: cleanLine });
				});
			}
		});

		return { lines, lineMapping };
	}

	/**
	 * Extract cells from notebook JSON with their IDs and content
	 */
	private extractNotebookCells(notebookJson: string, uri: URI, isCurrentVersion: boolean): Map<string, {
		cellIndex: number;
		cellType: string;
		sourceLines: string[];
		cellId: string;
	}> {
		const notebook = JSON.parse(notebookJson);
		const cells = new Map<string, {
			cellIndex: number;
			cellType: string;
			sourceLines: string[];
			cellId: string;
		}>();

		if (!notebook.cells || !Array.isArray(notebook.cells)) {
			return cells;
		}

		notebook.cells.forEach((cell: any, cellIndex: number) => {
			// Only process code and markdown cells
			if (cell.cell_type === 'code' || cell.cell_type === 'markdown') {
				// Only check flat Jupyter format since this function processes Jupyter JSON
				let cellId = cell.metadata?.erdosAi_cellId;
				
				if (!cellId) {
					// Generate a temporary ID for cells without one
					cellId = `temp_${cellIndex}_${Math.random().toString(36).substr(2, 9)}`;
					if (!cell.metadata) {
						cell.metadata = {};
					}
					// Store in flat format for Jupyter compatibility
					cell.metadata.erdosAi_cellId = cellId;
					
					// Persist the temp ID back to the VSCode notebook model (only for current version)
					if (isCurrentVersion) {
						const notebookModel = this.notebookService.getNotebookTextModel(uri);
						if (notebookModel && notebookModel.cells[cellIndex]) {
							const vscodeCell = notebookModel.cells[cellIndex];
							const updatedMetadata = {
								...vscodeCell.metadata,
								metadata: {
									...((vscodeCell.metadata as any).metadata || {}),
									erdosAi_cellId: cellId
								}
							};
							
							// Get cell source content
							const cellSource = vscodeCell.textBuffer ? vscodeCell.textBuffer.getLinesContent().join('\n') : '';
							
							// Replace the cell with itself but with updated metadata
							const updatedCell = {
								cellKind: vscodeCell.cellKind,
								source: cellSource,
								language: vscodeCell.language,
								mime: vscodeCell.mime,
								metadata: updatedMetadata,
								outputs: vscodeCell.outputs || []
							};
							
							// Apply cell replacement with updated metadata
							notebookModel.applyEdits([{
								editType: 1, // CellEditType.Replace
								index: cellIndex,
								count: 1,
								cells: [updatedCell]
							}], true, undefined, () => undefined, undefined, true);
						}
					}
				}

				const source = cell.source || [];
				const sourceLines = Array.isArray(source) ? source : [source];
				
				// Clean lines by removing trailing newlines
				const cleanLines = sourceLines.map((line: string) => 
					typeof line === 'string' ? line.replace(/\n$/, '') : String(line).replace(/\n$/, '')
				);

				cells.set(cellId, {
					cellIndex,
					cellType: cell.cell_type,
					sourceLines: cleanLines,
					cellId: cellId
				});
			}
		});

		return cells;
	}

	/**
	 * Compute cell-based diff for notebooks without flat text conversion
	 */
	private async computeNotebookCellBasedDiff(originalJson: string, currentJson: string, uri: URI): Promise<Array<{
		cellId: string;
		cellIndex: number;
		diffType: 'modified' | 'added' | 'deleted';
		lineDiffs?: Array<{
			type: 'added' | 'deleted' | 'unchanged';
			content: string;
			lineNumber: number;
		}>;
	}>> {
		
		// Extract cells from both versions (they should already have erdosAi_cellId)
		// Pass false for originalJson (don't persist temp IDs to old versions)
		// Pass true for currentJson (persist temp IDs to current notebook model)
		const originalCells = this.extractNotebookCells(originalJson, uri, false);
		const currentCells = this.extractNotebookCells(currentJson, uri, true);
			
		const cellDiffs: Array<{
			cellId: string;
			cellIndex: number;
			diffType: 'modified' | 'added' | 'deleted';
			lineDiffs?: Array<{
				type: 'added' | 'deleted' | 'unchanged';
				content: string;
				lineNumber: number;
			}>;
		}> = [];

		// Find all unique cell IDs
		const allCellIds = new Set([...originalCells.keys(), ...currentCells.keys()]);

		for (const cellId of allCellIds) {
			const originalCell = originalCells.get(cellId);
			const currentCell = currentCells.get(cellId);
			

			if (originalCell && currentCell) {
				// Cell exists in both - check if modified
				const originalContent = originalCell.sourceLines.join('\n');
				const currentContent = currentCell.sourceLines.join('\n');
				

				if (originalContent !== currentContent) {
					// Cell was modified - compute line-level diff using the same algorithm as regular files
					const lineDiffEntries = await this.computeLineDiff(originalContent, currentContent);
					
					// Pass ALL diff entries (including unchanged) - let the UI filter what to display
					const lineDiffs = lineDiffEntries.map(entry => ({
						type: entry.type,
						content: entry.content,
						lineNumber: entry.type === 'deleted' ? entry.oldLine : entry.newLine
					}));

					// Only add to cellDiffs if there are actual changes
					if (lineDiffs.length > 0) {
						cellDiffs.push({
							cellId,
							cellIndex: currentCell.cellIndex,
							diffType: 'modified',
							lineDiffs
						});
					}
				}
			} else if (originalCell && !currentCell) {
				// Cell was deleted
				const lineDiffs = originalCell.sourceLines.map((line, index) => ({
					type: 'deleted' as const,
					content: line,
					lineNumber: index + 1
				}));

				cellDiffs.push({
					cellId,
					cellIndex: originalCell.cellIndex,
					diffType: 'deleted',
					lineDiffs
				});
			} else if (!originalCell && currentCell) {
				// Cell was added
				const lineDiffs = currentCell.sourceLines.map((line, index) => ({
					type: 'added' as const,
					content: line,
					lineNumber: index + 1
				}));

				cellDiffs.push({
					cellId,
					cellIndex: currentCell.cellIndex,
					diffType: 'added',
					lineDiffs
				});
			}
		}

		// Sort by cell index for consistent ordering
		return cellDiffs.sort((a, b) => a.cellIndex - b.cellIndex);
	}

	/**
	 * Get the notebook editor for a given URI (public interface method)
	 */
	public getNotebookEditorForUri(uri: URI): INotebookEditor | undefined {
		return this.notebookDiffService.findNotebookEditorForUri(uri);
	}

	/**
	 * Get the Monaco editor for a specific notebook cell
	 */
	private getCellEditor(uri: URI, cellIndex: number): ICodeEditor | undefined {
		// Use the notebook diff service to find the notebook editor
		const notebookEditor = this.notebookDiffService.findNotebookEditorForUri(uri);
		if (!notebookEditor) {
			return undefined;
		}
		
		// Get the cell at the specified index
		const cell = notebookEditor.cellAt(cellIndex);
		if (!cell) {
			return undefined;
		}
		
		if (!cell.editorAttached) {
			return undefined;
		}
		
		// Find the editor for this cell from the notebook's code editors
		const editorPair = notebookEditor.codeEditors.find(([vm,]) => vm.handle === cell.handle);
		if (editorPair) {
			return editorPair[1];
		}
		
		return undefined;
	}

	/**
	 * Identify diff sections within a single notebook cell (replicates identifyDiffSections per-cell)
	 */
	private notebookIdentifyDiffSections(cellLineDiffs: Array<{
		type: 'added' | 'deleted' | 'unchanged';
		content: string;
		lineNumber: number;
	}>, cellIndex: number): Array<{
		sectionId: string;
		type: 'added-only' | 'deleted-only' | 'combined';
		zoneLineNumber: number;
		addedLines: Array<{ lineNumber: number; content: string }>;
		deletedLines: string[];
		startLine: number;
		endLine: number;
	}> {
		const sections: Array<{
			sectionId: string;
			type: 'added-only' | 'deleted-only' | 'combined';
			zoneLineNumber: number;
			addedLines: Array<{ lineNumber: number; content: string }>;
			deletedLines: string[];
			startLine: number;
			endLine: number;
		}> = [];

		// Group consecutive added and deleted entries (same logic as regular files)
		let i = 0;
		while (i < cellLineDiffs.length) {
			const entry = cellLineDiffs[i];
			
			if (entry.type === 'added' || entry.type === 'deleted') {
				// Start a new section
				const addedLines: Array<{ lineNumber: number; content: string }> = [];
				const deletedLines: string[] = [];
				let startLine = entry.lineNumber;
				let endLine = startLine;

				// Collect consecutive added OR deleted lines
				while (i < cellLineDiffs.length && (cellLineDiffs[i].type === 'added' || cellLineDiffs[i].type === 'deleted')) {
					const currentEntry = cellLineDiffs[i];
					
					if (currentEntry.type === 'added') {
						addedLines.push({
							lineNumber: currentEntry.lineNumber,
							content: currentEntry.content
						});
						endLine = Math.max(endLine, currentEntry.lineNumber);
					} else if (currentEntry.type === 'deleted') {
						deletedLines.push(currentEntry.content);
					}
					
					i++;
				}

				// Determine section type and zone line number (same logic as regular files)
				let sectionType: 'added-only' | 'deleted-only' | 'combined';
				let zoneLineNumber: number;

				if (addedLines.length > 0 && deletedLines.length > 0) {
					// Combined section: both added and deleted lines
					sectionType = 'combined';
					zoneLineNumber = addedLines[addedLines.length - 1].lineNumber; // After last added line
				} else if (addedLines.length > 0) {
					// Added-only section
					sectionType = 'added-only';
					zoneLineNumber = addedLines[addedLines.length - 1].lineNumber; // After last added line
				} else {
					// Deleted-only section
					sectionType = 'deleted-only';
					// For notebook cells, place at the start of the deleted range
					zoneLineNumber = startLine;
				}

				// Create section ID for this cell
				const sectionId = `notebook-cell-${cellIndex}-section-${sectionType}-${startLine}-${endLine}`;
				
				// Store section info for accept/reject operations
				const storedInfo: NotebookStoredSectionInfo = {
					type: sectionType
				};
				
				if (addedLines.length > 0) {
					storedInfo.addedLines = addedLines.map(line => ({
						currentCellLineNumber: line.lineNumber,
						currentCellNumber: cellIndex,
						content: line.content,
						acceptedCellLineNumber: line.lineNumber,
						acceptedCellNumber: cellIndex
					}));
				}
				
				if (deletedLines.length > 0) {
					// For consistency with regular files, insert deleted lines as a block at the zone position
					const baseInsertPosition = sectionType === 'deleted-only' ? zoneLineNumber : startLine;
					
					storedInfo.deletedLines = deletedLines.map((content, index) => {
						const deletedLineInfo = {
							content,
							acceptedCellLineNumber: startLine + index,
							acceptedCellNumber: cellIndex,
							currentCellLineNumber: baseInsertPosition + index, // Insert as block at zone position (like regular files)
							currentCellNumber: cellIndex
						};
						return deletedLineInfo;
					});
				}
				
				this.notebookStoredSectionInfo.set(sectionId, storedInfo);

				sections.push({
					sectionId,
					type: sectionType,
					zoneLineNumber,
					addedLines,
					deletedLines,
					startLine,
					endLine
				});
			} else {
				i++;
			}
		}

		return sections;
	}

	/**
	 * Consolidated notebook diff processing: extract lines, compute diff, map to cells, and apply decorations
	 * Combines the functionality of notebookProcessDiffForHighlighting, notebookApplyDiffDecorations, 
	 * and notebookApplyFileChangeHighlighting into a single function
	 */
	private async notebookApplyDiffDecorations(uri: URI, originalJson: string, currentJson: string): Promise<void> {
		// Early exit if content is identical
		if (originalJson === currentJson) {
			this.clearFileHighlighting(uri);
			return;
		}
		
		// Extract flat lines from notebook JSON with cell mapping
		const oldData = this.notebookExtractLines(originalJson);
		const newData = this.notebookExtractLines(currentJson);

		const flatOldContent = oldData.lines.join('\n');
		const flatNewContent = newData.lines.join('\n');
		
		// Early exit if flattened content is identical
		if (flatOldContent === flatNewContent) {
			this.clearFileHighlighting(uri);
			return;
		}
		
		// Compute diff on flattened content
		const diffEntries = await this.computeLineDiff(flatOldContent, flatNewContent);

		// Find the notebook editor and register it with the diff service
		const notebookEditor = this.notebookDiffService.findNotebookEditorForUri(uri);
		if (!notebookEditor || !notebookEditor.hasModel()) {
			return;
		}

		// Register the notebook editor with the diff service
		this.notebookDiffService.registerNotebookEditor(uri, notebookEditor);

		// Clear existing diff highlighting
		this.notebookDiffService.notebookClearFileHighlighting(uri);

		// Map flat diff results back to notebook cells using line mapping
		const cellDiffs = new Map<number, Array<{ type: 'added' | 'deleted'; content: string; lineNumber: number; }>>();

		for (const diffEntry of diffEntries) {
			if (diffEntry.type === 'added' && diffEntry.newLine > 0) {
				const mapping = newData.lineMapping[diffEntry.newLine - 1]; // Convert to 0-based index
				if (mapping) {
					if (!cellDiffs.has(mapping.cellIndex)) {
						cellDiffs.set(mapping.cellIndex, []);
					}
					cellDiffs.get(mapping.cellIndex)!.push({
						type: diffEntry.type,
						content: diffEntry.content,
						lineNumber: mapping.lineInCell + 1 // Convert back to 1-based for Monaco
					});
				}
			} else if (diffEntry.type === 'deleted') {
				// For deleted lines, find the next available line in the new content
				let targetCellIndex = 0;
				let targetLineInCell = 1;
				
				// Look for the next line after this deletion
				const nextAddedOrUnchanged = diffEntries.find((entry, index) => 
					index > diffEntries.indexOf(diffEntry) && 
					(entry.type === 'added' || entry.type === 'unchanged') && 
					entry.newLine > 0
				);
				
				if (nextAddedOrUnchanged && nextAddedOrUnchanged.newLine <= newData.lineMapping.length) {
					const mapping = newData.lineMapping[nextAddedOrUnchanged.newLine - 1];
					if (mapping) {
						targetCellIndex = mapping.cellIndex;
						targetLineInCell = mapping.lineInCell + 1; // Show before this line
					}
				}
				
				if (!cellDiffs.has(targetCellIndex)) {
					cellDiffs.set(targetCellIndex, []);
				}
				cellDiffs.get(targetCellIndex)!.push({
					type: diffEntry.type,
					content: diffEntry.content,
					lineNumber: targetLineInCell
				});
			}
		}

		// Convert to the format expected by the direct cell decoration system
		const cellDiffArray: ICellDiffData[] = Array.from(cellDiffs.entries()).map(([cellIndex, lineDiffs]) => ({
			cellIndex,
			type: 'modified' as const,
			lineDiffs
		}));

		// Apply diff highlighting using the notebook diff service
		const conversationId = this.conversationManager.getCurrentConversation()?.info.id?.toString() || 'unknown';
		this.notebookDiffService.notebookApplyFileChangeHighlighting(uri, conversationId, cellDiffArray);
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
		for (const uriString of this.fileDecorations.keys()) {
			const uri = URI.parse(uriString);
			this.clearFileHighlighting(uri);
		}
		
		// Dispose all click handlers
		for (const [, disposable] of this.editorClickHandlers.entries()) {
			disposable.dispose();
		}
		
		// Clear all notebook diff highlighting
		this.notebookDiffService.notebookClearAllFileHighlighting();
		
		this.fileDecorations.clear();
		this.fileDeletedContentZones.clear();
		this.fileDeletedLinesByPosition.clear();
		this.editorClickHandlers.clear();
	}

	private setupFileChangeListeners(): void {
		this._register(this.fileService.onDidFilesChange(e => {
			this.onFilesChanged(e);
		}));

		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.handleActiveEditorChange();
			this.handleEditorVisibilityChange();
			this.handleNotebookEditorChange();
		}));

		this._register(this.editorService.onDidVisibleEditorsChange(() => {
			this.handleEditorVisibilityChange();
			this.handleNotebookVisibilityChange();
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

		// Listen for notebook content changes - both existing and new editors
		const setupNotebookContentListener = (editor: any) => {
			if (editor.textModel) {
				this._register(editor.textModel.onDidChangeContent(() => {
					this.onModelContentChanged(editor.textModel!.uri);
				}));
			}
		};

		// Listen for new notebook editors
		this._register(this.notebookDiffService.notebookEditorService.onDidAddNotebookEditor(setupNotebookContentListener));
		
		// Setup listeners for existing notebook editors
		const existingNotebookEditors = this.notebookDiffService.notebookEditorService.listNotebookEditors();
		existingNotebookEditors.forEach(setupNotebookContentListener);
	}

	private async applyDiffDecorations(uri: URI, diffEntries: Array<{
		type: 'added' | 'deleted' | 'unchanged';
		content: string;
		oldLine: number;
		newLine: number;
	}>): Promise<void> {
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
				zone.dispose();
				existingZoneMap.delete(lineNumber);
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
				zone.dispose(); // This handles ViewZone and OverlayWidget cleanup
				this.updateGlyphMarginArrow(uri, lineNumber, false); // Reset glyph to collapsed
			}
			this.fileDeletedContentZones.delete(uriString);
		}
		
		// Clear stored deleted lines data
		this.fileDeletedLinesByPosition.delete(uriString);
		
	}

	private async onFilesChanged(event: any): Promise<void> {
		// Get the currently active editor
		const activeEditor = this.editorService.activeEditor;
		const activeResource = activeEditor?.resource;
		
		if (!activeResource || activeResource.scheme !== 'file') {
			return;
		}
		
		// Only respond to changes to the currently open file
		// Use the proper FileChangesEvent.affects() method instead of non-existent .changes property
		const activeFileChanged = event.affects(activeResource);
		
		if (!activeFileChanged) {
			return;
		}
		
		const currentConversation = this.conversationManager.getCurrentConversation();
		if (currentConversation && this.isFileHighlightingEnabled(currentConversation.info.id)) {
			const hasAutoAcceptTracking = await this.hasAutoAcceptTracking(activeResource);
			
			if (hasAutoAcceptTracking) {
				await this.applyAutoAcceptHighlighting(activeResource);
			} else {
				await this.applyHighlightingFromFileChanges(currentConversation.info.id);
			}
		}
	}

	private async handleActiveEditorChange(): Promise<void> {
		const activeEditor = this.editorService.activeEditor;
		const newActiveUri = activeEditor?.resource?.toString();
		
		// If switching to a different editor
		if (newActiveUri !== this.currentActiveEditor) {
			
			// Clear auto-accept zones for the previous editor
			if (this.currentActiveEditor) {
				this.clearAutoAcceptZones(this.currentActiveEditor);
			}
			
			// Recreate auto-accept zones for the new editor
			if (newActiveUri && activeEditor?.resource?.scheme === 'file') {
				const uri = URI.parse(newActiveUri);
				await this.applyAutoAcceptHighlighting(uri);
			}
			
			this.currentActiveEditor = newActiveUri || null;
		}
	}

	private clearAutoAcceptZones(uriString: string): void {
		// Clear regular file zones
		const zoneMap = this.autoAcceptZones.get(uriString);
		if (zoneMap) {
			for (const zone of zoneMap.values()) {
				// Clear stored section info for this zone's section
				if (zone._diffSectionId) {
					this.storedSectionInfo.delete(zone._diffSectionId);
				}
				zone.dispose();
			}
			this.autoAcceptZones.delete(uriString);
		}
		
		// Clear notebook zones
		const notebookZoneMap = this.notebookAutoAcceptZones.get(uriString);
		if (notebookZoneMap) {
			for (const zone of notebookZoneMap.values()) {
				// Clear stored section info for this zone's section
				if (zone._diffSectionId) {
					this.notebookStoredSectionInfo.delete(zone._diffSectionId);
				}
				zone.dispose();
			}
			this.notebookAutoAcceptZones.delete(uriString);
		}
		
		// Clear zones from the NotebookZoneManager
		const uri = URI.parse(uriString);
		this.notebookZoneManager.clearZones(uri);
	}

	private async handleEditorVisibilityChange(): Promise<void> {
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
		
		// Apply highlighting for visible editors (only for actual files)
		for (const editorPane of visibleEditors) {
			const resource = editorPane.input?.resource;
			if (resource) {
				// Convert notebook cell URIs to notebook file URIs for tracking lookup
				const fileUri = this.convertCellUriToFileUri(resource);
				
				if (fileUri.scheme === 'file') {
					const hasAutoAcceptTracking = await this.hasAutoAcceptTracking(resource);
					
					if (hasAutoAcceptTracking) {
						// Only apply auto-accept highlighting if file has auto-accept tracking
						await this.applyAutoAcceptHighlighting(fileUri); // Use converted fileUri
					} else {
						// Apply main diff highlighting if no auto-accept tracking
						const currentConversation = this.conversationManager.getCurrentConversation();
						if (currentConversation && this.isFileHighlightingEnabled(currentConversation.info.id)) {
							await this.applyHighlightingFromFileChanges(currentConversation.info.id);
						}
					}
				}
			}
		}
	}

	private async handleNotebookEditorChange(): Promise<void> {
		const currentConversation = this.conversationManager.getCurrentConversation();
		if (!currentConversation) {
			return;
		}

		const activeEditor = this.editorService.activeEditor;
		if (!activeEditor || !activeEditor.resource) {
			return;
		}

		// Check if this is a notebook file
		const uri = activeEditor.resource;
		if (this.commonUtils.getFileExtension(uri.fsPath).toLowerCase() === 'ipynb') {
		// Trigger diff highlighting for the active notebook
		await this.applyHighlightingFromFileChanges(currentConversation.info.id);
		}
	}

	private async handleNotebookVisibilityChange(): Promise<void> {
		const currentConversation = this.conversationManager.getCurrentConversation();
		if (!currentConversation || !this.isFileHighlightingEnabled(currentConversation.info.id)) {
			return;
		}

		// Get all currently visible notebook editors
		const visibleEditors = this.editorService.visibleEditorPanes;
		
		for (const editorPane of visibleEditors) {
			const resource = editorPane.input?.resource;
			if (resource && this.commonUtils.getFileExtension(resource.fsPath).toLowerCase() === 'ipynb') {
			// Apply highlighting for visible notebook
			await this.applyHighlightingFromFileChanges(currentConversation.info.id);
			}
		}
	}

	private async onModelContentChanged(uri: URI): Promise<void> {
		if (this.modelContentChangeTimeout) {
			clearTimeout(this.modelContentChangeTimeout);
		}
		
		this.modelContentChangeTimeout = setTimeout(async () => {
			const currentConversation = this.conversationManager.getCurrentConversation();
			
			if (!currentConversation) {
				return;
			}
			
			const isHighlightingEnabled = this.isFileHighlightingEnabled(currentConversation.info.id);
			
			if (!isHighlightingEnabled) {
				return;
			}
			
			// Check if file has auto-accept tracking first
			const hasAutoAcceptTracking = await this.hasAutoAcceptTracking(uri);
			
			if (hasAutoAcceptTracking) {
				// Only apply auto-accept highlighting if file has auto-accept tracking
				// Convert notebook cell URIs to file URIs for auto-accept highlighting
				const targetUri = this.convertCellUriToFileUri(uri);
				await this.applyAutoAcceptHighlighting(targetUri);
			} else {
				// Only apply main diff highlighting if no auto-accept tracking
				await this.applyHighlightingFromFileChanges(currentConversation.info.id);
			}
		}, 500);
	}

	private async applyHighlightingFromFileChanges(conversationId: number): Promise<void> {
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
				// Skip notebook files that are currently in programmatic operations
				if (this.commonUtils.getFileExtension(uri.fsPath).toLowerCase() === 'ipynb' && 
					!this.canProceedWithNotebookOperation(uri.toString())) {
					continue;
				}
				await this.applyFileChangeHighlighting(uri, change);
			}
		}
	}

	private async loadFileChangesForConversation(conversationId: number): Promise<any> {
		const conversationPaths = this.conversationManager.getConversationPaths(conversationId);
		const fileChangesPath = URI.parse(conversationPaths.diffLogPath);
		
		const exists = await this.fileService.exists(fileChangesPath);
		if (!exists) {
			return { changes: [] };
		}

		const content = await this.fileService.readFile(fileChangesPath);
		return JSON.parse(content.value.toString());
	}

	private isFileHighlightingEnabled(conversationId: number): boolean {
		return this.conversationFileHighlighting.get(conversationId) ?? false;
	}

	private async resolveFileUri(filePath: string): Promise<URI | null> {
		const resolverContext = this.fileResolverService.createResolverContext();
		const pathResult = await this.commonUtils.resolveFilePathToUri(filePath, resolverContext);
		return pathResult.found ? pathResult.uri || null : null;
	}

	private async hasAutoAcceptTracking(uri: URI): Promise<boolean> {
		// Convert notebook cell URIs to notebook file URIs
		const fileUri = this.convertCellUriToFileUri(uri);
		
		// Skip auto-accept tracking for other in-memory URIs (like diff widgets)
		if (fileUri.scheme !== 'file') {
			return false;
		}
		
		const filePath = fileUri.fsPath;
		
		const workspace = this.workspaceContextService.getWorkspace();
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		const workspaceId = workspace.id;
		
		const storageRoot = isEmptyWindow ?
			URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
			URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
		
		const trackingDir = URI.joinPath(storageRoot, 'auto-accept-tracking');
		const fileMapPath = URI.joinPath(trackingDir, 'file-map.json');
		
		const exists = await this.fileService.exists(fileMapPath);
		if (!exists) {
			return false;
		}
		
		const mapContent = await this.fileService.readFile(fileMapPath);
		const fileMap = JSON.parse(mapContent.value.toString());
		const fileHash = fileMap[filePath];
		
		const result = !!fileHash;
		
		return result;
	}

	async applyAutoAcceptHighlighting(uri: URI): Promise<void> {		
		// Convert notebook cell URIs to file URIs FIRST - safety net for all callers
		const targetUri = this.convertCellUriToFileUri(uri);
		const uriString = targetUri.toString();
		const filePath = targetUri.fsPath;
		
		// Check if this is a notebook file
		const isNotebook = this.commonUtils.getFileExtension(targetUri.fsPath).toLowerCase() === 'ipynb';
		
		// Skip notebook files that are currently in programmatic operations
		if (isNotebook && !this.canProceedWithNotebookOperation(uriString)) {
			return;
		}
		
		if (isNotebook) {
			// Handle notebook auto-accept highlighting
			await this.notebookApplyAutoAcceptHighlighting(targetUri);
			return;
		}
		
		// Clear any existing zones for this file first
		this.clearAutoAcceptZones(uriString);
		
		const workspace = this.workspaceContextService.getWorkspace();
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		const workspaceId = workspace.id;
		
		const storageRoot = isEmptyWindow ?
			URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
			URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
		
		const trackingDir = URI.joinPath(storageRoot, 'auto-accept-tracking');
		const fileMapPath = URI.joinPath(trackingDir, 'file-map.json');
		
		const mapContent = await this.fileService.readFile(fileMapPath);
		const fileMap = JSON.parse(mapContent.value.toString());
		const fileHash = fileMap[filePath];
		
		if (!fileHash) {
			return;
		}
		
		const fileTrackingPath = URI.joinPath(trackingDir, 'files', `${fileHash}.json`);
		const trackingContent = await this.fileService.readFile(fileTrackingPath);
		const fileTracking = JSON.parse(trackingContent.value.toString());
			
		// Get current content from Monaco model (not disk) since user may have unsaved changes
		const model = this.modelService.getModel(uri);
		if (!model) {
			return;
		}
		const currentContent = model.getValue();
		const diffEntries = await this.computeLineDiff(fileTracking.accepted_content, currentContent);
		
		await this.applyAutoAcceptDecorations(uri, diffEntries);
		await this.applyAutoAcceptDeletedZones(uri, diffEntries, fileTracking.accepted_content);
	}

	private async applyAutoAcceptDecorations(uri: URI, diffEntries: Array<{
		type: 'added' | 'deleted' | 'unchanged';
		content: string;
		oldLine: number;
		newLine: number;
	}>): Promise<void> {
		const model = this.modelService.getModel(uri);
		if (!model) {
			return;
		}
		
		const uriString = uri.toString();
		
		// Apply line decorations only for added lines
		const decorations: IModelDeltaDecoration[] = [];
		
		for (const diffEntry of diffEntries) {
			if (diffEntry.type === 'added') {
				const decorationOptions: IModelDecorationOptions = {
					description: 'auto-accept-added',
					isWholeLine: true,
					className: 'erdos-ai-auto-accept-added',
					glyphMarginClassName: 'erdos-ai-auto-accept-glyph-added',
					hoverMessage: new MarkdownString('**Auto-accepted addition** - Click to review')
				};
				
				if (diffEntry.newLine > 0) {
					decorations.push({
						range: new Range(diffEntry.newLine, 1, diffEntry.newLine, model.getLineMaxColumn(diffEntry.newLine)),
						options: decorationOptions
					});
				}
			}
		}
		
		// Apply added line decorations
		const existingDecorations = this.autoAcceptDecorations.get(uriString) || [];
		const newDecorationIds = model.deltaDecorations(existingDecorations, decorations);
		this.autoAcceptDecorations.set(uriString, newDecorationIds);
	}

	private async applyAutoAcceptDeletedZones(uri: URI, diffEntries: Array<{
		type: 'added' | 'deleted' | 'unchanged';
		content: string;
		oldLine: number;
		newLine: number;
	}>, acceptedContent: string): Promise<void> {
		const model = this.modelService.getModel(uri);
		if (!model) {
			return;
		}

		const uriString = uri.toString();
		const editors = this.codeEditorService.listCodeEditors();
		const editor = editors.find(e => e.getModel()?.uri.toString() === uriString);
		
		if (!editor) {
			return;
		}

		// Clear existing auto-accept zones for this file
		let existingZoneMap = this.autoAcceptZones.get(uriString);
		if (existingZoneMap) {
			for (const zone of existingZoneMap.values()) {
				try {
					zone.dispose();
				} catch (error) {
					console.error(`[FileChangeTracker] Error disposing zone:`, JSON.stringify(error.message));
				}
			}
			this.autoAcceptZones.delete(uriString);
		}

		// Identify all sections (added-only, deleted-only, combined)
		const sections = this.identifyDiffSections(diffEntries, model, acceptedContent);
		
		
		// Create zone widgets for all sections
		if (sections.length > 0) {
			
			const newZoneMap = new Map<number, AutoAcceptDiffZoneWidget>();
			
			for (const section of sections) {
				try {
					const zone = new AutoAcceptDiffZoneWidget(
						editor,
						section.zoneLineNumber,
						section.deletedLines,
						section.sectionId,
						this,
						this.themeService
					);
					
					// Always show zones since we only create them for the active editor
					zone.showWidget();
					
					newZoneMap.set(section.zoneLineNumber, zone);
				} catch (error) {
					this.logService.error(`Failed to create auto-accept zone at line ${section.zoneLineNumber}:`, error);
				}
			}
			
			this.autoAcceptZones.set(uriString, newZoneMap);
		}
		
		// Always fire onDiffSectionsCreated event to notify UI components like the floating bar
		const sectionIds = sections.map(section => section.sectionId);
		this._onDiffSectionsCreated.fire({ uri, sectionIds });
	}

	private identifyDiffSections(diffEntries: Array<{
		type: 'added' | 'deleted' | 'unchanged';
		content: string;
		oldLine: number;
		newLine: number;
	}>, model: any, acceptedContent: string): Array<{
		sectionId: string;
		type: 'added-only' | 'deleted-only' | 'combined';
		zoneLineNumber: number;
		addedLines: Array<{ lineNumber: number; content: string }>;
		deletedLines: string[];
		startLine: number;
		endLine: number;
	}> {

		const sections: Array<{
			sectionId: string;
			type: 'added-only' | 'deleted-only' | 'combined';
			zoneLineNumber: number;
			addedLines: Array<{ lineNumber: number; content: string }>;
			deletedLines: string[];
			startLine: number;
			endLine: number;
		}> = [];

		// Group consecutive added and deleted entries (handle both orders)
		let i = 0;
		while (i < diffEntries.length) {
			const entry = diffEntries[i];
			
			if (entry.type === 'added' || entry.type === 'deleted') {
				// Start a new section
				const addedLines: Array<{ lineNumber: number; content: string }> = [];
				const deletedLines: string[] = [];
				let startLine = entry.newLine > 0 ? entry.newLine : entry.oldLine;
				let endLine = startLine;

				// Collect consecutive added OR deleted lines and build StoredSectionInfo directly
				const storedAddedLines: Array<{lineNumber: number; content: string; acceptedPosition: number}> = [];
				const storedDeletedLines: Array<{content: string; acceptedPosition: number; insertPosition: number}> = [];
				
				while (i < diffEntries.length && (diffEntries[i].type === 'added' || diffEntries[i].type === 'deleted')) {
					const currentEntry = diffEntries[i];
					
					if (currentEntry.type === 'added') {
						// Calculate acceptedPosition for this added line
						const acceptedPosition = this.calculateAcceptedInsertPosition(diffEntries, currentEntry, acceptedContent);
						
						addedLines.push({
							lineNumber: currentEntry.newLine,
							content: currentEntry.content
						});
						storedAddedLines.push({
							lineNumber: currentEntry.newLine,
							content: currentEntry.content,
							acceptedPosition
						});
						endLine = Math.max(endLine, currentEntry.newLine);
					} else if (currentEntry.type === 'deleted') {
						deletedLines.push(currentEntry.content);
						// For deleted lines, acceptedPosition is their original position (oldLine)
						// insertPosition will be calculated later based on section type
						storedDeletedLines.push({
							content: currentEntry.content,
							acceptedPosition: currentEntry.oldLine,
							insertPosition: 0 // Will be set below
						});
					}
					
					i++;
				}

				// Determine section type and zone line number
				let sectionType: 'added-only' | 'deleted-only' | 'combined';
				let zoneLineNumber: number;

				if (addedLines.length > 0 && deletedLines.length > 0) {
					// Combined section: both added and deleted lines
					sectionType = 'combined';
					if (addedLines.length > 0) {
						zoneLineNumber = addedLines[addedLines.length - 1].lineNumber; // After last added line
					} else {
						// Fallback to deleted content position logic
						zoneLineNumber = this.findDeletedContentPosition(diffEntries, storedDeletedLines, model);
					}
				} else if (addedLines.length > 0) {
					// Added-only section
					sectionType = 'added-only';
					zoneLineNumber = addedLines[addedLines.length - 1].lineNumber; // After last added line
				} else {
					// Deleted-only section
					sectionType = 'deleted-only';
					// Find where to show deleted content using the stored deleted entries
					zoneLineNumber = this.findDeletedContentPosition(diffEntries, storedDeletedLines, model);
				}

				// Simple deterministic section ID based on position and type
				const sectionId = `section-${sectionType}-${startLine}-${endLine}`;
				
				// Pre-calculate and store section information for accept/reject operations
				const storedInfo: StoredSectionInfo = {
					type: sectionType
				};
				
				// Use pre-calculated added lines (no content matching needed)
				if (storedAddedLines.length > 0) {
					storedInfo.addedLines = storedAddedLines;
				}
				
				// Set insert positions for pre-calculated deleted lines (for reject operations)
				if (storedDeletedLines.length > 0) {
					let insertPosition: number;
					if (sectionType === 'combined' && addedLines.length > 0) {
						// Use the first added line's position for combined sections
						insertPosition = Math.min(...addedLines.map(l => l.lineNumber));
					} else if (sectionType === 'deleted-only') {
						// Use the zone line number for deleted-only sections
						insertPosition = zoneLineNumber + 1;
					} else {
						insertPosition = startLine;
					}
					
					// Set insertPosition for each deleted line (acceptedPosition already set from oldLine)
					storedDeletedLines.forEach((deletedLine, index) => {
						deletedLine.insertPosition = insertPosition + index;
					});
					
					storedInfo.deletedLines = storedDeletedLines;
				}
				
				// Store the section info for later use
				this.storedSectionInfo.set(sectionId, storedInfo);
				
				sections.push({
					sectionId,
					type: sectionType,
					zoneLineNumber,
					addedLines,
					deletedLines,
					startLine,
					endLine
				});
			} else {
				i++;
			}
		}

		return sections;
	}

	private findDeletedContentPosition(diffEntries: Array<{
		type: 'added' | 'deleted' | 'unchanged';
		content: string;
		oldLine: number;
		newLine: number;
	}>, deletedEntries: Array<{content: string; acceptedPosition: number; insertPosition: number}>, model: any): number {
		// Find the next unchanged line to determine where to show deleted content
		// Use the first deleted entry's acceptedPosition (which is the oldLine)
		const firstDeletedEntry = deletedEntries.length > 0 ? 
			diffEntries.find(entry => entry.type === 'deleted' && entry.oldLine === deletedEntries[0].acceptedPosition) :
			null;
		
		if (!firstDeletedEntry) {
			return Math.max(1, model.getLineCount());
		}

		let nextUnchangedLine: typeof firstDeletedEntry | null = null;
		let minOldLineAfterDeletion = Number.MAX_VALUE;
		
		for (const otherEntry of diffEntries) {
			if (otherEntry.type === 'unchanged' && 
				otherEntry.oldLine > 0 && 
				otherEntry.oldLine > firstDeletedEntry.oldLine && 
				otherEntry.oldLine < minOldLineAfterDeletion &&
				otherEntry.newLine > 0) {
				minOldLineAfterDeletion = otherEntry.oldLine;
				nextUnchangedLine = otherEntry;
			}
		}
		
		if (nextUnchangedLine) {
			return Math.max(1, nextUnchangedLine.newLine - 1);
		} else {
			return Math.max(1, model.getLineCount());
		}
	}

	async acceptAllAutoAcceptChanges(uri: URI): Promise<void> {
		const filePath = uri.fsPath;
		
		const workspace = this.workspaceContextService.getWorkspace();
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		const workspaceId = workspace.id;
		
		const storageRoot = isEmptyWindow ?
			URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
			URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
		
		const trackingDir = URI.joinPath(storageRoot, 'auto-accept-tracking');
		const fileMapPath = URI.joinPath(trackingDir, 'file-map.json');
		
		const mapContent = await this.fileService.readFile(fileMapPath);
		const fileMap = JSON.parse(mapContent.value.toString());
		const fileHash = fileMap[filePath];
		
		if (!fileHash) return;
		
		const fileTrackingPath = URI.joinPath(trackingDir, 'files', `${fileHash}.json`);
		const trackingContent = await this.fileService.readFile(fileTrackingPath);
		const fileTracking = JSON.parse(trackingContent.value.toString());
		
	// Update original content to current content
	const isNotebook = this.commonUtils.getFileExtension(uri.fsPath).toLowerCase() === 'ipynb';
	
	if (isNotebook) {
		// For notebooks, check if model exists before trying to get snapshot
		const notebookModel = this.notebookService.getNotebookTextModel(uri);
		if (!notebookModel) {
			return;
		}
		
		// For notebooks, use VSCode's serialization and add cell IDs
		let currentContent: string;
		try {
			const snapshotStream = await this.notebookService.createNotebookTextDocumentSnapshot(
				uri, 
				SnapshotContext.Save,
				new CancellationTokenSource().token
			);
			const buffer = await streamToBuffer(snapshotStream);
			currentContent = buffer.toString();
		} catch (error) {
			return;
		}
			
			// Store current content as accepted (cells should already have erdosAi_cellId)
			fileTracking.accepted_content = currentContent;
		} else {
			// For regular files, use disk content
			const currentContent = await this.fileService.readFile(uri);
			fileTracking.accepted_content = currentContent.value.toString();
		}
		
		const trackingDataToWrite = JSON.stringify(fileTracking, null, 2);
		await this.fileService.writeFile(fileTrackingPath, VSBuffer.fromString(trackingDataToWrite));
		
		// Clear all auto-accept highlighting, zones, and state
		if (isNotebook) {
			// Clear all notebook auto-accept state
			this.clearAutoAcceptZones(uri.toString());
			this.notebookDiffService.notebookClearAutoAcceptHighlighting(uri);
			this.completeNotebookOperation(uri.toString());
		} else {
			// Clear all regular file auto-accept state
			this.clearAutoAcceptHighlighting(uri); // This already calls clearAutoAcceptZones internally
		}

		// Check if file should be cleaned up from tracking (no more diffs)
		await this.cleanupFileIfNoDiffs(uri);
	}

	async rejectAllAutoAcceptChanges(uri: URI): Promise<void> {
		const filePath = uri.fsPath;
		
		const workspace = this.workspaceContextService.getWorkspace();
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		const workspaceId = workspace.id;
		
		const storageRoot = isEmptyWindow ?
			URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
			URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
		
		const trackingDir = URI.joinPath(storageRoot, 'auto-accept-tracking');
		const fileMapPath = URI.joinPath(trackingDir, 'file-map.json');
		
		const mapContent = await this.fileService.readFile(fileMapPath);
		const fileMap = JSON.parse(mapContent.value.toString());
		const fileHash = fileMap[filePath];
		
		if (!fileHash) return;
		
		const fileTrackingPath = URI.joinPath(trackingDir, 'files', `${fileHash}.json`);
		const trackingContent = await this.fileService.readFile(fileTrackingPath);
		const fileTracking = JSON.parse(trackingContent.value.toString());
		
		// Revert current content back to accepted content
		const isNotebook = this.commonUtils.getFileExtension(uri.fsPath).toLowerCase() === 'ipynb';
		
		if (isNotebook) {
			// For notebooks, apply the accepted content to the notebook model
			const notebookEditor = this.notebookDiffService.findNotebookEditorForUri(uri);
			if (!notebookEditor || !notebookEditor.hasModel()) {
				return;
			}
			
			const notebookModel = notebookEditor.textModel!;
			const acceptedNotebook = JSON.parse(fileTracking.accepted_content);
			
			// Replace all cells with the accepted content
			const newCells = acceptedNotebook.cells.map((cell: any, cellIndex: number) => {
				const vscodeMetadata: any = {};
				if (cell.cell_type === 'code' && cell.execution_count !== undefined) {
					vscodeMetadata.execution_count = cell.execution_count;
				}
				if (cell.metadata) {
					vscodeMetadata.metadata = cell.metadata;  // Nest Jupyter metadata under 'metadata' property
				}
				
				const newCellData = {
					cellKind: cell.cell_type === 'markdown' ? 1 : 2, // 1 = markdown, 2 = code
					source: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
					language: cell.cell_type === 'code' ? 'python' : 'markdown',
					mime: cell.cell_type === 'markdown' ? 'text/markdown' : 'text/x-python',
					metadata: vscodeMetadata,
					outputs: cell.outputs || []
				};
				return newCellData;
			});
			
			// Replace all cells atomically
			notebookModel.applyEdits([{
				editType: 1, // CellEditType.Replace
				index: 0,
				count: notebookModel.cells.length,
				cells: newCells
			}], true, undefined, () => undefined, undefined, true);
		} else {
			// For regular files, replace the content in the Monaco model
			const model = this.modelService.getModel(uri);
			if (!model) {
				return;
			}
			
			const fullRange = model.getFullModelRange();
			model.pushEditOperations([], [{
				range: fullRange,
				text: fileTracking.accepted_content
			}], () => null);
			
			// Force a flush to ensure changes are applied
			if (model.pushStackElement) {
				model.pushStackElement();
			}
		}
		
		// Clear all auto-accept highlighting, zones, and state
		if (isNotebook) {
			// Clear all notebook auto-accept state
			this.clearAutoAcceptZones(uri.toString());
			this.notebookDiffService.notebookClearAutoAcceptHighlighting(uri);
			this.completeNotebookOperation(uri.toString());
		} else {
			// Clear all regular file auto-accept state
			this.clearAutoAcceptHighlighting(uri); // This already calls clearAutoAcceptZones internally
		}

		// Check if file should be cleaned up from tracking (no more diffs)
		await this.cleanupFileIfNoDiffs(uri);
	}

	clearAutoAcceptHighlighting(uri: URI): void {
		const uriString = uri.toString();
		
		// Clear line decorations
		const decorationIds = this.autoAcceptDecorations.get(uriString);
		if (decorationIds) {
			const model = this.modelService.getModel(uri);
			if (model) {
				model.deltaDecorations(decorationIds, []);
			}
			this.autoAcceptDecorations.delete(uriString);
		}
		
		// Clear zone widgets for auto-accept deleted lines using centralized method
		this.clearAutoAcceptZones(uriString);
	}

	async acceptDiffSection(uri: URI, diffSectionId: string): Promise<void> {
		// Check if this is a notebook file
		const fileExtension = this.commonUtils.getFileExtension(uri.fsPath);
		const isNotebook = fileExtension.toLowerCase() === 'ipynb';
			
		if (isNotebook) {
			try {
				await this.notebookAcceptDiffSection(uri, diffSectionId);
			} catch (error) {
				console.error(`ACCEPT_DIFF_SECTION: notebookAcceptDiffSection ERROR: ${JSON.stringify({
					message: error.message,
					stack: error.stack,
					name: error.name
				})}`);
			}
			return;
		}
			
		// Get stored section information
		const storedInfo = this.storedSectionInfo.get(diffSectionId);
		if (!storedInfo) {
			this.logService.error(`No stored section info found for: ${diffSectionId}`);
			return;
		}
		
		// Load tracking data
		const { fileTracking, fileTrackingPath } = await this.loadSectionData(uri);
		if (!fileTracking || !fileTrackingPath) {
			return;
		}
		
		// Apply the section changes to accepted_content using pre-calculated positions
		let updatedAcceptedContent = fileTracking.accepted_content;
		
		// For combined sections, remove first then add to avoid position conflicts
		// Step 1: Remove the deleted lines from accepted content
		if (storedInfo.deletedLines && storedInfo.deletedLines.length > 0) {
			const lineNumbersToRemove = storedInfo.deletedLines.map(line => line.acceptedPosition);
			updatedAcceptedContent = this.removeLinesFromContent(updatedAcceptedContent, lineNumbersToRemove);
		}
		
		// Step 2: Add the added lines to accepted content at pre-calculated positions
		if (storedInfo.addedLines && storedInfo.addedLines.length > 0) {
			const linesToInsert = storedInfo.addedLines.map(line => ({
				lineNumber: line.acceptedPosition,
				content: line.content
			}));
			
			updatedAcceptedContent = this.insertLinesIntoContent(updatedAcceptedContent, linesToInsert);
		}
		
		// Save updated tracking data
		fileTracking.accepted_content = updatedAcceptedContent;
		await this.fileService.writeFile(fileTrackingPath, VSBuffer.fromString(JSON.stringify(fileTracking, null, 2)));
			
		// Remove the stored section info since it's now accepted
		this.storedSectionInfo.delete(diffSectionId);
		
		// Refresh highlighting (the accepted section should disappear)
		await this.applyAutoAcceptHighlighting(uri);
		
		// Check if file should be cleaned up (no more diffs)
		await this.cleanupFileIfNoDiffs(uri);
		
		// Fire event to notify that diff section was accepted
		this._onDiffSectionChanged.fire({ uri, action: 'accept', sectionId: diffSectionId });
	}

	async rejectDiffSection(uri: URI, diffSectionId: string): Promise<void> {
		// Check if this is a notebook file
		const fileExtension = this.commonUtils.getFileExtension(uri.fsPath);
		const isNotebook = fileExtension.toLowerCase() === 'ipynb';
			
		if (isNotebook) {
			try {
				await this.notebookRejectDiffSection(uri, diffSectionId);
			} catch (error) {
				console.error(`REJECT_DIFF_SECTION: notebookRejectDiffSection ERROR: ${JSON.stringify({
					message: error.message,
					stack: error.stack,
					name: error.name
				})}`);
			}
			return;
		}
		
		// Get stored section information
		const storedInfo = this.storedSectionInfo.get(diffSectionId);
		if (!storedInfo) {
			throw new Error(`No stored section info found for: ${diffSectionId}`);
		}
		
		// Load model to get current content
		const model = this.modelService.getModel(uri);
		if (!model) {
			return;
		}
		
		// Apply inverse changes to current file content using pre-calculated positions
		let currentContent = model.getValue();
		
		// For reject: revert the current file to match accepted_content for this section
		if (storedInfo.addedLines && storedInfo.addedLines.length > 0) {
			// Remove added lines from current file by line number (not content)
			const lineNumbersToRemove = storedInfo.addedLines.map(line => line.lineNumber);
			currentContent = this.removeLinesFromContent(currentContent, lineNumbersToRemove);
		}
		
		if (storedInfo.deletedLines && storedInfo.deletedLines.length > 0) {
			// Re-insert deleted lines into current file at pre-calculated positions
			const linesToInsert = storedInfo.deletedLines.map(line => ({
				lineNumber: line.insertPosition,
				content: line.content
			}));
			
			currentContent = this.insertLinesIntoContent(currentContent, linesToInsert);
		}
		
		// Apply changes to the text model using reliable edit operations (same as notebooks)
		const fullRange = model.getFullModelRange();
		model.pushEditOperations([], [{
			range: fullRange,
			text: currentContent
		}], () => null);
		
		// Force a flush to ensure changes are applied
		if (model.pushStackElement) {
			model.pushStackElement();
		}
			
		// Remove the stored section info since it's now rejected
		this.storedSectionInfo.delete(diffSectionId);
		
		// Refresh highlighting (the rejected section should disappear)
		await this.applyAutoAcceptHighlighting(uri);
		
		// Check if file should be cleaned up (no more diffs)
		await this.cleanupFileIfNoDiffs(uri);
			
		// Fire event to notify that diff section was rejected
		this._onDiffSectionChanged.fire({ uri, action: 'reject', sectionId: diffSectionId });
	}

	private async loadSectionData(uri: URI): Promise<{
		fileTracking: any;
		fileTrackingPath: URI;
		diffEntries: Array<{ type: 'added' | 'deleted' | 'unchanged'; content: string; oldLine: number; newLine: number; }>;
		model: any;
	} | { fileTracking: null; fileTrackingPath: null; diffEntries: null; model: null; }> {
		try {
			const filePath = uri.fsPath;
			const workspace = this.workspaceContextService.getWorkspace();
			const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
			const workspaceId = workspace.id;
			
			const storageRoot = isEmptyWindow ?
				URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
				URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
			
			const trackingDir = URI.joinPath(storageRoot, 'auto-accept-tracking');
			const fileMapPath = URI.joinPath(trackingDir, 'file-map.json');
			
			// Load file map
			const mapContent = await this.fileService.readFile(fileMapPath);
			const fileMap = JSON.parse(mapContent.value.toString());
			const fileHash = fileMap[filePath];
			
			if (!fileHash) {
				return { fileTracking: null, fileTrackingPath: null, diffEntries: null, model: null };
			}
			
			// Load tracking data
			const fileTrackingPath = URI.joinPath(trackingDir, 'files', `${fileHash}.json`);
			const trackingContent = await this.fileService.readFile(fileTrackingPath);
			const fileTracking = JSON.parse(trackingContent.value.toString());
			
			// Get current content from Monaco model (not disk) since user may have unsaved changes
			const model = this.modelService.getModel(uri);
			if (!model) {
				return { fileTracking: null, fileTrackingPath: null, diffEntries: null, model: null };
			}
			
			const currentContent = model.getValue();
			const diffEntries = await this.computeLineDiff(fileTracking.accepted_content, currentContent);
			
			return { fileTracking, fileTrackingPath, diffEntries, model };
		} catch (error) {
			this.logService.error('Failed to load section data:', error);
			return { fileTracking: null, fileTrackingPath: null, diffEntries: null, model: null };
		}
	}

	private insertLinesIntoContent(content: string, linesToInsert: Array<{ lineNumber: number; content: string }>): string {
		const lines = content === '' ? [] : content.split('\n');
		
		// Group consecutive lines to insert them as a block
		const sortedLines = [...linesToInsert].sort((a, b) => a.lineNumber - b.lineNumber);
		
		if (sortedLines.length === 0) {
			return content;
		}
		
		// Check if all lines are consecutive (for block insertion)
		let isConsecutive = true;
		for (let i = 1; i < sortedLines.length; i++) {
			if (sortedLines[i].lineNumber !== sortedLines[i-1].lineNumber + 1) {
				isConsecutive = false;
				break;
			}
		}
		
		if (isConsecutive && sortedLines.length > 1) {
			// Insert all lines as a consecutive block at the first position
			const insertIndex = Math.min(sortedLines[0].lineNumber - 1, lines.length);
			const contentToInsert = sortedLines.map(line => line.content);
			lines.splice(insertIndex, 0, ...contentToInsert);
		} else {
			// Insert lines individually in reverse order to avoid index shifting
			const reverseSortedLines = [...sortedLines].reverse();
			for (const lineToInsert of reverseSortedLines) {
				const insertIndex = Math.min(lineToInsert.lineNumber - 1, lines.length);
				lines.splice(insertIndex, 0, lineToInsert.content);
			}
		}
		
		return lines.join('\n');
	}

	private removeLinesFromContent(content: string, lineNumbersToRemove: number[]): string {
		const lines = content === '' ? [] : content.split('\n');
		
		// Sort line numbers in descending order to avoid index shifting issues
		const sortedLineNumbers = [...lineNumbersToRemove].sort((a, b) => b - a);
		
		// Remove lines by their 1-based line numbers
		for (const lineNumber of sortedLineNumbers) {
			const index = lineNumber - 1; // Convert to 0-based index
			if (index >= 0 && index < lines.length) {
				lines.splice(index, 1);
			}
		}
		
		return lines.join('\n');
	}

	private async cleanupFileIfNoDiffs(uri: URI): Promise<void> {
		const filePath = uri.fsPath;
		const workspace = this.workspaceContextService.getWorkspace();
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		const workspaceId = workspace.id;
		
		const storageRoot = isEmptyWindow ?
			URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
			URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
		
		const trackingDir = URI.joinPath(storageRoot, 'auto-accept-tracking');
		const fileMapPath = URI.joinPath(trackingDir, 'file-map.json');
		
		// Load file map
		const mapContent = await this.fileService.readFile(fileMapPath);
		const fileMap = JSON.parse(mapContent.value.toString());
		const fileHash = fileMap[filePath];
		
		if (!fileHash) {
			return; // File not tracked
		}
		
		// Load tracking data
		const fileTrackingPath = URI.joinPath(trackingDir, 'files', `${fileHash}.json`);
		const trackingContent = await this.fileService.readFile(fileTrackingPath);
		const fileTracking = JSON.parse(trackingContent.value.toString());
		
	// Get current content and compute diff
	const isNotebook = this.commonUtils.getFileExtension(uri.fsPath).toLowerCase() === 'ipynb';
	let diffEntries;
	let currentContent: string;
	
	if (isNotebook) {
		// For notebooks, check if model exists before trying to get snapshot
		const notebookModel = this.notebookService.getNotebookTextModel(uri);
		if (!notebookModel) {
			return;
		}
		
		// For notebooks, use VSCode's real serialization process
		try {
			const snapshotStream = await this.notebookService.createNotebookTextDocumentSnapshot(
				uri, 
				SnapshotContext.Save,
				new CancellationTokenSource().token
			);
			const buffer = await streamToBuffer(snapshotStream);
			currentContent = buffer.toString();
		} catch (error) {
			return;
		}
			
			// Use flat line approach like other notebook methods
			const oldData = this.notebookExtractLines(fileTracking.accepted_content);
			const newData = this.notebookExtractLines(currentContent);
			const flatOldContent = oldData.lines.join('\n');
			const flatNewContent = newData.lines.join('\n');			
			diffEntries = await this.computeLineDiff(flatOldContent, flatNewContent);
		} else {
			// For regular files, use Monaco model if available (like in reject), otherwise disk content
			const model = this.modelService.getModel(uri);
			if (model) {
				currentContent = model.getValue();
			} else {
				const fileContent = await this.fileService.readFile(uri);
				currentContent = fileContent.value.toString();
			}
			
			diffEntries = await this.computeLineDiff(fileTracking.accepted_content, currentContent);
		}				
		// Check if there are any remaining diffs
		const hasChanges = diffEntries.some(entry => entry.type === 'added' || entry.type === 'deleted');
		
		if (!hasChanges) {
			// Remove from file map
			delete fileMap[filePath];
			const fileMapDataToWrite = JSON.stringify(fileMap, null, 2);
			await this.fileService.writeFile(fileMapPath, VSBuffer.fromString(fileMapDataToWrite));
			
			// Delete the tracking file
			try {
				await this.fileService.del(fileTrackingPath);
			} catch (error) {
				this.logService.warn('Failed to delete tracking file:', error);
			}
			
			// Clear auto-accept highlighting
			const isNotebook = this.commonUtils.getFileExtension(uri.fsPath).toLowerCase() === 'ipynb';
			if (isNotebook) {
				// For notebooks, clear FileChangeTracker's zones AND contribution's highlighting
				this.clearAutoAcceptHighlighting(uri); // This clears FileChangeTracker's zones
				this.notebookDiffService.notebookClearAutoAcceptHighlighting(uri);
			} else {
				// For regular files, use the regular clear method
				this.clearAutoAcceptHighlighting(uri);
			}
			
			// Switch back to main diff highlighting
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation && this.isFileHighlightingEnabled(currentConversation.info.id)) {
				await this.applyHighlightingFromFileChanges(currentConversation.info.id);
			}
		}
	}

	async getTrackedFilesWithChanges(): Promise<Array<{
		filePath: string;
		fileName: string;
		addedLines: number;
		deletedLines: number;
		uri: URI;
	}>> {
		try {
			const workspace = this.workspaceContextService.getWorkspace();
			const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
			const workspaceId = workspace.id;
			
			const storageRoot = isEmptyWindow ?
				URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
				URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
			
			const trackingDir = URI.joinPath(storageRoot, 'auto-accept-tracking');
			const fileMapPath = URI.joinPath(trackingDir, 'file-map.json');
			
			// Check if file map exists
			const mapExists = await this.fileService.exists(fileMapPath);
			if (!mapExists) {
				return [];
			}
			
			// Load file map
			const mapContent = await this.fileService.readFile(fileMapPath);
			const fileMap = JSON.parse(mapContent.value.toString());
			
			const trackedFiles: Array<{
				filePath: string;
				fileName: string;
				addedLines: number;
				deletedLines: number;
				uri: URI;
			}> = [];
			
			// Process each tracked file
			for (const [filePath, fileHash] of Object.entries(fileMap)) {
				try {
					const fileTrackingPath = URI.joinPath(trackingDir, 'files', `${fileHash}.json`);
					const trackingContent = await this.fileService.readFile(fileTrackingPath);
					const fileTracking = JSON.parse(trackingContent.value.toString());
					
				const uri = URI.file(filePath);
				
				// Check if file still exists on disk
				const fileExists = await this.fileService.exists(uri);
				if (!fileExists) {
					// File was deleted, skip it
					continue;
				}
				
				// Get current content
				let currentContent: string;
				const isNotebook = this.commonUtils.getFileExtension(uri.fsPath).toLowerCase() === 'ipynb';
				
			if (isNotebook) {
				// For notebooks, check if model exists before trying to get snapshot
				const notebookModel = this.notebookService.getNotebookTextModel(uri);
				if (!notebookModel) {
					// Notebook not loaded, skip it (can't get proper serialized content without loading)
					continue;
				}
				
				// For notebooks, use VSCode's REAL serialization process
				try {
					const snapshotStream = await this.notebookService.createNotebookTextDocumentSnapshot(
						uri, 
						SnapshotContext.Save,
						new CancellationTokenSource().token
					);
					
					const buffer = await streamToBuffer(snapshotStream);
					currentContent = buffer.toString();
				} catch (error) {
					continue;
				}
				} else {
						// For regular files, use Monaco model if available, otherwise from disk
						const model = this.modelService.getModel(uri);
						if (model) {
							currentContent = model.getValue();
						} else {
							try {
								const fileContent = await this.fileService.readFile(uri);
								currentContent = fileContent.value.toString();
							} catch {
								// File may not exist anymore, skip it
								continue;
							}
						}
					}
					
					// Compute diff to get change statistics
					let diffEntries;
					if (isNotebook) {
					// For notebooks, use flat line approach like auto-accept highlighting
					const oldData = this.notebookExtractLines(fileTracking.accepted_content);
					const newData = this.notebookExtractLines(currentContent);
						const flatOldContent = oldData.lines.join('\n');
						const flatNewContent = newData.lines.join('\n');
						diffEntries = await this.computeLineDiff(flatOldContent, flatNewContent);
					} else {
						// For regular files, compare raw content
						diffEntries = await this.computeLineDiff(fileTracking.accepted_content, currentContent);
					}
					
					let addedLines = 0;
					let deletedLines = 0;
					
					for (const entry of diffEntries) {
						if (entry.type === 'added') {
							addedLines++;
						} else if (entry.type === 'deleted') {
							deletedLines++;
						}
					}
					
					// Only include files that have actual changes
					if (addedLines > 0 || deletedLines > 0) {
						const fileName = uri.path.split('/').pop() || uri.path;
						
						trackedFiles.push({
							filePath,
							fileName,
							addedLines,
							deletedLines,
							uri
						});
					}
				} catch (error) {
					this.logService.warn(`Failed to process tracked file ${filePath}:`, error);
					continue;
				}
			}
			
			return trackedFiles;
		} catch (error) {
			this.logService.error('Failed to get tracked files with changes:', error);
			return [];
		}
	}

	async acceptAllExceptConversation(conversationId: number): Promise<void> {
		const workspace = this.workspaceContextService.getWorkspace();
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		const workspaceId = workspace.id;
		
		const storageRoot = isEmptyWindow ?
			URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
			URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
		
		const trackingDir = URI.joinPath(storageRoot, 'auto-accept-tracking');
		const fileMapPath = URI.joinPath(trackingDir, 'file-map.json');
		
		const mapExists = await this.fileService.exists(fileMapPath);
		if (!mapExists) {
			return;
		}
		
		const mapContent = await this.fileService.readFile(fileMapPath);
		const fileMap = JSON.parse(mapContent.value.toString());
		
		for (const [filePath, fileHash] of Object.entries(fileMap)) {
			const fileTrackingPath = URI.joinPath(trackingDir, 'files', `${fileHash}.json`);
			const trackingContent = await this.fileService.readFile(fileTrackingPath);
			const fileTracking = JSON.parse(trackingContent.value.toString());
			
			if (!fileTracking.conversations.includes(conversationId)) {
				const uri = URI.file(filePath);
				await this.acceptAllAutoAcceptChanges(uri);
			}
		}
	}

	private calculateAcceptedInsertPosition(diffEntries: Array<{
		type: 'added' | 'deleted' | 'unchanged';
		content: string;
		oldLine: number;
		newLine: number;
	}>, addedEntry: { type: 'added' | 'deleted' | 'unchanged'; content: string; oldLine: number; newLine: number; }, acceptedContent: string): number {
		// Find the index of this added entry in the diffEntries array (by reference, not content)
		const addedEntryIndex = diffEntries.indexOf(addedEntry);
		
		if (addedEntryIndex === -1) {
			throw new Error(`Added entry not found in diff entries for newLine: ${addedEntry.newLine}`);
		}
		
		// Look backwards for the last unchanged line to get a reference point
		let referenceOldLine = 0; // If no unchanged line found, insert at beginning
		for (let i = addedEntryIndex - 1; i >= 0; i--) {
			const entry = diffEntries[i];
			if (entry.type === 'unchanged') {
				referenceOldLine = entry.oldLine;
				break;
			}
		}
		
		// Count how many added lines come before this one (after the reference point)
		let addedLinesBeforeThis = 0;
		for (let i = addedEntryIndex - 1; i >= 0; i--) {
			const entry = diffEntries[i];
			if (entry.type === 'unchanged' && entry.oldLine === referenceOldLine) {
				break; // Stop at our reference point
			}
			if (entry.type === 'added') {
				addedLinesBeforeThis++;
			}
		}
		
		// The position in accepted content should be: reference + 1 + offset for previous added lines
		const acceptedPosition = referenceOldLine + 1 + addedLinesBeforeThis;
		
		
		return acceptedPosition;
	}

	/**
	 * Apply auto-accept highlighting for notebook files using the notebook diff service
	 */
	private async notebookApplyAutoAcceptHighlighting(uri: URI): Promise<void> {
		// Set notebook operation guard to prevent interference from regular diff highlighting
		this.startNotebookOperation(uri.toString());
		
		const filePath = uri.fsPath;		
		const workspace = this.workspaceContextService.getWorkspace();
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		const workspaceId = workspace.id;
		
		const storageRoot = isEmptyWindow ?
			URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
			URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
		
		const trackingDir = URI.joinPath(storageRoot, 'auto-accept-tracking');
		const fileMapPath = URI.joinPath(trackingDir, 'file-map.json');
		
		const mapContent = await this.fileService.readFile(fileMapPath);
		const fileMap = JSON.parse(mapContent.value.toString());
		const fileHash = fileMap[filePath];
		
		if (!fileHash) {
			this.completeNotebookOperation(uri.toString());
			return;
		}
		
		const fileTrackingPath = URI.joinPath(trackingDir, 'files', `${fileHash}.json`);
		const trackingContent = await this.fileService.readFile(fileTrackingPath);
		const fileTracking = JSON.parse(trackingContent.value.toString());
		
		
		const notebookModel = this.notebookService.getNotebookTextModel(uri);
		if (!notebookModel) {
			this.completeNotebookOperation(uri.toString());
			return;
		}
		
		// Get current notebook content using VSCode's notebook serialization process
		let notebookCurrentContent: string;
		try {
			const snapshotStream = await this.notebookService.createNotebookTextDocumentSnapshot(
				uri, 
				SnapshotContext.Save,
				new CancellationTokenSource().token
			);
			const buffer = await streamToBuffer(snapshotStream);
			notebookCurrentContent = buffer.toString();
		} catch (error) {
			this.completeNotebookOperation(uri.toString());
			return;
		}
		const cellBasedDiffs = await this.computeNotebookCellBasedDiff(fileTracking.accepted_content, notebookCurrentContent, uri);
		
		// If no differences found, clear auto-accept highlighting and return
		if (cellBasedDiffs.length === 0) {
			this.clearAutoAcceptZones(uri.toString());
			this.notebookDiffService.notebookClearAutoAcceptHighlighting(uri);
			this.completeNotebookOperation(uri.toString());
			return;
		}
		
		// Get current notebook editor to create empty cells for deleted cells (if needed)
		const notebookEditor = this.notebookDiffService.findNotebookEditorForUri(uri);
		if (notebookEditor && notebookEditor.hasModel()) {
			const notebookModel = notebookEditor.textModel!;
			
			// Create empty cells for any deleted cells (cells that exist in accepted but not current)
			// Only create if the cell doesn't already exist at that index WITH THE SAME ID
			for (const cellDiff of cellBasedDiffs) {
				if (cellDiff.diffType === 'deleted') {
					// Check if there's already a cell at this index with the SAME cell ID
					const existingCell = notebookModel.cells[cellDiff.cellIndex];
					const existingCellId = existingCell ? (existingCell.metadata as CellMetadata)?.metadata?.erdosAi_cellId : null;
					const isSameCell = existingCellId === cellDiff.cellId;
					
					if (!existingCell || !isSameCell) {
						// Determine cell type from the original cell content in accepted content
						// Pass false since we don't want to persist temp IDs for accepted content
						const originalCells = this.extractNotebookCells(fileTracking.accepted_content, uri, false);
						const originalCell = Array.from(originalCells.values()).find(cell => 
							cell.cellId === cellDiff.cellId
						);
						
						const cellKind = originalCell?.cellType === 'markdown' ? 1 : 2; // 1 = markdown, 2 = code
						
						const cellMetadata = {
							metadata: {
								erdosAi_cellId: cellDiff.cellId // Preserve the original cell ID - properly nested inside metadata!
							}
						};
						const newCellData = {
							cellKind: cellKind,
							source: '', // Empty content
							language: cellKind === 2 ? 'python' : 'markdown',
							mime: cellKind === 1 ? 'text/markdown' : 'text/x-python',
							metadata: cellMetadata,
							outputs: []
						};
						
						// Create empty cell at the appropriate position
						notebookModel.applyEdits([{
							editType: 1, // CellEditType.Replace  
							index: cellDiff.cellIndex,
							count: 0, // Insert, don't replace
							cells: [newCellData]
						}], true, undefined, () => undefined, undefined, true);
					} else {
						// The same cell already exists at this index - this means the cell is in the current notebook
						// It shouldn't be marked as "deleted", so this is unexpected
						console.warn(`[DELETED_CELL] Same cell already exists at index ${cellDiff.cellIndex}, skipping ghost cell creation (cell not actually deleted)`);
					}
				}
			}
		}
		
		// Clear existing notebook stored sections
		this.notebookStoredSectionInfo.clear();
		
		let sectionsCreated = 0;
		
		// Create sections for each cell diff using proper section identification
		for (const cellDiff of cellBasedDiffs) {		
			if (!cellDiff.lineDiffs || cellDiff.lineDiffs.length === 0) {
				continue;
			}
					
			// Use the proper section identification logic (same as regular files)
			const cellSections = this.notebookIdentifyDiffSections(cellDiff.lineDiffs, cellDiff.cellIndex);
			
			// Create stored info for each section within this cell
			for (const section of cellSections) {
				const addedLines: Array<{
					currentCellLineNumber: number;
					currentCellNumber: number;
					content: string;
					acceptedCellLineNumber: number;
					acceptedCellNumber: number;
				}> = [];
				
				const deletedLines: Array<{
					content: string;
					acceptedCellLineNumber: number;
					acceptedCellNumber: number;
					currentCellLineNumber: number;
					currentCellNumber: number;
				}> = [];
				
				// Convert section data to stored info format
				for (const addedLine of section.addedLines) {
					addedLines.push({
						currentCellLineNumber: addedLine.lineNumber,
						currentCellNumber: cellDiff.cellIndex,
						content: addedLine.content,
						acceptedCellLineNumber: addedLine.lineNumber,
						acceptedCellNumber: cellDiff.cellIndex
					});
				}
				
				for (const deletedContent of section.deletedLines) {
					// Find the line number for this deleted content
					const deletedLineDiff = cellDiff.lineDiffs.find(diff => 
						diff.type === 'deleted' && diff.content === deletedContent
					);
					if (deletedLineDiff) {
						deletedLines.push({
								content: deletedContent,
								acceptedCellLineNumber: deletedLineDiff.lineNumber,
								acceptedCellNumber: cellDiff.cellIndex,
								currentCellLineNumber: deletedLineDiff.lineNumber,
								currentCellNumber: cellDiff.cellIndex
							});
						}
					}
					
				// Store notebook section info
				const storedInfo: NotebookStoredSectionInfo = {
					type: section.type
				};
				
				if (addedLines.length > 0) {
					storedInfo.addedLines = addedLines;
				}
				
				if (deletedLines.length > 0) {
					storedInfo.deletedLines = deletedLines;
				}
				
				this.notebookStoredSectionInfo.set(section.sectionId, storedInfo);
				sectionsCreated++;
			}
		}
		
		if (sectionsCreated > 0) {
			// Fire onDiffSectionsCreated event to notify UI components like the floating bar
			const sectionIds = Array.from(this.notebookStoredSectionInfo.keys());
			this._onDiffSectionsCreated.fire({ uri, sectionIds });
		}
		
		// Process each cell exactly like regular files: Step 1 - Apply decorations, Step 2 - Apply zones
		// Group cell diffs by cellIndex first to get raw diffEntries per cell
		const cellDiffMap = new Map<number, Array<{
			type: 'added' | 'deleted' | 'unchanged';
			content: string;
			lineNumber: number;
		}>>();
		
		for (const cellDiff of cellBasedDiffs) {
			if (!cellDiffMap.has(cellDiff.cellIndex)) {
				cellDiffMap.set(cellDiff.cellIndex, []);
			}
			
			// Add all line diffs for this cell (including unchanged)
			const lineDiffs = (cellDiff.lineDiffs || []).map(lineDiff => ({
				type: lineDiff.type,
				content: lineDiff.content,
				lineNumber: lineDiff.lineNumber
			}));
			
			cellDiffMap.get(cellDiff.cellIndex)!.push(...lineDiffs);
		}
		
		// Step 1: Apply decorations (green highlighting for added lines) - like applyAutoAcceptDecorations
		const cellDiffArray: Array<{
			cellIndex: number;
			type: 'modified';
			lineDiffs: Array<{
				type: 'added' | 'deleted';
				content: string;
				lineNumber: number;
				sectionId?: string;
			}>;
		}> = [];
		
		for (const [cellIndex, cellLineDiffs] of cellDiffMap) {
			// Filter for added lines only (like applyAutoAcceptDecorations does)
			const addedLineDiffs = cellLineDiffs
				.filter(diff => diff.type === 'added')
				.map(diff => ({
					type: 'added' as const,
					content: diff.content,
					lineNumber: diff.lineNumber
				}));
			
			if (addedLineDiffs.length > 0) {
				cellDiffArray.push({
					cellIndex,
					type: 'modified',
					lineDiffs: addedLineDiffs
				});
			}
		}
		
		// Apply green decorations for added lines using the notebook service
		const conversationId = this.conversationManager.getCurrentConversation()?.info.id?.toString() || 'unknown';
		this.notebookDiffService.notebookApplyAutoAcceptDecorations(uri, conversationId, cellDiffArray, this);
		await this.notebookApplyAutoAcceptDeletedZones(uri, cellDiffMap);
		this.completeNotebookOperation(uri.toString());
	}

	/**
	 * Apply auto-accept zone widgets for notebook files (deleted content + buttons)
	 */
	private async notebookApplyAutoAcceptDeletedZones(uri: URI, cellDiffMap: Map<number, Array<{
		type: 'added' | 'deleted' | 'unchanged';
		content: string;
		lineNumber: number;
	}>>): Promise<void> {
		// Clear existing notebook auto-accept zones for this file (exactly like regular files do)
		this.clearAutoAcceptZones(uri.toString());
		
		// Create zone widgets directly for each section, just like regular files do
		const notebookNewZoneMap = new Map<string, NotebookAutoAcceptDiffZoneWidget>();
		
		for (const [cellIndex, cellLineDiffs] of cellDiffMap) {
			// Run identifyDiffSections equivalent for this cell
			// Note: originalCellContent not available here, but whole-cell detection was already done in the first pass
			const cellSections = this.notebookIdentifyDiffSections(cellLineDiffs, cellIndex);
			
			// Create zone widgets directly for each section (like regular files)
			if (cellSections.length > 0) {
				for (const section of cellSections) {
					try {
						// Create notebook zone widget in virtual state (no Monaco view zone yet)
						// The NotebookZoneManager will create actual zones when cells become visible
						const cellEditor = this.getCellEditor(uri, cellIndex);
						
						// Create zone widget with a dummy editor - it won't create actual Monaco zones yet
						const dummyEditor = cellEditor || null;
						const notebookZone = new NotebookAutoAcceptDiffZoneWidget(
							dummyEditor,
							section.zoneLineNumber,
							section.deletedLines,
							section.sectionId,
							this,
							uri,
							cellIndex,
							this.themeService
						);
						
						const zoneKey = `${cellIndex}-${section.zoneLineNumber}`;
						notebookNewZoneMap.set(zoneKey, notebookZone);
					} catch (error) {
						this.logService.error(`Failed to create notebook auto-accept zone at cell ${cellIndex}, line ${section.zoneLineNumber}:`, error);
					}
				}
			}
		}
		
		// Store notebook zones for disposal (exactly like regular files do)
		this.notebookAutoAcceptZones.set(uri.toString(), notebookNewZoneMap);
		
		// ALWAYS update the NotebookZoneManager map whenever this method is called
		this.notebookZoneManager.updateZoneMap(uri, notebookNewZoneMap);
	}

	/**
	 * Accept notebook diff section by modifying the accepted_content JSON
	 */
	private async notebookAcceptDiffSection(uri: URI, diffSectionId: string): Promise<void> {		
		// Get stored notebook section information
		const storedInfo = this.notebookStoredSectionInfo.get(diffSectionId);
		
		if (!storedInfo) {
			this.logService.error(`No stored notebook section info found for: ${diffSectionId}`);
			return;
		}
						
		// Load tracking data (notebook-specific version, inlined)
		let fileTracking: any;
		let fileTrackingPath: URI;
		
		try {
			const filePath = uri.fsPath;
			const workspace = this.workspaceContextService.getWorkspace();
			const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
			const workspaceId = workspace.id;
			
			const storageRoot = isEmptyWindow ?
				URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
				URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
			
			const trackingDir = URI.joinPath(storageRoot, 'auto-accept-tracking');
			const fileMapPath = URI.joinPath(trackingDir, 'file-map.json');
			
			// Load file map
			const mapContent = await this.fileService.readFile(fileMapPath);
			const fileMap = JSON.parse(mapContent.value.toString());
			const fileHash = fileMap[filePath];
			
			if (!fileHash) {
				return;
			}
			
			// Load tracking data
			fileTrackingPath = URI.joinPath(trackingDir, 'files', `${fileHash}.json`);
			const trackingContent = await this.fileService.readFile(fileTrackingPath);
			fileTracking = JSON.parse(trackingContent.value.toString());
		} catch (error) {
			this.logService.error('Failed to load notebook section data:', error);
			return;
		}
		
		// Parse accepted content as JSON
		let acceptedNotebook;
		try {
			acceptedNotebook = JSON.parse(fileTracking.accepted_content);
		} catch (error) {
			this.logService.error(`Failed to parse accepted_content as JSON:`, error);
			return;
		}
		
		
		// Get current notebook model to see what cells actually exist
		const notebookEditor = this.notebookDiffService.findNotebookEditorForUri(uri);
		if (!notebookEditor || !notebookEditor.hasModel()) {
			return;
		}
		
		const currentNotebook = notebookEditor.textModel!;
		
		// Step 0: Add any new cells from current notebook to accepted notebook (by cell ID)
		// Create EMPTY cells at their proper positions - Step 2 will add the actual content
		// Rebuild cells array to match current notebook order
		const newAcceptedCells: any[] = [];
		const newlyCreatedCellIds = new Set<string>();
		for (let i = 0; i < currentNotebook.cells.length; i++) {
			const currentCell = currentNotebook.cells[i];
			const currentCellId = (currentCell.metadata as CellMetadata)?.metadata?.erdosAi_cellId;
			
			if (!currentCellId) {
				continue;
			}
			
			// Find existing cell in accepted by ID
			const existingAcceptedCell = acceptedNotebook.cells.find((cell: any) => {
				const cellId = cell.metadata?.erdosAi_cellId;
				return cellId === currentCellId;
			});
			
			if (existingAcceptedCell) {
				// Cell exists, keep it at this position
				newAcceptedCells.push(existingAcceptedCell);
			} else {
				// Cell doesn't exist, create empty cell at this position
				const newCell = {
					cell_type: currentCell.cellKind === 1 ? "markdown" : "code",
					metadata: { erdosAi_cellId: currentCellId },
					source: []
				};
				newAcceptedCells.push(newCell);
				newlyCreatedCellIds.add(currentCellId);
			}
		}
		
		// Replace the accepted cells array with the reordered one
		acceptedNotebook.cells = newAcceptedCells;
			
		// Step 1: Remove deleted lines from accepted content
		if (storedInfo.deletedLines && storedInfo.deletedLines.length > 0) {
			// IMPORTANT: Don't remove lines for "added-only" sections - they represent new content, not deletions
			if (storedInfo.type === 'added-only') {
			} else {
				// Sort deleted lines in reverse order (highest line number first) to avoid index shifting
				const sortedDeletedLines = [...storedInfo.deletedLines].sort((a, b) => {
					if (a.acceptedCellNumber !== b.acceptedCellNumber) {
						return b.acceptedCellNumber - a.acceptedCellNumber; // Higher cell number first
					}
					return b.acceptedCellLineNumber - a.acceptedCellLineNumber; // Higher line number first
				});
				
				for (const deletedLine of sortedDeletedLines) {
					const cell = acceptedNotebook.cells[deletedLine.acceptedCellNumber];
					if (cell && cell.source) {
						// Remove line from cell source (1-based to 0-based)
						const lineIndex = deletedLine.acceptedCellLineNumber - 1;
						
						if (lineIndex >= 0 && lineIndex < cell.source.length) {
							cell.source.splice(lineIndex, 1);
						} else {
							this.logService.error(`Invalid line index ${lineIndex} for cell with ${cell.source.length} lines`);
						}
					}
				}
			}
		}
		
		// After removing deleted lines, clean up any empty cells in accepted content
		// BUT: Don't delete cells that were just created in Step 0 (they are intentionally empty)
		const cellsToDeleteFromEditor: number[] = [];
		acceptedNotebook.cells = acceptedNotebook.cells.filter((cell: any, index: number) => {
			const cellId = cell.metadata?.erdosAi_cellId;
			const isNewlyCreated = newlyCreatedCellIds.has(cellId);
			
			if (!cell.source || (Array.isArray(cell.source) && cell.source.length === 0)) {
				if (isNewlyCreated) {
					return true; // Keep newly created empty cells
				} else {
					cellsToDeleteFromEditor.push(index);
					return false; // Remove empty cells that had content deleted
				}
			}
			return true; // Keep non-empty cells
		});
		
		// Delete empty cells from the actual notebook editor (in reverse order to avoid index shifting)
		if (cellsToDeleteFromEditor.length > 0) {
			for (let i = cellsToDeleteFromEditor.length - 1; i >= 0; i--) {
				const cellIndexToDelete = cellsToDeleteFromEditor[i];
				currentNotebook.applyEdits([{
					editType: 1, // CellEditType.Replace
					index: cellIndexToDelete,
					count: 1,
					cells: []
				}], true, undefined, () => undefined, undefined, true);
			}
		}
		
		// Step 2: Add added lines to accepted content
		// Note: "added-only" sections for new cells are handled by the special case above and return early
		// This step handles added lines in existing cells (modifications to existing cells)
		if (storedInfo.addedLines && storedInfo.addedLines.length > 0) {
			for (const addedLine of storedInfo.addedLines) {
				
				const cell = acceptedNotebook.cells[addedLine.acceptedCellNumber];
				if (cell && Array.isArray(cell.source)) {
					
					// Insert line into cell source (1-based to 0-based)
					const lineIndex = addedLine.acceptedCellLineNumber - 1;
					const insertIndex = Math.max(0, Math.min(lineIndex, cell.source.length));
					cell.source.splice(insertIndex, 0, addedLine.content);
				} else {
					this.logService.error(`Cell ${addedLine.acceptedCellNumber} not found or has no source array`);
				}
			}
		}
				
		// Save updated tracking data
		fileTracking.accepted_content = JSON.stringify(acceptedNotebook, null, 2);
		await this.fileService.writeFile(fileTrackingPath, VSBuffer.fromString(JSON.stringify(fileTracking, null, 2)));
		
		// Remove the stored section info since it's now accepted
		this.notebookStoredSectionInfo.delete(diffSectionId);
		
		// Refresh highlighting (the accepted section should disappear)
		await this.applyAutoAcceptHighlighting(uri);
		
		// Check if file should be cleaned up (no more diffs)
		await this.cleanupFileIfNoDiffs(uri);
		
		// Fire event to notify that diff section was accepted
		this._onDiffSectionChanged.fire({ uri, action: 'accept', sectionId: diffSectionId });
	}

	/**
	 * Reject notebook diff section by modifying the current notebook
	 */
	private async notebookRejectDiffSection(uri: URI, diffSectionId: string): Promise<void> {		
		// Get stored notebook section information
		const storedInfo = this.notebookStoredSectionInfo.get(diffSectionId);
		if (!storedInfo) {
			throw new Error(`No stored notebook section info found for: ${diffSectionId}`);
		}
		
		const cellIndex = storedInfo.addedLines?.[0]?.currentCellNumber ?? storedInfo.deletedLines?.[0]?.currentCellNumber ?? -1;
		
		// Get current notebook editor
		const notebookEditor = this.notebookDiffService.findNotebookEditorForUri(uri);
		if (!notebookEditor || !notebookEditor.hasModel()) {
			return;
		}
		
		const notebookModel = notebookEditor.textModel!;
		
		// Load tracking data (notebook-specific version, inlined)
		let notebookFileTracking: any;
		let notebookFileTrackingPath: URI;
		
		try {
			const filePath = uri.fsPath;
			const workspace = this.workspaceContextService.getWorkspace();
			const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
			const workspaceId = workspace.id;
			
			const storageRoot = isEmptyWindow ?
				URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
				URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
			
			const trackingDir = URI.joinPath(storageRoot, 'auto-accept-tracking');
			const fileMapPath = URI.joinPath(trackingDir, 'file-map.json');
			
			// Load file map
			const mapContent = await this.fileService.readFile(fileMapPath);
			const fileMap = JSON.parse(mapContent.value.toString());
			const fileHash = fileMap[filePath];
			
			if (!fileHash) {
				return;
			}
			
			// Load tracking data
			notebookFileTrackingPath = URI.joinPath(trackingDir, 'files', `${fileHash}.json`);
			const trackingContent = await this.fileService.readFile(notebookFileTrackingPath);
			notebookFileTracking = JSON.parse(trackingContent.value.toString());
		} catch (error) {
			console.error('Failed to load notebook section data:', error);
			return;
		}
		
	// Special case: If this is an "added-only" section, check if it's for an entirely new cell
	if (storedInfo.type === 'added-only') {
		const acceptedNotebook = JSON.parse(notebookFileTracking.accepted_content);
		const currentCell = notebookModel.cells[cellIndex];
		
		if (currentCell) {
			const currentCellId = (currentCell.metadata as CellMetadata)?.metadata?.erdosAi_cellId;
			const acceptedCellExists = acceptedNotebook.cells.some((cell: any) => {
				const cellId = cell.metadata?.erdosAi_cellId;
				return cellId === currentCellId;
			});

				if (!acceptedCellExists && currentCellId) {
					notebookModel.applyEdits([{
						editType: 1, // CellEditType.Replace
						index: cellIndex,
						count: 1,
						cells: []
					}], true, undefined, () => undefined, undefined, true);
					
					// Clean up stored info and refresh highlighting
					this.notebookStoredSectionInfo.delete(diffSectionId);
					
					// Mark notebook operation as complete before calling applyAutoAcceptHighlighting
					this.completeNotebookOperation(uri.toString());					
					await this.applyAutoAcceptHighlighting(uri);
					await this.cleanupFileIfNoDiffs(uri);
					
					return;
				}
			}
		}
		
		// Apply inverse changes to current notebook model using batched approach (same as regular files)
		// Group changes by cell for atomic operations
		const cellChanges = new Map<number, {
			addedLinesToRemove: Array<{lineIndex: number, content: string}>;
			deletedLinesToInsert: Array<{insertIndex: number, content: string}>;
		}>();
		
		// Step 1: Collect added lines to remove (grouped by cell)
		if (storedInfo.addedLines && storedInfo.addedLines.length > 0) {
			for (const addedLine of storedInfo.addedLines) {
				if (!cellChanges.has(addedLine.currentCellNumber)) {
					cellChanges.set(addedLine.currentCellNumber, {
						addedLinesToRemove: [],
						deletedLinesToInsert: []
					});
				}
				
				cellChanges.get(addedLine.currentCellNumber)!.addedLinesToRemove.push({
					lineIndex: addedLine.currentCellLineNumber - 1, // Convert to 0-based
					content: addedLine.content
				});
			}
		}
		
		// Step 2: Collect deleted lines to insert (grouped by cell)
		if (storedInfo.deletedLines && storedInfo.deletedLines.length > 0) {
			for (const deletedLine of storedInfo.deletedLines) {
				if (!cellChanges.has(deletedLine.currentCellNumber)) {
					cellChanges.set(deletedLine.currentCellNumber, {
						addedLinesToRemove: [],
						deletedLinesToInsert: []
					});
				}
				
				const insertIndex = deletedLine.currentCellLineNumber - 1; // Convert to 0-based
				cellChanges.get(deletedLine.currentCellNumber)!.deletedLinesToInsert.push({
					insertIndex: insertIndex,
					content: deletedLine.content
				});
			}
		}
		
		// Step 3: Apply all changes atomically per cell
		for (const [cellNumber, changes] of cellChanges) {
			const cell = notebookModel.cells[cellNumber];
			if (!cell || !cell.textModel) {
				console.error(`[NOTEBOOK_REJECT_DEBUG] ERROR: Cell ${cellNumber} not found or has no text model`);
				continue;
			}
			
			let currentLines = cell.textBuffer.getLinesContent();
			
			// Special case: if the cell only contains empty lines and we're inserting deleted lines,
			// clear the empty lines first to avoid trailing empties
			if (changes.deletedLinesToInsert.length > 0) {
				const onlyEmptyLines = currentLines.every(line => line.trim() === '');
				if (onlyEmptyLines) {
					currentLines = [];
				}
			}
			
			// Remove added lines (in reverse order to avoid index shifting)
			const sortedRemovals = changes.addedLinesToRemove.sort((a, b) => b.lineIndex - a.lineIndex);
			for (const removal of sortedRemovals) {
				if (removal.lineIndex >= 0 && removal.lineIndex < currentLines.length) {
					currentLines.splice(removal.lineIndex, 1);
				}
			}
			
			// Insert deleted lines (in forward order)
			const sortedInsertions = changes.deletedLinesToInsert.sort((a, b) => a.insertIndex - b.insertIndex);
			for (const insertion of sortedInsertions) {
				const insertIndex = Math.max(0, Math.min(insertion.insertIndex, currentLines.length));
				currentLines.splice(insertIndex, 0, insertion.content);
			}
						
			// Apply all changes atomically to the cell
			const newContent = currentLines.join('\n');			
			const fullRange = cell.textModel.getFullModelRange();
			cell.textModel.pushEditOperations([], [{
				range: fullRange,
				text: newContent
			}], () => null);
			
			// Force a flush to ensure changes are applied
			if (cell.textModel.pushStackElement) {
				cell.textModel.pushStackElement();
			}
		}
	}
}
