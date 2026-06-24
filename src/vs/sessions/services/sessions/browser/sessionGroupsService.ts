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
 * section headers and can be reordered, renamed and deleted. Membership of a
 * session in a group is tracked separately (see {@link ISessionGroupsService}).
 */
export interface ISessionGroup {
	/** Stable identifier (uuid). */
	readonly id: string;
	/** User-provided display name. */
	readonly name: string;
	/**
	 * Manual sort-key override applied when the user drags a group to reorder
	 * it. `undefined` means the group falls back to its natural placement (the
	 * best/highest sort key among its members). Expressed in the same numeric
	 * space as session sort keys (timestamps) so groups interleave with the
	 * date/workspace sections. Higher values sort higher in the list.
	 */
	readonly sortKeyOverride: number | undefined;
	/** Creation timestamp (ms). Used to evict the oldest empty group. */
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

	/** Remove a session from its group, if any. */
	removeFromGroup(sessionId: string): void;

	/** The id of the group the session belongs to, or `undefined`. */
	getGroupOfSession(sessionId: string): string | undefined;

	/** The session ids that belong to the given group. */
	getSessionIdsInGroup(groupId: string): string[];

	/**
	 * Persist a manual sort-key override for a group (or clear it with
	 * `undefined`). Used when the user drags a group to reorder it.
	 */
	setGroupSortKey(groupId: string, sortKeyOverride: number | undefined): void;
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
	}

	getGroups(): ISessionGroup[] {
		return this.sortGroups([...this._groups.values()]);
	}

	getGroup(groupId: string): ISessionGroup | undefined {
		return this._groups.get(groupId);
	}

	createGroup(name: string, memberSessionIds?: Iterable<string>): ISessionGroup {
		const group: ISessionGroup = { id: generateUuid(), name, sortKeyOverride: undefined, createdAt: Date.now() };
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

	addToGroup(sessionId: string, groupId: string): void {
		if (!this._groups.has(groupId) || this._membership.get(sessionId) === groupId) {
			return;
		}
		const membershipChanged = new Set<string>();
		this.setMembership(sessionId, groupId, membershipChanged);
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

	setGroupSortKey(groupId: string, sortKeyOverride: number | undefined): void {
		const group = this._groups.get(groupId);
		if (!group || group.sortKeyOverride === sortKeyOverride) {
			return;
		}
		this._groups.set(groupId, { ...group, sortKeyOverride });
		this.save();
		this._onDidChange.fire({ groupsChanged: true, membershipChanged: new Set() });
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
	 * Sort groups for display as a stable baseline: groups with a manual
	 * `sortKeyOverride` first (highest key first), then the rest by creation
	 * time (newest first). The list view computes the final interleaved
	 * placement using member sort keys; this baseline is used where member keys
	 * are not available (e.g. the "Add to Group" menu fallback).
	 */
	private sortGroups(groups: ISessionGroup[]): ISessionGroup[] {
		return groups.sort((a, b) => {
			const aHas = a.sortKeyOverride !== undefined;
			const bHas = b.sortKeyOverride !== undefined;
			if (aHas && bHas) {
				return b.sortKeyOverride! - a.sortKeyOverride!;
			}
			if (aHas !== bHas) {
				return aHas ? -1 : 1;
			}
			return b.createdAt - a.createdAt;
		});
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
							sortKeyOverride: typeof group.sortKeyOverride === 'number' ? group.sortKeyOverride : undefined,
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

/**
 * Best (highest) sort key among a group's currently-visible members, used to
 * place the group among the other top-level list items. Returns `undefined`
 * when the group has no visible members.
 */
export function groupSortKey(memberKeys: readonly number[]): number | undefined {
	if (memberKeys.length === 0) {
		return undefined;
	}
	return Math.max(...memberKeys);
}

registerSingleton(ISessionGroupsService, SessionGroupsService, InstantiationType.Delayed);
