/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, Visitor } from '@oxlint/plugins';

/**
 * Checks for potentially unsafe usage of `DisposableStore` / `MutableDisposable`.
 *
 * These have been the source of leaks in the past.
 */
export default new class implements CreateRule {

	create(context: Context): Visitor {
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

		const disposableNameRegex = /DisposableStore|MutableDisposable/;

		function getName(node: ESTree.Node | null | undefined): string | undefined {
			return node && 'name' in node && typeof node.name === 'string' ? node.name : undefined;
		}

		function getNewExpressionCalleeName(node: ESTree.Node | null | undefined): string | undefined {
			return node?.type === 'NewExpression' ? getName(node.callee) : undefined;
		}

		return {
			// VariableDeclaration[kind!="const"] > VariableDeclarator > NewExpression[callee.name="DisposableStore"]
			VariableDeclarator: (node: ESTree.VariableDeclarator) => {
				// The parent of a declarator is always a declaration
				if ((node.parent as ESTree.VariableDeclaration).kind !== 'const' && getNewExpressionCalleeName(node.init) === 'DisposableStore') {
					checkVariableDeclaration(node.init!);
				}
			},

			PropertyDefinition: (node: ESTree.PropertyDefinition) => {
				if (node.readonly === true) {
					return;
				}

				// PropertyDefinition[readonly!=true][typeAnnotation.typeAnnotation.typeName.name=/DisposableStore|MutableDisposable/]
				const type = node.typeAnnotation?.typeAnnotation;
				const typeName = type && 'typeName' in type ? getName(type.typeName) : undefined;
				if (typeName !== undefined && disposableNameRegex.test(typeName)) {
					checkProperty(node);
				}

				// PropertyDefinition[readonly!=true] > NewExpression[callee.name=/DisposableStore|MutableDisposable/]
				for (const child of [node.key, node.value]) {
					const calleeName = getNewExpressionCalleeName(child);
					if (calleeName !== undefined && disposableNameRegex.test(calleeName)) {
						checkProperty(child!);
					}
				}
			},
		};
	}
};
