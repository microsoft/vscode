/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

export default new class ApiLiteralOrTypes implements CreateRule {

	readonly meta: RuleMeta = {
		docs: { url: 'https://github.com/microsoft/vscode/wiki/Extension-API-guidelines#creating-objects' },
		messages: { sync: '`createXYZ`-functions are constructor-replacements and therefore must return sync', },
		schema: false,
	};

	create(context: Context): Visitor {

		return {
			['TSDeclareFunction Identifier[name=/create.*/]']: (node: ESTree.Node) => {

				const decl = node.parent as ESTree.Function;

				if (decl.returnType?.typeAnnotation.type !== 'TSTypeReference') {
					return;
				}
				if (decl.returnType.typeAnnotation.typeName.type !== 'Identifier') {
					return;
				}

				const ident = decl.returnType.typeAnnotation.typeName.name;
				if (ident === 'Promise' || ident === 'Thenable') {
					context.report({
						node,
						messageId: 'sync'
					});
				}
			}
		};
	}
};
