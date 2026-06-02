/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptSnapshotNode } from '../../../prompt/src/components/components';

interface PathSegment {
	name: string;
	index: string | number;
}

/**
 * Queries a prompt snapshot tree to find a node value using a dot-notation path.
 *
 * @param snapshot - Root snapshot node to query
 * @param path - Dot-separated path to target node. Supports:
 *   - Simple paths: "parent.child.grandchild"
 *   - Array indices: "parent.children[0].name"
 *   - Array keys: "parent.children['key'].name"
 *   - Wildcards: "parent.*.name" matches any child node
 *   - Node names can contain letters, numbers, and special chars except dots and brackets
 *   - The first child is selected if no index is provided, else use [*] for all children
 *
 * @returns Value of the matched node as string
 * @throws {Error} If path is invalid or node cannot be found
 */
export function querySnapshot(snapshot: PromptSnapshotNode, path: string): string | PromptSnapshotNode[] {
	const segments = path
		.trim()
		.split('.')
		.map(s => s.trim());
	let current = snapshot;
	for (const segment of segments) {
		if (!current?.children?.length) {
			throw new Error(`No children found at path segment '${segment}'. Path: ${path}`);
		}
		const { name, index } = parsePathSegment(segment);
		validateNodeName(name, current, segment, path);
		validateNodeChildrenLength(index, current.children, segment, path);
		if (typeof index === 'number') {
			current = current.children[index];
		} else if (index === '*') {
			break;
		} else {
			const child = current.children.find(c => c.path.includes(index));
			if (!child) {
				throw new Error(`No children with index '${index}' found at path segment '${segment}'. Path: ${path}`);
			}
			current = child;
		}
	}
	if (!current?.value) {
		return current.children || [];
	}
	return current.value;
}

function parsePathSegment(segment: string): PathSegment {
	const match = segment.match(/^([^[]+)(?:\[(\d+|\*|["'][\w-]+["'])\])?$/);
	if (!match) {
		throw new Error(`Invalid path segment: ${segment}`);
	}
	const stringIndex = match[2] ?? 0;
	const index = isNaN(Number(stringIndex)) ? stringIndex : Number(stringIndex);

	return {
		name: match[1],
		index,
	};
}

function validateNodeName(name: string, current: PromptSnapshotNode, segment: string, path: string) {
	if (name !== '*' && name !== current.name) {
		throw new Error(
			`Name mismatch at segment '${segment}'. Expected '${current.name}' but got '${name}'. Path: ${path}`
		);
	}
}

function validateNodeChildrenLength(
	index: number | string,
	children: PromptSnapshotNode[],
	segment: string,
	path: string
) {
	if (typeof index === 'number' && index >= children.length) {
		throw new Error(
			`Index out of bounds at segment '${segment}'. Maximum index is ${children.length - 1}. Path: ${path}`
		);
	}
}
