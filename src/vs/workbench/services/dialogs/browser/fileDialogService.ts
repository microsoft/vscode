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

export class FileDialogService extends AbstractFileDialogService implements IFileDialogService {

	@memoize
	private get fileSystemProvider(): HTMLFileSystemProvider {
		return this.fileService.getProvider(Schemas.file) as HTMLFileSystemProvider;
	}

	async pickFileFolderAndOpen(options: IPickAndOpenOptions): Promise<any> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = await this.defaultFilePath(schema);
		}

		if (this.shouldUseSimplified(schema)) {
			return this.pickFileFolderAndOpenSimplified(schema, options, false);
		}

		throw new Error(localize('pickFolderAndOpen', "Can't open folders, try adding a folder to the workspace instead."));
	}

	async pickFileAndOpen(options: IPickAndOpenOptions): Promise<any> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = await this.defaultFilePath(schema);
		}

		if (this.shouldUseSimplified(schema)) {
			return this.pickFileAndOpenSimplified(schema, options, false);
		}

		const [handle] = await window.showOpenFilePicker({ multiple: false });

		const uri = this.fileSystemProvider.registerFileHandle(handle);

		await this.openerService.open(uri, { fromUserGesture: true, editorOptions: { pinned: true } });
	}

	async pickFolderAndOpen(options: IPickAndOpenOptions): Promise<any> {
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

		const handle = await window.showSaveFilePicker({ types: this.getFilePickerTypes(options.filters) });

		return this.fileSystemProvider.registerFileHandle(handle);
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

		const handle = await window.showSaveFilePicker({ types: this.getFilePickerTypes(options.filters) });

		return this.fileSystemProvider.registerFileHandle(handle);
	}

	async showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined> {
		const schema = this.getFileSystemSchema(options);

		if (this.shouldUseSimplified(schema)) {
			return this.showOpenDialogSimplified(schema, options);
		}

		let uri: URI | undefined;
		if (options.canSelectFiles) {
			const handle = await window.showOpenFilePicker({ multiple: false, types: this.getFilePickerTypes(options.filters) });
			if (handle.length === 1) {
				uri = this.fileSystemProvider.registerFileHandle(handle[0]);
			}
		} else {
			const handle = await window.showDirectoryPicker();
			uri = this.fileSystemProvider.registerDirectoryHandle(handle);
		}
		if (uri) {
			return [uri];
		}
		return undefined;
	}

	private shouldUseSimplified(scheme: string): boolean {
		return ![Schemas.file, Schemas.userData, Schemas.tmp].includes(scheme);
	}
}

registerSingleton(IFileDialogService, FileDialogService, true);
