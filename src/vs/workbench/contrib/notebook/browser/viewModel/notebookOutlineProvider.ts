/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IActiveNotebookEditor, ICellViewModel, INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind, NotebookCellsChangeType, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { OutlineChangeEvent, OutlineConfigKeys, OutlineTarget } from 'vs/workbench/services/outline/browser/outline';
import { OutlineEntry } from './OutlineEntry';
import { IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { CancellationToken } from 'vs/base/common/cancellation';
import { NotebookOutlineConstants, NotebookOutlineEntryFactory } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineEntryFactory';
import { Delayer } from 'vs/base/common/async';

export class NotebookCellOutlineProvider {
	private readonly _disposables = new DisposableStore();
	private readonly _onDidChange = new Emitter<OutlineChangeEvent>();

	readonly onDidChange: Event<OutlineChangeEvent> = this._onDidChange.event;

	private _uri: URI | undefined;
	private _entries: OutlineEntry[] = [];
	get entries(): OutlineEntry[] {
		if (this.delayedOutlineRecompute.isTriggered()) {
			this.delayedOutlineRecompute.cancel();
			this._recomputeState();
		}
		return this._entries;
	}

	private _activeEntry?: OutlineEntry;
	private readonly _entriesDisposables = new DisposableStore();

	readonly outlineKind = 'notebookCells';

	get activeElement(): OutlineEntry | undefined {
		if (this.delayedOutlineRecompute.isTriggered()) {
			this.delayedOutlineRecompute.cancel();
			this._recomputeState();
		}
		return this._activeEntry;
	}

	private readonly _outlineEntryFactory: NotebookOutlineEntryFactory;
	private readonly delayedOutlineRecompute: Delayer<void>;
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

		const delayerRecomputeActive = this._disposables.add(new Delayer(200));
		this._disposables.add(_editor.onDidChangeSelection(() => {
			delayerRecomputeActive.trigger(() => this._recomputeActive());
		}, this));

		// .3s of a delay is sufficient, 100-200s is too quick and will unnecessarily block the ui thread.
		// Given we're only updating the outline when the user types, we can afford to wait a bit.
		this.delayedOutlineRecompute = this._disposables.add(new Delayer<void>(300));
		const delayedRecompute = () => {
			delayerRecomputeActive.cancel(); // Active is always recomputed after a recomputing the outline state.
			this.delayedOutlineRecompute.trigger(() => this._recomputeState());
		};

		this._disposables.add(_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(NotebookSetting.outlineShowMarkdownHeadersOnly) ||
				e.affectsConfiguration(NotebookSetting.outlineShowCodeCells) ||
				e.affectsConfiguration(NotebookSetting.outlineShowCodeCellSymbols) ||
				e.affectsConfiguration(NotebookSetting.breadcrumbsShowCodeCells)
			) {
				delayedRecompute();
			}
		}));

		this._disposables.add(themeService.onDidFileIconThemeChange(() => {
			this._onDidChange.fire({});
		}));

		this._disposables.add(
			notebookExecutionStateService.onDidChangeExecution(e => {
				if (e.type === NotebookExecutionType.cell && !!this._editor.textModel && e.affectsNotebook(this._editor.textModel?.uri)) {
					delayedRecompute();
				}
			})
		);

		const disposable = this._disposables.add(new DisposableStore());
		const monitorModelChanges = () => {
			disposable.clear();
			if (!this._editor.textModel) {
				return;
			}
			disposable.add(this._editor.textModel.onDidChangeContent(contentChanges => {
				if (contentChanges.rawEvents.some(c => c.kind === NotebookCellsChangeType.ChangeCellContent ||
					c.kind === NotebookCellsChangeType.ChangeCellInternalMetadata ||
					c.kind === NotebookCellsChangeType.Move ||
					c.kind === NotebookCellsChangeType.ModelChange)) {
					delayedRecompute();
				}
			}));
			// Perhaps this is the first time we're building the outline
			if (!this._entries.length) {
				this._recomputeState();
			}
		};
		this._disposables.add(this._editor.onDidChangeModel(monitorModelChanges));
		monitorModelChanges();
		this._recomputeState();
	}

	dispose(): void {
		this._entries.length = 0;
		this._activeEntry = undefined;
		this._entriesDisposables.dispose();
		this._disposables.dispose();
	}

	async setFullSymbols(cancelToken: CancellationToken) {
		const notebookEditorWidget = this._editor;

		const notebookCells = notebookEditorWidget?.getViewModel()?.viewCells.filter((cell) => cell.cellKind === CellKind.Code);

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
		if (this._target === OutlineTarget.Breadcrumbs) {
			includeCodeCells = this._configurationService.getValue<boolean>('notebook.breadcrumbs.showCodeCells');
		}

		let notebookCells: ICellViewModel[];
		if (this._target === OutlineTarget.Breadcrumbs) {
			notebookCells = notebookEditorWidget.getViewModel().viewCells.filter((cell) => cell.cellKind === CellKind.Markup || includeCodeCells);
		} else {
			notebookCells = notebookEditorWidget.getViewModel().viewCells;
		}

		const entries: OutlineEntry[] = [];
		for (const cell of notebookCells) {
			entries.push(...this._outlineEntryFactory.getOutlineEntries(cell, this._target, entries.length));
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
		this._entriesDisposables.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('problems.visibility') || e.affectsConfiguration(OutlineConfigKeys.problemsEnabled)) {
				updateMarkerUpdater();
				this._onDidChange.fire({});
			}
		}));

		const { changeEventTriggered } = this._recomputeActive();
		if (!changeEventTriggered) {
			this._onDidChange.fire({});
		}
	}

	private _recomputeActive(): { changeEventTriggered: boolean } {
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

		// @Yoyokrazy - Make sure the new active entry isn't part of the filtered exclusions
		const showCodeCells = this._configurationService.getValue<boolean>(NotebookSetting.outlineShowCodeCells);
		const showCodeCellSymbols = this._configurationService.getValue<boolean>(NotebookSetting.outlineShowCodeCellSymbols);
		const showMarkdownHeadersOnly = this._configurationService.getValue<boolean>(NotebookSetting.outlineShowMarkdownHeadersOnly);

		// check the three outline filtering conditions
		// if any are true, newActive should NOT be set to this._activeEntry and the event should NOT fire
		if (
			(newActive !== this._activeEntry) && !(
				(showMarkdownHeadersOnly && newActive?.cell.cellKind === CellKind.Markup && newActive?.level === NotebookOutlineConstants.NonHeaderOutlineLevel) ||	// show headers only + cell is mkdn + is level 7 (no header)
				(!showCodeCells && newActive?.cell.cellKind === CellKind.Code) ||																					// show code cells   + cell is code
				(!showCodeCellSymbols && newActive?.cell.cellKind === CellKind.Code && newActive?.level > NotebookOutlineConstants.NonHeaderOutlineLevel)			// show code symbols + cell is code + has level > 7 (nb symbol levels)
			)
		) {
			this._activeEntry = newActive;
			this._onDidChange.fire({ affectOnlyActiveElement: true });
			return { changeEventTriggered: true };
		}

		return { changeEventTriggered: false };
	}

	get isEmpty(): boolean {
		return this._entries.length === 0;
	}

	get uri() {
		return this._uri;
	}
}
