/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';

export default new class ApiProviderNaming implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			slow: 'Native private fields are much slower and should only be used when needed. Ignore this warning if you know what you are doing, use compile-time private otherwise. See https://github.com/microsoft/vscode/issues/185991#issuecomment-1614468158 for details',
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		return {
			['PropertyDefinition PrivateIdentifier']: (node: ESTree.Node) => {
				context.report({
					node,
					messageId: 'slow'
				});
			},
			['MethodDefinition PrivateIdentifier']: (node: ESTree.Node) => {
				context.report({
					node,
					messageId: 'slow'
				});
			}
		};
	}
};
