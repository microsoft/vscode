/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import * as network from 'vs/base/common/network';
import { basename } from 'vs/base/common/path';
import { isEqual, joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/searchEditor';
import type { ICodeEditorViewState } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, ITextModel, DefaultEndOfLine } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { localize } from 'vs/nls';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { EditorInput, GroupIdentifier, IEditorInput, IRevertOptions, ISaveOptions } from 'vs/workbench/common/editor';
import { extractSearchQuery, serializeSearchConfiguration } from 'vs/workbench/contrib/searchEditor/browser/searchEditorSerialization';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { AutoSaveMode, IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ITextFileSaveOptions, ITextFileService, snapshotToString, stringToSnapshot } from 'vs/workbench/services/textfile/common/textfiles';
import { IWorkingCopy, IWorkingCopyBackup, IWorkingCopyService, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { SearchEditorScheme } from 'vs/workbench/contrib/searchEditor/browser/constants';
import { IRemotePathService } from 'vs/workbench/services/path/common/remotePathService';


export type SearchConfiguration = {
	query: string,
	includes: string,
	excludes: string
	contextLines: number,
	wholeWord: boolean,
	caseSensitive: boolean,
	regexp: boolean,
	useIgnores: boolean,
	showIncludesExcludes: boolean,
};

type SearchEditorViewState =
	| { focused: 'input' }
	| { focused: 'editor', state: ICodeEditorViewState };

export class SearchEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.editorinputs.searchEditorInput';

	private dirty: boolean = false;
	private readonly contentsModel: Promise<ITextModel>;
	private readonly headerModel: Promise<ITextModel>;
	private _cachedConfig?: SearchConfiguration;

	private readonly _onDidChangeContent = new Emitter<void>();
	readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	viewState: SearchEditorViewState = { focused: 'input' };

	private _highlights: IModelDeltaDecoration[] | undefined;
	private oldDecorationsIDs: string[] = [];

	constructor(
		public readonly resource: URI,
		getModel: () => Promise<{ contentsModel: ITextModel, headerModel: ITextModel }>,
		@IModelService private readonly modelService: IModelService,
		@IEditorService protected readonly editorService: IEditorService,
		@IEditorGroupsService protected readonly editorGroupService: IEditorGroupsService,
		@ITextFileService protected readonly textFileService: ITextFileService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IModeService readonly modeService: IModeService,
		@IRemotePathService private readonly remotePathService: IRemotePathService
	) {
		super();

		// Dummy model to set file icon
		this._register(modelService.createModel('', modeService.create('search-result'), this.resource));

		const modelLoader = getModel()
			.then(({ contentsModel, headerModel }) => {
				this._register(contentsModel.onDidChangeContent(() => this._onDidChangeContent.fire()));
				this._register(headerModel.onDidChangeContent(() => {
					this._cachedConfig = extractSearchQuery(headerModel);
					this._onDidChangeContent.fire();
					this._onDidChangeLabel.fire();
				}));

				this._cachedConfig = extractSearchQuery(headerModel);

				this._register(contentsModel);
				this._register(headerModel);

				return { contentsModel, headerModel };
			});

		this.contentsModel = modelLoader.then(({ contentsModel }) => contentsModel);
		this.headerModel = modelLoader.then(({ headerModel }) => headerModel);


		const input = this;
		const workingCopyAdapter = new class implements IWorkingCopy {
			readonly resource = input.getResource();
			get name() { return input.getName(); }
			readonly capabilities = input.isUntitled() ? WorkingCopyCapabilities.Untitled : 0;
			readonly onDidChangeDirty = input.onDidChangeDirty;
			readonly onDidChangeContent = input.onDidChangeContent;
			isDirty(): boolean { return input.isDirty(); }
			backup(): Promise<IWorkingCopyBackup> { return input.backup(); }
			save(options?: ISaveOptions): Promise<boolean> { return input.save(0, options).then(editor => !!editor); }
			revert(options?: IRevertOptions): Promise<boolean> { return input.revert(0, options); }
		};

		this.workingCopyService.registerWorkingCopy(workingCopyAdapter);
	}

	getResource() {
		return this.resource;
	}

	async save(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<IEditorInput | undefined> {
		if ((await this.headerModel).isDisposed() || (await this.contentsModel).isDisposed()) { return; }

		if (this.isUntitled()) {
			return this.saveAs(group, options);
		} else {
			await this.textFileService.write(this.resource, await this.serializeForDisk(), options);
			this.setDirty(false);
			return this;
		}
	}

	private async serializeForDisk() {
		return (await this.headerModel).getValue() + '\n' + (await this.contentsModel).getValue();
	}

	async getModels() {
		const header = await this.headerModel;
		const body = await this.contentsModel;
		return { header, body };
	}

	async saveAs(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<IEditorInput | undefined> {
		const path = await this.fileDialogService.pickFileToSave(await this.suggestFileName(), options?.availableFileSystems);
		if (path) {
			this.telemetryService.publicLog2('searchEditor/saveSearchResults');
			if (await this.textFileService.create(path, await this.serializeForDisk())) {
				this.setDirty(false);
				if (!isEqual(path, this.resource)) {
					const input = this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, { uri: path });
					input.setHighlights(this.highlights);
					return input;
				}
				return this;
			}
		}
		return undefined;
	}

	getTypeId(): string {
		return SearchEditorInput.ID;
	}

	getName(maxLength = 12): string {
		const trimToMax = (label: string) => (label.length < maxLength ? label : `${label.slice(0, maxLength - 3)}...`);

		if (this.isUntitled()) {
			const query = this._cachedConfig?.query?.trim();
			if (query) {
				return localize('searchTitle.withQuery', "Search: {0}", trimToMax(query));
			}
			return localize('searchTitle', "Search");
		}

		return localize('searchTitle.withQuery', "Search: {0}", basename(this.resource.path, '.code-search'));
	}

	getConfigSync() {
		return this._cachedConfig;
	}

	async resolve() {
		return null;
	}

	setDirty(dirty: boolean) {
		this.dirty = dirty;
		this._onDidChangeDirty.fire();
	}

	isDirty() {
		return this.dirty;
	}

	isSaving(): boolean {
		if (!this.isDirty()) {
			return false; // the editor needs to be dirty for being saved
		}

		if (this.isUntitled()) {
			return false; // untitled are not saving automatically
		}

		if (this.filesConfigurationService.getAutoSaveMode() === AutoSaveMode.AFTER_SHORT_DELAY) {
			return true; // a short auto save is configured, treat this as being saved
		}

		return false;
	}

	isReadonly() {
		return false;
	}

	isUntitled() {
		return this.resource.scheme === SearchEditorScheme;
	}

	dispose() {
		this.modelService.destroyModel(this.resource);
		super.dispose();
	}

	matches(other: unknown) {
		if (this === other) { return true; }

		if (other instanceof SearchEditorInput) {
			if (
				(other.resource.path && other.resource.path === this.resource.path) ||
				(other.resource.fragment && other.resource.fragment === this.resource.fragment)
			) {
				return true;
			}
		}
		return false;
	}

	public get highlights(): IModelDeltaDecoration[] {
		return (this._highlights ?? []).map(({ range, options }) => ({ range, options }));
	}

	public async setHighlights(value: IModelDeltaDecoration[]) {
		if (!value) { return; }
		this.oldDecorationsIDs = (await this.contentsModel).deltaDecorations(this.oldDecorationsIDs, value);
		this._highlights = value;
	}

	async revert(group: GroupIdentifier, options?: IRevertOptions) {
		// TODO: this should actually revert the contents. But it needs to set dirty false.
		super.revert(group, options);
		this.setDirty(false);
		return true;
	}

	private async backup(): Promise<IWorkingCopyBackup> {
		const content = stringToSnapshot(await this.serializeForDisk());
		return { content };
	}

	// Bringing this over from textFileService because it only suggests for untitled scheme.
	// In the future I may just use the untitled scheme. I dont get particular benefit from using search-editor...
	private async suggestFileName(): Promise<URI> {
		const query = extractSearchQuery(await this.headerModel).query;

		const searchFileName = (query.replace(/[^\w \-_]+/g, '_') || 'Search') + '.code-search';

		const remoteAuthority = this.environmentService.configuration.remoteAuthority;
		const schemeFilter = remoteAuthority ? network.Schemas.vscodeRemote : network.Schemas.file;

		return joinPath(this.fileDialogService.defaultFilePath(schemeFilter) || (await this.remotePathService.userHome), searchFileName);
	}
}

const inputs = new Map<string, SearchEditorInput>();
export const getOrMakeSearchEditorInput = (
	accessor: ServicesAccessor,
	existingData:
		{ uri: URI, config?: Partial<SearchConfiguration>, text?: never } |
		{ text: string, uri?: never, config?: never } |
		{ config: Partial<SearchConfiguration>, text?: never, uri?: never }
): SearchEditorInput => {

	const uri = existingData.uri ?? URI.from({ scheme: SearchEditorScheme, fragment: `${Math.random()}` });

	const instantiationService = accessor.get(IInstantiationService);
	const modelService = accessor.get(IModelService);
	const textFileService = accessor.get(ITextFileService);
	const backupService = accessor.get(IBackupFileService);
	const modeService = accessor.get(IModeService);

	const existing = inputs.get(uri.toString());
	if (existing) {
		return existing;
	}

	const getModel = async () => {
		let contents: string;

		const backup = await backupService.resolve(uri);
		if (backup) {
			// this way of stringifying a TextBufferFactory seems needlessly complicated...
			contents = snapshotToString(backup.value.create(DefaultEndOfLine.LF).createSnapshot(true));
		} else if (uri.scheme !== SearchEditorScheme) {
			contents = (await textFileService.read(uri)).value;
		} else if (existingData.text) {
			contents = existingData.text;
		} else if (existingData.config) {
			contents = serializeSearchConfiguration(existingData.config);
		} else {
			throw new Error('no initial contents for search editor');
		}
		backupService.discardBackup(uri);

		const lines = contents.split(/\r?\n/);

		const headerlines = [];
		const bodylines = [];
		let inHeader = true;
		for (const line of lines) {
			if (inHeader) {
				headerlines.push(line);
				if (line === '') {
					inHeader = false;
				}
			} else {
				bodylines.push(line);
			}
		}

		const contentsModelURI = uri.with({ scheme: 'search-editor-body' });
		const headerModelURI = uri.with({ scheme: 'search-editor-header' });
		const contentsModel = modelService.getModel(contentsModelURI) ?? modelService.createModel('', modeService.create('search-result'), contentsModelURI);
		const headerModel = modelService.getModel(headerModelURI) ?? modelService.createModel('', modeService.create('search-result'), headerModelURI);

		contentsModel.setValue(bodylines.join('\n'));
		headerModel.setValue(headerlines.join('\n'));

		return { contentsModel, headerModel };
	};

	const input = instantiationService.createInstance(SearchEditorInput, uri, getModel);

	inputs.set(uri.toString(), input);
	input.onDispose(() => inputs.delete(uri.toString()));

	return input;
};
