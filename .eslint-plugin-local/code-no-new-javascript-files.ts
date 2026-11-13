/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, RuleMeta, Visitor } from '@oxlint/plugins';

export default new class NoNewJavaScriptFiles implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'problem',
		schema: [],
		messages: {
			noNewJsFiles: 'New JavaScript files are not allowed. Use TypeScript (.ts) instead.'
		}
	};

	create(context: Context): Visitor {
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
