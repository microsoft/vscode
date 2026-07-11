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
	/** Creation timestamp (ms). Used to evict the oldest empty group and as the default order (newest first). */
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
 * A session belongs to at most one group. Group membership is independent of
 * where the session renders: a grouped session that becomes pinned or archived
 * is rendered in the Pinned/Done section but retains its membership, so it
 * returns to the group once unpinned/restored.
 */
export interface ISessionGroupsService {
	readonly _serviceBrand: undefined;

	/** Fires when groups or membership change. */
	readonly onDidChange: Event<ISessionGroupsChangeEvent>;

	/**
	 * All groups in display order (including currently-empty ones). The list
	 * view omits groups with no visible members when rendering.
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

interface ISerializedState {
	readonly groups: readonly ISessionGroup[];
	/** sessionId -> groupId */
	readonly membership: Readonly<Record<string, string>>;
}

export class SessionGroupsService extends Disposable implements ISessionGroupsService {

	declare readonly _serviceBrand: undefined;

	private static readonly STORAGE_KEY = 'sessionsListControl.groups';

	/**
	 * Maximum number of empty groups (no members) retained in storage. When a
	 * new empty group would exceed this, the oldest empty group is evicted.
	 */
	private static readonly MAX_EMPTY_GROUPS = 3;

	private readonly _onDidChange = this._register(new Emitter<ISessionGroupsChangeEvent>());
	readonly onDidChange: Event<ISessionGroupsChangeEvent> = this._onDidChange.event;

	private readonly _groups = new Map<string, ISessionGroup>();
	/** sessionId -> groupId */
	private readonly _membership = new Map<string, string>();

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

		this._register(this.sessionsManagementService.onDidChangeSessions(e => {
			if (e.removed.length === 0) {
				return;
			}
			const changed = new Set<string>();
			for (const session of e.removed) {
				this._inFlightSessionGroups.delete(session.sessionId);
				if (this._membership.delete(session.sessionId)) {
					changed.add(session.sessionId);
				}
			}
			if (changed.size > 0) {
				const evicted = this.evictExcessEmptyGroups();
				this.save();
				this._onDidChange.fire({ groupsChanged: evicted, membershipChanged: changed });
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

		this.evictExcessEmptyGroups();
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
		if (membershipChanged.size === 0) {
			return;
		}
		const evicted = this.evictExcessEmptyGroups();
		this.save();
		this._onDidChange.fire({ groupsChanged: evicted, membershipChanged });
	}

	removeFromGroup(sessionId: string): void {
		if (!this._membership.delete(sessionId)) {
			return;
		}
		const evicted = this.evictExcessEmptyGroups();
		this.save();
		this._onDidChange.fire({ groupsChanged: evicted, membershipChanged: new Set([sessionId]) });
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
		if (this._membership.get(sessionId) !== groupId) {
			this._membership.set(sessionId, groupId);
			changed.add(sessionId);
		}
	}

	private hasMembers(groupId: string): boolean {
		for (const gid of this._membership.values()) {
			if (gid === groupId) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Keep at most {@link MAX_EMPTY_GROUPS} groups with no members, evicting the
	 * oldest empty groups (by `createdAt`) beyond that cap. Returns whether any
	 * group was deleted.
	 */
	private evictExcessEmptyGroups(): boolean {
		const empty = [...this._groups.values()]
			.filter(group => !this.hasMembers(group.id))
			.sort((a, b) => a.createdAt - b.createdAt);
		let deleted = false;
		for (let i = 0; i < empty.length - SessionGroupsService.MAX_EMPTY_GROUPS; i++) {
			this._groups.delete(empty[i].id);
			deleted = true;
		}
		return deleted;
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
		} catch {
			// ignore corrupt data
		}
	}

	private save(): void {
		if (this._groups.size === 0) {
			this.storageService.remove(SessionGroupsService.STORAGE_KEY, StorageScope.PROFILE);
			return;
		}
		const state: ISerializedState = {
			groups: [...this._groups.values()],
			membership: Object.fromEntries(this._membership),
		};
		this.storageService.store(SessionGroupsService.STORAGE_KEY, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
	}
}

registerSingleton(ISessionGroupsService, SessionGroupsService, InstantiationType.Delayed);
