/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derivedWithStore, IObservable, ISettableObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { debouncedObservable } from '../../../../../base/common/observableInternal/utils.js';
import { basename } from '../../../../../base/common/resources.js';
import { nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IResourceDiffEditorInput } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { NotebookDeletedCellDecorator } from '../../../notebook/browser/diff/inlineDiff/notebookDeletedCellDecorator.js';
import { NotebookInsertedCellDecorator } from '../../../notebook/browser/diff/inlineDiff/notebookInsertedCellDecorator.js';
import { NotebookModifiedCellDecorator } from '../../../notebook/browser/diff/inlineDiff/notebookModifiedCellDecorator.js';
import { INotebookTextDiffEditor } from '../../../notebook/browser/diff/notebookDiffEditorBrowser.js';
import { INotebookEditor } from '../../../notebook/browser/notebookBrowser.js';
import { NotebookCellTextModel } from '../../../notebook/common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../../notebook/common/model/notebookTextModel.js';
import { ChatAgentLocation, IChatAgentService } from '../../common/chatAgents.js';
import { IModifiedFileEntry, IModifiedFileEntryChangeHunk, IModifiedFileEntryEditorIntegration } from '../../common/chatEditingService.js';
import { ChatEditingCodeEditorIntegration, IDocumentDiff2 } from './chatEditingCodeEditorIntegration.js';

/**
 * All entries will contain a IDocumentDiff
 * Even when there are no changes, diff will contain the number of lines in the document.
 * This way we can always calculate the total number of lines in the document.
 */
export type ICellDiffInfo = {
	originalCellIndex: number;
	modifiedCellIndex: number;
	type: 'unchanged';
	diff: IDocumentDiff2; // Null diff Change (property to be consistent with others, also we have a list of all line numbers)
} | {
	originalCellIndex: number;
	modifiedCellIndex: number;
	type: 'modified';
	diff: IDocumentDiff2; // List of the changes.
} |
{
	modifiedCellIndex: undefined;
	originalCellIndex: number;
	type: 'delete';
	diff: IDocumentDiff2; // List of all the lines deleted.
} |
{
	modifiedCellIndex: number;
	originalCellIndex: undefined;
	type: 'insert';
	diff: IDocumentDiff2; // List of all the new lines.
};


export class ChatEditingNotebookEditorIntegration extends Disposable implements IModifiedFileEntryEditorIntegration {
	private readonly _currentIndex = observableValue(this, -1);
	readonly currentIndex: IObservable<number> = this._currentIndex;

	// TODO@DonJayamanne For now we're going to ignore being able to focus on a deleted cell.
	private readonly _currentCell = observableValue<NotebookCellTextModel | undefined>(this, undefined);
	readonly currentCell: IObservable<NotebookCellTextModel | undefined> = this._currentCell;

	private readonly _currentChange = observableValue<{ change: ICellDiffInfo; index: number } | undefined>(this, undefined);
	readonly currentChange: IObservable<{ change: ICellDiffInfo; index: number } | undefined> = this._currentChange;

	private readonly cellEditorIntegrations = new Map<NotebookCellTextModel, { integration: ChatEditingCodeEditorIntegration; diff: ISettableObservable<IDocumentDiff2> }>();

	private readonly insertDeleteDecorators: IObservable<{ insertedCellDecorator: NotebookInsertedCellDecorator; modifiedCellDecorator: NotebookModifiedCellDecorator; deletedCellDecorator: NotebookDeletedCellDecorator } | undefined>;

	constructor(
		private readonly _entry: IModifiedFileEntry,
		private readonly notebookEditor: INotebookEditor,
		private readonly notebookModel: NotebookTextModel,
		originalModel: NotebookTextModel,
		private readonly cellChanges: IObservable<ICellDiffInfo[]>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
	) {
		super();

		const onDidChangeVisibleRanges = debouncedObservable(observableFromEvent(notebookEditor.onDidChangeVisibleRanges, () => notebookEditor.visibleRanges), 50);
		const notebookEdotirViewModelAttached = observableFromEvent(notebookEditor.onDidAttachViewModel, () => notebookEditor.getViewModel());


		// INIT current index when: enabled, not streaming anymore, once per request, and when having changes
		let lastModifyingRequestId: string | undefined;
		this._store.add(autorun(r => {

			if (!_entry.isCurrentlyBeingModifiedBy.read(r)
				&& lastModifyingRequestId !== _entry.lastModifyingRequestId
				&& cellChanges.read(r).some(c => c.type !== 'unchanged' && c.type !== 'delete' && !c.diff.identical && !c.diff.identical)
			) {
				lastModifyingRequestId = _entry.lastModifyingRequestId;
				const firstModifiedCell = cellChanges.read(r).
					filter(c => c.type !== 'unchanged' && c.type !== 'delete').
					filter(c => !c.diff.identical).
					reduce((prev, curr) => curr.modifiedCellIndex < prev ? curr.modifiedCellIndex : prev, Number.MAX_SAFE_INTEGER);
				if (typeof firstModifiedCell !== 'number' || firstModifiedCell === Number.MAX_SAFE_INTEGER) {
					return;
				}
				const activeCell = notebookEditor.getActiveCell();
				const index = activeCell ? notebookModel.cells.findIndex(c => c.handle === activeCell.handle) : firstModifiedCell;
				this._currentCell.set(notebookModel.cells[index], undefined);
			}
		}));

		this._register(autorun(r => {
			const sortedCellChanges = sortCellChanges(cellChanges.read(r));

			const changes = sortedCellChanges.filter(c => c.type !== 'unchanged' && c.type !== 'delete' && !c.diff.identical);
			onDidChangeVisibleRanges.read(r);
			if (!changes.length) {
				this.cellEditorIntegrations.forEach(({ diff }) => {
					diff.set({ ...diff.get(), ...nullDocumentDiff }, undefined);
				});
				return;
			}

			const validCells = new Set<NotebookCellTextModel>();
			changes.forEach((diff) => {
				if (diff.modifiedCellIndex === undefined) {
					return;
				}
				const cell = notebookModel.cells[diff.modifiedCellIndex];
				const editor = notebookEditor.codeEditors.find(([vm,]) => vm.handle === notebookModel.cells[diff.modifiedCellIndex].handle)?.[1];
				if (!editor || !cell) {
					return;
				}
				validCells.add(cell);
				if (this.cellEditorIntegrations.has(cell)) {
					this.cellEditorIntegrations.get(cell)!.diff.set(diff.diff, undefined);
				} else {
					const diff2 = observableValue(`diff${cell.handle}`, diff.diff);
					const integration = this.instantiationService.createInstance(ChatEditingCodeEditorIntegration, _entry, editor, diff2);
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

			// set initial index
			this._currentIndex.set(0, undefined);
			this._revealChange(sortedCellChanges[0]);

			this._register(autorun(r => {
				const currentChange = this.currentChange.read(r);
				if (currentChange) {
					const change = currentChange.change;
					const indexInChange = currentChange.index;
					const diffChangeIndex = sortCellChanges(this.cellChanges.get().filter(c => c.type !== 'unchanged' && !c.diff.identical)).findIndex(c => c === change);

					if (diffChangeIndex !== -1) {
						this._currentIndex.set(diffChangeIndex + indexInChange, undefined);
					}
				} else {
					this._currentIndex.set(-1, undefined);
				}
			}));
		}));

		this.insertDeleteDecorators = derivedWithStore((r, store) => {
			if (!notebookEdotirViewModelAttached.read(r)) {
				return;
			}

			const insertedCellDecorator = store.add(this.instantiationService.createInstance(NotebookInsertedCellDecorator, this.notebookEditor));
			const modifiedCellDecorator = store.add(this.instantiationService.createInstance(NotebookModifiedCellDecorator, this.notebookEditor));
			const deletedCellDecorator = store.add(this.instantiationService.createInstance(NotebookDeletedCellDecorator, this.notebookEditor, {
				className: 'chat-diff-change-content-widget',
				telemetrySource: 'chatEditingNotebookHunk',
				menuId: MenuId.ChatEditingEditorHunk,
				argFactory: (deletedCellIndex: number) => {
					return {
						accept() {
							const entry = cellChanges.get().find(c => c.type === 'delete' && c.originalCellIndex === deletedCellIndex)?.diff;
							if (entry) {
								return entry.keep(entry.changes[0]);
							}
							return Promise.resolve(true);
						},
						reject() {
							const entry = cellChanges.get().find(c => c.type === 'delete' && c.originalCellIndex === deletedCellIndex)?.diff;
							if (entry) {
								return entry.undo(entry.changes[0]);
							}
							return Promise.resolve(true);
						},
					} satisfies IModifiedFileEntryChangeHunk;
				}
			}));

			return {
				insertedCellDecorator,
				modifiedCellDecorator,
				deletedCellDecorator
			};
		});

		this._register(autorun(r => {
			// We can have inserted cells that have been accepted, in those cases we do not wany any decorators on them.
			const changes = cellChanges.read(r).filter(c => c.type === 'insert' ? !c.diff.identical : true);
			const decorators = this.insertDeleteDecorators.read(r);
			if (decorators) {
				decorators.insertedCellDecorator.apply(changes);
				decorators.modifiedCellDecorator.apply(changes);
				decorators.deletedCellDecorator.apply(changes, originalModel);
			}
		}));
	}

	getCurrentCell() {
		const activeCell = this.notebookModel.cells.find(c => c.handle === this.notebookEditor.getActiveCell()?.handle) || this._currentCell.get();
		if (!activeCell) {
			return undefined;
		}
		const index = this.notebookModel.cells.findIndex(c => c.handle === activeCell.handle);
		const integration = this.cellEditorIntegrations.get(activeCell)?.integration;
		return integration ? { integration, index: index, handle: activeCell.handle, cell: activeCell } : undefined;
	}

	selectCell(cell: NotebookCellTextModel) {
		const integration = this.cellEditorIntegrations.get(cell)?.integration;
		if (integration) {
			this._currentCell.set(cell, undefined);
			const cellViewModel = this.notebookEditor.getViewModel()?.viewCells.find(c => c.handle === cell.handle);
			if (cellViewModel) {
				this.notebookEditor.focusNotebookCell(cellViewModel, 'editor');
			}
		}
	}
	getNextCell(nextOrPrevious: boolean) {
		const current = this.getCurrentCell();
		if (!current) {
			// const changes = this.cellChanges.get().filter(c => c.type === 'modified' || c.type !== 'delete');
			// if (!changes.length) {
			// 	return undefined;
			// }
			// return this.getIntegrationForCell(changes[0].modifiedCellIndex);
			return;
		}
		const changes = this.cellChanges.get().filter(c => c.type === 'modified' || c.type === 'insert');
		const nextIndex = changes.reduce((prev, curr) => {
			if (nextOrPrevious) {
				if (typeof curr.modifiedCellIndex !== 'number' || curr.modifiedCellIndex <= current.index) {
					return prev;
				}
				return Math.min(prev, curr.modifiedCellIndex);
			} else {
				if (typeof curr.modifiedCellIndex !== 'number' || curr.modifiedCellIndex >= current.index) {
					return prev;
				}
				return Math.max(prev, curr.modifiedCellIndex);
			}
		}, nextOrPrevious ? Number.MAX_SAFE_INTEGER : -1);
		if (nextIndex === -1 || nextIndex === Number.MAX_SAFE_INTEGER) {
			return undefined;
		}
		return this.getCell(nextIndex);
	}

	getCell(modifiedCellIndex: number) {
		const cell = this.notebookModel.cells[modifiedCellIndex];
		const integration = this.cellEditorIntegrations.get(cell)?.integration;
		return integration ? { integration, index: modifiedCellIndex, handle: cell.handle, cell } : undefined;
	}

	reveal(firstOrLast: boolean): void {
		const changes = sortCellChanges(this.cellChanges.get().filter(c => c.type !== 'unchanged'));
		if (!changes.length) {
			return undefined;
		}
		const change = firstOrLast ? changes[0] : changes[changes.length - 1];
		this._revealChange(change, firstOrLast);
	}

	private _revealChange(change: ICellDiffInfo, firstOrLast?: boolean) {
		switch (change.type) {
			case 'insert':
			case 'modified':
				{
					const cell = this.getCell(change.modifiedCellIndex);
					if (!cell) {
						return false;
					}

					cell.integration.reveal(firstOrLast ?? true);
					this._currentChange.set({ change: change, index: cell.integration.currentIndex.get() }, undefined);

					return true;
				}
			case 'delete':
				// reveal the deleted cell decorator
				this._currentCell.set(undefined, undefined);
				this.insertDeleteDecorators.get()?.deletedCellDecorator.reveal(change.originalCellIndex);
				this._currentChange.set({ change: change, index: 0 }, undefined);
				return true;
			default:
				break;
		}

		return false;
	}

	next(wrap: boolean): boolean {
		const changes = sortCellChanges(this.cellChanges.get().filter(c => c.type !== 'unchanged'));
		const currentChange = this.currentChange.get();
		if (!currentChange) {
			const firstChange = changes[0];

			if (firstChange) {
				this._currentCell.set(undefined, undefined);
				return this._revealChange(firstChange);
			}

			return false;
		}

		// go to next
		// first check if we are at the end of the current change
		switch (currentChange.change.type) {
			case 'modified':
				{
					const currentChangeInfo = this.getCell(currentChange.change.modifiedCellIndex);
					if (!currentChangeInfo) {
						return false;
					}

					if (currentChangeInfo.integration.next(false)) {
						this._currentChange.set({ change: currentChange.change, index: currentChangeInfo.integration.currentIndex.get() }, undefined);
						return true;
					} else {
						const nextChange = changes[changes.indexOf(currentChange.change) + 1];
						if (nextChange) {
							return this._revealChange(nextChange, true);
						}
					}
				}
				break;
			case 'insert':
			case 'delete':
				{
					// go to next change directly
					const nextChange = changes[changes.indexOf(currentChange.change) + 1];
					if (nextChange) {
						return this._revealChange(nextChange, true);
					}
				}
				break;
			default:
				break;
		}

		if (wrap) {
			return this.next(false);
		}

		return false;
	}

	previous(wrap: boolean): boolean {
		const changes = sortCellChanges(this.cellChanges.get().filter(c => c.type !== 'unchanged'));
		const currentChange = this.currentChange.get();
		if (!currentChange) {
			const lastChange = changes[changes.length - 1];
			if (lastChange) {
				this._currentCell.set(undefined, undefined);
				return this._revealChange(lastChange, false);
			}

			return false;
		}

		// go to previous
		// first check if we are at the start of the current change
		switch (currentChange.change.type) {
			case 'modified':
				{
					const currentChangeInfo = this.getCell(currentChange.change.modifiedCellIndex);
					if (!currentChangeInfo) {
						return false;
					}

					if (currentChangeInfo.integration.previous(false)) {
						this._currentChange.set({ change: currentChange.change, index: currentChangeInfo.integration.currentIndex.get() }, undefined);
						return true;
					} else {
						const prevChange = changes[changes.indexOf(currentChange.change) - 1];
						if (prevChange) {
							return this._revealChange(prevChange, false);
						}
					}
				}
				break;
			case 'insert':
			case 'delete':
				{
					// go to previous change directly
					const prevChange = changes[changes.indexOf(currentChange.change) - 1];
					if (prevChange) {
						return this._revealChange(prevChange, false);
					}
				}
				break;
			default:
				break;
		}

		if (wrap) {
			const lastChange = changes[changes.length - 1];
			if (lastChange) {
				return this._revealChange(lastChange, false);
			}
		}

		return false;
	}

	enableAccessibleDiffView(): void {
		this.getCurrentCell()?.integration.enableAccessibleDiffView();
	}
	acceptNearestChange(change: IModifiedFileEntryChangeHunk): void {
		change.accept();
		this.next(true);
	}
	rejectNearestChange(change: IModifiedFileEntryChangeHunk): void {
		change.reject();
		this.next(true);
	}
	async toggleDiff(_change: IModifiedFileEntryChangeHunk | undefined): Promise<void> {
		const defaultAgentName = this._chatAgentService.getDefaultAgent(ChatAgentLocation.EditingSession)?.fullName;
		const diffInput = {
			original: { resource: this._entry.originalURI, options: { selection: undefined } },
			modified: { resource: this._entry.modifiedURI, options: { selection: undefined } },
			label: defaultAgentName
				? localize('diff.agent', '{0} (changes from {1})', basename(this._entry.modifiedURI), defaultAgentName)
				: localize('diff.generic', '{0} (changes from chat)', basename(this._entry.modifiedURI))
		} satisfies IResourceDiffEditorInput;
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
			const numberOfCellChanges = cellChanges.read(r).filter(c => !c.diff.identical);
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
		const changes = this.cellChanges.get().filter(c => !c.diff.identical).length;
		if (this.notebookDiffEditor.currentChangedIndex.get() === changes - 1) {
			return false;
		}
		this.notebookDiffEditor.nextChange();
		return true;
	}

	previous(_wrap: boolean): boolean {
		const changes = this.cellChanges.get().filter(c => !c.diff.identical).length;
		if (this.notebookDiffEditor.currentChangedIndex.get() === changes - 1) {
			return false;
		}
		this.notebookDiffEditor.nextChange();
		return true;
	}

	enableAccessibleDiffView(): void {
		//
	}
	acceptNearestChange(change: IModifiedFileEntryChangeHunk): void {
		change.accept();
		this.next(true);
	}
	rejectNearestChange(change: IModifiedFileEntryChangeHunk): void {
		change.reject();
		this.next(true);
	}
	async toggleDiff(_change: IModifiedFileEntryChangeHunk | undefined): Promise<void> {
		//
	}
}

export function countChanges(changes: ICellDiffInfo[]): number {
	return changes.reduce((count, diff) => {
		// When we accept some of the cell insert/delete the items might still be in the list.
		if (diff.diff.identical) {
			return count;
		}
		switch (diff.type) {
			case 'delete':
				return count + 1; // We want to see 1 deleted entry in the pill for navigation
			case 'insert':
				return count + 1; // We want to see 1 new entry in the pill for navigation
			case 'modified':
				return count + diff.diff.changes.length;
			default:
				return count;
		}
	}, 0);

}

export function sortCellChanges(changes: ICellDiffInfo[]): ICellDiffInfo[] {
	return [...changes].sort((a, b) => {
		// For unchanged and modified, use modifiedCellIndex
		if ((a.type === 'unchanged' || a.type === 'modified') &&
			(b.type === 'unchanged' || b.type === 'modified')) {
			return a.modifiedCellIndex - b.modifiedCellIndex;
		}

		// For delete entries, use originalCellIndex
		if (a.type === 'delete' && b.type === 'delete') {
			return a.originalCellIndex - b.originalCellIndex;
		}

		// For insert entries, use modifiedCellIndex
		if (a.type === 'insert' && b.type === 'insert') {
			return a.modifiedCellIndex - b.modifiedCellIndex;
		}

		if ((a.type === 'delete' && b.type !== 'insert') || (a.type !== 'insert' && b.type === 'delete')) {
			return a.originalCellIndex - b.originalCellIndex;
		}
		// Mixed types: compare based on available indices
		const aIndex = a.type === 'delete' ? a.originalCellIndex :
			(a.type === 'insert' ? a.modifiedCellIndex : a.modifiedCellIndex);
		const bIndex = b.type === 'delete' ? b.originalCellIndex :
			(b.type === 'insert' ? b.modifiedCellIndex : b.modifiedCellIndex);

		return aIndex - bIndex;
	});
}
