/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';
import { readFileSync } from 'fs';
import { join } from 'path';

// Lazy initialization for module list generation to optimize performance on demand
let cachedModules: Set<string> | undefined;

function getModules(): Set<string> {
	if (!cachedModules) {
		try {
			const packageJson = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf-8'));
			const { dependencies = {}, optionalDependencies = {} } = packageJson;
			const all = Object.keys(dependencies).concat(Object.keys(optionalDependencies));
			cachedModules = new Set(all);
		} catch (e) {
			console.error('Failed to load package.json for AmdModuleImportCheck rule:', e);
			throw e; // Rethrow the error to prevent silencing it
		}
	}
	return cachedModules;
}

type Literal = Extract<ESTree.Node, { type: 'Literal' }>;

export default new class ApiProviderNaming implements CreateRule {

	readonly meta: RuleMeta = {
		messages: {
			amdX: 'Use `import type` for import declarations, use `amdX#importAMDNodeModule` for import expressions'
		},
		schema: false,
	};

	create(context: Context): Visitor {

		const checkImport = (node: Literal) => {

			if (typeof node.value !== 'string') {
				return;
			}

			if (node.parent?.type === 'ImportDeclaration' && node.parent.importKind === 'type') {
				return;
			}

			const modules = getModules();
			if (!modules.has(node.value)) {
				return;
			}

			context.report({
				node,
				messageId: 'amdX'
			});
		};

		// Track whether we are inside an import declaration/expression instead of
		// using descendant selectors, which are expensive to match on every literal
		let importDepth = 0;
		const enterImport = () => { importDepth++; };
		const exitImport = () => { importDepth--; };

		return {
			['ImportExpression']: enterImport,
			['ImportExpression:exit']: exitImport,
			['ImportDeclaration']: enterImport,
			['ImportDeclaration:exit']: exitImport,
			['Literal']: (node: Literal) => {
				if (importDepth > 0) {
					checkImport(node);
				}
			}
		};
	}
};
