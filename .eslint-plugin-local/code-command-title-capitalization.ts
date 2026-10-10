/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import * as eslint from 'eslint';
import type * as ESTree from 'estree';

/**
 * Validates that command titles follow Microsoft title-style capitalization guidelines.
 *
 * This rule applies to localize() and localize2() function calls and ensures that:
 * - Articles (a, an, the) are lowercase unless first or last word
 * - Prepositions of 4 or fewer letters (to, for, with, at, by, in, of, on, up, as, etc.) are lowercase unless first or last word
 * - Conjunctions (and, but, or, nor, yet, so) are lowercase unless first or last word
 * - All other words are capitalized (first letter uppercase, rest lowercase)
 * - Hyphenated words: each part is capitalized unless it's a lowercase word and not the first/last part of the entire title
 *
 * Examples:
 * ✅ localize('key', 'Open File')
 * ✅ localize('key', 'Go to Line') // "to" is lowercase (not first/last word)
 * ✅ localize('key', 'Save As') // "As" is last word, capitalized
 * ✅ localize('key', 'Open the File') // "the" is lowercase (not first/last word)
 * ✅ localize('key', 'Self-Paced Training') // both parts of hyphenated word capitalized
 * ❌ localize('key', 'Open file') // "file" should be capitalized
 * ❌ localize('key', 'Go To Line') // "To" should be lowercase
 * ❌ localize('key', 'Format The Document') // "The" should be lowercase
 * ❌ localize('key', 'Self-paced Training') // "paced" should be capitalized
 *
 * Reference: https://learn.microsoft.com/en-us/style-guide/capitalization#title-style-capitalization
 */

function isStringLiteral(node: TSESTree.Node | ESTree.Node | null | undefined): node is TSESTree.StringLiteral {
	return !!node && node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string';
}

/**
 * Words that should not be capitalized unless they are the first or last word.
 * Based on Microsoft style guide: https://learn.microsoft.com/en-us/style-guide/capitalization#title-style-capitalization
 * Includes:
 * - Articles (a, an, the)
 * - Prepositions of 4 or fewer letters (to, for, with, at, by, in, of, on, up, as, etc.)
 * - Conjunctions (and, but, or, nor, yet, so)
 */
const LOWERCASE_WORDS = new Set([
	// Articles
	'a', 'an', 'the',
	// Prepositions of 4 or fewer letters
	'to', 'for', 'with', 'at', 'by', 'in', 'of', 'on', 'up', 'as',
	// Conjunctions
	'and', 'but', 'or', 'nor', 'yet', 'so'
]);

function isLowercaseWord(word: string): boolean {
	return LOWERCASE_WORDS.has(word.toLowerCase());
}

interface ValidationResult {
	valid: boolean;
	error?: string;
}

function isValidTitleCase(text: string): ValidationResult {
	const words = text.trim().split(/\s+/).filter(Boolean);

	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		if (!word) continue;

		const isFirstWord = i === 0;
		const isLastWord = i === words.length - 1;

		// Handle hyphenated words by processing each part
		if (word.includes('-')) {
			const parts = word.split('-');
			const capitalizedParts: string[] = [];

			for (let j = 0; j < parts.length; j++) {
				const part = parts[j];
				if (!part) continue;

				const isFirstPart = j === 0;
				const isLastPart = j === parts.length - 1;
				const isPartFirstWord = isFirstWord && isFirstPart;
				const isPartLastWord = isLastWord && isLastPart;
				const lowerPart = part.toLowerCase();

				// Check if this part should be lowercase
				if (isLowercaseWord(lowerPart) && !isPartFirstWord && !isPartLastWord) {
					// Part should be lowercase
					capitalizedParts.push(lowerPart);
				} else {
					// Part should be capitalized (normalize to first letter uppercase, rest lowercase)
					const expectedCapitalized = lowerPart.charAt(0).toUpperCase() + lowerPart.slice(1);
					if (part !== expectedCapitalized) {
						return {
							valid: false,
							error: `Word "${word}" part "${part}" should be capitalized as "${expectedCapitalized}"`
						};
					}
					capitalizedParts.push(expectedCapitalized);
				}
			}

			const expectedWord = capitalizedParts.join('-');
			if (word !== expectedWord) {
				return {
					valid: false,
					error: `Word "${word}" should be capitalized as "${expectedWord}"`
				};
			}
		} else {
			// Handle non-hyphenated words
			const lowerWord = word.toLowerCase();

			// Check if this is a word that shouldn't be capitalized
			if (isLowercaseWord(lowerWord) && !isFirstWord && !isLastWord) {
				// Word should be lowercase
				if (word !== lowerWord) {
					return {
						valid: false,
						error: `Word "${word}" should be lowercase when not first or last word`
					};
				}
			} else {
				// Non-exempt words should be capitalized (normalize to first letter uppercase, rest lowercase)
				const expectedCapitalized = lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
				if (word !== expectedCapitalized) {
					return {
						valid: false,
						error: `Word "${word}" should be capitalized as "${expectedCapitalized}"`
					};
				}
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
		docs: {
			description: 'Validates that command titles follow Microsoft title-style capitalization guidelines',
		},
		type: 'suggestion',
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
						const isMessageKey = (property.key.type === AST_NODE_TYPES.Identifier && property.key.name === 'message') ||
							(isStringLiteral(property.key) && String(property.key.value) === 'message');
						if (isMessageKey) {
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
						node: messageNode,
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
