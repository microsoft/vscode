/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';
import { posix, relative, resolve } from 'path';
import { createImportRuleListener } from './utils.ts';

type Layers = Record<string, string[]>;

interface LayeringViolation {
	readonly from: string;
	readonly allowed: readonly string[];
}

const repositoryRoot = resolve(import.meta.dirname, '..');

/**
 * Returns a function that checks an import specifier of `filename` against the layers, or `undefined` when the file
 * is in no layer. Layers are found in the folders below `root` only, so the name of the checkout doesn't matter.
 */
export function createLayeringChecker(root: string, filename: string, layers: Layers): ((specifier: string) => LayeringViolation | undefined) | undefined {
	const directory = posix.dirname(relative(root, filename).replace(/\\/g, '/'));
	const fileLayer = findLayer(directory.split('/'), layer => !!layers[layer]);
	if (!fileLayer) {
		return undefined;
	}

	const allowed = new Set(layers[fileLayer]).add(fileLayer);
	const disallowed = new Set(Object.keys(layers).filter(layer => !allowed.has(layer)));

	return specifier => {
		const path = specifier[0] === '.' ? posix.join(directory, specifier.replace(/\\/g, '/')) : specifier;
		const importLayer = findLayer(posix.dirname(path).split(/\\|\//), layer => allowed.has(layer) || disallowed.has(layer));
		return importLayer && disallowed.has(importLayer) ? { from: importLayer, allowed: [...allowed] } : undefined;
	};
}

/**
 * Returns the innermost folder name that is a layer.
 */
function findLayer(folders: readonly string[], isLayer: (folder: string) => boolean): string | undefined {
	for (let i = folders.length - 1; i >= 0; i--) {
		if (isLayer(folders[i])) {
			return folders[i];
		}
	}
	return undefined;
}

export default new class implements CreateRule {

	readonly meta: RuleMeta = {
		messages: {
			layerbreaker: 'Bad layering. You are not allowed to access {{from}} from here, allowed layers are: [{{allowed}}]'
		},
		docs: {
			url: 'https://github.com/microsoft/vscode/wiki/Source-Code-Organization'
		},
		schema: [
			{
				type: 'object',
				additionalProperties: {
					type: 'array',
					items: {
						type: 'string'
					}
				}
			}
		]
	};

	create(context: Context): Visitor {
		const check = createLayeringChecker(repositoryRoot, context.filename, context.options[0] as Layers);
		if (!check) {
			return {};
		}

		const checkImport = (node: ESTree.Node | null | undefined): void => {
			if (node?.type !== 'Literal' || typeof node.value !== 'string') {
				return;
			}
			const violation = check(node.value);
			// oxlint computes `loc` on first access, so only access it to report
			if (violation && node.loc) {
				context.report({
					loc: node.loc,
					messageId: 'layerbreaker',
					data: {
						from: violation.from,
						allowed: violation.allowed.join(', ')
					}
				});
			}
		};

		return {
			...createImportRuleListener(node => checkImport(node)),
			ImportExpression: (node: ESTree.ImportExpression) => checkImport(node.source),
			CallExpression: (node: ESTree.CallExpression) => {
				if (node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments.length === 1) {
					checkImport(node.arguments[0]);
				}
			},
		};
	}
};
