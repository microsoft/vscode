/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as resources from 'vs/base/common/resources';
import * as objects from 'vs/base/common/objects';
import { RemoteFileService } from 'vs/workbench/services/files/node/remoteFileService';
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
import { Schemas } from 'vs/base/common/network';

interface FileQuickPickItem extends IQuickPickItem {
	uri: URI;
	isFolder: boolean;
}

// Reference: https://en.wikipedia.org/wiki/Filename
const INVALID_FILE_CHARS = isWindows ? /[\\/:\*\?"<>\|]/g : /[\\/]/g;
const WINDOWS_FORBIDDEN_NAMES = /^(con|prn|aux|clock\$|nul|lpt[0-9]|com[0-9])$/i;

export class RemoteFileDialog {
	private fallbackPickerButton;
	private acceptButton = { iconPath: this.getDialogIcons('accept'), tooltip: nls.localize('remoteFileDialog.accept', 'Select Item') };
	private currentFolder: URI;
	private filePickBox: IQuickPick<FileQuickPickItem>;
	private allowFileSelection: boolean;
	private allowFolderSelection: boolean;
	private remoteAuthority: string | undefined;
	private requiresTrailing: boolean;
	private userValue: string;
	private scheme: string = REMOTE_HOST_SCHEME;

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
		this.setScheme(options.defaultUri, options.availableFileSystems);
		const newOptions = this.getOptions(options);
		if (!newOptions) {
			return Promise.resolve(undefined);
		}

		const openFileString = nls.localize('remoteFileDialog.localFileFallback', 'Open Local File');
		const openFolderString = nls.localize('remoteFileDialog.localFolderFallback', 'Open Local Folder');
		const openFileFolderString = nls.localize('remoteFileDialog.localFileFolderFallback', 'Open Local File or Folder');
		let tooltip = options.canSelectFiles ? (options.canSelectFolders ? openFileFolderString : openFileString) : openFolderString;
		this.fallbackPickerButton = { iconPath: this.getDialogIcons('folder'), tooltip };
		return this.pickResource(newOptions).then(async fileFolderUri => {
			if (fileFolderUri) {
				const stat = await this.remoteFileService.resolveFile(fileFolderUri);
				return <IURIToOpen[]>[{ uri: fileFolderUri, typeHint: stat.isDirectory ? 'folder' : 'file' }];

			}
			return Promise.resolve(undefined);
		});
	}

	public showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined> {
		this.setScheme(options.defaultUri, options.availableFileSystems);
		this.requiresTrailing = true;
		const newOptions = this.getOptions(options);
		if (!newOptions) {
			return Promise.resolve(undefined);
		}
		this.fallbackPickerButton = { iconPath: this.getDialogIcons('folder'), tooltip: nls.localize('remoteFileDialog.localSaveFallback', 'Save Local File') };
		newOptions.canSelectFolders = true;
		newOptions.canSelectFiles = true;
		return new Promise<URI | undefined>((resolve) => {
			this.pickResource(newOptions, true).then(folderUri => {
				resolve(folderUri);
			});
		});
	}

	private getOptions(options: ISaveDialogOptions | IOpenDialogOptions): IOpenDialogOptions | undefined {
		const defaultUri = options.defaultUri ? options.defaultUri : URI.from({ scheme: this.scheme, authority: this.remoteAuthority, path: '/' });
		if ((this.scheme !== Schemas.file) && !this.remoteFileService.canHandleResource(defaultUri)) {
			this.notificationService.info(nls.localize('remoteFileDialog.notConnectedToRemote', 'File system provider for {0} is not available.', defaultUri.toString()));
			return undefined;
		}
		const newOptions: IOpenDialogOptions = objects.deepClone(options);
		newOptions.defaultUri = defaultUri;
		return newOptions;
	}

	private remoteUriFrom(path: string): URI {
		path = path.replace(/\\/g, '/');
		return URI.from({ scheme: this.scheme, authority: this.remoteAuthority, path });
	}

	private setScheme(defaultUri: URI | undefined, available: string[] | undefined) {
		this.scheme = defaultUri ? defaultUri.scheme : (available ? available[0] : Schemas.file);
	}

	private async pickResource(options: IOpenDialogOptions, isSave: boolean = false): Promise<URI | undefined> {
		this.allowFolderSelection = !!options.canSelectFolders;
		this.allowFileSelection = !!options.canSelectFiles;
		let homedir: URI = options.defaultUri ? options.defaultUri : this.workspaceContextService.getWorkspace().folders[0].uri;
		let trailing: string | undefined;
		let stat: IFileStat | undefined;
		let ext: string = resources.extname(options.defaultUri);
		if (options.defaultUri) {
			try {
				stat = await this.remoteFileService.resolveFile(options.defaultUri);
			} catch (e) {
				// The file or folder doesn't exist
			}
			if (!stat || !stat.isDirectory) {
				homedir = resources.dirname(options.defaultUri);
				trailing = resources.basename(options.defaultUri);
			}
			// append extension
			if (isSave && !ext && options.filters) {
				for (let i = 0; i < options.filters.length; i++) {
					if (options.filters[i].extensions[0] !== '*') {
						ext = '.' + options.filters[i].extensions[0];
						trailing = trailing ? trailing + ext : ext;
						break;
					}
				}
			}
		}

		return new Promise<URI | undefined>((resolve) => {
			this.filePickBox = this.quickInputService.createQuickPick<FileQuickPickItem>();
			this.filePickBox.matchOnLabel = false;
			this.filePickBox.autoFocusOnList = false;

			let isResolved = false;
			let isAcceptHandled = false;
			this.currentFolder = homedir;

			if (options.availableFileSystems && options.availableFileSystems.length > 1) {
				this.filePickBox.buttons = [this.fallbackPickerButton, this.acceptButton];
			} else {
				this.filePickBox.buttons = [this.acceptButton];
			}
			this.filePickBox.onDidTriggerButton(button => {
				if (button === this.fallbackPickerButton) {
					if (options.availableFileSystems) {
						options.availableFileSystems.shift();
					}
					isResolved = true;
					if (this.requiresTrailing) {
						this.fileDialogService.showSaveDialog(options).then(result => {
							this.filePickBox.hide();
							resolve(result);
						});
					} else {
						this.fileDialogService.showOpenDialog(options).then(result => {
							this.filePickBox.hide();
							resolve(result ? result[0] : undefined);
						});
					}
					this.filePickBox.hide();
				} else { // accept button
					const resolveValue = this.remoteUriFrom(this.filePickBox.value);
					this.validate(resolveValue).then(validated => {
						if (validated) {
							isResolved = true;
							this.filePickBox.hide();
							resolve(resolveValue);
						}
					});
				}
			});

			this.filePickBox.title = options.title;
			this.filePickBox.value = this.pathFromUri(this.currentFolder);
			this.filePickBox.items = [];
			this.filePickBox.onDidAccept(_ => {
				if (isAcceptHandled || this.filePickBox.busy) {
					return;
				}

				isAcceptHandled = true;
				this.onDidAccept().then(resolveValue => {
					if (resolveValue) {
						isResolved = true;
						this.filePickBox.hide();
						resolve(resolveValue);
					}
				});
			});
			this.filePickBox.onDidChangeActive(i => {
				isAcceptHandled = false;
			});

			this.filePickBox.onDidChangeValue(async value => {
				if (value !== this.userValue) {
					const trimmedPickBoxValue = ((this.filePickBox.value.length > 1) && this.endsWithSlash(this.filePickBox.value)) ? this.filePickBox.value.substr(0, this.filePickBox.value.length - 1) : this.filePickBox.value;
					const valueUri = this.remoteUriFrom(trimmedPickBoxValue);
					if (!resources.isEqual(this.currentFolder, valueUri, true)) {
						await this.tryUpdateItems(value, valueUri);
					}
					this.setActiveItems(value);
					this.userValue = value;
				} else {
					this.filePickBox.activeItems = [];
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
			if (trailing) {
				this.filePickBox.valueSelection = [this.filePickBox.value.length - trailing.length, this.filePickBox.value.length - ext.length];
			}
			this.userValue = this.filePickBox.value;
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
			if (!this.requiresTrailing && resources.isEqual(this.currentFolder, inputUri, true)) {
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
			if (await this.validate(resolveValue)) {
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
		if (this.endsWithSlash(value) || (!resources.isEqual(this.currentFolder, resources.dirname(valueUri), true) && resources.isEqualOrParent(this.currentFolder, resources.dirname(valueUri), true))) {
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
				if (!resources.isEqual(this.currentFolder, inputUriDirname, true)) {
					let statWithoutTrailing: IFileStat | undefined;
					try {
						statWithoutTrailing = await this.remoteFileService.resolveFile(inputUriDirname);
					} catch (e) {
						// do nothing
					}
					if (statWithoutTrailing && statWithoutTrailing.isDirectory && (resources.basename(valueUri) !== '.')) {
						this.updateItems(inputUriDirname, resources.basename(valueUri));
					}
				}
			}
		}
	}

	private setActiveItems(value: string) {
		if (!this.userValue || (value !== this.userValue.substring(0, value.length))) {
			const inputBasename = resources.basename(this.remoteUriFrom(value));
			let hasMatch = false;
			for (let i = 0; i < this.filePickBox.items.length; i++) {
				const item = <FileQuickPickItem>this.filePickBox.items[i];
				const itemBasename = resources.basename(item.uri);
				if ((itemBasename.length >= inputBasename.length) && (itemBasename.substr(0, inputBasename.length).toLowerCase() === inputBasename.toLowerCase())) {
					this.filePickBox.activeItems = [item];
					this.filePickBox.value = this.filePickBox.value + itemBasename.substr(inputBasename.length);
					this.filePickBox.valueSelection = [value.length, this.filePickBox.value.length];
					hasMatch = true;
					break;
				}
			}
			if (!hasMatch) {
				this.filePickBox.activeItems = [];
			}
		}
	}

	private async validate(uri: URI): Promise<boolean> {
		let stat: IFileStat | undefined;
		let statDirname: IFileStat | undefined;
		try {
			statDirname = await this.remoteFileService.resolveFile(resources.dirname(uri));
			stat = await this.remoteFileService.resolveFile(uri);
		} catch (e) {
			// do nothing
		}

		if (this.requiresTrailing) { // save
			if (stat && stat.isDirectory) {
				// Can't do this
				return Promise.resolve(false);
			} else if (stat) {
				// This is replacing a file. Not supported yet.
				return Promise.resolve(false);
			} else if (!this.isValidBaseName(resources.basename(uri))) {
				// Filename not allowed
				return Promise.resolve(false);
			} else if (!statDirname || !statDirname.isDirectory) {
				// Folder to save in doesn't exist
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
		this.filePickBox.value = trailing ? this.pathFromUri(resources.joinPath(newFolder, trailing)) : this.pathFromUri(newFolder, true);
		this.filePickBox.busy = true;
		this.createItems(this.currentFolder).then(items => {
			this.filePickBox.items = items;
			if (this.allowFolderSelection) {
				this.filePickBox.activeItems = [];
			}
			this.filePickBox.busy = false;
		});
	}

	private pathFromUri(uri: URI, endWithSeparator: boolean = false): string {
		const sep = this.labelService.getSeparator(uri.scheme, uri.authority);
		let result: string;
		if (sep === '/') {
			result = uri.fsPath.replace(/\\/g, sep);
		} else {
			result = uri.fsPath.replace(/\//g, sep);
		}
		if (endWithSeparator && !this.endsWithSlash(result)) {
			result = result + sep;
		}
		return result;
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
		const child = this.pathFromUri(fullPath, true);
		const parent = this.pathFromUri(resources.dirname(fullPath), true);
		return child.substring(parent.length);
	}

	private createBackItem(currFolder: URI): FileQuickPickItem | null {
		const parentFolder = resources.dirname(currFolder)!;
		if (!resources.isEqual(currFolder, parentFolder, true)) {
			return { label: '..', uri: resources.dirname(currFolder), isFolder: true };
		}
		return null;
	}

	private async createItems(currentFolder: URI): Promise<FileQuickPickItem[]> {
		const result: FileQuickPickItem[] = [];

		const backDir = this.createBackItem(currentFolder);
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
		const sorted = result.sort((i1, i2) => {
			if (i1.isFolder !== i2.isFolder) {
				return i1.isFolder ? -1 : 1;
			}
			const trimmed1 = this.endsWithSlash(i1.label) ? i1.label.substr(0, i1.label.length - 1) : i1.label;
			const trimmed2 = this.endsWithSlash(i2.label) ? i2.label.substr(0, i2.label.length - 1) : i2.label;
			return trimmed1.localeCompare(trimmed2);
		});

		if (backDir) {
			sorted.unshift(backDir);
		}
		return sorted;
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

	private getDialogIcons(name: string): { light: URI, dark: URI } {
		return {
			dark: URI.parse(require.toUrl(`vs/workbench/services/dialogs/electron-browser/media/dark/${name}.svg`)),
			light: URI.parse(require.toUrl(`vs/workbench/services/dialogs/electron-browser/media/light/${name}.svg`))
		};
	}
}