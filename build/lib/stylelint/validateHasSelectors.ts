/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const COMPOUND_BOUNDARY = /[\s,{}>+~]/;
const ROOT_TOKEN_IN_COMPOUND = /(^(body|html)|^:root|\.monaco-workbench)(?![\w-])/;

/**
 * Whether the line contains a `:has()` attached to a compound that anchors on
 * `body`, `html`, `:root` or `.monaco-workbench` - complete tokens only, at any
 * position within the compound (`.style-override.monaco-workbench:has()` counts,
 * `.monaco-workbench .foo:has()` and `.monaco-workbench-like:has()` do not).
 * Such rules make DOM mutations anywhere pay workbench-wide style invalidation
 * (microsoft/vscode#324985).
 */
export function containsRootAnchoredHas(line: string): boolean {
	for (let index = line.indexOf(':has('); index >= 0; index = line.indexOf(':has(', index + 1)) {
		let start = index;
		while (start > 0 && !COMPOUND_BOUNDARY.test(line[start - 1])) {
			start--;
		}
		if (ROOT_TOKEN_IN_COMPOUND.test(line.substring(start, index))) {
			return true;
		}
	}
	return false;
}
