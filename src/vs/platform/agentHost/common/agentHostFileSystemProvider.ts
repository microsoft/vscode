/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createFileSystemProviderError, FileChangeType, FilePermission, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileChange, IFileDeleteOptions, IFileOverwriteOptions, IFileSystemProvider, IFileSystemProviderWithFileRealpathCapability, IFileWriteOptions, IStat, IWatchOptions } from '../../files/common/files.js';
import { fromAgentHostUri, toAgentHostUri } from './agentHostUri.js';
import { ContentEncoding, type CreateResourceWatchParams, type DirectoryEntry, type ResourceCopyParams, type ResourceCopyResult, type ResourceDeleteParams, type ResourceDeleteResult, type ResourceListResult, type ResourceMkdirParams, type ResourceMkdirResult, type ResourceMoveParams, type ResourceMoveResult, type ResourceReadResult, type ResourceRequestParams, type ResourceRequestResult, type ResourceResolveParams, type ResourceResolveResult, type ResourceWriteParams, type ResourceWriteResult } from './state/protocol/commands.js';
import { AhpErrorCodes } from './state/protocol/errors.js';
import { ProtocolError } from './state/sessionProtocol.js';
import { ActionType, type ActionEnvelope } from './state/sessionActions.js';
import { ROOT_STATE_URI } from './state/sessionState.js';

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
	/** Copy a resource on the remote endpoint. */
	resourceCopy(params: ResourceCopyParams): Promise<ResourceCopyResult>;
	/**
	 * Negotiate access to a resource the receiver mediates. Optional because
	 * not every connection in the codebase carries one — only the agent-host
	 * server-to-client direction needs to send `resourceRequest` today.
	 */
	resourceRequest?(params: ResourceRequestParams): Promise<ResourceRequestResult>;
	/** Resolve (stat + realpath) a resource on the remote endpoint. */
	resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult>;
	/** Create a directory on the remote endpoint (mkdir -p semantics). */
	resourceMkdir(params: ResourceMkdirParams): Promise<ResourceMkdirResult>;
	/**
	 * Start a file-system watcher on the remote endpoint and return a
	 * handle whose `onDidChange` event fires for every change the remote
	 * reports under the watched root. Disposing the handle unsubscribes
	 * the watch (subject to the receiver's grace window).
	 *
	 * Optional: implementations that do not have access to the AHP
	 * subscription machinery (e.g. raw IPC channels in
	 * {@link createAgentHostClientResourceConnection}) omit it; the FS
	 * provider degrades to a no-op `watch()` in that case.
	 */
	watchResource?(params: CreateResourceWatchParams): Promise<IRemoteWatchHandle>;
}

/**
 * Handle for a remote file-system watcher returned by
 * {@link IRemoteFilesystemConnection.watchResource}. Mirrors the shape
 * of `IFileSystemWatcher` from `../../files/common/files.js` so the FS
 * provider can plug events straight into its own `onDidChangeFile`
 * emitter.
 */
export interface IRemoteWatchHandle extends IDisposable {
	readonly onDidChange: Event<readonly IFileChange[]>;
}

/**
 * Shared implementation of {@link IAgentConnection.watchResource} —
 * bundles `createResourceWatch` + `subscribe` + a per-channel listener
 * on the action stream into an {@link IRemoteWatchHandle}. Used by
 * every transport that exposes those four primitives so we don't need
 * to duplicate the wire bookkeeping in each `IAgentConnection`
 * implementation.
 */
export async function createRemoteWatchHandle(
	primitives: {
		createResourceWatch(params: CreateResourceWatchParams): Promise<{ channel: string }>;
		subscribe(channel: URI): Promise<unknown>;
		unsubscribe(channel: URI): void;
		onDidAction: Event<ActionEnvelope>;
	},
	params: CreateResourceWatchParams,
): Promise<IRemoteWatchHandle> {
	const { channel } = await primitives.createResourceWatch(params);
	const channelUri = URI.parse(channel);
	await primitives.subscribe(channelUri);
	const onDidChangeEmitter = new Emitter<readonly IFileChange[]>();
	const listener = primitives.onDidAction(envelope => {
		if (envelope.channel !== channel || envelope.action.type !== ActionType.ResourceWatchChanged) {
			return;
		}
		const items = envelope.action.changes?.items ?? [];
		if (items.length === 0) {
			return;
		}
		onDidChangeEmitter.fire(items.map(item => ({
			resource: URI.parse(item.uri),
			type: item.type === 'added' ? FileChangeType.ADDED
				: item.type === 'deleted' ? FileChangeType.DELETED
					: FileChangeType.UPDATED,
		})));
	});
	let disposed = false;
	return {
		onDidChange: onDidChangeEmitter.event,
		dispose: () => {
			if (disposed) {
				return;
			}
			disposed = true;
			listener.dispose();
			onDidChangeEmitter.dispose();
			try {
				primitives.unsubscribe(channelUri);
			} catch {
				// Connection may already be gone; the server-side grace
				// timer will clean up.
			}
		},
	};
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

interface IAuthorityEntry {
	/**
	 * All currently-registered connections for this authority, oldest
	 * first. The active connection is the last entry (most recent
	 * registration wins). Older registrations are kept so that if a
	 * caller registers `A`, then `B`, then disposes `B`, we transparently
	 * fall back to `A` instead of entering a grace window.
	 *
	 * Empty while the entry is inside the grace window.
	 */
	connections: IRemoteFilesystemConnection[];
	/**
	 * Pending eviction timer; armed while {@link connections} is empty,
	 * cleared on re-registration or eviction.
	 */
	readonly expiry: MutableDisposable<IDisposable>;
}

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
export abstract class AHPFileSystemProvider extends Disposable implements IFileSystemProvider, IFileSystemProviderWithFileRealpathCapability {

	readonly capabilities =
		FileSystemProviderCapabilities.PathCaseSensitive |
		FileSystemProviderCapabilities.FileReadWrite |
		FileSystemProviderCapabilities.FileFolderCopy |
		FileSystemProviderCapabilities.FileRealpath;

	private readonly _onDidChangeCapabilities = this._register(new Emitter<void>());
	readonly onDidChangeCapabilities = this._onDidChangeCapabilities.event;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;
	private readonly _onDidWatchError = this._register(new Emitter<string>());
	readonly onDidWatchError = this._onDidWatchError.event;

	/**
	 * Per-authority registration slot. We keep the slot alive for a brief
	 * grace period after the last registration is disposed, so an
	 * operation issued during a reconnection window can wait for the
	 * replacement registration instead of failing immediately.
	 */
	private readonly _authorities = new Map<string, IAuthorityEntry>();

	/**
	 * Fires the authority whose active connection has changed: added,
	 * replaced, fallen back to an older registration, entered the grace
	 * window (no active connection), or evicted. Long-lived consumers
	 * (e.g. {@link watch}) subscribe here so they continue to receive
	 * notifications across full entry eviction + later re-creation —
	 * something a per-entry emitter cannot offer.
	 */
	private readonly _onDidChangeConnection = this._register(new Emitter<string>());

	/**
	 * Grace period during which {@link _getConnection} will await a new
	 * registration after the previous one is disposed. Covers the window
	 * where a transport is briefly torn down and re-registered (e.g. an
	 * agent-host client reconnect that races a plugin sync). 5s matches
	 * the typical reconnect timeout. Consumers should still implement
	 * logical retries for longer reconnection latencies, but this is a
	 * low level, best-effort mechanism.
	 *
	 * Tests can override this via the constructor parameter.
	 */
	private static readonly _DEFAULT_CONNECTION_GRACE_MS = 5000;

	constructor(
		private readonly _connectionGraceMs: number = AHPFileSystemProvider._DEFAULT_CONNECTION_GRACE_MS,
	) {
		super();
	}

	/**
	 * Register a mapping from a URI authority to a connection.
	 * Returns a disposable that unregisters the mapping. Multiple
	 * concurrent registrations for the same authority are supported;
	 * the most recent registration wins, and disposing it falls back to
	 * the previous one (if any). After the *last* registration is
	 * disposed the entry is held open for {@link _connectionGraceMs} so
	 * that a reconnect can replace it without orphaning in-flight
	 * operations.
	 */
	registerAuthority(authority: string, connection: IRemoteFilesystemConnection): IDisposable {
		let entry = this._authorities.get(authority);
		if (!entry) {
			entry = {
				connections: [connection],
				expiry: new MutableDisposable<IDisposable>(),
			};
			this._authorities.set(authority, entry);
		} else {
			entry.expiry.clear();
			entry.connections.push(connection);
		}
		const adopted = entry;
		this._onDidChangeConnection.fire(authority);

		return toDisposable(() => {
			const idx = adopted.connections.indexOf(connection);
			if (idx === -1) {
				return;
			}
			const wasActive = idx === adopted.connections.length - 1;
			adopted.connections.splice(idx, 1);
			if (adopted.connections.length === 0) {
				adopted.expiry.value = disposableTimeout(
					() => this._expireAuthority(authority, adopted),
					this._connectionGraceMs,
					this._store,
				);
			}

			if (wasActive) {
				this._onDidChangeConnection.fire(authority); // Falling back to an older connection — surface the change.
			}
		});
	}

	private _expireAuthority(authority: string, entry: IAuthorityEntry): void {
		// A re-registration may have landed between scheduling and
		// firing — bail in that case.
		if (this._authorities.get(authority) !== entry || entry.connections.length > 0) {
			return;
		}
		this._authorities.delete(authority);
		entry.expiry.dispose();
		this._onDidChangeConnection.fire(authority);
	}

	override dispose(): void {
		for (const entry of this._authorities.values()) {
			entry.expiry.dispose();
			entry.connections.length = 0;
		}
		this._authorities.clear();
		super.dispose();
	}

	/** Decode a provider URI back to the original URI for the remote endpoint. */
	protected abstract _decodeUri(resource: URI): URI;

	/** Encode a remote URI back into a provider URI with the given authority. */
	protected abstract _encodeUri(resource: URI, authority: string): URI;

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		// `IFileSystemProvider.watch` is synchronous, but acquiring a
		// connection may have to wait for a (re)registration and the
		// underlying AHP `createResourceWatch` + `subscribe` round-trip
		// is itself async. Additionally, watchers are long-lived: every
		// time the active connection for `authority` changes (reconnect,
		// fallback to an older registration, eviction followed by a fresh
		// registration, ...) we tear down any existing remote handle and
		// re-attach against the new connection. The class-level
		// {@link _onDidChangeConnection} event keeps us informed across
		// the full entry-eviction cycle.
		const store = new DisposableStore();
		const handleHolder = store.add(new MutableDisposable<IDisposable>());
		const authority = resource.authority;
		const params: CreateResourceWatchParams = {
			channel: ROOT_STATE_URI,
			uri: this._decodeUri(resource).toString(),
			recursive: opts.recursive,
			...(opts.excludes.length > 0 ? { excludes: { items: [...opts.excludes] } } : {}),
			...(opts.includes && opts.includes.length > 0
				? { includes: { items: opts.includes.map(p => typeof p === 'string' ? p : p.pattern) } }
				: {}),
		};

		// Track which connection the current handle was created against
		// so we ignore spurious change events that don't represent a
		// real swap (e.g. a stale registration disposal).
		let attached: IRemoteFilesystemConnection | undefined;
		let attaching = false;
		let pendingReattach = false;

		const reattach = async (): Promise<void> => {
			if (store.isDisposed) {
				return;
			}
			if (attaching) {
				pendingReattach = true;
				return;
			}
			const entry = this._authorities.get(authority);
			const next = entry?.connections.at(-1);
			if (next === attached) {
				return;
			}
			handleHolder.clear();
			attached = undefined;
			const watchResource = next?.watchResource;
			if (!next || !watchResource) {
				return;
			}
			attaching = true;
			const target = next;
			try {
				const handle = await watchResource.call(target, params);
				if (store.isDisposed) {
					handle.dispose();
					return;
				}
				const current = this._authorities.get(authority);
				if (!current || current.connections.at(-1) !== target) {
					// Active connection changed underneath us — toss this
					// handle and let the pending reattach pick the new one.
					handle.dispose();
					return;
				}
				const sub = handle.onDidChange(changes => this._onDidChangeFile.fire(changes.map(c => ({
					resource: this._encodeUri(c.resource, resource.authority),
					type: c.type,
				}))));
				handleHolder.value = toDisposable(() => {
					sub.dispose();
					handle.dispose();
				});
				attached = target;
			} catch (err) {
				this._onDidWatchError.fire(err instanceof Error ? err.message : String(err));
			} finally {
				attaching = false;
				if (pendingReattach) {
					pendingReattach = false;
					void reattach();
				}
			}
		};

		store.add(this._onDidChangeConnection.event(a => {
			if (a === authority) {
				void reattach();
			}
		}));
		void reattach();

		return store;
	}

	async stat(resource: URI): Promise<IStat> {
		const path = resource.path;

		if (path === '/' || path === '') {
			return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
		}
		const decoded = this._decodeUri(resource);
		if (decoded.scheme === 'session-db' || decoded.scheme === 'git-blob') {
			return { type: FileType.File, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
		}

		if (decoded.path === '/' || decoded.path === '') {
			return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
		}

		const connection = await this._getConnection(resource.authority);
		try {
			const resolved = await this._resolve(connection, decoded);

			return {
				type: resolved.type === 'directory' ? FileType.Directory
					: resolved.type === 'symlink' ? FileType.SymbolicLink
						: FileType.File,
				mtime: resolved.mtime ? Date.parse(resolved.mtime) : 0,
				ctime: resolved.ctime ? Date.parse(resolved.ctime) : 0,
				size: resolved.size ?? 0,
			};
		} catch (err) {
			throw this._mapError(err, FileSystemProviderErrorCode.FileNotFound);
		}
	}

	async realpath(resource: URI): Promise<string> {
		const path = resource.path;
		// Synthetic roots and virtual content schemes have no distinct
		// canonical path — return the input path unchanged.
		if (path === '/' || path === '') {
			return path;
		}
		const decoded = this._decodeUri(resource);
		if (decoded.scheme === 'session-db' || decoded.scheme === 'git-blob' || decoded.path === '/' || decoded.path === '') {
			return path;
		}
		const connection = await this._getConnection(resource.authority);
		try {
			const resolved = await this._resolve(connection, decoded);
			// `resolved.uri` is the remote canonical (realpath) URI. Re-encode
			// it back into provider space; the file service applies the
			// returned path onto the original provider URI.
			return this._encodeUri(URI.parse(resolved.uri), resource.authority).path;
		} catch (err) {
			throw this._mapError(err, FileSystemProviderErrorCode.FileNotFound);
		}
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		const entries = await this._listDirectory(resource.authority, resource);
		return entries.map(e => [e.name, e.type === 'directory' ? FileType.Directory : FileType.File]);
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const connection = await this._getConnection(resource.authority);
		try {
			const originalUri = this._decodeUri(resource);
			const result = await connection.resourceRead(originalUri);
			if (result.encoding === ContentEncoding.Base64) {
				return decodeBase64(result.data).buffer;
			}
			return VSBuffer.fromString(result.data).buffer;
		} catch (err) {
			throw this._mapError(err, FileSystemProviderErrorCode.FileNotFound);
		}
	}

	async writeFile(resource: URI, content: Uint8Array, _opts: IFileWriteOptions): Promise<void> {
		const connection = await this._getConnection(resource.authority);
		try {
			const originalUri = this._decodeUri(resource);
			await connection.resourceWrite({
				channel: ROOT_STATE_URI,
				uri: originalUri.toString(),
				data: VSBuffer.wrap(content).toString(),
				encoding: ContentEncoding.Utf8,
			});
		} catch (err) {
			throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
		}
	}

	async mkdir(resource: URI): Promise<void> {
		const connection = await this._getConnection(resource.authority);
		try {
			const originalUri = this._decodeUri(resource);
			await connection.resourceMkdir({ channel: ROOT_STATE_URI, uri: originalUri.toString() });
		} catch (err) {
			throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
		}
	}

	async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		const connection = await this._getConnection(resource.authority);
		try {
			const originalUri = this._decodeUri(resource);
			await connection.resourceDelete({ channel: ROOT_STATE_URI, uri: originalUri.toString(), recursive: opts.recursive });
		} catch (err) {
			throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
		}
	}

	async rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		const connection = await this._getConnection(from.authority);
		try {
			const originalFrom = this._decodeUri(from);
			const originalTo = this._decodeUri(to);
			await connection.resourceMove({ channel: ROOT_STATE_URI, source: originalFrom.toString(), destination: originalTo.toString(), failIfExists: !opts.overwrite });
		} catch (err) {
			throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
		}
	}

	async copy(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		const connection = await this._getConnection(from.authority);
		try {
			const originalFrom = this._decodeUri(from);
			const originalTo = this._decodeUri(to);
			await connection.resourceCopy({ channel: ROOT_STATE_URI, source: originalFrom.toString(), destination: originalTo.toString(), failIfExists: !opts.overwrite });
		} catch (err) {
			throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
		}
	}

	/**
	 * Negotiate access to {@link resource} with the receiver, asking for the
	 * granted modes in {@link opts}. Used after a `NoPermissions` failure to
	 * prompt the receiver to grant access; the caller can then retry.
	 *
	 * Resolves on success. Rejects if the receiver denies, the connection
	 * is missing, or the connection doesn't implement `resourceRequest`.
	 */
	async requestResourceAccess(resource: URI, opts: { readonly read?: boolean; readonly write?: boolean }): Promise<void> {
		const connection = await this._getConnection(resource.authority);
		if (!connection.resourceRequest) {
			throw createFileSystemProviderError(
				`Connection for ${resource.authority} does not support resourceRequest`,
				FileSystemProviderErrorCode.Unavailable,
			);
		}
		const originalUri = this._decodeUri(resource);
		try {
			await connection.resourceRequest({
				channel: ROOT_STATE_URI,
				uri: originalUri.toString(),
				read: opts.read,
				write: opts.write,
			});
		} catch (err) {
			throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
		}
	}

	// ---- Internals ----------------------------------------------------------

	private _getConnection(authority: string): Promise<IRemoteFilesystemConnection> {
		const entry = this._authorities.get(authority);
		if (!entry) {
			return Promise.reject(createFileSystemProviderError(
				`No connection for authority: ${authority}`,
				FileSystemProviderErrorCode.Unavailable,
			));
		}

		const active = entry.connections.at(-1);
		if (active) {
			return Promise.resolve(active);
		}
		// Entry is inside its grace window after the last registration
		// was disposed. Wait until either a new registration arrives
		// (resolve) or the grace timer expires and evicts the entry
		// (reject).
		return new Promise((resolve, reject) => {
			const settle = (): void => {
				const current = this._authorities.get(authority);
				if (!current) {
					sub.dispose();
					reject(createFileSystemProviderError(
						`No connection for authority: ${authority}`,
						FileSystemProviderErrorCode.Unavailable,
					));
					return;
				}
				const c = current.connections.at(-1);
				if (c) {
					sub.dispose();
					resolve(c);
				}
			};
			const sub = this._onDidChangeConnection.event(a => {
				if (a === authority) {
					settle();
				}
			});
			// Re-check after subscribing in case the state changed between
			// our initial check and the listener registration.
			settle();
		});
	}

	/**
	 * Translate a thrown error from a {@link IRemoteFilesystemConnection}
	 * into a {@link FileSystemProviderError}. Preserves `PermissionDenied`
	 * (-32009) as `NoPermissions` so callers can distinguish a
	 * permission failure from `NotFound` and decide whether to negotiate
	 * via {@link requestResourceAccess}.
	 */
	private _mapError(err: unknown, defaultCode: FileSystemProviderErrorCode): Error {
		if (err instanceof ProtocolError && err.code === AhpErrorCodes.PermissionDenied) {
			return createFileSystemProviderError(err.message, FileSystemProviderErrorCode.NoPermissions);
		}
		return createFileSystemProviderError(
			err instanceof Error ? err.message : String(err),
			defaultCode,
		);
	}

	/**
	 * Resolve a decoded resource over {@link connection}. Shared by
	 * {@link stat} and {@link realpath}.
	 */
	private _resolve(connection: IRemoteFilesystemConnection, decoded: URI): Promise<ResourceResolveResult> {
		return connection.resourceResolve({ channel: ROOT_STATE_URI, uri: decoded.toString() });
	}

	private async _listDirectory(authority: string, resource: URI): Promise<readonly DirectoryEntry[]> {
		const connection = await this._getConnection(authority);
		try {
			const originalUri = this._decodeUri(resource);
			const result = await connection.resourceList(originalUri);
			return result.entries;
		} catch (err) {
			throw this._mapError(err, FileSystemProviderErrorCode.Unavailable);
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

	protected _encodeUri(resource: URI, authority: string): URI {
		return toAgentHostUri(resource, authority);
	}
}
