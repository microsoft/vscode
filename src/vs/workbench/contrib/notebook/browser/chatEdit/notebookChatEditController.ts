/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../../base/common/resources.js';
import { Disposable, dispose, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { IChatEditingService, WorkingSetEntryState, IModifiedFileEntry } from '../../../chat/common/chatEditingService.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { INotebookEditor, INotebookEditorContribution } from '../notebookBrowser.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { CellDiffInfo } from '../diff/notebookDiffViewModel.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { NotebookCellTextModel } from '../../common/model/notebookCellTextModel.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { NotebookDeletedCellDecorator, NotebookInsertedCellDecorator, NotebookCellDiffDecorator } from './notebookCellDecorators.js';
import { INotebookModelSynchronizerFactory } from './notebookSynronizer.js';
import { INotebookOriginalModelReferenceFactory } from './notebookOriginalModelRefFactory.js';


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
	constructor(
		private readonly notebookEditor: INotebookEditor,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@INotebookOriginalModelReferenceFactory private readonly originalModelRefFactory: INotebookOriginalModelReferenceFactory,
		@INotebookModelSynchronizerFactory private readonly synchronizerFactory: INotebookModelSynchronizerFactory,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.deletedCellDecorator = this._register(instantiationService.createInstance(NotebookDeletedCellDecorator, notebookEditor));
		this.insertedCellDecorator = this._register(instantiationService.createInstance(NotebookInsertedCellDecorator, notebookEditor));
		const notebookModel = observableFromEvent(this.notebookEditor.onDidChangeModel, e => e);
		const entryObs = observableValue<IModifiedFileEntry | undefined>('fileentry', undefined);
		const notebookDiff = observableValue<{ cellDiff: CellDiffInfo[]; modelVersion: number } | undefined>('cellDiffInfo', undefined);
		const originalModel = observableValue<NotebookTextModel | undefined>('originalModel', undefined);
		let updatedCellDecoratorsOnceBefore = false;
		let updatedDeletedInsertedDecoratorsOnceBefore = false;
		this._register(toDisposable(() => {
			disposeDecorators();
		}));
		this._register(autorun(r => {
			const session = this._chatEditingService.currentEditingSessionObs.read(r);
			const model = notebookModel.read(r);
			if (!model || !session) {
				return;
			}
			const entry = session.entries.read(r).find(e => isEqual(e.modifiedURI, model.uri));

			if (!entry || entry.state.read(r) !== WorkingSetEntryState.Modified) {
				disposeDecorators();
				return;
			}
			// If we have a new entry for the file, then clear old decorators.
			// User could be cycling through different edit sessions (Undo Last Edit / Redo Last Edit).
			if (entryObs.read(r) && entryObs.read(r) !== entry) {
				disposeDecorators();
			}
			entryObs.set(entry, undefined);
		}));

		this._register(autorunWithStore(async (r, store) => {
			const entry = entryObs.read(r);
			const model = notebookModel.read(r);
			if (!entry || !model) {
				return;
			}
			const notebookSynchronizer = store.add(this.synchronizerFactory.getOrCreate(model, entry));
			notebookDiff.set(notebookSynchronizer.object.currentDiffInfo, undefined);
			await notebookSynchronizer.object.createSnapshot();
			store.add(notebookSynchronizer.object.onDidChangeDiffInfo(e => {
				notebookDiff.set(e, undefined);
			}));
			store.add(notebookSynchronizer.object.onDidRevert(e => {
				if (e) {
					notebookDiff.set(undefined, undefined);
					disposeDecorators();
					this.deletedCellDecorator.clear();
					this.insertedCellDecorator.clear();
				}
			}));
			store.add(notebookSynchronizer.object.onDidAccept(() => {
				notebookDiff.set(undefined, undefined);
				disposeDecorators();
				this.deletedCellDecorator.clear();
				this.insertedCellDecorator.clear();
			}));
			const result = this._register(await this.originalModelRefFactory.getOrCreate(entry, model.viewType));
			originalModel.set(result.object, undefined);
		}));

		const onDidChangeVisibleRanges = observableFromEvent(this.notebookEditor.onDidChangeVisibleRanges, () => this.notebookEditor.visibleRanges);
		const decorators = new Map<NotebookCellTextModel, { editor: ICodeEditor } & IDisposable>();
		const disposeDecorators = () => {
			dispose(Array.from(decorators.values()));
			decorators.clear();
		};
		this._register(autorun(r => {
			const entry = entryObs.read(r);
			const diffInfo = notebookDiff.read(r);
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
			diffInfo.cellDiff.forEach((diff) => {
				if (diff.type === 'modified') {
					const modifiedCell = modified.cells[diff.modifiedCellIndex];
					const originalCellValue = original.cells[diff.originalCellIndex].getValue();
					const editor = this.notebookEditor.codeEditors.find(([vm,]) => vm.handle === modifiedCell.handle)?.[1];
					if (editor && decorators.get(modifiedCell)?.editor !== editor) {
						decorators.get(modifiedCell)?.dispose();
						const decorator = this.instantiationService.createInstance(NotebookCellDiffDecorator, editor, originalCellValue, modifiedCell.cellKind);
						decorators.set(modifiedCell, decorator);
						this._register(editor.onDidDispose(() => {
							decorator.dispose();
							if (decorators.get(modifiedCell) === decorator) {
								decorators.set(modifiedCell, decorator);
							}
						}));
					}
				}
			});
		}));
		this._register(autorun(r => {
			const entry = entryObs.read(r);
			const diffInfo = notebookDiff.read(r);
			const modified = notebookModel.read(r);
			const original = originalModel.read(r);
			if (!entry || !modified || !original || !diffInfo) {
				return;
			}
			if (diffInfo && updatedDeletedInsertedDecoratorsOnceBefore && (diffInfo.modelVersion !== modified.versionId)) {
				return;
			}
			if (!diffInfo) {
				// User reverted or accepted the changes, hence original === modified.
				this.deletedCellDecorator.clear();
				this.insertedCellDecorator.clear();
				return;
			}
			updatedDeletedInsertedDecoratorsOnceBefore = true;
			this.insertedCellDecorator.apply(diffInfo.cellDiff);
			this.deletedCellDecorator.apply(diffInfo.cellDiff, original);
		}));
	}
}
