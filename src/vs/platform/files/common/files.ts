/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, VSBufferReadable, VSBufferReadableStream } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { IExpression, IRelativePattern } from '../../../base/common/glob.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { sep } from '../../../base/common/path.js';
import { ReadableStreamEvents } from '../../../base/common/stream.js';
import { startsWithIgnoreCase } from '../../../base/common/strings.js';
import { isNumber } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { isWeb } from '../../../base/common/platform.js';
import { Schemas } from '../../../base/common/network.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { Lazy } from '../../../base/common/lazy.js';

//#region file service & providers

export const IFileService = createDecorator<IFileService>('fileService');

export interface IFileService {

	readonly _serviceBrand: undefined;

	/**
	 * An event that is fired when a file system provider is added or removed
	 */
	readonly onDidChangeFileSystemProviderRegistrations: Event<IFileSystemProviderRegistrationEvent>;

	/**
	 * An event that is fired when a registered file system provider changes its capabilities.
	 */
	readonly onDidChangeFileSystemProviderCapabilities: Event<IFileSystemProviderCapabilitiesChangeEvent>;

	/**
	 * An event that is fired when a file system provider is about to be activated. Listeners
	 * can join this event with a long running promise to help in the activation process.
	 */
	readonly onWillActivateFileSystemProvider: Event<IFileSystemProviderActivationEvent>;

	/**
	 * Registers a file system provider for a certain scheme.
	 */
	registerProvider(scheme: string, provider: IFileSystemProvider): IDisposable;

	/**
	 * Returns a file system provider for a certain scheme.
	 */
	getProvider(scheme: string): IFileSystemProvider | undefined;

	/**
	 * Tries to activate a provider with the given scheme.
	 */
	activateProvider(scheme: string): Promise<void>;

	/**
	 * Checks if this file service can handle the given resource by
	 * first activating any extension that wants to be activated
	 * on the provided resource scheme to include extensions that
	 * contribute file system providers for the given resource.
	 */
	canHandleResource(resource: URI): Promise<boolean>;

	/**
	 * Checks if the file service has a registered provider for the
	 * provided resource.
	 *
	 * Note: this does NOT account for contributed providers from
	 * extensions that have not been activated yet. To include those,
	 * consider to call `await fileService.canHandleResource(resource)`.
	 */
	hasProvider(resource: URI): boolean;

	/**
	 * Checks if the provider for the provided resource has the provided file system capability.
	 */
	hasCapability(resource: URI, capability: FileSystemProviderCapabilities): boolean;

	/**
	 * List the schemes and capabilities for registered file system providers
	 */
	listCapabilities(): Iterable<{ scheme: string; capabilities: FileSystemProviderCapabilities }>;

	/**
	 * Allows to listen for file changes. The event will fire for every file within the opened workspace
	 * (if any) as well as all files that have been watched explicitly using the #watch() API.
	 */
	readonly onDidFilesChange: Event<FileChangesEvent>;

	/**
	 * An event that is fired upon successful completion of a certain file operation.
	 */
	readonly onDidRunOperation: Event<FileOperationEvent>;

	/**
	 * Resolve the properties of a file/folder identified by the resource. For a folder, children
	 * information is resolved as well depending on the provided options. Use `stat()` method if
	 * you do not need children information.
	 *
	 * If the optional parameter "resolveTo" is specified in options, the stat service is asked
	 * to provide a stat object that should contain the full graph of folders up to all of the
	 * target resources.
	 *
	 * If the optional parameter "resolveSingleChildDescendants" is specified in options,
	 * the stat service is asked to automatically resolve child folders that only
	 * contain a single element.
	 *
	 * If the optional parameter "resolveMetadata" is specified in options,
	 * the stat will contain metadata information such as size, mtime and etag.
	 */
	resolve(resource: URI, options: IResolveMetadataFileOptions): Promise<IFileStatWithMetadata>;
	resolve(resource: URI, options?: IResolveFileOptions): Promise<IFileStat>;

	/**
	 * Same as `resolve()` but supports resolving multiple resources in parallel.
	 *
	 * If one of the resolve targets fails to resolve returns a fake `IFileStat` instead of
	 * making the whole call fail.
	 */
	resolveAll(toResolve: { resource: URI; options: IResolveMetadataFileOptions }[]): Promise<IFileStatResult[]>;
	resolveAll(toResolve: { resource: URI; options?: IResolveFileOptions }[]): Promise<IFileStatResult[]>;

	/**
	 * Same as `resolve()` but without resolving the children of a folder if the
	 * resource is pointing to a folder.
	 */
	stat(resource: URI): Promise<IFileStatWithPartialMetadata>;

	/**
	 * Attempts to resolve the real path of the provided resource. The real path can be
	 * different from the resource path for example when it is a symlink.
	 *
	 * Will return `undefined` if the real path cannot be resolved.
	 */
	realpath(resource: URI): Promise<URI | undefined>;

	/**
	 * Finds out if a file/folder identified by the resource exists.
	 */
	exists(resource: URI): Promise<boolean>;

	/**
	 * Read the contents of the provided resource unbuffered.
	 */
	readFile(resource: URI, options?: IReadFileOptions, token?: CancellationToken): Promise<IFileContent>;

	/**
	 * Read the contents of the provided resource buffered as stream.
	 */
	readFileStream(resource: URI, options?: IReadFileStreamOptions, token?: CancellationToken): Promise<IFileStreamContent>;

	/**
	 * Updates the content replacing its previous value.
	 *
	 * Emits a `FileOperation.WRITE` file operation event when successful.
	 */
	writeFile(resource: URI, bufferOrReadableOrStream: VSBuffer | VSBufferReadable | VSBufferReadableStream, options?: IWriteFileOptions): Promise<IFileStatWithMetadata>;

	/**
	 * Moves the file/folder to a new path identified by the resource.
	 *
	 * The optional parameter overwrite can be set to replace an existing file at the location.
	 *
	 * Emits a `FileOperation.MOVE` file operation event when successful.
	 */
	move(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata>;

	/**
	 * Find out if a move operation is possible given the arguments. No changes on disk will
	 * be performed. Returns an Error if the operation cannot be done.
	 */
	canMove(source: URI, target: URI, overwrite?: boolean): Promise<Error | true>;

	/**
	 * Copies the file/folder to a path identified by the resource. A folder is copied
	 * recursively.
	 *
	 * Emits a `FileOperation.COPY` file operation event when successful.
	 */
	copy(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata>;

	/**
	 * Find out if a copy operation is possible given the arguments. No changes on disk will
	 * be performed. Returns an Error if the operation cannot be done.
	 */
	canCopy(source: URI, target: URI, overwrite?: boolean): Promise<Error | true>;

	/**
	 * Clones a file to a path identified by the resource. Folders are not supported.
	 *
	 * If the target path exists, it will be overwritten.
	 */
	cloneFile(source: URI, target: URI): Promise<void>;

	/**
	 * Creates a new file with the given path and optional contents. The returned promise
	 * will have the stat model object as a result.
	 *
	 * The optional parameter content can be used as value to fill into the new file.
	 *
	 * Emits a `FileOperation.CREATE` file operation event when successful.
	 */
	createFile(resource: URI, bufferOrReadableOrStream?: VSBuffer | VSBufferReadable | VSBufferReadableStream, options?: ICreateFileOptions): Promise<IFileStatWithMetadata>;

	/**
	 * Find out if a file create operation is possible given the arguments. No changes on disk will
	 * be performed. Returns an Error if the operation cannot be done.
	 */
	canCreateFile(resource: URI, options?: ICreateFileOptions): Promise<Error | true>;

	/**
	 * Creates a new folder with the given path. The returned promise
	 * will have the stat model object as a result.
	 *
	 * Emits a `FileOperation.CREATE` file operation event when successful.
	 */
	createFolder(resource: URI): Promise<IFileStatWithMetadata>;

	/**
	 * Deletes the provided file. The optional useTrash parameter allows to
	 * move the file to trash. The optional recursive parameter allows to delete
	 * non-empty folders recursively.
	 *
	 * Emits a `FileOperation.DELETE` file operation event when successful.
	 */
	del(resource: URI, options?: Partial<IFileDeleteOptions>): Promise<void>;

	/**
	 * Find out if a delete operation is possible given the arguments. No changes on disk will
	 * be performed. Returns an Error if the operation cannot be done.
	 */
	canDelete(resource: URI, options?: Partial<IFileDeleteOptions>): Promise<Error | true>;

	/**
	 * An event that signals an error when watching for file changes.
	 */
	readonly onDidWatchError: Event<Error>;

	/**
	 * Allows to start a watcher that reports file/folder change events on the provided resource.
	 *
	 * The watcher runs correlated and thus, file events will be reported on the returned
	 * `IFileSystemWatcher` and not on the generic `IFileService.onDidFilesChange` event.
	 *
	 * Note: only non-recursive file watching supports event correlation for now.
	 */
	createWatcher(resource: URI, options: IWatchOptionsWithoutCorrelation & { recursive: false }): IFileSystemWatcher;

	/**
	 * Allows to start a watcher that reports file/folder change events on the provided resource.
	 *
	 * The watcher runs uncorrelated and thus will report all events from `IFileService.onDidFilesChange`.
	 * This means, most listeners in the application will receive your events. It is encouraged to
	 * use correlated watchers (via `IWatchOptionsWithCorrelation`) to limit events to your listener.
	*/
	watch(resource: URI, options?: IWatchOptionsWithoutCorrelation): IDisposable;

	/**
	 * Frees up any resources occupied by this service.
	 */
	dispose(): void;
}

export interface IFileOverwriteOptions {

	/**
	 * Set to `true` to overwrite a file if it exists. Will
	 * throw an error otherwise if the file does exist.
	 */
	readonly overwrite: boolean;
}

export interface IFileUnlockOptions {

	/**
	 * Set to `true` to try to remove any write locks the file might
	 * have. A file that is write locked will throw an error for any
	 * attempt to write to unless `unlock: true` is provided.
	 */
	readonly unlock: boolean;
}

export interface IFileAtomicReadOptions {

	/**
	 * The optional `atomic` flag can be used to make sure
	 * the `readFile` method is not running in parallel with
	 * any `write` operations in the same process.
	 *
	 * Typically you should not need to use this flag but if
	 * for example you are quickly reading a file right after
	 * a file event occurred and the file changes a lot, there
	 * is a chance that a read returns an empty or partial file
	 * because a pending write has not finished yet.
	 *
	 * Note: this does not prevent the file from being written
	 * to from a different process. If you need such atomic
	 * operations, you better use a real database as storage.
	 */
	readonly atomic: boolean;
}

export interface IFileAtomicOptions {

	/**
	 * The postfix is used to create a temporary file based
	 * on the original resource. The resulting temporary
	 * file will be in the same folder as the resource and
	 * have `postfix` appended to the resource name.
	 *
	 * Example: given a file resource `file:///some/path/foo.txt`
	 * and a postfix `.vsctmp`, the temporary file will be
	 * created as `file:///some/path/foo.txt.vsctmp`.
	 */
	readonly postfix: string;
}

export interface IFileAtomicWriteOptions {

	/**
	 * The optional `atomic` flag can be used to make sure
	 * the `writeFile` method updates the target file atomically
	 * by first writing to a temporary file in the same folder
	 * and then renaming it over the target.
	 */
	readonly atomic: IFileAtomicOptions | false;
}

export interface IFileAtomicDeleteOptions {

	/**
	 * The optional `atomic` flag can be used to make sure
	 * the `delete` method deletes the target atomically by
	 * first renaming it to a temporary resource in the same
	 * folder and then deleting it.
	 */
	readonly atomic: IFileAtomicOptions | false;
}

export interface IFileReadLimits {

	/**
	 * If the file exceeds the given size, an error of kind
	 * `FILE_TOO_LARGE` will be thrown.
	 */
	size?: number;
}

export interface IFileReadStreamOptions {

	/**
	 * Is an integer specifying where to begin reading from in the file. If position is undefined,
	 * data will be read from the current file position.
	 */
	readonly position?: number;

	/**
	 * Is an integer specifying how many bytes to read from the file. By default, all bytes
	 * will be read.
	 */
	readonly length?: number;

	/**
	 * If provided, the size of the file will be checked against the limits
	 * and an error will be thrown if any limit is exceeded.
	 */
	readonly limits?: IFileReadLimits;
}

export interface IFileWriteOptions extends IFileOverwriteOptions, IFileUnlockOptions, IFileAtomicWriteOptions {

	/**
	 * Set to `true` to create a file when it does not exist. Will
	 * throw an error otherwise if the file does not exist.
	 */
	readonly create: boolean;
}

export type IFileOpenOptions = IFileOpenForReadOptions | IFileOpenForWriteOptions;

export function isFileOpenForWriteOptions(options: IFileOpenOptions): options is IFileOpenForWriteOptions {
	return options.create === true;
}

export interface IFileOpenForReadOptions {

	/**
	 * A hint that the file should be opened for reading only.
	 */
	readonly create: false;
}

export interface IFileOpenForWriteOptions extends IFileUnlockOptions {

	/**
	 * A hint that the file should be opened for reading and writing.
	 */
	readonly create: true;
}

export interface IFileDeleteOptions {

	/**
	 * Set to `true` to recursively delete any children of the file. This
	 * only applies to folders and can lead to an error unless provided
	 * if the folder is not empty.
	 */
	readonly recursive: boolean;

	/**
	 * Set to `true` to attempt to move the file to trash
	 * instead of deleting it permanently from disk.
	 *
	 * This option maybe not be supported on all providers.
	 */
	readonly useTrash: boolean;

	/**
	 * The optional `atomic` flag can be used to make sure
	 * the `delete` method deletes the target atomically by
	 * first renaming it to a temporary resource in the same
	 * folder and then deleting it.
	 *
	 * This option maybe not be supported on all providers.
	 */
	readonly atomic: IFileAtomicOptions | false;
}

export enum FileType {

	/**
	 * File is unknown (neither file, directory nor symbolic link).
	 */
	Unknown = 0,

	/**
	 * File is a normal file.
	 */
	File = 1,

	/**
	 * File is a directory.
	 */
	Directory = 2,

	/**
	 * File is a symbolic link.
	 *
	 * Note: even when the file is a symbolic link, you can test for
	 * `FileType.File` and `FileType.Directory` to know the type of
	 * the target the link points to.
	 */
	SymbolicLink = 64
}

export enum FilePermission {

	/**
	 * File is readonly. Components like editors should not
	 * offer to edit the contents.
	 */
	Readonly = 1,

	/**
	 * File is locked. Components like editors should offer
	 * to edit the contents and ask the user upon saving to
	 * remove the lock.
	 */
	Locked = 2
}

export interface IStat {

	/**
	 * The file type.
	 */
	readonly type: FileType;

	/**
	 * The last modification date represented as millis from unix epoch.
	 */
	readonly mtime: number;

	/**
	 * The creation date represented as millis from unix epoch.
	 */
	readonly ctime: number;

	/**
	 * The size of the file in bytes.
	 */
	readonly size: number;

	/**
	 * The file permissions.
	 */
	readonly permissions?: FilePermission;
}

export interface IWatchOptionsWithoutCorrelation {

	/**
	 * Set to `true` to watch for changes recursively in a folder
	 * and all of its children.
	 */
	recursive: boolean;

	/**
	 * A set of glob patterns or paths to exclude from watching.
	 * Paths can be relative or absolute and when relative are
	 * resolved against the watched folder. Glob patterns are
	 * always matched relative to the watched folder.
	 */
	excludes: string[];

	/**
	 * An optional set of glob patterns or paths to include for
	 * watching. If not provided, all paths are considered for
	 * events.
	 * Paths can be relative or absolute and when relative are
	 * resolved against the watched folder. Glob patterns are
	 * always matched relative to the watched folder.
	 */
	includes?: Array<string | IRelativePattern>;

	/**
	 * If provided, allows to filter the events that the watcher should consider
	 * for emitting. If not provided, all events are emitted.
	 *
	 * For example, to emit added and updated events, set to:
	 * `FileChangeFilter.ADDED | FileChangeFilter.UPDATED`.
	 */
	filter?: FileChangeFilter;
}

export interface IWatchOptions extends IWatchOptionsWithoutCorrelation {

	/**
	 * If provided, file change events from the watcher that
	 * are a result of this watch request will carry the same
	 * id.
	 */
	readonly correlationId?: number;
}

export const enum FileChangeFilter {
	UPDATED = 1 << 1,
	ADDED = 1 << 2,
	DELETED = 1 << 3
}

export interface IWatchOptionsWithCorrelation extends IWatchOptions {
	readonly correlationId: number;
}

export interface IFileSystemWatcher extends IDisposable {

	/**
	 * An event which fires on file/folder change only for changes
	 * that correlate to the watch request with matching correlation
	 * identifier.
	 */
	readonly onDidChange: Event<FileChangesEvent>;
}

export function isFileSystemWatcher(thing: unknown): thing is IFileSystemWatcher {
	const candidate = thing as IFileSystemWatcher | undefined;

	return !!candidate && typeof candidate.onDidChange === 'function';
}

export const enum FileSystemProviderCapabilities {

	/**
	 * No capabilities.
	 */
	None = 0,

	/**
	 * Provider supports unbuffered read/write.
	 */
	FileReadWrite = 1 << 1,

	/**
	 * Provider supports open/read/write/close low level file operations.
	 */
	FileOpenReadWriteClose = 1 << 2,

	/**
	 * Provider supports stream based reading.
	 */
	FileReadStream = 1 << 4,

	/**
	 * Provider supports copy operation.
	 */
	FileFolderCopy = 1 << 3,

	/**
	 * Provider is path case sensitive.
	 */
	PathCaseSensitive = 1 << 10,

	/**
	 * All files of the provider are readonly.
	 */
	Readonly = 1 << 11,

	/**
	 * Provider supports to delete via trash.
	 */
	Trash = 1 << 12,

	/**
	 * Provider support to unlock files for writing.
	 */
	FileWriteUnlock = 1 << 13,

	/**
	 * Provider support to read files atomically. This implies the
	 * provider provides the `FileReadWrite` capability too.
	 */
	FileAtomicRead = 1 << 14,

	/**
	 * Provider support to write files atomically. This implies the
	 * provider provides the `FileReadWrite` capability too.
	 */
	FileAtomicWrite = 1 << 15,

	/**
	 * Provider support to delete atomically.
	 */
	FileAtomicDelete = 1 << 16,

	/**
	 * Provider support to clone files atomically.
	 */
	FileClone = 1 << 17,

	/**
	 * Provider support to resolve real paths.
	 */
	FileRealpath = 1 << 18
}

export interface IFileSystemProvider {

	readonly capabilities: FileSystemProviderCapabilities;
	readonly onDidChangeCapabilities: Event<void>;

	readonly onDidChangeFile: Event<readonly IFileChange[]>;
	readonly onDidWatchError?: Event<string>;
	watch(resource: URI, opts: IWatchOptions): IDisposable;

	stat(resource: URI): Promise<IStat>;
	mkdir(resource: URI): Promise<void>;
	readdir(resource: URI): Promise<[string, FileType][]>;
	delete(resource: URI, opts: IFileDeleteOptions): Promise<void>;

	rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void>;
	copy?(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void>;

	readFile?(resource: URI): Promise<Uint8Array>;
	writeFile?(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void>;

	readFileStream?(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array>;

	open?(resource: URI, opts: IFileOpenOptions): Promise<number>;
	close?(fd: number): Promise<void>;
	read?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number>;
	write?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number>;

	cloneFile?(from: URI, to: URI): Promise<void>;
}

export interface IFileSystemProviderWithFileReadWriteCapability extends IFileSystemProvider {
	readFile(resource: URI): Promise<Uint8Array>;
	writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void>;
}

export function hasReadWriteCapability(provider: IFileSystemProvider): provider is IFileSystemProviderWithFileReadWriteCapability {
	return !!(provider.capabilities & FileSystemProviderCapabilities.FileReadWrite);
}

export interface IFileSystemProviderWithFileFolderCopyCapability extends IFileSystemProvider {
	copy(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void>;
}

export function hasFileFolderCopyCapability(provider: IFileSystemProvider): provider is IFileSystemProviderWithFileFolderCopyCapability {
	return !!(provider.capabilities & FileSystemProviderCapabilities.FileFolderCopy);
}

export interface IFileSystemProviderWithFileCloneCapability extends IFileSystemProvider {
	cloneFile(from: URI, to: URI): Promise<void>;
}

export function hasFileCloneCapability(provider: IFileSystemProvider): provider is IFileSystemProviderWithFileCloneCapability {
	return !!(provider.capabilities & FileSystemProviderCapabilities.FileClone);
}

export interface IFileSystemProviderWithFileRealpathCapability extends IFileSystemProvider {
	realpath(resource: URI): Promise<string>;
}

export function hasFileRealpathCapability(provider: IFileSystemProvider): provider is IFileSystemProviderWithFileRealpathCapability {
	return !!(provider.capabilities & FileSystemProviderCapabilities.FileRealpath);
}

export interface IFileSystemProviderWithOpenReadWriteCloseCapability extends IFileSystemProvider {
	open(resource: URI, opts: IFileOpenOptions): Promise<number>;
	close(fd: number): Promise<void>;
	read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number>;
	write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number>;
}

export function hasOpenReadWriteCloseCapability(provider: IFileSystemProvider): provider is IFileSystemProviderWithOpenReadWriteCloseCapability {
	return !!(provider.capabilities & FileSystemProviderCapabilities.FileOpenReadWriteClose);
}

export interface IFileSystemProviderWithFileReadStreamCapability extends IFileSystemProvider {
	readFileStream(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array>;
}

export function hasFileReadStreamCapability(provider: IFileSystemProvider): provider is IFileSystemProviderWithFileReadStreamCapability {
	return !!(provider.capabilities & FileSystemProviderCapabilities.FileReadStream);
}

export interface IFileSystemProviderWithFileAtomicReadCapability extends IFileSystemProvider {
	readFile(resource: URI, opts?: IFileAtomicReadOptions): Promise<Uint8Array>;
	enforceAtomicReadFile?(resource: URI): boolean;
}

export function hasFileAtomicReadCapability(provider: IFileSystemProvider): provider is IFileSystemProviderWithFileAtomicReadCapability {
	if (!hasReadWriteCapability(provider)) {
		return false; // we require the `FileReadWrite` capability too
	}

	return !!(provider.capabilities & FileSystemProviderCapabilities.FileAtomicRead);
}

export interface IFileSystemProviderWithFileAtomicWriteCapability extends IFileSystemProvider {
	writeFile(resource: URI, contents: Uint8Array, opts?: IFileAtomicWriteOptions): Promise<void>;
	enforceAtomicWriteFile?(resource: URI): IFileAtomicOptions | false;
}

export function hasFileAtomicWriteCapability(provider: IFileSystemProvider): provider is IFileSystemProviderWithFileAtomicWriteCapability {
	if (!hasReadWriteCapability(provider)) {
		return false; // we require the `FileReadWrite` capability too
	}

	return !!(provider.capabilities & FileSystemProviderCapabilities.FileAtomicWrite);
}

export interface IFileSystemProviderWithFileAtomicDeleteCapability extends IFileSystemProvider {
	delete(resource: URI, opts: IFileAtomicDeleteOptions): Promise<void>;
	enforceAtomicDelete?(resource: URI): IFileAtomicOptions | false;
}

export function hasFileAtomicDeleteCapability(provider: IFileSystemProvider): provider is IFileSystemProviderWithFileAtomicDeleteCapability {
	return !!(provider.capabilities & FileSystemProviderCapabilities.FileAtomicDelete);
}

export interface IFileSystemProviderWithReadonlyCapability extends IFileSystemProvider {

	readonly capabilities: FileSystemProviderCapabilities.Readonly & FileSystemProviderCapabilities;

	/**
	 * An optional message to show in the UI to explain why the file system is readonly.
	 */
	readonly readOnlyMessage?: IMarkdownString;
}

export function hasReadonlyCapability(provider: IFileSystemProvider): provider is IFileSystemProviderWithReadonlyCapability {
	return !!(provider.capabilities & FileSystemProviderCapabilities.Readonly);
}

export enum FileSystemProviderErrorCode {
	FileExists = 'EntryExists',
	FileNotFound = 'EntryNotFound',
	FileNotADirectory = 'EntryNotADirectory',
	FileIsADirectory = 'EntryIsADirectory',
	FileExceedsStorageQuota = 'EntryExceedsStorageQuota',
	FileTooLarge = 'EntryTooLarge',
	FileWriteLocked = 'EntryWriteLocked',
	NoPermissions = 'NoPermissions',
	Unavailable = 'Unavailable',
	Unknown = 'Unknown'
}

export interface IFileSystemProviderError extends Error {
	readonly name: string;
	readonly code: FileSystemProviderErrorCode;
}

export class FileSystemProviderError extends Error implements IFileSystemProviderError {

	static create(error: Error | string, code: FileSystemProviderErrorCode): FileSystemProviderError {
		const providerError = new FileSystemProviderError(error.toString(), code);
		markAsFileSystemProviderError(providerError, code);

		return providerError;
	}

	private constructor(message: string, readonly code: FileSystemProviderErrorCode) {
		super(message);
	}
}

export function createFileSystemProviderError(error: Error | string, code: FileSystemProviderErrorCode): FileSystemProviderError {
	return FileSystemProviderError.create(error, code);
}

export function ensureFileSystemProviderError(error?: Error): Error {
	if (!error) {
		return createFileSystemProviderError(localize('unknownError', "Unknown Error"), FileSystemProviderErrorCode.Unknown); // https://github.com/microsoft/vscode/issues/72798
	}

	return error;
}

export function markAsFileSystemProviderError(error: Error, code: FileSystemProviderErrorCode): Error {
	error.name = code ? `${code} (FileSystemError)` : `FileSystemError`;

	return error;
}

export function toFileSystemProviderErrorCode(error: Error | undefined | null): FileSystemProviderErrorCode {

	// Guard against abuse
	if (!error) {
		return FileSystemProviderErrorCode.Unknown;
	}

	// FileSystemProviderError comes with the code
	if (error instanceof FileSystemProviderError) {
		return error.code;
	}

	// Any other error, check for name match by assuming that the error
	// went through the markAsFileSystemProviderError() method
	const match = /^(.+) \(FileSystemError\)$/.exec(error.name);
	if (!match) {
		return FileSystemProviderErrorCode.Unknown;
	}

	switch (match[1]) {
		case FileSystemProviderErrorCode.FileExists: return FileSystemProviderErrorCode.FileExists;
		case FileSystemProviderErrorCode.FileIsADirectory: return FileSystemProviderErrorCode.FileIsADirectory;
		case FileSystemProviderErrorCode.FileNotADirectory: return FileSystemProviderErrorCode.FileNotADirectory;
		case FileSystemProviderErrorCode.FileNotFound: return FileSystemProviderErrorCode.FileNotFound;
		case FileSystemProviderErrorCode.FileTooLarge: return FileSystemProviderErrorCode.FileTooLarge;
		case FileSystemProviderErrorCode.FileWriteLocked: return FileSystemProviderErrorCode.FileWriteLocked;
		case FileSystemProviderErrorCode.NoPermissions: return FileSystemProviderErrorCode.NoPermissions;
		case FileSystemProviderErrorCode.Unavailable: return FileSystemProviderErrorCode.Unavailable;
	}

	return FileSystemProviderErrorCode.Unknown;
}

export function toFileOperationResult(error: Error): FileOperationResult {

	// FileSystemProviderError comes with the result already
	if (error instanceof FileOperationError) {
		return error.fileOperationResult;
	}

	// Otherwise try to find from code
	switch (toFileSystemProviderErrorCode(error)) {
		case FileSystemProviderErrorCode.FileNotFound:
			return FileOperationResult.FILE_NOT_FOUND;
		case FileSystemProviderErrorCode.FileIsADirectory:
			return FileOperationResult.FILE_IS_DIRECTORY;
		case FileSystemProviderErrorCode.FileNotADirectory:
			return FileOperationResult.FILE_NOT_DIRECTORY;
		case FileSystemProviderErrorCode.FileWriteLocked:
			return FileOperationResult.FILE_WRITE_LOCKED;
		case FileSystemProviderErrorCode.NoPermissions:
			return FileOperationResult.FILE_PERMISSION_DENIED;
		case FileSystemProviderErrorCode.FileExists:
			return FileOperationResult.FILE_MOVE_CONFLICT;
		case FileSystemProviderErrorCode.FileTooLarge:
			return FileOperationResult.FILE_TOO_LARGE;
		default:
			return FileOperationResult.FILE_OTHER_ERROR;
	}
}

export interface IFileSystemProviderRegistrationEvent {
	readonly added: boolean;
	readonly scheme: string;
	readonly provider?: IFileSystemProvider;
}

export interface IFileSystemProviderCapabilitiesChangeEvent {
	readonly provider: IFileSystemProvider;
	readonly scheme: string;
}

export interface IFileSystemProviderActivationEvent {
	readonly scheme: string;
	join(promise: Promise<void>): void;
}

export const enum FileOperation {
	CREATE,
	DELETE,
	MOVE,
	COPY,
	WRITE
}

export interface IFileOperationEvent {

	readonly resource: URI;
	readonly operation: FileOperation;

	isOperation(operation: FileOperation.DELETE | FileOperation.WRITE): boolean;
	isOperation(operation: FileOperation.CREATE | FileOperation.MOVE | FileOperation.COPY): this is IFileOperationEventWithMetadata;
}

export interface IFileOperationEventWithMetadata extends IFileOperationEvent {
	readonly target: IFileStatWithMetadata;
}

export class FileOperationEvent implements IFileOperationEvent {

	constructor(resource: URI, operation: FileOperation.DELETE | FileOperation.WRITE);
	constructor(resource: URI, operation: FileOperation.CREATE | FileOperation.MOVE | FileOperation.COPY, target: IFileStatWithMetadata);
	constructor(readonly resource: URI, readonly operation: FileOperation, readonly target?: IFileStatWithMetadata) { }

	isOperation(operation: FileOperation.DELETE | FileOperation.WRITE): boolean;
	isOperation(operation: FileOperation.CREATE | FileOperation.MOVE | FileOperation.COPY): this is IFileOperationEventWithMetadata;
	isOperation(operation: FileOperation): boolean {
		return this.operation === operation;
	}
}

/**
 * Possible changes that can occur to a file.
 */
export const enum FileChangeType {
	UPDATED,
	ADDED,
	DELETED
}

/**
 * Identifies a single change in a file.
 */
export interface IFileChange {

	/**
	 * The type of change that occurred to the file.
	 */
	type: FileChangeType;

	/**
	 * The unified resource identifier of the file that changed.
	 */
	readonly resource: URI;

	/**
	 * If provided when starting the file watcher, the correlation
	 * identifier will match the original file watching request as
	 * a way to identify the original component that is interested
	 * in the change.
	 */
	readonly cId?: number;
}

export class FileChangesEvent {

	private static readonly MIXED_CORRELATION = null;

	private readonly correlationId: number | undefined | typeof FileChangesEvent.MIXED_CORRELATION = undefined;

	constructor(changes: readonly IFileChange[], private readonly ignorePathCasing: boolean) {
		for (const change of changes) {

			// Split by type
			switch (change.type) {
				case FileChangeType.ADDED:
					this.rawAdded.push(change.resource);
					break;
				case FileChangeType.UPDATED:
					this.rawUpdated.push(change.resource);
					break;
				case FileChangeType.DELETED:
					this.rawDeleted.push(change.resource);
					break;
			}

			// Figure out events correlation
			if (this.correlationId !== FileChangesEvent.MIXED_CORRELATION) {
				if (typeof change.cId === 'number') {
					if (this.correlationId === undefined) {
						this.correlationId = change.cId; 							// correlation not yet set, just take it
					} else if (this.correlationId !== change.cId) {
						this.correlationId = FileChangesEvent.MIXED_CORRELATION;	// correlation mismatch, we have mixed correlation
					}
				} else {
					if (this.correlationId !== undefined) {
						this.correlationId = FileChangesEvent.MIXED_CORRELATION;	// correlation mismatch, we have mixed correlation
					}
				}
			}
		}
	}

	private readonly added = new Lazy(() => {
		const added = TernarySearchTree.forUris<boolean>(() => this.ignorePathCasing);
		added.fill(this.rawAdded.map(resource => [resource, true]));

		return added;
	});

	private readonly updated = new Lazy(() => {
		const updated = TernarySearchTree.forUris<boolean>(() => this.ignorePathCasing);
		updated.fill(this.rawUpdated.map(resource => [resource, true]));

		return updated;
	});

	private readonly deleted = new Lazy(() => {
		const deleted = TernarySearchTree.forUris<boolean>(() => this.ignorePathCasing);
		deleted.fill(this.rawDeleted.map(resource => [resource, true]));

		return deleted;
	});

	/**
	 * Find out if the file change events match the provided resource.
	 *
	 * Note: when passing `FileChangeType.DELETED`, we consider a match
	 * also when the parent of the resource got deleted.
	 */
	contains(resource: URI, ...types: FileChangeType[]): boolean {
		return this.doContains(resource, { includeChildren: false }, ...types);
	}

	/**
	 * Find out if the file change events either match the provided
	 * resource, or contain a child of this resource.
	 */
	affects(resource: URI, ...types: FileChangeType[]): boolean {
		return this.doContains(resource, { includeChildren: true }, ...types);
	}

	private doContains(resource: URI, options: { includeChildren: boolean }, ...types: FileChangeType[]): boolean {
		if (!resource) {
			return false;
		}

		const hasTypesFilter = types.length > 0;

		// Added
		if (!hasTypesFilter || types.includes(FileChangeType.ADDED)) {
			if (this.added.value.get(resource)) {
				return true;
			}

			if (options.includeChildren && this.added.value.findSuperstr(resource)) {
				return true;
			}
		}

		// Updated
		if (!hasTypesFilter || types.includes(FileChangeType.UPDATED)) {
			if (this.updated.value.get(resource)) {
				return true;
			}

			if (options.includeChildren && this.updated.value.findSuperstr(resource)) {
				return true;
			}
		}

		// Deleted
		if (!hasTypesFilter || types.includes(FileChangeType.DELETED)) {
			if (this.deleted.value.findSubstr(resource) /* deleted also considers parent folders */) {
				return true;
			}

			if (options.includeChildren && this.deleted.value.findSuperstr(resource)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Returns if this event contains added files.
	 */
	gotAdded(): boolean {
		return this.rawAdded.length > 0;
	}

	/**
	 * Returns if this event contains deleted files.
	 */
	gotDeleted(): boolean {
		return this.rawDeleted.length > 0;
	}

	/**
	 * Returns if this event contains updated files.
	 */
	gotUpdated(): boolean {
		return this.rawUpdated.length > 0;
	}

	/**
	 * Returns if this event contains changes that correlate to the
	 * provided `correlationId`.
	 *
	 * File change event correlation is an advanced watch feature that
	 * allows to  identify from which watch request the events originate
	 * from. This correlation allows to route events specifically
	 * only to the requestor and not emit them to all listeners.
	 */
	correlates(correlationId: number): boolean {
		return this.correlationId === correlationId;
	}

	/**
	 * Figure out if the event contains changes that correlate to one
	 * correlation identifier.
	 *
	 * File change event correlation is an advanced watch feature that
	 * allows to  identify from which watch request the events originate
	 * from. This correlation allows to route events specifically
	 * only to the requestor and not emit them to all listeners.
	 */
	hasCorrelation(): boolean {
		return typeof this.correlationId === 'number';
	}

	/**
	 * @deprecated use the `contains` or `affects` method to efficiently find
	 * out if the event relates to a given resource. these methods ensure:
	 * - that there is no expensive lookup needed (by using a `TernarySearchTree`)
	 * - correctly handles `FileChangeType.DELETED` events
	 */
	readonly rawAdded: URI[] = [];

	/**
	* @deprecated use the `contains` or `affects` method to efficiently find
	* out if the event relates to a given resource. these methods ensure:
	* - that there is no expensive lookup needed (by using a `TernarySearchTree`)
	* - correctly handles `FileChangeType.DELETED` events
	*/
	readonly rawUpdated: URI[] = [];

	/**
	* @deprecated use the `contains` or `affects` method to efficiently find
	* out if the event relates to a given resource. these methods ensure:
	* - that there is no expensive lookup needed (by using a `TernarySearchTree`)
	* - correctly handles `FileChangeType.DELETED` events
	*/
	readonly rawDeleted: URI[] = [];
}

export function isParent(path: string, candidate: string, ignoreCase?: boolean): boolean {
	if (!path || !candidate || path === candidate) {
		return false;
	}

	if (candidate.length > path.length) {
		return false;
	}

	if (candidate.charAt(candidate.length - 1) !== sep) {
		candidate += sep;
	}

	if (ignoreCase) {
		return startsWithIgnoreCase(path, candidate);
	}

	return path.indexOf(candidate) === 0;
}

export interface IBaseFileStat {

	/**
	 * The unified resource identifier of this file or folder.
	 */
	readonly resource: URI;

	/**
	 * The name which is the last segment
	 * of the {{path}}.
	 */
	readonly name: string;

	/**
	 * The size of the file.
	 *
	 * The value may or may not be resolved as
	 * it is optional.
	 */
	readonly size?: number;

	/**
	 * The last modification date represented as millis from unix epoch.
	 *
	 * The value may or may not be resolved as
	 * it is optional.
	 */
	readonly mtime?: number;

	/**
	 * The creation date represented as millis from unix epoch.
	 *
	 * The value may or may not be resolved as
	 * it is optional.
	 */
	readonly ctime?: number;

	/**
	 * A unique identifier that represents the
	 * current state of the file or directory.
	 *
	 * The value may or may not be resolved as
	 * it is optional.
	 */
	readonly etag?: string;

	/**
	 * File is readonly. Components like editors should not
	 * offer to edit the contents.
	 */
	readonly readonly?: boolean;

	/**
	 * File is locked. Components like editors should offer
	 * to edit the contents and ask the user upon saving to
	 * remove the lock.
	 */
	readonly locked?: boolean;
}

export interface IBaseFileStatWithMetadata extends Required<IBaseFileStat> { }

/**
 * A file resource with meta information and resolved children if any.
 */
export interface IFileStat extends IBaseFileStat {

	/**
	 * The resource is a file.
	 */
	readonly isFile: boolean;

	/**
	 * The resource is a directory.
	 */
	readonly isDirectory: boolean;

	/**
	 * The resource is a symbolic link. Note: even when the
	 * file is a symbolic link, you can test for `FileType.File`
	 * and `FileType.Directory` to know the type of the target
	 * the link points to.
	 */
	readonly isSymbolicLink: boolean;

	/**
	 * The children of the file stat or undefined if none.
	 */
	children: IFileStat[] | undefined;
}

export interface IFileStatWithMetadata extends IFileStat, IBaseFileStatWithMetadata {
	readonly mtime: number;
	readonly ctime: number;
	readonly etag: string;
	readonly size: number;
	readonly readonly: boolean;
	readonly locked: boolean;
	readonly children: IFileStatWithMetadata[] | undefined;
}

export interface IFileStatResult {
	readonly stat?: IFileStat;
	readonly success: boolean;
}

export interface IFileStatResultWithMetadata extends IFileStatResult {
	readonly stat?: IFileStatWithMetadata;
}

export interface IFileStatWithPartialMetadata extends Omit<IFileStatWithMetadata, 'children'> { }

export interface IFileContent extends IBaseFileStatWithMetadata {

	/**
	 * The content of a file as buffer.
	 */
	readonly value: VSBuffer;
}

export interface IFileStreamContent extends IBaseFileStatWithMetadata {

	/**
	 * The content of a file as stream.
	 */
	readonly value: VSBufferReadableStream;
}

export interface IBaseReadFileOptions extends IFileReadStreamOptions {

	/**
	 * The optional etag parameter allows to return early from resolving the resource if
	 * the contents on disk match the etag. This prevents accumulated reading of resources
	 * that have been read already with the same etag.
	 * It is the task of the caller to makes sure to handle this error case from the promise.
	 */
	readonly etag?: string;
}

export interface IReadFileStreamOptions extends IBaseReadFileOptions { }

export interface IReadFileOptions extends IBaseReadFileOptions {

	/**
	 * The optional `atomic` flag can be used to make sure
	 * the `readFile` method is not running in parallel with
	 * any `write` operations in the same process.
	 *
	 * Typically you should not need to use this flag but if
	 * for example you are quickly reading a file right after
	 * a file event occurred and the file changes a lot, there
	 * is a chance that a read returns an empty or partial file
	 * because a pending write has not finished yet.
	 *
	 * Note: this does not prevent the file from being written
	 * to from a different process. If you need such atomic
	 * operations, you better use a real database as storage.
	 */
	readonly atomic?: boolean;
}

export interface IWriteFileOptions {

	/**
	 * The last known modification time of the file. This can be used to prevent dirty writes.
	 */
	readonly mtime?: number;

	/**
	 * The etag of the file. This can be used to prevent dirty writes.
	 */
	readonly etag?: string;

	/**
	 * Whether to attempt to unlock a file before writing.
	 */
	readonly unlock?: boolean;

	/**
	 * The optional `atomic` flag can be used to make sure
	 * the `writeFile` method updates the target file atomically
	 * by first writing to a temporary file in the same folder
	 * and then renaming it over the target.
	 */
	readonly atomic?: IFileAtomicOptions | false;
}

export interface IResolveFileOptions {

	/**
	 * Automatically continue resolving children of a directory until the provided resources
	 * are found.
	 */
	readonly resolveTo?: readonly URI[];

	/**
	 * Automatically continue resolving children of a directory if the number of children is 1.
	 */
	readonly resolveSingleChildDescendants?: boolean;

	/**
	 * Will resolve mtime, ctime, size and etag of files if enabled. This can have a negative impact
	 * on performance and thus should only be used when these values are required.
	 */
	readonly resolveMetadata?: boolean;
}

export interface IResolveMetadataFileOptions extends IResolveFileOptions {
	readonly resolveMetadata: true;
}

export interface ICreateFileOptions {

	/**
	 * Overwrite the file to create if it already exists on disk. Otherwise
	 * an error will be thrown (FILE_MODIFIED_SINCE).
	 */
	readonly overwrite?: boolean;
}

export class FileOperationError extends Error {
	constructor(
		message: string,
		readonly fileOperationResult: FileOperationResult,
		readonly options?: IReadFileOptions | IWriteFileOptions | ICreateFileOptions
	) {
		super(message);
	}
}

export class TooLargeFileOperationError extends FileOperationError {
	constructor(
		message: string,
		override readonly fileOperationResult: FileOperationResult.FILE_TOO_LARGE,
		readonly size: number,
		options?: IReadFileOptions
	) {
		super(message, fileOperationResult, options);
	}
}

export class NotModifiedSinceFileOperationError extends FileOperationError {

	constructor(
		message: string,
		readonly stat: IFileStatWithMetadata,
		options?: IReadFileOptions
	) {
		super(message, FileOperationResult.FILE_NOT_MODIFIED_SINCE, options);
	}
}

export const enum FileOperationResult {
	FILE_IS_DIRECTORY,
	FILE_NOT_FOUND,
	FILE_NOT_MODIFIED_SINCE,
	FILE_MODIFIED_SINCE,
	FILE_MOVE_CONFLICT,
	FILE_WRITE_LOCKED,
	FILE_PERMISSION_DENIED,
	FILE_TOO_LARGE,
	FILE_INVALID_PATH,
	FILE_NOT_DIRECTORY,
	FILE_OTHER_ERROR
}

//#endregion

//#region Settings

export const AutoSaveConfiguration = {
	OFF: 'off',
	AFTER_DELAY: 'afterDelay',
	ON_FOCUS_CHANGE: 'onFocusChange',
	ON_WINDOW_CHANGE: 'onWindowChange'
};

export const HotExitConfiguration = {
	OFF: 'off',
	ON_EXIT: 'onExit',
	ON_EXIT_AND_WINDOW_CLOSE: 'onExitAndWindowClose'
};

export const FILES_ASSOCIATIONS_CONFIG = 'files.associations';
export const FILES_EXCLUDE_CONFIG = 'files.exclude';
export const FILES_READONLY_INCLUDE_CONFIG = 'files.readonlyInclude';
export const FILES_READONLY_EXCLUDE_CONFIG = 'files.readonlyExclude';
export const FILES_READONLY_FROM_PERMISSIONS_CONFIG = 'files.readonlyFromPermissions';

export interface IGlobPatterns {
	[filepattern: string]: boolean;
}

export interface IFilesConfiguration {
	files?: IFilesConfigurationNode;
}

export interface IFilesConfigurationNode {
	associations: { [filepattern: string]: string };
	exclude: IExpression;
	watcherExclude: IGlobPatterns;
	watcherInclude: string[];
	encoding: string;
	autoGuessEncoding: boolean;
	candidateGuessEncodings: string[];
	defaultLanguage: string;
	trimTrailingWhitespace: boolean;
	autoSave: string;
	autoSaveDelay: number;
	autoSaveWorkspaceFilesOnly: boolean;
	autoSaveWhenNoErrors: boolean;
	eol: string;
	enableTrash: boolean;
	hotExit: string;
	saveConflictResolution: 'askUser' | 'overwriteFileOnDisk';
	readonlyInclude: IGlobPatterns;
	readonlyExclude: IGlobPatterns;
	readonlyFromPermissions: boolean;
}

//#endregion

//#region Utilities

export enum FileKind {
	FILE,
	FOLDER,
	ROOT_FOLDER
}

/**
 * A hint to disable etag checking for reading/writing.
 */
export const ETAG_DISABLED = '';

export function etag(stat: { mtime: number; size: number }): string;
export function etag(stat: { mtime: number | undefined; size: number | undefined }): string | undefined;
export function etag(stat: { mtime: number | undefined; size: number | undefined }): string | undefined {
	if (typeof stat.size !== 'number' || typeof stat.mtime !== 'number') {
		return undefined;
	}

	return stat.mtime.toString(29) + stat.size.toString(31);
}

export async function whenProviderRegistered(file: URI, fileService: IFileService): Promise<void> {
	if (fileService.hasProvider(URI.from({ scheme: file.scheme }))) {
		return;
	}

	return new Promise(resolve => {
		const disposable = fileService.onDidChangeFileSystemProviderRegistrations(e => {
			if (e.scheme === file.scheme && e.added) {
				disposable.dispose();
				resolve();
			}
		});
	});
}

/**
 * Helper to format a raw byte size into a human readable label.
 */
export class ByteSize {

	static readonly KB = 1024;
	static readonly MB = ByteSize.KB * ByteSize.KB;
	static readonly GB = ByteSize.MB * ByteSize.KB;
	static readonly TB = ByteSize.GB * ByteSize.KB;

	static formatSize(size: number): string {
		if (!isNumber(size)) {
			size = 0;
		}

		if (size < ByteSize.KB) {
			return localize('sizeB', "{0}B", size.toFixed(0));
		}

		if (size < ByteSize.MB) {
			return localize('sizeKB', "{0}KB", (size / ByteSize.KB).toFixed(2));
		}

		if (size < ByteSize.GB) {
			return localize('sizeMB', "{0}MB", (size / ByteSize.MB).toFixed(2));
		}

		if (size < ByteSize.TB) {
			return localize('sizeGB', "{0}GB", (size / ByteSize.GB).toFixed(2));
		}

		return localize('sizeTB', "{0}TB", (size / ByteSize.TB).toFixed(2));
	}
}

// File limits

export function getLargeFileConfirmationLimit(remoteAuthority?: string): number;
export function getLargeFileConfirmationLimit(uri?: URI): number;
export function getLargeFileConfirmationLimit(arg?: string | URI): number {
	const isRemote = typeof arg === 'string' || arg?.scheme === Schemas.vscodeRemote;
	const isLocal = typeof arg !== 'string' && arg?.scheme === Schemas.file;

	if (isLocal) {
		// Local almost has no limit in file size
		return 1024 * ByteSize.MB;
	}

	if (isRemote) {
		// With a remote, pick a low limit to avoid
		// potentially costly file transfers
		return 10 * ByteSize.MB;
	}

	if (isWeb) {
		// Web: we cannot know for sure if a cost
		// is associated with the file transfer
		// so we pick a reasonably small limit
		return 50 * ByteSize.MB;
	}

	// Local desktop: almost no limit in file size
	return 1024 * ByteSize.MB;
}

//#endregion
