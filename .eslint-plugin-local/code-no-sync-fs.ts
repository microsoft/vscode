/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TSESTree } from '@typescript-eslint/utils';
import type * as eslint from 'eslint';
import type { Node } from 'estree';
import { dirname, resolve } from 'path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const pfsModule = resolve(repositoryRoot, 'src/vs/base/node/pfs');

type Binding = { kind: 'fs' | 'module' | 'requireFactory' | 'require' } | { kind: 'sync' | 'syncBind'; name: string };

function propertyName(node: TSESTree.Node): string | undefined {
	return node.type === 'Identifier' ? node.name : node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
}

function moduleBinding(node: TSESTree.Node, filename: string): Binding | undefined {
	const value = node.type === 'Literal' ? node.value
		: node.type === 'TemplateLiteral' && node.expressions.every(expression => expression.type === 'Literal' && typeof expression.value === 'string')
			? node.quasis.map((part, index) => {
				const expression = node.expressions[index];
				return (part.value.cooked ?? part.value.raw) + (expression?.type === 'Literal' && typeof expression.value === 'string' ? expression.value : '');
			}).join('')
			: undefined;
	if (typeof value !== 'string') {
		return undefined;
	}
	const importedPath = value.startsWith('.') ? resolve(dirname(filename), value)
		: value.startsWith('vs/') ? resolve(repositoryRoot, 'src', value) : value;
	if (['fs', 'node:fs', 'original-fs'].includes(value) || importedPath.replace(/\.(?:js|ts)$/, '') === pfsModule) {
		return { kind: 'fs' };
	}
	return value === 'module' || value === 'node:module' ? { kind: 'module' } : undefined;
}

function memberBinding(binding: Binding | undefined, name: string | undefined): Binding | undefined {
	if (binding?.kind === 'fs' && name?.endsWith('Sync')) {
		return { kind: 'sync', name };
	}
	if (binding?.kind === 'sync' && name === 'bind') {
		return { kind: 'syncBind', name: binding.name };
	}
	if (name === 'default' || (binding?.kind === 'sync' && ['native', 'call', 'apply'].includes(name ?? ''))) {
		return binding;
	}
	return binding?.kind === 'module' && name === 'createRequire' ? { kind: 'requireFactory' } : undefined;
}

export default new class implements eslint.Rule.RuleModule {
	readonly meta: eslint.Rule.RuleMetaData = {
		type: 'problem',
		docs: { description: 'Prevent blocking filesystem operations in production code.' },
		messages: {
			syncFs: '{{name}} blocks the event loop and can stall all work in this process. Use asynchronous filesystem APIs. DO NOT disable this rule unless absolutely necessary; any unavoidable exception must be narrowly scoped and explain why asynchronous I/O cannot be used.',
		},
		schema: [],
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		function resolveBinding(node: TSESTree.Node | null | undefined, visited = new Set<eslint.Scope.Variable>()): Binding | undefined {
			if (!node) {
				return undefined;
			}
			switch (node.type) {
				case 'Identifier': {
					let scope: eslint.Scope.Scope | null = context.sourceCode.getScope(node as Node);
					while (scope) {
						const variable = scope.set.get(node.name);
						if (variable) {
							if (visited.has(variable)) {
								return undefined;
							}
							visited.add(variable);
							for (const definition of variable.defs) {
								const declaration = definition.node as TSESTree.Node;
								if (declaration.type === 'ImportSpecifier' || declaration.type === 'ImportDefaultSpecifier' || declaration.type === 'ImportNamespaceSpecifier') {
									const parent = declaration.parent;
									if (parent.type !== 'ImportDeclaration' || parent.importKind === 'type' || (declaration.type === 'ImportSpecifier' && declaration.importKind === 'type')) {
										continue;
									}
									const binding = moduleBinding(parent.source, context.filename);
									return declaration.type === 'ImportSpecifier' ? memberBinding(binding, propertyName(declaration.imported)) : binding;
								}
								if (declaration.type === 'VariableDeclarator') {
									const binding = resolveBinding(declaration.init, visited);
									if (declaration.id.type === 'Identifier' && binding) {
										return binding;
									}
									if (declaration.id.type === 'ObjectPattern') {
										const property = declaration.id.properties.find(property => property.type === 'Property'
											&& property.value.type === 'Identifier' && property.value.name === node.name);
										if (property?.type === 'Property') {
											return memberBinding(binding, property.computed && property.key.type !== 'Literal' ? undefined : propertyName(property.key));
										}
									}
								}
								if (declaration.type === 'TSImportEqualsDeclaration' && declaration.moduleReference.type === 'TSExternalModuleReference' && declaration.importKind !== 'type') {
									return moduleBinding(declaration.moduleReference.expression, context.filename);
								}
							}
							for (const reference of variable.references) {
								if (reference.isWrite() && reference.writeExpr) {
									const binding = resolveBinding(reference.writeExpr as TSESTree.Node, visited);
									if (binding) {
										return binding;
									}
								}
							}
							return variable.defs.length === 0 && node.name === 'require' ? { kind: 'require' } : undefined;
						}
						scope = scope.upper;
					}
					return node.name === 'require' ? { kind: 'require' } : undefined;
				}
				case 'MemberExpression':
					return memberBinding(resolveBinding(node.object, visited), node.computed && node.property.type !== 'Literal' ? undefined : propertyName(node.property));
				case 'CallExpression': {
					const callee = resolveBinding(node.callee, visited);
					if (callee?.kind === 'syncBind') {
						return { kind: 'sync', name: callee.name };
					}
					if (callee?.kind === 'requireFactory') {
						return { kind: 'require' };
					}
					return callee?.kind === 'require' && node.arguments[0] ? moduleBinding(node.arguments[0], context.filename) : undefined;
				}
				case 'ImportExpression':
					return moduleBinding(node.source, context.filename);
				case 'AwaitExpression':
					return resolveBinding(node.argument, visited);
				case 'TSAsExpression':
				case 'TSTypeAssertion':
				case 'TSNonNullExpression':
				case 'TSSatisfiesExpression':
				case 'ChainExpression':
					return resolveBinding(node.expression, visited);
				default:
					return undefined;
			}
		}

		return {
			CallExpression: rawNode => {
				const node = rawNode as TSESTree.CallExpression;
				const binding = resolveBinding(node.callee);
				if (binding?.kind === 'sync') {
					context.report({ node: rawNode, messageId: 'syncFs', data: { name: binding.name } });
				}
			},
		};
	}
};
