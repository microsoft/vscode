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
		private readonly _themeService: IThemeService
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
		const theme = this._themeService.getColorTheme();
		
		// Get the actual notebook cell background color from the theme
		const cellEditorBg = theme.getColor('notebook.cellEditorBackground');
		const editorBg = theme.getColor('editor.background');
		const backgroundColor = cellEditorBg?.toString() || editorBg?.toString() || '#1E1E1E';
		
		container.style.fontSize = `${fontInfo.fontSize}px`;
		container.style.lineHeight = `${fontInfo.lineHeight}px`;
		container.style.fontFamily = fontInfo.fontFamily;
		container.style.height = `${fontInfo.lineHeight * this._deletedLines.length}px`;
		container.style.overflow = 'hidden';
		container.style.padding = '0';
		container.style.margin = '0';
		container.style.border = 'none';
		container.style.backgroundColor = backgroundColor;

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
			backgroundElement.style.backgroundColor = 'rgba(255, 0, 0, 0.15)';
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
 * Virtual scrolling-aware zone widget for displaying auto-accept diff sections in notebook cells
 * Registers with NotebookAutoAcceptContribution for proper virtual scrolling management
 */
export class NotebookAutoAcceptDiffZoneWidget extends Disposable {
	public _deletedLines: string[];
	public _diffSectionId: string;
	private _fileChangeTracker: IFileChangeTracker;
	private _uri: URI;
	public lineNumber: number;
	public cellHandle: number;
	
	public _actualZoneId: string | null = null;
	public _isVisible = false;
	public _domNode: HTMLElement | null = null;

	constructor(
		editor: ICodeEditor | null,
		lineNumber: number,
		deletedLines: string[],
		diffSectionId: string,
		fileChangeTracker: IFileChangeTracker,
		uri: URI,
		cellIndex: number,
		private readonly _themeService: IThemeService
	) {
		super();
		
		this.lineNumber = lineNumber;
		this._deletedLines = deletedLines;
		this._diffSectionId = diffSectionId;
		this._fileChangeTracker = fileChangeTracker;
		this._uri = uri;
		
		// Get cell handle from the cell index - FileChangeTracker knows which notebook this is
		const notebookEditor = this._getNotebookEditor();
		if (notebookEditor) {
			const cell = notebookEditor.cellAt(cellIndex);
			this.cellHandle = cell?.handle ?? -1;
			
		} else {
			this.cellHandle = -1;
		}
	}

	private _getNotebookEditor(): INotebookEditor | undefined {
		return this._fileChangeTracker.getNotebookEditorForUri(this._uri);
	}


	/**
	 * Called by NotebookAutoAcceptContribution when cell becomes visible
	 */
	public createActualZone(editor: ICodeEditor): void {
		if (this._actualZoneId) {
			return; // Already created
		}
				
		// Create DOM node FIRST, before calling changeViewZones (like git diff system)
			const domNode = this._createDomNode(editor);
			const heightInLines = this._deletedLines.length + 1; // Content + buttons
			
		editor.changeViewZones(accessor => {
			const viewZoneData = {
				afterLineNumber: this.lineNumber, // Position after the line, not before
				heightInLines: heightInLines,
				domNode: domNode,
				ordinal: 10000
			};
			
			this._actualZoneId = accessor.addZone(viewZoneData);
			this._domNode = domNode;
		});
		this._isVisible = true;
	}

	/**
	 * Called by NotebookAutoAcceptContribution when cell goes out of view
	 */
	public removeActualZone(editor: ICodeEditor): void {
		if (!this._actualZoneId) {
			return;
		}
		
		editor.changeViewZones(accessor => {
			accessor.removeZone(this._actualZoneId!);
		});
		this._actualZoneId = null;
		this._domNode = null;
		this._isVisible = false;
	}


	private _createDomNode(editor: ICodeEditor): HTMLElement {
		const container = document.createElement('div');
		container.className = 'erdos-ai-notebook-auto-accept-diff-zone-widget';
		
		const fontInfo = editor.getOption(EditorOption.fontInfo);
		const layoutInfo = editor.getLayoutInfo();
		const theme = this._themeService.getColorTheme();
		
		// Get the actual notebook cell background color from the theme
		const cellEditorBg = theme.getColor('notebook.cellEditorBackground');
		const editorBg = theme.getColor('editor.background');
		const backgroundColor = cellEditorBg?.toString() || editorBg?.toString() || '#1E1E1E';
		
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
				// Remove extra padding - notebook cells may have different layout
				lineElement.style.paddingLeft = '0px';
				
				const backgroundElement = dom.$('.deleted-line-background');
				backgroundElement.style.position = 'absolute';
				backgroundElement.style.top = '0';
				backgroundElement.style.left = '0'; // Start from beginning since we removed padding
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
		buttonContainer.style.backgroundColor = backgroundColor;
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
		acceptButton.style.pointerEvents = 'auto'; // Ensure pointer events work
		acceptButton.style.zIndex = '1000'; // High z-index to be above other elements
		
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
		rejectButton.style.pointerEvents = 'auto'; // Ensure pointer events work
		rejectButton.style.zIndex = '1000'; // High z-index to be above other elements
		
		acceptButton.addEventListener('click', (e) => {
			this._handleAccept();
		});
		
		rejectButton.addEventListener('click', (e) => {
			this._handleReject();
		});
		
		buttonContainer.appendChild(acceptButton);
		buttonContainer.appendChild(rejectButton);
		container.appendChild(buttonContainer);
		
		return container;
	}

	private _handleAccept(): void {
		this._fileChangeTracker.acceptDiffSection(this._uri, this._diffSectionId);
	}

	private _handleReject(): void {		
		this._fileChangeTracker.rejectDiffSection(this._uri, this._diffSectionId);
	}

	public isVisible(): boolean {
		return this._isVisible;
	}

	public override dispose(): void {
		// Clean up actual zone if it exists
		if (this._actualZoneId && this._domNode) {
			// Find the editor and properly remove the zone
		const notebookEditor = this._getNotebookEditor();
		if (notebookEditor) {
				// Find the Monaco editor for this specific cell using the cell handle
				const editorPair = notebookEditor.codeEditors.find(([vm,]) => vm.handle === this.cellHandle);
				const cellEditor = editorPair?.[1];
				if (cellEditor) {
					this.removeActualZone(cellEditor);
				}
			}
		}
		
		super.dispose();
	}
}

/**
 * Auto-accept contribution for managing auto-accept zones and decorations in notebooks
 */
export class NotebookAutoAcceptContribution extends Disposable implements INotebookEditorContribution {
	static readonly id: string = 'workbench.notebook.autoAccept';
	
	private _currentDiffData: INotebookDiffData | undefined;
	
	private _autoAcceptCellDecorationIds = new Map<ICellViewModel, string[]>(); // Separate from regular diff decorations
	
	// Track pending Event.toPromise calls to prevent disposable leaks
	private _pendingEditorAttachPromises = new Map<string, { promise: Promise<void>; cancel: () => void; }>(); // cellIndex -> promise info

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@IFileChangeTracker private readonly _fileChangeTracker: IFileChangeTracker
	) {
		super();
		
		// Listen for model changes to reapply decorations when notebook is reopened
		this._register(this._notebookEditor.onDidChangeModel(() => {
			this.clearAutoAcceptHighlighting();
			if (this._currentDiffData && this._notebookEditor.hasModel()) {
				// Reapply auto-accept highlighting
				const uri = this._notebookEditor.textModel?.uri;
				if (uri) {
					this._fileChangeTracker.applyAutoAcceptHighlighting(uri);
				}
			}
		}));
				
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
						const uri = this._notebookEditor.textModel?.uri;
						if (uri) {
							this._fileChangeTracker.applyAutoAcceptHighlighting(uri);
						}
					}
				}));
			});
		}
	}



	/**
	 * Apply only auto-accept decorations (green highlighting) without zone widgets
	 */
	public applyAutoAcceptDecorations(cellDiffs: ICellDiffData[], uri: URI): void {
		// Store current diff data for use by other methods
		this._currentDiffData = {
			uri: uri.toString(),
			conversationId: 'decorations-only', // Not used for decorations
			cellDiffs
		};

		// Clear existing decorations first
		this.clearAutoAcceptHighlighting();

		// Apply only decorations, not zone widgets
		this._applyAutoAcceptDecorations(cellDiffs, uri);
	}

	public clearAutoAcceptHighlighting(): void {
		// Clear only auto-accept elements, leave regular diff highlighting intact
		
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


	/**
	 * Set up mouse handlers for cells with auto-accept zones that are currently visible
	 */

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

	override dispose(): void {
		// Cancel any pending promises before clearing decorations
		this._pendingEditorAttachPromises.forEach((promiseInfo, cellIndexStr) => {
			promiseInfo.cancel();
		});
		this._pendingEditorAttachPromises.clear();
		
		this.clearAutoAcceptHighlighting();
		super.dispose();
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
			}
		}));
		
		// Listen for scroll events with throttling to apply decorations to newly visible cells
		let lastScrollTime = 0;
		this._register(this._notebookEditor.onDidScroll(() => {
			const now = Date.now();
			if (now - lastScrollTime >= 100) {
				lastScrollTime = now;
				this._updateVisibleCells();
			}
		}));
		
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
					if (e.editStateChanged) {
						// When cell switches between rendered and edit mode, refresh highlighting
						this._applyDiffDecorations();
					}
				}));
			});
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
		// Clear only regular diff highlighting
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
				this._themeService
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
registerNotebookContribution(NotebookAutoAcceptContribution.id, NotebookAutoAcceptContribution);
