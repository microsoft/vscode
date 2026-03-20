/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import { dirname, basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import type { IDirectoryEntry } from '../../../../platform/agentHost/common/state/sessionProtocol.js';
import {
	createFileSystemProviderError,
	FilePermission,
	FileSystemProviderCapabilities,
	FileSystemProviderErrorCode,
	FileType,
	type IFileChange,
	type IFileDeleteOptions,
	type IFileOverwriteOptions,
	type IFileSystemProvider,
	type IFileWriteOptions,
	type IStat,
} from '../../../../platform/files/common/files.js';

/**
 * The URI scheme used for browsing remote agent host filesystems.
 * URIs are structured as `agenthost://{sanitizedAddress}/path/on/remote`.
 */
export const AGENT_HOST_FS_SCHEME = 'agenthost';

/**
 * Build an agenthost URI for a given address and path.
 */
export function agentHostUri(authority: string, path: string): URI {
	const normalizedPath = !path ? '/' : path.startsWith('/') ? path : `/${path}`;
	return URI.from({ scheme: AGENT_HOST_FS_SCHEME, authority, path: normalizedPath });
}

/**
 * Extract the remote filesystem path from an agenthost URI.
 * This is the inverse of {@link agentHostUri} -- the path component
 * of the URI is the path on the remote machine.
 */
export function agentHostRemotePath(uri: URI): string {
	return uri.path;
}

/**
 * Read-only {@link IFileSystemProvider} that proxies `stat` and `readdir`
 * calls through the agent host protocol's `browseDirectory` RPC.
 *
 * Registered once under the {@link AGENT_HOST_FS_SCHEME} scheme. Individual
 * connections are identified by the URI's authority component, which is
 * the sanitized remote address.
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

	private readonly _authorityToAddress = new Map<string, string>();

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
	) {
		super();
	}

	/**
	 * Register a mapping from a URI authority to a remote address.
	 * Returns a disposable that unregisters the mapping.
	 */
	registerAuthority(authority: string, address: string): IDisposable {
		this._authorityToAddress.set(authority, address);
		return toDisposable(() => this._authorityToAddress.delete(authority));
	}

	watch(): IDisposable {
		return Disposable.None;
	}

	async stat(resource: URI): Promise<IStat> {
		const path = resource.path;

		// Root directory
		if (path === '/' || path === '') {
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

	async readFile(): Promise<Uint8Array> {
		throw createFileSystemProviderError('readFile not supported on remote agent host filesystem', FileSystemProviderErrorCode.NoPermissions);
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
		const address = this._authorityToAddress.get(authority);
		if (!address) {
			throw createFileSystemProviderError(`No connection for authority: ${authority}`, FileSystemProviderErrorCode.Unavailable);
		}
		const connection = this._remoteAgentHostService.getConnection(address);
		if (!connection) {
			throw createFileSystemProviderError(`Connection unavailable: ${address}`, FileSystemProviderErrorCode.Unavailable);
		}
		return connection;
	}

	private async _listDirectory(authority: string, resource: URI): Promise<readonly IDirectoryEntry[]> {
		const connection = this._getConnection(authority);
		try {
			// Convert the agenthost URI to a file URI for the remote server
			const remoteUri = URI.from({ scheme: 'file', path: resource.path || '/' });
			const result = await connection.browseDirectory(remoteUri);
			return result.entries;
		} catch (err) {
			throw createFileSystemProviderError(
				err instanceof Error ? err.message : String(err),
				FileSystemProviderErrorCode.Unavailable,
			);
		}
	}
}
