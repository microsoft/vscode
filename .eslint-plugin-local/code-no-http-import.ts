/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, RuleMeta, Visitor } from '@oxlint/plugins';
import { normalize } from 'path';
import minimatch from 'minimatch';
import { createImportRuleListener } from './utils.ts';

const restrictedModules = new Set(['http', 'https']);

const REPO_ROOT = normalize(`${import.meta.dirname}/..`);

export default new class implements CreateRule {

	readonly meta: RuleMeta = {
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

	create(context: Context): Visitor {
		const targets = (context.options as { target: string }[]).map(o => o.target);
		if (targets.length > 0) {
			const relativeFilename = normalize(context.filename).substring(REPO_ROOT.length + 1).replace(/\\/g, '/');
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
			if (parent.type === 'ImportDeclaration' && parent.importKind === 'type') {
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
