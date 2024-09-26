/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { IActiveNotebookEditor, INotebookEditor } from '../notebookBrowser.js';
import { CellKind } from '../../common/notebookCommon.js';
import { OutlineChangeEvent, OutlineConfigKeys } from '../../../../services/outline/browser/outline.js';
import { OutlineEntry } from './OutlineEntry.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { INotebookOutlineEntryFactory, NotebookOutlineEntryFactory } from './notebookOutlineEntryFactory.js';

export interface INotebookCellOutlineDataSource {
	readonly activeElement: OutlineEntry | undefined;
	readonly entries: OutlineEntry[];
}

export class NotebookCellOutlineDataSource implements INotebookCellOutlineDataSource {

	private readonly _disposables = new DisposableStore();

	private readonly _onDidChange = new Emitter<OutlineChangeEvent>();
	readonly onDidChange: Event<OutlineChangeEvent> = this._onDidChange.event;

	private _uri: URI | undefined;
	private _entries: OutlineEntry[] = [];
	private _activeEntry?: OutlineEntry;

	constructor(
		private readonly _editor: INotebookEditor,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotebookOutlineEntryFactory private readonly _outlineEntryFactory: NotebookOutlineEntryFactory
	) {
		this.recomputeState();
	}

	get activeElement(): OutlineEntry | undefined {
		return this._activeEntry;
	}
	get entries(): OutlineEntry[] {
		return this._entries;
	}
	get isEmpty(): boolean {
		return this._entries.length === 0;
	}
	get uri() {
		return this._uri;
	}

	public async computeFullSymbols(cancelToken: CancellationToken) {
		const notebookEditorWidget = this._editor;

		const notebookCells = notebookEditorWidget?.getViewModel()?.viewCells.filter((cell) => cell.cellKind === CellKind.Code);

		if (notebookCells) {
			const promises: Promise<void>[] = [];
			// limit the number of cells so that we don't resolve an excessive amount of text models
			for (const cell of notebookCells.slice(0, 50)) {
				// gather all symbols asynchronously
				promises.push(this._outlineEntryFactory.cacheSymbols(cell, cancelToken));
			}
			await Promise.allSettled(promises);
		}
		this.recomputeState();
	}

	public recomputeState(): void {
		this._disposables.clear();
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

		const notebookCells = notebookEditorWidget.getViewModel().viewCells;

		const entries: OutlineEntry[] = [];
		for (const cell of notebookCells) {
			entries.push(...this._outlineEntryFactory.getOutlineEntries(cell, entries.length));
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
		this._disposables.add(markerServiceListener);
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
			const problem = this._configurationService.getValue('problems.visibility');
			if (problem === undefined) {
				return;
			}

			const config = this._configurationService.getValue(OutlineConfigKeys.problemsEnabled);

			if (problem && config) {
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
		this._disposables.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('problems.visibility') || e.affectsConfiguration(OutlineConfigKeys.problemsEnabled)) {
				updateMarkerUpdater();
				this._onDidChange.fire({});
			}
		}));

		const { changeEventTriggered } = this.recomputeActive();
		if (!changeEventTriggered) {
			this._onDidChange.fire({});
		}
	}

	public recomputeActive(): { changeEventTriggered: boolean } {
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
			return { changeEventTriggered: true };
		}
		return { changeEventTriggered: false };
	}

	dispose(): void {
		this._entries.length = 0;
		this._activeEntry = undefined;
		this._disposables.dispose();
	}
}
