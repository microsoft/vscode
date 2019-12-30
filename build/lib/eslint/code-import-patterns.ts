/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import * as estree from 'estree';
import { join } from 'path';
import * as minimatch from 'minimatch';

interface ImportPatternsConfig {
	target: string;
	restrictions: string | string[];
}

export = new class implements eslint.Rule.RuleModule {

	readonly meta = {
		type: 'problem',
		schema: {},
		messages: {
			badImport: 'Imports violates \'{{restrictions}}\' restrictions. See https://github.com/Microsoft/vscode/wiki/Code-Organization'
		}
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		const configs = <ImportPatternsConfig[]>context.options;

		for (const config of configs) {
			if (minimatch(context.getFilename(), config.target)) {
				return {
					ImportDeclaration: (node: estree.Node) => {
						this._checkImport(context, config!, node, (<estree.ImportDeclaration>node).source.value);
					},
					CallExpression: (node: estree.Node) => {
						const { callee, arguments: args } = <estree.CallExpression>node;
						if ((<any>callee.type) === 'Import' && args[0]?.type === 'Literal') {
							this._checkImport(context, config!, node, (<estree.Literal>args[0]).value);
						}
					}
				};
			}
		}

		return {};

	}

	private _checkImport(context: eslint.Rule.RuleContext, config: ImportPatternsConfig, node: estree.Node, path: any) {
		if (typeof path !== 'string') {
			return;
		}

		// resolve relative paths
		if (path[0] === '.') {
			path = join(context.getFilename(), path);
		}

		let restrictions: string[];
		if (typeof config.restrictions === 'string') {
			restrictions = [config.restrictions];
		} else {
			restrictions = config.restrictions;
		}

		let matched = false;
		for (const pattern of restrictions) {
			if (minimatch(path, pattern)) {
				matched = true;
				break;
			}
		}

		if (!matched) {
			// None of the restrictions matched
			context.report({
				node,
				messageId: 'badImport',
				data: {
					restrictions: restrictions.join(' or ')
				}
			});
		}
	}
};

