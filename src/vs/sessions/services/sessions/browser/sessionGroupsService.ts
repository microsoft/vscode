/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISession } from '../common/session.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISessionSectionOrderService, ISessionSectionPositions, resolveSectionOrder, restoreSectionOrderPositions, spliceSectionOrder } from './sessionSectionOrderService.js';

/**
 * A user-created group of sessions in the sessions list. Groups render like
 * section headers and can be reordered, renamed and deleted. Their order among
 * their siblings is fully user-managed (see {@link ISessionGroupsService.getTree});
 * this type only carries identity, name, creation time and nesting. Membership
 * of a session in a group is tracked separately (see {@link ISessionGroupsService}).
 */
export interface ISessionGroup {
	/** Stable identifier (uuid). */
	readonly id: string;
	/** User-provided display name. */
	readonly name: string;
	/** Creation timestamp (ms). Used as the default order (newest first). */
	readonly createdAt: number;
	/**
	 * The group this group is nested in, or `undefined` for a top-level group.
	 * Always an existing group other than the group itself or one of its subgroups.
	 */
	readonly parentId?: string;
}

export interface ISessionGroupsChangeEvent {
	/** Groups added, removed, renamed, moved or reordered. */
	readonly groupsChanged: boolean;
	/** Session ids whose group membership changed. */
	readonly membershipChanged: ReadonlySet<string>;
}

/** Groups and memberships removed by {@link ISessionGroupsService.deleteGroup}, which {@link ISessionGroupsService.restoreGroups} brings back. */
export interface IDeletedSessionGroups {
	/** The deleted group and its subgroups, each parent before its subgroups. */
	readonly groups: readonly ISessionGroup[];
	/** The deleted groups' sessions, mapped to the group each belonged to. */
	readonly membership: ReadonlyMap<string, string>;
	/** The manual order of the subgroups of the deleted group's parent and of each deleted group, by group id. */
	readonly subgroupOrders: ReadonlyMap<string, readonly string[]>;
	/** The deleted group's manual position among the sessions list's top-level headers. */
	readonly topLevelPosition: ISessionSectionPositions;
}

/** Where a moved group lands among its new parent's subgroups: next to one of them. */
export interface ISessionGroupPlacement {
	/** A subgroup of the new parent. */
	readonly siblingId: string;
	readonly position: 'before' | 'after';
}

const SESSION_GROUP_SECTION_PREFIX = 'group:';

/** The identity of a group's header in the sessions list, under which the list persists the header's state and the section order stores a top-level group's position. */
export function getSessionGroupSectionId(groupId: string): string {
	return SESSION_GROUP_SECTION_PREFIX + groupId;
}

/** The group whose header has the section id, or `undefined` for other sections. */
export function getSessionGroupIdOfSection(sectionId: string): string | undefined {
	return sectionId.startsWith(SESSION_GROUP_SECTION_PREFIX) ? sectionId.slice(SESSION_GROUP_SECTION_PREFIX.length) : undefined;
}

/**
 * The hierarchy that the {@link ISessionGroup.parentId}s of some groups describe.
 * A group whose parent is not among them counts as a top-level group.
 */
export class SessionGroupTree {

	private readonly groupsById = new Map<string, ISessionGroup>();
	private readonly subgroupsByParentId = new Map<string | undefined, readonly ISessionGroup[]>();

	/**
	 * @param orderSubgroups Puts the subgroups of the group `parentId`, or the
	 * top-level groups when it is `undefined`, into their user-managed order.
	 * They are given newest first, which is also the default order.
	 */
	constructor(groups: Iterable<ISessionGroup>, orderSubgroups: (subgroups: readonly ISessionGroup[], parentId: string | undefined) => readonly ISessionGroup[] = subgroups => subgroups) {
		for (const group of groups) {
			this.groupsById.set(group.id, group);
		}
		const subgroupsByParentId = new Map<string | undefined, ISessionGroup[]>();
		for (const group of this.groupsById.values()) {
			const parentId = group.parentId !== undefined && this.groupsById.has(group.parentId) ? group.parentId : undefined;
			let subgroups = subgroupsByParentId.get(parentId);
			if (!subgroups) {
				subgroups = [];
				subgroupsByParentId.set(parentId, subgroups);
			}
			subgroups.push(group);
		}
		for (const [parentId, subgroups] of subgroupsByParentId) {
			this.subgroupsByParentId.set(parentId, orderSubgroups(subgroups.sort((a, b) => b.createdAt - a.createdAt), parentId));
		}
	}

	/** The groups nested directly in `parentId`, or the top-level groups when it is `undefined`, in their user-managed order. */
	getSubgroups(parentId: string | undefined): readonly ISessionGroup[] {
		return this.subgroupsByParentId.get(parentId) ?? [];
	}

	/** The group and its ancestors, from its top-level group down to the group itself, or `[]` when the group is unknown. */
	getPath(groupId: string): ISessionGroup[] {
		const path: ISessionGroup[] = [];
		const visited = new Set<string>();
		let group = this.groupsById.get(groupId);
		while (group && !visited.has(group.id)) {
			visited.add(group.id);
			path.unshift(group);
			group = group.parentId === undefined ? undefined : this.groupsById.get(group.parentId);
		}
		return path;
	}

	/** The group and its subgroups at any depth, each parent before its subgroups, or `[]` when the group is unknown. */
	getSubtree(groupId: string): ISessionGroup[] {
		const subtree: ISessionGroup[] = [];
		const visited = new Set<string>();
		const visit = (group: ISessionGroup) => {
			if (visited.has(group.id)) {
				return;
			}
			visited.add(group.id);
			subtree.push(group);
			for (const subgroup of this.getSubgroups(group.id)) {
				visit(subgroup);
			}
		};
		const root = this.groupsById.get(groupId);
		if (root) {
			visit(root);
		}
		return subtree;
	}

	/**
	 * Whether a group can move into `parentId`, or to the top level when it is
	 * `undefined`. A group never moves into itself or one of its subgroups.
	 */
	canMove(groupId: string, parentId: string | undefined): boolean {
		if (!this.groupsById.has(groupId)) {
			return false;
		}
		return parentId === undefined || (this.groupsById.has(parentId) && !this.getPath(parentId).some(ancestor => ancestor.id === groupId));
	}
}

/**
 * Service that owns user-created session groups, their nesting, the order of
 * each group's subgroups, and the mapping of sessions to groups. State is
 * purely local (persisted to profile storage) and not synced to providers.
 * Top-level groups share their order with the sessions list's other top-level
 * headers, which the list arranges in {@link ISessionSectionOrderService}.
 *
 * Groups may nest in other groups without a depth limit. A session belongs to at
 * most one group at any depth. Pinned sessions retain their membership, while
 * archiving a session removes it from its group.
 */
export interface ISessionGroupsService {
	readonly _serviceBrand: undefined;

	/** Fires when groups, their nesting or the order of subgroups, or membership change. */
	readonly onDidChange: Event<ISessionGroupsChangeEvent>;

	/** All groups at any depth, including currently-empty ones. */
	getGroups(): ISessionGroup[];

	/**
	 * The hierarchy of all groups, with the subgroups of each group, and the
	 * top-level groups, in their user-managed order. Besides {@link onDidChange},
	 * the order of top-level groups changes with the section order.
	 */
	getTree(): SessionGroupTree;

	/** Look up a group by id (including currently-empty groups). */
	getGroup(groupId: string): ISessionGroup | undefined;

	/**
	 * Create a new group with the given name. Returns the created group. When
	 * `memberSessionIds` are given they are added to the new group. When
	 * `parentId` names an existing group, the new group is nested in it, first
	 * among its subgroups.
	 */
	createGroup(name: string, memberSessionIds?: Iterable<string>, parentId?: string): ISessionGroup;

	/** Rename an existing group. No-op if the group does not exist. */
	renameGroup(groupId: string, name: string): void;

	/**
	 * Nest a group in another group, or make it a top-level group when `parentId`
	 * is `undefined`. In `parentId`, it lands next to `placement.siblingId` when
	 * that is another of its subgroups, and first among them otherwise. At the
	 * top level, the sessions list arranges it among its other top-level headers.
	 * No-op when {@link SessionGroupTree.canMove} refuses the move.
	 */
	moveGroup(groupId: string, parentId: string | undefined, placement?: ISessionGroupPlacement): void;

	/**
	 * Delete a group and its subgroups at any depth, removing their sessions'
	 * membership. Returns what was deleted so that {@link restoreGroups} can bring
	 * it back, or `undefined` when the group does not exist.
	 */
	deleteGroup(groupId: string): IDeletedSessionGroups | undefined;

	/**
	 * Restore deleted groups with their ids and positions, and the membership of
	 * their sessions that are not archived and have not joined another group
	 * since. A restored group whose parent no longer exists becomes a top-level
	 * group.
	 */
	restoreGroups(deleted: IDeletedSessionGroups): void;

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

	/** Whether automatic placement must preserve the session's ungrouped state. */
	isExplicitlyUngrouped(sessionId: string): boolean;

	/** The session ids that belong directly to the given group, not to its subgroups. */
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
	/** groupId -> the manual order of its subgroups' ids */
	readonly subgroupOrders?: Readonly<Record<string, readonly string[]>>;
}

export class SessionGroupsService extends Disposable implements ISessionGroupsService {

	declare readonly _serviceBrand: undefined;

	private static readonly STORAGE_KEY = 'sessionsListControl.groups';

	private readonly _onDidChange = this._register(new Emitter<ISessionGroupsChangeEvent>());
	readonly onDidChange: Event<ISessionGroupsChangeEvent> = this._onDidChange.event;

	private readonly _groups = new Map<string, ISessionGroup>();
	/**
	 * groupId -> the manual order of its subgroups' ids. Subgroups missing from
	 * the order, such as new ones, take their default position (newest first).
	 */
	private readonly _subgroupOrders = new Map<string, string[]>();
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
		@ISessionSectionOrderService private readonly sectionOrderService: ISessionSectionOrderService,
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
			const transientMembershipChanged = new Set<string>();
			const inFlightSessionIds = new Set(this.sessionsManagementService.getInFlightNewSessionRequests().map(session => session.sessionId));
			for (const session of e.added) {
				if (inFlightSessionIds.has(session.sessionId) && this.capturePendingNewSessionGroup(session.sessionId)) {
					transientMembershipChanged.add(session.sessionId);
				}
			}
			for (const session of e.removed) {
				if (this._inFlightSessionGroups.delete(session.sessionId)) {
					transientMembershipChanged.add(session.sessionId);
				}
			}
			const visibleSessionIds = new Set(this.sessionsManagementService.getSessions().map(session => session.sessionId));
			for (const sessionId of this._inFlightSessionGroups.keys()) {
				if (!visibleSessionIds.has(sessionId)) {
					this._inFlightSessionGroups.delete(sessionId);
					transientMembershipChanged.add(sessionId);
				}
			}
			const changed = new Set<string>();
			const archivedStateChanged = this.removeArchivedMembership([...e.added, ...e.changed], changed);
			this.updateDefaultPlacement(this.sessionsManagementService.getSessions(), changed);
			if (archivedStateChanged || changed.size > 0) {
				this.save();
			}
			for (const sessionId of transientMembershipChanged) {
				changed.add(sessionId);
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
			if (this.capturePendingNewSessionGroup(session.sessionId)) {
				this._onDidChange.fire({ groupsChanged: false, membershipChanged: new Set([session.sessionId]) });
			}
		}));

		// Follow both pre-send draft replacement and committed-session graduation.
		this._register(this.sessionsManagementService.onDidReplaceNewDraftSession(({ from, to }) => this.replaceInFlightSession(from, to)));
		this._register(this.sessionsManagementService.onDidReplaceSession(({ from, to }) => this.replaceInFlightSession(from, to)));

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
				if (session.isArchived.get() || this._membership.has(session.sessionId) || this._inFlightSessionGroups.has(session.sessionId) || this._explicitlyUngroupedSessionIds.has(session.sessionId)) {
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

	getTree(): SessionGroupTree {
		return new SessionGroupTree(this._groups.values(), (subgroups, parentId) => {
			const subgroupsById = new Map(subgroups.map(group => [group.id, group]));
			const orderedIds = parentId === undefined
				? this.sectionOrderService.resolveOrder(subgroups.map(group => getSessionGroupSectionId(group.id))).flatMap(sectionId => getSessionGroupIdOfSection(sectionId) ?? [])
				: resolveSectionOrder(this._subgroupOrders.get(parentId) ?? [], [...subgroupsById.keys()]);
			return orderedIds.flatMap(id => subgroupsById.get(id) ?? []);
		});
	}

	getGroup(groupId: string): ISessionGroup | undefined {
		return this._groups.get(groupId);
	}

	createGroup(name: string, memberSessionIds?: Iterable<string>, parentId?: string): ISessionGroup {
		const group = withParent({ id: generateUuid(), name, createdAt: Date.now() }, parentId !== undefined && this._groups.has(parentId) ? parentId : undefined);
		this._groups.set(group.id, group);

		const membershipChanged = new Set<string>();
		if (memberSessionIds) {
			for (const sessionId of memberSessionIds) {
				this.setCurrentMembership(sessionId, group.id, membershipChanged);
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

	moveGroup(groupId: string, parentId: string | undefined, placement?: ISessionGroupPlacement): void {
		const tree = this.getTree();
		const group = this._groups.get(groupId);
		if (!group || !tree.canMove(groupId, parentId)) {
			return;
		}
		let orderChanged = false;
		if (parentId !== undefined) {
			const currentOrder = tree.getSubgroups(parentId).map(subgroup => subgroup.id);
			const siblingIds = currentOrder.filter(id => id !== groupId);
			const order = (placement && spliceSectionOrder(siblingIds, groupId, placement.siblingId, placement.position)) ?? [groupId, ...siblingIds];
			if (!equals(order, currentOrder)) {
				this._subgroupOrders.set(parentId, order);
				orderChanged = true;
			}
		}
		const parentChanged = group.parentId !== parentId;
		if (parentChanged) {
			this._groups.set(groupId, withParent(group, parentId));
		}
		if (parentChanged || orderChanged) {
			this.save();
			this._onDidChange.fire({ groupsChanged: true, membershipChanged: new Set() });
		}
	}

	deleteGroup(groupId: string): IDeletedSessionGroups | undefined {
		const groups = this.getTree().getSubtree(groupId);
		if (groups.length === 0) {
			return undefined;
		}
		const deletedIds = new Set(groups.map(group => group.id));
		const parentId = groups[0].parentId;
		const subgroupOrders = new Map<string, readonly string[]>();
		for (const id of parentId === undefined ? deletedIds : [parentId, ...deletedIds]) {
			const order = this._subgroupOrders.get(id);
			if (order) {
				subgroupOrders.set(id, [...order]);
			}
		}
		// Capture the top-level position before the sessions list prunes it from the section order.
		const topLevelPosition = this.sectionOrderService.capturePositions([getSessionGroupSectionId(groupId)]);
		for (const id of deletedIds) {
			this._groups.delete(id);
			this._subgroupOrders.delete(id);
		}
		if (this._pendingNewSessionGroupId !== undefined && deletedIds.has(this._pendingNewSessionGroupId)) {
			this._pendingNewSessionGroupId = undefined;
		}
		for (const [sessionId, gid] of this._inFlightSessionGroups) {
			if (deletedIds.has(gid)) {
				this._inFlightSessionGroups.delete(sessionId);
			}
		}
		const membership = new Map<string, string>();
		for (const [sessionId, gid] of this._membership) {
			if (deletedIds.has(gid)) {
				membership.set(sessionId, gid);
				this._membership.delete(sessionId);
				this.markExplicitlyUngrouped(sessionId);
			}
		}
		this.save();
		this._onDidChange.fire({ groupsChanged: true, membershipChanged: new Set(membership.keys()) });
		return { groups, membership, subgroupOrders, topLevelPosition };
	}

	restoreGroups(deleted: IDeletedSessionGroups): void {
		const restoredIds = new Set<string>();
		// Parents come before their subgroups, so a subgroup finds its restored parent.
		for (const group of deleted.groups) {
			if (this._groups.has(group.id)) {
				continue;
			}
			this._groups.set(group.id, withParent(group, group.parentId !== undefined && this._groups.has(group.parentId) ? group.parentId : undefined));
			restoredIds.add(group.id);
		}
		if (restoredIds.size === 0) {
			return;
		}
		for (const [parentId, order] of deleted.subgroupOrders) {
			if (this._groups.has(parentId)) {
				this._subgroupOrders.set(parentId, restoreSectionOrderPositions(this._subgroupOrders.get(parentId) ?? [], order, restoredIds));
			}
		}
		const archivedSessionIds = new Set(this.sessionsManagementService.getSessions().filter(session => session.isArchived.get()).map(session => session.sessionId));
		const membershipChanged = new Set<string>();
		for (const [sessionId, groupId] of deleted.membership) {
			if (restoredIds.has(groupId) && !archivedSessionIds.has(sessionId) && this.getGroupOfSession(sessionId) === undefined) {
				this.setMembership(sessionId, groupId, membershipChanged);
			}
		}
		this.save();
		this.sectionOrderService.restorePositions(deleted.topLevelPosition);
		this._onDidChange.fire({ groupsChanged: true, membershipChanged });
	}

	addToGroup(sessionIdOrIds: string | Iterable<string>, groupId: string): void {
		if (!this._groups.has(groupId)) {
			return;
		}
		const sessionIds = typeof sessionIdOrIds === 'string' ? [sessionIdOrIds] : sessionIdOrIds;
		const membershipChanged = new Set<string>();
		for (const sessionId of sessionIds) {
			this.setCurrentMembership(sessionId, groupId, membershipChanged);
		}
		this.updateDefaultPlacement(this.sessionsManagementService.getSessions(), membershipChanged);
		if (membershipChanged.size === 0) {
			return;
		}
		this.save();
		this._onDidChange.fire({ groupsChanged: false, membershipChanged });
	}

	removeFromGroup(sessionId: string): void {
		const membershipDeleted = this._membership.delete(sessionId);
		const transientMembershipDeleted = this._inFlightSessionGroups.delete(sessionId);
		if (!membershipDeleted && !transientMembershipDeleted) {
			return;
		}
		this.markExplicitlyUngrouped(sessionId);
		this.save();
		this._onDidChange.fire({ groupsChanged: false, membershipChanged: new Set([sessionId]) });
	}

	getGroupOfSession(sessionId: string): string | undefined {
		return this._membership.get(sessionId) ?? this._inFlightSessionGroups.get(sessionId);
	}

	isExplicitlyUngrouped(sessionId: string): boolean {
		return this._explicitlyUngroupedSessionIds.has(sessionId);
	}

	getSessionIdsInGroup(groupId: string): string[] {
		const result = new Set<string>();
		for (const [sessionId, gid] of this._membership) {
			if (gid === groupId) {
				result.add(sessionId);
			}
		}
		for (const [sessionId, gid] of this._inFlightSessionGroups) {
			if (gid === groupId) {
				result.add(sessionId);
			}
		}
		return [...result];
	}

	setPendingNewSessionGroup(groupId: string): void {
		this._pendingNewSessionGroupId = this._groups.has(groupId) ? groupId : undefined;
	}

	// -- Helpers --

	private capturePendingNewSessionGroup(sessionId: string): boolean {
		if (this._pendingNewSessionGroupId === undefined) {
			return false;
		}
		this._inFlightSessionGroups.set(sessionId, this._pendingNewSessionGroupId);
		this._pendingNewSessionGroupId = undefined;
		return true;
	}

	private replaceInFlightSession(from: ISession, to: ISession): void {
		if (from.sessionId === to.sessionId) {
			return;
		}
		const groupId = this._inFlightSessionGroups.get(from.sessionId);
		if (groupId === undefined) {
			return;
		}
		this._inFlightSessionGroups.delete(from.sessionId);
		this._inFlightSessionGroups.set(to.sessionId, groupId);
		this._onDidChange.fire({ groupsChanged: false, membershipChanged: new Set([from.sessionId, to.sessionId]) });
	}

	private setCurrentMembership(sessionId: string, groupId: string, changed: Set<string>): void {
		const inFlightGroupId = this._inFlightSessionGroups.get(sessionId);
		if (inFlightGroupId !== undefined) {
			if (inFlightGroupId !== groupId) {
				this._inFlightSessionGroups.set(sessionId, groupId);
				changed.add(sessionId);
			}
			return;
		}
		this.setMembership(sessionId, groupId, changed);
	}

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
	 * Sort groups as a stable baseline: newest first (by creation time). The
	 * user-managed order is available from {@link getTree}.
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
						this._groups.set(group.id, withParent({
							id: group.id,
							name: group.name,
							createdAt: typeof group.createdAt === 'number' ? group.createdAt : Date.now(),
						}, typeof group.parentId === 'string' ? group.parentId : undefined));
					}
				}
				this.detachInvalidParents();
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
			if (parsed.subgroupOrders && typeof parsed.subgroupOrders === 'object') {
				for (const [parentId, order] of Object.entries(parsed.subgroupOrders)) {
					if (this._groups.has(parentId) && Array.isArray(order)) {
						this._subgroupOrders.set(parentId, order.filter((id): id is string => typeof id === 'string'));
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
		const subgroupOrders = this.getLiveSubgroupOrders();
		const state: ISerializedState = {
			groups: [...this._groups.values()],
			membership: Object.fromEntries(this._membership),
			[EXPLICITLY_UNGROUPED_FIELD]: [...this._explicitlyUngroupedSessionIds],
			...(subgroupOrders.length > 0 ? { subgroupOrders: Object.fromEntries(subgroupOrders) } : {}),
		};
		this.storageService.store(SessionGroupsService.STORAGE_KEY, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
	}

	/** The subgroup orders of existing groups, each with only the ids of its current subgroups. */
	private getLiveSubgroupOrders(): [string, string[]][] {
		const orders: [string, string[]][] = [];
		for (const [parentId, order] of this._subgroupOrders) {
			const subgroupIds = order.filter(id => this._groups.get(id)?.parentId === parentId);
			if (this._groups.has(parentId) && subgroupIds.length > 0) {
				orders.push([parentId, subgroupIds]);
			}
		}
		return orders;
	}

	/**
	 * Makes a group top-level when its stored parent no longer exists or when its
	 * stored ancestors loop back to it, so every group descends from a top-level group.
	 */
	private detachInvalidParents(): void {
		for (const { id } of [...this._groups.values()]) {
			const ancestorIds = new Set<string>();
			let current = this._groups.get(id);
			while (current?.parentId !== undefined) {
				ancestorIds.add(current.id);
				const parent = this._groups.get(current.parentId);
				if (!parent || ancestorIds.has(parent.id)) {
					this._groups.set(current.id, withParent(current, undefined));
					break;
				}
				current = parent;
			}
		}
	}
}

/** The group nested in `parentId`, or as a top-level group when it is `undefined`. */
function withParent(group: ISessionGroup, parentId: string | undefined): ISessionGroup {
	const { id, name, createdAt } = group;
	return parentId === undefined ? { id, name, createdAt } : { id, name, createdAt, parentId };
}

registerSingleton(ISessionGroupsService, SessionGroupsService, InstantiationType.Delayed);
