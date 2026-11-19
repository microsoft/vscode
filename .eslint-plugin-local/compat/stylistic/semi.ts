/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, LineColumn, Visitor } from '@oxlint/plugins';

/**
 * Requires a semicolon at the end of every statement, declaration and class field that can end with one. Implements
 * the `always` mode of `@stylistic/semi`, without the options that allow omitting semicolons in one-line blocks.
 */
export default new class Semi implements CreateRule {

	readonly meta: CreateRule['meta'] = {
		type: 'layout',
		docs: { description: 'Require semicolons instead of ASI' },
		fixable: 'code',
		schema: [{ type: 'string', enum: ['always'] }],
		messages: {
			missingSemi: 'Missing semicolon.',
		},
	};

	create(context: Context): Visitor {
		const sourceCode = context.sourceCode;

		/** The position after `position`: the next column, or the start of the next line, or `null` at the end of the file. */
		const positionAfter = ({ line, column }: LineColumn): LineColumn | null => {
			if (column < sourceCode.lines[line - 1].length) {
				return { line, column: column + 1 };
			}
			return line < sourceCode.lines.length ? { line: line + 1, column: 0 } : null;
		};

		const check = (node: ESTree.Node) => {
			const lastToken = sourceCode.getLastToken(node);
			if (!lastToken || (lastToken.type === 'Punctuator' && lastToken.value === ';')) {
				return;
			}
			const start = { line: lastToken.loc.end.line, column: lastToken.loc.end.column };
			context.report({
				node,
				loc: { start, end: positionAfter(start) },
				messageId: 'missingSemi',
				fix: fixer => fixer.insertTextAfter(lastToken, ';'),
			});
		};

		return {
			VariableDeclaration: (node: ESTree.VariableDeclaration) => {
				const parent = node.parent;
				const isLoopHead = parent.type === 'ForStatement' ? parent.init === node
					: (parent.type === 'ForInStatement' || parent.type === 'ForOfStatement') && parent.left === node;
				if (!isLoopHead) {
					check(node);
				}
			},
			ExportNamedDeclaration: (node: ESTree.ExportNamedDeclaration) => {
				if (!node.declaration) {
					check(node);
				}
			},
			ExportDefaultDeclaration: (node: ESTree.ExportDefaultDeclaration) => {
				const type = node.declaration.type;
				if (type !== 'ClassDeclaration' && type !== 'FunctionDeclaration' && type !== 'TSInterfaceDeclaration') {
					check(node);
				}
			},
			ExpressionStatement: check,
			ReturnStatement: check,
			ThrowStatement: check,
			DoWhileStatement: check,
			DebuggerStatement: check,
			BreakStatement: check,
			ContinueStatement: check,
			ImportDeclaration: check,
			ExportAllDeclaration: check,
			PropertyDefinition: check,
			AccessorProperty: check,
			TSAbstractPropertyDefinition: check,
			TSDeclareFunction: check,
			TSEmptyBodyFunctionExpression: check,
			TSExportAssignment: check,
			TSImportEqualsDeclaration: check,
			TSTypeAliasDeclaration: check,
		};
	}
};
