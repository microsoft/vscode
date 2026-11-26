/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, Node, Token, Visitor } from '@oxlint/plugins';

type Mode = 'never' | 'only-multiline';

/** A list of items, which may end with a trailing comma, in `node`. */
interface List {
	readonly node: ESTree.Node;
	readonly lastItem: Node | null | undefined;
}

/** Nodes whose list ends right before their last token, the closing bracket. */
const bracketedLists = new Set(['ObjectExpression', 'ArrayExpression', 'CallExpression', 'NewExpression', 'ImportExpression']);

/**
 * Disallows trailing commas, either everywhere (`never`) or where the closing bracket is on the same line as the last
 * item (`only-multiline`). Implements these string options of `@stylistic/comma-dangle`.
 */
export default new class CommaDangle implements CreateRule {

	readonly meta: CreateRule['meta'] = {
		type: 'layout',
		docs: { description: 'Disallow trailing commas' },
		fixable: 'code',
		schema: [{ type: 'string', enum: ['never', 'only-multiline'] }],
		messages: {
			unexpected: 'Unexpected trailing comma.',
		},
	};

	create(context: Context): Visitor {
		const sourceCode = context.sourceCode;
		const mode: Mode = context.options[0] === 'only-multiline' ? 'only-multiline' : 'never';
		const isTsx = context.languageOptions.parserOptions.ecmaFeatures.jsx && context.filename.endsWith('.tsx');

		const isComma = (token: Token | null): token is Token => token?.type === 'Punctuator' && token.value === ',';

		/** The trailing comma of the list if there is one, otherwise the last token of its last item. */
		const trailingToken = ({ node, lastItem }: List): Token | null => {
			if (bracketedLists.has(node.type)) {
				return sourceCode.getLastToken(node, 1);
			}
			if (!lastItem) {
				return null;
			}
			const next = sourceCode.getTokenAfter(lastItem);
			return isComma(next) ? next : sourceCode.getLastToken(lastItem);
		};

		const isMultiline = (list: List) => {
			const trailing = list.lastItem && trailingToken(list);
			const closing = trailing && sourceCode.getTokenAfter(trailing);
			return !!closing && closing.loc.end.line !== trailing.loc.end.line;
		};

		const forbid = (list: List) => {
			if (!list.lastItem || (isTsx && list.node.type === 'TSTypeParameterDeclaration' && list.node.params.length === 1)) {
				return;
			}
			const comma = trailingToken(list);
			if (!isComma(comma)) {
				return;
			}
			context.report({
				node: list.lastItem,
				loc: comma.loc,
				messageId: 'unexpected',
				fix: fixer => {
					// The fix spans the neighbouring tokens, so that other fixes cannot touch them in the same pass.
					const start = (sourceCode.getTokenBefore(comma) ?? comma).range[0];
					const end = (sourceCode.getTokenAfter(comma) ?? comma).range[1];
					const text = sourceCode.text;
					return fixer.replaceTextRange([start, end], text.slice(start, comma.range[0]) + text.slice(comma.range[1], end));
				},
			});
		};

		const check = (list: List) => {
			if (mode === 'never' || !isMultiline(list)) {
				forbid(list);
			}
		};
		const last = <T>(items: readonly T[]): T | null => items.length ? items[items.length - 1] : null;
		const checkLast = (node: ESTree.Node, items: readonly (Node | null)[]) => check({ node, lastItem: last(items) });

		return {
			ObjectExpression: (node: ESTree.ObjectExpression) => checkLast(node, node.properties),
			ObjectPattern: (node: ESTree.ObjectPattern) => checkLast(node, node.properties),
			ArrayExpression: (node: ESTree.ArrayExpression) => checkLast(node, node.elements),
			ArrayPattern: (node: ESTree.ArrayPattern) => checkLast(node, node.elements),
			ImportDeclaration: (node: ESTree.ImportDeclaration) => {
				const lastSpecifier = last(node.specifiers);
				if (lastSpecifier?.type === 'ImportSpecifier') {
					check({ node, lastItem: lastSpecifier });
				}
				checkLast(node, node.attributes);
			},
			ExportNamedDeclaration: (node: ESTree.ExportNamedDeclaration) => {
				checkLast(node, node.specifiers);
				checkLast(node, node.attributes);
			},
			ExportAllDeclaration: (node: ESTree.ExportAllDeclaration) => checkLast(node, node.attributes),
			FunctionDeclaration: (node: ESTree.Function) => checkLast(node, node.params),
			FunctionExpression: (node: ESTree.Function) => checkLast(node, node.params),
			TSDeclareFunction: (node: ESTree.Function) => checkLast(node, node.params),
			ArrowFunctionExpression: (node: ESTree.ArrowFunctionExpression) => checkLast(node, node.params),
			TSFunctionType: (node: ESTree.TSFunctionType) => checkLast(node, node.params),
			CallExpression: (node: ESTree.CallExpression) => checkLast(node, node.arguments),
			NewExpression: (node: ESTree.NewExpression) => checkLast(node, node.arguments),
			ImportExpression: (node: ESTree.ImportExpression) => check({ node, lastItem: node.options ?? node.source }),
			TSEnumDeclaration: (node: ESTree.TSEnumDeclaration) => checkLast(node, node.body.members),
			TSTypeParameterDeclaration: (node: ESTree.TSTypeParameterDeclaration) => checkLast(node, node.params),
			TSTupleType: (node: ESTree.TSTupleType) => checkLast(node, node.elementTypes),
			// Type arguments never allow a trailing comma.
			TSTypeParameterInstantiation: (node: ESTree.TSTypeParameterInstantiation) => forbid({ node, lastItem: last(node.params) }),
		};
	}
};
