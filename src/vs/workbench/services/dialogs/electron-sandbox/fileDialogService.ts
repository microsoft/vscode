/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SaveDialogOptions, OpenDialogOptions } from 'vs/base/parts/sandbox/common/electronTypes';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IPickAndOpenOptions, ISaveDialogOptions, IOpenDialogOptions, IFileDialogService, IDialogService, INativeOpenDialogOptions } from 'vs/platform/dialogs/common/dialogs';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { INativeHostOptions, INativeHostService } from 'vs/platform/native/common/native';
import { AbstractFileDialogService } from 'vs/workbench/services/dialogs/browser/abstractFileDialogService';
import { Schemas } from 'vs/base/common/network';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { ILabelService } from 'vs/platform/label/common/label';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILogService } from 'vs/platform/log/common/log';
import { getActiveWindow } from 'vs/base/browser/dom';

export class FileDialogService extends AbstractFileDialogService implements IFileDialogService {

	constructor(
		@IHostService hostService: IHostService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IHistoryService historyService: IHistoryService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IFileService fileService: IFileService,
		@IOpenerService openerService: IOpenerService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IDialogService dialogService: IDialogService,
		@ILanguageService languageService: ILanguageService,
		@IWorkspacesService workspacesService: IWorkspacesService,
		@ILabelService labelService: ILabelService,
		@IPathService pathService: IPathService,
		@ICommandService commandService: ICommandService,
		@IEditorService editorService: IEditorService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ILogService logService: ILogService
	) {
		super(hostService, contextService, historyService, environmentService, instantiationService,
			configurationService, fileService, openerService, dialogService, languageService, workspacesService, labelService, pathService, commandService, editorService, codeEditorService, logService);
	}

	private toNativeOpenDialogOptions(options: IPickAndOpenOptions): INativeOpenDialogOptions {
		return {
			forceNewWindow: options.forceNewWindow,
			telemetryExtraData: options.telemetryExtraData,
			defaultPath: options.defaultUri?.fsPath
		};
	}

	private shouldUseSimplified(schema: string): { useSimplified: boolean; isSetting: boolean } {
		const setting = (this.configurationService.getValue('files.simpleDialog.enable') === true);
		const newWindowSetting = (this.configurationService.getValue('window.openFilesInNewWindow') === 'on');
		return {
			useSimplified: ((schema !== Schemas.file) && (schema !== Schemas.vscodeUserData)) || setting,
			isSetting: newWindowSetting
		};
	}

	async pickFileFolderAndOpen(options: IPickAndOpenOptions): Promise<void> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = await this.defaultFilePath(schema);
		}

		const shouldUseSimplified = this.shouldUseSimplified(schema);
		if (shouldUseSimplified.useSimplified) {
			return this.pickFileFolderAndOpenSimplified(schema, options, shouldUseSimplified.isSetting);
		}
		return this.nativeHostService.pickFileFolderAndOpen(this.toNativeOpenDialogOptions(options));
	}

	async pickFileAndOpen(options: IPickAndOpenOptions): Promise<void> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = await this.defaultFilePath(schema);
		}

		const shouldUseSimplified = this.shouldUseSimplified(schema);
		if (shouldUseSimplified.useSimplified) {
			return this.pickFileAndOpenSimplified(schema, options, shouldUseSimplified.isSetting);
		}
		return this.nativeHostService.pickFileAndOpen(this.toNativeOpenDialogOptions(options));
	}

	async pickFolderAndOpen(options: IPickAndOpenOptions): Promise<void> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = await this.defaultFolderPath(schema);
		}

		if (this.shouldUseSimplified(schema).useSimplified) {
			return this.pickFolderAndOpenSimplified(schema, options);
		}
		return this.nativeHostService.pickFolderAndOpen(this.toNativeOpenDialogOptions(options));
	}

	async pickWorkspaceAndOpen(options: IPickAndOpenOptions): Promise<void> {
		options.availableFileSystems = this.getWorkspaceAvailableFileSystems(options);
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = await this.defaultWorkspacePath(schema);
		}

		if (this.shouldUseSimplified(schema).useSimplified) {
			return this.pickWorkspaceAndOpenSimplified(schema, options);
		}
		return this.nativeHostService.pickWorkspaceAndOpen(this.toNativeOpenDialogOptions(options));
	}

	async pickFileToSave(defaultUri: URI, availableFileSystems?: string[]): Promise<URI | undefined> {
		const schema = this.getFileSystemSchema({ defaultUri, availableFileSystems });
		const options = this.getPickFileToSaveDialogOptions(defaultUri, availableFileSystems);
		if (this.shouldUseSimplified(schema).useSimplified) {
			return this.pickFileToSaveSimplified(schema, options);
		} else {
			const result = await this.nativeHostService.showSaveDialog(this.toNativeSaveDialogOptions(options));
			if (result && !result.canceled && result.filePath) {
				const uri = URI.file(result.filePath);

				this.addFileToRecentlyOpened(uri);

				return uri;
			}
		}
		return;
	}

	private toNativeSaveDialogOptions(options: ISaveDialogOptions): SaveDialogOptions & INativeHostOptions {
		options.defaultUri = options.defaultUri ? URI.file(options.defaultUri.path) : undefined;
		return {
			defaultPath: options.defaultUri?.fsPath,
			buttonLabel: options.saveLabel,
			filters: options.filters,
			title: options.title,
			targetWindowId: getActiveWindow().vscodeWindowId
		};
	}

	async showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined> {
		const schema = this.getFileSystemSchema(options);
		if (this.shouldUseSimplified(schema).useSimplified) {
			return this.showSaveDialogSimplified(schema, options);
		}

		const result = await this.nativeHostService.showSaveDialog(this.toNativeSaveDialogOptions(options));
		if (result && !result.canceled && result.filePath) {
			return URI.file(result.filePath);
		}

		return;
	}

	async showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined> {
		const schema = this.getFileSystemSchema(options);
		if (this.shouldUseSimplified(schema).useSimplified) {
			return this.showOpenDialogSimplified(schema, options);
		}

		const newOptions: OpenDialogOptions & { properties: string[] } & INativeHostOptions = {
			title: options.title,
			defaultPath: options.defaultUri?.fsPath,
			buttonLabel: options.openLabel,
			filters: options.filters,
			properties: [],
			targetWindowId: getActiveWindow().vscodeWindowId
		};

		newOptions.properties.push('createDirectory');

		if (options.canSelectFiles) {
			newOptions.properties.push('openFile');
		}

		if (options.canSelectFolders) {
			newOptions.properties.push('openDirectory');
		}

		if (options.canSelectMany) {
			newOptions.properties.push('multiSelections');
		}

		const result = await this.nativeHostService.showOpenDialog(newOptions);
		return result && Array.isArray(result.filePaths) && result.filePaths.length > 0 ? result.filePaths.map(URI.file) : undefined;
	}
}

registerSingleton(IFileDialogService, FileDialogService, InstantiationType.Delayed);
