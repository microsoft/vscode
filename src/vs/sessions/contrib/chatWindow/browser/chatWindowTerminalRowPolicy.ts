/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum TerminalRowMoveAction {
	/** The move is none of the row's concern. */
	Ignore,
	/** The terminal goes back to the row once the move completes. */
	ReturnToRow
}

/**
 * Decides what the terminal row does when an editor is about to move out of it. The row owns its terminals, and a terminal
 * dragged out of it, such as onto a locked group that refuses the drop and so opens a window of its own, would otherwise be
 * out of sight. Only the terminal that moved is touched: no window is closed or reused here.
 */
export function decideTerminalRowMove(editorIsTerminal: boolean, rowGroupId: number, targetGroupId: number): TerminalRowMoveAction {
	return editorIsTerminal && targetGroupId !== rowGroupId ? TerminalRowMoveAction.ReturnToRow : TerminalRowMoveAction.Ignore;
}
