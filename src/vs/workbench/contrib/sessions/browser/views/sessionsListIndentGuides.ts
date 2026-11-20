/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** How a Sessions list row steps in below its header. Mirrors the row margins in `sessionsList.css`. */
export const enum SessionRowIndent {
	/** A section or custom group header, or a row outside sections, which steps in by its group depth only. */
	Header,
	/** A row within a section or group, which `sessions.list.indentItems` steps in by one more level. */
	Item,
	/** A comparison's header, attempts and their chats, which `sessions.list.indentItems` steps in by at least one level. */
	Comparison,
}

/**
 * Limits a row's tree indent guides to the levels that the row steps in by,
 * both with and without `sessions.list.indentItems`, so that a header's guide
 * runs only beside the rows indented below it and never through a row's icon.
 */
export function setSessionRowIndentGuides(container: HTMLElement, depth: number, indent: SessionRowIndent): void {
	const row = container.closest<HTMLElement>('.monaco-list-row');
	if (!row) {
		return;
	}
	const indentedDepth = indent === SessionRowIndent.Item ? depth + 1 : indent === SessionRowIndent.Comparison ? Math.max(depth, 1) : depth;
	row.style.setProperty('--session-indent-guides', String(depth));
	row.style.setProperty('--session-indent-guides-indented', String(indentedDepth));
}
