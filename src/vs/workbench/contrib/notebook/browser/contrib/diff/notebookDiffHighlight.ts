/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './notebookDiffHighlight.css';

import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { throttle } from '../../../../../../base/common/decorators.js';
import { Event } from '../../../../../../base/common/event.js';
import { IModelDeltaDecoration } from '../../../../../../editor/common/model.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { INotebookEditor, INotebookEditorContribution, ICellViewModel } from '../../notebookBrowser.js';
import { cellRangesToIndexes } from '../../../common/notebookRange.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { URI } from '../../../../../../base/common/uri.js';
import { MouseTargetType, IEditorMouseEvent, ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import * as dom from '../../../../../../base/browser/dom.js';
import { NotebookZoneWidget } from '../../../../../../editor/contrib/zoneWidget/browser/notebookZoneWidget.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { EditorOption } from '../../../../../../editor/common/config/editorOptions.js';
import { IFileChangeTracker } from '../../../../../services/erdosAi/common/fileChangeTracker.js';

interface ICellDiffData {
	cellIndex: number;
	type: 'modified';
	lineDiffs: Array<{
		type: 'added' | 'deleted';
		content: string;
		lineNumber: number;
		sectionId?: string;
	}>;
}

interface INotebookDiffData {
	uri: string;
	conversationId: string;
	cellDiffs: ICellDiffData[];
}

/**
 * Zone widget for displaying deleted content in notebook cells
 * Uses NotebookZoneWidget for proper disposal when virtualized
 */
class NotebookDeletedContentZoneWidget extends NotebookZoneWidget {
	private _deletedLines: string[];

	constructor(
		editor: ICodeEditor,
		lineNumber: number,
		deletedLines: string[],
		themeService: IThemeService
	) {
		super(editor, {
			showFrame: false,
			showArrow: false,
			className: 'erdos-ai-deleted-content-zone-widget',
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
			backgroundElement.style.left = '0';
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

	public showAt(lineNumber: number): void {
		super.show({ lineNumber, column: 1 }, this._deletedLines.length);
	}
}

/**
 * Zone widget for displaying auto-accept diff sections in notebook cells with Accept/Reject buttons
 * Uses NotebookZoneWidget for proper disposal when virtualized
 */
class NotebookAutoAcceptDiffZoneWidget extends NotebookZoneWidget {
	private _deletedLines: string[];
	private _diffSectionId: string;
	private _fileChangeTracker: IFileChangeTracker;
	private _uri: URI;

	constructor(
		editor: ICodeEditor,
		lineNumber: number,
		deletedLines: string[],
		diffSectionId: string,
		fileChangeTracker: IFileChangeTracker,
		uri: URI,
		cellIndex: number,
		themeService: IThemeService
	) {
		super(editor, {
			showFrame: false,
			showArrow: false,
			showSash: false,
			className: 'erdos-ai-notebook-auto-accept-diff-zone-widget',
			keepEditorSelection: true,
			isResizeable: false,
			ordinal: 10000
		});
		
		this._deletedLines = deletedLines;
		this._diffSectionId = diffSectionId;
		this._fileChangeTracker = fileChangeTracker;
		this._uri = uri;
		this.create();
	}

	protected override _fillContainer(container: HTMLElement): void {
		const fontInfo = this.editor.getOption(EditorOption.fontInfo);
		const layoutInfo = this.editor.getLayoutInfo();
		
		container.style.fontSize = `${fontInfo.fontSize}px`;
		container.style.lineHeight = `${fontInfo.lineHeight}px`;
		container.style.fontFamily = fontInfo.fontFamily;
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
				backgroundElement.style.backgroundColor = 'rgba(255, 0, 0, 0.15)';
				backgroundElement.style.pointerEvents = 'none';
				backgroundElement.style.zIndex = '-1';
				
				lineElement.appendChild(backgroundElement);
				container.appendChild(lineElement);
			});
		}

		// Add Accept/Reject buttons at the bottom - identical to regular file auto-accept
		const buttonHeight = Math.round(fontInfo.lineHeight * 0.7);
		const buttonFontSize = Math.round(fontInfo.fontSize * 0.7);

		const buttonContainer = dom.$('.auto-accept-buttons');
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '0'; // No gap - buttons touch
		buttonContainer.style.padding = '0';
		buttonContainer.style.margin = '0';
		buttonContainer.style.paddingLeft = `${layoutInfo.contentLeft}px`;
		buttonContainer.style.backgroundColor = 'var(--vscode-editor-background)';
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
		
		// Button event handlers
		acceptButton.addEventListener('click', () => {
			this._fileChangeTracker.acceptDiffSection(this._uri, this._diffSectionId);
		});
		
		rejectButton.addEventListener('click', () => {
			this._fileChangeTracker.rejectDiffSection(this._uri, this._diffSectionId);
		});
		
		buttonContainer.appendChild(acceptButton);
		buttonContainer.appendChild(rejectButton);
		container.appendChild(buttonContainer);
		
		const totalHeight = (this._deletedLines.length * fontInfo.lineHeight) + 24; // 24px for button area
		container.style.height = `${totalHeight}px`;
		
		const ariaLabel = `Auto-accepted notebook diff section (${this._deletedLines.length} deleted lines): ${this._deletedLines.join(', ')}`;
		container.setAttribute('aria-label', ariaLabel);
	}

	public showAt(lineNumber: number): void {
		const totalLines = this._deletedLines.length + 1; // +1 for button row
		super.show({ lineNumber, column: 1 }, totalLines);
	}
}

export class NotebookDiffHighlightContribution extends Disposable implements INotebookEditorContribution {
	static readonly id: string = 'workbench.notebook.diffHighlight';
	
	private _currentDiffData: INotebookDiffData | undefined;
	private _cellDecorationIds = new Map<ICellViewModel, string[]>();
	
	// Zone widget management (using ZoneWidget like regular files)
	private _cellZoneWidgets = new Map<string, Map<string, NotebookDeletedContentZoneWidget>>(); // cellIndex -> (lineNumber -> zoneWidget)
	private _deletedLinesByPosition = new Map<string, Map<string, string[]>>(); // cellIndex -> (lineNumber -> deletedLines[])
	private _cellMouseHandlers = new Map<string, IDisposable>(); // cellIndex -> mouse handler
	private _expandedZones = new Set<string>(); // cellIndex:lineNumber tracking expanded zones

	// Auto-accept zone widget management 
	private _autoAcceptZoneWidgets = new Map<string, Map<string, NotebookAutoAcceptDiffZoneWidget>>(); // cellIndex -> (lineNumber -> zoneWidget)
	private _autoAcceptCellDecorationIds = new Map<ICellViewModel, string[]>(); // Separate from regular diff decorations
	private _fileChangeTracker: IFileChangeTracker | undefined;
	
	// Track pending Event.toPromise calls to prevent disposable leaks
	private _pendingEditorAttachPromises = new Map<string, { promise: Promise<void>; cancel: () => void; }>(); // cellIndex -> promise info

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@IThemeService private readonly _themeService: IThemeService
	) {
		super();
		
		// Listen for model changes to reapply decorations when notebook is reopened
		this._register(this._notebookEditor.onDidChangeModel(() => {
			this._clearAllDecorations();
			if (this._currentDiffData && this._notebookEditor.hasModel()) {
				// Process deleted lines data again
				this._processDeletedLines(this._currentDiffData.cellDiffs);
				// Reapply decorations
				this._applyDiffDecorations();
				// Update mouse handlers
				this._updateCellMouseHandlers();
			}
		}));
		
		// Listen for visible range changes to apply decorations to newly visible cells
		this._register(this._notebookEditor.onDidChangeVisibleRanges(() => this._updateVisibleCells()));
		
		// Listen for cell changes to update mouse handlers
		this._register(this._notebookEditor.onDidChangeViewCells(() => this._updateCellMouseHandlers()));
		
		// Listen for cell state changes (e.g., markdown render -> edit mode) to refresh highlighting
		this._register(this._notebookEditor.onDidChangeViewCells(() => {
			// Set up state change listeners for all cells
			this._setupCellStateChangeListeners();
		}));
		
		// Initial setup of cell state change listeners
		this._setupCellStateChangeListeners();
	}

	private _setupCellStateChangeListeners(): void {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		// Listen for state changes on all cell view models via the view model
		const viewModel = this._notebookEditor.getViewModel();
		if (viewModel) {
			const viewCells = viewModel.viewCells;
			viewCells.forEach((cellViewModel: ICellViewModel, index: number) => {
				// Listen for cell state changes (Preview <-> Editing)
				this._register(cellViewModel.onDidChangeState((e: any) => {
					if (e.editStateChanged && this._fileChangeTracker) {
						// When cell switches between rendered and edit mode, refresh auto-accept highlighting
						this._refreshAutoAcceptHighlighting();
					}
				}));
			});
		}
	}

	private _refreshAutoAcceptHighlighting(): void {
		if (this._currentDiffData && this._fileChangeTracker) {
			// Get the notebook URI
			const uri = this._notebookEditor.textModel?.uri;
			if (uri) {
				// Trigger a refresh of auto-accept highlighting through the file change tracker
				this._fileChangeTracker.applyAutoAcceptHighlighting(uri);
			}
		}
	}

	public applyFileChangeHighlighting(uri: URI, conversationId: string, cellDiffs: ICellDiffData[]): void {
		// Store the diff data
		this._currentDiffData = {
			uri: uri.toString(),
			conversationId,
			cellDiffs
		};

		// Clear existing decorations and zones
		this._clearAllDecorations();

		// Process deleted lines data (replicating regular file logic)
		this._processDeletedLines(cellDiffs);

		// Apply decorations to all cells with diffs
		this._applyDiffDecorations();

		// Set up mouse handlers for cells with deleted content
		this._updateCellMouseHandlers();
	}

	public clearFileHighlighting(): void {
		// Clear only regular diff highlighting, leave auto-accept highlighting intact
		this._currentDiffData = undefined;
		
		// Clear only regular diff decorations
		this._cellDecorationIds.forEach((decorationIds, cell) => {
			if (decorationIds.length > 0) {
				cell.deltaModelDecorations(decorationIds, []);
			}
		});
		this._cellDecorationIds.clear();

		// Clear only regular diff zone widgets
		this._cellZoneWidgets.forEach((cellZoneWidgets, cellIndexStr) => {
			cellZoneWidgets.forEach((zoneWidget, lineNumber) => {
				zoneWidget.dispose();
			});
		});
		this._cellZoneWidgets.clear();

		// Clear only regular diff mouse handlers
		this._cellMouseHandlers.forEach((handler, cellIndex) => {
			handler.dispose();
		});
		this._cellMouseHandlers.clear();

		// Clear only regular diff tracking data
		this._deletedLinesByPosition.clear();
		this._expandedZones.clear();
	}

	public clearAutoAcceptHighlighting(): void {
		// Clear only auto-accept elements, leave regular diff highlighting intact
		this._fileChangeTracker = undefined;
		
		// Clear auto-accept zone widgets for each cell
		this._autoAcceptZoneWidgets.forEach((cellZoneWidgets, cellIndexStr) => {
			cellZoneWidgets.forEach((zoneWidget, lineNumber) => {
				zoneWidget.dispose();
			});
		});
		this._autoAcceptZoneWidgets.clear();
		
		// Clear auto-accept cell decorations separately from regular diff decorations
		this._autoAcceptCellDecorationIds.forEach((decorationIds, cell) => {
			if (decorationIds.length > 0) {
				cell.deltaModelDecorations(decorationIds, []);
			}
		});
		this._autoAcceptCellDecorationIds.clear();

		// Cancel any pending editor attachment promises to prevent disposable leaks
		this._pendingEditorAttachPromises.forEach((promiseInfo, cellIndexStr) => {
			promiseInfo.cancel();
		});
		this._pendingEditorAttachPromises.clear();
	}

	public applyAutoAcceptHighlighting(uri: URI, conversationId: string, cellDiffs: ICellDiffData[], fileChangeTracker: IFileChangeTracker): void {
		// Store the file change tracker for button interactions
		this._fileChangeTracker = fileChangeTracker;
		
		// Store the diff data
		this._currentDiffData = {
			uri: uri.toString(),
			conversationId,
			cellDiffs
		};

		// Clear existing decorations and zones
		this._clearAllDecorations();

		// Apply auto-accept decorations with green highlighting for added lines
		this._applyAutoAcceptDecorations(cellDiffs, uri);
		
		// Apply auto-accept zone widgets for deleted content with Accept/Reject buttons
		this._applyAutoAcceptZoneWidgets(cellDiffs, uri);

		// Set up mouse handlers for cells with auto-accept zones
		this._updateCellMouseHandlers();
	}

	/**
	 * Process deleted lines data for zone widget management
	 * Replicates the logic from regular files' applyDiffDecorations
	 */
	private _processDeletedLines(cellDiffs: ICellDiffData[]): void {
		// Clear existing deleted lines data
		this._deletedLinesByPosition.clear();

		for (const cellDiff of cellDiffs) {
			const cellIndex = cellDiff.cellIndex.toString();
			const deletedLinesByPosition = new Map<string, string[]>();

			// Group deleted lines by position within the cell
			for (const lineDiff of cellDiff.lineDiffs) {
				if (lineDiff.type === 'deleted') {
					const lineKey = lineDiff.lineNumber.toString();
					if (!deletedLinesByPosition.has(lineKey)) {
						deletedLinesByPosition.set(lineKey, []);
					}
					deletedLinesByPosition.get(lineKey)!.push(lineDiff.content);
				}
			}

			if (deletedLinesByPosition.size > 0) {
				this._deletedLinesByPosition.set(cellIndex, deletedLinesByPosition);
			}
		}
	}

	/**
	 * Set up mouse handlers for cells with deleted content that are currently visible
	 * Replicates the glyph margin click logic from regular files
	 */
	private _updateCellMouseHandlers(): void {
		// Clear existing handlers
		this._cellMouseHandlers.forEach(handler => handler.dispose());
		this._cellMouseHandlers.clear();

		// Get currently visible cell indices
		const visibleCellIndices = new Set(cellRangesToIndexes(this._notebookEditor.visibleRanges));

		// Set up handlers only for visible cells with deleted content
		for (const [cellIndexStr, deletedLines] of this._deletedLinesByPosition.entries()) {
			const cellIndex = parseInt(cellIndexStr, 10);
			
			// Only set up handler if cell is currently visible
			if (!visibleCellIndices.has(cellIndex)) {
				continue;
			}
			
			const cell = this._notebookEditor.cellAt(cellIndex);
			if (cell) {
				// Find the editor for this cell from the notebook's code editors
				const editorPair = this._notebookEditor.codeEditors.find(([vm,]) => vm.handle === cell.handle);
				if (editorPair) {
					const editor = editorPair[1];
					const handler = editor.onMouseDown((e: IEditorMouseEvent) => {
						if (e.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
							const clickedLine = e.target.position?.lineNumber;
							if (clickedLine && deletedLines.has(clickedLine.toString())) {
								const deletedLinesAtPosition = deletedLines.get(clickedLine.toString())!;
								this._toggleDeletedContentZone(cellIndex, clickedLine, deletedLinesAtPosition);
							}
						}
					});
					
					this._cellMouseHandlers.set(cellIndexStr, handler);
				}
			}
		}
	}

	/**
	 * Toggle deleted content zone for a specific cell and line
	 * Uses ZoneWidget like regular files to automatically handle positioning
	 */
	private _toggleDeletedContentZone(cellIndex: number, lineNumber: number, deletedLines: string[]): void {
		const zoneKey = `${cellIndex}:${lineNumber}`;

		const cell = this._notebookEditor.cellAt(cellIndex);
		if (!cell) {
			return;
		}

		// Find the Monaco editor for this cell
		const editorPair = this._notebookEditor.codeEditors.find(([vm,]) => vm.handle === cell.handle);
		if (!editorPair) {
			return;
		}

		const editor = editorPair[1];
		const cellIndexStr = cellIndex.toString();
		const lineNumberStr = lineNumber.toString();

		// Get or create zone widget map for this cell
		if (!this._cellZoneWidgets.has(cellIndexStr)) {
			this._cellZoneWidgets.set(cellIndexStr, new Map<string, NotebookDeletedContentZoneWidget>());
		}
		const cellZoneWidgets = this._cellZoneWidgets.get(cellIndexStr)!;
		const existingZoneWidget = cellZoneWidgets.get(lineNumberStr);
		
		if (existingZoneWidget) {
			existingZoneWidget.dispose();
			cellZoneWidgets.delete(lineNumberStr);
			this._expandedZones.delete(zoneKey);
			this._updateGlyphMarginArrow(cellIndex, lineNumber, false);
		} else {
			// Create new zone widget (ZoneWidget handles positioning automatically)
			const zoneWidget = new NotebookDeletedContentZoneWidget(
				editor,
				lineNumber,
				deletedLines,
				null as any // We don't need theme service for our implementation
			);

			// Show the zone widget at the specified line
			zoneWidget.showAt(lineNumber);
			
			cellZoneWidgets.set(lineNumberStr, zoneWidget);
			this._expandedZones.add(zoneKey);
			this._updateGlyphMarginArrow(cellIndex, lineNumber, true);
		}
	}

	/**
	 * Update glyph arrow state for expanded/collapsed zones
	 * Replicates the updateGlyphMarginArrow logic from regular files
	 */
	private _updateGlyphMarginArrow(cellIndex: number, lineNumber: number, isExpanded: boolean): void {
		const cell = this._notebookEditor.cellAt(cellIndex);
		if (!cell) {
			return;
		}

		// Find the existing glyph decoration and update it
		const existingDecorations = this._cellDecorationIds.get(cell) || [];
		const newDecorations: IModelDeltaDecoration[] = [];

		// We need to recreate all decorations to update the specific glyph
		if (this._currentDiffData) {
			const cellDiff = this._currentDiffData.cellDiffs.find(c => c.cellIndex === cellIndex);
			if (cellDiff) {
				cellDiff.lineDiffs.forEach(lineDiff => {
					const range = new Range(lineDiff.lineNumber, 1, lineDiff.lineNumber, 1);
					
					if (lineDiff.type === 'deleted' && lineDiff.lineNumber === lineNumber) {
						// This is the line we want to update
						const glyphClassName = isExpanded ? 'erdos-ai-diff-deleted-arrow-expanded' : 'erdos-ai-diff-deleted-arrow';
						const hoverMessage = isExpanded ? 'Click to collapse deleted content' : 'Click to expand deleted content';
						
						newDecorations.push({
							range,
							options: {
								description: 'Erdos AI Diff - Deleted Line',
								glyphMarginClassName: glyphClassName,
								glyphMarginHoverMessage: { value: hoverMessage },
								overviewRuler: {
									color: 'rgba(255, 0, 0, 0.8)',
									position: 2
								}
							}
						});
					} else if (lineDiff.type === 'deleted') {
						// Other deleted lines keep their normal state
						newDecorations.push({
							range,
							options: {
								description: 'Erdos AI Diff - Deleted Line',
								glyphMarginClassName: 'erdos-ai-diff-deleted-arrow',
								glyphMarginHoverMessage: { value: `Click to view deleted content: ${lineDiff.content}` },
								overviewRuler: {
									color: 'rgba(255, 0, 0, 0.8)',
									position: 2
								}
							}
						});
					} else if (lineDiff.type === 'added') {
						// Added lines remain unchanged
						newDecorations.push({
							range,
							options: {
								description: 'Erdos AI Diff - Added Line',
								linesDecorationsClassName: 'erdos-ai-diff-added-gutter',
								marginClassName: 'erdos-ai-diff-added-gutter',
								overviewRuler: {
									color: 'rgba(0, 255, 0, 0.6)',
									position: 2
								}
							}
						});
					}
				});
			}
		}

		// Apply updated decorations
		const decorationIds = cell.deltaModelDecorations(existingDecorations, newDecorations);
		this._cellDecorationIds.set(cell, decorationIds);
	}

	@throttle(100)
	private _updateVisibleCells(): void {
		if (!this._currentDiffData) {
			return;
		}

		this._applyDiffDecorations();
		this._updateCellMouseHandlers();
		
		// If we have a file change tracker (auto-accept mode), recreate auto-accept zone widgets for visible cells
		if (this._fileChangeTracker) {
			// First, clean up zone widgets for cells that are no longer visible
			this._cleanupInvisibleAutoAcceptZoneWidgets();
			// Then recreate zone widgets for currently visible cells
			this._applyAutoAcceptZoneWidgets(this._currentDiffData.cellDiffs, URI.parse(this._currentDiffData.uri));
		}
	}

	private _applyDiffDecorations(): void {
		if (!this._currentDiffData || !this._notebookEditor.hasModel()) {
			return;
		}

		// Get all cells in the notebook
		const cells = this._notebookEditor.getCellsInRange();
		
		// Process each cell diff
		this._currentDiffData.cellDiffs.forEach((cellDiff, index) => {
			const cell = cells.find(c => c.handle === this._notebookEditor.textModel!.cells[cellDiff.cellIndex]?.handle);
			
			if (cell) {
				this._applyCellDecorations(cell, cellDiff.lineDiffs);
			}
		});
	}

	private _applyCellDecorations(cell: ICellViewModel, lineDiffs: Array<{ type: 'added' | 'deleted'; content: string; lineNumber: number; }>): void {		
		const newDecorations: IModelDeltaDecoration[] = [];

		lineDiffs.forEach((lineDiff, index) => {
			const range = new Range(lineDiff.lineNumber, 1, lineDiff.lineNumber, 1);
			
			if (lineDiff.type === 'deleted') {
				newDecorations.push({
					range,
					options: {
						description: 'Erdos AI Diff - Deleted Line',
						glyphMarginClassName: 'erdos-ai-diff-deleted-arrow',
						glyphMarginHoverMessage: { value: `Deleted: ${lineDiff.content}` },
						overviewRuler: {
							color: 'rgba(255, 0, 0, 0.8)',
							position: 2 // OverviewRulerLane.Right
						}
					}
				});
			} else if (lineDiff.type === 'added') {
				newDecorations.push({
					range,
					options: {
						description: 'Erdos AI Diff - Added Line',
						linesDecorationsClassName: 'erdos-ai-diff-added-gutter',
						marginClassName: 'erdos-ai-diff-added-gutter',
						overviewRuler: {
							color: 'rgba(0, 255, 0, 0.6)',
							position: 2 // OverviewRulerLane.Right
						}
					}
				});
			}
		});

		// Apply decorations using the cell's deltaModelDecorations method
		const oldDecorations = this._cellDecorationIds.get(cell) ?? [];
		const decorationIds = cell.deltaModelDecorations(oldDecorations, newDecorations);
		this._cellDecorationIds.set(cell, decorationIds);
	}

	private _clearAllDecorations(): void {
		// Clear cell decorations
		this._cellDecorationIds.forEach((decorationIds, cell) => {
			if (decorationIds.length > 0) {
				cell.deltaModelDecorations(decorationIds, []);
			}
		});
		this._cellDecorationIds.clear();

		// Clear zone widgets for each cell
		this._cellZoneWidgets.forEach((cellZoneWidgets, cellIndexStr) => {
			cellZoneWidgets.forEach((zoneWidget, lineNumber) => {
				zoneWidget.dispose();
			});
		});
		this._cellZoneWidgets.clear();

		// Clear auto-accept zone widgets for each cell
		let autoAcceptZoneWidgetsDisposed = 0;
		this._autoAcceptZoneWidgets.forEach((cellZoneWidgets, cellIndexStr) => {
			cellZoneWidgets.forEach((zoneWidget, lineNumber) => {
				zoneWidget.dispose();
				autoAcceptZoneWidgetsDisposed++;
			});
		});
		this._autoAcceptZoneWidgets.clear();
		
		// Clear auto-accept cell decorations separately from regular diff decorations
		this._autoAcceptCellDecorationIds.forEach((decorationIds, cell) => {
			if (decorationIds.length > 0) {
				cell.deltaModelDecorations(decorationIds, []);
			}
		});
		this._autoAcceptCellDecorationIds.clear();

		// Clear mouse handlers
		this._cellMouseHandlers.forEach((handler, cellIndex) => {
			handler.dispose();
		});
		this._cellMouseHandlers.clear();

		// Cancel any pending editor attachment promises to prevent disposable leaks
		this._pendingEditorAttachPromises.forEach((promiseInfo, cellIndexStr) => {
			promiseInfo.cancel();
		});
		this._pendingEditorAttachPromises.clear();

		// Clear tracking data
		this._deletedLinesByPosition.clear();
		this._expandedZones.clear();
	}

	/**
	 * Apply auto-accept decorations with green highlighting for added lines
	 * Uses cell.deltaModelDecorations() to persist through virtualization
	 */
	private _applyAutoAcceptDecorations(cellDiffs: ICellDiffData[], uri: URI): void {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		// Process each cell diff for auto-accept decorations
		cellDiffs.forEach((cellDiff, index) => {
			const cell = this._notebookEditor.cellAt(cellDiff.cellIndex);
			
			if (cell) {
				this._applyAutoAcceptCellDecorations(cell, cellDiff.lineDiffs);
			}
		});
	}

	/**
	 * Apply auto-accept decorations to a specific cell (green highlighting for added lines)
	 */
	private _applyAutoAcceptCellDecorations(cell: ICellViewModel, lineDiffs: Array<{ type: 'added' | 'deleted'; content: string; lineNumber: number; sectionId?: string; }>): void {		
		const newDecorations: IModelDeltaDecoration[] = [];

		lineDiffs.forEach((lineDiff, index) => {
			const range = new Range(lineDiff.lineNumber, 1, lineDiff.lineNumber, 1);
			
			if (lineDiff.type === 'added') {
				// Auto-accepted added lines get green highlighting
				newDecorations.push({
					range,
					options: {
						description: 'Erdos AI Auto-Accept - Added Line',
						isWholeLine: true,
						className: 'erdos-ai-auto-accept-added',
						glyphMarginClassName: 'erdos-ai-auto-accept-glyph-added',
						overviewRuler: {
							color: 'rgba(0, 255, 0, 0.6)',
							position: 2 // OverviewRulerLane.Right
						}
					}
				});
			} else if (lineDiff.type === 'deleted') {
				// Deleted lines get red glyph margin indicators (no content shown yet)
				newDecorations.push({
					range,
					options: {
						description: 'Erdos AI Auto-Accept - Deleted Line',
						glyphMarginClassName: 'erdos-ai-diff-deleted-arrow',
						glyphMarginHoverMessage: { value: `Auto-accepted deletion: ${lineDiff.content}` },
						overviewRuler: {
							color: 'rgba(255, 0, 0, 0.8)',
							position: 2 // OverviewRulerLane.Right
						}
					}
				});
			}
		});

		// Apply decorations using the cell's deltaModelDecorations method
		// Use separate map for auto-accept decorations to prevent clearing by regular diff operations
		const oldDecorations = this._autoAcceptCellDecorationIds.get(cell) ?? [];
		const decorationIds = cell.deltaModelDecorations(oldDecorations, newDecorations);
		this._autoAcceptCellDecorationIds.set(cell, decorationIds);
	}

	/**
	 * Apply auto-accept zone widgets for deleted content with Accept/Reject buttons
	 * Uses the same approach as regular diff highlighting but shows zone widgets immediately
	 */
	private _applyAutoAcceptZoneWidgets(cellDiffs: ICellDiffData[], uri: URI): void {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		// Process each cell diff to create auto-accept zone widgets immediately
		// (unlike regular diff which waits for glyph clicks)
		cellDiffs.forEach((cellDiff, index) => {
			// Find deleted lines in this cell
			const deletedLines = cellDiff.lineDiffs.filter(diff => diff.type === 'deleted');
			
			if (deletedLines.length > 0) {
				// Group deleted lines by line number and section ID for zone widget creation
				const deletedLinesByPosition = new Map<number, { content: string[]; sectionId?: string; }>();
				
				for (const deletedLine of deletedLines) {
					const lineNumber = deletedLine.lineNumber;
					if (!deletedLinesByPosition.has(lineNumber)) {
						deletedLinesByPosition.set(lineNumber, { content: [], sectionId: deletedLine.sectionId });
					}
					deletedLinesByPosition.get(lineNumber)!.content.push(deletedLine.content);
				}

				// Create auto-accept zone widgets for each position with deleted content
				for (const [lineNumber, { content: deletedContent, sectionId }] of deletedLinesByPosition) {
					// Fire and forget - don't await to avoid blocking other zone widget creation
					this._createAutoAcceptZoneWidget(cellDiff.cellIndex, lineNumber, deletedContent, uri, sectionId).catch(error => {
						// Log error but don't block other zone widgets
						console.warn(`Failed to create auto-accept zone widget for cell ${cellDiff.cellIndex}, line ${lineNumber}:`, error);
					});
				}
			}
		});
	}

	/**
	 * Create auto-accept zone widget for a specific cell and line
	 * Uses the same approach as regular diff highlighting, with proper editor attachment waiting
	 */
	private async _createAutoAcceptZoneWidget(cellIndex: number, lineNumber: number, deletedLines: string[], uri: URI, sectionId?: string): Promise<void> {
		// Find the Monaco editor for this cell (same approach as regular diff highlighting)
		const cell = this._notebookEditor.cellAt(cellIndex);
		if (!cell) {
			return;
		}

		const cellIndexStr = cellIndex.toString();

		// Wait for editor attachment if not already attached, with proper disposable tracking
		if (!cell.editorAttached) {
			// Check if we already have a pending promise for this cell
			let pendingPromiseInfo = this._pendingEditorAttachPromises.get(cellIndexStr);
			
			if (!pendingPromiseInfo) {
				// Create a new cancelable promise for editor attachment
				const cancelablePromise = Event.toPromise(cell.onDidChangeEditorAttachState);
				pendingPromiseInfo = {
					promise: cancelablePromise,
					cancel: () => cancelablePromise.cancel()
				};
				this._pendingEditorAttachPromises.set(cellIndexStr, pendingPromiseInfo);
			}
			
			try {
				await pendingPromiseInfo.promise;
			} catch (error) {
				// Cell might have been disposed or removed during waiting
				return;
			} finally {
				// Clean up the pending promise once it's resolved or rejected
				this._pendingEditorAttachPromises.delete(cellIndexStr);
			}
		}

		const editorPair = this._notebookEditor.codeEditors.find(([vm,]) => vm.handle === cell.handle);
		if (!editorPair) {
			// Even after waiting, editor might not be available (cell disposed, etc.)
			return;
		}

		const editor = editorPair[1];
		const lineNumberStr = lineNumber.toString();

		// Get or create auto-accept zone widget map for this cell
		if (!this._autoAcceptZoneWidgets.has(cellIndexStr)) {
			this._autoAcceptZoneWidgets.set(cellIndexStr, new Map<string, NotebookAutoAcceptDiffZoneWidget>());
		}
		const cellZoneWidgets = this._autoAcceptZoneWidgets.get(cellIndexStr)!;

		// Check if zone widget already exists
		const existingZoneWidget = cellZoneWidgets.get(lineNumberStr);
		if (existingZoneWidget) {
			// Zone widget already exists, don't create duplicate
			return;
		}

		// Use the provided section ID or create a fallback one
		const finalSectionId = sectionId || `notebook-auto-accept-${cellIndex}-${lineNumber}`;
		
		// Creating zone widget for deleted lines
		
		const zoneWidget = new NotebookAutoAcceptDiffZoneWidget(
			editor,
			lineNumber,
			deletedLines,
			finalSectionId,
			this._fileChangeTracker!,
			uri,
			cellIndex,
			this._themeService
		);

		// Show the zone widget immediately (unlike regular diff which waits for clicks)
		zoneWidget.showAt(lineNumber);
		
		cellZoneWidgets.set(lineNumberStr, zoneWidget);
	}

	/**
	 * Clean up auto-accept zone widgets for cells that are no longer visible
	 */
	private _cleanupInvisibleAutoAcceptZoneWidgets(): void {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		// Get currently visible cell editors (same approach as regular diff highlighting)
		const visibleEditorHandles = new Set(
			this._notebookEditor.codeEditors.map(([vm,]) => vm.handle)
		);

		// Clean up zone widgets for cells that no longer have visible editors
		const cellIndicesToRemove: string[] = [];
		this._autoAcceptZoneWidgets.forEach((cellZoneWidgets, cellIndexStr) => {
			const cellIndex = parseInt(cellIndexStr);
			const cell = this._notebookEditor.cellAt(cellIndex);
			
			if (!cell || !visibleEditorHandles.has(cell.handle)) {
				// This cell is no longer visible or doesn't have an editor, dispose its zone widgets
				cellZoneWidgets.forEach((zoneWidget, lineNumber) => {
					try {
						zoneWidget.dispose();
					} catch (error) {
						// Zone widget might already be disposed due to virtualization
						console.warn(`Failed to dispose auto-accept zone widget for invisible cell ${cellIndexStr}, line ${lineNumber}:`, error);
					}
				});
				cellIndicesToRemove.push(cellIndexStr);
			}
		});

		// Remove the cleaned up cell entries
		cellIndicesToRemove.forEach(cellIndexStr => {
			this._autoAcceptZoneWidgets.delete(cellIndexStr);
		});
	}

	override dispose(): void {
		// Cancel any pending promises before clearing decorations
		this._pendingEditorAttachPromises.forEach((promiseInfo, cellIndexStr) => {
			promiseInfo.cancel();
		});
		this._pendingEditorAttachPromises.clear();
		
		this._clearAllDecorations();
		super.dispose();
	}

}

registerNotebookContribution(NotebookDiffHighlightContribution.id, NotebookDiffHighlightContribution);
