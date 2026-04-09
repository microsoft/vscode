/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptSnapshotNode } from '../../components/components';
import { VirtualPromptNode } from '../../components/reconciler';

export function extractNodesWitPath(node: VirtualPromptNode | PromptSnapshotNode): string[] {
	if (node.children === undefined || node.children.length === 0) {
		return [node.path];
	}
	return [node.path, ...(node.children?.flatMap(extractNodesWitPath) ?? [])];
}

export function isString(value: unknown): value is string {
	return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
	return typeof value === 'number';
}
