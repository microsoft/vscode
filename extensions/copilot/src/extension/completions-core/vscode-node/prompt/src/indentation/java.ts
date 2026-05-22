/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IndentationTree, isBlank } from './classes';
import { visitTree } from './manipulation';
import {
	LabelRule,
	buildLabelRules,
	combineClosersAndOpeners,
	flattenVirtual,
	labelLines,
	labelVirtualInherited,
} from './parsing';

/**
 * Java labels.
 *
 *  * package: A package declaration;
 *  * import: An import stament
 *  * comment_single: Single-line comments starting with //
 *  * comment_multi: Multi-line comments starting with /*, or a vnode of
 *    multiple single-line comments.
 *  * annotation: A line starting with "@". Note that fields are habitually
 *    declared on one line, even if they have an annotation. In this case, the
 *    field will have the label "annotation" rather than "member".
 *  * closeBrace: A closing brace alone on a line.
 *  * member: Anything inside a class or interface that does not have a more
 *    specific label.
 */
const _javaLabelRules = {
	package: /^package /,
	import: /^import /,
	class: /\bclass /,
	interface: /\binterface /,
	javadoc: /^\/\*\*/,
	comment_multi: /^\/\*[^*]/,
	comment_single: /^\/\//,
	annotation: /^@/,
	opener: /^[[({]/,
	closer: /^[\])}]/,
} as const;
const javaLabelRules: LabelRule<string>[] = buildLabelRules(_javaLabelRules);

/**
 * processJava(parseRaw(text)) is supposed to serve as superior alternative to alternative parseTree(text, "generic")
 */
export function processJava<L>(originalTree: IndentationTree<L>): IndentationTree<L | string> {
	let tree = originalTree as IndentationTree<L | string>;
	labelLines(tree, javaLabelRules);
	tree = combineClosersAndOpeners(tree);
	tree = flattenVirtual(tree);
	labelVirtualInherited(tree);
	// Label all non-labelled subs of class and interface as member.
	// We also relabel annotations that are direct subs of class or interface as
	// member.
	visitTree(
		tree,
		(tree: IndentationTree<L | string>) => {
			if (tree.label === 'class' || tree.label === 'interface') {
				for (const sub of tree.subs) {
					if (!isBlank(sub) && (sub.label === undefined || sub.label === 'annotation')) {
						sub.label = 'member';
					}
				}
			}
		},
		'bottomUp'
	);
	return tree;
}
