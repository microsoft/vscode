/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { INativeBar, INativeComponentsDocument, NativeComponent, NativeComponentTone } from './nativeComponents.js';

/** The words that convey a tone without color, or `undefined` for the neutral tone. */
export function getNativeComponentToneLabel(tone: NativeComponentTone): string | undefined {
	switch (tone) {
		case 'positive': return localize('nativeComponents.tone.positive', "Positive");
		case 'negative': return localize('nativeComponents.tone.negative', "Negative");
		case 'warning': return localize('nativeComponents.tone.warning', "Warning");
		case 'neutral': return undefined;
	}
}

/** The value of a bar as the chart displays it. */
export function formatNativeBarValue(bar: INativeBar, unit: string | undefined): string {
	return unit ? localize('nativeComponents.valueWithUnit', "{0} {1}", bar.valueText, unit) : bar.valueText;
}

/**
 * Describes a block as lines of plain text, in reading order. This is the text alternative of the
 * visual, so it states everything that the rendered components show, including what they convey
 * through position, icons or color.
 */
export function describeNativeComponents(document: INativeComponentsDocument): string {
	const lines: string[] = [];
	describeComponents(document.children, lines);
	return lines.join('\n');
}

function describeComponents(components: readonly NativeComponent[], lines: string[]): void {
	for (const component of components) {
		switch (component.type) {
			case 'stack':
			case 'columns':
				describeComponents(component.children, lines);
				break;
			case 'text':
				lines.push(component.text);
				break;
			case 'metric': {
				const tone = getNativeComponentToneLabel(component.tone);
				const detail = component.delta && tone ? localize('nativeComponents.deltaAndTone', "{0}, {1}", component.delta, tone) : component.delta ?? tone;
				lines.push(detail
					? localize('nativeComponents.metricWithDetail', "{0}: {1} ({2})", component.label, component.value, detail)
					: localize('nativeComponents.labelAndValue', "{0}: {1}", component.label, component.value));
				break;
			}
			case 'badge': {
				const tone = getNativeComponentToneLabel(component.tone);
				lines.push(tone ? localize('nativeComponents.badgeWithTone', "{0} ({1})", component.text, tone) : component.text);
				break;
			}
			case 'table':
				lines.push(component.caption ? localize('nativeComponents.tableWithCaption', "Table: {0}", component.caption) : localize('nativeComponents.table', "Table"));
				lines.push(component.columns.map(column => column.header).join(' | '));
				for (const row of component.rows) {
					lines.push(row.join(' | '));
				}
				break;
			case 'barChart':
				lines.push(localize('nativeComponents.barChart', "Bar chart: {0}", component.title));
				for (const bar of component.bars) {
					lines.push(localize('nativeComponents.labelAndValue', "{0}: {1}", bar.label, formatNativeBarValue(bar, component.unit)));
				}
				break;
			case 'disclosure':
				lines.push(localize('nativeComponents.disclosure', "Details: {0}", component.summary));
				describeComponents(component.children, lines);
				break;
		}
	}
}
