/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { createFileSystemProviderError, FilePermission, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileChange, IFileDeleteOptions, IFileOverwriteOptions, IFileSystemProvider, IFileWriteOptions, IStat } from '../../files/common/files.js';
import { fromAgentHostUri, toAgentHostUri } from './agentHostUri.js';
import { type IAgentConnection } from './agentService.js';
import { ContentEncoding, type DirectoryEntry, type ResourceDeleteParams, type ResourceDeleteResult, type ResourceListResult, type ResourceMoveParams, type ResourceMoveResult, type ResourceReadResult, type ResourceWriteParams, type ResourceWriteResult } from './state/protocol/commands.js';

/**
 * Interface for performing resource operations on a remote endpoint.
 *
 * Both {@link IAgentConnection} (client→server) and client-exposed
 * filesystems (server→client) satisfy this contract.
 */
export interface IRemoteFilesystemConnection {
	resourceList(uri: URI): Promise<ResourceListResult>;
	resourceRead(uri: URI): Promise<ResourceReadResult>;
	resourceWrite(params: ResourceWriteParams): Promise<ResourceWriteResult>;
	resourceDelete(params: ResourceDeleteParams): Promise<ResourceDeleteResult>;
	resourceMove(params: ResourceMoveParams): Promise<ResourceMoveResult>;
}

/**
 * Build a {@link AGENT_HOST_SCHEME} URI for a given connection authority
 * and remote path. Assumes the remote path is a `file://` resource.
 */
export function agentHostUri(authority: string, path: string): URI {
	return toAgentHostUri(URI.file(path), authority);
}

/**
 * Extract the remote filesystem path from a {@link AGENT_HOST_SCHEME} URI.
 */
export function agentHostRemotePath(uri: URI): string {
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
export abstract class AHPFileSystemProvider extends Disposable implements IFileSystemProvider {

	readonly capabilities =
		FileSystemProviderCapabilities.PathCaseSensitive |
		FileSystemProviderCapabilities.FileReadWrite;

	private readonly _onDidChangeCapabilities = this._register(new Emitter<void>());
	readonly onDidChangeCapabilities = this._onDidChangeCapabilities.event;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	private readonly _authorityToConnection = new Map<string, IRemoteFilesystemConnection>();

	/**
	 * Register a mapping from a URI authority to a connection.
	 * Returns a disposable that unregisters the mapping.
	 */
	registerAuthority(authority: string, connection: IRemoteFilesystemConnection): IDisposable {
		this._authorityToConnection.set(authority, connection);
		return toDisposable(() => this._authorityToConnection.delete(authority));
	}

	/** Decode a provider URI back to the original URI for the remote endpoint. */
	protected abstract _decodeUri(resource: URI): URI;

	watch(): IDisposable {
		return Disposable.None;
	}

	async stat(resource: URI): Promise<IStat> {
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

	async readdir(resource: URI): Promise<[string, FileType][]> {
		const entries = await this._listDirectory(resource.authority, resource);
		return entries.map(e => [e.name, e.type === 'directory' ? FileType.Directory : FileType.File]);
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const connection = this._getConnection(resource.authority);
		try {
			const originalUri = this._decodeUri(resource);
			const result = await connection.resourceRead(originalUri);
			if (result.encoding === ContentEncoding.Base64) {
				return decodeBase64(result.data).buffer;
			}
			return VSBuffer.fromString(result.data).buffer;
		} catch (err) {
			throw createFileSystemProviderError(
				err instanceof Error ? err.message : String(err),
				FileSystemProviderErrorCode.FileNotFound,
			);
		}
	}

	async writeFile(resource: URI, content: Uint8Array, _opts: IFileWriteOptions): Promise<void> {
		const connection = this._getConnection(resource.authority);
		try {
			const originalUri = this._decodeUri(resource);
			await connection.resourceWrite({
				uri: originalUri.toString(),
				data: VSBuffer.wrap(content).toString(),
				encoding: ContentEncoding.Utf8,
			});
		} catch (err) {
			throw createFileSystemProviderError(
				err instanceof Error ? err.message : String(err),
				FileSystemProviderErrorCode.NoPermissions,
			);
		}
	}

	async mkdir(): Promise<void> {
		throw createFileSystemProviderError('mkdir not supported on remote filesystem', FileSystemProviderErrorCode.NoPermissions);
	}

	async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		const connection = this._getConnection(resource.authority);
		try {
			const originalUri = this._decodeUri(resource);
			await connection.resourceDelete({ uri: originalUri.toString(), recursive: opts.recursive });
		} catch (err) {
			throw createFileSystemProviderError(
				err instanceof Error ? err.message : String(err),
				FileSystemProviderErrorCode.NoPermissions,
			);
		}
	}

	async rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		const connection = this._getConnection(from.authority);
		try {
			const originalFrom = this._decodeUri(from);
			const originalTo = this._decodeUri(to);
			await connection.resourceMove({ source: originalFrom.toString(), destination: originalTo.toString(), failIfExists: !opts.overwrite });
		} catch (err) {
			throw createFileSystemProviderError(
				err instanceof Error ? err.message : String(err),
				FileSystemProviderErrorCode.NoPermissions,
			);
		}
	}

	// ---- Internals ----------------------------------------------------------

	private _getConnection(authority: string): IRemoteFilesystemConnection {
		const connection = this._authorityToConnection.get(authority);
		if (!connection) {
			throw createFileSystemProviderError(`No connection for authority: ${authority}`, FileSystemProviderErrorCode.Unavailable);
		}
		return connection;
	}

	private async _listDirectory(authority: string, resource: URI): Promise<readonly DirectoryEntry[]> {
		const connection = this._getConnection(authority);
		try {
			const originalUri = this._decodeUri(resource);
			const result = await connection.resourceList(originalUri);
			return result.entries;
		} catch (err) {
			throw createFileSystemProviderError(
				err instanceof Error ? err.message : String(err),
				FileSystemProviderErrorCode.Unavailable,
			);
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
	protected _decodeUri(resource: URI): URI {
		return fromAgentHostUri(resource);
	}
}
