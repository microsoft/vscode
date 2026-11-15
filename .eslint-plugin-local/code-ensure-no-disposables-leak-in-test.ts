/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

export default new class EnsureNoDisposablesAreLeakedInTestSuite implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'problem',
		messages: {
			ensure: 'Suites should include a call to `ensureNoDisposablesAreLeakedInTestSuite()` to ensure no disposables are leaked in tests.'
		},
		fixable: 'code',
		schema: false,
	};

	create(context: Context): Visitor {
		const config = context.options[0] as { exclude: string[] };

		const needle = context.filename.replace(/\\/g, '/');
		if (config.exclude.some((e) => needle.endsWith(e))) {
			return {};
		}

		return {
			[`Program > ExpressionStatement > CallExpression[callee.name='suite']`]: (node: ESTree.Node) => {
				const src = context.sourceCode.getText(node);
				if (!src.includes('ensureNoDisposablesAreLeakedInTestSuite(')) {
					context.report({
						node,
						messageId: 'ensure',
						fix: (fixer) => {
							const updatedSrc = src.replace(/(suite\(.*\n)/, '$1\n\tensureNoDisposablesAreLeakedInTestSuite();\n');
							return fixer.replaceText(node, updatedSrc);
						}
					});
				}
			},
		};
	}
};
