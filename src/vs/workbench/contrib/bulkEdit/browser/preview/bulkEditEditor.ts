/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { MultiDiffEditorWidget } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidget';
import { IResourceLabel, IWorkbenchUIElementFactory } from 'vs/editor/browser/widget/multiDiffEditorWidget/workbenchUIElementFactory';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import { AbstractEditorWithViewState } from 'vs/workbench/browser/parts/editor/editorWithViewState';
import { ICompositeControl } from 'vs/workbench/common/composite';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities, EditorInputWithOptions, IEditorOpenContext, IEditorSerializer, IResourceBulkEditEditorInput, IUntypedEditorInput, GroupIdentifier, IRevertOptions, ISaveOptions } from 'vs/workbench/common/editor';
import { EditorInput, IEditorCloseHandler } from 'vs/workbench/common/editor/editorInput';
import { MultiDiffEditorInput } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { URI } from 'vs/base/common/uri';
import { MultiDiffEditorViewModel } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorViewModel';
import { IMultiDiffEditorOptions, IMultiDiffEditorViewState } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidgetImpl';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IDiffEditor } from 'vs/editor/common/editorCommon';
import { BugIndicatingError, onUnexpectedError } from 'vs/base/common/errors';
import { ILanguageSupport, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ConstResolvedMultiDiffSource, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService';
import { MultiDiffEditorIcon } from 'vs/workbench/contrib/multiDiffEditor/browser/icons.contribution';
import { ThemeIcon } from 'vs/base/common/themables';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { ObservableLazyPromise, autorun, derived } from 'vs/base/common/observable';
import { localize } from 'vs/nls';
import { LazyStatefulPromise, raceTimeout } from 'vs/base/common/async';
import { ConstLazyPromise, IDocumentDiffItem, IMultiDiffEditorModel, LazyPromise } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { Disposable, DisposableStore, IDisposable, IReference, toDisposable } from 'vs/base/common/lifecycle';
import { constObservable, mapObservableArrayCached, observableFromEvent } from 'vs/base/common/observableInternal/utils';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Emitter, Event } from 'vs/base/common/event';
import { isDefined, isObject } from 'vs/base/common/types';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { deepClone } from 'vs/base/common/objects';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IEditorConfiguration } from 'vs/workbench/browser/parts/editor/textEditor';
import { ConfirmResult } from 'vs/platform/dialogs/common/dialogs';
import { Schemas } from 'vs/base/common/network';
import { BulkEditPane, getBulkEditPane2 } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPane';
import { ResourceEdit } from 'vs/editor/browser/services/bulkEditService';

export class BulkEditEditor extends AbstractEditorWithViewState<IMultiDiffEditorViewState> {
	static readonly ID = 'bulkEditEditor';

	private _multiDiffEditorWidget: MultiDiffEditorWidget | undefined = undefined;
	private _viewModel: MultiDiffEditorViewModel | undefined;
	private _refactorViewPane: BulkEditPane | undefined;
	private _refactorViewContainer: HTMLElement | undefined;
	private _edits: ResourceEdit[] = [];
	private _promiseEdits: Promise<ResourceEdit[] | undefined> | undefined;

	public get viewModel(): MultiDiffEditorViewModel | undefined {
		return this._viewModel;
	}

	constructor(
		@IInstantiationService instantiationService: InstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
	) {
		super(
			BulkEditEditor.ID,
			'bulkEditEditor',
			telemetryService,
			instantiationService,
			storageService,
			textResourceConfigurationService,
			themeService,
			editorService,
			editorGroupService
		);
	}

	protected async createEditor(parent: HTMLElement): Promise<void> {
		console.log('createEditor of BulkEditEditor');
		this._refactorViewContainer = document.createElement('div');
		this._refactorViewContainer.classList.add('bulk-edit-panel', 'show-file-icons');
		const multiDiffEditorHTMLNode: HTMLElement = document.createElement('div');
		parent.appendChild(this._refactorViewContainer);
		parent.appendChild(multiDiffEditorHTMLNode);
		this._multiDiffEditorWidget = this._register(this.instantiationService.createInstance(
			MultiDiffEditorWidget,
			multiDiffEditorHTMLNode,
			this.instantiationService.createInstance(WorkbenchUIElementFactory),
		));
		console.log('this._multiDiffEditorWidget : ', this._multiDiffEditorWidget);
		console.log('before getBulkEditPane2');
		this._refactorViewPane = await getBulkEditPane2(this.instantiationService, this, this._edits);
		console.log('view of getBulkEditPane2: ', this._refactorViewPane);
		this._renderRefactorPreviewPane();
		this._register(this._multiDiffEditorWidget.onDidChangeActiveControl(() => {
			this._onDidChangeControl.fire();
		}));
	}

	public get promiseEdits(): Promise<ResourceEdit[] | undefined> | undefined {
		return this._promiseEdits;
	}

	private _renderRefactorPreviewPane() {
		if (this._refactorViewPane && this._refactorViewContainer) {
			DOM.clearNode(this._refactorViewContainer);
			this._promiseEdits = this._refactorViewPane.setInput(this._edits, CancellationToken.None);
			// console.log('_renderRefactorPreviewPane');
			// console.log('this._bulkEditEditorInput : ', this._bulkEditEditorInput);
			// if (this._bulkEditEditorInput) {
			// 	this._refactorViewPane.input = this._bulkEditEditorInput;
			// }
			this._refactorViewPane.renderBody(this._refactorViewContainer);
			this._refactorViewPane.focus();
			this._refactorViewPane.maximumBodySize = 100;
		}
	}

	override async setInput(input: BulkEditEditorInput, options: IMultiDiffEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {

		console.log('setInput');
		console.log('input : ', input);
		console.log('this._multiDiffEditorWidget : ', this._multiDiffEditorWidget);

		// In here, we can remove the editors if there are editors to remove
		// this._bulkEditEditorInput = input;
		this._edits = input._edits;
		await super.setInput(input, options, context, token);
		this._viewModel = await input.getViewModel();
		// this._initialViewModel = this._viewModel;
		console.log('this._viewModel : ', this._viewModel);
		this._multiDiffEditorWidget!.setViewModel(this._viewModel);

		const viewState = this.loadEditorViewState(input, context);
		console.log('viewState : ', viewState);
		if (viewState) {
			this._multiDiffEditorWidget!.setViewState(viewState);
		}
		this._renderRefactorPreviewPane();
		this._reveal(options);
		console.log('end of setInput');
	}

	public hasInput(): boolean {
		return this._refactorViewPane?.hasInput() ?? false;
	}

	override async setOptions(options: IMultiDiffEditorOptions | undefined): Promise<void> {
		console.log('setOptions options : ', options);
		this._reveal(options);

		/*
		// Updating the view model
		console.log('this._bulkEditEditorInput : ', this._bulkEditEditorInput);
		if (this._bulkEditEditorInput) {
			// TODO: the bulk edit editor edits are not update correctly
			// TODO: make following set view model work correctly
			// TODO: The actual files need to be change in the temporary files for the change to be propagated, how to change the transient files?
			this._viewModel = await this._bulkEditEditorInput.getViewModel();

			console.log('this._viewModel : ', this._viewModel);
			const items = this._viewModel.items.get();
			const _item = items[0];
			console.log('_item.lastTemplateData.get().selections : ', _item.lastTemplateData.get().selections);
			console.log('this._viewModel.items.get() : ', items);
			console.log('this._viewModel.model : ', this._viewModel.model);
			console.log('this._multiDiffEditorWidget :', this._multiDiffEditorWidget);
			this._multiDiffEditorWidget!.setViewModel(this._viewModel);

		}
		*/
	}

	private _reveal(options: IMultiDiffEditorOptions | undefined): void {
		const viewState = options?.viewState;
		if (!viewState || !viewState.revealData) {
			return;
		}
		this._multiDiffEditorWidget?.reveal(viewState.revealData.resource, viewState.revealData.range);
	}

	override async clearInput(): Promise<void> {
		await super.clearInput();
		this._multiDiffEditorWidget!.setViewModel(undefined);
	}

	layout(dimension: DOM.Dimension): void {
		this._multiDiffEditorWidget!.layout(dimension);
	}

	override getControl(): ICompositeControl | undefined {
		return this._multiDiffEditorWidget!.getActiveControl();
	}

	override focus(): void {
		super.focus();

		this._multiDiffEditorWidget?.getActiveControl()?.focus();
	}

	override hasFocus(): boolean {
		return this._multiDiffEditorWidget?.getActiveControl()?.hasTextFocus() || super.hasFocus();
	}

	protected override computeEditorViewState(resource: URI): IMultiDiffEditorViewState | undefined {
		return this._multiDiffEditorWidget!.getViewState();
	}

	protected override tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof MultiDiffEditorInput;
	}

	protected override toEditorViewStateResource(input: EditorInput): URI | undefined {
		return (input as MultiDiffEditorInput).resource;
	}

	public tryGetCodeEditor(resource: URI): { diffEditor: IDiffEditor; editor: ICodeEditor } | undefined {
		return this._multiDiffEditorWidget!.tryGetCodeEditor(resource);
	}
}


class WorkbenchUIElementFactory implements IWorkbenchUIElementFactory {
	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	createResourceLabel(element: HTMLElement): IResourceLabel {
		const label = this._instantiationService.createInstance(ResourceLabel, element, {});
		return {
			setUri(uri, options = {}) {
				if (!uri) {
					label.element.clear();
				} else {
					label.element.setFile(uri, { strikethrough: options.strikethrough });
				}
			},
			dispose() {
				label.dispose();
			}
		};
	}
}

export interface ISerializedBulkEditEditorInput {
	refactorResourceUri: string;
	label: string | undefined;
	diffResources: {
		originalUri: string | undefined;
		modifiedUri: string | undefined;
	}[] | undefined;
	edits: ResourceEdit[];
}

export class BulkEditEditorSerializer implements IEditorSerializer {
	canSerialize(editor: EditorInput): boolean {
		return false;
	}

	serialize(editor: BulkEditEditorInput): string | undefined {
		return undefined;
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		return undefined;
	}
}

export class BulkEditEditorInput extends EditorInput implements ILanguageSupport {
	public static fromResourceMultiDiffEditorInput(input: IResourceBulkEditEditorInput, instantiationService: IInstantiationService): BulkEditEditorInput {
		if (!input.refactorPreviewSource && !input.diffResources && !input.edits) {
			throw new BugIndicatingError('BulkEditEditorInput requires either multiDiffSource or resources');
		}
		const refactorPreviewSource = input.refactorPreviewSource ?? URI.parse(`multi-diff-editor:${new Date().getMilliseconds().toString() + Math.random().toString()}`);
		return instantiationService.createInstance(
			BulkEditEditorInput,
			refactorPreviewSource,
			input.label,
			input.diffResources?.map(resource => {
				return new MultiDiffEditorItem(
					resource.original.resource,
					resource.modified.resource,
				);
			}),
			input.edits,
		);
	}

	public static fromSerialized(data: ISerializedBulkEditEditorInput, instantiationService: IInstantiationService): BulkEditEditorInput {
		return instantiationService.createInstance(
			BulkEditEditorInput,
			URI.parse(data.refactorResourceUri),
			data.label,
			data.diffResources?.map(resource => new MultiDiffEditorItem(
				resource.originalUri ? URI.parse(resource.originalUri) : undefined,
				resource.modifiedUri ? URI.parse(resource.modifiedUri) : undefined,
			)),
			data.edits,
		);
	}

	static readonly ID: string = 'workbench.input.refactorPreviewEditor';

	get resource(): URI | undefined { return this.refactorPreviewSource; }

	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly; }
	override get typeId(): string { return BulkEditEditorInput.ID; }

	private _name: string = '';
	override getName(): string { return this._name; }

	override get editorId(): string { return DEFAULT_EDITOR_ASSOCIATION.id; }
	override getIcon(): ThemeIcon { return MultiDiffEditorIcon; }

	constructor(
		public readonly refactorPreviewSource: URI,
		public readonly label: string | undefined,
		public readonly initialResources: readonly MultiDiffEditorItem[] | undefined,
		public _edits: ResourceEdit[],
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

	public serialize(): ISerializedBulkEditEditorInput {
		return {
			label: this.label,
			refactorResourceUri: this.refactorPreviewSource.toString(),
			diffResources: this.initialResources?.map(resource => ({
				originalUri: resource.original?.toString(),
				modifiedUri: resource.modified?.toString(),
			})),
			edits: this._edits,
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
			: await this._multiDiffSourceResolverService.resolve(this.refactorPreviewSource);
		return {
			source,
			resources: source ? observableFromEvent(source.onDidChange, () => source.resources) : constObservable([]),
		};
	});

	// set edits(edits: ResourceEdit[]) {
	// 	console.log('inside of edits with edits : ', edits);
	// 	this._edits = edits;
	// }

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		console.log('inside of matches of bulk edit editor input');
		console.log('otherInput : ', otherInput);
		if (super.matches(otherInput)) {
			console.log('first return');
			console.log('return true');
			return true;
		}

		if (otherInput instanceof BulkEditEditorInput) {

			// console.log('second return');
			// console.log('this.edits : ', this._edits);
			// console.log('otherInput.edits : ', otherInput._edits);
			// console.log('return : ', this.refactorPreviewSource.toString() === otherInput.refactorPreviewSource.toString());
			// && this._edits.toString() === otherInput._edits.toString())

			return this.refactorPreviewSource.toString() === otherInput.refactorPreviewSource.toString();
			// && this._edits.toString() === otherInput._edits.toString()
		}

		console.log('return false');
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

export class BulkEditEditorResolver extends Disposable {

	static readonly ID = 'workbench.contrib.bulkEditEditorResolver';

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
				createRefactorPreviewEditorInput: (refactorPreviewEditorInput: IResourceBulkEditEditorInput): EditorInputWithOptions => {
					return {
						editor: BulkEditEditorInput.fromResourceMultiDiffEditorInput(refactorPreviewEditorInput, instantiationService),
					};
				},
			}
		));
	}
}
