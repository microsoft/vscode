/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPickAndOpenOptions, ISaveDialogOptions, IOpenDialogOptions, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { URI } from 'vs/base/common/uri';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { AbstractFileDialogService } from 'vs/workbench/services/dialogs/browser/abstractFileDialogService';
import { Schemas } from 'vs/base/common/network';
import { memoize } from 'vs/base/common/decorators';
import { HTMLFileSystemProvider } from 'vs/platform/files/browser/htmlFileSystemProvider';
import { generateUuid } from 'vs/base/common/uuid';

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

		throw new Error('Method not implemented.');
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
		const uuid = generateUuid();
		const uri = URI.from({ scheme: Schemas.file, authority: uuid, path: `/${handle.name}` });

		this.fileSystemProvider.registerFileHandle(uuid, handle);

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

		throw new Error('Method not implemented.');
	}

	async pickWorkspaceAndOpen(options: IPickAndOpenOptions): Promise<void> {
		const schema = this.getFileSystemSchema(options);

		if (!options.defaultUri) {
			options.defaultUri = await this.defaultWorkspacePath(schema);
		}

		if (this.shouldUseSimplified(schema)) {
			return this.pickWorkspaceAndOpenSimplified(schema, options);
		}

		throw new Error('Method not implemented.');
	}

	async pickFileToSave(defaultUri: URI, availableFileSystems?: string[]): Promise<URI | undefined> {
		const schema = this.getFileSystemSchema({ defaultUri, availableFileSystems });

		if (this.shouldUseSimplified(schema)) {
			return this.pickFileToSaveSimplified(schema, this.getPickFileToSaveDialogOptions(defaultUri, availableFileSystems));
		}

		throw new Error('Method not implemented.');
	}

	async showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined> {
		const schema = this.getFileSystemSchema(options);

		if (this.shouldUseSimplified(schema)) {
			return this.showSaveDialogSimplified(schema, options);
		}

		throw new Error('Method not implemented.');
	}

	async showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined> {
		const schema = this.getFileSystemSchema(options);

		if (this.shouldUseSimplified(schema)) {
			return this.showOpenDialogSimplified(schema, options);
		}

		throw new Error('Method not implemented.');
	}

	protected addFileSchemaIfNeeded(schema: string): string[] {
		return schema === Schemas.untitled ? [Schemas.file] : [schema];
	}

	private shouldUseSimplified(schema: string): boolean {
		return schema !== Schemas.file;
	}
}

registerSingleton(IFileDialogService, FileDialogService, true);
