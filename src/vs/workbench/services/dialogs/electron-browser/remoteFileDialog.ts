/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as resources from 'vs/base/common/resources';
import * as objects from 'vs/base/common/objects';
import { RemoteFileService } from 'vs/workbench/services/files/electron-browser/remoteFileService';
import { IFileService, IFileStat, FileKind } from 'vs/platform/files/common/files';
import { IQuickInputService, IQuickPickItem, IQuickPick } from 'vs/platform/quickinput/common/quickInput';
import { URI } from 'vs/base/common/uri';
import { isWindows } from 'vs/base/common/platform';
import { ISaveDialogOptions, IOpenDialogOptions, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { IWindowService, IURIToOpen } from 'vs/platform/windows/common/windows';
import { ILabelService } from 'vs/platform/label/common/label';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';

interface FileQuickPickItem extends IQuickPickItem {
	uri: URI;
	isFolder: boolean;
}

// Reference: https://en.wikipedia.org/wiki/Filename
const INVALID_FILE_CHARS = isWindows ? /[\\/:\*\?"<>\|]/g : /[\\/]/g;
const WINDOWS_FORBIDDEN_NAMES = /^(con|prn|aux|clock\$|nul|lpt[0-9]|com[0-9])$/i;

export class RemoteFileDialog {
	private fallbackPickerButton = { iconPath: this.getAlternateDialogIcons(), tooltip: 'Use Alternate File System' };

	private currentFolder: URI;
	private filePickBox: IQuickPick<FileQuickPickItem>;
	private allowFileSelection: boolean;
	private allowFolderSelection: boolean;
	private remoteAuthority: string | undefined;
	private requiresTrailing: boolean;

	constructor(
		@IFileService private readonly remoteFileService: RemoteFileService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWindowService private readonly windowService: IWindowService,
		@ILabelService private readonly labelService: ILabelService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
	) {
		this.remoteAuthority = this.windowService.getConfiguration().remoteAuthority;
	}

	public async showOpenDialog(options: IOpenDialogOptions = {}): Promise<IURIToOpen[] | undefined> {
		const defaultUri = options.defaultUri ? options.defaultUri : URI.from({ scheme: REMOTE_HOST_SCHEME, authority: this.remoteAuthority, path: '/' });
		if (!this.remoteFileService.canHandleResource(defaultUri)) {
			this.notificationService.info(nls.localize('remoteFileDialog.notConnectedToRemote', 'File system provider for {0} is not available.', defaultUri.toString()));
			return Promise.resolve(undefined);
		}

		const remoteOptions: IOpenDialogOptions = objects.deepClone(options);
		remoteOptions.defaultUri = defaultUri;
		return this.pickResource(remoteOptions).then(async fileFolderUri => {
			if (fileFolderUri) {
				const stat = await this.remoteFileService.resolveFile(fileFolderUri);
				return <IURIToOpen[]>[{ uri: fileFolderUri, typeHint: stat.isDirectory ? 'folder' : 'file' }];

			}
			return Promise.resolve(undefined);
		});
	}

	public showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined> {
		this.requiresTrailing = true;
		const defaultUri = options.defaultUri ? options.defaultUri : URI.from({ scheme: REMOTE_HOST_SCHEME, authority: this.remoteAuthority, path: '/' });
		if (!this.remoteFileService.canHandleResource(defaultUri)) {
			this.notificationService.info(nls.localize('remoteFileDialog.notConnectedToRemote', 'File system provider for {0} is not available.', defaultUri.toString()));
			return Promise.resolve(undefined);
		}
		const remoteOptions: IOpenDialogOptions = objects.deepClone(options);
		remoteOptions.defaultUri = resources.dirname(defaultUri);
		remoteOptions.canSelectFolders = true;
		remoteOptions.canSelectFiles = true;
		return new Promise<URI | undefined>((resolve) => {
			this.pickResource(remoteOptions, resources.basename(defaultUri)).then(folderUri => {
				resolve(folderUri);
			});
		});
	}

	private remoteUriFrom(path: string): URI {
		return URI.from({ scheme: REMOTE_HOST_SCHEME, authority: this.remoteAuthority, path });
	}

	private async pickResource(options: IOpenDialogOptions, trailing?: string): Promise<URI | undefined> {
		this.allowFolderSelection = !!options.canSelectFolders;
		this.allowFileSelection = !!options.canSelectFiles;
		const defaultUri = options.defaultUri;
		let homedir = defaultUri && defaultUri.scheme === REMOTE_HOST_SCHEME ? defaultUri : this.workspaceContextService.getWorkspace().folders[0].uri;

		return new Promise<URI | undefined>((resolve) => {
			this.filePickBox = this.quickInputService.createQuickPick<FileQuickPickItem>();
			this.filePickBox.matchOnLabel = false;
			this.filePickBox.autoFocusOnList = false;

			let isResolved = false;
			let isAcceptHandled = false;
			this.currentFolder = homedir;

			if (options.availableFileSystems && options.availableFileSystems.length > 1) {
				this.filePickBox.buttons = [this.fallbackPickerButton];
			}
			this.filePickBox.onDidTriggerButton(button => {
				if (button === this.fallbackPickerButton) {
					options.availableFileSystems.shift();
					isResolved = true;
					if (this.requiresTrailing) {
						this.fileDialogService.showSaveDialog(options).then(result => {
							resolve(result);
						});
					} else {
						this.fileDialogService.showOpenDialog(options).then(result => {
							resolve(result ? result[0] : undefined);
						});
					}
				}
				this.filePickBox.hide();
			});

			this.filePickBox.title = options.title;
			this.filePickBox.value = this.labelService.getUriLabel(this.currentFolder);
			this.filePickBox.items = [];
			this.filePickBox.onDidAccept(_ => {
				if (isAcceptHandled || this.filePickBox.busy) {
					return;
				}

				isAcceptHandled = true;
				this.onDidAccept().then(resolveValue => {
					if (resolveValue) {
						resolve(resolveValue);
					}
				});
			});
			this.filePickBox.onDidChangeActive(i => {
				isAcceptHandled = false;
			});

			this.filePickBox.onDidChangeValue(value => {
				const trimmedPickBoxValue = ((this.filePickBox.value.length > 1) && this.endsWithSlash(this.filePickBox.value)) ? this.filePickBox.value.substr(0, this.filePickBox.value.length - 1) : this.filePickBox.value;
				const valueUri = this.remoteUriFrom(trimmedPickBoxValue);
				if (!resources.isEqual(this.currentFolder, valueUri)) {
					this.tryUpdateItems(value, valueUri);
					this.setActiveItems(value);
				}
			});
			this.filePickBox.onDidHide(() => {
				if (!isResolved) {
					resolve(undefined);
				}
				this.filePickBox.dispose();
			});

			this.filePickBox.show();
			this.updateItems(homedir, trailing);
		});
	}

	private async onDidAccept(): Promise<URI | undefined> {
		let resolveValue: URI | undefined;
		let navigateValue: URI | undefined;
		const trimmedPickBoxValue = ((this.filePickBox.value.length > 1) && this.endsWithSlash(this.filePickBox.value)) ? this.filePickBox.value.substr(0, this.filePickBox.value.length - 1) : this.filePickBox.value;
		const inputUri = this.remoteUriFrom(trimmedPickBoxValue);
		const inputUriDirname = resources.dirname(inputUri);
		let stat: IFileStat | undefined;
		let statDirname: IFileStat | undefined;
		try {
			statDirname = await this.remoteFileService.resolveFile(inputUriDirname);
			stat = await this.remoteFileService.resolveFile(inputUri);
		} catch (e) {
			// do nothing
		}

		// Find resolve value
		if (this.filePickBox.activeItems.length === 0) {
			if (!this.requiresTrailing && resources.isEqual(this.currentFolder, inputUri)) {
				resolveValue = inputUri;
			} else if (this.requiresTrailing && statDirname && statDirname.isDirectory) {
				resolveValue = inputUri;
			} else if (stat && stat.isDirectory) {
				navigateValue = inputUri;
			}
		} else if (this.filePickBox.activeItems.length === 1) {
			const item = this.filePickBox.selectedItems[0];
			if (item) {
				if (!item.isFolder) {
					resolveValue = item.uri;
				} else {
					navigateValue = item.uri;
				}
			}
		}

		if (resolveValue) {
			if (this.validate(resolveValue)) {
				return Promise.resolve(resolveValue);
			}
		} else if (navigateValue) {
			// Try to navigate into the folder
			this.updateItems(navigateValue);
		} else {
			// validation error. Path does not exist.
		}
		return Promise.resolve(undefined);
	}

	private async tryUpdateItems(value: string, valueUri: URI) {
		if (this.endsWithSlash(value) || (!resources.isEqual(this.currentFolder, resources.dirname(valueUri)) && resources.isEqualOrParent(this.currentFolder, resources.dirname(valueUri)))) {
			let stat: IFileStat | undefined;
			try {
				stat = await this.remoteFileService.resolveFile(valueUri);
			} catch (e) {
				// do nothing
			}
			if (stat && stat.isDirectory && (resources.basename(valueUri) !== '.')) {
				this.updateItems(valueUri);
			} else {
				const inputUriDirname = resources.dirname(valueUri);
				if (!resources.isEqual(this.currentFolder, inputUriDirname)) {
					const statWithoutTrailing = await this.remoteFileService.resolveFile(inputUriDirname);
					if (statWithoutTrailing && statWithoutTrailing.isDirectory && (resources.basename(valueUri) !== '.')) {
						this.updateItems(inputUriDirname, resources.basename(valueUri));
					}
				}
			}
		}
	}

	private setActiveItems(value: string) {
		const inputBasename = resources.basename(this.remoteUriFrom(value));
		let hasMatch = false;
		for (let i = 0; i < this.filePickBox.items.length; i++) {
			const item = <FileQuickPickItem>this.filePickBox.items[i];
			const itemBasename = resources.basename(item.uri);
			if ((itemBasename.length >= inputBasename.length) && (itemBasename.substr(0, inputBasename.length) === inputBasename)) {
				this.filePickBox.activeItems = [item];
				hasMatch = true;
				break;
			}
		}
		if (!hasMatch) {
			this.filePickBox.activeItems = [];
		}
	}

	private async validate(uri: URI): Promise<boolean> {
		let stat: IFileStat | undefined;
		let statDirname: IFileStat | undefined;
		try {
			stat = await this.remoteFileService.resolveFile(uri);
			statDirname = await this.remoteFileService.resolveFile(resources.dirname(uri));
		} catch (e) {
			// do nothing
		}

		if (this.requiresTrailing) { // save
			if (statDirname.isDirectory) {
				// Can't do this
				return Promise.resolve(false);
			} else if (stat) {
				// This is replacing a file. Not supported yet.
				return Promise.resolve(false);
			} else if (!this.isValidBaseName(resources.basename(uri))) {
				// Filename not allowed
				return Promise.resolve(false);
			}
		} else { // open
			if (!stat) {
				// File or folder doesn't exist
				return Promise.resolve(false);
			} else if (stat.isDirectory && !this.allowFolderSelection) {
				// Folder selected when folder selection not permitted
				return Promise.resolve(false);
			} else if (!stat.isDirectory && !this.allowFileSelection) {
				// File selected when file selection not permitted
				return Promise.resolve(false);
			}
		}
		return Promise.resolve(true);
	}

	private updateItems(newFolder: URI, trailing?: string) {
		this.currentFolder = newFolder;
		this.filePickBox.value = trailing ? this.labelService.getUriLabel(resources.joinPath(newFolder, trailing)) : this.labelService.getUriLabel(newFolder, { endWithSeparator: true });
		this.filePickBox.busy = true;
		this.createItems(this.currentFolder).then(items => {
			this.filePickBox.items = items;
			if (this.allowFolderSelection) {
				this.filePickBox.activeItems = [];
			}
			this.filePickBox.busy = false;
		});
	}

	private isValidBaseName(name: string): boolean {
		if (!name || name.length === 0 || /^\s+$/.test(name)) {
			return false; // require a name that is not just whitespace
		}

		INVALID_FILE_CHARS.lastIndex = 0; // the holy grail of software development
		if (INVALID_FILE_CHARS.test(name)) {
			return false; // check for certain invalid file characters
		}

		if (isWindows && WINDOWS_FORBIDDEN_NAMES.test(name)) {
			return false; // check for certain invalid file names
		}

		if (name === '.' || name === '..') {
			return false; // check for reserved values
		}

		if (isWindows && name[name.length - 1] === '.') {
			return false; // Windows: file cannot end with a "."
		}

		if (isWindows && name.length !== name.trim().length) {
			return false; // Windows: file cannot end with a whitespace
		}

		return true;
	}

	private endsWithSlash(s: string) {
		return /[\/\\]$/.test(s);
	}

	private basenameWithTrailingSlash(fullPath: URI): string {
		const child = this.labelService.getUriLabel(fullPath, { endWithSeparator: true });
		const parent = this.labelService.getUriLabel(resources.dirname(fullPath), { endWithSeparator: true });
		return child.substring(parent.length);
	}

	private createBackItem(currFolder: URI): FileQuickPickItem | null {
		const parentFolder = resources.dirname(currFolder)!;
		if (!resources.isEqual(currFolder, parentFolder)) {
			return { label: '..', uri: resources.dirname(currFolder), isFolder: true };
		}
		return null;
	}

	private async createItems(currentFolder: URI): Promise<FileQuickPickItem[]> {
		const result: FileQuickPickItem[] = [];

		const backDir = this.createBackItem(currentFolder);
		if (backDir) {
			result.push(backDir);
		}
		try {
			const fileNames = await this.remoteFileService.readFolder(currentFolder);
			const items = await Promise.all(fileNames.map(fileName => this.createItem(fileName, currentFolder)));
			for (let item of items) {
				if (item) {
					result.push(item);
				}
			}
		} catch (e) {
			// ignore
			console.log(e);
		}
		return result.sort((i1, i2) => {
			if (i1.isFolder !== i2.isFolder) {
				return i1.isFolder ? -1 : 1;
			}
			return i1.label.localeCompare(i2.label);
		});
	}

	private async createItem(filename: string, parent: URI): Promise<FileQuickPickItem | null> {
		let fullPath = resources.joinPath(parent, filename);
		try {
			const stat = await this.remoteFileService.resolveFile(fullPath);
			if (stat.isDirectory) {
				filename = this.basenameWithTrailingSlash(fullPath);
				return { label: filename, uri: fullPath, isFolder: true, iconClasses: getIconClasses(this.modelService, this.modeService, fullPath || undefined, FileKind.FOLDER) };
			} else if (!stat.isDirectory && this.allowFileSelection) {
				return { label: filename, uri: fullPath, isFolder: false, iconClasses: getIconClasses(this.modelService, this.modeService, fullPath || undefined) };
			}
			return null;
		} catch (e) {
			return null;
		}
	}

	private getAlternateDialogIcons(): { light: URI, dark: URI } {
		return {
			dark: URI.parse(require.toUrl(`vs/workbench/services/dialogs/media/dark/Folder.svg`)),
			light: URI.parse(require.toUrl(`vs/workbench/services/dialogs/media/light/Folder_inverse.svg`))
		};
	}
}