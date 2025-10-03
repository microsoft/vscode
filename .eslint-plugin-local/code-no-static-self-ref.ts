/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';

/**
 * WORKAROUND for https://github.com/evanw/esbuild/issues/3823
 */
export = new class implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		function checkProperty(inNode: any) {

			const classDeclaration = context.sourceCode.getAncestors(inNode).find(node => node.type === 'ClassDeclaration');
			const propertyDefinition = <TSESTree.PropertyDefinition>inNode;

			if (!classDeclaration || !classDeclaration.id?.name) {
				return;
			}

			if (!propertyDefinition.value) {
				return;
			}

			const classCtor = classDeclaration.body.body.find(node => node.type === 'MethodDefinition' && node.kind === 'constructor');

			if (!classCtor) {
				return;
			}

			const name = classDeclaration.id.name;
			// eslint-disable-next-line local/code-no-any-casts
			const valueText = context.sourceCode.getText(<any>propertyDefinition.value);

			if (valueText.includes(name + '.')) {

				if (classCtor.value?.type === 'FunctionExpression' && !classCtor.value.params.find((param: any) => param.type === 'TSParameterProperty' && param.decorators?.length > 0)) {
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
