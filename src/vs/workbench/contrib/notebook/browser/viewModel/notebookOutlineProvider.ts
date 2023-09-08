/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { renderMarkdownAsPlaintext } from 'vs/base/browser/markdownRenderer';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, MutableDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IMarkerService, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IActiveNotebookEditor, ICellViewModel, INotebookEditor, INotebookViewCellsUpdateEvent } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { executingStateIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { getMarkdownHeadersInCell } from 'vs/workbench/contrib/notebook/browser/viewModel/foldingModel';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { OutlineChangeEvent, OutlineConfigKeys, OutlineTarget } from 'vs/workbench/services/outline/browser/outline';

export interface IOutlineMarkerInfo {
	readonly count: number;
	readonly topSev: MarkerSeverity;
}

export class OutlineEntry {
	private _children: OutlineEntry[] = [];
	private _parent: OutlineEntry | undefined;
	private _markerInfo: IOutlineMarkerInfo | undefined;

	get icon(): ThemeIcon {
		return this.isExecuting && this.isPaused ? executingStateIcon :
			this.isExecuting ? ThemeIcon.modify(executingStateIcon, 'spin') :
				this.cell.cellKind === CellKind.Markup ? Codicon.markdown : Codicon.code;
	}

	constructor(
		readonly index: number,
		readonly level: number,
		readonly cell: ICellViewModel,
		readonly label: string,
		readonly isExecuting: boolean,
		readonly isPaused: boolean
	) { }

	addChild(entry: OutlineEntry) {
		this._children.push(entry);
		entry._parent = this;
	}

	get parent(): OutlineEntry | undefined {
		return this._parent;
	}

	get children(): Iterable<OutlineEntry> {
		return this._children;
	}

	get markerInfo(): IOutlineMarkerInfo | undefined {
		return this._markerInfo;
	}

	updateMarkers(markerService: IMarkerService): void {
		if (this.cell.cellKind === CellKind.Code) {
			// a code cell can have marker
			const marker = markerService.read({ resource: this.cell.uri, severities: MarkerSeverity.Error | MarkerSeverity.Warning });
			if (marker.length === 0) {
				this._markerInfo = undefined;
			} else {
				const topSev = marker.find(a => a.severity === MarkerSeverity.Error)?.severity ?? MarkerSeverity.Warning;
				this._markerInfo = { topSev, count: marker.length };
			}
		} else {
			// a markdown cell can inherit markers from its children
			let topChild: MarkerSeverity | undefined;
			for (const child of this.children) {
				child.updateMarkers(markerService);
				if (child.markerInfo) {
					topChild = !topChild ? child.markerInfo.topSev : Math.max(child.markerInfo.topSev, topChild);
				}
			}
			this._markerInfo = topChild && { topSev: topChild, count: 0 };
		}
	}

	clearMarkers(): void {
		this._markerInfo = undefined;
		for (const child of this.children) {
			child.clearMarkers();
		}
	}

	find(cell: ICellViewModel, parents: OutlineEntry[]): OutlineEntry | undefined {
		if (cell.id === this.cell.id) {
			return this;
		}
		parents.push(this);
		for (const child of this.children) {
			const result = child.find(cell, parents);
			if (result) {
				return result;
			}
		}
		parents.pop();
		return undefined;
	}

	asFlatList(bucket: OutlineEntry[]): void {
		bucket.push(this);
		for (const child of this.children) {
			child.asFlatList(bucket);
		}
	}
}


export class NotebookCellOutlineProvider {
	private readonly _dispoables = new DisposableStore();
	private readonly _onDidChange = new Emitter<OutlineChangeEvent>();

	readonly onDidChange: Event<OutlineChangeEvent> = this._onDidChange.event;

	private _uri: URI | undefined;
	private _entries: OutlineEntry[] = [];
	get entries(): OutlineEntry[] {
		return this._entries;
	}

	private _activeEntry?: OutlineEntry;
	private readonly _entriesDisposables = new DisposableStore();

	readonly outlineKind = 'notebookCells';

	get activeElement(): OutlineEntry | undefined {
		return this._activeEntry;
	}

	constructor(
		private readonly _editor: INotebookEditor,
		private readonly _target: OutlineTarget,
		@IThemeService themeService: IThemeService,
		@IEditorService _editorService: IEditorService,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService,
	) {
		const selectionListener = new MutableDisposable();
		this._dispoables.add(selectionListener);

		selectionListener.value = combinedDisposable(
			Event.debounce<void, void>(
				_editor.onDidChangeSelection,
				(last, _current) => last,
				200
			)(this._recomputeActive, this),
			Event.debounce<INotebookViewCellsUpdateEvent, INotebookViewCellsUpdateEvent>(
				_editor.onDidChangeViewCells,
				(last, _current) => last ?? _current,
				200
			)(this._recomputeState, this)
		);

		this._dispoables.add(_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('notebook.outline.showCodeCells')) {
				this._recomputeState();
			}
		}));

		this._dispoables.add(themeService.onDidFileIconThemeChange(() => {
			this._onDidChange.fire({});
		}));

		this._dispoables.add(_notebookExecutionStateService.onDidChangeExecution(e => {
			if (e.type === NotebookExecutionType.cell && !!this._editor.textModel && e.affectsNotebook(this._editor.textModel?.uri)) {
				this._recomputeState();
			}
		}));

		this._recomputeState();
	}

	dispose(): void {
		this._entries.length = 0;
		this._activeEntry = undefined;
		this._entriesDisposables.dispose();
		this._dispoables.dispose();
	}

	init(): void {
		this._recomputeState();
	}

	private _recomputeState(): void {
		this._entriesDisposables.clear();
		this._activeEntry = undefined;
		this._entries.length = 0;
		this._uri = undefined;

		if (!this._editor.hasModel()) {
			return;
		}

		this._uri = this._editor.textModel.uri;

		const notebookEditorWidget: IActiveNotebookEditor = this._editor;

		if (notebookEditorWidget.getLength() === 0) {
			return;
		}

		let includeCodeCells = true;
		if (this._target === OutlineTarget.OutlinePane) {
			includeCodeCells = this._configurationService.getValue<boolean>('notebook.outline.showCodeCells');
		} else if (this._target === OutlineTarget.Breadcrumbs) {
			includeCodeCells = this._configurationService.getValue<boolean>('notebook.breadcrumbs.showCodeCells');
		}

		const focusedCellIndex = notebookEditorWidget.getFocus().start;
		const focused = notebookEditorWidget.cellAt(focusedCellIndex)?.handle;
		const entries: OutlineEntry[] = [];

		for (let i = 0; i < notebookEditorWidget.getLength(); i++) {
			const cell = notebookEditorWidget.cellAt(i);
			const isMarkdown = cell.cellKind === CellKind.Markup;
			if (!isMarkdown && !includeCodeCells) {
				continue;
			}

			// cap the amount of characters that we look at and use the following logic
			// - for MD prefer headings (each header is an entry)
			// - otherwise use the first none-empty line of the cell (MD or code)
			let content = this._getCellFirstNonEmptyLine(cell);
			let hasHeader = false;

			if (isMarkdown) {
				const fullContent = cell.getText().substring(0, 10_000);
				for (const { depth, text } of getMarkdownHeadersInCell(fullContent)) {
					hasHeader = true;
					entries.push(new OutlineEntry(entries.length, depth, cell, text, false, false));
				}

				if (!hasHeader) {
					// no markdown syntax headers, try to find html tags
					const match = fullContent.match(/<h([1-6]).*>(.*)<\/h\1>/i);
					if (match) {
						hasHeader = true;
						const level = parseInt(match[1]);
						const text = match[2].trim();
						entries.push(new OutlineEntry(entries.length, level, cell, text, false, false));
					}
				}

				if (!hasHeader) {
					content = renderMarkdownAsPlaintext({ value: content });
				}
			}

			if (!hasHeader) {
				let preview = content.trim();
				if (preview.length === 0) {
					// empty or just whitespace
					preview = localize('empty', "empty cell");
				}

				const exeState = !isMarkdown && this._notebookExecutionStateService.getCellExecution(cell.uri);
				entries.push(new OutlineEntry(entries.length, 7, cell, preview, !!exeState, exeState ? exeState.isPaused : false));
			}

			if (cell.handle === focused) {
				this._activeEntry = entries[entries.length - 1];
			}

			// send an event whenever any of the cells change
			this._entriesDisposables.add(cell.model.onDidChangeContent(() => {
				this._recomputeState();
				this._onDidChange.fire({});
			}));
		}

		// build a tree from the list of entries
		if (entries.length > 0) {
			const result: OutlineEntry[] = [entries[0]];
			const parentStack: OutlineEntry[] = [entries[0]];

			for (let i = 1; i < entries.length; i++) {
				const entry = entries[i];

				while (true) {
					const len = parentStack.length;
					if (len === 0) {
						// root node
						result.push(entry);
						parentStack.push(entry);
						break;

					} else {
						const parentCandidate = parentStack[len - 1];
						if (parentCandidate.level < entry.level) {
							parentCandidate.addChild(entry);
							parentStack.push(entry);
							break;
						} else {
							parentStack.pop();
						}
					}
				}
			}
			this._entries = result;
		}

		// feature: show markers with each cell
		const markerServiceListener = new MutableDisposable();
		this._entriesDisposables.add(markerServiceListener);
		const updateMarkerUpdater = () => {
			if (notebookEditorWidget.isDisposed) {
				return;
			}

			const doUpdateMarker = (clear: boolean) => {
				for (const entry of this._entries) {
					if (clear) {
						entry.clearMarkers();
					} else {
						entry.updateMarkers(this._markerService);
					}
				}
			};
			if (this._configurationService.getValue(OutlineConfigKeys.problemsEnabled)) {
				markerServiceListener.value = this._markerService.onMarkerChanged(e => {
					if (notebookEditorWidget.isDisposed) {
						console.error('notebook editor is disposed');
						return;
					}

					if (e.some(uri => notebookEditorWidget.getCellsInRange().some(cell => isEqual(cell.uri, uri)))) {
						doUpdateMarker(false);
						this._onDidChange.fire({});
					}
				});
				doUpdateMarker(false);
			} else {
				markerServiceListener.clear();
				doUpdateMarker(true);
			}
		};
		updateMarkerUpdater();
		this._entriesDisposables.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(OutlineConfigKeys.problemsEnabled)) {
				updateMarkerUpdater();
				this._onDidChange.fire({});
			}
		}));

		this._onDidChange.fire({});
	}

	private _recomputeActive(): void {
		let newActive: OutlineEntry | undefined;
		const notebookEditorWidget = this._editor;

		if (notebookEditorWidget) {//TODO don't check for widget, only here if we do have
			if (notebookEditorWidget.hasModel() && notebookEditorWidget.getLength() > 0) {
				const cell = notebookEditorWidget.cellAt(notebookEditorWidget.getFocus().start);
				if (cell) {
					for (const entry of this._entries) {
						newActive = entry.find(cell, []);
						if (newActive) {
							break;
						}
					}
				}
			}
		}
		if (newActive !== this._activeEntry) {
			this._activeEntry = newActive;
			this._onDidChange.fire({ affectOnlyActiveElement: true });
		}
	}

	private _getCellFirstNonEmptyLine(cell: ICellViewModel) {
		const textBuffer = cell.textBuffer;
		for (let i = 0; i < textBuffer.getLineCount(); i++) {
			const firstNonWhitespace = textBuffer.getLineFirstNonWhitespaceColumn(i + 1);
			const lineLength = textBuffer.getLineLength(i + 1);
			if (firstNonWhitespace < lineLength) {
				return textBuffer.getLineContent(i + 1);
			}
		}

		return cell.getText().substring(0, 10_000);
	}

	get isEmpty(): boolean {
		return this._entries.length === 0;
	}

	get uri() {
		return this._uri;
	}
}
