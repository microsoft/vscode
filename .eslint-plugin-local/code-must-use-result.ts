/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';

const VALID_USES = new Set<TSESTree.AST_NODE_TYPES | undefined>([
	TSESTree.AST_NODE_TYPES.AwaitExpression,
	TSESTree.AST_NODE_TYPES.VariableDeclarator,
]);

export = new class MustUseResults implements eslint.Rule.RuleModule {
	readonly meta: eslint.Rule.RuleMetaData = {
		schema: false
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		const config = <{ message: string; functions: string[] }[]>context.options[0];
		const listener: eslint.Rule.RuleListener = {};

		for (const { message, functions } of config) {
			for (const fn of functions) {
				const query = `CallExpression[callee.property.name='${fn}'], CallExpression[callee.name='${fn}']`;
				listener[query] = (node: any) => {
					const cast: TSESTree.CallExpression = node;
					if (!VALID_USES.has(cast.parent?.type)) {
						context.report({ node, message });
					}
				};
			}
		}

		return listener;
	}
};
