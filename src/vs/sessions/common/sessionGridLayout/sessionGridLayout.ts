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
export const enum SessionTerminalPosition {
	FullWidth = 'fullWidth',
	UnderChat = 'underChat',
	UnderEditor = 'underEditor',
}

/** The cells of a window. */
export const enum SessionGridCell {
	Chat = 'chat',
	SidePane = 'sidePane',
	Terminals = 'terminals',
	/** The Session Activity Bar strip, when it is a cell of its own. */
	Column = 'column',
}

/** Where the Session Activity Bar shows. */
export const enum SessionColumnPlacement {
	/** Not as a cell: it is hidden, or it shows inside the chat. */
	None = 'none',
	/** A cell at the right of the editor and the chat, as tall as the window, past the terminals. */
	Full = 'full',
	/** A cell beside the editor, ending above the terminals. */
	BesideEditor = 'besideEditor',
}

export interface ISessionGridLayoutState {
	/** The mode to show. */
	readonly mode: SessionLayoutMode;
	readonly terminalPosition: SessionTerminalPosition;
	readonly terminalsVisible: boolean;
	/** Whether the Session Activity Bar is on and has something to show. */
	readonly activityBar: boolean;
	/** Whether the chat is dragged down to its input (Stacked only). */
	readonly inputOnly: boolean;
}

export interface ISessionGridLayoutLeaf {
	readonly cell: SessionGridCell;
	readonly visible: boolean;
}

export interface ISessionGridLayoutBranch {
	/** `row` lays its children out side by side, `column` one above the other. */
	readonly orientation: 'row' | 'column';
	readonly children: readonly SessionGridLayoutNode[];
}

export type SessionGridLayoutNode = ISessionGridLayoutLeaf | ISessionGridLayoutBranch;

export interface ISessionGridLayout {
	/** The mode shown. */
	readonly mode: SessionLayoutMode;
	/** The cells of the window. Hidden cells stay in the tree so that showing them is not a move. */
	readonly topology: ISessionGridLayoutBranch;
	readonly column: SessionColumnPlacement;
	/** Whether the chat shows only its input. */
	readonly inputOnly: boolean;
	/** The visible cells in tab and landmark order, which is the topology's leaf order (the visual order). */
	readonly tabOrder: readonly SessionGridCell[];
	/** The structure of the topology without visibility: a different key needs the grid rebuilt. */
	readonly shapeKey: string;
}

export type SessionGridLayoutChange = 'none' | 'visibility' | 'rebuild';

function isBranch(node: SessionGridLayoutNode): node is ISessionGridLayoutBranch {
	return 'children' in node;
}

/** Builds a branch without nesting a branch of the same orientation, or keeping a branch of a single child. */
function branch(orientation: 'row' | 'column', ...children: SessionGridLayoutNode[]): SessionGridLayoutNode {
	const flat: SessionGridLayoutNode[] = [];
	for (const child of children) {
		if (isBranch(child) && child.orientation === orientation) {
			flat.push(...child.children);
		} else {
			flat.push(child);
		}
	}
	return flat.length === 1 ? flat[0] : { orientation, children: flat };
}

function shapeOf(node: SessionGridLayoutNode): string {
	return isBranch(node) ? `${node.orientation}[${node.children.map(shapeOf).join(',')}]` : node.cell;
}

function collectLeaves(node: SessionGridLayoutNode, into: ISessionGridLayoutLeaf[] = []): ISessionGridLayoutLeaf[] {
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
export function computeSessionGridLayout(state: ISessionGridLayoutState): ISessionGridLayout {
	const mode = state.mode;
	const chat: SessionGridLayoutNode = { cell: SessionGridCell.Chat, visible: true };
	const sidePane: SessionGridLayoutNode = { cell: SessionGridCell.SidePane, visible: true };
	const terminals: SessionGridLayoutNode = { cell: SessionGridCell.Terminals, visible: state.terminalsVisible };
	const column: SessionGridLayoutNode = { cell: SessionGridCell.Column, visible: state.activityBar };

	let root: SessionGridLayoutNode;
	let placement = SessionColumnPlacement.None;
	switch (mode) {
		case SessionLayoutMode.ChatOnly:
			root = branch('column', chat, terminals);
			break;
		case SessionLayoutMode.SideBySide:
			switch (state.terminalPosition) {
				case SessionTerminalPosition.FullWidth:
					root = branch('column', branch('row', chat, sidePane), terminals);
					break;
				case SessionTerminalPosition.UnderChat:
					root = branch('row', branch('column', chat, terminals), sidePane);
					break;
				case SessionTerminalPosition.UnderEditor:
					root = branch('row', chat, branch('column', sidePane, terminals));
					break;
			}
			break;
		case SessionLayoutMode.Stacked:
			// The terminals are always across the bottom of the editor and the chat, and the column runs past them.
			root = branch('row', branch('column', sidePane, chat, terminals), column);
			placement = state.activityBar ? SessionColumnPlacement.Full : SessionColumnPlacement.None;
			break;
		case SessionLayoutMode.EditorOnly:
			// Without the chat the terminal position does not apply: the terminals are across the bottom and the column stops above them.
			root = branch('column', branch('row', sidePane, column), terminals);
			placement = state.activityBar ? SessionColumnPlacement.BesideEditor : SessionColumnPlacement.None;
			break;
	}

	const topology = root as ISessionGridLayoutBranch;
	return {
		mode,
		topology,
		column: placement,
		inputOnly: mode === SessionLayoutMode.Stacked && state.inputOnly,
		tabOrder: collectLeaves(topology).filter(leaf => leaf.visible).map(leaf => leaf.cell),
		shapeKey: shapeOf(topology),
	};
}

/**
 * What a host needs to do for a new layout: nothing, only show or hide cells or the chat's input-only state (no cell moves), or rebuild its grid from the
 * new topology, keeping the views and carrying sizes over by cell.
 */
export function diffSessionGridLayout(previous: ISessionGridLayout | undefined, next: ISessionGridLayout): SessionGridLayoutChange {
	if (!previous || previous.shapeKey !== next.shapeKey) {
		return 'rebuild';
	}
	const before = collectLeaves(previous.topology);
	const after = collectLeaves(next.topology);
	const changed = previous.inputOnly !== next.inputOnly || after.some((leaf, index) => leaf.visible !== before[index].visible);
	return changed ? 'visibility' : 'none';
}

/** The panel alignment of the main window that matches a terminal position, if there is one. */
export function getPanelAlignmentOfTerminalPosition(position: SessionTerminalPosition): 'justify' | 'center' | undefined {
	switch (position) {
		case SessionTerminalPosition.FullWidth: return 'justify';
		case SessionTerminalPosition.UnderChat: return 'center';
		case SessionTerminalPosition.UnderEditor: return undefined;
	}
}

/**
 * The mode to use when the requested one is not available. Without an editor only Chat only is available.
 * Docked windows are out of scope for now, so this is the only rule.
 */
export function resolveSessionLayoutMode(requested: SessionLayoutMode, hasEditor: boolean): SessionLayoutMode {
	return hasEditor ? requested : SessionLayoutMode.ChatOnly;
}
