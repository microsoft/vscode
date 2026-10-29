/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { MockColor, MockPaletteColor, MockTextColorMode, MOCK_PALETTE_ORDER } from './colorGroupsMockupColors.js';

//#region Types

export const enum MockSessionStatus {
	Read = 'read',
	Unread = 'unread',
	InProgress = 'inProgress',
	NeedsInput = 'needsInput',
}

export const enum MockPullRequest {
	Open = 'open',
	Draft = 'draft',
	Merged = 'merged',
}

export interface IMockMessage {
	readonly role: 'user' | 'agent';
	readonly text: string;
}

export interface IMockSession {
	readonly id: string;
	title: string;
	/** Repository folder. Sessions without one are quick chats. */
	workspace?: string;
	status: MockSessionStatus;
	pr?: MockPullRequest;
	minutesAgo: number;
	diff?: { additions: number; deletions: number };
	/** Progress text shown instead of the details row while in progress. */
	description?: string;
	collectionId: string;
	groupId?: string;
	pinned?: boolean;
	archived?: boolean;
	/** Transcript. Seeded sessions without one show a generated exchange. */
	messages?: IMockMessage[];
}

export interface IMockGroup {
	readonly id: string;
	name: string;
	color: MockColor;
	textMode: MockTextColorMode;
	collectionId: string;
	collapsed: boolean;
}

/** Presentation of a workspace (repository) section. Colors are optional; uncolored workspaces render as today. */
export interface IMockWorkspaceStyle {
	color?: MockColor;
	textMode: MockTextColorMode;
	/** Collection that new sessions in this workspace are created in. */
	defaultCollectionId: string;
}

/** Built-in sections that can be colored. They keep their names and behavior; only the color is user state. */
export const enum MockBuiltInSection {
	Pinned = 'pinned',
	Chats = 'chats',
}

/** Presentation of a built-in section. Shared by all collections, like workspace colors. */
export interface IMockBuiltInSectionStyle {
	color?: MockColor;
	textMode: MockTextColorMode;
}

/** A collection icon: a standard codicon id. */
export type MockCollectionIcon = string;

export interface IMockCollection {
	readonly id: string;
	name: string;
	icon: MockCollectionIcon;
	color: MockColor;
}

export interface IMockState {
	collections: IMockCollection[];
	groups: IMockGroup[];
	workspaces: Record<string, IMockWorkspaceStyle>;
	/** Colors of the built-in Pinned and Chats sections. */
	builtInSections: Partial<Record<MockBuiltInSection, IMockBuiltInSectionStyle>>;
	/** All sessions. Array order is the manual sort order. */
	sessions: IMockSession[];
	/** Per collection, the user order of top-level group and workspace sections (`group:<id>` / `workspace:<name>`). */
	sectionOrder: Record<string, string[]>;
	/** Collapsed fixed and workspace sections, keyed `<collectionId>/<sectionKey>`. */
	collapsedSections: string[];
	nextId: number;
}

export type MockSectionKey = `group:${string}` | `workspace:${string}`;

export function groupKey(groupId: string): MockSectionKey {
	return `group:${groupId}`;
}

export function workspaceKey(workspace: string): MockSectionKey {
	return `workspace:${workspace}`;
}

/** The most recent undoable change, shown in the undo toast. */
export interface IMockChange {
	readonly id: number;
	readonly label: string;
}

//#endregion

//#region Queries

export function isQuickChat(session: IMockSession): boolean {
	return !session.workspace;
}

export function getGroup(state: IMockState, groupId: string | undefined): IMockGroup | undefined {
	return groupId ? state.groups.find(g => g.id === groupId) : undefined;
}

export function getCollection(state: IMockState, collectionId: string): IMockCollection | undefined {
	return state.collections.find(c => c.id === collectionId);
}

export function getSession(state: IMockState, sessionId: string): IMockSession | undefined {
	return state.sessions.find(s => s.id === sessionId);
}

export function getWorkspaceStyle(state: IMockState, workspace: string): IMockWorkspaceStyle {
	return state.workspaces[workspace] ?? { textMode: MockTextColorMode.Auto, defaultCollectionId: state.collections[0].id };
}

export function getBuiltInSectionStyle(state: IMockState, section: MockBuiltInSection): IMockBuiltInSectionStyle {
	// Snapshots saved before built-in colors existed have no map.
	return state.builtInSections?.[section] ?? { textMode: MockTextColorMode.Auto };
}

export function isBuiltInSection(sectionKey: string): sectionKey is MockBuiltInSection {
	return sectionKey === MockBuiltInSection.Pinned || sectionKey === MockBuiltInSection.Chats;
}

export const BUILT_IN_SECTIONS: Readonly<Record<MockBuiltInSection, { readonly label: string; readonly icon: ThemeIcon }>> = {
	[MockBuiltInSection.Pinned]: { label: 'Pinned', icon: Codicon.pinned },
	[MockBuiltInSection.Chats]: { label: 'Chats', icon: Codicon.commentDiscussion },
};

/** Sessions that belong to a collection's primary list (not archived). */
export function getCollectionSessions(state: IMockState, collectionId: string): IMockSession[] {
	return state.sessions.filter(s => s.collectionId === collectionId && !s.archived);
}

/** Top-level group and workspace sections of a collection, in user order. Empty groups stay visible. */
export function getSectionOrder(state: IMockState, collectionId: string): MockSectionKey[] {
	const present = new Set<MockSectionKey>();
	for (const group of state.groups) {
		if (group.collectionId === collectionId) {
			present.add(groupKey(group.id));
		}
	}
	for (const session of getCollectionSessions(state, collectionId)) {
		if (!session.pinned && !session.groupId && session.workspace) {
			present.add(workspaceKey(session.workspace));
		}
	}
	const ordered: MockSectionKey[] = [];
	for (const key of state.sectionOrder[collectionId] ?? []) {
		if (present.delete(key as MockSectionKey)) {
			ordered.push(key as MockSectionKey);
		}
	}
	// Anything not yet placed by the user lands at the end, groups first.
	const remaining = [...present].sort((a, b) => Number(b.startsWith('group:')) - Number(a.startsWith('group:')) || a.localeCompare(b));
	return [...ordered, ...remaining];
}

/** Whether any session in the collection needs attention, for the collection switcher. */
export function getCollectionAttention(state: IMockState, collectionId: string): MockSessionStatus | undefined {
	const sessions = getCollectionSessions(state, collectionId);
	if (sessions.some(s => s.status === MockSessionStatus.NeedsInput)) {
		return MockSessionStatus.NeedsInput;
	}
	if (sessions.some(s => s.status === MockSessionStatus.Unread)) {
		return MockSessionStatus.Unread;
	}
	if (sessions.some(s => s.status === MockSessionStatus.InProgress)) {
		return MockSessionStatus.InProgress;
	}
	return undefined;
}

/** The section status summary shown on collapsed headers: the most urgent member status. */
export function getSessionsAttention(sessions: readonly IMockSession[]): MockSessionStatus | undefined {
	if (sessions.some(s => s.status === MockSessionStatus.NeedsInput)) {
		return MockSessionStatus.NeedsInput;
	}
	if (sessions.some(s => s.status === MockSessionStatus.InProgress)) {
		return MockSessionStatus.InProgress;
	}
	if (sessions.some(s => s.status === MockSessionStatus.Unread)) {
		return MockSessionStatus.Unread;
	}
	return undefined;
}

//#endregion

//#region Model

const MAX_UNDO = 50;

/**
 * Plain-data model for the color groups mockup. Every mutation goes through
 * {@link update}, which snapshots the previous state so any change can be undone.
 */
export class ColorGroupsMockModel extends Disposable {

	private readonly _state = observableValue<IMockState>(this, createSeedState());
	readonly state: IObservable<IMockState> = this._state;

	private readonly _lastChange = observableValue<IMockChange | undefined>(this, undefined);
	/** The most recent undoable change, for the undo toast. */
	readonly lastChange: IObservable<IMockChange | undefined> = this._lastChange;

	private readonly undoStack: { readonly label: string; readonly state: IMockState }[] = [];
	private changeCounter = 0;

	constructor(initialState?: IMockState) {
		super();
		if (initialState) {
			this._state.set(initialState, undefined);
		}
	}

	get current(): IMockState {
		return this._state.get();
	}

	/** Applies a mutation to a copy of the state. A label records an undoable change. */
	update(label: string | undefined, mutate: (draft: IMockState) => void): void {
		const previous = this._state.get();
		const draft = structuredClone(previous);
		mutate(draft);
		transaction(tx => {
			if (label) {
				this.undoStack.push({ label, state: previous });
				if (this.undoStack.length > MAX_UNDO) {
					this.undoStack.shift();
				}
				this._lastChange.set({ id: ++this.changeCounter, label }, tx);
			}
			this._state.set(draft, tx);
		});
	}

	undo(): string | undefined {
		const entry = this.undoStack.pop();
		if (!entry) {
			return undefined;
		}
		transaction(tx => {
			this._state.set(entry.state, tx);
			this._lastChange.set(undefined, tx);
		});
		return entry.label;
	}

	/** Captures the state before a multi-step edit (like an open editor) for {@link commitCheckpoint}. */
	checkpoint(): IMockState {
		return this._state.get();
	}

	/** Records a single undoable change for everything since {@link checkpoint}, if anything changed. */
	commitCheckpoint(label: string, previous: IMockState): void {
		if (previous === this._state.get()) {
			return;
		}
		this.undoStack.push({ label, state: previous });
		this._lastChange.set({ id: ++this.changeCounter, label }, undefined);
	}

	dismissLastChange(): void {
		this._lastChange.set(undefined, undefined);
	}

	reset(): void {
		this.undoStack.length = 0;
		transaction(tx => {
			this._state.set(createSeedState(), tx);
			this._lastChange.set(undefined, tx);
		});
	}

	//#region Sections

	toggleGroupCollapsed(groupId: string, collapsed?: boolean): void {
		this.update(undefined, draft => {
			const group = getGroup(draft, groupId);
			if (group) {
				group.collapsed = collapsed ?? !group.collapsed;
			}
		});
	}

	setSectionCollapsed(collectionId: string, sectionKey: string, collapsed: boolean): void {
		const key = `${collectionId}/${sectionKey}`;
		this.update(undefined, draft => {
			draft.collapsedSections = draft.collapsedSections.filter(k => k !== key);
			if (collapsed) {
				draft.collapsedSections.push(key);
			}
		});
	}

	reorderSection(collectionId: string, dragged: MockSectionKey, target: MockSectionKey, position: 'before' | 'after'): void {
		if (dragged === target) {
			return;
		}
		this.update('Moved section', draft => {
			const order = getSectionOrder(draft, collectionId).filter(k => k !== dragged);
			const targetIndex = order.indexOf(target);
			order.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, dragged);
			draft.sectionOrder[collectionId] = order;
		});
	}

	//#endregion

	//#region Groups

	createGroup(collectionId: string, options: { readonly name?: string; readonly color?: MockColor; readonly sessionIds?: readonly string[]; readonly afterSection?: MockSectionKey } = {}): string {
		const state = this.current;
		const id = `g${state.nextId}`;
		this.update('Created group', draft => {
			draft.nextId++;
			const usedColors = new Set(draft.groups.filter(g => g.collectionId === collectionId && g.color.kind === 'palette').map(g => g.color.kind === 'palette' ? g.color.id : undefined));
			const color: MockColor = options.color ?? { kind: 'palette', id: MOCK_PALETTE_ORDER.find(c => c !== MockPaletteColor.Grey && !usedColors.has(c)) ?? MockPaletteColor.Blue };
			draft.groups.push({ id, name: options.name ?? 'New group', color, textMode: MockTextColorMode.Auto, collectionId, collapsed: false });
			const order = getSectionOrder(draft, collectionId).filter(k => k !== groupKey(id));
			const anchorIndex = options.afterSection ? order.indexOf(options.afterSection) : -1;
			order.splice(anchorIndex >= 0 ? anchorIndex + 1 : 0, 0, groupKey(id));
			draft.sectionOrder[collectionId] = order;
			for (const sessionId of options.sessionIds ?? []) {
				const session = getSession(draft, sessionId);
				if (session) {
					session.groupId = id;
					session.pinned = false;
					session.collectionId = collectionId;
				}
			}
		});
		return id;
	}

	/** Removes the group and returns its sessions to their workspace sections. */
	ungroup(groupId: string): void {
		this.update('Ungrouped', draft => {
			for (const session of draft.sessions) {
				if (session.groupId === groupId) {
					session.groupId = undefined;
				}
			}
			draft.groups = draft.groups.filter(g => g.id !== groupId);
		});
	}

	/** Removes the group and marks its sessions done. */
	closeGroup(groupId: string): void {
		this.update('Closed group', draft => {
			for (const session of draft.sessions) {
				if (session.groupId === groupId) {
					session.groupId = undefined;
					session.archived = true;
				}
			}
			draft.groups = draft.groups.filter(g => g.id !== groupId);
		});
	}

	moveGroupToCollection(groupId: string, collectionId: string): void {
		this.update('Moved group', draft => {
			const group = getGroup(draft, groupId);
			if (!group || group.collectionId === collectionId) {
				return;
			}
			draft.sectionOrder[group.collectionId] = (draft.sectionOrder[group.collectionId] ?? []).filter(k => k !== groupKey(groupId));
			group.collectionId = collectionId;
			draft.sectionOrder[collectionId] = [groupKey(groupId), ...getSectionOrder(draft, collectionId).filter(k => k !== groupKey(groupId))];
			for (const session of draft.sessions) {
				if (session.groupId === groupId) {
					session.collectionId = collectionId;
				}
			}
		});
	}

	//#endregion

	//#region Workspaces

	setWorkspaceColor(workspace: string, color: MockColor | undefined): void {
		this.update(color ? 'Changed workspace color' : 'Removed workspace color', draft => {
			const style = draft.workspaces[workspace] ?? { textMode: MockTextColorMode.Auto, defaultCollectionId: draft.collections[0].id };
			style.color = color;
			draft.workspaces[workspace] = style;
		});
	}

	setBuiltInSectionColor(section: MockBuiltInSection, color: MockColor | undefined): void {
		this.update(color ? 'Changed section color' : 'Removed section color', draft => {
			draft.builtInSections = { ...draft.builtInSections, [section]: { ...getBuiltInSectionStyle(draft, section), color } };
		});
	}

	/** Moves the workspace's ungrouped sessions and makes the collection the default for new ones. */
	moveWorkspaceToCollection(fromCollectionId: string, workspace: string, collectionId: string): void {
		this.update('Moved workspace', draft => {
			const style = draft.workspaces[workspace] ?? { textMode: MockTextColorMode.Auto, defaultCollectionId: collectionId };
			style.defaultCollectionId = collectionId;
			draft.workspaces[workspace] = style;
			for (const session of draft.sessions) {
				if (session.workspace === workspace && session.collectionId === fromCollectionId && !session.groupId) {
					session.collectionId = collectionId;
				}
			}
			const key = workspaceKey(workspace);
			draft.sectionOrder[collectionId] = [key, ...getSectionOrder(draft, collectionId).filter(k => k !== key)];
		});
	}

	//#endregion

	//#region Sessions

	addSessionsToGroup(sessionIds: readonly string[], groupId: string, target?: string, position?: 'before' | 'after'): void {
		this.update(sessionIds.length > 1 ? `Moved ${sessionIds.length} sessions` : 'Moved session', draft => {
			const group = getGroup(draft, groupId);
			if (!group) {
				return;
			}
			for (const id of sessionIds) {
				const session = getSession(draft, id);
				if (session) {
					session.groupId = groupId;
					session.pinned = false;
					session.archived = false;
					session.collectionId = group.collectionId;
				}
			}
			moveInOrder(draft, sessionIds, target, position);
		});
	}

	removeSessionsFromGroup(sessionIds: readonly string[], target?: string, position?: 'before' | 'after'): void {
		this.update('Removed from group', draft => {
			for (const id of sessionIds) {
				const session = getSession(draft, id);
				if (session) {
					session.groupId = undefined;
					session.pinned = false;
				}
			}
			moveInOrder(draft, sessionIds, target, position);
		});
	}

	reorderSessions(sessionIds: readonly string[], target: string, position: 'before' | 'after'): void {
		this.update('Reordered', draft => moveInOrder(draft, sessionIds, target, position));
	}

	setPinned(sessionIds: readonly string[], pinned: boolean, target?: string, position?: 'before' | 'after'): void {
		this.update(pinned ? 'Pinned' : 'Unpinned', draft => {
			for (const id of sessionIds) {
				const session = getSession(draft, id);
				if (session) {
					session.pinned = pinned;
					if (pinned) {
						session.groupId = undefined;
						session.archived = false;
					}
				}
			}
			moveInOrder(draft, sessionIds, target, position);
		});
	}

	setArchived(sessionIds: readonly string[], archived: boolean): void {
		this.update(archived ? (sessionIds.length > 1 ? `Marked ${sessionIds.length} sessions as done` : 'Marked as done') : 'Restored', draft => {
			for (const id of sessionIds) {
				const session = getSession(draft, id);
				if (session) {
					session.archived = archived;
					if (archived) {
						session.groupId = undefined;
						session.pinned = false;
						if (session.status !== MockSessionStatus.Read) {
							session.status = MockSessionStatus.Read;
						}
					}
				}
			}
		});
	}

	moveSessionsToCollection(sessionIds: readonly string[], collectionId: string): void {
		this.update(sessionIds.length > 1 ? `Moved ${sessionIds.length} sessions` : 'Moved session', draft => {
			for (const id of sessionIds) {
				const session = getSession(draft, id);
				if (session && session.collectionId !== collectionId) {
					session.collectionId = collectionId;
					session.groupId = undefined;
				}
			}
		});
	}

	markRead(sessionId: string): void {
		const session = getSession(this.current, sessionId);
		if (session?.status !== MockSessionStatus.Unread) {
			return;
		}
		this.update(undefined, draft => {
			const target = getSession(draft, sessionId);
			if (target) {
				target.status = MockSessionStatus.Read;
			}
		});
	}

	/** Creates an in-progress session in a group or workspace section of a collection. */
	newSession(collectionId: string, options: { readonly groupId?: string; readonly workspace?: string; readonly prompt?: string } = {}): string {
		const id = `s${this.current.nextId}`;
		const prompt = options.prompt?.trim();
		this.update('Created session', draft => {
			draft.nextId++;
			const group = getGroup(draft, options.groupId);
			const workspace = options.workspace ?? draft.sessions.find(s => s.groupId && s.groupId === options.groupId && s.workspace)?.workspace;
			const targetCollectionId = group?.collectionId ?? collectionId;
			const session: IMockSession = {
				id,
				title: prompt ? toTitle(prompt) : 'New session',
				workspace,
				status: MockSessionStatus.InProgress,
				description: 'Thinking…',
				minutesAgo: 0,
				collectionId: targetCollectionId,
				groupId: group?.id,
				messages: prompt ? [{ role: 'user', text: prompt }] : [],
			};
			const firstInSection = draft.sessions.findIndex(s => group ? s.groupId === group.id : (s.workspace === workspace && !s.groupId && s.collectionId === targetCollectionId));
			draft.sessions.splice(firstInSection >= 0 ? firstInSection : 0, 0, session);
			if (group) {
				group.collapsed = false;
			} else {
				// Reveal the section the new session lands in.
				const sectionKey = workspace ? workspaceKey(workspace) : 'chats';
				draft.collapsedSections = draft.collapsedSections.filter(k => k !== `${targetCollectionId}/${sectionKey}`);
			}
		});
		return id;
	}

	/** Sends a follow-up message; the session works until {@link completeTurn}. */
	sendMessage(sessionId: string, text: string): void {
		this.update(undefined, draft => {
			const session = getSession(draft, sessionId);
			if (!session) {
				return;
			}
			session.messages = [...(session.messages ?? []), { role: 'user', text }];
			session.status = MockSessionStatus.InProgress;
			session.description = 'Thinking…';
			session.minutesAgo = 0;
		});
	}

	/** Finishes the current turn with the agent's reply. Unread unless the session is being viewed. */
	completeTurn(sessionId: string, reply: string, viewed: boolean, diff?: { additions: number; deletions: number }): void {
		const session = getSession(this.current, sessionId);
		if (session?.status !== MockSessionStatus.InProgress) {
			return;
		}
		this.update(undefined, draft => {
			const target = getSession(draft, sessionId);
			if (!target) {
				return;
			}
			target.messages = [...(target.messages ?? []), { role: 'agent', text: reply }];
			target.status = viewed ? MockSessionStatus.Read : MockSessionStatus.Unread;
			target.description = undefined;
			target.minutesAgo = 0;
			if (diff && target.workspace) {
				target.diff = { additions: (target.diff?.additions ?? 0) + diff.additions, deletions: (target.diff?.deletions ?? 0) + diff.deletions };
			}
		});
	}

	//#endregion

	//#region Collections

	createCollection(name: string, icon: MockCollectionIcon, color: MockColor): string {
		const id = `c${this.current.nextId}`;
		this.update('Created collection', draft => {
			draft.nextId++;
			draft.collections.push({ id, name, icon, color });
			draft.sectionOrder[id] = [];
		});
		return id;
	}

	/** Deletes a collection, moving its contents into the first remaining collection. */
	deleteCollection(collectionId: string): string | undefined {
		const fallback = this.current.collections.find(c => c.id !== collectionId);
		if (!fallback) {
			return undefined;
		}
		this.update('Deleted collection', draft => {
			draft.collections = draft.collections.filter(c => c.id !== collectionId);
			for (const group of draft.groups) {
				if (group.collectionId === collectionId) {
					group.collectionId = fallback.id;
				}
			}
			for (const session of draft.sessions) {
				if (session.collectionId === collectionId) {
					session.collectionId = fallback.id;
				}
			}
			for (const style of Object.values(draft.workspaces)) {
				if (style.defaultCollectionId === collectionId) {
					style.defaultCollectionId = fallback.id;
				}
			}
			draft.sectionOrder[fallback.id] = [...(draft.sectionOrder[fallback.id] ?? []), ...(draft.sectionOrder[collectionId] ?? [])];
			delete draft.sectionOrder[collectionId];
		});
		return fallback.id;
	}

	moveCollection(collectionId: string, direction: -1 | 1): void {
		this.update('Reordered collections', draft => {
			const index = draft.collections.findIndex(c => c.id === collectionId);
			const target = index + direction;
			if (index < 0 || target < 0 || target >= draft.collections.length) {
				return;
			}
			const [collection] = draft.collections.splice(index, 1);
			draft.collections.splice(target, 0, collection);
		});
	}

	//#endregion
}

/** Session titles come from the first line of the prompt, like the real list. */
function toTitle(prompt: string): string {
	const line = prompt.split(/\r?\n/)[0].trim();
	return line.length > 64 ? `${line.slice(0, 63).trimEnd()}…` : line;
}

/** Moves sessions to sit before/after a target in the manual order, preserving their relative order. */
function moveInOrder(draft: IMockState, sessionIds: readonly string[], target: string | undefined, position: 'before' | 'after' | undefined): void {
	if (!target || !position || sessionIds.includes(target)) {
		return;
	}
	const moving = draft.sessions.filter(s => sessionIds.includes(s.id));
	const rest = draft.sessions.filter(s => !sessionIds.includes(s.id));
	const targetIndex = rest.findIndex(s => s.id === target);
	if (targetIndex < 0) {
		return;
	}
	rest.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, ...moving);
	draft.sessions = rest;
}

//#endregion

//#region Seed data

const palette = (id: MockPaletteColor): MockColor => ({ kind: 'palette', id });

/**
 * Seed data modeled on a real Agents window: work split into Engineering,
 * Personal, and Misc, with browser-style colored groups inside each.
 */
export function createSeedState(): IMockState {
	const eng = 'engineering';
	const personal = 'personal';
	const misc = 'misc';

	let counter = 0;
	const session = (collectionId: string, title: string, rest: Partial<IMockSession> = {}): IMockSession => ({
		id: `seed-${++counter}`,
		title,
		status: MockSessionStatus.Read,
		minutesAgo: 30 + counter * 7,
		collectionId,
		...rest,
	});

	const sessions: IMockSession[] = [
		// Engineering: pinned and quick chats
		session(eng, 'vscode-corpus', { workspace: 'vscode-engineering', pinned: true, minutesAgo: 90 }),
		session(eng, 'release branch builds', { minutesAgo: 14 }),
		session(eng, 'version bump fail', { pr: MockPullRequest.Draft, minutesAgo: 55 }),
		session(eng, 'VS Code team label', { minutesAgo: 240 }),

		// Engineering: endgame
		session(eng, '1.140.0 Endgame · Issue #338302', { workspace: 'vscode', groupId: 'endgame', status: MockSessionStatus.Unread, minutesAgo: 6 }),
		session(eng, 'Verify Windows ARM64 signing', { workspace: 'vscode', groupId: 'endgame', status: MockSessionStatus.InProgress, description: 'Running build validation', minutesAgo: 2 }),
		session(eng, 'Test plan item: sessions list colors', { workspace: 'vscode', groupId: 'endgame', status: MockSessionStatus.NeedsInput, minutesAgo: 9 }),

		// Engineering: engineering + CI
		session(eng, 'Run PR CI unit tests with a product quality token', { workspace: 'vscode', groupId: 'eng-ci', pr: MockPullRequest.Draft, minutesAgo: 22, diff: { additions: 48, deletions: 6 } }),
		session(eng, 'Skip flaky sessionsListHierarchy fixture spec', { workspace: 'vscode', groupId: 'eng-ci', pr: MockPullRequest.Merged, minutesAgo: 75 }),
		session(eng, 'ci: allow 30 minutes for Windows Electron tests', { workspace: 'vscode', groupId: 'eng-ci', pr: MockPullRequest.Open, minutesAgo: 130, diff: { additions: 12, deletions: 3 } }),

		// Engineering: collapsed groups
		session(eng, 'Draft October iteration plan', { workspace: 'vscode-internalbacklog', groupId: 'iteration-plan' }),
		session(eng, 'Collect carry-over items', { workspace: 'vscode-internalbacklog', groupId: 'iteration-plan', status: MockSessionStatus.Unread }),
		session(eng, '1.140 release notes: Agents window', { workspace: 'vscode-docs', groupId: 'release-notes', pr: MockPullRequest.Open }),
		session(eng, 'Screenshot pass for release notes', { workspace: 'vscode-docs', groupId: 'release-notes' }),
		session(eng, 'Rate limit Slack notifications', { workspace: 'vscode-probot', groupId: 'slack-service', pr: MockPullRequest.Draft }),
		session(eng, 'Review Slack architecture', { workspace: 'vscode-probot', groupId: 'slack-service', pr: MockPullRequest.Merged }),

		// Engineering: workspaces
		session(eng, 'Cherry-pick duplicate issue analysis', { workspace: 'vscode-engineering', pr: MockPullRequest.Draft, minutesAgo: 35 }),
		session(eng, 'Investigate pipeline-health alert', { workspace: 'vscode-engineering', pr: MockPullRequest.Draft, minutesAgo: 41 }),
		session(eng, 'GitHub API rate limit investigation', { workspace: 'vscode-engineering', pr: MockPullRequest.Draft, minutesAgo: 66 }),
		session(eng, 'vscode label descriptions', { workspace: 'vscode-engineering', minutesAgo: 88 }),
		session(eng, 'Semantic-similar shape change + #3934/#3935', { workspace: 'vscode-engineering', pr: MockPullRequest.Draft, minutesAgo: 140, diff: { additions: 210, deletions: 97 } }),
		session(eng, 'Triage duplicate-detection false positives', { workspace: 'vscode-internalbacklog', minutesAgo: 300 }),
		session(eng, 'Weekly report generator', { workspace: 'vscode-tools', minutesAgo: 400 }),
		session(eng, 'Review MCP tool descriptions', { workspace: 'vscode-review-mcp', minutesAgo: 500 }),

		// Engineering: backlog group
		session(eng, 'Flaky smoke test: terminal reconnect', { workspace: 'vscode', groupId: 'backlog' }),
		session(eng, 'Stale branch cleanup script', { workspace: 'vscode-engineering', groupId: 'backlog' }),

		// Engineering: done
		session(eng, 'Fix codicon font missing in worktrees', { workspace: 'vscode', archived: true, pr: MockPullRequest.Merged }),
		session(eng, 'Bump electron to 43.7.3', { workspace: 'vscode', archived: true, pr: MockPullRequest.Merged }),

		// Personal
		session(personal, 'Pick a new yo-yo string type', { minutesAgo: 25 }),
		session(personal, 'Hackathon demo script', { workspace: 'netmon', groupId: 'hackathon' }),
		session(personal, 'Slides: home network visualizer', { groupId: 'hackathon' }),
		session(personal, 'Write up hackathon demo notes', { groupId: 'after-hackathon', status: MockSessionStatus.Unread, minutesAgo: 18 }),
		session(personal, 'Clean up netmon packet parser', { workspace: 'netmon', groupId: 'after-hackathon', pr: MockPullRequest.Open, minutesAgo: 44, diff: { additions: 88, deletions: 140 } }),
		session(personal, 'Add per-device bandwidth chart', { workspace: 'netmon', status: MockSessionStatus.Unread, minutesAgo: 12 }),
		session(personal, 'Fix mDNS discovery on macOS', { workspace: 'netmon', status: MockSessionStatus.InProgress, description: 'Capturing packets', minutesAgo: 3 }),
		session(personal, 'Import CSV from credit union', { workspace: 'pocket-ledger', minutesAgo: 70, diff: { additions: 64, deletions: 2 } }),
		session(personal, 'Recurring expense detection', { workspace: 'pocket-ledger', pr: MockPullRequest.Draft, minutesAgo: 190 }),
		session(personal, 'FancyZones layout for ultrawide', { workspace: 'powertoys', minutesAgo: 600 }),
		session(personal, 'Balance tweak: armor degradation', { workspace: 'quasimorph-mods', status: MockSessionStatus.NeedsInput, minutesAgo: 8 }),
		session(personal, 'Port loadout mod to 1.2', { workspace: 'quasimorph-mods', minutesAgo: 320 }),
		session(personal, 'Build on Windows ARM', { workspace: 'quasimorph-mods [ml_win]', minutesAgo: 720 }),

		// Misc
		session(misc, 'Summarize Slack thread about the offsite', { minutesAgo: 16, status: MockSessionStatus.Unread }),
		session(misc, 'Draft 1:1 agenda', { minutesAgo: 95 }),
		session(misc, 'Draft PoP talk outline', { groupId: 'pop', minutesAgo: 33 }),
		session(misc, 'Collect PoP demo links', { groupId: 'pop', minutesAgo: 150 }),
		session(misc, 'Read up on CRDTs', { groupId: 'background' }),
		session(misc, 'Summarize agent host RFC', { groupId: 'background' }),
		session(misc, 'Docs: Agents window collections', { workspace: 'vscode-docs', pr: MockPullRequest.Open, minutesAgo: 210 }),
	];

	return {
		collections: [
			{ id: eng, name: 'Engineering', icon: 'graph', color: palette(MockPaletteColor.Blue) },
			{ id: personal, name: 'Personal', icon: 'home', color: palette(MockPaletteColor.Green) },
			{ id: misc, name: 'Misc', icon: 'briefcase', color: palette(MockPaletteColor.Orange) },
		],
		groups: [
			{ id: 'endgame', name: 'endgame', color: palette(MockPaletteColor.Yellow), textMode: MockTextColorMode.Auto, collectionId: eng, collapsed: false },
			{ id: 'eng-ci', name: 'engineering + CI', color: palette(MockPaletteColor.Purple), textMode: MockTextColorMode.Auto, collectionId: eng, collapsed: false },
			{ id: 'iteration-plan', name: 'Iteration Plan', color: palette(MockPaletteColor.Pink), textMode: MockTextColorMode.Auto, collectionId: eng, collapsed: true },
			{ id: 'release-notes', name: 'Release Notes', color: palette(MockPaletteColor.Cyan), textMode: MockTextColorMode.Auto, collectionId: eng, collapsed: true },
			{ id: 'slack-service', name: 'slack-service', color: palette(MockPaletteColor.Blue), textMode: MockTextColorMode.Auto, collectionId: eng, collapsed: true },
			{ id: 'backlog', name: 'backlog', color: palette(MockPaletteColor.Grey), textMode: MockTextColorMode.Auto, collectionId: eng, collapsed: true },
			{ id: 'hackathon', name: 'HACKATHON', color: palette(MockPaletteColor.Grey), textMode: MockTextColorMode.Auto, collectionId: personal, collapsed: true },
			{ id: 'after-hackathon', name: 'after hackathon', color: palette(MockPaletteColor.Purple), textMode: MockTextColorMode.Auto, collectionId: personal, collapsed: false },
			{ id: 'pop', name: 'PoP', color: palette(MockPaletteColor.Blue), textMode: MockTextColorMode.Auto, collectionId: misc, collapsed: false },
			{ id: 'background', name: 'Background', color: palette(MockPaletteColor.Grey), textMode: MockTextColorMode.Auto, collectionId: misc, collapsed: true },
		],
		workspaces: {
			'vscode-engineering': { color: palette(MockPaletteColor.Green), textMode: MockTextColorMode.Auto, defaultCollectionId: eng },
			'netmon': { color: palette(MockPaletteColor.Cyan), textMode: MockTextColorMode.Auto, defaultCollectionId: personal },
			'pocket-ledger': { color: palette(MockPaletteColor.Orange), textMode: MockTextColorMode.Auto, defaultCollectionId: personal },
		},
		// Pinned starts colored to show built-in sections take colors too; Chats stays plain.
		builtInSections: {
			[MockBuiltInSection.Pinned]: { color: palette(MockPaletteColor.Red), textMode: MockTextColorMode.Auto },
		},
		sessions,
		sectionOrder: {
			[eng]: ['group:endgame', 'group:eng-ci', 'group:iteration-plan', 'group:release-notes', 'group:slack-service', 'workspace:vscode-engineering', 'workspace:vscode-internalbacklog', 'workspace:vscode-tools', 'workspace:vscode-review-mcp', 'group:backlog'],
			[personal]: ['group:after-hackathon', 'group:hackathon', 'workspace:netmon', 'workspace:pocket-ledger', 'workspace:quasimorph-mods', 'workspace:quasimorph-mods [ml_win]', 'workspace:powertoys'],
			[misc]: ['group:pop', 'group:background', 'workspace:vscode-docs'],
		},
		collapsedSections: [
			`${eng}/workspace:vscode-internalbacklog`,
			`${eng}/workspace:vscode-tools`,
			`${eng}/workspace:vscode-review-mcp`,
			`${eng}/done`,
			`${personal}/workspace:powertoys`,
			`${personal}/workspace:quasimorph-mods [ml_win]`,
		],
		nextId: 1,
	};
}

//#endregion
