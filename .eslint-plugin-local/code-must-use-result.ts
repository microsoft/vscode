/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

const VALID_USES = new Set<ESTree.Node['type'] | undefined>([
	'AwaitExpression',
	'VariableDeclarator',
]);

export default new class MustUseResults implements CreateRule {
	readonly meta: RuleMeta = {
		schema: false
	};

	create(context: Context): Visitor {

		const config = context.options[0] as { message: string; functions: string[] }[];
		const listener: Visitor = {};

		for (const { message, functions } of config) {
			for (const fn of functions) {
				const query = `CallExpression[callee.property.name='${fn}'], CallExpression[callee.name='${fn}']`;
				listener[query] = (node: ESTree.Node) => {
					const callExpression = node as ESTree.CallExpression;
					if (!VALID_USES.has(callExpression.parent?.type)) {
						context.report({ node, message });
					}
				};
			}
		}

		return listener;
	}
};
