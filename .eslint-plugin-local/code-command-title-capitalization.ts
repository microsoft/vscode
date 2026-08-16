/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import * as eslint from 'eslint';
import type * as ESTree from 'estree';

function isStringLiteral(node: TSESTree.Node | ESTree.Node | null | undefined): node is TSESTree.StringLiteral {
	return !!node && node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string';
}

/**
 * Prepositions of 4 or fewer letters that should not be capitalized unless they are the first or last word.
 * Based on Microsoft style guide: https://learn.microsoft.com/en-us/style-guide/capitalization#title-style-capitalization
 */
const PREPOSITIONS = new Set([
	'to', 'for', 'with', 'at', 'by', 'in', 'of', 'on', 'up', 'as', 'if', 'or', 'and', 'but', 'nor', 'so', 'yet'
]);

function isPreposition(word: string): boolean {
	return PREPOSITIONS.has(word.toLowerCase());
}

interface ValidationResult {
	valid: boolean;
	error?: string;
}

function isValidTitleCase(text: string): ValidationResult {
	const words = text.split(/\s+/);

	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		if (!word) continue;

		const isFirstWord = i === 0;
		const isLastWord = i === words.length - 1;
		const lowerWord = word.toLowerCase();

		// Check if this is a preposition that shouldn't be capitalized
		if (isPreposition(lowerWord) && !isFirstWord && !isLastWord) {
			// Preposition should be lowercase
			if (word !== lowerWord) {
				return {
					valid: false,
					error: `Preposition "${word}" should be lowercase when not first or last word`
				};
			}
		} else {
			// Non-preposition words should be capitalized (first letter uppercase, rest lowercase)
			const expectedCapitalized = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
			if (word !== expectedCapitalized) {
				return {
					valid: false,
					error: `Word "${word}" should be capitalized as "${expectedCapitalized}"`
				};
			}
		}
	}

	return { valid: true };
}

export default new class CommandTitleCapitalization implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			invalidCapitalization: 'Command title "{{title}}" does not follow title-style capitalization: {{error}}'
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		function visitLocalizeCall(node: TSESTree.CallExpression) {
			// localize(key, message) or localize2(key, message)
			const [keyNode, messageNode] = node.arguments;

			if (!messageNode) {
				return;
			}

			let message: string | undefined;

			// Extract message from string literal
			if (isStringLiteral(messageNode)) {
				message = messageNode.value;
			}
			// Extract message from template literal (no expressions)
			else if (messageNode.type === AST_NODE_TYPES.TemplateLiteral &&
				messageNode.expressions.length === 0 &&
				messageNode.quasis.length === 1) {
				message = messageNode.quasis[0].value.cooked ?? undefined;
			}
			// Extract message from object expression
			else if (messageNode.type === AST_NODE_TYPES.ObjectExpression) {
				for (const property of messageNode.properties) {
					if (property.type === AST_NODE_TYPES.Property && !property.computed) {
						if (property.key.type === AST_NODE_TYPES.Identifier && property.key.name === 'message') {
							if (isStringLiteral(property.value)) {
								message = property.value.value;
							} else if (property.value.type === AST_NODE_TYPES.TemplateLiteral &&
								property.value.expressions.length === 0 &&
								property.value.quasis.length === 1) {
								message = property.value.quasis[0].value.cooked ?? undefined;
							}
							break;
						}
					}
				}
			}

			if (message) {
				const validation = isValidTitleCase(message);
				if (!validation.valid) {
					context.report({
						loc: messageNode.loc,
						messageId: 'invalidCapitalization',
						data: {
							title: message,
							error: validation.error
						}
					});
				}
			}
		}

		return {
			// nls.localize(...)
			['CallExpression[callee.type="MemberExpression"][callee.object.name="nls"][callee.property.name="localize"]:exit']: (node: TSESTree.CallExpression) => visitLocalizeCall(node),

			// nls.localize2(...)
			['CallExpression[callee.type="MemberExpression"][callee.object.name="nls"][callee.property.name="localize2"]:exit']: (node: TSESTree.CallExpression) => visitLocalizeCall(node),

			// localize(...)
			['CallExpression[callee.name="localize"][arguments.length>=2]:exit']: (node: TSESTree.CallExpression) => visitLocalizeCall(node),

			// localize2(...)
			['CallExpression[callee.name="localize2"][arguments.length>=2]:exit']: (node: TSESTree.CallExpression) => visitLocalizeCall(node),
		};
	}
};
