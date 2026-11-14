/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, Location, RuleMeta, Scope, Visitor } from '@oxlint/plugins';
import minimatch from 'minimatch';
import { posix, resolve, win32 } from 'path';
import { createImportRuleListener } from './utils.ts';

interface RestrictedPath {
	readonly pattern: string;
	readonly message: string;
}

const repositoryRoot = resolve(import.meta.dirname, '..');

/**
 * Resolves a module specifier to a `/`-separated path relative to `root`, or `undefined` for
 * node modules. Windows roots (drive letter or UNC) use Windows path semantics, where drive
 * letters and UNC host/share names compare case-insensitively.
 */
export function resolveImport(root: string, filename: string, specifier: string): string | undefined {
	const pathApi = /^[a-zA-Z]:[\\/]|^[\\/]{2}[^\\/]/.test(root) ? win32 : posix;
	const value = specifier.replace(/\\/g, '/');
	let resolved: string;
	if (value.startsWith('.')) {
		resolved = pathApi.resolve(pathApi.dirname(filename), value);
	} else if (pathApi.isAbsolute(value)) {
		resolved = value;
	} else if (value.startsWith('vs/')) {
		resolved = pathApi.join(root, 'src', value);
	} else {
		return undefined;
	}
	return pathApi.relative(root, resolved).replace(/\\/g, '/');
}

export default new class NoRestrictedPathImports implements CreateRule {

	readonly meta: RuleMeta = {
		messages: {
			restricted: '{{message}}',
		},
		docs: {
			description: 'Disallow imports whose resolved path matches a restricted repository path pattern.',
		},
		schema: [{
			type: 'object',
			properties: {
				paths: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							pattern: { type: 'string' },
							message: { type: 'string' },
						},
						required: ['pattern', 'message'],
						additionalProperties: false,
					},
				},
			},
			required: ['paths'],
			additionalProperties: false,
		}],
	};

	create(context: Context): Visitor {
		// `RestrictedPath` has no index signature, so it doesn't overlap with JSON values
		const { paths } = context.options[0] as unknown as { paths: RestrictedPath[] };

		const checkImport = (loc: Location | null | undefined, value: string): void => {
			const resolved = resolveImport(repositoryRoot, context.filename, value);
			if (resolved === undefined || !loc) {
				return;
			}
			const restriction = paths.find(path => minimatch(resolved, path.pattern));
			if (restriction) {
				context.report({
					loc,
					messageId: 'restricted',
					data: { message: restriction.message },
				});
			}
		};

		const checkSource = (node: ESTree.Node | undefined): void => {
			const value = getStaticString(node);
			if (node && value !== undefined) {
				checkImport(node.loc, value);
			}
		};

		const isGlobalRequire = (node: ESTree.Node): boolean => {
			for (let scope: Scope | null = context.sourceCode.getScope(node); scope; scope = scope.upper) {
				const variable = scope.set.get('require');
				if (variable) {
					return variable.defs.length === 0;
				}
			}
			return true;
		};

		return {
			...createImportRuleListener((node, value) => checkImport(node.loc, value)),
			ImportExpression: (node: ESTree.ImportExpression) => checkSource(node.source),
			'TSImportType > Literal': (node: ESTree.Node) => checkSource(node),
			CallExpression: (node: ESTree.CallExpression) => {
				if (node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments.length === 1 && isGlobalRequire(node)) {
					checkSource(node.arguments[0]);
				}
			},
		};
	}
};

/**
 * Returns the value of a string literal or of a template literal without substitutions.
 */
function getStaticString(node: ESTree.Node | undefined): string | undefined {
	if (node?.type === 'Literal' && typeof node.value === 'string') {
		return node.value;
	}
	if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
		return node.quasis[0].value.cooked ?? undefined;
	}
	return undefined;
}
