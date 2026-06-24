/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TSESTree } from '@typescript-eslint/utils';
import * as eslint from 'eslint';
import type * as ESTree from 'estree';

export default new class NoAsyncSuite implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		function doesCallSuperDispose(node: TSESTree.MethodDefinition) {

			if (!node.override) {
				return;
			}

			const body = context.getSourceCode().getText(node as ESTree.Node);

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
