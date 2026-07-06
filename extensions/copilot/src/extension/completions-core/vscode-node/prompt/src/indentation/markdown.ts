/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IndentationTree, isBlank, LineNode, TopNode, VirtualNode } from './classes';
import {
	buildLabelRules,
	flattenVirtual,
	groupBlocks,
	labelLines,
	LabelRule,
	labelVirtualInherited,
} from './parsing';

/**

 */
const _MarkdownLabelRules = {
	heading: /^# /,
	subheading: /^## /,
	subsubheading: /### /,
} as const;
const MarkdownLabelRules: LabelRule<string>[] = buildLabelRules(_MarkdownLabelRules);

/**
 * processMarkdown(parseRaw(text)) is supposed to serve as a superior alternative to parseTree(text, "generic")
 */
export function processMarkdown<L>(originalTree: IndentationTree<L>): IndentationTree<L | string> {
	let tree = originalTree as IndentationTree<L | string>;
	labelLines(tree, MarkdownLabelRules);

	// We'll want to refer to the tree's subs, so let the type checker know it won't be blank
	if (isBlank(tree)) {
		return tree;
	}

	// the top level is ordered according to headings / subheadings / subsubheadings
	function headingLevel(sub: IndentationTree<L | string>): number | undefined {
		// 0 is the tree itself, so we start at 1
		if (sub.label === 'heading') { return 1; }
		if (sub.label === 'subheading') { return 2; }
		if (sub.label === 'subsubheading') { return 3; }
		return undefined;
	}
	const currentHierarchy: (TopNode<L | string> | LineNode<L | string> | VirtualNode<L | string>)[] = [tree];
	const oldTreeSubs = [...tree.subs];
	tree.subs = [];
	for (const sub of oldTreeSubs) {
		const level = headingLevel(sub);
		if (level === undefined || isBlank(sub)) {
			currentHierarchy[currentHierarchy.length - 1].subs.push(sub);
		} else {
			// take care of "dangling" levels, e.g. if we have a subsubheading after a heading
			while (currentHierarchy.length < level) {
				currentHierarchy.push(currentHierarchy[currentHierarchy.length - 1]);
			}
			// add this to the parent
			currentHierarchy[level - 1].subs.push(sub);
			// make this the tip of the hierarchy
			currentHierarchy[level] = sub;
			// delete all higher levels
			while (currentHierarchy.length > level + 1) {
				currentHierarchy.pop();
			}
		}
	}

	// now group paragraphs
	tree = groupBlocks(tree);
	tree = flattenVirtual(tree);
	labelVirtualInherited(tree);

	return tree;
}
