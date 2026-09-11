/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { AgentsDashboardChatKind, AgentsDashboardHistoryEventType, IAgentsDashboardChatActivity, IAgentsDashboardHistoryBucket } from '../common/agentsDashboardHistory.js';

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

export function renderAgentsDashboardChatActivity(container: HTMLElement, activity: IAgentsDashboardChatActivity): void {
	DOM.clearNode(container);
	container.setAttribute('aria-hidden', 'true');
	const legend = DOM.append(container, DOM.$('.agents-dashboard-chart-legend'));
	appendActivityLegend(legend, 'agents-dashboard-chat-marker-interaction', localize('agentsDashboard.chatActivity.request', "Request"));
	appendActivityLegend(legend, 'agents-dashboard-chat-marker-message', localize('agentsDashboard.chatActivity.message', "Chat message"));
	appendActivityLegend(legend, 'agents-dashboard-chat-marker-pr', localize('agentsDashboard.chatActivity.prCreated', "PR created"));

	if (activity.sessions.length === 0) {
		DOM.append(container, DOM.$('.agents-dashboard-chart-empty', undefined, localize('agentsDashboard.chatActivity.noData', "No recorded chat activity")));
		return;
	}

	const axis = DOM.append(container, DOM.$('.agents-dashboard-chat-axis'));
	DOM.append(axis, DOM.$('span', undefined, localize('agentsDashboard.chatActivity.started', "Started {0}", formatActivityTime(activity.start))));
	DOM.append(axis, DOM.$('span', undefined, activity.completed
		? localize('agentsDashboard.chatActivity.ended', "Ended {0}", formatActivityTime(activity.end - 1))
		: localize('agentsDashboard.chatActivity.active', "Active · {0}", formatActivityTime(activity.end - 1))));
	const timeline = DOM.append(container, DOM.$('.agents-dashboard-chat-timeline'));
	for (const session of activity.sessions) {
		const group = DOM.append(timeline, DOM.$('.agents-dashboard-chat-session'));
		const header = DOM.append(group, DOM.$('.agents-dashboard-chat-session-header'));
		DOM.append(header, DOM.$('.agents-dashboard-chat-session-title', undefined, session.label));
		DOM.append(header, DOM.$('.agents-dashboard-chat-session-detail', undefined, localize(
			'agentsDashboard.chatActivity.sessionDetail',
			"{0} chats · {1} interactions",
			session.chats.length,
			session.interactionCount,
		)));
		const chatLabels = new Map(session.chats.map(chat => [chat.chatId, chat.label]));
		const chatLanes = DOM.append(group, DOM.$('.agents-dashboard-chat-lanes'));
		for (const [chatIndex, chat] of session.chats.entries()) {
			const lane = DOM.append(chatLanes, DOM.$('.agents-dashboard-chat-lane'));
			const label = DOM.append(lane, DOM.$('.agents-dashboard-chat-lane-label'));
			DOM.append(label, DOM.$(`span.agents-dashboard-chat-kind-icon${ThemeIcon.asCSSSelector(chatKindIcon(chat.kind))}`, { 'aria-hidden': 'true' }));
			DOM.append(label, DOM.$('.agents-dashboard-chat-lane-name', undefined, chat.label));
			const track = DOM.append(lane, DOM.$('.agents-dashboard-chat-track'));
			const firstEvent = chat.events.find(event => event.type === AgentsDashboardHistoryEventType.ChatCreated) ?? chat.events[0];
			const startPosition = firstEvent
				? Math.max(0, Math.min(100, (firstEvent.timestamp - activity.start) / Math.max(1, activity.end - activity.start) * 100))
				: 0;
			const trackLine = DOM.append(track, DOM.$('.agents-dashboard-chat-track-line', { 'aria-hidden': 'true' }));
			trackLine.style.left = `${startPosition}%`;
			for (const event of chat.events) {
				if (event.type !== AgentsDashboardHistoryEventType.ChatInteraction) {
					continue;
				}
				const marker = DOM.append(track, DOM.$('span.agents-dashboard-chat-marker.agents-dashboard-chat-marker-interaction'));
				const position = Math.max(0, Math.min(100, (event.timestamp - activity.start) / Math.max(1, activity.end - activity.start) * 100));
				marker.style.left = `${position}%`;
				marker.title = formatChatActivityMarker(event);
			}
			if (chatIndex === 0) {
				for (const timestamp of session.pullRequestCreatedAt) {
					const marker = DOM.append(track, DOM.$('span.agents-dashboard-chat-marker.agents-dashboard-chat-marker-pr'));
					marker.style.left = `${Math.max(0, Math.min(100, (timestamp - activity.start) / Math.max(1, activity.end - activity.start) * 100))}%`;
					marker.title = localize('agentsDashboard.chatActivity.prCreatedAt', "Pull request created · {0}", new Date(timestamp).toLocaleString());
				}
			}
		}
		renderChatMessageConnectors(chatLanes, session.chats, activity, chatLabels);

		function renderChatMessageConnectors(
			container: HTMLElement,
			chats: IAgentsDashboardChatActivity['sessions'][number]['chats'],
			activity: IAgentsDashboardChatActivity,
			chatLabels: ReadonlyMap<string, string>,
		): void {
			const chatIndexes = new Map(chats.map((chat, index) => [chat.chatId, index]));
			const sentMessages = chats.flatMap(chat => chat.events
				.filter(event => event.type === AgentsDashboardHistoryEventType.ChatDelegatedRequest && event.direction === 'sent')
				.map(event => ({ sourceChatId: chat.chatId, targetChatId: event.peerChatId, timestamp: event.timestamp })));
			if (sentMessages.length === 0) {
				return;
			}
			const laneHeight = 20;
			const svg = createSvgElement('svg', {
				viewBox: `0 0 1000 ${chats.length * laneHeight}`,
				preserveAspectRatio: 'none',
				'aria-hidden': 'true',
			});
			svg.classList.add('agents-dashboard-chat-message-connectors');
			container.appendChild(svg);
			const definitions = createSvgElement('defs', {});
			const arrowhead = createSvgElement('marker', {
				id: 'agents-dashboard-chat-message-arrowhead',
				viewBox: '0 0 6 6',
				refX: '5',
				refY: '3',
				markerWidth: '6',
				markerHeight: '6',
				orient: 'auto',
				markerUnits: 'strokeWidth',
			});
			arrowhead.appendChild(createSvgElement('path', {
				d: 'M 0 0 L 6 3 L 0 6 Z',
				class: 'agents-dashboard-chat-message-arrowhead',
			}));
			definitions.appendChild(arrowhead);
			svg.appendChild(definitions);
			for (const message of sentMessages) {
				const sourceIndex = chatIndexes.get(message.sourceChatId);
				const targetIndex = message.targetChatId ? chatIndexes.get(message.targetChatId) : undefined;
				if (sourceIndex === undefined || targetIndex === undefined) {
					continue;
				}
				const x = Math.max(0, Math.min(1000, (message.timestamp - activity.start) / Math.max(1, activity.end - activity.start) * 1000));
				const sourceY = sourceIndex * laneHeight + laneHeight / 2;
				const targetY = targetIndex * laneHeight + laneHeight / 2;
				const connector = createSvgElement('path', {
					d: `M ${x} ${sourceY} V ${targetY}`,
					class: 'agents-dashboard-chat-message-connector',
					'marker-end': 'url(#agents-dashboard-chat-message-arrowhead)',
				});
				const title = localize(
					'agentsDashboard.chatActivity.messageConnection',
					"Message from {0} to {1} · {2}",
					chatLabels.get(message.sourceChatId) ?? localize('agentsDashboard.chatActivity.unknownSource', "source chat"),
					chatLabels.get(message.targetChatId ?? '') ?? localize('agentsDashboard.chatActivity.unknownTarget', "target chat"),
					new Date(message.timestamp).toLocaleString(),
				);
				appendTitle(connector, title);
				svg.appendChild(createSvgElement('circle', {
					cx: String(x),
					cy: String(targetY),
					r: '2.5',
					class: 'agents-dashboard-chat-message-target agents-dashboard-chat-marker-interaction',
				}));
				svg.appendChild(connector);
				svg.appendChild(createSvgElement('circle', {
					cx: String(x),
					cy: String(sourceY),
					r: '2.5',
					class: 'agents-dashboard-chat-message-source',
				}));
			}
		}
	}
}

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

function appendActivityLegend(parent: HTMLElement, markerClass: string, label: string): void {
	const item = DOM.append(parent, DOM.$('.agents-dashboard-chart-legend-item'));
	DOM.append(item, DOM.$(`span.agents-dashboard-chat-marker.agents-dashboard-chat-legend-marker.${markerClass}`, { 'aria-hidden': 'true' }));
	DOM.append(item, DOM.$('span', undefined, label));
}

function chatKindIcon(kind: AgentsDashboardChatKind): ThemeIcon {
	switch (kind) {
		case 'main': return Codicon.commentDiscussion;
		case 'fork': return Codicon.gitBranch;
		case 'sideChat': return Codicon.splitHorizontal;
		case 'subagent': return Codicon.agent;
		case 'chat': return Codicon.comment;
	}
}

function formatChatActivityMarker(event: IAgentsDashboardChatActivity['sessions'][number]['chats'][number]['events'][number]): string {
	const time = new Date(event.timestamp).toLocaleString();
	return localize('agentsDashboard.chatActivity.requestAt', "Request sent · {0}", time);
}

function formatActivityTime(timestamp: number): string {
	return new Date(timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' });
}
