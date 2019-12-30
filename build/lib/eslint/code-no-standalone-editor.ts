/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import * as estree from 'estree';
import { join } from 'path';

export = new class NoNlsInStandaloneEditorRule implements eslint.Rule.RuleModule {

	readonly meta = {
		type: 'problem',
		schema: {},
		messages: {
			badImport: 'Not allowed to import standalone editor modules. See https://github.com/Microsoft/vscode/wiki/Code-Organization'
		}
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		if (/vs(\/|\\)editor/.test(context.getFilename())) {
			// the vs/editor folder is allowed to use the standalone editor
			return {};
		}

		return {
			ImportDeclaration: (node: estree.Node) => {
				this._checkImport(context, node, (<estree.ImportDeclaration>node).source.value);
			},
			CallExpression: (node: estree.Node) => {
				const { callee, arguments: args } = <estree.CallExpression>node;
				if ((<any>callee.type) === 'Import' && args[0]?.type === 'Literal') {
					this._checkImport(context, node, (<estree.Literal>args[0]).value);
				}
			}
		};
	}

	private _checkImport(context: eslint.Rule.RuleContext, node: estree.Node, path: any) {
		if (typeof path !== 'string') {
			return;
		}

		// resolve relative paths
		if (path[0] === '.') {
			path = join(context.getFilename(), path);
		}

		if (
			/vs(\/|\\)editor(\/|\\)standalone(\/|\\)/.test(path)
			|| /vs(\/|\\)editor(\/|\\)common(\/|\\)standalone(\/|\\)/.test(path)
			|| /vs(\/|\\)editor(\/|\\)editor.api/.test(path)
			|| /vs(\/|\\)editor(\/|\\)editor.main/.test(path)
			|| /vs(\/|\\)editor(\/|\\)editor.worker/.test(path)
		) {
			context.report({
				node,
				messageId: 'badImport'
			});
		}
	}
};

