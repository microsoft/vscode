/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, type IReference } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession } from '../common/agentService.js';
import { DEFAULT_CUSTOMIZATION_ENABLED, isCustomizationEnabled, sortCustomizationEnablement } from '../common/customizationEnablement.js';
import { isAhpChatChannel, parseRequiredSessionUriFromChatUri, readSessionWorkspaceless } from '../common/state/sessionState.js';
import { ActionType } from '../common/state/protocol/common/actions.js';
import { CustomizationEnablementKind, CustomizationType, type CustomizationEnablement } from '../common/state/protocol/channels-session/state.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';

const STORAGE_KEY = 'customizationEnablement';
const LRU_STORAGE_KEY = 'customizationEnablementLru';
const SESSION_METADATA_KEY = 'customizationEnablement';
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

export interface ICustomizationEnablementTarget {
	readonly id: string;
	readonly type: CustomizationType;
	readonly name: string;
	readonly source: URI;
	readonly owningPluginSource?: URI;
}

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

export interface ISessionEnablementDatabase {
	getMetadata(key: string): Promise<string | undefined>;
	setMetadata(key: string, value: string): Promise<void>;
}

export interface ISessionEnablementDataService {
	openDatabase(session: URI): IReference<ISessionEnablementDatabase>;
}

export interface ICustomizationEnablementConfigurationService {
	getEffectiveWorkingDirectories(session: string): string[] | undefined;
	isWorkingDirectoryPending(session: string): boolean;
	readonly onDidChangeWorkingDirectoryPending: Event<string>;
}

export interface ICustomizationEnablementSessionState {
	getSessionSummary(session: string): { readonly _meta?: Record<string, unknown> } | undefined;
	readonly onDidEmitEnvelope: Event<{ readonly channel: string; readonly action: { readonly type: ActionType } }>;
}

export const IAgentHostCustomizationEnablementService = createDecorator<IAgentHostCustomizationEnablementService>('agentHostCustomizationEnablementService');

export interface IAgentHostCustomizationEnablementService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<string>;
	initializeSession(session: string): Promise<void>;
	getWorkingDirectoryState(session: string): WorkingDirectoryState;
	resolve(session: string, target: ICustomizationEnablementTarget): CustomizationEnablementResolution;
	setEnablement(session: string, target: ICustomizationEnablementTarget, kind: CustomizationEnablementKind, enabled: boolean): CustomizationEnablementResolution;
	whenIdle(): Promise<void>;
}

/**
 * Returns the scope-appropriate identity for a customization decision.
 *
 * Durable keys deliberately use a plugin's source URI, rather than a
 * customization id: a plugin child id contains its materialized path and
 * content hash, so using it would forget a user's choice on every plugin edit.
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

/**
 * Resolves and persists scoped customization enablement.
 *
 * Session metadata is loaded into `_sessionEnablement` once and that cache is
 * authoritative for synchronous reads. Resolution must never issue an async DB
 * read, because an absent asynchronous result would be mistaken for no decision.
 */
export class AgentHostCustomizationEnablementService extends Disposable implements IAgentHostCustomizationEnablementService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<string>());
	readonly onDidChange = this._onDidChange.event;

	private _persistent: IPersistedEnablement;
	private _lru: ILruEntry[];
	private readonly _sessionEnablement = new Map<string, Map<string, boolean>>();
	private readonly _sessionLoads = new Map<string, Promise<void>>();
	private readonly _sessionsById = new Map<string, string>();
	private readonly _pendingSessionWrites = new Set<Promise<void>>();

	constructor(
		private readonly _storageService: IAgentHostStorageService,
		private readonly _sessionDataService: ISessionEnablementDataService,
		private readonly _configurationService: ICustomizationEnablementConfigurationService,
		private readonly _sessionState: ICustomizationEnablementSessionState,
		private readonly _logService: ILogService,
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
					this._notifyDecisionChanged(session);
				}
			}
		}));
		this._register(this._configurationService.onDidChangeWorkingDirectoryPending(sessionId => {
			const session = this._sessionsById.get(sessionId);
			if (session === undefined) {
				// A worktree can become pending before this service initializes its
				// session. It cannot have produced a resolution yet; initialization
				// reads the current pending state, and any later clear is observed.
				return;
			}
			this._notifyDecisionChanged(session);
		}));
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
		if (this._configurationService.isWorkingDirectoryPending(session)) {
			return { kind: 'pending' };
		}
		const directory = this._configurationService.getEffectiveWorkingDirectories(session)?.[0];
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

		const persistentKey = getCustomizationEnablementKey(target, CustomizationEnablementKind.Global);
		const decisions: CustomizationEnablement[] = [];
		const sessionDecision = sessionEnablement.get(getCustomizationEnablementKey(target, CustomizationEnablementKind.Session));
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
		}

		const enablement = sortCustomizationEnablement(decisions);
		return {
			kind: 'resolved',
			enablement,
			enabled: isCustomizationEnabled({ enablement }),
			workingDirectory,
		};
	}

	setEnablement(session: string, target: ICustomizationEnablementTarget, kind: CustomizationEnablementKind, enabled: boolean): CustomizationEnablementResolution {
		switch (kind) {
			case CustomizationEnablementKind.Global:
				this._setGlobal(target, enabled);
				break;
			case CustomizationEnablementKind.Workspace: {
				const workingDirectory = this.getWorkingDirectoryState(session);
				if (workingDirectory.kind === 'pending') {
					return { kind: 'pending', reason: 'workingDirectory' };
				}
				if (workingDirectory.kind !== 'directory') {
					throw new Error('Cannot record workspace enablement for a workspace-less session');
				}
				this._setWorkspace(target, workingDirectory.uri, enabled);
				break;
			}
			case CustomizationEnablementKind.Session: {
				const workingDirectory = this.getWorkingDirectoryState(session);
				if (workingDirectory.kind === 'pending') {
					return { kind: 'pending', reason: 'workingDirectory' };
				}
				this._setSession(session, target, workingDirectory, enabled);
				break;
			}
			default: {
				const exhaustiveKind: never = kind;
				throw new Error(`Unknown customization enablement kind: ${exhaustiveKind}`);
			}
		}

		this._notifyDecisionChanged(session);
		return this.resolve(session, target);
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
		const reference = this._sessionDataService.openDatabase(URI.parse(session));
		try {
			const raw = await reference.object.getMetadata(SESSION_METADATA_KEY);
			this._sessionEnablement.set(session, this._parseSessionEnablement(raw));
		} catch (err) {
			this._logService.warn(`[AgentHostCustomizationEnablementService] Failed to read session enablement for ${session}`, err);
			this._sessionEnablement.set(session, new Map());
		} finally {
			reference.dispose();
		}
		if (transitioned) {
			this._notifyDecisionChanged(session);
		}
	}

	private _setGlobal(target: ICustomizationEnablementTarget, enabled: boolean): void {
		const key = getCustomizationEnablementKey(target, CustomizationEnablementKind.Global);
		const global = this._persistent.global ?? {};
		if (enabled === DEFAULT_CUSTOMIZATION_ENABLED) {
			delete global[key];
			this._removeLru('global', key);
		} else {
			global[key] = enabled;
			this._touchLru({ scope: 'global', key });
		}
		this._persistent = { ...this._persistent, global };
		this._removeRedundantWorkspaceDecisions(key);
		this._persist();
	}

	private _setWorkspace(target: ICustomizationEnablementTarget, workingDirectory: URI, enabled: boolean): void {
		const key = getCustomizationEnablementKey(target, CustomizationEnablementKind.Workspace);
		const directoryKey = workingDirectory.toString();
		const inherited = this._persistent.global?.[key] ?? DEFAULT_CUSTOMIZATION_ENABLED;
		const workingDirectories = this._persistent.workingDirectories ?? {};
		const workspace = workingDirectories[directoryKey] ?? {};
		if (enabled === inherited) {
			delete workspace[key];
			this._removeLru('workspace', key, directoryKey);
		} else {
			workspace[key] = enabled;
			this._touchLru({ scope: 'workspace', key, workingDirectory: directoryKey });
		}
		workingDirectories[directoryKey] = workspace;
		this._persistent = { ...this._persistent, workingDirectories };
		this._persist();
	}

	/** Needs the working-directory state to calculate the lower-scope inherited value before clearing. */
	private _setSession(session: string, target: ICustomizationEnablementTarget, workingDirectory: Exclude<WorkingDirectoryState, { kind: 'pending' }>, enabled: boolean): void {
		const enablement = this._sessionEnablement.get(session);
		if (enablement === undefined) {
			throw new Error(`Session enablement has not been initialized: ${session}`);
		}

		const persistentKey = getCustomizationEnablementKey(target, CustomizationEnablementKind.Global);
		const inherited = workingDirectory.kind === 'directory'
			? this._persistent.workingDirectories?.[workingDirectory.uri.toString()]?.[persistentKey] ?? this._persistent.global?.[persistentKey] ?? DEFAULT_CUSTOMIZATION_ENABLED
			: this._persistent.global?.[persistentKey] ?? DEFAULT_CUSTOMIZATION_ENABLED;
		const sessionKey = getCustomizationEnablementKey(target, CustomizationEnablementKind.Session);
		if (enabled === inherited) {
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

	private _removeRedundantWorkspaceDecisions(key: string): void {
		const inherited = this._persistent.global?.[key] ?? DEFAULT_CUSTOMIZATION_ENABLED;
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

	private _notifyDecisionChanged(session: string): void {
		this._onDidChange.fire(session);
		// TODO Step 5: republish the affected session's customizations here.
	}
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
