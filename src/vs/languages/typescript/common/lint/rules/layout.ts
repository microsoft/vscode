/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import rules = require('vs/languages/typescript/common/lint/rules');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');

/**
 * Do not skip curly brackets.
 */
export class CurlyBracketsMustNotBeOmitted implements rules.IStyleRule<ts.Statement> {

	public code = 'SA1503';

	public name = 'CurlyBracketsMustNotBeOmitted';

	public filter = [
		ts.SyntaxKind.IfStatement,
		ts.SyntaxKind.ElseKeyword,
		ts.SyntaxKind.DoStatement,
		ts.SyntaxKind.ForInStatement,
		ts.SyntaxKind.ForStatement,
		ts.SyntaxKind.WhileStatement
	];

	public checkNode(node:ts.Statement, context:rules.IRuleContext): void {
		if (node.kind === ts.SyntaxKind.IfStatement) {
			var ifNode = <ts.IfStatement>node;
			if (ifNode.elseStatement && ifNode.elseStatement.kind=== ts.SyntaxKind.IfStatement) {
				return;
			}

			if (ifNode.thenStatement && ifNode.thenStatement.kind !== ts.SyntaxKind.Block) {
				context.reportError(ifNode.thenStatement, this.name, this.code);
			}
			if (ifNode.elseStatement && ifNode.elseStatement.kind !== ts.SyntaxKind.Block) {
				context.reportError(ifNode.elseStatement, this.name, this.code);
			}
		} else {
			var iterationNode = <ts.IterationStatement>node;
			if (iterationNode.statement && iterationNode.statement.kind !== ts.SyntaxKind.Block) {
				context.reportError(iterationNode.statement, this.name, this.code);
			}
		}
	}
}

/**
 * An empty block should have a comment.
 */
export class EmptyBlocksWithoutComment implements rules.IStyleRule<ts.Block> {

	public code = 'SA1514';

	public name = 'EmptyBlocksWithoutComment';

	public filter = [ts.SyntaxKind.Block];

	public checkNode(node:ts.Block, context:rules.IRuleContext):void {
		if(node.statements.pos < node.statements.end) {
			return;
		}
		if(ts.getTextOfNode(node).match(/\/\/|\/|\*/)) {
			return;
		}
//		if(this._hasComment(node)) {
//			return;
//		}

		context.reportError(node, this.name, this.code);
	}

	// private _hasComment(block: ts.Node): boolean {
	// 	var insideBlock = block.getChildAt(1);
	// 	if (insideBlock) {
	// 		var text = ts.getTextOfNode(insideBlock);
	// 		if (text && text.trim().length > 0) {
	// 			return true;
	// 		}
	// 	}

	// 	return false;
	// }
}

