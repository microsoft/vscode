/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';

export default new class NoNewJavaScriptFiles implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		type: 'problem',
		schema: [],
		messages: {
			noNewJsFiles: 'New JavaScript files are not allowed. Use TypeScript (.ts) instead.'
		}
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			Program: (node) => {
				context.report({
					node,
					messageId: 'noNewJsFiles'
				});
			}
		};
	}
};
