/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { chartsBlue, chartsForeground, chartsLines } from '../../../../../platform/theme/common/colorRegistry.js';

export interface ISessionData {
	startTime: number;
	typedCharacters: number;
	aiCharacters: number;
	acceptedInlineSuggestions: number | undefined;
	chatEditCount: number | undefined;
}

export interface IDailyAggregate {
	date: string; // ISO date string (YYYY-MM-DD)
	displayDate: string; // Formatted for display
	aiRate: number;
	totalAiChars: number;
	totalTypedChars: number;
	inlineSuggestions: number;
	chatEdits: number;
	sessionCount: number;
}

export type ChartViewMode = 'days' | 'sessions';

export function aggregateSessionsByDay(sessions: readonly ISessionData[]): IDailyAggregate[] {
	const dayMap = new Map<string, IDailyAggregate>();

	for (const session of sessions) {
		const date = new Date(session.startTime);
		const isoDate = date.toISOString().split('T')[0];
		const displayDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

		let aggregate = dayMap.get(isoDate);
		if (!aggregate) {
			aggregate = {
				date: isoDate,
				displayDate,
				aiRate: 0,
				totalAiChars: 0,
				totalTypedChars: 0,
				inlineSuggestions: 0,
				chatEdits: 0,
				sessionCount: 0,
			};
			dayMap.set(isoDate, aggregate);
		}

		aggregate.totalAiChars += session.aiCharacters;
		aggregate.totalTypedChars += session.typedCharacters;
		aggregate.inlineSuggestions += session.acceptedInlineSuggestions ?? 0;
		aggregate.chatEdits += session.chatEditCount ?? 0;
		aggregate.sessionCount += 1;
	}

	// Calculate AI rate for each day
	for (const aggregate of dayMap.values()) {
		const total = aggregate.totalAiChars + aggregate.totalTypedChars;
		aggregate.aiRate = total > 0 ? aggregate.totalAiChars / total : 0;
	}

	// Sort by date
	return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export interface IAiStatsChartOptions {
	sessions: readonly ISessionData[];
	viewMode: ChartViewMode;
}

export function createAiStatsChart(
	options: IAiStatsChartOptions
): HTMLElement {
	const { sessions: sessionsData, viewMode: mode } = options;

	const width = 280;
	const height = 100;
	const margin = { top: 10, right: 10, bottom: 25, left: 30 };
	const innerWidth = width - margin.left - margin.right;
	const innerHeight = height - margin.top - margin.bottom;

	const container = $('.ai-stats-chart-container');
	container.style.position = 'relative';
	container.style.marginTop = '8px';

	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', `${width}px`);
	svg.setAttribute('height', `${height}px`);
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
	svg.style.display = 'block';
	container.appendChild(svg);

	const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
	g.setAttribute('transform', `translate(${margin.left},${margin.top})`);
	svg.appendChild(g);

	if (sessionsData.length === 0) {
		const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		text.setAttribute('x', `${innerWidth / 2}`);
		text.setAttribute('y', `${innerHeight / 2}`);
		text.setAttribute('text-anchor', 'middle');
		text.setAttribute('fill', asCssVariable(chartsForeground));
		text.setAttribute('font-size', '11px');
		text.textContent = localize('noData', "No data yet");
		g.appendChild(text);
		return container;
	}

	// Draw axes
	const xAxisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
	xAxisLine.setAttribute('x1', '0');
	xAxisLine.setAttribute('y1', `${innerHeight}`);
	xAxisLine.setAttribute('x2', `${innerWidth}`);
	xAxisLine.setAttribute('y2', `${innerHeight}`);
	xAxisLine.setAttribute('stroke', asCssVariable(chartsLines));
	xAxisLine.setAttribute('stroke-width', '1px');
	g.appendChild(xAxisLine);

	const yAxisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
	yAxisLine.setAttribute('x1', '0');
	yAxisLine.setAttribute('y1', '0');
	yAxisLine.setAttribute('x2', '0');
	yAxisLine.setAttribute('y2', `${innerHeight}`);
	yAxisLine.setAttribute('stroke', asCssVariable(chartsLines));
	yAxisLine.setAttribute('stroke-width', '1px');
	g.appendChild(yAxisLine);

	// Y-axis labels (0%, 50%, 100%)
	for (const pct of [0, 50, 100]) {
		const y = innerHeight - (pct / 100) * innerHeight;
		const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		label.setAttribute('x', '-4');
		label.setAttribute('y', `${y + 3}`);
		label.setAttribute('text-anchor', 'end');
		label.setAttribute('fill', asCssVariable(chartsForeground));
		label.setAttribute('font-size', '9px');
		label.textContent = `${pct}%`;
		g.appendChild(label);

		if (pct > 0) {
			const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			gridLine.setAttribute('x1', '0');
			gridLine.setAttribute('y1', `${y}`);
			gridLine.setAttribute('x2', `${innerWidth}`);
			gridLine.setAttribute('y2', `${y}`);
			gridLine.setAttribute('stroke', asCssVariable(chartsLines));
			gridLine.setAttribute('stroke-width', '0.5px');
			gridLine.setAttribute('stroke-dasharray', '2,2');
			g.appendChild(gridLine);
		}
	}

	if (mode === 'days') {
		renderDaysView();
	} else {
		renderSessionsView();
	}

	function renderDaysView() {
		const dailyData = aggregateSessionsByDay(sessionsData);
		const barCount = dailyData.length;
		const barWidth = Math.min(20, (innerWidth - (barCount - 1) * 2) / barCount);
		const gap = 2;
		const totalBarSpace = barCount * barWidth + (barCount - 1) * gap;
		const startX = (innerWidth - totalBarSpace) / 2;

		// Calculate which labels to show based on available space
		// Each label needs roughly 40px of space to not overlap
		const minLabelSpacing = 40;
		const totalWidth = totalBarSpace;
		const maxLabels = Math.max(2, Math.floor(totalWidth / minLabelSpacing));
		const labelStep = Math.max(1, Math.ceil(barCount / maxLabels));

		dailyData.forEach((day, i) => {
			const x = startX + i * (barWidth + gap);
			const barHeight = day.aiRate * innerHeight;
			const y = innerHeight - barHeight;

			// Bar for AI rate
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.setAttribute('x', `${x}`);
			rect.setAttribute('y', `${y}`);
			rect.setAttribute('width', `${barWidth}`);
			rect.setAttribute('height', `${Math.max(1, barHeight)}`);
			rect.setAttribute('fill', asCssVariable(chartsBlue));
			rect.setAttribute('rx', '2');
			g.appendChild(rect);

			// X-axis label - only show at calculated intervals to avoid overlap
			const isFirst = i === 0;
			const isLast = i === barCount - 1;
			const isAtInterval = i % labelStep === 0;

			if (isFirst || isLast || (isAtInterval && barCount > 2)) {
				// Skip middle labels if they would be too close to first/last
				if (!isFirst && !isLast) {
					const distFromFirst = i * (barWidth + gap);
					const distFromLast = (barCount - 1 - i) * (barWidth + gap);
					if (distFromFirst < minLabelSpacing || distFromLast < minLabelSpacing) {
						return; // Skip this label
					}
				}

				const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
				label.setAttribute('x', `${x + barWidth / 2}`);
				label.setAttribute('y', `${innerHeight + 12}`);
				label.setAttribute('text-anchor', 'middle');
				label.setAttribute('fill', asCssVariable(chartsForeground));
				label.setAttribute('font-size', '8px');
				label.textContent = day.displayDate;
				g.appendChild(label);
			}
		});
	}

	function renderSessionsView() {
		const sessionCount = sessionsData.length;
		const barWidth = Math.min(8, (innerWidth - (sessionCount - 1) * 1) / sessionCount);
		const gap = 1;
		const totalBarSpace = sessionCount * barWidth + (sessionCount - 1) * gap;
		const startX = (innerWidth - totalBarSpace) / 2;

		sessionsData.forEach((session, i) => {
			const total = session.aiCharacters + session.typedCharacters;
			const aiRate = total > 0 ? session.aiCharacters / total : 0;
			const x = startX + i * (barWidth + gap);
			const barHeight = aiRate * innerHeight;
			const y = innerHeight - barHeight;

			// Bar for AI rate
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.setAttribute('x', `${x}`);
			rect.setAttribute('y', `${y}`);
			rect.setAttribute('width', `${barWidth}`);
			rect.setAttribute('height', `${Math.max(1, barHeight)}`);
			rect.setAttribute('fill', asCssVariable(chartsBlue));
			rect.setAttribute('rx', '1');
			g.appendChild(rect);
		});

		// X-axis labels: only show first and last to avoid overlap
		// Each label is roughly 40px wide (e.g., "Jan 15")
		const minLabelSpacing = 40;

		if (sessionCount === 0) {
			return;
		}

		// Always show first label
		const firstSession = sessionsData[0];
		const firstX = startX;
		const firstDate = new Date(firstSession.startTime);
		const firstLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		firstLabel.setAttribute('x', `${firstX + barWidth / 2}`);
		firstLabel.setAttribute('y', `${innerHeight + 12}`);
		firstLabel.setAttribute('text-anchor', 'start');
		firstLabel.setAttribute('fill', asCssVariable(chartsForeground));
		firstLabel.setAttribute('font-size', '8px');
		firstLabel.textContent = firstDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		g.appendChild(firstLabel);

		// Show last label if there's enough space and more than 1 session
		if (sessionCount > 1 && totalBarSpace >= minLabelSpacing) {
			const lastSession = sessionsData[sessionCount - 1];
			const lastX = startX + (sessionCount - 1) * (barWidth + gap);
			const lastDate = new Date(lastSession.startTime);
			const lastLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			lastLabel.setAttribute('x', `${lastX + barWidth / 2}`);
			lastLabel.setAttribute('y', `${innerHeight + 12}`);
			lastLabel.setAttribute('text-anchor', 'end');
			lastLabel.setAttribute('fill', asCssVariable(chartsForeground));
			lastLabel.setAttribute('font-size', '8px');
			lastLabel.textContent = lastDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
			g.appendChild(lastLabel);
		}
	}

	return container;
}
