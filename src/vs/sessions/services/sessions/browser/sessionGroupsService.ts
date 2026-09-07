/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISession } from '../common/session.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';

/**
 * A user-created group of sessions in the sessions list. Groups render like
 * section headers and can be reordered, renamed and deleted. Their order is
 * owned by the section-order service and is fully user-managed; this type only
 * carries identity, name and creation time. Membership of a session in a group
 * is tracked separately (see {@link ISessionGroupsService}).
 */
export interface ISessionGroup {
	/** Stable identifier (uuid). */
	readonly id: string;
	/** User-provided display name. */
	readonly name: string;
	/** Creation timestamp (ms). Used as the default order (newest first). */
	readonly createdAt: number;
}

export interface ISessionGroupsChangeEvent {
	/** Groups added, removed, renamed or reordered. */
	readonly groupsChanged: boolean;
	/** Session ids whose group membership changed. */
	readonly membershipChanged: ReadonlySet<string>;
}

/**
 * Service that owns user-created session groups and the mapping of sessions to
 * groups. State is purely local (persisted to profile storage) and not synced
 * to providers.
 *
 * A session belongs to at most one group. Pinned sessions retain their
 * membership, while archiving a session removes it from its group.
 */
export interface ISessionGroupsService {
	readonly _serviceBrand: undefined;

	/** Fires when groups or membership change. */
	readonly onDidChange: Event<ISessionGroupsChangeEvent>;

	/**
	 * All groups in display order, including currently-empty ones.
	 */
	getGroups(): ISessionGroup[];

	/** Look up a group by id (including currently-empty groups). */
	getGroup(groupId: string): ISessionGroup | undefined;

	/**
	 * Create a new group with the given name. Returns the created group. When
	 * `memberSessionIds` are given they are added to the new group.
	 */
	createGroup(name: string, memberSessionIds?: Iterable<string>): ISessionGroup;

	/** Rename an existing group. No-op if the group does not exist. */
	renameGroup(groupId: string, name: string): void;

	/** Delete a group and remove all of its members' membership. */
	deleteGroup(groupId: string): void;

	/** Add a session to a group (removing it from any previous group). */
	addToGroup(sessionId: string, groupId: string): void;

	/**
	 * Add multiple sessions to a group at once (removing them from any previous
	 * group), firing a single change event.
	 */
	addToGroup(sessionIds: Iterable<string>, groupId: string): void;

	/** Remove a session from its group, if any. */
	removeFromGroup(sessionId: string): void;

	/** The id of the group the session belongs to, or `undefined`. */
	getGroupOfSession(sessionId: string): string | undefined;

	/** The session ids that belong to the given group. */
	getSessionIdsInGroup(groupId: string): string[];

	/**
	 * Record that the next new session started from the composer should join the
	 * given group. The intent is consumed when a new session is started (sent)
	 * and cleared if the new session is abandoned without sending. No-op when the
	 * group does not exist.
	 */
	setPendingNewSessionGroup(groupId: string): void;
}

export const ISessionGroupsService = createDecorator<ISessionGroupsService>('sessionGroupsService');

const EXPLICITLY_UNGROUPED_FIELD = 'explicitlyUngroupedSessionIds';

interface ISerializedState {
	readonly groups: readonly ISessionGroup[];
	/** sessionId -> groupId */
	readonly membership: Readonly<Record<string, string>>;
	readonly [EXPLICITLY_UNGROUPED_FIELD]?: readonly string[];
}

export class SessionGroupsService extends Disposable implements ISessionGroupsService {

	declare readonly _serviceBrand: undefined;

	private static readonly STORAGE_KEY = 'sessionsListControl.groups';

	private readonly _onDidChange = this._register(new Emitter<ISessionGroupsChangeEvent>());
	readonly onDidChange: Event<ISessionGroupsChangeEvent> = this._onDidChange.event;

	private readonly _groups = new Map<string, ISessionGroup>();
	/** sessionId -> groupId */
	private readonly _membership = new Map<string, string>();
	private readonly _explicitlyUngroupedSessionIds = new Set<string>();

	/**
	 * Group that the composer's in-progress new session should join once sent,
	 * or `undefined` when there is no pending intent. Set via
	 * {@link setPendingNewSessionGroup} when the user picks "New Session" on a
	 * group header, locked onto a specific draft when that draft is sent, and
	 * cleared if the new session is abandoned.
	 */
	private _pendingNewSessionGroupId: string | undefined;

	/**
	 * Sends in flight: draft (or, after graduation, committed) sessionId ->
	 * groupId. A grouped send is locked here the moment it is dispatched, so a
	 * later intent or a failed/concurrent send can never rebind it. Consumed
	 * when the session is started.
	 */
	private readonly _inFlightSessionGroups = new Map<string, string>();

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();

		this.load();
		const archivedMembershipChanged = new Set<string>();
		const archivedStateChanged = this.removeArchivedMembership(this.sessionsManagementService.getSessions(), archivedMembershipChanged);
		this.updateDefaultPlacement(this.sessionsManagementService.getSessions(), archivedMembershipChanged);
		if (archivedStateChanged || archivedMembershipChanged.size > 0) {
			this.save();
		}

		// A session dropping out of the provider's list is an eviction, not a
		// deletion — an agent that cannot answer `listSessions` yet reports no
		// sessions, so its sessions disappear until the next refresh. Clearing
		// membership here would turn that transient gap into a permanent,
		// unrecoverable loss of the user's grouping.
		this._register(this.sessionsManagementService.onDidChangeSessions(e => {
			for (const session of e.removed) {
				this._inFlightSessionGroups.delete(session.sessionId);
			}
			const changed = new Set<string>();
			const archivedStateChanged = this.removeArchivedMembership([...e.added, ...e.changed], changed);
			this.updateDefaultPlacement(this.sessionsManagementService.getSessions(), changed);
			if (archivedStateChanged || changed.size > 0) {
				this.save();
			}
			if (changed.size > 0) {
				this._onDidChange.fire({ groupsChanged: false, membershipChanged: changed });
			}
		}));

		this._register(this.sessionsManagementService.onDidDeleteSession(session => {
			const membershipDeleted = this._membership.delete(session.sessionId);
			const ungroupedDeleted = this._explicitlyUngroupedSessionIds.delete(session.sessionId);
			if (membershipDeleted || ungroupedDeleted) {
				this.save();
			}
			if (membershipDeleted) {
				this._onDidChange.fire({ groupsChanged: false, membershipChanged: new Set([session.sessionId]) });
			}
		}));

		this._register(this.sessionsManagementService.onDidArchiveSession(session => {
			const membershipDeleted = this._membership.delete(session.sessionId);
			const ungroupedAdded = this.markExplicitlyUngrouped(session.sessionId);
			if (membershipDeleted || ungroupedAdded) {
				this.save();
			}
			if (membershipDeleted) {
				this._onDidChange.fire({ groupsChanged: false, membershipChanged: new Set([session.sessionId]) });
			}
		}));

		// Lock the pending group onto the specific draft at send-dispatch, before
		// the async start completes, so a later arm or a failed/concurrent send
		// can no longer rebind it. A send into an existing session discards the
		// draft (firing the discard handler below) before this fires.
		this._register(this.sessionsManagementService.onWillSendRequest(session => {
			if (this._pendingNewSessionGroupId === undefined) {
				return;
			}
			this._inFlightSessionGroups.set(session.sessionId, this._pendingNewSessionGroupId);
			this._pendingNewSessionGroupId = undefined;
		}));

		// A draft graduates into a committed session with a new id; follow it.
		this._register(this.sessionsManagementService.onDidReplaceSession(({ from, to }) => {
			if (from.sessionId === to.sessionId) {
				return;
			}
			const groupId = this._inFlightSessionGroups.get(from.sessionId);
			if (groupId !== undefined) {
				this._inFlightSessionGroups.delete(from.sessionId);
				this._inFlightSessionGroups.set(to.sessionId, groupId);
			}
		}));

		// The started session carries the committed id; record its group now.
		this._register(this.sessionsManagementService.onDidStartSession(session => {
			const groupId = this._inFlightSessionGroups.get(session.sessionId);
			if (groupId === undefined) {
				return;
			}
			this._inFlightSessionGroups.delete(session.sessionId);
			if (this._groups.has(groupId)) {
				this.addToGroup(session.sessionId, groupId);
			}
		}));

		// Abandoning the composer draft drops the not-yet-dispatched intent so it
		// never binds an unrelated session created later.
		this._register(this.sessionsManagementService.onDidDiscardNewSession(() => {
			this._pendingNewSessionGroupId = undefined;
		}));
	}

	/** Fills missing custom-group membership from creation provenance; explicit membership or ungrouping remains authoritative. */
	private updateDefaultPlacement(sessions: readonly ISession[], changed: Set<string>): void {
		let placed: boolean;
		do {
			placed = false;
			for (const session of sessions) {
				if (session.isArchived.get() || this._membership.has(session.sessionId) || this._explicitlyUngroupedSessionIds.has(session.sessionId)) {
					continue;
				}
				const creatorResource = session.createdBySession?.get()?.session;
				const creator = creatorResource ? this.sessionsManagementService.getSession(creatorResource) : undefined;
				const creatorGroupId = creator ? this._membership.get(creator.sessionId) : undefined;
				if (creatorGroupId) {
					this.setMembership(session.sessionId, creatorGroupId, changed);
					placed = true;
				}
			}
		} while (placed);
	}

	getGroups(): ISessionGroup[] {
		return this.sortGroups([...this._groups.values()]);
	}

	getGroup(groupId: string): ISessionGroup | undefined {
		return this._groups.get(groupId);
	}

	createGroup(name: string, memberSessionIds?: Iterable<string>): ISessionGroup {
		const group: ISessionGroup = { id: generateUuid(), name, createdAt: Date.now() };
		this._groups.set(group.id, group);

		const membershipChanged = new Set<string>();
		if (memberSessionIds) {
			for (const sessionId of memberSessionIds) {
				this.setMembership(sessionId, group.id, membershipChanged);
			}
		}
		this.updateDefaultPlacement(this.sessionsManagementService.getSessions(), membershipChanged);

		this.save();
		this._onDidChange.fire({ groupsChanged: true, membershipChanged });
		return group;
	}

	renameGroup(groupId: string, name: string): void {
		const group = this._groups.get(groupId);
		if (!group || group.name === name) {
			return;
		}
		this._groups.set(groupId, { ...group, name });
		this.save();
		this._onDidChange.fire({ groupsChanged: true, membershipChanged: new Set() });
	}

	deleteGroup(groupId: string): void {
		if (!this._groups.delete(groupId)) {
			return;
		}
		if (this._pendingNewSessionGroupId === groupId) {
			this._pendingNewSessionGroupId = undefined;
		}
		for (const [sessionId, gid] of this._inFlightSessionGroups) {
			if (gid === groupId) {
				this._inFlightSessionGroups.delete(sessionId);
			}
		}
		const membershipChanged = new Set<string>();
		for (const [sessionId, gid] of this._membership) {
			if (gid === groupId) {
				this._membership.delete(sessionId);
				this.markExplicitlyUngrouped(sessionId);
				membershipChanged.add(sessionId);
			}
		}
		this.save();
		this._onDidChange.fire({ groupsChanged: true, membershipChanged });
	}

	addToGroup(sessionIdOrIds: string | Iterable<string>, groupId: string): void {
		if (!this._groups.has(groupId)) {
			return;
		}
		const sessionIds = typeof sessionIdOrIds === 'string' ? [sessionIdOrIds] : sessionIdOrIds;
		const membershipChanged = new Set<string>();
		for (const sessionId of sessionIds) {
			this.setMembership(sessionId, groupId, membershipChanged);
		}
		this.updateDefaultPlacement(this.sessionsManagementService.getSessions(), membershipChanged);
		if (membershipChanged.size === 0) {
			return;
		}
		this.save();
		this._onDidChange.fire({ groupsChanged: false, membershipChanged });
	}

	removeFromGroup(sessionId: string): void {
		if (!this._membership.delete(sessionId)) {
			return;
		}
		this.markExplicitlyUngrouped(sessionId);
		this.save();
		this._onDidChange.fire({ groupsChanged: false, membershipChanged: new Set([sessionId]) });
	}

	getGroupOfSession(sessionId: string): string | undefined {
		return this._membership.get(sessionId);
	}

	getSessionIdsInGroup(groupId: string): string[] {
		const result: string[] = [];
		for (const [sessionId, gid] of this._membership) {
			if (gid === groupId) {
				result.push(sessionId);
			}
		}
		return result;
	}

	setPendingNewSessionGroup(groupId: string): void {
		this._pendingNewSessionGroupId = this._groups.has(groupId) ? groupId : undefined;
	}

	// -- Helpers --

	private setMembership(sessionId: string, groupId: string, changed: Set<string>): void {
		if (this._explicitlyUngroupedSessionIds.delete(sessionId) || this._membership.get(sessionId) !== groupId) {
			this._membership.set(sessionId, groupId);
			changed.add(sessionId);
		}
	}

	private markExplicitlyUngrouped(sessionId: string): boolean {
		const size = this._explicitlyUngroupedSessionIds.size;
		this._explicitlyUngroupedSessionIds.add(sessionId);
		return this._explicitlyUngroupedSessionIds.size !== size;
	}

	private removeArchivedMembership(sessions: readonly ISession[], changed: Set<string>): boolean {
		let stateChanged = false;
		for (const session of sessions) {
			if (session.isArchived.get()) {
				if (this._membership.delete(session.sessionId)) {
					changed.add(session.sessionId);
					stateChanged = true;
				}
				stateChanged = this.markExplicitlyUngrouped(session.sessionId) || stateChanged;
			}
		}
		return stateChanged;
	}

	/**
	 * Sort groups for display as a stable baseline: newest first (by creation
	 * time). The final user-managed order is applied by the section-order
	 * service; this baseline is used where that order is not available.
	 */
	private sortGroups(groups: ISessionGroup[]): ISessionGroup[] {
		return groups.sort((a, b) => b.createdAt - a.createdAt);
	}

	// -- Storage --

	private load(): void {
		const raw = this.storageService.get(SessionGroupsService.STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return;
		}
		try {
			const parsed = JSON.parse(raw) as Partial<ISerializedState>;
			if (Array.isArray(parsed.groups)) {
				for (const group of parsed.groups) {
					if (group && typeof group.id === 'string' && typeof group.name === 'string') {
						this._groups.set(group.id, {
							id: group.id,
							name: group.name,
							createdAt: typeof group.createdAt === 'number' ? group.createdAt : Date.now(),
						});
					}
				}
			}
			if (parsed.membership && typeof parsed.membership === 'object') {
				for (const [sessionId, groupId] of Object.entries(parsed.membership)) {
					if (typeof groupId === 'string' && this._groups.has(groupId)) {
						this._membership.set(sessionId, groupId);
					}
				}
			}
			const explicitlyUngroupedSessionIds = parsed[EXPLICITLY_UNGROUPED_FIELD];
			if (Array.isArray(explicitlyUngroupedSessionIds)) {
				for (const sessionId of explicitlyUngroupedSessionIds) {
					if (typeof sessionId === 'string') {
						this._explicitlyUngroupedSessionIds.add(sessionId);
					}
				}
			}
		} catch {
			// ignore corrupt data
		}
	}

	private save(): void {
		if (this._groups.size === 0 && this._explicitlyUngroupedSessionIds.size === 0) {
			this.storageService.remove(SessionGroupsService.STORAGE_KEY, StorageScope.PROFILE);
			return;
		}
		const state: ISerializedState = {
			groups: [...this._groups.values()],
			membership: Object.fromEntries(this._membership),
			[EXPLICITLY_UNGROUPED_FIELD]: [...this._explicitlyUngroupedSessionIds],
		};
		this.storageService.store(SessionGroupsService.STORAGE_KEY, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
	}
}

registerSingleton(ISessionGroupsService, SessionGroupsService, InstantiationType.Delayed);
