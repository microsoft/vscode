/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatGroupsView.css';
import { $, size } from '../../../base/browser/dom.js';
import { Color } from '../../../base/common/color.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, ISettableObservable, ITransaction, observableValue, transaction } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { Direction, ISerializedGrid, IViewDeserializer, SerializableGrid, Sizing } from '../../../base/browser/ui/grid/grid.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../platform/storage/common/storage.js';
import { contrastBorder } from '../../../platform/theme/common/colorRegistry.js';
import { IThemeService, Themable } from '../../../platform/theme/common/themeService.js';
import { agentsPanelBorder } from '../../common/theme.js';
import { IChat } from '../../services/sessions/common/session.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../services/sessions/browser/sessionsService.js';
import { IChatViewOptions } from './chatView.js';
import { ChatGroupView, IChatGroupContext } from './chatGroupView.js';
import { ChatDropZone, ChatGroupDropTarget, IChatGroupDropTargetDelegate } from './chatGroupDropTarget.js';
import { IDraggedSessionChat, isSessionChatDrag } from '../dnd.js';

interface IGroupEntry {
	readonly id: number;
	readonly view: ChatGroupView;
	/** Resources (as strings) assigned to this group, in tab order. */
	readonly resourceIds: ISettableObservable<string[]>;
	/** The resource (as a string) of the chat this group currently shows. */
	readonly activeResourceId: ISettableObservable<string>;
	/** The {@link IChat}s assigned to this group, derived from {@link resourceIds}. */
	readonly chats: IObservable<readonly IChat[]>;
	/** Whether this group's tab strip should be shown. */
	readonly tabsVisible: IObservable<boolean>;
}

/** A single group within a persisted chat grid layout. */
interface ISerializedChatGroup {
	/** Resources (as strings) assigned to this group, in tab order. */
	readonly resourceIds: string[];
	/** The resource (as a string) of the chat this group showed. */
	readonly activeResourceId: string;
}

/** Persisted grid layout for a single session, keyed by {@link ISession.sessionId}. */
interface ISerializedChatGroupsLayout {
	readonly version: 1;
	/** The grid tree (structure + sizes); each leaf's data carries its group index. */
	readonly grid: ISerializedGrid;
	/** The groups, indexed by the `index` stored in each grid leaf. */
	readonly groups: ISerializedChatGroup[];
	/** Index of the active group within {@link groups}. */
	readonly activeGroupIndex: number;
}

/**
 * Hosts the grid of chat groups within a single {@link IActiveSession}. Chats
 * default to a single group (tab strip). Dragging a chat tab to a group's edge
 * splits it into a new group; dropping it onto another group's center moves it
 * there — mirroring VS Code editor groups.
 *
 * The session is the single source of truth for which chats exist; the grid is
 * a UI-only partition over those chats. The partition (groups, their assigned
 * chats, and the grid structure/sizes) is persisted per session to workspace
 * storage and restored on reload via {@link _tryRestoreLayout}.
 */
export class ChatGroupsView extends Themable {

	private static readonly STORAGE_KEY = 'sessions.chatGroupsLayout';

	readonly element: HTMLElement = $('.chat-groups-view');

	private readonly _sessionDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly _groupDisposables = this._register(new DisposableMap<number, DisposableStore>());
	private _currentSessionStore: DisposableStore | undefined;

	private _grid: SerializableGrid<ChatGroupView> | undefined;
	private _groups: IGroupEntry[] = [];
	private _activeGroup: IGroupEntry | undefined;
	private readonly _groupCount = observableValue<number>(this, 1);
	/** Number of chat groups currently in the grid. `> 1` means a grid layout. */
	get groupCount(): IObservable<number> { return this._groupCount; }
	private _nextGroupId = 0;

	private _session: IActiveSession | undefined;
	private _options: IChatViewOptions | undefined;
	private _mainChatResource: IObservable<string> | undefined;
	private _sessionActive = true;
	private _sessionVisible = true;
	private readonly _singleGroupTabsReplaceHeader = observableValue(this, false);

	/** While restoring a persisted layout: routes (late-loading) chats back to their saved groups. */
	private _restoreAssignment: Map<string, number> | undefined;
	/** Saved tab order (resource string -> ordinal) used to restore tab order across groups. */
	private _restoreOrder: Map<string, number> | undefined;
	/** The session's chat ids present when restore began, used to detect when the catalog has loaded. */
	private _restoreInitialIds: Set<string> | undefined;
	/** Whether a persisted layout is still being restored (saved chats may not have loaded yet). */
	private _restorePending = false;
	private _lastSessionActiveChatId: string | undefined;

	private _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;
	private _gridDidLayout = false;

	constructor(
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super(themeService);
	}

	setSingleGroupTabsReplaceHeader(enabled: boolean): void {
		this._singleGroupTabsReplaceHeader.set(enabled, undefined);
	}

	/** Sets (or clears) the session whose chats this view partitions into groups. */
	setSession(session: IActiveSession | undefined, options: IChatViewOptions): void {
		this._options = options;
		if (this._session === session) {
			return;
		}

		// Snapshot the outgoing session's layout (captures final grid sizes) before tearing it down.
		this._persistLayout();

		this._session = session;

		const store = new DisposableStore();
		this._sessionDisposables.value = store;
		this._groupDisposables.clearAndDisposeAll();
		this._currentSessionStore = store;
		this._grid = undefined;
		this._gridDidLayout = false;
		this._groups = [];
		this._activeGroup = undefined;
		this._restoreAssignment = undefined;
		this._restoreOrder = undefined;
		this._restoreInitialIds = undefined;
		this._restorePending = false;
		this._lastSessionActiveChatId = undefined;
		this._setGroupCount(1);

		if (!session) {
			this.element.replaceChildren();
			return;
		}

		this._mainChatResource = derived(reader => session.mainChat.read(reader).resource.toString());

		const grid = session.isCreated.get()
			? this._tryRestoreLayout(session, store) ?? this._createSingleGroupGrid(session, store)
			: this._createSingleGroupGrid(session, store);
		this._grid = grid;
		store.add(grid);
		this.element.replaceChildren(grid.element);
		store.add(toDisposable(() => grid.element.remove()));

		const dropDelegate: IChatGroupDropTargetDelegate = {
			isChatDrag: event => isSessionChatDrag(event, session.sessionId),
			findTargetGroup: child => this._findTargetGroup(child),
			onChatDrop: (groupId, zone, data) => {
				this._onChatDrop(groupId, zone, data).catch(onUnexpectedError);
			},
		};
		store.add(this._instantiationService.createInstance(ChatGroupDropTarget, this.element, dropDelegate));

		store.add(autorun(reader => this._reconcile(reader)));
		this._applyLayout();
	}

	private _createSingleGroupGrid(session: IActiveSession, store: DisposableStore): SerializableGrid<ChatGroupView> {
		const firstGroup = this._createGroupEntry(session);
		this._groups = [firstGroup];
		this._activeGroup = firstGroup;
		firstGroup.view.setGroupActive(true);
		this._setGroupCount(1);
		return new SerializableGrid(firstGroup.view, { styles: { separatorBorder: this._separatorBorder } });
	}

	/**
	 * Rebuilds a persisted grid layout for the session, if one is stored. Returns
	 * `undefined` to fall back to a single group. Saved chats may not have loaded
	 * yet (the catalog arrives asynchronously); {@link _reconcile} routes them back
	 * to their groups via {@link _restoreAssignment} once they appear.
	 */
	private _tryRestoreLayout(session: IActiveSession, store: DisposableStore): SerializableGrid<ChatGroupView> | undefined {
		const saved = this._loadStored(session.sessionId);
		if (!saved || saved.groups.length <= 1) {
			return undefined;
		}

		const indexToEntry = new Map<number, IGroupEntry>();
		const deserializer: IViewDeserializer<ChatGroupView> = {
			fromJSON: (json: { index?: number } | null) => {
				const index = typeof json?.index === 'number' ? json.index : indexToEntry.size;
				const entry = this._createGroupEntry(session);
				indexToEntry.set(index, entry);
				return entry.view;
			}
		};

		let grid: SerializableGrid<ChatGroupView>;
		try {
			grid = SerializableGrid.deserialize(saved.grid, deserializer, { styles: { separatorBorder: this._separatorBorder } });
		} catch (e) {
			onUnexpectedError(e);
			return undefined;
		}

		const groups: IGroupEntry[] = [];
		for (let i = 0; i < saved.groups.length; i++) {
			const entry = indexToEntry.get(i);
			if (entry) {
				groups.push(entry);
			}
		}
		if (groups.length <= 1) {
			grid.dispose();
			return undefined;
		}

		const assignment = new Map<string, number>();
		const order = new Map<string, number>();
		let ordinal = 0;
		saved.groups.forEach((g, i) => {
			const entry = indexToEntry.get(i);
			if (!entry) {
				return;
			}
			for (const id of g.resourceIds) {
				assignment.set(id, entry.id);
				order.set(id, ordinal++);
			}
			if (g.activeResourceId) {
				entry.activeResourceId.set(g.activeResourceId, undefined);
			}
		});

		this._groups = groups;
		this._restoreAssignment = assignment;
		this._restoreOrder = order;
		this._restoreInitialIds = new Set(session.visibleChatTabs.get().map(c => c.resource.toString()));
		this._restorePending = true;
		this._activeGroup = indexToEntry.get(saved.activeGroupIndex) ?? groups[0];
		for (const group of this._groups) {
			group.view.setGroupActive(group === this._activeGroup);
		}
		this._setGroupCount(this._groups.length);
		return grid;
	}

	private _createGroupEntry(session: IActiveSession): IGroupEntry {
		const id = this._nextGroupId++;
		const store = new DisposableStore();
		this._groupDisposables.set(id, store);
		const resourceIds = observableValue<string[]>(`chatGroup.${id}.resourceIds`, []);
		const activeResourceId = observableValue<string>(`chatGroup.${id}.activeResourceId`, '');

		const chats = derived<readonly IChat[]>(reader => {
			const all = session.visibleChatTabs.read(reader);
			const ids = resourceIds.read(reader);
			const result: IChat[] = [];
			for (const idStr of ids) {
				const chat = all.find(c => c.resource.toString() === idStr);
				if (chat) {
					result.push(chat);
				}
			}
			return result;
		});

		const tabsVisible = derived(reader => {
			if (!session.isCreated.read(reader)) {
				return false;
			}
			// With more than one group the tab strip is always shown so each group
			// stays interactive; with a lone group it follows the session's rule.
			if (this._groupCount.read(reader) > 1) {
				return true;
			}
			return session.shouldShowChatTabs.read(reader);
		});
		const showSessionActions = derived(reader => this._singleGroupTabsReplaceHeader.read(reader) && this._groupCount.read(reader) === 1 && tabsVisible.read(reader));

		const view = store.add(this._instantiationService.createInstance(ChatGroupView));
		const entry: IGroupEntry = { id, view, resourceIds, activeResourceId, chats, tabsVisible };

		// Focusing a group promotes it to active and, when the layout is in the
		// collapsed (accordion) state, expands it while the others shrink to min.
		store.add(view.onDidFocus(() => this._onGroupFocused(entry)));

		const context: IChatGroupContext = {
			session,
			options: this._options!,
			chats,
			activeChatResource: activeResourceId,
			mainChatResource: this._mainChatResource!,
			tabsVisible,
			showSessionActions,
			openChat: resource => this._openChat(entry, resource),
			newChat: () => this._newChat(entry).catch(onUnexpectedError),
			onTabDragStart: () => { },
			onTabDragEnd: () => { },
		};
		view.setContext(context);
		view.setSessionActive(this._sessionActive);
		view.setSessionVisible(this._sessionVisible);

		return entry;
	}

	private _reconcile(reader: IReader): void {
		const session = this._session;
		if (!session) {
			return;
		}

		const chats = session.visibleChatTabs.read(reader);
		const activeChat = session.activeChat.read(reader);
		const orderedIds = chats.map(c => c.resource.toString());
		const validIds = new Set(orderedIds);
		const activeId = activeChat?.resource.toString();

		transaction(tx => {
			// Prune stale assignments.
			for (const group of this._groups) {
				const ids = group.resourceIds.get();
				const pruned = ids.filter(id => validIds.has(id));
				if (pruned.length !== ids.length) {
					group.resourceIds.set(pruned, tx);
				}
			}

			// Assign newly added chats. While restoring, route each chat back to its
			// saved group; otherwise (and for genuinely new chats) use the active group.
			const assigned = new Set<string>();
			for (const group of this._groups) {
				for (const id of group.resourceIds.get()) {
					assigned.add(id);
				}
			}
			for (const id of orderedIds) {
				if (assigned.has(id)) {
					continue;
				}
				const savedGroupId = this._restoreAssignment?.get(id);
				let target = savedGroupId !== undefined ? this._groups.find(g => g.id === savedGroupId) : undefined;
				const chat = chats.find(chat => chat.resource.toString() === id);
				const parentResource = id === activeId ? chat?.origin?.parentChat : undefined;
				const parentGroup = parentResource
					? this._groups.find(group => group.resourceIds.get().includes(parentResource.toString()))
					: undefined;
				target ??= parentGroup ? this._findAdjacentGroup(parentGroup) : undefined;
				target ??= this._activeGroup;
				if (target) {
					target.resourceIds.set([...target.resourceIds.get(), id], tx);
				}
			}

			// While restoring, keep each group's tabs in their saved order.
			if (this._restorePending && this._restoreOrder) {
				const restoreOrder = this._restoreOrder;
				for (const group of this._groups) {
					const ids = group.resourceIds.get();
					const sorted = [...ids].sort((a, b) => (restoreOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (restoreOrder.get(b) ?? Number.MAX_SAFE_INTEGER));
					if (sorted.some((id, i) => id !== ids[i])) {
						group.resourceIds.set(sorted, tx);
					}
				}
			}

			if (activeId && activeId !== this._lastSessionActiveChatId) {
				const owner = this._groups.find(g => g.resourceIds.get().includes(activeId));
				if (owner) {
					owner.activeResourceId.set(activeId, tx);
					this._setActiveGroup(owner);
				}
			}
			this._lastSessionActiveChatId = activeId;

			// Ensure every group shows a chat it actually owns.
			for (const group of this._groups) {
				const ids = group.resourceIds.get();
				if (ids.length && !ids.includes(group.activeResourceId.get())) {
					group.activeResourceId.set(ids[0], tx);
				}
			}
		});

		// Finish restoring once the saved chats have loaded (or the catalog has
		// arrived without them, meaning they were deleted between reloads). Empty
		// groups are kept while restore is pending so late-loading chats still have
		// a home; once restore completes, any group left empty is collapsed.
		if (this._restorePending) {
			const allSavedPresent = this._restoreAssignment ? [...this._restoreAssignment.keys()].every(id => validIds.has(id)) : true;
			const catalogChanged = !this._restoreInitialIds || orderedIds.length !== this._restoreInitialIds.size || orderedIds.some(id => !this._restoreInitialIds!.has(id));
			const catalogSettled = !session.loading.read(reader);
			if (allSavedPresent || catalogChanged || catalogSettled) {
				this._restorePending = false;
				this._restoreAssignment = undefined;
				this._restoreOrder = undefined;
				this._restoreInitialIds = undefined;
			}
		}

		if (!this._restorePending) {
			this._removeEmptyGroups();
			this._persistLayout();
		}
	}

	private _findTargetGroup(child: HTMLElement): { readonly id: number; readonly element: HTMLElement } | undefined {
		for (const group of this._groups) {
			if (group.view.element.contains(child)) {
				return { id: group.id, element: group.view.element };
			}
		}
		return undefined;
	}

	private async _onChatDrop(targetGroupId: number, zone: ChatDropZone, data: IDraggedSessionChat | undefined): Promise<void> {
		if (!data || !this._session) {
			return;
		}

		if (data.sessionId !== this._session.sessionId) {
			return; // not a chat from this session
		}

		const id = data.resource;
		const resource = URI.parse(id);
		let target = this._groups.find(g => g.id === targetGroupId);
		let source = this._groups.find(g => g.resourceIds.get().includes(id));
		if (!source) {
			const session = this._session;
			if (!session.chats.get().some(chat => chat.resource.toString() === id)) {
				return;
			}
			await this._sessionsService.openChat(session, resource);
			if (this._session !== session) {
				return;
			}
			target = this._groups.find(g => g.id === targetGroupId);
			source = this._groups.find(g => g.resourceIds.get().includes(id));
		}
		if (!target || !source) {
			return;
		}

		if (zone === 'center') {
			if (source === target) {
				return;
			}
			this._moveChatToGroup(resource, source, target);
		} else {
			// Splitting out the only tab of its group would just relocate the
			// group, so treat it as a no-op.
			if (source === target && source.resourceIds.get().length <= 1) {
				return;
			}
			this._splitChatIntoNewGroup(resource, source, target, zone);
		}
	}

	private _moveChatToGroup(resource: URI, source: IGroupEntry, target: IGroupEntry): void {
		const id = resource.toString();
		transaction(tx => {
			this._detachChatFromGroup(source, id, tx);
			if (!target.resourceIds.get().includes(id)) {
				target.resourceIds.set([...target.resourceIds.get(), id], tx);
			}
			target.activeResourceId.set(id, tx);
		});
		this._setActiveGroup(target);
		this._sessionsService.openChat(this._session!, resource).catch(onUnexpectedError);
		this._removeEmptyGroups();
		this._persistLayout();
	}

	private _splitChatIntoNewGroup(resource: URI, source: IGroupEntry, reference: IGroupEntry, zone: Exclude<ChatDropZone, 'center'>): void {
		if (!this._grid || !this._currentSessionStore || !this._session) {
			return;
		}
		const id = resource.toString();
		const newGroup = this._createGroupEntry(this._session);
		this._grid.addView(newGroup.view, Sizing.Distribute, reference.view, this._zoneToDirection(zone));
		this._insertGroup(newGroup, reference, zone);
		this._setGroupCount(this._groups.length);

		transaction(tx => {
			this._detachChatFromGroup(source, id, tx);
			newGroup.resourceIds.set([id], tx);
			newGroup.activeResourceId.set(id, tx);
		});

		this._setActiveGroup(newGroup);
		this._sessionsService.openChat(this._session, resource).catch(onUnexpectedError);
		this._removeEmptyGroups();
		this._applyLayout();
		this._persistLayout();
	}

	/**
	 * Removes a chat from a group. If it was the group's active chat, activates a
	 * remaining one so the source group keeps showing a chat it still owns.
	 */
	private _detachChatFromGroup(group: IGroupEntry, id: string, tx: ITransaction): void {
		const remaining = group.resourceIds.get().filter(x => x !== id);
		group.resourceIds.set(remaining, tx);
		if (group.activeResourceId.get() === id && remaining.length) {
			group.activeResourceId.set(remaining[0], tx);
		}
	}

	/**
	 * Opens a chat in a group beside the active one ("open to the side"). If the
	 * chat is already shown in a group, that group is focused instead of creating
	 * a duplicate; otherwise a new group is created to the right of the active
	 * group and the chat is shown there.
	 */
	async openChatInNewGroup(resource: URI): Promise<void> {
		if (!this._session || !this._grid || !this._currentSessionStore) {
			return;
		}
		const id = resource.toString();

		const existing = this._groups.find(g => g.resourceIds.get().includes(id));
		if (existing) {
			existing.activeResourceId.set(id, undefined);
			this._setActiveGroup(existing);
			await this._sessionsService.openChat(this._session, resource);
			return;
		}

		const reference = this._activeGroup ?? this._groups[0];
		if (!reference) {
			return;
		}
		const session = this._session;
		await this._sessionsService.openChat(session, resource);
		if (this._session !== session || !session.visibleChatTabs.get().some(chat => chat.resource.toString() === id)) {
			return;
		}

		const newGroup = this._createGroupEntry(session);
		this._grid.addView(newGroup.view, Sizing.Distribute, reference.view, Direction.Right);
		this._insertGroup(newGroup, reference, 'right');
		this._setGroupCount(this._groups.length);

		transaction(tx => {
			const assignedGroup = this._groups.find(group => group !== newGroup && group.resourceIds.get().includes(id));
			if (assignedGroup) {
				this._detachChatFromGroup(assignedGroup, id, tx);
			}
			newGroup.resourceIds.set([id], tx);
			newGroup.activeResourceId.set(id, tx);
		});

		this._setActiveGroup(newGroup);
		this._removeEmptyGroups();
		this._applyLayout();
		this._persistLayout();
	}

	private _findAdjacentGroup(reference: IGroupEntry): IGroupEntry | undefined {
		if (this._grid && this._gridDidLayout) {
			for (const direction of [Direction.Right, Direction.Left, Direction.Down, Direction.Up]) {
				const neighbor = this._grid.getNeighborViews(reference.view, direction)[0];
				const group = neighbor && this._groups.find(candidate => candidate.view === neighbor);
				if (group) {
					return group;
				}
			}
		}

		const referenceIndex = this._groups.indexOf(reference);
		return this._groups[referenceIndex + 1] ?? this._groups[referenceIndex - 1];
	}

	private _insertGroup(group: IGroupEntry, reference: IGroupEntry, zone: Exclude<ChatDropZone, 'center'>): void {
		const referenceIndex = this._groups.indexOf(reference);
		const insertBefore = zone === 'left' || zone === 'top';
		this._groups.splice(referenceIndex + (insertBefore ? 0 : 1), 0, group);
	}

	/**
	 * Places a freshly created chat (e.g. a side chat) beside the current one.
	 * Unlike {@link openChatInNewGroup} — which focuses the chat in place when it
	 * is already visible — this moves the chat out of a shared group into its own
	 * group to the right so it sits next to the chat it was created from. Called
	 * only at creation time; if the chat is already alone in its group (nothing to
	 * sit beside) it is left where it is.
	 */
	splitChatToSide(resource: URI): void {
		if (!this._session || !this._grid || !this._currentSessionStore) {
			return;
		}
		const id = resource.toString();
		const source = this._groups.find(g => g.resourceIds.get().includes(id));
		if (source) {
			// Already alone in its own group: nothing to sit beside, keep it.
			if (source.resourceIds.get().length <= 1) {
				this._setActiveGroup(source);
				return;
			}
			this._splitChatIntoNewGroup(resource, source, source, 'right');
			return;
		}
		// Not assigned yet: only open to the side when there is another chat to
		// sit beside; otherwise let the normal reconcile assign it in place.
		if (this._groups.some(g => g.resourceIds.get().some(x => x !== id))) {
			this.openChatInNewGroup(resource).catch(onUnexpectedError);
		}
	}

	private _removeEmptyGroups(): void {
		if (!this._grid || this._groups.length <= 1) {
			return;
		}
		const empties = this._groups.filter(g => g.resourceIds.get().length === 0);
		for (const group of empties) {
			if (this._groups.length <= 1) {
				break;
			}
			const hadFocus = group.view.element.contains(group.view.element.ownerDocument.activeElement);
			this._grid.removeView(group.view, Sizing.Distribute);
			this._groups = this._groups.filter(g => g !== group);
			if (this._activeGroup === group) {
				this._activeGroup = this._groups[0];
				this._activeGroup?.view.setGroupActive(true);
			}
			this._groupDisposables.deleteAndDispose(group.id);
			if (hadFocus) {
				this._activeGroup?.view.focus();
			}
		}
		this._setGroupCount(this._groups.length);
	}

	private _setActiveGroup(entry: IGroupEntry): void {
		if (this._activeGroup === entry) {
			return;
		}
		this._activeGroup = entry;
		for (const group of this._groups) {
			group.view.setGroupActive(group === entry);
		}
		this._persistLayout();
	}

	/**
	 * Handles focus entering a group: promotes it to the active group and, when
	 * that group is currently collapsed to its minimum size in a split, expands it
	 * so the other groups collapse to their minimum. Focusing an already-expanded
	 * group (or a balanced/manual layout) leaves the sizes untouched.
	 */
	private _onGroupFocused(entry: IGroupEntry): void {
		this._setActiveGroup(entry);
		const session = this._session;
		const activeResourceId = entry.activeResourceId.get();
		if (session && activeResourceId && session.activeChat.get().resource.toString() !== activeResourceId) {
			this._sessionsService.openChat(session, URI.parse(activeResourceId)).catch(onUnexpectedError);
		}

		if (!this._grid || this._groups.length < 2 || !this._isGroupCollapsed(entry.view)) {
			return;
		}
		// Grow the focused group to the grid's full extent; the split view clamps
		// it to the space left once the siblings reach their minimum size, so the
		// others collapse to min along whichever axis they are split.
		const gridSize = this._grid.getViewSize();
		this._grid.resizeView(entry.view, { width: gridSize.width, height: gridSize.height });
		this._persistLayout();
	}

	/**
	 * Whether the group is squeezed to (near) its minimum along an axis where the
	 * grid has room to be larger — i.e. the user has collapsed it in a split.
	 */
	private _isGroupCollapsed(view: ChatGroupView): boolean {
		if (!this._grid) {
			return false;
		}
		const COLLAPSE_THRESHOLD = 8;
		const size = this._grid.getViewSize(view);
		const gridSize = this._grid.getViewSize();
		const collapsedHorizontally = size.width <= view.minimumWidth + COLLAPSE_THRESHOLD
			&& gridSize.width > view.minimumWidth + COLLAPSE_THRESHOLD;
		const collapsedVertically = size.height <= view.minimumHeight + COLLAPSE_THRESHOLD
			&& gridSize.height > view.minimumHeight + COLLAPSE_THRESHOLD;
		return collapsedHorizontally || collapsedVertically;
	}

	private _setGroupCount(count: number): void {
		this._groupCount.set(count, undefined);
		this.element.classList.toggle('single-group', count <= 1);
		this._groups.forEach((group, index) => group.view.setGroupPosition(index, count));
	}

	private _openChat(entry: IGroupEntry, resource: URI): void {
		entry.activeResourceId.set(resource.toString(), undefined);
		this._setActiveGroup(entry);
		if (this._session) {
			this._sessionsService.openChat(this._session, resource).catch(onUnexpectedError);
		}
	}

	private async _newChat(entry: IGroupEntry): Promise<void> {
		this._setActiveGroup(entry);
		const session = this._session;
		if (session && !session.isArchived.get()) {
			const existingIds = new Set(session.visibleChatTabs.get().map(chat => chat.resource.toString()));
			await this._sessionsService.openNewChatInSession(session);
			if (this._session === session && this._groups.includes(entry)) {
				const createdChat = session.activeChat.get();
				const createdId = createdChat.resource.toString();
				if (!existingIds.has(createdId) && session.visibleChatTabs.get().includes(createdChat)) {
					transaction(tx => {
						for (const group of this._groups) {
							if (group !== entry && group.resourceIds.get().includes(createdId)) {
								this._detachChatFromGroup(group, createdId, tx);
							}
						}
						if (!entry.resourceIds.get().includes(createdId)) {
							entry.resourceIds.set([...entry.resourceIds.get(), createdId], tx);
						}
						entry.activeResourceId.set(createdId, tx);
					});
					this._setActiveGroup(entry);
					this._removeEmptyGroups();
					this._persistLayout();
				}
				entry.view.focus();
			}
		}
	}

	focusAdjacentGroup(direction: 'previous' | 'next'): void {
		const activeIndex = this._activeGroup ? this._groups.indexOf(this._activeGroup) : -1;
		if (activeIndex < 0 || this._groups.length < 2) {
			return;
		}
		const offset = direction === 'next' ? 1 : -1;
		const target = this._groups[(activeIndex + offset + this._groups.length) % this._groups.length];
		this._onGroupFocused(target);
		target.view.focus();
	}

	splitActiveChat(direction: 'right' | 'bottom'): void {
		const source = this._activeGroup;
		const resource = source?.activeResourceId.get();
		if (source && resource && source.resourceIds.get().length > 1) {
			this._splitChatIntoNewGroup(URI.parse(resource), source, source, direction);
		}
	}

	moveActiveChatToAdjacentGroup(direction: 'previous' | 'next'): void {
		const source = this._activeGroup;
		const sourceIndex = source ? this._groups.indexOf(source) : -1;
		const resource = source?.activeResourceId.get();
		if (!source || sourceIndex < 0 || !resource || this._groups.length < 2) {
			return;
		}
		const offset = direction === 'next' ? 1 : -1;
		const target = this._groups[(sourceIndex + offset + this._groups.length) % this._groups.length];
		this._moveChatToGroup(URI.parse(resource), source, target);
		target.view.focus();
	}

	private _zoneToDirection(zone: ChatDropZone): Direction {
		switch (zone) {
			case 'left': return Direction.Left;
			case 'right': return Direction.Right;
			case 'top': return Direction.Up;
			case 'bottom': return Direction.Down;
			default: return Direction.Right;
		}
	}

	setSessionActive(active: boolean): void {
		if (this._sessionActive === active) {
			return;
		}
		this._sessionActive = active;
		for (const group of this._groups) {
			group.view.setSessionActive(active);
		}
	}

	setSessionVisible(visible: boolean): void {
		if (this._sessionVisible === visible) {
			return;
		}
		this._sessionVisible = visible;
		for (const group of this._groups) {
			group.view.setSessionVisible(visible);
		}
	}

	submitInput(): Promise<boolean> {
		return this._activeGroup?.view.submitInput() ?? Promise.resolve(false);
	}

	selectWorkspace(folderUri: URI, providerId?: string): void {
		this._activeGroup?.view.selectWorkspace(folderUri, providerId);
	}

	prefillInput(text: string): void {
		this._activeGroup?.view.prefillInput(text);
	}

	sendQuery(text: string): void {
		this._activeGroup?.view.sendQuery(text);
	}

	attach(uris: URI[]): void {
		this._activeGroup?.view.attach(uris);
	}

	focus(): void {
		this._activeGroup?.view.focus();
	}

	layout(width: number, height: number, top: number, left: number): void {
		this._lastLayout = { width, height, top, left };
		this._applyLayout();
	}

	private _applyLayout(): void {
		if (!this._lastLayout) {
			return;
		}
		const { width, height, top, left } = this._lastLayout;
		size(this.element, width, height);
		if (this._grid) {
			this._grid.layout(width, height, top, left);
			this._gridDidLayout = true;
		}
	}

	private get _separatorBorder(): Color {
		return this.theme.getColor(agentsPanelBorder) || this.theme.getColor(contrastBorder) || Color.transparent;
	}

	override updateStyles(): void {
		super.updateStyles();
		this._grid?.style({ separatorBorder: this._separatorBorder });
	}

	/** Persists the current grid layout for the active session (or clears it when a single group). */
	private _persistLayout(): void {
		if (!this._session || !this._grid || this._restorePending) {
			return;
		}
		const sessionId = this._session.sessionId;
		if (!this._session.isCreated.get()) {
			this._saveStored(sessionId, undefined);
			return;
		}
		if (this._groups.length <= 1) {
			this._saveStored(sessionId, undefined);
			return;
		}
		this._groups.forEach((group, i) => group.view.setSerializationIndex(i));
		const layout: ISerializedChatGroupsLayout = {
			version: 1,
			grid: this._grid.serialize(),
			groups: this._groups.map(group => ({ resourceIds: group.resourceIds.get(), activeResourceId: group.activeResourceId.get() })),
			activeGroupIndex: Math.max(0, this._groups.indexOf(this._activeGroup!)),
		};
		this._saveStored(sessionId, layout);
	}

	private _readStoredLayouts(): Record<string, ISerializedChatGroupsLayout> {
		const raw = this._storageService.get(ChatGroupsView.STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return {};
		}
		try {
			return JSON.parse(raw) as Record<string, ISerializedChatGroupsLayout>;
		} catch {
			return {};
		}
	}

	private _loadStored(sessionId: string): ISerializedChatGroupsLayout | undefined {
		const entry = this._readStoredLayouts()[sessionId];
		return entry?.version === 1 ? entry : undefined;
	}

	private _saveStored(sessionId: string, layout: ISerializedChatGroupsLayout | undefined): void {
		const layouts = this._readStoredLayouts();
		if (layout) {
			layouts[sessionId] = layout;
		} else if (layouts[sessionId] === undefined) {
			return;
		} else {
			delete layouts[sessionId];
		}
		this._storageService.store(ChatGroupsView.STORAGE_KEY, JSON.stringify(layouts), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	override dispose(): void {
		this._persistLayout();
		super.dispose();
	}
}
