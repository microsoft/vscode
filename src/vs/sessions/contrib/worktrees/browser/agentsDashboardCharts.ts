/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { localize } from '../../../../nls.js';
import { IAgentsDashboardHistoryBucket } from '../common/agentsDashboardHistory.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const CHART_WIDTH = 640;
const CHART_HEIGHT = 180;
const CHART_MARGIN = { top: 12, right: 12, bottom: 28, left: 44 };

export interface IAgentsDashboardChartSeries {
	readonly label: string;
	readonly color: string;
	readonly values: readonly (number | undefined)[];
}

export type AgentsDashboardChartKind = 'bar' | 'line';

export function renderAgentsDashboardChart(
	container: HTMLElement,
	buckets: readonly IAgentsDashboardHistoryBucket[],
	series: readonly IAgentsDashboardChartSeries[],
	kind: AgentsDashboardChartKind,
	formatValue: (value: number) => string,
): void {
	DOM.clearNode(container);
	const legend = DOM.append(container, DOM.$('.agents-dashboard-chart-legend'));
	for (const item of series) {
		const legendItem = DOM.append(legend, DOM.$('.agents-dashboard-chart-legend-item'));
		const swatch = DOM.append(legendItem, DOM.$('.agents-dashboard-chart-swatch', { 'aria-hidden': 'true' }));
		swatch.style.backgroundColor = item.color;
		DOM.append(legendItem, DOM.$('span', undefined, item.label));
	}

	const values = series.flatMap(item => item.values).filter((value): value is number => value !== undefined);
	if (values.length === 0) {
		DOM.append(container, DOM.$('.agents-dashboard-chart-empty', undefined, localize('agentsDashboard.chart.noData', "No data in this period")));
		return;
	}
	if (values.every(value => value === 0)) {
		DOM.append(container, DOM.$('.agents-dashboard-chart-empty', undefined, formatValue(0)));
		return;
	}

	const svg = mainWindow.document.createElementNS(SVG_NAMESPACE, 'svg');
	svg.setAttribute('viewBox', `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`);
	svg.setAttribute('aria-hidden', 'true');
	svg.classList.add('agents-dashboard-chart-svg');
	container.appendChild(svg);

	const innerWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
	const innerHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
	const maximum = Math.max(...values, 1);
	const group = createSvgElement('g', {
		transform: `translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`,
	});
	svg.appendChild(group);

	for (let index = 0; index <= 4; index++) {
		const value = maximum * index / 4;
		const y = innerHeight - innerHeight * index / 4;
		group.appendChild(createSvgElement('line', {
			x1: '0',
			y1: String(y),
			x2: String(innerWidth),
			y2: String(y),
			stroke: 'var(--vscode-charts-lines)',
			'stroke-width': '1',
		}));
		const label = createSvgElement('text', {
			x: '-8',
			y: String(y + 4),
			'text-anchor': 'end',
			fill: 'var(--vscode-charts-foreground)',
			'font-size': '10',
		});
		label.textContent = formatValue(value);
		group.appendChild(label);
	}

	if (kind === 'bar') {
		renderBars(group, buckets, series, innerWidth, innerHeight, maximum, formatValue);
	} else {
		renderLines(group, buckets, series, innerWidth, innerHeight, maximum, formatValue);
	}
	renderXAxis(group, buckets, innerWidth, innerHeight);
}

function renderBars(
	group: SVGGElement,
	buckets: readonly IAgentsDashboardHistoryBucket[],
	series: readonly IAgentsDashboardChartSeries[],
	width: number,
	height: number,
	maximum: number,
	formatValue: (value: number) => string,
): void {
	const groupWidth = width / Math.max(buckets.length, 1);
	const barWidth = Math.max(1, Math.min(18, (groupWidth - 4) / series.length));
	for (let bucketIndex = 0; bucketIndex < buckets.length; bucketIndex++) {
		for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex++) {
			const value = series[seriesIndex].values[bucketIndex];
			if (value === undefined || value === 0) {
				continue;
			}
			const barHeight = value / maximum * height;
			const x = bucketIndex * groupWidth + (groupWidth - barWidth * series.length) / 2 + seriesIndex * barWidth;
			const rect = createSvgElement('rect', {
				x: String(x),
				y: String(height - barHeight),
				width: String(Math.max(1, barWidth - 1)),
				height: String(Math.max(1, barHeight)),
				fill: series[seriesIndex].color,
				rx: '2',
			});
			appendTitle(rect, `${buckets[bucketIndex].label}: ${series[seriesIndex].label} ${formatValue(value)}`);
			group.appendChild(rect);
		}
	}
}

function renderLines(
	group: SVGGElement,
	buckets: readonly IAgentsDashboardHistoryBucket[],
	series: readonly IAgentsDashboardChartSeries[],
	width: number,
	height: number,
	maximum: number,
	formatValue: (value: number) => string,
): void {
	const step = buckets.length > 1 ? width / (buckets.length - 1) : width;
	for (const item of series) {
		let path = '';
		let drawing = false;
		for (let index = 0; index < item.values.length; index++) {
			const value = item.values[index];
			if (value === undefined) {
				drawing = false;
				continue;
			}
			const x = buckets.length > 1 ? index * step : width / 2;
			const y = height - value / maximum * height;
			path += `${drawing ? ' L' : ' M'} ${x} ${y}`;
			drawing = true;
			const point = createSvgElement('circle', { cx: String(x), cy: String(y), r: '3', fill: item.color });
			appendTitle(point, `${buckets[index].label}: ${item.label} ${formatValue(value)}`);
			group.appendChild(point);
		}
		if (path) {
			group.insertBefore(createSvgElement('path', {
				d: path,
				fill: 'none',
				stroke: item.color,
				'stroke-width': '2',
			}), group.firstChild);
		}
	}
}

function renderXAxis(group: SVGGElement, buckets: readonly IAgentsDashboardHistoryBucket[], width: number, height: number): void {
	const maximumLabels = 7;
	const step = Math.max(1, Math.ceil(buckets.length / maximumLabels));
	for (let index = 0; index < buckets.length; index++) {
		if (index !== 0 && index !== buckets.length - 1 && index % step !== 0) {
			continue;
		}
		const x = buckets.length > 1 ? index / (buckets.length - 1) * width : width / 2;
		const label = createSvgElement('text', {
			x: String(x),
			y: String(height + 20),
			'text-anchor': index === 0 ? 'start' : index === buckets.length - 1 ? 'end' : 'middle',
			fill: 'var(--vscode-charts-foreground)',
			'font-size': '10',
		});
		label.textContent = buckets[index].label;
		group.appendChild(label);
	}
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(tagName: K, attributes: Record<string, string>): SVGElementTagNameMap[K] {
	const element = mainWindow.document.createElementNS(SVG_NAMESPACE, tagName);
	for (const [name, value] of Object.entries(attributes)) {
		element.setAttribute(name, value);
	}
	return element;
}

function appendTitle(element: SVGElement, text: string): void {
	const title = createSvgElement('title', {});
	title.textContent = text;
	element.appendChild(title);
}
