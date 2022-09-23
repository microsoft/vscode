/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IWindowOpenable, isWorkspaceToOpen, isFileToOpen } from 'vs/platform/window/common/window';
import { IPickAndOpenOptions, ISaveDialogOptions, IOpenDialogOptions, FileFilter, IFileDialogService, IDialogService, ConfirmResult, getFileNamesMessage } from 'vs/platform/dialogs/common/dialogs';
import { isSavedWorkspace, isTemporaryWorkspace, IWorkspaceContextService, WorkbenchState, WORKSPACE_EXTENSION } from 'vs/platform/workspace/common/workspace';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { URI } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { IInstantiationService, } from 'vs/platform/instantiation/common/instantiation';
import { SimpleFileDialog } from 'vs/workbench/services/dialogs/browser/simpleFileDialog';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import Severity from 'vs/base/common/severity';
import { coalesce, distinct } from 'vs/base/common/arrays';
import { trim } from 'vs/base/common/strings';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ILabelService } from 'vs/platform/label/common/label';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { Schemas } from 'vs/base/common/network';
import { PLAINTEXT_EXTENSION } from 'vs/editor/common/languages/modesRegistry';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorOpenSource } from 'vs/platform/editor/common/editor';
import { ILogService } from 'vs/platform/log/common/log';

export abstract class AbstractFileDialogService implements IFileDialogService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IHostService protected readonly hostService: IHostService,
		@IWorkspaceContextService protected readonly contextService: IWorkspaceContextService,
		@IHistoryService protected readonly historyService: IHistoryService,
		@IWorkbenchEnvironmentService protected readonly environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IFileService protected readonly fileService: IFileService,
		@IOpenerService protected readonly openerService: IOpenerService,
		@IDialogService protected readonly dialogService: IDialogService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@ILabelService private readonly labelService: ILabelService,
		@IPathService private readonly pathService: IPathService,
		@ICommandService protected readonly commandService: ICommandService,
		@IEditorService protected readonly editorService: IEditorService,
		@ICodeEditorService protected readonly codeEditorService: ICodeEditorService,
		@ILogService private readonly logService: ILogService
	) { }

	async defaultFilePath(schemeFilter = this.getSchemeFilterForWindow()): Promise<URI> {

		// Check for last active file first...
		let candidate = this.historyService.getLastActiveFile(schemeFilter);

		// ...then for last active file root
		if (!candidate) {
			candidate = this.historyService.getLastActiveWorkspaceRoot(schemeFilter);
		} else {
			candidate = resources.dirname(candidate);
		}

		if (!candidate) {
			candidate = await this.pathService.userHome({ preferLocal: schemeFilter === Schemas.file });
		}

		return candidate;
	}

	async defaultFolderPath(schemeFilter = this.getSchemeFilterForWindow()): Promise<URI> {

		// Check for last active file root first...
		let candidate = this.historyService.getLastActiveWorkspaceRoot(schemeFilter);

		// ...then for last active file
		if (!candidate) {
			candidate = this.historyService.getLastActiveFile(schemeFilter);
		}

		if (!candidate) {
			return this.pathService.userHome({ preferLocal: schemeFilter === Schemas.file });
		}

		return resources.dirname(candidate);
	}

	async defaultWorkspacePath(schemeFilter = this.getSchemeFilterForWindow()): Promise<URI> {
		let defaultWorkspacePath: URI | undefined;

		// Check for current workspace config file first...
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			const configuration = this.contextService.getWorkspace().configuration;
			if (configuration?.scheme === schemeFilter && isSavedWorkspace(configuration, this.environmentService) && !isTemporaryWorkspace(configuration)) {
				defaultWorkspacePath = resources.dirname(configuration);
			}
		}

		// ...then fallback to default file path
		if (!defaultWorkspacePath) {
			defaultWorkspacePath = await this.defaultFilePath(schemeFilter);
		}

		return defaultWorkspacePath;
	}

	async showSaveConfirm(fileNamesOrResources: (string | URI)[]): Promise<ConfirmResult> {
		if (this.skipDialogs()) {
			this.logService.trace('FileDialogService: refused to show save confirmation dialog in tests.');

			// no veto when we are in extension dev testing mode because we cannot assume we run interactive
			return ConfirmResult.DONT_SAVE;
		}

		return this.doShowSaveConfirm(fileNamesOrResources);
	}

	private skipDialogs(): boolean {
		if (this.environmentService.isExtensionDevelopment && this.environmentService.extensionTestsLocationURI) {
			return true; // integration tests
		}

		return !!this.environmentService.enableSmokeTestDriver; // smoke tests
	}

	private async doShowSaveConfirm(fileNamesOrResources: (string | URI)[]): Promise<ConfirmResult> {
		if (fileNamesOrResources.length === 0) {
			return ConfirmResult.DONT_SAVE;
		}

		let message: string;
		let detail = nls.localize('saveChangesDetail', "Your changes will be lost if you don't save them.");
		if (fileNamesOrResources.length === 1) {
			message = nls.localize('saveChangesMessage', "Do you want to save the changes you made to {0}?", typeof fileNamesOrResources[0] === 'string' ? fileNamesOrResources[0] : resources.basename(fileNamesOrResources[0]));
		} else {
			message = nls.localize('saveChangesMessages', "Do you want to save the changes to the following {0} files?", fileNamesOrResources.length);
			detail = getFileNamesMessage(fileNamesOrResources) + '\n' + detail;
		}

		const buttons: string[] = [
			fileNamesOrResources.length > 1 ? nls.localize({ key: 'saveAll', comment: ['&& denotes a mnemonic'] }, "&&Save All") : nls.localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save"),
			nls.localize({ key: 'dontSave', comment: ['&& denotes a mnemonic'] }, "Do&&n't Save"),
			nls.localize('cancel', "Cancel")
		];

		const { choice } = await this.dialogService.show(Severity.Warning, message, buttons, {
			cancelId: 2,
			detail
		});

		switch (choice) {
			case 0: return ConfirmResult.SAVE;
			case 1: return ConfirmResult.DONT_SAVE;
			default: return ConfirmResult.CANCEL;
		}
	}

	protected addFileSchemaIfNeeded(schema: string, _isFolder?: boolean): string[] {
		return schema === Schemas.untitled ? [Schemas.file] : (schema !== Schemas.file ? [schema, Schemas.file] : [schema]);
	}

	protected async pickFileFolderAndOpenSimplified(schema: string, options: IPickAndOpenOptions, preferNewWindow: boolean): Promise<void> {
		const title = nls.localize('openFileOrFolder.title', 'Open File or Folder');
		const availableFileSystems = this.addFileSchemaIfNeeded(schema);

		const uri = await this.pickResource({ canSelectFiles: true, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });

		if (uri) {
			const stat = await this.fileService.stat(uri);

			const toOpen: IWindowOpenable = stat.isDirectory ? { folderUri: uri } : { fileUri: uri };
			if (!isWorkspaceToOpen(toOpen) && isFileToOpen(toOpen)) {
				this.addFileToRecentlyOpened(toOpen.fileUri);
			}

			if (stat.isDirectory || options.forceNewWindow || preferNewWindow) {
				await this.hostService.openWindow([toOpen], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
			} else {
				await this.editorService.openEditors([{ resource: uri, options: { source: EditorOpenSource.USER, pinned: true } }], undefined, { validateTrust: true });
			}
		}
	}

	protected async pickFileAndOpenSimplified(schema: string, options: IPickAndOpenOptions, preferNewWindow: boolean): Promise<void> {
		const title = nls.localize('openFile.title', 'Open File');
		const availableFileSystems = this.addFileSchemaIfNeeded(schema);

		const uri = await this.pickResource({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
		if (uri) {
			this.addFileToRecentlyOpened(uri);

			if (options.forceNewWindow || preferNewWindow) {
				await this.hostService.openWindow([{ fileUri: uri }], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
			} else {
				await this.editorService.openEditors([{ resource: uri, options: { source: EditorOpenSource.USER, pinned: true } }], undefined, { validateTrust: true });
			}
		}
	}

	protected addFileToRecentlyOpened(uri: URI): void {
		this.workspacesService.addRecentlyOpened([{ fileUri: uri, label: this.labelService.getUriLabel(uri) }]);
	}

	protected async pickFolderAndOpenSimplified(schema: string, options: IPickAndOpenOptions): Promise<void> {
		const title = nls.localize('openFolder.title', 'Open Folder');
		const availableFileSystems = this.addFileSchemaIfNeeded(schema, true);

		const uri = await this.pickResource({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
		if (uri) {
			return this.hostService.openWindow([{ folderUri: uri }], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
		}
	}

	protected async pickWorkspaceAndOpenSimplified(schema: string, options: IPickAndOpenOptions): Promise<void> {
		const title = nls.localize('openWorkspace.title', 'Open Workspace from File');
		const filters: FileFilter[] = [{ name: nls.localize('filterName.workspace', 'Workspace'), extensions: [WORKSPACE_EXTENSION] }];
		const availableFileSystems = this.addFileSchemaIfNeeded(schema, true);

		const uri = await this.pickResource({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, filters, availableFileSystems });
		if (uri) {
			return this.hostService.openWindow([{ workspaceUri: uri }], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
		}
	}

	protected async pickFileToSaveSimplified(schema: string, options: ISaveDialogOptions): Promise<URI | undefined> {
		if (!options.availableFileSystems) {
			options.availableFileSystems = this.addFileSchemaIfNeeded(schema);
		}

		options.title = nls.localize('saveFileAs.title', 'Save As');
		const uri = await this.saveRemoteResource(options);

		if (uri) {
			this.addFileToRecentlyOpened(uri);
		}

		return uri;
	}

	protected async showSaveDialogSimplified(schema: string, options: ISaveDialogOptions): Promise<URI | undefined> {
		if (!options.availableFileSystems) {
			options.availableFileSystems = this.addFileSchemaIfNeeded(schema);
		}

		return this.saveRemoteResource(options);
	}

	protected async showOpenDialogSimplified(schema: string, options: IOpenDialogOptions): Promise<URI[] | undefined> {
		if (!options.availableFileSystems) {
			options.availableFileSystems = this.addFileSchemaIfNeeded(schema, options.canSelectFolders);
		}

		const uri = await this.pickResource(options);

		return uri ? [uri] : undefined;
	}

	protected getSimpleFileDialog(): SimpleFileDialog {
		return this.instantiationService.createInstance(SimpleFileDialog);
	}

	private pickResource(options: IOpenDialogOptions): Promise<URI | undefined> {
		return this.getSimpleFileDialog().showOpenDialog(options);
	}

	private saveRemoteResource(options: ISaveDialogOptions): Promise<URI | undefined> {
		return this.getSimpleFileDialog().showSaveDialog(options);
	}

	private getSchemeFilterForWindow(defaultUriScheme?: string): string {
		return defaultUriScheme ?? this.pathService.defaultUriScheme;
	}

	protected getFileSystemSchema(options: { availableFileSystems?: readonly string[]; defaultUri?: URI }): string {
		return options.availableFileSystems && options.availableFileSystems[0] || this.getSchemeFilterForWindow(options.defaultUri?.scheme);
	}

	abstract pickFileFolderAndOpen(options: IPickAndOpenOptions): Promise<void>;
	abstract pickFileAndOpen(options: IPickAndOpenOptions): Promise<void>;
	abstract pickFolderAndOpen(options: IPickAndOpenOptions): Promise<void>;
	abstract pickWorkspaceAndOpen(options: IPickAndOpenOptions): Promise<void>;
	protected getWorkspaceAvailableFileSystems(options: IPickAndOpenOptions): string[] {
		if (options.availableFileSystems && (options.availableFileSystems.length > 0)) {
			return options.availableFileSystems;
		}
		const availableFileSystems = [Schemas.file];
		if (this.environmentService.remoteAuthority) {
			availableFileSystems.unshift(Schemas.vscodeRemote);
		}
		return availableFileSystems;
	}
	abstract showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined>;
	abstract showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined>;

	abstract pickFileToSave(defaultUri: URI, availableFileSystems?: string[]): Promise<URI | undefined>;

	protected getPickFileToSaveDialogOptions(defaultUri: URI, availableFileSystems?: string[]): ISaveDialogOptions {
		const options: ISaveDialogOptions = {
			defaultUri,
			title: nls.localize('saveAsTitle', "Save As"),
			availableFileSystems
		};

		interface IFilter { name: string; extensions: string[] }

		// Build the file filter by using our known languages
		const ext: string | undefined = defaultUri ? resources.extname(defaultUri) : undefined;
		let matchingFilter: IFilter | undefined;

		const registeredLanguageNames = this.languageService.getSortedRegisteredLanguageNames();
		const registeredLanguageFilters: IFilter[] = coalesce(registeredLanguageNames.map(({ languageName, languageId }) => {
			const extensions = this.languageService.getExtensions(languageId);
			if (!extensions.length) {
				return null;
			}

			const filter: IFilter = { name: languageName, extensions: distinct(extensions).slice(0, 10).map(e => trim(e, '.')) };

			if (!matchingFilter && extensions.includes(ext || PLAINTEXT_EXTENSION /* https://github.com/microsoft/vscode/issues/115860 */)) {
				matchingFilter = filter;

				const trimmedExt = trim(ext || PLAINTEXT_EXTENSION, '.');
				if (!filter.extensions.includes(trimmedExt)) {
					filter.extensions.push(trimmedExt);
				}

				return null; // first matching filter will be added to the top
			}

			return filter;
		}));

		// We have no matching filter, e.g. because the language
		// is unknown. We still add the extension to the list of
		// filters though so that it can be picked
		// (https://github.com/microsoft/vscode/issues/96283)
		if (!matchingFilter && ext) {
			matchingFilter = { name: trim(ext, '.').toUpperCase(), extensions: [trim(ext, '.')] };
		}

		// Order of filters is
		// - All Files (we MUST do this to fix macOS issue https://github.com/microsoft/vscode/issues/102713)
		// - File Extension Match (if any)
		// - All Languages
		// - No Extension
		options.filters = coalesce([
			{ name: nls.localize('allFiles', "All Files"), extensions: ['*'] },
			matchingFilter,
			...registeredLanguageFilters,
			{ name: nls.localize('noExt', "No Extension"), extensions: [''] }
		]);

		return options;
	}
}
