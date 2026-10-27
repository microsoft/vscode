/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { node, sourceLink, copyText } from './ui.js';

const coreIds = [
	'foreground', 'descriptionForeground', 'focusBorder', 'errorForeground',
	'editor.background', 'editor.foreground', 'sideBar.background', 'sideBar.foreground',
	'button.background', 'button.foreground', 'button.hoverBackground', 'button.secondaryBackground',
	'input.background', 'input.foreground', 'input.border', 'list.activeSelectionBackground',
	'list.activeSelectionForeground', 'badge.background', 'badge.foreground', 'panel.background', 'panel.border',
];
let selection = 'core';

function colorRows(token, index) {
	const row = node('tr');
	row.dataset.token = token.id;
	const name = node('th');
	name.scope = 'row';
	const inspect = node('button', token.id, 'color-inspect');
	inspect.type = 'button';
	inspect.setAttribute('aria-expanded', 'false');
	inspect.setAttribute('aria-controls', `color-detail-${index}`);
	name.append(inspect);
	const preview = node('td');
	const swatch = node('span', undefined, 'color-swatch');
	swatch.style.backgroundColor = token.value;
	swatch.setAttribute('aria-hidden', 'true');
	preview.append(swatch);
	const value = node('td');
	value.append(node('code', token.value));
	row.append(name, preview, value);
	const detail = node('tr', undefined, 'color-detail');
	detail.id = `color-detail-${index}`;
	detail.hidden = true;
	const cell = node('td');
	cell.colSpan = 3;
	cell.append(node('p', token.description ?? 'Semantic UI color declared by the selected theme or an included theme.'));
	const actions = node('div', undefined, 'tools');
	actions.append(node('code', `var(${token.css})`));
	const copy = node('button', 'Copy CSS variable');
	copy.type = 'button';
	copy.addEventListener('click', () => copyText(`var(${token.css})`));
	actions.append(copy, sourceLink(token.source));
	cell.append(actions);
	if (token.ansiIndex !== undefined) {
		cell.append(node('p', token.origin === 'default'
			? 'Value from the registered default for this theme type; the theme does not override it.'
			: 'Value from the selected theme or its includes, overriding the registered ANSI default.', 'meta'));
		cell.append(node('code', `"workbench.colorCustomizations": { "${token.id}": "${token.value}" }`));
	}
	detail.append(cell);
	inspect.addEventListener('click', () => {
		detail.hidden = !detail.hidden;
		inspect.setAttribute('aria-expanded', String(!detail.hidden));
	});
	return [row, detail];
}

export function renderColors(content, system) {
	const controls = node('div', undefined, 'tools color-reference-controls');
	const label = node('label');
	const caption = node('span', 'Color group');
	caption.id = 'color-group-label';
	const select = node('select');
	select.setAttribute('aria-labelledby', caption.id);
	const namespaces = [...new Set(system.colors.filter(token => token.ansiIndex === undefined)
		.map(token => token.id.includes('.') ? token.id.split('.')[0] : 'General'))].sort();
	for (const [id, title] of [['core', 'Core UI'], ['ansi', 'Terminal ANSI · 16 colors'], ['all', 'All colors'],
		...namespaces.map(namespace => [`namespace:${namespace}`, namespace])]) {
		const option = node('option', title);
		option.value = id;
		select.append(option);
	}
	if (![...select.options].some(option => option.value === selection)) {
		selection = 'core';
	}
	select.value = selection;
	label.append(caption, select);
	const ansi = node('button', 'Show ANSI colors');
	ansi.type = 'button';
	ansi.addEventListener('click', () => {
		select.value = 'ansi';
		selection = 'ansi';
		update();
		select.focus();
	});
	const count = node('span', undefined, 'meta');
	count.setAttribute('role', 'status');
	controls.append(label, ansi, count);
	const note = node('p', undefined, 'muted color-reference-note');
	const wrapper = node('div', undefined, 'table-scroll');
	const table = node('table', undefined, 'color-reference-table');
	const title = node('caption', 'Color tokens');
	const head = node('thead');
	const headers = node('tr');
	for (const text of ['Token', 'Preview', 'Value']) {
		const cell = node('th', text);
		cell.scope = 'col';
		headers.append(cell);
	}
	head.append(headers);
	const body = node('tbody');
	table.append(title, head, body);
	wrapper.append(table);
	function update() {
		let tokens;
		if (selection === 'core') {
			tokens = coreIds.map(id => system.colors.find(token => token.id === id)).filter(Boolean);
		} else if (selection === 'ansi') {
			tokens = system.colors.filter(token => token.ansiIndex !== undefined).sort((a, b) => a.ansiIndex - b.ansiIndex);
		} else if (selection === 'all') {
			tokens = system.colors;
		} else {
			const namespace = selection.slice('namespace:'.length);
			tokens = system.colors.filter(token => token.ansiIndex === undefined
				&& (namespace === 'General' ? !token.id.includes('.') : token.id.startsWith(`${namespace}.`)));
		}
		title.textContent = select.selectedOptions[0].textContent;
		note.textContent = selection === 'ansi'
			? 'ANSI colors are the terminal’s customizable 16-color palette: eight normal and eight bright colors. Expand a row for its theme override or registered default and customization key.'
			: 'Expand a row to inspect or copy its CSS variable. UI values shown here are explicit theme declarations, not the complete runtime color registry.';
		body.replaceChildren(...tokens.flatMap(colorRows));
		count.textContent = `${tokens.length} colors · ${system.view.theme}`;
		ansi.hidden = selection === 'ansi';
	}
	select.addEventListener('change', () => { selection = select.value; update(); });
	update();
	content.append(controls, note, wrapper);
	return system.colors.length;
}
