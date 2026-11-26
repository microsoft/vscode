/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, Fix, Fixer, RuleMeta, Scope, Visitor } from '@oxlint/plugins';
import { getDecorator, getJSDocComment, getReducedNode, loose, looseChild, looseChildren, nameOf, type LooseNode } from './jsdocUtils.ts';

interface Options {
	readonly contexts?: readonly string[];
	readonly enableFixer?: boolean;
	readonly require?: Readonly<Record<string, boolean>>;
}

const requireDefaults: Readonly<Record<string, boolean>> = {
	ArrowFunctionExpression: false,
	ClassDeclaration: false,
	ClassExpression: false,
	FunctionDeclaration: true,
	FunctionExpression: false,
	MethodDefinition: false,
};

/**
 * The parents of a function expression for which it needs documentation: assignments, exports and properties.
 */
const assignmentParents = new Set(['AssignmentExpression', 'ExportDefaultDeclaration', 'VariableDeclarator']);
const propertyParents = new Set(['ClassProperty', 'ObjectProperty', 'Property', 'PropertyDefinition']);

/**
 * Returns the method or property of the interface named `interfaceName` (as visible from `scope`) named `methodName`.
 */
function getMemberOfInterface(interfaceName: string | undefined, methodName: string | undefined, scope: Scope | null): LooseNode | undefined {
	for (let current = scope; current; current = current.upper) {
		for (const variable of current.variables) {
			if (variable.name !== interfaceName) {
				continue;
			}
			for (const identifier of variable.identifiers) {
				const declaration = loose(identifier).parent;
				if (declaration?.type !== 'TSInterfaceDeclaration') {
					continue;
				}
				for (const member of looseChildren(looseChild(declaration, 'body'), 'body')!) {
					if (methodName === nameOf(looseChild(member, 'key'))) {
						return member;
					}
				}
			}
		}
	}
	return undefined;
}

/**
 * `jsdoc/require-jsdoc`: the nodes that the `contexts` and `require` options select must have a JSDoc comment. A
 * function or method documented by the comment of an overload before it, and a method whose interface documents it,
 * don't need one. The other options are not supported; their defaults apply (as the schema defaults apply whenever
 * options are given, empty constructors are not exempt).
 */
export default new class RequireJsdoc implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'suggestion',
		docs: {
			description: 'Checks for presence of JSDoc comments, on functions and potentially other contexts.',
		},
		fixable: 'code',
		messages: {
			missingJsDoc: 'Missing JSDoc comment.',
		},
		schema: [{
			type: 'object',
			properties: {
				contexts: { type: 'array', items: { type: 'string' } },
				enableFixer: { type: 'boolean' },
				require: {
					type: 'object',
					properties: Object.fromEntries(Object.keys(requireDefaults).map(key => [key, { type: 'boolean' }])),
					additionalProperties: false,
				},
			},
			additionalProperties: false,
		}],
	};

	create(context: Context): Visitor {
		const options = (context.options[0] ?? {}) as Options;
		const contexts = options.contexts ?? [];
		const enableFixer = options.enableFixer ?? true;
		const sourceCode = context.sourceCode;
		const hasOption = (type: string) => (options.require && type in options.require ? options.require[type] : requireDefaults[type]) || contexts.includes(type);

		const isExemptedImplementer = (node: LooseNode): boolean => {
			const method = node.parent;
			const classNode = method?.parent?.parent;
			if (node.type !== 'FunctionExpression' || method?.type !== 'MethodDefinition' || method.parent?.type !== 'ClassBody' || classNode?.type !== 'ClassDeclaration' || !('implements' in classNode)) {
				return false;
			}
			const methodName = nameOf(looseChild(method, 'key'));
			for (const implemented of looseChildren(classNode, 'implements') ?? []) {
				const member = getMemberOfInterface(nameOf(looseChild(implemented, 'expression')), methodName, sourceCode.getScope(node as unknown as ESTree.Node));
				if (member && getJSDocComment(sourceCode, member)) {
					return true;
				}
			}
			return false;
		};

		const fix = (node: LooseNode) => (fixer: Fixer): Fix => {
			const reduced = getReducedNode(node, sourceCode);
			const base = getDecorator(reduced) ?? reduced;
			const lineToNode = sourceCode.text.slice(base.range[0] - base.loc.start.column, base.range[1]);
			const indent = (/^\n*([ \t]+)/.exec(lineToNode)?.[1] ?? '') + ' ';
			return fixer.insertTextBeforeRange(base.range, `/**\n${indent}*\n${indent}*/\n${indent.slice(0, -1)}`);
		};

		const check = (node: LooseNode): void => {
			if (getJSDocComment(sourceCode, node, true)) {
				return;
			}
			if (isExemptedImplementer(node)) {
				return;
			}
			context.report({
				messageId: 'missingJsDoc',
				loc: { start: node.loc.start, end: { line: node.loc.start.line + 1, column: 0 } },
				fix: enableFixer ? fix(node) : undefined,
			});
		};

		const isDocumentedFunctionExpression = (node: LooseNode) => {
			const parent = node.parent!;
			return assignmentParents.has(parent.type) || (propertyParents.has(parent.type) && parent.value === node);
		};

		// Each context checks the nodes it selects, except for the node types below, which have their own checks.
		const visitor: Visitor = {};
		for (const selector of new Set(contexts)) {
			const count = contexts.filter(other => other === selector).length;
			visitor[selector] = (node: ESTree.Node) => {
				for (let i = 0; i < count; i++) {
					check(loose(node));
				}
			};
		}
		return {
			...visitor,
			ArrowFunctionExpression(node) {
				if (hasOption('ArrowFunctionExpression') && isDocumentedFunctionExpression(loose(node))) {
					check(loose(node));
				}
			},
			ClassDeclaration(node) {
				if (hasOption('ClassDeclaration')) {
					check(loose(node));
				}
			},
			ClassExpression(node) {
				if (hasOption('ClassExpression')) {
					check(loose(node));
				}
			},
			FunctionDeclaration(node) {
				if (hasOption('FunctionDeclaration')) {
					check(loose(node));
				}
			},
			FunctionExpression(node) {
				if (hasOption('FunctionExpression') && isDocumentedFunctionExpression(loose(node))) {
					check(loose(node));
				}
			},
			MethodDefinition(node) {
				if (hasOption('MethodDefinition')) {
					check(loose(node.value));
				}
			},
		};
	}
};
