/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, RuleMeta, Visitor } from '@oxlint/plugins';
import { join, dirname } from 'path';
import { createImportRuleListener } from './utils.ts';

export default new class implements CreateRule {

	readonly meta: RuleMeta = {
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

	create(context: Context): Visitor {
		const isInternalPart = getIsInternalPart(context.options[0] as Record<string, boolean>);
		const importerModuleDir = dirname(context.filename);
		const importerDirJoined = splitParts(importerModuleDir).join('/');

		return createImportRuleListener((node, path) => {
			if (path[0] === '.') {
				path = join(importerModuleDir, path);
			}
			const importedModulePath = path;

			const importedModuleParts = splitParts(importedModulePath);

			for (let i = 0; i < importedModuleParts.length; i++) {
				if (isInternalPart(importedModuleParts[i])) {
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

// The options are reused across files, and so are most of the path parts that are imported
const isInternalPartCache = new WeakMap<Record<string, boolean>, (part: string) => boolean>();

/**
 * Returns a function that checks whether a path part matches an internal module pattern and no allowed pattern.
 */
function getIsInternalPart(patterns: Record<string, boolean>): (part: string) => boolean {
	let isInternalPart = isInternalPartCache.get(patterns);
	if (!isInternalPart) {
		const internalModulePattern = Object.entries(patterns).map(([key, v]) => v ? key : undefined).filter((v): v is string => !!v).map(p => new RegExp(p));
		const allowedPatterns = Object.entries(patterns).map(([key, v]) => !v ? key : undefined).filter((v): v is string => !!v).map(p => new RegExp(p));
		const results = new Map<string, boolean>();
		isInternalPart = part => {
			let result = results.get(part);
			if (result === undefined) {
				result = internalModulePattern.some(p => p.test(part)) && allowedPatterns.every(p => !p.test(part));
				results.set(part, result);
			}
			return result;
		};
		isInternalPartCache.set(patterns, isInternalPart);
	}
	return isInternalPart;
}

function splitParts(path: string): string[] {
	return path.split(/\\|\//);
}
