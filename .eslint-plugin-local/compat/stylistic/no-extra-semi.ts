/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, Node, Token, Visitor } from '@oxlint/plugins';

/** Statements whose body may be an empty statement, which then is not extra. */
const statementsWithBody = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement', 'IfStatement', 'LabeledStatement', 'WithStatement']);

/**
 * Reports empty statements and semicolons between class members. Implements `@stylistic/no-extra-semi`.
 */
export default new class NoExtraSemi implements CreateRule {

	readonly meta: CreateRule['meta'] = {
		type: 'layout',
		docs: { description: 'Disallow unnecessary semicolons' },
		fixable: 'code',
		schema: [],
		messages: {
			unexpected: 'Unnecessary semicolon.',
		},
	};

	create(context: Context): Visitor {
		const sourceCode = context.sourceCode;

		/**
		 * Removing a semicolon that precedes a string at the top of a program or function body could turn that string
		 * into a directive, such as `'use strict'`.
		 */
		const canRemove = (semicolon: Node | Token) => {
			const next = sourceCode.getTokenAfter(semicolon);
			if (!next || next.type !== 'String') {
				return true;
			}
			const statement = sourceCode.getNodeByRangeIndex(next.range[0])?.parent;
			if (statement?.type !== 'ExpressionStatement') {
				return true;
			}
			const container = statement.parent;
			const isFunctionBody = container.type === 'BlockStatement' && ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(container.parent.type);
			return container.type !== 'Program' && !isFunctionBody;
		};

		const report = (semicolon: Node | Token) => {
			context.report({
				node: semicolon,
				messageId: 'unexpected',
				fix: canRemove(semicolon) ? fixer => {
					// The fix spans the neighbouring tokens, so that other fixes cannot touch them in the same pass.
					const start = (sourceCode.getTokenBefore(semicolon) ?? semicolon).range[0];
					const end = (sourceCode.getTokenAfter(semicolon) ?? semicolon).range[1];
					const text = sourceCode.text;
					return fixer.replaceTextRange([start, end], text.slice(start, semicolon.range[0]) + text.slice(semicolon.range[1], end));
				} : undefined,
			});
		};

		/** Reports the semicolons in the run of punctuators that starts at `token`, up to the next class member. */
		const checkClassMemberGap = (token: Token | null) => {
			for (; token && token.type === 'Punctuator' && token.value !== '}'; token = sourceCode.getTokenAfter(token)) {
				if (token.value === ';') {
					report(token);
				}
			}
		};
		const checkAfter = (node: Node) => checkClassMemberGap(sourceCode.getTokenAfter(node));

		return {
			EmptyStatement: (node: ESTree.EmptyStatement) => {
				if (!statementsWithBody.has(node.parent.type)) {
					report(node);
				}
			},
			ClassBody: (node: ESTree.ClassBody) => checkClassMemberGap(sourceCode.getFirstToken(node, 1)),
			MethodDefinition: checkAfter,
			PropertyDefinition: checkAfter,
			AccessorProperty: checkAfter,
			StaticBlock: checkAfter,
			TSAbstractMethodDefinition: checkAfter,
			TSAbstractPropertyDefinition: checkAfter,
		};
	}
};
