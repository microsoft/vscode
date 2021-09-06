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
import { WebFileSystemAccess } from 'vs/base/browser/dom';
import Severity from 'vs/base/common/severity';

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
			return this.pickFileFolderAndOpenSimplified(schema, options, false);
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
			return this.pickFileAndOpenSimplified(schema, options, false);
		}

		if (!WebFileSystemAccess.supported(window)) {
			return this.showUnsupportedBrowserWarning();
		}

		let fileHandle: FileSystemHandle | undefined = undefined;
		try {
			([fileHandle] = await window.showOpenFilePicker({ multiple: false }));
		} catch (error) {
			return; // `showOpenFilePicker` will throw an error when the user cancels
		}

		const uri = this.fileSystemProvider.registerFileHandle(fileHandle);

		await this.openerService.open(uri, { fromUserGesture: true, editorOptions: { pinned: true } });
	}

	async pickFolderAndOpen(options: IPickAndOpenOptions): Promise<void> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = await this.defaultFolderPath(schema);
		}

		if (this.shouldUseSimplified(schema)) {
			return this.pickFolderAndOpenSimplified(schema, options);
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
			return this.pickWorkspaceAndOpenSimplified(schema, options);
		}

		throw new Error(localize('pickWorkspaceAndOpen', "Can't open workspaces, try adding a folder to the workspace instead."));
	}

	async pickFileToSave(defaultUri: URI, availableFileSystems?: string[]): Promise<URI | undefined> {
		const schema = this.getFileSystemSchema({ defaultUri, availableFileSystems });

		const options = this.getPickFileToSaveDialogOptions(defaultUri, availableFileSystems);
		if (this.shouldUseSimplified(schema)) {
			return this.pickFileToSaveSimplified(schema, options);
		}

		if (!WebFileSystemAccess.supported(window)) {
			return this.showUnsupportedBrowserWarning();
		}

		let fileHandle: FileSystemHandle | undefined = undefined;
		try {
			fileHandle = await window.showSaveFilePicker({ types: this.getFilePickerTypes(options.filters), ...{ suggestedName: basename(defaultUri) } });
		} catch (error) {
			return; // `showSaveFilePicker` will throw an error when the user cancels
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
			return this.showSaveDialogSimplified(schema, options);
		}

		if (!WebFileSystemAccess.supported(window)) {
			return this.showUnsupportedBrowserWarning();
		}

		let fileHandle: FileSystemHandle | undefined = undefined;
		try {
			fileHandle = await window.showSaveFilePicker({ types: this.getFilePickerTypes(options.filters), ...options.defaultUri ? { suggestedName: basename(options.defaultUri) } : undefined });
		} catch (error) {
			return; // `showSaveFilePicker` will throw an error when the user cancels
		}

		return this.fileSystemProvider.registerFileHandle(fileHandle);
	}

	async showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined> {
		const schema = this.getFileSystemSchema(options);

		if (this.shouldUseSimplified(schema)) {
			return this.showOpenDialogSimplified(schema, options);
		}

		if (!WebFileSystemAccess.supported(window)) {
			return this.showUnsupportedBrowserWarning();
		}

		let uri: URI | undefined;
		try {
			if (options.canSelectFiles) {
				const handle = await window.showOpenFilePicker({ multiple: false, types: this.getFilePickerTypes(options.filters) });
				if (handle.length === 1) {
					uri = this.fileSystemProvider.registerFileHandle(handle[0]);
				}
			} else {
				const handle = await window.showDirectoryPicker();
				uri = this.fileSystemProvider.registerDirectoryHandle(handle);
			}
		} catch (error) {
			// ignore - `showOpenFilePicker` / `showDirectoryPicker` will throw an error when the user cancels
		}

		return uri ? [uri] : undefined;
	}

	private async showUnsupportedBrowserWarning(): Promise<undefined> {
		const res = await this.dialogService.show(
			Severity.Warning,
			localize('unsupportedBrowserMessage', "Accessing local files is unsupported in your current browser."),
			[localize('openRemote', "Open Remote..."), localize('learnMore', "Learn More"), localize('cancel', "Cancel")],
			{
				detail: localize('unsupportedBrowserDetail', "Click 'Learn More' to see a list of supported browsers."),
				cancelId: 2
			}
		);

		switch (res.choice) {
			case 0:
				this.commandService.executeCommand('workbench.action.remote.showMenu');
				break;
			case 1:
				this.openerService.open('https://aka.ms/VSCodeWebLocalFileSystemAccess');
				break;
		}

		return undefined;
	}

	private shouldUseSimplified(scheme: string): boolean {
		return ![Schemas.file, Schemas.userData, Schemas.tmp].includes(scheme);
	}
}

registerSingleton(IFileDialogService, FileDialogService, true);
