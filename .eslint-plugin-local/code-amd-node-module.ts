/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';
import { readFileSync } from 'fs';
import { join } from 'path';

// `package.json` okumasını ve modül listesinin oluşturulmasını kural modülünün dışına (module scope)
// alarak her dosya taramasında gereksiz disk I/O ve JSON.parse işlemlerinin önüne geçilmiş olundu.
const modules = new Set<string>();

try {
	const packageJson = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf-8'));
	const { dependencies = {}, optionalDependencies = {} } = packageJson;
	const all = Object.keys(dependencies).concat(Object.keys(optionalDependencies));
	for (const key of all) {
		modules.add(key);
	}
} catch (e) {
	console.error('Failed to load package.json for AmdModuleImportCheck rule:', e);
}

export default new class ApiProviderNaming implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			amdX: 'Use `import type` for import declarations, use `amdX#importAMDNodeModule` for import expressions'
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		const checkImport = (node: ESTree.Literal & { parent?: ESTree.Node & { importKind?: string } }) => {

			if (typeof node.value !== 'string') {
				return;
			}

			if (node.parent?.type === 'ImportDeclaration' && node.parent.importKind === 'type') {
				return;
			}

			if (!modules.has(node.value)) {
				return;
			}

			context.report({
				node,
				messageId: 'amdX'
			});
		};

		return {
			['ImportExpression Literal']: checkImport,
			['ImportDeclaration Literal']: checkImport
		};
	}
};
