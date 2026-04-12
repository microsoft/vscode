/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ResourceTextEdit } from '../../../browser/services/bulkEditService.js';
import { SnippetParser } from '../../snippet/browser/snippetParser.js';
/**
 * Given a {@link DropOrPasteEdit} and set of ranges, creates a {@link WorkspaceEdit} that applies the insert text from
 * the {@link DropOrPasteEdit} at each range plus any additional edits.
 */
export function createCombinedWorkspaceEdit(uri, ranges, edit) {
    // If the edit insert text is empty, skip applying at each range
    if (typeof edit.insertText === 'string' ? edit.insertText === '' : edit.insertText.snippet === '') {
        return {
            edits: edit.additionalEdit?.edits ?? []
        };
    }
    return {
        edits: [
            ...ranges.map(range => new ResourceTextEdit(uri, { range, text: typeof edit.insertText === 'string' ? SnippetParser.escape(edit.insertText) + '$0' : edit.insertText.snippet, insertAsSnippet: true })),
            ...(edit.additionalEdit?.edits ?? [])
        ]
    };
}
export function sortEditsByYieldTo(edits) {
    function yieldsTo(yTo, other) {
        if ('mimeType' in yTo) {
            return yTo.mimeType === other.handledMimeType;
        }
        return !!other.kind && yTo.kind.contains(other.kind);
    }
    // Build list of nodes each node yields to
    const yieldsToMap = new Map();
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
    const visited = new Set();
    const tempStack = [];
    function visit(nodes) {
        if (!nodes.length) {
            return [];
        }
        const node = nodes[0];
        if (tempStack.includes(node)) {
            console.warn('Yield to cycle detected', node);
            return nodes;
        }
        if (visited.has(node)) {
            return visit(nodes.slice(1));
        }
        let pre = [];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2VkaXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFHaEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBR3ZFOzs7R0FHRztBQUNILE1BQU0sVUFBVSwyQkFBMkIsQ0FBQyxHQUFRLEVBQUUsTUFBd0IsRUFBRSxJQUEwQztJQUN6SCxnRUFBZ0U7SUFDaEUsSUFBSSxPQUFPLElBQUksQ0FBQyxVQUFVLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEtBQUssRUFBRSxFQUFFLENBQUM7UUFDbkcsT0FBTztZQUNOLEtBQUssRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLEtBQUssSUFBSSxFQUFFO1NBQ3ZDLENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTztRQUNOLEtBQUssRUFBRTtZQUNOLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUNyQixJQUFJLGdCQUFnQixDQUFDLEdBQUcsRUFDdkIsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLE9BQU8sSUFBSSxDQUFDLFVBQVUsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsZUFBZSxFQUFFLElBQUksRUFBRSxDQUNwSixDQUFDO1lBQ0gsR0FBRyxDQUFDLElBQUksQ0FB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