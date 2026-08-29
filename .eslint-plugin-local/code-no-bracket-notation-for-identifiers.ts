/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';

/**
 * Disallow bracket notation for accessing properties that are valid identifiers,
 * especially private members (starting with underscore). Bracket notation should
 * only be used for properties with special characters or computed property names.
 *
 * Bad:  obj['_privateMember']
 * Bad:  obj['normalProperty']
 * Good: obj._privateMember  // TypeScript will catch private access
 * Good: obj.normalProperty
 * Good: obj['property-with-dashes']
 * Good: obj[computedKey]
 */
export default new class NoBracketNotationForIdentifiers implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		type: 'problem',
		docs: {
			description: 'Disallow bracket notation for accessing properties that are valid identifiers'
		},
		messages: {
			noBracketNotation: 'Use dot notation instead of bracket notation for property \'{{property}}\'. Bracket notation bypasses TypeScript\'s type checking and access modifiers.'
		},
		schema: [],
		fixable: 'code'
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		/**
		 * Check if a string is a valid JavaScript identifier
		 */
		function isValidIdentifier(str: string): boolean {
			// Check if it's a valid JavaScript identifier
			// Must start with letter, underscore, or dollar sign
			// Can contain letters, digits, underscores, or dollar signs
			return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
		}

		return {
			MemberExpression(node: any) {
				const memberExpr = node as TSESTree.MemberExpression;

				// Only check computed member expressions (bracket notation)
				if (!memberExpr.computed) {
					return;
				}

				// Only check string literals in brackets
				if (memberExpr.property.type !== 'Literal' || typeof memberExpr.property.value !== 'string') {
					return;
				}

				const propertyName = memberExpr.property.value;

				// If it's a valid identifier, report it
				if (isValidIdentifier(propertyName)) {
					context.report({
						node: memberExpr.property,
						messageId: 'noBracketNotation',
						data: {
							property: propertyName
						},
						fix(fixer) {
							const property = memberExpr.property as unknown as eslint.Rule.Node;
							const leftBracket = context.sourceCode.getTokenBefore(property);
							const rightBracket = context.sourceCode.getTokenAfter(property);
							if (leftBracket?.value !== '[' || rightBracket?.value !== ']') {
								return null;
							}

							return fixer.replaceTextRange(
								[leftBracket.range[0], rightBracket.range[1]],
								`${memberExpr.optional ? '' : '.'}${propertyName}`
							);
						}
					});
				}
			}
		};
	}
};
