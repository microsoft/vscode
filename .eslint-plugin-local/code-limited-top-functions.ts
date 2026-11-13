/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';
import { dirname, relative } from 'path';
import minimatch from 'minimatch';

export default new class implements CreateRule {

	readonly meta: RuleMeta = {
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

	create(context: Context): Visitor {
		let fileRelativePath = relative(dirname(import.meta.dirname), context.filename);
		if (!fileRelativePath.endsWith('/')) {
			fileRelativePath += '/';
		}
		const ruleArgs = context.options[0] as Record<string, string[]>;

		const matchingKey = Object.keys(ruleArgs).find(key => fileRelativePath.startsWith(key) || minimatch(fileRelativePath, key));
		if (!matchingKey) {
			// nothing
			return {};
		}

		const restrictedFunctions = ruleArgs[matchingKey];

		return {
			FunctionDeclaration: (node: ESTree.Function) => {
				const isTopLevel = node.parent?.type === 'Program';
				const functionName = node.id!.name;
				if (isTopLevel && !restrictedFunctions.includes(node.id!.name)) {
					context.report({
						node,
						message: `Top-level function '${functionName}' is restricted in this file. Allowed functions are: ${restrictedFunctions.join(', ')}.`
					});
				}
			},
			ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
				if (node.declaration && node.declaration.type === 'FunctionDeclaration') {
					const functionName = node.declaration.id!.name;
					const isTopLevel = node.parent?.type === 'Program';
					if (isTopLevel && !restrictedFunctions.includes(node.declaration.id!.name)) {
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
