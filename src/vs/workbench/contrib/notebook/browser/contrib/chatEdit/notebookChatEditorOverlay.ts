/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { INotebookEditor, INotebookViewModel } from '../../notebookBrowser.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ActionRunner, IAction } from '../../../../../../base/common/actions.js';
import { ChatEditingSessionState, ICellDiffInfo, IChatEditingService, IModifiedFileEntry, isTextFileEntry, WorkingSetEntryState } from '../../../../chat/common/chatEditingService.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../../services/editor/common/editorService.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { autorun, IObservable, ISettableObservable, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { INotebookDeletedCellDecorator } from './notebookCellDecorators.js';
import { ChatEditorOverlayWidget } from '../../../../chat/browser/chatEditorOverlay.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { NotebookChatEditorControllerContrib } from './notebookChatEditorControllerContrib.js';
import { NotebookChatEditorController } from './notebookChatEditorController.js';

// export class NotebookChatActionsOverlayController extends Disposable {
// 	constructor(
// 		private readonly notebookEditor: INotebookEditor,
// 		ICellDiffInfo: IObservable<ICellDiffInfo[] | undefined, unknown>,
// 		deletedCellDecorator: INotebookDeletedCellDecorator,
// 		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
// 		@IInstantiationService instantiationService: IInstantiationService,
// 	) {
// 		super();

// 		const notebookModel = observableFromEvent(this.notebookEditor.onDidChangeModel, e => e);

// 		// TODO: This seems to be required, without this the next `autorunWithStore`
// 		// doesn't run when the model changes.
// 		this._register(autorun(r => {
// 			notebookModel.read(r);
// 		}));
// 		this._register(autorunWithStore((r, store) => {
// 			const session = this._chatEditingService.currentEditingSessionObs.read(r);
// 			const model = notebookModel.read(r);
// 			if (!model || !session) {
// 				return;
// 			}

// 			const entries = session.entries.read(r);
// 			const idx = entries.findIndex(e => isEqual(e.modifiedURI, model.uri));
// 			if (idx >= 0) {
// 				const entry = entries[idx];
// 				const nextEntry = entries[(idx + 1) % entries.length];
// 				const previousEntry = entries[(idx - 1 + entries.length) % entries.length];
// 				store.add(instantiationService.createInstance(NotebookChatActionsOverlay, notebookEditor, entry, ICellDiffInfo, nextEntry, previousEntry, deletedCellDecorator));
// 			}
// 		}));
// 	}
// }

export class NotebookChatActionsOverlay extends Disposable {
	constructor(
		notebookEditor: INotebookEditor,
		controller: NotebookChatEditorController,
		@IChatEditingService chatEditingService: IChatEditingService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		super();


		const currentChange = observableValue<{ diffInfo: ICellDiffInfo; cellPosition: Position | undefined } | Position | undefined>('currentChange', undefined);
		const widget = this._store.add(instaService.createInstance(ChatEditorOverlayWidget, currentChange, () => notebookEditor.focus(), () => {
			notebookEditor.getViewModel()?.viewCells.forEach(cell => {
				const cellController = controller.getNotebookChatEditorController(cell.uri);
				cellController?.controller.unlockScroll();
			});
		}));
		widget.getDomNode().classList.add('notebook-chat-editor-overlay-widget');

		let added = false;

		const show = () => {
			if (!added) {
				notebookEditor.getDomNode().appendChild(widget.getDomNode());
				added = true;
			}
		};
		const hide = () => {
			if (added) {
				notebookEditor.getDomNode().removeChild(widget.getDomNode());
				added = false;
			}
		};


		const modelObs = observableFromEvent(notebookEditor.onDidChangeModel, e => e);

		let registered = false;
		const registerChangeHandler = () => {
			if (registered) {
				return;
			}
			const controller = NotebookChatEditorControllerContrib.get(notebookEditor);
			if (!controller) {
				return;
			}
			this._store.add(autorun(r => {
				currentChange.set(controller.currentChange.read(r), undefined);
			}));
			registered = true;
		};

		this._store.add(autorun(r => {
			const model = modelObs.read(r);
			const session = chatEditingService.currentEditingSessionObs.read(r);
			registerChangeHandler();
			if (!session || !model) {
				hide();
				return;
			}

			const state = session.state.read(r);
			if (state === ChatEditingSessionState.Disposed) {
				hide();
				return;
			}

			const entries = session.entries.read(r);
			const idx = entries.findIndex(e => isEqual(e.modifiedURI, model.uri));
			if (idx < 0) {
				hide();
				return;
			}

			const isModifyingOrModified = entries.some(e => e.state.read(r) === WorkingSetEntryState.Modified || e.isCurrentlyBeingModified.read(r));
			if (!isModifyingOrModified) {
				hide();
				return;
			}

			const entry = entries[idx];
			widget.show(session, entry, entries[(idx + 1) % entries.length]);
			show();
		}));
		// }
		// this._register(notebookEditor.onDidBlurWidget(() => {
		// 	if (getNotebookEditorFromEditorPane(_editorService.activeEditorPane) !== notebookEditor) {
		// 		this.focusedDiff.set(undefined, undefined);
		// 	}
		// }));
		// this._register(notebookEditor.onDidChangeActiveEditor(e => {
		// 	if (e !== notebookEditor) {
		// 		this.focusedDiff.set(undefined, undefined);
		// 	}
		// }));

		// const toolbarNode = $('div');
		// toolbarNode.classList.add('notebook-chat-editor-overlay-widget');
		// notebookEditor.getDomNode().appendChild(toolbarNode);

		// this._register(toDisposable(() => {
		// 	notebookEditor.getDomNode().removeChild(toolbarNode);
		// }));
		// const focusedDiff = this.focusedDiff;
		// const _toolbar = instaService.createInstance(MenuWorkbenchToolBar, toolbarNode, MenuId.ChatEditingEditorContent, {
		// 	telemetrySource: 'chatEditor.overlayToolbar',
		// 	hiddenItemStrategy: HiddenItemStrategy.Ignore,
		// 	toolbarOptions: {
		// 		primaryGroup: () => true,
		// 		useSeparatorsInPrimaryActions: true
		// 	},
		// 	menuOptions: { renderShortTitle: true },
		// 	actionViewItemProvider: (action, options) => {
		// 		const that = this;
		// 		if (action.id === AcceptAction.ID || action.id === RejectAction.ID) {
		// 			return new class extends ActionViewItem {
		// 				private readonly _reveal = this._store.add(new MutableDisposable());
		// 				constructor() {
		// 					super(undefined, action, { ...options, icon: false, label: true, keybindingNotRenderedWithLabel: true });
		// 				}
		// 				override set actionRunner(actionRunner: IActionRunner) {
		// 					super.actionRunner = actionRunner;

		// 					const store = new DisposableStore();

		// 					store.add(actionRunner.onWillRun(_e => {
		// 						notebookEditor.focus();
		// 					}));
		// 					store.add(actionRunner.onDidRun(e => {
		// 						if (e.action !== this.action) {
		// 							return;
		// 						}
		// 						if (entry === nextEntry) {
		// 							return;
		// 						}
		// 						const change = nextEntry.kind === 'text' ? nextEntry.diffInfo.get().changes.at(0) : undefined;
		// 						return that._editorService.openEditor({
		// 							resource: nextEntry.modifiedURI,
		// 							options: {
		// 								selection: change && Range.fromPositions({ lineNumber: change.original.startLineNumber, column: 1 }),
		// 								revealIfOpened: false,
		// 								revealIfVisible: false,
		// 							}
		// 						}, ACTIVE_GROUP);
		// 					}));

		// 					this._reveal.value = store;
		// 				}
		// 				override get actionRunner(): IActionRunner {
		// 					return super.actionRunner;
		// 				}
		// 			};
		// 		}
		// 		// Override next/previous with our implementation.
		// 		if (action.id === 'chatEditor.action.navigateNext' || action.id === 'chatEditor.action.navigatePrevious') {
		// 			return new class extends ActionViewItem {
		// 				constructor() {
		// 					super(undefined, action, { ...options, icon: true, label: false, keybindingNotRenderedWithLabel: true });
		// 				}
		// 				override set actionRunner(_: IActionRunner) {
		// 					const next = action.id === 'chatEditor.action.navigateNext' ? nextEntry : previousEntry;
		// 					const direction = action.id === 'chatEditor.action.navigateNext' ? 'next' : 'previous';
		// 					super.actionRunner = new NextPreviousChangeActionRunner(notebookEditor, ICellDiffInfo, entry, next, direction, _editorService, deletedCellDecorator, focusedDiff);
		// 				}
		// 				override get actionRunner(): IActionRunner {
		// 					return super.actionRunner;
		// 				}
		// 			};
		// 		}
		// 		return undefined;
		// 	}

		// });

		// this._register(_toolbar);
	}


}

class NextPreviousChangeActionRunner extends ActionRunner {
	constructor(
		private readonly notebookEditor: INotebookEditor,
		private readonly ICellDiffInfo: IObservable<ICellDiffInfo[] | undefined, unknown>,
		private readonly entry: IModifiedFileEntry,
		private readonly next: IModifiedFileEntry,
		private readonly direction: 'next' | 'previous',
		private readonly editorService: IEditorService,
		private readonly deletedCellDecorator: INotebookDeletedCellDecorator,
		private readonly focusedDiff: ISettableObservable<ICellDiffInfo | undefined>
	) {
		super();
	}
	protected override async runAction(_action: IAction, _context?: unknown): Promise<void> {
		const viewModel = this.notebookEditor.getViewModel();
		const activeCell = this.notebookEditor.activeCellAndCodeEditor;
		const cellDiff = this.ICellDiffInfo.read(undefined);
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
	private async focusDiff(diff: ICellDiffInfo, viewModel: INotebookViewModel) {
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
			return true;
		}
		return false;
	}

	private getNextCellDiff(ICellDiffInfo: ICellDiffInfo[], viewModel: INotebookViewModel) {
		const activeCell = this.notebookEditor.activeCellAndCodeEditor;
		const currentCellIndex = activeCell ? viewModel.viewCells.findIndex(c => c.handle === activeCell[0].handle) : (this.direction === 'next' ? 0 : viewModel.viewCells.length - 1);
		if (this.focusedDiff.read(undefined)) {
			const changes = ICellDiffInfo.filter(d => d.type !== 'unchanged');
			const idx = changes.findIndex(d => d === this.focusedDiff.read(undefined));
			if (idx >= 0) {
				const next = this.direction === 'next' ? idx + 1 : idx - 1;
				if (next >= 0 && next < changes.length) {
					return changes[next];
				}
			}
		} else if (this.direction === 'next') {
			let currentIndex = 0;
			let next: ICellDiffInfo | undefined;
			ICellDiffInfo
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
			let previous: ICellDiffInfo | undefined;
			ICellDiffInfo
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

		return this.direction === 'next' ? ICellDiffInfo[0] : ICellDiffInfo[ICellDiffInfo.length - 1];
	}


	private canGoToNextEntry() {
		return this.entry !== this.next;
	}

	private async goToNextEntry() {
		if (!this.canGoToNextEntry()) {
			return;
		}
		// For now just go to next/previous file.
		const change = isTextFileEntry(this.next) ? this.next.diffInfo.get().changes.at(0) : undefined;
		this.focusedDiff.set(undefined, undefined);
		await this.editorService.openEditor({
			resource: this.next.modifiedURI,
			options: {
				selection: change && Range.fromPositions({ lineNumber: change.original.startLineNumber, column: 1 }),
				revealIfOpened: false,
				revealIfVisible: false,
			}
		}, ACTIVE_GROUP);
	}
}
