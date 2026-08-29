/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';

/**
 * Ensures that localization keys in policy blocks match the keys used in nls.localize() calls.
 *
 * For example, in a policy block with:
 * ```
 * localization: {
 *   description: {
 *     key: 'autoApprove2.description',
 *     value: nls.localize('autoApprove2.description', '...')
 *   }
 * }
 * ```
 *
 * The key property ('autoApprove2.description') must match the first argument
 * to nls.localize() ('autoApprove2.description').
 */
export default new class PolicyLocalizationKeyMatch implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			mismatch: 'Localization key "{{keyValue}}" does not match the key used in nls.localize("{{localizeKey}}", ...). They must be identical.'
		},
		docs: {
			description: 'Ensures that localization keys in policy blocks match the keys used in nls.localize() calls',
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		function checkLocalizationObject(node: ESTree.ObjectExpression) {
			// Look for objects with structure: { key: '...', value: nls.localize('...', '...') }

			let keyProperty: ESTree.Property | undefined;
			let valueProperty: ESTree.Property | undefined;

			for (const property of node.properties) {
				if (property.type !== 'Property') {
					continue;
				}

				const propertyKey = property.key;
				if (propertyKey.type === 'Identifier') {
					if (propertyKey.name === 'key') {
						keyProperty = property;
					} else if (propertyKey.name === 'value') {
						valueProperty = property;
					}
				}
			}

			if (!keyProperty || !valueProperty) {
				return;
			}

			// Extract the key value (should be a string literal)
			let keyValue: string | undefined;
			if (keyProperty.value.type === 'Literal' && typeof keyProperty.value.value === 'string') {
				keyValue = keyProperty.value.value;
			}

			if (!keyValue) {
				return;
			}

			// Check if value is a call to localize or any namespace's localize method
			if (valueProperty.value.type === 'CallExpression') {
				const callee = valueProperty.value.callee;

				// Check if it's <anything>.localize or just localize
				let isLocalizeCall = false;
				if (callee.type === 'MemberExpression') {
					const object = callee.object;
					const property = callee.property;
					if (object.type === 'Identifier' &&
						property.type === 'Identifier' && property.name === 'localize') {
						isLocalizeCall = true;
					}
				} else if (callee.type === 'Identifier' && callee.name === 'localize') {
					// Direct localize() call
					isLocalizeCall = true;
				}

				if (isLocalizeCall) {
					// Get the first argument to localize (the key)
					const args = valueProperty.value.arguments;
					if (args.length > 0) {
						const firstArg = args[0];
						if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
							const localizeKey = firstArg.value;

							// Compare the keys
							if (keyValue !== localizeKey) {
								context.report({
									node: keyProperty.value,
									messageId: 'mismatch',
									data: {
										keyValue,
										localizeKey
									}
								});
							}
						}
					}
				}
			}
		}

		function isInPolicyBlock(node: ESTree.Node): boolean {
			// Walk up the AST to see if we're inside a policy object
			const ancestors = context.sourceCode.getAncestors(node);

			for (const ancestor of ancestors) {
				if (ancestor.type === 'Property') {
					// eslint-disable-next-line local/code-no-any-casts
					const property = ancestor as any;
					if (property.key && property.key.type === 'Identifier' && property.key.name === 'policy') {
						return true;
					}
				}
			}

			return false;
		}

		return {
			'ObjectExpression': (node: ESTree.ObjectExpression) => {
				// Only check objects inside policy blocks
				if (!isInPolicyBlock(node)) {
					return;
				}

				// Check if this object has the pattern we're looking for
				checkLocalizationObject(node);
			}
		};
	}
};
