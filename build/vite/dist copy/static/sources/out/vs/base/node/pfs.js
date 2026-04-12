/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { ResourceQueue, timeout } from '../common/async.js';
import { isEqualOrParent, isRootOrDriveLetter, randomPath } from '../common/extpath.js';
import { normalizeNFC } from '../common/normalization.js';
import { basename, dirname, join, normalize, sep } from '../common/path.js';
import { isLinux, isMacintosh, isWindows } from '../common/platform.js';
import { extUriBiasedIgnorePathCase } from '../common/resources.js';
import { URI } from '../common/uri.js';
import { rtrim } from '../common/strings.js';
//#region rimraf
export var RimRafMode;
(function (RimRafMode) {
    /**
     * Slow version that unlinks each file and folder.
     */
    RimRafMode[RimRafMode["UNLINK"] = 0] = "UNLINK";
    /**
     * Fast version that first moves the file/folder
     * into a temp directory and then deletes that
     * without waiting for it.
     */
    RimRafMode[RimRafMode["MOVE"] = 1] = "MOVE";
})(RimRafMode || (RimRafMode = {}));
async function rimraf(path, mode = RimRafMode.UNLINK, moveToPath) {
    if (isRootOrDriveLetter(path)) {
        throw new Error('rimraf - will refuse to recursively delete root');
    }
    // delete: via rm
    if (mode === RimRafMode.UNLINK) {
        return rimrafUnlink(path);
    }
    // delete: via move
    return rimrafMove(path, moveToPath);
}
async function rimrafMove(path, moveToPath = randomPath(tmpdir())) {
    try {
        try {
            await fs.promises.rename(path, moveToPath);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return; // ignore - path to delete did not exist
            }
            return rimrafUnlink(path); // otherwise fallback to unlink
        }
        // Delete but do not return as promise
        rimrafUnlink(moveToPath).catch(() => { });
    }
    catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
}
async function rimrafUnlink(path) {
    return fs.promises.rm(path, { recursive: true, force: true, maxRetries: 3 });
}
async function readdir(path, options) {
    try {
        return await doReaddir(path, options);
    }
    catch (error) {
        // Workaround for #252361 that should be removed once the upstream issue
        // in node.js is resolved. Adds a trailing dot to a root drive letter path
        // (G:\ => G:\.) as a workaround.
        if (error.code === 'ENOENT' && isWindows && isRootOrDriveLetter(path)) {
            try {
                return await doReaddir(`${path}.`, options);
            }
            catch {
                // ignore
            }
        }
        throw error;
    }
}
async function doReaddir(path, options) {
    return handleDirectoryChildren(await (options ? safeReaddirWithFileTypes(path) : fs.promises.readdir(path)));
}
async function safeReaddirWithFileTypes(path) {
    try {
        return await fs.promises.readdir(path, { withFileTypes: true });
    }
    catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn('[node.js fs] readdir with filetypes failed with error: ', error);
        }
    }
    // Fallback to manually reading and resolving each
    // children of the folder in case we hit an error
    // previously.
    // This can only really happen on exotic file systems
    // such as explained in #115645 where we get entries
    // from `readdir` that we can later not `lstat`.
    const result = [];
    const children = await readdir(path);
    for (const child of children) {
        let isFile = false;
        let isDirectory = false;
        let isSymbolicLink = false;
        try {
            const lstat = await fs.promises.lstat(join(path, child));
            isFile = lstat.isFile();
            isDirectory = lstat.isDirectory();
            isSymbolicLink = lstat.isSymbolicLink();
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('[node.js fs] unexpected error from lstat after readdir: ', error);
            }
        }
        result.push({
            name: child,
            isFile: () => isFile,
            isDirectory: () => isDirectory,
            isSymbolicLink: () => isSymbolicLink
        });
    }
    return result;
}
function handleDirectoryChildren(children) {
    return children.map(child => {
        // Mac: uses NFD unicode form on disk, but we want NFC
        // See also https://github.com/nodejs/node/issues/2165
        if (typeof child === 'string') {
            return isMacintosh ? normalizeNFC(child) : child;
        }
        child.name = isMacintosh ? normalizeNFC(child.name) : child.name;
        return child;
    });
}
/**
 * A convenience method to read all children of a path that
 * are directories.
 */
async function readDirsInDir(dirPath) {
    const children = await readdir(dirPath);
    const directories = [];
    for (const child of children) {
        if (await SymlinkSupport.existsDirectory(join(dirPath, child))) {
            directories.push(child);
        }
    }
    return directories;
}
//#endregion
//#region whenDeleted()
/**
 * A `Promise` that resolves when the provided `path`
 * is deleted from disk.
 */
export function whenDeleted(path, intervalMs = 1000) {
    return new Promise(resolve => {
        let running = false;
        const interval = setInterval(() => {
            if (!running) {
                running = true;
                fs.access(path, err => {
                    running = false;
                    if (err) {
                        clearInterval(interval);
                        resolve(undefined);
                    }
                });
            }
        }, intervalMs);
    });
}
//#endregion
//#region Methods with symbolic links support
export var SymlinkSupport;
(function (SymlinkSupport) {
    /**
     * Resolves the `fs.Stats` of the provided path. If the path is a
     * symbolic link, the `fs.Stats` will be from the target it points
     * to. If the target does not exist, `dangling: true` will be returned
     * as `symbolicLink` value.
     */
    async function stat(path) {
        // First stat the link
        let lstats;
        try {
            lstats = await fs.promises.lstat(path);
            // Return early if the stat is not a symbolic link at all
            if (!lstats.isSymbolicLink()) {
                return { stat: lstats };
            }
        }
        catch {
            /* ignore - use stat() instead */
        }
        // If the stat is a symbolic link or failed to stat, use fs.stat()
        // which for symbolic links will stat the target they point to
        try {
            const stats = await fs.promises.stat(path);
            return { stat: stats, symbolicLink: lstats?.isSymbolicLink() ? { dangling: false } : undefined };
        }
        catch (error) {
            // If the link points to a nonexistent file we still want
            // to return it as result while setting dangling: true flag
            if (error.code === 'ENOENT' && lstats) {
                return { stat: lstats, symbolicLink: { dangling: true } };
            }
            // Windows: workaround a node.js bug where reparse points
            // are not supported (https://github.com/nodejs/node/issues/36790)
            if (isWindows && error.code === 'EACCES') {
                try {
                    const stats = await fs.promises.stat(await fs.promises.readlink(path));
                    return { stat: stats, symbolicLink: { dangling: false } };
                }
                catch (error) {
                    // If the link points to a nonexistent file we still want
                    // to return it as result while setting dangling: true flag
                    if (error.code === 'ENOENT' && lstats) {
                        return { stat: lstats, symbolicLink: { dangling: true } };
                    }
                    throw error;
                }
            }
            throw error;
        }
    }
    SymlinkSupport.stat = stat;
    /**
     * Figures out if the `path` exists and is a file with support
     * for symlinks.
     *
     * Note: this will return `false` for a symlink that exists on
     * disk but is dangling (pointing to a nonexistent path).
     *
     * Use `exists` if you only care about the path existing on disk
     * or not without support for symbolic links.
     */
    async function existsFile(path) {
        try {
            const { stat, symbolicLink } = await SymlinkSupport.stat(path);
            return stat.isFile() && symbolicLink?.dangling !== true;
        }
        catch {
            // Ignore, path might not exist
        }
        return false;
    }
    SymlinkSupport.existsFile = existsFile;
    /**
     * Figures out if the `path` exists and is a directory with support for
     * symlinks.
     *
     * Note: this will return `false` for a symlink that exists on
     * disk but is dangling (pointing to a nonexistent path).
     *
     * Use `exists` if you only care about the path existing on disk
     * or not without support for symbolic links.
     */
    async function existsDirectory(path) {
        try {
            const { stat, symbolicLink } = await SymlinkSupport.stat(path);
            return stat.isDirectory() && symbolicLink?.dangling !== true;
        }
        catch {
            // Ignore, path might not exist
        }
        return false;
    }
    SymlinkSupport.existsDirectory = existsDirectory;
})(SymlinkSupport || (SymlinkSupport = {}));
//#endregion
//#region Write File
// According to node.js docs (https://nodejs.org/docs/v14.16.0/api/fs.html#fs_fs_writefile_file_data_options_callback)
// it is not safe to call writeFile() on the same path multiple times without waiting for the callback to return.
// Therefor we use a Queue on the path that is given to us to sequentialize calls to the same path properly.
const writeQueues = new ResourceQueue();
function writeFile(path, data, options) {
    return writeQueues.queueFor(URI.file(path), () => {
        const ensuredOptions = ensureWriteOptions(options);
        return new Promise((resolve, reject) => doWriteFileAndFlush(path, data, ensuredOptions, error => error ? reject(error) : resolve()));
    }, extUriBiasedIgnorePathCase);
}
let canFlush = true;
export function configureFlushOnWrite(enabled) {
    canFlush = enabled;
}
// Calls fs.writeFile() followed by a fs.sync() call to flush the changes to disk
// We do this in cases where we want to make sure the data is really on disk and
// not in some cache.
//
// See https://github.com/nodejs/node/blob/v5.10.0/lib/fs.js#L1194
function doWriteFileAndFlush(path, data, options, callback) {
    if (!canFlush) {
        return fs.writeFile(path, data, { mode: options.mode, flag: options.flag }, callback);
    }
    // Open the file with same flags and mode as fs.writeFile()
    fs.open(path, options.flag, options.mode, (openError, fd) => {
        if (openError) {
            return callback(openError);
        }
        // It is valid to pass a fd handle to fs.writeFile() and this will keep the handle open!
        fs.writeFile(fd, data, writeError => {
            if (writeError) {
                return fs.close(fd, () => callback(writeError)); // still need to close the handle on error!
            }
            // Flush contents (not metadata) of the file to disk
            // https://github.com/microsoft/vscode/issues/9589
            fs.fdatasync(fd, (syncError) => {
                // In some exotic setups it is well possible that node fails to sync
                // In that case we disable flushing and warn to the console
                if (syncError) {
                    console.warn('[node.js fs] fdatasync is now disabled for this session because it failed: ', syncError);
                    configureFlushOnWrite(false);
                }
                return fs.close(fd, closeError => callback(closeError));
            });
        });
    });
}
/**
 * Same as `fs.writeFileSync` but with an additional call to
 * `fs.fdatasyncSync` after writing to ensure changes are
 * flushed to disk.
 *
 * @deprecated always prefer async variants over sync!
 */
export function writeFileSync(path, data, options) {
    const ensuredOptions = ensureWriteOptions(options);
    if (!canFlush) {
        return fs.writeFileSync(path, data, { mode: ensuredOptions.mode, flag: ensuredOptions.flag });
    }
    // Open the file with same flags and mode as fs.writeFile()
    const fd = fs.openSync(path, ensuredOptions.flag, ensuredOptions.mode);
    try {
        // It is valid to pass a fd handle to fs.writeFile() and this will keep the handle open!
        fs.writeFileSync(fd, data);
        // Flush contents (not metadata) of the file to disk
        try {
            fs.fdatasyncSync(fd); // https://github.com/microsoft/vscode/issues/9589
        }
        catch (syncError) {
            console.warn('[node.js fs] fdatasyncSync is now disabled for this session because it failed: ', syncError);
            configureFlushOnWrite(false);
        }
    }
    finally {
        fs.closeSync(fd);
    }
}
function ensureWriteOptions(options) {
    if (!options) {
        return { mode: 0o666 /* default node.js mode for files */, flag: 'w' };
    }
    return {
        mode: typeof options.mode === 'number' ? options.mode : 0o666 /* default node.js mode for files */,
        flag: typeof options.flag === 'string' ? options.flag : 'w'
    };
}
//#endregion
//#region Move / Copy
/**
 * A drop-in replacement for `fs.rename` that:
 * - allows to move across multiple disks
 * - attempts to retry the operation for certain error codes on Windows
 */
async function rename(source, target, windowsRetryTimeout = 60000) {
    if (source === target) {
        return; // simulate node.js behaviour here and do a no-op if paths match
    }
    try {
        if (isWindows && typeof windowsRetryTimeout === 'number') {
            // On Windows, a rename can fail when either source or target
            // is locked by AV software.
            await renameWithRetry(source, target, Date.now(), windowsRetryTimeout);
        }
        else {
            await fs.promises.rename(source, target);
        }
    }
    catch (error) {
        // In two cases we fallback to classic copy and delete:
        //
        // 1.) The EXDEV error indicates that source and target are on different devices
        // In this case, fallback to using a copy() operation as there is no way to
        // rename() between different devices.
        //
        // 2.) The user tries to rename a file/folder that ends with a dot. This is not
        // really possible to move then, at least on UNC devices.
        if (source.toLowerCase() !== target.toLowerCase() && error.code === 'EXDEV' || source.endsWith('.')) {
            await copy(source, target, { preserveSymlinks: false /* copying to another device */ });
            await rimraf(source, RimRafMode.MOVE);
        }
        else {
            throw error;
        }
    }
}
async function renameWithRetry(source, target, startTime, retryTimeout, attempt = 0) {
    try {
        return await fs.promises.rename(source, target);
    }
    catch (error) {
        if (error.code !== 'EACCES' && error.code !== 'EPERM' && error.code !== 'EBUSY') {
            throw error; // only for errors we think are temporary
        }
        if (Date.now() - startTime >= retryTimeout) {
            console.error(`[node.js fs] rename failed after ${attempt} retries with error: ${error}`);
            throw error; // give up after configurable timeout
        }
        if (attempt === 0) {
            let abortRetry = false;
            try {
                const { stat } = await SymlinkSupport.stat(target);
                if (!stat.isFile()) {
                    abortRetry = true; // if target is not a file, EPERM error may be raised and we should not attempt to retry
                }
            }
            catch {
                // Ignore
            }
            if (abortRetry) {
                throw error;
            }
        }
        // Delay with incremental backoff up to 100ms
        await timeout(Math.min(100, attempt * 10));
        // Attempt again
        return renameWithRetry(source, target, startTime, retryTimeout, attempt + 1);
    }
}
/**
 * Recursively copies all of `source` to `target`.
 *
 * The options `preserveSymlinks` configures how symbolic
 * links should be handled when encountered. Set to
 * `false` to not preserve them and `true` otherwise.
 */
async function copy(source, target, options) {
    return doCopy(source, target, { root: { source, target }, options, handledSourcePaths: new Set() });
}
// When copying a file or folder, we want to preserve the mode
// it had and as such provide it when creating. However, modes
// can go beyond what we expect (see link below), so we mask it.
// (https://github.com/nodejs/node-v0.x-archive/issues/3045#issuecomment-4862588)
const COPY_MODE_MASK = 0o777;
async function doCopy(source, target, payload) {
    // Keep track of paths already copied to prevent
    // cycles from symbolic links to cause issues
    if (payload.handledSourcePaths.has(source)) {
        return;
    }
    else {
        payload.handledSourcePaths.add(source);
    }
    const { stat, symbolicLink } = await SymlinkSupport.stat(source);
    // Symlink
    if (symbolicLink) {
        // Try to re-create the symlink unless `preserveSymlinks: false`
        if (payload.options.preserveSymlinks) {
            try {
                return await doCopySymlink(source, target, payload);
            }
            catch {
                // in any case of an error fallback to normal copy via dereferencing
            }
        }
        if (symbolicLink.dangling) {
            return; // skip dangling symbolic links from here on (https://github.com/microsoft/vscode/issues/111621)
        }
    }
    // Folder
    if (stat.isDirectory()) {
        return doCopyDirectory(source, target, stat.mode & COPY_MODE_MASK, payload);
    }
    // File or file-like
    else {
        return doCopyFile(source, target, stat.mode & COPY_MODE_MASK);
    }
}
async function doCopyDirectory(source, target, mode, payload) {
    // Create folder
    await fs.promises.mkdir(target, { recursive: true, mode });
    // Copy each file recursively
    const files = await readdir(source);
    for (const file of files) {
        await doCopy(join(source, file), join(target, file), payload);
    }
}
async function doCopyFile(source, target, mode) {
    // Copy file
    await fs.promises.copyFile(source, target);
    // restore mode (https://github.com/nodejs/node/issues/1104)
    await fs.promises.chmod(target, mode);
}
async function doCopySymlink(source, target, payload) {
    // Figure out link target
    let linkTarget = await fs.promises.readlink(source);
    // Special case: the symlink points to a target that is
    // actually within the path that is being copied. In that
    // case we want the symlink to point to the target and
    // not the source
    if (isEqualOrParent(linkTarget, payload.root.source, !isLinux)) {
        linkTarget = join(payload.root.target, linkTarget.substr(payload.root.source.length + 1));
    }
    // Create symlink
    await fs.promises.symlink(linkTarget, target);
}
//#endregion
//#region Path resolvers
/**
 * Given an absolute, normalized, and existing file path 'realcase' returns the
 * exact path that the file has on disk.
 * On a case insensitive file system, the returned path might differ from the original
 * path by character casing.
 * On a case sensitive file system, the returned path will always be identical to the
 * original path.
 * In case of errors, null is returned. But you cannot use this function to verify that
 * a path exists.
 *
 * realcase does not handle '..' or '.' path segments and it does not take the locale into account.
 */
export async function realcase(path, token) {
    if (isLinux) {
        // This method is unsupported on OS that have case sensitive
        // file system where the same path can exist in different forms
        // (see also https://github.com/microsoft/vscode/issues/139709)
        return path;
    }
    const dir = dirname(path);
    if (path === dir) { // end recursion
        return path;
    }
    const name = (basename(path) /* can be '' for windows drive letters */ || path).toLowerCase();
    try {
        if (token?.isCancellationRequested) {
            return null;
        }
        const entries = await Promises.readdir(dir);
        const found = entries.filter(e => e.toLowerCase() === name); // use a case insensitive search
        if (found.length === 1) {
            // on a case sensitive filesystem we cannot determine here, whether the file exists or not, hence we need the 'file exists' precondition
            const prefix = await realcase(dir, token); // recurse
            if (prefix) {
                return join(prefix, found[0]);
            }
        }
        else if (found.length > 1) {
            // must be a case sensitive $filesystem
            const ix = found.indexOf(name);
            if (ix >= 0) { // case sensitive
                const prefix = await realcase(dir, token); // recurse
                if (prefix) {
                    return join(prefix, found[ix]);
                }
            }
        }
    }
    catch {
        // silently ignore error
    }
    return null;
}
async function realpath(path) {
    try {
        // DO NOT USE `fs.promises.realpath` here as it internally
        // calls `fs.native.realpath` which will result in subst
        // drives to be resolved to their target on Windows
        // https://github.com/microsoft/vscode/issues/118562
        return await promisify(fs.realpath)(path);
    }
    catch {
        // We hit an error calling fs.realpath(). Since fs.realpath() is doing some path normalization
        // we now do a similar normalization and then try again if we can access the path with read
        // permissions at least. If that succeeds, we return that path.
        // fs.realpath() is resolving symlinks and that can fail in certain cases. The workaround is
        // to not resolve links but to simply see if the path is read accessible or not.
        const normalizedPath = normalizePath(path);
        await fs.promises.access(normalizedPath, fs.constants.R_OK);
        return normalizedPath;
    }
}
/**
 * @deprecated always prefer async variants over sync!
 */
export function realpathSync(path) {
    try {
        return fs.realpathSync(path);
    }
    catch {
        // We hit an error calling fs.realpathSync(). Since fs.realpathSync() is doing some path normalization
        // we now do a similar normalization and then try again if we can access the path with read
        // permissions at least. If that succeeds, we return that path.
        // fs.realpath() is resolving symlinks and that can fail in certain cases. The workaround is
        // to not resolve links but to simply see if the path is read accessible or not.
        const normalizedPath = normalizePath(path);
        fs.accessSync(normalizedPath, fs.constants.R_OK); // throws in case of an error
        return normalizedPath;
    }
}
function normalizePath(path) {
    return rtrim(normalize(path), sep);
}
//#endregion
//#region Promise based fs methods
/**
 * Some low level `fs` methods provided as `Promises` similar to
 * `fs.promises` but with notable differences, either implemented
 * by us or by restoring the original callback based behavior.
 *
 * At least `realpath` is implemented differently in the promise
 * based implementation compared to the callback based one. The
 * promise based implementation actually calls `fs.realpath.native`.
 * (https://github.com/microsoft/vscode/issues/118562)
 */
export const Promises = new class {
    //#region Implemented by node.js
    get read() {
        // Not using `promisify` here for a reason: the return
        // type is not an object as indicated by TypeScript but
        // just the bytes read, so we create our own wrapper.
        return (fd, buffer, offset, length, position) => {
            return new Promise((resolve, reject) => {
                fs.read(fd, buffer, offset, length, position, (err, bytesRead, buffer) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve({ bytesRead, buffer });
                });
            });
        };
    }
    get write() {
        // Not using `promisify` here for a reason: the return
        // type is not an object as indicated by TypeScript but
        // just the bytes written, so we create our own wrapper.
        return (fd, buffer, offset, length, position) => {
            return new Promise((resolve, reject) => {
                fs.write(fd, buffer, offset, length, position, (err, bytesWritten, buffer) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve({ bytesWritten, buffer });
                });
            });
        };
    }
    get fdatasync() { return promisify(fs.fdatasync); } // not exposed as API in 22.x yet
    get open() { return promisify(fs.open); } // changed to return `FileHandle` in promise API
    get close() { return promisify(fs.close); } // not exposed as API due to the `FileHandle` return type of `open`
    get ftruncate() { return promisify(fs.ftruncate); } // not exposed as API in 22.x yet
    //#endregion
    //#region Implemented by us
    async exists(path) {
        try {
            await fs.promises.access(path);
            return true;
        }
        catch {
            return false;
        }
    }
    get readdir() { return readdir; }
    get readDirsInDir() { return readDirsInDir; }
    get writeFile() { return writeFile; }
    get rm() { return rimraf; }
    get rename() { return rename; }
    get copy() { return copy; }
    get realpath() { return realpath; } // `fs.promises.realpath` will use `fs.realpath.native` which we do not want
};
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGZzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9ub2RlL3Bmcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxNQUFNLENBQUM7QUFDakMsT0FBTyxFQUFFLGFBQWEsRUFBRSxPQUFPLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLG1CQUFtQixFQUFFLFVBQVUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3hGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ3hFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3BFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUV2QyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFN0MsZ0JBQWdCO0FBRWhCLE1BQU0sQ0FBTixJQUFZLFVBYVg7QUFiRCxXQUFZLFVBQVU7SUFFckI7O09BRUc7SUFDSCwrQ0FBTSxDQUFBO0lBRU47Ozs7T0FJRztJQUNILDJDQUFJLENBQUE7QUFDTCxDQUFDLEVBYlcsVUFBVSxLQUFWLFVBQVUsUUFhckI7QUFjRCxLQUFLLFVBQVUsTUFBTSxDQUFDLElBQVksRUFBRSxJQUFJLEdB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