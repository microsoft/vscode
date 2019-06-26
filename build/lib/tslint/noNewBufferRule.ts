/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as Lint from 'tslint';

export class Rule extends Lint.Rules.AbstractRule {
	apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
		return this.applyWithWalker(new NewBufferRuleWalker(sourceFile, this.getOptions()));
	}
}

class NewBufferRuleWalker extends Lint.RuleWalker {
	visitNewExpression(node: ts.NewExpression) {
		if (node.expression.kind === ts.SyntaxKind.Identifier && node.expression && (node.expression as ts.Identifier).text === 'Buffer') {
			this.addFailureAtNode(node, '`new Buffer` is deprecated. Consider Buffer.From or Buffer.alloc instead.');
		}

		super.visitNewExpression(node);
	}
}