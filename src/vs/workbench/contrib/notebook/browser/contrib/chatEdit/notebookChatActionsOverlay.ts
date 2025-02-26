/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { CellEditState, getNotebookEditorFromEditorPane, INotebookEditor, INotebookViewModel } from '../../notebookBrowser.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { ActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ActionRunner, IAction, IActionRunner } from '../../../../../../base/common/actions.js';
import { $ } from '../../../../../../base/browser/dom.js';
import { IChatEditingService, IModifiedFileEntry } from '../../../../chat/common/chatEditingService.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../../services/editor/common/editorService.js';
import { autorun, autorunWithStore, IObservable, ISettableObservable, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { CellDiffInfo } from '../../diff/notebookDiffViewModel.js';
import { AcceptAction, navigationBearingFakeActionId, RejectAction } from '../../../../chat/browser/chatEditing/chatEditingEditorActions.js';
import { INotebookDeletedCellDecorator } from '../../diff/inlineDiff/notebookDeletedCellDecorator.js';
import { ChatEditingModifiedDocumentEntry } from '../../../../chat/browser/chatEditing/chatEditingModifiedDocumentEntry.js';

export class NotebookChatActionsOverlayController extends Disposable {
	constructor(
		private readonly notebookEditor: INotebookEditor,
		cellDiffInfo: IObservable<CellDiffInfo[] | undefined>,
		deletedCellDecorator: INotebookDeletedCellDecorator,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const notebookModel = observableFromEvent(this.notebookEditor.onDidChangeModel, e => e);

		this._register(autorunWithStore((r, store) => {
			const model = notebookModel.read(r);
			if (!model) {
				return;
			}
			const sessions = this._chatEditingService.editingSessionsObs.read(r);
			const session = sessions.find(s => s.readEntry(model.uri, r));
			const entry = session?.readEntry(model.uri, r);
			if (!session || !entry || !(entry instanceof ChatEditingModifiedDocumentEntry)) {
				return;
			}

			const entries = session.entries.read(r);
			const idx = entries.findIndex(e => isEqual(e.modifiedURI, model.uri));
			if (idx >= 0) {
				const entry = entries[idx];
				const nextEntry = entries[(idx + 1) % entries.length];
				const previousEntry = entries[(idx - 1 + entries.length) % entries.length];
				store.add(instantiationService.createInstance(NotebookChatActionsOverlay, notebookEditor, entry, cellDiffInfo, nextEntry, previousEntry, deletedCellDecorator));
			}
		}));
	}
}

// Copied from src/vs/workbench/contrib/chat/browser/chatEditorOverlay.ts (until we unify these)
export class NotebookChatActionsOverlay extends Disposable {
	private readonly focusedDiff = observableValue<CellDiffInfo | undefined>('focusedDiff', undefined);
	private readonly toolbarNode: HTMLElement;
	private added: boolean = false;
	constructor(
		private readonly notebookEditor: INotebookEditor,
		entry: IModifiedFileEntry,
		cellDiffInfo: IObservable<CellDiffInfo[] | undefined>,
		nextEntry: IModifiedFileEntry,
		previousEntry: IModifiedFileEntry,
		deletedCellDecorator: INotebookDeletedCellDecorator,
		@IEditorService _editorService: IEditorService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		super();

		this._register(notebookEditor.onDidBlurWidget(() => {
			if (getNotebookEditorFromEditorPane(_editorService.activeEditorPane) !== notebookEditor) {
				this.focusedDiff.set(undefined, undefined);
			}
		}));
		this._register(notebookEditor.onDidChangeActiveEditor(e => {
			if (e !== notebookEditor) {
				this.focusedDiff.set(undefined, undefined);
			}
		}));

		this.toolbarNode = $('div');
		this.toolbarNode.classList.add('notebook-chat-editor-overlay-widget');
		this._register(toDisposable(() => this.hide()));

		this._register(autorun(r => {
			const diffs = cellDiffInfo.read(r);
			if (diffs?.some(d => d.type !== 'unchanged')) {
				this.show();
			} else {
				this.hide();
			}
		}));

		const focusedDiff = this.focusedDiff;
		const _toolbar = instaService.createInstance(MenuWorkbenchToolBar, this.toolbarNode, MenuId.ChatEditingEditorContent, {
			telemetrySource: 'chatEditor.overlayToolbar',
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true
			},
			menuOptions: { renderShortTitle: true },
			actionViewItemProvider: (action, options) => {

				if (action.id === navigationBearingFakeActionId) {
					return this._register(new class extends ActionViewItem {
						constructor() {
							super(undefined, action, { ...options, icon: false, label: false, keybindingNotRenderedWithLabel: true });
						}
					});
				}

				if (action.id === AcceptAction.ID || action.id === RejectAction.ID) {
					return this._register(new class extends ActionViewItem {
						private readonly _reveal = this._store.add(new MutableDisposable());
						constructor() {
							super(undefined, action, { ...options, icon: false, label: true, keybindingNotRenderedWithLabel: true });
						}
						override set actionRunner(actionRunner: IActionRunner) {
							super.actionRunner = actionRunner;

							const store = new DisposableStore();

							store.add(actionRunner.onWillRun(_e => {
								notebookEditor.focus();
							}));
							store.add(actionRunner.onDidRun(e => {
								if (e.action !== this.action) {
									return;
								}
								if (entry === nextEntry) {
									return;
								}

							}));

							this._reveal.value = store;
						}
						override get actionRunner(): IActionRunner {
							return super.actionRunner;
						}
					});
				}
				// Override next/previous with our implementation.
				if (action.id === 'chatEditor.action.navigateNext' || action.id === 'chatEditor.action.navigatePrevious') {
					return this._register(new class extends ActionViewItem {
						constructor() {
							super(undefined, action, { ...options, icon: true, label: false, keybindingNotRenderedWithLabel: true });
						}
						override set actionRunner(_: IActionRunner) {
							const next = action.id === 'chatEditor.action.navigateNext' ? nextEntry : previousEntry;
							const direction = action.id === 'chatEditor.action.navigateNext' ? 'next' : 'previous';
							super.actionRunner = this._register(new NextPreviousChangeActionRunner(notebookEditor, cellDiffInfo, entry, next, direction, _editorService, deletedCellDecorator, focusedDiff));
						}
						override get actionRunner(): IActionRunner {
							return super.actionRunner;
						}
					});
				}
				return undefined;
			}

		});

		this._register(_toolbar);
	}

	private show() {
		if (!this.added) {
			this.notebookEditor.getDomNode().appendChild(this.toolbarNode);
			this.added = true;
		}
	}

	private hide() {
		if (this.added) {
			this.notebookEditor.getDomNode().removeChild(this.toolbarNode);
			this.added = false;
		}
	}


}

class NextPreviousChangeActionRunner extends ActionRunner {
	constructor(
		private readonly notebookEditor: INotebookEditor,
		private readonly cellDiffInfo: IObservable<CellDiffInfo[] | undefined>,
		private readonly entry: IModifiedFileEntry,
		private readonly next: IModifiedFileEntry,
		private readonly direction: 'next' | 'previous',
		private readonly editorService: IEditorService,
		private readonly deletedCellDecorator: INotebookDeletedCellDecorator,
		private readonly focusedDiff: ISettableObservable<CellDiffInfo | undefined>
	) {
		super();
	}
	protected override async runAction(_action: IAction, _context?: unknown): Promise<void> {
		const viewModel = this.notebookEditor.getViewModel();
		const activeCell = this.notebookEditor.activeCellAndCodeEditor;
		const cellDiff = this.cellDiffInfo.read(undefined);
		if (!viewModel || !cellDiff?.length || (!activeCell && this.focusedDiff.read(undefined))) {
			return this.goToNextEntry();
		}

		const nextDiff = this.getNextCellDiff(cellDiff, viewModel);
		if (nextDiff && (await this.focusDiff(nextDiff, viewModel))) {
			return;
		}

		return this.goToNextEntry();
	}

	/**
	 * @returns `true` if focused to the next diff
	 */
	private async focusDiff(diff: CellDiffInfo, viewModel: INotebookViewModel) {
		if (diff.type === 'delete') {
			const top = this.deletedCellDecorator.getTop(diff.originalCellIndex);
			if (typeof top === 'number') {
				this.focusedDiff.set(diff, undefined);
				this.notebookEditor.setScrollTop(top);
				return true;
			}
		} else {
			const index = diff.modifiedCellIndex;
			this.focusedDiff.set(diff, undefined);
			await this.notebookEditor.focusNotebookCell(viewModel.viewCells[index], 'container');
			this.notebookEditor.revealInViewAtTop(viewModel.viewCells[index]);
			viewModel.viewCells[index].updateEditState(CellEditState.Editing, 'chatEdit');
			return true;
		}
		return false;
	}

	private getNextCellDiff(cellDiffInfo: CellDiffInfo[], viewModel: INotebookViewModel) {
		const activeCell = this.notebookEditor.activeCellAndCodeEditor;
		const currentCellIndex = activeCell ? viewModel.viewCells.findIndex(c => c.handle === activeCell[0].handle) : (this.direction === 'next' ? 0 : viewModel.viewCells.length - 1);
		if (this.focusedDiff.read(undefined)) {
			const changes = cellDiffInfo.filter(d => d.type !== 'unchanged');
			const idx = changes.findIndex(d => d === this.focusedDiff.read(undefined));
			if (idx >= 0) {
				const next = this.direction === 'next' ? idx + 1 : idx - 1;
				if (next >= 0 && next < changes.length) {
					return changes[next];
				}
			}
		} else if (this.direction === 'next') {
			let currentIndex = 0;
			let next: CellDiffInfo | undefined;
			cellDiffInfo
				.forEach((d, i) => {
					if (next) {
						return;
					}
					if (d.type === 'insert' || d.type === 'modified') {
						if (d.modifiedCellIndex > currentCellIndex) {
							next = d;
						}
						currentIndex = d.modifiedCellIndex;
					} else if (d.type === 'unchanged') {
						currentIndex = d.modifiedCellIndex;
					} else if (currentIndex >= currentCellIndex) {
						next = d;
					}
				});
			if (next) {
				return next;
			}
		} else {
			let currentIndex = 0;
			let previous: CellDiffInfo | undefined;
			cellDiffInfo
				.forEach((d, i) => {
					if (d.type === 'insert' || d.type === 'modified') {
						if (d.modifiedCellIndex < currentCellIndex) {
							previous = d;
						}
						currentIndex = d.modifiedCellIndex;
					} else if (d.type === 'unchanged') {
						currentIndex = d.modifiedCellIndex;
					} else if (currentIndex <= currentCellIndex) {
						previous = d;
					}
				});
			if (previous) {
				return previous;
			}
		}

		if (this.canGoToNextEntry()) {
			return;
		}

		return this.direction === 'next' ? cellDiffInfo[0] : cellDiffInfo[cellDiffInfo.length - 1];
	}


	private canGoToNextEntry() {
		return this.entry !== this.next;
	}

	private async goToNextEntry() {
		if (!this.canGoToNextEntry()) {
			return;
		}
		// For now just go to next/previous file.
		this.focusedDiff.set(undefined, undefined);
		await this.editorService.openEditor({
			resource: this.next.modifiedURI,
			options: {
				revealIfOpened: false,
				revealIfVisible: false,
			}
		}, ACTIVE_GROUP);
	}
}
