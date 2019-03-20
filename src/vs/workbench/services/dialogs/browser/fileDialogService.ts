/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IWindowService, INativeOpenDialogOptions, OpenDialogOptions, IURIToOpen, FileFilter } from 'vs/platform/windows/common/windows';
import { IPickAndOpenOptions, ISaveDialogOptions, IOpenDialogOptions, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import * as resources from 'vs/base/common/resources';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { RemoteFileDialog } from 'vs/workbench/services/dialogs/browser/remoteFileDialog';
import { WORKSPACE_EXTENSION } from 'vs/platform/workspaces/common/workspaces';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class FileDialogService implements IFileDialogService {

	_serviceBrand: any;

	constructor(
		@IWindowService private readonly windowService: IWindowService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IHistoryService private readonly historyService: IHistoryService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService
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

		// ...then fallback to default folder path
		return this.defaultFolderPath(schemeFilter);
	}

	private toNativeOpenDialogOptions(options: IPickAndOpenOptions): INativeOpenDialogOptions {
		return {
			forceNewWindow: options.forceNewWindow,
			telemetryExtraData: options.telemetryExtraData,
			dialogOptions: {
				defaultPath: options.defaultUri && options.defaultUri.fsPath
			}
		};
	}

	private shouldUseSimplified(schema: string): boolean {
		return (schema !== Schemas.file) || (this.configurationService.getValue('workbench.dialogs.useSimplified') === 'true');
	}

	private ensureFileSchema(schema: string): string[] {
		return schema !== Schemas.file ? [schema, Schemas.file] : [schema];
	}

	pickFileFolderAndOpen(options: IPickAndOpenOptions): Promise<any> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = this.defaultFilePath(schema);
		}

		if (this.shouldUseSimplified(schema)) {
			const title = nls.localize('openFileOrFolder.title', 'Open File Or Folder');
			const availableFileSystems = this.ensureFileSchema(schema); // always allow file as well
			return this.pickRemoteResourceAndOpen({ canSelectFiles: true, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems }, !!options.forceNewWindow, true);
		}

		return this.windowService.pickFileFolderAndOpen(this.toNativeOpenDialogOptions(options));
	}

	pickFileAndOpen(options: IPickAndOpenOptions): Promise<any> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = this.defaultFilePath(schema);
		}

		if (this.shouldUseSimplified(schema)) {
			const title = nls.localize('openFile.title', 'Open File');
			const availableFileSystems = this.ensureFileSchema(schema); // always allow file as well
			return this.pickRemoteResourceAndOpen({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems }, !!options.forceNewWindow, true);
		}

		return this.windowService.pickFileAndOpen(this.toNativeOpenDialogOptions(options));
	}

	pickFolderAndOpen(options: IPickAndOpenOptions): Promise<any> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = this.defaultFolderPath(schema);
		}

		if (this.shouldUseSimplified(schema)) {
			const title = nls.localize('openFolder.title', 'Open Folder');
			const availableFileSystems = this.ensureFileSchema(schema); // always allow file as well
			return this.pickRemoteResourceAndOpen({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems }, !!options.forceNewWindow, false);
		}

		return this.windowService.pickFolderAndOpen(this.toNativeOpenDialogOptions(options));
	}

	pickWorkspaceAndOpen(options: IPickAndOpenOptions): Promise<void> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = this.defaultWorkspacePath(schema);
		}

		if (this.shouldUseSimplified(schema)) {
			const title = nls.localize('openWorkspace.title', 'Open Workspace');
			const filters: FileFilter[] = [{ name: nls.localize('filterName.workspace', 'Workspace'), extensions: [WORKSPACE_EXTENSION] }];
			const availableFileSystems = this.ensureFileSchema(schema); // always allow file as well
			return this.pickRemoteResourceAndOpen({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, filters, availableFileSystems }, !!options.forceNewWindow, false);
		}

		return this.windowService.pickWorkspaceAndOpen(this.toNativeOpenDialogOptions(options));
	}

	private toNativeSaveDialogOptions(options: ISaveDialogOptions): Electron.SaveDialogOptions {
		return {
			defaultPath: options.defaultUri && options.defaultUri.fsPath,
			buttonLabel: options.saveLabel,
			filters: options.filters,
			title: options.title
		};
	}

	showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined> {
		const schema = this.getFileSystemSchema(options);
		if (this.shouldUseSimplified(schema)) {
			if (!options.availableFileSystems) {
				options.availableFileSystems = [schema]; // by default only allow saving in the own file system
			}
			return this.saveRemoteResource(options);
		}

		return this.windowService.showSaveDialog(this.toNativeSaveDialogOptions(options)).then(result => {
			if (result) {
				return URI.file(result);
			}

			return undefined;
		});
	}

	showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined> {
		const schema = this.getFileSystemSchema(options);
		if (schema !== Schemas.file) {
			if (!options.availableFileSystems) {
				options.availableFileSystems = [schema]; // by default only allow loading in the own file system
			}
			return this.pickRemoteResource(options).then(urisToOpen => {
				return urisToOpen && urisToOpen.map(uto => uto.uri);
			});
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

		return this.windowService.showOpenDialog(newOptions).then(result => result ? result.map(URI.file) : undefined);
	}

	private pickRemoteResourceAndOpen(options: IOpenDialogOptions, forceNewWindow: boolean, forceOpenWorkspaceAsFile: boolean) {
		return this.pickRemoteResource(options).then(urisToOpen => {
			if (urisToOpen) {
				return this.windowService.openWindow(urisToOpen, { forceNewWindow, forceOpenWorkspaceAsFile });
			}
			return undefined;
		});
	}

	private pickRemoteResource(options: IOpenDialogOptions): Promise<IURIToOpen[] | undefined> {
		const remoteFileDialog = this.instantiationService.createInstance(RemoteFileDialog);
		return remoteFileDialog.showOpenDialog(options);
	}

	private saveRemoteResource(options: ISaveDialogOptions): Promise<URI | undefined> {
		const remoteFileDialog = this.instantiationService.createInstance(RemoteFileDialog);
		return remoteFileDialog.showSaveDialog(options);
	}

	private getSchemeFilterForWindow() {
		return !this.windowService.getConfiguration().remoteAuthority ? Schemas.file : REMOTE_HOST_SCHEME;
	}

	private getFileSystemSchema(options: { availableFileSystems?: string[], defaultUri?: URI }): string {
		return options.availableFileSystems && options.availableFileSystems[0] || options.defaultUri && options.defaultUri.scheme || this.getSchemeFilterForWindow();
	}

}

function isUntitledWorkspace(path: URI, environmentService: IEnvironmentService): boolean {
	return resources.isEqualOrParent(path, environmentService.untitledWorkspacesHome);
}

registerSingleton(IFileDialogService, FileDialogService, true);