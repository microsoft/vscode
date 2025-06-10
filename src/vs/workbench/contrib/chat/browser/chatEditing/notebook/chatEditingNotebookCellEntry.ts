/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction, autorun } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { StringEdit } from '../../../../../../editor/common/core/edits/stringEdit.js';
import { IDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping } from '../../../../../../editor/common/diff/rangeMapping.js';
import { TextEdit } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { offsetEditFromLineRangeMapping } from '../../../../../../editor/common/model/textModelStringEdit.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { CellEditState } from '../../../../notebook/browser/notebookBrowser.js';
import { INotebookEditorService } from '../../../../notebook/browser/services/notebookEditorService.js';
import { NotebookCellTextModel } from '../../../../notebook/common/model/notebookCellTextModel.js';
import { CellKind } from '../../../../notebook/common/notebookCommon.js';
import { ModifiedFileEntryState } from '../../../common/chatEditingService.js';
import { IChatResponseModel } from '../../../common/chatModel.js';
import { ChatEditingModifiedTextModel } from '../chatEditingModifiedTextModel.js';


/**
 * This is very closely similar to the ChatEditingModifiedDocumentEntry class.
 * Most of the code has been borrowed from there, as a cell is effectively a document.
 * Hence most of the same functionality applies.
 */
export class ChatEditingNotebookCellEntry extends Disposable {
	public get isDisposed(): boolean {
		return this._store.isDisposed;
	}

	private _edit: StringEdit = StringEdit.empty;
	public get isEditFromUs(): boolean {
		return this.modifiedTextModel.isEditFromUs;
	}

	public get allEditsAreFromUs(): boolean {
		return this.modifiedTextModel.allEditsAreFromUs;
	}
	public get diffInfo(): IObservable<IDocumentDiff> {
		return this.modifiedTextModel.diffInfo;
	}
	private readonly _maxModifiedLineNumber = observableValue<number>(this, 0);
	readonly maxModifiedLineNumber = this._maxModifiedLineNumber;

	protected readonly _stateObs = observableValue<ModifiedFileEntryState>(this, ModifiedFileEntryState.Modified);
	readonly state: IObservable<ModifiedFileEntryState> = this._stateObs;
	private readonly initialContent: string;
	private readonly modifiedTextModel: ChatEditingModifiedTextModel;
	constructor(
		public readonly notebookUri: URI,
		public readonly cell: NotebookCellTextModel,
		private readonly modifiedModel: ITextModel,
		private readonly originalModel: ITextModel,
		disposables: DisposableStore,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.initialContent = this.originalModel.getValue();
		this._register(disposables);
		this.modifiedTextModel = this._register(this.instantiationService.createInstance(ChatEditingModifiedTextModel, this.originalModel, this.modifiedModel, this.state));

		this._register(this.modifiedTextModel.onHunkAction(action => {
			this.revertMarkdownPreviewState();
			if (action === 'acceptedAllChanges') {
				this._stateObs.set(ModifiedFileEntryState.Accepted, undefined);
			} else {
				this._stateObs.set(ModifiedFileEntryState.Rejected, undefined);
			}
		}));

		this._register(autorun(r => {
			const diffInfo = this.modifiedTextModel.diffInfo.read(r);
			if (this.state.get() !== ModifiedFileEntryState.Modified) {
				return;
			}
			// If the diff has changed, then recompute the edit
			this._edit = offsetEditFromLineRangeMapping(this.originalModel, this.modifiedModel, diffInfo.changes);
		}));


		this._register(this.modifiedModel.onDidChangeContent(e => {
			this._edit = this.modifiedTextModel.mirrorEdits(e, this._edit);

			if (!this.modifiedTextModel.isEditFromUs) {
				const didResetToOriginalContent = this.modifiedModel.getValue() === this.initialContent;
				if (this._stateObs.get() === ModifiedFileEntryState.Modified && didResetToOriginalContent) {
					this._stateObs.set(ModifiedFileEntryState.Rejected, undefined);
				}
			}
		}));

	}

	public clearCurrentEditLineDecoration() {
		if (this.modifiedModel.isDisposed()) {
			return;
		}
		this.modifiedTextModel.clearCurrentEditLineDecoration();
	}

	async acceptAgentEdits(textEdits: TextEdit[], isLastEdits: boolean, responseModel: IChatResponseModel): Promise<void> {
		const { maxLineNumber } = await this.modifiedTextModel.acceptAgentEdits(this.modifiedModel.uri, textEdits, isLastEdits, responseModel);

		transaction((tx) => {
			if (!isLastEdits) {
				this._stateObs.set(ModifiedFileEntryState.Modified, tx);
				this._maxModifiedLineNumber.set(maxLineNumber, tx);

			} else {
				this._maxModifiedLineNumber.set(0, tx);
			}
		});
	}

	revertMarkdownPreviewState(): void {
		if (this.cell.cellKind !== CellKind.Markup) {
			return;
		}

		const notebookEditor = this.notebookEditorService.retrieveExistingWidgetFromURI(this.notebookUri)?.value;
		if (notebookEditor) {
			const vm = notebookEditor.getCellByHandle(this.cell.handle);
			if (vm?.getEditState() === CellEditState.Editing &&
				(vm.editStateSource === 'chatEdit' || vm.editStateSource === 'chatEditNavigation')) {
				vm?.updateEditState(CellEditState.Preview, 'chatEdit');
			}
		}
	}

	public async keep(change: DetailedLineRangeMapping): Promise<boolean> {
		return this.modifiedTextModel.diffInfo.get().keep(change);
	}

	public async undo(change: DetailedLineRangeMapping): Promise<boolean> {
		return this.modifiedTextModel.diffInfo.get().undo(change);
	}
}
