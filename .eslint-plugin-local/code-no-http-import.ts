/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TSESTree } from '@typescript-eslint/typescript-estree';
import * as eslint from 'eslint';
import { normalize } from 'path';
import minimatch from 'minimatch';
import { createImportRuleListener } from './utils.ts';

const restrictedModules = new Set(['http', 'https']);

const REPO_ROOT = normalize(`${import.meta.dirname}/..`);

export default new class implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			notAllowed: 'Importing \'{{module}}\' is only allowed as a type import (`import type ...`) to prevent startup performance regressions as these modules are slow to load. Use dynamic `import(\'{{module}}\')` for runtime access.'
		},
		schema: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					target: {
						type: 'string',
						description: 'A glob pattern for files to check'
					}
				},
				additionalProperties: false,
				required: ['target']
			}
		}
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const targets = (context.options as { target: string }[]).map(o => o.target);
		if (targets.length > 0) {
			const relativeFilename = normalize(context.getFilename()).substring(REPO_ROOT.length + 1).replace(/\\/g, '/');
			const matched = targets.some(pattern => minimatch(relativeFilename, pattern));
			if (!matched) {
				return {}; // file is not covered by any target pattern
			}
		}

		return createImportRuleListener((node, path) => {
			if (!restrictedModules.has(path)) {
				return;
			}

			const parent = node.parent;
			if (!parent) {
				return;
			}

			// Allow: import type { ... } from 'http'
			// Allow: import type * as http from 'http'
			if (parent.type === TSESTree.AST_NODE_TYPES.ImportDeclaration && parent.importKind === 'type') {
				return;
			}

			// Allow: export type { ... } from 'http'
			if ('exportKind' in parent && parent.exportKind === 'type') {
				return;
			}

			context.report({
				loc: parent.loc,
				messageId: 'notAllowed',
				data: {
					module: path
				}
			});
		});
	}
};
