/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { join } from 'path';


export = new class ApiProviderNaming implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			amdX: 'Use `import type` for import declarations, use `amdX#importAMDNodeModule` for import expressions'
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		const modules = new Set<string>();

		try {
			const { dependencies, optionalDependencies } = require(join(__dirname, '../package.json'));
			const all = Object.keys(dependencies).concat(Object.keys(optionalDependencies));
			for (const key of all) {
				modules.add(key);
			}

		} catch (e) {
			console.error(e);
			throw e;
		}


		const checkImport = (node: any) => {

			if (node.type !== 'Literal' || typeof node.value !== 'string') {
				return;
			}

			if (node.parent.importKind === 'type') {
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
