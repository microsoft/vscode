/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import * as estree from 'estree';
import { join, dirname } from 'path';

type Config = {
	allowed: Set<string>;
	disallowed: Set<string>;
};

export = new class implements eslint.Rule.RuleModule {

	meta = {
		type: 'problem',
		schema: {},
		messages: {
			layerbreaker: 'Bad layering. You are not allowed to access {{from}} from here, allowed layers are: [{{allowed}}]'
		}
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		const fileDirname = dirname(context.getFilename());
		const parts = fileDirname.split(/\\|\//);
		const ruleArgs = <Record<string, string[]>>context.options[0];

		let config: Config | undefined;
		for (let i = parts.length - 1; i >= 0; i--) {
			if (ruleArgs[parts[i]]) {
				config = {
					allowed: new Set(ruleArgs[parts[i]]).add(parts[i]),
					disallowed: new Set()
				};
				Object.keys(ruleArgs).forEach(key => {
					if (!config!.allowed.has(key)) {
						config!.disallowed.add(key);
					}
				});
				break;
			}
		}

		if (!config) {
			// nothing
			return {};
		}

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

	private _checkImport(context: eslint.Rule.RuleContext, config: Config, node: estree.Node, path: any) {
		if (typeof path !== 'string') {
			return;
		}

		if (path[0] === '.') {
			path = join(dirname(context.getFilename()), path);
		}

		const parts = dirname(path).split(/\\|\//);
		for (let i = parts.length - 1; i >= 0; i--) {
			const part = parts[i];

			if (config!.allowed.has(part)) {
				// GOOD - same layer
				break;
			}

			if (config!.disallowed.has(part)) {
				// BAD - wrong layer
				context.report({
					node,
					messageId: 'layerbreaker',
					data: {
						from: part,
						allowed: [...config!.allowed.keys()].join(', ')
					}
				});

				break;
			}
		}
	}
};

