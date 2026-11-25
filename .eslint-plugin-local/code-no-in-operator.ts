/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

/**
 * Disallows the use of the `in` operator in TypeScript code, except within
 * type predicate functions (functions with `arg is Type` return types).
 *
 * The `in` operator can lead to runtime errors and type safety issues.
 * Consider using Object.hasOwn(), hasOwnProperty(), or other safer patterns.
 *
 * Exception: Type predicate functions are allowed to use the `in` operator
 * since they are the standard way to perform runtime type checking.
 */
export default new class NoInOperator implements CreateRule {

	readonly meta: RuleMeta = {
		messages: {
			noInOperator: 'The "in" operator should not be used. Use type discriminator properties and classes instead or the `hasKey`-utility.',
		},
		schema: false,
	};

	create(context: Context): Visitor {

		function checkInOperator(node: ESTree.BinaryExpression) {
			// Check if we're inside a type predicate function
			// `getAncestors` returns AST nodes, typed as the base `Node`
			const ancestors = context.sourceCode.getAncestors(node) as ESTree.Node[];

			for (const ancestor of ancestors) {
				if (ancestor.type === 'FunctionDeclaration' ||
					ancestor.type === 'FunctionExpression' ||
					ancestor.type === 'ArrowFunctionExpression') {

					// Check if this function has a type predicate return type
					// Type predicates have the form: `arg is SomeType`
					if (ancestor.returnType?.typeAnnotation?.type === 'TSTypePredicate') {
						// This is a type predicate function, allow the "in" operator
						return;
					}
				}
			}

			context.report({
				node,
				messageId: 'noInOperator'
			});
		}

		return {
			['BinaryExpression[operator="in"]']: checkInOperator,
		};
	}
};
