/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ITransaction, ObservableLazyPromise, ObservablePromise, constObservable, derived, derivedObservableWithWritableCache, derivedOpts, mapObservableArrayCached, observableFromValueWithChangeEvent, observableValue, transaction, waitForState } from '../../../../base/common/observable.js';
import { rejectIfNotCanceled, timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ContextKeyValue } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IDiffEditorOptions } from '../../../common/config/editorOptions.js';
import { Selection } from '../../../common/core/selection.js';
import { ITextModelService } from '../../../common/services/resolverService.js';
import { BugIndicatingError, onUnexpectedError } from '../../../../base/common/errors.js';
import { DiffEditorOptions } from '../diffEditor/diffEditorOptions.js';
import { DiffEditorViewModel } from '../diffEditor/diffEditorViewModel.js';
import { RefCounted } from '../diffEditor/utils.js';
import { IDocumentDiffItem, IMultiDiffEditorModel, IResolvedDocumentDiffItem } from './model.js';
import { cancelOnDispose } from '../../../../base/common/cancellation.js';

/** How many files are loaded up front; further files load once shown or navigated to. */
const initialLoadCount = 5;

function haveSameElements<T>(a: readonly T[], b: readonly T[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	const elements = new Set(b);
	return a.every(element => elements.has(element));
}

export class MultiDiffEditorViewModel extends Disposable {
	private readonly _documents: IObservable<readonly RefCounted<IDocumentDiffItem>[] | 'loading'>;

	private readonly _documentsArr = derived(this, reader => {
		const result = this._documents.read(reader);
		if (result === 'loading') { return []; }
		return result;
	});

	public readonly isLoading;
	private readonly _waitForNewDiffs: IObservable<ObservablePromise<void>>;

	public readonly items: IObservable<readonly DocumentDiffItemViewModel[]>;

	public readonly focusedDiffItem = derived(this, reader => this.items.read(reader).find(i => i.isFocused.read(reader)));
	public readonly activeDiffItem = derivedObservableWithWritableCache<DocumentDiffItemViewModel | undefined>(this,
		(reader, lastValue) => this.focusedDiffItem.read(reader) ?? (lastValue && this.items.read(reader).indexOf(lastValue) !== -1 ? lastValue : undefined)
	);

	/** Waits for the files loaded up front and for their diffs, with a one-second limit on diff computation. Files that fail to load do not fail it. */
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
	) {
		super();
		this._documents = observableFromValueWithChangeEvent(this.model, this.model.documents);

		this.items = mapObservableArrayCached(
			this,
			this._documentsArr,
			(d, store) => store.add(this._instantiationService.createInstance(DocumentDiffItemViewModel, d, this))
		).recomputeInitiallyAndOnChange(this._store);

		// Reordering the same files does not start loading other ones.
		const itemSet = derivedOpts<readonly DocumentDiffItemViewModel[]>({ owner: this, equalsFn: haveSameElements }, reader => this.items.read(reader));

		this._waitForNewDiffs = derived(this, reader => {
			const initialItems = itemSet.read(reader).filter(i => !i.collapsed.read(undefined)).slice(0, initialLoadCount);
			// A file that fails to load reports its error itself and must not fail the batch.
			return ObservablePromise.fromFn(async () => {
				await Promise.all(initialItems.map(i => i.waitForInitialDiffOr1s.getPromise().catch(() => { })));
			});
		}).recomputeInitiallyAndOnChange(this._store);

		this.isLoading = derived(this, reader =>
			this._documents.read(reader) === 'loading' || !this._waitForNewDiffs.read(reader).promiseResult.read(reader)
		);
	}
}

export class DocumentDiffItemViewModel extends Disposable {
	/**
	 * The diff editor view model keeps its inner objects alive.
	*/
	private readonly _load = new ObservableLazyPromise(async () => {
		try {
			return await this._loadDiff();
		} catch (error) {
			if (!this._store.isDisposed) {
				onUnexpectedError(error);
			}
			throw error;
		}
	});
	public readonly isLoaded = derived(this, reader => !!this._load.cachedPromiseResult.read(reader)?.data);
	public readonly loadError = derived(this, reader => this._load.cachedPromiseResult.read(reader)?.error);
	private _resolvedDocument: IResolvedDocumentDiffItem | undefined;
	/** The loaded contents; undefined until the item is loaded. */
	public get resolvedDocumentDiffItem(): IResolvedDocumentDiffItem | undefined {
		return this._resolvedDocument;
	}
	public get diffEditorViewModelRef(): RefCounted<DiffEditorViewModel> {
		const value = this._load.cachedPromiseResult.get()?.data;
		if (!value) {
			throw new BugIndicatingError('The document diff has not been loaded');
		}
		return value;
	}
	public get diffEditorViewModel(): DiffEditorViewModel {
		return this.diffEditorViewModelRef.object;
	}
	public readonly waitForInitialDiffOr1s = new ObservableLazyPromise(async () => {
		const ref = await this.load();
		if (!ref) {
			return;
		}
		await Promise.race([
			ref.object.waitForDiff().catch(rejectIfNotCanceled),
			timeout(1000, cancelOnDispose(this._store)).catch(rejectIfNotCanceled),
		]);
	});
	/** Whether the file is loaded and its first diff computed or took more than a second, so its diff can be shown. */
	public readonly isReady = derived(this, reader => {
		const result = this.waitForInitialDiffOr1s.cachedPromiseResult.read(reader);
		return !!result && !result.error && this.isLoaded.read(reader);
	});
	public readonly collapsed = observableValue<boolean>(this, false);

	public readonly lastTemplateData = observableValue<{ expandedContentHeight: number; selections: Selection[] | undefined }>(
		this,
		{ expandedContentHeight: 500, selections: undefined, }
	);

	public get originalUri(): URI | undefined { return this.documentDiffItem.originalUri; }
	public get modifiedUri(): URI | undefined { return this.documentDiffItem.modifiedUri; }
	/** Whether the loaded contents cannot be shown as text. False until the item is loaded. */
	public get isBinary(): boolean {
		return this._resolvedDocument?.kind === 'binary';
	}

	/** The diff editor options of the loaded contents. */
	public get options(): IDiffEditorOptions | undefined {
		return this._resolvedDocument?.kind === 'text' ? this._resolvedDocument.options : undefined;
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
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
	) {
		super();
		this._documentDiffItemRef = this._register(_documentDiffItemRef.createNewRef(this));

		this._register(toDisposable(() => {
			this.isAlive.set(false, undefined);
		}));
	}

	/** Resolves this item once and retains its text and diff models until disposal. Failures are reported here, so callers may ignore rejections. */
	public load(): Promise<RefCounted<DiffEditorViewModel> | undefined> {
		if (this._store.isDisposed) {
			return Promise.resolve(undefined);
		}
		return this._load.getPromise();
	}

	private async _loadDiff(): Promise<RefCounted<DiffEditorViewModel> | undefined> {
		const resources = new DisposableStore();
		let transferred = false;
		try {
			const document = resources.add(this._documentDiffItemRef.createNewRef(this));
			const resolved = resources.add(await document.object.resolve()).object;
			if (this._store.isDisposed) {
				return undefined;
			}
			const original = (resolved.kind === 'text' ? resolved.original : undefined) ?? resources.add(await this._textModelService.createSyntheticDocument('', null)).object.textEditorModel;
			if (this._store.isDisposed) {
				return undefined;
			}
			const modified = (resolved.kind === 'text' ? resolved.modified : undefined) ?? resources.add(await this._textModelService.createSyntheticDocument('', null)).object.textEditorModel;
			if (this._store.isDisposed) {
				return undefined;
			}
			this._resolvedDocument = resolved;
			const options = this._instantiationService.createInstance(DiffEditorOptions, this._getOptions());
			if (resolved.kind === 'text' && resolved.onOptionsDidChange) {
				resources.add(resolved.onOptionsDidChange(() => options.updateOptions(this._getOptions())));
			}
			const ref = this._register(RefCounted.createWithDisposable(
				this._instantiationService.createInstance(DiffEditorViewModel, { original, modified }, options),
				resources,
				this,
			));
			transferred = true;
			return ref;
		} finally {
			if (!transferred) {
				resources.dispose();
			}
		}
	}

	private _getOptions(): IDiffEditorOptions {
		return { ...this.options, hideUnchangedRegions: { enabled: true } };
	}

	public getKey(): string {
		return JSON.stringify([
			this.originalUri?.toString(),
			this.modifiedUri?.toString()
		]);
	}
}
