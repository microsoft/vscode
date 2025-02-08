/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';

export = new class ApiTypeDiscrimination implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		docs: { url: 'https://github.com/microsoft/vscode/wiki/Extension-API-guidelines' },
		messages: {
			noTypeDiscrimination: 'Do not use type discrimination properties'
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			['TSPropertySignature[optional=false] TSTypeAnnotation TSLiteralType Literal']: (node: any) => {
				const raw = String((<TSESTree.Literal>node).raw)

				if (/^('|").*\1$/.test(raw)) {

					context.report({
						node: node,
						messageId: 'noTypeDiscrimination'
					});
				}
			}
		}
	}
};
