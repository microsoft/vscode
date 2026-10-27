/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { node, card, sourceLink, copyText } from './ui.js';
import { renderLayout } from './visuals.js';
import { placeholders, values } from './page-content.mjs';
import { renderColors } from './color-reference.js';

function tokenNote(token) {
	const note = node('div', undefined, 'foundation-token-note');
	const copy = node('button', token.id, 'quiet-token');
	copy.type = 'button';
	copy.setAttribute('aria-label', `Copy ${token.css}`);
	copy.addEventListener('click', () => copyText(`var(${token.css})`));
	note.append(copy, node('code', token.value), sourceLink(token.source));
	return note;
}

export function renderFoundations(content, system) {
	const page = system.view.section;
	if (['spacing', 'layout', 'shape'].includes(page)) {
		renderLayout(content, system);
	}
	const grid = node('div', undefined, 'grid foundation-grid');
	if (page === 'size') {
		content.append(node('p', 'Only registered base sizes are shown. Shared control-height and density recipes are TBD; no new dimension tokens are implied.', 'notice'));
	}
	if (page === 'shape') {
		for (const token of system.sizes.filter(token => token.id.startsWith('cornerRadius.'))) {
			const item = card(token.id.split('.').at(-1), token.description);
			const sample = node('div', undefined, 'radius-example');
			sample.style.borderRadius = token.value;
			sample.setAttribute('aria-hidden', 'true');
			item.append(sample, tokenNote(token));
			grid.append(item);
		}
	} else if (page === 'size') {
		for (const token of system.sizes.filter(token => token.id.startsWith('codiconFontSize') || token.id === 'strokeThickness')) {
			const item = card(token.id, token.description);
			const sample = node('div', undefined, 'size-example');
			if (token.id === 'strokeThickness') {
				sample.classList.add('stroke-example');
				sample.style.borderTopWidth = token.value;
			} else {
				sample.style.width = token.value;
				sample.style.height = token.value;
			}
			sample.setAttribute('aria-hidden', 'true');
			item.append(sample, tokenNote(token));
			grid.append(item);
		}
	} else if (page === 'colors') {
		return renderColors(content, system);
	}
	if (grid.children.length) {
		content.append(grid);
	}
	if (page === 'layout') {
		const item = card('Responsive composition', 'TBD: shared recipes for panes, cards, and compact layouts.');
		item.prepend(node('span', 'TBD', 'tbd-label'));
		content.append(item);
	}
	return content.children.length;
}

export function renderSimplePage(content, system) {
	const page = system.view.section;
	const entries = page === 'principles' ? values : placeholders[page];
	const grid = node('div', undefined, 'grid simple-page');
	for (const entry of entries ?? []) {
		const item = card(entry.title, entry.text);
		if (page !== 'principles') {
			item.prepend(node('span', 'TBD', 'tbd-label'));
		}
		grid.append(item);
	}
	content.append(grid);
	if (page === 'principles') {
		const principles = node('section', undefined, 'philosophy-principles');
		principles.append(node('h3', 'Values → Principles → Moves'),
			node('p', 'Name the feeling, ask the principle’s question, then choose the token or behavior that expresses it. These questions are read directly from the repository skill.', 'muted'));
		for (const principle of system.philosophy) {
			const item = node('article');
			item.append(node('h3', principle.title), node('p', principle.question));
			principles.append(item);
		}
		content.append(principles);
	}
	const reference = node('details', undefined, 'scope');
	reference.append(node('summary', 'Source guidance'));
	for (const document of system.documents[page] ?? []) {
		const line = node('p');
		line.append(sourceLink({ file: document.file }, document.file));
		reference.append(line);
	}
	content.append(reference);
	return entries?.length ?? 0;
}
