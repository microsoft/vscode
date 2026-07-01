/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { deepClone } from '../../../../base/common/objects.js';
import { badgeBackground, chartsBlue, chartsPurple, foreground } from '../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable, ColorIdentifier, registerColor } from '../../../../platform/theme/common/colorUtils.js';
import { ISCMHistoryItem, ISCMHistoryItemGraphNode, ISCMHistoryItemRef, ISCMHistoryItemViewModel, SCMIncomingHistoryItemId, SCMOutgoingHistoryItemId } from '../common/history.js';
import { rot } from '../../../../base/common/numbers.js';
import { $, svgElem } from '../../../../base/browser/dom.js';
import { PANEL_BACKGROUND } from '../../../common/theme.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IMarkdownString, isEmptyMarkdownString, isMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { findLastIdx } from '../../../../base/common/arraysFind.js';

export const SWIMLANE_HEIGHT = 22;
export const SWIMLANE_WIDTH = 11;
const SWIMLANE_CURVE_RADIUS = 5;
const CIRCLE_RADIUS = 4;
const CIRCLE_STROKE_WIDTH = 2;

/**
 * History item reference colors (local, remote, base)
 */
export const historyItemRefColor = registerColor('scmGraph.historyItemRefColor', chartsBlue, localize('scmGraphHistoryItemRefColor', "History item reference color."));
export const historyItemRemoteRefColor = registerColor('scmGraph.historyItemRemoteRefColor', chartsPurple, localize('scmGraphHistoryItemRemoteRefColor', "History item remote reference color."));
export const historyItemBaseRefColor = registerColor('scmGraph.historyItemBaseRefColor', '#EA5C00', localize('scmGraphHistoryItemBaseRefColor', "History item base reference color."));

/**
 * History item hover color
 */
export const historyItemHoverDefaultLabelForeground = registerColor('scmGraph.historyItemHoverDefaultLabelForeground', foreground, localize('scmGraphHistoryItemHoverDefaultLabelForeground', "History item hover default label foreground color."));
export const historyItemHoverDefaultLabelBackground = registerColor('scmGraph.historyItemHoverDefaultLabelBackground', badgeBackground, localize('scmGraphHistoryItemHoverDefaultLabelBackground', "History item hover default label background color."));
export const historyItemHoverLabelForeground = registerColor('scmGraph.historyItemHoverLabelForeground', PANEL_BACKGROUND, localize('scmGraphHistoryItemHoverLabelForeground', "History item hover label foreground color."));
export const historyItemHoverAdditionsForeground = registerColor('scmGraph.historyItemHoverAdditionsForeground', { light: '#587C0C', dark: '#81B88B', hcDark: '#A1E3AD', hcLight: '#374E06' }, localize('scmGraph.HistoryItemHoverAdditionsForeground', "History item hover additions foreground color."));
export const historyItemHoverDeletionsForeground = registerColor('scmGraph.historyItemHoverDeletionsForeground', { light: '#AD0707', dark: '#C74E39', hcDark: '#C74E39', hcLight: '#AD0707' }, localize('scmGraph.HistoryItemHoverDeletionsForeground', "History item hover deletions foreground color."));

/**
 * History graph color registry
 */
export const colorRegistry: ColorIdentifier[] = [
	registerColor('scmGraph.foreground1', '#FFB000', localize('scmGraphForeground1', "Source control graph foreground color (1).")),
	registerColor('scmGraph.foreground2', '#DC267F', localize('scmGraphForeground2', "Source control graph foreground color (2).")),
	registerColor('scmGraph.foreground3', '#994F00', localize('scmGraphForeground3', "Source control graph foreground color (3).")),
	registerColor('scmGraph.foreground4', '#40B0A6', localize('scmGraphForeground4', "Source control graph foreground color (4).")),
	registerColor('scmGraph.foreground5', '#B66DFF', localize('scmGraphForeground5', "Source control graph foreground color (5).")),
];

function getLabelColorIdentifier(historyItem: ISCMHistoryItem, colorMap: Map<string, ColorIdentifier | undefined>): ColorIdentifier | undefined {
	if (historyItem.id === SCMIncomingHistoryItemId) {
		return historyItemRemoteRefColor;
	} else if (historyItem.id === SCMOutgoingHistoryItemId) {
		return historyItemRefColor;
	} else {
		for (const ref of historyItem.references ?? []) {
			const colorIdentifier = colorMap.get(ref.id);
			if (colorIdentifier !== undefined) {
				return colorIdentifier;
			}
		}
	}

	return undefined;
}

function createPath(colorIdentifier: string, strokeWidth = 1): SVGPathElement {
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('fill', 'none');
	path.setAttribute('stroke-width', `${strokeWidth}px`);
	path.setAttribute('stroke-linecap', 'round');
	path.style.stroke = asCssVariable(colorIdentifier);

	return path;
}

function drawCircle(index: number, radius: number, strokeWidth: number, colorIdentifier?: string): SVGCircleElement {
	const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
	circle.setAttribute('cx', `${SWIMLANE_WIDTH * (index + 1)}`);
	circle.setAttribute('cy', `${SWIMLANE_WIDTH}`);
	circle.setAttribute('r', `${radius}`);

	circle.style.strokeWidth = `${strokeWidth}px`;
	if (colorIdentifier) {
		circle.style.fill = asCssVariable(colorIdentifier);
	}

	return circle;
}

function drawDashedCircle(index: number, radius: number, strokeWidth: number, colorIdentifier: string): SVGCircleElement {
	const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
	circle.setAttribute('cx', `${SWIMLANE_WIDTH * (index + 1)}`);
	circle.setAttribute('cy', `${SWIMLANE_WIDTH}`);
	circle.setAttribute('r', `${CIRCLE_RADIUS + 1}`);

	circle.style.stroke = asCssVariable(colorIdentifier);
	circle.style.strokeWidth = `${strokeWidth}px`;
	circle.style.strokeDasharray = '4,2';

	return circle;
}

function drawVerticalLine(x1: number, y1: number, y2: number, color: string, strokeWidth = 1): SVGPathElement {
	const path = createPath(color, strokeWidth);
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
		circleIndex < inputSwimlanes.length ? inputSwimlanes[circleIndex].color : historyItemRefColor;

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
	if (historyItemViewModel.kind === 'HEAD') {
		// HEAD
		const outerCircle = drawCircle(circleIndex, CIRCLE_RADIUS + 3, CIRCLE_STROKE_WIDTH, circleColor);
		svg.append(outerCircle);

		const innerCircle = drawCircle(circleIndex, CIRCLE_STROKE_WIDTH, CIRCLE_RADIUS);
		svg.append(innerCircle);
	} else if (historyItemViewModel.kind === 'incoming-changes' || historyItemViewModel.kind === 'outgoing-changes') {
		// Incoming/Outgoing changes
		const outerCircle = drawCircle(circleIndex, CIRCLE_RADIUS + 3, CIRCLE_STROKE_WIDTH, circleColor);
		svg.append(outerCircle);

		const innerCircle = drawCircle(circleIndex, CIRCLE_RADIUS + 1, CIRCLE_STROKE_WIDTH + 1);
		svg.append(innerCircle);

		const dashedCircle = drawDashedCircle(circleIndex, CIRCLE_RADIUS + 1, CIRCLE_STROKE_WIDTH - 1, circleColor);
		svg.append(dashedCircle);
	} else {
		if (historyItem.parentIds.length > 1) {
			// Multi-parent node
			const circleOuter = drawCircle(circleIndex, CIRCLE_RADIUS + 2, CIRCLE_STROKE_WIDTH, circleColor);
			svg.append(circleOuter);

			const circleInner = drawCircle(circleIndex, CIRCLE_RADIUS - 1, CIRCLE_STROKE_WIDTH, circleColor);
			svg.append(circleInner);
		} else {
			// Node
			const circle = drawCircle(circleIndex, CIRCLE_RADIUS + 1, CIRCLE_STROKE_WIDTH, circleColor);
			svg.append(circle);
		}
	}

	// Set dimensions
	svg.style.height = `${SWIMLANE_HEIGHT}px`;
	svg.style.width = `${SWIMLANE_WIDTH * (Math.max(inputSwimlanes.length, outputSwimlanes.length, 1) + 1)}px`;

	return svg;
}

export function renderSCMHistoryGraphPlaceholder(columns: ISCMHistoryItemGraphNode[], highlightIndex?: number): HTMLElement {
	const elements = svgElem('svg', {
		style: { height: `${SWIMLANE_HEIGHT}px`, width: `${SWIMLANE_WIDTH * (columns.length + 1)}px`, }
	});

	// Draw |
	for (let index = 0; index < columns.length; index++) {
		const strokeWidth = index === highlightIndex ? 3 : 1;
		const path = drawVerticalLine(SWIMLANE_WIDTH * (index + 1), 0, SWIMLANE_HEIGHT, columns[index].color, strokeWidth);
		elements.root.append(path);
	}

	return elements.root;
}

export function toISCMHistoryItemViewModelArray(
	historyItems: ISCMHistoryItem[],
	colorMap = new Map<string, ColorIdentifier | undefined>(),
	currentHistoryItemRef?: ISCMHistoryItemRef,
	currentHistoryItemRemoteRef?: ISCMHistoryItemRef,
	currentHistoryItemBaseRef?: ISCMHistoryItemRef,
	addIncomingChanges?: boolean,
	addOutgoingChanges?: boolean,
	mergeBase?: string
): ISCMHistoryItemViewModel[] {
	let colorIndex = -1;
	const viewModels: ISCMHistoryItemViewModel[] = [];

	for (let index = 0; index < historyItems.length; index++) {
		const historyItem = historyItems[index];

		const kind = historyItem.id === currentHistoryItemRef?.revision ? 'HEAD' : 'node';
		const outputSwimlanesFromPreviousItem = viewModels.at(-1)?.outputSwimlanes ?? [];
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

			if (i === 0) {
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

		// Add colors to references
		const references = (historyItem.references ?? [])
			.map(ref => {
				let color = colorMap.get(ref.id);
				if (colorMap.has(ref.id) && color === undefined) {
					// Find the history item in the input swimlanes
					const inputIndex = inputSwimlanes.findIndex(node => node.id === historyItem.id);

					// Circle index - use the input swimlane index if present, otherwise add it to the end
					const circleIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length;

					// Circle color - use the output swimlane color if present, otherwise the input swimlane color
					color = circleIndex < outputSwimlanes.length ? outputSwimlanes[circleIndex].color :
						circleIndex < inputSwimlanes.length ? inputSwimlanes[circleIndex].color : historyItemRefColor;
				}

				return { ...ref, color };
			});

		// Sort references
		references.sort((ref1, ref2) =>
			compareHistoryItemRefs(ref1, ref2, currentHistoryItemRef, currentHistoryItemRemoteRef, currentHistoryItemBaseRef));

		viewModels.push({
			historyItem: {
				...historyItem,
				references
			},
			kind,
			inputSwimlanes,
			outputSwimlanes
		} satisfies ISCMHistoryItemViewModel);
	}

	// Add incoming/outgoing changes history item view models. While working
	// with the view models is a little bit more complex, we are doing this
	// after creating the view models so that we can use the swimlane colors
	// to add the incoming/outgoing changes history items view models to the
	// correct swimlanes.
	addIncomingOutgoingChangesHistoryItems(
		viewModels,
		currentHistoryItemRef,
		currentHistoryItemRemoteRef,
		addIncomingChanges,
		addOutgoingChanges,
		mergeBase
	);

	return viewModels;
}

export function getHistoryItemIndex(historyItemViewModel: ISCMHistoryItemViewModel): number {
	const historyItem = historyItemViewModel.historyItem;
	const inputSwimlanes = historyItemViewModel.inputSwimlanes;

	// Find the history item in the input swimlanes
	const inputIndex = inputSwimlanes.findIndex(node => node.id === historyItem.id);

	// Circle index - use the input swimlane index if present, otherwise add it to the end
	return inputIndex !== -1 ? inputIndex : inputSwimlanes.length;
}

function addIncomingOutgoingChangesHistoryItems(
	viewModels: ISCMHistoryItemViewModel[],
	currentHistoryItemRef?: ISCMHistoryItemRef,
	currentHistoryItemRemoteRef?: ISCMHistoryItemRef,
	addIncomingChanges?: boolean,
	addOutgoingChanges?: boolean,
	mergeBase?: string
): void {
	if (currentHistoryItemRef?.revision !== currentHistoryItemRemoteRef?.revision && mergeBase) {
		// Incoming changes node
		if (addIncomingChanges && currentHistoryItemRemoteRef && currentHistoryItemRemoteRef.revision !== mergeBase) {
			// Find the before/after indices using the merge base (might not be present if the merge base history item is not loaded yet)
			const beforeHistoryItemIndex = findLastIdx(viewModels, vm => vm.outputSwimlanes.some(node => node.id === mergeBase));
			const afterHistoryItemIndex = viewModels.findIndex(vm => vm.historyItem.id === mergeBase);

			if (beforeHistoryItemIndex !== -1 && afterHistoryItemIndex !== -1) {
				// There is a known edge case in which the incoming changes have already
				// been merged. For this scenario, we will not be showing the incoming
				// changes history item. https://github.com/microsoft/vscode/issues/276064
				const incomingChangeMerged = viewModels[beforeHistoryItemIndex].historyItem.parentIds.length === 2 &&
					viewModels[beforeHistoryItemIndex].historyItem.parentIds.includes(mergeBase);

				if (!incomingChangeMerged) {
					// Update the before node so that the incoming and outgoing swimlanes
					// point to the `incoming-changes` node instead of the merge base
					viewModels[beforeHistoryItemIndex] = {
						...viewModels[beforeHistoryItemIndex],
						inputSwimlanes: viewModels[beforeHistoryItemIndex].inputSwimlanes
							.map(node => {
								return node.id === mergeBase && node.color === historyItemRemoteRefColor
									? { ...node, id: SCMIncomingHistoryItemId }
									: node;
							}),
						outputSwimlanes: viewModels[beforeHistoryItemIndex].outputSwimlanes
							.map(node => {
								return node.id === mergeBase && node.color === historyItemRemoteRefColor
									? { ...node, id: SCMIncomingHistoryItemId }
									: node;
							})
					};

					// Create incoming changes node
					const inputSwimlanes = viewModels[beforeHistoryItemIndex].outputSwimlanes.map(i => deepClone(i));
					const outputSwimlanes = viewModels[afterHistoryItemIndex].inputSwimlanes.map(i => deepClone(i));
					const displayIdLength = viewModels[0].historyItem.displayId?.length ?? 0;

					const incomingChangesHistoryItem = {
						id: SCMIncomingHistoryItemId,
						displayId: '0'.repeat(displayIdLength),
						parentIds: [mergeBase],
						author: currentHistoryItemRemoteRef?.name,
						subject: localize('incomingChanges', 'Incoming Changes'),
						message: ''
					} satisfies ISCMHistoryItem;

					// Insert incoming changes node
					viewModels.splice(afterHistoryItemIndex, 0, {
						historyItem: incomingChangesHistoryItem,
						kind: 'incoming-changes',
						inputSwimlanes,
						outputSwimlanes
					});
				}
			}
		}

		// Outgoing changes node
		if (addOutgoingChanges && currentHistoryItemRef?.revision && currentHistoryItemRef.revision !== mergeBase) {
			// Find the index of the current history item view model (might not be present if the current history item is not loaded yet)
			const currentHistoryItemRefIndex = viewModels.findIndex(vm => vm.kind === 'HEAD' && vm.historyItem.id === currentHistoryItemRef.revision);

			if (currentHistoryItemRefIndex !== -1) {
				// Create outgoing changes node
				const outgoingChangesHistoryItem = {
					id: SCMOutgoingHistoryItemId,
					displayId: viewModels[0].historyItem.displayId
						? '0'.repeat(viewModels[0].historyItem.displayId.length)
						: undefined,
					parentIds: [currentHistoryItemRef.revision],
					author: currentHistoryItemRef?.name,
					subject: localize('outgoingChanges', 'Outgoing Changes'),
					message: ''
				} satisfies ISCMHistoryItem;

				// Copy the input swimlanes from the current history item ref
				const inputSwimlanes = viewModels[currentHistoryItemRefIndex].inputSwimlanes.slice(0);

				// Copy the input swimlanes and add the current history item ref
				const outputSwimlanes = inputSwimlanes.slice(0).concat({
					id: currentHistoryItemRef.revision,
					color: historyItemRefColor
				} satisfies ISCMHistoryItemGraphNode);

				// Insert outgoing changes node
				viewModels.splice(currentHistoryItemRefIndex, 0, {
					historyItem: outgoingChangesHistoryItem,
					kind: 'outgoing-changes',
					inputSwimlanes,
					outputSwimlanes
				});

				// Update the input swimlane for the current history item
				// ref so that it connects with the outgoing changes node
				viewModels[currentHistoryItemRefIndex + 1].inputSwimlanes.push({
					id: currentHistoryItemRef.revision,
					color: historyItemRefColor
				} satisfies ISCMHistoryItemGraphNode);
			}
		}
	}
}

export function compareHistoryItemRefs(
	ref1: ISCMHistoryItemRef,
	ref2: ISCMHistoryItemRef,
	currentHistoryItemRef?: ISCMHistoryItemRef,
	currentHistoryItemRemoteRef?: ISCMHistoryItemRef,
	currentHistoryItemBaseRef?: ISCMHistoryItemRef
): number {
	const getHistoryItemRefOrder = (ref: ISCMHistoryItemRef) => {
		if (ref.id === currentHistoryItemRef?.id) {
			return 1;
		} else if (ref.id === currentHistoryItemRemoteRef?.id) {
			return 2;
		} else if (ref.id === currentHistoryItemBaseRef?.id) {
			return 3;
		} else if (ref.color !== undefined) {
			return 4;
		}

		return 99;
	};

	// Assign order (current > remote > base > color)
	const ref1Order = getHistoryItemRefOrder(ref1);
	const ref2Order = getHistoryItemRefOrder(ref2);

	return ref1Order - ref2Order;
}

export function toHistoryItemHoverContent(markdownRendererService: IMarkdownRendererService, historyItem: ISCMHistoryItem, includeReferences: boolean): { content: string | IMarkdownString | HTMLElement; disposables: IDisposable } {
	const disposables = new DisposableStore();

	if (historyItem.tooltip === undefined) {
		return { content: historyItem.message, disposables };
	}

	if (isMarkdownString(historyItem.tooltip)) {
		return { content: historyItem.tooltip, disposables };
	}

	// References as "injected" into the hover here since the extension does
	// not know that color used in the graph to render the history item at which
	// the reference is pointing to. They are being added before the last element
	// of the array which is assumed to contain the hover commands.
	const tooltipSections = historyItem.tooltip.slice();

	if (includeReferences && historyItem.references?.length) {
		const markdownString = new MarkdownString('', { supportHtml: true, supportThemeIcons: true });

		for (const reference of historyItem.references) {
			const labelIconId = ThemeIcon.isThemeIcon(reference.icon) ? reference.icon.id : '';

			const labelBackgroundColor = reference.color ? asCssVariable(reference.color) : asCssVariable(historyItemHoverDefaultLabelBackground);
			const labelForegroundColor = reference.color ? asCssVariable(historyItemHoverLabelForeground) : asCssVariable(historyItemHoverDefaultLabelForeground);
			markdownString.appendMarkdown(`<span style="color:${labelForegroundColor};background-color:${labelBackgroundColor};border-radius:10px;">&nbsp;$(${labelIconId})&nbsp;`);
			markdownString.appendText(reference.name);
			markdownString.appendMarkdown('&nbsp;&nbsp;</span>');
		}

		markdownString.appendMarkdown(`\n\n---\n\n`);
		tooltipSections.splice(tooltipSections.length - 1, 0, markdownString);
	}

	// Render tooltip content
	const hoverContainer = $('.history-item-hover-container');
	for (const markdownString of tooltipSections) {
		if (isEmptyMarkdownString(markdownString)) {
			continue;
		}

		const renderedContent = markdownRendererService.render(markdownString);
		hoverContainer.appendChild(renderedContent.element);
		disposables.add(renderedContent);
	}

	return { content: hoverContainer, disposables };
}
