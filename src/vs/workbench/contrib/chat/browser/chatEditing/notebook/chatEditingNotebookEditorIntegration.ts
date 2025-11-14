/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, debouncedObservable, IObservable, ISettableObservable, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { basename } from '../../../../../../base/common/resources.js';
import { assertType } from '../../../../../../base/common/types.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { LineRange } from '../../../../../../editor/common/core/ranges/lineRange.js';
import { nullDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { PrefixSumComputer } from '../../../../../../editor/common/model/prefixSumComputer.js';
import { localize } from '../../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IEditorPane, IResourceDiffEditorInput } from '../../../../../common/editor.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { NotebookDeletedCellDecorator } from '../../../../notebook/browser/diff/inlineDiff/notebookDeletedCellDecorator.js';
import { NotebookInsertedCellDecorator } from '../../../../notebook/browser/diff/inlineDiff/notebookInsertedCellDecorator.js';
import { NotebookModifiedCellDecorator } from '../../../../notebook/browser/diff/inlineDiff/notebookModifiedCellDecorator.js';
import { INotebookTextDiffEditor } from '../../../../notebook/browser/diff/notebookDiffEditorBrowser.js';
import { CellEditState, getNotebookEditorFromEditorPane, ICellViewModel, INotebookEditor } from '../../../../notebook/browser/notebookBrowser.js';
import { INotebookEditorService } from '../../../../notebook/browser/services/notebookEditorService.js';
import { NotebookCellTextModel } from '../../../../notebook/common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../../../notebook/common/model/notebookTextModel.js';
import { CellKind } from '../../../../notebook/common/notebookCommon.js';
import { IModifiedFileEntryChangeHunk, IModifiedFileEntryEditorIntegration } from '../../../common/chatEditingService.js';
import { ChatEditingCodeEditorIntegration, IDocumentDiff2 } from '../chatEditingCodeEditorIntegration.js';
import { ChatEditingModifiedNotebookEntry } from '../chatEditingModifiedNotebookEntry.js';
import { countChanges, ICellDiffInfo, sortCellChanges } from './notebookCellChanges.js';
import { OverlayToolbarDecorator } from './overlayToolbarDecorator.js';

export class ChatEditingNotebookEditorIntegration extends Disposable implements IModifiedFileEntryEditorIntegration {
	private integration: ChatEditingNotebookEditorWidgetIntegration;
	private notebookEditor: INotebookEditor;
	constructor(
		_entry: ChatEditingModifiedNotebookEntry,
		editor: IEditorPane,
		notebookModel: NotebookTextModel,
		originalModel: NotebookTextModel,
		cellChanges: IObservable<ICellDiffInfo[]>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const notebookEditor = getNotebookEditorFromEditorPane(editor);
		assertType(notebookEditor);
		this.notebookEditor = notebookEditor;
		this.integration = this.instantiationService.createInstance(ChatEditingNotebookEditorWidgetIntegration, _entry, notebookEditor, notebookModel, originalModel, cellChanges);
		this._register(editor.onDidChangeControl(() => {
			const notebookEditor = getNotebookEditorFromEditorPane(editor);
			if (notebookEditor && notebookEditor !== this.notebookEditor) {
				this.notebookEditor = notebookEditor;
				this.integration.dispose();
				this.integration = this.instantiationService.createInstance(ChatEditingNotebookEditorWidgetIntegration, _entry, notebookEditor, notebookModel, originalModel, cellChanges);
			}
		}));
	}
	public get currentIndex(): IObservable<number> {
		return this.integration.currentIndex;
	}
	reveal(firstOrLast: boolean): void {
		return this.integration.reveal(firstOrLast);
	}
	next(wrap: boolean): boolean {
		return this.integration.next(wrap);
	}
	previous(wrap: boolean): boolean {
		return this.integration.previous(wrap);
	}
	enableAccessibleDiffView(): void {
		this.integration.enableAccessibleDiffView();
	}
	acceptNearestChange(change: IModifiedFileEntryChangeHunk | undefined): Promise<void> {
		return this.integration.acceptNearestChange(change);
	}
	rejectNearestChange(change: IModifiedFileEntryChangeHunk | undefined): Promise<void> {
		return this.integration.rejectNearestChange(change);
	}
	toggleDiff(change: IModifiedFileEntryChangeHunk | undefined, show?: boolean): Promise<void> {
		return this.integration.toggleDiff(change, show);
	}

	public override dispose(): void {
		this.integration.dispose();
		super.dispose();
	}
}

class ChatEditingNotebookEditorWidgetIntegration extends Disposable implements IModifiedFileEntryEditorIntegration {
	private readonly _currentIndex = observableValue(this, -1);
	readonly currentIndex: IObservable<number> = this._currentIndex;

	private deletedCellDecorator: NotebookDeletedCellDecorator | undefined;
	private insertedCellDecorator: NotebookInsertedCellDecorator | undefined;
	private modifiedCellDecorator: NotebookModifiedCellDecorator | undefined;
	private overlayToolbarDecorator: OverlayToolbarDecorator | undefined;

	private readonly cellEditorIntegrations = new Map<NotebookCellTextModel, { integration: ChatEditingCodeEditorIntegration; diff: ISettableObservable<IDocumentDiff2> }>();

	private readonly markdownEditState = observableValue<string>(this, '');

	private markupCellListeners = new Map<number, IDisposable>();

	private sortedCellChanges: ICellDiffInfo[] = [];
	private changeIndexComputer: PrefixSumComputer = new PrefixSumComputer(new Uint32Array(0));

	constructor(
		private readonly _entry: ChatEditingModifiedNotebookEntry,
		private readonly notebookEditor: INotebookEditor,
		private readonly notebookModel: NotebookTextModel,
		originalModel: NotebookTextModel,
		private readonly cellChanges: IObservable<ICellDiffInfo[]>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@INotebookEditorService notebookEditorService: INotebookEditorService,
		@IAccessibilitySignalService private readonly accessibilitySignalService: IAccessibilitySignalService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const onDidChangeVisibleRanges = debouncedObservable(observableFromEvent(notebookEditor.onDidChangeVisibleRanges, () => notebookEditor.visibleRanges), 50);

		this._register(toDisposable(() => {
			this.markupCellListeners.forEach((v) => v.dispose());
		}));

		let originalReadonly: boolean | undefined = undefined;
		const shouldBeReadonly = _entry.isCurrentlyBeingModifiedBy.map(value => !!value);
		this._register(autorun(r => {
			const isReadOnly = shouldBeReadonly.read(r);
			const notebookEditor = notebookEditorService.retrieveExistingWidgetFromURI(_entry.modifiedURI)?.value;
			if (!notebookEditor) {
				return;
			}
			if (isReadOnly) {
				originalReadonly ??= notebookEditor.isReadOnly;
				notebookEditor.setOptions({ isReadOnly: true });
			} else if (originalReadonly === false) {
				notebookEditor.setOptions({ isReadOnly: false });
				// Ensure all cells area editable.
				// We make use of chatEditingCodeEditorIntegration to handle cell diffing and navigation.
				// However that also makes the cell read-only. We need to ensure that the cell is editable.
				// E.g. first we make notebook readonly (in here), then cells end up being readonly because notebook is readonly.
				// Then chatEditingCodeEditorIntegration makes cells readonly and keeps track of the original readonly state.
				// However the cell is already readonly because the notebook is readonly.
				// So when we restore the notebook to editable (in here), the cell is made editable again.
				// But when chatEditingCodeEditorIntegration attempts to restore, it will restore the original readonly state.
				// & from the perpspective of chatEditingCodeEditorIntegration, the cell was readonly & should continue to be readonly.
				// To get around this, we wait for a few ms before restoring the original readonly state for each cell.
				const timeout = setTimeout(() => {
					notebookEditor.setOptions({ isReadOnly: true });
					notebookEditor.setOptions({ isReadOnly: false });
					disposable.dispose();
				}, 100);
				const disposable = toDisposable(() => clearTimeout(timeout));
				r.store.add(disposable);
			}
		}));

		// INIT when not streaming nor diffing the response anymore, once per request, and when having changes
		let lastModifyingRequestId: string | undefined;
		this._store.add(autorun(r => {

			if (!_entry.isCurrentlyBeingModifiedBy.read(r)
				&& !_entry.isProcessingResponse.read(r)
				&& lastModifyingRequestId !== _entry.lastModifyingRequestId
				&& cellChanges.read(r).some(c => c.type !== 'unchanged' && !c.diff.read(r).identical)
			) {
				lastModifyingRequestId = _entry.lastModifyingRequestId;
				// Check if any of the changes are visible, if not, reveal the first change.
				const visibleChange = this.sortedCellChanges.find(c => {
					if (c.type === 'unchanged') {
						return false;
					}
					const index = c.modifiedCellIndex ?? c.originalCellIndex;
					return this.notebookEditor.visibleRanges.some(range => index >= range.start && index < range.end);
				});

				if (!visibleChange) {
					this.reveal(true);
				}
			}
		}));

		this._register(autorun(r => {
			this.sortedCellChanges = sortCellChanges(cellChanges.read(r));
			const indexes: number[] = [];
			for (const change of this.sortedCellChanges) {
				indexes.push(change.type === 'insert' || change.type === 'delete' ? 1
					: change.type === 'modified' ? change.diff.read(r).changes.length
						: 0);
			}

			this.changeIndexComputer = new PrefixSumComputer(new Uint32Array(indexes));
			if (this.changeIndexComputer.getTotalSum() === 0) {
				this.revertMarkupCellState();
			}
		}));

		// Build cell integrations (responsible for navigating changes within a cell and decorating cell text changes)
		this._register(autorun(r => {
			if (this.notebookEditor.textModel !== this.notebookModel) {
				return;
			}
			const sortedCellChanges = sortCellChanges(cellChanges.read(r));

			const changes = sortedCellChanges.filter(c => c.type !== 'delete');
			onDidChangeVisibleRanges.read(r);
			if (!changes.length) {
				this.cellEditorIntegrations.forEach(({ diff }) => {
					diff.set({ ...diff.read(undefined), ...nullDocumentDiff }, undefined);
				});
				return;
			}
			this.markdownEditState.read(r);

			const validCells = new Set<NotebookCellTextModel>();
			changes.forEach((change) => {
				if (change.modifiedCellIndex === undefined || change.modifiedCellIndex >= notebookModel.cells.length) {
					return;
				}
				const cell = notebookModel.cells[change.modifiedCellIndex];
				const editor = notebookEditor.codeEditors.find(([vm,]) => vm.handle === notebookModel.cells[change.modifiedCellIndex].handle)?.[1];
				const modifiedModel = change.modifiedModel.promiseResult.read(r)?.data;
				const originalModel = change.originalModel.promiseResult.read(r)?.data;
				if (!cell || !originalModel || !modifiedModel) {
					return;
				}
				if (cell.cellKind === CellKind.Markup && !this.markupCellListeners.has(cell.handle)) {
					const cellModel = this.notebookEditor.getViewModel()?.viewCells.find(c => c.handle === cell.handle);
					if (cellModel) {
						const listener = cellModel.onDidChangeState((e) => {
							if (e.editStateChanged) {
								setTimeout(() => this.markdownEditState.set(cellModel.handle + '-' + cellModel.getEditState(), undefined), 0);
							}
						});
						this.markupCellListeners.set(cell.handle, listener);
					}
				}
				if (!editor) {
					return;
				}
				const diff = {
					...change.diff.read(r),
					modifiedModel,
					originalModel,
					keep: change.keep,
					undo: change.undo
				} satisfies IDocumentDiff2;
				validCells.add(cell);
				const currentDiff = this.cellEditorIntegrations.get(cell);
				if (currentDiff) {
					// Do not unnecessarily trigger a change event
					if (!areDocumentDiff2Equal(currentDiff.diff.read(undefined), diff)) {
						currentDiff.diff.set(diff, undefined);
					}
				} else {
					const diff2 = observableValue(`diff${cell.handle}`, diff);
					const integration = this.instantiationService.createInstance(ChatEditingCodeEditorIntegration, _entry, editor, diff2, true);
					this.cellEditorIntegrations.set(cell, { integration, diff: diff2 });
					this._register(integration);
					this._register(editor.onDidDispose(() => {
						this.cellEditorIntegrations.get(cell)?.integration.dispose();
						this.cellEditorIntegrations.delete(cell);
					}));
					this._register(editor.onDidChangeModel(() => {
						if (editor.getModel() !== cell.textModel) {
							this.cellEditorIntegrations.get(cell)?.integration.dispose();
							this.cellEditorIntegrations.delete(cell);
						}
					}));
				}
			});

			// Dispose old integrations as the editors are no longer valid.
			this.cellEditorIntegrations.forEach((v, cell) => {
				if (!validCells.has(cell)) {
					v.integration.dispose();
					this.cellEditorIntegrations.delete(cell);
				}
			});
		}));

		const cellsAreVisible = onDidChangeVisibleRanges.map(v => v.length > 0);
		const debouncedChanges = debouncedObservable(cellChanges, 10);
		this._register(autorun(r => {
			if (this.notebookEditor.textModel !== this.notebookModel || !cellsAreVisible.read(r) || !this.notebookEditor.getViewModel()) {
				return;
			}
			// We can have inserted cells that have been accepted, in those cases we do not want any decorators on them.
			const changes = debouncedChanges.read(r).filter(c => c.type === 'insert' ? !c.diff.read(r).identical : true);
			const modifiedChanges = changes.filter(c => c.type === 'modified');

			this.createDecorators();
			// If all cells are just inserts, then no need to show any decorations.
			if (changes.every(c => c.type === 'insert')) {
				this.insertedCellDecorator?.apply([]);
				this.modifiedCellDecorator?.apply([]);
				this.deletedCellDecorator?.apply([], originalModel);
				this.overlayToolbarDecorator?.decorate([]);
			} else {
				this.insertedCellDecorator?.apply(changes);
				this.modifiedCellDecorator?.apply(modifiedChanges);
				this.deletedCellDecorator?.apply(changes, originalModel);
				this.overlayToolbarDecorator?.decorate(changes.filter(c => c.type === 'insert' || c.type === 'modified'));
			}
		}));
	}

	private getCurrentChange() {
		const currentIndex = Math.min(this._currentIndex.get(), this.changeIndexComputer.getTotalSum() - 1);
		const index = this.changeIndexComputer.getIndexOf(currentIndex);
		const change = this.sortedCellChanges[index.index];

		return change ? { change, index: index.remainder } : undefined;
	}

	private updateCurrentIndex(change: ICellDiffInfo, indexInCell: number = 0) {
		const index = this.sortedCellChanges.indexOf(change);
		const changeIndex = this.changeIndexComputer.getPrefixSum(index - 1);
		const currentIndex = Math.min(changeIndex + indexInCell, this.changeIndexComputer.getTotalSum() - 1);
		this._currentIndex.set(currentIndex, undefined);
	}

	private createDecorators() {
		const cellChanges = this.cellChanges.get();
		const accessibilitySignalService = this.accessibilitySignalService;

		this.insertedCellDecorator ??= this._register(this.instantiationService.createInstance(NotebookInsertedCellDecorator, this.notebookEditor));
		this.modifiedCellDecorator ??= this._register(this.instantiationService.createInstance(NotebookModifiedCellDecorator, this.notebookEditor));
		this.overlayToolbarDecorator ??= this._register(this.instantiationService.createInstance(OverlayToolbarDecorator, this.notebookEditor, this.notebookModel));

		if (this.deletedCellDecorator) {
			this._store.delete(this.deletedCellDecorator);
			this.deletedCellDecorator.dispose();
		}
		this.deletedCellDecorator = this._register(this.instantiationService.createInstance(NotebookDeletedCellDecorator, this.notebookEditor, {
			className: 'chat-diff-change-content-widget',
			telemetrySource: 'chatEditingNotebookHunk',
			menuId: MenuId.ChatEditingEditorHunk,
			actionViewItemProvider: (action, options) => {
				if (!action.class) {
					return new class extends ActionViewItem {
						constructor() {
							super(undefined, action, { ...options, keybindingNotRenderedWithLabel: true /* hide keybinding for actions without icon */, icon: false, label: true });
						}
					};
				}
				return undefined;
			},
			argFactory: (deletedCellIndex: number) => {
				return {
					accept() {
						const entry = cellChanges.find(c => c.type === 'delete' && c.originalCellIndex === deletedCellIndex);
						if (entry) {
							return entry.keep(entry.diff.get().changes[0]);
						}
						accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
						return Promise.resolve(true);
					},
					reject() {
						const entry = cellChanges.find(c => c.type === 'delete' && c.originalCellIndex === deletedCellIndex);
						if (entry) {
							return entry.undo(entry.diff.get().changes[0]);
						}
						accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
						return Promise.resolve(true);
					},
				} satisfies IModifiedFileEntryChangeHunk;
			}
		}));
	}

	getCell(modifiedCellIndex: number) {
		const cell = this.notebookModel.cells[modifiedCellIndex];
		const integration = this.cellEditorIntegrations.get(cell)?.integration;
		return integration;
	}

	reveal(firstOrLast: boolean): void {
		const changes = this.sortedCellChanges.filter(c => c.type !== 'unchanged');
		if (!changes.length) {
			return;
		}
		const change = firstOrLast ? changes[0] : changes[changes.length - 1];
		this._revealFirstOrLast(change, firstOrLast);
	}

	private _revealFirstOrLast(change: ICellDiffInfo, firstOrLast: boolean = true) {
		switch (change.type) {
			case 'insert':
			case 'modified':
				{
					this.blur(this.getCurrentChange()?.change);
					const index = firstOrLast || change.type === 'insert' ? 0 : change.diff.get().changes.length - 1;
					return this._revealChange(change, index);
				}
			case 'delete':
				this.blur(this.getCurrentChange()?.change);
				// reveal the deleted cell decorator
				this.deletedCellDecorator?.reveal(change.originalCellIndex);
				this.updateCurrentIndex(change);
				return true;
			default:
				break;
		}

		return false;
	}

	private _revealChange(change: ICellDiffInfo, indexInCell: number) {
		switch (change.type) {
			case 'insert':
			case 'modified':
				{
					const textChange = change.diff.get().changes[indexInCell];
					const cellViewModel = this.getCellViewModel(change);
					if (cellViewModel) {
						this.updateCurrentIndex(change, indexInCell);
						this.revealChangeInView(cellViewModel, textChange?.modified, change)
							.catch(err => { this.logService.warn(`Error revealing change in view: ${err}`); });
						return true;
					}
					break;
				}
			case 'delete':
				this.updateCurrentIndex(change);
				// reveal the deleted cell decorator
				this.deletedCellDecorator?.reveal(change.originalCellIndex);
				return true;
			default:
				break;
		}

		return false;
	}

	private getCellViewModel(change: ICellDiffInfo) {
		if (change.type === 'delete' || change.modifiedCellIndex === undefined || change.modifiedCellIndex >= this.notebookModel.cells.length) {
			return undefined;
		}
		const cell = this.notebookModel.cells[change.modifiedCellIndex];
		const cellViewModel = this.notebookEditor.getViewModel()?.viewCells.find(c => c.handle === cell.handle);
		return cellViewModel;
	}

	private async revealChangeInView(cell: ICellViewModel, lines: LineRange | undefined, change: ICellDiffInfo): Promise<void> {
		const targetLines = lines ?? new LineRange(0, 0);
		if (change.type === 'modified' && cell.cellKind === CellKind.Markup && cell.getEditState() === CellEditState.Preview) {
			cell.updateEditState(CellEditState.Editing, 'chatEditNavigation');
		}

		const focusTarget = cell.cellKind === CellKind.Code || change.type === 'modified' ? 'editor' : 'container';
		await this.notebookEditor.focusNotebookCell(cell, focusTarget, { focusEditorLine: targetLines.startLineNumber });
		await this.notebookEditor.revealRangeInCenterAsync(cell, new Range(targetLines.startLineNumber, 0, targetLines.endLineNumberExclusive, 0));
	}

	private revertMarkupCellState() {
		for (const change of this.sortedCellChanges) {
			const cellViewModel = this.getCellViewModel(change);
			if (cellViewModel?.cellKind === CellKind.Markup && cellViewModel.getEditState() === CellEditState.Editing &&
				(cellViewModel.editStateSource === 'chatEditNavigation' || cellViewModel.editStateSource === 'chatEdit')) {
				cellViewModel.updateEditState(CellEditState.Preview, 'chatEdit');
			}
		}
	}

	private blur(change: ICellDiffInfo | undefined) {
		if (!change) {
			return;
		}
		const cellViewModel = this.getCellViewModel(change);
		if (cellViewModel?.cellKind === CellKind.Markup && cellViewModel.getEditState() === CellEditState.Editing && cellViewModel.editStateSource === 'chatEditNavigation') {
			cellViewModel.updateEditState(CellEditState.Preview, 'chatEditNavigation');
		}
	}

	next(wrap: boolean): boolean {
		const changes = this.sortedCellChanges.filter(c => c.type !== 'unchanged');
		const currentChange = this.getCurrentChange();
		if (!currentChange) {
			const firstChange = changes[0];

			if (firstChange) {
				return this._revealFirstOrLast(firstChange);
			}

			return false;
		}

		// go to next
		// first check if we are at the end of the current change
		switch (currentChange.change.type) {
			case 'modified':
				{
					const cellIntegration = this.getCell(currentChange.change.modifiedCellIndex);
					if (cellIntegration) {
						if (cellIntegration.next(false)) {
							this.updateCurrentIndex(currentChange.change, cellIntegration.currentIndex.get());
							return true;
						}
					}

					const isLastChangeInCell = currentChange.index >= lastChangeIndex(currentChange.change);
					const index = isLastChangeInCell ? 0 : currentChange.index + 1;
					const change = isLastChangeInCell ? changes[changes.indexOf(currentChange.change) + 1] : currentChange.change;

					if (change) {
						if (isLastChangeInCell) {
							this.blur(currentChange.change);
						}

						if (this._revealChange(change, index)) {
							return true;
						}
					}
				}
				break;
			case 'insert':
			case 'delete':
				{
					this.blur(currentChange.change);
					// go to next change directly
					const nextChange = changes[changes.indexOf(currentChange.change) + 1];
					if (nextChange && this._revealFirstOrLast(nextChange, true)) {
						return true;
					}
				}
				break;
			default:
				break;
		}

		if (wrap) {
			const firstChange = changes[0];
			if (firstChange) {
				return this._revealFirstOrLast(firstChange, true);
			}
		}

		return false;
	}

	previous(wrap: boolean): boolean {
		const changes = this.sortedCellChanges.filter(c => c.type !== 'unchanged');
		const currentChange = this.getCurrentChange();
		if (!currentChange) {
			const lastChange = changes[changes.length - 1];
			if (lastChange) {
				return this._revealFirstOrLast(lastChange, false);
			}

			return false;
		}

		// go to previous
		// first check if we are at the start of the current change
		switch (currentChange.change.type) {
			case 'modified':
				{
					const cellIntegration = this.getCell(currentChange.change.modifiedCellIndex);
					if (cellIntegration) {
						if (cellIntegration.previous(false)) {
							this.updateCurrentIndex(currentChange.change, cellIntegration.currentIndex.get());
							return true;
						}
					}

					const isFirstChangeInCell = currentChange.index <= 0;
					const change = isFirstChangeInCell ? changes[changes.indexOf(currentChange.change) - 1] : currentChange.change;

					if (change) {
						const index = isFirstChangeInCell ? lastChangeIndex(change) : currentChange.index - 1;
						if (isFirstChangeInCell) {
							this.blur(currentChange.change);
						}
						if (this._revealChange(change, index)) {
							return true;
						}
					}
				}
				break;
			case 'insert':
			case 'delete':
				{
					this.blur(currentChange.change);
					// go to previous change directly
					const prevChange = changes[changes.indexOf(currentChange.change) - 1];
					if (prevChange && this._revealFirstOrLast(prevChange, false)) {
						return true;
					}
				}
				break;
			default:
				break;
		}

		if (wrap) {
			const lastChange = changes[changes.length - 1];
			if (lastChange) {
				return this._revealFirstOrLast(lastChange, false);
			}
		}

		return false;
	}

	enableAccessibleDiffView(): void {
		const cell = this.notebookEditor.getActiveCell()?.model;
		if (cell) {
			const integration = this.cellEditorIntegrations.get(cell)?.integration;
			integration?.enableAccessibleDiffView();
		}
	}

	private getfocusedIntegration(): ChatEditingCodeEditorIntegration | undefined {
		const first = this.notebookEditor.getSelectionViewModels()[0];
		if (first) {
			return this.cellEditorIntegrations.get(first.model)?.integration;
		}
		return undefined;
	}

	async acceptNearestChange(hunk: IModifiedFileEntryChangeHunk | undefined): Promise<void> {
		if (hunk) {
			await hunk.accept();
		} else {
			const current = this.getCurrentChange();
			const focused = this.getfocusedIntegration();
			// delete changes can't be focused
			if (current && !focused || current?.change.type === 'delete') {
				current.change.keep(current?.change.diff.get().changes[current.index]);
			} else if (focused) {
				await focused.acceptNearestChange();
			}

			this._currentIndex.set(this._currentIndex.get() - 1, undefined);
			this.next(true);
		}
	}

	async rejectNearestChange(hunk: IModifiedFileEntryChangeHunk | undefined): Promise<void> {
		if (hunk) {
			await hunk.reject();
		} else {
			const current = this.getCurrentChange();
			const focused = this.getfocusedIntegration();
			// delete changes can't be focused
			if (current && !focused || current?.change.type === 'delete') {
				current.change.undo(current.change.diff.get().changes[current.index]);
			} else if (focused) {
				await focused.rejectNearestChange();
			}

			this._currentIndex.set(this._currentIndex.get() - 1, undefined);
			this.next(true);
		}

	}
	async toggleDiff(_change: IModifiedFileEntryChangeHunk | undefined, _show?: boolean): Promise<void> {
		const diffInput: IResourceDiffEditorInput = {
			original: { resource: this._entry.originalURI },
			modified: { resource: this._entry.modifiedURI },
			label: localize('diff.generic', '{0} (changes from chat)', basename(this._entry.modifiedURI))
		};
		await this._editorService.openEditor(diffInput);

	}
}

export class ChatEditingNotebookDiffEditorIntegration extends Disposable implements IModifiedFileEntryEditorIntegration {
	private readonly _currentIndex = observableValue(this, -1);
	readonly currentIndex: IObservable<number> = this._currentIndex;

	constructor(
		private readonly notebookDiffEditor: INotebookTextDiffEditor,
		private readonly cellChanges: IObservable<ICellDiffInfo[]>
	) {
		super();

		this._store.add(autorun(r => {
			const index = notebookDiffEditor.currentChangedIndex.read(r);
			const numberOfCellChanges = cellChanges.read(r).filter(c => !c.diff.read(r).identical);
			if (numberOfCellChanges.length && index >= 0 && index < numberOfCellChanges.length) {
				// Notebook Diff editor only supports navigating through changes to cells.
				// However in chat we take changes to lines in the cells into account.
				// So if we're on the second cell and first cell has 3 changes, then we're on the 4th change.
				const changesSoFar = countChanges(numberOfCellChanges.slice(0, index + 1));
				this._currentIndex.set(changesSoFar - 1, undefined);
			} else {
				this._currentIndex.set(-1, undefined);
			}
		}));
	}

	reveal(firstOrLast: boolean): void {
		const changes = sortCellChanges(this.cellChanges.get().filter(c => c.type !== 'unchanged'));
		if (!changes.length) {
			return undefined;
		}
		if (firstOrLast) {
			this.notebookDiffEditor.firstChange();
		} else {
			this.notebookDiffEditor.lastChange();
		}
	}

	next(_wrap: boolean): boolean {
		const changes = this.cellChanges.get().filter(c => !c.diff.get().identical).length;
		if (this.notebookDiffEditor.currentChangedIndex.get() === changes - 1) {
			return false;
		}
		this.notebookDiffEditor.nextChange();
		return true;
	}

	previous(_wrap: boolean): boolean {
		const changes = this.cellChanges.get().filter(c => !c.diff.get().identical).length;
		if (this.notebookDiffEditor.currentChangedIndex.get() === changes - 1) {
			return false;
		}
		this.notebookDiffEditor.nextChange();
		return true;
	}

	enableAccessibleDiffView(): void {
		//
	}
	async acceptNearestChange(change: IModifiedFileEntryChangeHunk): Promise<void> {
		await change.accept();
		this.next(true);
	}
	async rejectNearestChange(change: IModifiedFileEntryChangeHunk): Promise<void> {
		await change.reject();
		this.next(true);
	}
	async toggleDiff(_change: IModifiedFileEntryChangeHunk | undefined, _show?: boolean): Promise<void> {
		//
	}
}

function areDocumentDiff2Equal(diff1: IDocumentDiff2, diff2: IDocumentDiff2): boolean {
	if (diff1.changes !== diff2.changes) {
		return false;
	}
	if (diff1.identical !== diff2.identical) {
		return false;
	}
	if (diff1.moves !== diff2.moves) {
		return false;
	}
	if (diff1.originalModel !== diff2.originalModel) {
		return false;
	}
	if (diff1.modifiedModel !== diff2.modifiedModel) {
		return false;
	}
	if (diff1.keep !== diff2.keep) {
		return false;
	}
	if (diff1.undo !== diff2.undo) {
		return false;
	}
	if (diff1.quitEarly !== diff2.quitEarly) {
		return false;
	}
	return true;
}

function lastChangeIndex(change: ICellDiffInfo): number {
	if (change.type === 'modified') {
		return change.diff.get().changes.length - 1;
	}
	return 0;
}
