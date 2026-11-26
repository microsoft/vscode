/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isPendingSessionItem } from './pendingSessions.js';
import { ISessionSection, ISessionGroupItem, ISessionChatItem, SessionListItem, isSessionChatItem, isSessionGroupItem, isSessionSection, isSessionShowMore, isSessionPlaceholder, isSessionItem } from './sessionsListCommon.js';
import { DATE_SECTION_IDS, getChatTitle, isShortcutSection, isSessionGroupingSection } from './sessionsListHelpers.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { ListDragOverEffectPosition, ListDragOverEffectType } from '../../../../../base/browser/ui/list/list.js';
import { ITreeNode, ITreeDragAndDrop, ITreeDragOverReaction, TreeDragOverBubble } from '../../../../../base/browser/ui/tree/tree.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { getSessionGroupIdOfSection, getSessionGroupSectionId, ISessionGroupPlacement } from '../sessionGroupsService.js';
import { clearChatReferenceDragData, LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { DraggedSessionIdentifier, fillSessionChatDragData, onDidEndSessionChatDrag, SessionsDataTransfers } from '../dnd.js';
import { getSessionsListChatDrop, getSessionsListSessionDrop, ISessionsListChatDropTarget, SessionsListChatDrop, SessionsListSessionDrop } from './sessionsListChatMove.js';
import { IDragAndDropData } from '../../../../../base/browser/dnd.js';
import { ElementsDragAndDropData, ListViewTargetSector } from '../../../../../base/browser/ui/list/listView.js';

//#region Drag and Drop

/**
 * Where dropped sessions end up. Each placement is a rung of the list's
 * placement precedence (archived > pinned > custom group > ungrouped section),
 * so moving sessions into one only changes the state that precedence reads.
 */
export type SessionListPlacement =
	| { readonly kind: 'archived' }
	| { readonly kind: 'pinned' }
	| { readonly kind: 'group'; readonly groupId: string }
	/** The section a session renders in when it is neither archived, pinned, nor grouped. */
	| { readonly kind: 'section'; readonly sectionId: string };

/** The list-owned state a session needs to render in a placement. */
interface ISessionPlacementState {
	readonly archived: boolean;
	/** The pin state, or `undefined` to leave it unchanged. */
	readonly pinned?: boolean;
	/** The custom group, `null` for none, or `undefined` to leave membership unchanged. */
	readonly groupId?: string | null;
}

export function getPlacementState(placement: SessionListPlacement): ISessionPlacementState {
	switch (placement.kind) {
		case 'archived':
			return { archived: true };
		case 'pinned':
			return { archived: false, pinned: true };
		case 'group':
			return { archived: false, pinned: false, groupId: placement.groupId };
		case 'section':
			return { archived: false, pinned: false, groupId: null };
	}
}

/** The placement of the sessions rendered under a section or group id, or `undefined` when it does not accept sessions. */
export function getSectionPlacement(sectionId: string): SessionListPlacement | undefined {
	if (sectionId === 'pinned') {
		return { kind: 'pinned' };
	}
	if (sectionId === 'archived') {
		return { kind: 'archived' };
	}
	const groupId = getSessionGroupIdOfSection(sectionId);
	if (groupId !== undefined) {
		return { kind: 'group', groupId };
	}
	return isShortcutSection(sectionId) ? undefined : { kind: 'section', sectionId };
}

export function isSamePlacement(a: SessionListPlacement, b: SessionListPlacement): boolean {
	const header = getPlacementHeader(a);
	const other = getPlacementHeader(b);
	return header.kind === other.kind && header.id === other.id;
}

export function getPlacementHeader(placement: SessionListPlacement): ISessionDropTargetHeader {
	switch (placement.kind) {
		case 'archived':
			return { kind: 'section', id: 'archived' };
		case 'pinned':
			return { kind: 'section', id: 'pinned' };
		case 'group':
			return { kind: 'group', id: placement.groupId };
		case 'section':
			return { kind: 'section', id: placement.sectionId };
	}
}

/** A session row that dropped sessions are positioned against. */
export interface ISessionDropAnchor {
	readonly session: ISession;
	readonly position: 'before' | 'after';
	/**
	 * The anchor's section is derived from the sort key (date sections), so the
	 * sessions must stay next to the anchor rather than drift past a neighbour
	 * in another section.
	 */
	readonly staysInSection: boolean;
}

/** Row feedback shown while hovering a drop target. */
interface ISessionDropFeedback {
	readonly position: ListDragOverEffectPosition;
	/** The list index that shows the feedback, when it differs from the hovered row. */
	readonly index?: number;
}

/** Where sessions dropped on a list target go. */
export interface ISessionDropDestination {
	readonly placement: SessionListPlacement;
	/** The row to position the sessions against; `undefined` keeps their natural sort position. */
	readonly anchor?: ISessionDropAnchor;
	/** Whether the drop may restore archived sessions. */
	readonly restoresArchived: boolean;
	/** Row feedback; `undefined` relies on the destination header highlight alone. */
	readonly feedback?: ISessionDropFeedback;
}

/** What a valid session drop changes: the placement of at least one session, or only the manual order. */
export type SessionDropEffect = 'move' | 'reorder' | 'triage';

/**
 * Callbacks the sessions list provides to its drag-and-drop controller. The
 * controller decides where a drop goes; the list decides whether its sessions
 * may go there and applies the change.
 */
interface ISessionsListDndDelegate {
	/** The placement of the section or group a rendered session row belongs to. */
	getRowPlacement(session: ISession): SessionListPlacement | undefined;
	/** The visible nested chat rows of a rendered session, in display order. */
	getVisibleChatRows(session: ISession): readonly ISessionChatItem[];
	/** The rendered date sections in display order, or `undefined` when not grouping by date. */
	getDateSections(): readonly ISessionSection[] | undefined;
	/** What moving the sessions to the destination changes, or `undefined` when the move is not allowed. */
	getSessionDropEffect(sessions: readonly ISession[], destination: ISessionDropDestination): SessionDropEffect | undefined;
	/** Move the sessions to the destination. */
	moveSessions(sessions: readonly ISession[], destination: ISessionDropDestination): void;
	/** Highlight only the header that will receive the dragged sessions. */
	setDropTargetHeader(header: ISessionDropTargetHeader | undefined): void;
	/** Where a dragged header lands when dropped on the target in the given quarter of its row, or `undefined` when it can't land there. */
	getHeaderDrop(header: IDraggedHeader, target: SessionListItem, sector: ListViewTargetSector | undefined): SessionHeaderDrop | undefined;
	/** How many rows the element renders: its own row and those of its visible descendants. */
	getRenderedRowCount(element: SessionListItem): number;
	/** The list index of the first row of the "+N more" area: its toggle row, or the first workspace it reveals. */
	getMoreFoldersDropIndex(): number | undefined;
	/** Move a dragged header to where it lands. */
	moveHeader(header: IDraggedHeader, drop: SessionHeaderDrop): void;
	/** Steps the insertion line of a header drop in to the depth where the header lands, or resets it. */
	setHeaderInsertionDepth(depth: number | undefined): void;
	/** The dragged chat row's chat, with its session, when moving chats by drag and drop is on and it can move. */
	getMovableDraggedChat(item: ISessionChatItem): { readonly session: ISession; readonly chat: IChat } | undefined;
	/** Attach a reference to the chat of `session` to the drag, such that it can also drop into a chat input that attaches it. */
	fillChatReferenceDragData(event: DragEvent, session: ISession, chat: IChat): void;
	/** Whether nested chat rows are shown in their session's chat order, so that a position among them is a position in that order. */
	areChatPositionsShown(): boolean;
	/** Whether chats may also move into sessions of other agents that offer their harness (see {@link isCrossAgentChatMoveEnabled}). */
	isCrossAgentChatMoveEnabled(): boolean;
	/** Whether the session can move under another session, when moving chats by drag and drop is on. */
	canMoveSessionUnder(session: ISession): boolean;
	/** Move the chat of `session` as the drop says. */
	moveChat(session: ISession, chat: IChat, drop: SessionsListChatDrop): void;
	/** Move `session` under `target`, after its chat `after` (`undefined`: first). */
	moveSessionUnder(session: ISession, target: ISession, after: IChat | undefined): void;
	/** Whether the session is in a section the user orders by hand: Pinned, a custom group, or a workspace, repository or environment section. */
	isInManuallyOrderedSection(session: ISession): boolean;
	/**
	 * Whether the row is the last one its section shows (under a find filter, the last one that matches): its last
	 * session's row, or that session's last chat row.
	 */
	isLastRowOfSection(element: ISession | ISessionChatItem): boolean;
	/**
	 * Shows the drop feedback for moving a chat or session rather than the list's other drags: `'move'` for a drop into
	 * a session, a new session, or a placement between sessions; `'nested'` for an insertion line among a session's
	 * nested rows, drawn at their indent; `'none'` for the list's other drags.
	 */
	setMoveDropFeedback(kind: 'none' | 'move' | 'nested'): void;
}

export interface ISessionDropTargetHeader {
	readonly kind: 'group' | 'section';
	readonly id: string;
}

/** A group, or workspace or repository header being dragged to move it. */
export interface IDraggedHeader {
	/** The header's section id, under which the section order stores its position. */
	readonly id: string;
	/** The dragged group, or `undefined` for a workspace or repository header. */
	readonly group?: ISessionGroupItem;
}

/**
 * Where a dragged header lands: next to a top-level header, which the list
 * orders; next to a subgroup of `parentId`, `depth` groups deep, which the
 * groups service orders; or inside a group as its first subgroup.
 */
export type SessionHeaderDrop =
	| { readonly kind: 'topLevel'; readonly targetId: string; readonly position: 'before' | 'after'; readonly aboveMore?: boolean }
	| { readonly kind: 'subgroup'; readonly parentId: string; readonly depth: number; readonly placement: ISessionGroupPlacement }
	| { readonly kind: 'comparison'; readonly parent: ISessionSection | ISessionGroupItem | ISession; readonly anchor?: ISession | ISessionGroupItem; readonly position: 'before' | 'after'; readonly depth: number }
	| { readonly kind: 'into'; readonly groupId: string };

/** A resolved drop: its hover feedback and what dropping does. */
interface ISessionsListDropOperation {
	readonly reaction: ITreeDragOverReaction;
	/** The header highlighted as the destination of the drop. */
	readonly header?: ISessionDropTargetHeader;
	/** The feedback for moving a chat or session through its provider; `'none'` (default) for the list's own drops. */
	readonly moveFeedback?: 'move' | 'nested';
	/** How many groups deep a header lands next to its siblings, which its insertion line steps in by. */
	readonly insertionDepth?: number;
	run(): void;
}

export class SessionsListDragAndDrop extends Disposable implements ITreeDragAndDrop<SessionListItem> {

	private readonly _transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();
	/** The chat row this list is dragging and what it moves, resolved once when the drag starts. */
	private _draggedChat: { readonly item: ISessionChatItem; readonly movable: { readonly session: ISession; readonly chat: IChat } | undefined } | undefined;
	/** The one session this list is dragging, which stands for the chat it shows. */
	private _draggedSession: ISession | undefined;

	constructor(private readonly delegate: ISessionsListDndDelegate) {
		super();
	}

	getDragURI(element: SessionListItem): string | null {
		if (isPendingSessionItem(element)) {
			return null;
		}
		if (isSessionGroupItem(element)) {
			return `sessionGroup:${element.group.id}`;
		}
		if (isSessionSection(element)) {
			// Only grouping sections are reorderable; Pinned, Done
			// and the date sections stay fixed and are therefore not draggable.
			return isSessionGroupingSection(element.id) ? `sessionWorkspace:${element.id}` : null;
		}
		if (isSessionShowMore(element)) {
			return null;
		}
		if (isSessionPlaceholder(element)) {
			return null;
		}
		if (isSessionChatItem(element)) {
			return element.standalone ? null : element.chat.resource.toString();
		}
		return element.resource.toString();
	}

	getDragLabel(elements: SessionListItem[]): string | undefined {
		const chatItem = elements.find(isSessionChatItem);
		if (chatItem) {
			return getChatTitle(chatItem.chat);
		}
		const groupItem = elements.find(isSessionGroupItem);
		if (groupItem) {
			return groupItem.group.name;
		}
		const workspaceSection = elements.find((e): e is ISessionSection => isSessionSection(e) && isSessionGroupingSection(e.id));
		if (workspaceSection) {
			return workspaceSection.label;
		}
		const sessions = elements.filter(isSessionItem);
		if (sessions.length === 0) {
			return undefined;
		}
		if (sessions.length === 1) {
			return sessions[0].title.get();
		}
		return localize('sessions.dragLabel', "{0} sessions", sessions.length);
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		const elements = this.draggedElements(data);
		const chatItem = elements.find(isSessionChatItem);
		if (chatItem) {
			fillSessionChatDragData(originalEvent, chatItem.session.sessionId, chatItem.chat.resource);
			this.delegate.fillChatReferenceDragData(originalEvent, chatItem.session, chatItem.chat);
			this._draggedChat = { item: chatItem, movable: this.delegate.getMovableDraggedChat(chatItem) };
			return;
		}
		const sessions = elements.filter(isSessionItem);
		if (sessions.length === 0) {
			return;
		}

		this._draggedSession = sessions.length === 1 ? sessions[0] : undefined;
		const identifiers = sessions.map(s => new DraggedSessionIdentifier(s.sessionId, s.resource));
		this._transfer.setData(identifiers, DraggedSessionIdentifier.prototype);
		if (this._draggedSession) {
			// The session stands for its main chat, which a chat input can attach.
			this.delegate.fillChatReferenceDragData(originalEvent, this._draggedSession, this._draggedSession.mainChat.get());
		}

		if (originalEvent.dataTransfer) {
			// Expose the first dragged session as a typed payload as well so external
			// drop handlers can read it without using the local transfer.
			const payload = JSON.stringify({ sessionId: sessions[0].sessionId, resource: sessions[0].resource.toString() });
			originalEvent.dataTransfer.setData(SessionsDataTransfers.SESSION, payload);
		}
	}

	onDragEnd(originalEvent: DragEvent): void {
		const draggedChat = this._draggedChat?.item;
		const draggedSession = this._draggedSession;
		if (DOM.isHTMLElement(originalEvent.target)) {
			if (draggedChat) {
				onDidEndSessionChatDrag(originalEvent, originalEvent.target, draggedChat.session, draggedChat.chat.resource, getChatTitle(draggedChat.chat));
			} else if (draggedSession) {
				onDidEndSessionChatDrag(originalEvent, originalEvent.target, draggedSession, undefined, draggedSession.title.get());
			}
		}
		this._draggedSession = undefined;

		this._transfer.clearData(DraggedSessionIdentifier.prototype);
		clearChatReferenceDragData();
		this._draggedChat = undefined;
		this.delegate.setDropTargetHeader(undefined);
		this.delegate.setMoveDropFeedback('none');
		this.delegate.setHeaderInsertionDepth(undefined);
	}

	onDragOver(data: IDragAndDropData, targetElement: SessionListItem | undefined, targetIndex: number | undefined, listTargetSector: ListViewTargetSector | undefined, originalEvent?: DragEvent): boolean | ITreeDragOverReaction {
		const operation = this.resolveDrop(data, targetElement, targetIndex, getRowSector(originalEvent, listTargetSector));
		this.delegate.setDropTargetHeader(operation?.header);
		this.delegate.setMoveDropFeedback(operation?.moveFeedback ?? 'none');
		this.delegate.setHeaderInsertionDepth(operation?.insertionDepth);
		return operation?.reaction ?? false;
	}

	drop(data: IDragAndDropData, targetElement: SessionListItem | undefined, targetIndex: number | undefined, listTargetSector: ListViewTargetSector | undefined, originalEvent?: DragEvent): void {
		this.delegate.setDropTargetHeader(undefined);
		this.delegate.setMoveDropFeedback('none');
		this.delegate.setHeaderInsertionDepth(undefined);
		this.resolveDrop(data, targetElement, targetIndex, getRowSector(originalEvent, listTargetSector))?.run();
	}

	/**
	 * Resolve dropping the current drag on a target, the same way on drag over and on drop. Each kind of dragged item
	 * has its own resolver; moves through the sessions provider take precedence over the list's own placement.
	 */
	private resolveDrop(data: IDragAndDropData, target: SessionListItem | undefined, targetIndex: number | undefined, sector: ListViewTargetSector | undefined): ISessionsListDropOperation | undefined {
		if (target && (isPendingSessionItem(target) || isSessionSection(target) && target.pendingItems)) {
			return undefined;
		}
		// The Done section's rows for done chats of sessions that are not done are not drop targets.
		if (target && isSessionChatItem(target) && target.standalone) {
			return undefined;
		}
		const elements = this.draggedElements(data);
		const header = this.draggedHeader(elements);
		if (header) {
			return this.resolveHeaderDrop(header, target, targetIndex, sector);
		}
		if (elements.length > 0 && elements.every(isSessionChatItem)) {
			// Only the provider orders nested chats: a chat it can't move, or several chats, can't be dropped.
			const movable = elements.length === 1 ? this.movableChat(elements[0]) : undefined;
			return movable ? this.resolveChatMove(movable, target, targetIndex, sector) : undefined;
		}
		const sessions = elements.filter(isSessionItem);
		if (sessions.length === 0) {
			return undefined;
		}
		const nest = this.resolveSessionNest(sessions, target, sector);
		if (nest?.kind === 'nest') {
			const session = sessions[0];
			return {
				reaction: nest.position === 'over' ? this.intoSessionDropReaction(target, targetIndex) : toDropReaction({ position: toEffectPosition(nest.position) }),
				moveFeedback: nest.position === 'over' ? 'move' : 'nested',
				run: () => this.delegate.moveSessionUnder(session, nest.session, nest.after),
			};
		}
		if (nest?.kind === 'place') {
			const operation = this.resolveSessionDrop(sessions, nest.session, undefined, nest.position === 'before' ? ListViewTargetSector.TOP : ListViewTargetSector.BOTTOM);
			return operation && { ...operation, moveFeedback: 'move' };
		}
		return this.resolveSessionDrop(sessions, target, targetIndex, sector);
	}

	/**
	 * A header lands next to another header, shown by an insertion line, or inside
	 * a group, shown by highlighting the group's header (and its row, when it is
	 * the hovered row). A header landing after an expanded header lands below
	 * that header's rows, so the line is drawn below them.
	 */
	private resolveHeaderDrop(header: IDraggedHeader, target: SessionListItem | undefined, targetIndex: number | undefined, sector: ListViewTargetSector | undefined): ISessionsListDropOperation | undefined {
		const drop = target && this.delegate.getHeaderDrop(header, target, sector);
		if (!target || !drop) {
			return undefined;
		}
		const run = () => this.delegate.moveHeader(header, drop);
		const insertionFeedback = (position: 'before' | 'after'): ISessionDropFeedback => ({
			position: toEffectPosition(position),
			index: position === 'after' && targetIndex !== undefined ? targetIndex + this.delegate.getRenderedRowCount(target) - 1 : undefined,
		});
		if (drop.kind === 'topLevel') {
			// A header dropped on the "+N more" area lands above it, so draw the line there.
			const moreIndex = drop.aboveMore ? this.delegate.getMoreFoldersDropIndex() : undefined;
			const feedback = moreIndex !== undefined ? { position: ListDragOverEffectPosition.Before, index: moreIndex } : insertionFeedback(drop.position);
			return { reaction: toDropReaction(feedback), insertionDepth: 0, run };
		}
		if (drop.kind === 'subgroup') {
			return { reaction: toDropReaction(insertionFeedback(drop.placement.position)), insertionDepth: drop.depth, run };
		}
		if (drop.kind === 'comparison') {
			return { reaction: toDropReaction(insertionFeedback(drop.position)), insertionDepth: drop.depth, run };
		}
		const isHeaderRow = isSessionGroupItem(target) && target.group.id === drop.groupId;
		return {
			reaction: toDropReaction(isHeaderRow ? { position: ListDragOverEffectPosition.Over } : undefined),
			header: { kind: 'group', id: drop.groupId },
			run,
		};
	}

	/** The chat a dragged chat row moves through its provider, when chats can move by drag and drop and this one can. */
	private movableChat(item: ISessionChatItem): { readonly session: ISession; readonly chat: IChat } | undefined {
		return this._draggedChat?.item === item ? this._draggedChat.movable : this.delegate.getMovableDraggedChat(item);
	}

	/**
	 * Where a chat that its provider can move goes when dropped here (see {@link getSessionsListChatDrop}): within or
	 * into a session, or into a new session. The provider then owns the chat order.
	 */
	private resolveChatMove(dragged: { readonly session: ISession; readonly chat: IChat }, targetElement: SessionListItem | undefined, targetIndex: number | undefined, sector: ListViewTargetSector | undefined): ISessionsListDropOperation | undefined {
		let target: ISessionsListChatDropTarget | undefined;
		if (targetElement && isSessionChatItem(targetElement)) {
			target = { session: targetElement.session, chat: targetElement.chat, position: sectorToPosition(sector) };
		} else if (targetElement && isSessionItem(targetElement)) {
			target = { session: targetElement, chat: undefined, position: 'before' };
		}
		const drop = getSessionsListChatDrop(dragged.session, dragged.chat, target, this.delegate.areChatPositionsShown(), this.delegate.isCrossAgentChatMoveEnabled());
		if (!drop) {
			return undefined;
		}
		let reaction: ITreeDragOverReaction;
		if (drop.kind === 'newSession') {
			// The whole list shows it receives the chat as a new session.
			reaction = { accept: true, feedback: [-1], effect: { type: ListDragOverEffectType.Move, position: ListDragOverEffectPosition.Over } };
		} else if (drop.position === 'over') {
			reaction = this.intoSessionDropReaction(targetElement, targetIndex);
		} else {
			reaction = toDropReaction({ position: toEffectPosition(drop.position) });
		}
		return {
			reaction,
			moveFeedback: drop.kind === 'session' && drop.position !== 'over' ? 'nested' : 'move',
			run: () => this.delegate.moveChat(dragged.session, dragged.chat, drop),
		};
	}

	/** Dropping into a session at its end highlights all of its rows, also when the pointer is over one of its nested chat rows. */
	private intoSessionDropReaction(target: SessionListItem | undefined, targetIndex: number | undefined): ITreeDragOverReaction {
		const reaction = intoSessionDropReaction();
		if (!target || !isSessionChatItem(target) || targetIndex === undefined) {
			return reaction;
		}
		const chatIndex = this.delegate.getVisibleChatRows(target.session).indexOf(target);
		if (chatIndex < 0) {
			return reaction;
		}
		const sessionIndex = targetIndex - chatIndex - 1;
		const rowCount = this.delegate.getRenderedRowCount(target.session);
		return { ...reaction, feedback: Array.from({ length: rowCount }, (_, i) => sessionIndex + i) };
	}

	/**
	 * What a single dragged session that can move under another session does here (see
	 * {@link getSessionsListSessionDrop}), or `undefined` when the list places it as any dragged session.
	 */
	private resolveSessionNest(sessions: readonly ISession[], targetElement: SessionListItem | undefined, sector: ListViewTargetSector | undefined): SessionsListSessionDrop | undefined {
		if (sessions.length !== 1 || !targetElement || sector === undefined || !this.delegate.canMoveSessionUnder(sessions[0])) {
			return undefined;
		}
		const chatItem = isSessionChatItem(targetElement) ? targetElement : undefined;
		const session = chatItem ? chatItem.session : isSessionItem(targetElement) ? targetElement : undefined;
		if (!session || (!chatItem && session.sessionId === sessions[0].sessionId)) {
			return undefined;
		}
		return getSessionsListSessionDrop(sessions[0], {
			session,
			chat: chatItem?.chat,
			quarter: sector,
			isManuallyOrdered: () => this.delegate.isInManuallyOrderedSection(session),
			isLastInSection: () => this.delegate.isLastRowOfSection(chatItem ?? session),
			canPlace: position => !!this.resolveSessionDrop(sessions, session, undefined, position === 'before' ? ListViewTargetSector.TOP : ListViewTargetSector.BOTTOM),
		}, this.delegate.areChatPositionsShown(), this.delegate.isCrossAgentChatMoveEnabled());
	}

	private resolveSessionDrop(sessions: readonly ISession[], target: SessionListItem | undefined, targetIndex: number | undefined, sector: ListViewTargetSector | undefined): ISessionsListDropOperation | undefined {
		const destination = this.resolveSessionDestination(sessions, target, targetIndex, sector);
		const effect = destination && this.delegate.getSessionDropEffect(sessions, destination);
		if (!destination || !effect) {
			return undefined;
		}
		// A reorder shown as an insertion line needs no header; anything else marks where the sessions land.
		const showsInsertionLine = destination.feedback !== undefined && destination.feedback.position !== ListDragOverEffectPosition.Over;
		return {
			reaction: toDropReaction(effect === 'triage' ? { position: ListDragOverEffectPosition.Over } : destination.feedback),
			header: effect !== 'reorder' || !showsInsertionLine ? getPlacementHeader(destination.placement) : undefined,
			run: () => this.delegate.moveSessions(sessions, destination),
		};
	}

	/**
	 * Map the hovered element to where dropped sessions go, with one case per
	 * kind of list element. Whether the sessions may go there is decided by
	 * {@link ISessionsListDndDelegate.getSessionDropEffect}.
	 */
	private resolveSessionDestination(sessions: readonly ISession[], target: SessionListItem | undefined, targetIndex: number | undefined, sector: ListViewTargetSector | undefined): ISessionDropDestination | undefined {
		const over: ISessionDropFeedback = { position: ListDragOverEffectPosition.Over };
		if (target === undefined) {
			return this.resolveEmptySpaceDestination(sessions);
		}
		if (isPendingSessionItem(target)) {
			return undefined;
		}
		if (isSessionGroupItem(target)) {
			return { placement: { kind: 'group', groupId: target.group.id }, restoresArchived: true, feedback: over };
		}
		if (isSessionSection(target)) {
			return this.resolveSectionHeaderDestination(sessions, target);
		}
		if (isSessionPlaceholder(target) || (isSessionShowMore(target) && target.kind === 'sessions')) {
			const placement = getSectionPlacement(target.sectionId);
			return placement && { placement, restoresArchived: true, feedback: over };
		}
		if (isSessionShowMore(target)) {
			return undefined;
		}
		if (isSessionChatItem(target)) {
			// A nested chat row stands for its parent session: drop below the parent and all of its chats.
			const chatIndex = this.delegate.getVisibleChatRows(target.session).indexOf(target);
			const parentIndex = targetIndex === undefined || chatIndex < 0 ? undefined : targetIndex - chatIndex - 1;
			return this.resolveRowDestination(sessions, target.session, 'after', parentIndex);
		}
		return this.resolveRowDestination(sessions, target, sectorToPosition(sector), targetIndex);
	}

	private resolveRowDestination(sessions: readonly ISession[], row: ISession, position: 'before' | 'after', rowIndex: number | undefined): ISessionDropDestination | undefined {
		const placement = this.delegate.getRowPlacement(row);
		if (!placement || sessions.some(session => session.sessionId === row.sessionId)) {
			return undefined;
		}
		if (placement.kind === 'archived') {
			// Archived sessions keep a fixed order, so their rows only stand for the section.
			return { placement, restoresArchived: true };
		}
		// Dropping after a session lands below its nested chats, so show the line there.
		const feedback: ISessionDropFeedback = position === 'after' && rowIndex !== undefined
			? { position: ListDragOverEffectPosition.After, index: rowIndex + this.delegate.getVisibleChatRows(row).length }
			: { position: toEffectPosition(position) };
		return {
			placement,
			anchor: { session: row, position, staysInSection: isDateSectionPlacement(placement) },
			restoresArchived: true,
			feedback,
		};
	}

	/** Date sections derive from the sort key, so a header drop places the sessions at the top of that section. */
	private resolveSectionHeaderDestination(sessions: readonly ISession[], section: ISessionSection): ISessionDropDestination | undefined {
		const placement = getSectionPlacement(section.id);
		if (!placement) {
			return undefined;
		}
		const over: ISessionDropFeedback = { position: ListDragOverEffectPosition.Over };
		if (!isDateSectionPlacement(placement)) {
			return { placement, restoresArchived: true, feedback: over };
		}
		const draggedIds = new Set(sessions.map(session => session.sessionId));
		const first = section.sessions.find(session => !draggedIds.has(session.sessionId));
		return {
			placement,
			anchor: first && { session: first, position: 'before', staysInSection: true },
			restoresArchived: true,
			feedback: over,
		};
	}

	/** Below the last row, sessions go to the end of the date sections. Archived sessions stay put. */
	private resolveEmptySpaceDestination(sessions: readonly ISession[]): ISessionDropDestination | undefined {
		const dateSections = this.delegate.getDateSections();
		if (!dateSections) {
			return undefined;
		}
		// Anchor on the last session that is not being dragged, even when that empties the final section.
		const draggedIds = new Set(sessions.map(session => session.sessionId));
		for (let index = dateSections.length - 1; index >= 0; index--) {
			const last = dateSections[index].sessions.findLast(session => !draggedIds.has(session.sessionId));
			if (last) {
				return {
					placement: { kind: 'section', sectionId: dateSections[index].id },
					anchor: { session: last, position: 'after', staysInSection: true },
					restoresArchived: false,
				};
			}
		}
		return { placement: { kind: 'section', sectionId: DATE_SECTION_IDS[0] }, restoresArchived: false };
	}

	private draggedElements(data: IDragAndDropData): SessionListItem[] {
		return data instanceof ElementsDragAndDropData ? data.elements as SessionListItem[] : [];
	}

	private draggedHeader(elements: readonly SessionListItem[]): IDraggedHeader | undefined {
		const groupItem = elements.find(isSessionGroupItem);
		if (groupItem) {
			return { id: getSessionGroupSectionId(groupItem.group.id), group: groupItem };
		}
		const section = elements.find((e): e is ISessionSection => isSessionSection(e) && isSessionGroupingSection(e.id));
		if (section) {
			return { id: section.id };
		}
		return undefined;
	}
}

export function isDateSectionPlacement(placement: SessionListPlacement): boolean {
	return placement.kind === 'section' && DATE_SECTION_IDS.includes(placement.sectionId);
}

/**
 * Puts the date sections of a top-level order back in their fixed relative
 * order, within the positions they hold. A reorder in another grouping mode
 * carries them along with the headers they follow, which can swap them.
 */
export function keepDateSectionOrder(order: readonly string[]): string[] {
	const dateSectionIds = DATE_SECTION_IDS.filter(id => order.includes(id));
	let next = 0;
	return order.map(id => DATE_SECTION_IDS.includes(id) ? dateSectionIds[next++] : id);
}

export function sectorToPosition(sector: ListViewTargetSector | undefined): 'before' | 'after' {
	return sector !== undefined && sector >= ListViewTargetSector.CENTER_BOTTOM ? 'after' : 'before';
}

function toEffectPosition(position: 'before' | 'after'): ListDragOverEffectPosition {
	return position === 'after' ? ListDragOverEffectPosition.After : ListDragOverEffectPosition.Before;
}

/**
 * The quarter of the row under the pointer. The list computes it from `offsetY`, which is relative to the element under
 * the pointer (e.g. a row's title or description), not to the row: a pointer low on a row's title reads as its top.
 */
function getRowSector(e: DragEvent | undefined, listSector: ListViewTargetSector | undefined): ListViewTargetSector | undefined {
	const row = listSector !== undefined && e && DOM.isHTMLElement(e.target) ? e.target.closest<HTMLElement>('.monaco-list-row') : null;
	const bounds = row?.getBoundingClientRect();
	if (!e || !bounds?.height) {
		return listSector;
	}
	return Math.min(Math.max(Math.floor((e.clientY - bounds.top) / bounds.height * 4), ListViewTargetSector.TOP), ListViewTargetSector.BOTTOM);
}

/**
 * Dropping into a session, like into a folder in the Explorer: the session's row and its shown nested rows highlight,
 * and a collapsed session expands after a moment so the drop can go between its nested rows.
 */
function intoSessionDropReaction(): ITreeDragOverReaction {
	return { accept: true, bubble: TreeDragOverBubble.Down, autoExpand: true, effect: { type: ListDragOverEffectType.Move, position: ListDragOverEffectPosition.Over } };
}

/** The last of `nodes` the tree shows (a find filter can hide some) whose element is a `T`, scanning from the end. */
export function findLastVisible<T extends SessionListItem>(nodes: readonly ITreeNode<SessionListItem | null, FuzzyScore>[], is: (element: SessionListItem) => element is T): T | undefined {
	for (let i = nodes.length - 1; i >= 0; i--) {
		const element = nodes[i].element;
		if (nodes[i].visible && element && is(element)) {
			return element;
		}
	}
	return undefined;
}

function toDropReaction(feedback: ISessionDropFeedback | undefined): ITreeDragOverReaction {
	if (!feedback) {
		// An empty feedback list suppresses both row and whole-list feedback.
		return { accept: true, feedback: [] };
	}
	return {
		accept: true,
		effect: { type: ListDragOverEffectType.Move, position: feedback.position },
		feedback: feedback.index === undefined ? undefined : [feedback.index],
	};
}

//#endregion
