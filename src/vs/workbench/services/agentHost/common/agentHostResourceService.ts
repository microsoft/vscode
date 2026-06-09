/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer, decodeBase64 } from '../../../../base/common/buffer.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, derived, observableValue } from '../../../../base/common/observable.js';
import { extUri } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import {
	AgentHostAccessMode,
	AgentHostLocalFilePermissionsSettingId,
	AgentHostPermissionMode,
	AgentHostPermissionsSetting,
	AgentHostResourcePermissionError,
	IAgentHostResourceService,
	IPendingResourceRequest,
	IResourceListResult,
	IResourceReadResult,
	LOCAL_AGENT_HOST_ADDRESS,
} from '../../../../platform/agentHost/common/agentHostResourceService.js';
import { normalizeRemoteAgentHostAddress } from '../../../../platform/agentHost/common/agentHostUri.js';
import {
	ContentEncoding,
	ResourceCopyParams, ResourceDeleteParams, ResourceMkdirParams, ResourceMoveParams,
	ResourceRequestParams, ResourceResolveParams, ResourceResolveResult, ResourceType, ResourceWriteParams,
} from '../../../../platform/agentHost/common/state/protocol/commands.js';
import { ROOT_STATE_URI } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';

interface IInternalPendingRequest extends IPendingResourceRequest {
	readonly deferred: DeferredPromise<void>;
}

interface IInMemoryGrant {
	readonly address: string;
	/**
	 * Resolves to the realpath'd URI for the grant. Stored as a promise so
	 * `grantImplicitRead` can return synchronously while the realpath lookup
	 * is in flight; consumers in `_isCovered` await the resolved URI before
	 * comparing, so a check that happens before the lookup completes still
	 * compares against the canonical path. Always resolves (never rejects).
	 */
	readonly realpath: Promise<URI>;
	readonly mode: AgentHostAccessMode;
}

/**
 * Default implementation of {@link IAgentHostResourceService} — the unified
 * owner of agent-host-facing filesystem operations and the permission
 * policy that gates them. Reads transparently fall back to
 * {@link ITextModelService} so virtual resources (untitled documents,
 * notebook cells, ...) work without the host having to know about them.
 *
 * Permission storage shape (in user settings):
 *
 * ```jsonc
 * "chat.agentHost.localFilePermissions": {
 *   "localhost:3000": {
 *     "file:///Users/me/.gitconfig": "r",
 *     "file:///Users/me/.agentConfig": "rw"
 *   },
 *   "local": { ... }
 * }
 * ```
 *
 * - Keys are addresses normalized via {@link normalizeRemoteAgentHostAddress},
 *   with the in-process local agent host keyed under `'local'`.
 * - Values are URI strings → `r` | `rw`. Descendant URIs are covered by a
 *   parent grant.
 */
export class AgentHostResourceService extends Disposable implements IAgentHostResourceService {
	declare readonly _serviceBrand: undefined;

	private readonly _inMemoryGrants = new Map<string, IInMemoryGrant>();
	private readonly _pending = observableValue<readonly IInternalPendingRequest[]>('agentHostResources.pending', []);

	readonly allPending: IObservable<readonly IPendingResourceRequest[]> = this._pending;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	// ---- Gated FS operations ------------------------------------------------

	async list(address: string, uri: URI): Promise<IResourceListResult> {
		await this._gate(address, uri, AgentHostPermissionMode.Read, { channel: ROOT_STATE_URI, uri: uri.toString(), read: true });
		const stat = await this._fileService.resolve(uri);
		if (!stat.isDirectory) {
			throw new Error(`Resource is not a directory: ${uri.toString()}`);
		}
		return {
			entries: (stat.children ?? []).map(c => ({
				name: c.name,
				type: c.isDirectory ? 'directory' : 'file',
			})),
		};
	}

	async read(address: string, uri: URI): Promise<IResourceReadResult> {
		await this._gate(address, uri, AgentHostPermissionMode.Read, { channel: ROOT_STATE_URI, uri: uri.toString(), read: true });
		try {
			const content = await this._fileService.readFile(uri);
			return { bytes: content.value };
		} catch (err) {
			const virtual = await this._readVirtual(uri);
			if (virtual) {
				return { bytes: virtual };
			}
			throw err;
		}
	}

	async write(address: string, params: ResourceWriteParams): Promise<void> {
		const uri = URI.parse(params.uri);
		await this._gate(address, uri, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: uri.toString(), write: true });
		const buf = params.encoding === ContentEncoding.Base64
			? decodeBase64(params.data)
			: VSBuffer.fromString(params.data);
		try {
			if (params.createOnly) {
				await this._fileService.createFile(uri, buf, { overwrite: false });
			} else {
				await this._fileService.writeFile(uri, buf);
			}
		} catch (err) {
			if (await this._writeVirtual(uri, buf)) {
				return;
			}
			throw err;
		}
	}

	async del(address: string, params: ResourceDeleteParams): Promise<void> {
		const uri = URI.parse(params.uri);
		await this._gate(address, uri, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: uri.toString(), write: true });
		await this._fileService.del(uri, { recursive: !!params.recursive });
	}

	async move(address: string, params: ResourceMoveParams): Promise<void> {
		const source = URI.parse(params.source);
		const destination = URI.parse(params.destination);
		await this._gate(address, source, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: source.toString(), write: true });
		await this._gate(address, destination, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: destination.toString(), write: true });
		await this._fileService.move(source, destination, !params.failIfExists);
	}

	async copy(address: string, params: ResourceCopyParams): Promise<void> {
		const source = URI.parse(params.source);
		const destination = URI.parse(params.destination);
		await this._gate(address, source, AgentHostPermissionMode.Read, { channel: ROOT_STATE_URI, uri: source.toString(), read: true });
		await this._gate(address, destination, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: destination.toString(), write: true });
		await this._fileService.copy(source, destination, !params.failIfExists);
	}

	async resolve(address: string, params: ResourceResolveParams): Promise<ResourceResolveResult> {
		const uri = URI.parse(params.uri);
		await this._gate(address, uri, AgentHostPermissionMode.Read, { channel: ROOT_STATE_URI, uri: uri.toString(), read: true });
		let stat;
		try {
			stat = await this._fileService.stat(uri);
		} catch (err) {
			const virtual = await this._statVirtual(uri);
			if (virtual) {
				return virtual;
			}
			throw err;
		}
		let type: ResourceType;
		if (stat.isSymbolicLink && params.followSymlinks === false) {
			type = ResourceType.Symlink;
		} else if (stat.isDirectory) {
			type = ResourceType.Directory;
		} else {
			type = ResourceType.File;
		}
		return {
			uri: uri.toString(),
			type,
			...(stat.size !== undefined ? { size: stat.size } : {}),
			...(stat.mtime !== undefined ? { mtime: new Date(stat.mtime).toISOString() } : {}),
			...(stat.ctime !== undefined ? { ctime: new Date(stat.ctime).toISOString() } : {}),
			...(stat.etag ? { etag: stat.etag } : {}),
		};
	}

	async mkdir(address: string, params: ResourceMkdirParams): Promise<void> {
		const uri = URI.parse(params.uri);
		await this._gate(address, uri, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: uri.toString(), write: true });
		const existing = await this._fileService.stat(uri).catch(() => undefined);
		if (existing && !existing.isDirectory) {
			throw new Error(`Path exists and is not a directory: ${uri.toString()}`);
		}
		await this._fileService.createFolder(uri);
	}

	// ---- Permission requests / observables ---------------------------------

	async check(address: string, uri: URI, mode: AgentHostPermissionMode): Promise<boolean> {
		const normalized = normalizeRemoteAgentHostAddress(address);
		const canonical = await this._canonicalize(uri);
		return this._isCovered(normalized, canonical, mode);
	}

	async request(address: string, params: ResourceRequestParams): Promise<void> {
		const normalized = normalizeRemoteAgentHostAddress(address);
		const canonical = await this._canonicalize(URI.parse(params.uri));
		const wantsWrite = params.write === true;
		const wantsRead = params.read === true || !wantsWrite;

		if (wantsRead && !await this._isCovered(normalized, canonical, AgentHostPermissionMode.Read)) {
			await this._enqueue(normalized, canonical, AgentHostPermissionMode.Read);
		}
		if (wantsWrite && !await this._isCovered(normalized, canonical, AgentHostPermissionMode.Write)) {
			await this._enqueue(normalized, canonical, AgentHostPermissionMode.Write);
		}
	}

	pendingFor(address: string): IObservable<readonly IPendingResourceRequest[]> {
		const normalized = normalizeRemoteAgentHostAddress(address);
		return derived(reader => this._pending.read(reader).filter(r => r.address === normalized));
	}

	findPending(id: string): IPendingResourceRequest | undefined {
		return this._pending.get().find(r => r.id === id);
	}

	grantImplicitRead(address: string, uri: URI): IDisposable {
		const handle = generateUuid();
		const lexical = extUri.normalizePath(uri);
		const realpath = this._fileService.realpath(lexical).then(
			real => real ?? lexical,
			() => lexical,
		);
		this._inMemoryGrants.set(handle, {
			address: normalizeRemoteAgentHostAddress(address),
			realpath,
			mode: AgentHostAccessMode.Read,
		});
		return toDisposable(() => this._inMemoryGrants.delete(handle));
	}

	connectionClosed(address: string): void {
		const normalized = normalizeRemoteAgentHostAddress(address);

		for (const [handle, grant] of this._inMemoryGrants) {
			if (grant.address === normalized) {
				this._inMemoryGrants.delete(handle);
			}
		}

		const cancel = new CancellationError();
		const remaining: IInternalPendingRequest[] = [];
		for (const request of this._pending.get()) {
			if (request.address === normalized) {
				request.deferred.error(cancel);
			} else {
				remaining.push(request);
			}
		}
		if (remaining.length !== this._pending.get().length) {
			this._pending.set(remaining, undefined);
		}
	}

	// ---- internals ---------------------------------------------------------

	private async _gate(
		address: string,
		uri: URI,
		mode: AgentHostPermissionMode,
		deniedRequest: ResourceRequestParams,
	): Promise<void> {
		if (!await this.check(address, uri, mode)) {
			throw new AgentHostResourcePermissionError(deniedRequest);
		}
	}

	private async _readVirtual(uri: URI): Promise<VSBuffer | undefined> {
		try {
			const ref = await this._textModelService.createModelReference(uri);
			try {
				return VSBuffer.fromString(ref.object.textEditorModel.getValue());
			} finally {
				ref.dispose();
			}
		} catch {
			return undefined;
		}
	}

	/**
	 * Write {@link bytes} as text into the resolved text model for {@link uri},
	 * if one can be resolved and is writable. Returns `true` when the model was
	 * updated, `false` otherwise (no provider, readonly, decode failure).
	 */
	private async _writeVirtual(uri: URI, bytes: VSBuffer): Promise<boolean> {
		try {
			const ref = await this._textModelService.createModelReference(uri);
			try {
				if (ref.object.isReadonly()) {
					return false;
				}
				ref.object.textEditorModel.setValue(bytes.toString());
				return true;
			} finally {
				ref.dispose();
			}
		} catch {
			return false;
		}
	}

	/**
	 * Resolve {@link uri} via {@link ITextModelService} and synthesize a
	 * {@link ResourceResolveResult} so virtual resources stat as `File` with
	 * a size matching their text content. Returns `undefined` if no model
	 * can be resolved.
	 */
	private async _statVirtual(uri: URI): Promise<ResourceResolveResult | undefined> {
		try {
			const ref = await this._textModelService.createModelReference(uri);
			try {
				const size = VSBuffer.fromString(ref.object.textEditorModel.getValue()).byteLength;
				return {
					uri: uri.toString(),
					type: ResourceType.File,
					size,
				};
			} finally {
				ref.dispose();
			}
		} catch {
			return undefined;
		}
	}

	/**
	 * Resolve {@link uri} against the local filesystem, collapsing `..`
	 * segments and following symlinks so the policy check sees the same
	 * path the OS will actually open. For URIs that don't exist (e.g. a
	 * `resourceWrite` for a new file), realpath the deepest existing
	 * ancestor and re-append the leaf.
	 */
	private async _canonicalize(uri: URI): Promise<URI> {
		const normalized = extUri.normalizePath(uri);
		const real = await this._fileService.realpath(normalized).catch(() => undefined);
		if (real) {
			return real;
		}
		const parent = extUri.dirname(normalized);
		if (extUri.isEqual(parent, normalized)) {
			return normalized;
		}
		const realParent = await this._fileService.realpath(parent).catch(() => undefined);
		return realParent
			? extUri.joinPath(realParent, extUri.basename(normalized))
			: normalized;
	}

	private async _isCovered(address: string, canonicalUri: URI, mode: AgentHostPermissionMode): Promise<boolean> {
		if (address === LOCAL_AGENT_HOST_ADDRESS) {
			return true;
		}
		const requireWrite = mode === AgentHostPermissionMode.Write;

		for (const grant of this._readPersistedGrants(address)) {
			if (requireWrite && grant.mode !== AgentHostAccessMode.ReadWrite) {
				continue;
			}
			if (extUri.isEqualOrParent(canonicalUri, grant.uri)) {
				return true;
			}
		}

		const candidates: Promise<URI>[] = [];
		for (const grant of this._inMemoryGrants.values()) {
			if (grant.address !== address) {
				continue;
			}
			if (requireWrite && grant.mode !== AgentHostAccessMode.ReadWrite) {
				continue;
			}
			candidates.push(grant.realpath);
		}
		const realpaths = await Promise.all(candidates);
		return realpaths.some(uri => extUri.isEqualOrParent(canonicalUri, uri));
	}

	private _enqueue(address: string, canonicalUri: URI, mode: AgentHostPermissionMode): Promise<void> {
		const existing = this._pending.get().find(r =>
			r.address === address && r.mode === mode && extUri.isEqual(r.uri, canonicalUri));
		if (existing) {
			return existing.deferred.p;
		}

		const deferred = new DeferredPromise<void>();
		const request: IInternalPendingRequest = {
			id: generateUuid(),
			address,
			uri: canonicalUri,
			mode,
			deferred,
			allow: () => this._resolve(request, 'memory'),
			allowAlways: () => this._resolve(request, 'persist'),
			deny: () => {
				this._dropPending(request);
				deferred.error(new CancellationError());
			},
		};
		this._pending.set([...this._pending.get(), request], undefined);
		return deferred.p;
	}

	private _resolve(request: IInternalPendingRequest, scope: 'memory' | 'persist'): void {
		const accessMode = request.mode === AgentHostPermissionMode.Write
			? AgentHostAccessMode.ReadWrite
			: AgentHostAccessMode.Read;

		this._inMemoryGrants.set(generateUuid(), {
			address: request.address,
			realpath: Promise.resolve(request.uri),
			mode: accessMode,
		});

		if (scope === 'persist') {
			void this._persistGrant(request.address, request.uri, request.mode).catch(err => {
				this._logService.warn('[AgentHostResourceService] Failed to persist grant', err);
			});
		}

		this._dropPending(request);
		request.deferred.complete();
	}

	private _dropPending(request: IInternalPendingRequest): void {
		const next = this._pending.get().filter(r => r !== request);
		if (next.length !== this._pending.get().length) {
			this._pending.set(next, undefined);
		}
	}

	private *_readPersistedGrants(address: string): Iterable<{ uri: URI; mode: AgentHostAccessMode }> {
		const forAddress = this._configurationService
			.getValue<AgentHostPermissionsSetting>(AgentHostLocalFilePermissionsSettingId)?.[address];
		if (!forAddress) {
			return;
		}
		for (const [uriStr, mode] of Object.entries(forAddress)) {
			if (mode !== AgentHostAccessMode.Read && mode !== AgentHostAccessMode.ReadWrite) {
				continue;
			}
			try {
				yield { uri: URI.parse(uriStr), mode };
			} catch {
				// Ignore malformed URI keys.
			}
		}
	}

	private async _persistGrant(address: string, uri: URI, mode: AgentHostPermissionMode): Promise<void> {
		const requested: AgentHostAccessMode = mode === AgentHostPermissionMode.Write
			? AgentHostAccessMode.ReadWrite
			: AgentHostAccessMode.Read;

		for (const grant of this._readPersistedGrants(address)) {
			const covers = grant.mode === AgentHostAccessMode.ReadWrite || requested === AgentHostAccessMode.Read;
			if (covers && extUri.isEqualOrParent(uri, grant.uri)) {
				return;
			}
		}

		const { target, value } = this._inspectScopedSetting();
		const forAddress: Record<string, AgentHostAccessMode> = { ...(value[address] ?? {}) };
		const uriKey = uri.toString();
		if (forAddress[uriKey] === AgentHostAccessMode.ReadWrite) {
			return;
		}
		forAddress[uriKey] = requested;

		await this._configurationService.updateValue(
			AgentHostLocalFilePermissionsSettingId,
			{ ...value, [address]: forAddress },
			target,
		);
	}

	private _inspectScopedSetting(): { target: ConfigurationTarget; value: AgentHostPermissionsSetting } {
		const inspected = this._configurationService.inspect<AgentHostPermissionsSetting>(AgentHostLocalFilePermissionsSettingId);
		if (inspected.applicationValue !== undefined) {
			return { target: ConfigurationTarget.APPLICATION, value: inspected.applicationValue };
		}
		if (inspected.userLocalValue !== undefined) {
			return { target: ConfigurationTarget.USER_LOCAL, value: inspected.userLocalValue };
		}
		if (inspected.userRemoteValue !== undefined) {
			return { target: ConfigurationTarget.USER_REMOTE, value: inspected.userRemoteValue };
		}
		if (inspected.userValue !== undefined) {
			return { target: ConfigurationTarget.USER, value: inspected.userValue };
		}
		return { target: ConfigurationTarget.APPLICATION, value: {} };
	}
}

registerSingleton(IAgentHostResourceService, AgentHostResourceService, InstantiationType.Delayed);
