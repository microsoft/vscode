/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';

/**
 * Prevents the use of template literals in localization function calls.
 *
 * vscode.l10n.t() and nls.localize() cannot handle string templating.
 * Use placeholders instead: vscode.l10n.t('Message {0}', value)
 *
 * Examples:
 * ❌ vscode.l10n.t(`Message ${value}`)
 * ✅ vscode.l10n.t('Message {0}', value)
 *
 * ❌ nls.localize('key', `Message ${value}`)
 * ✅ nls.localize('key', 'Message {0}', value)
 */
export default new class NoLocalizationTemplateLiterals implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			noTemplateLiteral: 'Template literals cannot be used in localization calls. Use placeholders like {0}, {1} instead.'
		},
		docs: {
			description: 'Prevents template literals in vscode.l10n.t() and nls.localize() calls',
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		function checkCallExpression(node: TSESTree.CallExpression) {
			const callee = node.callee;
			let isLocalizationCall = false;
			let isNlsLocalize = false;

			// Check for vscode.l10n.t()
			if (callee.type === 'MemberExpression') {
				const object = callee.object;
				const property = callee.property;

				// vscode.l10n.t
				if (object.type === 'MemberExpression') {
					const outerObject = object.object;
					const outerProperty = object.property;
					if (outerObject.type === 'Identifier' && outerObject.name === 'vscode' &&
						outerProperty.type === 'Identifier' && outerProperty.name === 'l10n' &&
						property.type === 'Identifier' && property.name === 't') {
						isLocalizationCall = true;
					}
				}

				// l10n.t or nls.localize or any *.localize
				if (object.type === 'Identifier' && property.type === 'Identifier') {
					if (object.name === 'l10n' && property.name === 't') {
						isLocalizationCall = true;
					} else if (property.name === 'localize') {
						isLocalizationCall = true;
						isNlsLocalize = true;
					}
				}
			}

			if (!isLocalizationCall) {
				return;
			}

			// For vscode.l10n.t(message, ...args) - check the first argument (message)
			// For nls.localize(key, message, ...args) - check first two arguments (key and message)
			const argsToCheck = isNlsLocalize ? 2 : 1;
			for (let i = 0; i < argsToCheck && i < node.arguments.length; i++) {
				const arg = node.arguments[i];
				if (arg && arg.type === 'TemplateLiteral' && arg.expressions.length > 0) {
					context.report({
						node: arg,
						messageId: 'noTemplateLiteral'
					});
				}
			}
		}

		return {
			CallExpression: (node: any) => checkCallExpression(node as TSESTree.CallExpression)
		};
	}
};
