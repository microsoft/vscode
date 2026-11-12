/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, RuleMeta, Visitor } from '@oxlint/plugins';
import { dirname, join, relative } from 'path';
import minimatch from 'minimatch';
import { createImportRuleListener } from './utils.ts';

export default new class implements CreateRule {

	readonly meta: RuleMeta = {
		messages: {
			layerbreaker: 'You are only allowed to import {{import}} from here using `import type ...`.'
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

		const restrictedImports = ruleArgs[matchingKey];
		return createImportRuleListener((node, path) => {
			if (path[0] === '.') {
				path = join(dirname(context.filename), path);
			}

			if ((
				restrictedImports.includes(path) || restrictedImports.some(restriction => minimatch(path, restriction))
			) && !(
				(node.parent?.type === 'ImportDeclaration' && node.parent.importKind === 'type') ||
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
