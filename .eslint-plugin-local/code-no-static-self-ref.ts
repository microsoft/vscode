/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, Visitor } from '@oxlint/plugins';

/**
 * WORKAROUND for https://github.com/evanw/esbuild/issues/3823
 */
export default new class implements CreateRule {

	create(context: Context): Visitor {

		function checkProperty(inNode: ESTree.PropertyDefinition) {

			// `getAncestors` returns AST nodes, typed as the base `Node`
			const classDeclaration = (context.sourceCode.getAncestors(inNode) as ESTree.Node[]).find((node): node is ESTree.Class => node.type === 'ClassDeclaration');
			const propertyDefinition = inNode;

			if (!classDeclaration || !classDeclaration.id?.name) {
				return;
			}

			if (!propertyDefinition.value) {
				return;
			}

			const classCtor = classDeclaration.body.body.find(node => node.type === 'MethodDefinition' && node.kind === 'constructor');

			// `classCtor` is always a `MethodDefinition`; this check narrows its type
			if (!classCtor || classCtor.type !== 'MethodDefinition') {
				return;
			}

			const name = classDeclaration.id.name;
			const valueText = context.sourceCode.getText(propertyDefinition.value);

			if (valueText.includes(name + '.')) {
				if (classCtor.value?.type === 'FunctionExpression' && !classCtor.value.params.find(param => param.type === 'TSParameterProperty' && param.decorators?.length > 0)) {
					return;
				}

				context.report({
					loc: propertyDefinition.value.loc,
					message: `Static properties in decorated classes should not reference the class they are defined in. Use 'this' instead. This is a workaround for https://github.com/evanw/esbuild/issues/3823.`
				});
			}

		}

		return {
			'PropertyDefinition[static=true]': checkProperty,
		};
	}
};
