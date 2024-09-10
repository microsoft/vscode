/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LazyStatefulPromise, raceTimeout } from '../../../../base/common/async.js';
import { BugIndicatingError, onUnexpectedError } from '../../../../base/common/errors.js';
import { Event, ValueWithChangeEvent } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable, IReference } from '../../../../base/common/lifecycle.js';
import { parse } from '../../../../base/common/marshalling.js';
import { Schemas } from '../../../../base/common/network.js';
import { deepClone } from '../../../../base/common/objects.js';
import { ObservableLazyPromise, ValueWithChangeEventFromObservable, autorun, constObservable, derived, mapObservableArrayCached, observableFromEvent, observableFromValueWithChangeEvent, observableValue, recomputeInitiallyAndOnChange } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isDefined, isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { RefCounted } from '../../../../editor/browser/widget/diffEditor/utils.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from '../../../../editor/browser/widget/multiDiffEditor/model.js';
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
import { ILanguageSupport, ITextFileEditorModel, ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { MultiDiffEditorIcon } from './icons.contribution.js';
import { IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from './multiDiffSourceResolverService.js';

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

	private _name: string = '';
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

		this._register(autorun((reader) => {
			/** @description Updates name */
			const resources = this.resources.read(reader);
			const label = this.label ?? localize('name', "Multi Diff Editor");
			if (resources) {
				this._name = label + localize({
					key: 'files',
					comment: ['the number of files being shown']
				}, " ({0} files)", resources.length);
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
		const value = activeDiffItem?.documentDiffItem;
		if (!value) { return; }
		const target = value.modified ?? value.original;
		if (!target) { return; }
		target.setLanguage(languageId, source);
	}

	public async getViewModel(): Promise<MultiDiffEditorViewModel> {
		return this._viewModel.getPromise();
	}

	private readonly _viewModel = new LazyStatefulPromise(async () => {
		const model = await this._createModel();
		this._register(model);
		const vm = new MultiDiffEditorViewModel(model, this._instantiationService);
		this._register(vm);
		await raceTimeout(vm.waitForDiffs(), 1000);
		return vm;
	});

	private async _createModel(): Promise<IMultiDiffEditorModel & IDisposable> {
		const source = await this._resolvedSource.getPromise();
		const textResourceConfigurationService = this._textResourceConfigurationService;

		const documentsWithPromises = mapObservableArrayCached(this, source.resources, async (r, store) => {
			/** @description documentsWithPromises */
			let original: IReference<IResolvedTextEditorModel> | undefined;
			let modified: IReference<IResolvedTextEditorModel> | undefined;

			const multiDiffItemStore = new DisposableStore();

			try {
				[original, modified] = await Promise.all([
					r.originalUri ? this._textModelService.createModelReference(r.originalUri) : undefined,
					r.modifiedUri ? this._textModelService.createModelReference(r.modifiedUri) : undefined,
				]);
				if (original) { multiDiffItemStore.add(original); }
				if (modified) { multiDiffItemStore.add(modified); }
			} catch (e) {
				// e.g. "File seems to be binary and cannot be opened as text"
				console.error(e);
				onUnexpectedError(e);
				return undefined;
			}

			const uri = (r.modifiedUri ?? r.originalUri)!;
			const result: IDocumentDiffItemWithMultiDiffEditorItem = {
				multiDiffEditorItem: r,
				original: original?.object.textEditorModel,
				modified: modified?.object.textEditorModel,
				contextKeys: r.contextKeys,
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
			return store.add(RefCounted.createOfNonDisposable(result, multiDiffItemStore, this));
		}, i => JSON.stringify([i.modifiedUri?.toString(), i.originalUri?.toString()]));

		const documents = observableValue<readonly RefCounted<IDocumentDiffItem>[] | 'loading'>('documents', 'loading');

		const updateDocuments = derived(async reader => {
			/** @description Update documents */
			const docsPromises = documentsWithPromises.read(reader);
			const docs = await Promise.all(docsPromises);
			const newDocuments = docs.filter(isDefined);
			documents.set(newDocuments, undefined);
		});

		const a = recomputeInitiallyAndOnChange(updateDocuments);
		await updateDocuments.get();

		const result: IMultiDiffEditorModel & IDisposable = {
			dispose: () => a.dispose(),
			documents: new ValueWithChangeEventFromObservable(documents),
			contextKeys: source.source?.contextKeys,
		};
		return result;
	}

	private readonly _resolvedSource = new ObservableLazyPromise(async () => {
		const source: IResolvedMultiDiffSource | undefined = this.initialResources
			? { resources: ValueWithChangeEvent.const(this.initialResources) }
			: await this._multiDiffSourceResolverService.resolve(this.multiDiffSource);
		return {
			source,
			resources: source ? observableFromValueWithChangeEvent(this, source.resources) : constObservable([]),
		};
	});

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (otherInput instanceof MultiDiffEditorInput) {
			return this.multiDiffSource.toString() === otherInput.multiDiffSource.toString();
		}

		return false;
	}

	public readonly resources = derived(this, reader => this._resolvedSource.cachedPromiseResult.read(reader)?.data?.resources.read(reader));

	private readonly textFileServiceOnDidChange = new FastEventDispatcher<ITextFileEditorModel, URI>(
		this._textFileService.files.onDidChangeDirty,
		item => item.resource.toString(),
		uri => uri.toString()
	);

	private readonly _isDirtyObservables = mapObservableArrayCached(this, this.resources.map(r => r ?? []), res => {
		const isModifiedDirty = res.modifiedUri ? isUriDirty(this.textFileServiceOnDidChange, this._textFileService, res.modifiedUri) : constObservable(false);
		const isOriginalDirty = res.originalUri ? isUriDirty(this.textFileServiceOnDidChange, this._textFileService, res.originalUri) : constObservable(false);
		return derived(reader => /** @description modifiedDirty||originalDirty */ isModifiedDirty.read(reader) || isOriginalDirty.read(reader));
	}, i => i.getKey());
	private readonly _isDirtyObservable = derived(this, reader => this._isDirtyObservables.read(reader).some(isDirty => isDirty.read(reader)))
		.keepObserved(this._store);

	override readonly onDidChangeDirty = Event.fromObservableLight(this._isDirtyObservable);
	override isDirty() { return this._isDirtyObservable.get(); }

	override async save(group: number, options?: ISaveOptions | undefined): Promise<EditorInput> {
		await this.doSaveOrRevert('save', group, options);
		return this;
	}

	override  revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		return this.doSaveOrRevert('revert', group, options);
	}

	private async doSaveOrRevert(mode: 'save', group: GroupIdentifier, options?: ISaveOptions): Promise<void>;
	private async doSaveOrRevert(mode: 'revert', group: GroupIdentifier, options?: IRevertOptions): Promise<void>;
	private async doSaveOrRevert(mode: 'save' | 'revert', group: GroupIdentifier, options?: ISaveOptions | IRevertOptions): Promise<void> {
		const items = this._viewModel.currentValue?.items.get();
		if (items) {
			await Promise.all(items.map(async item => {
				const model = item.diffEditorViewModel.model;
				const handleOriginal = model.original.uri.scheme !== Schemas.untitled && this._textFileService.isDirty(model.original.uri); // match diff editor behaviour

				await Promise.all([
					handleOriginal ? mode === 'save' ? this._textFileService.save(model.original.uri, options) : this._textFileService.revert(model.original.uri, options) : Promise.resolve(),
					mode === 'save' ? this._textFileService.save(model.modified.uri, options) : this._textFileService.revert(model.modified.uri, options),
				]);
			}));
		}
		return undefined;
	}

	override readonly closeHandler: IEditorCloseHandler = {

		// TODO@bpasero TODO@hediet this is a workaround for
		// not having a better way to figure out if the
		// editors this input wraps around are opened or not

		async confirm() {
			return ConfirmResult.DONT_SAVE;
		},
		showConfirm() {
			return false;
		}
	};
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

	public filteredEvent(filter: TKey): (listener: (e: T) => any) => IDisposable {
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
