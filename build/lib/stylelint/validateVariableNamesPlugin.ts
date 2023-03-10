/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const stylelint = require('stylelint');
import { PostcssResult, Rule } from 'stylelint';
import type { Root } from 'stylelint/node_modules/postcss';

import { IValidator, getVariableNameValidator } from './validateVariableNames';

const ruleName = 'vscode/variables-validate-names';
const messages = stylelint.utils.ruleMessages(ruleName, {
	expected: 'Unknown CSS variable'
});

type StylelintPlugin<P = unknown, S = unknown> = Rule<P, S>;

const ruleFunction: StylelintPlugin<void, void> = () => {
	let sharedValidator: IValidator | undefined;
	return async (root: Root, result: PostcssResult) => {
		const validator = sharedValidator || await getVariableNameValidator();
		root.walkDecls(decl => {
			validator(decl.value, variableName => {
				stylelint.utils.report({
					message: `Unknown CSS variable ${variableName}`,
					node: decl,
					result,
					ruleName
				});
			});
		});
	};
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;

module.exports = stylelint.createPlugin(ruleName, ruleFunction);
