/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';

/**
 * Checks for potentially unsafe usage of `DisposableStore` / `MutableDisposable`.
 *
 * These have been the source of leaks in the past.
 */
export default new class implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		function checkVariableDeclaration(inNode: ESTree.Node) {
			context.report({
				node: inNode,
				message: `Use const for 'DisposableStore' to avoid leaks by accidental reassignment.`
			});
		}

		function checkProperty(inNode: ESTree.Node) {
			context.report({
				node: inNode,
				message: `Use readonly for DisposableStore/MutableDisposable to avoid leaks through accidental reassignment.`
			});
		}

		return {
			'VariableDeclaration[kind!="const"] > VariableDeclarator > NewExpression[callee.name="DisposableStore"]': checkVariableDeclaration,

			'PropertyDefinition[readonly!=true][typeAnnotation.typeAnnotation.typeName.name=/DisposableStore|MutableDisposable/]': checkProperty,
			'PropertyDefinition[readonly!=true] > NewExpression[callee.name=/DisposableStore|MutableDisposable/]': checkProperty,
		};
	}
};
