/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';

export = new class ApiEventNaming implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			comment: 'region comments should start with a camel case identifier, `:`, then either a GH issue link or owner, e.g #region myProposalName: https://github.com/microsoft/vscode/issues/<number>',
		}
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		const sourceCode = context.getSourceCode();

		return {
			['Program']: (_node: any) => {
				for (const comment of sourceCode.getAllComments()) {
					if (comment.type !== 'Line') {
						continue;
					}
					if (!/^\s*#region /.test(comment.value)) {
						continue;
					}
					if (!/^\s*#region ([a-z]+): (@[a-z]+|https:\/\/github.com\/microsoft\/vscode\/issues\/\d+)/i.test(comment.value)) {
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
