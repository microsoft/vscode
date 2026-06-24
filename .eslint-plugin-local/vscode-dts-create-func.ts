/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';
import { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/utils';

export default new class ApiLiteralOrTypes implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		docs: { url: 'https://github.com/microsoft/vscode/wiki/Extension-API-guidelines#creating-objects' },
		messages: { sync: '`createXYZ`-functions are constructor-replacements and therefore must return sync', },
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		return {
			['TSDeclareFunction Identifier[name=/create.*/]']: (node: ESTree.Node) => {

				const decl = (node as TSESTree.Identifier).parent as TSESTree.FunctionDeclaration;

				if (decl.returnType?.typeAnnotation.type !== AST_NODE_TYPES.TSTypeReference) {
					return;
				}
				if (decl.returnType.typeAnnotation.typeName.type !== AST_NODE_TYPES.Identifier) {
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
