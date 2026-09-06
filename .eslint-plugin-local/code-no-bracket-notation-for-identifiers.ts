/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';

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
			if (str.includes('\\')) {
				return false;
			}
			const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, str);
			const token = scanner.scan();
			const isIdentifierName = token === ts.SyntaxKind.Identifier
				|| (token >= ts.SyntaxKind.FirstKeyword && token <= ts.SyntaxKind.LastKeyword);
			return isIdentifierName && scanner.getTokenText() === str && scanner.scan() === ts.SyntaxKind.EndOfFileToken;
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
							const hasComments = context.sourceCode
								.getTokensBetween(leftBracket, rightBracket, { includeComments: true })
								.some(token => token.type === 'Block' || token.type === 'Line');
							if (hasComments) {
								return null;
							}

							const bracketFix = fixer.replaceTextRange(
								[leftBracket.range[0], rightBracket.range[1]],
								`${memberExpr.optional ? '' : '.'}${propertyName}`
							);
							if (memberExpr.object.type === 'Literal' && typeof memberExpr.object.value === 'number') {
								const object = memberExpr.object as unknown as eslint.Rule.Node;
								return [
									fixer.insertTextBefore(object, '('),
									fixer.insertTextAfter(object, ')'),
									bracketFix
								];
							}

							return bracketFix;
						}
					});
				}
			}
		};
	}
};
