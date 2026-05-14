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
 * - backend resource: `PROVIDER:/untitled-<uuid>` for the provisional state.
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
 * 3. `tryRebind` snapshots `state.config.values` from the untitled backend
 *    provisional, creates a new provisional for the real backend resource with
 *    that config, swaps `_entries`, fires `onDidChange` for both resources,
 *    then best-effort disposes the untitled backend provisional.
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
 * - `tryRebind` is best-effort. Failure must degrade to the handler's normal
 *   create path rather than blocking Send.
 * - Abandoned untitled chats must dispose their backend provisional state when
 *   `IChatService.onDidDisposeSession` reports the chat UI resource.
 * - Callers own provider and working-directory consistency. Derive them from
 *   the chat resource/session type and active workspace in the same way on
 *   create and rebind.
 */

import { SequencerByKey } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { KNOWN_AUTO_APPROVE_VALUES, SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatService } from '../../../common/chatService/chatService.js';

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
	 * Bridge the untitled chat UI resource to the real chat UI resource created
	 * for first Send. Must copy `state.config.values` from the old backend
	 * provisional into the new backend provisional before the handler invokes the
	 * agent. No-op when no old mapping exists; idempotent when the new mapping is
	 * already present.
	 */
	tryRebind(
		oldSessionResource: URI,
		newSessionResource: URI,
		provider: string,
		workingDirectory: URI | undefined,
	): Promise<URI | undefined>;

	/**
	 * Dispose and forget the backend provisional mapped from `sessionResource`.
	 * Safe after a successful rebind because the old mapping is already gone.
	 */
	disposeSession(sessionResource: URI): Promise<void>;
}

interface IEntry {
	readonly backendSession: URI;
}

class AgentHostUntitledProvisionalSessionService extends Disposable implements IAgentHostUntitledProvisionalSessionService {
	declare readonly _serviceBrand: undefined;

	private readonly _entries = new ResourceMap<IEntry>();
	private readonly _pending = new ResourceMap<Promise<URI | undefined>>();
	private readonly _sequencer = new SequencerByKey<string>();
	private readonly _onDidChange = this._register(new Emitter<URI>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@ILogService private readonly _logService: ILogService,
		@IChatService chatService: IChatService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
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
			}
		}));
	}

	get(sessionResource: URI): URI | undefined {
		return this._entries.get(sessionResource)?.backendSession;
	}

	async waitForPending(sessionResource: URI): Promise<URI | undefined> {
		const inflight = this._pending.get(sessionResource);
		if (inflight) {
			await inflight;
		}
		return this.get(sessionResource);
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
		const inflight = this._pending.get(sessionResource);
		if (inflight) {
			return inflight;
		}

		const work = this._sequencer.queue(sessionResource.toString(), async () => {
			// Re-check inside the sequencer — another caller may have raced
			// us and populated the entry while we were queued.
			const settled = this.get(sessionResource);
			if (settled) {
				return settled;
			}
			const backendSession = this._toBackendUri(sessionResource, provider);
			try {
				const created = await this._agentHostService.createSession({
					provider,
					session: backendSession,
					workingDirectory,
					config: this._getInitialConfig(),
				});
				this._entries.set(sessionResource, { backendSession: created });
				this._onDidChange.fire(sessionResource);
				return created;
			} catch (err) {
				this._logService.warn(`[AgentHostProvisional] Failed to create provisional session for ${sessionResource.toString()}: ${err instanceof Error ? err.message : String(err)}`);
				return undefined;
			}
		});
		this._pending.set(sessionResource, work);
		work.finally(() => {
			if (this._pending.get(sessionResource) === work) {
				this._pending.delete(sessionResource);
			}
		});
		return work;
	}

	async tryRebind(
		oldSessionResource: URI,
		newSessionResource: URI,
		provider: string,
		workingDirectory: URI | undefined,
	): Promise<URI | undefined> {
		// If the new resource already has a provisional (e.g. tryRebind was
		// called twice), short-circuit.
		const alreadyBound = this.get(newSessionResource);
		if (alreadyBound) {
			return alreadyBound;
		}

		// Make sure any in-flight create for the old resource settles before
		// we read its state — otherwise we may not see the user's most
		// recent dispatch.
		await this.waitForPending(oldSessionResource);

		const oldEntry = this._entries.get(oldSessionResource);
		if (!oldEntry) {
			return undefined;
		}

		// Snapshot the current values so they ride into the new provisional.
		const values = this._readCurrentValues(oldEntry.backendSession);
		const newBackendSession = this._toBackendUri(newSessionResource, provider);

		let created: URI;
		try {
			created = await this._agentHostService.createSession({
				provider,
				session: newBackendSession,
				workingDirectory,
				config: values,
			});
		} catch (err) {
			this._logService.warn(`[AgentHostProvisional] Failed to create rebound provisional: ${err instanceof Error ? err.message : String(err)}`);
			return undefined;
		}

		// Atomically swap entries: insert the new entry, drop the old one.
		// Order matters — the old entry's `dispose` below must not race with
		// the picker's `onDidChange` re-render reading the new entry.
		this._entries.set(newSessionResource, { backendSession: created });
		this._entries.delete(oldSessionResource);
		this._onDidChange.fire(newSessionResource);
		this._onDidChange.fire(oldSessionResource);

		// Dispose the temporary provisional. Best-effort; the agent treats
		// it as an in-memory drop (no SDK/worktree to tear down).
		this._agentHostService.disposeSession(oldEntry.backendSession).catch(err => {
			this._logService.warn(`[AgentHostProvisional] Failed to dispose temporary provisional ${oldEntry.backendSession.toString()}: ${err instanceof Error ? err.message : String(err)}`);
		});

		return created;
	}

	async disposeSession(sessionResource: URI): Promise<void> {
		await this.waitForPending(sessionResource);
		const entry = this._entries.get(sessionResource);
		if (!entry) {
			return;
		}
		this._entries.delete(sessionResource);
		this._onDidChange.fire(sessionResource);
		try {
			await this._agentHostService.disposeSession(entry.backendSession);
		} catch (err) {
			this._logService.warn(`[AgentHostProvisional] Failed to dispose provisional ${entry.backendSession.toString()}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	override dispose(): void {
		// Fire-and-forget cleanup for any provisionals still tracked. Avoid
		// awaiting in `dispose()` to keep workbench teardown synchronous.
		for (const [, entry] of this._entries) {
			this._agentHostService.disposeSession(entry.backendSession).catch(() => { /* swallow on shutdown */ });
		}
		this._entries.clear();
		this._pending.clear();
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

	private _readCurrentValues(backendSession: URI): Record<string, unknown> | undefined {
		const sub = this._agentHostService.getSubscriptionUnmanaged(StateComponents.Session, backendSession);
		const state = sub?.value;
		if (!state || state instanceof Error) {
			return undefined;
		}
		return state.config?.values;
	}

	/**
	 * Workbench-side initial config seed sent at `createSession` time so the
	 * agent's own server-side defaults don't fill `state.config.values` for
	 * keys the workbench wants to control. Without this, the merge filter in
	 * `agentHostSessionHandler` sees those agent defaults as "user-set" and
	 * drops the workbench defaults.
	 *
	 * - `isolation`: workbench has no isolation picker, so always `'folder'`.
	 * - `autoApprove`: seeded from `chat.permissions.default`, clamped to
	 *   `'default'` when the `chat.tools.global.autoApprove` policy is off.
	 *
	 * Skipped entirely in the Agents window, where the sessions provider
	 * supplies config via `request.agentHostSessionConfig` instead.
	 */
	private _getInitialConfig(): Record<string, unknown> | undefined {
		if (this._environmentService.isSessionsWindow) {
			return undefined;
		}
		const config: Record<string, unknown> = { [SessionConfigKey.Isolation]: 'folder' };
		const configured = this._configurationService.getValue<string>(ChatConfiguration.DefaultPermissionLevel);
		if (typeof configured === 'string' && KNOWN_AUTO_APPROVE_VALUES.has(configured)) {
			const policyRestricted = this._configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
			config[SessionConfigKey.AutoApprove] = policyRestricted ? 'default' : configured;
		}
		return config;
	}
}

registerSingleton(
	IAgentHostUntitledProvisionalSessionService,
	AgentHostUntitledProvisionalSessionService,
	InstantiationType.Delayed,
);
