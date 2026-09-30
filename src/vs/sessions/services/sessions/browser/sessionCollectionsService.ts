/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, IReader, observableSignal, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { getNextSessionColor, isSessionPaletteColor, SessionPaletteColor } from '../common/sessionColors.js';
import { ISession, SessionStatus } from '../common/session.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISessionGroupsService } from './sessionGroupsService.js';

/**
 * A user-defined collection that partitions the sessions list, similar to
 * browser workspaces. The list shows one collection at a time.
 */
export interface ISessionCollection {
	readonly id: string;
	readonly name: string;
	/** A codicon id, e.g. `graph`. */
	readonly icon: string;
	readonly color: SessionPaletteColor;
}

/** Restores the state an operation changed. */
export type SessionCollectionsUndo = () => void;

/** Codicons offered for collections. */
export const SESSION_COLLECTION_ICONS: readonly string[] = [
	Codicon.layers.id, Codicon.graph.id, Codicon.briefcase.id, Codicon.home.id, Codicon.person.id, Codicon.heart.id, Codicon.rocket.id, Codicon.beaker.id,
	Codicon.book.id, Codicon.bug.id, Codicon.coffee.id, Codicon.star.id, Codicon.target.id, Codicon.tools.id, Codicon.zap.id, Codicon.lightbulb.id,
	Codicon.inbox.id, Codicon.globe.id, Codicon.library.id, Codicon.mortarBoard.id, Codicon.organization.id, Codicon.package.id, Codicon.flame.id, Codicon.telescope.id,
];

/**
 * Owns collections: their definitions, the active collection, the collection
 * each group, workspace section and session belongs to, and the last session
 * opened in each collection. State is profile-scoped local presentation state.
 *
 * A session's collection resolves from logical state, independent of pinning,
 * sorting or grouping mode:
 *
 * 1. its custom group's collection, while it is a member of a group;
 * 2. its explicit assignment (moving a session, or creating it while a
 *    collection is active);
 * 3. the collection of the session that created it;
 * 4. its workspace section's collection;
 * 5. the default collection.
 *
 * Leaving a group (ungrouping, archiving, deleting the group) keeps a session
 * in the group's collection by recording an explicit assignment. Assignments
 * survive sessions temporarily missing from the provider catalog and are
 * removed only on definitive deletion.
 */
export interface ISessionCollectionsService {
	readonly _serviceBrand: undefined;

	/** All collections in display order; never empty. */
	readonly collections: IObservable<readonly ISessionCollection[]>;

	/** The collection that sessions, groups and workspaces belong to unless assigned elsewhere. */
	readonly defaultCollectionId: IObservable<string>;

	/** The collection the sessions list shows. Always a valid collection. */
	readonly activeCollectionId: IObservable<string>;

	/** Changes whenever any group, workspace or session assignment changes. */
	readonly onDidChangeMembership: Event<void>;

	getCollection(collectionId: string): ISessionCollection | undefined;

	setActiveCollection(collectionId: string): void;

	createCollection(options?: Partial<Omit<ISessionCollection, 'id'>>): ISessionCollection;

	updateCollection(collectionId: string, update: Partial<Omit<ISessionCollection, 'id'>>): void;

	/** Moves a collection to an index in the display order. */
	moveCollection(collectionId: string, index: number): void;

	/**
	 * Deletes a collection, moving its groups, workspaces and sessions to
	 * `moveToId`. The last collection cannot be deleted.
	 */
	deleteCollection(collectionId: string, moveToId: string): SessionCollectionsUndo | undefined;

	/** The collection a session belongs to. Pass a reader to track dependencies. */
	getSessionCollection(session: ISession, reader?: IReader): string;

	getGroupCollection(groupId: string): string;

	/** The collection of a workspace section (`workspace:<label>`) for its unassigned sessions. */
	getWorkspaceCollection(sectionId: string): string;

	/**
	 * Moves sessions to a collection. Sessions in a group of another collection
	 * leave the group.
	 */
	moveSessionsToCollection(sessions: readonly ISession[], collectionId: string): SessionCollectionsUndo;

	/** Moves a group, and with it its members, to a collection. */
	moveGroupToCollection(groupId: string, collectionId: string): SessionCollectionsUndo;

	/**
	 * Moves a workspace section to a collection, together with `members`: the
	 * section's ungrouped sessions currently shown in the source collection.
	 */
	moveWorkspaceToCollection(sectionId: string, collectionId: string, members: readonly ISession[]): SessionCollectionsUndo;

	/** The last session opened while the collection was active. */
	getLastSession(collectionId: string): URI | undefined;

	setLastSession(collectionId: string, resource: URI): void;
}

export const ISessionCollectionsService = createDecorator<ISessionCollectionsService>('sessionCollectionsService');

const DEFAULT_COLLECTION_ID = 'default';

interface ISerializedState {
	readonly version: 1;
	readonly collections: readonly ISessionCollection[];
	readonly defaultCollectionId: string;
	readonly activeCollectionId: string;
	/** groupId -> collectionId */
	readonly groups: Readonly<Record<string, string>>;
	/** workspace section id -> collectionId */
	readonly workspaces: Readonly<Record<string, string>>;
	/** sessionId -> collectionId */
	readonly sessions: Readonly<Record<string, string>>;
	/** collectionId -> session resource */
	readonly lastSessions: Readonly<Record<string, string>>;
}

export function getWorkspaceSectionIdOfSession(session: ISession, reader?: IReader): string | undefined {
	const label = reader ? session.workspace.read(reader)?.label : session.workspace.get()?.label;
	return label ? `workspace:${label}` : undefined;
}

export class SessionCollectionsService extends Disposable implements ISessionCollectionsService {

	declare readonly _serviceBrand: undefined;

	private static readonly STORAGE_KEY = 'sessionsListControl.collections';

	private readonly _collections = observableValue<readonly ISessionCollection[]>(this, []);
	readonly collections: IObservable<readonly ISessionCollection[]> = this._collections;
	private readonly _defaultCollectionId = observableValue<string>(this, DEFAULT_COLLECTION_ID);
	readonly defaultCollectionId: IObservable<string> = this._defaultCollectionId;
	private readonly _activeCollectionId = observableValue<string>(this, DEFAULT_COLLECTION_ID);
	readonly activeCollectionId: IObservable<string> = this._activeCollectionId;

	private readonly _onDidChangeMembership = this._register(new Emitter<void>());
	readonly onDidChangeMembership: Event<void> = this._onDidChangeMembership.event;
	private readonly membershipSignal = observableSignal(this);

	private readonly _groups = new Map<string, string>();
	private readonly _workspaces = new Map<string, string>();
	private readonly _sessions = new Map<string, string>();
	private readonly _lastSessions = new Map<string, string>();

	/** The group each session was last known to be in, to keep sessions leaving a group in its collection. */
	private readonly _knownGroupOfSession = new Map<string, string>();

	/** New sessions being sent: sessionId -> the collection that was active when sent. */
	private readonly _inFlightSessions = new Map<string, string>();

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ISessionGroupsService private readonly sessionGroupsService: ISessionGroupsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();
		this.load();
		const groupsChanged = this.syncGroups();
		if (groupsChanged) {
			this.save();
		}

		this._register(this.sessionGroupsService.onDidChange(e => {
			let changed = false;
			for (const sessionId of e.membershipChanged) {
				const groupId = this.sessionGroupsService.getGroupOfSession(sessionId);
				const previous = this._knownGroupOfSession.get(sessionId);
				if (previous && previous !== groupId && !groupId) {
					const collectionId = this._groups.get(previous);
					if (collectionId && this._sessions.get(sessionId) !== collectionId) {
						this._sessions.set(sessionId, collectionId);
					}
					changed = true;
				}
				if (groupId) {
					changed ||= previous !== groupId;
					this._knownGroupOfSession.set(sessionId, groupId);
				} else {
					this._knownGroupOfSession.delete(sessionId);
				}
			}
			if (e.groupsChanged) {
				changed = this.syncGroups() || changed;
			}
			if (changed) {
				this.save();
				this.fireMembershipChanged();
			}
		}));

		// A session missing from the provider catalog is an eviction, not a deletion.
		this._register(this.sessionsManagementService.onDidChangeSessions(e => {
			for (const session of e.removed) {
				this._inFlightSessions.delete(session.sessionId);
			}
		}));

		this._register(this.sessionsManagementService.onDidDeleteSession(session => {
			const resource = session.resource.toString();
			let changed = this._sessions.delete(session.sessionId);
			for (const [collectionId, last] of this._lastSessions) {
				if (last === resource) {
					this._lastSessions.delete(collectionId);
					changed = true;
				}
			}
			if (changed) {
				this.save();
				this.fireMembershipChanged();
			}
		}));

		// A new session joins the collection that is active when it is sent.
		this._register(this.sessionsManagementService.onWillSendRequest(session => {
			if (this.sessionsManagementService.newSession.get()?.sessionId === session.sessionId || session.status.get() === SessionStatus.Untitled) {
				this._inFlightSessions.set(session.sessionId, this._activeCollectionId.get());
			}
		}));
		this._register(this.sessionsManagementService.onDidReplaceSession(({ from, to }) => {
			const collectionId = this._inFlightSessions.get(from.sessionId);
			if (collectionId !== undefined && from.sessionId !== to.sessionId) {
				this._inFlightSessions.delete(from.sessionId);
				this._inFlightSessions.set(to.sessionId, collectionId);
			}
		}));
		this._register(this.sessionsManagementService.onDidStartSession(session => {
			const collectionId = this._inFlightSessions.get(session.sessionId);
			this._inFlightSessions.delete(session.sessionId);
			if (collectionId === undefined || !this.getCollection(collectionId) || this.getSessionCollection(session) === collectionId) {
				return;
			}
			this._sessions.set(session.sessionId, collectionId);
			this.save();
			this.fireMembershipChanged();
		}));
	}

	getCollection(collectionId: string): ISessionCollection | undefined {
		return this._collections.get().find(collection => collection.id === collectionId);
	}

	setActiveCollection(collectionId: string): void {
		if (!this.getCollection(collectionId) || this._activeCollectionId.get() === collectionId) {
			return;
		}
		this._activeCollectionId.set(collectionId, undefined);
		this.save();
	}

	createCollection(options?: Partial<Omit<ISessionCollection, 'id'>>): ISessionCollection {
		const collections = this._collections.get();
		const collection: ISessionCollection = {
			id: generateUuid(),
			name: options?.name?.trim() || localize('newCollectionName', "Collection {0}", collections.length + 1),
			icon: options?.icon && SESSION_COLLECTION_ICONS.includes(options.icon) ? options.icon : SESSION_COLLECTION_ICONS.find(icon => !collections.some(c => c.icon === icon)) ?? Codicon.layers.id,
			color: options?.color && isSessionPaletteColor(options.color) ? options.color : getNextSessionColor(collections.map(c => c.color)),
		};
		this._collections.set([...collections, collection], undefined);
		this.save();
		return collection;
	}

	updateCollection(collectionId: string, update: Partial<Omit<ISessionCollection, 'id'>>): void {
		const collections = this._collections.get();
		const index = collections.findIndex(collection => collection.id === collectionId);
		if (index === -1) {
			return;
		}
		const current = collections[index];
		const next: ISessionCollection = {
			id: current.id,
			name: update.name?.trim() || current.name,
			icon: update.icon && SESSION_COLLECTION_ICONS.includes(update.icon) ? update.icon : current.icon,
			color: update.color && isSessionPaletteColor(update.color) ? update.color : current.color,
		};
		if (next.name === current.name && next.icon === current.icon && next.color === current.color) {
			return;
		}
		this._collections.set(collections.map((collection, i) => i === index ? next : collection), undefined);
		this.save();
	}

	moveCollection(collectionId: string, index: number): void {
		const collections = [...this._collections.get()];
		const from = collections.findIndex(collection => collection.id === collectionId);
		const to = Math.max(0, Math.min(collections.length - 1, index));
		if (from === -1 || from === to) {
			return;
		}
		const [collection] = collections.splice(from, 1);
		collections.splice(to, 0, collection);
		this._collections.set(collections, undefined);
		this.save();
	}

	deleteCollection(collectionId: string, moveToId: string): SessionCollectionsUndo | undefined {
		const collections = this._collections.get();
		const index = collections.findIndex(collection => collection.id === collectionId);
		if (index === -1 || collections.length === 1 || collectionId === moveToId || !this.getCollection(moveToId)) {
			return undefined;
		}
		const deleted = collections[index];
		const wasDefault = this._defaultCollectionId.get() === collectionId;
		const wasActive = this._activeCollectionId.get() === collectionId;
		const moved: { readonly map: Map<string, string>; readonly key: string }[] = [];
		transaction(tx => {
			this._collections.set(collections.filter(collection => collection.id !== collectionId), tx);
			if (wasDefault) {
				this._defaultCollectionId.set(moveToId, tx);
			}
			if (wasActive) {
				this._activeCollectionId.set(moveToId, tx);
			}
		});
		for (const map of [this._groups, this._workspaces, this._sessions]) {
			for (const [key, value] of map) {
				if (value === collectionId) {
					map.set(key, moveToId);
					moved.push({ map, key });
				}
			}
		}
		const last = this._lastSessions.get(collectionId);
		this._lastSessions.delete(collectionId);
		this.save();
		this.fireMembershipChanged();
		return () => {
			if (this.getCollection(collectionId)) {
				return;
			}
			const current = [...this._collections.get()];
			current.splice(Math.min(index, current.length), 0, deleted);
			transaction(tx => {
				this._collections.set(current, tx);
				if (wasDefault) {
					this._defaultCollectionId.set(collectionId, tx);
				}
				if (wasActive) {
					this._activeCollectionId.set(collectionId, tx);
				}
			});
			// Only restore assignments nobody changed since the deletion.
			for (const { map, key } of moved) {
				if (map.get(key) === moveToId) {
					map.set(key, collectionId);
				}
			}
			if (last) {
				this._lastSessions.set(collectionId, last);
			}
			this.save();
			this.fireMembershipChanged();
		};
	}

	getSessionCollection(session: ISession, reader?: IReader): string {
		this.membershipSignal.read(reader);
		return this.resolveSessionCollection(session, reader, new Set());
	}

	private resolveSessionCollection(session: ISession, reader: IReader | undefined, visited: Set<string>): string {
		visited.add(session.sessionId);
		const groupId = this.sessionGroupsService.getGroupOfSession(session.sessionId);
		const groupCollection = groupId ? this.validCollection(this._groups.get(groupId)) : undefined;
		if (groupCollection) {
			return groupCollection;
		}
		// A session being sent belongs to the collection it was sent from, before it is recorded as explicit.
		const explicit = this.validCollection(this._sessions.get(session.sessionId) ?? this._inFlightSessions.get(session.sessionId));
		if (explicit) {
			return explicit;
		}
		const creatorResource = reader ? session.createdBySession?.read(reader)?.session : session.createdBySession?.get()?.session;
		const creator = creatorResource ? this.sessionsManagementService.getSession(creatorResource) : undefined;
		if (creator && !visited.has(creator.sessionId)) {
			return this.resolveSessionCollection(creator, reader, visited);
		}
		const sectionId = getWorkspaceSectionIdOfSession(session, reader);
		return (sectionId ? this.validCollection(this._workspaces.get(sectionId)) : undefined) ?? this.getDefaultCollectionId();
	}

	getGroupCollection(groupId: string): string {
		return this.validCollection(this._groups.get(groupId)) ?? this.getDefaultCollectionId();
	}

	getWorkspaceCollection(sectionId: string): string {
		return this.validCollection(this._workspaces.get(sectionId)) ?? this.getDefaultCollectionId();
	}

	moveSessionsToCollection(sessions: readonly ISession[], collectionId: string): SessionCollectionsUndo {
		if (!this.getCollection(collectionId)) {
			return () => { };
		}
		const previous = sessions.map(session => ({
			session,
			groupId: this.sessionGroupsService.getGroupOfSession(session.sessionId),
			explicit: this._sessions.get(session.sessionId),
		}));
		for (const session of sessions) {
			const groupId = this.sessionGroupsService.getGroupOfSession(session.sessionId);
			if (groupId && this.getGroupCollection(groupId) !== collectionId) {
				this.sessionGroupsService.removeFromGroup(session.sessionId);
			}
		}
		for (const session of sessions) {
			if (this.getSessionCollection(session) !== collectionId) {
				this._sessions.set(session.sessionId, collectionId);
			}
		}
		this.save();
		this.fireMembershipChanged();
		return () => {
			for (const { session, groupId } of previous) {
				if (groupId && this.sessionGroupsService.getGroup(groupId) && this.sessionGroupsService.getGroupOfSession(session.sessionId) !== groupId) {
					this.sessionGroupsService.addToGroup(session.sessionId, groupId);
				}
			}
			for (const { session, explicit } of previous) {
				setOrDelete(this._sessions, session.sessionId, explicit);
			}
			this.save();
			this.fireMembershipChanged();
		};
	}

	moveGroupToCollection(groupId: string, collectionId: string): SessionCollectionsUndo {
		if (!this.getCollection(collectionId) || !this.sessionGroupsService.getGroup(groupId) || this.getGroupCollection(groupId) === collectionId) {
			return () => { };
		}
		const previous = this._groups.get(groupId);
		this._groups.set(groupId, collectionId);
		this.save();
		this.fireMembershipChanged();
		return () => {
			if (this._groups.has(groupId)) {
				setOrDelete(this._groups, groupId, previous);
				this.save();
				this.fireMembershipChanged();
			}
		};
	}

	moveWorkspaceToCollection(sectionId: string, collectionId: string, members: readonly ISession[]): SessionCollectionsUndo {
		if (!this.getCollection(collectionId)) {
			return () => { };
		}
		const previousWorkspace = this._workspaces.get(sectionId);
		const previousMembers = members.map(session => ({ sessionId: session.sessionId, explicit: this._sessions.get(session.sessionId) }));
		this._workspaces.set(sectionId, collectionId);
		for (const session of members) {
			if (!this.sessionGroupsService.getGroupOfSession(session.sessionId) && this.getSessionCollection(session) !== collectionId) {
				this._sessions.set(session.sessionId, collectionId);
			}
		}
		this.save();
		this.fireMembershipChanged();
		return () => {
			setOrDelete(this._workspaces, sectionId, previousWorkspace);
			for (const { sessionId, explicit } of previousMembers) {
				setOrDelete(this._sessions, sessionId, explicit);
			}
			this.save();
			this.fireMembershipChanged();
		};
	}

	getLastSession(collectionId: string): URI | undefined {
		const resource = this._lastSessions.get(collectionId);
		return resource ? URI.parse(resource) : undefined;
	}

	setLastSession(collectionId: string, resource: URI): void {
		const value = resource.toString();
		if (!this.getCollection(collectionId) || this._lastSessions.get(collectionId) === value) {
			return;
		}
		this._lastSessions.set(collectionId, value);
		this.save();
	}

	// -- Helpers --

	private getDefaultCollectionId(): string {
		return this._defaultCollectionId.get();
	}

	private validCollection(collectionId: string | undefined): string | undefined {
		return collectionId !== undefined && this.getCollection(collectionId) ? collectionId : undefined;
	}

	/**
	 * Assigns new groups to the active collection, forgets deleted groups and
	 * records the group of every member session.
	 */
	private syncGroups(): boolean {
		let changed = false;
		const liveIds = new Set<string>();
		for (const group of this.sessionGroupsService.getGroups()) {
			liveIds.add(group.id);
			if (!this._groups.has(group.id)) {
				this._groups.set(group.id, this._activeCollectionId.get());
				changed = true;
			}
			for (const sessionId of this.sessionGroupsService.getSessionIdsInGroup(group.id)) {
				this._knownGroupOfSession.set(sessionId, group.id);
			}
		}
		for (const groupId of [...this._groups.keys()]) {
			if (!liveIds.has(groupId)) {
				this._groups.delete(groupId);
				changed = true;
			}
		}
		return changed;
	}

	private fireMembershipChanged(): void {
		this.membershipSignal.trigger(undefined);
		this._onDidChangeMembership.fire();
	}

	// -- Storage --

	private load(): void {
		const raw = this.storageService.get(SessionCollectionsService.STORAGE_KEY, StorageScope.PROFILE);
		let parsed: Partial<ISerializedState> | undefined;
		try {
			parsed = raw ? JSON.parse(raw) as Partial<ISerializedState> : undefined;
		} catch {
			// ignore corrupt data
		}
		this.applySerializedState(parsed ?? {});
	}

	private applySerializedState(state: Partial<ISerializedState>): void {
		const collections: ISessionCollection[] = [];
		if (Array.isArray(state.collections)) {
			for (const collection of state.collections) {
				if (collection && typeof collection.id === 'string' && typeof collection.name === 'string' && !collections.some(c => c.id === collection.id)) {
					collections.push({
						id: collection.id,
						name: collection.name,
						icon: typeof collection.icon === 'string' && SESSION_COLLECTION_ICONS.includes(collection.icon) ? collection.icon : Codicon.layers.id,
						color: isSessionPaletteColor(collection.color) ? collection.color : SessionPaletteColor.Blue,
					});
				}
			}
		}
		if (collections.length === 0) {
			collections.push(createDefaultCollection());
		}
		const isValid = (id: unknown): id is string => typeof id === 'string' && collections.some(c => c.id === id);
		const defaultCollectionId = isValid(state.defaultCollectionId) ? state.defaultCollectionId : collections[0].id;
		const activeCollectionId = isValid(state.activeCollectionId) ? state.activeCollectionId : defaultCollectionId;
		transaction(tx => {
			this._collections.set(collections, tx);
			this._defaultCollectionId.set(defaultCollectionId, tx);
			this._activeCollectionId.set(activeCollectionId, tx);
		});
		const fill = (map: Map<string, string>, record: unknown, valid: (value: unknown) => value is string) => {
			map.clear();
			if (record && typeof record === 'object') {
				for (const [key, value] of Object.entries(record)) {
					if (valid(value)) {
						map.set(key, value);
					}
				}
			}
		};
		fill(this._groups, state.groups, isValid);
		fill(this._workspaces, state.workspaces, isValid);
		fill(this._sessions, state.sessions, isValid);
		fill(this._lastSessions, state.lastSessions, (value): value is string => typeof value === 'string');
		for (const collectionId of [...this._lastSessions.keys()]) {
			if (!isValid(collectionId)) {
				this._lastSessions.delete(collectionId);
			}
		}
	}

	private toSerializedState(): ISerializedState {
		return {
			version: 1,
			collections: this._collections.get(),
			defaultCollectionId: this._defaultCollectionId.get(),
			activeCollectionId: this._activeCollectionId.get(),
			groups: Object.fromEntries(this._groups),
			workspaces: Object.fromEntries(this._workspaces),
			sessions: Object.fromEntries(this._sessions),
			lastSessions: Object.fromEntries(this._lastSessions),
		};
	}

	private save(): void {
		const state = this.toSerializedState();
		const collections = state.collections;
		const isInitial = collections.length === 1 && collections[0].id === DEFAULT_COLLECTION_ID
			&& Object.keys(state.workspaces).length === 0 && Object.keys(state.sessions).length === 0 && Object.keys(state.lastSessions).length === 0
			&& isDefaultCollection(collections[0]);
		if (isInitial) {
			// Group assignments to the only collection carry no information.
			this.storageService.remove(SessionCollectionsService.STORAGE_KEY, StorageScope.PROFILE);
			return;
		}
		this.storageService.store(SessionCollectionsService.STORAGE_KEY, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
	}
}

function setOrDelete(map: Map<string, string>, key: string, value: string | undefined): void {
	if (value === undefined) {
		map.delete(key);
	} else {
		map.set(key, value);
	}
}

function createDefaultCollection(): ISessionCollection {
	return { id: DEFAULT_COLLECTION_ID, name: localize('defaultCollectionName', "General"), icon: Codicon.layers.id, color: SessionPaletteColor.Blue };
}

function isDefaultCollection(collection: ISessionCollection): boolean {
	const initial = createDefaultCollection();
	return collection.name === initial.name && collection.icon === initial.icon && collection.color === initial.color;
}

registerSingleton(ISessionCollectionsService, SessionCollectionsService, InstantiationType.Delayed);
