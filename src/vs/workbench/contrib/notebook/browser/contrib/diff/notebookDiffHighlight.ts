/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './notebookDiffHighlight.css';

import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { throttle } from '../../../../../../base/common/decorators.js';
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

interface ICellDiffData {
	cellIndex: number;
	type: 'modified';
	lineDiffs: Array<{
		type: 'added' | 'deleted';
		content: string;
		lineNumber: number;
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

export class NotebookDiffHighlightContribution extends Disposable implements INotebookEditorContribution {
	static readonly id: string = 'workbench.notebook.diffHighlight';
	
	private _currentDiffData: INotebookDiffData | undefined;
	private _cellDecorationIds = new Map<ICellViewModel, string[]>();
	
	// Zone widget management (using ZoneWidget like regular files)
	private _cellZoneWidgets = new Map<string, Map<string, NotebookDeletedContentZoneWidget>>(); // cellIndex -> (lineNumber -> zoneWidget)
	private _deletedLinesByPosition = new Map<string, Map<string, string[]>>(); // cellIndex -> (lineNumber -> deletedLines[])
	private _cellMouseHandlers = new Map<string, IDisposable>(); // cellIndex -> mouse handler
	private _expandedZones = new Set<string>(); // cellIndex:lineNumber tracking expanded zones

	constructor(
		private readonly _notebookEditor: INotebookEditor
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
	}

	public applyDiffHighlighting(uri: URI, conversationId: string, cellDiffs: ICellDiffData[]): void {
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

	public clearDiffHighlighting(): void {
		this._currentDiffData = undefined;
		this._clearAllDecorations();
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
			// Zone widget exists, hide and dispose it
			existingZoneWidget.hide();
			existingZoneWidget.dispose();
			cellZoneWidgets.delete(lineNumberStr);
			this._expandedZones.delete(zoneKey);
			this._updateGlyphArrow(cellIndex, lineNumber, false);
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
			this._updateGlyphArrow(cellIndex, lineNumber, true);
		}
	}

	/**
	 * Update glyph arrow state for expanded/collapsed zones
	 * Replicates the updateGlyphMarginArrow logic from regular files
	 */
	private _updateGlyphArrow(cellIndex: number, lineNumber: number, isExpanded: boolean): void {
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
				zoneWidget.hide();
				zoneWidget.dispose();
			});
		});
		this._cellZoneWidgets.clear();

		// Clear mouse handlers
		this._cellMouseHandlers.forEach((handler, cellIndex) => {
			handler.dispose();
		});
		this._cellMouseHandlers.clear();

		// Clear tracking data
		this._deletedLinesByPosition.clear();
		this._expandedZones.clear();
	}

	override dispose(): void {
		this._clearAllDecorations();
		super.dispose();
	}

}

registerNotebookContribution(NotebookDiffHighlightContribution.id, NotebookDiffHighlightContribution);
