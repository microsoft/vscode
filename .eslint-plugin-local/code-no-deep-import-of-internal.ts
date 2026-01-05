/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { join, dirname } from 'path';
import { createImportRuleListener } from './utils.ts';

export default new class implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			noDeepImportOfInternal: 'No deep import of internal modules allowed! Use a re-export from a non-internal module instead. Internal modules can only be imported by direct parents (any module in {{parentDir}}).'
		},
		docs: {
			url: 'https://github.com/microsoft/vscode/wiki/Source-Code-Organization'
		},
		schema: [
			{
				type: 'object',
				additionalProperties: {
					type: 'boolean'
				}
			}
		]
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const patterns = context.options[0] as Record<string, boolean>;
		const internalModulePattern = Object.entries(patterns).map(([key, v]) => v ? key : undefined).filter((v): v is string => !!v);
		const allowedPatterns = Object.entries(patterns).map(([key, v]) => !v ? key : undefined).filter((v): v is string => !!v);

		return createImportRuleListener((node, path) => {
			const importerModuleDir = dirname(context.filename);
			if (path[0] === '.') {
				path = join(importerModuleDir, path);
			}
			const importedModulePath = path;

			const importerDirParts = splitParts(importerModuleDir);
			const importedModuleParts = splitParts(importedModulePath);

			for (let i = 0; i < importedModuleParts.length; i++) {
				if (internalModulePattern.some(p => importedModuleParts[i].match(p)) && allowedPatterns.every(p => !importedModuleParts[i].match(p))) {
					const importerDirJoined = importerDirParts.join('/');
					const expectedParentDir = importedModuleParts.slice(0, i).join('/');
					if (!importerDirJoined.startsWith(expectedParentDir)) {
						context.report({
							node,
							messageId: 'noDeepImportOfInternal',
							data: {
								parentDir: expectedParentDir
							}
						});
						return;
					}
				}
			}
		});
	}
};

function splitParts(path: string): string[] {
	return path.split(/\\|\//);
}
