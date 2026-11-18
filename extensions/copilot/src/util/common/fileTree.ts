/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';

export function fileTreePartToMarkdown(fileTree: vscode.ChatResponseFileTreePart) {
	const printTree = (node: vscode.ChatResponseFileTree, depth: number, isLastChild: boolean): string => {
		let output: string = '';
		const indent = isLastChild ? '└── ' : '├── ';
		if (depth === 1) {
			output = `${indent}${node.name}\n`;
		} else if (depth > 1) {
			output = `|   ${'    '.repeat(depth - 2)}${indent}${node.name}\n`;
		}
		if (node.children) {
			const lastChildIndex = node.children.length - 1;
			node.children.forEach((child, index) => {
				output += printTree(child, depth + 1, index === lastChildIndex);
			});
		}
		return output;
	};

	// Start with an empty string or the base directory if provided
	let markdown = `${fileTree.baseUri.path.replace('/', '')}\n`;
	const lastChildIndex = fileTree.value.length - 1;
	fileTree.value.forEach((tree, index) => {
		markdown += printTree(tree, 1, index === lastChildIndex);
	});
	return `\`\`\`filetree\n${markdown}\`\`\`\n`;
}