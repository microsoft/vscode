/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { sep } from '../../../base/common/path.js';
import { startsWithIgnoreCase } from '../../../base/common/strings.js';
import { isNumber } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { isWeb } from '../../../base/common/platform.js';
import { Schemas } from '../../../base/common/network.js';
import { Lazy } from '../../../base/common/lazy.js';
//#region file service & providers
export const IFileService = createDecorator('fileService');
export function isFileOpenForWriteOptions(options) {
    return options.create === true;
}
export var FileType;
(function (FileType) {
    /**
     * File is unknown (neither file, directory nor symbolic link).
     */
    FileType[FileType["Unknown"] = 0] = "Unknown";
    /**
     * File is a normal file.
     */
    FileType[FileType["File"] = 1] = "File";
    /**
     * File is a directory.
     */
    FileType[FileType["Directory"] = 2] = "Directory";
    /**
     * File is a symbolic link.
     *
     * Note: even when the file is a symbolic link, you can test for
     * `FileType.File` and `FileType.Directory` to know the type of
     * the target the link points to.
     */
    FileType[FileType["SymbolicLink"] = 64] = "SymbolicLink";
})(FileType || (FileType = {}));
export var FilePermission;
(function (FilePermission) {
    /**
     * File is readonly. Components like editors should not
     * offer to edit the contents.
     */
    FilePermission[FilePermission["Readonly"] = 1] = "Readonly";
    /**
     * File is locked. Components like editors should offer
     * to edit the contents and ask the user upon saving to
     * remove the lock.
     */
    FilePermission[FilePermission["Locked"] = 2] = "Locked";
    /**
     * File is executable. Relevant for Unix-like systems where
     * the executable bit determines if a file can be run.
     */
    FilePermission[FilePermission["Executable"] = 4] = "Executable";
})(FilePermission || (FilePermission = {}));
export var FileChangeFilter;
(function (FileChangeFilter) {
    FileChangeFilter[FileChangeFilter["UPDATED"] = 2] = "UPDATED";
    FileChangeFilter[FileChangeFilter["ADDED"] = 4] = "ADDED";
    FileChangeFilter[FileChangeFilter["DELETED"] = 8] = "DELETED";
})(FileChangeFilter || (FileChangeFilter = {}));
export function isFileSystemWatcher(thing) {
    const candidate = thing;
    return !!candidate && typeof candidate.onDidChange === 'function';
}
export var FileSystemProviderCapabilities;
(function (FileSystemProviderCapabilities) {
    /**
     * No capabilities.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["None"] = 0] = "None";
    /**
     * Provider supports unbuffered read/write.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["FileReadWrite"] = 2] = "FileReadWrite";
    /**
     * Provider supports open/read/write/close low level file operations.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["FileOpenReadWriteClose"] = 4] = "FileOpenReadWriteClose";
    /**
     * Provider supports stream based reading.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["FileReadStream"] = 16] = "FileReadStream";
    /**
     * Provider supports copy operation.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["FileFolderCopy"] = 8] = "FileFolderCopy";
    /**
     * Provider is path case sensitive.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["PathCaseSensitive"] = 1024] = "PathCaseSensitive";
    /**
     * All files of the provider are readonly.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["Readonly"] = 2048] = "Readonly";
    /**
     * Provider supports to delete via trash.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["Trash"] = 4096] = "Trash";
    /**
     * Provider support to unlock files for writing.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["FileWriteUnlock"] = 8192] = "FileWriteUnlock";
    /**
     * Provider support to read files atomically. This implies the
     * provider provides the `FileReadWrite` capability too.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["FileAtomicRead"] = 16384] = "FileAtomicRead";
    /**
     * Provider support to write files atomically. This implies the
     * provider provides the `FileReadWrite` capability too.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["FileAtomicWrite"] = 32768] = "FileAtomicWrite";
    /**
     * Provider support to delete atomically.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["FileAtomicDelete"] = 65536] = "FileAtomicDelete";
    /**
     * Provider support to clone files atomically.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["FileClone"] = 131072] = "FileClone";
    /**
     * Provider support to resolve real paths.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["FileRealpath"] = 262144] = "FileRealpath";
    /**
     * Provider support to append to files.
     */
    FileSystemProviderCapabilities[FileSystemProviderCapabilities["FileAppend"] = 524288] = "FileAppend";
})(FileSystemProviderCapabilities || (FileSystemProviderCapabilities = {}));
export function hasReadWriteCapability(provider) {
    return !!(provider.capabilities & 2 /* FileSystemProviderCapabilities.FileReadWrite */);
}
export function hasFileAppendCapability(provider) {
    return !!(provider.capabilities & 524288 /* FileSystemProviderCapabilities.FileAppend */);
}
export function hasFileFolderCopyCapability(provider) {
    return !!(provider.capabilities & 8 /* FileSystemProviderCapabilities.FileFolderCopy */);
}
export function hasFileCloneCapability(provider) {
    return !!(provider.capabilities & 131072 /* FileSystemProviderCapabilities.FileClone */);
}
export function hasFileRealpathCapability(provider) {
    return !!(provider.capabilities & 262144 /* FileSystemProviderCapabilities.FileRealpath */);
}
export function hasOpenReadWriteCloseCapability(provider) {
    return !!(provider.capabilities & 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
}
export function hasFileReadStreamCapability(provider) {
    return !!(provider.capabilities & 16 /* FileSystemProviderCapabilities.FileReadStream */);
}
export function hasFileAtomicReadCapability(provider) {
    if (!hasReadWriteCapability(provider)) {
        return false; // we require the `FileReadWrite` capability too
    }
    return !!(provider.capabilities & 16384 /* FileSystemProviderCapabilities.FileAtomicRead */);
}
export function hasFileAtomicWriteCapability(provider) {
    if (!hasReadWriteCapability(provider)) {
        return false; // we require the `FileReadWrite` capability too
    }
    return !!(provider.capabilities & 32768 /* FileSystemProviderCapabilities.FileAtomicWrite */);
}
export function hasFileAtomicDeleteCapability(provider) {
    return !!(provider.capabilities & 65536 /* FileSystemProviderCapabilities.FileAtomicDelete */);
}
export function hasReadonlyCapability(provider) {
    return !!(provider.capabilities & 2048 /* FileSystemProviderCapabilities.Readonly */);
}
export var FileSystemProviderErrorCode;
(function (FileSystemProviderErrorCode) {
    FileSystemProviderErrorCode["FileExists"] = "EntryExists";
    FileSystemProviderErrorCode["FileNotFound"] = "EntryNotFound";
    FileSystemProviderErrorCode["FileNotADirectory"] = "EntryNotADirectory";
    FileSystemProviderErrorCode["FileIsADirectory"] = "EntryIsADirectory";
    FileSystemProviderErrorCode["FileExceedsStorageQuota"] = "EntryExceedsStorageQuota";
    FileSystemProviderErrorCode["FileTooLarge"] = "EntryTooLarge";
    FileSystemProviderErrorCode["FileWriteLocked"] = "EntryWriteLocked";
    FileSystemProviderErrorCode["NoPermissions"] = "NoPermissions";
    FileSystemProviderErrorCode["Unavailable"] = "Unavailable";
    FileSystemProviderErrorCode["Unknown"] = "Unknown";
})(FileSystemProviderErrorCode || (FileSystemProviderErrorCode = {}));
export class FileSystemProviderError extends Error {
    static create(error, code) {
        const providerError = new FileSystemProviderError(error.toString(), code);
        markAsFileSystemProviderError(providerError, code);
        return providerError;
    }
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
export function createFileSystemProviderError(error, code) {
    return FileSystemProviderError.create(error, code);
}
export function ensureFileSystemProviderError(error) {
    if (!error) {
        return createFileSystemProviderError(localize('unknownError', "Unknown Error"), FileSystemProviderErrorCode.Unknown); // https://github.com/microsoft/vscode/issues/72798
    }
    return error;
}
export function markAsFileSystemProviderError(error, code) {
    error.name = code ? `${code} (FileSystemError)` : `FileSystemError`;
    return error;
}
export function toFileSystemProviderErrorCode(error) {
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
export function toFileOperationResult(error) {
    // FileSystemProviderError comes with the result already
    if (error instanceof FileOperationError) {
        return error.fileOperationResult;
    }
    // Otherwise try to find from code
    switch (toFileSystemProviderErrorCode(error)) {
        case FileSystemProviderErrorCode.FileNotFound:
            return 1 /* FileOperationResult.FILE_NOT_FOUND */;
        case FileSystemProviderErrorCode.FileIsADirectory:
            return 0 /* FileOperationResult.FILE_IS_DIRECTORY */;
        case FileSystemProviderErrorCode.FileNotADirectory:
            return 9 /* FileOperationResult.FILE_NOT_DIRECTORY */;
        case FileSystemProviderErrorCode.FileWriteLocked:
            return 5 /* FileOperationResult.FILE_WRITE_LOCKED */;
        case FileSystemProviderErrorCode.NoPermissions:
            return 6 /* FileOperationResult.FILE_PERMISSION_DENIED */;
        case FileSystemProviderErrorCode.FileExists:
            return 4 /* FileOperationResult.FILE_MOVE_CONFLICT */;
        case FileSystemProviderErrorCode.FileTooLarge:
            return 7 /* FileOperationResult.FILE_TOO_LARGE */;
        default:
            return 10 /* FileOperationResult.FILE_OTHER_ERROR */;
    }
}
export var FileOperation;
(function (FileOperation) {
    FileOperation[FileOperation["CREATE"] = 0] = "CREATE";
    FileOperation[FileOperation["DELETE"] = 1] = "DELETE";
    FileOperation[FileOperation["MOVE"] = 2] = "MOVE";
    FileOperation[FileOperation["COPY"] = 3] = "COPY";
    FileOperation[FileOperation["WRITE"] = 4] = "WRITE";
})(FileOperation || (FileOperation = {}));
export class FileOperationEvent {
    constructor(resource, operation, target) {
        this.resource = resource;
        this.operation = operation;
        this.target = target;
    }
    isOperation(operation) {
        return this.operation === operation;
    }
}
/**
 * Possible changes that can occur to a file.
 */
export var FileChangeType;
(function (FileChangeType) {
    FileChangeType[FileChangeType["UPDATED"] = 0] = "UPDATED";
    FileChangeType[FileChangeType["ADDED"] = 1] = "ADDED";
    FileChangeType[FileChangeType["DELETED"] = 2] = "DELETED";
})(FileChangeType || (FileChangeType = {}));
export class FileChangesEvent {
    static { this.MIXED_CORRELATION = null; }
    constructor(changes, ignorePathCasing) {
        this.ignorePathCasing = ignorePathCasing;
        this.correlationId = undefined;
        this.added = new Lazy(() => {
            const added = TernarySearchTree.forUris(() => this.ignorePathCasing);
            added.fill(this.rawAdded.map(resource => [resource, true]));
            return added;
        });
        this.updated = new Lazy(() => {
            const updated = TernarySearchTree.forUris(() => this.ignorePathCasing);
            updated.fill(this.rawUpdated.map(resource => [resource, true]));
            return updated;
        });
        this.deleted = new Lazy(() => {
            const deleted = TernarySearchTree.forUris(() => this.ignorePathCasing);
            deleted.fill(this.rawDeleted.map(resource => [resource, true]));
            return deleted;
        });
        /**
         * @deprecated use the `contains` or `affects` method to efficiently find
         * out if the event relates to a given resource. these methods ensure:
         * - that there is no expensive lookup needed (by using a `TernarySearchTree`)
         * - correctly handles `FileChangeType.DELETED` events
         */
        this.rawAdded = [];
        /**
        * @deprecated use the `contains` or `affects` method to efficiently find
        * out if the event relates to a given resource. these methods ensure:
        * - that there is no expensive lookup needed (by using a `TernarySearchTree`)
        * - correctly handles `FileChangeType.DELETED` events
        */
        this.rawUpdated = [];
        /**
        * @deprecated use the `contains` or `affects` method to efficiently find
        * out if the event relates to a given resource. these methods ensure:
        * - that there is no expensive lookup needed (by using a `TernarySearchTree`)
        * - correctly handles `FileChangeType.DELETED` events
        */
        this.rawDeleted = [];
        for (const change of changes) {
            // Split by type
            switch (change.type) {
                case 1 /* FileChangeType.ADDED */:
                    this.rawAdded.push(change.resource);
                    break;
                case 0 /* FileChangeType.UPDATED */:
                    this.rawUpdated.push(change.resource);
                    break;
                case 2 /* FileChangeType.DELETED */:
                    this.rawDeleted.push(change.resource);
                    break;
            }
            // Figure out events correlation
            if (this.correlationId !== FileChangesEvent.MIXED_CORRELATION) {
                if (typeof change.cId === 'number') {
                    if (this.correlationId === undefined) {
                        this.correlationId = change.cId; // correlation not yet set, just take it
                    }
                    else if (this.correlationId !== change.cId) {
                        this.correlationId = FileChangesEvent.MIXED_CORRELATION; // correlation mismatch, we have mixed correlation
                    }
                }
                else {
                    if (this.correlationId !== undefined) {
                        this.correlationId = FileChangesEvent.MIXED_CORRELATION; // correlation mismatch, we have mixed correlation
                    }
                }
            }
        }
    }
    /**
     * Find out if the file change events match the provided resource.
     *
     * Note: when passing `FileChangeType.DELETED`, we consider a match
     * also when the parent of the resource got deleted.
     */
    contains(resource, ...types) {
        return this.doContains(resource, { includeChildren: false }, ...types);
    }
    /**
     * Find out if the file change events either match the provided
     * resource, or contain a child of this resource.
     */
    affects(resource, ...types) {
        return this.doContains(resource, { includeChildren: true }, ...types);
    }
    doContains(resource, options, ...types) {
        if (!resource) {
            return false;
        }
        const hasTypesFilter = types.length > 0;
        // Added
        if (!hasTypesFilter || types.includes(1 /* FileChangeType.ADDED */)) {
            if (this.added.value.get(resource)) {
                return true;
            }
            if (options.includeChildren && this.added.value.findSuperstr(resource)) {
                return true;
            }
        }
        // Updated
        if (!hasTypesFilter || types.includes(0 /* FileChangeType.UPDATED */)) {
            if (this.updated.value.get(resource)) {
                return true;
            }
            if (options.includeChildren && this.updated.value.findSuperstr(resource)) {
                return true;
            }
        }
        // Deleted
        if (!hasTypesFilter || types.includes(2 /* FileChangeType.DELETED */)) {
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
    gotAdded() {
        return this.rawAdded.length > 0;
    }
    /**
     * Returns if this event contains deleted files.
     */
    gotDeleted() {
        return this.rawDeleted.length > 0;
    }
    /**
     * Returns if this event contains updated files.
     */
    gotUpdated() {
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
    correlates(correlationId) {
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
    hasCorrelation() {
        return typeof this.correlationId === 'number';
    }
}
export function isParent(path, candidate, ignoreCase) {
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
export class FileOperationError extends Error {
    constructor(message, fileOperationResult, options) {
        super(message);
        this.fileOperationResult = fileOperationResult;
        this.options = options;
    }
}
export class TooLargeFileOperationError extends FileOperationError {
    constructor(message, fileOperationResult, size, options) {
        super(message, fileOperationResult, options);
        this.fileOperationResult = fileOperationResult;
        this.size = size;
    }
}
export class NotModifiedSinceFileOperationError extends FileOperationError {
    constructor(message, stat, options) {
        super(message, 2 /* FileOperationResult.FILE_NOT_MODIFIED_SINCE */, options);
        this.stat = stat;
    }
}
export var FileOperationResult;
(function (FileOperationResult) {
    FileOperationResult[FileOperationResult["FILE_IS_DIRECTORY"] = 0] = "FILE_IS_DIRECTORY";
    FileOperationResult[FileOperationResult["FILE_NOT_FOUND"] = 1] = "FILE_NOT_FOUND";
    FileOperationResult[FileOperationResult["FILE_NOT_MODIFIED_SINCE"] = 2] = "FILE_NOT_MODIFIED_SINCE";
    FileOperationResult[FileOperationResult["FILE_MODIFIED_SINCE"] = 3] = "FILE_MODIFIED_SINCE";
    FileOperationResult[FileOperationResult["FILE_MOVE_CONFLICT"] = 4] = "FILE_MOVE_CONFLICT";
    FileOperationResult[FileOperationResult["FILE_WRITE_LOCKED"] = 5] = "FILE_WRITE_LOCKED";
    FileOperationResult[FileOperationResult["FILE_PERMISSION_DENIED"] = 6] = "FILE_PERMISSION_DENIED";
    FileOperationResult[FileOperationResult["FILE_TOO_LARGE"] = 7] = "FILE_TOO_LARGE";
    FileOperationResult[FileOperationResult["FILE_INVALID_PATH"] = 8] = "FILE_INVALID_PATH";
    FileOperationResult[FileOperationResult["FILE_NOT_DIRECTORY"] = 9] = "FILE_NOT_DIRECTORY";
    FileOperationResult[FileOperationResult["FILE_OTHER_ERROR"] = 10] = "FILE_OTHER_ERROR";
})(FileOperationResult || (FileOperationResult = {}));
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
//#endregion
//#region Utilities
export var FileKind;
(function (FileKind) {
    FileKind[FileKind["FILE"] = 0] = "FILE";
    FileKind[FileKind["FOLDER"] = 1] = "FOLDER";
    FileKind[FileKind["ROOT_FOLDER"] = 2] = "ROOT_FOLDER";
})(FileKind || (FileKind = {}));
/**
 * A hint to disable etag checking for reading/writing.
 */
export const ETAG_DISABLED = '';
export function etag(stat) {
    if (typeof stat.size !== 'number' || typeof stat.mtime !== 'number') {
        return undefined;
    }
    return stat.mtime.toString(29) + stat.size.toString(31);
}
export async function whenProviderRegistered(file, fileService) {
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
    static { this.KB = 1024; }
    static { this.MB = ByteSize.KB * ByteSize.KB; }
    static { this.GB = ByteSize.MB * ByteSize.KB; }
    static { this.TB = ByteSize.GB * ByteSize.KB; }
    static formatSize(size) {
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
export function getLargeFileConfirmationLimit(arg) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFPaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDOUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRW5ELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTFELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUVwRCxrQ0FBa0M7QUFFbEMsTUFBTSxDQUFDLE1BQU0sWUFBWSxHQUFHLGVBQWUsQ0FBZSxhQUFhLENBQUMsQ0FBQztBQWlYekUsTUFBTSxVQUFVLHlCQUF5QixDQUFDLE9BQXlCO0lBQ2xFLE9BQU8sT0FBTyxDQUFDLE1BQU0sS0FBSyxJQUFJLENBQUM7QUFDaEMsQ0FBQztBQW9ERCxNQUFNLENBQU4sSUFBWSxRQXlCWDtBQXpCRCxXQUFZLFFBQVE7SUFFbkI7O09BRUc7SUFDSCw2Q0FBVyxDQUFBO0lBRVg7O09BRUc7SUFDSCx1Q0FBUSxDQUFBO0lBRVI7O09BRUc7SUFDSCxpREFBYSxDQUFBO0lBRWI7Ozs7OztPQU1H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