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
		const capabilityLocals = new Set<string>();
		const localExports: TSESTree.Identifier[] = [];
		const exportedValues: TSESTree.Node[] = [];
		const capabilityReferences: Array<readonly [number, number]> = [];

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
						capabilityLocals.add(specifier.local.name);
						const variable = context.sourceCode.getDeclaredVariables(rawNode).find(variable => variable.name === specifier.local.name);
						for (const reference of variable?.references ?? []) {
							if (reference.identifier.range) {
								capabilityReferences.push(reference.identifier.range);
							}
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
				if (node.declaration?.type === 'VariableDeclaration') {
					for (const declaration of node.declaration.declarations) {
						if (declaration.init) {
							exportedValues.push(declaration.init);
						}
					}
				}
				for (const specifier of node.specifiers) {
					if (specifier.exportKind === 'type') {
						continue;
					}
					if (node.source && isLegacyModule(node.source)) {
						context.report({ node: specifier, messageId: 'restrictedExport' });
					} else if (!node.source && specifier.local.type === 'Identifier') {
						localExports.push(specifier.local);
					}
				}
			},
			ExportDefaultDeclaration: rawNode => {
				const node = rawNode as TSESTree.ExportDefaultDeclaration;
				if (node.declaration.type === 'Identifier') {
					localExports.push(node.declaration);
				} else {
					exportedValues.push(node.declaration);
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
				for (const node of localExports) {
					if (capabilityLocals.has(node.name)) {
						context.report({ node, messageId: 'restrictedExport' });
					}
				}
				for (const node of exportedValues) {
					if (capabilityReferences.some(([start, end]) => start >= node.range[0] && end <= node.range[1])) {
						context.report({ node, messageId: 'restrictedExport' });
					}
				}
			},
		};
	}
};
