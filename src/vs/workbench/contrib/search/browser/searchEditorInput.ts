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
import { IEditorInputFactory, GroupIdentifier, EditorInput, SaveContext, IRevertOptions } from 'vs/workbench/common/editor';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ITextFileSaveOptions, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import type { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { dirname, joinPath, isEqual } from 'vs/base/common/resources';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { basename } from 'vs/base/common/path';
import { IWorkingCopyService, WorkingCopyCapabilities, IWorkingCopy, IWorkingCopyBackup } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { assertIsDefined } from 'vs/base/common/types';
import { extractSearchQuery, serializeSearchConfiguration } from 'vs/workbench/contrib/search/browser/searchEditorSerialization';

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

export class SearchEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.editorinputs.searchEditorInput';

	private dirty: boolean = false;
	private readonly model: Promise<ITextModel>;
	private resolvedModel?: { model: ITextModel, query: SearchConfiguration };

	constructor(
		public readonly resource: URI,
		getModel: () => Promise<ITextModel>,
		@IModelService private readonly modelService: IModelService,
		@IEditorService protected readonly editorService: IEditorService,
		@IEditorGroupsService protected readonly editorGroupService: IEditorGroupsService,
		@ITextFileService protected readonly textFileService: ITextFileService,
		@IHistoryService private readonly historyService: IHistoryService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
	) {
		super();

		this.model = getModel();

		const workingCopyAdapter: IWorkingCopy = {
			resource: this.resource,
			name: basename(this.resource.path),
			capabilities: this.resource.scheme === 'search-editor' ? WorkingCopyCapabilities.Untitled : 0,
			onDidChangeDirty: this.onDidChangeDirty,
			onDidChangeContent: this.onDidChangeDirty,
			isDirty: () => this.isDirty(),
			backup: () => this.backup(),
			save: (options) => this.save(0, options),
			revert: () => this.revert(),
		};

		this.workingCopyService.registerWorkingCopy(workingCopyAdapter);
	}

	async save(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<boolean> {
		if (this.resource.scheme === 'search-editor') {
			const path = await this.promptForPath(this.resource, await this.suggestFileName(), options?.availableFileSystems);
			if (path) {
				if (await this.textFileService.saveAs(this.resource, path, options)) {
					this.setDirty(false);
					if (options?.context !== SaveContext.EDITOR_CLOSE && !isEqual(path, this.resource)) {
						const replacement = this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, { uri: path });
						await this.editorService.replaceEditors([{ editor: this, replacement, options: { pinned: true } }], group);
						return true;
					} else if (options?.context === SaveContext.EDITOR_CLOSE) {
						return true;
					}
				}
			}
			return false;
		} else {
			this.setDirty(false);
			return !!this.textFileService.write(this.resource, (await this.model).getValue(), options);
		}
	}

	// Brining this over from textFileService because it only suggests for untitled scheme.
	// In the future I may just use the untitled scheme. I dont get particular benefit from using search-editor...
	private async promptForPath(resource: URI, defaultUri: URI, availableFileSystems?: string[]): Promise<URI | undefined> {
		// Help user to find a name for the file by opening it first
		await this.editorService.openEditor({ resource, options: { revealIfOpened: true, preserveFocus: true } });
		return this.fileDialogService.pickFileToSave(defaultUri, availableFileSystems);
	}

	getTypeId(): string {
		return SearchEditorInput.ID;
	}

	getName(): string {
		if (this.resource.scheme === 'search-editor') {
			return this.resolvedModel?.query.query
				? localize('searchTitle.withQuery', "Search: {0}", this.resolvedModel?.query.query)
				: localize('searchTitle', "Search");
		}

		return localize('searchTitle.withQuery', "Search: {0}", basename(this.resource.path, '.code-search'));
	}

	async reloadModel() {
		const model = await this.model;
		const query = extractSearchQuery(model);
		this.resolvedModel = { model, query };
		this._onDidChangeLabel.fire();
		return { model, query };
	}

	getConfigSync() {
		if (!this.resolvedModel) {
			console.error('Requested config for Search Editor before initalization');
		}

		return this.resolvedModel?.query;
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

	async revert(options?: IRevertOptions) {
		// TODO: this should actually revert the contents. But it needs to set dirty false.
		super.revert(options);
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

		const lastActiveFile = this.historyService.getLastActiveFile(schemeFilter);
		if (lastActiveFile) {
			const lastDir = dirname(lastActiveFile);
			return joinPath(lastDir, searchFileName);
		}

		const lastActiveFolder = this.historyService.getLastActiveWorkspaceRoot(schemeFilter);
		if (lastActiveFolder) {
			return joinPath(lastActiveFolder, searchFileName);
		}

		return URI.from({ scheme: schemeFilter, path: searchFileName });
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
				!(endsWith(resource.path, '.code-search') || resource.scheme === 'search-editor') ||
				!(editor instanceof FileEditorInput || (resource.scheme === 'search-editor'))) {
				return undefined;
			}

			if (group.isOpened(editor)) {
				return undefined;
			}

			const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { uri: resource });
			const opened = editorService.openEditor(input, { ...options, pinned: resource.scheme === 'search-editor', ignoreOverrides: true }, group);
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

		return JSON.stringify({ resource, dirty: input.isDirty(), config });
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): SearchEditorInput | undefined {
		const { resource, dirty, config } = JSON.parse(serializedEditorInput);
		if (config && (config.query !== undefined)) {
			const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { text: serializeSearchConfiguration(config), uri: URI.parse(resource) });
			input.setDirty(dirty);
			return input;
		}
		return undefined;
	}
}


const inputs = new Map<string, SearchEditorInput>();
export const getOrMakeSearchEditorInput = (
	accessor: ServicesAccessor,
	existingData: { uri: URI, text?: string } | { text: string, uri?: URI }
): SearchEditorInput => {

	const uri = existingData.uri ?? URI.from({ scheme: 'search-editor', fragment: `${Math.random()}` });

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
		const existing = modelService.getModel(uri);
		if (existing) { return existing; }

		// must be called before `hasBackupSync` to ensure the backup service is initalized.
		await backupService.getBackups();

		let contents: string | ITextBufferFactory;
		if (backupService.hasBackupSync(uri)) {
			contents = assertIsDefined((await backupService.resolve(uri))?.value);
			// backupService.discardBackup(uri);
		} else if (uri.scheme !== 'search-editor') {
			contents = (await textFileService.read(uri)).value;
		} else {
			contents = existingData.text ?? '';
		}
		return modelService.createModel(contents, modeService.create('search-result'), uri);
	};

	const input = instantiationService.createInstance(SearchEditorInput, uri, getModel);

	inputs.set(uri.toString(), input);
	input.onDispose(() => inputs.delete(uri.toString()));

	return input;
};
