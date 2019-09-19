/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IWindowService, INativeOpenDialogOptions, OpenDialogOptions, IURIToOpen, FileFilter, SaveDialogOptions } from 'vs/platform/windows/common/windows';
import { IPickAndOpenOptions, ISaveDialogOptions, IOpenDialogOptions, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import * as resources from 'vs/base/common/resources';
import { IInstantiationService, optional } from 'vs/platform/instantiation/common/instantiation';
import { RemoteFileDialog } from 'vs/workbench/services/dialogs/browser/remoteFileDialog';
import { WORKSPACE_EXTENSION } from 'vs/platform/workspaces/common/workspaces';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { isWeb } from 'vs/base/common/platform';
import { IOpenerService } from 'vs/platform/opener/common/opener';

// TODO@Alex layer breaker
// tslint:disable-next-line: layering import-patterns
import { IElectronService } from 'vs/platform/electron/node/electron';

export class FileDialogService implements IFileDialogService {

	_serviceBrand: undefined;

	constructor(
		@IWindowService private readonly windowService: IWindowService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IHistoryService private readonly historyService: IHistoryService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IOpenerService private readonly openerService: IOpenerService,
		@optional(IElectronService) private readonly electronService: IElectronService
	) { }

	defaultFilePath(schemeFilter = this.getSchemeFilterForWindow()): URI | undefined {

		// Check for last active file first...
		let candidate = this.historyService.getLastActiveFile(schemeFilter);

		// ...then for last active file root
		if (!candidate) {
			candidate = this.historyService.getLastActiveWorkspaceRoot(schemeFilter);
		} else {
			candidate = candidate && resources.dirname(candidate);
		}

		return candidate || undefined;
	}

	defaultFolderPath(schemeFilter = this.getSchemeFilterForWindow()): URI | undefined {

		// Check for last active file root first...
		let candidate = this.historyService.getLastActiveWorkspaceRoot(schemeFilter);

		// ...then for last active file
		if (!candidate) {
			candidate = this.historyService.getLastActiveFile(schemeFilter);
		}

		return candidate && resources.dirname(candidate) || undefined;
	}

	defaultWorkspacePath(schemeFilter = this.getSchemeFilterForWindow()): URI | undefined {

		// Check for current workspace config file first...
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			const configuration = this.contextService.getWorkspace().configuration;
			if (configuration && !isUntitledWorkspace(configuration, this.environmentService)) {
				return resources.dirname(configuration) || undefined;
			}
		}

		// ...then fallback to default file path
		return this.defaultFilePath(schemeFilter);
	}

	private toNativeOpenDialogOptions(options: IPickAndOpenOptions): INativeOpenDialogOptions {
		return {
			forceNewWindow: options.forceNewWindow,
			telemetryExtraData: options.telemetryExtraData,
			defaultPath: options.defaultUri && options.defaultUri.fsPath
		};
	}

	private shouldUseSimplified(schema: string): { useSimplified: boolean, isSetting: boolean } {
		const setting = (this.configurationService.getValue('files.simpleDialog.enable') === true);

		return { useSimplified: (schema !== Schemas.file) || setting, isSetting: (schema === Schemas.file) && setting };
	}

	private addFileSchemaIfNeeded(schema: string): string[] {
		// Include File schema unless the schema is web
		// Don't allow untitled schema through.
		if (isWeb) {
			return schema === Schemas.untitled ? [Schemas.file] : [schema];
		} else {
			return schema === Schemas.untitled ? [Schemas.file] : (schema !== Schemas.file ? [schema, Schemas.file] : [schema]);
		}
	}

	async pickFileFolderAndOpen(options: IPickAndOpenOptions): Promise<any> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = this.defaultFilePath(schema);
		}

		const shouldUseSimplified = this.shouldUseSimplified(schema);
		if (shouldUseSimplified.useSimplified) {
			const title = nls.localize('openFileOrFolder.title', 'Open File Or Folder');
			const availableFileSystems = this.addFileSchemaIfNeeded(schema);

			const uri = await this.pickRemoteResource({ canSelectFiles: true, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });

			if (uri) {
				const stat = await this.fileService.resolve(uri);

				const toOpen: IURIToOpen = stat.isDirectory ? { folderUri: uri } : { fileUri: uri };
				if (stat.isDirectory || options.forceNewWindow || shouldUseSimplified.isSetting) {
					return this.windowService.openWindow([toOpen], { forceNewWindow: options.forceNewWindow });
				} else {
					return this.openerService.open(uri);
				}
			}

			return;
		}

		return this.windowService.pickFileFolderAndOpen(this.toNativeOpenDialogOptions(options));
	}

	async pickFileAndOpen(options: IPickAndOpenOptions): Promise<any> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = this.defaultFilePath(schema);
		}

		const shouldUseSimplified = this.shouldUseSimplified(schema);
		if (shouldUseSimplified.useSimplified) {
			const title = nls.localize('openFile.title', 'Open File');
			const availableFileSystems = this.addFileSchemaIfNeeded(schema);

			const uri = await this.pickRemoteResource({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
			if (uri) {
				if (options.forceNewWindow || shouldUseSimplified.isSetting) {
					return this.windowService.openWindow([{ fileUri: uri }], { forceNewWindow: options.forceNewWindow });
				} else {
					return this.openerService.open(uri);
				}
			}

			return;
		}

		return this.windowService.pickFileAndOpen(this.toNativeOpenDialogOptions(options));
	}

	async pickFolderAndOpen(options: IPickAndOpenOptions): Promise<any> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = this.defaultFolderPath(schema);
		}

		if (this.shouldUseSimplified(schema).useSimplified) {
			const title = nls.localize('openFolder.title', 'Open Folder');
			const availableFileSystems = this.addFileSchemaIfNeeded(schema);

			const uri = await this.pickRemoteResource({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
			if (uri) {
				return this.windowService.openWindow([{ folderUri: uri }], { forceNewWindow: options.forceNewWindow });
			}

			return;
		}

		return this.windowService.pickFolderAndOpen(this.toNativeOpenDialogOptions(options));
	}

	async pickWorkspaceAndOpen(options: IPickAndOpenOptions): Promise<void> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = this.defaultWorkspacePath(schema);
		}

		if (this.shouldUseSimplified(schema).useSimplified) {
			const title = nls.localize('openWorkspace.title', 'Open Workspace');
			const filters: FileFilter[] = [{ name: nls.localize('filterName.workspace', 'Workspace'), extensions: [WORKSPACE_EXTENSION] }];
			const availableFileSystems = this.addFileSchemaIfNeeded(schema);

			const uri = await this.pickRemoteResource({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, filters, availableFileSystems });
			if (uri) {
				return this.windowService.openWindow([{ workspaceUri: uri }], { forceNewWindow: options.forceNewWindow });
			}

			return;
		}

		return this.windowService.pickWorkspaceAndOpen(this.toNativeOpenDialogOptions(options));
	}

	async pickFileToSave(options: ISaveDialogOptions): Promise<URI | undefined> {
		const schema = this.getFileSystemSchema(options);
		if (this.shouldUseSimplified(schema).useSimplified) {
			if (!options.availableFileSystems) {
				options.availableFileSystems = this.addFileSchemaIfNeeded(schema);
			}

			options.title = nls.localize('saveFileAs.title', 'Save As');
			return this.saveRemoteResource(options);
		}

		if (this.electronService) {
			const result = await this.electronService.showSaveDialog(this.toNativeSaveDialogOptions(options));
			if (result && result.filePath) {
				return URI.file(result.filePath);
			}
		}

		return;
	}

	private toNativeSaveDialogOptions(options: ISaveDialogOptions): SaveDialogOptions {
		options.defaultUri = options.defaultUri ? URI.file(options.defaultUri.path) : undefined;
		return {
			defaultPath: options.defaultUri && options.defaultUri.fsPath,
			buttonLabel: options.saveLabel,
			filters: options.filters,
			title: options.title
		};
	}

	async showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined> {
		const schema = this.getFileSystemSchema(options);
		if (this.shouldUseSimplified(schema).useSimplified) {
			if (!options.availableFileSystems) {
				options.availableFileSystems = this.addFileSchemaIfNeeded(schema);
			}

			return this.saveRemoteResource(options);
		}

		if (this.electronService) {
			const result = await this.electronService.showSaveDialog(this.toNativeSaveDialogOptions(options));
			if (result && result.filePath) {
				return URI.file(result.filePath);
			}
		}

		return;
	}

	async showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined> {
		const schema = this.getFileSystemSchema(options);
		if (this.shouldUseSimplified(schema).useSimplified) {
			if (!options.availableFileSystems) {
				options.availableFileSystems = this.addFileSchemaIfNeeded(schema);
			}

			const uri = await this.pickRemoteResource(options);

			return uri ? [uri] : undefined;
		}

		const defaultUri = options.defaultUri;

		const newOptions: OpenDialogOptions = {
			title: options.title,
			defaultPath: defaultUri && defaultUri.fsPath,
			buttonLabel: options.openLabel,
			filters: options.filters,
			properties: []
		};

		newOptions.properties!.push('createDirectory');

		if (options.canSelectFiles) {
			newOptions.properties!.push('openFile');
		}

		if (options.canSelectFolders) {
			newOptions.properties!.push('openDirectory');
		}

		if (options.canSelectMany) {
			newOptions.properties!.push('multiSelections');
		}

		if (this.electronService) {
			const result = await this.electronService.showOpenDialog(newOptions);

			return result && result.filePaths ? result.filePaths.map(URI.file) : undefined;
		}

		return;
	}

	private pickRemoteResource(options: IOpenDialogOptions): Promise<URI | undefined> {
		const remoteFileDialog = this.instantiationService.createInstance(RemoteFileDialog);

		return remoteFileDialog.showOpenDialog(options);
	}

	private saveRemoteResource(options: ISaveDialogOptions): Promise<URI | undefined> {
		const remoteFileDialog = this.instantiationService.createInstance(RemoteFileDialog);

		return remoteFileDialog.showSaveDialog(options);
	}

	private getSchemeFilterForWindow(): string {
		return !this.environmentService.configuration.remoteAuthority ? Schemas.file : REMOTE_HOST_SCHEME;
	}

	private getFileSystemSchema(options: { availableFileSystems?: string[], defaultUri?: URI }): string {
		return options.availableFileSystems && options.availableFileSystems[0] || this.getSchemeFilterForWindow();
	}
}

function isUntitledWorkspace(path: URI, environmentService: IWorkbenchEnvironmentService): boolean {
	return resources.isEqualOrParent(path, environmentService.untitledWorkspacesHome);
}

registerSingleton(IFileDialogService, FileDialogService, true);
