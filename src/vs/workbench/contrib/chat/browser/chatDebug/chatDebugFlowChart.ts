/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Barrel re-export — keeps existing imports stable.
// Data model + graph building (stable):
export { buildFlowGraph, filterFlowNodes } from './chatDebugFlowGraph.js';
export type { FlowNode, FlowFilterOptions, FlowLayout, FlowChartRenderResult, LayoutNode, LayoutEdge, SubgraphRect } from './chatDebugFlowGraph.js';
// Layout + rendering (feature work):
export { layoutFlowGraph, renderFlowChartSVG } from './chatDebugFlowLayout.js';

