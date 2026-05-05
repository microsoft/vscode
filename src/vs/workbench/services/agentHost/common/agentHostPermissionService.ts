/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, derived, observableValue } from '../../../../base/common/observable.js';
import { extUri } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { normalizeRemoteAgentHostAddress } from '../../../../platform/agentHost/common/agentHostUri.js';
import {
	AgentHostAccessMode,
	AgentHostPermissionMode,
	AgentHostPermissionsSetting,
	IAgentHostPermissionService,
	IPendingResourceRequest,
	AgentHostLocalFilePermissionsSettingId,
} from '../../../../platform/agentHost/common/agentHostPermissionService.js';
import { ResourceRequestParams } from '../../../../platform/agentHost/common/state/protocol/commands.js';
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
 * Default implementation of {@link IAgentHostPermissionService}.
 *
 * Permission storage shape (in user settings):
 *
 * ```jsonc
 * "chat.agentHost.localFilePermissions": {
 *   "localhost:3000": {
 *     "file:///Users/me/.gitconfig": "r",
 *     "file:///Users/me/.agentConfig": "rw"
 *   }
 * }
 * ```
 *
 * - Keys are addresses normalized via {@link normalizeRemoteAgentHostAddress}.
 * - Values are URI strings → `r` | `rw`. Descendant URIs are covered by a
 *   parent grant (e.g. a grant for `.config/` covers `.config/foo.json`).
 */
export class AgentHostPermissionService extends Disposable implements IAgentHostPermissionService {
	declare readonly _serviceBrand: undefined;

	/**
	 * In-memory grants. Two kinds, both stored here so they share the
	 * `connectionClosed` cleanup pass:
	 *
	 * - **Implicit reads** added by `grantImplicitRead` (read-only, kept alive
	 *   by an explicit disposable revocation handle from the caller).
	 * - **Session grants** from the user clicking "Allow" in the prompt
	 *   (read or write, cleared when the connection closes or the window
	 *   reloads). These have no caller-held disposable.
	 *
	 * Keyed by an opaque handle so callers can revoke independently.
	 */
	private readonly _inMemoryGrants = new Map<string, IInMemoryGrant>();

	/** All pending requests across every connection. */
	private readonly _pending = observableValue<readonly IInternalPendingRequest[]>('agentHostPermissions.pending', []);

	readonly allPending: IObservable<readonly IPendingResourceRequest[]> = this._pending;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async check(address: string, uri: URI, mode: AgentHostPermissionMode): Promise<boolean> {
		const normalized = normalizeRemoteAgentHostAddress(address);
		const canonical = await this._canonicalize(uri);
		return this._isCovered(normalized, canonical, mode);
	}

	async request(address: string, params: ResourceRequestParams): Promise<void> {
		const normalized = normalizeRemoteAgentHostAddress(address);
		const canonical = await this._canonicalize(URI.parse(params.uri));
		// Per AHP: a request with neither flag set is treated as read.
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
		// Implicit grants are usually for paths that exist (e.g. plugin
		// directories on disk). Kick off realpath in the background; consumers
		// await this promise before comparing so a symlinked grant root still
		// covers descendant requests that resolve through the symlink.
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
		// File doesn't exist (yet). Realpath the parent so symlinks in the
		// directory chain are still resolved.
		const parent = extUri.dirname(normalized);
		if (extUri.isEqual(parent, normalized)) {
			return normalized;
		}
		const realParent = await this._fileService.realpath(parent).catch(() => undefined);
		return realParent
			? extUri.joinPath(realParent, extUri.basename(normalized))
			: normalized;
	}

	/**
	 * Policy check against in-memory + persisted grants. Asynchronous
	 * because in-memory grants from {@link grantImplicitRead} carry an
	 * unresolved realpath promise — see {@link IInMemoryGrant.realpath}.
	 */
	private async _isCovered(address: string, canonicalUri: URI, mode: AgentHostPermissionMode): Promise<boolean> {
		const requireWrite = mode === AgentHostPermissionMode.Write;

		// Persisted grants are synchronous; check them first to short-circuit
		// without awaiting any in-memory realpath promises.
		for (const grant of this._readPersistedGrants(address)) {
			if (requireWrite && grant.mode !== AgentHostAccessMode.ReadWrite) {
				continue;
			}
			if (extUri.isEqualOrParent(canonicalUri, grant.uri)) {
				return true;
			}
		}

		// In-memory grants — await each candidate's realpath so symlinked
		// grant roots compare against the canonicalized request URI.
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

		// Always add an in-memory grant so the host's retry of the original
		// operation hits a covered check synchronously. For "persist", the
		// settings write is fire-and-forget; the in-memory cover hides any
		// latency in the configuration service propagating the update.
		// `request.uri` is already canonical (canonicalized in `request()`).
		this._inMemoryGrants.set(generateUuid(), {
			address: request.address,
			realpath: Promise.resolve(request.uri),
			mode: accessMode,
		});

		if (scope === 'persist') {
			void this._persistGrant(request.address, request.uri, request.mode).catch(err => {
				this._logService.warn('[AgentHostPermissionService] Failed to persist grant', err);
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

		// If a covering ancestor already grants enough, do nothing.
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
			return; // Already at the strongest level.
		}
		forAddress[uriKey] = requested;

		await this._configurationService.updateValue(
			AgentHostLocalFilePermissionsSettingId,
			{ ...value, [address]: forAddress },
			target,
		);
	}

	/**
	 * Inspect the setting and pick the scope to write back to. The setting
	 * is registered with `ConfigurationScope.APPLICATION`, so APPLICATION is
	 * the canonical home; we still honour pre-existing values in the
	 * user-* scopes so a hand-edited entry isn't silently relocated, but
	 * fresh writes default to APPLICATION.
	 */
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

registerSingleton(IAgentHostPermissionService, AgentHostPermissionService, InstantiationType.Delayed);
