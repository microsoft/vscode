/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import product from 'vs/platform/node/product';
import Severity from 'vs/base/common/severity';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { IWindowService, INativeOpenDialogOptions, OpenDialogOptions, IURIToOpen, FileFilter } from 'vs/platform/windows/common/windows';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { IDialogService, IConfirmation, IConfirmationResult, IDialogOptions, IPickAndOpenOptions, ISaveDialogOptions, IOpenDialogOptions, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import * as resources from 'vs/base/common/resources';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { RemoteFileDialog } from 'vs/workbench/services/dialogs/electron-browser/remoteFileDialog';
import { WORKSPACE_EXTENSION } from 'vs/platform/workspaces/common/workspaces';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';

interface IMassagedMessageBoxOptions {

	/**
	 * OS massaged message box options.
	 */
	options: Electron.MessageBoxOptions;

	/**
	 * Since the massaged result of the message box options potentially
	 * changes the order of buttons, we have to keep a map of these
	 * changes so that we can still return the correct index to the caller.
	 */
	buttonIndexMap: number[];
}

export class DialogService implements IDialogService {

	_serviceBrand: any;

	constructor(
		@IWindowService private readonly windowService: IWindowService,
		@ILogService private readonly logService: ILogService
	) { }

	confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		this.logService.trace('DialogService#confirm', confirmation.message);

		const { options, buttonIndexMap } = this.massageMessageBoxOptions(this.getConfirmOptions(confirmation));

		return this.windowService.showMessageBox(options).then(result => {
			return {
				confirmed: buttonIndexMap[result.button] === 0 ? true : false,
				checkboxChecked: result.checkboxChecked
			} as IConfirmationResult;
		});
	}

	private getConfirmOptions(confirmation: IConfirmation): Electron.MessageBoxOptions {
		const buttons: string[] = [];
		if (confirmation.primaryButton) {
			buttons.push(confirmation.primaryButton);
		} else {
			buttons.push(nls.localize({ key: 'yesButton', comment: ['&& denotes a mnemonic'] }, "&&Yes"));
		}

		if (confirmation.secondaryButton) {
			buttons.push(confirmation.secondaryButton);
		} else if (typeof confirmation.secondaryButton === 'undefined') {
			buttons.push(nls.localize('cancelButton', "Cancel"));
		}

		const opts: Electron.MessageBoxOptions = {
			title: confirmation.title,
			message: confirmation.message,
			buttons,
			cancelId: 1
		};

		if (confirmation.detail) {
			opts.detail = confirmation.detail;
		}

		if (confirmation.type) {
			opts.type = confirmation.type;
		}

		if (confirmation.checkbox) {
			opts.checkboxLabel = confirmation.checkbox.label;
			opts.checkboxChecked = confirmation.checkbox.checked;
		}

		return opts;
	}

	show(severity: Severity, message: string, buttons: string[], dialogOptions?: IDialogOptions): Promise<number> {
		this.logService.trace('DialogService#show', message);

		const { options, buttonIndexMap } = this.massageMessageBoxOptions({
			message,
			buttons,
			type: (severity === Severity.Info) ? 'question' : (severity === Severity.Error) ? 'error' : (severity === Severity.Warning) ? 'warning' : 'none',
			cancelId: dialogOptions ? dialogOptions.cancelId : undefined,
			detail: dialogOptions ? dialogOptions.detail : undefined
		});

		return this.windowService.showMessageBox(options).then(result => buttonIndexMap[result.button]);
	}

	private massageMessageBoxOptions(options: Electron.MessageBoxOptions): IMassagedMessageBoxOptions {
		let buttonIndexMap = (options.buttons || []).map((button, index) => index);
		let buttons = (options.buttons || []).map(button => mnemonicButtonLabel(button));
		let cancelId = options.cancelId;

		// Linux: order of buttons is reverse
		// macOS: also reverse, but the OS handles this for us!
		if (isLinux) {
			buttons = buttons.reverse();
			buttonIndexMap = buttonIndexMap.reverse();
		}

		// Default Button (always first one)
		options.defaultId = buttonIndexMap[0];

		// Cancel Button
		if (typeof cancelId === 'number') {

			// Ensure the cancelId is the correct one from our mapping
			cancelId = buttonIndexMap[cancelId];

			// macOS/Linux: the cancel button should always be to the left of the primary action
			// if we see more than 2 buttons, move the cancel one to the left of the primary
			if (!isWindows && buttons.length > 2 && cancelId !== 1) {
				const cancelButton = buttons[cancelId];
				buttons.splice(cancelId, 1);
				buttons.splice(1, 0, cancelButton);

				const cancelButtonIndex = buttonIndexMap[cancelId];
				buttonIndexMap.splice(cancelId, 1);
				buttonIndexMap.splice(1, 0, cancelButtonIndex);

				cancelId = 1;
			}
		}

		options.buttons = buttons;
		options.cancelId = cancelId;
		options.noLink = true;
		options.title = options.title || product.nameLong;

		return { options, buttonIndexMap };
	}
}

export class FileDialogService implements IFileDialogService {

	_serviceBrand: any;

	constructor(
		@IWindowService private readonly windowService: IWindowService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IHistoryService private readonly historyService: IHistoryService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	defaultFilePath(schemeFilter = this.getSchemeFilterForWindow()): URI | undefined {

		// Check for last active file first...
		let candidate = this.historyService.getLastActiveFile(schemeFilter);

		// ...then for last active file root
		if (!candidate) {
			candidate = this.historyService.getLastActiveWorkspaceRoot(schemeFilter);
		}

		return candidate && resources.dirname(candidate) || undefined;
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

	pickFileFolderAndOpen(options: IPickAndOpenOptions): Promise<any> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = this.defaultFilePath(schema);
		}

		if (schema !== Schemas.file) {
			const title = nls.localize('openFileOrFolder.title', 'Open File Or Folder');
			const availableFileSystems = [schema, Schemas.file]; // always allow file as well
			return this.pickRemoteResourceAndOpen({ canSelectFiles: true, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems }, !!options.forceNewWindow, true);
		}

		return this.windowService.pickFileFolderAndOpen(this.toNativeOpenDialogOptions(options));
	}

	pickFileAndOpen(options: IPickAndOpenOptions): Promise<any> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = this.defaultFilePath(schema);
		}

		if (schema !== Schemas.file) {
			const title = nls.localize('openFile.title', 'Open File');
			const availableFileSystems = [schema, Schemas.file]; // always allow file as well
			return this.pickRemoteResourceAndOpen({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems }, !!options.forceNewWindow, true);
		}

		return this.windowService.pickFileAndOpen(this.toNativeOpenDialogOptions(options));
	}

	pickFolderAndOpen(options: IPickAndOpenOptions): Promise<any> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = this.defaultFolderPath(schema);
		}

		if (schema !== Schemas.file) {
			const title = nls.localize('openFolder.title', 'Open Folder');
			const availableFileSystems = [schema, Schemas.file]; // always allow file as well
			return this.pickRemoteResourceAndOpen({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems }, !!options.forceNewWindow, false);
		}

		return this.windowService.pickFolderAndOpen(this.toNativeOpenDialogOptions(options));
	}

	pickWorkspaceAndOpen(options: IPickAndOpenOptions): Promise<void> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = this.defaultWorkspacePath(schema);
		}

		if (schema !== Schemas.file) {
			const title = nls.localize('openWorkspace.title', 'Open Workspace');
			const filters: FileFilter[] = [{ name: nls.localize('filterName.workspace', 'Workspace'), extensions: [WORKSPACE_EXTENSION] }];
			const availableFileSystems = [schema, Schemas.file]; // always allow file as well
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
		if (schema !== Schemas.file) {
			options.availableFileSystems = [schema, Schemas.file]; // always allow file as well
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
			return void 0;
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