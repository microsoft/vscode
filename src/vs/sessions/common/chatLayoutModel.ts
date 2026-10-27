/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** How a window shows a chat and its editor. */
export const enum SessionLayoutMode {
	/** The editor above the chat. The chat can be dragged down to show only its input. */
	Stacked = 'stacked',
	/** The chat beside the editor. */
	SideBySide = 'sideBySide',
	/** Only the editor. */
	EditorOnly = 'editorOnly',
	/** Only the chat. */
	ChatOnly = 'chatOnly',
}

/** Where the terminals show. Full Width matches the panel alignment "justify" of the main window, Under Chat matches "center". */
export const enum ChatTerminalPosition {
	FullWidth = 'fullWidth',
	UnderChat = 'underChat',
	UnderEditor = 'underEditor',
}

/** The cells of a window. */
export const enum ChatLayoutCell {
	Chat = 'chat',
	SidePane = 'sidePane',
	Terminals = 'terminals',
	/** The Session Activity Bar strip, when it is a cell of its own. */
	Column = 'column',
}

/** Where the Session Activity Bar shows. */
export const enum ChatColumnPlacement {
	/** Not as a cell: it is hidden, or it shows inside the chat. */
	None = 'none',
	/** A cell at the right of the editor and the chat, as tall as the window, past the terminals. */
	Full = 'full',
	/** A cell beside the editor, ending above the terminals. */
	BesideEditor = 'besideEditor',
}

export interface IChatLayoutState {
	/** The mode to show. A docked window has no Side by Side, it shows Stacked instead. */
	readonly mode: SessionLayoutMode;
	readonly terminalPosition: ChatTerminalPosition;
	readonly terminalsVisible: boolean;
	/** Whether the Session Activity Bar is on and has something to show. */
	readonly activityBar: boolean;
	/** Whether the window is docked into another window. */
	readonly docked: boolean;
	/** Whether the chat is dragged down to its input (Stacked only). */
	readonly inputOnly: boolean;
}

export interface IChatLayoutLeaf {
	readonly cell: ChatLayoutCell;
	readonly visible: boolean;
}

export interface IChatLayoutBranch {
	/** `row` lays its children out side by side, `column` one above the other. */
	readonly orientation: 'row' | 'column';
	readonly children: readonly ChatLayoutNode[];
}

export type ChatLayoutNode = IChatLayoutLeaf | IChatLayoutBranch;

export interface IChatLayout {
	/** The mode shown, which differs from the requested one for a docked window. */
	readonly mode: SessionLayoutMode;
	/** The cells of the window. Hidden cells stay in the tree so that showing them is not a move. */
	readonly topology: IChatLayoutBranch;
	readonly column: ChatColumnPlacement;
	/** Whether the chat shows only its input. */
	readonly inputOnly: boolean;
	/** The cells that are present, in tab and landmark order: chat, side pane, terminals, column. */
	readonly tabOrder: readonly ChatLayoutCell[];
	/** The structure of the topology without visibility: a different key needs the grid rebuilt. */
	readonly shapeKey: string;
}

export type ChatLayoutChange = 'none' | 'visibility' | 'rebuild';

const tabOrder: readonly ChatLayoutCell[] = [ChatLayoutCell.Chat, ChatLayoutCell.SidePane, ChatLayoutCell.Terminals, ChatLayoutCell.Column];

function isBranch(node: ChatLayoutNode): node is IChatLayoutBranch {
	return 'children' in node;
}

/** Builds a branch without nesting a branch of the same orientation, or keeping a branch of a single child. */
function branch(orientation: 'row' | 'column', ...children: ChatLayoutNode[]): ChatLayoutNode {
	const flat: ChatLayoutNode[] = [];
	for (const child of children) {
		if (isBranch(child) && child.orientation === orientation) {
			flat.push(...child.children);
		} else {
			flat.push(child);
		}
	}
	return flat.length === 1 ? flat[0] : { orientation, children: flat };
}

function shapeOf(node: ChatLayoutNode): string {
	return isBranch(node) ? `${node.orientation}[${node.children.map(shapeOf).join(',')}]` : node.cell;
}

function collectLeaves(node: ChatLayoutNode, into: IChatLayoutLeaf[] = []): IChatLayoutLeaf[] {
	if (isBranch(node)) {
		node.children.forEach(child => collectLeaves(child, into));
	} else {
		into.push(node);
	}
	return into;
}

/**
 * Computes how a window lays out its cells for a state: the grid topology, where the Session Activity Bar column is, and
 * whether the chat shows only its input. It is the single source of these rules for every window that lays out a chat
 * and its editor, as a pure function of the state: no DOM, no grid reads, no history.
 */
export function computeChatLayout(state: IChatLayoutState): IChatLayout {
	const mode = state.docked && state.mode === SessionLayoutMode.SideBySide ? SessionLayoutMode.Stacked : state.mode;
	const chat: ChatLayoutNode = { cell: ChatLayoutCell.Chat, visible: true };
	const sidePane: ChatLayoutNode = { cell: ChatLayoutCell.SidePane, visible: true };
	const terminals: ChatLayoutNode = { cell: ChatLayoutCell.Terminals, visible: state.terminalsVisible };
	const column: ChatLayoutNode = { cell: ChatLayoutCell.Column, visible: state.activityBar };

	let root: ChatLayoutNode;
	let placement = ChatColumnPlacement.None;
	switch (mode) {
		case SessionLayoutMode.ChatOnly:
			root = branch('column', chat, terminals);
			break;
		case SessionLayoutMode.SideBySide:
			switch (state.terminalPosition) {
				case ChatTerminalPosition.FullWidth:
					root = branch('column', branch('row', chat, sidePane), terminals);
					break;
				case ChatTerminalPosition.UnderChat:
					root = branch('row', branch('column', chat, terminals), sidePane);
					break;
				case ChatTerminalPosition.UnderEditor:
					root = branch('row', chat, branch('column', sidePane, terminals));
					break;
			}
			break;
		case SessionLayoutMode.Stacked:
			// The terminals are always across the bottom of the editor and the chat, and the column runs past them.
			root = branch('row', branch('column', sidePane, chat, terminals), column);
			placement = state.activityBar ? ChatColumnPlacement.Full : ChatColumnPlacement.None;
			break;
		case SessionLayoutMode.EditorOnly:
			// Without the chat, the terminals under the chat are beside the editor, and the column keeps the editor's height.
			root = state.terminalPosition === ChatTerminalPosition.UnderChat
				? branch('row', terminals, sidePane, column)
				: branch('column', branch('row', sidePane, column), terminals);
			placement = state.activityBar ? ChatColumnPlacement.BesideEditor : ChatColumnPlacement.None;
			break;
	}

	const topology = root as IChatLayoutBranch;
	const present = new Set(collectLeaves(topology).map(leaf => leaf.cell));
	return {
		mode,
		topology,
		column: placement,
		inputOnly: mode === SessionLayoutMode.Stacked && state.inputOnly,
		tabOrder: tabOrder.filter(cell => present.has(cell)),
		shapeKey: shapeOf(topology),
	};
}

/**
 * What a host needs to do for a new layout: nothing, only show or hide cells (no cell moves), or rebuild its grid from the
 * new topology, keeping the views and carrying sizes over by cell.
 */
export function diffChatLayout(previous: IChatLayout | undefined, next: IChatLayout): ChatLayoutChange {
	if (!previous || previous.shapeKey !== next.shapeKey) {
		return 'rebuild';
	}
	const before = collectLeaves(previous.topology);
	const after = collectLeaves(next.topology);
	return after.some((leaf, index) => leaf.visible !== before[index].visible) ? 'visibility' : 'none';
}

/** The panel alignment of the main window that matches a terminal position, if there is one. */
export function getPanelAlignmentOfTerminalPosition(position: ChatTerminalPosition): 'justify' | 'center' | undefined {
	switch (position) {
		case ChatTerminalPosition.FullWidth: return 'justify';
		case ChatTerminalPosition.UnderChat: return 'center';
		case ChatTerminalPosition.UnderEditor: return undefined;
	}
}
