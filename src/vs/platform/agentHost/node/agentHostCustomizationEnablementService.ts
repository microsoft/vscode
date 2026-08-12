/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, MutableDisposable, type IReference } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession } from '../common/agentService.js';
import { ISessionDataService, type ISessionDatabase } from '../common/sessionDataService.js';
import { DEFAULT_CUSTOMIZATION_ENABLED, isCustomizationEnabled, sortCustomizationEnablement, withCustomizationEnablement } from '../common/customizationEnablement.js';
import { isAhpChatChannel, parseRequiredSessionUriFromChatUri, readSessionWorkspaceless } from '../common/state/sessionState.js';
import { ActionType } from '../common/state/protocol/common/actions.js';
import { CustomizationEnablementKind, CustomizationType, type CustomizationEnablement } from '../common/state/protocol/channels-session/state.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';
import { getEffectiveWorkingDirectories } from './agentConfigurationService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import type { IAgentHostWorktreeIsolation } from './shared/worktreeIsolation.js';

const STORAGE_KEY = 'customizationEnablement';
const LRU_STORAGE_KEY = 'customizationEnablementLru';
const SESSION_METADATA_KEY = 'customizationEnablement';
/** Bounds orphaned durable decisions, whose source-derived keys become unreachable when their plugin disappears. */
const MAX_PERSISTED_DECISIONS = 512;

interface IPersistedEnablement {
	readonly global?: Record<string, boolean>;
	readonly workingDirectories?: Record<string, Record<string, boolean>>;
}


interface ILruEntry {
	readonly scope: 'global' | 'workspace';
	readonly key: string;
	readonly workingDirectory?: string;
}

interface IFullEnablementReplacement {
	readonly replacementKind: 'full';
	readonly enablement: readonly CustomizationEnablement[];
}

interface IScopedEnablementReplacement {
	readonly replacementKind: 'scoped';
	readonly scope: CustomizationEnablementKind;
	readonly enabled: boolean;
}

type EnablementReplacement = IFullEnablementReplacement | IScopedEnablementReplacement;

interface IPendingReplacement {
	readonly target: ICustomizationEnablementTarget;
	readonly enablement?: readonly CustomizationEnablement[];
	readonly scopedReplacements: readonly IScopedEnablementReplacement[];
}

export interface ICustomizationEnablementTarget {
	readonly id: string;
	readonly type: CustomizationType;
	readonly name: string;
	readonly source: URI;
	readonly owningPluginSource?: URI;
	/**
	 * Whether the client supplied this customization and therefore owns its global decision.
	 */
	readonly isClientBundled?: boolean;
}

/**
 * `pending` means the directory is not registered yet; `workspaceless` explicitly means there is none.
 * Keeping them distinct prevents workspace decisions from being silently discarded while registration is pending.
 */
export type WorkingDirectoryState =
	| { readonly kind: 'directory'; readonly uri: URI }
	| { readonly kind: 'workspaceless' }
	| { readonly kind: 'pending' };

export type CustomizationEnablementResolution =
	| {
		readonly kind: 'resolved';
		readonly enablement: readonly CustomizationEnablement[];
		readonly enabled: boolean;
		readonly workingDirectory: Exclude<WorkingDirectoryState, { kind: 'pending' }>;
	}
	| { readonly kind: 'pending'; readonly reason: 'session' | 'workingDirectory' };

export interface ICustomizationEnablementChangeEvent {
	readonly sessions: readonly string[];
}

export const IAgentHostCustomizationEnablementService = createDecorator<IAgentHostCustomizationEnablementService>('agentHostCustomizationEnablementService');

export interface IAgentHostCustomizationEnablementService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<ICustomizationEnablementChangeEvent>;
	initializeSession(session: string): Promise<void>;
	getWorkingDirectoryState(session: string): WorkingDirectoryState;
	resolve(session: string, target: ICustomizationEnablementTarget): CustomizationEnablementResolution;
	applyClientGlobalEnablement(session: string, target: ICustomizationEnablementTarget, enablement: readonly CustomizationEnablement[]): CustomizationEnablementResolution;
	replaceEnablement(session: string, target: ICustomizationEnablementTarget, enablement: readonly CustomizationEnablement[]): CustomizationEnablementResolution;
	setEnablement(session: string, target: ICustomizationEnablementTarget, kind: CustomizationEnablementKind, enabled: boolean): CustomizationEnablementResolution;
	whenIdle(): Promise<void>;
}

/**
 * Returns the scope-appropriate identity for a customization decision.
 *
 * Session decisions use a customization id because it need only be stable within that session; durable decisions use stable source-derived identities because plugin child ids contain materialized paths and content hashes.
 */
export function getCustomizationEnablementKey(target: ICustomizationEnablementTarget, kind: CustomizationEnablementKind): string {
	if (kind === CustomizationEnablementKind.Session) {
		return target.id;
	}

	switch (target.type) {
		case CustomizationType.Plugin:
			return target.source.toString();
		case CustomizationType.McpServer:
			return target.owningPluginSource
				? `${target.owningPluginSource.toString()}#mcp=${target.name}`
				: `mcpServers#${target.name}`;
		default:
			throw new Error(`Enablement is only supported for plugins and MCP servers, not ${target.type}`);
	}
}

export function targetForUnownedMcpServer(name: string): ICustomizationEnablementTarget {
	return {
		id: `mcpServers#${name}`,
		type: CustomizationType.McpServer,
		name,
		source: URI.parse(`mcpServers#${name}`),
	};
}

/**
 * Owns host global, workspace, and session decisions, resolving them over a client global base.
 *
 * Global and workspace decisions use host JSON storage; session decisions remain in that session's database across restarts.
 */
export class AgentHostCustomizationEnablementService extends Disposable implements IAgentHostCustomizationEnablementService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<ICustomizationEnablementChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	private _persistent: IPersistedEnablement;
	private _lru: ILruEntry[];
	private readonly _clientGlobalEnablement = new Map<string, Map<string, boolean>>();
	/**
	 * Loaded once and authoritative for synchronous resolution, which runs while customizations are published.
	 * An async read here could mistake an unavailable result for an absent decision.
	 */
	private readonly _sessionEnablement = new Map<string, Map<string, boolean>>();
	private readonly _sessionLoads = new Map<string, Promise<void>>();
	private readonly _sessionsById = new Map<string, string>();
	private readonly _pendingSessionWrites = new Set<Promise<void>>();
	/**
	 * Retains writes made before session metadata or directory registration resolves.
	 * Replayed after either session load or a working-directory event, while resolution reports `pending` rather than no decision.
	 */
	private readonly _pendingReplacements = new Map<string, IPendingReplacement>();
	private _worktree: IAgentHostWorktreeIsolation | undefined;
	private readonly _worktreePendingListener = this._register(new MutableDisposable());

	constructor(
		@IAgentHostStorageService private readonly _storageService: IAgentHostStorageService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostStateManager private readonly _sessionState: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._persistent = this._readPersistentEnablement();
		this._lru = this._readLru();
		this._reconcileLru();
		this._register(this._sessionState.onDidEmitEnvelope(envelope => {
			const session = isAhpChatChannel(envelope.channel)
				? parseRequiredSessionUriFromChatUri(envelope.channel)
				: this._sessionState.getSessionSummary(envelope.channel) ? envelope.channel : undefined;
			if (session !== undefined) {
				this._sessionsById.set(AgentSession.id(session), session);
				void this.initializeSession(session);
				if (envelope.action.type === ActionType.SessionWorkingDirectorySet || envelope.action.type === ActionType.SessionWorkingDirectoryRemoved) {
					const affectedSessions = this._applyPendingReplacements(session);
					affectedSessions.add(session);
					this._notifyDecisionChanged(affectedSessions);
				}
			}
		}));
	}

	/** Bound after AgentService construction because WorktreeIsolation depends on ICopilotApiService and AgentService's endpoint service. */
	setWorktreeIsolation(worktree: IAgentHostWorktreeIsolation): void {
		this._worktree = worktree;
		const onDidChangeWorkingDirectoryPending = worktree.onDidChangeWorkingDirectoryPending;
		this._worktreePendingListener.value = onDidChangeWorkingDirectoryPending?.(sessionId => {
			const session = this._sessionsById.get(sessionId);
			if (session === undefined) {
				// A worktree can become pending before this service initializes its
				// session. It cannot have produced a resolution yet; initialization
				// reads the current pending state, and any later clear is observed.
				return;
			}
			this._notifyDecisionChanged([session]);
		});
	}

	async initializeSession(session: string): Promise<void> {
		const existing = this._sessionLoads.get(session);
		if (existing) {
			return existing;
		}

		this._sessionsById.set(AgentSession.id(session), session);
		const load = this._loadSessionEnablement(session);
		this._sessionLoads.set(session, load);
		return load;
	}

	getWorkingDirectoryState(session: string): WorkingDirectoryState {
		const summary = this._sessionState.getSessionSummary(session);
		if (readSessionWorkspaceless(summary?._meta)) {
			return { kind: 'workspaceless' };
		}
		if (this._worktree?.isWorkingDirectoryPending(AgentSession.id(session))) {
			return { kind: 'pending' };
		}
		const directory = getEffectiveWorkingDirectories(this._sessionState, session)?.[0];
		if (directory === undefined) {
			return { kind: 'pending' };
		}
		return { kind: 'directory', uri: URI.parse(directory) };
	}

	resolve(session: string, target: ICustomizationEnablementTarget): CustomizationEnablementResolution {
		const sessionEnablement = this._sessionEnablement.get(session);
		if (sessionEnablement === undefined) {
			return { kind: 'pending', reason: 'session' };
		}

		const workingDirectory = this.getWorkingDirectoryState(session);
		if (workingDirectory.kind === 'pending') {
			return { kind: 'pending', reason: 'workingDirectory' };
		}

		const persistentKey = this._persistentKey(target);
		const decisions: CustomizationEnablement[] = [];
		const sessionDecision = sessionEnablement.get(this._sessionKey(target));
		if (sessionDecision !== undefined) {
			decisions.push({ kind: CustomizationEnablementKind.Session, enabled: sessionDecision });
		}
		if (workingDirectory.kind === 'directory') {
			const workspaceDecision = this._persistent.workingDirectories?.[workingDirectory.uri.toString()]?.[persistentKey];
			if (workspaceDecision !== undefined) {
				decisions.push({ kind: CustomizationEnablementKind.Workspace, uri: workingDirectory.uri.toString(), enabled: workspaceDecision });
			}
		}
		const globalDecision = this._persistent.global?.[persistentKey];
		if (globalDecision !== undefined) {
			decisions.push({ kind: CustomizationEnablementKind.Global, enabled: globalDecision });
		} else {
			const clientGlobalDecision = this._clientGlobalEnablement.get(session)?.get(persistentKey);
			if (clientGlobalDecision !== undefined) {
				decisions.push({ kind: CustomizationEnablementKind.Global, enabled: clientGlobalDecision });
			}
		}

		const enablement = sortCustomizationEnablement(decisions);
		return {
			kind: 'resolved',
			enablement,
			enabled: isCustomizationEnabled({ enablement }),
			workingDirectory,
		};
	}

	applyClientGlobalEnablement(session: string, target: ICustomizationEnablementTarget, enablement: readonly CustomizationEnablement[]): CustomizationEnablementResolution {
		const global = enablement.find(entry => entry.kind === CustomizationEnablementKind.Global);
		if (global === undefined) {
			throw new Error(`Client customization ${target.source.toString()} is missing its required global enablement entry`);
		}

		if (!target.isClientBundled) {
			return this.resolve(session, target);
		}
		this._setClientGlobal(session, target, global.enabled);
		return this.resolve(session, target);
	}

	setEnablement(session: string, target: ICustomizationEnablementTarget, kind: CustomizationEnablementKind, enabled: boolean): CustomizationEnablementResolution {
		const before = this._captureDecisionSnapshot(session, target);
		const resolution = this._replaceEnablement(session, target, { replacementKind: 'scoped', scope: kind, enabled });
		this._notifyDecisionChanged(this._getAffectedSessions(session, target, before));
		return resolution;
	}

	replaceEnablement(session: string, target: ICustomizationEnablementTarget, enablement: readonly CustomizationEnablement[]): CustomizationEnablementResolution {
		const before = this._captureDecisionSnapshot(session, target);
		const resolution = this._replaceEnablement(session, target, { replacementKind: 'full', enablement });
		this._notifyDecisionChanged(this._getAffectedSessions(session, target, before));
		return resolution;
	}

	private _replaceEnablement(session: string, target: ICustomizationEnablementTarget, replacement: EnablementReplacement): CustomizationEnablementResolution {
		const resolution = this.resolve(session, target);
		if (resolution.kind === 'pending') {
			if (replacement.replacementKind === 'full') {
				this._setGlobal(session, target, this._getGlobalReplacement(replacement.enablement));
				this._queueReplacement(session, target, replacement);
			} else if (replacement.scope === CustomizationEnablementKind.Global) {
				this._setGlobal(session, target, replacement.enabled);
				if (this._pendingReplacements.has(`${session}\u0000${this._persistentKey(target)}`)) {
					this._queueReplacement(session, target, replacement);
				}
			} else {
				this._queueReplacement(session, target, replacement);
			}
			return resolution;
		}

		const enablement = this._replacementEnablement(resolution.enablement, resolution.workingDirectory, replacement);
		this._applyReplacement(session, target, enablement, resolution.workingDirectory);
		return this.resolve(session, target);
	}

	private _applyPendingReplacements(session: string): Set<string> {
		const affectedSessions = new Set<string>();
		for (const [key, replacement] of this._pendingReplacements) {
			if (!key.startsWith(`${session}\u0000`)) {
				continue;
			}
			const resolution = this.resolve(session, replacement.target);
			if (resolution.kind === 'pending') {
				continue;
			}
			let enablement = replacement.enablement ?? resolution.enablement;
			for (const scopedReplacement of replacement.scopedReplacements) {
				enablement = this._replacementEnablement(enablement, resolution.workingDirectory, scopedReplacement);
			}
			const before = this._captureDecisionSnapshot(session, replacement.target);
			this._applyReplacement(session, replacement.target, enablement, resolution.workingDirectory);
			for (const affectedSession of this._getAffectedSessions(session, replacement.target, before)) {
				affectedSessions.add(affectedSession);
			}
			this._pendingReplacements.delete(key);
		}
		return affectedSessions;
	}

	private _queueReplacement(session: string, target: ICustomizationEnablementTarget, replacement: EnablementReplacement): void {
		const key = `${session}\u0000${this._persistentKey(target)}`;
		const existing = this._pendingReplacements.get(key);
		if (replacement.replacementKind === 'full') {
			this._pendingReplacements.set(key, { target, enablement: replacement.enablement, scopedReplacements: [] });
			return;
		}
		const scopedReplacements = [
			...(existing?.scopedReplacements.filter(entry => entry.scope !== replacement.scope) ?? []),
			replacement,
		];
		this._pendingReplacements.set(key, {
			target,
			...(existing?.enablement ? { enablement: existing.enablement } : {}),
			scopedReplacements,
		});
	}

	private _replacementEnablement(current: readonly CustomizationEnablement[], workingDirectory: Exclude<WorkingDirectoryState, { kind: 'pending' }>, replacement: EnablementReplacement): CustomizationEnablement[] {
		if (replacement.replacementKind === 'full') {
			return [...replacement.enablement];
		}
		return withCustomizationEnablement(current, replacement.scope, this._enablementEntry(replacement, workingDirectory));
	}

	private _enablementEntry(replacement: IScopedEnablementReplacement, workingDirectory: Exclude<WorkingDirectoryState, { kind: 'pending' }>): CustomizationEnablement {
		switch (replacement.scope) {
			case CustomizationEnablementKind.Global:
				return { kind: CustomizationEnablementKind.Global, enabled: replacement.enabled };
			case CustomizationEnablementKind.Workspace:
				if (workingDirectory.kind !== 'directory') {
					throw new Error('Cannot record workspace enablement for a workspace-less session');
				}
				return { kind: CustomizationEnablementKind.Workspace, uri: workingDirectory.uri.toString(), enabled: replacement.enabled };
			case CustomizationEnablementKind.Session:
				return { kind: CustomizationEnablementKind.Session, enabled: replacement.enabled };
			default: {
				const exhaustiveKind: never = replacement.scope;
				throw new Error(`Unknown customization enablement kind: ${exhaustiveKind}`);
			}
		}
	}

	private _applyReplacement(session: string, target: ICustomizationEnablementTarget, enablement: readonly CustomizationEnablement[], workingDirectory: Exclude<WorkingDirectoryState, { kind: 'pending' }>): void {
		// Update global first so workspace and session inheritance see the new value.
		this._setGlobal(session, target, this._getGlobalReplacement(enablement));
		this._replaceNonGlobalEnablement(session, target, enablement, workingDirectory);
	}

	private _getGlobalReplacement(enablement: readonly CustomizationEnablement[]): boolean | undefined {
		return enablement.find(entry => entry.kind === CustomizationEnablementKind.Global)?.enabled;
	}

	private _replaceNonGlobalEnablement(session: string, target: ICustomizationEnablementTarget, enablement: readonly CustomizationEnablement[], workingDirectory: Exclude<WorkingDirectoryState, { kind: 'pending' }>): void {
		const byKind = new Map(enablement.map(entry => [entry.kind, entry]));
		// A scope absent from the incoming list is CLEARED; replacement is never a patch.
		if (workingDirectory.kind === 'directory') {
			this._setWorkspace(session, target, workingDirectory.uri, byKind.get(CustomizationEnablementKind.Workspace)?.enabled);
		}
		this._setSession(session, target, workingDirectory, byKind.get(CustomizationEnablementKind.Session)?.enabled);
	}


	async whenIdle(): Promise<void> {
		await this._storageService.whenIdle();
		// A settled write removes itself and does not queue another write, so each
		// loop pass strictly reduces this set to any writes queued concurrently.
		while (this._pendingSessionWrites.size > 0) {
			await Promise.allSettled([...this._pendingSessionWrites]);
		}
	}

	private async _loadSessionEnablement(session: string): Promise<void> {
		const transitioned = !this._sessionEnablement.has(session);
		let reference: IReference<ISessionDatabase> | undefined;
		try {
			reference = this._sessionDataService.openDatabase(URI.parse(session));
			const raw = await reference.object.getMetadata(SESSION_METADATA_KEY);
			this._sessionEnablement.set(session, this._parseSessionEnablement(raw));
		} catch (err) {
			this._logService.warn(`[AgentHostCustomizationEnablementService] Failed to read session enablement for ${session}`, err);
			this._sessionEnablement.set(session, new Map());
		} finally {
			reference?.dispose();
		}
		if (transitioned) {
			const affectedSessions = this._applyPendingReplacements(session);
			affectedSessions.add(session);
			this._notifyDecisionChanged(affectedSessions);
		}
	}

	private _setGlobal(session: string, target: ICustomizationEnablementTarget, enabled: boolean | undefined): void {
		this._setGlobalEnablement(session, target, enabled, true);
	}

	private _setClientGlobal(session: string, target: ICustomizationEnablementTarget, enabled: boolean): void {
		const key = this._persistentKey(target);
		let decisions = this._clientGlobalEnablement.get(session);
		if (decisions === undefined) {
			decisions = new Map();
			this._clientGlobalEnablement.set(session, decisions);
		}
		decisions.set(key, enabled);
	}

	private _setGlobalEnablement(session: string, target: ICustomizationEnablementTarget, enabled: boolean | undefined, removeRedundantWorkspaceDecisions: boolean): void {
		const key = this._persistentKey(target);
		const global = this._persistent.global ?? {};
		this._setPersistentDecision('global', global, key, enabled, this._clientGlobalEnablement.get(session)?.get(key) ?? DEFAULT_CUSTOMIZATION_ENABLED);
		this._persistent = { ...this._persistent, global };
		if (removeRedundantWorkspaceDecisions && global[key] !== undefined) {
			this._removeRedundantWorkspaceDecisions(key);
		}
		this._persist();
	}

	/**
	 * `undefined` clears a scope, and a decision matching its inherited value is cleared too.
	 * This lets the UI restore inheritance without a third 'Inherit' action.
	 */
	private _setPersistentDecision(scope: ILruEntry['scope'], decisions: Record<string, boolean>, key: string, enabled: boolean | undefined, inherited: boolean, workingDirectory?: string): void {
		if (enabled === undefined || enabled === inherited) {
			delete decisions[key];
			this._removeLru(scope, key, workingDirectory);
		} else {
			decisions[key] = enabled;
			this._touchLru({ scope, key, ...(workingDirectory === undefined ? {} : { workingDirectory }) });
		}
	}

	private _persistentKey(target: ICustomizationEnablementTarget): string {
		return getCustomizationEnablementKey(target, CustomizationEnablementKind.Global);
	}

	private _sessionKey(target: ICustomizationEnablementTarget): string {
		return getCustomizationEnablementKey(target, CustomizationEnablementKind.Session);
	}

	private _workspaceInheritedEnablement(session: string, target: ICustomizationEnablementTarget, workingDirectory: URI): boolean {
		return this._persistent.workingDirectories?.[workingDirectory.toString()]?.[this._persistentKey(target)] ?? this._globalEnablement(session, target);
	}

	private _globalEnablement(session: string, target: ICustomizationEnablementTarget): boolean {
		const key = this._persistentKey(target);
		return this._persistent.global?.[key] ?? this._clientGlobalEnablement.get(session)?.get(key) ?? DEFAULT_CUSTOMIZATION_ENABLED;
	}

	private _setWorkspace(session: string, target: ICustomizationEnablementTarget, workingDirectory: URI, enabled: boolean | undefined): void {
		const key = this._persistentKey(target);
		const directoryKey = workingDirectory.toString();
		const workingDirectories = this._persistent.workingDirectories ?? {};
		const workspace = workingDirectories[directoryKey] ?? {};
		this._setPersistentDecision('workspace', workspace, key, enabled, this._globalEnablement(session, target), directoryKey);
		workingDirectories[directoryKey] = workspace;
		this._persistent = { ...this._persistent, workingDirectories };
		this._persist();
	}

	/** Needs the working-directory state to calculate the lower-scope inherited value before clearing. */
	private _setSession(session: string, target: ICustomizationEnablementTarget, workingDirectory: Exclude<WorkingDirectoryState, { kind: 'pending' }>, enabled: boolean | undefined): void {
		const enablement = this._sessionEnablement.get(session);
		if (enablement === undefined) {
			throw new Error(`Session enablement has not been initialized: ${session}`);
		}

		const inherited = workingDirectory.kind === 'directory'
			? this._workspaceInheritedEnablement(session, target, workingDirectory.uri)
			: this._globalEnablement(session, target);
		const sessionKey = this._sessionKey(target);
		if (enabled === undefined || enabled === inherited) {
			enablement.delete(sessionKey);
		} else {
			enablement.set(sessionKey, enabled);
		}
		this._persistSession(session, enablement);
	}

	private _persistSession(session: string, enablement: ReadonlyMap<string, boolean>): void {
		const reference = this._sessionDataService.openDatabase(URI.parse(session));
		const write = reference.object.setMetadata(SESSION_METADATA_KEY, JSON.stringify(Object.fromEntries(enablement))).catch(err => {
			this._logService.error(`[AgentHostCustomizationEnablementService] Failed to write session enablement for ${session}`, err);
		}).finally(() => reference.dispose());
		this._pendingSessionWrites.add(write);
		const untrack = () => this._pendingSessionWrites.delete(write);
		write.then(untrack, untrack);
	}

	/** Prunes matching workspace decisions in every stored directory, preserving only overrides that beat the new global value. */
	private _removeRedundantWorkspaceDecisions(key: string): void {
		const inherited = this._persistent.global?.[key];
		if (inherited === undefined) {
			return;
		}
		for (const [directory, values] of Object.entries(this._persistent.workingDirectories ?? {})) {
			if (values[key] === inherited) {
				delete values[key];
				this._removeLru('workspace', key, directory);
			}
		}
	}

	private _persist(): void {
		this._evictLru();
		const global = this._persistent.global && Object.keys(this._persistent.global).length > 0 ? this._persistent.global : undefined;
		const workingDirectories = Object.fromEntries(Object.entries(this._persistent.workingDirectories ?? {}).filter(([, values]) => Object.keys(values).length > 0));
		this._persistent = {
			...(global ? { global } : {}),
			...(Object.keys(workingDirectories).length > 0 ? { workingDirectories } : {}),
		};
		if (Object.keys(this._persistent).length === 0) {
			this._storageService.delete(STORAGE_KEY);
		} else {
			this._storageService.set(STORAGE_KEY, this._persistent);
		}
		if (this._lru.length === 0) {
			this._storageService.delete(LRU_STORAGE_KEY);
		} else {
			this._storageService.set(LRU_STORAGE_KEY, this._lru);
		}
	}

	private _touchLru(entry: ILruEntry): void {
		this._removeLru(entry.scope, entry.key, entry.workingDirectory);
		// Recency is deliberately updated only on writes, not reads, to keep
		// persistence cheap and deterministic across restarts.
		this._lru.push(entry);
	}

	private _removeLru(scope: ILruEntry['scope'], key: string, workingDirectory?: string): void {
		this._lru = this._lru.filter(entry => entry.scope !== scope || entry.key !== key || entry.workingDirectory !== workingDirectory);
	}

	private _evictLru(): void {
		while (this._lru.length > MAX_PERSISTED_DECISIONS) {
			const entry = this._lru.shift()!;
			if (entry.scope === 'global') {
				delete this._persistent.global?.[entry.key];
			} else if (entry.workingDirectory !== undefined) {
				delete this._persistent.workingDirectories?.[entry.workingDirectory]?.[entry.key];
			}
		}
	}

	private _readPersistentEnablement(): IPersistedEnablement {
		const value = this._storageService.get<unknown>(STORAGE_KEY);
		if (!isRecord(value)) {
			return {};
		}
		const global = readBooleanRecord(value['global']);
		const workingDirectories = isRecord(value['workingDirectories'])
			? Object.fromEntries(Object.entries(value['workingDirectories']).map(([directory, decisions]) => [directory, readBooleanRecord(decisions)]).filter(([, decisions]) => Object.keys(decisions).length > 0))
			: undefined;
		return {
			...(global && Object.keys(global).length > 0 ? { global } : {}),
			...(workingDirectories && Object.keys(workingDirectories).length > 0 ? { workingDirectories } : {}),
		};
	}

	private _readLru(): ILruEntry[] {
		const value = this._storageService.get<unknown>(LRU_STORAGE_KEY);
		if (!Array.isArray(value)) {
			return [];
		}
		return value.filter((entry): entry is ILruEntry =>
			isRecord(entry)
			&& (entry['scope'] === 'global' || entry['scope'] === 'workspace')
			&& typeof entry['key'] === 'string'
			&& (entry['workingDirectory'] === undefined || typeof entry['workingDirectory'] === 'string')
		);
	}

	private _reconcileLru(): void {
		const persistedEntries: ILruEntry[] = [
			...Object.keys(this._persistent.global ?? {}).sort().map(key => ({ scope: 'global' as const, key })),
			...Object.entries(this._persistent.workingDirectories ?? {}).flatMap(([workingDirectory, values]) => Object.keys(values).sort().map(key => ({ scope: 'workspace' as const, key, workingDirectory }))),
		];
		const valid = this._lru.filter(entry => persistedEntries.some(candidate => entriesEqual(candidate, entry)));
		for (const entry of persistedEntries) {
			if (!valid.some(candidate => entriesEqual(candidate, entry))) {
				valid.push(entry);
			}
		}
		this._lru = valid;
		this._evictLru();
	}

	private _parseSessionEnablement(raw: string | undefined): Map<string, boolean> {
		if (raw === undefined) {
			return new Map();
		}
		try {
			return new Map(Object.entries(readBooleanRecord(JSON.parse(raw))));
		} catch {
			return new Map();
		}
	}

	private _captureDecisionSnapshot(session: string, target: ICustomizationEnablementTarget): IEnablementDecisionSnapshot {
		const persistentKey = this._persistentKey(target);
		const workspace = new Map<string, boolean>();
		for (const [directory, decisions] of Object.entries(this._persistent.workingDirectories ?? {})) {
			const decision = decisions[persistentKey];
			if (decision !== undefined) {
				workspace.set(directory, decision);
			}
		}
		return {
			global: this._persistent.global?.[persistentKey],
			workspace,
			session: this._sessionEnablement.get(session)?.get(this._sessionKey(target)),
		};
	}

	private _getAffectedSessions(session: string, target: ICustomizationEnablementTarget, before: IEnablementDecisionSnapshot): Set<string> {
		const after = this._captureDecisionSnapshot(session, target);
		const affectedSessions = new Set<string>();
		if (before.global !== after.global) {
			for (const candidate of this._sessionState.getSessionUris()) {
				affectedSessions.add(candidate);
			}
		}
		for (const directory of new Set([...before.workspace.keys(), ...after.workspace.keys()])) {
			if (before.workspace.get(directory) !== after.workspace.get(directory)) {
				for (const candidate of this._sessionState.getSessionUris()) {
					const workingDirectory = this.getWorkingDirectoryState(candidate);
					if (workingDirectory.kind === 'directory' && workingDirectory.uri.toString() === directory) {
						affectedSessions.add(candidate);
					}
				}
			}
		}
		if (before.session !== after.session) {
			affectedSessions.add(session);
		}
		return affectedSessions;
	}

	private _notifyDecisionChanged(sessions: Iterable<string>): void {
		const affectedSessions = [...new Set(sessions)];
		if (affectedSessions.length > 0) {
			this._onDidChange.fire({ sessions: affectedSessions });
		}
	}
}

interface IEnablementDecisionSnapshot {
	readonly global: boolean | undefined;
	readonly workspace: ReadonlyMap<string, boolean>;
	readonly session: boolean | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readBooleanRecord(value: unknown): Record<string, boolean> {
	if (!isRecord(value)) {
		return {};
	}
	const result: Record<string, boolean> = {};
	for (const [key, decision] of Object.entries(value)) {
		if (typeof decision === 'boolean') {
			result[key] = decision;
		}
	}
	return result;
}

function entriesEqual(a: ILruEntry, b: ILruEntry): boolean {
	return a.scope === b.scope && a.key === b.key && a.workingDirectory === b.workingDirectory;
}
