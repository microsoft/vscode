/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, IReference, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ITransaction, ObservablePromise, ObservableResolvedPromise, constObservable, derived, derivedObservableWithWritableCache, mapObservableArrayCached, observableFromValueWithChangeEvent, observableValue, transaction, waitForState } from '../../../../base/common/observable.js';
import { raceCancellationError, rejectIfNotCanceled, timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ContextKeyValue } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IDiffEditorOptions } from '../../../common/config/editorOptions.js';
import { Selection } from '../../../common/core/selection.js';
import { IModelService } from '../../../common/services/model.js';
import { DiffEditorOptions } from '../diffEditor/diffEditorOptions.js';
import { DiffEditorViewModel } from '../diffEditor/diffEditorViewModel.js';
import { RefCounted } from '../diffEditor/utils.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from './model.js';
import { cancelOnDispose, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';

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
		private readonly _instantiationService: IInstantiationService
	) {
		super();
		this._documents = observableFromValueWithChangeEvent(this.model, this.model.documents);

		const allItems = mapObservableArrayCached(
			this,
			this._documentsArr,
			(d, store) => store.add(RefCounted.create(this._instantiationService.createInstance(DocumentDiffItemViewModel, d, this)))
		).recomputeInitiallyAndOnChange(this._store);

		this._waitForNewDiffs = derived(this, reader => {
			const next = allItems.read(reader);
			const unresolved = next.filter(i => !i.object.waitForInitialDiffOr1s.promiseResult.read(undefined));
			if (unresolved.length === 0) {
				return ObservablePromise.resolved(next);
			}
			return new ObservablePromise(
				Promise.all(unresolved.map(i => i.object.waitForInitialDiffOr1s.promise)).then(() => next)
			);
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
}

export class DocumentDiffItemViewModel extends Disposable {
	/**
	 * The diff editor view model keeps its inner objects alive.
	*/
	public get diffEditorViewModelRef(): RefCounted<DiffEditorViewModel> | undefined {
		return this._diffEditorViewModelRef;
	}
	private _diffEditorViewModelRef: RefCounted<DiffEditorViewModel> | undefined;
	public get diffEditorViewModel(): DiffEditorViewModel | undefined {
		return this._diffEditorViewModelRef?.object;
	}
	public readonly waitForInitialDiffOr1s: ObservablePromise<void>;
	public readonly isLoading = observableValue(this, false);
	public readonly loadFailed = observableValue(this, false);
	public readonly collapsed = observableValue<boolean>(this, false);

	public readonly lastTemplateData = observableValue<{ expandedContentHeight: number; selections: Selection[] | undefined }>(
		this,
		{ expandedContentHeight: 500, selections: undefined, }
	);

	public get originalUri(): URI | undefined { return this.documentDiffItem.original?.uri; }
	public get modifiedUri(): URI | undefined { return this.documentDiffItem.modified?.uri; }
	public get isBinary(): boolean {
		if (this.documentDiffItem.load) {
			return false;
		}
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

	public setIsFocused(source: IObservable<boolean>, tx: ITransaction | undefined): IDisposable {
		this._isFocusedSource.set(source, tx);
		return toDisposable(() => {
			if (this._isFocusedSource.get() === source) {
				this._isFocusedSource.set(constObservable(false), undefined);
			}
		});
	}

	private readonly _documentDiffItemRef: RefCounted<IDocumentDiffItem>;
	private readonly _resolvedDocument = this._register(new MutableDisposable<RefCounted<IDocumentDiffItem>>());
	private readonly _load = this._register(new MutableDisposable<IReference<Promise<void>>>());
	private readonly _modelStore = this._register(new DisposableStore());
	private _loadUsers = 0;
	public get documentDiffItem(): IDocumentDiffItem {
		return this._resolvedDocument.value?.object ?? this._documentDiffItemRef.object;
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

		this._documentDiffItemRef = this._register(documentDiffItem.createNewRef(this));
		this.isLoading.set(!!documentDiffItem.object.load, undefined);
		try {
			this.waitForInitialDiffOr1s = documentDiffItem.object.load
				? ObservablePromise.resolved<void>(undefined)
				: this._createDiffEditorViewModel();
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	/** Keeps a deferred row's load alive while a visible editor or explicit operation needs it. */
	public acquire(): IReference<Promise<void>> {
		this._loadUsers++;
		const promise = this._ensureLoaded();
		return Object.assign(toDisposable(() => {
			if (--this._loadUsers === 0) {
				this._load.clear();
			}
		}), { object: promise });
	}

	private _ensureLoaded(): Promise<void> {
		const load = this.documentDiffItem.load;
		if (!load) {
			return Promise.resolve();
		}
		if (this._load.value) {
			return this._load.value.object;
		}
		const source = new CancellationTokenSource();
		this.loadFailed.set(false, undefined);
		const promise = (async () => {
			let reference: RefCounted<IDocumentDiffItem> | undefined;
			try {
				reference = await load(source.token);
				if (source.token.isCancellationRequested || this._store.isDisposed) {
					reference.dispose();
					throw new CancellationError();
				}
				this._resolvedDocument.value = reference;
				this._createDiffEditorViewModel();
				this.isLoading.set(false, undefined);
			} catch (error) {
				if (reference && this._resolvedDocument.value === reference) {
					this._modelStore.clear();
					this._diffEditorViewModelRef = undefined;
					this._resolvedDocument.clear();
				}
				if (!isCancellationError(error) && !this._store.isDisposed && !source.token.isCancellationRequested) {
					this.loadFailed.set(true, undefined);
					onUnexpectedError(error);
				}
				throw error;
			}
		})();
		const request = Object.assign(toDisposable(() => source.dispose(true)), {
			object: raceCancellationError(promise, source.token),
		});
		this._load.value = request;
		const settled = () => {
			if (this._load.value === request) {
				this._load.clear();
			}
		};
		void request.object.then(settled, settled);
		return request.object;
	}

	private _createDiffEditorViewModel(): ObservablePromise<void> {
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
			this._modelStore.add(this.documentDiffItem.onOptionsDidChange(() => {
				options.updateOptions(updateOptions(this.documentDiffItem.options || {}));
			}));
		}

		const diffEditorViewModelStore = new DisposableStore();
		try {
			const originalTextModel = this.documentDiffItem.original?.textModel ?? diffEditorViewModelStore.add(this._modelService.createModel('', null));
			const modifiedTextModel = this.documentDiffItem.modified?.textModel ?? diffEditorViewModelStore.add(this._modelService.createModel('', null));
			diffEditorViewModelStore.add((this._resolvedDocument.value ?? this._documentDiffItemRef).createNewRef(this));

			this._diffEditorViewModelRef = this._modelStore.add(RefCounted.createWithDisposable(
				this._instantiationService.createInstance(DiffEditorViewModel, {
					original: originalTextModel,
					modified: modifiedTextModel,
				}, options),
				diffEditorViewModelStore,
				this
			));
		} catch (error) {
			diffEditorViewModelStore.dispose();
			throw error;
		}

		return new ObservablePromise(
			Promise.race([
				this._diffEditorViewModelRef.object.waitForDiff().catch(rejectIfNotCanceled),
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
