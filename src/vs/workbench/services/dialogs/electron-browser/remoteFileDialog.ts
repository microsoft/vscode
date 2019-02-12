/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as resources from 'vs/base/common/resources';
import { RemoteFileService } from 'vs/workbench/services/files/electron-browser/remoteFileService';
import { IFileService } from 'vs/platform/files/common/files';
import { IQuickInputService, IQuickPickItem, IQuickPick } from 'vs/platform/quickinput/common/quickInput';
import { URI } from 'vs/base/common/uri';
import { isWindows } from 'vs/base/common/platform';
import { ISaveDialogOptions, IOpenDialogOptions } from 'vs/platform/dialogs/common/dialogs';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { IWindowService, IURIToOpen } from 'vs/platform/windows/common/windows';
import { ILabelService } from 'vs/platform/label/common/label';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { INotificationService } from 'vs/platform/notification/common/notification';

interface FileQuickPickItem extends IQuickPickItem {
	uri: URI;
	isFolder: boolean;
}

// Reference: https://en.wikipedia.org/wiki/Filename
const INVALID_FILE_CHARS = isWindows ? /[\\/:\*\?"<>\|]/g : /[\\/]/g;
const WINDOWS_FORBIDDEN_NAMES = /^(con|prn|aux|clock\$|nul|lpt[0-9]|com[0-9])$/i;

export class RemoteFileDialog {

	private acceptButton = { iconPath: this.getIcons('accept.svg'), tooltip: 'Select' };
	private cancelButton = { iconPath: this.getIcons('cancel.svg'), tooltip: 'Cancel' };
	private currentFolder: URI;
	private filePickBox: IQuickPick<FileQuickPickItem>;
	private allowFileSelection: boolean;
	private allowFolderSelection: boolean;
	private remoteAuthority: string | undefined;

	constructor(
		@IFileService private readonly remoteFileService: RemoteFileService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWindowService private readonly windowService: IWindowService,
		@ILabelService private readonly labelService: ILabelService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		this.remoteAuthority = this.windowService.getConfiguration().remoteAuthority;
	}

	public async showOpenDialog(options: IOpenDialogOptions = {}): Promise<IURIToOpen[] | undefined> {
		const defaultUri = options.defaultUri ? options.defaultUri : URI.from({ scheme: REMOTE_HOST_SCHEME, authority: this.remoteAuthority, path: '/' });
		if (!this.remoteFileService.canHandleResource(defaultUri)) {
			this.notificationService.info(nls.localize('remoteFileDialog.notConnectedToRemote', 'File system provider for {0} is not available.', defaultUri.toString()));
			return Promise.resolve(undefined);
		}

		const title = nls.localize('remoteFileDialog.openTitle', 'Open File or Folder');
		return this.pickResource({ title, defaultUri, canSelectFiles: true, canSelectFolders: true }).then(async fileFolderUri => {
			if (fileFolderUri) {
				const stat = await this.remoteFileService.resolveFile(fileFolderUri);
				return [{ uri: fileFolderUri, type: stat.isDirectory ? 'folder' : 'file' }];
			}
			return Promise.resolve(undefined);
		});
	}

	public showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined> {
		const defaultUri = options.defaultUri ? options.defaultUri : URI.from({ scheme: REMOTE_HOST_SCHEME, authority: this.remoteAuthority, path: '/' });
		if (!this.remoteFileService.canHandleResource(defaultUri)) {
			this.notificationService.info(nls.localize('remoteFileDialog.notConnectedToRemote', 'File system provider for {0} is not available.', defaultUri.toString()));
			return Promise.resolve(undefined);
		}

		return new Promise<URI | undefined>((resolve) => {
			let saveNameBox = this.quickInputService.createInputBox();
			saveNameBox.title = options.title;
			saveNameBox.placeholder = nls.localize('remoteFileDialog.saveTitle', 'Enter the new name of the file');
			saveNameBox.value = '';
			saveNameBox.totalSteps = 2;
			saveNameBox.step = 1;
			saveNameBox.onDidChangeValue(v => {
				saveNameBox.validationMessage = this.isValidBaseName(v) ? void 0 : nls.localize('remoteFileDialog.error.invalidfilename', 'Not a valid file name');
			});
			saveNameBox.onDidAccept(_ => {
				const name = saveNameBox.value;
				if (this.isValidBaseName(name)) {
					saveNameBox.hide();
					this.pickResource({ defaultUri: defaultUri, canSelectFolders: true, title: nls.localize('remoteFileDialogerror.titleFolderPage', 'Folder for \'{0}\'', name) }, { step: 2, totalSteps: 2 }).then(folderUri => {
						if (folderUri) {
							resolve(this.remoteUriFrom(this.remotePathJoin(folderUri, name)));
						} else {
							resolve(undefined);
						}
						saveNameBox.dispose();
					});
				}
			});
			saveNameBox.show();
		});
	}

	private remoteUriFrom(path: string): URI {
		return URI.from({ scheme: REMOTE_HOST_SCHEME, authority: this.remoteAuthority, path });
	}

	private remotePathJoin(firstPart: URI, secondPart: string): string {
		return this.labelService.getUriLabel(resources.joinPath(firstPart, secondPart));
	}

	private async pickResource(options: IOpenDialogOptions, multiOpts?: { step: number; totalSteps: number; }): Promise<URI | undefined> {
		this.allowFolderSelection = !!options.canSelectFolders;
		this.allowFileSelection = !!options.canSelectFiles;
		const defaultUri = options.defaultUri;
		let homedir = defaultUri && defaultUri.scheme === REMOTE_HOST_SCHEME ? defaultUri : this.workspaceContextService.getWorkspace().folders[0].uri;

		return new Promise<URI | undefined>((resolve) => {
			this.filePickBox = this.quickInputService.createQuickPick<FileQuickPickItem>();
			if (multiOpts) {
				this.filePickBox.totalSteps = multiOpts.totalSteps;
				this.filePickBox.step = multiOpts.step;
			}

			let isResolved = false;
			let isAcceptHandled = false;

			this.currentFolder = homedir;
			this.filePickBox.buttons = [this.acceptButton, this.cancelButton];
			this.filePickBox.onDidTriggerButton(button => {
				if (button === this.acceptButton) {
					resolve(this.currentFolder);
					isResolved = true;
				}
				this.filePickBox.hide();
			});
			this.filePickBox.title = options.title;
			this.filePickBox.placeholder = this.labelService.getUriLabel(this.currentFolder, { endWithSeparator: true });
			this.filePickBox.items = [];
			this.filePickBox.onDidAccept(_ => {
				if (isAcceptHandled || this.filePickBox.busy) {
					return;
				}
				isAcceptHandled = true;
				if (this.filePickBox.activeItems.length === 0) {
					if (this.allowFolderSelection) {
						resolve(this.currentFolder);
						isResolved = true;
						this.filePickBox.hide();
					}
				} else if (this.filePickBox.activeItems.length === 1) {
					const item = this.filePickBox.selectedItems[0];
					if (item) {
						if (!item.isFolder) {
							resolve(item.uri);
							isResolved = true;
							this.filePickBox.hide();
						} else {
							this.updateItems(item.uri);
						}
					}
				}
			});
			this.filePickBox.onDidChangeActive(i => {
				isAcceptHandled = false;
			});

			let to: NodeJS.Timer | undefined;
			this.filePickBox.onDidChangeValue(value => {
				if (to) {
					clearTimeout(to);
				}
				if (this.endsWithSlash(value)) {
					to = undefined;
					this.onValueChange();
				} else {
					to = setTimeout(this.onValueChange, 300);
				}
			});
			this.filePickBox.onDidHide(() => {
				if (!isResolved) {
					resolve(undefined);
				}
				this.filePickBox.dispose();
			});

			this.filePickBox.show();
			this.updateItems(homedir);
		});
	}

	private async onValueChange() {
		if (this.filePickBox) {
			let fullPath = this.remoteUriFrom(this.filePickBox.value);
			let stat = await this.remoteFileService.resolveFile(fullPath);
			if (!stat.isDirectory && this.allowFileSelection) {
				this.updateItems(resources.dirname(fullPath));
				this.filePickBox.value = resources.basename(fullPath);
			} else if (stat.isDirectory) {
				this.updateItems(fullPath);
			}
		}
	}

	private updateItems(newFolder: URI | null) {
		if (newFolder) {
			this.currentFolder = newFolder;
			this.filePickBox.placeholder = this.labelService.getUriLabel(newFolder, { endWithSeparator: true });
			this.filePickBox.value = '';
			this.filePickBox.busy = true;
			this.createItems(this.currentFolder).then(items => {
				this.filePickBox.items = items;
				if (this.allowFolderSelection) {
					this.filePickBox.activeItems = [];
				}
				this.filePickBox.busy = false;
			});
		}
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
		const parent = this.labelService.getUriLabel(resources.dirname(fullPath)!, { endWithSeparator: true });
		return child.substring(parent.length);
	}

	private createBackItem(currFolder: URI): FileQuickPickItem | null {
		const parentFolder = resources.dirname(currFolder)!;
		if (!resources.isEqual(currFolder, parentFolder)) {
			return { label: '..', uri: resources.dirname(currFolder)!, isFolder: true };
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
				return { label: filename, uri: fullPath, isFolder: true };
			} else if (!stat.isDirectory && this.allowFileSelection) {
				return { label: filename, uri: fullPath, isFolder: false };
			}
			return null;
		} catch (e) {
			return null;
		}
	}

	private getIcons(name: string): { light: URI, dark: URI } {
		return {
			light: URI.parse(require.toUrl(`vs/workbench/services/dialogs/media/light/${name}`)),
			dark: URI.parse(require.toUrl(`vs/workbench/services/dialogs/media/dark/${name}`))
		};
	}
}