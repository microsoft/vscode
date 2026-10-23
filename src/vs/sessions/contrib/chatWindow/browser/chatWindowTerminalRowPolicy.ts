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

/** What {@link completeTerminalReturn} needs to know, and do, once the move that took a terminal out of the row completed. */
export interface ITerminalReturn {
	/** Whether the chat window and the row it returns to are still open, and the row is still the window's. */
	isCurrent(): boolean;
	/** Whether the terminal still is where the move put it, and not in the row. */
	canMove(): boolean;
	move(): void;
	/** Ends this return, and tells how many others are still in flight. */
	end(): number;
	rowIsEmpty(): boolean;
	/** Whether the row is being emptied on purpose, which hides it by itself. */
	isEmptying(): boolean;
	hideRow(): void;
}

/**
 * Moves a terminal back to the row once the move that took it out completed, unless the window or row went away meanwhile:
 * then the terminal stays where it is. A skipped move must not leave an empty row visible, which hides it.
 */
export function completeTerminalReturn(r: ITerminalReturn): void {
	try {
		if (r.isCurrent() && r.canMove()) {
			r.move();
		}
	} finally {
		const remaining = r.end();
		if (r.isCurrent() && r.rowIsEmpty() && !remaining && !r.isEmptying()) {
			r.hideRow();
		}
	}
}
