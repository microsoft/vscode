/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/experimental-utils';

export = new class ApiTypeDiscrimination implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		docs: { url: 'https://github.com/microsoft/vscode/wiki/Extension-API-guidelines' },
		messages: {
			noTypeDiscrimination: 'Do not use type descrimination properties'
		}
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			['TSPropertySignature[optional=undefined] TSTypeAnnotation TSLiteralType Literal']: (node: any) => {

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
