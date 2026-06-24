/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IVirtualNode, NodeId } from './renderNode';

export const DEFAULT_ELISION_MARKER = '[...]';

let nextNodeId: NodeId = 0;
export function getAvailableNodeId(): NodeId {
	return nextNodeId++;
}

export type NodeCostFunction = (node: IVirtualNode) => number;

