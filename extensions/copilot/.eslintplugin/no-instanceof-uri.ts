/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';

export default new class NoInstanceofUri implements eslint.Rule.RuleModule {
	readonly meta: eslint.Rule.RuleMetaData = {
		type: "problem",
		fixable: "code",
		docs: {
			description: "Disallow using 'instanceof URI', use 'URI.isURI' instead",
		},
		messages: {
			noInstanceofURI: "Use 'URI.isUri()' instead of 'instanceof URI'. 'instanceof' is an issue because there are multiple URI classes in this codebase."
		}
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			BinaryExpression(node: any) {
				if (node.operator === 'instanceof' &&
					node.right.type === 'Identifier' &&
					node.right.name.toUpperCase() === 'URI') {
					context.report({
						node,
						messageId: 'noInstanceofURI',
						fix: (fixer) => {
							return fixer.replaceText(node, `URI.isUri(${context.sourceCode.getText(node.left)})`);
						}
					});
				}
			}
		};
	}
};