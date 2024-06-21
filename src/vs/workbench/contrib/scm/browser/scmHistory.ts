/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { lastOrDefault } from 'vs/base/common/arrays';
import { deepClone } from 'vs/base/common/objects';
import { ThemeIcon } from 'vs/base/common/themables';
import { ISCMHistoryItem, ISCMHistoryItemGraphNode, ISCMHistoryItemViewModel } from 'vs/workbench/contrib/scm/common/history';

const SWIMLANE_HEIGHT = 22;
const SWIMLANE_WIDTH = 11;
const CIRCLE_RADIUS = 4;
const SWIMLANE_CURVE_RADIUS = 5;

const graphColors = ['#007ACC', '#BC3FBC', '#BF8803', '#CC6633', '#F14C4C', '#16825D'];

function getNextColorIndex(colorIndex: number): number {
	return colorIndex < graphColors.length - 1 ? colorIndex + 1 : 1;
}

function getLabelColorIndex(historyItem: ISCMHistoryItem, colorMap: Map<string, number>): number | undefined {
	for (const label of historyItem.labels ?? []) {
		const colorIndex = colorMap.get(label.title);
		if (colorIndex !== undefined) {
			return colorIndex;
		}
	}

	return undefined;
}

function createPath(stroke: string): SVGPathElement {
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('fill', 'none');
	path.setAttribute('stroke', stroke);
	path.setAttribute('stroke-width', '1px');
	path.setAttribute('stroke-linecap', 'round');

	return path;
}

function drawCircle(index: number, radius: number, fill: string): SVGCircleElement {
	const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
	circle.setAttribute('cx', `${SWIMLANE_WIDTH * (index + 1)}`);
	circle.setAttribute('cy', `${SWIMLANE_WIDTH}`);
	circle.setAttribute('r', `${radius}`);
	circle.setAttribute('fill', fill);

	return circle;
}

function drawVerticalLine(x1: number, y1: number, y2: number, color: string): SVGPathElement {
	const path = createPath(color);
	path.setAttribute('d', `M ${x1} ${y1} V ${y2}`);

	return path;
}

function findLastIndex(nodes: ISCMHistoryItemGraphNode[], id: string): number {
	for (let i = nodes.length - 1; i >= 0; i--) {
		if (nodes[i].id === id) {
			return i;
		}
	}

	return -1;
}

export function renderSCMHistoryItemGraph(historyItemViewModel: ISCMHistoryItemViewModel): SVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.classList.add('graph');

	const historyItem = historyItemViewModel.historyItem;
	const inputSwimlanes = historyItemViewModel.inputSwimlanes;
	const outputSwimlanes = historyItemViewModel.outputSwimlanes;

	// Find the history item in the input swimlanes
	const inputIndex = inputSwimlanes.findIndex(node => node.id === historyItem.id);

	// Circle index - use the input swimlane index if present, otherwise add it to the end
	const circleIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length;

	// Circle color - use the output swimlane color if present, otherwise the input swimlane color
	const circleColorIndex = circleIndex < outputSwimlanes.length ? outputSwimlanes[circleIndex].color : inputSwimlanes[circleIndex].color;

	let outputSwimlaneIndex = 0;
	for (let index = 0; index < inputSwimlanes.length; index++) {
		const color = graphColors[inputSwimlanes[index].color];

		// Current commit
		if (inputSwimlanes[index].id === historyItem.id) {
			// Base commit
			if (index !== circleIndex) {
				const d: string[] = [];
				const path = createPath(color);

				// Draw /
				d.push(`M ${SWIMLANE_WIDTH * (index + 1)} 0`);
				d.push(`A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${SWIMLANE_WIDTH * (index)} ${SWIMLANE_WIDTH}`);

				// Draw -
				d.push(`H ${SWIMLANE_WIDTH * (circleIndex + 1)}`);

				path.setAttribute('d', d.join(' '));
				svg.append(path);
			} else {
				outputSwimlaneIndex++;
			}
		} else {
			// Not the current commit
			if (outputSwimlaneIndex < outputSwimlanes.length &&
				inputSwimlanes[index].id === outputSwimlanes[outputSwimlaneIndex].id) {
				if (index === outputSwimlaneIndex) {
					// Draw |
					const path = drawVerticalLine(SWIMLANE_WIDTH * (index + 1), 0, SWIMLANE_HEIGHT, color);
					svg.append(path);
				} else {
					const d: string[] = [];
					const path = createPath(color);

					// Draw |
					d.push(`M ${SWIMLANE_WIDTH * (index + 1)} 0`);
					d.push(`V 6`);

					// Draw /
					d.push(`A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 1 ${(SWIMLANE_WIDTH * (index + 1)) - SWIMLANE_CURVE_RADIUS} ${SWIMLANE_HEIGHT / 2}`);

					// Draw -
					d.push(`H ${(SWIMLANE_WIDTH * (outputSwimlaneIndex + 1)) + SWIMLANE_CURVE_RADIUS}`);

					// Draw /
					d.push(`A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 0 ${SWIMLANE_WIDTH * (outputSwimlaneIndex + 1)} ${(SWIMLANE_HEIGHT / 2) + SWIMLANE_CURVE_RADIUS}`);

					// Draw |
					d.push(`V ${SWIMLANE_HEIGHT}`);

					path.setAttribute('d', d.join(' '));
					svg.append(path);
				}

				outputSwimlaneIndex++;
			}
		}
	}

	// Add remaining parent(s)
	for (let i = 1; i < historyItem.parentIds.length; i++) {
		const parentOutputIndex = findLastIndex(outputSwimlanes, historyItem.parentIds[i]);
		if (parentOutputIndex === -1) {
			continue;
		}

		// Draw -\
		const d: string[] = [];
		const path = createPath(graphColors[outputSwimlanes[parentOutputIndex].color]);

		// Draw \
		d.push(`M ${SWIMLANE_WIDTH * parentOutputIndex} ${SWIMLANE_HEIGHT / 2}`);
		d.push(`A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${SWIMLANE_WIDTH * (parentOutputIndex + 1)} ${SWIMLANE_HEIGHT}`);

		// Draw -
		d.push(`M ${SWIMLANE_WIDTH * parentOutputIndex} ${SWIMLANE_HEIGHT / 2}`);
		d.push(`H ${SWIMLANE_WIDTH * (circleIndex + 1)} `);

		path.setAttribute('d', d.join(' '));
		svg.append(path);
	}

	// Draw | to *
	if (inputIndex !== -1) {
		const path = drawVerticalLine(SWIMLANE_WIDTH * (circleIndex + 1), 0, SWIMLANE_HEIGHT / 2, graphColors[inputSwimlanes[inputIndex].color]);
		svg.append(path);
	}

	// Draw | from *
	if (historyItem.parentIds.length > 0) {
		const path = drawVerticalLine(SWIMLANE_WIDTH * (circleIndex + 1), SWIMLANE_HEIGHT / 2, SWIMLANE_HEIGHT, graphColors[circleColorIndex]);
		svg.append(path);
	}

	// Draw *
	if (historyItem.parentIds.length > 1) {
		// Multi-parent node
		const circleOuter = drawCircle(circleIndex, CIRCLE_RADIUS + 1, graphColors[circleColorIndex]);
		svg.append(circleOuter);

		const circleInner = drawCircle(circleIndex, CIRCLE_RADIUS - 1, graphColors[circleColorIndex]);
		svg.append(circleInner);
	} else {
		// HEAD
		// TODO@lszomoru - implement a better way to determine if the commit is HEAD
		if (historyItem.labels?.some(l => ThemeIcon.isThemeIcon(l.icon) && l.icon.id === 'target')) {
			const outerCircle = drawCircle(circleIndex, CIRCLE_RADIUS + 2, graphColors[circleColorIndex]);
			svg.append(outerCircle);
		}

		// Node
		const circle = drawCircle(circleIndex, CIRCLE_RADIUS, graphColors[circleColorIndex]);
		svg.append(circle);
	}

	// Set dimensions
	svg.style.height = `${SWIMLANE_HEIGHT}px`;
	svg.style.width = `${SWIMLANE_WIDTH * (Math.max(inputSwimlanes.length, outputSwimlanes.length, 1) + 1)}px`;

	return svg;
}

export function toISCMHistoryItemViewModelArray(historyItems: ISCMHistoryItem[], colorMap = new Map<string, number>()): ISCMHistoryItemViewModel[] {
	let colorIndex = -1;
	const viewModels: ISCMHistoryItemViewModel[] = [];

	for (let index = 0; index < historyItems.length; index++) {
		const historyItem = historyItems[index];

		const outputSwimlanesFromPreviousItem = lastOrDefault(viewModels)?.outputSwimlanes ?? [];
		const inputSwimlanes = outputSwimlanesFromPreviousItem.map(i => deepClone(i));
		const outputSwimlanes: ISCMHistoryItemGraphNode[] = [];

		if (historyItem.parentIds.length > 0) {
			let firstParentAdded = false;

			// Add first parent to the output
			for (const node of inputSwimlanes) {
				if (node.id === historyItem.id) {
					if (!firstParentAdded) {
						outputSwimlanes.push({
							id: historyItem.parentIds[0],
							color: getLabelColorIndex(historyItem, colorMap) ?? node.color
						});
						firstParentAdded = true;
					}

					continue;
				}

				outputSwimlanes.push(deepClone(node));
			}

			// Add unprocessed parent(s) to the output
			for (let i = firstParentAdded ? 1 : 0; i < historyItem.parentIds.length; i++) {
				// Color index (label -> next color)
				colorIndex = getLabelColorIndex(historyItem, colorMap) ?? getNextColorIndex(colorIndex);

				outputSwimlanes.push({
					id: historyItem.parentIds[i],
					color: colorIndex
				});
			}
		}

		viewModels.push({
			historyItem,
			inputSwimlanes,
			outputSwimlanes,
		});
	}

	return viewModels;
}
