/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SaveDialogOptions, OpenDialogOptions } from '../../../../base/parts/sandbox/common/electronTypes.js';
import { IHostService } from '../../host/browser/host.js';
import { IPickAndOpenOptions, ISaveDialogOptions, IOpenDialogOptions, IFileDialogService, IDialogService, INativeOpenDialogOptions } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IHistoryService } from '../../history/common/history.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { INativeHostOptions, INativeHostService } from '../../../../platform/native/common/native.js';
import { AbstractFileDialogService } from '../browser/abstractFileDialogService.js';
import { Schemas } from '../../../../base/common/network.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IPathService } from '../../path/common/pathService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';

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
