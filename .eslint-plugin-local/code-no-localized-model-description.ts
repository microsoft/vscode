/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

const MESSAGE_ID = 'noLocalizedModelDescription';
type NodeWithChildren = ESTree.Node & {
	[key: string]: ESTree.Node | ESTree.Node[] | null | undefined;
};
type PropertyKeyNode = ESTree.PropertyKey | ESTree.MemberExpression['property'];
type AssignmentTarget = ESTree.AssignmentExpression['left'];
type VisitorKeys = Context['sourceCode']['visitorKeys'];

export default new class NoLocalizedModelDescriptionRule implements CreateRule {
	meta: RuleMeta = {
		messages: {
			[MESSAGE_ID]: 'modelDescription values describe behavior to the language model and must not use localized strings.'
		},
		type: 'problem',
		schema: false
	};

	create(context: Context): Visitor {
		const reportIfLocalized = (expression: ESTree.Expression | null | undefined) => {
			if (expression && containsLocalizedCall(expression, context.sourceCode.visitorKeys)) {
				context.report({ node: expression, messageId: MESSAGE_ID });
			}
		};

		return {
			Property: propertyNode => {
				if (!isModelDescriptionKey(propertyNode.key, propertyNode.computed)) {
					return;
				}
				reportIfLocalized(propertyNode.value as ESTree.Expression);
			},
			AssignmentExpression: assignment => {
				if (!isModelDescriptionAssignmentTarget(assignment.left)) {
					return;
				}
				reportIfLocalized(assignment.right);
			}
		};
	}
};

function isModelDescriptionKey(key: PropertyKeyNode, computed: boolean | undefined): boolean {
	if (!computed && key.type === 'Identifier') {
		return key.name === 'modelDescription';
	}
	if (key.type === 'Literal' && key.value === 'modelDescription') {
		return true;
	}
	return false;
}

function isModelDescriptionAssignmentTarget(target: AssignmentTarget): target is ESTree.MemberExpression {
	if (target.type === 'MemberExpression') {
		return isModelDescriptionKey(target.property, target.computed);
	}
	return false;
}

function containsLocalizedCall(expression: ESTree.Expression, visitorKeys: VisitorKeys): boolean {
	let found = false;

	const visit = (node: ESTree.Node) => {
		if (found) {
			return;
		}

		if (isLocalizeCall(node)) {
			found = true;
			return;
		}

		for (const key of getEcmaScriptKeys(visitorKeys, node.type)) {
			const value = (node as NodeWithChildren)[key];
			if (Array.isArray(value)) {
				for (const child of value) {
					if (child) {
						visit(child);
						if (found) {
							return;
						}
					}
				}
			} else if (value) {
				visit(value);
			}
		}
	};

	visit(expression);
	return found;
}

/**
 * This rule used to traverse with the keys of `eslint-visitor-keys`, which has no keys for TypeScript-only nodes and
 * properties. Skip those to traverse the same children, and so report the same problems.
 */
const typeScriptOnlyKeys = new Set(['decorators', 'typeAnnotation', 'typeParameters', 'returnType', 'typeArguments', 'superTypeArguments', 'implements']);
const typesUnknownToESLint = new Set(['AccessorProperty', 'Decorator', 'ParenthesizedExpression', 'V8IntrinsicExpression']);
const ecmaScriptKeysCache = new Map<string, readonly string[]>();

function getEcmaScriptKeys(visitorKeys: VisitorKeys, type: string): readonly string[] {
	let keys = ecmaScriptKeysCache.get(type);
	if (!keys) {
		keys = type.startsWith('TS') || typesUnknownToESLint.has(type) ? [] : (visitorKeys[type] ?? []).filter(key => !typeScriptOnlyKeys.has(key));
		ecmaScriptKeysCache.set(type, keys);
	}
	return keys;
}

function isLocalizeCall(node: ESTree.Node): boolean {
	if (node.type === 'CallExpression') {
		return isLocalizeCallee(node.callee);
	}
	if (node.type === 'ChainExpression') {
		return isLocalizeCall(node.expression);
	}
	return false;
}


function isLocalizeCallee(callee: ESTree.CallExpression['callee']): boolean {
	if (callee.type === 'Identifier') {
		return callee.name === 'localize';
	}
	if (callee.type === 'MemberExpression') {
		if (!callee.computed && callee.property.type === 'Identifier') {
			return callee.property.name === 'localize';
		}
		if (callee.property.type === 'Literal' && callee.property.value === 'localize') {
			return true;
		}
	}
	return false;
}
