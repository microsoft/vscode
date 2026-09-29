/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';

/**
 * Disallows `declare const enum` declarations. esbuild does not inline
 * `declare const enum` values, leaving the enum identifier in the output
 * which causes a ReferenceError at runtime.
 *
 * Use `const enum` (without `declare`) instead.
 *
 * See https://github.com/evanw/esbuild/issues/4394
 */
export default new class NoDeclareConstEnum implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			noDeclareConstEnum: '"declare const enum" is not supported by esbuild. Use "const enum" instead. See https://github.com/evanw/esbuild/issues/4394',
		},
		schema: false,
		fixable: 'code',
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			TSEnumDeclaration(node: any) {
				if (node.const && node.declare) {
					context.report({
						node,
						messageId: 'noDeclareConstEnum',
						fix: (fixer) => {
							// Remove "declare " from "declare const enum"
							const sourceCode = context.sourceCode;
							const text = sourceCode.getText(node);
							const declareIndex = text.indexOf('declare');
							if (declareIndex !== -1) {
								return fixer.removeRange([
									node.range[0] + declareIndex,
									node.range[0] + declareIndex + 'declare '.length
								]);
							}
							return null;
						}
					});
				}
			}
		};
	}
};
