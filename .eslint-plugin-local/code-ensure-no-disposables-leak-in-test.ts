/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as estree from 'estree';

export default new class EnsureNoDisposablesAreLeakedInTestSuite implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		type: 'problem',
		messages: {
			ensure: 'Suites should include a call to `ensureNoDisposablesAreLeakedInTestSuite()` to ensure no disposables are leaked in tests.'
		},
		fixable: 'code',
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const config = context.options[0] as { exclude: string[] };

		const needle = context.getFilename().replace(/\\/g, '/');
		if (config.exclude.some((e) => needle.endsWith(e))) {
			return {};
		}

		return {
			[`Program > ExpressionStatement > CallExpression[callee.name='suite']`]: (node: estree.Node) => {
				const src = context.getSourceCode().getText(node);
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
