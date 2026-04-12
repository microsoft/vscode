/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { decodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { createFileSystemProviderError, FilePermission, FileSystemProviderErrorCode, FileType } from '../../files/common/files.js';
import { fromAgentHostUri, toAgentHostUri } from './agentHostUri.js';
/**
 * Build a {@link AGENT_HOST_SCHEME} URI for a given connection authority
 * and remote path. Assumes the remote path is a `file://` resource.
 */
export function agentHostUri(authority, path) {
    return toAgentHostUri(URI.file(path), authority);
}
/**
 * Extract the remote filesystem path from a {@link AGENT_HOST_SCHEME} URI.
 */
export function agentHostRemotePath(uri) {
    return fromAgentHostUri(uri).path;
}
// ---- Abstract base ----------------------------------------------------------
/**
 * {@link IFileSystemProvider} that proxies filesystem operations
 * through a {@link IRemoteFilesystemConnection}.
 *
 * URIs encode the original scheme and authority in the path so any remote
 * resource can be represented. Subclasses provide the URI decode function
 * and scheme-specific helpers.
 *
 * Individual connections are identified by the URI's authority component.
 */
export class AHPFileSystemProvider extends Disposable {
    constructor() {
        super(...arguments);
        this.capabilities = 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */ |
            2 /* FileSystemProviderCapabilities.FileReadWrite */;
        this._onDidChangeCapabilities = this._register(new Emitter());
        this.onDidChangeCapabilities = this._onDidChangeCapabilities.event;
        this._onDidChangeFile = this._register(new Emitter());
        this.onDidChangeFile = this._onDidChangeFile.event;
        this._authorityToConnection = new Map();
    }
    /**
     * Register a mapping from a URI authority to a connection.
     * Returns a disposable that unregisters the mapping.
     */
    registerAuthority(authority, connection) {
        this._authorityToConnection.set(authority, connection);
        return toDisposable(() => this._authorityToConnection.delete(authority));
    }
    watch() {
        return Disposable.None;
    }
    async stat(resource) {
        const path = resource.path;
        if (path === '/' || path === '') {
            return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
        }
        const decoded = this._decodeUri(resource);
        if (decoded.scheme === 'session-db') {
            return { type: FileType.File, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
        }
        if (decoded.path === '/' || decoded.path === '') {
            return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
        }
        const parentUri = dirname(resource);
        const name = basename(resource);
        const entries = await this._listDirectory(resource.authority, parentUri);
        const entry = entries.find(e => e.name === name);
        if (!entry) {
            throw createFileSystemProviderError(`File not found: ${path}`, FileSystemProviderErrorCode.FileNotFound);
        }
        return {
            type: entry.type === 'directory' ? FileType.Directory : FileType.File,
            mtime: 0,
            ctime: 0,
            size: 0,
            permissions: FilePermission.Readonly,
        };
    }
    async readdir(resource) {
        const entries = await this._listDirectory(resource.authority, resource);
        return entries.map(e => [e.name, e.type === 'directory' ? FileType.Directory : FileType.File]);
    }
    async readFile(resource) {
        const connection = this._getConnection(resource.authority);
        try {
            const originalUri = this._decodeUri(resource);
            const result = await connection.resourceRead(originalUri);
            if (result.encoding === "base64" /* ContentEncoding.Base64 */) {
                return decodeBase64(result.data).buffer;
            }
            return VSBuffer.fromString(result.data).buffer;
        }
        catch (err) {
            throw createFileSystemProviderError(err instanceof Error ? err.message : String(err), FileSystemProviderErrorCode.FileNotFound);
        }
    }
    async writeFile(resource, content, _opts) {
        const connection = this._getConnection(resource.authority);
        try {
            const originalUri = this._decodeUri(resource);
            await connection.resourceWrite({
                uri: originalUri.toString(),
                data: VSBuffer.wrap(content).toString(),
                encoding: "utf-8" /* ContentEncoding.Utf8 */,
            });
        }
        catch (err) {
            throw createFileSystemProviderError(err instanceof Error ? err.message : String(err), FileSystemProviderErrorCode.NoPermissions);
        }
    }
    async mkdir() {
        throw createFileSystemProviderError('mkdir not supported on remote filesystem', FileSystemProviderErrorCode.NoPermissions);
    }
    async delete(resource, opts) {
        const connection = this._getConnection(resource.authority);
        try {
            const originalUri = this._decodeUri(resource);
            await connection.resourceDelete({ uri: originalUri.toString(), recursive: opts.recursive });
        }
        catch (err) {
            throw createFileSystemProviderError(err instanceof Error ? err.message : String(err), FileSystemProviderErrorCode.NoPermissions);
        }
    }
    async rename(from, to, opts) {
        const connection = this._getConnection(from.authority);
        try {
            const originalFrom = this._decodeUri(from);
            const originalTo = this._decodeUri(to);
            await connection.resourceMove({ source: originalFrom.toString(), destination: originalTo.toString(), failIfExists: !opts.overwrite });
        }
        catch (err) {
            throw createFileSystemProviderError(err instanceof Error ? err.message : String(err), FileSystemProviderErrorCode.NoPermissions);
        }
    }
    // ---- Internals ----------------------------------------------------------
    _getConnection(authority) {
        const connection = this._authorityToConnection.get(authority);
        if (!connection) {
            throw createFileSystemProviderError(`No connection for authority: ${authority}`, FileSystemProviderErrorCode.Unavailable);
        }
        return connection;
    }
    async _listDirectory(authority, resource) {
        const connection = this._getConnection(authority);
        try {
            const originalUri = this._decodeUri(resource);
            const result = await connection.resourceList(originalUri);
            return result.entries;
        }
        catch (err) {
            throw createFileSystemProviderError(err instanceof Error ? err.message : String(err), FileSystemProviderErrorCode.Unavailable);
        }
    }
}
// ---- Agent Host filesystem (client reads agent host files) ------------------
/**
 * Filesystem provider for accessing agent host files from the
 * client side. Registered under the `vscode-agent-host` scheme.
 *
 * ```
 * vscode-agent-host://[connectionAuthority]/[originalScheme]/[originalAuthority]/[originalPath]
 * ```
 */
export class AgentHostFileSystemProvider extends AHPFileSystemProvider {
    _decodeUri(resource) {
        return fromAgentHostUri(resource);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBZSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMxRixPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsY0FBYyxFQUFrQywyQkFBMkIsRUFBRSxRQUFRLEVBQXlHLE1BQU0sNkJBQTZCLENBQUM7QUFDMVEsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBa0JyRTs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsWUFBWSxDQUFDLFNBQWlCLEVBQUUsSUFBWTtJQUMzRCxPQUFPLGNBQWMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQ2xELENBQUM7QUFFRDs7R0FFRztBQUNILE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxHQUFRO0lBQzNDLE9BQU8sZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO0FBQ25DLENBQUM7QUFFRCxnRkFBZ0Y7QUFFaEY7Ozs7Ozs7OztHQVNHO0FBQ0gsTUFBTSxPQUFnQixxQkFBc0IsU0FBUSxVQUFV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