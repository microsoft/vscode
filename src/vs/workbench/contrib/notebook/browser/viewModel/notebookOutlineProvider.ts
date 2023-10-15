/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, MutableDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IActiveNotebookEditor, INotebookEditor, INotebookViewCellsUpdateEvent } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { OutlineChangeEvent, OutlineConfigKeys, OutlineTarget } from 'vs/workbench/services/outline/browser/outline';
import { OutlineEntry } from './OutlineEntry';
import { IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { CancellationToken } from 'vs/base/common/cancellation';
import { NotebookOutlineEntryFactory } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineEntryFactory';

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

	private readonly _outlineEntryFactory: NotebookOutlineEntryFactory;

	constructor(
		private readonly _editor: INotebookEditor,
		private readonly _target: OutlineTarget,
		@IThemeService themeService: IThemeService,
		@INotebookExecutionStateService notebookExecutionStateService: INotebookExecutionStateService,
		@IOutlineModelService private readonly _outlineModelService: IOutlineModelService,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		this._outlineEntryFactory = new NotebookOutlineEntryFactory(notebookExecutionStateService);

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

		this._dispoables.add(notebookExecutionStateService.onDidChangeExecution(e => {
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

	async setFullSymbols(cancelToken: CancellationToken) {
		const notebookEditorWidget = this._editor;

		const notebookCells = notebookEditorWidget?.getViewModel()?.viewCells.filter((cell) => cell.cellKind === CellKind.Code);

		this._entries.length = 0;
		if (notebookCells) {
			const promises: Promise<void>[] = [];
			// limit the number of cells so that we don't resolve an excessive amount of text models
			for (const cell of notebookCells.slice(0, 100)) {
				// gather all symbols asynchronously
				promises.push(this._outlineEntryFactory.cacheSymbols(cell, this._outlineModelService, cancelToken));
			}
			await Promise.allSettled(promises);
		}

		this._recomputeState();
	}

	private _recomputeState(): void {
		this._entriesDisposables.clear();
		this._activeEntry = undefined;
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

		const notebookCells = notebookEditorWidget.getViewModel().viewCells.filter((cell) => cell.cellKind === CellKind.Markup || includeCodeCells);

		const entries: OutlineEntry[] = [];
		for (const cell of notebookCells) {
			entries.push(...this._outlineEntryFactory.getOutlineEntries(cell, entries.length));
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

		this._recomputeActive();
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



	get isEmpty(): boolean {
		return this._entries.length === 0;
	}

	get uri() {
		return this._uri;
	}
}
