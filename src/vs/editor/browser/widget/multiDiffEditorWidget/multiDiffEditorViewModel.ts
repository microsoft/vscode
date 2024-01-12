/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { observableFromEvent, observableValue, transaction } from 'vs/base/common/observable';
import { mapObservableArrayCached } from 'vs/base/common/observableInternal/utils';
import { DiffEditorOptions } from 'vs/editor/browser/widget/diffEditor/diffEditorOptions';
import { DiffEditorViewModel } from 'vs/editor/browser/widget/diffEditor/diffEditorViewModel';
import { IDocumentDiffItem, IMultiDiffEditorModel, LazyPromise } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Selection } from 'vs/editor/common/core/selection';
import { IDiffEditorViewModel } from 'vs/editor/common/editorCommon';
import { ContextKeyValue } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class MultiDiffEditorViewModel extends Disposable {
	private readonly _documents = observableFromEvent(this.model.onDidChange, /** @description MultiDiffEditorViewModel.documents */() => this.model.documents);

	public readonly items = mapObservableArrayCached(this, this._documents, (d, store) => store.add(new DocumentDiffItemViewModel(d, this._instantiationService)))
		.recomputeInitiallyAndOnChange(this._store);

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

	public get contextKeys(): Record<string, ContextKeyValue> | undefined {
		return this.model.contextKeys;
	}

	constructor(
		public readonly model: IMultiDiffEditorModel,
		private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}
}

export class DocumentDiffItemViewModel extends Disposable {
	public readonly diffEditorViewModel: IDiffEditorViewModel;
	public readonly collapsed = observableValue<boolean>(this, false);

	public readonly lastTemplateData = observableValue<{ contentHeight: number; selections: Selection[] | undefined }>(
		this,
		{ contentHeight: 500, selections: undefined, }
	);

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

	public getKey(): string {
		return JSON.stringify([
			this.diffEditorViewModel.model.original.uri.toString(),
			this.diffEditorViewModel.model.modified.uri.toString()
		]);
	}
}
