/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ITransaction, ObservablePromise, ObservableResolvedPromise, constObservable, derived, derivedObservableWithWritableCache, mapObservableArrayCached, observableFromValueWithChangeEvent, observableValue, transaction, waitForState } from '../../../../base/common/observable.js';
import { rejectIfNotCanceled, timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ContextKeyValue } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IDiffEditorOptions } from '../../../common/config/editorOptions.js';
import { Selection } from '../../../common/core/selection.js';
import { ITextModelService } from '../../../common/services/resolverService.js';
import { ITextModel } from '../../../common/model.js';
import { isDefined } from '../../../../base/common/types.js';
import { DiffEditorOptions } from '../diffEditor/diffEditorOptions.js';
import { DiffEditorViewModel } from '../diffEditor/diffEditorViewModel.js';
import { RefCounted } from '../diffEditor/utils.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from './model.js';
import { cancelOnDispose } from '../../../../base/common/cancellation.js';

export class MultiDiffEditorViewModel extends Disposable {
	private readonly _documents: IObservable<readonly RefCounted<IDocumentDiffItem>[] | 'loading'>;

	private readonly _documentsArr = derived(this, reader => {
		const result = this._documents.read(reader);
		if (result === 'loading') { return []; }
		return result;
	});

	public readonly isLoading;
	private readonly _waitForNewDiffs: IObservable<ObservablePromise<readonly RefCounted<DocumentDiffItemViewModel>[]>>;

	public readonly items: IObservable<readonly DocumentDiffItemViewModel[]>;

	public readonly focusedDiffItem = derived(this, reader => this.items.read(reader).find(i => i.isFocused.read(reader)));
	public readonly activeDiffItem = derivedObservableWithWritableCache<DocumentDiffItemViewModel | undefined>(this,
		(reader, lastValue) => this.focusedDiffItem.read(reader) ?? (lastValue && this.items.read(reader).indexOf(lastValue) !== -1 ? lastValue : undefined)
	);

	public async waitForDiffOr1s(): Promise<void> {
		if (this._documents.get() === 'loading') {
			await waitForState(this._documents, documents => documents !== 'loading');
		}

		await this._waitForNewDiffs.get().promise;
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

	public collapse(item: DocumentDiffItemViewModel): void {
		transaction(tx => {
			item.collapsed.set(true, tx);
		});
	}

	public expand(item: DocumentDiffItemViewModel): void {
		transaction(tx => {
			item.collapsed.set(false, tx);
		});
	}

	public get contextKeys(): Record<string, ContextKeyValue> | undefined {
		return this.model.contextKeys;
	}

	constructor(
		public readonly model: IMultiDiffEditorModel,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
	) {
		super();
		this._documents = observableFromValueWithChangeEvent(this.model, this.model.documents);

		const allItems = mapObservableArrayCached(
			this,
			this._documentsArr,
			(d, store) => this._createItem(d, store)
		).recomputeInitiallyAndOnChange(this._store);

		this._waitForNewDiffs = derived(this, reader => {
			const pending = allItems.read(reader);
			return ObservablePromise.fromFn(async () => {
				const next = (await Promise.all(pending)).filter(isDefined);
				await Promise.all(next.map(i => i.object.waitForInitialDiffOr1s.promise));
				return next;
			});
		});

		const resolved = new ObservableResolvedPromise(this._waitForNewDiffs, [] as readonly RefCounted<DocumentDiffItemViewModel>[], this._store);

		this.items = derived(this, reader => {
			const resolvedItems = resolved.lastResolved.read(reader);
			return resolvedItems.map(i => {
				const ref = reader.store.add(i.createNewRef(i));
				return ref.object;
			});
		});

		this.isLoading = derived(this, reader =>
			this._documents.read(reader) === 'loading' || resolved.isResolving.read(reader)
		);
	}

	private async _createItem(document: RefCounted<IDocumentDiffItem>, store: DisposableStore): Promise<RefCounted<DocumentDiffItemViewModel> | undefined> {
		const resources = new DisposableStore();
		let transferred = false;
		try {
			const documentReference = resources.add(document.createNewRef(this));
			const original = document.object.original?.textModel ?? resources.add(await this._textModelService.createSyntheticDocument('', null)).object.textEditorModel;
			if (store.isDisposed) {
				return undefined;
			}
			const modified = document.object.modified?.textModel ?? resources.add(await this._textModelService.createSyntheticDocument('', null)).object.textEditorModel;
			if (store.isDisposed) {
				return undefined;
			}
			const item = this._instantiationService.createInstance(DocumentDiffItemViewModel, documentReference, this, original, modified, resources);
			const reference = store.add(RefCounted.create(item));
			transferred = true;
			return reference;
		} finally {
			if (!transferred) {
				resources.dispose();
			}
		}
	}
}

export class DocumentDiffItemViewModel extends Disposable {
	/**
	 * The diff editor view model keeps its inner objects alive.
	*/
	public readonly diffEditorViewModelRef: RefCounted<DiffEditorViewModel>;
	public get diffEditorViewModel(): DiffEditorViewModel {
		return this.diffEditorViewModelRef.object;
	}
	public readonly waitForInitialDiffOr1s: ObservablePromise<void>;
	public readonly collapsed = observableValue<boolean>(this, false);

	public readonly lastTemplateData = observableValue<{ expandedContentHeight: number; selections: Selection[] | undefined }>(
		this,
		{ expandedContentHeight: 500, selections: undefined, }
	);

	public get originalUri(): URI | undefined { return this.documentDiffItem.original?.uri; }
	public get modifiedUri(): URI | undefined { return this.documentDiffItem.modified?.uri; }
	public get isBinary(): boolean {
		const { original, modified } = this.documentDiffItem;
		return (original !== undefined && original.textModel === undefined)
			|| (modified !== undefined && modified.textModel === undefined);
	}

	public readonly isActive: IObservable<boolean> = derived(this, reader => this._editorViewModel.activeDiffItem.read(reader) === this);
	public readonly isFirst: IObservable<boolean> = derived(this, reader => this._editorViewModel.items.read(reader)[0] === this);

	public setActive(tx: ITransaction | undefined): void {
		this._editorViewModel.activeDiffItem.setCache(this, tx);
	}

	private readonly _isFocusedSource = observableValue<IObservable<boolean>>(this, constObservable(false));
	public readonly isFocused = derived(this, reader => this._isFocusedSource.read(reader).read(reader));

	public setIsFocused(source: IObservable<boolean>, tx: ITransaction | undefined): void {
		this._isFocusedSource.set(source, tx);
	}

	public get documentDiffItem(): IDocumentDiffItem {
		return this._documentDiffItemRef.object;
	}

	public readonly isAlive = observableValue<boolean>(this, true);

	constructor(
		private readonly _documentDiffItemRef: RefCounted<IDocumentDiffItem>,
		private readonly _editorViewModel: MultiDiffEditorViewModel,
		originalTextModel: ITextModel,
		modifiedTextModel: ITextModel,
		diffEditorViewModelStore: DisposableStore,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(toDisposable(() => {
			this.isAlive.set(false, undefined);
		}));

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

		this.diffEditorViewModelRef = this._register(RefCounted.createWithDisposable(
			this._instantiationService.createInstance(DiffEditorViewModel, {
				original: originalTextModel,
				modified: modifiedTextModel,
			}, options),
			diffEditorViewModelStore,
			this
		));

		this.waitForInitialDiffOr1s = new ObservablePromise(
			Promise.race([
				this.diffEditorViewModel.waitForDiff().catch(rejectIfNotCanceled),
				timeout(1000, cancelOnDispose(this._store)).catch(rejectIfNotCanceled),
			])
		);
	}

	public getKey(): string {
		return JSON.stringify([
			this.originalUri?.toString(),
			this.modifiedUri?.toString()
		]);
	}
}
