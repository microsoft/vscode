/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { createFileSystemProviderError, FilePermission, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileChange, IFileDeleteOptions, IFileOverwriteOptions, IFileSystemProvider, IFileWriteOptions, IStat } from '../../files/common/files.js';
import { type IAgentConnection } from './agentService.js';
import { fromAgentHostUri, toAgentHostUri } from './agentHostUri.js';
import { IDirectoryEntry } from './state/protocol/commands.js';


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

/**
 * Read-only {@link IFileSystemProvider} that proxies filesystem operations
 * through the agent host protocol.
 *
 * Registered under the {@link AGENT_HOST_SCHEME} scheme. URIs encode the
 * original scheme and authority in the path so any remote resource can be
 * represented (not just `file://`):
 *
 * ```
 * vscode-agent-host://[connectionAuthority]/[originalScheme]/[originalAuthority]/[originalPath]
 * ```
 *
 * Individual connections are identified by the URI's authority component,
 * which is the sanitized remote address.
 */
export class AgentHostFileSystemProvider extends Disposable implements IFileSystemProvider {

	readonly capabilities =
		FileSystemProviderCapabilities.Readonly |
		FileSystemProviderCapabilities.PathCaseSensitive |
		FileSystemProviderCapabilities.FileReadWrite; // required for the file service to resolve directory contents

	private readonly _onDidChangeCapabilities = this._register(new Emitter<void>());
	readonly onDidChangeCapabilities = this._onDidChangeCapabilities.event;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	private readonly _authorityToConnection = new Map<string, IAgentConnection>();

	/**
	 * Register a mapping from a URI authority to an agent connection.
	 * Returns a disposable that unregisters the mapping.
	 */
	registerAuthority(authority: string, connection: IAgentConnection): IDisposable {
		this._authorityToConnection.set(authority, connection);
		return toDisposable(() => this._authorityToConnection.delete(authority));
	}

	watch(): IDisposable {
		return Disposable.None;
	}

	async stat(resource: URI): Promise<IStat> {
		const path = resource.path;

		// Root directory - either the bare scheme root or the root of the
		// decoded remote filesystem (e.g. `/file/-/` decodes to `file:///`).
		if (path === '/' || path === '') {
			return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
		}
		const decoded = fromAgentHostUri(resource);
		if (decoded.scheme === 'session-db') {
			return { type: FileType.File, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
		}

		if (decoded.path === '/' || decoded.path === '') {
			return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
		}

		// Use URI dirname/basename to find the parent and entry name
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

	// ---- Read-only stubs (required by interface) ----------------------------

	async readFile(resource: URI): Promise<Uint8Array> {
		const connection = this._getConnection(resource.authority);
		try {
			const originalUri = fromAgentHostUri(resource);
			const result = await connection.fetchContent(originalUri);
			return VSBuffer.fromString(result.data).buffer;
		} catch (err) {
			throw createFileSystemProviderError(
				err instanceof Error ? err.message : String(err),
				FileSystemProviderErrorCode.FileNotFound,
			);
		}
	}

	async writeFile(_resource: URI, _content: Uint8Array, _opts: IFileWriteOptions): Promise<void> {
		throw createFileSystemProviderError('writeFile not supported on remote agent host filesystem', FileSystemProviderErrorCode.NoPermissions);
	}

	async mkdir(): Promise<void> {
		throw createFileSystemProviderError('mkdir not supported on remote agent host filesystem', FileSystemProviderErrorCode.NoPermissions);
	}

	async delete(_resource: URI, _opts: IFileDeleteOptions): Promise<void> {
		throw createFileSystemProviderError('delete not supported on remote agent host filesystem', FileSystemProviderErrorCode.NoPermissions);
	}

	async rename(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> {
		throw createFileSystemProviderError('rename not supported on remote agent host filesystem', FileSystemProviderErrorCode.NoPermissions);
	}

	// ---- Internals ----------------------------------------------------------

	private _getConnection(authority: string) {
		const connection = this._authorityToConnection.get(authority);
		if (!connection) {
			throw createFileSystemProviderError(`No connection for authority: ${authority}`, FileSystemProviderErrorCode.Unavailable);
		}
		return connection;
	}

	private async _listDirectory(authority: string, resource: URI): Promise<readonly IDirectoryEntry[]> {
		const connection = this._getConnection(authority);
		try {
			const originalUri = fromAgentHostUri(resource);
			const result = await connection.browseDirectory(originalUri);
			return result.entries;
		} catch (err) {
			throw createFileSystemProviderError(
				err instanceof Error ? err.message : String(err),
				FileSystemProviderErrorCode.Unavailable,
			);
		}
	}
}
