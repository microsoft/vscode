/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import type { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ChatMoveConfigKey, chatMoveRootConfigSchema, isChatMovable, isChatStructurallyMovable, type IChatMoveStructuralEligibility } from '../common/agentHostChatMove.js';
import type { ISessionStateChange, ISessionStateSnapshot } from '../common/agentHostSessionStateStore.js';
import { getWorkingDirectoryKey } from '../common/agentHostWorkingDirectories.js';
import { readAgentMergeFolderStates } from '../common/agentMerge.js';
import { readSessionMovable, withSessionMovable } from '../common/meta/agentHostSessionMoveMeta.js';
import { ActionType, type StateAction } from '../common/state/sessionActions.js';
import { ChatOriginKind, isSessionStatusArchived, readSessionWorkspaceless, type URI as ProtocolURI } from '../common/state/sessionState.js';
import type { IAgentConfigurationService } from './agentConfigurationService.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY, parseSessionAdditionalWorktrees } from './shared/sessionAdditionalWorktrees.js';
import { WORKTREE_META_PATH } from './shared/worktreeIsolation.js';

/** The in-memory state, held by other services, that decides whether a chat's session refuses its move (Block 4). */
export interface IChatMovabilitySources {
	/** Pending and quarantined workspace changes; fires the chat (or its session's default chat) whose state changed. */
	readonly conversions: {
		isPending(chat: ProtocolURI, sessionWide?: boolean): boolean;
		readonly onDidChangePending: Event<ProtocolURI>;
	};
	/** The worktree a session works in once it was created this run. */
	readonly worktrees: { getResolvedWorktree(sessionId: string): URI | undefined };
	/** Loaded session state: its recorded worktrees and its chat catalog authority. */
	readonly sessionState: {
		peek(session: URI): ISessionStateSnapshot | undefined;
		readonly onDidChangeLoadedState: Event<ISessionStateChange>;
	};
	/** Sessions whose catalog work waits because their source can't be resolved. */
	readonly catalogs: {
		isParked(session: string): boolean;
		readonly onDidChangeParkedSessions: Event<string | undefined>;
	};
	/** The id of a session, as the worktree isolation keys it. */
	sessionId(session: URI): string;
}

/** What a session's chats share when deciding whether they may move out of it. */
interface ISourceSessionContext {
	readonly archived: boolean;
	readonly workspaceless: boolean;
	readonly quarantined: boolean;
	readonly legacyCatalog: boolean;
	readonly folders: readonly string[];
	readonly worktrees: readonly URI[];
	/** Chats that run Agent Merge for a folder of the session. */
	readonly agentMergeChats: ReadonlySet<string>;
}

/** Session actions after which a session's chats may become movable or not. */
const SESSION_INPUT_ACTIONS: ReadonlySet<StateAction['type']> = new Set([
	ActionType.SessionIsArchivedChanged,
	ActionType.SessionConfigChanged,
	ActionType.SessionMetaChanged,
	ActionType.SessionWorkingDirectorySet,
	ActionType.SessionWorkingDirectoryRemoved,
	ActionType.SessionWorkingDirectoryReplaced,
]);

/** Session values recording the worktrees a session owns. */
const WORKTREE_VALUES: ReadonlySet<string> = new Set([WORKTREE_META_PATH, ADDITIONAL_WORKTREES_METADATA_KEY]);

/** `chat` and the registered chats of `session` whose recorded parent chain reaches it, `chat` first. */
export function chatSubtree(stateManager: AgentHostStateManager, session: ProtocolURI, chat: ProtocolURI): ProtocolURI[] {
	const chats = stateManager.getSessionState(session)?.chats.map(candidate => candidate.resource) ?? [];
	const subtree = [chat];
	let expanded = true;
	while (expanded) {
		expanded = false;
		for (const candidate of chats) {
			const parent = stateManager.getChatParent(candidate);
			if (parent !== undefined && subtree.includes(parent) && !subtree.includes(candidate)) {
				subtree.push(candidate);
				expanded = true;
			}
		}
	}
	return subtree;
}

/**
 * Keeps every registered chat's `movable` flag (`ChatSummary.movable`, `ChatState.movable`) current, strictly: a chat
 * is movable only while it is structurally eligible and nothing about it or its own session would refuse its move
 * (see {@link isChatMovable}). It is recomputed, from in-memory state only, on registration, when a chat changes owner
 * or role, when moving chats is enabled or disabled, and when an input of its session changes: archiving, workspace
 * markers, folders, config (Agent Merge), workspace changes and their quarantine, recorded worktrees and catalog parking.
 * Also keeps each session's VS Code-only `vscode.movable` flag (Block 4): the session can move under another session
 * while moving chats is enabled and its default chat is its only chat (with that chat's subagents).
 */
export class AgentHostChatMovability extends Disposable {

	private readonly _pending = new Set<ProtocolURI>();
	private readonly _pendingSessions = new Set<ProtocolURI>();
	/**
	 * Registration and owner changes happen before a chat joins its session's catalog, so its flag is published right
	 * after. A change of an input of a session's chats is published synchronously.
	 */
	private readonly _scheduler = this._register(new RunOnceScheduler(() => this._flush(), 0));

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _configurationService: IAgentConfigurationService,
		private readonly _sources: IChatMovabilitySources,
	) {
		super();
		this._register(_stateManager.onDidRegisterChat(({ chat, session }) => {
			// A chat its session already lists when it registers (a restored chat) is published at once.
			if (_stateManager.getSessionState(session)?.chats.some(candidate => candidate.resource === chat)) {
				this.update(chat);
			}
			this._schedule(chat, session);
		}));
		this._register(_stateManager.onDidUnregisterChat(({ session }) => this._schedule(undefined, session)));
		// An owner change happens before the chat joins its new session's catalog.
		this._register(_stateManager.onDidChangeChatOwner(({ chat, previous, current }) => {
			this._schedule(chat, current);
			this._schedule(undefined, previous);
		}));
		this._register(_configurationService.onDidRootConfigChange(() => this._updateAll()));
		this._register(_stateManager.onDidEmitEnvelope(envelope => {
			const action = envelope.action;
			if (action.type === ActionType.SessionDefaultChatChanged || action.type === ActionType.SessionReady) {
				for (const chat of _stateManager.getSessionState(envelope.channel)?.chats ?? []) {
					this.update(chat.resource);
				}
				this.updateSession(envelope.channel);
			} else if (action.type === ActionType.SessionChatAdded || action.type === ActionType.SessionChatRemoved) {
				this._schedule(undefined, envelope.channel);
			} else if (SESSION_INPUT_ACTIONS.has(action.type)) {
				this._updateSessionChats(envelope.channel);
			} else if (action.type === ActionType.SessionChatUpdated && action.changes.workingDirectories !== undefined) {
				this.update(action.chat);
			} else if (action.type === ActionType.ChatWorkingDirectorySet || action.type === ActionType.ChatWorkingDirectoryRemoved) {
				this.update(envelope.channel);
			}
		}));
		this._register(_sources.conversions.onDidChangePending(chat => {
			// A session-wide change is recorded for the session's default chat: every chat of its session is affected.
			const owner = _stateManager.getChatOwner(chat) ?? (_stateManager.getSessionState(chat) ? chat : undefined);
			if (owner !== undefined) {
				this._updateSessionChats(owner);
			}
		}));
		this._register(_sources.sessionState.onDidChangeLoadedState(change => {
			if (change.authority || change.values.some(key => WORKTREE_VALUES.has(key))) {
				this._updateSessionChats(change.session);
			}
		}));
		this._register(_sources.catalogs.onDidChangeParkedSessions(session => {
			if (session === undefined) {
				this._updateAll();
			} else {
				this._updateSessionChats(session);
			}
		}));
	}

	/** Publishes the current eligibility of `chat`. */
	update(chat: ProtocolURI, contexts?: Map<ProtocolURI, ISourceSessionContext | undefined>): void {
		const owner = this._stateManager.getChatOwner(chat);
		const movable = owner === undefined ? undefined : this._isMovableIn(chat, owner, contexts);
		if (movable !== undefined) {
			this._stateManager.setChatMovable(chat, movable);
		}
	}

	/**
	 * Whether `chat`, listed by its current owner, may move once `owner` owns it; `undefined` when its owner doesn't
	 * list it. A move asks before the chat joins `owner`, so its new session announces it as it is.
	 */
	isMovableIn(chat: ProtocolURI, owner: ProtocolURI): boolean | undefined {
		return this._isMovableIn(chat, owner, undefined);
	}

	/**
	 * Whether `chat` of `owner` is structurally eligible to move (`undefined` when `owner` doesn't list it): a move
	 * request checks this, and validates the conditions of the chat and its sessions itself, to refuse with their reason.
	 */
	isStructurallyMovable(chat: ProtocolURI, owner: ProtocolURI): boolean | undefined {
		const eligibility = this._structuralEligibility(chat, owner);
		return eligibility && isChatStructurallyMovable(eligibility);
	}

	private _structuralEligibility(chat: ProtocolURI, owner: ProtocolURI): IChatMoveStructuralEligibility | undefined {
		const current = this._stateManager.getChatOwner(chat);
		const summary = current === undefined ? undefined : this._stateManager.getSessionState(current)?.chats.find(candidate => candidate.resource === chat);
		if (!summary) {
			return undefined;
		}
		return {
			enabled: this._configurationService.getRootValue(chatMoveRootConfigSchema, ChatMoveConfigKey.Enabled) === true,
			isDefault: this._stateManager.isDefaultChat(owner, chat),
			origin: summary.origin,
			interactivity: summary.interactivity,
		};
	}

	private _isMovableIn(chat: ProtocolURI, owner: ProtocolURI, contexts: Map<ProtocolURI, ISourceSessionContext | undefined> | undefined): boolean | undefined {
		const structural = this._structuralEligibility(chat, owner);
		if (!structural) {
			return undefined;
		}
		if (!isChatStructurallyMovable(structural)) {
			return false;
		}
		let context = contexts?.get(owner);
		if (!contexts?.has(owner)) {
			context = this._sourceContext(owner);
			contexts?.set(owner, context);
		}
		if (!context) {
			return false;
		}
		const current = this._stateManager.getChatOwner(chat)!;
		const summary = this._stateManager.getSessionState(current)?.chats.find(candidate => candidate.resource === chat);
		// A chat without folders of its own works in its current owner's; a move to `owner` pins those (`_movedChatFolders`).
		const folders = this._stateManager.getChatState(chat)?.workingDirectories ?? summary?.workingDirectories
			?? (current === owner ? context.folders : this._stateManager.getSessionSummary(current)?.workingDirectories ?? []);
		const subtree = chatSubtree(this._stateManager, current, chat);
		return isChatMovable({
			...structural,
			sessionArchived: context.archived,
			workspaceless: context.workspaceless || folders.length === 0,
			converting: context.quarantined || subtree.some(candidate => this._sources.conversions.isPending(candidate)),
			worktreeFolder: folders.some(folder => context.worktrees.some(worktree => extUriBiasedIgnorePathCase.isEqualOrParent(URI.parse(folder), worktree))),
			agentMergeOwner: subtree.some(candidate => context.agentMergeChats.has(candidate)),
			legacyCatalog: context.legacyCatalog,
		});
	}

	/** What the chats of `session` share, from in-memory state only; `undefined` when the session isn't loaded. */
	private _sourceContext(session: ProtocolURI): ISourceSessionContext | undefined {
		const state = this._stateManager.getSessionState(session);
		if (!state) {
			return undefined;
		}
		const resource = URI.parse(session);
		const folders = this._stateManager.getSessionSummary(session)?.workingDirectories ?? [];
		const snapshot = this._sources.sessionState.peek(resource);
		const recordedWorktree = snapshot?.values.get(WORKTREE_META_PATH);
		const resolvedWorktree = this._sources.worktrees.getResolvedWorktree(this._sources.sessionId(resource));
		const worktrees = [
			...(resolvedWorktree ? [resolvedWorktree] : []),
			...(recordedWorktree ? [URI.parse(recordedWorktree)] : []),
			...parseSessionAdditionalWorktrees(snapshot?.values.get(ADDITIONAL_WORKTREES_METADATA_KEY)).map(worktree => URI.parse(worktree.workingDirectory)),
		];
		const agentMergeChats = new Set<string>();
		for (const folder of readAgentMergeFolderStates(state.config?.values, folders[0] === undefined ? undefined : getWorkingDirectoryKey(folders[0])).values()) {
			if (folder.enabled && folder.chat !== undefined) {
				agentMergeChats.add(folder.chat);
			}
		}
		return {
			archived: isSessionStatusArchived(state.status),
			workspaceless: readSessionWorkspaceless(state._meta),
			quarantined: this._sources.conversions.isPending(session, true),
			// A parked legacy catalog can't be converted until its source resolves; a normalized one moves regardless.
			legacyCatalog: this._sources.catalogs.isParked(session) && snapshot?.authority !== 2,
			folders,
			worktrees,
			agentMergeChats,
		};
	}

	/** Publishes whether `session` can move under another session; written only when it changes. */
	updateSession(session: ProtocolURI): void {
		const state = this._stateManager.getSessionState(session);
		if (!state) {
			return;
		}
		const movable = this._configurationService.getRootValue(chatMoveRootConfigSchema, ChatMoveConfigKey.Enabled) === true
			&& state.chats.every(chat => chat.resource === state.defaultChat || chat.origin?.kind === ChatOriginKind.Tool);
		if (readSessionMovable(state._meta) !== movable) {
			this._stateManager.setSessionMeta(session, withSessionMovable(state._meta, movable));
		}
	}

	/**
	 * Publishes the eligibility of every chat of `session` now: an input of its session changed, and its chats are in
	 * its catalog, so nothing waits for them (unlike a chat being registered). `movable` is never stale after the change.
	 */
	private _updateSessionChats(session: ProtocolURI): void {
		const contexts = new Map<ProtocolURI, ISourceSessionContext | undefined>();
		for (const chat of this._stateManager.getSessionState(session)?.chats ?? []) {
			this.update(chat.resource, contexts);
		}
	}

	private _schedule(chat: ProtocolURI | undefined, session: ProtocolURI | undefined): void {
		if (chat !== undefined) {
			this._pending.add(chat);
		}
		if (session !== undefined) {
			this._pendingSessions.add(session);
		}
		this._scheduler.schedule();
	}

	private _flush(): void {
		const chats = [...this._pending];
		const sessions = [...this._pendingSessions];
		this._pending.clear();
		this._pendingSessions.clear();
		const contexts = new Map<ProtocolURI, ISourceSessionContext | undefined>();
		for (const chat of chats) {
			this.update(chat, contexts);
		}
		for (const session of sessions) {
			this.updateSession(session);
		}
	}

	private _updateAll(): void {
		const contexts = new Map<ProtocolURI, ISourceSessionContext | undefined>();
		for (const session of this._stateManager.getSessionUris()) {
			for (const chat of this._stateManager.getSessionState(session)?.chats ?? []) {
				this.update(chat.resource, contexts);
			}
			this.updateSession(session);
		}
	}
}
