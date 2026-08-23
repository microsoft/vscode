/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { IDisposable, toDisposable, DisposableStore, DisposableMap } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IFileWriteOptions, FileSystemProviderCapabilities, IFileChange, IFileService, IStat, IWatchOptions, FileType, IFileOverwriteOptions, IFileDeleteOptions, IFileOpenOptions, FileOperationError, FileOperationResult, FileSystemProviderErrorCode, IFileSystemProviderWithOpenReadWriteCloseCapability, IFileSystemProviderWithFileReadWriteCapability, IFileSystemProviderWithFileFolderCopyCapability, FilePermission, toFileSystemProviderErrorCode, IFileStatWithPartialMetadata, IFileStat } from '../../../platform/files/common/files.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostFileSystemShape, IFileChangeDto, MainContext, MainThreadFileSystemShape } from '../common/extHost.protocol.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';

@extHostNamedCustomer(MainContext.MainThreadFileSystem)
export class MainThreadFileSystem implements MainThreadFileSystemShape {

	private readonly _proxy: ExtHostFileSystemShape;
	private readonly _fileProvider = new DisposableMap<number, RemoteFileSystemProvider>();
	private readonly _disposables = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext,
		@IFileService private readonly _fileService: IFileService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystem);

		const infoProxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystemInfo);

		for (const entry of _fileService.listCapabilities()) {
			infoProxy.$acceptProviderInfos(URI.from({ scheme: entry.scheme, path: '/dummy' }), entry.capabilities);
		}
		this._disposables.add(_fileService.onDidChangeFileSystemProviderRegistrations(e => infoProxy.$acceptProviderInfos(URI.from({ scheme: e.scheme, path: '/dummy' }), e.provider?.capabilities ?? null)));
		this._disposables.add(_fileService.onDidChangeFileSystemProviderCapabilities(e => infoProxy.$acceptProviderInfos(URI.from({ scheme: e.scheme, path: '/dummy' }), e.provider.capabilities)));
	}

	dispose(): void {
		this._disposables.dispose();
		this._fileProvider.dispose();
	}

	async $registerFileSystemProvider(handle: number, scheme: string, capabilities: FileSystemProviderCapabilities, readonlyMessage?: IMarkdownString): Promise<void> {
		this._fileProvider.set(handle, new RemoteFileSystemProvider(this._fileService, scheme, capabilities, readonlyMessage, handle, this._proxy));
	}

	$unregisterProvider(handle: number): void {
		this._fileProvider.deleteAndDispose(handle);
	}

	$onFileSystemChange(handle: number, changes: IFileChangeDto[]): void {
		const fileProvider = this._fileProvider.get(handle);
		if (!fileProvider) {
			throw new Error('Unknown file provider');
		}
		fileProvider.$onFileSystemChange(changes);
	}


	// --- consumer fs, vscode.workspace.fs

	async $stat(uri: UriComponents): Promise<IStat> {
		try {
			const stat = await this._fileService.stat(URI.revive(uri));
			return {
				ctime: stat.ctime,
				mtime: stat.mtime,
				size: stat.size,
				permissions: stat.readonly ? FilePermission.Readonly : undefined,
				type: MainThreadFileSystem._asFileType(stat)
			};
		} catch (err) {
			return MainThreadFileSystem._handleError(err);
		}
	}

	async $readdir(uri: UriComponents): Promise<[string, FileType][]> {
		try {
			const stat = await this._fileService.resolve(URI.revive(uri), { resolveMetadata: false });
			if (!stat.isDirectory) {
				const err = new Error(stat.name);
				err.name = FileSystemProviderErrorCode.FileNotADirectory;
				throw err;
			}
			return !stat.children ? [] : stat.children.map(child => [child.name, MainThreadFileSystem._asFileType(child)] as [string, FileType]);
		} catch (err) {
			return MainThreadFileSystem._handleError(err);
		}
	}

	private static _asFileType(stat: IFileStat | IFileStatWithPartialMetadata): FileType {
		let res = 0;
		if (stat.isFile) {
			res += FileType.File;

		} else if (stat.isDirectory) {
			res += FileType.Directory;
		}
		if (stat.isSymbolicLink) {
			res += FileType.SymbolicLink;
		}
		return res;
	}

	async $readFile(uri: UriComponents): Promise<VSBuffer> {
		try {
			const file = await this._fileService.readFile(URI.revive(uri));
			return file.value;
		} catch (err) {
			return MainThreadFileSystem._handleError(err);
		}
	}

	async $writeFile(uri: UriComponents, content: VSBuffer): Promise<void> {
		try {
			await this._fileService.writeFile(URI.revive(uri), content);
		} catch (err) {
			return MainThreadFileSystem._handleError(err);
		}
	}

	async $rename(source: UriComponents, target: UriComponents, opts: IFileOverwriteOptions): Promise<void> {
		try {
			await this._fileService.move(URI.revive(source), URI.revive(target), opts.overwrite);
		} catch (err) {
			return MainThreadFileSystem._handleError(err);
		}
	}

	async $copy(source: UriComponents, target: UriComponents, opts: IFileOverwriteOptions): Promise<void> {
		try {
			await this._fileService.copy(URI.revive(source), URI.revive(target), opts.overwrite);
		} catch (err) {
			return MainThreadFileSystem._handleError(err);
		}
	}

	async $mkdir(uri: UriComponents): Promise<void> {
		try {
			await this._fileService.createFolder(URI.revive(uri));
		} catch (err) {
			return MainThreadFileSystem._handleError(err);
		}
	}

	async $delete(uri: UriComponents, opts: IFileDeleteOptions): Promise<void> {
		try {
			return await this._fileService.del(URI.revive(uri), opts);
		} catch (err) {
			return MainThreadFileSystem._handleError(err);
		}
	}

	private static _handleError(err: unknown): never {
		if (err instanceof FileOperationError) {
			switch (err.fileOperationResult) {
				case FileOperationResult.FILE_NOT_FOUND:
					err.name = FileSystemProviderErrorCode.FileNotFound;
					break;
				case FileOperationResult.FILE_IS_DIRECTORY:
					err.name = FileSystemProviderErrorCode.FileIsADirectory;
					break;
				case FileOperationResult.FILE_PERMISSION_DENIED:
					err.name = FileSystemProviderErrorCode.NoPermissions;
					break;
				case FileOperationResult.FILE_MOVE_CONFLICT:
					err.name = FileSystemProviderErrorCode.FileExists;
					break;
			}
		} else if (err instanceof Error) {
			const code = toFileSystemProviderErrorCode(err);
			if (code !== FileSystemProviderErrorCode.Unknown) {
				err.name = code;
			}
		}

		throw err;
	}

	$ensureActivation(scheme: string): Promise<void> {
		return this._fileService.activateProvider(scheme);
	}
}

class RemoteFileSystemProvider implements IFileSystemProviderWithFileReadWriteCapability, IFileSystemProviderWithOpenReadWriteCloseCapability, IFileSystemProviderWithFileFolderCopyCapability {

	private readonly _onDidChange = new Emitter<readonly IFileChange[]>();
	private readonly _registration: IDisposable;

	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChange.event;

	readonly capabilities: FileSystemProviderCapabilities;
	readonly onDidChangeCapabilities: Event<void> = Event.None;

	constructor(
		fileService: IFileService,
		scheme: string,
		capabilities: FileSystemProviderCapabilities,
		public readonly readOnlyMessage: IMarkdownString | undefined,
		private readonly _handle: number,
		private readonly _proxy: ExtHostFileSystemShape
	) {
		this.capabilities = capabilities;
		this._registration = fileService.registerProvider(scheme, this);
	}

	dispose(): void {
		this._registration.dispose();
		this._onDidChange.dispose();
	}

	watch(resource: URI, opts: IWatchOptions) {
		const session = Math.random();
		this._proxy.$watch(this._handle, session, resource, opts);
		return toDisposable(() => {
			this._proxy.$unwatch(this._handle, session);
		});
	}

	$onFileSystemChange(changes: IFileChangeDto[]): void {
		this._onDidChange.fire(changes.map(RemoteFileSystemProvider._createFileChange));
	}

	private static _createFileChange(dto: IFileChangeDto): IFileChange {
		return { resource: URI.revive(dto.resource), type: dto.type };
	}

	// --- forwarding calls

	async stat(resource: URI): Promise<IStat> {
		try {
			return await this._proxy.$stat(this._handle, resource);
		} catch (err) {
			throw err;
		}
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const buffer = await this._proxy.$readFile(this._handle, resource);
		return buffer.buffer;
	}

	writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
		return this._proxy.$writeFile(this._handle, resource, VSBuffer.wrap(content), opts);
	}

	delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		return this._proxy.$delete(this._handle, resource, opts);
	}

	mkdir(resource: URI): Promise<void> {
		return this._proxy.$mkdir(this._handle, resource);
	}

	readdir(resource: URI): Promise<[string, FileType][]> {
		return this._proxy.$readdir(this._handle, resource);
	}

	rename(resource: URI, target: URI, opts: IFileOverwriteOptions): Promise<void> {
		return this._proxy.$rename(this._handle, resource, target, opts);
	}

	copy(resource: URI, target: URI, opts: IFileOverwriteOptions): Promise<void> {
		return this._proxy.$copy(this._handle, resource, target, opts);
	}

	open(resource: URI, opts: IFileOpenOptions): Promise<number> {
		return this._proxy.$open(this._handle, resource, opts);
	}

	close(fd: number): Promise<void> {
		return this._proxy.$close(this._handle, fd);
	}

	async read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		const readData = await this._proxy.$read(this._handle, fd, pos, length);
		data.set(readData.buffer, offset);
		return readData.byteLength;
	}

	write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		return this._proxy.$write(this._handle, fd, pos, VSBuffer.wrap(data).slice(offset, offset + length));
	}
}
