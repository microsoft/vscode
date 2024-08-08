/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, ITransaction, derived, observableValue, transaction } from 'vs/base/common/observable';
import { constObservable, derivedObservableWithWritableCache, mapObservableArrayCached, observableFromValueWithChangeEvent } from 'vs/base/common/observableInternal/utils';
import { URI } from 'vs/base/common/uri';
import { DiffEditorOptions } from 'vs/editor/browser/widget/diffEditor/diffEditorOptions';
import { DiffEditorViewModel } from 'vs/editor/browser/widget/diffEditor/diffEditorViewModel';
import { RefCounted } from 'vs/editor/browser/widget/diffEditor/utils';
import { IDocumentDiffItem, IMultiDiffEditorModel } from 'vs/editor/browser/widget/multiDiffEditor/model';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Selection } from 'vs/editor/common/core/selection';
import { IDiffEditorViewModel } from 'vs/editor/common/editorCommon';
import { IModelService } from 'vs/editor/common/services/model';
import { ContextKeyValue } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class MultiDiffEditorViewModel extends Disposable {
	private readonly _documents: IObservable<readonly RefCounted<IDocumentDiffItem>[]> = observableFromValueWithChangeEvent(this.model, this.model.documents);

	public readonly items: IObservable<readonly DocumentDiffItemViewModel[]> = mapObservableArrayCached(
		this,
		this._documents,
		(d, store) => store.add(this._instantiationService.createInstance(DocumentDiffItemViewModel, d, this))
	)
		.recomputeInitiallyAndOnChange(this._store);

	public readonly focusedDiffItem = derived(this, reader => this.items.read(reader).find(i => i.isFocused.read(reader)));
	public readonly activeDiffItem = derivedObservableWithWritableCache<DocumentDiffItemViewModel | undefined>(this, (reader, lastValue) => this.focusedDiffItem.read(reader) ?? lastValue);

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
	/**
	 * The diff editor view model keeps its inner objects alive.
	*/
	public readonly diffEditorViewModelRef: RefCounted<IDiffEditorViewModel>;
	public get diffEditorViewModel(): IDiffEditorViewModel {
		return this.diffEditorViewModelRef.object;
	}
	public readonly collapsed = observableValue<boolean>(this, false);

	public readonly lastTemplateData = observableValue<{ contentHeight: number; selections: Selection[] | undefined }>(
		this,
		{ contentHeight: 500, selections: undefined, }
	);

	public get originalUri(): URI | undefined { return this.documentDiffItem.original?.uri; }
	public get modifiedUri(): URI | undefined { return this.documentDiffItem.modified?.uri; }

	public readonly isActive: IObservable<boolean> = derived(this, reader => this._editorViewModel.activeDiffItem.read(reader) === this);

	private readonly _isFocusedSource = observableValue<IObservable<boolean>>(this, constObservable(false));
	public readonly isFocused = derived(this, reader => this._isFocusedSource.read(reader).read(reader));

	public setIsFocused(source: IObservable<boolean>, tx: ITransaction | undefined): void {
		this._isFocusedSource.set(source, tx);
	}

	private readonly documentDiffItemRef: RefCounted<IDocumentDiffItem>;
	public get documentDiffItem(): IDocumentDiffItem {
		return this.documentDiffItemRef.object;
	}

	public readonly isAlive = observableValue<boolean>(this, true);

	constructor(
		documentDiffItem: RefCounted<IDocumentDiffItem>,
		private readonly _editorViewModel: MultiDiffEditorViewModel,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
	) {
		super();

		this._register(toDisposable(() => {
			this.isAlive.set(false, undefined);
		}));

		this.documentDiffItemRef = this._register(documentDiffItem.createNewRef(this));

		function updateOptions(options: IDiffEditorOptions): IDiffEditorOptions {
			return {
				...options,
				hideUnchangedRegions: {
					enabled: true,
				},
			};
		}

		const options = this._instantiationService.createInstance(DiffEditorOptions, updateOptions(this.documentDiffItem.options || {}));
		if (this.documentDiffItem.onOptionsDidChange) {
			this._register(this.documentDiffItem.onOptionsDidChange(() => {
				options.updateOptions(updateOptions(this.documentDiffItem.options || {}));
			}));
		}

		const diffEditorViewModelStore = new DisposableStore();
		const originalTextModel = this.documentDiffItem.original ?? diffEditorViewModelStore.add(this._modelService.createModel('', null));
		const modifiedTextModel = this.documentDiffItem.modified ?? diffEditorViewModelStore.add(this._modelService.createModel('', null));
		diffEditorViewModelStore.add(this.documentDiffItemRef.createNewRef(this));

		this.diffEditorViewModelRef = this._register(RefCounted.createWithDisposable(
			this._instantiationService.createInstance(DiffEditorViewModel, {
				original: originalTextModel,
				modified: modifiedTextModel,
			}, options),
			diffEditorViewModelStore,
			this
		));
	}

	public getKey(): string {
		return JSON.stringify([
			this.originalUri?.toString(),
			this.modifiedUri?.toString()
		]);
	}
}
