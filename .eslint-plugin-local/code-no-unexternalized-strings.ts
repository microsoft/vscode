/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

function isStringLiteral(node: ESTree.Node | null | undefined): node is ESTree.StringLiteral {
	return !!node && node.type === 'Literal' && typeof node.value === 'string';
}

function isDoubleQuoted(node: ESTree.StringLiteral): boolean {
	const raw = node.raw;
	return raw !== null && raw[0] === '"' && raw[raw.length - 1] === '"';
}

/**
 * Enable bulk fixing double-quoted strings to single-quoted strings with the --fix eslint flag
 *
 * Disabled by default as this is often not the desired fix. Instead the string should be localized. However it is
 * useful for bulk conversations of existing code.
 */
const enableDoubleToSingleQuoteFixes = false;


export default new class NoUnexternalizedStrings implements CreateRule {

	private static _rNlsKeys = /^[_a-zA-Z0-9][ .\-_a-zA-Z0-9]*$/;

	readonly meta: RuleMeta = {
		messages: {
			doubleQuoted: 'Only use double-quoted strings for externalized strings.',
			badKey: 'The key \'{{key}}\' doesn\'t conform to a valid localize identifier.',
			duplicateKey: 'Duplicate key \'{{key}}\' with different message value.',
			badMessage: 'Message argument to \'{{message}}\' must be a string literal.'
		},
		schema: false,
		fixable: enableDoubleToSingleQuoteFixes ? 'code' : undefined,
	};

	create(context: Context): Visitor {

		const externalizedStringLiterals = new Map<string, { call: ESTree.CallExpression; message: ESTree.Node }[]>();
		const doubleQuotedStringLiterals = new Set<ESTree.Node>();

		function collectDoubleQuotedStrings(node: ESTree.Node) {
			if (isStringLiteral(node) && isDoubleQuoted(node)) {
				doubleQuotedStringLiterals.add(node);
			}
		}

		function visitLocalizeCall(node: ESTree.CallExpression) {

			// localize(key, message)
			const [keyNode, messageNode] = node.arguments;

			// (1)
			// extract key so that it can be checked later
			let key: string | undefined;
			if (isStringLiteral(keyNode)) {
				doubleQuotedStringLiterals.delete(keyNode);
				key = keyNode.value;

			} else if (keyNode.type === 'TemplateLiteral' && keyNode.expressions.length === 0 && keyNode.quasis.length === 1) {
				key = keyNode.quasis[0].value.cooked ?? undefined;

			} else if (keyNode.type === 'ObjectExpression') {
				for (const property of keyNode.properties) {
					if (property.type === 'Property' && !property.computed) {
						if (property.key.type === 'Identifier' && property.key.name === 'key') {
							if (isStringLiteral(property.value)) {
								doubleQuotedStringLiterals.delete(property.value);
								key = property.value.value;
								break;
							} else if (property.value.type === 'TemplateLiteral' && property.value.expressions.length === 0 && property.value.quasis.length === 1) {
								key = property.value.quasis[0].value.cooked ?? undefined;
								break;
							}
						}
					}
				}
			}
			if (typeof key === 'string') {
				let array = externalizedStringLiterals.get(key);
				if (!array) {
					array = [];
					externalizedStringLiterals.set(key, array);
				}
				array.push({ call: node, message: messageNode });
			}

			// (2)
			// remove message-argument from doubleQuoted list and make
			// sure it is a string-literal
			doubleQuotedStringLiterals.delete(messageNode);
			if (!isStringLiteral(messageNode)) {
				context.report({
					loc: messageNode.loc,
					messageId: 'badMessage',
					data: { message: context.sourceCode.getText(node) }
				});
			}
		}

		function visitL10NCall(node: ESTree.CallExpression) {

			// localize(key, message)
			const [messageNode] = node.arguments;			// remove message-argument from doubleQuoted list and make
			// sure it is a string-literal
			if (isStringLiteral(messageNode)) {
				doubleQuotedStringLiterals.delete(messageNode);
			} else if (messageNode.type === 'ObjectExpression') {
				for (const prop of messageNode.properties) {
					if (prop.type === 'Property') {
						if (prop.key.type === 'Identifier' && prop.key.name === 'message') {
							doubleQuotedStringLiterals.delete(prop.value);
							break;
						}
					}
				}
			}
		}

		function reportBadStringsAndBadKeys() {
			// (1)
			// report all strings that are in double quotes
			for (const node of doubleQuotedStringLiterals) {
				context.report({
					loc: node.loc,
					messageId: 'doubleQuoted',
					fix: enableDoubleToSingleQuoteFixes ? (fixer) => {
						// Get the raw string content, unescaping any escaped quotes
						const content = (node as ESTree.StringLiteral).raw!
							.slice(1, -1)
							.replace(/(?<!\\)\\'/g, `'`)
							.replace(/(?<!\\)\\"/g, `"`);

						// If the escaped content contains a single quote, use template string instead
						if (content.includes(`'`)
							&& !content.includes('${') // Unless the content has a template expressions
							&& !content.includes('`') // Or backticks which would need escaping
						) {
							const templateStr = `\`${content}\``;
							return fixer.replaceText(node, templateStr);
						}

						// Otherwise prefer using a single-quoted string
						const singleStr = `'${content.replace(/'/g, `\\'`)}'`;
						return fixer.replaceText(node, singleStr);
					} : undefined
				});
			}

			for (const [key, values] of externalizedStringLiterals) {

				// (2)
				// report all invalid NLS keys
				if (!key.match(NoUnexternalizedStrings._rNlsKeys)) {
					for (const value of values) {
						context.report({ loc: value.call.loc, messageId: 'badKey', data: { key } });
					}
				}

				// (2)
				// report all invalid duplicates (same key, different message)
				if (values.length > 1) {
					for (let i = 1; i < values.length; i++) {
						if (context.sourceCode.getText(values[i - 1].message) !== context.sourceCode.getText(values[i].message)) {
							context.report({ loc: values[i].call.loc, messageId: 'duplicateKey', data: { key } });
						}
					}
				}
			}
		}

		function getName(node: ESTree.Node): string | undefined {
			return 'name' in node && typeof node.name === 'string' ? node.name : undefined;
		}

		function visitCallExpression(node: ESTree.CallExpression) {
			const callee = node.callee;
			if (callee.type === 'MemberExpression') {
				const objectName = getName(callee.object);
				const propertyName = getName(callee.property);
				if (objectName === 'nls' && (propertyName === 'localize' || propertyName === 'localize2')) {
					// nls.localize(...), nls.localize2(...)
					visitLocalizeCall(node);
				} else if (propertyName === 't' && (objectName === 'l10n' || ('property' in callee.object && getName(callee.object.property) === 'l10n'))) {
					// l10n.t(...), vscode.l10n.t(...)
					visitL10NCall(node);
				}
			} else {
				// localize(...), localize2(...)
				const calleeName = getName(callee);
				if ((calleeName === 'localize' || calleeName === 'localize2') && node.arguments.length >= 2) {
					visitLocalizeCall(node);
				}
			}
		}

		return {
			['Literal']: (node: ESTree.Node) => collectDoubleQuotedStrings(node),
			['ExpressionStatement:exit']: (node: ESTree.ExpressionStatement) => {
				if (typeof node.directive === 'string') {
					doubleQuotedStringLiterals.delete(node.expression);
				}
			},
			['CallExpression:exit']: (node: ESTree.CallExpression) => visitCallExpression(node),
			['Program:exit']: reportBadStringsAndBadKeys,
		};
	}
};
