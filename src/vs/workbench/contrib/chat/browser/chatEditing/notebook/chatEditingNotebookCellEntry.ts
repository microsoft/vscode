/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IRange } from '../../../../../../editor/common/core/range.js';
import { IDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping } from '../../../../../../editor/common/diff/rangeMapping.js';
import { TextEdit } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { CellEditState } from '../../../../notebook/browser/notebookBrowser.js';
import { INotebookEditorService } from '../../../../notebook/browser/services/notebookEditorService.js';
import { NotebookCellTextModel } from '../../../../notebook/common/model/notebookCellTextModel.js';
import { CellKind } from '../../../../notebook/common/notebookCommon.js';
import { ModifiedFileEntryState } from '../../../common/chatEditingService.js';
import { IChatResponseModel } from '../../../common/chatModel.js';
import { ChatEditingTextModelChangeService } from '../chatEditingTextModelChangeService.js';


/**
 * This is very closely similar to the ChatEditingModifiedDocumentEntry class.
 * Most of the code has been borrowed from there, as a cell is effectively a document.
 * Hence most of the same functionality applies.
 */
export class ChatEditingNotebookCellEntry extends Disposable {
	public get isDisposed(): boolean {
		return this._store.isDisposed;
	}

	public get isEditFromUs(): boolean {
		return this._textModelChangeService.isEditFromUs;
	}

	public get allEditsAreFromUs(): boolean {
		return this._textModelChangeService.allEditsAreFromUs;
	}
	public get diffInfo(): IObservable<IDocumentDiff> {
		return this._textModelChangeService.diffInfo;
	}
	private readonly _maxModifiedLineNumber = observableValue<number>(this, 0);
	readonly maxModifiedLineNumber = this._maxModifiedLineNumber;

	protected readonly _stateObs = observableValue<ModifiedFileEntryState>(this, ModifiedFileEntryState.Modified);
	readonly state: IObservable<ModifiedFileEntryState> = this._stateObs;
	private readonly initialContent: string;
	private readonly _textModelChangeService: ChatEditingTextModelChangeService;
	constructor(
		public readonly notebookUri: URI,
		public readonly cell: NotebookCellTextModel,
		private readonly modifiedModel: ITextModel,
		private readonly originalModel: ITextModel,
		isExternalEditInProgress: (() => boolean) | undefined,
		disposables: DisposableStore,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.initialContent = this.originalModel.getValue();
		this._register(disposables);
		this._textModelChangeService = this._register(this.instantiationService.createInstance(ChatEditingTextModelChangeService, this.originalModel, this.modifiedModel, this.state, isExternalEditInProgress));

		this._register(this._textModelChangeService.onDidAcceptOrRejectAllHunks(action => {
			this.revertMarkdownPreviewState();
			this._stateObs.set(action, undefined);
		}));

		this._register(this._textModelChangeService.onDidUserEditModel(() => {
			const didResetToOriginalContent = this.modifiedModel.getValue() === this.initialContent;
			if (this._stateObs.get() === ModifiedFileEntryState.Modified && didResetToOriginalContent) {
				this._stateObs.set(ModifiedFileEntryState.Rejected, undefined);
			}
		}));

	}

	public hasModificationAt(range: IRange): boolean {
		return this._textModelChangeService.hasHunkAt(range);
	}

	public clearCurrentEditLineDecoration() {
		if (this.modifiedModel.isDisposed()) {
			return;
		}
		this._textModelChangeService.clearCurrentEditLineDecoration();
	}

	async acceptAgentEdits(textEdits: TextEdit[], isLastEdits: boolean, responseModel: IChatResponseModel | undefined): Promise<void> {
		const { maxLineNumber } = await this._textModelChangeService.acceptAgentEdits(this.modifiedModel.uri, textEdits, isLastEdits, responseModel);

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
		return this._textModelChangeService.diffInfo.get().keep(change);
	}

	public async undo(change: DetailedLineRangeMapping): Promise<boolean> {
		return this._textModelChangeService.diffInfo.get().undo(change);
	}
}
