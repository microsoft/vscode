/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import * as estree from 'estree';
import { readFileSync } from 'fs';


export = new class TranslationRemind implements eslint.Rule.RuleModule {

	private static NLS_MODULE = 'vs/nls';

	readonly meta = {
		type: 'problem',
		schema: {},
		messages: {
			missing: 'Please add \'{{resource}}\' to ./build/lib/i18n.resources.json file to use translations here.'
		}
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		return {
			ImportDeclaration: (node: estree.Node) => {
				this._checkImport(context, node, (<estree.ImportDeclaration>node).source.value);
			},
			CallExpression: (node: estree.Node) => {
				const { callee, arguments: args } = <estree.CallExpression>node;
				if ((<any>callee.type) === 'Import' && args[0]?.type === 'Literal') {
					this._checkImport(context, node, (<estree.Literal>args[0]).value);
				}
			}
		};
	}

	private _checkImport(context: eslint.Rule.RuleContext, node: estree.Node, path: any) {

		if (path === TranslationRemind.NLS_MODULE) {

			const currentFile = context.getFilename();
			const matchService = currentFile.match(/vs\/workbench\/services\/\w+/);
			const matchPart = currentFile.match(/vs\/workbench\/contrib\/\w+/);
			if (!matchService && !matchPart) {
				return;
			}

			const resource = matchService ? matchService[0] : matchPart![0];
			let resourceDefined = false;

			let json;
			try {
				json = readFileSync('./build/lib/i18n.resources.json', 'utf8');
			} catch (e) {
				console.error('[translation-remind rule]: File with resources to pull from Transifex was not found. Aborting translation resource check for newly defined workbench part/service.');
				return;
			}
			const workbenchResources = JSON.parse(json).workbench;

			workbenchResources.forEach((existingResource: any) => {
				if (existingResource.name === resource) {
					resourceDefined = true;
					return;
				}
			});

			if (!resourceDefined) {
				context.report({
					node,
					messageId: 'missing',
					data: { resource }
				});
			}
		}

	}
};

