/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derivedWithStore, IObservable, ISettableObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { debouncedObservable } from '../../../../../base/common/observableInternal/utils.js';
import { basename } from '../../../../../base/common/resources.js';
import { IDocumentDiff, nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IResourceDiffEditorInput } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { NotebookDeletedCellDecorator } from '../../../notebook/browser/diff/inlineDiff/notebookDeletedCellDecorator.js';
import { NotebookInsertedCellDecorator } from '../../../notebook/browser/diff/inlineDiff/notebookInsertedCellDecorator.js';
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
	diff: IDocumentDiff; // List of all the lines deleted.
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

	private readonly cellEditorIntegrations = new Map<NotebookCellTextModel, { integration: ChatEditingCodeEditorIntegration; diff: ISettableObservable<IDocumentDiff2> }>();

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
				&& cellChanges.read(r).some(c => c.type !== 'unchanged' && c.type !== 'delete')
			) {
				lastModifyingRequestId = _entry.lastModifyingRequestId;
				const firstModifiedCell = cellChanges.read(r).
					filter(c => c.type !== 'unchanged' && c.type !== 'delete').
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
			const changes = cellChanges.read(r).filter(c => c.type !== 'unchanged' && c.type !== 'delete');
			onDidChangeVisibleRanges.read(r);
			if (!changes.length) {
				this.cellEditorIntegrations.forEach(({ diff }) => {
					diff.set({ ...diff.get(), ...nullDocumentDiff }, undefined);
				});
				return;
			}

			const validCells = new Set<NotebookCellTextModel>();
			changes.forEach((diff) => {
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
					this._register(autorun((r) => {
						const current = integration.currentIndex.read(r);
						const indexOfChange = current >= 0 ? this.getIndexOfChange(cell, current) : -1;
						if (indexOfChange >= 0) {
							this._currentIndex.set(indexOfChange, undefined);
						}
					}));
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


		const insertDeleteDecorators = derivedWithStore((r, store) => {
			if (!notebookEdotirViewModelAttached.read(r)) {
				return;
			}

			const insertedCellDecorator = store.add(this.instantiationService.createInstance(NotebookInsertedCellDecorator, this.notebookEditor));
			const deletedCellDecorator = store.add(this.instantiationService.createInstance(NotebookDeletedCellDecorator, this.notebookEditor));

			return {
				insertedCellDecorator,
				deletedCellDecorator
			};
		});

		this._register(autorun(r => {
			const changes = cellChanges.read(r);
			const decorators = insertDeleteDecorators.read(r);
			if (decorators) {
				decorators.insertedCellDecorator.apply(changes);
				decorators.deletedCellDecorator.apply(changes, originalModel);
			}
		}));
	}

	private getIndexOfChange(cell: NotebookCellTextModel, change: number): number {
		if (this.getCurrentCell()?.cell !== cell) {
			return -1;
		}
		const cellIndex = this.notebookModel.cells.findIndex(c => c.handle === cell.handle);
		const indexOfCellChange = this.cellChanges.get().findIndex(c => c.modifiedCellIndex === cellIndex);
		if (indexOfCellChange === -1) {
			return -1;
		}
		// Count all changes upto this cell.
		return countChanges(this.cellChanges.get().slice(0, indexOfCellChange)) + change;
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
		const changes = this.cellChanges.get().filter(c => c.type === 'modified' || c.type === 'insert');
		if (!changes.length) {
			return undefined;
		}
		const index = firstOrLast ?
			changes.reduce((prev, curr) => prev.modifiedCellIndex < curr.modifiedCellIndex ? prev : curr).modifiedCellIndex :
			changes.reduce((prev, curr) => prev.modifiedCellIndex > curr.modifiedCellIndex ? prev : curr).modifiedCellIndex;
		const info = this.getCell(index);
		if (info) {
			this.selectCell(info.cell);
			info.integration.reveal(firstOrLast);
		}
	}

	next(wrap: boolean): boolean {
		const info = this.getCurrentCell();
		if (!info) {
			return false;
		}
		if (info.integration.next(wrap)) {
			return true;
		} else {
			const info = this.getNextCell(true);
			if (info) {
				this.selectCell(info.cell);
				this.selectCell(info.cell);
				info.integration.reveal(true);
				return true;
			}
			return false;
		}
	}
	previous(wrap: boolean): boolean {
		const info = this.getCurrentCell();
		if (!info) {
			return false;
		}
		if (info.integration.previous(wrap)) {
			return true;
		} else {
			const info = this.getNextCell(false);
			if (info) {
				this.selectCell(info.cell);
				info.integration.reveal(false);
				return true;
			}
			return false;
		}
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

export function countChanges(changes: ICellDiffInfo[]): number {
	return changes.reduce((count, diff) => {
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
