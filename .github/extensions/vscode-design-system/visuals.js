/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { node, card, sourceLink, copyText } from './ui.js';

const matches = (value, query) => JSON.stringify(value).toLowerCase().includes(query.toLowerCase());
let selectedIconId = 'add';
let paddingId = 'spacing.size160';
let gapId = 'spacing.size80';

function glyph(icon, compact = false) {
	const preview = node('span', String.fromCodePoint(Number.parseInt(icon.code, 16)), compact ? 'codicon-glyph compact' : 'codicon-glyph');
	preview.setAttribute('aria-hidden', 'true');
	return preview;
}

export function renderIcons(content, system) {
	const intro = node('p', 'Select a glyph to inspect its name and copy a class. These are the local Codicon font and source mappings, not screenshots.', 'muted');
	const reference = node('a', 'Open the official Codicon reference');
	reference.href = 'https://microsoft.github.io/vscode-codicons/dist/codicon.html';
	reference.target = '_blank';
	reference.rel = 'noopener noreferrer';
	content.append(intro, reference);
	if (!system.codiconFontAvailable) {
		content.append(node('p', 'The local Codicon font is missing. Restore the repository Codicon dependency to display glyphs.', 'notice'));
		return 0;
	}
	const icons = system.icons.filter(icon => matches(icon, system.view.query));
	const inspector = node('article', undefined, 'card icon-inspector');
	const grid = node('div', undefined, 'icon-grid');
	function inspect(icon) {
		selectedIconId = icon.id;
		inspector.replaceChildren(node('h3', icon.id));
		const samples = node('div', undefined, 'tools');
		samples.append(glyph(icon), node('code', `codicon codicon-${icon.id}`), node('span', '16px preview', 'meta'));
		const compact = system.icons.find(item => item.id === `${icon.id}-compact`);
		if (compact) {
			samples.append(glyph(compact, true), node('span', `${compact.id} · 12px`, 'meta'));
		}
		inspector.append(samples, node('code', `U+${icon.code.slice(2).toUpperCase()} · content: "\\${icon.code.slice(2)}"`));
		const actions = node('div', undefined, 'tools');
		const copyClass = node('button', 'Copy icon class');
		copyClass.type = 'button';
		copyClass.addEventListener('click', () => copyText(`codicon codicon-${icon.id}`));
		const copyCode = node('button', 'Copy CSS code point');
		copyCode.type = 'button';
		copyCode.addEventListener('click', () => copyText(`\\${icon.code.slice(2)}`));
		actions.append(copyClass, copyCode, sourceLink(icon.source));
		inspector.append(actions);
		for (const button of grid.children) {
			button.setAttribute('aria-pressed', String(button.dataset.icon === icon.id));
		}
	}
	for (const icon of icons) {
		const button = node('button', undefined, 'icon-tile');
		button.type = 'button';
		button.dataset.icon = icon.id;
		button.setAttribute('aria-label', `Inspect ${icon.id}`);
		button.append(glyph(icon), node('span', icon.id));
		button.addEventListener('click', () => inspect(icon));
		grid.append(button);
	}
	if (icons.length) {
		inspect(icons.find(icon => icon.id === selectedIconId) ?? icons[0]);
		content.append(inspector, grid);
	}
	return icons.length;
}

export function renderLayout(content, system) {
	const page = system.view.section;
	const spacing = system.sizes.filter(token => token.category === 'spacing');
	const sections = node('div', undefined, 'grid layout-grid');
	let count = 0;
	if (page === 'spacing' || page === 'layout') {
		const ramp = card('Spacing ramp', 'Lengths are shown to scale. The token name encodes tenths of a pixel.');
		ramp.id = 'layout-spacing';
		for (const token of spacing) {
			const row = node('div', undefined, 'spacing-row');
			const bar = node('span', undefined, 'spacing-bar');
			bar.style.width = token.value;
			bar.setAttribute('aria-hidden', 'true');
			row.append(node('code', token.id.replace('spacing.', '')), bar, node('span', token.value));
			ramp.append(row);
		}
		ramp.append(sourceLink(spacing[0].source));
		if (page === 'spacing') {
			sections.append(ramp);
			count++;
		}
		const composition = card('Compose with padding and gap', 'An annotated layout diagram, not a component fixture. Adjust the tokens to see what each decision owns.');
		composition.id = 'layout-composition';
		const controls = node('div', undefined, 'tools');
		const preview = node('div', undefined, 'layout-diagram');
		const inner = node('div', undefined, 'diagram-inner');
		inner.append(node('div', 'Heading', 'diagram-heading'), node('div', 'Primary content', 'diagram-content'), node('div', 'Supporting content', 'diagram-support'));
		preview.append(inner);
		const legend = node('p', undefined, 'meta');
		function update() {
			const padding = spacing.find(token => token.id === paddingId);
			const gap = spacing.find(token => token.id === gapId);
			preview.style.padding = padding.value;
			inner.style.gap = gap.value;
			legend.textContent = `Padding: ${padding.value} · gap: ${gap.value}. The tinted outer band is padding; space between blocks is gap.`;
		}
		for (const [labelText, current, onChange] of [
			['Padding', paddingId, value => { paddingId = value; }],
			['Gap', gapId, value => { gapId = value; }],
		]) {
			const label = node('label', labelText);
			const caption = node('span', labelText);
			caption.id = `layout-${labelText.toLowerCase()}-label`;
			const select = node('select');
			select.setAttribute('aria-labelledby', caption.id);
			for (const token of spacing) {
				const option = node('option', `${token.value} · ${token.id}`);
				option.value = token.id;
				select.append(option);
			}
			select.value = current;
			select.addEventListener('change', () => { onChange(select.value); update(); });
			label.replaceChildren(caption, select);
			controls.append(label);
		}
		update();
		composition.append(controls, preview, legend);
		sections.append(composition);
		count++;
	}
	if (page === 'shape') {
		const elevation = card('Elevation by role', 'Roundness communicates the surface tier. The same role should use the same token.');
		elevation.id = 'layout-elevation';
		for (const [role, id, note] of [
			['Control', 'cornerRadius.small', 'Buttons, inputs, and interactive rows'],
			['Inner', 'cornerRadius.medium', 'Containers within a surface'],
			['Outer', 'cornerRadius.large', 'Floating menus, hovers, and dialogs'],
		]) {
			const token = system.sizes.find(item => item.id === id);
			const row = node('div', undefined, 'elevation-row');
			const shape = node('span', role, 'elevation-shape');
			shape.style.borderRadius = token.value;
			const text = node('div');
			text.append(node('code', `${token.id} · ${token.value}`), node('p', note, 'meta'));
			row.append(shape, text);
			elevation.append(row);
		}
		sections.append(elevation);
		count++;
	}
	content.append(sections);
	return count;
}
