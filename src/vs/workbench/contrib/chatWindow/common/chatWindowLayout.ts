/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** How a window shows a chat and its editor. */
export const enum ChatWindowLayoutMode {
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
export const enum ChatWindowTerminalPosition {
	FullWidth = 'fullWidth',
	UnderChat = 'underChat',
	UnderEditor = 'underEditor',
}

/** The cells of a window. */
export const enum ChatWindowLayoutCell {
	Chat = 'chat',
	SidePane = 'sidePane',
	Terminals = 'terminals',
	/** The activity bar strip of the chat window, when it is a cell of its own. */
	Column = 'column',
}

/** Where the activity bar of the chat window shows. */
export const enum ChatWindowColumnPlacement {
	/** Not as a cell: it is hidden, or it shows inside the chat. */
	None = 'none',
	/** A cell at the right of the editor and the chat, as tall as the window, past the terminals. */
	Full = 'full',
	/** A cell beside the editor, ending above the terminals. */
	BesideEditor = 'besideEditor',
}

/** The layout state of a chat window that its layout is computed from. */
export interface IChatWindowLayoutState {
	/** The mode to show. */
	readonly mode: ChatWindowLayoutMode;
	readonly terminalPosition: ChatWindowTerminalPosition;
	readonly terminalsVisible: boolean;
	/** Whether the activity bar of the chat window is on and has something to show. */
	readonly activityBar: boolean;
	/** Whether the chat is dragged down to its input (Stacked only). */
	readonly inputOnly: boolean;
}

/** A cell of the layout and whether it shows. */
export interface IChatWindowLayoutLeaf {
	readonly cell: ChatWindowLayoutCell;
	readonly visible: boolean;
}

/** A row or column of cells or nested branches. */
export interface IChatWindowLayoutBranch {
	/** `row` lays its children out side by side, `column` one above the other. */
	readonly orientation: 'row' | 'column';
	readonly children: readonly ChatWindowLayoutNode[];
}

/** A node of the layout topology: a cell or a branch. */
export type ChatWindowLayoutNode = IChatWindowLayoutLeaf | IChatWindowLayoutBranch;

/** The computed layout of a chat window, see {@link computeChatWindowLayout}. */
export interface IChatWindowLayout {
	/** The mode shown. */
	readonly mode: ChatWindowLayoutMode;
	/** The cells of the window. Hidden cells stay in the tree so that showing them is not a move. */
	readonly topology: IChatWindowLayoutBranch;
	readonly column: ChatWindowColumnPlacement;
	/** Whether the chat shows only its input. */
	readonly inputOnly: boolean;
	/** The visible cells in tab and landmark order, which is the topology's leaf order (the visual order). */
	readonly tabOrder: readonly ChatWindowLayoutCell[];
	/** The structure of the topology without visibility: a different key needs the grid rebuilt. */
	readonly shapeKey: string;
}

/** What a host needs to do to move from one layout to another, see {@link diffChatWindowLayout}. */
export type ChatWindowLayoutChange = 'none' | 'visibility' | 'rebuild';

function isBranch(node: ChatWindowLayoutNode): node is IChatWindowLayoutBranch {
	return 'children' in node;
}

/** Builds a branch without nesting a branch of the same orientation, or keeping a branch of a single child. */
function branch(orientation: 'row' | 'column', ...children: ChatWindowLayoutNode[]): ChatWindowLayoutNode {
	const flat: ChatWindowLayoutNode[] = [];
	for (const child of children) {
		if (isBranch(child) && child.orientation === orientation) {
			flat.push(...child.children);
		} else {
			flat.push(child);
		}
	}
	return flat.length === 1 ? flat[0] : { orientation, children: flat };
}

function shapeOf(node: ChatWindowLayoutNode): string {
	return isBranch(node) ? `${node.orientation}[${node.children.map(shapeOf).join(',')}]` : node.cell;
}

function collectLeaves(node: ChatWindowLayoutNode, into: IChatWindowLayoutLeaf[] = []): IChatWindowLayoutLeaf[] {
	if (isBranch(node)) {
		node.children.forEach(child => collectLeaves(child, into));
	} else {
		into.push(node);
	}
	return into;
}

/**
 * Computes how a window lays out its cells for a state: the grid topology, where the activity bar column is, and
 * whether the chat shows only its input. It is the single source of these rules for every window that lays out a chat
 * and its editor, as a pure function of the state: no DOM, no grid reads, no history.
 */
export function computeChatWindowLayout(state: IChatWindowLayoutState): IChatWindowLayout {
	const mode = state.mode;
	const chat: ChatWindowLayoutNode = { cell: ChatWindowLayoutCell.Chat, visible: true };
	const sidePane: ChatWindowLayoutNode = { cell: ChatWindowLayoutCell.SidePane, visible: true };
	const terminals: ChatWindowLayoutNode = { cell: ChatWindowLayoutCell.Terminals, visible: state.terminalsVisible };
	const column: ChatWindowLayoutNode = { cell: ChatWindowLayoutCell.Column, visible: state.activityBar };

	let root: ChatWindowLayoutNode;
	let placement = ChatWindowColumnPlacement.None;
	switch (mode) {
		case ChatWindowLayoutMode.ChatOnly:
			root = branch('column', chat, terminals);
			break;
		case ChatWindowLayoutMode.SideBySide:
			switch (state.terminalPosition) {
				case ChatWindowTerminalPosition.FullWidth:
					root = branch('column', branch('row', chat, sidePane), terminals);
					break;
				case ChatWindowTerminalPosition.UnderChat:
					root = branch('row', branch('column', chat, terminals), sidePane);
					break;
				case ChatWindowTerminalPosition.UnderEditor:
					root = branch('row', chat, branch('column', sidePane, terminals));
					break;
			}
			break;
		case ChatWindowLayoutMode.Stacked:
			// The terminals are always across the bottom of the editor and the chat, and the column runs past them.
			root = branch('row', branch('column', sidePane, chat, terminals), column);
			placement = state.activityBar ? ChatWindowColumnPlacement.Full : ChatWindowColumnPlacement.None;
			break;
		case ChatWindowLayoutMode.EditorOnly:
			// Without the chat the terminal position does not apply: the terminals are across the bottom and the column stops above them.
			root = branch('column', branch('row', sidePane, column), terminals);
			placement = state.activityBar ? ChatWindowColumnPlacement.BesideEditor : ChatWindowColumnPlacement.None;
			break;
	}

	const topology = root as IChatWindowLayoutBranch;
	return {
		mode,
		topology,
		column: placement,
		inputOnly: mode === ChatWindowLayoutMode.Stacked && state.inputOnly,
		tabOrder: collectLeaves(topology).filter(leaf => leaf.visible).map(leaf => leaf.cell),
		shapeKey: shapeOf(topology),
	};
}

/**
 * What a host needs to do for a new layout: nothing, only show or hide cells or the chat's input-only state (no cell moves), or rebuild its grid from the
 * new topology, keeping the views and carrying sizes over by cell.
 */
export function diffChatWindowLayout(previous: IChatWindowLayout | undefined, next: IChatWindowLayout): ChatWindowLayoutChange {
	if (!previous || previous.shapeKey !== next.shapeKey) {
		return 'rebuild';
	}
	const before = collectLeaves(previous.topology);
	const after = collectLeaves(next.topology);
	const changed = previous.inputOnly !== next.inputOnly || after.some((leaf, index) => leaf.visible !== before[index].visible);
	return changed ? 'visibility' : 'none';
}

/** The panel alignment of the main window that matches a terminal position, if there is one. */
export function getPanelAlignmentOfTerminalPosition(position: ChatWindowTerminalPosition): 'justify' | 'center' | undefined {
	switch (position) {
		case ChatWindowTerminalPosition.FullWidth: return 'justify';
		case ChatWindowTerminalPosition.UnderChat: return 'center';
		case ChatWindowTerminalPosition.UnderEditor: return undefined;
	}
}

/**
 * The mode to use when the requested one is not available. Without an editor only Chat only is available.
 * Docked windows are out of scope for now, so this is the only rule.
 */
export function resolveChatWindowLayoutMode(requested: ChatWindowLayoutMode, hasEditor: boolean): ChatWindowLayoutMode {
	return hasEditor ? requested : ChatWindowLayoutMode.ChatOnly;
}

/** The layout modes in which a chat window shows its chat and its editor together: the values of the `splitLayout` context key. */
export type ChatWindowSplitLayout = ChatWindowLayoutMode.Stacked | ChatWindowLayoutMode.SideBySide;

export function isChatWindowLayoutMode(value: unknown): value is ChatWindowLayoutMode {
	return value === ChatWindowLayoutMode.Stacked || value === ChatWindowLayoutMode.SideBySide || value === ChatWindowLayoutMode.EditorOnly || value === ChatWindowLayoutMode.ChatOnly;
}

export function isChatWindowSplitLayout(value: unknown): value is ChatWindowSplitLayout {
	return value === ChatWindowLayoutMode.Stacked || value === ChatWindowLayoutMode.SideBySide;
}
