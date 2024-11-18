/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { INotebookEditor } from '../notebookBrowser.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ActionRunner, IAction, IActionRunner } from '../../../../../base/common/actions.js';
import { $ } from '../../../../../base/browser/dom.js';
import { IChatEditingService, IModifiedFileEntry } from '../../../chat/common/chatEditingService.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { autorunWithStore, IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { CellDiffInfo } from '../diff/notebookDiffViewModel.js';

export class NotebookChatActionsOverlayController extends Disposable {
	constructor(
		private readonly notebookEditor: INotebookEditor,
		cellDiffInfo: IObservable<CellDiffInfo[] | undefined, unknown>,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const notebookModel = observableFromEvent(this.notebookEditor.onDidChangeModel, e => e);

		this._register(autorunWithStore((r, store) => {
			const session = this._chatEditingService.currentEditingSessionObs.read(r);
			const model = notebookModel.read(r);
			if (!model || !session) {
				return;
			}

			const entries = session.entries.read(r);
			const idx = entries.findIndex(e => isEqual(e.modifiedURI, model.uri));
			if (idx >= 0) {
				const entry = entries[idx];
				const nextEntry = entries[(idx + 1) % entries.length];
				const previousEntry = entries[(idx - 1 + entries.length) % entries.length];
				store.add(instantiationService.createInstance(NotebookChatActionsOverlay, notebookEditor, entry, cellDiffInfo, nextEntry, previousEntry));
			}
		}));
	}
}

// Copied from src/vs/workbench/contrib/chat/browser/chatEditorOverlay.ts (until we unify these)
export class NotebookChatActionsOverlay extends Disposable {
	constructor(
		notebookEditor: INotebookEditor,
		entry: IModifiedFileEntry,
		cellDiffInfo: IObservable<CellDiffInfo[] | undefined, unknown>,
		nextEntry: IModifiedFileEntry,
		previousEntry: IModifiedFileEntry,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		super();
		const toolbarNode = $('div');
		toolbarNode.classList.add('notebook-chat-editor-overlay-widget');
		notebookEditor.getDomNode().appendChild(toolbarNode);

		this._register(toDisposable(() => {
			notebookEditor.getDomNode().removeChild(toolbarNode);
		}));

		const _toolbar = instaService.createInstance(MenuWorkbenchToolBar, toolbarNode, MenuId.ChatEditingEditorContent, {
			telemetrySource: 'chatEditor.overlayToolbar',
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true
			},
			menuOptions: { renderShortTitle: true },
			actionViewItemProvider: (action, options) => {
				const that = this;
				if (action.id === 'chatEditor.action.accept' || action.id === 'chatEditor.action.reject') {
					return new class extends ActionViewItem {
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
								const change = nextEntry.diffInfo.get().changes.at(0);
								return that._editorService.openEditor({
									resource: nextEntry.modifiedURI,
									options: {
										selection: change && Range.fromPositions({ lineNumber: change.original.startLineNumber, column: 1 }),
										revealIfOpened: false,
										revealIfVisible: false,
									}
								}, ACTIVE_GROUP);
							}));

							this._reveal.value = store;
						}
						override get actionRunner(): IActionRunner {
							return super.actionRunner;
						}
					};
				}
				// Override next/previous with our implementation.
				if (action.id === 'chatEditor.action.navigateNext' || action.id === 'chatEditor.action.navigatePrevious') {
					return new class extends ActionViewItem {
						constructor() {
							super(undefined, action, { ...options, icon: true, label: false, keybindingNotRenderedWithLabel: true });
						}
						override set actionRunner(_: IActionRunner) {
							const next = action.id === 'chatEditor.action.navigateNext' ? nextEntry : previousEntry;
							const direction = action.id === 'chatEditor.action.navigateNext' ? 'next' : 'previous';
							super.actionRunner = new NextPreviousChangeActionRunner(notebookEditor, cellDiffInfo, entry, next, direction, _editorService);
						}
						override get actionRunner(): IActionRunner {
							return super.actionRunner;
						}
					};
				}
				return undefined;
			}

		});

		this._register(_toolbar);
	}


}

class NextPreviousChangeActionRunner extends ActionRunner {
	constructor(
		private readonly notebookEditor: INotebookEditor,
		private readonly cellDiffInfo: IObservable<CellDiffInfo[] | undefined, unknown>,
		private readonly entry: IModifiedFileEntry,
		private readonly next: IModifiedFileEntry,
		private readonly direction: 'next' | 'previous',
		private readonly _editorService: IEditorService
	) {
		super();
	}
	protected override async runAction(_action: IAction, _context?: unknown): Promise<void> {
		const viewModel = this.notebookEditor.getViewModel();
		const activeCell = this.notebookEditor.activeCellAndCodeEditor;
		const cellDiff = this.cellDiffInfo.read(undefined);
		if (!viewModel || !activeCell || !cellDiff || !cellDiff.length) {
			return this.goToNextEntry();
		}

		const activeCellIndex = viewModel.viewCells.findIndex(c => c.handle === activeCell[0].handle);
		if (typeof activeCellIndex !== 'number') {
			return this.goToNextEntry();
		}

		let index = this.getNextCellDiff(activeCellIndex, cellDiff);
		if (typeof index === 'number') {
			return this.notebookEditor.focusNotebookCell(viewModel.viewCells[index], 'container');
		}

		if (this.canGoToNextEntry()) {
			return this.goToNextEntry();
		}

		// Cycle through edits in current notebook.
		index = this.getNextCellDiff(this.direction === 'next' ? -1 : viewModel.viewCells.length + 1, cellDiff);
		if (typeof index === 'number') {
			return this.notebookEditor.focusNotebookCell(viewModel.viewCells[index], 'container');
		}
	}

	private getNextCellDiff(currentCellIndex: number, cellDiffInfo: CellDiffInfo[]) {
		if (this.direction === 'next') {
			return cellDiffInfo
				.filter(d => (d.type === 'insert' || d.type === 'modified') && d.modifiedCellIndex > currentCellIndex)
				.map(d => d.type === 'insert' || d.type === 'modified' ? d.modifiedCellIndex : undefined)?.[0];
		} else {
			return cellDiffInfo
				.filter(d => (d.type === 'insert' || d.type === 'modified') && d.modifiedCellIndex < currentCellIndex)
				.reverse()
				.map(d => d.type === 'insert' || d.type === 'modified' ? d.modifiedCellIndex : undefined)?.[0];
		}
	}

	private canGoToNextEntry() {
		return this.entry !== this.next;
	}

	private async goToNextEntry() {
		if (!this.canGoToNextEntry()) {
			return;
		}
		// For now just go to next/previous file.
		const change = this.next.diffInfo.get().changes.at(0);
		await this._editorService.openEditor({
			resource: this.next.modifiedURI,
			options: {
				selection: change && Range.fromPositions({ lineNumber: change.original.startLineNumber, column: 1 }),
				revealIfOpened: false,
				revealIfVisible: false,
			}
		}, ACTIVE_GROUP);
	}
}
