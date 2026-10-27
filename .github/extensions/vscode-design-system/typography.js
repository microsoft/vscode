/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { node, card, sourceLink, copyText } from './ui.js';

let platform = /Mac/.test(navigator.platform) ? 'mac' : /Win/.test(navigator.platform) ? 'windows' : 'linux';
let sampleText = 'Make the important thing clear';

function tokenLink(token) {
	const button = node('button', token.id, 'quiet-token');
	button.type = 'button';
	button.setAttribute('aria-label', `Copy ${token.css}`);
	button.addEventListener('click', () => copyText(`var(${token.css})`));
	return button;
}

function section(id, title, description) {
	const element = node('section', undefined, 'typography-section');
	element.id = `typography-${id}`;
	element.tabIndex = -1;
	element.append(node('h3', title), node('p', description, 'muted'));
	return element;
}

export function renderTypography(content, system) {
	const model = system.typography;
	const roles = model.tokens.filter(token => token.id.startsWith('fontSize.') && !token.deprecated);
	const weights = model.tokens.filter(token => token.id.startsWith('fontWeight.') && !token.deprecated);
	const families = section('families', 'Font families', 'The workbench uses native UI fonts and platform-specific monospace stacks. These are source styles, not size tokens. Font availability on this machine may differ from the selected platform.');
	const controls = node('div', undefined, 'tools typography-controls');
	const platformLabel = node('label');
	const platformCaption = node('span', 'Platform font stack');
	platformCaption.id = 'type-platform-label';
	const select = node('select');
	select.setAttribute('aria-labelledby', platformCaption.id);
	for (const [value, label] of [['windows', 'Windows'], ['mac', 'macOS'], ['linux', 'Linux']]) {
		const option = node('option', label);
		option.value = value;
		select.append(option);
	}
	select.value = platform;
	platformLabel.append(platformCaption, select);
	const sampleLabel = node('label', 'Specimen text');
	const input = node('input');
	input.type = 'text';
	input.maxLength = 100;
	input.value = sampleText;
	sampleLabel.append(input);
	controls.append(platformLabel, sampleLabel);
	families.append(controls);
	const familyCards = node('div', undefined, 'grid typography-families');
	families.append(familyCards);
	const specimens = section('styles', 'Type styles', 'Use heading roles to establish hierarchy, body roles for content, and label roles for compact UI. The size comes from a token; the weight pairing shown here follows the repository guidance.');
	const rows = node('div', undefined, 'typography-style-list');
	for (const token of roles) {
		const row = node('article', undefined, 'typography-style-row');
		row.dataset.token = token.id;
		const role = token.id.replace('fontSize.', '');
		const strong = role.startsWith('heading');
		const preview = node('p', sampleText, 'typography-specimen');
		preview.style.fontSize = token.value;
		preview.style.fontWeight = weights.find(weight => weight.id === `fontWeight.${strong ? 'semiBold' : 'regular'}`).value;
		const meta = node('div', undefined, 'typography-style-meta');
		meta.append(tokenLink(token), node('code', `${token.value} · ${strong ? '600 semibold' : '400 regular'}`), node('p', token.description, 'meta'));
		row.append(preview, meta);
		rows.append(row);
	}
	specimens.append(rows);
	const emphasis = section('emphasis', 'Weight and emphasis', 'Strong text uses the same role size with semibold weight. The shared UI ramp has two registered weights; editor text has its own configurable font settings.');
	const emphasisGrid = node('div', undefined, 'grid');
	for (const token of weights) {
		const item = card(token.id.split('.').at(-1), `${token.value} · ${token.description}`);
		const preview = node('p', sampleText, 'typography-weight-specimen');
		preview.style.fontSize = model.tokens.find(token => token.id === 'fontSize.body1').value;
		preview.style.fontWeight = token.value;
		item.append(preview, tokenLink(token));
		emphasisGrid.append(item);
	}
	emphasis.append(emphasisGrid);
	const composition = section('composition', 'Hierarchy and reading rhythm', 'See the roles together before inspecting individual values. The inherited workbench line-height below is a source style, not a standardized line-height token for every component.');
	const example = node('div', undefined, 'typography-composition');
	example.style.lineHeight = model.baseline.lineHeight;
	for (const [id, text] of [
		['fontSize.heading2', 'Review your workspace'],
		['fontSize.body1', 'Keep the main task readable. Use a quieter style for supporting context, and reserve strong emphasis for the information that needs to lead.'],
		['fontSize.body2', 'Supporting description · body2'],
		['fontSize.label1', 'Section label · label1'],
		['fontSize.label3', 'Metadata badge · label3'],
	]) {
		const token = model.tokens.find(token => token.id === id);
		const line = node('p', text);
		line.style.fontSize = token.value;
		line.style.fontWeight = id.includes('heading') ? '600' : '400';
		example.append(line);
	}
	composition.append(example, node('p', `Workbench baseline: ${model.baseline.fontSize} text with ${model.baseline.lineHeight} line-height. Individual widgets can override this.`, 'meta'),
		sourceLink(model.baseline.source, 'Workbench style source'));
	const colors = section('colors', 'Text color and hierarchy', `Related semantic text colors explicitly declared in ${system.view.theme}. They control emphasis independently of font size and weight; use the Colors page to change the theme and inspect the wider palette.`);
	const tonePreview = node('div', undefined, 'typography-tone-preview');
	const background = system.colors.find(token => token.id === 'editor.background');
	if (background) {
		tonePreview.style.backgroundColor = background.value;
	}
	for (const [id, label] of [['editor.foreground', 'Primary content'], ['foreground', 'Interface label'],
		['descriptionForeground', 'Supporting description'], ['disabledForeground', 'Unavailable option'], ['textLink.foreground', 'Link text']]) {
		const token = system.colors.find(token => token.id === id);
		if (!token) {
			continue;
		}
		const row = node('div', undefined, 'typography-tone-row');
		const preview = node('span', label);
		preview.style.color = token.value;
		row.append(preview, node('code', token.id));
		tonePreview.append(row);
	}
	colors.append(tonePreview, node('p', 'Samples are text, not live links or disabled controls. Missing runtime defaults are not inferred. Contrast must be checked against the actual surface where the text is used.', 'meta'));
	const symbols = section('symbols', 'Icon font sizes', 'Codicon sizes are typography-related registrations, but they describe glyphs rather than body text or hit targets. Compact glyph variants are optically adjusted, not just scaled.');
	const icon = system.icons.find(icon => icon.id === 'add');
	const compact = system.icons.find(icon => icon.id === 'add-compact') ?? icon;
	for (const token of model.tokens.filter(token => token.id.startsWith('codiconFontSize'))) {
		const row = node('div', undefined, 'tools typography-icon-row');
		const glyph = node('span', String.fromCodePoint(Number.parseInt((token.id.endsWith('compact') ? compact : icon).code, 16)), 'codicon-glyph');
		glyph.style.fontSize = token.value;
		glyph.setAttribute('aria-hidden', 'true');
		row.append(glyph, tokenLink(token), node('code', token.value));
		symbols.append(row);
	}
	const details = section('reference', 'Token reference and current boundaries', `All ${model.tokens.length} registered typography-related size tokens found in baseSizes.ts and agentsSizes.ts are included below. Deprecated aliases are retained for audit and migration, not recommended for new UI.`);
	details.append(node('p', model.gaps, 'notice'));
	const scroll = node('div', undefined, 'table-scroll');
	const table = node('table', undefined, 'typography-token-table');
	const head = node('tr');
	for (const title of ['Token', 'Value', 'Status / replacement', 'Source']) {
		const cell = node('th', title);
		cell.scope = 'col';
		head.append(cell);
	}
	table.append(head);
	for (const token of model.tokens) {
		const row = node('tr');
		row.dataset.token = token.id;
		const name = node('th');
		name.scope = 'row';
		name.append(tokenLink(token));
		const value = node('td');
		value.append(node('code', token.value));
		const status = node('td', token.deprecated ? 'Deprecated → ' : 'Current registration');
		if (token.replacement) {
			status.append(node('code', token.replacement));
		}
		const source = node('td');
		source.append(sourceLink(token.source));
		row.append(name, value, status, source);
		table.append(row);
	}
	scroll.append(table);
	details.append(scroll);
	const locales = node('details', undefined, 'scope');
	locales.append(node('summary', 'Locale-specific UI font stacks'));
	for (const family of model.families.filter(family => family.locale !== 'Default')) {
		const line = node('p');
		line.append(node('strong', `${family.platform} · ${family.locale}: `), node('code', family.value));
		line.lang = family.locale;
		locales.append(line);
	}
	details.append(locales, node('p', 'Editor typography is separate: editor.fontFamily, editor.fontSize, editor.fontWeight, editor.lineHeight, and editor.letterSpacing are configuration, not UI size tokens. Do not copy editor defaults into the UI ramp.', 'muted'),
		sourceLink(model.editorSource, 'Editor font computation source'));
	const references = node('details', undefined, 'scope');
	references.append(node('summary', 'Documentation references'));
	for (const reference of model.references) {
		const line = node('p');
		const link = node('a', reference.title);
		link.href = reference.url;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
		line.append(link);
		references.append(line);
	}
	details.append(references);
	content.append(families, specimens, emphasis, composition, colors, symbols, details);

	function updateFamilies() {
		const selected = model.families.filter(family => family.platform === platform && family.locale === 'Default');
		const ui = selected.find(family => family.property === 'font-family');
		familyCards.replaceChildren(...selected.map(family => {
			const item = card(family.property === 'font-family' ? 'Interface text' : 'Monospace text', family.value);
			const preview = node('p', family.property === 'font-family' ? 'Readable words, numbers 012345, and symbols Aa' : 'const readable = true; // 012345', 'typography-family-specimen');
			preview.style.fontFamily = family.value;
			item.append(preview, sourceLink(family.source));
			return item;
		}));
		for (const target of [rows, emphasisGrid, example]) {
			target.style.fontFamily = ui.value;
		}
	}
	select.addEventListener('change', () => { platform = select.value; updateFamilies(); });
	input.addEventListener('input', () => {
		sampleText = input.value;
		for (const target of content.querySelectorAll('.typography-specimen, .typography-weight-specimen')) {
			target.textContent = sampleText;
		}
	});
	updateFamilies();
	return model.tokens.length;
}
