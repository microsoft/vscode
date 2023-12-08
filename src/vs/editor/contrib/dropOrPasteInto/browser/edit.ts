/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { DropYieldTo, WorkspaceEdit } from 'vs/editor/common/languages';
import { Range } from 'vs/editor/common/core/range';

export interface DropOrPasteEdit {
	readonly label: string;
	readonly insertText: string | { readonly snippet: string };
	readonly additionalEdit?: WorkspaceEdit;
}

export function createCombinedWorkspaceEdit(uri: URI, ranges: readonly Range[], edit: DropOrPasteEdit): WorkspaceEdit {
	return {
		edits: [
			...ranges.map(range =>
				new ResourceTextEdit(uri,
					typeof edit.insertText === 'string'
						? { range, text: edit.insertText, insertAsSnippet: false }
						: { range, text: edit.insertText.snippet, insertAsSnippet: true }
				)),
			...(edit.additionalEdit?.edits ?? [])
		]
	};
}

export function sortEditsByYieldTo<T extends {
	readonly providerId: string | undefined;
	readonly handledMimeType?: string;
	readonly yieldTo?: readonly DropYieldTo[];
}>(edits: readonly T[]): T[] {
	function yieldsTo(yTo: DropYieldTo, other: T): boolean {
		return ('providerId' in yTo && yTo.providerId === other.providerId)
			|| ('mimeType' in yTo && yTo.mimeType === other.handledMimeType);
	}

	// Build list of nodes each node yields to
	const yieldsToMap = new Map<T, T[]>();
	for (const edit of edits) {
		for (const yTo of edit.yieldTo ?? []) {
			for (const other of edits) {
				if (other === edit) {
					continue;
				}

				if (yieldsTo(yTo, other)) {
					let arr = yieldsToMap.get(edit);
					if (!arr) {
						arr = [];
						yieldsToMap.set(edit, arr);
					}
					arr.push(other);
				}
			}
		}
	}

	if (!yieldsToMap.size) {
		return Array.from(edits);
	}

	// Topological sort
	const visited = new Set<T>();
	const tempStack: T[] = [];

	function visit(nodes: T[]): T[] {
		if (!nodes.length) {
			return [];
		}

		const node = nodes[0];
		if (tempStack.includes(node)) {
			console.warn(`Yield to cycle detected for ${node.providerId}`);
			return nodes;
		}

		if (visited.has(node)) {
			return visit(nodes.slice(1));
		}

		let pre: T[] = [];
		const yTo = yieldsToMap.get(node);
		if (yTo) {
			tempStack.push(node);
			pre = visit(yTo);
			tempStack.pop();
		}

		visited.add(node);

		return [...pre, node, ...visit(nodes.slice(1))];
	}

	return visit(Array.from(edits));
}
