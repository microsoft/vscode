/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// A deliberately small, text-only Markdown renderer. Raw HTML is never interpreted.
function inline(target, text) {
	const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
	for (const part of parts) {
		if (part.startsWith('`') && part.endsWith('`')) {
			const code = document.createElement('code');
			code.textContent = part.slice(1, -1);
			target.append(code);
		} else if (part.startsWith('**') && part.endsWith('**')) {
			const strong = document.createElement('strong');
			strong.textContent = part.slice(2, -2);
			target.append(strong);
		} else {
			target.append(part.replace(/^\[([^\]]+)\]\([^)]+\)$/, '$1'));
		}
	}
}

export function markdown(text) {
	const content = document.createElement('div');
	content.className = 'prose';
	const lines = text.trim().split('\n');
	let code;
	let table;
	let list;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (/^\s*```/.test(line)) {
			if (code) {
				code = undefined;
			} else {
				code = document.createElement('pre');
				content.append(code);
			}
			table = undefined;
			list = undefined;
			continue;
		}
		if (code) {
			code.textContent += `${line}\n`;
			continue;
		}
		if (/^\s*<!--|^\s*<a id=/.test(line) || line === '---') {
			continue;
		}
		if (/^\|/.test(line.trim())) {
			const cells = line.trim().slice(1).replace(/\|$/, '').split('|').map(cell => cell.trim());
			if (cells.every(cell => /^:?-+:?$/.test(cell))) {
				continue;
			}
			if (!table) {
				const wrapper = document.createElement('div');
				wrapper.className = 'table-scroll';
				table = document.createElement('table');
				wrapper.append(table);
				content.append(wrapper);
			}
			const row = document.createElement('tr');
			for (const cell of cells) {
				const entry = document.createElement(table.rows.length ? 'td' : 'th');
				if (!table.rows.length) {
					entry.scope = 'col';
				}
				inline(entry, cell);
				row.append(entry);
			}
			table.append(row);
			continue;
		}
		table = undefined;
		if (!line.trim()) {
			list = undefined;
			continue;
		}
		const bullet = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
		if (bullet) {
			if (!list) {
				list = document.createElement('ul');
				content.append(list);
			}
			const item = document.createElement('li');
			inline(item, bullet[1]);
			list.append(item);
			continue;
		}
		list = undefined;
		const heading = line.match(/^#{1,6}\s+(.*)/);
		const element = document.createElement(heading ? 'h3' : line.startsWith('>') ? 'blockquote' : 'p');
		inline(element, heading ? heading[1] : line.replace(/^>\s*/, ''));
		content.append(element);
	}
	return content;
}
