/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { derivedWithStore, observableFromEvent, observableValue, transaction } from 'vs/base/common/observable';
import { DiffEditorOptions } from 'vs/editor/browser/widget/diffEditor/diffEditorOptions';
import { DiffEditorViewModel } from 'vs/editor/browser/widget/diffEditor/diffEditorViewModel';
import { IDocumentDiffItem, IMultiDiffEditorModel, LazyPromise } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IDiffEditorViewModel } from 'vs/editor/common/editorCommon';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class MultiDiffEditorViewModel extends Disposable {
	private readonly _documents = observableFromEvent(this._model.onDidChange, /** @description MultiDiffEditorViewModel.documents */() => this._model.documents);

	public readonly items = derivedWithStore<readonly DocumentDiffItemViewModel[]>(this,
		(reader, store) => this._documents.read(reader).map(d => store.add(new DocumentDiffItemViewModel(d, this._instantiationService)))
	).recomputeInitiallyAndOnChange(this._store);

	public readonly activeDiffItem = observableValue<DocumentDiffItemViewModel | undefined>(this, undefined);

	public async waitForDiffs(): Promise<void> {
		for (const d of this.items.get()) {
			await d.diffEditorViewModel.waitForDiff();
		}
	}

	public collapseAll(): void {
		transaction(tx => {
			for (const d of this.items.get()) {
				d.collapsed.set(true, tx);
			}
		});
	}

	public expandAll(): void {
		transaction(tx => {
			for (const d of this.items.get()) {
				d.collapsed.set(false, tx);
			}
		});
	}

	constructor(
		private readonly _model: IMultiDiffEditorModel,
		private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}
}

export class DocumentDiffItemViewModel extends Disposable {
	public readonly diffEditorViewModel: IDiffEditorViewModel;
	public readonly collapsed = observableValue<boolean>(this, false);

	constructor(
		public readonly entry: LazyPromise<IDocumentDiffItem>,
		private readonly _instantiationService: IInstantiationService,
	) {
		super();

		function updateOptions(options: IDiffEditorOptions): IDiffEditorOptions {
			return {
				...options,
				hideUnchangedRegions: {
					enabled: true,
				},
			};
		}

		const options = new DiffEditorOptions(updateOptions(this.entry.value!.options || {}));
		if (this.entry.value!.onOptionsDidChange) {
			this._register(this.entry.value!.onOptionsDidChange(() => {
				options.updateOptions(updateOptions(this.entry.value!.options || {}));
			}));
		}

		this.diffEditorViewModel = this._register(this._instantiationService.createInstance(DiffEditorViewModel, {
			original: entry.value!.original!,
			modified: entry.value!.modified!,
		}, options));
	}
}
