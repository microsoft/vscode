/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/experimental-utils';
import * as ESTree from 'estree';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const _positiveLookBehind = /\(\?<=.+/;
const _negativeLookBehind = /\(\?<!.+/;

function _containsLookBehind(pattern: string | unknown): boolean {
	if (typeof pattern !== 'string') {
		return false;
	}
	return _positiveLookBehind.test(pattern) || _negativeLookBehind.test(pattern);
}

module.exports = {

	create(context: eslint.Rule.RuleContext) {
		return {
			// /.../
			['Literal[regex]']: (node: any) => {
				type RegexLiteral = TSESTree.Literal & { regex: { pattern: string; flags: string } };
				const pattern = (<RegexLiteral>node).regex?.pattern;
				if (_containsLookBehind(pattern)) {
					context.report({
						node,
						message: 'Look behind assertions are not yet supported in all browsers'
					});
				}
			},
			// new Regex("...")
			['NewExpression[callee.name="RegExp"] Literal']: (node: ESTree.Literal) => {
				if (_containsLookBehind(node.value)) {
					context.report({
						node,
						message: 'Look behind assertions are not yet supported in all browsers'
					});
				}
			}
		};
	}
};
