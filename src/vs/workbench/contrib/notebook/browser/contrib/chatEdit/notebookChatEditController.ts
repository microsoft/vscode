/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../../../base/common/resources.js';
import { Disposable, dispose, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ISettableObservable, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { IChatEditingService, IModifiedNotebookFileEntry, WorkingSetEntryState } from '../../../../chat/common/chatEditingService.js';
import { INotebookEditor, INotebookEditorContribution } from '../../notebookBrowser.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { NotebookDeletedCellDecorator, NotebookInsertedCellDecorator, NotebookCellDiffDecorator } from './notebookCellDecorators.js';
import { INotebookModelSynchronizerFactory, NotebookModelSynchronizerFactory } from './notebookSynchronizer.js';
import { INotebookOriginalModelReferenceFactory, NotebookOriginalModelReferenceFactory } from './notebookOriginalModelRefFactory.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { localize } from '../../../../../../nls.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { INotebookOriginalCellModelFactory, OriginalNotebookCellModelFactory } from './notebookOriginalCellModelFactory.js';
import { ChatEditingNotebookFileSystemProviderContrib } from './chatEditingNotebookFileSytemProviders.js';
import { registerWorkbenchContribution2 } from '../../../../../common/contributions.js';
import { NotebookEditor } from '../../notebookEditor.js';
import { debouncedObservable2 } from '../../../../../../base/common/observableInternal/utils.js';
import { ICell } from '../../../common/notebookCommon.js';
import { IDocumentDiff, nullDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { Event } from '../../../../../../base/common/event.js';

export const ctxNotebookHasEditorModification = new RawContextKey<boolean>('chat.hasNotebookEditorModifications', undefined, localize('chat.hasNotebookEditorModifications', "The current Notebook editor contains chat modifications"));

export class NotebookChatEditorControllerContrib extends Disposable implements INotebookEditorContribution {

	public static readonly ID: string = 'workbench.notebook.chatEditorController';
	readonly _serviceBrand: undefined;
	constructor(
		notebookEditor: INotebookEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,

	) {
		super();
		if (configurationService.getValue<boolean>('notebook.experimental.chatEdits')) {
			this._register(instantiationService.createInstance(NotebookChatEditorController, notebookEditor));
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
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
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
		const onDidChangeVisibleRanges = debouncedObservable2(observableFromEvent(this.notebookEditor.onDidChangeVisibleRanges, () => this.notebookEditor.visibleRanges), 50);
		const decorators = new Map<ICell, NotebookCellDiffDecorator>();

		const clearDecorators = () => {
			dispose(Array.from(decorators.values()));
			decorators.clear();
			this.deletedCellDecorator.clear();
			this.insertedCellDecorator.clear();
		};

		this._register(toDisposable(() => clearDecorators()));

		const entryObs = derived((r) => {
			const session = this._chatEditingService.currentEditingSessionObs.read(r);
			const model = notebookModel.read(r);
			if (!model || !session) {
				return;
			}
			return session.entries.read(r).find(e => isEqual(e.modifiedURI, model.uri) && e.kind === 'notebook') as IModifiedNotebookFileEntry | undefined;
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


		// const notebookCellDiffInfo = notebookDiffInfo.map(d => d?.cellDiff);
		// this._register(instantiationService.createInstance(NotebookChatActionsOverlayController, notebookEditor, notebookCellDiffInfo, this.deletedCellDecorator));

		this._register(autorun(r => {
			const entry = entryObs.read(r);
			const diffInfo = entry?.diffInfo.read(r);
			// If there's no diff info, then we either accepted or rejected everything.
			if (!diffInfo || diffInfo.every(d => d.type === 'unchanged')) {
				clearDecorators();
				this._ctxHasEditorModification.reset();
			} else {
				this._ctxHasEditorModification.set(true);
			}
		}));

		const cellDiffs = new WeakMap<ICell, ISettableObservable<IDocumentDiff>>();
		this._register(autorun(r => {
			const entry = entryObs.read(r);
			const diffInfo = entry?.diffInfo.read(r);
			const model = notebookModel.read(r);
			if (!model || !diffInfo) {
				return;
			}
			model.cells.forEach(cell => {
				if (!cellDiffs.has(cell)) {
					cellDiffs.set(cell, observableValue<IDocumentDiff>(`cellDiff${cell.handle}`, nullDocumentDiff));
				}
			});
			diffInfo.forEach((diff, i) => {
				if (diff.type === 'delete') {
					return;
				}
				const cell = model.cells[diff.modifiedCellIndex];
				const diffObservable = cellDiffs.get(cell) || observableValue<IDocumentDiff>(`cellDiff${cell.handle}`, nullDocumentDiff);
				cellDiffs.set(cell, diffObservable);
				if (diff.type === 'modified') {
					diffObservable.set(diff.diff, undefined);
				} else {
					diffObservable.set(nullDocumentDiff, undefined);
				}
			});
		}));

		this._register(autorun(r => {
			const entry = entryObs.read(r);
			const diffInfo = entry?.diffInfo.read(r);
			onDidChangeVisibleRanges.read(r);

			if (!entry || !diffInfo) {
				return;
			}
			if (entry.state.read(r) !== WorkingSetEntryState.Modified) {
				clearDecorators();
				return;
			}

			const validDiffDecorators = new Set<NotebookCellDiffDecorator>();
			diffInfo.forEach((diff) => {
				if (diff.type === 'modified' && !diff.diff.identical) {
					const modifiedCell = entry.modifiedModel.cells[diff.modifiedCellIndex];
					const diffObservable = cellDiffs.get(modifiedCell);
					const originalCell = entry.originalModel.cells[diff.originalCellIndex];
					const editor = this.notebookEditor.codeEditors.find(([vm,]) => vm.handle === modifiedCell.handle)?.[1];

					if (editor && diffObservable) {
						const currentDecorator = decorators.get(modifiedCell);
						if ((currentDecorator?.modifiedCell !== modifiedCell || currentDecorator?.originalCell !== originalCell || currentDecorator.diff !== diffObservable)) {
							currentDecorator?.dispose();
							const decorator = instantiationService.createInstance(NotebookCellDiffDecorator, notebookEditor, modifiedCell, originalCell, diffObservable as IObservable<IDocumentDiff>);
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
			const diffInfo = entry?.diffInfo.read(r);
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

}

registerNotebookContribution(NotebookChatEditorControllerContrib.ID, NotebookChatEditorControllerContrib);
registerSingleton(INotebookOriginalModelReferenceFactory, NotebookOriginalModelReferenceFactory, InstantiationType.Delayed);
registerSingleton(INotebookModelSynchronizerFactory, NotebookModelSynchronizerFactory, InstantiationType.Delayed);
registerSingleton(INotebookOriginalCellModelFactory, OriginalNotebookCellModelFactory, InstantiationType.Delayed);

registerWorkbenchContribution2(ChatEditingNotebookFileSystemProviderContrib.ID, ChatEditingNotebookFileSystemProviderContrib, { editorTypeId: NotebookEditor.ID });
