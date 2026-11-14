/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';
import { readFileSync } from 'fs';
import { createImportRuleListener } from './utils.ts';


export default new class TranslationRemind implements CreateRule {

	private static NLS_MODULE = 'vs/nls';

	readonly meta: RuleMeta = {
		messages: {
			missing: 'Please add \'{{resource}}\' to ./build/lib/i18n.resources.json file to use translations here.'
		},
		schema: false,
	};

	create(context: Context): Visitor {
		const currentFile = context.filename.replace(/\\/g, '/');
		const matchService = currentFile.match(/vs\/workbench\/services\/\w+/);
		const matchPart = currentFile.match(/vs\/workbench\/contrib\/\w+/);
		const matchSessionsPart = currentFile.match(/vs\/sessions\/contrib\/\w+/);
		if (!matchService && !matchPart && !matchSessionsPart) {
			return {};
		}

		const resource = matchService ? matchService[0] : matchPart ? matchPart[0] : matchSessionsPart![0];
		return createImportRuleListener((node, path) => this._checkImport(context, resource, node, path));
	}

	private _checkImport(context: Context, resource: string, node: ESTree.Node, path: string) {

		if (path !== TranslationRemind.NLS_MODULE && !path.endsWith('/nls.js')) {
			return;
		}

		if (getResourceNames()?.has(resource) !== false) {
			return;
		}
		// The names are cached, so read them again before reporting, in case the resource was added since
		if (getResourceNames(true)?.has(resource) !== false) {
			return;
		}

		context.report({
			loc: node.loc,
			messageId: 'missing',
			data: { resource }
		});
	}
};

let resourceNames: Set<string> | undefined;

/**
 * Returns the names of the resources in `./build/lib/i18n.resources.json`, or `undefined` if it can't be read. The
 * file is read once, and again when `reload` is set.
 */
function getResourceNames(reload = false): Set<string> | undefined {
	if (!resourceNames || reload) {
		let json;
		try {
			json = readFileSync(new URL('../build/lib/i18n.resources.json', import.meta.url), 'utf8');
		} catch (e) {
			console.error('[translation-remind rule]: File with resources to pull from Transifex was not found. Aborting translation resource check for newly defined workbench part/service.');
			return undefined;
		}
		const parsed = JSON.parse(json);
		resourceNames = new Set([...parsed.workbench, ...parsed.sessions].map((existingResource: { name: string }) => existingResource.name));
	}
	return resourceNames;
}
