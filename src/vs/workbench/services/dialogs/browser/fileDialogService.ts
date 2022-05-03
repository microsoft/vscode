/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPickAndOpenOptions, ISaveDialogOptions, IOpenDialogOptions, IFileDialogService, FileFilter } from 'vs/platform/dialogs/common/dialogs';
import { URI } from 'vs/base/common/uri';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { AbstractFileDialogService } from 'vs/workbench/services/dialogs/browser/abstractFileDialogService';
import { Schemas } from 'vs/base/common/network';
import { memoize } from 'vs/base/common/decorators';
import { HTMLFileSystemProvider } from 'vs/platform/files/browser/htmlFileSystemProvider';
import { localize } from 'vs/nls';
import { getMediaOrTextMime } from 'vs/base/common/mime';
import { basename } from 'vs/base/common/resources';
import { triggerDownload, triggerUpload } from 'vs/base/browser/dom';
import Severity from 'vs/base/common/severity';
import { VSBuffer } from 'vs/base/common/buffer';
import { extractFileListData } from 'vs/workbench/browser/dnd';
import { Iterable } from 'vs/base/common/iterator';
import { WebFileSystemAccess } from 'vs/platform/files/browser/webFileSystemAccess';

export class FileDialogService extends AbstractFileDialogService implements IFileDialogService {

	@memoize
	private get fileSystemProvider(): HTMLFileSystemProvider {
		return this.fileService.getProvider(Schemas.file) as HTMLFileSystemProvider;
	}

	async pickFileFolderAndOpen(options: IPickAndOpenOptions): Promise<void> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = await this.defaultFilePath(schema);
		}

		if (this.shouldUseSimplified(schema)) {
			return super.pickFileFolderAndOpenSimplified(schema, options, false);
		}

		throw new Error(localize('pickFolderAndOpen', "Can't open folders, try adding a folder to the workspace instead."));
	}

	protected override addFileSchemaIfNeeded(schema: string, isFolder: boolean): string[] {
		return (schema === Schemas.untitled) ? [Schemas.file]
			: (((schema !== Schemas.file) && (!isFolder || (schema !== Schemas.vscodeRemote))) ? [schema, Schemas.file] : [schema]);
	}

	async pickFileAndOpen(options: IPickAndOpenOptions): Promise<void> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = await this.defaultFilePath(schema);
		}

		if (this.shouldUseSimplified(schema)) {
			return super.pickFileAndOpenSimplified(schema, options, false);
		}

		if (!WebFileSystemAccess.supported(window)) {
			return this.showUnsupportedBrowserWarning('open');
		}

		let fileHandle: FileSystemHandle | undefined = undefined;
		try {
			([fileHandle] = await window.showOpenFilePicker({ multiple: false }));
		} catch (error) {
			return; // `showOpenFilePicker` will throw an error when the user cancels
		}

		if (!WebFileSystemAccess.isFileSystemFileHandle(fileHandle)) {
			return;
		}

		const uri = await this.fileSystemProvider.registerFileHandle(fileHandle);

		this.addFileToRecentlyOpened(uri);

		await this.openerService.open(uri, { fromUserGesture: true, editorOptions: { pinned: true } });
	}

	async pickFolderAndOpen(options: IPickAndOpenOptions): Promise<void> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = await this.defaultFolderPath(schema);
		}

		if (this.shouldUseSimplified(schema)) {
			return super.pickFolderAndOpenSimplified(schema, options);
		}

		throw new Error(localize('pickFolderAndOpen', "Can't open folders, try adding a folder to the workspace instead."));
	}

	async pickWorkspaceAndOpen(options: IPickAndOpenOptions): Promise<void> {
		options.availableFileSystems = this.getWorkspaceAvailableFileSystems(options);
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = await this.defaultWorkspacePath(schema);
		}

		if (this.shouldUseSimplified(schema)) {
			return super.pickWorkspaceAndOpenSimplified(schema, options);
		}

		throw new Error(localize('pickWorkspaceAndOpen', "Can't open workspaces, try adding a folder to the workspace instead."));
	}

	async pickFileToSave(defaultUri: URI, availableFileSystems?: string[]): Promise<URI | undefined> {
		const schema = this.getFileSystemSchema({ defaultUri, availableFileSystems });

		const options = this.getPickFileToSaveDialogOptions(defaultUri, availableFileSystems);
		if (this.shouldUseSimplified(schema)) {
			return super.pickFileToSaveSimplified(schema, options);
		}

		if (!WebFileSystemAccess.supported(window)) {
			return this.showUnsupportedBrowserWarning('save');
		}

		let fileHandle: FileSystemHandle | undefined = undefined;
		const startIn = Iterable.first(this.fileSystemProvider.directories);

		try {
			fileHandle = await window.showSaveFilePicker({ types: this.getFilePickerTypes(options.filters), ...{ suggestedName: basename(defaultUri), startIn } });
		} catch (error) {
			return; // `showSaveFilePicker` will throw an error when the user cancels
		}

		if (!WebFileSystemAccess.isFileSystemFileHandle(fileHandle)) {
			return undefined;
		}

		return this.fileSystemProvider.registerFileHandle(fileHandle);
	}

	private getFilePickerTypes(filters?: FileFilter[]): FilePickerAcceptType[] | undefined {
		return filters?.filter(filter => {
			return !((filter.extensions.length === 1) && ((filter.extensions[0] === '*') || filter.extensions[0] === ''));
		}).map(filter => {
			const accept: Record<string, string[]> = {};
			const extensions = filter.extensions.filter(ext => (ext.indexOf('-') < 0) && (ext.indexOf('*') < 0) && (ext.indexOf('_') < 0));
			accept[getMediaOrTextMime(`fileName.${filter.extensions[0]}`) ?? 'text/plain'] = extensions.map(ext => ext.startsWith('.') ? ext : `.${ext}`);
			return {
				description: filter.name,
				accept
			};
		});
	}

	async showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined> {
		const schema = this.getFileSystemSchema(options);

		if (this.shouldUseSimplified(schema)) {
			return super.showSaveDialogSimplified(schema, options);
		}

		if (!WebFileSystemAccess.supported(window)) {
			return this.showUnsupportedBrowserWarning('save');
		}

		let fileHandle: FileSystemHandle | undefined = undefined;
		const startIn = Iterable.first(this.fileSystemProvider.directories);

		try {
			fileHandle = await window.showSaveFilePicker({ types: this.getFilePickerTypes(options.filters), ...options.defaultUri ? { suggestedName: basename(options.defaultUri) } : undefined, ...{ startIn } });
		} catch (error) {
			return undefined; // `showSaveFilePicker` will throw an error when the user cancels
		}

		if (!WebFileSystemAccess.isFileSystemFileHandle(fileHandle)) {
			return undefined;
		}

		return this.fileSystemProvider.registerFileHandle(fileHandle);
	}

	async showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined> {
		const schema = this.getFileSystemSchema(options);

		if (this.shouldUseSimplified(schema)) {
			return super.showOpenDialogSimplified(schema, options);
		}

		if (!WebFileSystemAccess.supported(window)) {
			return this.showUnsupportedBrowserWarning('open');
		}

		let uri: URI | undefined;
		const startIn = Iterable.first(this.fileSystemProvider.directories) ?? 'documents';

		try {
			if (options.canSelectFiles) {
				const handle = await window.showOpenFilePicker({ multiple: false, types: this.getFilePickerTypes(options.filters), ...{ startIn } });
				if (handle.length === 1 && WebFileSystemAccess.isFileSystemFileHandle(handle[0])) {
					uri = await this.fileSystemProvider.registerFileHandle(handle[0]);
				}
			} else {
				const handle = await window.showDirectoryPicker({ ...{ startIn } });
				uri = await this.fileSystemProvider.registerDirectoryHandle(handle);
			}
		} catch (error) {
			// ignore - `showOpenFilePicker` / `showDirectoryPicker` will throw an error when the user cancels
		}

		return uri ? [uri] : undefined;
	}

	private async showUnsupportedBrowserWarning(context: 'save' | 'open'): Promise<undefined> {

		// When saving, try to just download the contents
		// of the active text editor if any as a workaround
		if (context === 'save') {
			const activeTextModel = this.codeEditorService.getActiveCodeEditor()?.getModel();
			if (activeTextModel) {
				triggerDownload(VSBuffer.fromString(activeTextModel.getValue()).buffer, basename(activeTextModel.uri));
				return;
			}
		}

		// Otherwise inform the user about options

		const buttons = context === 'open' ?
			[localize('openRemote', "Open Remote..."), localize('learnMore', "Learn More"), localize('openFiles', "Open Files...")] :
			[localize('openRemote', "Open Remote..."), localize('learnMore', "Learn More")];

		const res = await this.dialogService.show(
			Severity.Warning,
			localize('unsupportedBrowserMessage', "Opening Local Folders is Unsupported"),
			buttons,
			{
				detail: localize('unsupportedBrowserDetail', "Your browser doesn't support opening local folders.\nYou can either open single files or open a remote repository."),
				cancelId: -1 // no "Cancel" button offered
			}
		);

		switch (res.choice) {
			case 0:
				this.commandService.executeCommand('workbench.action.remote.showMenu');
				break;
			case 1:
				this.openerService.open('https://aka.ms/VSCodeWebLocalFileSystemAccess');
				break;
			case 2:
				{
					const files = await triggerUpload();
					if (files) {
						const filesData = (await this.instantiationService.invokeFunction(accessor => extractFileListData(accessor, files))).filter(fileData => !fileData.isDirectory);
						if (filesData.length > 0) {
							this.editorService.openEditors(filesData.map(fileData => {
								return {
									resource: fileData.resource,
									contents: fileData.contents?.toString(),
									options: { pinned: true }
								};
							}));
						}
					}
				}
				break;
		}

		return undefined;
	}

	private shouldUseSimplified(scheme: string): boolean {
		return ![Schemas.file, Schemas.vscodeUserData, Schemas.tmp].includes(scheme);
	}
}

registerSingleton(IFileDialogService, FileDialogService, true);
