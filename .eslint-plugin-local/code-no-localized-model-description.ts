/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TSESTree } from '@typescript-eslint/utils';
import * as eslint from 'eslint';
import * as visitorKeys from 'eslint-visitor-keys';
import type * as ESTree from 'estree';

const MESSAGE_ID = 'noLocalizedModelDescription';
type NodeWithChildren = TSESTree.Node & {
	[key: string]: TSESTree.Node | TSESTree.Node[] | null | undefined;
};
type PropertyKeyNode = TSESTree.Property['key'] | TSESTree.MemberExpression['property'];
type AssignmentTarget = TSESTree.AssignmentExpression['left'];

export default new class NoLocalizedModelDescriptionRule implements eslint.Rule.RuleModule {
	meta: eslint.Rule.RuleMetaData = {
		messages: {
			[MESSAGE_ID]: 'modelDescription values describe behavior to the language model and must not use localized strings.'
		},
		type: 'problem',
		schema: false
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const reportIfLocalized = (expression: TSESTree.Expression | null | undefined) => {
			if (expression && containsLocalizedCall(expression)) {
				context.report({ node: expression, messageId: MESSAGE_ID });
			}
		};

		return {
			Property: (node: ESTree.Property) => {
				const propertyNode = node as TSESTree.Property;
				if (!isModelDescriptionKey(propertyNode.key, propertyNode.computed)) {
					return;
				}
				reportIfLocalized(propertyNode.value as TSESTree.Expression);
			},
			AssignmentExpression: (node: ESTree.AssignmentExpression) => {
				const assignment = node as TSESTree.AssignmentExpression;
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

function isModelDescriptionAssignmentTarget(target: AssignmentTarget): target is TSESTree.MemberExpression {
	if (target.type === 'MemberExpression') {
		return isModelDescriptionKey(target.property, target.computed);
	}
	return false;
}

function containsLocalizedCall(expression: TSESTree.Expression): boolean {
	let found = false;

	const visit = (node: TSESTree.Node) => {
		if (found) {
			return;
		}

		if (isLocalizeCall(node)) {
			found = true;
			return;
		}

		for (const key of visitorKeys.KEYS[node.type] ?? []) {
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

function isLocalizeCall(node: TSESTree.Node): boolean {
	if (node.type === 'CallExpression') {
		return isLocalizeCallee(node.callee);
	}
	if (node.type === 'ChainExpression') {
		return isLocalizeCall(node.expression);
	}
	return false;
}


function isLocalizeCallee(callee: TSESTree.CallExpression['callee']): boolean {
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
