/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { streamToBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createFileSystemProviderError, FileChangeType, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileChange, IFileSystemProviderWithFileReadWriteCapability, IStat } from '../../../../platform/files/common/files.js';
import { SnapshotContext } from '../../../services/workingCopy/common/fileWorkingCopy.js';
import { NotebookTextModel } from './model/notebookTextModel.js';
import { INotebookService } from './notebookService.js';

/**
 * A readonly file system provider that serves an open notebook with its unsaved changes, serialized
 * as it would be saved, e.g. to compare it as text with the file on disk.
 */
export class NotebookUnsavedFileSystemProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	static readonly SCHEME = 'vscode-notebook-unsaved';

	static toUnsaved(notebook: URI): URI {
		return notebook.with({ scheme: NotebookUnsavedFileSystemProvider.SCHEME, query: notebook.toString() });
	}

	static fromUnsaved(resource: URI): URI {
		return URI.parse(resource.query);
	}

	readonly capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.Readonly;

	readonly onDidChangeCapabilities = Event.None;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	private readonly notebookListeners = this._register(new DisposableMap<string>());

	constructor(private readonly notebookService: INotebookService) {
		super();
	}

	async stat(resource: URI): Promise<IStat> {
		const notebook = this.getNotebook(resource);

		return { type: FileType.File, ctime: 0, mtime: notebook.versionId, size: 0 };
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const notebook = this.getNotebook(resource);
		this.reportChanges(resource, notebook);

		const snapshot = await this.notebookService.createNotebookTextDocumentSnapshot(notebook.uri, SnapshotContext.Save, CancellationToken.None);

		return (await streamToBuffer(snapshot)).buffer;
	}

	private getNotebook(resource: URI): NotebookTextModel {
		const notebook = this.notebookService.getNotebookTextModel(NotebookUnsavedFileSystemProvider.fromUnsaved(resource));
		if (!notebook) {
			throw createFileSystemProviderError('The notebook is not open', FileSystemProviderErrorCode.FileNotFound);
		}

		return notebook;
	}

	/**
	 * Report changes of a notebook that was read, also when it is not watched (e.g. a comparison in the
	 * background), so that its text is reloaded and doesn't show outdated contents.
	 */
	private reportChanges(resource: URI, notebook: NotebookTextModel): void {
		const key = resource.toString();
		if (this.notebookListeners.has(key)) {
			return;
		}

		const listeners = new DisposableStore();
		listeners.add(notebook.onDidChangeContent(() => this._onDidChangeFile.fire([{ type: FileChangeType.UPDATED, resource }])));
		listeners.add(notebook.onWillDispose(() => this.notebookListeners.deleteAndDispose(key)));
		this.notebookListeners.set(key, listeners);
	}

	watch(): IDisposable {
		return Disposable.None;
	}

	async writeFile(): Promise<void> {
		throw this.readonlyError();
	}

	async mkdir(): Promise<void> {
		throw this.readonlyError();
	}

	async readdir(): Promise<[string, FileType][]> {
		return [];
	}

	async delete(): Promise<void> {
		throw this.readonlyError();
	}

	async rename(): Promise<void> {
		throw this.readonlyError();
	}

	private readonlyError(): Error {
		return createFileSystemProviderError('The unsaved notebook is shown readonly', FileSystemProviderErrorCode.NoPermissions);
	}
}
