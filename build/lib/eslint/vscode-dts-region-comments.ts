/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';

export = new class ApiEventNaming implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			comment: 'region comments should start with the GH issue link, e.g #region https://github.com/microsoft/vscode/issues/<number>',
		}
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		const sourceCode = context.getSourceCode();


		return {
			['Program']: (_node: any) => {

				for (let comment of sourceCode.getAllComments()) {
					if (comment.type !== 'Line') {
						continue;
					}
					if (!comment.value.match(/^\s*#region /)) {
						continue;
					}
					if (!comment.value.match(/https:\/\/github.com\/microsoft\/vscode\/issues\/\d+/i)) {
						context.report({
							node: <any>comment,
							messageId: 'comment',
						});
					}
				}
			}
		};
	}
};
