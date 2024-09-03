/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { lastOrDefault } from 'vs/base/common/arrays';
import { deepClone } from 'vs/base/common/objects';
import { ThemeIcon } from 'vs/base/common/themables';
import { buttonForeground } from 'vs/platform/theme/common/colorRegistry';
import { chartsBlue, chartsGreen, chartsOrange, chartsPurple, chartsRed, chartsYellow } from 'vs/platform/theme/common/colors/chartsColors';
import { asCssVariable, ColorIdentifier, registerColor } from 'vs/platform/theme/common/colorUtils';
import { ISCMHistoryItem, ISCMHistoryItemGraphNode, ISCMHistoryItemViewModel } from 'vs/workbench/contrib/scm/common/history';
import { rot } from 'vs/base/common/numbers';
import { svgElem } from 'vs/base/browser/dom';

export const SWIMLANE_HEIGHT = 22;
export const SWIMLANE_WIDTH = 11;
const CIRCLE_RADIUS = 4;
const SWIMLANE_CURVE_RADIUS = 5;

/**
 * History graph colors (local, remote, base)
 */
export const historyItemGroupLocal = registerColor('scmGraph.historyItemGroupLocal', chartsBlue, localize('scmGraphHistoryItemGroupLocal', "Local history item group color."));
export const historyItemGroupRemote = registerColor('scmGraph.historyItemGroupRemote', chartsPurple, localize('scmGraphHistoryItemGroupRemote', "Remote history item group color."));
export const historyItemGroupBase = registerColor('scmGraph.historyItemGroupBase', chartsOrange, localize('scmGraphHistoryItemGroupBase', "Base history item group color."));

/**
 * History item hover color
 */
export const historyItemGroupHoverLabelForeground = registerColor('scmGraph.historyItemHoverLabelForeground', buttonForeground, localize('scmGraphHistoryItemHoverLabelForeground', "History item hover label foreground color."));

/**
 * History graph color registry
 */
export const colorRegistry: ColorIdentifier[] = [
	registerColor('scmGraph.foreground1', chartsGreen, localize('scmGraphForeground1', "Source control graph foreground color (1).")),
	registerColor('scmGraph.foreground2', chartsRed, localize('scmGraphForeground2', "Source control graph foreground color (2).")),
	registerColor('scmGraph.foreground3', chartsYellow, localize('scmGraphForeground3', "Source control graph foreground color (3).")),
];

function getLabelColorIdentifier(historyItem: ISCMHistoryItem, colorMap: Map<string, ColorIdentifier>): ColorIdentifier | undefined {
	for (const label of historyItem.labels ?? []) {
		const colorIndex = colorMap.get(label.title);
		if (colorIndex !== undefined) {
			return colorIndex;
		}
	}

	return undefined;
}

function createPath(colorIdentifier: string): SVGPathElement {
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('fill', 'none');
	path.setAttribute('stroke-width', '1px');
	path.setAttribute('stroke-linecap', 'round');
	path.style.stroke = asCssVariable(colorIdentifier);

	return path;
}

function drawCircle(index: number, radius: number, colorIdentifier: string): SVGCircleElement {
	const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
	circle.setAttribute('cx', `${SWIMLANE_WIDTH * (index + 1)}`);
	circle.setAttribute('cy', `${SWIMLANE_WIDTH}`);
	circle.setAttribute('r', `${radius}`);
	circle.style.fill = asCssVariable(colorIdentifier);

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
	const circleColor = circleIndex < outputSwimlanes.length ? outputSwimlanes[circleIndex].color :
		circleIndex < inputSwimlanes.length ? inputSwimlanes[circleIndex].color : historyItemGroupLocal;

	let outputSwimlaneIndex = 0;
	for (let index = 0; index < inputSwimlanes.length; index++) {
		const color = inputSwimlanes[index].color;

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
		const path = createPath(outputSwimlanes[parentOutputIndex].color);

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
		const path = drawVerticalLine(SWIMLANE_WIDTH * (circleIndex + 1), 0, SWIMLANE_HEIGHT / 2, inputSwimlanes[inputIndex].color);
		svg.append(path);
	}

	// Draw | from *
	if (historyItem.parentIds.length > 0) {
		const path = drawVerticalLine(SWIMLANE_WIDTH * (circleIndex + 1), SWIMLANE_HEIGHT / 2, SWIMLANE_HEIGHT, circleColor);
		svg.append(path);
	}

	// Draw *
	if (historyItem.parentIds.length > 1) {
		// Multi-parent node
		const circleOuter = drawCircle(circleIndex, CIRCLE_RADIUS + 1, circleColor);
		svg.append(circleOuter);

		const circleInner = drawCircle(circleIndex, CIRCLE_RADIUS - 1, circleColor);
		svg.append(circleInner);
	} else {
		// HEAD
		// TODO@lszomoru - implement a better way to determine if the commit is HEAD
		if (historyItem.labels?.some(l => ThemeIcon.isThemeIcon(l.icon) && l.icon.id === 'target')) {
			const outerCircle = drawCircle(circleIndex, CIRCLE_RADIUS + 2, circleColor);
			svg.append(outerCircle);
		}

		// Node
		const circle = drawCircle(circleIndex, CIRCLE_RADIUS, circleColor);
		svg.append(circle);
	}

	// Set dimensions
	svg.style.height = `${SWIMLANE_HEIGHT}px`;
	svg.style.width = `${SWIMLANE_WIDTH * (Math.max(inputSwimlanes.length, outputSwimlanes.length, 1) + 1)}px`;

	return svg;
}

export function renderSCMHistoryGraphPlaceholder(columns: ISCMHistoryItemGraphNode[]): HTMLElement {
	const elements = svgElem('svg', {
		style: { height: `${SWIMLANE_HEIGHT}px`, width: `${SWIMLANE_WIDTH * (columns.length + 1)}px`, }
	});

	// Draw |
	for (let index = 0; index < columns.length; index++) {
		const path = drawVerticalLine(SWIMLANE_WIDTH * (index + 1), 0, SWIMLANE_HEIGHT, columns[index].color);
		elements.root.append(path);
	}

	return elements.root;
}

export function toISCMHistoryItemViewModelArray(historyItems: ISCMHistoryItem[], colorMap = new Map<string, string>()): ISCMHistoryItemViewModel[] {
	let colorIndex = -1;
	const viewModels: ISCMHistoryItemViewModel[] = [];

	for (let index = 0; index < historyItems.length; index++) {
		const historyItem = historyItems[index];

		const outputSwimlanesFromPreviousItem = lastOrDefault(viewModels)?.outputSwimlanes ?? [];
		const inputSwimlanes = outputSwimlanesFromPreviousItem.map(i => deepClone(i));
		const outputSwimlanes: ISCMHistoryItemGraphNode[] = [];

		let firstParentAdded = false;

		// Add first parent to the output
		if (historyItem.parentIds.length > 0) {
			for (const node of inputSwimlanes) {
				if (node.id === historyItem.id) {
					if (!firstParentAdded) {
						outputSwimlanes.push({
							id: historyItem.parentIds[0],
							color: getLabelColorIdentifier(historyItem, colorMap) ?? node.color
						});
						firstParentAdded = true;
					}

					continue;
				}

				outputSwimlanes.push(deepClone(node));
			}
		}

		// Add unprocessed parent(s) to the output
		for (let i = firstParentAdded ? 1 : 0; i < historyItem.parentIds.length; i++) {
			// Color index (label -> next color)
			let colorIdentifier: string | undefined;

			if (!firstParentAdded) {
				colorIdentifier = getLabelColorIdentifier(historyItem, colorMap);
			} else {
				const historyItemParent = historyItems
					.find(h => h.id === historyItem.parentIds[i]);
				colorIdentifier = historyItemParent ? getLabelColorIdentifier(historyItemParent, colorMap) : undefined;
			}

			if (!colorIdentifier) {
				colorIndex = rot(colorIndex + 1, colorRegistry.length);
				colorIdentifier = colorRegistry[colorIndex];
			}

			outputSwimlanes.push({
				id: historyItem.parentIds[i],
				color: colorIdentifier
			});
		}

		viewModels.push({
			historyItem,
			inputSwimlanes,
			outputSwimlanes,
		});
	}

	return viewModels;
}
