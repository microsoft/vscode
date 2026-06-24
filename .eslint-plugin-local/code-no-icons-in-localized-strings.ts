/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';

/**
 * Prevents theme icon syntax `$(iconName)` from appearing inside localized
 * string arguments. Localizers may translate or corrupt the icon syntax,
 * breaking rendering. Icon references should be kept outside the localized
 * string - either prepended via concatenation or passed as a placeholder
 * argument.
 *
 * Examples:
 * ❌ localize('key', "$(gear) Settings")
 * ✅ '$(gear) ' + localize('key', "Settings")
 * ✅ localize('key', "Like {0}", '$(gear)')
 *
 * ❌ nls.localize('key', "$(loading~spin) Loading...")
 * ✅ '$(loading~spin) ' + nls.localize('key', "Loading...")
 */
export default new class NoIconsInLocalizedStrings implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			noIconInLocalizedString: 'Theme icon syntax $(…) should not appear inside localized strings. Move it outside the localize call or pass it as a placeholder argument.'
		},
		docs: {
			description: 'Prevents $(icon) theme icon syntax inside localize() string arguments',
		},
		type: 'problem',
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		// Matches $(iconName) or $(iconName~modifier) but not escaped \$(...)
		const iconPattern = /(?<!\\)\$\([a-zA-Z][\w~-]*\)/;

		function isLocalizeCall(callee: TSESTree.CallExpression['callee']): { isLocalize: boolean; messageArgIndex: number } {
			// Direct localize('key', "message", ...) or localize2('key', "message", ...)
			if (callee.type === 'Identifier' && (callee.name === 'localize' || callee.name === 'localize2')) {
				return { isLocalize: true, messageArgIndex: 1 };
			}

			// nls.localize('key', "message", ...) or *.localize(...)
			if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier' && callee.property.name === 'localize') {
				return { isLocalize: true, messageArgIndex: 1 };
			}

			return { isLocalize: false, messageArgIndex: -1 };
		}

		function getStringValue(node: TSESTree.Node): string | undefined {
			if (node.type === 'Literal' && typeof node.value === 'string') {
				return node.value;
			}
			if (node.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1) {
				return node.quasis[0].value.cooked ?? undefined;
			}
			return undefined;
		}

		function checkCallExpression(node: TSESTree.CallExpression) {
			const { isLocalize, messageArgIndex } = isLocalizeCall(node.callee);
			if (!isLocalize) {
				return;
			}

			// The first argument may be a string key or an object { key, comment }.
			// Adjust the message argument index if the first arg is an object.
			let actualMessageArgIndex = messageArgIndex;
			const firstArg = node.arguments[0];
			if (firstArg && firstArg.type === 'ObjectExpression') {
				// localize({ key: '...', comment: [...] }, "message", ...)
				actualMessageArgIndex = 1;
			}

			const messageArg = node.arguments[actualMessageArgIndex];
			if (!messageArg) {
				return;
			}

			const messageValue = getStringValue(messageArg);
			if (messageValue !== undefined && iconPattern.test(messageValue)) {
				context.report({
					node: messageArg,
					messageId: 'noIconInLocalizedString'
				});
			}
		}

		return {
			CallExpression: (node: any) => checkCallExpression(node as TSESTree.CallExpression)
		};
	}
};
