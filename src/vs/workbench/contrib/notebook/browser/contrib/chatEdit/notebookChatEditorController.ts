/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../../../base/common/resources.js';
import { Disposable, dispose, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, derived, IObservable, observableFromEvent, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { ICellDiffInfo, IChatEditingService, IModifiedNotebookFileEntry, isTextFileEntry, WorkingSetEntryState } from '../../../../chat/common/chatEditingService.js';
import { ICellViewModel, INotebookEditor, ScrollToRevealBehavior } from '../../notebookBrowser.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { NotebookDeletedCellDecorator, NotebookInsertedCellDecorator } from './notebookCellDecorators.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { localize } from '../../../../../../nls.js';
import { ICell } from '../../../common/notebookCommon.js';
import { nullDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { Event } from '../../../../../../base/common/event.js';
import { ChatEditorControllerBase, IChatEditorController } from '../../../../chat/browser/chatEditorControllerBase.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { parse } from '../../../../../services/notebook/common/notebookDocumentService.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';

export const ctxNotebookHasEditorModification = new RawContextKey<boolean>('chat.hasNotebookEditorModifications', undefined, localize('chat.hasNotebookEditorModifications', "The current Notebook editor contains chat modifications"));

export class NotebookChatEditorController extends Disposable {
	private readonly deletedCellDecorator: NotebookDeletedCellDecorator;
	private readonly insertedCellDecorator: NotebookInsertedCellDecorator;
	private readonly _ctxHasEditorModification: IContextKey<boolean>;
	private readonly _currentChange = observableValue<{ diffInfo: ICellDiffInfo; cellPosition: Position | undefined } | undefined>('currentDiff', undefined);
	public get currentChange() {
		return this._currentChange;
	}
	public readonly entry: IObservable<IModifiedNotebookFileEntry | undefined, unknown>;
	// Super HACK.
	public static readonly OwnedCellEditos = new Map<NotebookChatEditorController, ResourceSet>();

	static get(editor: ICodeEditor): IChatEditorController | null {
		const editorModel = editor.getModel();
		const notebookURI = editorModel ? parse(editorModel.uri)?.notebook : undefined;
		if (!notebookURI || !editorModel) {
			return null;
		}

		for (const [controller, uris] of NotebookChatEditorController.OwnedCellEditos.entries()) {
			if (uris.has(editorModel.uri)) {
				return {
					modelURI: observableValue('modelURI', parse(editorModel.uri)!.notebook),
					initNavigation() {
						return controller.initNavigation();
					},
					openDiff(widget) {
						return controller.openDiff(editorModel.uri, widget);
					},
					revealNext(strict) {
						return controller.revealNext(editorModel.uri, strict);
					},
					revealPrevious(strict) {
						return controller.revealPrevious(editorModel.uri, strict);
					},
					undoNearestChange(closestWidget) {
						return controller.undoNearestChange(editorModel.uri, closestWidget);
					},
				} satisfies IChatEditorController;
			}
		}
		return null;
	}

	constructor(
		private readonly notebookEditor: INotebookEditor,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();
		this._ctxHasEditorModification = ctxNotebookHasEditorModification.bindTo(contextKeyService);
		this.deletedCellDecorator = this._register(instantiationService.createInstance(NotebookDeletedCellDecorator, notebookEditor));
		this.insertedCellDecorator = this._register(instantiationService.createInstance(NotebookInsertedCellDecorator, notebookEditor));
		const notebookModel = observableFromEvent(this.notebookEditor.onDidChangeModel, e => e);
		// We need to render viewzones only when the viewmodel is attached (i.e. list view is ready).
		// https://github.com/microsoft/vscode/issues/234718
		const readyToRenderViewzones = observableValue<boolean>('viewModelAttached', false);
		this._register(Event.once(this.notebookEditor.onDidAttachViewModel)(() => readyToRenderViewzones.set(true, undefined)));
		const decorators = new Map<ICell, NotebookCellChatEditorController>();
		const notebookCellDiffInfo = observableValue<ICellDiffInfo[]>('notebookCellDiffInfo', []);

		// Super HACK.
		this._register(toDisposable(() => {
			NotebookChatEditorController.OwnedCellEditos.delete(this);
		}));
		// Super HACK.
		this._register(autorunWithStore((r, store) => {
			const model = notebookModel.read(r);

			if (model) {
				const cells = new ResourceSet();
				model.cells.forEach(cell => cells.add(cell.uri));
				NotebookChatEditorController.OwnedCellEditos.set(this, cells);

				store.add(Event.debounce(model.onDidChangeContent, () => undefined, 100)(() => {
					const cells = new ResourceSet();
					model.cells.forEach(cell => cells.add(cell.uri));
					NotebookChatEditorController.OwnedCellEditos.set(this, cells);
				}));
			}
		}));

		// this._register(instantiationService.createInstance(NotebookChatActionsOverlayController, notebookEditor, notebookCellDiffInfo, this.deletedCellDecorator));

		const clearDecorators = () => {
			dispose(Array.from(decorators.values()));
			decorators.clear();
			this.deletedCellDecorator.clear();
			this.insertedCellDecorator.clear();
		};

		this._register(toDisposable(() => clearDecorators()));

		const entryObs = this.entry = derived((r) => {
			const session = this._chatEditingService.currentEditingSessionObs.read(r);
			const model = notebookModel.read(r);
			if (!model || !session) {
				return;
			}
			return session.entries.read(r).find(e => isEqual(e.modifiedURI, model.uri) && !isTextFileEntry(e)) as IModifiedNotebookFileEntry | undefined;
		});


		this._register(autorun(r => {
			const entry = entryObs.read(r);
			const model = notebookModel.read(r);
			if (!entry || !model || entry.state.read(r) !== WorkingSetEntryState.Modified) {
				clearDecorators();
			}
		}));

		this._register(autorun(r => {
			// If we have a new entry for the file, then clear old decorators.
			// User could be cycling through different edit sessions (Undo Last Edit / Redo Last Edit).
			entryObs.read(r);
			clearDecorators();
		}));


		this._register(autorun(r => {
			const entry = entryObs.read(r);
			const diffInfo = entry?.cellDiffInfo.read(r);

			notebookCellDiffInfo.set(diffInfo ?? [], undefined);

			// If there's no diff info, then we either accepted or rejected everything.
			if (!diffInfo || diffInfo.every(d => d.type === 'unchanged')) {
				clearDecorators();
				this._ctxHasEditorModification.reset();
			} else {
				this._ctxHasEditorModification.set(true);
			}
		}));

		this._register(autorun(r => {
			const entry = entryObs.read(r);
			const diffInfo = entry?.cellDiffInfo.read(r);
			const model = notebookModel.read(r);
			if (!entry || !diffInfo || !model || !readyToRenderViewzones.read(r)) {
				return;
			}

			const inserted = diffInfo.filter(d => d.type === 'insert');
			if (inserted.length) {
				const cells = inserted.map(d => model.cells.length > d.modifiedCellIndex ? model.cells[d.modifiedCellIndex] : undefined).filter(c => !!c);
				this.insertedCellDecorator.apply(cells);
			}

			if (diffInfo.some(d => d.type === 'delete')) {
				this.deletedCellDecorator.apply(diffInfo, entry.originalModel);
			}
		}));
	}

	private initNavigationInProgress?: boolean;
	public initNavigation() {
		if (this.initNavigationInProgress) {
			return;
		}
		this.initNavigationImpl().finally(() => this.initNavigationInProgress = false);
	}

	private async initNavigationImpl() {
		const diffInfo = this.entry.get()?.cellDiffInfo.get();
		const model = this.notebookEditor.getViewModel();
		if (this._currentChange.get() || !model || !diffInfo) {
			return;
		}
		// Focus the first cell that has a change.
		const firstCellWithChage = diffInfo.find(d => d.type === 'modified');
		if (firstCellWithChage) {
			const cell = model.viewCells[firstCellWithChage.modifiedCellIndex];
			await this.notebookEditor.focusNotebookCell(cell, 'editor', { focusEditorLine: 1 });
			const controller = this.getNotebookChatEditorController(cell.uri);
			controller?.controller.revealNext();
		}
	}
	public async openDiff(cell: URI, widget?: any): Promise<void> {
		this.getNotebookChatEditorController(cell)?.controller.openDiff(widget);
	}
	private getDiffAssociatedWithCell(cellIndex: number) {
		return this.entry.get()?.cellDiffInfo.get().filter(d => d.type === 'modified').find(d => d.modifiedCellIndex === cellIndex);
	}
	public revealNext(cell: URI, strict?: boolean): boolean {
		return this.revealNextPrevious(cell, true, strict);
	}
	public revealPrevious(cell: URI, strict?: boolean): boolean {
		return this.revealNextPrevious(cell, false, strict);
	}
	private revealNextPrevious(cell: URI, next: boolean, strict?: boolean): boolean {
		const info = this.getNotebookChatEditorController(cell);
		if (!info) {
			return false;
		}
		if (next ? info.controller.revealNext(strict) : info.controller.revealPrevious(strict)) {
			const currentPosition = info.controller.currentChange.get();
			const diff = this.getDiffAssociatedWithCell(info.cellIndex);
			if (currentPosition && diff) {
				this._currentChange.set({ diffInfo: diff, cellPosition: currentPosition }, undefined);
			}
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
					const info = this.getNotebookChatEditorController(cell.uri);
					if (info && (next ? info.controller.revealNext(false) : info.controller.revealPrevious(false))) {
						const currentPosition = info.controller.currentChange.get();
						const diff = this.getDiffAssociatedWithCell(info.cellIndex);
						if (currentPosition && diff) {
							this._currentChange.set({ diffInfo: diff, cellPosition: currentPosition }, undefined);
						}
					}

				});
				return true;
			}
		}
		return false;
	}
	public undoNearestChange(cell: URI, closestWidget?: any): void {
		this.getNotebookChatEditorController(cell)?.controller.undoNearestChange(closestWidget);
	}

	public getNotebookChatEditorController(cellURI: URI): { cell: ICellViewModel; cellIndex: number; controller: ChatEditorControllerBase; editor: ICodeEditor } | null {
		const viewModel = this.notebookEditor.getViewModel();
		const codeEditor = this.notebookEditor.codeEditors.find(([cell, e]) => isEqual(cell.uri, cellURI));
		if (!codeEditor?.[1] || !viewModel) {
			return null;
		}
		const cellIndex = viewModel.viewCells.indexOf(codeEditor[0]);
		const controller = NotebookCellChatEditorController.get(codeEditor[1]);
		if (controller) {
			return { cell: codeEditor[0], cellIndex, controller, editor: codeEditor[1] };
		}
		return null;
	}
}

export class NotebookCellChatEditorController extends ChatEditorControllerBase {
	public static readonly ID = 'editor.contrib.notebookChatEditorController';
	static get(editor: ICodeEditor): ChatEditorControllerBase | null {
		const controller = editor.getContribution<NotebookCellChatEditorController>(NotebookCellChatEditorController.ID);
		return controller;
	}

	constructor(
		_editor: ICodeEditor,
		@IInstantiationService _instantiationService: IInstantiationService,
		@IChatEditingService _chatEditingService: IChatEditingService,
		@IEditorService _editorService: IEditorService,
		@ITextModelService private readonly modelService: ITextModelService,
	) {
		super(_editor, _instantiationService, _chatEditingService, _editorService);
		const modelObs = observableFromEvent(_editor.onDidChangeModel, e => _editor.getModel());
		const onDidChangeContent = derived(r => {
			const model = modelObs.read(r);
			if (!model) {
				return observableValue<number>('onDidChange', Date.now());
			}
			return observableFromEvent(this, model.onDidChangeContent.bind(model), () => Date.now());
		}).flatten();
		this._register(autorun(async (r) => {
			const model = modelObs.read(r);
			const notebookUri = model?.uri ? parse(model.uri)?.notebook : undefined;
			if (!model || !notebookUri) {
				return;
			}
			const session = _chatEditingService.currentEditingSessionObs.read(r);
			const entry = session?.entries.read(r).find(e => isEqual(e.modifiedURI, notebookUri) && !isTextFileEntry(e)) as IModifiedNotebookFileEntry | undefined;
			if (!entry) {
				return;
			}
			const cellIndex = entry.modifiedModel.cells.findIndex(c => isEqual(c.uri, model.uri));
			if (cellIndex === -1) {
				return;
			}
			onDidChangeContent.read(r);
			const diffInfo = entry.cellDiffInfo.read(r).filter(d => d.type === 'modified').find(d => d.modifiedCellIndex === cellIndex);
			const originalCellModel = diffInfo ? await this.getCellTextModel(entry.originalModel.cells[diffInfo.originalCellIndex]) : undefined;
			transaction((tx) => {
				if (originalCellModel) {
					this.originalModel.set(originalCellModel, tx);
				}
				this._entry.set(entry, tx);
				this.maxLineNumber.set(diffInfo?.maxLineNumber || 0, tx);
				this.diff.set(diffInfo?.diff || nullDocumentDiff, tx);
			});
		}));
	}
	private async getCellTextModel(cell: ICell): Promise<ITextModel | undefined> {
		if (cell.textModel) {
			return cell.textModel;
		}
		const ref = await this.modelService.createModelReference(cell.uri);
		this._register(ref);
		return cell.textModel || ref.object.textEditorModel;
	}

}
