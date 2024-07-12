/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/searchEditor';
import { Emitter, Event } from 'vs/base/common/event';
import { basename } from 'vs/base/common/path';
import { extname, isEqual, joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { localize } from 'vs/nls';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { GroupIdentifier, IRevertOptions, ISaveOptions, EditorResourceAccessor, IMoveResult, EditorInputCapabilities, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { Memento } from 'vs/workbench/common/memento';
import { SearchEditorFindMatchClass, SearchEditorInputTypeId, SearchEditorScheme, SearchEditorWorkingCopyTypeId } from 'vs/workbench/contrib/searchEditor/browser/constants';
import { SearchConfigurationModel, SearchEditorModel, searchEditorModelFactory } from 'vs/workbench/contrib/searchEditor/browser/searchEditorModel';
import { defaultSearchConfig, parseSavedSearchEditor, serializeSearchConfiguration } from 'vs/workbench/contrib/searchEditor/browser/searchEditorSerialization';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { ITextFileSaveOptions, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IWorkingCopy, IWorkingCopyBackup, IWorkingCopySaveEvent, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ISearchComplete, ISearchConfigurationProperties } from 'vs/workbench/services/search/common/search';
import { bufferToReadable, VSBuffer } from 'vs/base/common/buffer';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';

export type SearchConfiguration = {
	query: string;
	filesToInclude: string;
	filesToExclude: string;
	contextLines: number;
	matchWholeWord: boolean;
	isCaseSensitive: boolean;
	isRegexp: boolean;
	useExcludeSettingsAndIgnoreFiles: boolean;
	showIncludesExcludes: boolean;
	onlyOpenEditors: boolean;
	notebookSearchConfig: {
		includeMarkupInput: boolean;
		includeMarkupPreview: boolean;
		includeCodeInput: boolean;
		includeOutput: boolean;
	};
};

export const SEARCH_EDITOR_EXT = '.code-search';

const SearchEditorIcon = registerIcon('search-editor-label-icon', Codicon.search, localize('searchEditorLabelIcon', 'Icon of the search editor label.'));

export class SearchEditorInput extends EditorInput {
	static readonly ID: string = SearchEditorInputTypeId;

	override get typeId(): string {
		return SearchEditorInput.ID;
	}

	override get editorId(): string | undefined {
		return this.typeId;
	}

	override getIcon(): ThemeIcon {
		return SearchEditorIcon;
	}

	override get capabilities(): EditorInputCapabilities {
		let capabilities = EditorInputCapabilities.Singleton;
		if (!this.backingUri) {
			capabilities |= EditorInputCapabilities.Untitled;
		}

		return capabilities;
	}

	private memento: Memento;

	private dirty: boolean = false;

	private lastLabel: string | undefined;

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	private readonly _onDidSave = this._register(new Emitter<IWorkingCopySaveEvent>());
	readonly onDidSave: Event<IWorkingCopySaveEvent> = this._onDidSave.event;

	private oldDecorationsIDs: string[] = [];

	get resource() {
		return this.backingUri || this.modelUri;
	}

	public ongoingSearchOperation: Promise<ISearchComplete> | undefined;

	public model: SearchEditorModel;
	private _cachedResultsModel: ITextModel | undefined;
	private _cachedConfigurationModel: SearchConfigurationModel | undefined;

	constructor(
		public readonly modelUri: URI,
		public readonly backingUri: URI | undefined,
		@IModelService private readonly modelService: IModelService,
		@ITextFileService protected readonly textFileService: ITextFileService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IPathService private readonly pathService: IPathService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		this.model = instantiationService.createInstance(SearchEditorModel, modelUri);

		if (this.modelUri.scheme !== SearchEditorScheme) {
			throw Error('SearchEditorInput must be invoked with a SearchEditorScheme uri');
		}

		this.memento = new Memento(SearchEditorInput.ID, storageService);
		this._register(storageService.onWillSaveState(() => this.memento.saveMemento()));

		const input = this;
		const workingCopyAdapter = new class implements IWorkingCopy {
			readonly typeId = SearchEditorWorkingCopyTypeId;
			readonly resource = input.modelUri;
			get name() { return input.getName(); }
			readonly capabilities = input.hasCapability(EditorInputCapabilities.Untitled) ? WorkingCopyCapabilities.Untitled : WorkingCopyCapabilities.None;
			readonly onDidChangeDirty = input.onDidChangeDirty;
			readonly onDidChangeContent = input.onDidChangeContent;
			readonly onDidSave = input.onDidSave;
			isDirty(): boolean { return input.isDirty(); }
			isModified(): boolean { return input.isDirty(); }
			backup(token: CancellationToken): Promise<IWorkingCopyBackup> { return input.backup(token); }
			save(options?: ISaveOptions): Promise<boolean> { return input.save(0, options).then(editor => !!editor); }
			revert(options?: IRevertOptions): Promise<void> { return input.revert(0, options); }
		};

		this._register(this.workingCopyService.registerWorkingCopy(workingCopyAdapter));
	}

	override async save(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<EditorInput | undefined> {
		if (((await this.resolveModels()).resultsModel).isDisposed()) { return; }

		if (this.backingUri) {
			await this.textFileService.write(this.backingUri, await this.serializeForDisk(), options);
			this.setDirty(false);
			this._onDidSave.fire({ reason: options?.reason, source: options?.source });
			return this;
		} else {
			return this.saveAs(group, options);
		}
	}

	public tryReadConfigSync(): SearchConfiguration | undefined {
		return this._cachedConfigurationModel?.config;
	}

	private async serializeForDisk() {
		const { configurationModel, resultsModel } = await this.resolveModels();
		return serializeSearchConfiguration(configurationModel.config) + '\n' + resultsModel.getValue();
	}

	private configChangeListenerDisposable: IDisposable | undefined;
	private registerConfigChangeListeners(model: SearchConfigurationModel) {
		this.configChangeListenerDisposable?.dispose();
		if (!this.isDisposed()) {
			this.configChangeListenerDisposable = model.onConfigDidUpdate(() => {
				if (this.lastLabel !== this.getName()) {
					this._onDidChangeLabel.fire();
					this.lastLabel = this.getName();
				}
				this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE).searchConfig = model.config;
			});
			this._register(this.configChangeListenerDisposable);
		}
	}

	async resolveModels() {
		return this.model.resolve().then(data => {
			this._cachedResultsModel = data.resultsModel;
			this._cachedConfigurationModel = data.configurationModel;
			if (this.lastLabel !== this.getName()) {
				this._onDidChangeLabel.fire();
				this.lastLabel = this.getName();
			}
			this.registerConfigChangeListeners(data.configurationModel);
			return data;
		});
	}

	override async saveAs(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<EditorInput | undefined> {
		const path = await this.fileDialogService.pickFileToSave(await this.suggestFileName(), options?.availableFileSystems);
		if (path) {
			this.telemetryService.publicLog2<
				{},
				{
					owner: 'roblourens';
					comment: 'Fired when a search editor is saved';
				}>
				('searchEditor/saveSearchResults');
			const toWrite = await this.serializeForDisk();
			if (await this.textFileService.create([{ resource: path, value: toWrite, options: { overwrite: true } }])) {
				this.setDirty(false);
				if (!isEqual(path, this.modelUri)) {
					const input = this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, { fileUri: path, from: 'existingFile' });
					input.setMatchRanges(this.getMatchRanges());
					return input;
				}
				return this;
			}
		}
		return undefined;
	}

	override getName(maxLength = 12): string {
		const trimToMax = (label: string) => (label.length < maxLength ? label : `${label.slice(0, maxLength - 3)}...`);

		if (this.backingUri) {
			const originalURI = EditorResourceAccessor.getOriginalUri(this);
			return localize('searchTitle.withQuery', "Search: {0}", basename((originalURI ?? this.backingUri).path, SEARCH_EDITOR_EXT));
		}

		const query = this._cachedConfigurationModel?.config?.query?.trim();
		if (query) {
			return localize('searchTitle.withQuery', "Search: {0}", trimToMax(query));
		}
		return localize('searchTitle', "Search");
	}

	setDirty(dirty: boolean) {
		const wasDirty = this.dirty;
		this.dirty = dirty;
		if (wasDirty !== dirty) {
			this._onDidChangeDirty.fire();
		}
	}

	override isDirty() {
		return this.dirty;
	}

	override async rename(group: GroupIdentifier, target: URI): Promise<IMoveResult | undefined> {
		if (extname(target) === SEARCH_EDITOR_EXT) {
			return {
				editor: this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: 'existingFile', fileUri: target })
			};
		}
		// Ignore move if editor was renamed to a different file extension
		return undefined;
	}

	override dispose() {
		this.modelService.destroyModel(this.modelUri);
		super.dispose();
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}

		if (other instanceof SearchEditorInput) {
			return !!(other.modelUri.fragment && other.modelUri.fragment === this.modelUri.fragment) || !!(other.backingUri && isEqual(other.backingUri, this.backingUri));
		}
		return false;
	}

	getMatchRanges(): Range[] {
		return (this._cachedResultsModel?.getAllDecorations() ?? [])
			.filter(decoration => decoration.options.className === SearchEditorFindMatchClass)
			.filter(({ range }) => !(range.startColumn === 1 && range.endColumn === 1))
			.map(({ range }) => range);
	}

	async setMatchRanges(ranges: Range[]) {
		this.oldDecorationsIDs = (await this.resolveModels()).resultsModel.deltaDecorations(this.oldDecorationsIDs, ranges.map(range =>
			({ range, options: { description: 'search-editor-find-match', className: SearchEditorFindMatchClass, stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } })));
	}

	override async revert(group: GroupIdentifier, options?: IRevertOptions) {
		if (options?.soft) {
			this.setDirty(false);
			return;
		}

		if (this.backingUri) {
			const { config, text } = await this.instantiationService.invokeFunction(parseSavedSearchEditor, this.backingUri);
			const { resultsModel, configurationModel } = await this.resolveModels();
			resultsModel.setValue(text);
			configurationModel.updateConfig(config);
		} else {
			(await this.resolveModels()).resultsModel.setValue('');
		}
		super.revert(group, options);
		this.setDirty(false);
	}

	private async backup(token: CancellationToken): Promise<IWorkingCopyBackup> {
		const contents = await this.serializeForDisk();
		if (token.isCancellationRequested) {
			return {};
		}

		return {
			content: bufferToReadable(VSBuffer.fromString(contents))
		};
	}

	private async suggestFileName(): Promise<URI> {
		const query = (await this.resolveModels()).configurationModel.config.query;
		const searchFileName = (query.replace(/[^\w \-_]+/g, '_') || 'Search') + SEARCH_EDITOR_EXT;
		return joinPath(await this.fileDialogService.defaultFilePath(this.pathService.defaultUriScheme), searchFileName);
	}

	override toUntyped(): IResourceEditorInput | undefined {
		if (this.hasCapability(EditorInputCapabilities.Untitled)) {
			return undefined;
		}

		return {
			resource: this.resource,
			options: {
				override: SearchEditorInput.ID
			}
		};
	}
}

export const getOrMakeSearchEditorInput = (
	accessor: ServicesAccessor,
	existingData: (
		| { from: 'model'; config?: Partial<SearchConfiguration>; modelUri: URI; backupOf?: URI }
		| { from: 'rawData'; resultsContents: string | undefined; config: Partial<SearchConfiguration> }
		| { from: 'existingFile'; fileUri: URI })
): SearchEditorInput => {

	const storageService = accessor.get(IStorageService);
	const configurationService = accessor.get(IConfigurationService);

	const instantiationService = accessor.get(IInstantiationService);
	const modelUri = existingData.from === 'model' ? existingData.modelUri : URI.from({ scheme: SearchEditorScheme, fragment: `${Math.random()}` });

	if (!searchEditorModelFactory.models.has(modelUri)) {
		if (existingData.from === 'existingFile') {
			instantiationService.invokeFunction(accessor => searchEditorModelFactory.initializeModelFromExistingFile(accessor, modelUri, existingData.fileUri));
		} else {

			const searchEditorSettings = configurationService.getValue<ISearchConfigurationProperties>('search').searchEditor;

			const reuseOldSettings = searchEditorSettings.reusePriorSearchConfiguration;
			const defaultNumberOfContextLines = searchEditorSettings.defaultNumberOfContextLines;

			const priorConfig: SearchConfiguration = reuseOldSettings ? new Memento(SearchEditorInput.ID, storageService).getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE).searchConfig : {};
			const defaultConfig = defaultSearchConfig();

			const config = { ...defaultConfig, ...priorConfig, ...existingData.config };

			if (defaultNumberOfContextLines !== null && defaultNumberOfContextLines !== undefined) {
				config.contextLines = existingData?.config?.contextLines ?? defaultNumberOfContextLines;
			}
			if (existingData.from === 'rawData') {
				if (existingData.resultsContents) {
					config.contextLines = 0;
				}
				instantiationService.invokeFunction(accessor => searchEditorModelFactory.initializeModelFromRawData(accessor, modelUri, config, existingData.resultsContents));
			} else {
				instantiationService.invokeFunction(accessor => searchEditorModelFactory.initializeModelFromExistingModel(accessor, modelUri, config));
			}
		}
	}
	return instantiationService.createInstance(
		SearchEditorInput,
		modelUri,
		existingData.from === 'existingFile'
			? existingData.fileUri
			: existingData.from === 'model'
				? existingData.backupOf
				: undefined);
};
