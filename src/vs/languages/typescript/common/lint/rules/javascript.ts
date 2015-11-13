/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');
import collections = require('vs/base/common/collections');
import rules = require('vs/languages/typescript/common/lint/rules');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');

/**
 * Use !== and === insteaf of != and ==.
 */
export class ComparisonOperatorsNotStrict implements rules.IStyleRule<ts.BinaryExpression> {

	public code = 'SA9005';

	public name = 'ComparisonOperatorsNotStrict';

	public filter = [ts.SyntaxKind.BinaryExpression];

	public checkNode(node:ts.BinaryExpression, context:rules.IRuleContext): void {
		if (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken || node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken) {
			var operatorPos = node.right.pos - 2;
			context.reportError(node, this.name, this.code, operatorPos, 2);
		}
	}
}

/**
 * Checks for missing semicolons (which are those that the parser inserted).
 */
export class MissingSemicolon implements rules.IStyleRule<ts.Node> {

	public code = 'SA9050';

	public name = 'MissingSemicolon';

	public filter = [
		ts.SyntaxKind.VariableStatement,
		ts.SyntaxKind.ExpressionStatement,
		ts.SyntaxKind.ReturnStatement,
		ts.SyntaxKind.PropertyDeclaration,
		ts.SyntaxKind.PropertySignature
	];

	public checkNode(node:ts.Node, context:rules.IRuleContext): void {
		var semicolon = ts.findChildOfKind(node, ts.SyntaxKind.SemicolonToken);
		if (!semicolon) {
			var nodeEnd = ts.getTokenPosOfNode(node) + node.getWidth() - 1;
			context.reportError(node, this.name, this.code, nodeEnd, 1);
		}
	}
}

/**
 * Checks for proper usage of the typeof operator as defined here
 * http://ecma-international.org/ecma-262/5.1/#sec-11.4.3
 */
export class UnknownTypeOfResults implements rules.IStyleRule<ts.BinaryExpression> {

	private static _AllowedStrings:collections.IStringDictionary<boolean> = {
		'undefined': true,
		'object': true,
		'function': true,
		'boolean': true,
		'number': true,
		'string': true
	};

	public code = 'SA9053';
	public filter = [ ts.SyntaxKind.BinaryExpression ];

	public name = 'UnknownTypeOfResults';

	public checkNode(node:ts.BinaryExpression, context:rules.IRuleContext): void {
		if (!node.left || node.left.kind !== ts.SyntaxKind.TypeOfExpression) {
			return;
		}
		var problem = false;
		if(node.right.kind === ts.SyntaxKind.StringLiteral) {
			var textValue = ts.getTextOfNode(node.right);
			textValue = strings.trim(textValue, '\'');
			textValue = strings.trim(textValue, '"');
			problem = !collections.contains(UnknownTypeOfResults._AllowedStrings, textValue);

		} else if(node.right.kind === ts.SyntaxKind.NullKeyword) {
			problem = true;
		} else if(ts.getTextOfNode(node.right) === 'undefined') {
			problem = true;
		}

		if(problem) {
			context.reportError(node, this.name, this.code);
		}
	}
}

/**
 * The body of if, else, do, for, and for-in should not be a semi-colon only.
 */
export class SemicolonsInsteadOfBlocks implements rules.IStyleRule<ts.Node> {

	public code = 'SA9054';

	public name = 'SemicolonsInsteadOfBlocks';

	public filter = [ts.SyntaxKind.IfStatement, ts.SyntaxKind.ElseKeyword,
		ts.SyntaxKind.WhileStatement, ts.SyntaxKind.ForStatement,
		ts.SyntaxKind.ForInStatement];

	public checkNode(node:ts.Node, context:rules.IRuleContext):void {
		if (node.kind === ts.SyntaxKind.IfStatement) {
			var ifNode = <ts.IfStatement>node;
			if ((ifNode.thenStatement && ifNode.thenStatement.kind === ts.SyntaxKind.EmptyStatement) ||
			(ifNode.elseStatement && ifNode.elseStatement.kind === ts.SyntaxKind.EmptyStatement)) {
				context.reportError(ifNode, this.name, this.code);
			}
		}

		var iterationNode = <ts.IterationStatement>node;
		if (iterationNode && iterationNode.statement && iterationNode.statement.kind === ts.SyntaxKind.EmptyStatement) {
			context.reportError(iterationNode, this.name, this.code);
		}
	}
}

/**
 * Checks for functions inside loops.
 */
export class FunctionsInsideLoops implements rules.IStyleRule<ts.FunctionExpression> {

	public code = 'SA9055';

	public name = 'FunctionsInsideLoops';

	public filter = [ts.SyntaxKind.FunctionExpression,
		ts.SyntaxKind.FunctionDeclaration,
		ts.SyntaxKind.ArrowFunction];

	public checkNode(node:ts.FunctionExpression, context:rules.IRuleContext):void {
		var parent = node.parent;
		while(parent) {
			if (parent.kind === ts.SyntaxKind.ForStatement ||
				parent.kind === ts.SyntaxKind.ForInStatement ||
				parent.kind === ts.SyntaxKind.WhileStatement ||
				parent.kind === ts.SyntaxKind.DoStatement
				) {
				context.reportError(node, this.name, this.code);
				break;
			}
			parent = parent.parent;
		}
	}
}

/**
 * Checks for function with lower-case names that are used
 * as constructors.
 */
export class NewOnLowercaseFunctions implements rules.IStyleRule<ts.NewExpression>{

	public code = 'SA9062';

	public name = 'NewOnLowercaseFunctions';

	public filter = [ts.SyntaxKind.NewExpression];

	public checkNode(node: ts.NewExpression, context: rules.IRuleContext): void {

		var name: string;

		switch (node.expression.kind) {
			case ts.SyntaxKind.Identifier:
				name = (<ts.Identifier> node.expression).text;
				break;
			case ts.SyntaxKind.PropertyAccessExpression:
				name = (<ts.PropertyAccessExpression>node.expression).name.text;
				break;
		}

		if (name && !name.charAt(0).match(/[A-Z_]/)) {
			context.reportError(node.expression, this.name, this.code);
		}
	}
}