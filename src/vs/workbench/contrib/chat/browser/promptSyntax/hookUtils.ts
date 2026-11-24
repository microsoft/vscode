/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findNodeAtLocation, Node, parseTree } from '../../../../../base/common/json.js';
import { ITextEditorSelection } from '../../../../../platform/editor/common/editor.js';

/**
 * Converts an offset in content to a 1-based line and column.
 */
function offsetToPosition(content: string, offset: number): { line: number; column: number } {
	let line = 1;
	let column = 1;
	for (let i = 0; i < offset && i < content.length; i++) {
		if (content[i] === '\n') {
			line++;
			column = 1;
		} else {
			column++;
		}
	}
	return { line, column };
}

/**
 * Finds the n-th command field node in a hook type array, handling both simple and nested formats.
 * This iterates through the structure in the same order as the parser flattens hooks.
 */
function findNthCommandNode(tree: Node, hookType: string, targetIndex: number, fieldName: string): Node | undefined {
	const hookTypeArray = findNodeAtLocation(tree, ['hooks', hookType]);
	if (!hookTypeArray || hookTypeArray.type !== 'array' || !hookTypeArray.children) {
		return undefined;
	}

	let currentIndex = 0;

	for (let i = 0; i < hookTypeArray.children.length; i++) {
		const item = hookTypeArray.children[i];
		if (item.type !== 'object') {
			continue;
		}

		// Check if this item has nested hooks (matcher format)
		const nestedHooksNode = findNodeAtLocation(tree, ['hooks', hookType, i, 'hooks']);
		if (nestedHooksNode && nestedHooksNode.type === 'array' && nestedHooksNode.children) {
			// Iterate through nested hooks
			for (let j = 0; j < nestedHooksNode.children.length; j++) {
				if (currentIndex === targetIndex) {
					return findNodeAtLocation(tree, ['hooks', hookType, i, 'hooks', j, fieldName]);
				}
				currentIndex++;
			}
		} else {
			// Simple format - direct command
			if (currentIndex === targetIndex) {
				return findNodeAtLocation(tree, ['hooks', hookType, i, fieldName]);
			}
			currentIndex++;
		}
	}

	return undefined;
}

/**
 * Finds the selection range for a hook command field value in JSON content.
 * Supports both simple format and nested matcher format:
 * - Simple: { hooks: { hookType: [{ command: "..." }] } }
 * - Nested: { hooks: { hookType: [{ matcher: "", hooks: [{ command: "..." }] }] } }
 *
 * The index is a flattened index across all commands in the hook type, regardless of nesting.
 *
 * @param content The JSON file content
 * @param hookType The hook type (e.g., "sessionStart")
 * @param index The flattened index of the hook command within the hook type
 * @param fieldName The field name to find ('command', 'bash', or 'powershell')
 * @returns The selection range for the field value, or undefined if not found
 */
export function findHookCommandSelection(content: string, hookType: string, index: number, fieldName: string): ITextEditorSelection | undefined {
	const tree = parseTree(content);
	if (!tree) {
		return undefined;
	}

	const node = findNthCommandNode(tree, hookType, index, fieldName);
	if (!node || node.type !== 'string') {
		return undefined;
	}

	// Node offset/length includes quotes, so adjust to select only the value content
	const valueStart = node.offset + 1; // After opening quote
	const valueEnd = node.offset + node.length - 1; // Before closing quote

	const start = offsetToPosition(content, valueStart);
	const end = offsetToPosition(content, valueEnd);

	return {
		startLineNumber: start.line,
		startColumn: start.column,
		endLineNumber: end.line,
		endColumn: end.column
	};
}
