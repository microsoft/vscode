/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';

export default new class MissingTSXLinebreak implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		type: "problem",
		fixable: "code",
		hasSuggestions: true,
	}

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			['JSXText']: (node: any) => {
				let text = node.value;
				if (typeof text !== 'string') {
					return {};
				}
				let jsxText = text;
				let index = node.range[0];

				// Remove leading linebreaks
				const match = jsxText.match(/^\r?\n/);
				if (match) {
					jsxText = jsxText.slice(match[0].length);
					index += match[0].length;
				}

				const errorLocs = [];
				let lastFragment = '';
				let linebreak = jsxText.match(/\r?\n/);
				while (linebreak?.[0]) {
					const linebreakLoc = jsxText.indexOf(linebreak[0]);
					index += linebreakLoc + linebreak[0].length;
					const fragment = jsxText.slice(0, linebreakLoc);
					if (!fragment) {
						break;
					}
					lastFragment = fragment;
					jsxText = jsxText.slice(linebreakLoc + linebreak[0].length);
					errorLocs.push(index - 1);
					linebreak = jsxText.match(/\r?\n/);
				}

				if (errorLocs.length < 2) {
					return; // All text is on one line
				}

				if (lastFragment.trim().length === 0) {
					// Last fragment is whitespace, it might be followed by another JSX element, which we already auto insert linebreaks for
					const nextChild = context.sourceCode.getTokenAfter(node);
					if (!nextChild || nextChild?.value === '<') {
						errorLocs.pop();
					}
				}

				for (const errorLoc of errorLocs) {
					context.report({
						loc: context.sourceCode.getLocFromIndex(errorLoc),
						message: "Use `<br />` linebreak to enforce newline in TSX string literal. Whitespace is removed from TSX during transpilation.",
						fix: (fixer) => {
							return fixer.insertTextAfterRange([errorLoc, errorLoc], '<br />');
						}
					});
				}
			}
		};
	}
};
