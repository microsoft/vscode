/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';
import { TSESTree } from '@typescript-eslint/utils';

export default new class NoRedundantHasBeforeDelete implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			noRedundantHasBeforeDelete: 'Do not check for existence before deleting. Map.delete/Set.delete returns a boolean indicating if the element was present.',
		},
		fixable: 'code',
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		return {
			IfStatement(node: any) {
				const ifStatement = node as TSESTree.IfStatement;
				const test = ifStatement.test;
				const consequent = ifStatement.consequent;
				const hasElse = ifStatement.alternate !== null && ifStatement.alternate !== undefined;

				// Check if the test is a .has() call
				if (test.type !== 'CallExpression' ||
					test.callee.type !== 'MemberExpression' ||
					test.callee.property.type !== 'Identifier' ||
					test.callee.property.name !== 'has' ||
					test.arguments.length !== 1) {
					return;
				}

				const hasCall = test;
				const hasCollection = hasCall.callee.object;
				const hasKey = hasCall.arguments[0];

				// Get the first statement from the consequent
				let deleteStatement: TSESTree.ExpressionStatement | undefined;
				if (consequent.type === 'BlockStatement') {
					if (consequent.body.length === 0) {
						return;
					}
					const firstStatement = consequent.body[0];
					if (firstStatement.type !== 'ExpressionStatement') {
						return;
					}
					deleteStatement = firstStatement;
				} else if (consequent.type === 'ExpressionStatement') {
					deleteStatement = consequent;
				} else {
					return;
				}

				// Check if the first statement is a .delete() call
				const expr = deleteStatement.expression;
				if (expr.type !== 'CallExpression' ||
					expr.callee.type !== 'MemberExpression' ||
					expr.callee.property.type !== 'Identifier' ||
					expr.callee.property.name !== 'delete' ||
					expr.arguments.length !== 1) {
					return;
				}

				const deleteCall = expr;
				const deleteCollection = deleteCall.callee.object;
				const deleteKey = deleteCall.arguments[0];

				// Compare collection and key using source text
				const sourceCode = context.sourceCode;
				const toNode = (n: TSESTree.Node) => n as unknown as ESTree.Node;
				if (sourceCode.getText(toNode(hasCollection)) !== sourceCode.getText(toNode(deleteCollection)) ||
					sourceCode.getText(toNode(hasKey)) !== sourceCode.getText(toNode(deleteKey))) {
					return;
				}

				context.report({
					node: ifStatement,
					messageId: 'noRedundantHasBeforeDelete',
					fix(fixer) {
						const deleteCallText = sourceCode.getText(toNode(deleteCall));
						const ifNode = toNode(ifStatement);
						const isOnlyDelete = consequent.type === 'ExpressionStatement' ||
							(consequent.type === 'BlockStatement' && consequent.body.length === 1);

						// Helper to get the range including trailing whitespace
						const getDeleteRangeWithWhitespace = () => {
							const deleteNode = toNode(deleteStatement!);
							const [start, end] = deleteNode.range!;
							const nextToken = sourceCode.getTokenAfter(deleteNode);
							if (nextToken && nextToken.range![0] > end) {
								const textBetween = sourceCode.text.substring(end, nextToken.range![0]);
								if (textBetween.trim() === '') {
									return [start, nextToken.range![0]] as [number, number];
								}
							}
							return [start, end] as [number, number];
						};

						// Case 1: Has else clause
						if (hasElse) {
							const elseText = sourceCode.getText(toNode(ifStatement.alternate!));

							if (isOnlyDelete) {
								// Only delete in consequent: negate and use else
								// if (m.has(key)) m.delete(key); else ... → if (!m.delete(key)) ...
								return fixer.replaceText(ifNode, `if (!${deleteCallText}) ${elseText}`);
							} else {
								// Multiple statements: replace test and remove delete statement
								// if (m.has(key)) { m.delete(key); other(); } else ... → if (m.delete(key)) { other(); } else ...
								return [
									fixer.replaceTextRange(hasCall.range!, deleteCallText),
									fixer.removeRange(getDeleteRangeWithWhitespace())
								];
							}
						}

						// Case 2: No else clause
						if (isOnlyDelete) {
							// Replace entire if with just the delete call
							// if (m.has(key)) m.delete(key); → m.delete(key);
							return fixer.replaceText(ifNode, deleteCallText + ';');
						} else {
							// Multiple statements: replace test and remove delete statement
							// if (m.has(key)) { m.delete(key); other(); } → if (m.delete(key)) { other(); }
							return [
								fixer.replaceTextRange(hasCall.range!, deleteCallText),
								fixer.removeRange(getDeleteRangeWithWhitespace())
							];
						}
					}
				});
			}
		};
	}
};
