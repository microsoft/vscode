/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { derivedWithStore, observableFromEvent, observableValue } from 'vs/base/common/observable';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { IDocumentDiffItem, IMultiDiffEditorModel, LazyPromise } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { IDiffEditorViewModel } from 'vs/editor/common/editorCommon';

export class MultiDiffEditorViewModel extends Disposable {
	private readonly _documents = observableFromEvent(this._model.onDidChange, /** @description MultiDiffEditorViewModel.documents */() => this._model.documents);

	public readonly items = derivedWithStore<readonly DocumentDiffItemViewModel[]>(this,
		(reader, store) => this._documents.read(reader).map(d => store.add(new DocumentDiffItemViewModel(d, this._diffEditorViewModelFactory)))
	).recomputeInitiallyAndOnChange(this._store);

	public readonly activeDiffItem = observableValue<DocumentDiffItemViewModel | undefined>(this, undefined);

	constructor(
		private readonly _model: IMultiDiffEditorModel,
		private readonly _diffEditorViewModelFactory: DiffEditorWidget
	) {
		super();
	}
}

export class DocumentDiffItemViewModel extends Disposable {
	public readonly diffEditorViewModel: IDiffEditorViewModel;

	constructor(
		public readonly entry: LazyPromise<IDocumentDiffItem>,
		diffEditorViewModelFactory: DiffEditorWidget
	) {
		super();

		this.diffEditorViewModel = this._register(diffEditorViewModelFactory.createViewModel({
			original: entry.value!.original!,
			modified: entry.value!.modified!,
		}));
	}
}
