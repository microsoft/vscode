/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, dispose, IReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, derivedWithStore, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { IChatEditingService, WorkingSetEntryState } from '../../../../chat/common/chatEditingService.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { INotebookEditor, INotebookEditorContribution } from '../../notebookBrowser.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { NotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { NotebookDeletedCellDecorator, NotebookInsertedCellDecorator, NotebookCellDiffDecorator } from './notebookCellDecorators.js';
import { INotebookModelSynchronizerFactory, NotebookModelSynchronizer, NotebookModelSynchronizerFactory } from './notebookSynchronizer.js';
import { INotebookOriginalModelReferenceFactory, NotebookOriginalModelReferenceFactory } from './notebookOriginalModelRefFactory.js';
import { debouncedObservable2 } from '../../../../../../base/common/observableInternal/utils.js';
import { CellDiffInfo } from '../../diff/notebookDiffViewModel.js';
import { NotebookChatActionsOverlayController } from './notebookChatActionsOverlay.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { localize } from '../../../../../../nls.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { INotebookOriginalCellModelFactory, OriginalNotebookCellModelFactory } from './notebookOriginalCellModelFactory.js';
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
		this._register(instantiationService.createInstance(NotebookChatEditorController, notebookEditor));
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
			const session = this._chatEditingService.currentEditingSessionObs.read(r);
			const model = notebookModel.read(r);
			if (!model || !session) {
				return;
			}
			return session.readEntry(model.uri, r);
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
			if (diffInfo && updatedDeletedInsertedDecoratorsOnceBefore && (diffInfo.modelVersion !== modified.versionId)) {
				return;
			}
			updatedDeletedInsertedDecoratorsOnceBefore = true;
			this.insertedCellDecorator.apply(diffInfo.cellDiff);
			this.deletedCellDecorator.apply(diffInfo.cellDiff, original);
		}));
	}

}

registerNotebookContribution(NotebookChatEditorControllerContrib.ID, NotebookChatEditorControllerContrib);
registerSingleton(INotebookOriginalModelReferenceFactory, NotebookOriginalModelReferenceFactory, InstantiationType.Delayed);
registerSingleton(INotebookModelSynchronizerFactory, NotebookModelSynchronizerFactory, InstantiationType.Delayed);
registerSingleton(INotebookOriginalCellModelFactory, OriginalNotebookCellModelFactory, InstantiationType.Delayed);
