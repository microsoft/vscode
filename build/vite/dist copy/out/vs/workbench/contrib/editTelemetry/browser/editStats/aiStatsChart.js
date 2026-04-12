/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $ } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { chartsBlue, chartsForeground, chartsLines } from '../../../../../platform/theme/common/colorRegistry.js';
export function aggregateSessionsByDay(sessions) {
    const dayMap = new Map();
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
export function createAiStatsChart(options) {
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
    }
    else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlTdGF0c0NoYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZWRpdFRlbGVtZXRyeS9icm93c2VyL2VkaXRTdGF0cy9haVN0YXRzQ2hhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDbkYsT0FBTyxFQUFFLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRSxXQUFXLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQXVCbEgsTUFBTSxVQUFVLHNCQUFzQixDQUFDLFFBQWlDO0lBQ3ZFLE1BQU0sTUFBTSxHQUFHLElBQUksR0FBRyxFQUEyQixDQUFDO0lBRWxELEtBQUssTUFBTSxPQUFPLElBQUksUUFBUSxFQUFFLENBQUM7UUFDaEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakQsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFM0YsSUFBSSxTQUFTLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNwQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDaEIsU0FBUyxHQUFHO2dCQUNYLElBQUksRUFBRSxP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