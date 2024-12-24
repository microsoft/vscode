/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TSESTree } from '@typescript-eslint/typescript-estree';
import * as eslint from 'eslint';
import { dirname, join, relative } from 'path';
import minimatch from 'minimatch';
import { createImportRuleListener } from './utils';

export = new class implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			layerbreaker: 'You are only allowed to import {{import}} from here using `import type ...`.'
		},
		schema: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: {
					type: "array",
					items: {
						type: "string"
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

		const restrictedImports = ruleArgs[matchingKey];
		return createImportRuleListener((node, path) => {
			if (path[0] === '.') {
				path = join(dirname(context.getFilename()), path);
			}

			if ((
				restrictedImports.includes(path) || restrictedImports.some(restriction => minimatch(path, restriction))
			) && !(
				(node.parent?.type === TSESTree.AST_NODE_TYPES.ImportDeclaration && node.parent.importKind === 'type') ||
				(node.parent && 'exportKind' in node.parent && node.parent.exportKind === 'type'))) { // the export could be multiple types
				context.report({
					loc: node.parent!.loc,
					messageId: 'layerbreaker',
					data: {
						import: path
					}
				});
			}
		});
	}
};
