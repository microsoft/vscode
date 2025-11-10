/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import * as ESTree from 'estree';
import { dirname, relative } from 'path';
import minimatch from 'minimatch';

export = new class implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			layerbreaker: 'You are only allowed to define limited top level functions.'
		},
		schema: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: {
					type: 'array',
					items: {
						type: 'string'
					}
				}
			}
		}
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		let fileRelativePath = relative(dirname(__dirname), context.getFilename());
		if (!fileRelativePath.endsWith('/')) {
			fileRelativePath += '/';
		}
		const ruleArgs = <Record<string, string[]>>context.options[0];

		const matchingKey = Object.keys(ruleArgs).find(key => fileRelativePath.startsWith(key) || minimatch(fileRelativePath, key));
		if (!matchingKey) {
			// nothing
			return {};
		}

		const restrictedFunctions = ruleArgs[matchingKey];

		return {
			FunctionDeclaration: (node: ESTree.Node) => {
				const functionDeclaration = node as ESTree.FunctionDeclaration & { parent?: ESTree.Node };
				if (!functionDeclaration.id) {
					return;
				}
				const isTopLevel = functionDeclaration.parent?.type === 'Program';
				const functionName = functionDeclaration.id.name;
				if (isTopLevel && !restrictedFunctions.includes(functionName)) {
					context.report({
						node,
						message: `Top-level function '${functionName}' is restricted in this file. Allowed functions are: ${restrictedFunctions.join(', ')}.`
					});
				}
			},
			ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration & { parent?: ESTree.Node }) {
				if (node.declaration && node.declaration.type === 'FunctionDeclaration') {
					const declaration = node.declaration as ESTree.FunctionDeclaration & { parent?: ESTree.Node };
					if (!declaration.id) {
						return;
					}
					const functionName = declaration.id.name;
					const isTopLevel = node.parent?.type === 'Program';
					if (isTopLevel && !restrictedFunctions.includes(functionName)) {
						context.report({
							node,
							message: `Top-level function '${functionName}' is restricted in this file. Allowed functions are: ${restrictedFunctions.join(', ')}.`
						});
					}
				}
			}
		};
	}
};
