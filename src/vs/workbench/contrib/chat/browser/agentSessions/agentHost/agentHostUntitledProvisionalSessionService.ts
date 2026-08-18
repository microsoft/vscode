/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LM editing map for untitled agent-host chat sessions.
 *
 * This service exists so session-config chip choices made before first Send
 * reach the backend `SessionState.config.values`. Do not simplify this into a
 * direct picker-only cache: the agent reads config through the backend state
 * when a provisional session materializes.
 *
 * Resource identities:
 * - chat UI resource: `agent-host-PROVIDER:/untitled-<uuid>` before first Send.
 * - backend resource: an opaque `PROVIDER:/<uuid>` for provisional state.
 * - real chat resource: `agent-host-PROVIDER:/<uuid>` after
 *   `chatServiceImpl.acceptInput` calls `createNewChatSessionItem`.
 * - real backend resource: `PROVIDER:/<uuid>` after `tryRebind`.
 *
 * Required flow:
 * 1. `AgentHostChatInputPicker` calls `getOrCreate(untitled, provider, cwd)`.
 *    This creates a backend provisional session so `SessionConfigChanged`
 *    actions have a reducer-owned `SessionState` to update.
 * 2. On first Send, `AgentHostSessionListController.newChatSessionItem`
 *    receives both `request.untitledResource` and the newly generated real
 *    resource. It must call `tryRebind` before the handler invokes the agent.
 * 3. `tryRebind` snapshots the workbench-owned config from the untitled
 *    provisional record, creates a new provisional for the real backend
 *    resource, swaps `_entries`, fires `onDidChange`, then best-effort disposes
 *    the untitled backend provisional.
 * 4. `AgentHostSessionHandler._invokeAgent` calls `get(realResource)`. When a
 *    rebound provisional exists, it takes a refcounted subscription on that
 *    backend state up front so the rest of the handler observes the preserved
 *    `state.config.values` instead of a freshly created empty session. The
 *    eager-state branch then skips `_createAndSubscribe`; the agent
 *    materializes the provisional and reads the preserved config values.
 *
 * Invariants to preserve:
 * - `_entries` is keyed by chat UI resources and stores backend resources.
 * - `getOrCreate` is serialized per chat UI resource; chip instances may race.
 * - Recoverable `tryRebind` failure degrades to the handler's normal create
 *   path. It rejects only when an ambiguous final URI cannot be retired safely.
 * - Abandoned untitled chats must dispose their backend provisional state when
 *   `IChatService.onDidDisposeSession` reports the chat UI resource.
 * - Callers own provider and working-directory consistency. Derive them from
 *   the chat resource/session type and active workspace in the same way on
 *   create and rebind.
 */

import { SequencerByKey } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { equals } from '../../../../../../base/common/objects.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { KNOWN_MODE_VALUES, SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { migrateLegacyAutopilotConfig } from '../../../../../../platform/agentHost/common/agentHostSchema.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import type { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { areSessionWorkingDirectoriesEqual } from '../../../../../../platform/agentHost/common/state/sessionWorkingDirectories.js';
import { withSessionMultiRootMetadata } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService, IWorkspaceFoldersChangeEvent, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ChatConfiguration, getChatPermissionLevelFromDefaultConfiguration, type IChatDefaultConfiguration } from '../../../common/constants.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IAgentHostNewSessionFolderService, computeDesiredWorkingDirectories, computeWorkingDirectories, hasImmutablePrimaryWorkingDirectory, supportsMultipleWorkingDirectories } from './agentHostNewSessionFolderService.js';
import { IAgentCustomizationScope, IAgentHostActiveClientService } from './agentHostActiveClientService.js';
import { type IAgentHostImportConversation, IAgentHostImportConversationStore } from './agentHostImportConversationStore.js';

export const IAgentHostUntitledProvisionalSessionService =
	createDecorator<IAgentHostUntitledProvisionalSessionService>('agentHostUntitledProvisionalSessionService');

/**
 * LM contract: maintain one backend provisional session per untitled chat UI
 * resource, and bridge it to the real chat UI resource before the first agent
 * invocation. The contract is about backend `SessionState.config.values`, not
 * UI rendering state.
 */
export interface IAgentHostUntitledProvisionalSessionService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires for the chat UI resource whose backend provisional mapping changed.
	 * Picker listeners must re-read {@link get} and attach to the returned
	 * backend URI, if any.
	 */
	readonly onDidChange: Event<URI>;

	/**
	 * Read the backend provisional URI currently mapped from `sessionResource`.
	 * Returns `undefined` for resources that have not been provisioned or were
	 * already disposed/rebound away.
	 */
	get(sessionResource: URI): URI | undefined;

	/**
	 * Initial config the editor window applies to every new Agent Host session.
	 * Returns `undefined` in the Agents window, where the sessions provider owns
	 * the initial config supplied on the request.
	 */
	getInitialSessionConfig(): Record<string, unknown> | undefined;

	/** Initial session metadata contributed by the current Editor workspace. */
	getInitialSessionMetadata(): Record<string, unknown> | undefined;

	/**
	 * Ensure a backend provisional exists for an untitled chat UI resource.
	 * Multiple picker chips may call this concurrently; implementation must keep
	 * one create in flight per resource and return the same backend URI.
	 */
	getOrCreate(
		sessionResource: URI,
		provider: string,
		workingDirectory: URI | undefined,
	): Promise<URI | undefined>;

	/**
	 * Wait for a pending {@link getOrCreate} for `sessionResource`, then return
	 * the current mapping. Use this before reading/discarding a resource that may
	 * still be racing with picker-triggered provisional creation.
	 */
	waitForPending(sessionResource: URI): Promise<URI | undefined>;

	/**
	 * Apply a partial config change to the backend provisional for an untitled
	 * chat UI resource. Updates the workbench-owned config cache synchronously
	 * (so a subsequent {@link tryRebind} sees the latest values without a
	 * server roundtrip), creates the provisional if needed, then dispatches
	 * `SessionConfigChanged` on the backend so the agent and other clients
	 * pick up the change. Returns the backend URI on success.
	 */
	applyConfigChange(
		sessionResource: URI,
		provider: string,
		workingDirectory: URI | undefined,
		partial: Record<string, unknown>,
	): Promise<URI | undefined>;

	/**
	 * Bridge the untitled chat UI resource to the real chat UI resource created
	 * for first Send. Must copy the workbench-owned config into the real backend
	 * provisional before the handler invokes the agent. No-op when no old mapping
	 * exists; idempotent when the new mapping is already present.
	 */
	tryRebind(
		oldSessionResource: URI,
		newSessionResource: URI,
		provider: string,
	): Promise<URI | undefined>;

	/**
	 * Dispose and forget the backend provisional mapped from `sessionResource`.
	 * Safe after a successful rebind because the old mapping is already gone.
	 */
	disposeSession(sessionResource: URI): Promise<void>;

	/**
	 * Latest workbench-side re-resolved config (schema + values) for a chat
	 * session, if any. Populated after a value change so dependent properties
	 * refresh without a protocol-level schema-update channel.
	 *
	 * Both the schema and the values matter: `resolveSessionConfig` runs
	 * `validateOrDefault`, which can clamp now-invalid values or inject
	 * derived defaults the consumer should prefer over `state.config.values`.
	 */
	getResolvedConfig(sessionResource: URI): ResolveSessionConfigResult | undefined;

	/**
	 * Re-resolve config for an already-created chat session and cache the
	 * schema/values overlay returned by the provider.
	 */
	refreshResolvedConfig(
		sessionResource: URI,
		provider: string,
		workingDirectory: URI | undefined,
		config: Record<string, unknown> | undefined,
	): Promise<void>;
}

interface IProvisionalGeneration {
	readonly backendSession: URI;
	readonly workingDirectory: URI | undefined;
	readonly workingDirectories: readonly URI[] | undefined;
}

type ProvisionalOperationResult = URI | void;

class ActiveClientBinding extends Disposable {
	constructor(
		readonly roots: readonly URI[],
		readonly scope: IAgentCustomizationScope | undefined,
		clientId: string,
		publish: () => void,
	) {
		super();
		if (scope) {
			this._register(scope);
			this._register(autorun(reader => {
				if (!scope.isResolved.read(reader)) {
					return;
				}
				scope.activeClient(clientId).read(reader);
				publish();
			}));
		}
	}
}

interface IEntry {
	readonly provider: string;
	readonly activeClientBinding: MutableDisposable<ActiveClientBinding>;
	generation: IProvisionalGeneration | undefined;
	/**
	 * Workbench-owned snapshot of session-config values for this provisional.
	 * Seeded from {@link _getInitialConfig} at create time and mutated
	 * synchronously by {@link applyConfigChange} so {@link tryRebind} can read
	 * the latest values without waiting for the agent to echo them back through
	 * `state.config.values`.
	 */
	config: Record<string, unknown>;
	/**
	 * Monotonic revision of {@link config}. Async generation creation snapshots
	 * this value, discarding and recreating its candidate after a newer edit.
	 */
	configVersion: number;
	/**
	 * Working directory the provisional backend session was created with. A
	 * created session's cwd is immutable, so when the user picks a different
	 * folder the entry is recreated; this lets a folder change no-op when the
	 * cwd is unchanged. The generation is also recreated when the secondary
	 * root set computed for this primary changes.
	 */
	workingDirectory: URI | undefined;
	/** Whether this draft was created against the complete folder set of a multi-root workspace. */
	usesWorkspaceRootSet: boolean;
	/**
	 * Latest re-resolved config (schema + values) for this provisional, set
	 * by {@link applyConfigChange} after each value change. Cleared when the
	 * entry is rebound or disposed.
	 */
	resolvedConfig?: ResolveSessionConfigResult;
	disposed: boolean;
}

export class AgentHostUntitledProvisionalSessionService extends Disposable implements IAgentHostUntitledProvisionalSessionService {
	declare readonly _serviceBrand: undefined;

	private readonly _entries = new ResourceMap<IEntry>();
	private readonly _pending = new ResourceMap<Promise<ProvisionalOperationResult>>();
	private readonly _resolvedConfigs = new ResourceMap<ResolveSessionConfigResult>();
	private readonly _resolvedConfigRequestSeq = new ResourceMap<number>();
	private readonly _pendingBackendDisposals = new ResourceSet();
	// URIs that were the source of a successful `tryRebind`. The chat widget
	// briefly reattaches to the old untitled URI before its viewModel switches
	// to the new real URI; without this tombstone the picker would call
	// `getOrCreate` again and spin up an orphan provisional session on the agent.
	private readonly _rebound = new ResourceSet();
	private readonly _sequencer = new SequencerByKey<string>();
	private readonly _onDidChange = this._register(new Emitter<URI>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@ILogService private readonly _logService: ILogService,
		@IChatService chatService: IChatService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IAgentHostNewSessionFolderService private readonly _newSessionFolderService: IAgentHostNewSessionFolderService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IAgentHostImportConversationStore private readonly _importConversationStore: IAgentHostImportConversationStore,
		@IAgentHostActiveClientService private readonly _activeClientService: IAgentHostActiveClientService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
	) {
		super();

		// Drop provisional sessions when the chat infra disposes their
		// chat-input session resource (e.g. the user closes the widget
		// without ever sending a message). Without this, untitled chats the
		// user opens and abandons leak in-memory state-manager entries on
		// the agent host.
		this._register(chatService.onDidDisposeSession(e => {
			for (const sessionResource of e.sessionResources) {
				if (this._entries.has(sessionResource)) {
					void this.disposeSession(sessionResource);
				}
				this._resolvedConfigs.delete(sessionResource);
				this._resolvedConfigRequestSeq.delete(sessionResource);
				// Drop any tombstone for the abandoned untitled URI so the
				// set doesn't grow unbounded across the workbench lifetime.
				this._rebound.delete(sessionResource);
			}
		}));

		// A session's working directory is fixed at creation time. When the user
		// picks a different folder for a not-yet-started session that already has
		// a provisional backend session (built up by config chips), recreate that
		// provisional at the new cwd so chip schemas resolve against it. The
		// service owns this reaction so concurrent chip instances don't race.
		//
		// This path is intentionally not gated to untitled drafts: it stays safe
		// for started sessions because on workspace-folder removal the folder
		// service *clears* (never reselects) the removed selection, so `getFolder`
		// returns `undefined` and this becomes a no-op — a started session keeps
		// its immutable primary. If the folder service is ever changed to reselect
		// a real resource's selection on removal, add an isUntitledChatSession
		// guard here too.
		this._register(this._newSessionFolderService.onDidChangeFolder(sessionResource => {
			const folder = this._newSessionFolderService.getFolder(sessionResource);
			if (folder && this._entries.has(sessionResource)) {
				void this._changeWorkingDirectory(sessionResource, folder);
			}
		}));
		// If workspace folders change, recompute the desired directory set. If it
		// differs from what the existing provisional was created with, dispose that
		// backend session and create a replacement provisional session with the new
		// set of directories.
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(e => {
			for (const [sessionResource, entry] of this._entries) {
				if (entry.disposed) {
					continue;
				}
				// Untitled drafts reselect removed primaries; rebound sessions retain their immutable primary.
				if (isUntitledChatSession(sessionResource) && this._primaryWasRemoved(entry, e)) {
					void this._changeWorkingDirectory(sessionResource, this._newSessionFolderService.resolveNewSessionPrimary(sessionResource));
					continue;
				}
				if (!entry.usesWorkspaceRootSet && (this._computeWorkingDirectories(entry.workingDirectory, entry.provider)?.length ?? 0) > 1) {
					entry.usesWorkspaceRootSet = true;
				}
				this._updateActiveClientScope(entry);
				if (entry.usesWorkspaceRootSet && !this._generationMatchingDesiredState(entry)) {
					void this._queue(sessionResource, () => this._reconcileGeneration(sessionResource, entry));
				}
			}
		}));
		this._register(this._agentHostService.onAgentHostStart(() => this._retryPendingBackendDisposals()));
	}

	get(sessionResource: URI): URI | undefined {
		const entry = this._entries.get(sessionResource);
		if (!entry || entry.disposed) {
			return undefined;
		}
		return this._generationMatchingDesiredState(entry)?.backendSession;
	}

	private _computeWorkingDirectories(primary: URI | undefined, provider: string): readonly URI[] | undefined {
		return computeWorkingDirectories(primary, this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri), this._agentHostService.rootState.value, provider);
	}

	private _computeEntryWorkingDirectories(entry: IEntry): readonly URI[] | undefined {
		const primary = entry.workingDirectory;
		if (!primary || !entry.usesWorkspaceRootSet || !supportsMultipleWorkingDirectories(this._agentHostService.rootState.value, entry.provider)) {
			return primary ? [primary] : undefined;
		}
		const current = entry.generation?.workingDirectories ?? [primary];
		return computeDesiredWorkingDirectories(
			primary,
			current,
			this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri),
		);
	}

	private _updateActiveClientScope(entry: IEntry): void {
		const roots = this._computeEntryWorkingDirectories(entry) ?? [];
		if (entry.activeClientBinding.value && this._activeClientService.areScopeRootsEqual(entry.activeClientBinding.value.roots, roots)) {
			return;
		}

		const scope = this._activeClientService.acquireScope(`agent-host-${entry.provider}`, roots);
		entry.activeClientBinding.value = new ActiveClientBinding(roots, scope, this._agentHostService.clientId, () => this._publishActiveClient(entry));
	}

	getInitialSessionMetadata(): Record<string, unknown> | undefined {
		const workspace = this._workspaceContextService.getWorkspace();
		if (this._environmentService.isSessionsWindow
			|| this._workspaceContextService.getWorkbenchState() !== WorkbenchState.WORKSPACE
			|| !URI.isUri(workspace.configuration)) {
			return undefined;
		}
		return withSessionMultiRootMetadata(undefined, {
			workspaceFile: workspace.configuration.toString(),
		});
	}

	getInitialSessionConfig(): Record<string, unknown> | undefined {
		return this._getInitialConfig();
	}

	async waitForPending(sessionResource: URI): Promise<URI | undefined> {
		while (true) {
			const pending = this._pending.get(sessionResource);
			if (!pending) {
				return this.get(sessionResource);
			}
			try {
				await pending;
			} catch {
				// The operation caller owns its error; observers only re-read stable state.
				return undefined;
			}
			if (this._pending.get(sessionResource) === pending) {
				return this.get(sessionResource);
			}
		}
	}

	getOrCreate(
		sessionResource: URI,
		provider: string,
		workingDirectory: URI | undefined,
	): Promise<URI | undefined> {
		const existing = this.get(sessionResource);
		if (existing) {
			return Promise.resolve(existing);
		}
		if (this._rebound.has(sessionResource)) {
			return Promise.resolve(undefined);
		}
		const inflight = this._pending.get(sessionResource);
		if (inflight) {
			return inflight.then(() => this.get(sessionResource));
		}

		const entry = this._ensureEntry(sessionResource, provider, workingDirectory);
		if (!entry) {
			return Promise.resolve(undefined);
		}
		return this._queue(sessionResource, async () => {
			const settled = this.get(sessionResource);
			if (settled) {
				return settled;
			}
			return this._reconcileGeneration(sessionResource, entry);
		});
	}

	private _ensureEntry(sessionResource: URI, provider: string, workingDirectory: URI | undefined): IEntry | undefined {
		const existing = this._entries.get(sessionResource);
		if (existing) {
			return existing;
		}
		if (this._rebound.has(sessionResource)) {
			return undefined;
		}
		const entry = this._createEntry(provider, { ...(this._getInitialConfig() ?? {}) }, 0, workingDirectory);
		this._entries.set(sessionResource, entry);
		return entry;
	}

	private _createEntry(provider: string, config: Record<string, unknown>, configVersion: number, workingDirectory: URI | undefined, resolvedConfig?: ResolveSessionConfigResult): IEntry {
		const entry: IEntry = {
			provider,
			activeClientBinding: new MutableDisposable(),
			generation: undefined,
			config,
			configVersion,
			workingDirectory,
			usesWorkspaceRootSet: (this._computeWorkingDirectories(workingDirectory, provider)?.length ?? 0) > 1,
			resolvedConfig,
			disposed: false,
		};
		this._updateActiveClientScope(entry);
		return entry;
	}

	private _publishActiveClient(entry: IEntry): void {
		if (entry.disposed || !entry.generation) {
			return;
		}
		const scope = entry.activeClientBinding.value?.scope;
		if (!scope?.isResolved.get()) {
			return;
		}
		const activeClient = scope.activeClient(this._agentHostService.clientId).get();
		if (!activeClient) {
			return;
		}
		this._agentHostService.dispatch(entry.generation.backendSession.toString(), {
			type: ActionType.SessionActiveClientSet,
			activeClient,
		});
	}

	/**
	 * Serializes lifecycle work for one logical draft and records its latest tail
	 * so external callers can wait for a stable current generation.
	 */
	private _queue<T extends ProvisionalOperationResult>(sessionResource: URI, task: () => Promise<T>): Promise<T> {
		const work = this._sequencer.queue(sessionResource.toString(), task);
		this._pending.set(sessionResource, work);
		void work.finally(() => {
			if (this._pending.get(sessionResource) === work) {
				this._pending.delete(sessionResource);
			}
		}).catch(() => { });
		return work;
	}

	private _generationMatchingDesiredState(entry: IEntry): IProvisionalGeneration | undefined {
		const generation = entry.generation;
		const desired = this._computeEntryWorkingDirectories(entry);
		return generation
			&& this._sameUri(generation.workingDirectory, entry.workingDirectory)
			&& this._sameWorkingDirectories(entry.provider, generation.workingDirectories, desired)
			? generation
			: undefined;
	}

	private _sameUri(first: URI | undefined, second: URI | undefined): boolean {
		return first === undefined || second === undefined ? first === second : isEqual(first, second);
	}

	/**
	 * Whether a draft's primary working directory was just removed from the
	 * workspace. Only folders present in `e.removed` and no longer among the
	 * current workspace folders qualify, so a standalone folder outside the
	 * workspace (never a member) is preserved, and a folder removed and re-added
	 * in the same event is not treated as gone.
	 */
	private _primaryWasRemoved(entry: IEntry, e: IWorkspaceFoldersChangeEvent): boolean {
		const primary = entry.workingDirectory;
		if (!primary || e.removed.length === 0) {
			return false;
		}
		// Provider-aware comparator so a case-distinct sibling on a case-sensitive
		// remote isn't mistaken for the removed primary (matches the folder service).
		const extUri = this._uriIdentityService.extUri;
		const stillPresent = this._workspaceContextService.getWorkspace().folders.some(folder => extUri.isEqual(folder.uri, primary));
		return !stillPresent && e.removed.some(removed => extUri.isEqual(removed.uri, primary));
	}

	/** Provider-agnostic: only an agent advertising `immutablePrimary` pins index 0. */
	private _sameWorkingDirectories(provider: string, first: readonly URI[] | undefined, second: readonly URI[] | undefined): boolean {
		return areSessionWorkingDirectoriesEqual(first, second, hasImmutablePrimaryWorkingDirectory(this._agentHostService.rootState.value, provider));
	}

	private _newProvisionalUri(provider: string): URI {
		return URI.from({ scheme: provider, path: `/${generateUuid()}` });
	}

	/**
	 * Ensures the published generation realizes the draft's current folder and config.
	 * It keeps the previous generation hidden until a valid candidate can replace it, discarding stale candidates along the way.
	 */
	private async _reconcileGeneration(sessionResource: URI, entry: IEntry): Promise<URI | undefined> {
		while (this._entries.get(sessionResource) === entry && !entry.disposed) {
			const currentGeneration = this._generationMatchingDesiredState(entry);
			if (currentGeneration) {
				return currentGeneration.backendSession;
			}

			const workingDirectory = entry.workingDirectory;
			const workingDirectories = this._computeEntryWorkingDirectories(entry);
			const configVersion = entry.configVersion;
			const config = { ...entry.config };

			// Prewarming is silent; first Send owns interactive trust, so never create in an untrusted target.
			if (!await this._isTargetFolderTrusted(workingDirectory)) {
				await this._retireGeneration(sessionResource, entry);
				return undefined;
			}

			const candidate = this._newProvisionalUri(entry.provider);
			let created: URI;
			try {
				created = await this._agentHostService.createSession({
					provider: entry.provider,
					session: candidate,
					_meta: this.getInitialSessionMetadata(),
					workingDirectories,
					config,
					progressToken: generateUuid(),
				});
			} catch (err) {
				this._logService.warn(`[AgentHostProvisional] Failed to create provisional session for ${sessionResource.toString()}: ${err instanceof Error ? err.message : String(err)}`);
				await this._disposeBackend(candidate, 'failed provisional candidate');
				await this._retireGeneration(sessionResource, entry);
				return undefined;
			}

			if (this._entries.get(sessionResource) !== entry
				|| entry.disposed
				|| entry.configVersion !== configVersion
				|| !this._sameUri(entry.workingDirectory, workingDirectory)
				|| !this._sameWorkingDirectories(entry.provider, this._computeEntryWorkingDirectories(entry), workingDirectories)) {
				await this._disposeBackend(created, 'obsolete provisional candidate');
				continue;
			}

			const previous = entry.generation;
			entry.generation = { backendSession: created, workingDirectory, workingDirectories };
			this._publishActiveClient(entry);
			this._onDidChange.fire(sessionResource);
			if (previous) {
				await this._disposeBackend(previous.backendSession, 'replaced provisional generation');
			}
			return created;
		}
		return undefined;
	}

	private async _retireGeneration(sessionResource: URI, entry: IEntry): Promise<void> {
		const generation = entry.generation;
		if (!generation) {
			return;
		}
		entry.generation = undefined;
		if (this._entries.get(sessionResource) === entry) {
			this._onDidChange.fire(sessionResource);
		}
		await this._disposeBackend(generation.backendSession, 'retired provisional generation');
	}

	private async _disposeBackend(backendSession: URI, reason: string): Promise<boolean> {
		this._pendingBackendDisposals.add(backendSession);
		try {
			await this._agentHostService.disposeSession(backendSession);
			this._pendingBackendDisposals.delete(backendSession);
			return true;
		} catch (err) {
			this._logService.warn(`[AgentHostProvisional] Failed to dispose ${reason} ${backendSession.toString()}: ${err instanceof Error ? err.message : String(err)}`);
			return false;
		}
	}

	private _retryPendingBackendDisposals(): void {
		for (const backendSession of this._pendingBackendDisposals) {
			void this._disposeBackend(backendSession, 'pending provisional cleanup');
		}
	}

	/**
	 * Whether the folder the provisional agent would run in is trusted. When a
	 * working directory is known (it may be a standalone folder outside the
	 * open workspace, e.g. a per-session folder), gate on that folder's trust;
	 * otherwise fall back to whole-workspace trust.
	 */
	private async _isTargetFolderTrusted(workingDirectory: URI | undefined): Promise<boolean> {
		if (workingDirectory) {
			const { trusted } = await this._workspaceTrustManagementService.getUriTrustInfo(workingDirectory);
			return trusted;
		}
		return this._workspaceTrustManagementService.isWorkspaceTrusted();
	}

	tryRebind(
		oldSessionResource: URI,
		newSessionResource: URI,
		provider: string,
	): Promise<URI | undefined> {
		// Graduation must run after any queued folder or config reconciliation.
		return this._queue(oldSessionResource, async () => {
			const alreadyBound = this.get(newSessionResource);
			if (alreadyBound) {
				return alreadyBound;
			}

			const oldEntry = this._entries.get(oldSessionResource);
			if (!oldEntry || oldEntry.disposed) {
				return undefined;
			}

			const newBackendSession = this._toBackendUri(newSessionResource, provider);
			// Imports materialize eagerly, so carry their history and model into the rebound session.
			const imported = this._importConversationStore.take(newSessionResource);

			while (this._entries.get(oldSessionResource) === oldEntry && !oldEntry.disposed) {
				// The workbench cache is authoritative; backend state can lag synchronous chip edits.
				const config = { ...oldEntry.config };
				const configVersion = oldEntry.configVersion;
				// The draft's own primary is authoritative: it mirrors what
				// `_computeEntryWorkingDirectories(oldEntry)` sends to the backend, so
				// the scalar and the array can't diverge. A cleared primary
				// (`undefined`, last folder removed) therefore lets the host choose
				// rather than resurrecting a folder that no longer exists.
				const targetWorkingDirectory = oldEntry.workingDirectory;
				if (!oldEntry.usesWorkspaceRootSet && (this._computeWorkingDirectories(targetWorkingDirectory, provider)?.length ?? 0) > 1) {
					oldEntry.usesWorkspaceRootSet = true;
				}
				const targetWorkingDirectories = this._computeEntryWorkingDirectories(oldEntry);
				let created: URI;
				try {
					created = await this._agentHostService.createSession({
						provider,
						session: newBackendSession,
						_meta: this.getInitialSessionMetadata(),
						workingDirectories: targetWorkingDirectories,
						config,
						...(imported ? { model: imported.model, importConversation: { turns: imported.turns, model: imported.model } } : {}),
						progressToken: generateUuid(),
					});
				} catch (err) {
					this._logService.warn(`[AgentHostProvisional] Failed to create rebound provisional: ${err instanceof Error ? err.message : String(err)}`);
					this._restoreImportedConversation(newSessionResource, imported);
					const disposed = await this._disposeBackend(newBackendSession, 'failed rebound candidate');
					if (!disposed) {
						throw new Error(`Cannot safely recover rebound session ${newBackendSession.toString()} until its candidate is retired`);
					}
					return undefined;
				}

				if (this._entries.get(oldSessionResource) !== oldEntry || oldEntry.disposed) {
					const disposed = await this._disposeBackend(created, 'retired rebound candidate');
					this._restoreImportedConversation(newSessionResource, imported);
					if (!disposed) {
						throw new Error(`Cannot safely recover rebound session ${newBackendSession.toString()} until its candidate is retired`);
					}
					return undefined;
				}
				if (oldEntry.configVersion !== configVersion
					|| !this._sameUri(oldEntry.workingDirectory, targetWorkingDirectory)
					|| !this._sameWorkingDirectories(oldEntry.provider, this._computeEntryWorkingDirectories(oldEntry), targetWorkingDirectories)) {
					const disposed = await this._disposeBackend(created, 'obsolete rebound candidate');
					if (!disposed) {
						this._restoreImportedConversation(newSessionResource, imported);
						throw new Error(`Cannot safely retry rebound session ${newBackendSession.toString()} until its stale candidate is retired`);
					}
					continue;
				}

				const oldGeneration = oldEntry.generation;
				// Publish the real mapping before retiring the untitled entry so consumers never observe a partial swap.
				const newEntry = this._createEntry(provider, config, configVersion, targetWorkingDirectory, oldEntry.resolvedConfig);
				newEntry.usesWorkspaceRootSet = oldEntry.usesWorkspaceRootSet;
				this._updateActiveClientScope(newEntry);
				newEntry.generation = { backendSession: created, workingDirectory: targetWorkingDirectory, workingDirectories: targetWorkingDirectories };
				this._entries.set(newSessionResource, newEntry);
				this._publishActiveClient(newEntry);
				this._entries.delete(oldSessionResource);
				oldEntry.disposed = true;
				oldEntry.activeClientBinding.dispose();
				this._resolvedConfigs.delete(oldSessionResource);
				this._resolvedConfigRequestSeq.delete(oldSessionResource);
				this._rebound.add(oldSessionResource);
				// Notify only the real resource; notifying the old URI can recreate an orphan while the widget still uses it.
				this._onDidChange.fire(newSessionResource);

				if (oldGeneration) {
					// The temporary generation is in-memory only, so disposal is best-effort.
					await this._disposeBackend(oldGeneration.backendSession, 'temporary provisional generation');
				}
				return created;
			}
			this._restoreImportedConversation(newSessionResource, imported);
			return undefined;
		});
	}

	private _restoreImportedConversation(sessionResource: URI, imported: IAgentHostImportConversation | undefined): void {
		if (imported) {
			this._importConversationStore.set(sessionResource, imported);
		}
	}

	/**
	 * Recreate the provisional backend session for `sessionResource` at a new
	 * working directory, preserving the user's config choices. A created
	 * session's cwd is immutable, so the only way to honor a folder change is to
	 * dispose and recreate. The replacement uses a fresh backend URI so existing
	 * subscribers acquire an authoritative snapshot for the new incarnation.
	 *
	 * `newWorkingDirectory` may be `undefined` when the workspace has no folders
	 * left (e.g. the draft's only/primary folder was removed); the provisional is
	 * then recreated with no working directory, letting the host choose — the same
	 * as a draft first created in an empty workspace.
	 */
	private _changeWorkingDirectory(sessionResource: URI, newWorkingDirectory: URI | undefined): Promise<void> {
		const entry = this._entries.get(sessionResource);
		if (!entry || entry.disposed || this._sameUri(entry.workingDirectory, newWorkingDirectory)) {
			return Promise.resolve();
		}
		entry.workingDirectory = newWorkingDirectory;
		entry.usesWorkspaceRootSet = (this._computeWorkingDirectories(newWorkingDirectory, entry.provider)?.length ?? 0) > 1;
		this._updateActiveClientScope(entry);
		entry.configVersion++;
		entry.resolvedConfig = undefined;
		const work = this._queue(sessionResource, async () => {
			if (this._entries.get(sessionResource) !== entry || entry.disposed) {
				return;
			}
			const backend = await this._reconcileGeneration(sessionResource, entry);
			if (!backend) {
				return;
			}
			// Re-resolve config against the new cwd so chip schemas refresh.
			const configVersion = entry.configVersion;
			const workingDirectory = entry.workingDirectory;
			try {
				const resolved = await this._agentHostService.resolveSessionConfig({
					provider: entry.provider,
					workingDirectory,
					config: { ...entry.config },
				});
				if (this._entries.get(sessionResource) === entry && !entry.disposed && entry.configVersion === configVersion && this._sameUri(entry.workingDirectory, workingDirectory)) {
					entry.config = { ...entry.config, ...resolved.values };
					entry.resolvedConfig = resolved;
				}
			} catch (err) {
				this._logService.warn(`[AgentHostProvisional] schema re-resolve after cwd change failed: ${err instanceof Error ? err.message : String(err)}`);
			}
			this._onDidChange.fire(sessionResource);
		});
		// Register pending work before notifying because listeners can synchronously wait or reacquire.
		this._onDidChange.fire(sessionResource);
		return work;
	}

	disposeSession(sessionResource: URI): Promise<void> {
		const entry = this._entries.get(sessionResource);
		this._resolvedConfigs.delete(sessionResource);
		this._resolvedConfigRequestSeq.delete(sessionResource);
		if (!entry) {
			return Promise.resolve();
		}
		entry.disposed = true;
		entry.activeClientBinding.dispose();
		this._entries.delete(sessionResource);
		this._onDidChange.fire(sessionResource);
		return this._queue(sessionResource, async () => {
			if (entry.generation) {
				await this._disposeBackend(entry.generation.backendSession, 'provisional generation');
				entry.generation = undefined;
			}
		});
	}

	override dispose(): void {
		// Fire-and-forget cleanup for any provisionals still tracked. Avoid
		// awaiting in `dispose()` to keep workbench teardown synchronous.
		for (const [, entry] of this._entries) {
			entry.disposed = true;
			entry.activeClientBinding.dispose();
			if (entry.generation) {
				this._agentHostService.disposeSession(entry.generation.backendSession).catch(() => { /* swallow on shutdown */ });
			}
		}
		for (const backendSession of this._pendingBackendDisposals) {
			this._agentHostService.disposeSession(backendSession).catch(() => { /* swallow on shutdown */ });
		}
		this._entries.clear();
		this._pending.clear();
		this._pendingBackendDisposals.clear();
		this._resolvedConfigs.clear();
		this._resolvedConfigRequestSeq.clear();
		this._rebound.clear();
		super.dispose();
	}

	/**
	 * Convert the chat-input UI session URI (`agent-host-PROVIDER:/<id>`)
	 * to the agent-host backend URI (`PROVIDER:/<id>`).
	 */
	private _toBackendUri(sessionResource: URI, provider: string): URI {
		const rawId = sessionResource.path.replace(/^\//, '');
		return URI.from({ scheme: provider, path: `/${rawId}` });
	}

	getResolvedConfig(sessionResource: URI): ResolveSessionConfigResult | undefined {
		return this._entries.get(sessionResource)?.resolvedConfig ?? this._resolvedConfigs.get(sessionResource);
	}

	async refreshResolvedConfig(
		sessionResource: URI,
		provider: string,
		workingDirectory: URI | undefined,
		config: Record<string, unknown> | undefined,
	): Promise<void> {
		const seq = (this._resolvedConfigRequestSeq.get(sessionResource) ?? 0) + 1;
		this._resolvedConfigRequestSeq.set(sessionResource, seq);
		try {
			const resolved = await this._agentHostService.resolveSessionConfig({
				provider,
				workingDirectory,
				config,
			});
			if (this._resolvedConfigRequestSeq.get(sessionResource) !== seq) {
				return;
			}
			const entry = this._entries.get(sessionResource);
			if (entry) {
				entry.config = { ...entry.config, ...resolved.values };
				entry.resolvedConfig = resolved;
			} else {
				this._resolvedConfigs.set(sessionResource, resolved);
			}
			this._onDidChange.fire(sessionResource);
		} catch (err) {
			this._logService.warn(`[AgentHostProvisional] schema re-resolve failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async applyConfigChange(
		sessionResource: URI,
		provider: string,
		workingDirectory: URI | undefined,
		partial: Record<string, unknown>,
	): Promise<URI | undefined> {
		const entry = this._ensureEntry(sessionResource, provider, workingDirectory);
		if (!entry) {
			return undefined;
		}
		// Fresh entries already contain defaults; apply the user's partial on top.
		// Mutate before queueing so a racing tryRebind sees the latest config.
		Object.assign(entry.config, partial);
		entry.configVersion++;
		// Keep overlay values current while schema re-resolution is pending.
		if (entry.resolvedConfig) {
			entry.resolvedConfig = {
				...entry.resolvedConfig,
				values: { ...entry.resolvedConfig.values, ...partial },
			};
		}

		// Serialize dispatch and re-resolution so racing chip changes settle in order.
		return this._queue(sessionResource, async () => {
			if (this._entries.get(sessionResource) !== entry || entry.disposed) {
				return undefined;
			}
			const backend = await this._reconcileGeneration(sessionResource, entry);
			if (!backend || this._entries.get(sessionResource) !== entry || entry.disposed) {
				return undefined;
			}
			this._agentHostService.dispatch(backend.toString(), {
				type: ActionType.SessionConfigChanged,
				config: partial,
			});
			const configVersion = entry.configVersion;
			const resolvedWorkingDirectory = entry.workingDirectory;
			try {
				const resolved = await this._agentHostService.resolveSessionConfig({
					provider,
					workingDirectory: resolvedWorkingDirectory,
					config: { ...entry.config },
				});
				const stillCurrent = this._entries.get(sessionResource);
				if (stillCurrent === entry && !entry.disposed && entry.configVersion === configVersion && this._sameUri(entry.workingDirectory, resolvedWorkingDirectory)) {
					const resolvedValues = { ...resolved.values };
					// Merge resolved values into entry.config so a later `tryRebind`
					// materializes the backend session with the validated configuration
					// the UI is displaying. Merge (not replace) so any keys the schema
					// doesn't know about survive.
					const mergedConfig = { ...entry.config, ...resolvedValues };
					const configChanged = !equals(entry.config, mergedConfig);
					const resolvedChanged = !equals(entry.resolvedConfig, resolved);
					if (configChanged || resolvedChanged) {
						entry.config = mergedConfig;
						entry.resolvedConfig = resolved;
						this._onDidChange.fire(sessionResource);
					}
				}
			} catch (err) {
				this._logService.warn(`[AgentHostProvisional] schema re-resolve failed: ${err instanceof Error ? err.message : String(err)}`);
			}
			return backend;
		});
	}

	/**
	 * Workbench-side initial config seed sent at `createSession` time so the
	 * agent's own server-side defaults don't fill `state.config.values` for
	 * keys the workbench wants to control. Without this, the merge filter in
	 * `agentHostSessionHandler` sees those agent defaults as "user-set" and
	 * drops the workbench defaults.
	 *
	 * - `isolation`: workbench has no isolation picker, so always `'folder'`.
	 * - `mode` / `autoApprove`: seeded from the single
	 *   `chat.defaultConfiguration` object setting (`mode` and
	 *   `approvals` properties). The approval seed is clamped to `'default'`
	 *   when the `chat.tools.global.autoApprove` policy is off. The local-only
	 *   `chat.permissions.default` setting is NOT used.
	 *
	 * Skipped entirely in the Agents window, where the sessions provider
	 * supplies config via `request.agentHostSessionConfig` instead.
	 */
	private _getInitialConfig(): Record<string, unknown> | undefined {
		if (this._environmentService.isSessionsWindow) {
			return undefined;
		}
		const config: Record<string, unknown> = { [SessionConfigKey.Isolation]: 'folder' };

		const configuredDefaults = this._configurationService.getValue<IChatDefaultConfiguration>(ChatConfiguration.DefaultConfiguration);
		const policyValue = this._configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue;

		const configuredApprovals = getChatPermissionLevelFromDefaultConfiguration(configuredDefaults?.approvals);
		if (configuredApprovals) {
			const policyRestricted = policyValue === false;
			// Bypass and (legacy) Autopilot auto-approve at least some tool
			// calls, so clamp anything but Default under policy.
			config[SessionConfigKey.AutoApprove] = policyRestricted && configuredApprovals !== 'default' ? 'default' : configuredApprovals;
		}

		const configuredMode = configuredDefaults?.mode;
		if (typeof configuredMode === 'string' && KNOWN_MODE_VALUES.has(configuredMode)) {
			config[SessionConfigKey.Mode] = configuredMode;
		}

		return migrateLegacyAutopilotConfig(config);
	}
}

registerSingleton(
	IAgentHostUntitledProvisionalSessionService,
	AgentHostUntitledProvisionalSessionService,
	InstantiationType.Delayed,
);
