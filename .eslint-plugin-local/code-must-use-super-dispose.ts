/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, Visitor } from '@oxlint/plugins';

export default new class NoAsyncSuite implements CreateRule {

	create(context: Context): Visitor {
		function doesCallSuperDispose(node: ESTree.MethodDefinition) {

			if (!node.override) {
				return;
			}

			const body = context.sourceCode.getText(node);

			if (body.includes('super.dispose')) {
				return;
			}

			context.report({
				node,
				message: 'dispose() should call super.dispose()'
			});
		}

		return {
			['MethodDefinition[override][key.name="dispose"]']: doesCallSuperDispose,
		};
	}
};
