/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorunWithStore, derived, observableFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { INotebookEditor } from '../../../contrib/notebook/browser/notebookBrowser.js';
import { NotebookAutoAcceptDiffZoneWidget } from '../../../contrib/notebook/browser/contrib/diff/notebookDiffHighlight.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { cellRangesToIndexes } from '../../../contrib/notebook/common/notebookRange.js';

import { INotebookZoneManager } from '../common/notebookZoneManager.js';

/**
 * Per-cell zone decorator that follows the official VSCode NotebookCellDiffDecorator pattern
 * Handles virtual scrolling by observing visible ranges and managing Monaco editor view zones
 */
class NotebookCellZoneDecorator extends DisposableStore {
	private readonly perEditorDisposables = this.add(new DisposableStore());

	constructor(
		notebookEditor: INotebookEditor,
		private readonly cellIndex: number,
		private readonly zoneWidgets: Map<string, NotebookAutoAcceptDiffZoneWidget> // sectionId -> zoneWidget
	) {
		super();

		// Follow the exact pattern from NotebookCellDiffDecorator
		const onDidChangeVisibleRanges = observableFromEvent(notebookEditor.onDidChangeVisibleRanges, () => notebookEditor.visibleRanges);
		const editorObs = derived((r) => {
			const visibleRanges = onDidChangeVisibleRanges.read(r);
			const visibleCellIndices = cellRangesToIndexes(visibleRanges);
			
			if (!visibleCellIndices.includes(this.cellIndex)) {
				return; // Cell not visible - return undefined
			}
			
			const cell = notebookEditor.cellAt(this.cellIndex);
			if (!cell || !cell.editorAttached) {
				return; // Editor not attached yet
			}
			
			const editor = notebookEditor.codeEditors.find(([vm,]) => vm.handle === cell.handle)?.[1];
			return editor;
		});

		this.add(autorunWithStore((r, store) => {
			const editor = editorObs.read(r);
			this.perEditorDisposables.clear();

			if (editor) {
				store.add(editor.onDidChangeModel(() => {
					this.perEditorDisposables.clear();
				}));
				this._updateZones(editor);
			}
		}));
	}

	private _updateZones(editor: ICodeEditor): void {
		// Clear existing zones first
		this.perEditorDisposables.clear();
		
		// Call createActualZone directly
		for (const [sectionId, zoneWidget] of this.zoneWidgets) {
			try {
				zoneWidget.createActualZone(editor);
			} catch (error) {
				console.warn(`[NotebookZoneManager] Failed to create zone ${sectionId}:`, error);
			}
		}

		// Add cleanup for when cell goes out of view
		this.perEditorDisposables.add(toDisposable(() => {
			for (const zoneWidget of this.zoneWidgets.values()) {
				try {
					if (zoneWidget._actualZoneId) {
						zoneWidget.removeActualZone(editor);
					}
				} catch (error) {
					console.warn(`[NotebookZoneManager] Failed to remove zone ${zoneWidget._diffSectionId}:`, error);
				}
			}
		}));
	}
}

/**
 * Manages virtual scrolling for notebook view zones
 * Follows the official VSCode NotebookCellDiffDecorator pattern
 */
export class NotebookZoneManager extends DisposableStore implements INotebookZoneManager {
	readonly _serviceBrand: undefined;
	
	// Map of URI -> Map of cellIndex -> NotebookCellZoneDecorator
	private readonly _cellDecorators = new Map<string, Map<number, NotebookCellZoneDecorator>>();
	// Map of URI -> Map of cellIndex -> Map of sectionId -> zoneWidget
	private readonly _zoneData = new Map<string, Map<number, Map<string, NotebookAutoAcceptDiffZoneWidget>>>();
	private readonly _notebookEditors = new Map<string, INotebookEditor>(); // URI -> editor

	constructor() {
		super();
	}

	/**
	 * Register a notebook editor for zone management
	 */
	public registerNotebookEditor(uri: URI, notebookEditor: INotebookEditor): void {
		const uriString = uri.toString();
		
		this._notebookEditors.set(uriString, notebookEditor);
		
		// If we have existing zone data for this URI, create decorators
		const existingZoneData = this._zoneData.get(uriString);
		if (existingZoneData && existingZoneData.size > 0) {
			this._createDecorators(uri, notebookEditor, existingZoneData);
		}
	}

	/**
	 * Remove a notebook editor
	 */
	public removeNotebookEditor(editor: INotebookEditor): void {
		const uri = editor.getViewModel()?.notebookDocument.uri;
		if (!uri) return;
		
		const uriString = uri.toString();
		
		// Clear decorators for this URI
		this.clearZones(uri);
		this._notebookEditors.delete(uriString);
	}

	/**
	 * Update zone map - completely replaces existing zones for the URI
	 */
	public updateZoneMap(uri: URI, zoneMap: Map<string, NotebookAutoAcceptDiffZoneWidget>): void {
		const uriString = uri.toString();

		// Clear existing decorators
		this.clearZones(uri);

		// Group zones by cell index
		const zonesByCell = new Map<number, Map<string, NotebookAutoAcceptDiffZoneWidget>>();
		for (const [zoneKey, zoneWidget] of zoneMap) {
			const [cellIndexStr] = zoneKey.split('-');
			const cellIndex = parseInt(cellIndexStr, 10);
			
			if (!zonesByCell.has(cellIndex)) {
				zonesByCell.set(cellIndex, new Map());
			}
			zonesByCell.get(cellIndex)!.set(zoneWidget._diffSectionId, zoneWidget);
		}

		// Store the zone data
		this._zoneData.set(uriString, zonesByCell);

		// Create decorators if we have a registered editor
		const notebookEditor = this._notebookEditors.get(uriString);
		if (notebookEditor) {
			this._createDecorators(uri, notebookEditor, zonesByCell);
		}
	}

	/**
	 * Create decorators for all cells with zones
	 */
	private _createDecorators(
		uri: URI, 
		notebookEditor: INotebookEditor, 
		zonesByCell: Map<number, Map<string, NotebookAutoAcceptDiffZoneWidget>>
	): void {
		const uriString = uri.toString();
		const decorators = new Map<number, NotebookCellZoneDecorator>();

		for (const [cellIndex, cellZones] of zonesByCell) {
			const decorator = new NotebookCellZoneDecorator(notebookEditor, cellIndex, cellZones);
			decorators.set(cellIndex, decorator);
			this.add(decorator);
		}

		this._cellDecorators.set(uriString, decorators);
	}


	/**
	 * Clear all zones for a URI
	 */
	public clearZones(uri: URI): void {
		const uriString = uri.toString();

		// Dispose all decorators for this URI
		const decorators = this._cellDecorators.get(uriString);
		if (decorators) {
			for (const decorator of decorators.values()) {
				decorator.dispose();
			}
			this._cellDecorators.delete(uriString);
		}

		// Clear zone data
		this._zoneData.delete(uriString);
	}

	public override dispose(): void {
		this._cellDecorators.clear();
		this._zoneData.clear();
		this._notebookEditors.clear();
		super.dispose();
	}
}