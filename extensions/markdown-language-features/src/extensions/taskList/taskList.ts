/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type MarkdownIt from 'markdown-it';

/**
 * Extends a `markdown-it` instance with support for GFM-style task list rendering.
 *
 * Items whose content begins with `[ ] ` (unchecked) or `[x] ` / `[X] ` (checked)
 * inside a bullet or ordered list are rendered as disabled `<input type="checkbox">`
 * elements, matching GitHub-flavoured Markdown preview behaviour.
 *
 * Output classes applied:
 *   - `.contains-task-list` — on the parent `<ul>` / `<ol>`
 *   - `.task-list-item`     — on each `<li>` that carries a task marker
 *   - `.task-list-item-checkbox` — on each `<input type="checkbox">`
 */
export function extendMarkdownIt(md: MarkdownIt): MarkdownIt {
	md.core.ruler.after('inline', 'vscode-task-lists', state => {
		const tokens = state.tokens;
		const Token = state.Token;

		for (let i = 1; i < tokens.length; i++) {
			const token = tokens[i];

			// Only process inline tokens whose raw content starts with a task marker.
			if (token.type !== 'inline') {
				continue;
			}
			if (!isTaskListMarker(token.content)) {
				continue;
			}

			// A task-list item must be a direct child of a list_item_open:
			//   Tight list → list_item_open > inline
			//   Loose list → list_item_open > paragraph_open > inline
			let listItemIndex = -1;
			if (tokens[i - 1].type === 'list_item_open') {
				listItemIndex = i - 1;
			} else if (
				i >= 2 &&
				tokens[i - 1].type === 'paragraph_open' &&
				tokens[i - 2].type === 'list_item_open'
			) {
				listItemIndex = i - 2;
			}

			if (listItemIndex < 0) {
				continue;
			}

			// Strip the `[ ] ` / `[x] ` prefix (4 characters) from the first text
			// child that the inline rule already parsed.
			if (token.children && token.children.length > 0) {
				const firstChild = token.children[0];
				if (firstChild.type === 'text') {
					firstChild.content = firstChild.content.slice(4);
				}
			}

			// Prepend a disabled checkbox as an html_inline child token.
			const checked = token.content[1] === 'x' || token.content[1] === 'X';
			const checkbox = new Token('html_inline', '', 0);
			checkbox.content = checked
				? '<input class="task-list-item-checkbox" type="checkbox" disabled checked>'
				: '<input class="task-list-item-checkbox" type="checkbox" disabled>';

			token.children ??= [];
			token.children.unshift(checkbox);

			// Keep token.content in sync (used for cache keying, not rendering).
			token.content = token.content.slice(4);

			// Mark the enclosing list item.
			tokens[listItemIndex].attrSet('class', 'task-list-item');

			// Walk backward by level to find and mark the nearest parent list.
			const listItemLevel = tokens[listItemIndex].level;
			for (let j = listItemIndex - 1; j >= 0; j--) {
				const t = tokens[j];
				if (
					t.level < listItemLevel &&
					(t.type === 'bullet_list_open' || t.type === 'ordered_list_open')
				) {
					t.attrSet('class', 'contains-task-list');
					break;
				}
			}
		}
	});

	return md;
}

function isTaskListMarker(content: string): boolean {
	// GFM task list markers: `[ ] `, `[x] `, `[X] `  (bracket, char, bracket, space)
	return (
		content.startsWith('[ ] ') ||
		content.startsWith('[x] ') ||
		content.startsWith('[X] ')
	);
}
