/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, dispose, IReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, derivedWithStore, IObservable, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { ChatEditingSessionState, IChatEditingService, IModifiedNotebookFileEntry, IModifiedTextFileEntry, WorkingSetEntryState } from '../../../../chat/common/chatEditingService.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { INotebookEditor, INotebookEditorContribution, ScrollToRevealBehavior } from '../../notebookBrowser.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { NotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { NotebookCellDiffDecorator, NotebookModifiedCellEditorController } from './notebookCellDecorators.js';
import { INotebookModelSynchronizerFactory, NotebookModelSynchronizer } from './notebookSynchronizer.js';
import { INotebookOriginalModelReferenceFactory } from './notebookOriginalModelRefFactory.js';
import { debouncedObservable2 } from '../../../../../../base/common/observableInternal/utils.js';
import { CellDiffInfo } from '../../diff/notebookDiffViewModel.js';
import { NotebookChatActionsOverlayController } from './notebookChatActionsOverlay.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { Event } from '../../../../../../base/common/event.js';
import { ctxNotebookHasEditorModification } from './notebookChatEditContext.js';
import { NotebookDeletedCellDecorator } from '../../diff/inlineDiff/notebookDeletedCellDecorator.js';
import { NotebookInsertedCellDecorator } from '../../diff/inlineDiff/notebookInsertedCellDecorator.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { parse } from '../../../../../services/notebook/common/notebookDocumentService.js';
import { BaseChatEditorController, IChatEditorController } from '../../../../chat/browser/chatEditing/chatEditingBaseEditorController.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { IChatService } from '../../../../chat/common/chatService.js';
import { URI } from '../../../../../../base/common/uri.js';

export class NotebookChatEditorControllerContrib extends Disposable implements INotebookEditorContribution {

	public static readonly ID: string = 'workbench.notebook.chatEditorController';
	readonly _serviceBrand: undefined;
	constructor(
		notebookEditor: INotebookEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,

	) {
		super();
		if (1 >> 1) {
			this._register(instantiationService.createInstance(NotebookChatEditorController, notebookEditor));
		} else {
			this._register(instantiationService.createInstance(NotebookChatEditorController2, notebookEditor));
		}
	}
}


class NotebookChatEditorController extends Disposable {
	private readonly deletedCellDecorator: NotebookDeletedCellDecorator;
	private readonly insertedCellDecorator: NotebookInsertedCellDecorator;
	private readonly _ctxHasEditorModification: IContextKey<boolean>;
	constructor(
		private readonly notebookEditor: INotebookEditor,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@INotebookOriginalModelReferenceFactory private readonly originalModelRefFactory: INotebookOriginalModelReferenceFactory,
		@INotebookModelSynchronizerFactory private readonly synchronizerFactory: INotebookModelSynchronizerFactory,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._ctxHasEditorModification = ctxNotebookHasEditorModification.bindTo(contextKeyService);
		this.deletedCellDecorator = this._register(instantiationService.createInstance(NotebookDeletedCellDecorator, notebookEditor));
		this.insertedCellDecorator = this._register(instantiationService.createInstance(NotebookInsertedCellDecorator, notebookEditor));
		const notebookModel = observableFromEvent(this.notebookEditor.onDidChangeModel, e => e);
		const originalModel = observableValue<NotebookTextModel | undefined>('originalModel', undefined);
		// We need to render viewzones only when the viewmodel is attached (i.e. list view is ready).
		// https://github.com/microsoft/vscode/issues/234718
		const readyToRenderViewzones = observableValue<boolean>('viewModelAttached', false);
		this._register(Event.once(this.notebookEditor.onDidAttachViewModel)(() => readyToRenderViewzones.set(true, undefined)));
		const onDidChangeVisibleRanges = debouncedObservable2(observableFromEvent(this.notebookEditor.onDidChangeVisibleRanges, () => this.notebookEditor.visibleRanges), 50);
		const decorators = new Map<NotebookCellTextModel, NotebookCellDiffDecorator>();

		let updatedCellDecoratorsOnceBefore = false;
		let updatedDeletedInsertedDecoratorsOnceBefore = false;


		const clearDecorators = () => {
			dispose(Array.from(decorators.values()));
			decorators.clear();
			this.deletedCellDecorator.clear();
			this.insertedCellDecorator.clear();
		};

		this._register(toDisposable(() => clearDecorators()));

		let notebookSynchronizer: IReference<NotebookModelSynchronizer>;
		const entryObs = derived((r) => {
			const model = notebookModel.read(r);
			if (!model) {
				return;
			}
			const sessions = this._chatEditingService.editingSessionsObs.read(r);
			return sessions.map(s => s.readEntry(model.uri, r)).find(r => r && r.kind === 'text');
		}).recomputeInitiallyAndOnChange(this._store);


		this._register(autorun(r => {
			const entry = entryObs.read(r);
			const model = notebookModel.read(r);
			if (!entry || !model || entry.state.read(r) !== WorkingSetEntryState.Modified) {
				clearDecorators();
			}
		}));

		const notebookDiffInfo = derivedWithStore(this, (r, store) => {
			const entry = entryObs.read(r);
			const model = notebookModel.read(r);
			if (!entry || !model) {
				// If entry is undefined, then revert the changes to the notebook.
				if (notebookSynchronizer && model) {
					notebookSynchronizer.object.revert();
				}
				return observableValue<{
					cellDiff: CellDiffInfo[];
					modelVersion: number;
				} | undefined>('DefaultDiffIno', undefined);
			}

			notebookSynchronizer = notebookSynchronizer || this._register(this.synchronizerFactory.getOrCreate(model));
			this.originalModelRefFactory.getOrCreate(entry, model.viewType).then(ref => originalModel.set(this._register(ref).object, undefined));

			return notebookSynchronizer.object.diffInfo;
		}).recomputeInitiallyAndOnChange(this._store).flatten();

		const notebookCellDiffInfo = notebookDiffInfo.map(d => d?.cellDiff);
		this._register(instantiationService.createInstance(NotebookChatActionsOverlayController, notebookEditor, notebookCellDiffInfo, this.deletedCellDecorator));

		this._register(autorun(r => {
			// If we have a new entry for the file, then clear old decorators.
			// User could be cycling through different edit sessions (Undo Last Edit / Redo Last Edit).
			entryObs.read(r);
			clearDecorators();
		}));

		this._register(autorun(r => {
			// If there's no diff info, then we either accepted or rejected everything.
			const diffs = notebookDiffInfo.read(r);
			if (!diffs || !diffs.cellDiff.length) {
				clearDecorators();
				this._ctxHasEditorModification.reset();
			} else {
				this._ctxHasEditorModification.set(true);
			}
		}));

		this._register(autorun(r => {
			const entry = entryObs.read(r);
			const diffInfo = notebookDiffInfo.read(r);
			const modified = notebookModel.read(r);
			const original = originalModel.read(r);
			onDidChangeVisibleRanges.read(r);

			if (!entry || !modified || !original || !diffInfo) {
				return;
			}
			if (diffInfo && updatedCellDecoratorsOnceBefore && (diffInfo.modelVersion !== modified.versionId)) {
				return;
			}

			updatedCellDecoratorsOnceBefore = true;
			const validDiffDecorators = new Set<NotebookCellDiffDecorator>();
			diffInfo.cellDiff.forEach((diff) => {
				if (diff.type === 'modified') {
					const modifiedCell = modified.cells[diff.modifiedCellIndex];
					const originalCell = original.cells[diff.originalCellIndex];
					const editor = this.notebookEditor.codeEditors.find(([vm,]) => vm.handle === modifiedCell.handle)?.[1];

					if (editor) {
						const currentDecorator = decorators.get(modifiedCell);
						if ((currentDecorator?.modifiedCell !== modifiedCell || currentDecorator?.originalCell !== originalCell)) {
							currentDecorator?.dispose();
							const decorator = this.instantiationService.createInstance(NotebookCellDiffDecorator, notebookEditor, modifiedCell, originalCell);
							decorators.set(modifiedCell, decorator);
							validDiffDecorators.add(decorator);
							this._register(editor.onDidDispose(() => {
								decorator.dispose();
								if (decorators.get(modifiedCell) === decorator) {
									decorators.delete(modifiedCell);
								}
							}));
						} else if (currentDecorator) {
							validDiffDecorators.add(currentDecorator);
						}
					}
				}
			});

			// Dispose old decorators
			decorators.forEach((v, cell) => {
				if (!validDiffDecorators.has(v)) {
					v.dispose();
					decorators.delete(cell);
				}
			});
		}));

		this._register(autorun(r => {
			const entry = entryObs.read(r);
			const diffInfo = notebookDiffInfo.read(r);
			const modified = notebookModel.read(r);
			const original = originalModel.read(r);
			const ready = readyToRenderViewzones.read(r);
			if (!ready || !entry || !modified || !original || !diffInfo) {
				return;
			}
			if (entry.state.read(r) !== WorkingSetEntryState.Modified) {
				this.insertedCellDecorator.apply([]);
				this.deletedCellDecorator.apply([], original);
				return;
			}
			if (diffInfo && updatedDeletedInsertedDecoratorsOnceBefore && (diffInfo.modelVersion !== modified.versionId)) {
				return;
			}
			updatedDeletedInsertedDecoratorsOnceBefore = true;
			this.insertedCellDecorator.apply(diffInfo.cellDiff);
			this.deletedCellDecorator.apply(diffInfo.cellDiff, original);
		}));
	}

}

export function getNotebookCellChatEditorController(editor: ICodeEditor) {
	return NotebookChatEditorController2.getCellController(editor);
}
export function getNotebookChatEditorController(editor: INotebookEditor) {
	return NotebookChatEditorController2.getNotebookController(editor);
}
class NotebookChatEditorController2 extends Disposable {
	private readonly deletedCellDecorator: NotebookDeletedCellDecorator;
	private readonly insertedCellDecorator: NotebookInsertedCellDecorator;
	private readonly _ctxHasEditorModification: IContextKey<boolean>;
	private readonly ownedCells = new ResourceSet();
	private readonly entry: IObservable<IModifiedNotebookFileEntry | undefined>;
	public static readonly OwnedCells = new Map<NotebookChatEditorController2, ResourceSet>();
	private readonly cellEditorDecorators = new Map<IModifiedTextFileEntry, BaseChatEditorController>();
	static getNotebookController(editor: INotebookEditor): NotebookChatEditorController2 | null {
		for (const [controller,] of NotebookChatEditorController2.OwnedCells.entries()) {
			if (editor === controller.notebookEditor) {
				return controller;
			}
		}
		return null;
	}
	static getCellController(editor: ICodeEditor): IChatEditorController | null {
		const editorModel = editor.getModel();
		if (!editorModel) {
			return null;
		}
		const notebookURI = parse(editorModel.uri)?.notebook;
		if (!notebookURI) {
			return null;
		}

		for (const [controller, uris] of NotebookChatEditorController2.OwnedCells.entries()) {
			if (uris.has(editorModel.uri)) {
				return {
					// modelURI: observableValue('modelURI', parse(editorModel.uri)!.notebook),
					initNavigation() {
						// return controller.initNavigation();
					},
					unlockScroll(): void {
						return controller.unlockScroll(editorModel.uri);
					},
					toggleDiff(widget) {
						return controller.toggleDiff(editorModel.uri, widget);
					},
					revealNext(strict) {
						return controller.revealNext(editorModel.uri, strict);
					},
					revealPrevious(strict) {
						return controller.revealPrevious(editorModel.uri, strict);
					},
					rejectNearestChange(closestWidget) {
						return controller.rejectNearestChange(editorModel.uri, closestWidget);
					},
					acceptNearestChange(closestWidget) {
						return controller.acceptNearestChange(editorModel.uri, closestWidget);
					}
				} satisfies IChatEditorController;
			}
		}
		return null;
	}

	private readonly useInlineDiffEditor = true;
	constructor(
		private readonly notebookEditor: INotebookEditor,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService chatService: IChatService,
	) {
		super();

		NotebookChatEditorController2.OwnedCells.set(this, this.ownedCells);
		this._register(toDisposable(() => NotebookChatEditorController2.OwnedCells.delete(this)));


		this._ctxHasEditorModification = ctxNotebookHasEditorModification.bindTo(contextKeyService);
		this.deletedCellDecorator = this._register(instantiationService.createInstance(NotebookDeletedCellDecorator, notebookEditor));
		this.insertedCellDecorator = this._register(instantiationService.createInstance(NotebookInsertedCellDecorator, notebookEditor));
		const notebookModel = observableFromEvent(this.notebookEditor.onDidChangeModel, e => e);
		const originalModel = observableValue<NotebookTextModel | undefined>('originalModel', undefined);
		// We need to render viewzones only when the viewmodel is attached (i.e. list view is ready).
		// https://github.com/microsoft/vscode/issues/234718
		const readyToRenderViewzones = observableValue<boolean>('viewModelAttached', false);
		this._register(Event.once(this.notebookEditor.onDidAttachViewModel)(() => readyToRenderViewzones.set(true, undefined)));
		const decorators = new Map<NotebookCellTextModel, NotebookCellDiffDecorator>();
		const modelObs = observableFromEvent(notebookEditor.onDidChangeModel, e => e);
		// let updatedDeletedInsertedDecoratorsOnceBefore = false;
		const onDidChangeVisibleRanges = debouncedObservable2(observableFromEvent(notebookEditor.onDidChangeVisibleRanges, () => notebookEditor.visibleRanges), 10);

		const clearDecorators = () => {
			dispose(Array.from(decorators.values()));
			decorators.clear();
			this.deletedCellDecorator.clear();
			this.insertedCellDecorator.clear();
		};

		this._register(toDisposable(() => clearDecorators()));

		const sessionEntry = derived(this, r => {
			const sessions = this._chatEditingService.editingSessionsObs.read(r);
			const model = modelObs.read(r);
			if (!model) {
				return;
			}
			const session = sessions.find(s => s.entries.read(r).some(e => isEqual(e.modifiedURI, model.uri)));
			if (!session) {
				return;
			}
			const chatModel = chatService.getSession(session.chatSessionId);
			if (!chatModel) {
				return;
			}
			const entry = session.entries.read(r).find(e => isEqual(e.modifiedURI, model.uri)) as IModifiedNotebookFileEntry;
			if (!entry) {
				return;
			}
			return { session, entry, chatModel };
		});

		this.entry = sessionEntry.map(e => e?.entry);

		this._register(autorun(r => {
			const entry = sessionEntry.read(r)?.entry;
			const model = notebookModel.read(r);
			if (!entry || !model || entry.state.read(r) !== WorkingSetEntryState.Modified) {
				clearDecorators();
			}
		}));

		const notebookCellDiffInfo = derived(r => {
			const entry = sessionEntry.read(r)?.entry;
			return entry ? entry.cellDiffInfo.read(r) : [];
		});

		this._register(instantiationService.createInstance(NotebookChatActionsOverlayController, notebookEditor, notebookCellDiffInfo, this.deletedCellDecorator));

		this._register(autorun(r => {
			// If we have a new entry for the file, then clear old decorators.
			// User could be cycling through different edit sessions (Undo Last Edit / Redo Last Edit).
			sessionEntry.read(r);
			clearDecorators();
		}));

		this._register(autorun(r => {
			// If there's no diff info, then we either accepted or rejected everything.
			const diffs = notebookCellDiffInfo.read(r);
			if (!diffs || !diffs.length) {
				clearDecorators();
				this._ctxHasEditorModification.reset();
			} else {
				this._ctxHasEditorModification.set(true);
			}
		}));


		this._register(autorun(r => {
			const entry = sessionEntry.read(r)?.entry;
			const diffInfo = notebookCellDiffInfo.read(r);
			const modified = notebookModel.read(r);
			const original = originalModel.read(r);
			const ready = readyToRenderViewzones.read(r);
			if (!ready || !entry || !modified || !original || !diffInfo) {
				return;
			}
			if (entry.state.read(r) !== WorkingSetEntryState.Modified) {
				this.insertedCellDecorator.apply([]);
				this.deletedCellDecorator.apply([], original);
				return;
			}
			// updatedDeletedInsertedDecoratorsOnceBefore = true;
			this.insertedCellDecorator.apply(diffInfo);
			this.deletedCellDecorator.apply(diffInfo, original);
		}));

		const shouldBeReadOnly = derived(this, r => {
			const session = sessionEntry.read(r)?.session;
			return session?.state.read(r) === ChatEditingSessionState.StreamingEdits;
		});

		this._register(autorun(r => {
			if (!this.useInlineDiffEditor) {
				return;
			}
			const entry = sessionEntry.read(r)?.entry;
			const modified = notebookModel.read(r);
			const original = originalModel.read(r);
			if (modified && original && entry?.state.read(r) === WorkingSetEntryState.Modified) {
				notebookEditor.notebookOptions.previousModelToCompare.set(original, undefined);
			} else {
				notebookEditor.notebookOptions.previousModelToCompare.set(undefined, undefined);
			}
		}));

		if (this.useInlineDiffEditor) {
			// // ---- readonly while streaming
			// let actualOptions: IEditorOptions | undefined;

			// this._register(autorun(r => {
			// 	const value = shouldBeReadOnly.read(r);
			// 	if (value) {

			// 		actualOptions ??= {
			// 			readOnly: notebookEditor.getOption(EditorOption.readOnly),
			// 			renderValidationDecorations: this._editor.getOption(EditorOption.renderValidationDecorations),
			// 			stickyScroll: this._editor.getOption(EditorOption.stickyScroll)
			// 		};

			// 		this._editor.updateOptions({
			// 			readOnly: true,
			// 			renderValidationDecorations: 'off',
			// 			stickyScroll: { enabled: false }
			// 		});
			// 	} else {
			// 		if (actualOptions !== undefined) {
			// 			this._editor.updateOptions(actualOptions);
			// 			actualOptions = undefined;
			// 		}
			// 	}
			// }));
		}


		const visibleCellEditors = derived((r) => {
			const entry = sessionEntry.read(r)?.entry;
			if (!entry) {
				return [];
			}
			onDidChangeVisibleRanges.read(r);
			const entries = entry.entries.read(r);
			return notebookEditor.codeEditors.map(([vm, e]) => {
				const index = notebookEditor.getCellIndex(vm);
				if (typeof index !== 'number' || index < 0) {
					return;
				}
				const fileEntry = entries.find(e => e.cellIndex === index);
				if (!fileEntry) {
					return;
				}
				return [e, fileEntry];
			}).filter(item => !!item) as [ICodeEditor, IModifiedTextFileEntry][];
		});

		if (!this.useInlineDiffEditor) {
			this._register(autorun((r) => {
				const info = sessionEntry.read(r);
				if (!info) {
					return;
				}
				const cellEditors = visibleCellEditors.read(r);
				const validEntries = new Set<IModifiedTextFileEntry>();
				cellEditors.forEach(([editor, fileEntry]) => {
					validEntries.add(fileEntry);
					if (this.cellEditorDecorators.has(fileEntry)) {
						return;
					}
					this.ownedCells.add(fileEntry.modifiedURI);
					const cellDecorator = this._register(instantiationService.createInstance(NotebookModifiedCellEditorController, editor, fileEntry, shouldBeReadOnly, info.session, info.chatModel));
					this.cellEditorDecorators.set(fileEntry, cellDecorator);
				});

				this.cellEditorDecorators.forEach((v, fileEntry) => {
					if (!validEntries.has(fileEntry)) {
						this.ownedCells.delete(fileEntry.modifiedURI);
						v.dispose();
						this.cellEditorDecorators.delete(fileEntry);
					}
				});
			}));

			this._register(autorun(r => {
				const entry = this.entry.read(r);
				const cellDiffInfo = entry?.cellDiffInfo?.read(r);
				if (!cellDiffInfo || !entry) {
					return;
				}

				if (entry.state.read(r) !== WorkingSetEntryState.Modified) {
					this.insertedCellDecorator.apply([]);
					this.deletedCellDecorator.apply([], entry.originalModel as NotebookTextModel);
					return;
				}

				this.insertedCellDecorator.apply(cellDiffInfo);
				this.deletedCellDecorator.apply(cellDiffInfo, entry.originalModel as NotebookTextModel);
			}));
		}
	}

	public unlockScroll(cell?: URI): void {
		if (cell) {
			this.getNotebookChatEditorController(cell)?.controller.unlockScroll();
		} else {
			this.ownedCells.forEach(cell => this.getNotebookChatEditorController(cell)?.controller.unlockScroll());
		}
	}
	public async toggleDiff(cell: URI, widget: any | undefined): Promise<void> {
		await this.getNotebookChatEditorController(cell)?.controller.toggleDiff(widget);
	}
	public revealNext(cell: URI, strict?: boolean): boolean {
		return this.revealNextPrevious(cell, true, strict);
	}
	public revealPrevious(cell: URI, strict?: boolean): boolean {
		return this.revealNextPrevious(cell, false, strict);
	}
	rejectNearestChange(cell: URI, closestWidget: any | undefined) {
		this.getNotebookChatEditorController(cell)?.controller.rejectNearestChange(closestWidget);
	}
	acceptNearestChange(cell: URI, closestWidget: any | undefined) {
		this.getNotebookChatEditorController(cell)?.controller.acceptNearestChange(closestWidget);
	}

	private revealNextPrevious(cell: URI, next: boolean, strict?: boolean): boolean {
		const info = this.getNotebookChatEditorController(cell);
		if (!info) {
			return false;
		}
		if (next ? info.controller.revealNext(strict) : info.controller.revealPrevious(strict)) {
			// const currentPosition = info.controller.currentChange.get();
			// const diff = this.getDiffAssociatedWithCell(info.cellIndex);
			// if (currentPosition && diff) {
			// 	this._currentChange.set({ diffInfo: diff, cellPosition: currentPosition }, undefined);
			// }
			return true;
		}
		// Focus the change in the next cell.
		const nextCellWithChange = next ? this.entry.get()?.cellDiffInfo.get()?.find(d => d.type === 'modified' && d.modifiedCellIndex > info.cellIndex) :
			this.entry.get()?.cellDiffInfo.get().slice().reverse().find(d => d.type === 'modified' && d.modifiedCellIndex < info.cellIndex);
		if (nextCellWithChange?.type === 'modified') {
			const cell = this.notebookEditor.getViewModel()?.viewCells[nextCellWithChange.modifiedCellIndex];
			if (cell) {
				// Ensure to set focus to the first line, as first line could be what has the changes.
				const focusEditorLine = next ? 1 : cell.textBuffer.getLineCount();
				this.notebookEditor.focusNotebookCell(cell, 'editor', { focusEditorLine, revealBehavior: ScrollToRevealBehavior.fullCell }).then(() => {
					// const info = this.getNotebookChatEditorController(cell.uri);
					// if (info && (next ? info.controller.revealNext(false) : info.controller.revealPrevious(false))) {
					// 	const currentPosition = info.controller.currentChange.get();
					// 	const diff = this.getDiffAssociatedWithCell(info.cellIndex);
					// 	if (currentPosition && diff) {
					// 		this._currentChange.set({ diffInfo: diff, cellPosition: currentPosition }, undefined);
					// 	}
					// }

				});
				return true;
			}
		}
		return false;
	}

	// private getDiffAssociatedWithCell(cellIndex: number) {
	// 	return this.entry.get()?.cellDiffInfo.get().filter(d => d.type === 'modified').find(d => d.modifiedCellIndex === cellIndex);
	// }

	private getNotebookChatEditorController(cellURI: URI): { cellIndex: number; controller: IChatEditorController } | null {
		const viewModel = this.notebookEditor.getViewModel();
		const codeEditor = this.notebookEditor.codeEditors.find(([cell, e]) => isEqual(cell.uri, cellURI));
		if (!codeEditor || !viewModel) {
			return null;
		}
		const cellIndex = viewModel.viewCells.indexOf(codeEditor[0]);
		const controller = Array.from(this.cellEditorDecorators.entries()).find(([entry,]) => isEqual(entry.modifiedURI, cellURI))?.[1];
		if (controller) {
			return { cellIndex, controller };
		}
		return null;
	}

}

/**
 * Knwon problems
 * 1. Make changes to a few cells, we get to see empty files in the editor like inline chat.
 * In inline chat when we make changes to multiple cells, te other cell changes are previewed
 * in the editor as `Cell 1 > Text` and `Cell 2 > Text`. And chagnes are in the actual cell itself.
 * Sometimes we get those exact same changes with this new approach as well
 * 2. Change numbvers, 1 of 3 not showing up.
 * 3. When navigating through the changes, the edit is focused but not the change.
 * I.e. we're not setting focus to the editor line.
 */
