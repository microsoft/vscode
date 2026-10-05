/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type { Node } from 'estree';
import { TSESTree } from '@typescript-eslint/utils';
import * as path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const legacyModule = path.join(root, 'src/vs/platform/notification/common/notificationLegacy');
const capabilityName = 'legacyExtensionLinkParsing';

export default new class implements eslint.Rule.RuleModule {
	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			restrictedCapability: 'Legacy notification link parsing is restricted to the extension API bridges. Use literal strings or NotificationText.link/format/concat in core.',
			restrictedExport: 'Do not re-export the legacy notification link parsing capability.',
			explicitImport: 'Import the legacy notification helper by name; namespace, dynamic, and require imports can expose the compatibility capability.',
		},
		schema: [{
			type: 'object',
			properties: {
				allowedFiles: { type: 'array', items: { type: 'string' } },
			},
			required: ['allowedFiles'],
			additionalProperties: false,
		}],
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const { allowedFiles } = context.options[0] as { allowedFiles: string[] };
		const allowed = allowedFiles.some(file => path.resolve(root, file) === path.resolve(context.filename));
		const capabilityBindings = new Set<eslint.Scope.Variable>();
		const exportedValues: TSESTree.Node[] = [];
		const returnedValues = new Map<TSESTree.Node, TSESTree.Node[]>();

		function isLegacyModule(source: TSESTree.Node): boolean {
			const value = source.type === 'Literal' ? source.value
				: source.type === 'TemplateLiteral' && source.expressions.length === 0 ? source.quasis[0].value.cooked : undefined;
			if (typeof value !== 'string') {
				return false;
			}
			const resolved = value.startsWith('.') ? path.resolve(path.dirname(context.filename), value)
				: value.startsWith('vs/') ? path.resolve(root, 'src', value) : path.resolve(value);
			return resolved.replace(/\.(?:js|ts)$/, '') === legacyModule;
		}

		function exposesCapability(node: TSESTree.Node | null | undefined, visited = new Set<TSESTree.Node>()): boolean {
			if (!node || visited.has(node)) {
				return false;
			}
			visited.add(node);
			const exposes = (value: TSESTree.Node | null | undefined) => exposesCapability(value, visited);
			switch (node.type) {
				case 'Identifier': {
					let scope: eslint.Scope.Scope | null = context.sourceCode.getScope(node as Node);
					while (scope) {
						const variable = scope.set.get(node.name);
						if (variable) {
							return capabilityBindings.has(variable)
								|| variable.defs.some(definition => exposes(definition.node as TSESTree.Node))
								|| variable.references.some(reference => reference.isWrite() && exposes(reference.writeExpr as TSESTree.Node | null));
						}
						scope = scope.upper;
					}
					return false;
				}
				case 'VariableDeclaration':
					return node.declarations.some(exposes);
				case 'VariableDeclarator':
					return exposes(node.init);
				case 'FunctionDeclaration':
				case 'FunctionExpression':
				case 'ArrowFunctionExpression':
					return (node.body?.type !== 'BlockStatement' && exposes(node.body))
						|| (returnedValues.get(node)?.some(exposes) ?? false);
				case 'ClassDeclaration':
				case 'ClassExpression':
					return node.body.body.some(exposes) || exposes(node.superClass);
				case 'MethodDefinition':
				case 'PropertyDefinition':
				case 'AccessorProperty':
					return exposes(node.value);
				case 'ObjectExpression':
					return node.properties.some(exposes);
				case 'Property':
					return exposes(node.value) || (node.computed && exposes(node.key));
				case 'ArrayExpression':
					return node.elements.some(exposes);
				case 'SpreadElement':
				case 'AwaitExpression':
					return exposes(node.argument);
				case 'ConditionalExpression':
					return exposes(node.consequent) || exposes(node.alternate);
				case 'LogicalExpression':
					return exposes(node.left) || exposes(node.right);
				case 'AssignmentExpression':
					return exposes(node.right);
				case 'SequenceExpression':
					return exposes(node.expressions.at(-1));
				case 'TSAsExpression':
				case 'TSTypeAssertion':
				case 'TSNonNullExpression':
				case 'TSSatisfiesExpression':
				case 'ChainExpression':
					return exposes(node.expression);
				case 'CallExpression':
				case 'NewExpression':
					return exposes(node.callee) || node.arguments.some(exposes);
				default:
					return false;
			}
		}

		return {
			ImportDeclaration: rawNode => {
				const node = rawNode as TSESTree.ImportDeclaration;
				if (node.importKind === 'type' || !isLegacyModule(node.source)) {
					return;
				}
				for (const specifier of node.specifiers) {
					if (specifier.type !== 'ImportSpecifier') {
						context.report({ node: specifier, messageId: 'explicitImport' });
					} else if (specifier.importKind !== 'type' && (specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value) === capabilityName) {
						const variable = context.sourceCode.getDeclaredVariables(rawNode).find(variable => variable.name === specifier.local.name);
						if (variable) {
							capabilityBindings.add(variable);
						}
						if (!allowed) {
							context.report({ node: specifier, messageId: 'restrictedCapability' });
						}
					}
				}
			},
			ExportNamedDeclaration: rawNode => {
				const node = rawNode as TSESTree.ExportNamedDeclaration;
				if (node.exportKind === 'type') {
					return;
				}
				if (node.declaration) {
					exportedValues.push(node.declaration);
				}
				for (const specifier of node.specifiers) {
					if (specifier.exportKind === 'type') {
						continue;
					}
					if (node.source && isLegacyModule(node.source)) {
						context.report({ node: specifier, messageId: 'restrictedExport' });
					} else if (!node.source && specifier.local.type === 'Identifier') {
						exportedValues.push(specifier.local);
					}
				}
			},
			ExportDefaultDeclaration: rawNode => {
				const node = rawNode as TSESTree.ExportDefaultDeclaration;
				exportedValues.push(node.declaration);
			},
			ReturnStatement: rawNode => {
				const node = rawNode as TSESTree.ReturnStatement;
				let parent: TSESTree.Node | undefined = node.parent;
				while (parent && parent.type !== 'FunctionDeclaration' && parent.type !== 'FunctionExpression' && parent.type !== 'ArrowFunctionExpression') {
					parent = parent.parent;
				}
				if (parent && node.argument) {
					const values = returnedValues.get(parent) ?? [];
					values.push(node.argument);
					returnedValues.set(parent, values);
				}
			},
			ExportAllDeclaration: rawNode => {
				const node = rawNode as TSESTree.ExportAllDeclaration;
				if (node.exportKind !== 'type' && isLegacyModule(node.source)) {
					context.report({ node, messageId: 'restrictedExport' });
				}
			},
			ImportExpression: rawNode => {
				const node = rawNode as TSESTree.ImportExpression;
				if (isLegacyModule(node.source)) {
					context.report({ node, messageId: 'explicitImport' });
				}
			},
			CallExpression: rawNode => {
				const node = rawNode as TSESTree.CallExpression;
				if (node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments[0] && isLegacyModule(node.arguments[0])) {
					context.report({ node, messageId: 'explicitImport' });
				}
			},
			TSImportEqualsDeclaration: (rawNode: Node) => {
				const node = rawNode as TSESTree.Node;
				if (node.type === 'TSImportEqualsDeclaration' && node.importKind !== 'type' && node.moduleReference.type === 'TSExternalModuleReference' && isLegacyModule(node.moduleReference.expression)) {
					context.report({ node, messageId: 'explicitImport' });
				}
			},
			'Program:exit': () => {
				if (!capabilityBindings.size) {
					return;
				}
				for (const node of exportedValues) {
					if (exposesCapability(node)) {
						context.report({ node, messageId: 'restrictedExport' });
					}
				}
			},
		};
	}
};
