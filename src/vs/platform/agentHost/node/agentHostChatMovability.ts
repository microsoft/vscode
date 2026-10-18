/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import type { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ChatMoveConfigKey, chatMoveRootConfigSchema, isChatMovable, isChatStructurallyMovable, type IChatMoveStructuralEligibility } from '../common/agentHostChatMove.js';
import type { ISessionStateChange, ISessionStateSnapshot } from '../common/agentHostSessionStateStore.js';
import { getWorkingDirectoryKey } from '../common/agentHostWorkingDirectories.js';
import { readAgentMergeFolderStates } from '../common/agentMerge.js';
import { readSessionMovable, withSessionMovable } from '../common/meta/agentHostSessionMoveMeta.js';
import { ActionType, type StateAction } from '../common/state/sessionActions.js';
import { ChatOriginKind, isSessionStatusArchived, readSessionWorkspaceless, type ChatSummary, type URI as ProtocolURI } from '../common/state/sessionState.js';
import type { IAgentConfigurationService } from './agentConfigurationService.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';
import { AdditionalWorktreeUsers } from './agentHostWorktreeCoOwnership.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY, type ISessionAdditionalWorktree, parseSessionAdditionalWorktrees } from './shared/sessionAdditionalWorktrees.js';

/** The in-memory state, held by other services, that decides whether a chat's session refuses its move (Block 4). */
export interface IChatMovabilitySources {
	/** Pending and quarantined workspace changes; fires the chat (or its session's default chat) whose state changed. */
	readonly conversions: {
		isPending(chat: ProtocolURI, sessionWide?: boolean): boolean;
		readonly onDidChangePending: Event<ProtocolURI>;
	};
	/** Loaded session state: its recorded additional worktrees and its chat catalog authority. */
	readonly sessionState: {
		peek(session: URI): ISessionStateSnapshot | undefined;
		readonly onDidChangeLoadedState: Event<ISessionStateChange>;
	};
	/** Sessions whose catalog work waits because their source can't be resolved. */
	readonly catalogs: {
		isParked(session: string): boolean;
		readonly onDidChangeParkedSessions: Event<string | undefined>;
	};
}

/** What a session's chats share when deciding whether they may move out of it. */
interface ISourceSessionContext {
	readonly archived: boolean;
	readonly workspaceless: boolean;
	readonly quarantined: boolean;
	readonly legacyCatalog: boolean;
	readonly folders: readonly string[];
	/** The additional worktrees the session records, each with the chat it was created for. */
	readonly additionalWorktrees: readonly ISessionAdditionalWorktree[];
	/** Chats that run Agent Merge for a folder of the session. */
	readonly agentMergeChats: ReadonlySet<string>;
	/** The session's chats by resource. */
	readonly summaries: Map<ProtocolURI, ChatSummary>;
	/** The session's chats by the chat whose tool call spawned them. */
	readonly children: Map<ProtocolURI, ProtocolURI[]>;
	/** The chats using each additional worktree recorded for a chat, built on first use (see {@link AdditionalWorktreeUsers}). */
	worktreeUsers: AdditionalWorktreeUsers | undefined;
}

/**
 * What one recompute of many chats shares, so it is linear in their number: each session's chats by resource (all a
 * chat that isn't structurally eligible needs) and its full context, each built at most once and only when needed.
 */
class MovabilityPass {
	readonly summaries = new Map<ProtocolURI, Map<ProtocolURI, ChatSummary> | undefined>();
	readonly contexts = new Map<ProtocolURI, ISourceSessionContext | undefined>();
}

/** `chat` and the chats of its session whose recorded parent chain reaches it, from the session's {@link ISourceSessionContext.children}. */
function subtreeOf(children: ReadonlyMap<ProtocolURI, readonly ProtocolURI[]>, chat: ProtocolURI): ReadonlySet<ProtocolURI> {
	const subtree = new Set([chat]);
	for (const member of subtree) {
		for (const child of children.get(member) ?? []) {
			subtree.add(child);
		}
	}
	return subtree;
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

const EMPTY_WORKTREE_USERS = new AdditionalWorktreeUsers([]);

/** Session values recording the worktrees a session owns that decide whether its chats may move. */
const WORKTREE_VALUES: ReadonlySet<string> = new Set([ADDITIONAL_WORKTREES_METADATA_KEY]);

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
	/**
	 * The pass the restored chats of one session share while they register in one synchronous run (a restore registers
	 * them one by one, each published at once): each registration adds its chat to it. Any other input drops it.
	 */
	private _registrationPass: { readonly session: ProtocolURI; readonly pass: MovabilityPass } | undefined;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _configurationService: IAgentConfigurationService,
		private readonly _sources: IChatMovabilitySources,
	) {
		super();
		this._register(_stateManager.onDidRegisterChat(({ chat, session }) => {
			// A chat its session already lists when it registers (a restored chat) is published at once.
			const summary = _stateManager.getSessionState(session)?.chats.find(candidate => candidate.resource === chat);
			if (summary) {
				this.update(chat, this._registrationPassWith(session, chat, summary));
			} else {
				this._registrationPass = undefined;
			}
			this._schedule(chat, session);
		}));
		this._register(_stateManager.onDidUnregisterChat(({ session }) => {
			this._registrationPass = undefined;
			this._schedule(undefined, session);
		}));
		// An owner change happens before the chat joins its new session's catalog.
		this._register(_stateManager.onDidChangeChatOwner(({ chat, previous, current }) => {
			this._registrationPass = undefined;
			this._schedule(chat, current);
			this._schedule(undefined, previous);
		}));
		this._register(_configurationService.onDidRootConfigChange(() => {
			this._registrationPass = undefined;
			this._updateAll();
		}));
		this._register(_stateManager.onDidEmitEnvelope(envelope => {
			const action = envelope.action;
			if (action.type === ActionType.SessionDefaultChatChanged || action.type === ActionType.SessionReady) {
				this._registrationPass = undefined;
				this._updateSessionChats(envelope.channel);
				this.updateSession(envelope.channel);
			} else if (action.type === ActionType.SessionChatAdded || action.type === ActionType.SessionChatRemoved) {
				this._registrationPass = undefined;
				this._schedule(undefined, envelope.channel);
			} else if (SESSION_INPUT_ACTIONS.has(action.type)) {
				this._registrationPass = undefined;
				this._updateSessionChats(envelope.channel);
			} else if (action.type === ActionType.SessionChatUpdated && action.changes.workingDirectories !== undefined) {
				this._registrationPass = undefined;
				this.update(action.chat);
			} else if (action.type === ActionType.ChatWorkingDirectorySet || action.type === ActionType.ChatWorkingDirectoryRemoved) {
				this._registrationPass = undefined;
				this.update(envelope.channel);
			}
		}));
		this._register(_sources.conversions.onDidChangePending(chat => {
			this._registrationPass = undefined;
			// A session-wide change is recorded for the session's default chat: every chat of its session is affected.
			const owner = _stateManager.getChatOwner(chat) ?? (_stateManager.getSessionState(chat) ? chat : undefined);
			if (owner !== undefined) {
				this._updateSessionChats(owner);
			}
		}));
		this._register(_sources.sessionState.onDidChangeLoadedState(change => {
			if (change.authority || change.values.some(key => WORKTREE_VALUES.has(key))) {
				this._registrationPass = undefined;
				this._updateSessionChats(change.session);
			}
		}));
		this._register(_sources.catalogs.onDidChangeParkedSessions(session => {
			this._registrationPass = undefined;
			if (session === undefined) {
				this._updateAll();
			} else {
				this._updateSessionChats(session);
			}
		}));
	}

	/** Publishes the current eligibility of `chat`. */
	update(chat: ProtocolURI, pass?: MovabilityPass): void {
		const owner = this._stateManager.getChatOwner(chat);
		const movable = owner === undefined ? undefined : this._isMovableIn(chat, owner, pass);
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
		const current = this._stateManager.getChatOwner(chat);
		const summary = current === undefined ? undefined : this._stateManager.getSessionState(current)?.chats.find(candidate => candidate.resource === chat);
		return summary && isChatStructurallyMovable(this._structuralEligibility(chat, owner, summary));
	}

	private _structuralEligibility(chat: ProtocolURI, owner: ProtocolURI, summary: ChatSummary): IChatMoveStructuralEligibility {
		return {
			enabled: this._configurationService.getRootValue(chatMoveRootConfigSchema, ChatMoveConfigKey.Enabled) === true,
			isDefault: this._stateManager.isDefaultChat(owner, chat),
			origin: summary.origin,
			interactivity: summary.interactivity,
		};
	}

	/**
	 * Linear in a pass: each session's chats and context are built once and reused for all its chats, so a chat costs
	 * its own subtree, not its session's chats. A chat that isn't structurally eligible (moving chats is off, by default)
	 * needs only its summary: no context is built for it.
	 */
	private _isMovableIn(chat: ProtocolURI, owner: ProtocolURI, pass: MovabilityPass | undefined): boolean | undefined {
		const current = this._stateManager.getChatOwner(chat);
		const summary = current === undefined ? undefined : this._listedSummary(current, chat, pass);
		if (!summary || current === undefined) {
			return undefined;
		}
		const structural = this._structuralEligibility(chat, owner, summary);
		if (!isChatStructurallyMovable(structural)) {
			return false;
		}
		const currentContext = this._context(current, pass);
		const context = owner === current ? currentContext : this._context(owner, pass);
		if (!context || !currentContext) {
			return false;
		}
		// A chat without folders of its own works in its current owner's; a move to `owner` pins those (`_movedChatFolders`).
		const folders = this._stateManager.getChatState(chat)?.workingDirectories ?? summary.workingDirectories
			?? (current === owner ? context.folders : currentContext.folders);
		const subtree = subtreeOf(currentContext.children, chat);
		return isChatMovable({
			...structural,
			sessionArchived: context.archived,
			workspaceless: context.workspaceless || folders.length === 0,
			converting: context.quarantined || [...subtree].some(candidate => this._sources.conversions.isPending(candidate)),
			// Worktrees are shared by moves (Block 5): only a chat's own one that a staying chat also uses keeps it (D2).
			// Asked for another owner, this checks that owner's list, so it may miss D2; `planWorktreeMove` refuses it.
			worktreeFolder: this._worktreeUsers(context, currentContext).sharedOwnOf(subtree, folders) !== undefined,
			agentMergeOwner: [...subtree].some(candidate => context.agentMergeChats.has(candidate)),
			legacyCatalog: context.legacyCatalog,
		});
	}

	/** The summary of `chat` that `session` lists: from the pass's index of the session's chats, or found for a lone call. */
	private _listedSummary(session: ProtocolURI, chat: ProtocolURI, pass: MovabilityPass | undefined): ChatSummary | undefined {
		return pass ? this._passSummaries(session, pass)?.get(chat) : this._stateManager.getSessionState(session)?.chats.find(candidate => candidate.resource === chat);
	}

	private _passSummaries(session: ProtocolURI, pass: MovabilityPass): Map<ProtocolURI, ChatSummary> | undefined {
		if (!pass.summaries.has(session)) {
			const chats = this._stateManager.getSessionState(session)?.chats;
			pass.summaries.set(session, chats && new Map(chats.map(chat => [chat.resource, chat])));
		}
		return pass.summaries.get(session);
	}

	private _context(session: ProtocolURI, pass: MovabilityPass | undefined): ISourceSessionContext | undefined {
		if (pass?.contexts.has(session)) {
			return pass.contexts.get(session);
		}
		const context = this._sourceContext(session, pass ? this._passSummaries(session, pass) : undefined);
		pass?.contexts.set(session, context);
		return context;
	}

	/**
	 * The pass of the restored chats `session` registers in this synchronous run, with `chat` (which it lists) added to
	 * what the pass already indexed: its summary, its parent's children, the worktrees it uses. Dropped at the end of
	 * the run, and by any other input.
	 */
	private _registrationPassWith(session: ProtocolURI, chat: ProtocolURI, summary: ChatSummary): MovabilityPass {
		const current = this._registrationPass;
		if (current?.session !== session) {
			const started = { session, pass: new MovabilityPass() };
			this._registrationPass = started;
			queueMicrotask(() => {
				if (this._registrationPass === started) {
					this._registrationPass = undefined;
				}
			});
			return started.pass;
		}
		current.pass.summaries.get(session)?.set(chat, summary);
		const context = current.pass.contexts.get(session);
		if (context) {
			const parent = this._stateManager.getChatParent(chat);
			if (parent !== undefined) {
				const siblings = context.children.get(parent);
				if (!siblings) {
					context.children.set(parent, [chat]);
				} else if (!siblings.includes(chat)) {
					siblings.push(chat);
				}
			}
			if (context.worktreeUsers && summary.origin?.kind !== ChatOriginKind.Tool) {
				context.worktreeUsers.addChat(chat, summary.workingDirectories ?? context.folders);
			}
		}
		return current.pass;
	}

	/**
	 * The chats of `chats`' session (not tool chats) using each additional worktree `context`'s session records for a
	 * chat; none, without building anything, when it records none for a chat. Cached on the context for its own chats.
	 */
	private _worktreeUsers(context: ISourceSessionContext, chats: ISourceSessionContext): AdditionalWorktreeUsers {
		if (!context.additionalWorktrees.some(worktree => worktree.chat !== undefined)) {
			return EMPTY_WORKTREE_USERS;
		}
		const build = () => {
			const users = new AdditionalWorktreeUsers(context.additionalWorktrees);
			for (const candidate of chats.summaries.values()) {
				if (candidate.origin?.kind !== ChatOriginKind.Tool) {
					users.addChat(candidate.resource, candidate.workingDirectories ?? context.folders);
				}
			}
			return users;
		};
		if (context !== chats) {
			return build();
		}
		context.worktreeUsers ??= build();
		return context.worktreeUsers;
	}

	/** What the chats of `session` share, from in-memory state only; `undefined` when the session isn't loaded. */
	private _sourceContext(session: ProtocolURI, summaries: Map<ProtocolURI, ChatSummary> | undefined): ISourceSessionContext | undefined {
		const state = this._stateManager.getSessionState(session);
		if (!state) {
			return undefined;
		}
		const resource = URI.parse(session);
		const folders = this._stateManager.getSessionSummary(session)?.workingDirectories ?? [];
		const snapshot = this._sources.sessionState.peek(resource);
		const children = new Map<ProtocolURI, ProtocolURI[]>();
		for (const chat of state.chats) {
			const parent = this._stateManager.getChatParent(chat.resource);
			if (parent !== undefined) {
				let siblings = children.get(parent);
				if (!siblings) {
					siblings = [];
					children.set(parent, siblings);
				}
				siblings.push(chat.resource);
			}
		}
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
			additionalWorktrees: parseSessionAdditionalWorktrees(snapshot?.values.get(ADDITIONAL_WORKTREES_METADATA_KEY)),
			agentMergeChats,
			summaries: summaries ?? new Map(state.chats.map(chat => [chat.resource, chat])),
			children,
			worktreeUsers: undefined,
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
		const pass = new MovabilityPass();
		for (const chat of this._stateManager.getSessionState(session)?.chats ?? []) {
			this.update(chat.resource, pass);
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
		const pass = new MovabilityPass();
		for (const chat of chats) {
			this.update(chat, pass);
		}
		for (const session of sessions) {
			this.updateSession(session);
		}
	}

	private _updateAll(): void {
		const pass = new MovabilityPass();
		for (const session of this._stateManager.getSessionUris()) {
			for (const chat of this._stateManager.getSessionState(session)?.chats ?? []) {
				this.update(chat.resource, pass);
			}
			this.updateSession(session);
		}
	}
}
