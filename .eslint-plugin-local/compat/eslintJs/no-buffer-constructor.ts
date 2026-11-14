/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

/**
 * ESLint's `no-buffer-constructor`: reports calls of `Buffer` with or without `new`, which are deprecated in favor of
 * `Buffer.from()`, `Buffer.alloc()` and `Buffer.allocUnsafe()`.
 */
export default new class NoBufferConstructor implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'problem',
		docs: { description: 'Disallow use of the `Buffer()` constructor' },
		messages: {
			deprecated: '{{expr}} is deprecated. Use Buffer.from(), Buffer.alloc(), or Buffer.allocUnsafe() instead.',
		},
		schema: [],
	};

	create(context: Context): Visitor {
		const check = (node: ESTree.CallExpression | ESTree.NewExpression): void => {
			if (node.callee.type === 'Identifier' && node.callee.name === 'Buffer') {
				context.report({
					node,
					messageId: 'deprecated',
					data: { expr: node.type === 'CallExpression' ? 'Buffer()' : 'new Buffer()' },
				});
			}
		};
		return {
			CallExpression: check,
			NewExpression: check,
		};
	}
};
