/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { lastOrDefault } from 'vs/base/common/arrays';
import { deepClone } from 'vs/base/common/objects';
import { ISCMHistoryItem, ISCMHistoryItemGraphNode, ISCMHistoryItemViewModel } from 'vs/workbench/contrib/scm/common/history';

const SWIMLANE_HEIGHT = 22;
const SWIMLANE_WIDTH = 11;
const CIRCLE_RADIUS = 4;
const SWIMLANE_CURVE_RADIUS = 5;

const graphColors = ['#007ACC', '#BC3FBC', '#BF8803', '#CC6633', '#F14C4C', '#16825D'];

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

	const inputIndex = inputSwimlanes.findIndex(node => node.id === historyItem.id);
	const outputIndex = historyItem.parentIds.length === 0 ? -1 : outputSwimlanes.findIndex(node => node.id === historyItem.parentIds[0]);

	const circleIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length;
	const circleColorIndex = inputIndex !== -1 ? inputSwimlanes[inputIndex].color : outputSwimlanes[circleIndex]?.color ?? 0;

	for (let index = 0; index < inputSwimlanes.length; index++) {
		const node = inputSwimlanes[index];
		const color = graphColors[inputSwimlanes[index].color];

		// Not the current commit
		if (node.id !== historyItem.id) {
			if (index < outputSwimlanes.length && node.id === outputSwimlanes[index].id) {
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

				// Start walking backwards from the current index and
				// find the first occurrence in the output swimlanes
				// array
				let nodeOutputIndex = -1;
				for (let j = Math.min(index, outputSwimlanes.length) - 1; j >= 0; j--) {
					if (outputSwimlanes[j].id === node.id) {
						nodeOutputIndex = j;
						break;
					}
				}

				// Draw -
				d.push(`H ${(SWIMLANE_WIDTH * (nodeOutputIndex + 1)) + SWIMLANE_CURVE_RADIUS}`);

				// Draw /
				d.push(`A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 0 ${SWIMLANE_WIDTH * (nodeOutputIndex + 1)} ${(SWIMLANE_HEIGHT / 2) + SWIMLANE_CURVE_RADIUS}`);

				// Draw |
				d.push(`V ${SWIMLANE_HEIGHT}`);

				path.setAttribute('d', d.join(' '));
				svg.append(path);
			}

			continue;
		}

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

	// Draw | to circle
	if (inputIndex !== -1) {
		const path = drawVerticalLine(SWIMLANE_WIDTH * (circleIndex + 1), 0, SWIMLANE_HEIGHT / 2, graphColors[circleColorIndex]);
		svg.append(path);
	}

	// Draw | from circle
	if (outputIndex !== -1) {
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
		// Node
		const circle = drawCircle(circleIndex, CIRCLE_RADIUS, graphColors[circleColorIndex]);
		svg.append(circle);
	}

	// Set dimensions
	svg.style.height = `${SWIMLANE_HEIGHT}px`;
	svg.style.width = `${SWIMLANE_WIDTH * (Math.max(inputSwimlanes.length, outputSwimlanes.length, 1) + 1)}px`;

	return svg;
}

export function toISCMHistoryItemViewModelArray(historyItems: ISCMHistoryItem[]): ISCMHistoryItemViewModel[] {
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
							...deepClone(node),
							id: historyItem.parentIds[0]
						});
						firstParentAdded = true;
					}

					continue;
				}

				outputSwimlanes.push(deepClone(node));
			}

			// Add unprocessed parent(s) to the output
			for (let i = firstParentAdded ? 1 : 0; i < historyItem.parentIds.length; i++) {
				colorIndex = colorIndex < graphColors.length - 1 ? colorIndex + 1 : 1;
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
