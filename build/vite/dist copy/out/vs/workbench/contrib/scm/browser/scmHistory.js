/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { deepClone } from '../../../../base/common/objects.js';
import { badgeBackground, chartsBlue, chartsPurple, foreground } from '../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable, registerColor } from '../../../../platform/theme/common/colorUtils.js';
import { SCMIncomingHistoryItemId, SCMOutgoingHistoryItemId } from '../common/history.js';
import { rot } from '../../../../base/common/numbers.js';
import { $, svgElem } from '../../../../base/browser/dom.js';
import { PANEL_BACKGROUND } from '../../../common/theme.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isEmptyMarkdownString, isMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
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
export const colorRegistry = [
    registerColor('scmGraph.foreground1', '#FFB000', localize('scmGraphForeground1', "Source control graph foreground color (1).")),
    registerColor('scmGraph.foreground2', '#DC267F', localize('scmGraphForeground2', "Source control graph foreground color (2).")),
    registerColor('scmGraph.foreground3', '#994F00', localize('scmGraphForeground3', "Source control graph foreground color (3).")),
    registerColor('scmGraph.foreground4', '#40B0A6', localize('scmGraphForeground4', "Source control graph foreground color (4).")),
    registerColor('scmGraph.foreground5', '#B66DFF', localize('scmGraphForeground5', "Source control graph foreground color (5).")),
];
function getLabelColorIdentifier(historyItem, colorMap) {
    if (historyItem.id === SCMIncomingHistoryItemId) {
        return historyItemRemoteRefColor;
    }
    else if (historyItem.id === SCMOutgoingHistoryItemId) {
        return historyItemRefColor;
    }
    else {
        for (const ref of historyItem.references ?? []) {
            const colorIdentifier = colorMap.get(ref.id);
            if (colorIdentifier !== undefined) {
                return colorIdentifier;
            }
        }
    }
    return undefined;
}
function createPath(colorIdentifier, strokeWidth = 1) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', `${strokeWidth}px`);
    path.setAttribute('stroke-linecap', 'round');
    path.style.stroke = asCssVariable(colorIdentifier);
    return path;
}
function drawCircle(index, radius, strokeWidth, colorIdentifier) {
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
function drawDashedCircle(index, radius, strokeWidth, colorIdentifier) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', `${SWIMLANE_WIDTH * (index + 1)}`);
    circle.setAttribute('cy', `${SWIMLANE_WIDTH}`);
    circle.setAttribute('r', `${CIRCLE_RADIUS + 1}`);
    circle.style.stroke = asCssVariable(colorIdentifier);
    circle.style.strokeWidth = `${strokeWidth}px`;
    circle.style.strokeDasharray = '4,2';
    return circle;
}
function drawVerticalLine(x1, y1, y2, color, strokeWidth = 1) {
    const path = createPath(color, strokeWidth);
    path.setAttribute('d', `M ${x1} ${y1} V ${y2}`);
    return path;
}
function findLastIndex(nodes, id) {
    for (let i = nodes.length - 1; i >= 0; i--) {
        if (nodes[i].id === id) {
            return i;
        }
    }
    return -1;
}
export function renderSCMHistoryItemGraph(historyItemViewModel) {
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
                const d = [];
                const path = createPath(color);
                // Draw /
                d.push(`M ${SWIMLANE_WIDTH * (index + 1)} 0`);
                d.push(`A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${SWIMLANE_WIDTH * (index)} ${SWIMLANE_WIDTH}`);
                // Draw -
                d.push(`H ${SWIMLANE_WIDTH * (circleIndex + 1)}`);
                path.setAttribute('d', d.join(' '));
                svg.append(path);
            }
            else {
                outputSwimlaneIndex++;
            }
        }
        else {
            // Not the current commit
            if (outputSwimlaneIndex < outputSwimlanes.length &&
                inputSwimlanes[index].id === outputSwimlanes[outputSwimlaneIndex].id) {
                if (index === outputSwimlaneIndex) {
                    // Draw |
                    const path = drawVerticalLine(SWIMLANE_WIDTH * (index + 1), 0, SWIMLANE_HEIGHT, color);
                    svg.append(path);
                }
                else {
                    const d = [];
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
        const d = [];
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
    }
    else if (historyItemViewModel.kind === 'incoming-changes' || historyItemViewModel.kind === 'outgoing-changes') {
        // Incoming/Outgoing changes
        const outerCircle = drawCircle(circleIndex, CIRCLE_RADIUS + 3, CIRCLE_STROKE_WIDTH, circleColor);
        svg.append(outerCircle);
        const innerCircle = drawCircle(circleIndex, CIRCLE_RADIUS + 1, CIRCLE_STROKE_WIDTH + 1);
        svg.append(innerCircle);
        const dashedCircle = drawDashedCircle(circleIndex, CIRCLE_RADIUS + 1, CIRCLE_STROKE_WIDTH - 1, circleColor);
        svg.append(dashedCircle);
    }
    else {
        if (historyItem.parentIds.length > 1) {
            // Multi-parent node
            const circleOuter = drawCircle(circleIndex, CIRCLE_RADIUS + 2, CIRCLE_STROKE_WIDTH, circleColor);
            svg.append(circleOuter);
            const circleInner = drawCircle(circleIndex, CIRCLE_RADIUS - 1, CIRCLE_STROKE_WIDTH, circleColor);
            svg.append(circleInner);
        }
        else {
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
export function renderSCMHistoryGraphPlaceholder(columns, highlightIndex) {
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
export function toISCMHistoryItemViewModelArray(historyItems, colorMap = new Map(), currentHistoryItemRef, currentHistoryItemRemoteRef, currentHistoryItemBaseRef, addIncomingChanges, addOutgoingChanges, mergeBase) {
    let colorIndex = -1;
    const viewModels = [];
    for (let index = 0; index < historyItems.length; index++) {
        const historyItem = historyItems[index];
        const kind = historyItem.id === currentHistoryItemRef?.revision ? 'HEAD' : 'node';
        const outputSwimlanesFromPreviousItem = viewModels.at(-1)?.outputSwimlanes ?? [];
        const inputSwimlanes = outputSwimlanesFromPreviousItem.map(i => deepClone(i));
        const outputSwimlanes = [];
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
            let colorIdentifier;
            if (i === 0) {
                colorIdentifier = getLabelColorIdentifier(historyItem, colorMap);
            }
            else {
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
        references.sort((ref1, ref2) => compareHistoryItemRefs(ref1, ref2, currentHistoryItemRef, currentHistoryItemRemoteRef, currentHistoryItemBaseRef));
        viewModels.push({
            historyItem: {
                ...historyItem,
                references
            },
            kind,
            inputSwimlanes,
            outputSwimlanes
        });
    }
    // Add incoming/outgoing changes history item view models. While working
    // with the view models is a little bit more complex, we are doing this
    // after creating the view models so that we can use the swimlane colors
    // to add the incoming/outgoing changes history items view models to the
    // correct swimlanes.
    addIncomingOutgoingChangesHistoryItems(viewModels, currentHistoryItemRef, currentHistoryItemRemoteRef, addIncomingChanges, addOutgoingChanges, mergeBase);
    return viewModels;
}
export function getHistoryItemIndex(historyItemViewModel) {
    const historyItem = historyItemViewModel.historyItem;
    const inputSwimlanes = historyItemViewModel.inputSwimlanes;
    // Find the history item in the input swimlanes
    const inputIndex = inputSwimlanes.findIndex(node => node.id === historyItem.id);
    // Circle index - use the input swimlane index if present, otherwise add it to the end
    return inputIndex !== -1 ? inputIndex : inputSwimlanes.length;
}
function addIncomingOutgoingChangesHistoryItems(viewModels, currentHistoryItemRef, currentHistoryItemRemoteRef, addIncomingChanges, addOutgoingChanges, mergeBase) {
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
                    };
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
                };
                // Copy the input swimlanes from the current history item ref
                const inputSwimlanes = viewModels[currentHistoryItemRefIndex].inputSwimlanes.slice(0);
                // Copy the input swimlanes and add the current history item ref
                const outputSwimlanes = inputSwimlanes.slice(0).concat({
                    id: currentHistoryItemRef.revision,
                    color: historyItemRefColor
                });
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
                });
            }
        }
    }
}
export function compareHistoryItemRefs(ref1, ref2, currentHistoryItemRef, currentHistoryItemRemoteRef, currentHistoryItemBaseRef) {
    const getHistoryItemRefOrder = (ref) => {
        if (ref.id === currentHistoryItemRef?.id) {
            return 1;
        }
        else if (ref.id === currentHistoryItemRemoteRef?.id) {
            return 2;
        }
        else if (ref.id === currentHistoryItemBaseRef?.id) {
            return 3;
        }
        else if (ref.color !== undefined) {
            return 4;
        }
        return 99;
    };
    // Assign order (current > remote > base > color)
    const ref1Order = getHistoryItemRefOrder(ref1);
    const ref2Order = getHistoryItemRefOrder(ref2);
    return ref1Order - ref2Order;
}
export function toHistoryItemHoverContent(markdownRendererService, historyItem, includeReferences) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NtSGlzdG9yeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9icm93c2VyL3NjbUhpc3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsZUFBZSxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDM0gsT0FBTyxFQUFFLGFBQWEsRUFBbUIsYUFBYSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDaEgsT0FBTyxFQUEyRix3QkFBd0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ25MLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzVELE9BQU8sRUFBRSxlQUFlLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwRixPQUFPLEVBQW1CLHFCQUFxQixFQUFFLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2xJLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVqRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFcEUsTUFBTSxDQUFDLE1BQU0sZUFBZSxHQUFHLEVBQUUsQ0FBQztBQUNsQyxNQUFNLENBQUMsTUFBTSxjQUFjLEdBQUcsRUFBRSxDQUFDO0FBQ2pDLE1BQU0scUJBQXFCLEdB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