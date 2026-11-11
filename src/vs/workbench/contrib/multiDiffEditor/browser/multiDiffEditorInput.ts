/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LazyStatefulPromise, raceTimeout } from '../../../../base/common/async.js';
import { cancelOnDispose } from '../../../../base/common/cancellation.js';
import { BugIndicatingError, CancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { Event, ValueWithChangeEvent } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { parse } from '../../../../base/common/marshalling.js';
import { Schemas } from '../../../../base/common/network.js';
import { deepClone } from '../../../../base/common/objects.js';
import { IObservable, ObservableLazyPromise, ValueWithChangeEventFromObservable, autorun, constObservable, derived, mapObservableArrayCached, observableFromEvent, observableFromValueWithChangeEvent, observableValue, waitForState } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { RefCounted } from '../../../../editor/browser/widget/diffEditor/utils.js';
import { IDocumentDiffItem, IMultiDiffEditorModel, IResolvedDocumentDiffItem } from '../../../../editor/browser/widget/multiDiffEditor/model.js';
import { MultiDiffEditorViewModel } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { IDiffEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { localize } from '../../../../nls.js';
import { ConfirmResult } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorConfiguration } from '../../../browser/parts/editor/textEditor.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities, EditorInputWithOptions, GroupIdentifier, IEditorSerializer, IResourceMultiDiffEditorInput, IRevertOptions, ISaveOptions, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput, IEditorCloseHandler } from '../../../common/editor/editorInput.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { ILanguageSupport, ITextFileEditorModel, ITextFileService, TextFileOperationError, TextFileOperationResult } from '../../../services/textfile/common/textfiles.js';
import { MultiDiffEditorIcon } from './icons.contribution.js';
import { IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from './multiDiffSourceResolverService.js';

function isBinaryTextFileOperationError(error: unknown): error is TextFileOperationError {
	return TextFileOperationError.isTextFileOperationError(error)
		&& error.textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY;
}

export class MultiDiffEditorInput extends EditorInput implements ILanguageSupport {
	public static fromResourceMultiDiffEditorInput(input: IResourceMultiDiffEditorInput, instantiationService: IInstantiationService): MultiDiffEditorInput {
		if (!input.multiDiffSource && !input.resources) {
			throw new BugIndicatingError('MultiDiffEditorInput requires either multiDiffSource or resources');
		}
		const multiDiffSource = input.multiDiffSource ?? URI.parse(`multi-diff-editor:${new Date().getMilliseconds().toString() + Math.random().toString()}`);
		return instantiationService.createInstance(
			MultiDiffEditorInput,
			multiDiffSource,
			input.label,
			input.resources?.map(resource => {
				return new MultiDiffEditorItem(
					resource.original.resource,
					resource.modified.resource,
					resource.goToFileResource,
				);
			}),
			input.isTransient ?? false
		);
	}

	public static fromSerialized(data: ISerializedMultiDiffEditorInput, instantiationService: IInstantiationService): MultiDiffEditorInput {
		return instantiationService.createInstance(
			MultiDiffEditorInput,
			URI.parse(data.multiDiffSourceUri),
			data.label,
			data.resources?.map(resource => new MultiDiffEditorItem(
				resource.originalUri ? URI.parse(resource.originalUri) : undefined,
				resource.modifiedUri ? URI.parse(resource.modifiedUri) : undefined,
				resource.goToFileUri ? URI.parse(resource.goToFileUri) : undefined,
			)),
			false
		);
	}

	static readonly ID: string = 'workbench.input.multiDiffEditor';

	get resource(): URI | undefined { return this.multiDiffSource; }

	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly; }
	override get typeId(): string { return MultiDiffEditorInput.ID; }

	private _name: string;
	override getName(): string { return this._name; }

	override get editorId(): string { return DEFAULT_EDITOR_ASSOCIATION.id; }
	override getIcon(): ThemeIcon { return MultiDiffEditorIcon; }

	constructor(
		public readonly multiDiffSource: URI,
		public readonly label: string | undefined,
		public readonly initialResources: readonly MultiDiffEditorItem[] | undefined,
		public readonly isTransient: boolean = false,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ITextResourceConfigurationService private readonly _textResourceConfigurationService: ITextResourceConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMultiDiffSourceResolverService private readonly _multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ITextFileService private readonly _textFileService: ITextFileService,
	) {
		super();
		this._name = '';
		this._viewModel = new LazyStatefulPromise(async () => {
			const store = this._register(new DisposableStore());
			try {
				const model = store.add(await this._createModel());
				if (this._store.isDisposed) {
					throw new CancellationError();
				}

				const vm = store.add(this._instantiationService.createInstance(MultiDiffEditorViewModel, model));
				await raceTimeout(waitForState(vm.isLoading, loading => !loading, undefined, cancelOnDispose(store)), 1000);
				if (this._store.isDisposed) {
					throw new CancellationError();
				}

				return vm;
			} catch (error) {
				store.dispose();
				throw error;
			}
		});
		this._resolvedSource = new ObservableLazyPromise(async () => {
			const source: IResolvedMultiDiffSource | undefined = this.initialResources
				? { resources: ValueWithChangeEvent.const(this.initialResources) }
				: await this._multiDiffSourceResolverService.resolve(this.multiDiffSource);
			return {
				source,
				resources: source ? observableFromValueWithChangeEvent(this, source.resources) : constObservable([]),
				label: source?.label ? observableFromValueWithChangeEvent(this, source.label) : undefined,
			};
		});
		this.resources = derived(this, reader => this._resolvedSource.cachedPromiseResult.read(reader)?.data?.resources.read(reader));
		this.textFileServiceOnDidChange = new FastEventDispatcher<ITextFileEditorModel, URI>(
			this._textFileService.files.onDidChangeDirty,
			item => item.resource.toString(),
			uri => uri.toString()
		);
		this._isDirtyObservables = mapObservableArrayCached(this, this.resources.map(r => r ?? []), res => {
			const isModifiedDirty = res.modifiedUri ? isUriDirty(this.textFileServiceOnDidChange, this._textFileService, res.modifiedUri) : constObservable(false);
			const isOriginalDirty = res.originalUri ? isUriDirty(this.textFileServiceOnDidChange, this._textFileService, res.originalUri) : constObservable(false);
			return derived(reader => /** @description modifiedDirty||originalDirty */ isModifiedDirty.read(reader) || isOriginalDirty.read(reader));
		}, i => i.getKey());
		this._isDirtyObservable = derived(this, reader => this._isDirtyObservables.read(reader).some(isDirty => isDirty.read(reader)))
			.keepObserved(this._store);
		this.onDidChangeDirty = Event.fromObservableLight(this._isDirtyObservable);
		this.closeHandler = {

			// This is a workaround for not having a better way
			// to figure out if the editors this input wraps
			// around are opened or not

			async confirm() {
				return ConfirmResult.DONT_SAVE;
			},
			showConfirm() {
				return false;
			}
		};

		this._register(autorun((reader) => {
			/** @description Updates name */
			const resources = this.resources.read(reader);
			const resolvedSource = this._resolvedSource.cachedPromiseResult.read(reader)?.data;
			const label = resolvedSource?.label?.read(reader) ?? this.label ?? localize('name', "Multi Diff Editor");
			if (resources && resources.length === 1) {
				this._name = localize({ key: 'nameWithOneFile', comment: ['{0} is the name of the editor'] }, "{0} (1 file)", label);
			} else if (resources) {
				this._name = localize({ key: 'nameWithFiles', comment: ['{0} is the name of the editor', '{1} is the number of files being shown'] }, "{0} ({1} files)", label, resources.length);
			} else {
				this._name = label;
			}
			this._onDidChangeLabel.fire();
		}));
	}

	public serialize(): ISerializedMultiDiffEditorInput {
		return {
			label: this.label,
			multiDiffSourceUri: this.multiDiffSource.toString(),
			resources: this.initialResources?.map(resource => ({
				originalUri: resource.originalUri?.toString(),
				modifiedUri: resource.modifiedUri?.toString(),
				goToFileUri: resource.goToFileUri?.toString(),
			})),
		};
	}

	public setLanguageId(languageId: string, source?: string | undefined): void {
		const activeDiffItem = this._viewModel.requireValue().activeDiffItem.get();
		const value = activeDiffItem?.resolvedDocumentDiffItem;
		if (value?.kind !== 'text') { return; }
		const target = value.modified ?? value.original;
		if (!target) { return; }
		target.setLanguage(languageId, source);
	}

	public async getViewModel(): Promise<MultiDiffEditorViewModel> {
		const viewModel = this._viewModel.currentValue;
		if (viewModel && this._resourceOrder.get()) {
			await raceTimeout(viewModel.waitForDiffOr1s(), 1000);
		}
		return this._viewModel.getPromise();
	}

	private readonly _viewModel;

	private readonly _resourceOrder = observableValue<((resources: readonly MultiDiffEditorItem[]) => readonly MultiDiffEditorItem[]) | undefined>(this, undefined);

	/** Orders resolved resources before their diffs are created, and reorders them when the order changes. */
	public setResourceOrder(order: ((resources: readonly MultiDiffEditorItem[]) => readonly MultiDiffEditorItem[]) | undefined): void {
		this._resourceOrder.set(order, undefined);
	}

	/**
	 * Whether the documents of the resources are resolving. Always false: the documents are published as soon as the
	 * resources are known and resolve their contents on demand, so the view model never keeps outdated documents.
	 */
	public readonly isResolvingDocuments: IObservable<boolean> = constObservable(false);

	private async _createModel(): Promise<IMultiDiffEditorModel & IDisposable> {
		const source = await this._resolvedSource.getPromise();
		const store = new DisposableStore();
		const documents = mapObservableArrayCached(this, source.resources, (r, itemStore) =>
			itemStore.add(RefCounted.createOfNonDisposable<IDocumentDiffItemWithMultiDiffEditorItem>({
				multiDiffEditorItem: r,
				originalUri: r.originalUri,
				modifiedUri: r.modifiedUri,
				contextKeys: r.contextKeys,
				resolve: () => this._resolveDocument(r),
			}, toDisposable(() => { }), this)),
			i => JSON.stringify([i.modifiedUri?.toString(), i.originalUri?.toString()])).recomputeInitiallyAndOnChange(store);
		const orderedDocuments = derived(this, reader => {
			const resolvedDocuments = documents.read(reader);
			const order = this._resourceOrder.read(reader);
			if (!order) {
				return resolvedDocuments;
			}
			const documentsByResource = new Map(resolvedDocuments.map(document => [document.object.multiDiffEditorItem, document]));
			return order(resolvedDocuments.map(document => document.object.multiDiffEditorItem))
				.map(resource => documentsByResource.get(resource)!);
		});

		return {
			dispose: () => store.dispose(),
			documents: new ValueWithChangeEventFromObservable(orderedDocuments),
			contextKeys: source.source?.contextKeys,
		};
	}

	private async _resolveDocument(r: MultiDiffEditorItem): Promise<IReference<IResolvedDocumentDiffItem>> {
		const textResourceConfigurationService = this._textResourceConfigurationService;
		const multiDiffItemStore = new DisposableStore();
		try {
			let original: IReference<IResolvedTextEditorModel> | undefined;
			let modified: IReference<IResolvedTextEditorModel> | undefined;

			const createModelReference = async (resource: URI | undefined) => resource ? this._textModelService.createModelReference(resource) : undefined;

			const [originalResult, modifiedResult] = await Promise.allSettled([
				createModelReference(r.originalUri),
				createModelReference(r.modifiedUri),
			]);

			if (originalResult.status === 'fulfilled') {
				original = originalResult.value;
				if (original) { multiDiffItemStore.add(original); }
			}
			if (modifiedResult.status === 'fulfilled') {
				modified = modifiedResult.value;
				if (modified) { multiDiffItemStore.add(modified); }
			}

			const errorResults = [originalResult, modifiedResult].filter((result): result is PromiseRejectedResult => result.status === 'rejected');
			const errorResult = errorResults.find(result => !isBinaryTextFileOperationError(result.reason));
			if (errorResult) {
				throw errorResult.reason;
			}

			const isBinary = errorResults.length > 0;
			if (isBinary) {
				multiDiffItemStore.dispose();
				return { object: { kind: 'binary' }, dispose: () => { } };
			}

			const uri = (r.modifiedUri ?? r.originalUri)!;
			const result: IResolvedDocumentDiffItem = {
				kind: 'text',
				original: original?.object.textEditorModel,
				modified: modified?.object.textEditorModel,
				get options() {
					return {
						...getReadonlyConfiguration(modified?.object.isReadonly() ?? true),
						...computeOptions(textResourceConfigurationService.getValue(uri)),
					} satisfies IDiffEditorOptions;
				},
				onOptionsDidChange: h => this._textResourceConfigurationService.onDidChangeConfiguration(e => {
					if (e.affectsConfiguration(uri, 'editor') || e.affectsConfiguration(uri, 'diffEditor')) {
						h();
					}
				}),
			};
			return { object: result, dispose: () => multiDiffItemStore.dispose() };
		} catch (error) {
			multiDiffItemStore.dispose();
			throw error;
		}
	}

	private readonly _resolvedSource;

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (otherInput instanceof MultiDiffEditorInput) {
			return this.multiDiffSource.toString() === otherInput.multiDiffSource.toString();
		}

		return false;
	}

	public readonly resources;

	private readonly textFileServiceOnDidChange;

	private readonly _isDirtyObservables;
	private readonly _isDirtyObservable;

	override readonly onDidChangeDirty;
	override isDirty() { return this._isDirtyObservable.get(); }

	override async save(group: number, options?: ISaveOptions | undefined): Promise<EditorInput> {
		await this.doSaveOrRevert('save', group, options);
		return this;
	}

	override revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		return this.doSaveOrRevert('revert', group, options);
	}

	private async doSaveOrRevert(mode: 'save', group: GroupIdentifier, options?: ISaveOptions): Promise<void>;
	private async doSaveOrRevert(mode: 'revert', group: GroupIdentifier, options?: IRevertOptions): Promise<void>;
	private async doSaveOrRevert(mode: 'save' | 'revert', group: GroupIdentifier, options?: ISaveOptions | IRevertOptions): Promise<void> {
		const items = this._viewModel.currentValue?.items.get();
		if (items) {
			await Promise.all(items.map(async item => {
				if (item.isBinary) {
					return;
				}
				const model = item.isLoaded.get() ? item.diffEditorViewModel.model : undefined;
				const original = model?.original.uri ?? item.originalUri;
				const modified = model?.modified.uri ?? item.modifiedUri;
				const handleOriginal = original && original.scheme !== Schemas.untitled && this._textFileService.isDirty(original);
				const handleModified = modified && (model || this._textFileService.isDirty(modified));

				await Promise.all([
					handleOriginal ? mode === 'save' ? this._textFileService.save(original, options) : this._textFileService.revert(original, options) : Promise.resolve(),
					handleModified ? mode === 'save' ? this._textFileService.save(modified, options) : this._textFileService.revert(modified, options) : Promise.resolve(),
				]);
			}));
		}
		return undefined;
	}

	override readonly closeHandler: IEditorCloseHandler;
}

export interface IDocumentDiffItemWithMultiDiffEditorItem extends IDocumentDiffItem {
	multiDiffEditorItem: MultiDiffEditorItem;
}

/**
 * Uses a map to efficiently dispatch events to listeners that are interested in a specific key.
*/
class FastEventDispatcher<T, TKey> {
	private _count = 0;
	private readonly _buckets = new Map<string, Set<(value: T) => void>>();

	private _eventSubscription: IDisposable | undefined;

	constructor(
		private readonly _event: Event<T>,
		private readonly _getEventArgsKey: (item: T) => string,
		private readonly _keyToString: (key: TKey) => string,
	) {
	}

	public filteredEvent(filter: TKey): (listener: (e: T) => unknown) => IDisposable {
		return listener => {
			const key = this._keyToString(filter);
			let bucket = this._buckets.get(key);
			if (!bucket) {
				bucket = new Set();
				this._buckets.set(key, bucket);
			}
			bucket.add(listener);

			this._count++;
			if (this._count === 1) {
				this._eventSubscription = this._event(this._handleEventChange);
			}

			return {
				dispose: () => {
					bucket!.delete(listener);
					if (bucket!.size === 0) {
						this._buckets.delete(key);
					}
					this._count--;

					if (this._count === 0) {
						this._eventSubscription?.dispose();
						this._eventSubscription = undefined;
					}
				}
			};
		};
	}

	private readonly _handleEventChange = (e: T) => {
		const key = this._getEventArgsKey(e);
		const bucket = this._buckets.get(key);
		if (bucket) {
			for (const listener of bucket) {
				listener(e);
			}
		}
	};
}

function isUriDirty(onDidChangeDirty: FastEventDispatcher<ITextFileEditorModel, URI>, textFileService: ITextFileService, uri: URI) {
	return observableFromEvent(onDidChangeDirty.filteredEvent(uri), () => textFileService.isDirty(uri));
}

function getReadonlyConfiguration(isReadonly: boolean | IMarkdownString | undefined): { readOnly: boolean; readOnlyMessage: IMarkdownString | undefined } {
	return {
		readOnly: !!isReadonly,
		readOnlyMessage: typeof isReadonly !== 'boolean' ? isReadonly : undefined
	};
}

function computeOptions(configuration: IEditorConfiguration): IDiffEditorOptions {
	const editorConfiguration = deepClone(configuration.editor);

	// Handle diff editor specially by merging in diffEditor configuration
	if (isObject(configuration.diffEditor)) {
		const diffEditorConfiguration: IDiffEditorOptions = deepClone(configuration.diffEditor);

		if (diffEditorConfiguration.hideOriginalLineNumbers === null) {
			delete diffEditorConfiguration.hideOriginalLineNumbers;
		}

		// User settings defines `diffEditor.codeLens`, but here we rename that to `diffEditor.diffCodeLens` to avoid collisions with `editor.codeLens`.
		diffEditorConfiguration.diffCodeLens = diffEditorConfiguration.codeLens;
		delete diffEditorConfiguration.codeLens;

		// User settings defines `diffEditor.wordWrap`, but here we rename that to `diffEditor.diffWordWrap` to avoid collisions with `editor.wordWrap`.
		diffEditorConfiguration.diffWordWrap = <'off' | 'on' | 'inherit' | undefined>diffEditorConfiguration.wordWrap;
		delete diffEditorConfiguration.wordWrap;

		Object.assign(editorConfiguration, diffEditorConfiguration);
	}
	return editorConfiguration;
}

export class MultiDiffEditorResolverContribution extends Disposable {

	static readonly ID = 'workbench.contrib.multiDiffEditorResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`*`,
			{
				id: DEFAULT_EDITOR_ASSOCIATION.id,
				label: DEFAULT_EDITOR_ASSOCIATION.displayName,
				detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
				priority: RegisteredEditorPriority.builtin
			},
			{},
			{
				createMultiDiffEditorInput: (multiDiffEditor: IResourceMultiDiffEditorInput): EditorInputWithOptions => {
					return {
						editor: MultiDiffEditorInput.fromResourceMultiDiffEditorInput(multiDiffEditor, instantiationService),
					};
				},
			}
		));
	}
}

interface ISerializedMultiDiffEditorInput {
	multiDiffSourceUri: string;
	label: string | undefined;
	resources: {
		originalUri: string | undefined;
		modifiedUri: string | undefined;
		goToFileUri: string | undefined;
	}[] | undefined;
}

export class MultiDiffEditorSerializer implements IEditorSerializer {

	canSerialize(editor: EditorInput): editor is MultiDiffEditorInput {
		return editor instanceof MultiDiffEditorInput && !editor.isTransient;
	}

	serialize(editor: MultiDiffEditorInput): string | undefined {
		if (!this.canSerialize(editor)) {
			return undefined;
		}

		return JSON.stringify(editor.serialize());
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		try {
			const data = parse(serializedEditor) as ISerializedMultiDiffEditorInput;
			return MultiDiffEditorInput.fromSerialized(data, instantiationService);
		} catch (err) {
			onUnexpectedError(err);
			return undefined;
		}
	}
}
