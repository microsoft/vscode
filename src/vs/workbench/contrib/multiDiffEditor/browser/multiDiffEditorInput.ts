/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LazyStatefulPromise, raceTimeout } from 'vs/base/common/async';
import { BugIndicatingError, onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, IDisposable, IReference, toDisposable } from 'vs/base/common/lifecycle';
import { parse } from 'vs/base/common/marshalling';
import { Schemas } from 'vs/base/common/network';
import { deepClone } from 'vs/base/common/objects';
import { ObservableLazyPromise, autorun, derived, observableFromEvent } from 'vs/base/common/observable';
import { constObservable, mapObservableArrayCached } from 'vs/base/common/observableInternal/utils';
import { ThemeIcon } from 'vs/base/common/themables';
import { isDefined, isObject } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ConstLazyPromise, IDocumentDiffItem, IMultiDiffEditorModel, LazyPromise } from 'vs/editor/browser/widget/multiDiffEditor/model';
import { MultiDiffEditorViewModel } from 'vs/editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { localize } from 'vs/nls';
import { ConfirmResult } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorConfiguration } from 'vs/workbench/browser/parts/editor/textEditor';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities, EditorInputWithOptions, GroupIdentifier, IEditorSerializer, IResourceMultiDiffEditorInput, IRevertOptions, ISaveOptions, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput, IEditorCloseHandler } from 'vs/workbench/common/editor/editorInput';
import { MultiDiffEditorIcon } from 'vs/workbench/contrib/multiDiffEditor/browser/icons.contribution';
import { ConstResolvedMultiDiffSource, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { ILanguageSupport, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

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
			const resources = this._resources.read(reader) ?? [];
			const label = this.label ?? localize('name', "Multi Diff Editor");
			this._name = label + localize({
				key: 'files',
				comment: ['the number of files being shown']
			}, " ({0} files)", resources?.length ?? 0);
			this._onDidChangeLabel.fire();
		}));
	}

	public serialize(): ISerializedMultiDiffEditorInput {
		return {
			label: this.label,
			multiDiffSourceUri: this.multiDiffSource.toString(),
			resources: this.initialResources?.map(resource => ({
				originalUri: resource.original?.toString(),
				modifiedUri: resource.modified?.toString(),
			})),
		};
	}

	public setLanguageId(languageId: string, source?: string | undefined): void {
		const activeDiffItem = this._viewModel.requireValue().activeDiffItem.get();
		const value = activeDiffItem?.entry?.value;
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

		// Enables delayed disposing
		const garbage = new DisposableStore();

		const documentsWithPromises = mapObservableArrayCached(undefined, source.resources, async (r, store) => {
			/** @description documentsWithPromises */
			let original: IReference<IResolvedTextEditorModel> | undefined;
			let modified: IReference<IResolvedTextEditorModel> | undefined;
			const store2 = new DisposableStore();
			store.add(toDisposable(() => {
				// Mark the text model references as garbage when they get stale (don't dispose them yet)
				garbage.add(store2);
			}));

			try {
				[original, modified] = await Promise.all([
					r.original ? this._textModelService.createModelReference(r.original) : undefined,
					r.modified ? this._textModelService.createModelReference(r.modified) : undefined,
				]);
				if (original) { store.add(original); }
				if (modified) { store.add(modified); }
			} catch (e) {
				// e.g. "File seems to be binary and cannot be opened as text"
				console.error(e);
				onUnexpectedError(e);
				return undefined;
			}

			const uri = (r.modified ?? r.original)!;
			return new ConstLazyPromise<IDocumentDiffItem>({
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
			});
		}, i => JSON.stringify([i.modified?.toString(), i.original?.toString()]));

		let documents: readonly LazyPromise<IDocumentDiffItem>[] = [];
		const documentChangeEmitter = new Emitter<void>();

		const p = Event.toPromise(documentChangeEmitter.event);

		const a = autorun(async reader => {
			/** @description Update documents */
			const docsPromises = documentsWithPromises.read(reader);
			const docs = await Promise.all(docsPromises);
			documents = docs.filter(isDefined);
			documentChangeEmitter.fire();

			garbage.clear(); // Only dispose text models after the documents have been updated
		});

		await p;

		return {
			dispose: () => {
				a.dispose();
				garbage.dispose();
			},
			onDidChange: documentChangeEmitter.event,
			get documents() { return documents; },
			contextKeys: source.source?.contextKeys,
		};
	}

	private readonly _resolvedSource = new ObservableLazyPromise(async () => {
		const source: IResolvedMultiDiffSource | undefined = this.initialResources
			? new ConstResolvedMultiDiffSource(this.initialResources)
			: await this._multiDiffSourceResolverService.resolve(this.multiDiffSource);
		return {
			source,
			resources: source ? observableFromEvent(source.onDidChange, () => source.resources) : constObservable([]),
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

	private readonly _resources = derived(this, reader => this._resolvedSource.cachedPromiseResult.read(reader)?.data?.resources.read(reader));
	private readonly _isDirtyObservables = mapObservableArrayCached(this, this._resources.map(r => r || []), res => {
		const isModifiedDirty = res.modified ? isUriDirty(this._textFileService, res.modified) : constObservable(false);
		const isOriginalDirty = res.original ? isUriDirty(this._textFileService, res.original) : constObservable(false);
		return derived(reader => /** @description modifiedDirty||originalDirty */ isModifiedDirty.read(reader) || isOriginalDirty.read(reader));
	}, i => JSON.stringify([i.modified?.toString(), i.original?.toString()]));
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

function isUriDirty(textFileService: ITextFileService, uri: URI) {
	return observableFromEvent(
		Event.filter(textFileService.files.onDidChangeDirty, e => e.resource.toString() === uri.toString()),
		() => textFileService.isDirty(uri)
	);
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
