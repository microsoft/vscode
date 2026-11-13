/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IdGenerator } from '../../../../../../base/common/idGenerator.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { INativeBadge, INativeBarChart, INativeComponentsDocument, INativeMetric, INativeTable, INativeText, NativeComponent, NativeComponentTone } from '../../../common/nativeComponents/nativeComponents.js';
import { formatNativeBarValue, getNativeComponentToneLabel } from '../../../common/nativeComponents/nativeComponentsText.js';
import './media/chatNativeComponents.css';

const $ = dom.$;

const idGenerator = new IdGenerator('chat-native-components-');

export interface IRenderedNativeComponents {
	readonly element: HTMLElement;
	/** The disclosures of the document, in document order. */
	readonly disclosures: readonly HTMLDetailsElement[];
}

/**
 * Renders a validated document with the components of the catalogue.
 *
 * The document only selects components and their semantic variants. Every string that it carries
 * is untrusted and set as text, never as markup, and it has no influence on class names or styles
 * beyond those variants: the appearance is defined by the stylesheet with theme and size tokens.
 */
export function renderNativeComponents(document: INativeComponentsDocument): IRenderedNativeComponents {
	const disclosures: HTMLDetailsElement[] = [];
	const element = appendComponents($('.chat-native-components-content'), document.children, disclosures);
	return { element, disclosures };
}

function appendComponents(container: HTMLElement, components: readonly NativeComponent[], disclosures: HTMLDetailsElement[]): HTMLElement {
	let badges: HTMLElement | undefined;
	for (const component of components) {
		if (component.type === 'badge') {
			// Adjacent badges share a line instead of each taking a row or a column.
			badges ??= dom.append(container, $('.chat-native-badges'));
			badges.appendChild(renderBadge(component));
		} else {
			badges = undefined;
			container.appendChild(renderComponent(component, disclosures));
		}
	}
	return container;
}

function renderComponent(component: Exclude<NativeComponent, INativeBadge>, disclosures: HTMLDetailsElement[]): HTMLElement {
	switch (component.type) {
		case 'stack': return appendComponents($('.chat-native-stack'), component.children, disclosures);
		case 'columns': return appendComponents($('.chat-native-columns'), component.children, disclosures);
		case 'text': return renderText(component);
		case 'metric': return renderMetric(component);
		case 'table': return renderTable(component);
		case 'barChart': return renderBarChart(component);
		case 'disclosure': {
			const details = $<HTMLDetailsElement>('details.chat-native-disclosure');
			disclosures.push(details);
			const summary = dom.append(details, $('summary.chat-native-disclosure-summary'));
			appendIcon(summary, Codicon.chevronRightCompact).setAttribute('aria-hidden', 'true');
			dom.append(summary, $('span')).textContent = component.summary;
			appendComponents(dom.append(details, $('.chat-native-disclosure-content')), component.children, disclosures);
			return details;
		}
	}
}

function renderText(component: INativeText): HTMLElement {
	const element = $(`.chat-native-text.${component.variant}`);
	if (component.variant === 'heading') {
		element.setAttribute('role', 'heading');
		element.setAttribute('aria-level', '3');
	}
	element.textContent = component.text;
	return element;
}

function renderMetric(component: INativeMetric): HTMLElement {
	const element = $('.chat-native-metric', { role: 'group' });
	const label = dom.append(element, $('.chat-native-metric-label'));
	label.id = idGenerator.nextId();
	label.textContent = component.label;
	element.setAttribute('aria-labelledby', label.id);
	const value = dom.append(element, $('.chat-native-metric-value'));
	dom.append(value, $('span')).textContent = component.value;
	if (component.delta) {
		const detail = dom.append(element, $('.chat-native-metric-detail'));
		appendToneIcon(detail, component.tone);
		dom.append(detail, $('span')).textContent = component.delta;
	} else {
		// Without a delta to qualify, the tone qualifies the value itself.
		appendToneIcon(value, component.tone);
	}
	return element;
}

function renderBadge(component: INativeBadge): HTMLElement {
	const element = $('.chat-native-badge');
	appendToneIcon(element, component.tone);
	dom.append(element, $('span')).textContent = component.text;
	return element;
}

function renderTable(component: INativeTable): HTMLElement {
	// Wide tables scroll inside their own box instead of widening the response.
	const element = $('.chat-native-table-scroll');
	const table = dom.append(element, $('table.chat-native-table'));
	if (component.caption) {
		dom.append(table, $('caption')).textContent = component.caption;
	}
	const header = dom.append(dom.append(table, $('thead')), $('tr'));
	for (const column of component.columns) {
		const cell = dom.append(header, $('th', { scope: 'col' }));
		cell.classList.toggle('align-end', column.align === 'end');
		cell.textContent = column.header;
	}
	const body = dom.append(table, $('tbody'));
	for (const row of component.rows) {
		const tableRow = dom.append(body, $('tr'));
		row.forEach((text, index) => {
			const cell = dom.append(tableRow, $('td'));
			cell.classList.toggle('align-end', component.columns[index].align === 'end');
			cell.textContent = text;
		});
	}
	return element;
}

/**
 * Draws the chart as a table of labels and values, so that assistive technology reads the same
 * data that the bars show. The bars themselves are decoration and hidden from it.
 */
function renderBarChart(component: INativeBarChart): HTMLElement {
	const element = $('.chat-native-chart');
	const title = dom.append(element, $('.chat-native-chart-title'));
	title.id = idGenerator.nextId();
	title.textContent = component.title;
	const plot = dom.append(element, $('.chat-native-chart-plot', { role: 'table', 'aria-labelledby': title.id }));
	const maximum = Math.max(...component.bars.map(bar => bar.value));
	for (const bar of component.bars) {
		const row = dom.append(plot, $('.chat-native-chart-row', { role: 'row' }));
		dom.append(row, $('.chat-native-chart-label', { role: 'rowheader' })).textContent = bar.label;
		const track = dom.append(row, $('.chat-native-chart-track', { 'aria-hidden': 'true' }));
		dom.append(track, $('.chat-native-chart-bar')).style.width = `${maximum > 0 ? bar.value / maximum * 100 : 0}%`;
		dom.append(row, $('.chat-native-chart-value', { role: 'cell' })).textContent = formatNativeBarValue(bar, component.unit);
	}
	return element;
}

const toneIcons = {
	positive: Codicon.passCompact,
	negative: Codicon.errorCompact,
	warning: Codicon.warningCompact,
};

/** Shows a tone as an icon whose shape and accessible name carry the meaning, with color as reinforcement. */
function appendToneIcon(container: HTMLElement, tone: NativeComponentTone): void {
	const label = getNativeComponentToneLabel(tone);
	if (tone === 'neutral' || !label) {
		return;
	}
	const icon = appendIcon(container, toneIcons[tone]);
	icon.classList.add(tone);
	icon.setAttribute('role', 'img');
	icon.setAttribute('aria-label', label);
}

function appendIcon(container: HTMLElement, icon: ThemeIcon): HTMLElement {
	const element = dom.append(container, renderIcon(icon));
	element.classList.add('chat-native-icon');
	return element;
}
