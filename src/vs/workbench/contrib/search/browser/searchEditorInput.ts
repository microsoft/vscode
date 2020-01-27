/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as network from 'vs/base/common/network';
import { endsWith } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/searchEditor';
import { ITextModel, ITextBufferFactory } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorInputFactory, GroupIdentifier, EditorInput, IRevertOptions, ISaveOptions, IEditorInput } from 'vs/workbench/common/editor';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ITextFileSaveOptions, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import type { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { joinPath, isEqual, toLocalResource } from 'vs/base/common/resources';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { basename } from 'vs/base/common/path';
import { IWorkingCopyService, WorkingCopyCapabilities, IWorkingCopy, IWorkingCopyBackup } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { assertIsDefined } from 'vs/base/common/types';
import { extractSearchQuery, serializeSearchConfiguration } from 'vs/workbench/contrib/search/browser/searchEditorSerialization';
import type { ICodeEditorViewState } from 'vs/editor/common/editorCommon';
import { IFilesConfigurationService, AutoSaveMode } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';

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

const searchEditorScheme = 'search-editor';

export class SearchEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.editorinputs.searchEditorInput';

	private dirty: boolean = false;
	private readonly model: Promise<ITextModel>;
	private query: Partial<SearchConfiguration> | undefined;

	viewState: SearchEditorViewState = { focused: 'input' };

	constructor(
		public readonly resource: URI,
		getModel: () => Promise<ITextModel>,
		startingConfig: Partial<SearchConfiguration> | undefined,
		@IModelService private readonly modelService: IModelService,
		@IEditorService protected readonly editorService: IEditorService,
		@IEditorGroupsService protected readonly editorGroupService: IEditorGroupsService,
		@ITextFileService protected readonly textFileService: ITextFileService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService
	) {
		super();

		this.model = getModel();

		const input = this;
		const workingCopyAdapter = new class implements IWorkingCopy {
			readonly resource = input.getResource();
			get name() { return input.getName(); }
			readonly capabilities = input.isUntitled() ? WorkingCopyCapabilities.Untitled : 0;
			readonly onDidChangeDirty = input.onDidChangeDirty;
			readonly onDidChangeContent = input.onDidChangeDirty;
			isDirty(): boolean { return input.isDirty(); }
			backup(): Promise<IWorkingCopyBackup> { return input.backup(); }
			save(options?: ISaveOptions): Promise<boolean> { return input.save(0, options).then(editor => !!editor); }
			revert(options?: IRevertOptions): Promise<boolean> { return input.revert(0, options); }
		};

		this.workingCopyService.registerWorkingCopy(workingCopyAdapter);

		this.query = startingConfig;
	}

	getResource() {
		return this.resource;
	}

	async save(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<IEditorInput | undefined> {
		if (this.isUntitled()) {
			return this.saveAs(group, options);
		} else {
			this.setDirty(false);
			const res = await !!this.textFileService.write(this.resource, (await this.model).getValue(), options);
			return res ? this : undefined;
		}
	}

	async saveAs(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<IEditorInput | undefined> {
		const path = await this.fileDialogService.pickFileToSave(await this.suggestFileName(), options?.availableFileSystems);
		if (path) {
			if (await this.textFileService.saveAs(this.resource, path, options)) {
				this.setDirty(false);
				if (!isEqual(path, this.resource)) {
					return this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, { uri: path });
				}
				return this;
			}
		}
		return undefined;
	}

	getTypeId(): string {
		return SearchEditorInput.ID;
	}

	getName(): string {
		if (this.isUntitled()) {
			return (this.query?.query
				? localize('searchTitle.withQuery', "Search: {0}", this.query.query)
				: localize('searchTitle', "Search"));
		}

		return localize('searchTitle.withQuery', "Search: {0}", basename(this.resource.path, '.code-search'));
	}

	async reloadModel() {
		const model = await this.model;
		const query = extractSearchQuery(model);
		this.query = query;
		this._onDidChangeLabel.fire();
		return { model, query };
	}

	getConfigSync() {
		return this.query;
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
		return this.resource.scheme === searchEditorScheme;
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

	async revert(group: GroupIdentifier, options?: IRevertOptions) {
		// TODO: this should actually revert the contents. But it needs to set dirty false.
		super.revert(group, options);
		this.setDirty(false);
		return true;
	}

	private async backup(): Promise<IWorkingCopyBackup> {
		const content = (await this.model).createSnapshot();
		return { content };
	}

	// Bringing this over from textFileService because it only suggests for untitled scheme.
	// In the future I may just use the untitled scheme. I dont get particular benefit from using search-editor...
	private async suggestFileName(): Promise<URI> {
		const query = (await this.reloadModel()).query.query;

		const searchFileName = (query.replace(/[^\w \-_]+/g, '_') || 'Search') + '.code-search';

		const remoteAuthority = this.environmentService.configuration.remoteAuthority;
		const schemeFilter = remoteAuthority ? network.Schemas.vscodeRemote : network.Schemas.file;

		const defaultFilePath = this.fileDialogService.defaultFilePath(schemeFilter);
		if (defaultFilePath) {
			return joinPath(defaultFilePath, searchFileName);
		}

		return toLocalResource(URI.from({ scheme: schemeFilter, path: searchFileName }), remoteAuthority);
	}
}



export class SearchEditorContribution implements IWorkbenchContribution {
	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService protected readonly textFileService: ITextFileService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IModelService protected readonly modelService: IModelService,
	) {

		this.editorService.overrideOpenEditor((editor, options, group) => {
			const resource = editor.getResource();
			if (!resource ||
				!(endsWith(resource.path, '.code-search') || resource.scheme === searchEditorScheme) ||
				!(editor instanceof FileEditorInput || (resource.scheme === searchEditorScheme))) {
				return undefined;
			}

			if (group.isOpened(editor)) {
				return undefined;
			}

			const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { uri: resource });
			const opened = editorService.openEditor(input, { ...options, pinned: resource.scheme === searchEditorScheme, ignoreOverrides: true }, group);
			return { override: Promise.resolve(opened) };
		});
	}
}

export class SearchEditorInputFactory implements IEditorInputFactory {

	canSerialize() { return true; }

	serialize(input: SearchEditorInput) {
		let resource = undefined;
		if (input.resource.path || input.resource.fragment) {
			resource = input.resource.toString();
		}

		const config = input.getConfigSync();

		return JSON.stringify({ resource, dirty: input.isDirty(), config, viewState: input.viewState, name: input.getName() });
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): SearchEditorInput | undefined {
		const { resource, dirty, config, viewState } = JSON.parse(serializedEditorInput);
		if (config && (config.query !== undefined)) {
			const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { config, uri: URI.parse(resource) });
			input.viewState = viewState;
			input.setDirty(dirty);
			return input;
		}
		return undefined;
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

	const uri = existingData.uri ?? URI.from({ scheme: searchEditorScheme, fragment: `${Math.random()}` });

	const instantiationService = accessor.get(IInstantiationService);
	const modelService = accessor.get(IModelService);
	const textFileService = accessor.get(ITextFileService);
	const backupService = accessor.get(IBackupFileService);
	const modeService = accessor.get(IModeService);

	const existing = inputs.get(uri.toString());
	if (existing) {
		return existing;
	}

	const config = existingData.config ?? (existingData.text ? extractSearchQuery(existingData.text) : {});

	const getModel = async () => {
		const existing = modelService.getModel(uri);
		if (existing) { return existing; }

		// must be called before `hasBackupSync` to ensure the backup service is initalized.
		await backupService.getBackups();

		let contents: string | ITextBufferFactory;
		if (backupService.hasBackupSync(uri)) {
			contents = assertIsDefined((await backupService.resolve(uri))?.value);
			// backupService.discardBackup(uri);
		} else if (uri.scheme !== searchEditorScheme) {
			contents = (await textFileService.read(uri)).value;
		} else {
			contents = existingData.text ??
				(existingData.config ? serializeSearchConfiguration(existingData.config) : '');
		}
		return modelService.createModel(contents, modeService.create('search-result'), uri);
	};

	const input = instantiationService.createInstance(SearchEditorInput, uri, getModel, config);

	inputs.set(uri.toString(), input);
	input.onDispose(() => inputs.delete(uri.toString()));

	return input;
};
