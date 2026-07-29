/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TSESTree } from '@typescript-eslint/typescript-estree';
import * as eslint from 'eslint';
import { builtinModules } from 'module';
import { join, normalize, relative } from 'path';
import minimatch from 'minimatch';
import { createImportRuleListener } from './utils.ts';

const nodeBuiltins = new Set([
	...builtinModules,
	...builtinModules.map(m => `node:${m}`)
]);

const REPO_ROOT = normalize(join(import.meta.dirname, '../'));

export default new class implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			staticImport: 'Static imports of \'{{module}}\' are not allowed here because they are loaded synchronously on startup. Use a dynamic `await import(...)` or `import type` instead.'
		},
		docs: {
			description: 'Disallow static imports of node_modules packages to prevent synchronous loading on startup. Allows Node.js built-ins, electron, relative imports, and whitelisted file paths.'
		},
		schema: {
			type: 'array',
			items: {
				type: 'string'
			}
		}
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const allowedPaths = context.options as string[];
		const filePath = normalize(relative(REPO_ROOT, normalize(context.getFilename()))).replace(/\\/g, '/');

		// Skip whitelisted files
		if (allowedPaths.some(pattern => filePath === pattern || minimatch(filePath, pattern))) {
			return {};
		}

		return createImportRuleListener((node, value) => {
			// Allow `import type` and `export type` declarations
			if (node.parent?.type === TSESTree.AST_NODE_TYPES.ImportDeclaration && node.parent.importKind === 'type') {
				return;
			}
			if (node.parent && 'exportKind' in node.parent && node.parent.exportKind === 'type') {
				return;
			}

			// Allow relative imports
			if (value.startsWith('.')) {
				return;
			}

			// Allow Node.js built-in modules
			if (nodeBuiltins.has(value)) {
				return;
			}

			// Allow electron
			if (value === 'electron') {
				return;
			}

			context.report({
				loc: node.parent!.loc,
				messageId: 'staticImport',
				data: {
					module: value
				}
			});
		});
	}
};
